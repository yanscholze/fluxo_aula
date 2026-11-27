-- Dados fictícios para apresentação. Execute após 01-banco.sql.
-- Acesso: demo@fluxo.local / FluxoDemo123!
USE fluxo_pessoal;

START TRANSACTION;

INSERT INTO users (id, email, display_name, password_hash, password_salt, password_iterations)
SELECT 'fluxo-aula-demo', 'demo@fluxo.local', 'Marina Costa',
       'b5d07acaaead60c09a3eeb4e8acd9c316cef233d56c1f46e3707e7420a81ac8a',
       'bce90d8cbf52bf03f8a2e87658eed02d57753ef9148f6b3db3dc5c22f626ae90', 210000
WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE id = 'fluxo-aula-demo' OR email = 'demo@fluxo.local'
);

-- O ID reservado e o e-mail identificam a mesma conta de apresentação.
SET @demo_owner = NULL;
SELECT id INTO @demo_owner FROM users
WHERE id = 'fluxo-aula-demo' AND email = 'demo@fluxo.local'
FOR UPDATE;

SET @mes = CAST(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01') AS DATE);
SET @mes_seguinte = DATE_ADD(@mes, INTERVAL 1 MONTH);
SET @competencia = DATE_FORMAT(@mes, '%Y-%m');
SET @competencia_seguinte = DATE_FORMAT(@mes_seguinte, '%Y-%m');

INSERT INTO user_profiles (owner_id)
SELECT @demo_owner
WHERE @demo_owner IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM user_profiles WHERE owner_id = @demo_owner);

INSERT INTO accounts (owner_id, id, name, institution, kind, balance_cents, goal_cents, color)
SELECT @demo_owner, exemplo.*
FROM (VALUES
    ROW('fluxo-aula-demo-corrente', 'Conta corrente', 'Banco Horizonte', 'checking', 180000, NULL, '#4389EB'),
    ROW('fluxo-aula-demo-reserva', 'Reserva', 'Banco Horizonte', 'savings', 310000, 1000000, '#319B7E')
) AS exemplo(id, name, institution, kind, balance_cents, goal_cents, color)
WHERE @demo_owner IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM accounts WHERE accounts.id = exemplo.id);

INSERT INTO categories (owner_id, id, name, kind, color, essential)
SELECT @demo_owner, exemplo.*
FROM (VALUES
    ROW('fluxo-aula-demo-salario', 'Salário', 'income', '#319B7E', TRUE),
    ROW('fluxo-aula-demo-alimentacao', 'Alimentação', 'expense', '#E88447', TRUE),
    ROW('fluxo-aula-demo-transporte', 'Transporte', 'expense', '#4389EB', TRUE),
    ROW('fluxo-aula-demo-lazer', 'Lazer', 'expense', '#A066D2', FALSE)
) AS exemplo(id, name, kind, color, essential)
WHERE @demo_owner IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM categories WHERE categories.id = exemplo.id);

INSERT INTO cards (
    owner_id, id, name, linked_account, kind, brand, last4, limit_cents, closing_day, due_day, color, is_favorite
)
SELECT @demo_owner, exemplo.*
FROM (VALUES
    ROW('fluxo-aula-demo-credito', 'Horizonte Gold', 'fluxo-aula-demo-corrente', 'credit', 'Visa',
        '2048', 650000, 20, 28, '#4389EB', TRUE),
    ROW('fluxo-aula-demo-debito', 'Horizonte Débito', 'fluxo-aula-demo-corrente', 'debit', 'Mastercard',
        '4096', NULL, NULL, NULL, '#319B7E', FALSE)
) AS exemplo(id, name, linked_account, kind, brand, last4, limit_cents, closing_day, due_day, color, is_favorite)
WHERE @demo_owner IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM cards WHERE cards.id = exemplo.id);

INSERT INTO installment_groups (owner_id, id, installments)
SELECT @demo_owner, 'fluxo-aula-demo-grupo', 2
WHERE @demo_owner IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM installment_groups WHERE owner_id = @demo_owner AND id = 'fluxo-aula-demo-grupo'
  );

INSERT INTO transactions (
    owner_id, id, description, category, account, destination_account, occurred_at, amount_cents, type,
    installment_group_id, status, source, payment_method, card_id, invoice_month
)
SELECT @demo_owner, exemplo.*
FROM (VALUES
    ROW('fluxo-aula-demo-lanc-salario', 'Salário', 'fluxo-aula-demo-salario', 'fluxo-aula-demo-corrente',
        NULL, CAST(@mes AS DATETIME), 425000, 'income', NULL, 'confirmed', 'manual', 'account', NULL, NULL),
    ROW('fluxo-aula-demo-lanc-mercado', 'Mercado do bairro', 'fluxo-aula-demo-alimentacao', 'fluxo-aula-demo-corrente',
        NULL, CAST(LEAST(CURRENT_DATE, DATE_ADD(@mes, INTERVAL 2 DAY)) AS DATETIME), 18550, 'expense',
        NULL, 'confirmed', 'manual', 'card', 'fluxo-aula-demo-debito', NULL),
    ROW('fluxo-aula-demo-lanc-almoco', 'Almoço', 'fluxo-aula-demo-alimentacao', 'fluxo-aula-demo-corrente',
        NULL, CAST(LEAST(CURRENT_DATE, DATE_ADD(@mes, INTERVAL 3 DAY)) AS DATETIME), 3890, 'expense',
        NULL, 'confirmed', 'manual', 'account', NULL, NULL),
    ROW('fluxo-aula-demo-lanc-transporte', 'Transporte', 'fluxo-aula-demo-transporte', 'fluxo-aula-demo-corrente',
        NULL, CAST(LEAST(CURRENT_DATE, DATE_ADD(@mes, INTERVAL 4 DAY)) AS DATETIME), 7750, 'expense',
        NULL, 'confirmed', 'manual', 'account', NULL, NULL),
    ROW('fluxo-aula-demo-lanc-transferencia', 'Aporte para a reserva', NULL, 'fluxo-aula-demo-corrente',
        'fluxo-aula-demo-reserva', CAST(LEAST(CURRENT_DATE, DATE_ADD(@mes, INTERVAL 5 DAY)) AS DATETIME), 50000, 'transfer',
        NULL, 'confirmed', 'manual', 'account', NULL, NULL),
    ROW('fluxo-aula-demo-lanc-parcela-1', 'Compra parcelada', 'fluxo-aula-demo-lazer', NULL,
        NULL, CAST(LEAST(CURRENT_DATE, DATE_ADD(@mes, INTERVAL 8 DAY)) AS DATETIME), 16700, 'expense',
        'fluxo-aula-demo-grupo', 'confirmed', 'installment', 'card', 'fluxo-aula-demo-credito', @competencia),
    ROW('fluxo-aula-demo-lanc-parcela-2', 'Compra parcelada', 'fluxo-aula-demo-lazer', NULL,
        NULL, CAST(DATE_ADD(@mes_seguinte, INTERVAL 8 DAY) AS DATETIME), 16700, 'expense',
        'fluxo-aula-demo-grupo', 'planned', 'installment', 'card', 'fluxo-aula-demo-credito', @competencia_seguinte)
) AS exemplo(
    id, description, category, account, destination_account, occurred_at, amount_cents, type,
    installment_group_id, status, source, payment_method, card_id, invoice_month
)
WHERE @demo_owner IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM transactions WHERE transactions.id = exemplo.id);

COMMIT;
