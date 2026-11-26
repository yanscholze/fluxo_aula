import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { Bell, Check, Smartphone } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Confirm,
  Empty,
  Field,
  Notice,
  PageHeading,
} from "../design-system/ui";
import { categoryTypes, labels, longDate } from "./finance-fields";
import {
  api,
  formatAmount,
  options,
  RecordList,
  recordName,
  useRecords,
  type FieldSpec,
  type Row,
} from "./records";

const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 });

export function Trips() {
  const { data } = useRecords();
  const fields: FieldSpec[] = [
    { name: "name", label: "Nome da viagem", required: true, maxLength: 255 },
    { name: "start_date", label: "Ida", kind: "date", required: true },
    { name: "end_date", label: "Volta", kind: "date", required: true },
    {
      name: "currency",
      label: "Código da moeda",
      defaultValue: "BRL",
      maxLength: 3,
      required: true,
      hint: "Exemplos: BRL, USD, EUR.",
    },
    {
      name: "exchange_rate_micros",
      label: "Taxa de câmbio",
      kind: "decimal",
      scale: 6,
      min: 0.000001,
      required: true,
      defaultValue: "1",
    },
  ];

  function expenses(trip: Row) {
    const totals = new Map<string, number>();
    for (const row of data.transactions ?? []) {
      if (
        row.trip_id !== trip.id ||
        row.type !== "expense" ||
        row.status === "planned" ||
        row.status === "review"
      )
        continue;
      const account = (data.accounts ?? []).find(
        (item) => item.id === String(row.account),
      );
      const currency = String(account?.currency_code ?? "BRL");
      totals.set(
        currency,
        (totals.get(currency) ?? 0) + Number(row.amount_cents ?? 0),
      );
    }
    return (
      [...totals]
        .map(([currency, amount]) => formatAmount(amount, currency))
        .join(" · ") || "—"
    );
  }

  return (
    <>
      <PageHeading
        title="Viagens"
        description="Organize suas viagens e acompanhe os gastos vinculados nos lançamentos."
      />
      <RecordList
        resource="trips"
        records={data.trips ?? []}
        title="Suas viagens"
        singular="viagem"
        fields={fields}
        columns={[
          { label: "Viagem", render: (row) => <strong>{row.name}</strong> },
          {
            label: "Período",
            render: (row) =>
              `${longDate(row.start_date)} a ${longDate(row.end_date)}`,
          },
          {
            label: "Moeda",
            render: (row) => <Badge tone="blue">{row.currency ?? "BRL"}</Badge>,
          },
          {
            label: "Câmbio",
            render: (row) =>
              row.exchange_rate_micros == null
                ? "—"
                : number.format(Number(row.exchange_rate_micros) / 1_000_000),
          },
          { label: "Gastos vinculados", render: expenses },
        ]}
      />
    </>
  );
}

export function Rewards() {
  const { data } = useRecords();
  const cards = data.cards ?? [];
  const accounts = data.accounts ?? [];
  const redemptions = data.reward_redemptions ?? [];
  const fields: FieldSpec[] = [
    {
      name: "kind",
      label: "Tipo",
      kind: "select",
      required: true,
      defaultValue: "points",
      options: [
        { value: "points", label: "Pontos" },
        { value: "cashback", label: "Cashback" },
      ],
    },
    {
      name: "amount_milli",
      label: "Quantidade de pontos ou valor em reais",
      kind: "decimal",
      scale: 3,
      required: true,
      min: 0.001,
    },
    {
      name: "card_id",
      label: "Cartão",
      kind: "select",
      required: true,
      options: options(cards),
    },
    {
      name: "account",
      label: "Conta",
      kind: "select",
      options: options(accounts),
    },
    {
      name: "redeemed_at",
      label: "Data e hora do resgate",
      kind: "datetime",
      required: true,
      defaultValue: localDateTime(),
    },
    { name: "note", label: "Observação", kind: "textarea", maxLength: 2000 },
  ];
  return (
    <>
      <PageHeading
        title="Recompensas"
        description="Registre os resgates de pontos e cashback dos seus cartões."
      />
      <div className="stack">
        {cards.some(
          (card) => card.reward_mode && card.reward_mode !== "none",
        ) && (
          <div className="catalog-grid">
            {cards
              .filter((card) => card.reward_mode && card.reward_mode !== "none")
              .map((card) => {
                const entries = (data.transactions ?? []).filter(
                  (entry) =>
                    entry.card_id === card.id && entry.status === "confirmed",
                );
                const redeemed = redemptions.filter(
                  (row) => row.card_id === card.id,
                );
                const points =
                  entries.reduce(
                    (total, entry) =>
                      total + Number(entry.reward_points_milli ?? 0),
                    0,
                  ) -
                  redeemed.reduce(
                    (total, row) =>
                      total +
                      (row.kind === "points" ? Number(row.amount_milli) : 0),
                    0,
                  );
                const cashback =
                  entries.reduce(
                    (total, entry) =>
                      total + Number(entry.reward_cashback_cents ?? 0),
                    0,
                  ) -
                  redeemed.reduce(
                    (total, row) =>
                      total +
                      (row.kind === "cashback"
                        ? Number(row.amount_milli) / 10
                        : 0),
                    0,
                  );
                return (
                  <Card
                    key={card.id}
                    title={String(card.name)}
                    subtitle="Saldo calculado pelos registros do Fluxo"
                  >
                    <div className="key-values">
                      {(card.reward_mode === "points" ||
                        card.reward_mode === "both") && (
                        <div>
                          <span>Pontos</span>
                          <b>{number.format(points / 1000)}</b>
                        </div>
                      )}
                      {(card.reward_mode === "cashback" ||
                        card.reward_mode === "both") && (
                        <div>
                          <span>Cashback</span>
                          <b>{formatAmount(cashback)}</b>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
          </div>
        )}
        <RecordList
          resource="reward_redemptions"
          records={redemptions}
          title="Histórico de resgates"
          subtitle={
            cards.length === 0
              ? "Cadastre um cartão para registrar resgates."
              : undefined
          }
          singular="resgate"
          fields={fields}
          canCreate={cards.length > 0}
          columns={[
            { label: "Data", render: (row) => longDate(row.redeemed_at) },
            {
              label: "Tipo",
              render: (row) => (
                <Badge tone="blue">
                  {row.kind === "cashback" ? "Cashback" : "Pontos"}
                </Badge>
              ),
            },
            {
              label: "Resgatado",
              render: (row) => (
                <strong>
                  {row.kind === "cashback"
                    ? formatAmount(Number(row.amount_milli) / 10)
                    : number.format(Number(row.amount_milli) / 1000)}
                </strong>
              ),
            },
            {
              label: "Cartão",
              render: (row) => recordName(cards, row.card_id),
            },
            {
              label: "Conta",
              render: (row) => recordName(accounts, row.account),
            },
            { label: "Observação", render: (row) => row.note || "—" },
          ]}
        />
      </div>
    </>
  );
}

function localDateTime() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function Captures() {
  const { data, reload, notify } = useRecords();
  const captures = data.pending_auto_transactions ?? [];
  const accounts = data.accounts ?? [];
  const cards = data.cards ?? [];
  const categories = data.categories ?? [];
  const fields: FieldSpec[] = [
    {
      name: "source_app",
      label: "Aplicativo de origem",
      required: true,
      maxLength: 255,
    },
    {
      name: "raw_text",
      label: "Texto da notificação",
      kind: "textarea",
      required: true,
      maxLength: 4000,
    },
    {
      name: "confidence",
      label: "Confiança (%)",
      kind: "integer",
      min: 0,
      max: 100,
    },
    { name: "description", label: "Descrição do lançamento", maxLength: 255 },
    {
      name: "type",
      label: "Tipo",
      kind: "select",
      options: labels(categoryTypes),
    },
    { name: "occurred_at", label: "Data e hora", kind: "datetime" },
    { name: "amount_cents", label: "Valor", kind: "money", min: 0.01 },
    {
      name: "suggested_category",
      label: "Categoria sugerida",
      kind: "select",
      options: options(categories),
    },
    {
      name: "suggested_account",
      label: "Conta sugerida",
      kind: "select",
      options: options(accounts),
    },
    {
      name: "card_id",
      label: "Cartão",
      kind: "select",
      options: options(cards),
    },
  ];
  const columns = [
    {
      label: "Origem e descrição",
      render: (row: Row) => (
        <>
          <strong>{row.description || row.source_app}</strong>
          {row.description ? <small>{row.source_app}</small> : null}
        </>
      ),
    },
    { label: "Data", render: (row: Row) => longDate(row.occurred_at) },
    {
      label: "Categoria sugerida",
      render: (row: Row) => recordName(categories, row.suggested_category),
    },
    {
      label: "Valor",
      render: (row: Row) => {
        if (row.amount_cents == null) return "—";
        const card = cards.find((item) => item.id === row.card_id);
        const accountId =
          card?.kind === "debit" ? card.linked_account : row.suggested_account;
        const account = accounts.find((item) => item.id === accountId);
        return formatAmount(
          row.amount_cents,
          String(
            card?.kind === "credit" ? "BRL" : (account?.currency_code ?? "BRL"),
          ),
        );
      },
    },
  ];
  const pending = captures.filter(
    ({ review_status }) =>
      review_status !== "ignored" && review_status !== "accepted",
  );
  const history = captures.filter(
    ({ review_status }) =>
      review_status === "ignored" || review_status === "accepted",
  );

  return (
    <>
      <PageHeading
        title="Capturas"
        description="Registre notificações recebidas e revise os dados antes de criar um lançamento."
      />
      <div className="stack">
        <RecordList
          resource="pending_auto_transactions"
          records={pending}
          title="Caixa de revisão"
          singular="captura"
          fields={fields}
          columns={columns}
          wide
          actions={(row) => (
            <>
              <Confirm
                label="Confirmar captura"
                title="Criar lançamento?"
                description="Confira o valor, a data e a conta ou cartão antes de confirmar."
                onConfirm={async () => {
                  await api(
                    `/pending_auto_transactions/${encodeURIComponent(row.id)}/confirm`,
                    "POST",
                  );
                  await reload();
                  notify("Lançamento criado a partir da captura.");
                }}
              >
                <Check size={15} /> Confirmar
              </Confirm>
              <Confirm
                label="Ignorar captura"
                title="Ignorar esta captura?"
                description="A captura ficará no histórico de revisão."
                onConfirm={async () => {
                  await api(
                    `/pending_auto_transactions/${encodeURIComponent(row.id)}`,
                    "PUT",
                    { review_status: "ignored" },
                  );
                  await reload();
                  notify("Captura ignorada.");
                }}
              >
                Ignorar
              </Confirm>
            </>
          )}
        />
        {history.length > 0 && (
          <RecordList
            resource="pending_auto_transactions"
            records={history}
            title="Histórico de revisão"
            singular="captura"
            canCreate={false}
            canEdit={false}
            canDelete={false}
            actions={(row) =>
              row.review_status === "ignored" && (
                <Confirm
                  label="Reabrir captura"
                  title="Reabrir esta captura?"
                  description="Ela voltará para a caixa de revisão."
                  onConfirm={async () => {
                    await api(
                      `/pending_auto_transactions/${encodeURIComponent(row.id)}`,
                      "PUT",
                      { review_status: "review", ignore_reason: null },
                    );
                    await reload();
                    notify("Captura reaberta.");
                  }}
                >
                  Reabrir
                </Confirm>
              )
            }
            columns={[
              ...columns,
              {
                label: "Situação",
                render: (row) => (
                  <Badge
                    tone={
                      row.review_status === "accepted" ? "positive" : "neutral"
                    }
                  >
                    {row.review_status === "accepted"
                      ? "Confirmada"
                      : "Ignorada"}
                  </Badge>
                ),
              },
            ]}
          />
        )}
      </div>
    </>
  );
}

function Profile() {
  const { user, reload, notify } = useRecords();
  const [name, setName] = useState(user.display_name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const result = await api<{ user: typeof user }>("/profile", "PATCH", {
        display_name: name.trim(),
      });
      setName(result.user.display_name);
      await reload();
      notify("Perfil atualizado.");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Não foi possível salvar o perfil.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Seu perfil">
      <div className="profile-large">
        <span className="avatar large" aria-hidden="true">
          {user.display_name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <h2>{user.display_name}</h2>
          <p>{user.email}</p>
        </div>
      </div>
      <form className="stack" onSubmit={save}>
        <Field label="Nome de exibição">
          <input
            autoComplete="name"
            required
            maxLength={255}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        <div>
          <Button
            type="submit"
            variant="secondary"
            busy={saving}
            disabled={!name.trim() || name.trim() === user.display_name}
          >
            Salvar perfil
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Rules() {
  const { data } = useRecords();
  const categories = data.categories ?? [];
  const accounts = data.accounts ?? [];
  const cards = data.cards ?? [];
  return (
    <div className="stack">
      <RecordList
        resource="establishment_rules"
        records={data.establishment_rules ?? []}
        title="Regras de estabelecimento"
        singular="regra"
        fields={[
          {
            name: "match_text",
            label: "Texto a procurar",
            required: true,
            maxLength: 255,
          },
          {
            name: "category",
            label: "Categoria",
            kind: "select",
            required: true,
            options: options(categories),
          },
        ]}
        columns={[
          {
            label: "Texto",
            render: (row) => <strong>{row.match_text}</strong>,
          },
          {
            label: "Categoria",
            render: (row) => recordName(categories, row.category),
          },
        ]}
      />
      <RecordList
        resource="notification_app_rules"
        records={data.notification_app_rules ?? []}
        title="Regras de notificação"
        singular="regra"
        fields={[
          {
            name: "source_app",
            label: "Aplicativo",
            required: true,
            maxLength: 255,
          },
          {
            name: "action",
            label: "Ação",
            kind: "select",
            required: true,
            defaultValue: "review",
            options: [
              { value: "review", label: "Revisar" },
              { value: "ignore", label: "Ignorar" },
            ],
          },
          {
            name: "account_id",
            label: "Conta",
            kind: "select",
            options: options(accounts),
          },
          {
            name: "card_id",
            label: "Cartão",
            kind: "select",
            options: options(cards),
          },
          {
            name: "default_category",
            label: "Categoria padrão",
            kind: "select",
            options: options(categories),
          },
        ]}
        columns={[
          {
            label: "Aplicativo",
            render: (row) => <strong>{row.source_app}</strong>,
          },
          {
            label: "Ação",
            render: (row) => (row.action === "ignore" ? "Ignorar" : "Revisar"),
          },
          {
            label: "Conta",
            render: (row) => recordName(accounts, row.account_id),
          },
          { label: "Cartão", render: (row) => recordName(cards, row.card_id) },
          {
            label: "Categoria",
            render: (row) => recordName(categories, row.default_category),
          },
        ]}
      />
    </div>
  );
}

function Feedback() {
  const { data } = useRecords();
  return (
    <RecordList
      resource="developer_feedback"
      records={data.developer_feedback ?? []}
      title="Feedback registrado no Fluxo"
      singular="feedback"
      canEdit={false}
      canDelete={false}
      fields={[
        {
          name: "message",
          label: "Mensagem",
          kind: "textarea",
          required: true,
          maxLength: 2000,
        },
      ]}
      columns={[
        { label: "Data", render: (row) => longDate(row.created_at) },
        { label: "Mensagem", render: (row) => row.message },
        {
          label: "Situação",
          render: (row) => (
            <Badge tone="blue">
              {row.status === "submitted" || !row.status
                ? "Recebido"
                : row.status}
            </Badge>
          ),
        },
        { label: "Resposta", render: (row) => row.developer_comment ?? "—" },
      ]}
    />
  );
}

export function Notifications() {
  const { data, reload } = useRecords();
  const [marking, setMarking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const notifications = data.app_notifications ?? [];

  async function markRead(id: string) {
    setMarking(id);
    setError("");
    try {
      await api(`/app_notifications/${encodeURIComponent(id)}`, "PUT", {
        read_at: true,
      });
      await reload();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Não foi possível marcar a notificação como lida.",
      );
    } finally {
      setMarking(null);
    }
  }

  if (notifications.length === 0) {
    return (
      <Empty
        title="Nenhum aviso"
        description="As notificações do Fluxo aparecem aqui."
      />
    );
  }
  return (
    <div className="entity-list">
      {error && <Notice tone="error">{error}</Notice>}
      {notifications.map((row) => (
        <div className="entity-row" key={row.id}>
          <span className="entity-symbol">
            <Bell size={16} />
          </span>
          <div className="entity-main">
            <strong>{row.title}</strong>
            <span>{row.message}</span>
            <span>{longDate(row.created_at)}</span>
          </div>
          {row.read_at ? (
            <Badge>Lida</Badge>
          ) : (
            <Button
              variant="secondary"
              busy={marking === row.id}
              disabled={marking !== null}
              onClick={() => void markRead(row.id)}
            >
              Marcar como lida
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

function Devices() {
  const { data, reload, notify } = useRecords();
  return (
    <Card title="Seus aparelhos">
      <div className="entity-list">
        {(data.mobile_devices ?? []).map((row) => {
          const expired =
            Boolean(row.expires_at) &&
            new Date(String(row.expires_at).replace(" ", "T")) <= new Date();
          const status = row.revoked_at
            ? "Revogado"
            : expired
              ? "Expirado"
              : "Autorizado";
          return (
            <div className="entity-row" key={row.id}>
              <span className="entity-symbol">
                <Smartphone size={17} />
              </span>
              <div className="entity-main">
                <strong>{row.name || row.device_id}</strong>
                <span>{row.platform || "Aparelho móvel"}</span>
              </div>
              <Badge tone={status === "Autorizado" ? "positive" : "neutral"}>
                {status}
              </Badge>
              {status === "Autorizado" && (
                <Confirm
                  label={`Revogar ${row.name ?? row.device_id}`}
                  title="Revogar o acesso do aparelho?"
                  description="O aparelho deixará de ter acesso à conta."
                  onConfirm={async () => {
                    await api(
                      `/mobile_devices/${encodeURIComponent(row.id)}`,
                      "DELETE",
                    );
                    await reload();
                    notify("Acesso do aparelho revogado.");
                  }}
                >
                  Revogar
                </Confirm>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function Settings() {
  const { data } = useRecords();
  const [params, setParams] = useSearchParams();
  const tabs = [
    { id: "perfil", label: "Perfil" },
    { id: "regras", label: "Regras" },
    { id: "feedback", label: "Feedback" },
    { id: "avisos", label: "Avisos" },
    ...((data.mobile_devices ?? []).length
      ? [{ id: "aparelhos", label: "Aparelhos" }]
      : []),
  ];
  const active =
    tabs.find(({ id }) => id === params.get("aba"))?.id ?? "perfil";
  return (
    <>
      <PageHeading
        title="Configurações"
        description="Gerencie seu perfil, as regras de categorização e os avisos do Fluxo."
      />
      <nav className="area-tabs" aria-label="Configurações">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            className={active === id ? "active" : ""}
            aria-current={active === id ? "page" : undefined}
            onClick={() => setParams({ aba: id })}
          >
            {label}
          </button>
        ))}
      </nav>
      {active === "perfil" && <Profile />}
      {active === "regras" && <Rules />}
      {active === "feedback" && <Feedback />}
      {active === "avisos" && (
        <Card title="Avisos">
          <Notifications />
        </Card>
      )}
      {active === "aparelhos" && <Devices />}
    </>
  );
}
