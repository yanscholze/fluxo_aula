import { useState } from "react";
import { Link } from "react-router";
import { Card, Field, Empty, PageHeading } from "../design-system/ui";
import {
  cardFields,
  cardTypes,
  labelOf,
  today,
  transactionFields,
} from "./finance-fields";
import { currencyOf, transactionColumns } from "./finance";
import {
  formatAmount,
  RecordList,
  recordName,
  useRecords,
  type Row,
} from "./records";

function invoice(rows: Row[], card: Row, month: string) {
  let purchases = 0;
  let paid = 0;
  for (const row of rows) {
    if (
      row.card_id !== card.id ||
      row.invoice_month !== month ||
      row.status === "review"
    )
      continue;
    const amount = Number(row.amount_cents);
    if (row.type === "expense") purchases += amount;
    if (row.type === "refund") purchases -= amount;
    if (row.type === "invoice_payment" && row.status === "confirmed")
      paid += amount;
  }
  return { purchases, paid };
}

export function Cards() {
  const { data } = useRecords();
  const [month, setMonth] = useState(today().slice(0, 7));
  const creditCards = data.cards.filter(({ kind }) => kind === "credit");

  return (
    <>
      <PageHeading
        title="Cartões"
        description="Cadastre cartões de débito e crédito e confira as faturas por competência."
      />
      <div className="record-stack">
        <RecordList
          resource="cards"
          title="Seus cartões"
          singular="cartão"
          addLabel="Novo cartão"
          records={data.cards}
          fields={cardFields(data)}
          emptyTitle="Nenhum cartão cadastrado"
          columns={[
            {
              label: "Cartão",
              render: (row) => (
                <strong>
                  {row.name}
                  {row.last4 && ` • ${row.last4}`}
                </strong>
              ),
            },
            { label: "Tipo", render: (row) => labelOf(cardTypes, row.kind) },
            { label: "Bandeira", render: (row) => row.brand ?? "—" },
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
        {creditCards.length > 0 && (
          <Card
            title="Faturas de crédito"
            action={
              <Field label="Competência">
                <input
                  type="month"
                  required
                  value={month}
                  onChange={(event) => {
                    if (event.target.value) setMonth(event.target.value);
                  }}
                />
              </Field>
            }
          >
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
                      <th key={label} scope="col">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {creditCards.map((card) => {
                    const { purchases, paid } = invoice(
                      data.transactions,
                      card,
                      month,
                    );
                    return (
                      <tr key={card.id}>
                        <td>
                          <strong>{card.name}</strong>
                        </td>
                        <td>
                          {card.closing_day ?? "—"} / {card.due_day ?? "—"}
                        </td>
                        <td>{formatAmount(purchases)}</td>
                        <td>{formatAmount(paid)}</td>
                        <td>
                          <strong>{formatAmount(purchases - paid)}</strong>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

export function Installments() {
  const { data } = useRecords();
  const installmentsByGroup = new Map<string, Row[]>();
  for (const row of data.transactions) {
    if (!row.installment_group_id) continue;
    const group = String(row.installment_group_id);
    const entries = installmentsByGroup.get(group) ?? [];
    entries.push(row);
    installmentsByGroup.set(group, entries);
  }

  return (
    <>
      <PageHeading
        title="Parcelamentos"
        description="Acompanhe as parcelas das despesas registradas no extrato."
      />
      <div className="record-stack">
        {data.installment_groups.length === 0 && (
          <Card title="Compras parceladas">
            <Empty
              title="Nenhum parcelamento"
              description="Informe o número de parcelas em um novo lançamento de despesa."
              action={
                <Link to="/lancamentos" className="button secondary">
                  Acessar lançamentos
                </Link>
              }
            />
          </Card>
        )}
        {data.installment_groups.map((group) => {
          const rows = [...(installmentsByGroup.get(group.id) ?? [])].reverse();
          const first = rows[0];
          const total = rows.reduce(
            (sum, row) => sum + Number(row.amount_cents),
            0,
          );
          const currency = first ? currencyOf(data.accounts, first) : "BRL";
          return (
            <RecordList
              key={group.id}
              resource="transactions"
              title={first ? String(first.description) : "Compra parcelada"}
              singular="parcela"
              canCreate={false}
              records={rows}
              fields={transactionFields(data)}
              emptyTitle="Nenhuma parcela ativa"
              toolbar={
                <p className="installment-summary">
                  {group.installments} parcelas ·{" "}
                  {formatAmount(total, currency)} em parcelas ativas
                </p>
              }
              columns={transactionColumns(data)}
            />
          );
        })}
      </div>
    </>
  );
}
