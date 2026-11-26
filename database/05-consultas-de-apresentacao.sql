-- Execute após 04-dados-de-apresentacao.sql. As operações usam apenas o perfil de apresentação.
USE fluxo_pessoal;

SET @demo_owner = (
    SELECT id FROM users WHERE id = 'fluxo-aula-demo' AND email = 'demo@fluxo.local'
);

-- WHERE e ORDER BY: extrato do mês mais recente do conjunto de apresentação.
-- A view devolve o número de parcelas e o valor com sinal para a conta de origem.
SET @mes_extrato = (
    SELECT CAST(DATE_FORMAT(MAX(occurred_at), '%Y-%m-01') AS DATE)
    FROM vw_lancamentos
    WHERE owner_id = @demo_owner AND deleted_at IS NULL AND status = 'confirmed'
);

SELECT description, occurred_at, type, amount_cents, installments, valor_origem_centavos
FROM vw_lancamentos
WHERE owner_id = @demo_owner
  AND deleted_at IS NULL
  AND occurred_at >= @mes_extrato
  AND occurred_at < DATE_ADD(@mes_extrato, INTERVAL 1 MONTH)
ORDER BY occurred_at DESC, id DESC;

-- JOIN, GROUP BY, HAVING e ORDER BY: total por categoria de gasto confirmado.
-- HAVING aplica o limite de R$ 100,00 ao total calculado de cada grupo.
SELECT c.name AS categoria, COUNT(*) AS lancamentos, SUM(t.amount_cents) AS total_centavos
FROM transactions AS t
JOIN categories AS c ON c.id = t.category AND c.owner_id = t.owner_id
WHERE t.owner_id = @demo_owner
  AND t.type = 'expense'
  AND t.status = 'confirmed'
  AND t.deleted_at IS NULL
GROUP BY c.id, c.name
HAVING SUM(t.amount_cents) >= 10000
ORDER BY total_centavos DESC, categoria;

-- Subconsulta escalar: despesas confirmadas acima da média do próprio perfil.
SELECT description, occurred_at, amount_cents
FROM transactions AS t
WHERE t.owner_id = @demo_owner
  AND t.type = 'expense'
  AND t.status = 'confirmed'
  AND t.deleted_at IS NULL
  AND t.amount_cents > (
      SELECT AVG(amount_cents)
      FROM transactions
      WHERE owner_id = t.owner_id AND type = 'expense' AND status = 'confirmed' AND deleted_at IS NULL
  )
ORDER BY amount_cents DESC, occurred_at DESC;

-- Um lote centraliza os metadados que os lançamentos importados têm em comum.
SELECT l.name AS lote, l.month AS competencia, l.imported_at, t.description AS lancamento
FROM import_batches AS l
JOIN transactions AS t ON t.import_batch_id = l.id AND t.owner_id = l.owner_id
WHERE l.owner_id = @demo_owner AND t.deleted_at IS NULL
ORDER BY l.imported_at DESC, t.occurred_at DESC, t.id DESC;

-- Função: um débito de R$ 25,00 reduz a origem; um crédito do mesmo valor aumenta a origem.
SELECT fn_valor_movimento('expense', 2500) AS saida_centavos,
       fn_valor_movimento('income', 2500) AS entrada_centavos;

-- Índice: owner_id e deleted_at são filtros de igualdade e as colunas seguintes
-- já estão na ordem do extrato. Compare key e Extra nos dois resultados abaixo.
-- Os hints tornam a comparação reproduzível mesmo com poucos lançamentos.
EXPLAIN
SELECT id, description, amount_cents, occurred_at
FROM transactions FORCE INDEX (idx_transactions_owner_data)
WHERE owner_id = @demo_owner AND deleted_at IS NULL
ORDER BY occurred_at DESC, created_at DESC, id DESC
LIMIT 10;

EXPLAIN
SELECT id, description, amount_cents, occurred_at
FROM transactions IGNORE INDEX (idx_transactions_owner_data)
WHERE owner_id = @demo_owner AND deleted_at IS NULL
ORDER BY occurred_at DESC, created_at DESC, id DESC
LIMIT 10;

-- Procedure, COMMIT e trigger de INSERT: a transferência e sua auditoria
-- persistem juntas. A procedure valida titularidade e moeda das duas contas.
-- Execute CALL sem transação aberta. O START TRANSACTION da procedure faria
-- o commit implícito de uma transação anterior nesta mesma conexão.
SET @transferencia_exemplo = UUID();
CALL sp_registrar_transferencia(
    @demo_owner,
    @transferencia_exemplo,
    'Transferência temporária da apresentação',
    'fluxo-aula-demo-conta-corrente',
    'fluxo-aula-demo-conta-reserva',
    CURRENT_TIMESTAMP,
    2500,
    'confirmed',
    'account',
    NULL
);

SELECT id, account, destination_account, amount_cents, valor_origem_centavos
FROM vw_lancamentos
WHERE owner_id = @demo_owner AND id = @transferencia_exemplo;

SELECT a.action, a.transaction_id, a.amount_cents, a.audited_at
FROM transaction_audit AS a
JOIN transactions AS t ON t.id = a.transaction_id
WHERE t.owner_id = @demo_owner AND t.id = @transferencia_exemplo
ORDER BY a.id;

-- DML: a categoria temporária demonstra INSERT, UPDATE com WHERE e DELETE com WHERE.
-- O UPDATE da transferência também dispara um segundo registro na auditoria.
-- Atomicidade: o ROLLBACK desfaz a alteração e sua auditoria como uma unidade.
-- Consistência: as chaves asseguram os vínculos e os estados válidos persistem após o rollback.
-- Isolamento: o InnoDB protege as alterações abertas de leituras sujas no isolamento padrão.
-- Durabilidade: o rollback mantém a transferência e auditoria confirmadas pela procedure.
SET @categoria_exemplo = UUID();
START TRANSACTION;

INSERT INTO categories (id, owner_id, name, kind)
VALUES (@categoria_exemplo, @demo_owner, 'Categoria temporária', 'expense');

UPDATE categories
SET name = 'Categoria temporária revisada'
WHERE owner_id = @demo_owner AND id = @categoria_exemplo;

SELECT name FROM categories WHERE owner_id = @demo_owner AND id = @categoria_exemplo;

DELETE FROM categories
WHERE owner_id = @demo_owner AND id = @categoria_exemplo;

UPDATE transactions
SET amount_cents = 3000
WHERE owner_id = @demo_owner AND id = @transferencia_exemplo;

SELECT a.action, a.previous_amount_cents, a.amount_cents
FROM transaction_audit AS a
JOIN transactions AS t ON t.id = a.transaction_id
WHERE t.owner_id = @demo_owner AND t.id = @transferencia_exemplo
ORDER BY a.id;

ROLLBACK;

SELECT id, amount_cents FROM transactions
WHERE owner_id = @demo_owner AND id = @transferencia_exemplo;

SELECT a.action, a.previous_amount_cents, a.amount_cents
FROM transaction_audit AS a
JOIN transactions AS t ON t.id = a.transaction_id
WHERE t.owner_id = @demo_owner AND t.id = @transferencia_exemplo
ORDER BY a.id;

-- Limpeza: remova apenas a transferência temporária; a FK remove a auditoria do exemplo.
START TRANSACTION;

DELETE FROM transactions
WHERE owner_id = @demo_owner AND id = @transferencia_exemplo;

COMMIT;
