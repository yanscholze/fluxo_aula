import { useState } from "react";
import { Link } from "react-router";
import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Confirm,
  Empty,
  Field,
  Metric,
  PageHeading,
} from "../design-system/ui";
import { Donut, LineChart } from "../charts/charts";
import {
  compact,
  csvCell,
  downloadFile,
  monthLabel,
  shortMonth,
} from "../shared/format";
import {
  accountFields,
  accountTypes,
  cardFields,
  cardTypes,
  categoryFields,
  categoryTypes,
  labelOf,
  labels,
  longDate,
  recurringFields,
  today,
  transactionFields,
  transactionStatuses,
  transactionTypes,
} from "./finance-fields";
import {
  api,
  formatAmount,
  options,
  RecordList,
  recordName,
  useRecords,
  type Column,
  type Row,
} from "./records";

function amount(row: Row) {
  return Number(row.amount_cents ?? 0);
}

function sum(rows: Row[], value = amount) {
  return rows.reduce((total, row) => total + value(row), 0);
}

function textColumn(label: string, key: string): Column {
  return { label, render: (row) => String(row[key] ?? "—") };
}

function statusBadge(status: unknown) {
  return (
    <Badge
      tone={
        status === "confirmed"
          ? "positive"
          : status === "review"
            ? "warning"
            : "blue"
      }
    >
      {labelOf(transactionStatuses, status)}
    </Badge>
  );
}

function currencyOf(accounts: Row[], row: Row) {
  const account = accounts.find((account) => account.id === row.account);
  return String(account?.currency_code || "BRL");
}

function currentBalances(
  accounts: Row[],
  transactions: Row[],
  redemptions: Row[],
) {
  const date = today();
  const balances = new Map(
    accounts.map((row) => [row.id, Number(row.balance_cents ?? 0)]),
  );
  const apply = (account: unknown, change: number) => {
    const id = String(account);
    if (balances.has(id)) balances.set(id, balances.get(id)! + change);
  };
  for (const row of transactions) {
    if (
      row.status !== "confirmed" ||
      String(row.occurred_at).slice(0, 10) > date
    )
      continue;
    apply(row.account, Number(row.valor_origem_centavos));
    if (row.type === "transfer") apply(row.destination_account, amount(row));
  }
  for (const row of redemptions) {
    if (
      row.kind === "cashback" &&
      String(row.redeemed_at).slice(0, 10) <= date
    ) {
      apply(row.account, Math.round(Number(row.amount_milli) / 10));
    }
  }
  return balances;
}

function transactionColumns(data: Record<string, Row[]>): Column[] {
  return [
    { label: "Descrição", render: (row) => <strong>{row.description}</strong> },
    { label: "Data", render: (row) => longDate(row.occurred_at) },
    { label: "Tipo", render: (row) => labelOf(transactionTypes, row.type) },
    {
      label: "Categoria",
      render: (row) => recordName(data.categories, row.category),
    },
    {
      label: "Conta ou cartão",
      render: (row) =>
        row.type === "transfer"
          ? `${recordName(data.accounts, row.account)} → ${recordName(data.accounts, row.destination_account)}`
          : recordName(
              row.card_id ? data.cards : data.accounts,
              row.card_id || row.account,
            ),
    },
    {
      label: "Valor",
      render: (row) => (
        <span className="nowrap">
          {formatAmount(amount(row), currencyOf(data.accounts, row))}
        </span>
      ),
    },
    { label: "Situação", render: (row) => statusBadge(row.status) },
  ];
}

function MonthField({
  month,
  onChange,
}: {
  month: string;
  onChange: (month: string) => void;
}) {
  return (
    <Field label="Competência">
      <input
        type="month"
        value={month}
        onChange={(event) => {
          if (event.target.value) onChange(event.target.value);
        }}
      />
    </Field>
  );
}

export function Transactions() {
  const { data } = useRecords();
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const visible = data.transactions.filter(
    (row) =>
      (!month || String(row.occurred_at).startsWith(month)) &&
      (!type || row.type === type) &&
      (!status || row.status === status) &&
      String(row.description)
        .toLocaleLowerCase("pt-BR")
        .includes(search.trim().toLocaleLowerCase("pt-BR")),
  );
  const columns = transactionColumns(data);

  function exportCsv() {
    const header = [
      "Descrição",
      "Data",
      "Tipo",
      "Valor em centavos",
      "Moeda",
      "Situação",
    ];
    const lines = visible.map((row) => [
      row.description,
      row.occurred_at,
      labelOf(transactionTypes, row.type),
      amount(row),
      currencyOf(data.accounts, row),
      labelOf(transactionStatuses, row.status),
    ]);
    downloadFile(
      "fluxo-lancamentos.csv",
      "\uFEFF" +
        [header, ...lines]
          .map((line) => line.map(csvCell).join(";"))
          .join("\r\n"),
      "text/csv;charset=utf-8",
    );
  }

  return (
    <>
      <PageHeading
        title="Lançamentos"
        description="Registre receitas, despesas, transferências e pagamentos de fatura."
        action={
          <Button
            variant="secondary"
            onClick={exportCsv}
            disabled={!visible.length}
          >
            Exportar CSV
          </Button>
        }
      />
      <div className="toolbar">
        <Field label="Buscar descrição">
          <input
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
            <option value="">Todos</option>
            {labels(transactionTypes).map(({ value, label }) => (
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
            <option value="">Todas</option>
            {labels(transactionStatuses).map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <RecordList
        title="Movimentações"
        resource="transactions"
        singular="lançamento"
        records={visible}
        fields={transactionFields(data)}
        columns={columns}
        wide
      />
    </>
  );
}

export function Accounts() {
  const { data } = useRecords();
  const balances = currentBalances(
    data.accounts,
    data.transactions,
    data.reward_redemptions,
  );
  return (
    <>
      <PageHeading
        title="Contas"
        description="Cadastre contas e acompanhe os saldos a partir dos lançamentos confirmados."
      />
      <RecordList
        title="Suas contas"
        resource="accounts"
        singular="conta"
        records={data.accounts}
        fields={accountFields}
        wide
        columns={[
          textColumn("Nome", "name"),
          {
            label: "Saldo atual",
            render: (row) =>
              formatAmount(
                balances.get(row.id),
                String(row.currency_code ?? "BRL"),
              ),
          },
          { label: "Tipo", render: (row) => labelOf(accountTypes, row.kind) },
          textColumn("Instituição", "institution"),
          {
            label: "Meta",
            render: (row) =>
              row.goal_cents == null
                ? "—"
                : formatAmount(
                    row.goal_cents,
                    String(row.currency_code ?? "BRL"),
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
        description="Organize suas receitas e despesas para acompanhar de onde vem e para onde vai o dinheiro."
      />
      <RecordList
        title="Suas categorias"
        resource="categories"
        singular="categoria"
        records={data.categories}
        fields={categoryFields}
        columns={[
          textColumn("Nome", "name"),
          { label: "Tipo", render: (row) => labelOf(categoryTypes, row.kind) },
          {
            label: "Essencial",
            render: (row) => (row.essential ? "Sim" : "Não"),
          },
        ]}
      />
    </>
  );
}

export function Cards() {
  const { data } = useRecords();
  const [month, setMonth] = useState(today().slice(0, 7));
  const invoice = (card: Row) => {
    const rows = data.transactions.filter(
      (row) =>
        row.card_id === card.id &&
        row.invoice_month === month &&
        row.status !== "review",
    );
    const purchases = sum(
      rows.filter((row) => row.type === "expense" || row.type === "refund"),
      (row) => (row.type === "refund" ? -amount(row) : amount(row)),
    );
    const paid = sum(
      rows.filter(
        (row) => row.type === "invoice_payment" && row.status === "confirmed",
      ),
    );
    return { purchases, paid };
  };
  return (
    <>
      <PageHeading
        title="Cartões"
        description="Acompanhe cartões de débito e crédito e confira suas faturas por competência."
        action={
          <Link to="/recompensas" className="button secondary">
            Ver recompensas
          </Link>
        }
      />
      <div className="record-stack">
        <RecordList
          title="Seus cartões"
          resource="cards"
          singular="cartão"
          records={data.cards}
          fields={cardFields(data)}
          wide
          columns={[
            {
              label: "Cartão",
              render: (row) => (
                <strong>
                  {row.name}
                  {row.last4 ? ` • ${row.last4}` : ""}
                </strong>
              ),
            },
            { label: "Tipo", render: (row) => labelOf(cardTypes, row.kind) },
            textColumn("Bandeira", "brand"),
            {
              label: "Conta vinculada",
              render: (row) => recordName(data.accounts, row.linked_account),
            },
            {
              label: "Limite",
              render: (row) =>
                row.limit_cents == null ? "—" : formatAmount(row.limit_cents),
            },
          ]}
        />
        <Card
          title="Faturas de crédito"
          subtitle="Registre pagamentos na tela Lançamentos, escolhendo o tipo Pagamento de fatura."
          action={<MonthField month={month} onChange={setMonth} />}
        >
          {data.cards.some((row) => row.kind === "credit") ? (
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Faturas de crédito"
            >
              <table>
                <thead>
                  <tr>
                    {[
                      "Cartão",
                      "Fechamento / vencimento",
                      "Compras líquidas",
                      "Valor pago",
                      "Saldo da fatura",
                    ].map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.cards
                    .filter((row) => row.kind === "credit")
                    .map((card) => {
                      const { purchases, paid } = invoice(card);
                      return (
                        <tr key={card.id}>
                          <td>{card.name}</td>
                          <td>
                            {card.closing_day} / {card.due_day}
                          </td>
                          <td>{formatAmount(purchases)}</td>
                          <td>{formatAmount(paid)}</td>
                          <td>{formatAmount(purchases - paid)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="Nenhum cartão de crédito"
              description="Cadastre um cartão de crédito para visualizar as faturas."
            />
          )}
        </Card>
      </div>
    </>
  );
}

export function Commitments() {
  const { data, reload, notify } = useRecords();
  const [month, setMonth] = useState(today().slice(0, 7));
  return (
    <>
      <PageHeading
        title="Compromissos"
        description="Cadastre despesas fixas, assinaturas e receitas recorrentes. Confirme cada competência para efetivar o lançamento."
        action={<MonthField month={month} onChange={setMonth} />}
      />
      <RecordList
        title="Recorrências"
        resource="recurring_entries"
        singular="compromisso"
        records={data.recurring_entries}
        fields={recurringFields(data)}
        wide
        columns={[
          textColumn("Descrição", "description"),
          textColumn("Dia", "day_of_month"),
          {
            label: "Valor-base",
            render: (row) =>
              formatAmount(amount(row), currencyOf(data.accounts, row)),
          },
          { label: "Tipo", render: (row) => labelOf(categoryTypes, row.type) },
          {
            label: "Situação",
            render: (row) => (
              <Badge tone={row.active ? "positive" : "neutral"}>
                {row.active ? "Ativo" : "Pausado"}
              </Badge>
            ),
          },
        ]}
        actions={(row) =>
          row.active &&
          (row.last_confirmed_month === month ? (
            <Badge tone="positive">Confirmado no mês</Badge>
          ) : (
            <Confirm
              label="Confirmar mês"
              title="Confirmar compromisso"
              description={`Gerar um lançamento para ${monthLabel(month)}?`}
              onConfirm={async () => {
                await api(
                  `/recurring_entries/${encodeURIComponent(row.id)}/confirm`,
                  "POST",
                  { month },
                );
                await reload();
                notify("Lançamento confirmado.");
              }}
            />
          ))
        }
      />
    </>
  );
}

export function Installments() {
  const { data, reload, notify } = useRecords();
  const groups = new Map<string, Row[]>();
  for (const row of data.transactions) {
    if (!row.installment_group_id) continue;
    const key = String(row.installment_group_id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  const groupRows = [...groups].map(([id, rows]) => {
    const first = rows[0];
    return {
      id,
      name: first.description,
      count: first.installments,
      total: sum(rows),
      planned: sum(rows.filter((row) => row.status === "planned")),
      currency: currencyOf(data.accounts, first),
    };
  });
  const installmentRows = [...groups.values()]
    .flat()
    .sort((a, b) => String(a.occurred_at).localeCompare(String(b.occurred_at)));
  const groupName = (group: unknown) =>
    data.installment_labels.find((row) => row.group_id === group)?.label ??
    recordName(groupRows, group);

  return (
    <>
      <PageHeading
        title="Parcelamentos"
        description="Veja os grupos e confirme parcelas planejadas quando forem efetivadas."
        action={
          <Link to="/lancamentos" className="button secondary">
            Ir para lançamentos
          </Link>
        }
      />
      <div className="record-stack">
        <RecordList
          title="Compras parceladas"
          resource="installment_groups"
          records={groupRows}
          singular="grupo"
          columns={[
            { label: "Grupo", render: (row) => groupName(row.id) },
            textColumn("Parcelas", "count"),
            {
              label: "Total registrado",
              render: (row) => formatAmount(row.total, String(row.currency)),
            },
            {
              label: "Total planejado",
              render: (row) => formatAmount(row.planned, String(row.currency)),
            },
          ]}
        />
        {groupRows.length > 0 && (
          <>
            <RecordList
              title="Parcelas"
              resource="transactions"
              records={installmentRows}
              singular="parcela"
              columns={[
                {
                  label: "Grupo",
                  render: (row) => groupName(row.installment_group_id),
                },
                { label: "Data", render: (row) => longDate(row.occurred_at) },
                {
                  label: "Valor",
                  render: (row) =>
                    formatAmount(amount(row), currencyOf(data.accounts, row)),
                },
                { label: "Situação", render: (row) => statusBadge(row.status) },
              ]}
              actions={(row) =>
                row.status === "planned" && (
                  <Confirm
                    label="Confirmar parcela"
                    title="Confirmar parcela"
                    description="Registrar esta parcela como confirmada."
                    onConfirm={async () => {
                      await api(
                        `/transactions/${encodeURIComponent(row.id)}`,
                        "PUT",
                        { status: "confirmed" },
                      );
                      await reload();
                      notify("Parcela confirmada.");
                    }}
                  />
                )
              }
            />
            <RecordList
              title="Nomes personalizados"
              resource="installment_labels"
              records={data.installment_labels}
              singular="nome"
              fields={(row) => [
                {
                  name: "group_id",
                  label: "Grupo",
                  kind: "select",
                  required: true,
                  options: options(
                    groupRows.filter(
                      (group) =>
                        !data.installment_labels.some(
                          (label) =>
                            label.id !== row?.id && label.group_id === group.id,
                        ),
                    ),
                  ),
                },
                {
                  name: "label",
                  label: "Nome",
                  required: true,
                  maxLength: 255,
                },
              ]}
              columns={[
                {
                  label: "Grupo original",
                  render: (row) => recordName(groupRows, row.group_id),
                },
                textColumn("Nome", "label"),
              ]}
            />
          </>
        )}
      </div>
    </>
  );
}

function monthlyTotals(transactions: Row[], accounts: Row[], month: string) {
  const rows = transactions.filter(
    (row) =>
      row.status === "confirmed" &&
      String(row.occurred_at).startsWith(month) &&
      currencyOf(accounts, row) === "BRL",
  );
  return {
    rows,
    income: sum(rows.filter((row) => row.type === "income")),
    expenses: sum(rows.filter((row) => row.type === "expense")),
    refunds: sum(rows.filter((row) => row.type === "refund")),
  };
}

function expenseSlices(rows: Row[], categories: Row[]) {
  const totals = new Map<string, number>();
  for (const row of rows.filter((row) => row.type === "expense")) {
    const id = String(row.category ?? "");
    totals.set(id, (totals.get(id) ?? 0) + amount(row));
  }
  return [...totals]
    .map(([id, value]) => {
      const category = categories.find((row) => row.id === id);
      return {
        name: String(category?.name ?? "Sem categoria"),
        value,
        color: category?.color ? String(category.color) : undefined,
      };
    })
    .sort((a, b) => b.value - a.value);
}

export function Dashboard() {
  const { data, user } = useRecords();
  const month = today().slice(0, 7);
  const totals = monthlyTotals(data.transactions, data.accounts, month);
  const balances = currentBalances(
    data.accounts,
    data.transactions,
    data.reward_redemptions,
  );
  const balance = sum(
    data.accounts.filter(
      (row) => row.currency_code === "BRL" && !row.exclude_from_totals,
    ),
    (row) => balances.get(row.id) ?? 0,
  );
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(month + "-01T00:00:00Z");
    date.setUTCMonth(date.getUTCMonth() - 5 + index);
    return date.toISOString().slice(0, 7);
  });
  const history = months.map((period) =>
    monthlyTotals(data.transactions, data.accounts, period),
  );
  const slices = expenseSlices(totals.rows, data.categories);
  return (
    <>
      <PageHeading
        title={`Olá, ${user.display_name.split(" ")[0]}`}
        description={`Seu painel financeiro em ${monthLabel(month)}.`}
        action={
          <Link className="button primary" to="/lancamentos">
            Gerenciar lançamentos
          </Link>
        }
      />
      <div className="record-stack">
        <div className="metric-grid three">
          <Metric
            label="Saldo das contas"
            value={balance}
            hint="Contas em reais incluídas no total"
            icon={<Wallet size={17} />}
          />
          <Metric
            label="Receitas do mês"
            value={totals.income}
            hint="Receitas confirmadas em reais"
            icon={<ArrowUpRight size={17} />}
            color="#14956c"
          />
          <Metric
            label="Despesas do mês"
            value={totals.expenses - totals.refunds}
            hint="Despesas confirmadas em reais, após estornos"
            icon={<ArrowDownLeft size={17} />}
            color="#d06458"
          />
        </div>
        <div className="overview-charts">
          <Card
            title="Receitas e despesas"
            subtitle="Movimentações confirmadas em reais nos últimos seis meses"
          >
            <LineChart
              labels={months.map(shortMonth)}
              area
              series={[
                {
                  name: "Receitas",
                  values: history.map((row) => row.income),
                  color: "#518FF1",
                },
                {
                  name: "Despesas líquidas",
                  values: history.map((row) => row.expenses - row.refunds),
                  color: "#a367c4",
                },
              ]}
            />
          </Card>
          <Card title="Despesas por categoria" subtitle={monthLabel(month)}>
            {slices.length ? (
              <Donut
                slices={slices}
                center={`R$ ${compact(totals.expenses)}`}
                subtitle="despesas"
              />
            ) : (
              <Empty
                title="Sem despesas no mês"
                description="As despesas confirmadas em reais aparecerão aqui."
              />
            )}
          </Card>
        </div>
        <RecordList
          records={data.transactions.slice(0, 5)}
          title="Lançamentos recentes"
          resource="transactions"
          singular="lançamento"
          columns={transactionColumns(data)}
        />
      </div>
    </>
  );
}

export function Reports() {
  const { data } = useRecords();
  const [month, setMonth] = useState(today().slice(0, 7));
  const totals = monthlyTotals(data.transactions, data.accounts, month);
  const slices = expenseSlices(totals.rows, data.categories);
  const result = totals.income - totals.expenses + totals.refunds;
  return (
    <>
      <PageHeading
        title="Relatórios"
        description="Consulte as movimentações confirmadas em reais por competência."
        action={<MonthField month={month} onChange={setMonth} />}
      />
      <div className="record-stack">
        <div className="metric-grid three">
          <Metric
            label="Receitas"
            value={totals.income}
            hint="Entradas confirmadas"
            icon={<ArrowUpRight size={17} />}
          />
          <Metric
            label="Despesas líquidas"
            value={totals.expenses - totals.refunds}
            hint="Despesas após estornos"
            icon={<ArrowDownLeft size={17} />}
          />
          <Metric
            label="Resultado"
            value={result}
            hint="Receitas menos despesas líquidas"
            icon={<Wallet size={17} />}
          />
        </div>
        {slices.length > 0 && (
          <Card title="Despesas por categoria" subtitle={monthLabel(month)}>
            <Donut
              slices={slices}
              center={`R$ ${compact(totals.expenses)}`}
              subtitle="despesas"
            />
          </Card>
        )}
        <RecordList
          title="Detalhamento"
          records={totals.rows}
          resource="transactions"
          singular="lançamento"
          columns={transactionColumns(data)}
        />
      </div>
    </>
  );
}
