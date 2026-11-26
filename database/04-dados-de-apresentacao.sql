-- Dados fictícios opcionais. Execute após o esquema original e os scripts 02 e 03.
-- Acesso de apresentação: demo@fluxo.local / FluxoDemo123!
-- As datas são relativas ao mês da primeira importação dos registros.
-- Cada INSERT preserva os registros já existentes com o mesmo ID.

USE fluxo_pessoal;
START TRANSACTION;

INSERT INTO users (id, email, display_name, password_hash, password_salt, password_iterations)
SELECT 'fluxo-aula-demo', 'demo@fluxo.local', 'Marina Costa',
       'b5d07acaaead60c09a3eeb4e8acd9c316cef233d56c1f46e3707e7420a81ac8a',
       'bce90d8cbf52bf03f8a2e87658eed02d57753ef9148f6b3db3dc5c22f626ae90', 210000
WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE id = 'fluxo-aula-demo' OR email = 'demo@fluxo.local'
);

-- O ID reservado e o e-mail precisam identificar a mesma conta de demonstração.
SET @demo_owner = NULL;
SELECT id INTO @demo_owner
FROM users
WHERE id = 'fluxo-aula-demo' AND email = 'demo@fluxo.local'
FOR UPDATE;

SET @demo_mes = CAST(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01') AS DATE);
SET @demo_mes_anterior = DATE_SUB(@demo_mes, INTERVAL 1 MONTH);
SET @demo_mes_seguinte = DATE_ADD(@demo_mes, INTERVAL 1 MONTH);
SET @demo_competencia = DATE_FORMAT(@demo_mes, '%Y-%m');
SET @demo_competencia_seguinte = DATE_FORMAT(@demo_mes_seguinte, '%Y-%m');

INSERT INTO accounts (owner_id, id, name, institution, kind, balance_cents, goal_cents, color)
SELECT @demo_owner, dados.*
FROM (VALUES
    ROW('fluxo-aula-demo-conta-corrente', 'Conta principal', 'Banco Horizonte', 'checking', 180000, NULL, '#4389EB'),
    ROW('fluxo-aula-demo-conta-reserva', 'Reserva de emergência', 'Banco Horizonte', 'savings', 310000, 1000000, '#319B7E'),
    ROW('fluxo-aula-demo-conta-carteira', 'Carteira', NULL, 'cash', 15000, NULL, '#DE9E45')
) AS dados(id, name, institution, kind, balance_cents, goal_cents, color)
WHERE @demo_owner IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM accounts AS atual WHERE atual.id = dados.id);

INSERT INTO categories (owner_id, id, name, kind, color, essential)
SELECT @demo_owner, dados.*
FROM (VALUES
    ROW('fluxo-aula-demo-cat-salario', 'Salário', 'income', '#319B7E', TRUE),
    ROW('fluxo-aula-demo-cat-freela', 'Trabalho autônomo', 'income', '#4389EB', FALSE),
    ROW('fluxo-aula-demo-cat-mercado', 'Mercado', 'expense', '#E88447', TRUE),
    ROW('fluxo-aula-demo-cat-moradia', 'Moradia', 'expense', '#A066D2', TRUE),
    ROW('fluxo-aula-demo-cat-transporte', 'Transporte', 'expense', '#5787D2', TRUE),
    ROW('fluxo-aula-demo-cat-lazer', 'Lazer', 'expense', '#D7678B', FALSE)
) AS dados(id, name, kind, color, essential)
WHERE @demo_owner IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM categories AS atual WHERE atual.id = dados.id);

INSERT INTO cards (
    owner_id, id, name, linked_account, kind, brand, last4, limit_cents, closing_day, due_day,
    reward_mode, points_per_dollar_milli, cashback_basis_points, manual_usd_rate_micros, color, is_favorite
)
SELECT @demo_owner, dados.*
FROM (VALUES
    ROW('fluxo-aula-demo-cartao-credito', 'Horizonte Gold', 'fluxo-aula-demo-conta-corrente', 'credit', 'Visa',
        '2048', 650000, 20, 28, 'both', 2000, 150, 5000000, '#4389EB', TRUE),
    ROW('fluxo-aula-demo-cartao-debito', 'Horizonte Débito', 'fluxo-aula-demo-conta-corrente', 'debit', 'Mastercard',
        '4096', NULL, NULL, NULL, 'none', NULL, NULL, NULL, '#319B7E', FALSE)
) AS dados(
    id, name, linked_account, kind, brand, last4, limit_cents, closing_day, due_day,
    reward_mode, points_per_dollar_milli, cashback_basis_points, manual_usd_rate_micros, color, is_favorite
)
WHERE @demo_owner IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM cards AS atual WHERE atual.id = dados.id);

INSERT INTO trips (owner_id, id, name, start_date, end_date, currency, exchange_rate_micros)
SELECT @demo_owner, 'fluxo-aula-demo-viagem', 'Fim de semana em Curitiba',
       DATE_ADD(@demo_mes, INTERVAL 7 DAY), DATE_ADD(@demo_mes, INTERVAL 9 DAY), 'BRL', 1000000
WHERE @demo_owner IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM trips WHERE id = 'fluxo-aula-demo-viagem');

INSERT INTO installment_groups (owner_id, id, installments)
SELECT @demo_owner, 'fluxo-aula-demo-parcelamento', 3
WHERE @demo_owner IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM installment_groups WHERE owner_id = @demo_owner AND id = 'fluxo-aula-demo-parcelamento'
  );

INSERT INTO installment_labels (owner_id, id, group_id, label)
SELECT @demo_owner, 'fluxo-aula-demo-nome-parcela', 'fluxo-aula-demo-parcelamento', 'Passagens para Curitiba'
WHERE @demo_owner IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM installment_labels WHERE id = 'fluxo-aula-demo-nome-parcela');

INSERT INTO transactions (
    owner_id, id, description, category, account, destination_account, occurred_at, amount_cents, type,
    installment_group_id, status, source, payment_method, card_id, trip_id, invoice_month,
    reward_points_milli, reward_cashback_cents, reward_usd_rate_micros
)
SELECT @demo_owner, dados.id, dados.description, dados.category, dados.account, dados.destination_account,
       dados.occurred_at, dados.amount_cents, dados.type, dados.installment_group_id,
       IF(dados.occurred_at > CURRENT_DATE, 'planned', 'confirmed'),
       dados.source, dados.payment_method, dados.card_id, dados.trip_id, dados.invoice_month,
       dados.reward_points_milli, dados.reward_cashback_cents, dados.reward_usd_rate_micros
FROM (VALUES
    ROW('fluxo-aula-demo-lanc-salario-anterior', 'Salário do mês anterior', 'fluxo-aula-demo-cat-salario',
        'fluxo-aula-demo-conta-corrente', NULL, @demo_mes_anterior, 620000, 'income',
        NULL, 'manual', 'account', NULL, NULL, NULL, NULL, NULL, NULL),
    ROW('fluxo-aula-demo-lanc-aluguel-anterior', 'Aluguel do mês anterior', 'fluxo-aula-demo-cat-moradia',
        'fluxo-aula-demo-conta-corrente', NULL, DATE_ADD(@demo_mes_anterior, INTERVAL 2 DAY), 165000, 'expense',
        NULL, 'manual', 'account', NULL, NULL, NULL, NULL, NULL, NULL),
    ROW('fluxo-aula-demo-lanc-salario', 'Salário', 'fluxo-aula-demo-cat-salario',
        'fluxo-aula-demo-conta-corrente', NULL, @demo_mes, 620000, 'income',
        NULL, 'manual', 'account', NULL, NULL, NULL, NULL, NULL, NULL),
    ROW('fluxo-aula-demo-lanc-freela', 'Projeto de identidade visual', 'fluxo-aula-demo-cat-freela',
        'fluxo-aula-demo-conta-corrente', NULL, DATE_ADD(@demo_mes, INTERVAL 5 DAY), 110000, 'income',
        NULL, 'manual', 'account', NULL, NULL, NULL, NULL, NULL, NULL),
    ROW('fluxo-aula-demo-lanc-aluguel', 'Aluguel', 'fluxo-aula-demo-cat-moradia',
        'fluxo-aula-demo-conta-corrente', NULL, DATE_ADD(@demo_mes, INTERVAL 2 DAY), 165000, 'expense',
        NULL, 'manual', 'account', NULL, NULL, NULL, NULL, NULL, NULL),
    ROW('fluxo-aula-demo-lanc-mercado', 'Mercado da Praça', 'fluxo-aula-demo-cat-mercado',
        'fluxo-aula-demo-conta-corrente', NULL, DATE_ADD(@demo_mes, INTERVAL 3 DAY), 28740, 'expense',
        NULL, 'manual', 'card', 'fluxo-aula-demo-cartao-debito', NULL, NULL, NULL, NULL, NULL),
    ROW('fluxo-aula-demo-lanc-padaria', 'Padaria do bairro', 'fluxo-aula-demo-cat-mercado',
        'fluxo-aula-demo-conta-carteira', NULL, DATE_ADD(@demo_mes, INTERVAL 5 DAY), 4670, 'expense',
        NULL, 'manual', 'account', NULL, NULL, NULL, NULL, NULL, NULL),
    ROW('fluxo-aula-demo-lanc-transferencia', 'Aporte mensal na reserva', NULL,
        'fluxo-aula-demo-conta-corrente', 'fluxo-aula-demo-conta-reserva', DATE_ADD(@demo_mes, INTERVAL 4 DAY), 50000, 'transfer',
        NULL, 'manual', 'account', NULL, NULL, NULL, NULL, NULL, NULL),
    ROW('fluxo-aula-demo-lanc-museu', 'Ingresso do museu', 'fluxo-aula-demo-cat-lazer',
        'fluxo-aula-demo-conta-corrente', NULL, DATE_ADD(@demo_mes, INTERVAL 7 DAY), 7000, 'expense',
        NULL, 'manual', 'card', 'fluxo-aula-demo-cartao-debito', 'fluxo-aula-demo-viagem', NULL, NULL, NULL, NULL),
    ROW('fluxo-aula-demo-lanc-parcela-1', 'Passagens para Curitiba', 'fluxo-aula-demo-cat-transporte',
        NULL, NULL, DATE_ADD(@demo_mes_anterior, INTERVAL 11 DAY), 16700, 'expense',
        'fluxo-aula-demo-parcelamento', 'installment', 'card', 'fluxo-aula-demo-cartao-credito',
        'fluxo-aula-demo-viagem', DATE_FORMAT(@demo_mes_anterior, '%Y-%m'), 66800, 251, 5000000),
    ROW('fluxo-aula-demo-lanc-parcela-2', 'Passagens para Curitiba', 'fluxo-aula-demo-cat-transporte',
        NULL, NULL, DATE_ADD(@demo_mes, INTERVAL 11 DAY), 16700, 'expense',
        'fluxo-aula-demo-parcelamento', 'installment', 'card', 'fluxo-aula-demo-cartao-credito',
        'fluxo-aula-demo-viagem', @demo_competencia, 66800, 251, 5000000),
    ROW('fluxo-aula-demo-lanc-parcela-3', 'Passagens para Curitiba', 'fluxo-aula-demo-cat-transporte',
        NULL, NULL, DATE_ADD(@demo_mes_seguinte, INTERVAL 11 DAY), 16700, 'expense',
        'fluxo-aula-demo-parcelamento', 'installment', 'card', 'fluxo-aula-demo-cartao-credito',
        'fluxo-aula-demo-viagem', @demo_competencia_seguinte, 66800, 251, 5000000)
) AS dados(
    id, description, category, account, destination_account, occurred_at, amount_cents, type,
    installment_group_id, source, payment_method, card_id, trip_id, invoice_month,
    reward_points_milli, reward_cashback_cents, reward_usd_rate_micros
)
WHERE @demo_owner IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM transactions AS atual WHERE atual.id = dados.id);

-- Os dois lançamentos compartilham os metadados normalizados no mesmo lote.
INSERT INTO import_batches (owner_id, id, name, month, imported_at)
SELECT @demo_owner, 'fluxo-aula-demo-lote', 'Extrato do Banco Horizonte', @demo_competencia, CURRENT_TIMESTAMP
WHERE @demo_owner IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM import_batches WHERE owner_id = @demo_owner AND id = 'fluxo-aula-demo-lote'
  );

INSERT INTO transactions (
    owner_id, id, description, category, account, occurred_at, amount_cents, type,
    status, source, payment_method, import_batch_id
)
SELECT @demo_owner, dados.id, dados.description, dados.category, 'fluxo-aula-demo-conta-corrente',
       LEAST(CURRENT_DATE, DATE_ADD(@demo_mes, INTERVAL dados.dia DAY)), dados.amount_cents,
       'expense', 'confirmed', 'import', 'account', 'fluxo-aula-demo-lote'
FROM (VALUES
    ROW('fluxo-aula-demo-lanc-onibus', 'Passagem de ônibus', 'fluxo-aula-demo-cat-transporte', 14, 490),
    ROW('fluxo-aula-demo-lanc-livraria', 'Livraria da estação', 'fluxo-aula-demo-cat-lazer', 16, 6550)
) AS dados(id, description, category, dia, amount_cents)
WHERE @demo_owner IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM transactions AS atual WHERE atual.id = dados.id);

INSERT INTO recurring_entries (
    owner_id, id, description, category, account, amount_cents, type, day_of_month,
    calculation_mode, schedule_mode, date_adjustment, payment_method, card_id
)
SELECT @demo_owner, dados.*
FROM (VALUES
    ROW('fluxo-aula-demo-rec-internet', 'Internet residencial', 'fluxo-aula-demo-cat-moradia',
        'fluxo-aula-demo-conta-corrente', 11990, 'expense', 15, 'fixed', 'day_of_month', 'next', 'account', NULL),
    ROW('fluxo-aula-demo-rec-musica', 'Assinatura de música', 'fluxo-aula-demo-cat-lazer',
        NULL, 2190, 'expense', 20, 'fixed', 'day_of_month', 'none', 'card', 'fluxo-aula-demo-cartao-credito'),
    ROW('fluxo-aula-demo-rec-transporte', 'Transporte do mês', 'fluxo-aula-demo-cat-transporte',
        'fluxo-aula-demo-conta-corrente', 900, 'expense', 5, 'per_business_day', 'business_day_of_month', 'none', 'account', NULL)
) AS dados(
    id, description, category, account, amount_cents, type, day_of_month,
    calculation_mode, schedule_mode, date_adjustment, payment_method, card_id
)
WHERE @demo_owner IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM recurring_entries AS atual WHERE atual.id = dados.id);

INSERT INTO reward_redemptions (owner_id, id, card_id, kind, amount_milli, account, redeemed_at, note)
SELECT @demo_owner, 'fluxo-aula-demo-resgate', 'fluxo-aula-demo-cartao-credito', 'points', 40000,
       NULL, @demo_mes, 'Resgate de 40 pontos do cartão.'
WHERE @demo_owner IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM reward_redemptions WHERE id = 'fluxo-aula-demo-resgate');

INSERT INTO establishment_rules (owner_id, id, match_text, category)
SELECT @demo_owner, 'fluxo-aula-demo-regra-mercado', 'Mercado da Praça', 'fluxo-aula-demo-cat-mercado'
WHERE @demo_owner IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM establishment_rules WHERE owner_id = @demo_owner AND match_text = 'Mercado da Praça')
  AND NOT EXISTS (SELECT 1 FROM establishment_rules WHERE id = 'fluxo-aula-demo-regra-mercado');

INSERT INTO notification_app_rules (owner_id, id, source_app, action, account_id, default_category)
SELECT @demo_owner, 'fluxo-aula-demo-regra-app', 'Banco Horizonte', 'review',
       'fluxo-aula-demo-conta-corrente', 'fluxo-aula-demo-cat-transporte'
WHERE @demo_owner IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM notification_app_rules WHERE owner_id = @demo_owner AND source_app = 'Banco Horizonte')
  AND NOT EXISTS (SELECT 1 FROM notification_app_rules WHERE id = 'fluxo-aula-demo-regra-app');

INSERT INTO pending_auto_transactions (
    owner_id, id, source_app, raw_text, confidence, description, amount_cents, type, occurred_at,
    suggested_category, suggested_account, review_status
)
SELECT @demo_owner, 'fluxo-aula-demo-captura', 'Banco Horizonte', 'Nova compra: R$ 38,50 em Estação Central.',
       90, 'Estação Central', 3850, 'expense', CURRENT_DATE,
       'fluxo-aula-demo-cat-transporte', 'fluxo-aula-demo-conta-corrente', 'review'
WHERE @demo_owner IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM pending_auto_transactions WHERE id = 'fluxo-aula-demo-captura');

INSERT INTO developer_feedback (sender_owner_id, id, sender_name, message, status)
SELECT @demo_owner, 'fluxo-aula-demo-feedback', 'Marina Costa',
       'Gostaria de acompanhar os gastos da viagem por categoria.', 'submitted'
WHERE @demo_owner IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM developer_feedback WHERE id = 'fluxo-aula-demo-feedback');

INSERT INTO app_notifications (owner_id, id, kind, title, message, feedback_id)
SELECT @demo_owner, 'fluxo-aula-demo-notificacao', 'feedback', 'Mensagem registrada',
       'Sua sugestão foi registrada na caixa de sugestões do Fluxo.', 'fluxo-aula-demo-feedback'
WHERE @demo_owner IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM app_notifications WHERE id = 'fluxo-aula-demo-notificacao');

COMMIT;

SELECT IF(@demo_owner IS NULL,
    'Dados ignorados: o ID ou e-mail reservado já pertence a outro usuário.',
    'Dados de apresentação disponíveis para demo@fluxo.local.'
) AS resultado;
