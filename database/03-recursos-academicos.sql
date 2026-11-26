USE fluxo_pessoal;

-- Os metadados de importação dependem do lote. A quantidade de parcelas
-- é determinada pelo grupo e não pelo lançamento individual.
CREATE TABLE import_batches (
  owner_id VARCHAR(64) NOT NULL,
  id VARCHAR(64) NOT NULL,
  name VARCHAR(255),
  month CHAR(7),
  imported_at DATETIME,
  PRIMARY KEY (owner_id, id),
  CONSTRAINT fk_import_batches_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE installment_groups (
  owner_id VARCHAR(64) NOT NULL,
  id VARCHAR(64) NOT NULL,
  installments INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (owner_id, id),
  CONSTRAINT chk_installment_groups_count CHECK (installments >= 2),
  CONSTRAINT fk_installment_groups_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Preserva metadados legados sem ID e usa o registro mais completo de cada lote.
UPDATE transactions
SET import_batch_id = SHA2(CONCAT('legacy-import:', owner_id, ':', id), 256)
WHERE import_batch_id IS NULL
  AND (import_batch_name IS NOT NULL OR import_batch_month IS NOT NULL OR imported_at IS NOT NULL);

INSERT INTO import_batches (owner_id, id, name, month, imported_at)
SELECT owner_id, import_batch_id, import_batch_name, import_batch_month, imported_at
FROM (
  SELECT owner_id, import_batch_id, import_batch_name, import_batch_month, imported_at,
    ROW_NUMBER() OVER (
      PARTITION BY owner_id, import_batch_id
      ORDER BY ((import_batch_name IS NOT NULL) + (import_batch_month IS NOT NULL) + (imported_at IS NOT NULL)) DESC,
               imported_at DESC, created_at DESC, id
    ) AS ordering
  FROM transactions
  WHERE import_batch_id IS NOT NULL
) AS ranked
WHERE ordering = 1;

-- Mantém a quantidade legada até para lançamentos que só tinham a contagem.
UPDATE transactions
SET installment_group_id = SHA2(CONCAT('legacy-installment:', owner_id, ':', id), 256)
WHERE installment_group_id IS NULL AND installments > 1;

INSERT INTO installment_groups (owner_id, id, installments)
SELECT owner_id, installment_group_id, GREATEST(COALESCE(MAX(installments), 0), COUNT(*), 2)
FROM transactions
WHERE installment_group_id IS NOT NULL
GROUP BY owner_id, installment_group_id;

INSERT INTO installment_groups (owner_id, id, installments)
SELECT DISTINCT labels.owner_id, labels.group_id, 2
FROM installment_labels AS labels
LEFT JOIN installment_groups AS known_group
  ON known_group.owner_id = labels.owner_id AND known_group.id = labels.group_id
WHERE known_group.id IS NULL;

-- O MER aceitava texto livre em categoria. Relaciona nomes antigos à categoria
-- do mesmo dono e tipo, criando cadastro quando o texto ainda não existe.
UPDATE transactions SET category = NULL WHERE category = '';

INSERT INTO categories (id, owner_id, name, kind)
SELECT SHA2(CONCAT('legacy-category:', owner_id, ':', kind, ':', name), 256), owner_id, name, kind
FROM (
  SELECT t.owner_id, MIN(t.category) AS name, IF(t.type = 'income', 'income', 'expense') AS kind
  FROM transactions AS t
  LEFT JOIN categories AS by_id
    ON by_id.owner_id = t.owner_id AND by_id.id = t.category
  LEFT JOIN categories AS by_name
    ON by_name.owner_id = t.owner_id AND by_name.name = t.category
    AND by_name.kind = IF(t.type = 'income', 'income', 'expense')
  WHERE t.category IS NOT NULL AND by_id.id IS NULL AND by_name.id IS NULL
  GROUP BY t.owner_id, t.category, IF(t.type = 'income', 'income', 'expense')
) AS legacy;

UPDATE transactions AS t
LEFT JOIN categories AS by_id ON by_id.owner_id = t.owner_id AND by_id.id = t.category
JOIN (
  SELECT owner_id, name, kind, MIN(id) AS id
  FROM categories
  GROUP BY owner_id, name, kind
) AS by_name
  ON by_name.owner_id = t.owner_id AND by_name.name = t.category
  AND by_name.kind = IF(t.type = 'income', 'income', 'expense')
SET t.category = by_name.id
WHERE by_id.id IS NULL;

-- As chaves compostas impedem vincular um lançamento ao cadastro de outro dono.
ALTER TABLE accounts ADD UNIQUE KEY uq_accounts_owner_record (owner_id, id);
ALTER TABLE categories ADD UNIQUE KEY uq_categories_owner_record (owner_id, id);

ALTER TABLE transactions
  MODIFY category VARCHAR(64) NULL,
  DROP COLUMN import_batch_name,
  DROP COLUMN import_batch_month,
  DROP COLUMN imported_at,
  DROP COLUMN installments,
  ADD CONSTRAINT chk_transactions_positive_amount CHECK (amount_cents > 0),
  ADD CONSTRAINT fk_transactions_account FOREIGN KEY (owner_id, account) REFERENCES accounts(owner_id, id),
  ADD CONSTRAINT fk_transactions_destination FOREIGN KEY (owner_id, destination_account) REFERENCES accounts(owner_id, id),
  ADD CONSTRAINT fk_transactions_category FOREIGN KEY (owner_id, category) REFERENCES categories(owner_id, id),
  ADD CONSTRAINT fk_transactions_import_batch FOREIGN KEY (owner_id, import_batch_id) REFERENCES import_batches(owner_id, id),
  ADD CONSTRAINT fk_transactions_installment_group FOREIGN KEY (owner_id, installment_group_id) REFERENCES installment_groups(owner_id, id),
  ADD INDEX idx_transactions_owner_data (owner_id, deleted_at, occurred_at DESC, created_at DESC, id DESC);

ALTER TABLE installment_labels
  ADD CONSTRAINT fk_installment_labels_group
  FOREIGN KEY (owner_id, group_id) REFERENCES installment_groups(owner_id, id);

ALTER TABLE user_profiles
  ADD CONSTRAINT fk_user_profiles_user FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;

CREATE TABLE transaction_audit (
  id BIGINT NOT NULL AUTO_INCREMENT,
  transaction_id VARCHAR(64) NOT NULL,
  action VARCHAR(10) NOT NULL,
  previous_amount_cents BIGINT,
  amount_cents BIGINT NOT NULL,
  previous_deleted_at DATETIME,
  deleted_at DATETIME,
  audited_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_transaction_audit_transaction
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DELIMITER $$

CREATE FUNCTION fn_valor_movimento(p_type VARCHAR(255), p_amount_cents BIGINT)
RETURNS BIGINT
DETERMINISTIC
NO SQL
RETURN CASE p_type
  WHEN 'income' THEN p_amount_cents
  WHEN 'refund' THEN p_amount_cents
  WHEN 'expense' THEN -p_amount_cents
  WHEN 'transfer' THEN -p_amount_cents
  WHEN 'invoice_payment' THEN -p_amount_cents
  ELSE 0
END$$

CREATE TRIGGER tr_lancamentos_audit_insert
AFTER INSERT ON transactions
FOR EACH ROW
INSERT INTO transaction_audit (transaction_id, action, amount_cents, deleted_at)
VALUES (NEW.id, 'insert', NEW.amount_cents, NEW.deleted_at)$$

CREATE TRIGGER tr_lancamentos_audit_update
AFTER UPDATE ON transactions
FOR EACH ROW
INSERT INTO transaction_audit (
  transaction_id, action, previous_amount_cents, amount_cents, previous_deleted_at, deleted_at
)
VALUES (NEW.id, 'update', OLD.amount_cents, NEW.amount_cents, OLD.deleted_at, NEW.deleted_at)$$

-- No caso de exclusão direta do usuário, resolve as chaves RESTRICT antes
-- que as FKs originais tentem excluir contas, categorias e grupos em cascata.
CREATE TRIGGER tr_usuarios_liberar_referencias
BEFORE DELETE ON users
FOR EACH ROW
BEGIN
  DELETE FROM transactions WHERE owner_id = OLD.id;
  DELETE FROM installment_labels WHERE owner_id = OLD.id;
END$$

-- O app chama esta operação em autocommit. A transferência e a auditoria
-- são persistidas juntas, ou ambas são revertidas pelo handler.
CREATE PROCEDURE sp_registrar_transferencia(
  IN p_owner_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  IN p_id VARCHAR(64),
  IN p_description VARCHAR(255),
  IN p_account VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  IN p_destination_account VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  IN p_occurred_at DATETIME,
  IN p_amount_cents BIGINT,
  IN p_status VARCHAR(255),
  IN p_payment_method VARCHAR(255),
  IN p_trip_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
)
MODIFIES SQL DATA
BEGIN
  DECLARE v_owner VARCHAR(64);
  DECLARE v_source_currency CHAR(3);
  DECLARE v_destination_currency CHAR(3);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT id INTO v_owner FROM users WHERE id = p_owner_id FOR UPDATE;
  IF v_owner IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Usuário não encontrado.';
  END IF;

  IF p_account IS NULL OR p_destination_account IS NULL OR p_account = p_destination_account THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Escolha duas contas diferentes para a transferência.';
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents <= 0
     OR p_occurred_at IS NULL OR p_description IS NULL OR TRIM(p_description) = ''
     OR p_status IS NULL OR p_status NOT IN ('confirmed', 'planned', 'review') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Preencha a descrição, a data, o valor e a situação da transferência.';
  END IF;

  SELECT COALESCE(currency_code, 'BRL') INTO v_source_currency
  FROM accounts WHERE owner_id = p_owner_id AND id = p_account;
  SELECT COALESCE(currency_code, 'BRL') INTO v_destination_currency
  FROM accounts WHERE owner_id = p_owner_id AND id = p_destination_account;

  IF v_source_currency IS NULL OR v_destination_currency IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Uma das contas da transferência não está disponível.';
  END IF;

  IF v_source_currency <> v_destination_currency THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'As contas da transferência precisam usar a mesma moeda.';
  END IF;

  IF p_trip_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM trips WHERE id = p_trip_id AND owner_id = p_owner_id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A viagem selecionada não está disponível.';
  END IF;

  INSERT INTO transactions (
    id, owner_id, description, account, destination_account, occurred_at,
    amount_cents, type, status, source, payment_method, trip_id
  ) VALUES (
    p_id, p_owner_id, p_description, p_account, p_destination_account, p_occurred_at,
    p_amount_cents, 'transfer', p_status, 'manual', COALESCE(p_payment_method, 'account'), p_trip_id
  );

  COMMIT;
END$$

DELIMITER ;

CREATE SQL SECURITY INVOKER VIEW vw_lancamentos AS
SELECT t.*,
       COALESCE(ig.installments, 1) AS installments,
       fn_valor_movimento(t.type, t.amount_cents) AS valor_origem_centavos
FROM transactions AS t
LEFT JOIN installment_groups AS ig ON ig.owner_id = t.owner_id AND ig.id = t.installment_group_id;
