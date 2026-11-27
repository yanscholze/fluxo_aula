import {
  options,
  type FieldSpec,
  type Fields,
  type Option,
  type Records,
} from "./records";

export const accountTypes = {
  checking: "Conta corrente",
  savings: "Poupança",
  cash: "Dinheiro",
  benefit: "Benefício",
  investment: "Investimento",
};
export const transactionTypes = {
  income: "Receita",
  expense: "Despesa",
  transfer: "Transferência",
  invoice_payment: "Pagamento de fatura",
  refund: "Estorno",
};
export const transactionStatuses = {
  confirmed: "Confirmado",
  planned: "Planejado",
  review: "Em revisão",
};
export const categoryTypes = { income: "Receita", expense: "Despesa" };
export const cardTypes = { credit: "Crédito", debit: "Débito" };

export function labels(values: Record<string, string>): Option[] {
  return Object.entries(values).map(([value, label]) => ({ value, label }));
}
export function labelOf(values: Record<string, string>, key: unknown) {
  return values[String(key)] ?? String(key || "—");
}

export const today = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
  }).format(new Date());

export function longDate(value: unknown) {
  return (
    String(value || "")
      .slice(0, 10)
      .split("-")
      .reverse()
      .join("/") || "—"
  );
}

const currency: FieldSpec = {
  name: "currency_code",
  label: "Moeda",
  maxLength: 3,
  required: true,
  defaultValue: "BRL",
  hint: "Use o código da moeda, como BRL, USD ou EUR.",
};
const color: FieldSpec = {
  name: "color",
  label: "Cor",
  maxLength: 7,
  hint: "Código hexadecimal opcional, como #518FF1.",
};
const adjustments = labels({
  none: "Sem ajuste",
  previous: "Dia útil anterior",
  next: "Próximo dia útil",
});

export const accountFields: FieldSpec[] = [
  { name: "name", label: "Nome da conta", required: true, maxLength: 255 },
  {
    name: "kind",
    label: "Tipo de conta",
    kind: "select",
    options: labels(accountTypes),
    defaultValue: "checking",
    required: true,
  },
  { name: "institution", label: "Instituição", maxLength: 255 },
  currency,
  {
    name: "balance_cents",
    label: "Saldo inicial",
    kind: "money",
    defaultValue: "0,00",
    required: true,
  },
  { name: "goal_cents", label: "Meta de saldo", kind: "money" },
  {
    name: "monthly_yield_basis_points",
    label: "Rendimento mensal (%)",
    kind: "decimal",
    scale: 2,
  },
  color,
  { name: "fixed", label: "Conta fixa", kind: "checkbox" },
  {
    name: "exclude_from_totals",
    label: "Excluir do total de saldos",
    kind: "checkbox",
  },
];

export const categoryFields: FieldSpec[] = [
  { name: "name", label: "Nome da categoria", required: true, maxLength: 255 },
  {
    name: "kind",
    label: "Tipo de categoria",
    kind: "select",
    options: labels(categoryTypes),
    required: true,
    defaultValue: "expense",
  },
  color,
  { name: "essential", label: "Categoria essencial", kind: "checkbox" },
];

export function cardFields(data: Records): Fields {
  return (draft) => {
    const credit = (draft?.kind ?? "credit") === "credit";
    const reward = draft?.reward_mode ?? "none";
    const points = reward === "points" || reward === "both";
    return [
      { name: "name", label: "Nome do cartão", required: true, maxLength: 255 },
      {
        name: "kind",
        label: "Tipo de cartão",
        kind: "select",
        options: labels(cardTypes),
        required: true,
        defaultValue: "credit",
      },
      { name: "brand", label: "Bandeira", maxLength: 255 },
      { name: "tier", label: "Categoria do cartão", maxLength: 255 },
      { name: "last4", label: "Últimos quatro dígitos", maxLength: 4 },
      {
        name: "linked_account",
        label: "Conta vinculada",
        kind: "select",
        options: options(data.accounts),
        required: !credit,
      },
      {
        name: "limit_cents",
        label: "Limite",
        kind: "money",
        min: 0,
        hidden: !credit,
      },
      {
        name: "closing_day",
        label: "Dia de fechamento",
        kind: "integer",
        min: 1,
        max: 31,
        hidden: !credit,
      },
      {
        name: "due_day",
        label: "Dia de vencimento",
        kind: "integer",
        min: 1,
        max: 31,
        hidden: !credit,
      },
      {
        name: "due_adjustment",
        label: "Ajuste de vencimento",
        kind: "select",
        options: adjustments,
        defaultValue: "none",
        hidden: !credit,
      },
      {
        name: "reward_mode",
        label: "Tipo de recompensa",
        kind: "select",
        defaultValue: "none",
        options: labels({
          none: "Sem recompensas",
          points: "Pontos",
          cashback: "Cashback",
          both: "Pontos e cashback",
        }),
      },
      {
        name: "points_per_dollar_milli",
        label: "Pontos por dólar",
        kind: "decimal",
        scale: 3,
        min: 0,
        hidden: !points,
      },
      {
        name: "manual_usd_rate_micros",
        label: "Cotação do dólar em reais",
        kind: "decimal",
        scale: 6,
        hidden: !points,
      },
      {
        name: "points_goal",
        label: "Meta de pontos",
        kind: "integer",
        min: 0,
        hidden: !points,
      },
      {
        name: "cashback_basis_points",
        label: "Cashback (%)",
        kind: "decimal",
        scale: 2,
        min: 0,
        max: 100,
        hidden: reward !== "cashback" && reward !== "both",
      },
      color,
      { name: "is_favorite", label: "Cartão favorito", kind: "checkbox" },
    ];
  };
}

export function transactionFields(data: Records): Fields {
  return (draft) => {
    const type = draft.type ?? "expense";
    const transfer = type === "transfer";
    const payment = type === "invoice_payment";
    const acceptsCard = type === "expense" || type === "refund" || payment;
    const cards = data.cards.filter((row) => !payment || row.kind === "credit");
    const card = acceptsCard
      ? cards.find((row) => row.id === draft.card_id)
      : undefined;
    const usesAccount = !card || payment;
    const source = data.accounts.find((row) => row.id === draft.account);
    const categoryKind = type === "refund" ? "expense" : type;
    const canInstall = type === "expense" && !draft.id;
    return [
      {
        name: "description",
        label: "Descrição",
        required: true,
        maxLength: 255,
      },
      {
        name: "type",
        label: "Tipo",
        kind: "select",
        options: labels(
          draft.installment_group_id
            ? { expense: "Despesa" }
            : transactionTypes,
        ),
        defaultValue: "expense",
        required: true,
      },
      {
        name: "occurred_at",
        label: "Data",
        kind: "date",
        defaultValue: today(),
        required: true,
      },
      {
        name: "amount_cents",
        label: "Valor",
        kind: "money",
        min: 0.01,
        required: true,
        hint:
          canInstall && Number(draft.installments) > 1
            ? "Informe o valor total da compra."
            : undefined,
      },
      {
        name: "status",
        label: "Situação",
        kind: "select",
        options: labels(transactionStatuses),
        defaultValue: "confirmed",
        required: true,
      },
      {
        name: "card_id",
        label: "Cartão",
        kind: "select",
        options: options(cards),
        hidden: !acceptsCard,
        required: payment,
      },
      {
        name: "account",
        label: transfer ? "Conta de origem" : "Conta",
        kind: "select",
        options: options(
          data.accounts.filter(
            (row) => !payment || (row.currency_code ?? "BRL") === "BRL",
          ),
        ),
        required: usesAccount,
        hidden: !usesAccount,
      },
      {
        name: "destination_account",
        label: "Conta de destino",
        kind: "select",
        options: options(
          data.accounts.filter(
            (row) =>
              row.id !== draft.account &&
              (!source ||
                (row.currency_code ?? "BRL") ===
                  (source.currency_code ?? "BRL")),
          ),
        ),
        required: transfer,
        hidden: !transfer,
      },
      {
        name: "category",
        label: "Categoria",
        kind: "select",
        options: options(
          data.categories.filter(({ kind }) => kind === categoryKind),
        ),
        hidden: transfer || payment,
      },
      {
        name: "invoice_month",
        label: "Competência da fatura",
        kind: "month",
        hint: "Se ficar em branco, o Fluxo calcula o mês.",
        hidden: card?.kind !== "credit",
      },
      ...(canInstall
        ? [
            {
              name: "installments",
              label: "Número de parcelas",
              kind: "integer" as const,
              defaultValue: "1",
              min: 1,
              max: 120,
              required: true,
            },
          ]
        : []),
    ];
  };
}
