import {
  options,
  type FieldSpec,
  type Fields,
  type Option,
  type Row,
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
  { name: "name", label: "Nome", required: true, maxLength: 255 },
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
  { name: "name", label: "Nome", required: true, maxLength: 255 },
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

export function cardFields(data: Record<string, Row[]>): Fields {
  return (draft) => {
    const credit = (draft?.kind ?? "credit") === "credit";
    const reward = draft?.reward_mode ?? "none";
    const points = reward === "points" || reward === "both";
    return [
      { name: "name", label: "Nome", required: true, maxLength: 255 },
      {
        name: "kind",
        label: "Tipo de cartão",
        kind: "select",
        options: labels(cardTypes),
        required: true,
        defaultValue: "credit",
      },
      { name: "brand", label: "Bandeira", maxLength: 255 },
      { name: "last4", label: "Últimos quatro dígitos", maxLength: 4 },
      {
        name: "linked_account",
        label: "Conta vinculada",
        kind: "select",
        options: options(data.accounts),
        required: !credit,
      },
      { name: "limit_cents", label: "Limite", kind: "money", hidden: !credit },
      {
        name: "closing_day",
        label: "Dia de fechamento",
        kind: "integer",
        min: 1,
        max: 31,
        required: credit,
        hidden: !credit,
      },
      {
        name: "due_day",
        label: "Dia de vencimento",
        kind: "integer",
        min: 1,
        max: 31,
        required: credit,
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

export function transactionFields(data: Record<string, Row[]>): Fields {
  return (draft) => {
    const type = draft?.type ?? "expense";
    const allowsCard = ["expense", "refund", "invoice_payment"].includes(
      String(type),
    );
    const isPayment = type === "invoice_payment";
    const card = allowsCard
      ? data.cards.find((row) => row.id === draft?.card_id)
      : undefined;
    const usesAccount = !card || isPayment;
    const categoryKind = type === "refund" ? "expense" : type;
    const categoryOptions = options(
      data.categories.filter((row) => row.kind === categoryKind),
    );
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
        options: labels(transactionTypes),
        defaultValue: "expense",
        required: true,
      },
      { name: "amount_cents", label: "Valor", kind: "money", required: true },
      {
        name: "occurred_at",
        label: "Data",
        kind: "date",
        defaultValue: today(),
        required: true,
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
        name: "category",
        label: "Categoria",
        kind: "select",
        options: categoryOptions,
        omitBlank: true,
        hidden: type === "transfer" || isPayment,
        hint: "Em branco, aplica a regra do estabelecimento quando houver.",
      },
      {
        name: "card_id",
        label: "Cartão",
        kind: "select",
        options: options(
          data.cards.filter((row) => !isPayment || row.kind === "credit"),
        ),
        hidden: !allowsCard,
        required: isPayment,
      },
      {
        name: "account",
        label: type === "transfer" ? "Conta de origem" : "Conta",
        kind: "select",
        options: options(
          data.accounts.filter(
            (row) => !isPayment || row.currency_code === "BRL",
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
          data.accounts.filter((row) => row.id !== draft?.account),
        ),
        required: type === "transfer",
        hidden: type !== "transfer",
      },
      {
        name: "trip_id",
        label: "Viagem",
        kind: "select",
        options: options(data.trips),
        hidden: type === "transfer" || isPayment,
      },
      {
        name: "invoice_month",
        label: "Mês da fatura",
        kind: "month",
        defaultValue: isPayment ? today().slice(0, 7) : undefined,
        hidden: !isPayment && card?.kind !== "credit",
      },
      ...(!draft?.id && type === "expense"
        ? [
            {
              name: "installments",
              label: "Quantidade de parcelas",
              kind: "integer" as const,
              min: 1,
              max: 120,
              defaultValue: 1,
              hint: "Informe o valor total da compra acima.",
              required: true,
            },
          ]
        : []),
    ];
  };
}

export function recurringFields(data: Record<string, Row[]>): Fields {
  return (draft) => {
    const type = draft?.type ?? "expense";
    const card = type === "expense" && Boolean(draft?.card_id);
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
        options: labels(categoryTypes),
        defaultValue: "expense",
        required: true,
      },
      {
        name: "amount_cents",
        label: "Valor-base",
        kind: "money",
        required: true,
      },
      {
        name: "day_of_month",
        label: "Dia do mês",
        kind: "integer",
        min: 1,
        max: 31,
        required: true,
      },
      {
        name: "category",
        label: "Categoria",
        kind: "select",
        options: options(data.categories.filter((row) => row.kind === type)),
      },
      {
        name: "card_id",
        label: "Cartão",
        kind: "select",
        options: options(data.cards),
        hidden: type === "income",
      },
      {
        name: "account",
        label: "Conta",
        kind: "select",
        options: options(data.accounts),
        required: !card,
        hidden: card,
      },
      {
        name: "calculation_mode",
        label: "Cálculo",
        kind: "select",
        defaultValue: "fixed",
        required: true,
        options: labels({
          fixed: "Valor fixo",
          per_business_day: "Valor por dia útil",
        }),
      },
      {
        name: "schedule_mode",
        label: "Agenda",
        kind: "select",
        defaultValue: "day_of_month",
        required: true,
        options: labels({
          day_of_month: "Dia do mês",
          business_day_of_month: "Dia útil do mês",
        }),
      },
      {
        name: "date_adjustment",
        label: "Ajuste de data",
        kind: "select",
        options: adjustments,
        defaultValue: "none",
      },
      {
        name: "active",
        label: "Compromisso ativo",
        kind: "checkbox",
        defaultValue: true,
      },
    ];
  };
}
