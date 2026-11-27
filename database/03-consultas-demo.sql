-- Roteiro SQL. Execute após 01-banco.sql e 02-dados-demo.sql.
USE fluxo_pessoal;

SET @demo_owner = (
    SELECT id FROM users WHERE id = 'fluxo-aula-demo' AND email = 'demo@fluxo.local'
);

-- 1. Extrato com as duas contas, a categoria e o valor com sinal.
SELECT l.occurred_at, l.description, origem.name AS origem, destino.name AS destino,
       c.name AS categoria, l.installments, l.valor_origem_centavos
FROM vw_lancamentos AS l
LEFT JOIN accounts AS origem ON origem.owner_id = l.owner_id AND origem.id = l.account
LEFT JOIN accounts AS destino ON destino.owner_id = l.owner_id AND destino.id = l.destination_account
LEFT JOIN categories AS c ON c.owner_id = l.owner_id AND c.id = l.category
WHERE l.owner_id = @demo_owner AND l.deleted_at IS NULL
ORDER BY l.occurred_at DESC, l.created_at DESC, l.id DESC;

-- 2. Categorias com pelo menos duas despesas confirmadas.
SELECT c.name AS categoria, COUNT(*) AS quantidade, SUM(t.amount_cents) AS total_centavos
FROM transactions AS t
JOIN categories AS c ON c.owner_id = t.owner_id AND c.id = t.category
WHERE t.owner_id = @demo_owner AND t.type = 'expense'
  AND t.status = 'confirmed' AND t.deleted_at IS NULL
GROUP BY c.id, c.name
HAVING COUNT(*) >= 2
ORDER BY total_centavos DESC;

-- 3. Despesas confirmadas com valor acima da média.
SELECT description, amount_cents
FROM transactions
WHERE owner_id = @demo_owner AND type = 'expense' AND status = 'confirmed' AND deleted_at IS NULL
  AND amount_cents > (
      SELECT AVG(amount_cents) FROM transactions
      WHERE owner_id = @demo_owner AND type = 'expense' AND status = 'confirmed' AND deleted_at IS NULL
  )
ORDER BY amount_cents DESC;

-- O índice atende aos filtros de igualdade e à ordem do extrato.
-- Compare as colunas key e Extra. Desabilitar o índice leva a Using filesort.
EXPLAIN SELECT id, occurred_at, description
FROM transactions IGNORE INDEX (idx_transactions_owner_data)
WHERE owner_id = @demo_owner AND deleted_at IS NULL
ORDER BY occurred_at DESC, created_at DESC, id DESC;

EXPLAIN SELECT id, occurred_at, description
FROM transactions FORCE INDEX (idx_transactions_owner_data)
WHERE owner_id = @demo_owner AND deleted_at IS NULL
ORDER BY occurred_at DESC, created_at DESC, id DESC;

-- DDL de exemplo. A tabela temporária existe apenas nesta sessão.
CREATE TEMPORARY TABLE fluxo_demo_ddl (id INT PRIMARY KEY);
ALTER TABLE fluxo_demo_ddl ADD COLUMN descricao VARCHAR(80) NOT NULL;
SHOW COLUMNS FROM fluxo_demo_ddl;
DROP TEMPORARY TABLE fluxo_demo_ddl;

-- A procedure inicia e confirma a própria transação. Chame-a em autocommit.
SET @transferencia = UUID();
CALL sp_registrar_transferencia(
    @demo_owner, @transferencia, 'Transferência SQL de apresentação',
    'fluxo-aula-demo-corrente', 'fluxo-aula-demo-reserva', CURRENT_TIMESTAMP,
    2500, 'confirmed', 'account'
);

SELECT description, account, destination_account, amount_cents, valor_origem_centavos
FROM vw_lancamentos
WHERE owner_id = @demo_owner AND id = @transferencia;

-- UPDATE e DELETE de exemplo. O ROLLBACK restaura a linha confirmada pela procedure.
START TRANSACTION;
UPDATE transactions SET amount_cents = 3000
WHERE owner_id = @demo_owner AND id = @transferencia;
SELECT amount_cents AS valor_durante_teste FROM transactions
WHERE owner_id = @demo_owner AND id = @transferencia;

DELETE FROM transactions WHERE owner_id = @demo_owner AND id = @transferencia;
SELECT COUNT(*) AS existe_apos_delete FROM transactions
WHERE owner_id = @demo_owner AND id = @transferencia;
ROLLBACK;

SELECT amount_cents AS valor_apos_rollback FROM transactions
WHERE owner_id = @demo_owner AND id = @transferencia;

START TRANSACTION;
DELETE FROM transactions WHERE owner_id = @demo_owner AND id = @transferencia;
COMMIT;

-- O usuário temporário tem conta, cartão e lançamento vinculados.
-- O gatilho libera os vínculos antes de o banco apagar os demais registros em cascata.
SET @usuario_teste = UUID(), @conta_teste = UUID(), @cartao_teste = UUID(), @lancamento_teste = UUID();
START TRANSACTION;

INSERT INTO users (id, email, display_name, password_hash, password_salt)
VALUES (@usuario_teste, CONCAT(@usuario_teste, '@example.invalid'), 'Teste do gatilho', 'teste', 'teste');
INSERT INTO accounts (id, owner_id, name, kind)
VALUES (@conta_teste, @usuario_teste, 'Conta de teste', 'checking');
INSERT INTO cards (id, owner_id, name, kind, linked_account)
VALUES (@cartao_teste, @usuario_teste, 'Cartão de teste', 'debit', @conta_teste);
INSERT INTO transactions (id, owner_id, description, account, card_id, occurred_at, amount_cents, type)
VALUES (@lancamento_teste, @usuario_teste, 'Teste do gatilho', @conta_teste, @cartao_teste, CURRENT_TIMESTAMP, 100, 'expense');

DELETE FROM users WHERE id = @usuario_teste;
SELECT
    (SELECT COUNT(*) FROM users WHERE id = @usuario_teste) AS usuarios_restantes,
    (SELECT COUNT(*) FROM accounts WHERE owner_id = @usuario_teste) AS contas_restantes,
    (SELECT COUNT(*) FROM cards WHERE owner_id = @usuario_teste) AS cartoes_restantes,
    (SELECT COUNT(*) FROM transactions WHERE owner_id = @usuario_teste) AS lancamentos_restantes;
ROLLBACK;
