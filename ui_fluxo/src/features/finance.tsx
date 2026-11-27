import { useState } from "react";
import { Link } from "react-router";
import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import { Badge, Button, Field, Metric, PageHeading } from "../design-system/ui";
import {
  accountFields,
  categoryFields,
  accountTypes,
  labelOf,
  labels,
  longDate,
  today,
  transactionFields,
  transactionStatuses,
  transactionTypes,
} from "./finance-fields";
import {
  formatAmount,
  options,
  RecordList,
  recordName,
  useRecords,
  type Column,
  type Records,
  type Row,
} from "./records";

function accountBalances(accounts: Row[], transactions: Row[]) {
  const balances = new Map(
    accounts.map((row) => [row.id, Number(row.balance_cents)]),
  );
  const currentDate = today();
  for (const row of transactions) {
    if (
      row.status !== "confirmed" ||
      String(row.occurred_at).slice(0, 10) > currentDate
    )
      continue;
    const account = String(row.account);
    if (balances.has(account))
      balances.set(
        account,
        (balances.get(account) ?? 0) + Number(row.valor_origem_centavos),
      );
    if (row.type === "transfer") {
      const destination = String(row.destination_account);
      balances.set(
        destination,
        (balances.get(destination) ?? 0) + Number(row.amount_cents),
      );
    }
  }
  return balances;
}

function typeBadge(type: Row[string]) {
  const label = labelOf(transactionTypes, type);
  const tone =
    type === "income" ? "positive" : type === "expense" ? "negative" : "blue";
  return <Badge tone={tone}>{label ?? "—"}</Badge>;
}

export function currencyOf(accounts: Row[], row: Row) {
  return String(
    accounts.find(({ id }) => id === row.account)?.currency_code ?? "BRL",
  );
}

export function transactionColumns(data: Records): Column[] {
  return [
    { label: "Descrição", render: (row) => <strong>{row.description}</strong> },
    {
      label: "Data",
      render: (row) => (
        <span className="nowrap">{longDate(row.occurred_at)}</span>
      ),
    },
    { label: "Tipo", render: (row) => typeBadge(row.type) },
    {
      label: "Conta ou cartão",
      render: (row) =>
        row.type === "transfer"
          ? `${recordName(data.accounts, row.account)} → ${recordName(data.accounts, row.destination_account)}`
          : row.card_id
            ? recordName(data.cards, row.card_id)
            : recordName(data.accounts, row.account),
    },
    {
      label: "Categoria",
      render: (row) => recordName(data.categories, row.category),
    },
    {
      label: "Valor",
      render: (row) => (
        <strong className={`amount ${row.type === "income" ? "positive" : ""}`}>
          {formatAmount(
            row.type === "transfer"
              ? row.amount_cents
              : row.valor_origem_centavos,
            currencyOf(data.accounts, row),
          )}
        </strong>
      ),
    },
    {
      label: "Situação",
      render: (row) => (
        <Badge tone={row.status === "confirmed" ? "positive" : "neutral"}>
          {labelOf(transactionStatuses, row.status)}
        </Badge>
      ),
    },
  ];
}

export function Transactions() {
  const { data } = useRecords();
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("");
  const [type, setType] = useState("");
  const [account, setAccount] = useState("");
  const [status, setStatus] = useState("");
  const query = search.trim().toLocaleLowerCase("pt-BR");
  const rows = data.transactions.filter(
    (row) =>
      (!query ||
        String(row.description).toLocaleLowerCase("pt-BR").includes(query)) &&
      (!month || String(row.occurred_at).startsWith(month)) &&
      (!type || row.type === type) &&
      (!status || row.status === status) &&
      (!account ||
        row.account === account ||
        row.destination_account === account),
  );
  const balances = accountBalances(data.accounts, data.transactions);
  const totalBalance = data.accounts
    .filter(
      (row) =>
        (row.currency_code ?? "BRL") === "BRL" && !row.exclude_from_totals,
    )
    .reduce((total, row) => total + (balances.get(row.id) ?? 0), 0);
  const confirmedInBRL = rows.filter(
    (row) =>
      row.status === "confirmed" && currencyOf(data.accounts, row) === "BRL",
  );
  const income = confirmedInBRL.reduce(
    (total, row) =>
      total + (row.type === "income" ? Number(row.amount_cents) : 0),
    0,
  );
  const expenses = confirmedInBRL.reduce(
    (total, row) =>
      total +
      (row.type === "expense"
        ? Number(row.amount_cents)
        : row.type === "refund"
          ? -Number(row.amount_cents)
          : 0),
    0,
  );
  const anyFilter = Boolean(search || month || type || account || status);
  const canCreate = data.accounts.length > 0 || data.cards.length > 0;

  return (
    <>
      <PageHeading
        title="Lançamentos"
        description="Registre receitas, despesas, transferências e pagamentos de fatura."
      />
      <div className="metric-grid three">
        <Metric
          label="Saldo atual"
          value={totalBalance}
          hint="Contas em reais incluídas no total"
          icon={<Wallet size={16} />}
        />
        <Metric
          label="Receitas"
          value={income}
          hint="Lançamentos confirmados em reais"
          icon={<ArrowDownLeft size={16} />}
          color="#14956c"
        />
        <Metric
          label="Despesas líquidas"
          value={expenses}
          hint="Lançamentos confirmados em reais"
          icon={<ArrowUpRight size={16} />}
          color="#d06458"
        />
      </div>
      <RecordList
        resource="transactions"
        title="Extrato"
        singular="lançamento"
        addLabel="Novo lançamento"
        records={rows}
        fields={transactionFields(data)}
        canCreate={canCreate}
        emptyTitle={
          anyFilter
            ? "Nenhum lançamento encontrado"
            : "Nenhum lançamento registrado"
        }
        emptyDescription={
          !canCreate
            ? "Cadastre uma conta ou um cartão para registrar seu primeiro lançamento."
            : anyFilter
              ? "Experimente outros filtros."
              : undefined
        }
        emptyAction={
          !canCreate ? (
            <Link className="button secondary" to="/contas">
              Acessar contas
            </Link>
          ) : undefined
        }
        toolbar={
          (data.transactions.length > 0 || anyFilter) && (
            <div className="toolbar transaction-filters">
              <Field label="Buscar">
                <input
                  type="search"
                  placeholder="Descrição"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </Field>
              <Field label="Mês">
                <input
                  type="month"
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                />
              </Field>
              <Field label="Tipo">
                <select
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                >
                  <option value="">Todos os tipos</option>
                  {labels(transactionTypes).map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Conta">
                <select
                  value={account}
                  onChange={(event) => setAccount(event.target.value)}
                >
                  <option value="">Todas as contas</option>
                  {options(data.accounts).map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Situação">
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="">Todas as situações</option>
                  {labels(transactionStatuses).map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              {anyFilter && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSearch("");
                    setMonth("");
                    setType("");
                    setAccount("");
                    setStatus("");
                  }}
                >
                  Limpar filtros
                </Button>
              )}
            </div>
          )
        }
        columns={transactionColumns(data)}
      />
    </>
  );
}

export function Accounts() {
  const { data } = useRecords();
  const balances = accountBalances(data.accounts, data.transactions);
  return (
    <>
      <PageHeading
        title="Contas"
        description="Acompanhe os saldos a partir dos lançamentos confirmados."
      />
      <RecordList
        resource="accounts"
        title="Suas contas"
        singular="conta"
        addLabel="Nova conta"
        records={data.accounts}
        fields={accountFields}
        emptyTitle="Nenhuma conta cadastrada"
        columns={[
          {
            label: "Nome",
            render: (row) => (
              <>
                <strong>{row.name}</strong>
                {row.institution && <small>{row.institution}</small>}
              </>
            ),
          },
          { label: "Tipo", render: (row) => labelOf(accountTypes, row.kind) },
          {
            label: "Saldo inicial",
            render: (row) => (
              <span className="amount">
                {formatAmount(
                  row.balance_cents,
                  String(row.currency_code ?? "BRL"),
                )}
              </span>
            ),
          },
          {
            label: "Saldo atual",
            render: (row) => (
              <strong className="amount">
                {formatAmount(
                  balances.get(row.id),
                  String(row.currency_code ?? "BRL"),
                )}
              </strong>
            ),
          },
        ]}
      />
    </>
  );
}

export function Categories() {
  const { data } = useRecords();
  return (
    <>
      <PageHeading
        title="Categorias"
        description="Classifique suas receitas e despesas."
      />
      <RecordList
        resource="categories"
        title="Suas categorias"
        singular="categoria"
        addLabel="Nova categoria"
        records={data.categories}
        fields={categoryFields}
        emptyTitle="Nenhuma categoria cadastrada"
        columns={[
          { label: "Nome", render: (row) => <strong>{row.name}</strong> },
          { label: "Tipo", render: (row) => typeBadge(row.kind) },
          {
            label: "Essencial",
            render: (row) => (row.essential ? "Sim" : "Não"),
          },
        ]}
      />
    </>
  );
}
