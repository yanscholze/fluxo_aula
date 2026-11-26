import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import { OwnedRecordsRepository, ownerColumn } from "./repository.mjs";

function failure(status, message) {
  throw Object.assign(new Error(message), { status });
}

const text =
  (label, max = 255, pattern) =>
  (value) => {
    if (
      typeof value !== "string" ||
      value.trim().length > max ||
      (pattern && !pattern.test(value.trim()))
    ) {
      failure(
        400,
        `${label}: informe um texto válido de até ${max} caracteres.`,
      );
    }
    return value.trim();
  };
const number =
  (label, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  (value) => {
    const numeric =
      typeof value === "string" && /^-?\d+$/.test(value)
        ? Number(value)
        : value;
    if (!Number.isSafeInteger(numeric) || numeric < min || numeric > max) {
      failure(
        400,
        `${label}: informe um número inteiro entre ${min} e ${max}.`,
      );
    }
    return numeric;
  };
const option =
  (label, ...choices) =>
  (value) => {
    if (!choices.includes(value))
      failure(400, `${label}: escolha uma das opções disponíveis.`);
    return value;
  };
const boolean = (value) => {
  if (value === true || value === 1 || value === "1") return 1;
  if (value === false || value === 0 || value === "0") return 0;
  failure(400, "Informe um valor verdadeiro ou falso.");
};

const datePattern = /^[1-9]\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const monthPattern = /^[1-9]\d{3}-(0[1-9]|1[0-2])$/;
const dayKey = (value) => value.toISOString().slice(0, 10);
const date = (label) => (value) => {
  if (typeof value !== "string" || !datePattern.test(value))
    failure(400, `${label}: informe uma data válida.`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || dayKey(parsed) !== value)
    failure(400, `${label}: informe uma data válida.`);
  return value;
};
const datetime = (label) => (value) => {
  if (typeof value !== "string")
    failure(400, `${label}: informe uma data válida.`);
  const day = date(label)(value.slice(0, 10));
  if (value.length === 10) return `${day} 00:00:00`;
  if (!/^[T ]([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value.slice(10))) {
    failure(400, `${label}: informe um horário válido.`);
  }
  const hour = value.slice(11);
  return `${day} ${hour.length === 5 ? hour + ":00" : hour}`;
};

const id = text("Registro vinculado", 64);
const color = text("Cor", 7, /^#[a-fA-F0-9]{6}$/);
const currency = (value) =>
  text("Moeda", 3, /^[A-Za-z]{3}$/)(value).toUpperCase();
const month = text("Competência", 7, monthPattern);
const amount = number("Valor em centavos", 1);
const day = number("Dia do mês", 1, 31);
const categoryKind = option("Tipo", "income", "expense");
const dateAdjustment = option("Ajuste da data", "none", "previous", "next");
const transactionFields = {
  description: text("Descrição"),
  category: id,
  account: id,
  destination_account: id,
  occurred_at: datetime("Data do lançamento"),
  amount_cents: amount,
  type: option(
    "Tipo",
    "income",
    "expense",
    "transfer",
    "invoice_payment",
    "refund",
  ),
  installments: number("Parcelas", 1, 120),
  status: option("Situação", "confirmed", "planned", "review"),
  payment_method: text("Forma de pagamento"),
  card_id: id,
  trip_id: id,
  invoice_month: month,
};

const resources = {
  accounts: {
    fields: {
      name: text("Nome"),
      institution: text("Instituição"),
      currency_code: currency,
      kind: option(
        "Tipo da conta",
        "checking",
        "savings",
        "cash",
        "benefit",
        "investment",
      ),
      balance_cents: number("Saldo inicial", -Number.MAX_SAFE_INTEGER),
      goal_cents: number("Meta"),
      monthly_yield_basis_points: number(
        "Rendimento mensal",
        -10000,
        2147483647,
      ),
      fixed: boolean,
      exclude_from_totals: boolean,
      color,
    },
    required: ["name", "kind", "currency_code"],
    defaults: {
      currency_code: "BRL",
      balance_cents: 0,
      fixed: 0,
      exclude_from_totals: 0,
    },
    updated: true,
    order: "name ASC, id ASC",
  },
  categories: {
    fields: {
      name: text("Nome"),
      kind: categoryKind,
      color,
      icon: text("Ícone"),
      essential: boolean,
    },
    required: ["name", "kind"],
    defaults: { essential: 0 },
    order: "name ASC, id ASC",
  },
  cards: {
    fields: {
      name: text("Nome"),
      linked_account: id,
      kind: option("Tipo do cartão", "credit", "debit"),
      brand: text("Bandeira"),
      tier: text("Categoria do cartão"),
      last4: text("Últimos quatro dígitos", 4, /^\d{4}$/),
      limit_cents: number("Limite"),
      closing_day: day,
      due_day: day,
      due_adjustment: dateAdjustment,
      points_per_dollar_milli: number("Pontos por dólar"),
      cashback_basis_points: number("Cashback", 0, 10000),
      reward_mode: option("Recompensa", "none", "points", "cashback", "both"),
      points_goal: number("Meta de pontos", 0, 2147483647),
      manual_usd_rate_micros: number("Cotação do dólar", 1),
      color,
      image_data: text(
        "Imagem do cartão",
        1_400_000,
        /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/,
      ),
      is_favorite: boolean,
      sort_order: number("Ordem", 0, 2147483647),
    },
    required: ["name", "kind"],
    defaults: {
      due_adjustment: "none",
      reward_mode: "none",
      is_favorite: 0,
      sort_order: 0,
    },
    updated: true,
    order: "is_favorite DESC, sort_order ASC, name ASC",
  },
  transactions: {
    source: "vw_lancamentos",
    fields: transactionFields,
    required: ["description", "occurred_at", "amount_cents", "type", "status"],
    defaults: { installments: 1, status: "confirmed" },
    updated: true,
    filter: "AND deleted_at IS NULL",
    order: "occurred_at DESC, created_at DESC, id DESC",
  },
  trips: {
    fields: {
      name: text("Nome"),
      start_date: date("Início"),
      end_date: date("Fim"),
      currency,
      exchange_rate_micros: number("Taxa de câmbio", 1),
    },
    required: [
      "name",
      "start_date",
      "end_date",
      "currency",
      "exchange_rate_micros",
    ],
    defaults: { currency: "BRL", exchange_rate_micros: 1_000_000 },
    updated: true,
    order: "start_date DESC, name ASC",
  },
  recurring_entries: {
    fields: {
      description: text("Descrição"),
      category: id,
      account: id,
      amount_cents: amount,
      type: categoryKind,
      day_of_month: day,
      calculation_mode: option("Cálculo do valor", "fixed", "per_business_day"),
      schedule_mode: option("Agenda", "day_of_month", "business_day_of_month"),
      date_adjustment: dateAdjustment,
      payment_method: text("Forma de pagamento"),
      card_id: id,
      active: boolean,
    },
    required: ["description", "amount_cents", "type", "day_of_month"],
    defaults: {
      calculation_mode: "fixed",
      schedule_mode: "day_of_month",
      date_adjustment: "none",
      active: 1,
    },
    updated: true,
    order: "day_of_month ASC, description ASC",
  },
  reward_redemptions: {
    fields: {
      card_id: id,
      kind: option("Recompensa", "points", "cashback"),
      amount_milli: number("Valor do resgate", 1),
      account: id,
      redeemed_at: datetime("Data do resgate"),
      note: text("Observação", 4000),
    },
    required: ["card_id", "kind", "amount_milli", "redeemed_at"],
    order: "redeemed_at DESC",
  },
  installment_labels: {
    fields: { group_id: id, label: text("Nome do parcelamento") },
    required: ["group_id", "label"],
    updated: true,
    order: "updated_at DESC",
  },
  establishment_rules: {
    fields: { match_text: text("Texto do estabelecimento"), category: id },
    required: ["match_text", "category"],
    order: "created_at ASC, id ASC",
  },
  notification_app_rules: {
    fields: {
      source_app: text("Aplicativo de origem"),
      action: option("Ação", "review", "ignore"),
      account_id: id,
      card_id: id,
      default_category: id,
    },
    required: ["source_app", "action"],
    defaults: { action: "review" },
    order: "source_app ASC",
  },
  pending_auto_transactions: {
    fields: {
      source_app: text("Aplicativo de origem"),
      raw_text: text("Texto capturado", 16000),
      confidence: number("Confiança", 0, 100),
      description: text("Descrição"),
      amount_cents: amount,
      type: categoryKind,
      occurred_at: datetime("Data do lançamento"),
      suggested_category: id,
      suggested_account: id,
      card_id: id,
      review_status: option("Situação", "review", "ignored"),
      ignore_reason: text("Motivo do descarte"),
    },
    required: ["source_app", "raw_text", "review_status"],
    defaults: { review_status: "review" },
    order: "created_at DESC, id DESC",
  },
  app_notifications: {
    fields: {
      read_at: (value) =>
        value === true
          ? now()
          : value === false
            ? null
            : datetime("Data de leitura")(value),
    },
    operations: ["update"],
    order: "created_at DESC, id DESC",
  },
  developer_feedback: {
    owner: "sender_owner_id",
    fields: { message: text("Mensagem", 4000) },
    required: ["message"],
    operations: ["create"],
    order: "created_at DESC, id DESC",
  },
  mobile_devices: {
    columns:
      "id, device_id, name, platform, app_version, expires_at, revoked_at, last_seen_at, created_at, updated_at",
    fields: {},
    operations: ["delete"],
    order: "created_at DESC, id DESC",
  },
};

const financialNumbers = [
  "balance_cents",
  "goal_cents",
  "limit_cents",
  "points_per_dollar_milli",
  "manual_usd_rate_micros",
  "amount_cents",
  "reward_points_milli",
  "reward_cashback_cents",
  "reward_usd_rate_micros",
  "exchange_rate_micros",
  "amount_milli",
  "valor_origem_centavos",
];

function safeValues(row) {
  for (const key of financialNumbers) {
    if (typeof row[key] === "string" && Number.isSafeInteger(Number(row[key])))
      row[key] = Number(row[key]);
  }
  return row;
}

const repository = new OwnedRecordsRepository(resources);
const own = (object, key) => Object.hasOwn(object, key);

function parseFields(resource, body, create = false) {
  if (body === null || typeof body !== "object" || Array.isArray(body))
    failure(400, "Envie um objeto JSON.");
  const config = resources[resource];
  const parsed = create ? { ...config.defaults } : {};
  for (const key of Object.keys(config.fields)) {
    if (!own(body, key)) continue;
    const value = body[key];
    parsed[key] =
      value == null || (typeof value === "string" && value.trim() === "")
        ? null
        : config.fields[key](value);
  }
  return parsed;
}

function required(record, keys) {
  const missing = keys.find((key) => record[key] == null);
  if (missing) {
    const labels = {
      name: "nome",
      kind: "tipo",
      currency: "moeda",
      currency_code: "moeda",
      start_date: "data de início",
      end_date: "data de fim",
      exchange_rate_micros: "taxa de câmbio",
      description: "descrição",
      occurred_at: "data",
      amount_cents: "valor",
      type: "tipo",
      status: "situação",
      day_of_month: "dia do mês",
      closing_day: "dia de fechamento",
      due_day: "dia de vencimento",
      account: "conta de origem",
      linked_account: "conta vinculada",
      destination_account: "conta de destino",
      card_id: "cartão",
      amount_milli: "valor do resgate",
      redeemed_at: "data do resgate",
      group_id: "grupo",
      label: "nome do parcelamento",
      match_text: "texto do estabelecimento",
      category: "categoria",
      source_app: "aplicativo de origem",
      action: "ação",
      raw_text: "texto capturado",
      review_status: "situação",
      message: "mensagem",
    };
    failure(400, `Preencha o campo ${labels[missing] ?? missing}.`);
  }
}

function getResource(resource, operation) {
  if (!own(resources, resource)) failure(404, "Recurso não encontrado.");
  const config = resources[resource];
  if (config.operations && !config.operations.includes(operation))
    failure(405, "Operação não disponível.");
  return config;
}

async function getRows(db, resource, ownerId) {
  const rows = await repository.findAll(db, resource, ownerId);
  return rows.map(safeValues);
}

async function getOne(db, resource, ownerId, rowId, optional = false) {
  const row = await repository.findById(db, resource, ownerId, rowId);
  if (!row && !optional) failure(404, "Registro não encontrado.");
  return row ? safeValues(row) : null;
}

async function linked(db, resource, ownerId, rowId, label) {
  if (rowId == null) return null;
  const row = await getOne(db, resource, ownerId, rowId, true);
  if (!row) failure(400, `${label} não está disponível.`);
  return row;
}

async function atomic(db, ownerId, work) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    // Serializa alterações do mesmo usuário, inclusive validações sem FK no MER.
    const [users] = await connection.execute(
      "SELECT id, display_name FROM users WHERE id = ? FOR UPDATE",
      [ownerId],
    );
    if (!users.length) failure(401, "Faça login para continuar.");
    const result = await work(connection, users[0]);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

const fieldsSQL = (keys) => keys.map((key) => `\`${key}\``).join(", ");

async function insert(db, resource, ownerId, data, rowId = randomUUID()) {
  const record = {
    id: rowId,
    [ownerColumn(resources[resource])]: ownerId,
    ...data,
  };
  const keys = Object.keys(record);
  await db.execute(
    `INSERT INTO \`${resource}\` (${fieldsSQL(keys)}) VALUES (${keys.map(() => "?").join(", ")})`,
    Object.values(record),
  );
  return rowId;
}

async function update(db, resource, ownerId, rowId, changes) {
  const entries = Object.entries(changes);
  const set = entries.map(([key]) => `\`${key}\` = ?`);
  if (resources[resource].updated) set.push("updated_at = CURRENT_TIMESTAMP");
  if (!set.length) return;
  await db.execute(
    `UPDATE \`${resource}\` SET ${set.join(", ")} WHERE \`${ownerColumn(resources[resource])}\` = ? AND id = ?`,
    [...entries.map(([, value]) => value), ownerId, rowId],
  );
}

const todayFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
});
const now = () => new Date().toISOString().slice(0, 19).replace("T", " ");
const today = () => todayFormatter.format(new Date());

function daysInMonth(value) {
  const [year, monthNumber] = value.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function dayInMonth(value, dayNumber) {
  if (!monthPattern.test(value))
    failure(400, "A data ficou fora do intervalo do banco.");
  return `${value}-${String(Math.min(dayNumber, daysInMonth(value))).padStart(2, "0")}`;
}

function shiftMonth(value, offset) {
  const [year, monthNumber] = value.slice(0, 7).split("-").map(Number);
  const target = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  const result = dayKey(target).slice(0, 7);
  if (!monthPattern.test(result))
    failure(400, "A competência ficou fora do intervalo do banco.");
  return result;
}

function moveDay(value, offset) {
  const target = new Date(`${value}T00:00:00Z`);
  target.setUTCDate(target.getUTCDate() + offset);
  return dayKey(target);
}

// Mesmos feriados bancários do calendário brasileiro da UI de origem.
function bankHolidays(year) {
  const yearRemainder = year % 100;
  const century = Math.floor(year / 100);
  const goldenNumber = year % 19;
  const correction = Math.floor((century + 8) / 25);
  const epact =
    (19 * goldenNumber +
      century -
      Math.floor(century / 4) -
      Math.floor((century - correction + 1) / 3) +
      15) %
    30;
  const weekday =
    (32 +
      2 * (century % 4) +
      2 * Math.floor(yearRemainder / 4) -
      epact -
      (yearRemainder % 4)) %
    7;
  const moonCorrection = Math.floor(
    (goldenNumber + 11 * epact + 22 * weekday) / 451,
  );
  const marchOffset = epact + weekday - 7 * moonCorrection + 114;
  const easter = dayKey(
    new Date(
      Date.UTC(year, Math.floor(marchOffset / 31) - 1, (marchOffset % 31) + 1),
    ),
  );
  return new Set([
    ...[
      "01-01",
      "04-21",
      "05-01",
      "09-07",
      "10-12",
      "11-02",
      "11-15",
      "11-20",
      "12-25",
    ].map((day) => `${year}-${day}`),
    ...[-48, -47, -2, 60].map((offset) => moveDay(easter, offset)),
  ]);
}

function businessDay(
  value,
  holidays = bankHolidays(Number(value.slice(0, 4))),
) {
  const weekday = new Date(`${value}T00:00:00Z`).getUTCDay();
  return weekday >= 1 && weekday <= 5 && !holidays.has(value);
}

function recurrenceDetails(record, value) {
  const holidays = bankHolidays(Number(value.slice(0, 4)));
  const days = Array.from({ length: daysInMonth(value) }, (_, index) =>
    dayInMonth(value, index + 1),
  ).filter((day) => businessDay(day, holidays));
  let due = dayInMonth(value, record.day_of_month);
  if (record.schedule_mode === "business_day_of_month") {
    due = days[Math.min(record.day_of_month, days.length) - 1];
  } else if (
    record.date_adjustment === "previous" ||
    record.date_adjustment === "next"
  ) {
    const step = record.date_adjustment === "previous" ? -1 : 1;
    while (!businessDay(due)) {
      due = moveDay(due, step);
      if (!datePattern.test(due))
        failure(400, "A data do lançamento ficou fora do intervalo do banco.");
    }
  }
  const multiplier =
    record.calculation_mode === "per_business_day" ? days.length : 1;
  return {
    occurred_at: `${due} 00:00:00`,
    amount_cents: amount(record.amount_cents * multiplier),
  };
}

function invoiceFor(occurredAt, card) {
  const value = occurredAt.slice(0, 7);
  return card?.closing_day &&
    occurredAt.slice(0, 10) > dayInMonth(value, card.closing_day)
    ? shiftMonth(value, 1)
    : value;
}

async function automaticCategory(db, ownerId, description, kind) {
  const [rows] = await db.execute(
    "SELECT r.match_text, c.id FROM establishment_rules r JOIN categories c ON c.owner_id = r.owner_id AND c.id = r.category WHERE r.owner_id = ? AND c.kind = ? ORDER BY CHAR_LENGTH(r.match_text) DESC, r.created_at, r.id",
    [ownerId, kind],
  );
  const normalized = description.toLocaleLowerCase("pt-BR");
  return (
    rows.find((rule) =>
      normalized.includes(rule.match_text.toLocaleLowerCase("pt-BR")),
    )?.id ?? null
  );
}

function rewardFor(record, card) {
  const clear = {
    reward_points_milli: null,
    reward_cashback_cents: null,
    reward_usd_rate_micros: null,
  };
  if (!card || record.type !== "expense" || record.status === "review")
    return clear;

  const cents = BigInt(record.amount_cents);
  const floorToSafeNumber = (numerator, denominator) => {
    const result = (numerator + denominator / 2n) / denominator;
    return number("Recompensa calculada")(Number(result));
  };
  const pointsOn =
    ["points", "both"].includes(card.reward_mode) &&
    card.points_per_dollar_milli &&
    card.manual_usd_rate_micros;
  const cashbackOn =
    ["cashback", "both"].includes(card.reward_mode) &&
    card.cashback_basis_points;
  return {
    reward_points_milli: pointsOn
      ? floorToSafeNumber(
          cents * BigInt(card.points_per_dollar_milli) * 1_000_000n,
          100n * BigInt(card.manual_usd_rate_micros),
        )
      : null,
    reward_cashback_cents: cashbackOn
      ? floorToSafeNumber(cents * BigInt(card.cashback_basis_points), 10_000n)
      : null,
    reward_usd_rate_micros: pointsOn ? card.manual_usd_rate_micros : null,
  };
}

async function validateCategory(db, ownerId, categoryId, kind) {
  const category = await linked(
    db,
    "categories",
    ownerId,
    categoryId,
    "A categoria selecionada",
  );
  if (category && kind && kind !== category.kind)
    failure(400, "A categoria deve corresponder ao tipo do lançamento.");
  return category;
}

async function validateTransaction(
  db,
  ownerId,
  record,
  { existing, inputs } = {},
) {
  required(record, resources.transactions.required);
  const [account, destination, card] = await Promise.all([
    linked(db, "accounts", ownerId, record.account, "A conta selecionada"),
    linked(
      db,
      "accounts",
      ownerId,
      record.destination_account,
      "A conta de destino",
    ),
    linked(db, "cards", ownerId, record.card_id, "O cartão selecionado"),
    linked(db, "trips", ownerId, record.trip_id, "A viagem selecionada"),
  ]);
  const type = record.type;
  if (type === "transfer") {
    required(record, ["account", "destination_account"]);
    if (account.id === destination.id)
      failure(400, "Escolha contas diferentes para a transferência.");
    if (
      (account.currency_code ?? "BRL") !== (destination.currency_code ?? "BRL")
    )
      failure(400, "As contas da transferência precisam usar a mesma moeda.");
    if (card) failure(400, "Use somente contas em uma transferência.");
  } else if (type === "invoice_payment") {
    required(record, ["account", "card_id"]);
    if (card.kind !== "credit")
      failure(400, "Selecione um cartão de crédito para a fatura.");
    if (account.currency_code && account.currency_code !== "BRL")
      failure(400, "Pague a fatura com uma conta em reais.");
  } else if (type === "income" || !card) {
    required(record, ["account"]);
    if (card) failure(400, "Use uma conta para registrar receitas.");
  }
  if (type !== "transfer" && destination)
    failure(400, "A conta de destino só pode ser usada em transferências.");
  if (card?.kind === "debit") {
    if (!card.linked_account)
      failure(400, "Vincule o cartão de débito a uma conta.");
    const linkedAccount = await linked(
      db,
      "accounts",
      ownerId,
      card.linked_account,
      "A conta vinculada ao cartão de débito",
    );
    if (account && account.id !== linkedAccount.id)
      failure(400, "Selecione a conta vinculada ao cartão de débito.");
    record.account = linkedAccount.id;
  } else if (card && type !== "invoice_payment") {
    record.account = null;
  }
  const kind = type === "refund" ? "expense" : type;
  if (kind === "income" || kind === "expense") {
    if (!record.category && !existing && !own(inputs ?? {}, "category")) {
      record.category = await automaticCategory(
        db,
        ownerId,
        record.description,
        kind,
      );
    }
    await validateCategory(db, ownerId, record.category, kind);
  } else {
    record.category = null;
  }
  record.payment_method ??= card ? "card" : "account";
  if (card?.kind === "credit") {
    const changed =
      !existing ||
      ["occurred_at", "card_id", "type"].some(
        (key) => record[key] !== existing[key],
      );
    const selected =
      own(inputs ?? {}, "invoice_month") &&
      record.invoice_month !== existing?.invoice_month;
    if (
      (changed && type !== "invoice_payment" && !selected) ||
      !record.invoice_month
    ) {
      record.invoice_month =
        type === "invoice_payment"
          ? record.occurred_at.slice(0, 7)
          : invoiceFor(record.occurred_at, card);
    }
  } else {
    record.invoice_month = null;
  }
  return card;
}

async function createTransaction(
  db,
  ownerId,
  parsed,
  { source = "manual", rowId } = {},
) {
  const record = { ...resources.transactions.defaults, ...parsed };
  const card = await validateTransaction(db, ownerId, record, {
    inputs: parsed,
  });
  const count = record.installments ?? 1;
  delete record.installments;
  if (count <= 1) {
    return insert(
      db,
      "transactions",
      ownerId,
      {
        ...record,
        source:
          source === "manual" && record.type === "invoice_payment"
            ? "invoice_payment"
            : source,
        ...rewardFor(record, card),
      },
      rowId,
    );
  }
  if (record.type !== "expense" || record.amount_cents < count) {
    failure(
      400,
      "Parcele apenas despesas com valor suficiente para todas as parcelas.",
    );
  }
  const installmentAmount = Math.floor(record.amount_cents / count);
  const remainingCents = record.amount_cents % count;
  const group = randomUUID();
  await db.execute(
    "INSERT INTO installment_groups (owner_id, id, installments) VALUES (?, ?, ?)",
    [ownerId, group, count],
  );
  let firstId;
  for (let index = 0; index < count; index += 1) {
    const installmentDay = dayInMonth(
      shiftMonth(record.occurred_at, index),
      Number(record.occurred_at.slice(8, 10)),
    );
    const installment = {
      ...record,
      occurred_at: installmentDay + record.occurred_at.slice(10),
      amount_cents: installmentAmount + (index < remainingCents ? 1 : 0),
      installment_group_id: group,
      invoice_month: record.invoice_month
        ? shiftMonth(record.invoice_month, index)
        : null,
      status:
        record.status === "confirmed" && index > 0 && installmentDay > today()
          ? "planned"
          : record.status,
      source: "installment",
    };
    const inserted = await insert(db, "transactions", ownerId, {
      ...installment,
      ...rewardFor(installment, card),
    });
    firstId ??= inserted;
  }
  return firstId;
}

async function createTransfer(db, ownerId, body) {
  const record = parseFields("transactions", body, true);
  if (record.card_id) failure(400, "Use somente contas em uma transferência.");
  if ((record.installments ?? 1) > 1)
    failure(400, "O parcelamento está disponível para despesas.");
  const rowId = randomUUID();
  try {
    await db.execute(
      "CALL sp_registrar_transferencia(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        ownerId,
        rowId,
        record.description ?? null,
        record.account ?? null,
        record.destination_account ?? null,
        record.occurred_at ?? null,
        record.amount_cents ?? null,
        record.status ?? null,
        record.payment_method ?? null,
        record.trip_id ?? null,
      ],
    );
  } catch (error) {
    if (error.sqlState === "45000") failure(400, error.sqlMessage);
    throw error;
  }
  return getOne(db, "transactions", ownerId, rowId);
}

async function matches(
  db,
  resource,
  ownerId,
  conditions,
  includeDeleted = false,
) {
  const where = conditions.map(([column]) => `\`${column}\` = ?`).join(" AND ");
  const config = resources[resource];
  const filter = includeDeleted ? "" : (config.filter ?? "");
  const [rows] = await db.execute(
    `SELECT id FROM \`${resource}\` WHERE \`${ownerColumn(config)}\` = ? AND ${where} ${filter} LIMIT 1`,
    [ownerId, ...conditions.map(([, value]) => value)],
  );
  return rows[0]?.id;
}

const references = {
  accounts: {
    cards: ["linked_account"],
    transactions: ["account", "destination_account"],
    recurring_entries: ["account"],
    reward_redemptions: ["account"],
    notification_app_rules: ["account_id"],
    pending_auto_transactions: ["suggested_account"],
  },
  cards: {
    transactions: ["card_id"],
    recurring_entries: ["card_id"],
    reward_redemptions: ["card_id"],
    notification_app_rules: ["card_id"],
    pending_auto_transactions: ["card_id"],
  },
  categories: {
    transactions: ["category"],
    recurring_entries: ["category"],
    establishment_rules: ["category"],
    notification_app_rules: ["default_category"],
    pending_auto_transactions: ["suggested_category"],
  },
  trips: { transactions: ["trip_id"] },
};

async function allowReferenceChange(
  db,
  resource,
  ownerId,
  rowId,
  includeDeleted = false,
) {
  const dependencies = Object.entries(references[resource] ?? {});
  for (const [table, columns] of dependencies) {
    for (const column of columns) {
      if (
        await matches(db, table, ownerId, [[column, rowId]], includeDeleted)
      ) {
        const currentReference =
          !includeDeleted ||
          (await matches(db, table, ownerId, [[column, rowId]]));
        failure(
          409,
          currentReference
            ? "Este registro está vinculado a outros dados. Remova os vínculos primeiro."
            : "Este registro está vinculado ao histórico de lançamentos excluídos.",
        );
      }
    }
  }
}

async function applyCaptureRules(db, ownerId, record) {
  const [rows] = await db.execute(
    "SELECT action, account_id, card_id, default_category FROM notification_app_rules WHERE owner_id = ? AND source_app = ? LIMIT 1",
    [ownerId, record.source_app],
  );
  const rule = rows[0];
  if (!rule) return;
  if (rule.action === "ignore") {
    record.review_status = "ignored";
    record.ignore_reason ??= "Regra do aplicativo de origem.";
  } else {
    if (rule.account_id) record.suggested_account ??= rule.account_id;
    if (rule.card_id) record.card_id ??= rule.card_id;
    const category =
      rule.default_category &&
      (await linked(
        db,
        "categories",
        ownerId,
        rule.default_category,
        "A categoria padrão",
      ));
    if (category && (!record.type || record.type === category.kind))
      record.suggested_category ??= category.id;
  }
}

async function validateResource(db, resource, ownerId, record, old) {
  required(record, resources[resource].required ?? []);

  switch (resource) {
    case "accounts":
      if (old && record.currency_code !== old.currency_code) {
        await allowReferenceChange(db, resource, ownerId, old.id);
      }
      break;
    case "categories":
      if (old && record.kind !== old.kind)
        await allowReferenceChange(db, resource, ownerId, old.id);
      break;
    case "cards": {
      if (record.kind === "credit")
        required(record, ["closing_day", "due_day"]);
      if (record.kind === "debit") required(record, ["linked_account"]);
      await linked(
        db,
        "accounts",
        ownerId,
        record.linked_account,
        "A conta vinculada",
      );
      if (
        old &&
        (record.kind !== old.kind ||
          (old.kind === "debit" &&
            record.linked_account !== old.linked_account))
      ) {
        await allowReferenceChange(db, resource, ownerId, old.id);
      }
      break;
    }
    case "trips":
      if (record.end_date < record.start_date)
        failure(400, "O fim da viagem deve ser no dia do início ou depois.");
      break;
    case "recurring_entries":
      await validateTransaction(
        db,
        ownerId,
        {
          ...record,
          occurred_at: `${today()} 00:00:00`,
          status: "confirmed",
        },
        { existing: record },
      );
      break;
    case "reward_redemptions":
      await linked(
        db,
        "cards",
        ownerId,
        record.card_id,
        "O cartão selecionado",
      );
      await linked(
        db,
        "accounts",
        ownerId,
        record.account,
        "A conta selecionada",
      );
      break;
    case "installment_labels": {
      const groupExists = await matches(db, "transactions", ownerId, [
        ["installment_group_id", record.group_id],
      ]);
      if (!groupExists) failure(400, "O parcelamento não está disponível.");
      const labelId = await matches(db, resource, ownerId, [
        ["group_id", record.group_id],
      ]);
      if (labelId && labelId !== old?.id)
        failure(409, "Este parcelamento já tem um nome.");
      break;
    }
    case "establishment_rules":
      await validateCategory(db, ownerId, record.category);
      break;
    case "notification_app_rules": {
      const ruleId = await matches(db, resource, ownerId, [
        ["source_app", record.source_app],
      ]);
      if (ruleId && ruleId !== old?.id)
        failure(409, "Já há uma regra para este aplicativo de origem.");
      await linked(
        db,
        "accounts",
        ownerId,
        record.account_id,
        "A conta da regra",
      );
      await linked(db, "cards", ownerId, record.card_id, "O cartão da regra");
      await validateCategory(db, ownerId, record.default_category);
      break;
    }
    case "pending_auto_transactions":
      if (old?.review_status === "accepted")
        failure(409, "Esta captura já foi confirmada.");
      await linked(
        db,
        "accounts",
        ownerId,
        record.suggested_account,
        "A conta sugerida",
      );
      await linked(db, "cards", ownerId, record.card_id, "O cartão sugerido");
      await validateCategory(
        db,
        ownerId,
        record.suggested_category,
        record.type,
      );
      break;
  }
}

async function createRecord(db, resource, user, body) {
  const data = parseFields(resource, body, true);
  if (resource === "transactions") return createTransaction(db, user.id, data);

  if (resource === "pending_auto_transactions" && data.source_app)
    await applyCaptureRules(db, user.id, data);
  await validateResource(db, resource, user.id, data);
  if (resource === "developer_feedback") {
    data.sender_name = user.display_name;
    data.status = "submitted";
    const feedbackId = await insert(db, resource, user.id, data);
    await insert(db, "app_notifications", user.id, {
      kind: "feedback",
      title: "Mensagem registrada",
      message: "Sua mensagem foi registrada na caixa de sugestões do Fluxo.",
      feedback_id: feedbackId,
    });
    return feedbackId;
  }
  return insert(db, resource, user.id, data);
}

async function updateRecord(db, resource, ownerId, rowId, body) {
  const original = await getOne(db, resource, ownerId, rowId);
  const changes = parseFields(resource, body);
  const record = { ...original, ...changes };

  if (resource === "transactions") {
    if (
      own(changes, "installments") &&
      (changes.installments ?? 1) !== (original.installments ?? 1)
    ) {
      failure(400, "A quantidade de parcelas é definida no cadastro.");
    }
    delete changes.installments;
    if (
      !own(changes, "payment_method") &&
      (record.type !== original.type || record.card_id !== original.card_id)
    ) {
      record.payment_method = null;
    }
    const card = await validateTransaction(db, ownerId, record, {
      existing: original,
      inputs: changes,
    });
    Object.assign(changes, {
      account: record.account ?? null,
      category: record.category ?? null,
      payment_method: record.payment_method,
      invoice_month: record.invoice_month,
      version: (original.version ?? 0) + 1,
    });
    if (
      ["type", "card_id", "amount_cents"].some(
        (key) => record[key] !== original[key],
      ) ||
      (original.status !== record.status &&
        [original.status, record.status].includes("review"))
    ) {
      Object.assign(changes, rewardFor(record, card));
    }
  } else {
    await validateResource(db, resource, ownerId, record, original);
  }

  await update(db, resource, ownerId, rowId, changes);
}

async function deleteRecord(db, resource, ownerId, rowId) {
  const record = await getOne(db, resource, ownerId, rowId);
  if (resource === "transactions") {
    await update(db, resource, ownerId, rowId, {
      deleted_at: now(),
      version: (record.version ?? 0) + 1,
    });
    if (
      record.installment_group_id &&
      !(await matches(db, resource, ownerId, [
        ["installment_group_id", record.installment_group_id],
      ]))
    ) {
      await db.execute(
        "DELETE FROM installment_labels WHERE owner_id = ? AND group_id = ?",
        [ownerId, record.installment_group_id],
      );
    }
    return;
  }
  if (resource === "mobile_devices") {
    await db.execute(
      "UPDATE mobile_devices SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE owner_id = ? AND id = ?",
      [ownerId, rowId],
    );
    await db.execute(
      "UPDATE push_subscriptions SET active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE owner_id = ? AND device_id = ?",
      [ownerId, record.device_id],
    );
    return;
  }
  if (resource === "accounts" && record.fixed)
    failure(409, "Desmarque a proteção da conta antes de excluí-la.");
  if (
    resource === "pending_auto_transactions" &&
    record.review_status === "accepted"
  ) {
    failure(409, "Esta captura está vinculada a um lançamento confirmado.");
  }
  await allowReferenceChange(
    db,
    resource,
    ownerId,
    rowId,
    resource === "accounts" || resource === "categories",
  );
  await db.execute(
    `DELETE FROM \`${resource}\` WHERE \`${ownerColumn(resources[resource])}\` = ? AND id = ?`,
    [ownerId, rowId],
  );
}

function entryId(...parts) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

async function confirmRecurrence(db, ownerId, rowId, value) {
  const recurrence = await getOne(db, "recurring_entries", ownerId, rowId);
  const transactionId = entryId("recurrence", ownerId, rowId, value);
  const existing = await getOne(
    db,
    "transactions",
    ownerId,
    transactionId,
    true,
  );
  if (existing) return transactionId;
  if (!recurrence.active)
    failure(409, "Ative a recorrência antes de confirmar.");
  if (
    recurrence.last_confirmed_month === value ||
    (await transactionWasDeleted(db, ownerId, transactionId))
  ) {
    failure(409, "Esta competência já foi confirmada.");
  }
  const details = recurrenceDetails(recurrence, value);
  await createTransaction(
    db,
    ownerId,
    {
      description: recurrence.description,
      account: recurrence.account,
      card_id: recurrence.card_id,
      category: recurrence.category,
      type: recurrence.type,
      payment_method: recurrence.payment_method,
      ...details,
    },
    { source: "recurrence", rowId: transactionId },
  );

  const latest = recurrence.last_confirmed_month ?? "";
  if (value > latest) {
    await update(db, "recurring_entries", ownerId, rowId, {
      last_confirmed_month: value,
    });
  }
  return transactionId;
}

async function transactionWasDeleted(db, ownerId, rowId) {
  const [rows] = await db.execute(
    "SELECT id FROM transactions WHERE owner_id = ? AND id = ? AND deleted_at IS NOT NULL",
    [ownerId, rowId],
  );
  return rows.length > 0;
}

async function confirmCapture(db, ownerId, rowId) {
  const capture = await getOne(db, "pending_auto_transactions", ownerId, rowId);
  const transactionId = entryId("capture", ownerId, rowId);
  if (capture.review_status === "accepted") {
    if (await getOne(db, "transactions", ownerId, transactionId, true))
      return transactionId;
    failure(409, "Esta captura já foi confirmada.");
  }
  if (capture.review_status === "ignored")
    failure(409, "Reabra a captura antes de confirmar.");
  await createTransaction(
    db,
    ownerId,
    {
      description: capture.description,
      type: capture.type,
      amount_cents: capture.amount_cents,
      occurred_at: capture.occurred_at,
      category: capture.suggested_category,
      account: capture.suggested_account,
      card_id: capture.card_id,
      source_app: capture.source_app,
      raw_text: capture.raw_text,
      confidence: capture.confidence,
      auto_imported: 1,
      review_status: "accepted",
    },
    { source: "capture", rowId: transactionId },
  );
  await update(db, "pending_auto_transactions", ownerId, rowId, {
    review_status: "accepted",
    ignore_reason: null,
  });
  return transactionId;
}

export function financeRouter(db) {
  const router = Router();

  router.get("/data", async (req, res) => {
    const data = await Promise.all(
      Object.keys(resources).map(async (resource) => [
        resource,
        await getRows(db, resource, req.user.id),
      ]),
    );
    res.json(Object.fromEntries(data));
  });

  router.post("/recurring_entries/:id/confirm", async (req, res) => {
    const value = month(req.body?.month);
    const row = await atomic(db, req.user.id, async (connection) => {
      const transactionId = await confirmRecurrence(
        connection,
        req.user.id,
        id(req.params.id),
        value,
      );
      return getOne(connection, "transactions", req.user.id, transactionId);
    });
    res.json(row);
  });

  router.post("/pending_auto_transactions/:id/confirm", async (req, res) => {
    const row = await atomic(db, req.user.id, async (connection) => {
      const transactionId = await confirmCapture(
        connection,
        req.user.id,
        id(req.params.id),
      );
      return getOne(connection, "transactions", req.user.id, transactionId);
    });
    res.json(row);
  });

  router.post("/:resource", async (req, res) => {
    const { resource } = req.params;
    getResource(resource, "create");
    if (resource === "transactions" && req.body?.type === "transfer") {
      return res
        .status(201)
        .json(await createTransfer(db, req.user.id, req.body));
    }
    const row = await atomic(db, req.user.id, async (connection, user) => {
      const rowId = await createRecord(connection, resource, user, req.body);
      return getOne(connection, resource, user.id, rowId);
    });
    res.status(201).json(row);
  });

  const edit = async (req, res) => {
    const { resource } = req.params;
    getResource(resource, "update");
    const rowId = id(req.params.id);
    const row = await atomic(db, req.user.id, async (connection, user) => {
      await updateRecord(connection, resource, user.id, rowId, req.body);
      return getOne(connection, resource, user.id, rowId);
    });
    res.json(row);
  };
  router.put("/:resource/:id", edit);
  router.patch("/:resource/:id", edit);

  router.delete("/:resource/:id", async (req, res) => {
    const { resource } = req.params;
    getResource(resource, "delete");
    await atomic(db, req.user.id, (connection, user) =>
      deleteRecord(connection, resource, user.id, id(req.params.id)),
    );
    res.sendStatus(204);
  });

  return router;
}
