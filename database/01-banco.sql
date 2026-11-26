-- Fluxo Pessoal | Estrutura do banco para MySQL 8.4
-- Execute uma vez em um banco vazio. Os dados de apresentação são opcionais.

CREATE DATABASE IF NOT EXISTS fluxo_pessoal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE fluxo_pessoal;

-- 1. Tabelas

-- Usuários, perfis e acesso

CREATE TABLE users (
  id VARCHAR(64) NOT NULL,
  email VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  password_salt VARCHAR(255) NOT NULL,
  password_iterations INT DEFAULT 210000,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE user_profiles (
  owner_id VARCHAR(64) NOT NULL,
  avatar_data LONGTEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (owner_id),
  CONSTRAINT fk_user_profiles_user FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE web_sessions (
  id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME,
  last_seen_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_web_sessions_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE auth_rate_limits (
  key_hash VARCHAR(64) NOT NULL,
  scope VARCHAR(255) NOT NULL,
  failures INT DEFAULT 0,
  window_started_at DATETIME NOT NULL,
  blocked_until DATETIME,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (key_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cadastros financeiros

CREATE TABLE accounts (
  id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  institution VARCHAR(255),
  currency_code CHAR(3) DEFAULT 'BRL',
  kind VARCHAR(255) NOT NULL,
  balance_cents BIGINT,
  goal_cents BIGINT,
  monthly_yield_basis_points INT,
  fixed BOOLEAN DEFAULT FALSE,
  exclude_from_totals BOOLEAN DEFAULT FALSE,
  color VARCHAR(16),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_accounts_owner_record (owner_id, id),
  CONSTRAINT fk_accounts_owner_id FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE categories (
  id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  kind VARCHAR(255) NOT NULL,
  color VARCHAR(16),
  icon VARCHAR(255),
  essential BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_owner_record (owner_id, id),
  CONSTRAINT fk_categories_owner_id FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE cards (
  id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  linked_account VARCHAR(64),
  kind VARCHAR(255) NOT NULL,
  brand VARCHAR(255),
  tier VARCHAR(255),
  last4 VARCHAR(4),
  limit_cents BIGINT,
  closing_day INT,
  due_day INT,
  due_adjustment VARCHAR(255),
  points_per_dollar_milli BIGINT,
  cashback_basis_points INT,
  reward_mode VARCHAR(255),
  points_goal INT,
  manual_usd_rate_micros BIGINT,
  color VARCHAR(16),
  image_data LONGTEXT,
  is_favorite BOOLEAN DEFAULT FALSE,
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_cards_owner_id FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE trips (
  id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  currency CHAR(3) DEFAULT 'BRL',
  exchange_rate_micros BIGINT DEFAULT 1000000,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_trips_owner_id FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Lançamentos, parcelas e recorrências

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

CREATE TABLE transactions (
  id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(64) NOT NULL,
  description VARCHAR(255) NOT NULL,
  category VARCHAR(64),
  account VARCHAR(64),
  destination_account VARCHAR(64),
  occurred_at DATETIME NOT NULL,
  amount_cents BIGINT NOT NULL,
  type VARCHAR(255) NOT NULL,
  installment_group_id VARCHAR(64),
  import_batch_id VARCHAR(64),
  status VARCHAR(255),
  source VARCHAR(255),
  payment_method VARCHAR(255),
  card_id VARCHAR(64),
  trip_id VARCHAR(64),
  invoice_month CHAR(7),
  reward_points_milli BIGINT,
  reward_cashback_cents BIGINT,
  reward_usd_rate_micros BIGINT,
  fingerprint VARCHAR(128),
  version INT DEFAULT 1,
  deleted_at DATETIME,
  device_id VARCHAR(128),
  last_mutation_id VARCHAR(64),
  auto_imported BOOLEAN DEFAULT FALSE,
  review_status VARCHAR(255),
  source_app VARCHAR(255),
  raw_text TEXT,
  confidence INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_transactions_owner_id FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_transactions_card_id FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE SET NULL,
  CONSTRAINT fk_transactions_trip_id FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL,
  CONSTRAINT fk_transactions_account FOREIGN KEY (owner_id, account) REFERENCES accounts(owner_id, id),
  CONSTRAINT fk_transactions_destination FOREIGN KEY (owner_id, destination_account) REFERENCES accounts(owner_id, id),
  CONSTRAINT fk_transactions_category FOREIGN KEY (owner_id, category) REFERENCES categories(owner_id, id),
  CONSTRAINT fk_transactions_import_batch FOREIGN KEY (owner_id, import_batch_id) REFERENCES import_batches(owner_id, id),
  CONSTRAINT fk_transactions_installment_group FOREIGN KEY (owner_id, installment_group_id) REFERENCES installment_groups(owner_id, id),
  CONSTRAINT chk_transactions_positive_amount CHECK (amount_cents > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE installment_labels (
  id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(64) NOT NULL,
  group_id VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_installment_labels_owner_id FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_installment_labels_group FOREIGN KEY (owner_id, group_id) REFERENCES installment_groups(owner_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE recurring_entries (
  id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(64) NOT NULL,
  description VARCHAR(255) NOT NULL,
  category VARCHAR(255),
  account VARCHAR(64),
  amount_cents BIGINT NOT NULL,
  type VARCHAR(255) NOT NULL,
  day_of_month INT NOT NULL,
  calculation_mode VARCHAR(255),
  schedule_mode VARCHAR(255),
  date_adjustment VARCHAR(255),
  payment_method VARCHAR(255),
  card_id VARCHAR(64),
  active BOOLEAN DEFAULT TRUE,
  last_confirmed_month CHAR(7),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_recurring_entries_owner_id FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_recurring_entries_card_id FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE reward_redemptions (
  id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(64) NOT NULL,
  card_id VARCHAR(64),
  kind VARCHAR(255) NOT NULL,
  amount_milli BIGINT NOT NULL,
  account VARCHAR(64),
  redeemed_at DATETIME NOT NULL,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_reward_redemptions_owner_id FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_reward_redemptions_card_id FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Regras e revisão de capturas

CREATE TABLE establishment_rules (
  id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(64) NOT NULL,
  match_text VARCHAR(255) NOT NULL,
  category VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_establishment_rules_owner_id FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE notification_app_rules (
  id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(64) NOT NULL,
  source_app VARCHAR(255) NOT NULL,
  action VARCHAR(255) NOT NULL,
  account_id VARCHAR(64),
  card_id VARCHAR(64),
  default_category VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_notification_app_rules_owner_id FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_app_rules_account_id FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
  CONSTRAINT fk_notification_app_rules_card_id FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE pending_auto_transactions (
  id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(64) NOT NULL,
  source_app VARCHAR(255) NOT NULL,
  raw_text TEXT NOT NULL,
  confidence INT,
  description VARCHAR(255),
  amount_cents BIGINT,
  type VARCHAR(255),
  occurred_at DATETIME,
  suggested_category VARCHAR(255),
  suggested_account VARCHAR(64),
  card_id VARCHAR(64),
  review_status VARCHAR(255),
  ignore_reason VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_pending_auto_transactions_owner_id FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pending_auto_transactions_card_id FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Notificações e dispositivos

CREATE TABLE developer_feedback (
  id VARCHAR(64) NOT NULL,
  sender_owner_id VARCHAR(64) NOT NULL,
  sender_name VARCHAR(255),
  message TEXT NOT NULL,
  status VARCHAR(255),
  developer_comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_developer_feedback_sender_owner_id FOREIGN KEY (sender_owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE app_notifications (
  id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(64) NOT NULL,
  kind VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  feedback_id VARCHAR(64),
  read_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_app_notifications_owner_id FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_app_notifications_feedback_id FOREIGN KEY (feedback_id) REFERENCES developer_feedback(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE mobile_devices (
  id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(64) NOT NULL,
  device_id VARCHAR(128) NOT NULL,
  name VARCHAR(255),
  platform VARCHAR(255),
  app_version INT,
  token_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME,
  last_seen_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mobile_devices_owner_device (owner_id, device_id),
  CONSTRAINT fk_mobile_devices_owner_id FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE push_subscriptions (
  id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(64) NOT NULL,
  device_id VARCHAR(128) NOT NULL,
  expo_push_token VARCHAR(255) NOT NULL,
  platform VARCHAR(255),
  active BOOLEAN DEFAULT TRUE,
  last_registered_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_push_subscriptions_owner_id FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE sync_mutations (
  id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(64) NOT NULL,
  mutation_id VARCHAR(128) NOT NULL,
  device_id VARCHAR(128) NOT NULL,
  entity_type VARCHAR(255) NOT NULL,
  entity_id VARCHAR(64) NOT NULL,
  operation VARCHAR(255) NOT NULL,
  status VARCHAR(255) NOT NULL,
  response_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sync_mutations_owner_mutation (owner_id, mutation_id),
  CONSTRAINT fk_sync_mutations_owner_id FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE ai_usage_daily (
  id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(64) NOT NULL,
  feature VARCHAR(255) NOT NULL,
  usage_day DATE NOT NULL,
  request_count INT DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ai_usage_owner_feature_day (owner_id, feature, usage_day),
  CONSTRAINT fk_ai_usage_daily_owner_id FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Histórico de alterações nos lançamentos

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
  CONSTRAINT fk_transaction_audit_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Índice para consultar o extrato por usuário, do mais recente ao mais antigo.
ALTER TABLE transactions
  ADD INDEX idx_transactions_owner_data (owner_id, deleted_at, occurred_at DESC, created_at DESC, id DESC);

-- 3. Função e procedure

DELIMITER $$

-- Função que devolve o valor com o sinal da movimentação na conta de origem.
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

-- Procedure que registra uma transferência e sua auditoria na mesma transação.
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

-- 4. Gatilhos

-- Registram inclusões e alterações no histórico de lançamentos.
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

-- Apaga lançamentos e rótulos antes que o MySQL remova as contas,
-- categorias e grupos do usuário em cascata.
CREATE TRIGGER tr_usuarios_liberar_referencias
BEFORE DELETE ON users
FOR EACH ROW
BEGIN
  DELETE FROM transactions WHERE owner_id = OLD.id;
  DELETE FROM installment_labels WHERE owner_id = OLD.id;
END$$

DELIMITER ;

-- 5. Visão de lançamentos com o total de parcelas e o valor com sinal.
CREATE SQL SECURITY INVOKER VIEW vw_lancamentos AS
SELECT t.*,
       COALESCE(ig.installments, 1) AS installments,
       fn_valor_movimento(t.type, t.amount_cents) AS valor_origem_centavos
FROM transactions AS t
LEFT JOIN installment_groups AS ig ON ig.owner_id = t.owner_id AND ig.id = t.installment_group_id;
