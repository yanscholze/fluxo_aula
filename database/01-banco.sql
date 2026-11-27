-- Fluxo Pessoal | MySQL 8.4

CREATE DATABASE IF NOT EXISTS fluxo_pessoal
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE fluxo_pessoal;


-- ==========================================
-- 1. TABELAS
-- ==========================================

-- Usuários

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Perfis dos usuários

CREATE TABLE user_profiles (
    owner_id VARCHAR(64) NOT NULL,
    avatar_data LONGTEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (owner_id),

    CONSTRAINT fk_user_profiles_user
        FOREIGN KEY (owner_id)
        REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Contas financeiras

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

    CONSTRAINT fk_accounts_owner
        FOREIGN KEY (owner_id)
        REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Categorias

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

    CONSTRAINT fk_categories_owner
        FOREIGN KEY (owner_id)
        REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Cartões

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
    UNIQUE KEY uq_cards_owner_record (owner_id, id),

    CONSTRAINT fk_cards_owner
        FOREIGN KEY (owner_id)
        REFERENCES users(id) ON DELETE CASCADE,

    CONSTRAINT fk_cards_account
        FOREIGN KEY (owner_id, linked_account)
        REFERENCES accounts(owner_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Grupos de parcelamentos

CREATE TABLE installment_groups (
    owner_id VARCHAR(64) NOT NULL,
    id VARCHAR(64) NOT NULL,
    installments INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (owner_id, id),

    CONSTRAINT chk_installment_groups_count
        CHECK (installments >= 2),

    CONSTRAINT fk_installment_groups_owner
        FOREIGN KEY (owner_id)
        REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Movimentações financeiras

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
    status VARCHAR(255),
    source VARCHAR(255),
    payment_method VARCHAR(255),
    card_id VARCHAR(64),
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

    CONSTRAINT fk_transactions_owner
        FOREIGN KEY (owner_id)
        REFERENCES users(id) ON DELETE CASCADE,

    CONSTRAINT fk_transactions_card
        FOREIGN KEY (owner_id, card_id)
        REFERENCES cards(owner_id, id),

    CONSTRAINT fk_transactions_account
        FOREIGN KEY (owner_id, account)
        REFERENCES accounts(owner_id, id),

    CONSTRAINT fk_transactions_destination
        FOREIGN KEY (owner_id, destination_account)
        REFERENCES accounts(owner_id, id),

    CONSTRAINT fk_transactions_category
        FOREIGN KEY (owner_id, category)
        REFERENCES categories(owner_id, id),

    CONSTRAINT fk_transactions_installment_group
        FOREIGN KEY (owner_id, installment_group_id)
        REFERENCES installment_groups(owner_id, id),

    CONSTRAINT chk_transactions_positive_amount
        CHECK (amount_cents > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ==========================================
-- 2. ÍNDICE
-- ==========================================

-- Otimiza a consulta do extrato financeiro.

CREATE INDEX idx_transactions_owner_data
ON transactions (
    owner_id,
    deleted_at,
    occurred_at DESC,
    created_at DESC,
    id DESC
);


-- ==========================================
-- 3. FUNÇÃO
-- ==========================================

-- Retorna o valor positivo para entradas
-- e negativo para saídas da conta de origem.

DELIMITER $$

CREATE FUNCTION fn_valor_movimento(
    p_type VARCHAR(255),
    p_amount_cents BIGINT
)
RETURNS BIGINT
DETERMINISTIC
NO SQL
BEGIN

    RETURN CASE p_type
        WHEN 'income' THEN p_amount_cents
        WHEN 'refund' THEN p_amount_cents
        WHEN 'expense' THEN -p_amount_cents
        WHEN 'transfer' THEN -p_amount_cents
        WHEN 'invoice_payment' THEN -p_amount_cents
        ELSE 0
    END;

END$$


-- ==========================================
-- 4. PROCEDURE
-- ==========================================

-- Valida e registra uma transferência entre contas.

CREATE PROCEDURE sp_registrar_transferencia(
    IN p_owner_id VARCHAR(64),
    IN p_id VARCHAR(64),
    IN p_description VARCHAR(255),
    IN p_account VARCHAR(64),
    IN p_destination_account VARCHAR(64),
    IN p_occurred_at DATETIME,
    IN p_amount_cents BIGINT,
    IN p_status VARCHAR(255),
    IN p_payment_method VARCHAR(255)
)
MODIFIES SQL DATA
BEGIN

    DECLARE v_owner VARCHAR(64) DEFAULT NULL;
    DECLARE v_source_currency CHAR(3) DEFAULT NULL;
    DECLARE v_destination_currency CHAR(3) DEFAULT NULL;

    -- Cancela a operação caso ocorra algum erro.

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- Verifica se o usuário existe.

    SELECT id INTO v_owner
    FROM users
    WHERE id = p_owner_id
    FOR UPDATE;

    IF v_owner IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Usuário não encontrado.';
    END IF;

    -- Verifica se as contas são diferentes.

    IF p_account IS NULL
       OR p_destination_account IS NULL
       OR p_account = p_destination_account THEN

        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Escolha duas contas diferentes.';

    END IF;

    -- Valida os dados da transferência.

    IF p_amount_cents IS NULL
       OR p_amount_cents <= 0
       OR p_occurred_at IS NULL
       OR p_description IS NULL
       OR TRIM(p_description) = ''
       OR p_status IS NULL
       OR p_status NOT IN ('confirmed', 'planned', 'review') THEN

        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Dados da transferência inválidos.';

    END IF;

    -- Busca a moeda da conta de origem.

    SELECT COALESCE(currency_code, 'BRL')
    INTO v_source_currency
    FROM accounts
    WHERE owner_id = p_owner_id
      AND id = p_account
    FOR UPDATE;

    -- Busca a moeda da conta de destino.

    SELECT COALESCE(currency_code, 'BRL')
    INTO v_destination_currency
    FROM accounts
    WHERE owner_id = p_owner_id
      AND id = p_destination_account
    FOR UPDATE;

    -- Verifica se ambas as contas existem.

    IF v_source_currency IS NULL
       OR v_destination_currency IS NULL THEN

        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Uma das contas não está disponível.';

    END IF;

    -- Verifica se ambas utilizam a mesma moeda.

    IF v_source_currency <> v_destination_currency THEN

        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'As contas precisam usar a mesma moeda.';

    END IF;

    -- Registra a transferência.

    INSERT INTO transactions (
        id,
        owner_id,
        description,
        account,
        destination_account,
        occurred_at,
        amount_cents,
        type,
        status,
        source,
        payment_method
    )
    VALUES (
        p_id,
        p_owner_id,
        p_description,
        p_account,
        p_destination_account,
        p_occurred_at,
        p_amount_cents,
        'transfer',
        p_status,
        'manual',
        COALESCE(p_payment_method, 'account')
    );

    COMMIT;

END$$


-- ==========================================
-- 5. TRIGGER
-- ==========================================

-- Remove movimentações e cartões antes da
-- exclusão do usuário, evitando conflitos de FK.

CREATE TRIGGER tr_usuarios_liberar_referencias
BEFORE DELETE ON users
FOR EACH ROW
BEGIN

    DELETE FROM transactions
    WHERE owner_id = OLD.id;

    DELETE FROM cards
    WHERE owner_id = OLD.id;

END$$

DELIMITER ;


-- ==========================================
-- 6. VIEW
-- ==========================================

-- Apresenta as movimentações financeiras,
-- a quantidade de parcelas e o valor com sinal.

CREATE SQL SECURITY INVOKER VIEW vw_lancamentos AS
SELECT
    t.*,

    COALESCE(ig.installments, 1) AS installments,

    fn_valor_movimento(
        t.type,
        t.amount_cents
    ) AS valor_origem_centavos

FROM transactions AS t

LEFT JOIN installment_groups AS ig
    ON ig.owner_id = t.owner_id
    AND ig.id = t.installment_group_id;