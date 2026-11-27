import { Router } from "express";
import { repository, resources } from "./repository.mjs";

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function text(label, maximum = 255, pattern) {
  return (value) => {
    if (typeof value !== "string" || value.trim().length > maximum || (pattern && !pattern.test(value.trim()))) {
      fail(400, `Preencha ${label} com um texto válido.`);
    }
    return value.trim();
  };
}

function integer(label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return (value) => {
    const number = typeof value === "string" && /^-?\d+$/.test(value) ? Number(value) : value;
    if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
      fail(400, `Informe um valor válido para ${label}.`);
    }
    return number;
  };
}

function oneOf(label, ...values) {
  return (value) => {
    if (!values.includes(value)) fail(400, `Selecione uma opção válida para ${label}.`);
    return value;
  };
}

function boolean(value) {
  if (value === true || value === 1) return 1;
  if (value === false || value === 0) return 0;
  fail(400, "Informe um valor verdadeiro ou falso.");
}

const monthPattern = /^[1-9]\d{3}-(0[1-9]|1[0-2])$/;

function occurredAt(value) {
  const parts = typeof value === "string" && value.match(
    /^([1-9]\d{3}-\d{2}-\d{2})(?:[T ]([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?)?$/,
  );
  if (!parts) fail(400, "Informe uma data válida.");
  const [, day, hours = "00", minutes = "00", seconds = "00"] = parts;
  const parsed = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== day) {
    fail(400, "Informe uma data válida.");
  }
  return `${day} ${hours}:${minutes}:${seconds}`;
}

const id = text("o vínculo do registro", 64);
const color = text("a cor", 7, /^#[0-9a-f]{6}$/i);
const dayOfMonth = integer("o dia do mês", 1, 31);
const incomeOrExpense = oneOf("o tipo", "income", "expense");
const amount = integer("o valor em centavos", 1);

const forms = {
  accounts: {
    fields: {
      name: text("o nome"), institution: text("a instituição"),
      currency_code: (value) => text("a moeda", 3, /^[a-z]{3}$/i)(value).toUpperCase(),
      kind: oneOf("o tipo de conta", "checking", "savings", "cash", "benefit", "investment"),
      balance_cents: integer("o saldo inicial", -Number.MAX_SAFE_INTEGER), goal_cents: integer("a meta"),
      monthly_yield_basis_points: integer("o rendimento mensal", -10000, 2147483647),
      fixed: boolean, exclude_from_totals: boolean, color,
    },
    required: ["name", "kind"],
    defaults: { currency_code: "BRL", balance_cents: 0, fixed: 0, exclude_from_totals: 0 },
  },
  categories: {
    fields: { name: text("o nome"), kind: incomeOrExpense, color, icon: text("o ícone"), essential: boolean },
    required: ["name", "kind"],
    defaults: { essential: 0 },
  },
  cards: {
    fields: {
      name: text("o nome"), kind: oneOf("o tipo de cartão", "credit", "debit"), linked_account: id,
      brand: text("a bandeira"), tier: text("a modalidade"), last4: text("os quatro últimos dígitos", 4, /^\d{4}$/),
      limit_cents: integer("o limite"), closing_day: dayOfMonth, due_day: dayOfMonth,
      due_adjustment: oneOf("o ajuste de vencimento", "none", "previous", "next"),
      points_per_dollar_milli: integer("os pontos por dólar"), cashback_basis_points: integer("o cashback", 0, 10000),
      reward_mode: oneOf("a recompensa", "none", "points", "cashback", "both"),
      points_goal: integer("a meta de pontos", 0, 2147483647),
      manual_usd_rate_micros: integer("a cotação do dólar", 1), color,
      image_data: text("a imagem", 300000, /^data:image\/(?:jpeg|png|webp|gif);base64,[a-z0-9+/=]+$/i),
      is_favorite: boolean, sort_order: integer("a ordem", 0, 2147483647),
    },
    required: ["name", "kind"],
    defaults: { due_adjustment: "none", reward_mode: "none", is_favorite: 0, sort_order: 0 },
  },
  transactions: {
    fields: {
      description: text("a descrição"), category: id, account: id, destination_account: id,
      occurred_at: occurredAt, amount_cents: amount,
      type: oneOf("o tipo", "income", "expense", "transfer", "refund", "invoice_payment"),
      installments: integer("o total de parcelas", 1, 120),
      status: oneOf("a situação", "confirmed", "planned", "review"),
      payment_method: text("o meio de pagamento"), card_id: id,
      invoice_month: text("a competência", 7, monthPattern),
    },
    required: ["description", "occurred_at", "amount_cents", "type", "status"],
    defaults: { installments: 1, status: "confirmed" },
  },
};

const labels = {
  name: "o nome", kind: "o tipo", description: "a descrição", type: "o tipo", status: "a situação",
  occurred_at: "a data", amount_cents: "o valor", account: "a conta", linked_account: "a conta vinculada",
  destination_account: "a conta de destino", card_id: "o cartão de crédito",
};

function requireFields(record, fields) {
  const missing = fields.find((key) => record[key] == null);
  if (missing) fail(400, `Preencha ${labels[missing]}.`);
}

function readForm(resource, input, create = false) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail(400, "Envie os dados do formulário.");
  const { fields, defaults } = forms[resource];
  const result = create ? { ...defaults } : {};
  for (const [key, parse] of Object.entries(fields)) {
    if (!Object.hasOwn(input, key)) continue;
    const value = input[key];
    result[key] = value == null || (typeof value === "string" && value.trim() === "") ? null : parse(value);
  }
  return result;
}

async function findLinked(records, resource, id, label) {
  if (id == null) return null;
  const row = await records.find(resource, id);
  if (!row) fail(400, `${label} não está disponível.`);
  return row;
}

async function atomic(db, ownerId, work) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    // A procedure de transferência também serializa as escritas pelo usuário.
    const [[owner]] = await conn.execute("SELECT id FROM users WHERE id = ? FOR UPDATE", [ownerId]);
    if (!owner) fail(401, "Entre para acessar seus dados.");
    const result = await work(repository(conn, owner.id));
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

const dateFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", dateStyle: "short" });

function shiftMonth(value, offset) {
  const [year, month] = value.slice(0, 7).split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
  if (!monthPattern.test(result)) fail(400, "A competência ficou fora do intervalo permitido.");
  return result;
}

function installmentDate(value, offset) {
  const month = shiftMonth(value, offset);
  const [year, number] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const day = Math.min(Number(value.slice(8, 10)), days);
  return `${month}-${String(day).padStart(2, "0")}${value.slice(10)}`;
}

function invoiceMonth(date, closingDay) {
  const afterClosing = closingDay && Number(date.slice(8, 10)) > closingDay;
  return afterClosing ? shiftMonth(date, 1) : date.slice(0, 7);
}

function cardRewards(record, card) {
  let rewardPoints = null;
  let rewardCashback = null;
  let usdRate = null;
  if (card && record.type === "expense" && record.status !== "review") {
    const cents = BigInt(record.amount_cents);
    if (["points", "both"].includes(card.reward_mode) && card.points_per_dollar_milli && card.manual_usd_rate_micros) {
      const denominator = 100n * BigInt(card.manual_usd_rate_micros);
      const numerator = cents * BigInt(card.points_per_dollar_milli) * 1000000n;
      rewardPoints = integer("os pontos calculados")(Number((numerator + denominator / 2n) / denominator));
      usdRate = card.manual_usd_rate_micros;
    }
    if (["cashback", "both"].includes(card.reward_mode) && card.cashback_basis_points) {
      rewardCashback = integer("o cashback calculado")(Number((cents * BigInt(card.cashback_basis_points) + 5000n) / 10000n));
    }
  }
  return { reward_points_milli: rewardPoints, reward_cashback_cents: rewardCashback, reward_usd_rate_micros: usdRate };
}

async function validateTransaction(records, record, previous) {
  requireFields(record, forms.transactions.required);
  const account = await findLinked(records, "accounts", record.account, "A conta");
  const destination = await findLinked(records, "accounts", record.destination_account, "A conta de destino");
  const card = await findLinked(records, "cards", record.card_id, "O cartão");
  const type = record.type;

  if (type === "transfer") {
    requireFields(record, ["account", "destination_account"]);
    if (account.id === destination.id) fail(400, "Escolha contas diferentes para transferir.");
    if ((account.currency_code ?? "BRL") !== (destination.currency_code ?? "BRL")) {
      fail(400, "As contas precisam usar a mesma moeda.");
    }
    if (card) fail(400, "Use contas para registrar transferências.");
  } else if (type === "invoice_payment") {
    requireFields(record, ["account", "card_id"]);
    if (card.kind !== "credit") fail(400, "Selecione um cartão de crédito para a fatura.");
    if ((account.currency_code ?? "BRL") !== "BRL") fail(400, "Pague a fatura com uma conta em reais.");
  } else if (!card || type === "income") {
    requireFields(record, ["account"]);
    if (card) fail(400, "Use uma conta para registrar receitas.");
  }

  if (type !== "transfer" && destination) fail(400, "Use uma conta de destino apenas em transferências.");
  const categoryKind = type === "refund" ? "expense" : type;
  const category = ["income", "expense"].includes(categoryKind)
    ? await findLinked(records, "categories", record.category, "A categoria")
    : null;
  if (category && category.kind !== categoryKind) fail(400, "Escolha uma categoria do mesmo tipo do lançamento.");

  let accountId = account?.id ?? null;
  if (card?.kind === "debit") {
    if (!card.linked_account) fail(400, "Vincule uma conta ao cartão de débito.");
    const debitAccount = await findLinked(records, "accounts", card.linked_account, "A conta vinculada");
    if (account && account.id !== debitAccount.id) fail(400, "Use a conta vinculada ao cartão de débito.");
    accountId = debitAccount.id;
  } else if (card && type !== "invoice_payment") {
    accountId = null;
  }

  let competence = record.invoice_month;
  if (card?.kind === "credit") {
    const changed = previous && (previous.card_id !== card.id || previous.occurred_at !== record.occurred_at);
    if (!competence || (type !== "invoice_payment" && changed && competence === previous.invoice_month)) {
      competence = type === "invoice_payment" ? record.occurred_at.slice(0, 7) : invoiceMonth(record.occurred_at, card.closing_day);
    }
  } else {
    competence = null;
  }
  const paymentMethod = record.payment_method ?? (card && type !== "invoice_payment" ? "card" : "account");
  Object.assign(record, {
    account: accountId, destination_account: destination?.id ?? null, category: category?.id ?? null,
    card_id: card?.id ?? null, invoice_month: competence, payment_method: paymentMethod,
  });
  return card;
}

async function createExpenseOrIncome(records, record) {
  const count = record.installments ?? 1;
  delete record.installments;
  const card = await validateTransaction(records, record);
  if (count === 1) {
    const source = record.type === "invoice_payment" ? "invoice_payment" : "manual";
    return records.insert("transactions", { ...record, source, ...cardRewards(record, card) });
  }
  if (record.type !== "expense" || record.amount_cents < count) {
    fail(400, "Informe uma despesa com valor suficiente para todas as parcelas.");
  }

  const group = await records.insert("installment_groups", { installments: count });
  const centsPerInstallment = Math.floor(record.amount_cents / count);
  const remainder = record.amount_cents % count;
  const today = dateFormat.format(new Date());
  let first;
  for (let index = 0; index < count; index += 1) {
    const date = installmentDate(record.occurred_at, index);
    const future = index > 0 && date.slice(0, 10) > today;
    const entry = {
      ...record,
      installment_group_id: group,
      amount_cents: centsPerInstallment + (index < remainder ? 1 : 0),
      occurred_at: date,
      invoice_month: record.invoice_month ? shiftMonth(record.invoice_month, index) : null,
      status: record.status === "confirmed" && future ? "planned" : record.status,
      source: "installment",
    };
    const rowId = await records.insert("transactions", { ...entry, ...cardRewards(entry, card) });
    first ??= rowId;
  }
  return first;
}

const references = {
  accounts: [["cards", "linked_account"], ["transactions", "account"], ["transactions", "destination_account"]],
  categories: [["transactions", "category"]],
  cards: [["transactions", "card_id"]],
};

async function validateRecord(records, resource, record, previous) {
  requireFields(record, forms[resource].required);
  if (resource === "cards") {
    if (record.kind === "debit") requireFields(record, ["linked_account"]);
    const account = await findLinked(records, "accounts", record.linked_account, "A conta vinculada");
    if (account) record.linked_account = account.id;
  }
  if (!previous) return;
  const changesMeaning = (resource === "accounts" && record.currency_code !== previous.currency_code)
    || (resource === "categories" && record.kind !== previous.kind)
    || (resource === "cards" && (
      record.kind !== previous.kind || (record.kind === "debit" && record.linked_account !== previous.linked_account)
    ));
  if (!changesMeaning) return;
  for (const [table, column] of references[resource]) {
    if (await records.hasReference(table, column, previous.id)) {
      fail(409, "Há registros vinculados a esse cadastro. As movimentações existentes dependem do valor atual.");
    }
  }
}

function writableResource(resource) {
  if (!Object.hasOwn(forms, resource)) fail(404, "Recurso não encontrado.");
}

async function createTransfer(db, ownerId, data) {
  if ((data.installments ?? 1) > 1) fail(400, "O parcelamento está disponível para despesas.");
  if (data.card_id) fail(400, "Use contas para registrar transferências.");
  requireFields(data, forms.transactions.required);
  return repository(db, ownerId).transfer(data);
}

async function editTransaction(records, original, changes) {
  if (Object.hasOwn(changes, "installments") && (changes.installments ?? 1) !== original.installments) {
    fail(400, "A quantidade de parcelas é definida no cadastro.");
  }
  delete changes.installments;
  const record = { ...original, ...changes };
  if (original.installment_group_id && record.type !== "expense") {
    fail(400, "Uma parcela mantém o tipo de despesa.");
  }
  const card = await validateTransaction(records, record, original);
  Object.assign(changes, {
    account: record.account, destination_account: record.destination_account, category: record.category,
    card_id: record.card_id, invoice_month: record.invoice_month, payment_method: record.payment_method,
  });
  if (["type", "card_id", "amount_cents"].some((key) => record[key] !== original[key])
      || (record.status !== original.status && [record.status, original.status].includes("review"))) {
    Object.assign(changes, cardRewards(record, card));
  }
  await records.update("transactions", original.id, changes);
}

export function financeRouter(db) {
  const router = Router();

  router.get("/data", async (req, res) => {
    const records = repository(db, req.user.id);
    const entries = await Promise.all(Object.keys(resources).map(async (resource) => [resource, await records.list(resource)]));
    res.json(Object.fromEntries(entries));
  });

  router.post("/:resource", async (req, res) => {
    const { resource } = req.params;
    writableResource(resource);
    const data = readForm(resource, req.body, true);
    if (resource === "transactions" && data.type === "transfer") {
      return res.status(201).json(await createTransfer(db, req.user.id, data));
    }
    const row = await atomic(db, req.user.id, async (records) => {
      let rowId;
      if (resource === "transactions") {
        rowId = await createExpenseOrIncome(records, data);
      } else {
        await validateRecord(records, resource, data);
        rowId = await records.insert(resource, data);
      }
      return records.find(resource, rowId);
    });
    res.status(201).json(row);
  });

  router.put("/:resource/:id", async (req, res) => {
    const { resource } = req.params;
    writableResource(resource);
    const changes = readForm(resource, req.body);
    const row = await atomic(db, req.user.id, async (records) => {
      const original = await records.find(resource, id(req.params.id));
      if (!original) fail(404, "Registro não encontrado.");
      if (resource === "transactions") {
        await editTransaction(records, original, changes);
      } else {
        const record = { ...original, ...changes };
        await validateRecord(records, resource, record, original);
        if (Object.hasOwn(changes, "linked_account")) changes.linked_account = record.linked_account;
        await records.update(resource, original.id, changes);
      }
      return records.find(resource, original.id);
    });
    res.json(row);
  });

  router.delete("/:resource/:id", async (req, res) => {
    const { resource } = req.params;
    writableResource(resource);
    await atomic(db, req.user.id, async (records) => {
      const rowId = id(req.params.id);
      if (resource === "accounts" && (await records.find(resource, rowId))?.fixed) {
        fail(409, "Desmarque a opção de conta fixa antes de excluir.");
      }
      if (!(await records.remove(resource, rowId))) fail(404, "Registro não encontrado.");
    });
    res.sendStatus(204);
  });

  router.use((error, _req, _res, next) => {
    if (error.sqlState === "45000") {
      return next(Object.assign(new Error(error.sqlMessage), { status: 400 }));
    }
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return next(Object.assign(new Error("O cadastro está vinculado a movimentações ou cartões."), { status: 409 }));
    }
    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      return next(Object.assign(new Error("Um dos registros vinculados não está disponível."), { status: 400 }));
    }
    return next(error);
  });

  return router;
}
