import {
  createContext,
  useContext,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  AddButton,
  Button,
  Card,
  Confirm,
  Empty,
  Field,
  Modal,
  Notice,
} from "../design-system/ui";
import { inputMoney, money, readMoney } from "../shared/format";

type Value = string | number | boolean | null;
export type User = {
  id: string;
  email: string;
  display_name: string;
  avatar_data: string | null;
};
export type Row = { id: string; [key: string]: Value };
export type Records = {
  accounts: Row[];
  categories: Row[];
  cards: Row[];
  transactions: Row[];
  installment_groups: Row[];
};
type Resource = Exclude<keyof Records, "installment_groups">;
export type Option = { value: string; label: string };
export type Column = { label: string; render: (row: Row) => ReactNode };
export type FieldSpec = {
  name: string;
  label: string;
  kind?:
    | "text"
    | "date"
    | "month"
    | "money"
    | "integer"
    | "decimal"
    | "select"
    | "checkbox";
  options?: Option[];
  required?: boolean;
  defaultValue?: string;
  min?: number;
  max?: number;
  scale?: number;
  hint?: string;
  maxLength?: number;
  hidden?: boolean;
};
export type Fields = FieldSpec[] | ((draft: Row) => FieldSpec[]);

type RecordsState = {
  data: Records;
  user: User;
  updateUser: (user: User) => void;
  reload: () => Promise<void>;
  notify: (message: string) => void;
};
export const RecordsContext = createContext<RecordsState | null>(null);

export function useRecords() {
  const context = useContext(RecordsContext);
  if (!context) throw new Error("Dados indisponíveis.");
  return context;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  }).catch(() => {
    throw new Error("Não foi possível conectar ao Fluxo.");
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      result?.error ?? "Não foi possível concluir a solicitação.",
    );
  }
  return result as T;
}

export function options(records: Row[]): Option[] {
  return records.map((row) => ({ value: row.id, label: String(row.name) }));
}

export function recordName(records: Row[], value: Value) {
  return records.find((row) => row.id === value)?.name ?? "—";
}

export function formatAmount(cents: Value | undefined, currency = "BRL") {
  return money(Number(cents ?? 0), currency);
}

function inputValue(
  field: FieldSpec,
  previous: Value | undefined,
  changed: string | undefined,
) {
  if (field.hidden) return "";
  if (field.kind === "checkbox") return changed ?? (previous ? "1" : "");
  const text = changed ?? storedValue(field, previous);
  if (
    field.kind === "select" &&
    !field.options?.some(({ value }) => value === text)
  )
    return "";
  return text;
}

function storedValue(field: FieldSpec, previous: Value | undefined) {
  if (previous == null) return field.defaultValue ?? "";
  if (field.kind === "date") return String(previous).slice(0, 10);
  if (field.kind === "money") return inputMoney(Number(previous));
  if (field.kind === "decimal") {
    const scale = field.scale ?? 0;
    return (Number(previous) / 10 ** scale).toFixed(scale).replace(".", ",");
  }
  return String(previous);
}

function normalize(field: FieldSpec, value: string): Value {
  if (field.kind === "checkbox") return Boolean(value);
  const text = value.trim();
  if (!text) {
    if (field.required && !field.hidden)
      throw new Error(`Preencha o campo ${field.label}.`);
    return null;
  }

  if (
    field.kind === "money" ||
    field.kind === "integer" ||
    field.kind === "decimal"
  ) {
    const scale = field.kind === "money" ? 2 : (field.scale ?? 0);
    const numeric =
      field.kind === "money"
        ? readMoney(text)
        : Number(text.replace(",", ".")) * 10 ** scale;
    const scaled = Math.round(numeric);
    const value = scaled / 10 ** scale;
    const format = field.kind === "integer" ? /^-?\d+$/ : /^-?\d+(?:[,.]\d+)?$/;
    if (
      (field.kind !== "money" && !format.test(text)) ||
      !Number.isSafeInteger(scaled) ||
      (field.min !== undefined && value < field.min) ||
      (field.max !== undefined && value > field.max)
    ) {
      throw new Error(`Informe um valor válido em ${field.label}.`);
    }
    return scaled;
  }
  return text;
}

function RecordEditor({
  resource,
  singular,
  fields,
  row,
  onClose,
}: {
  resource: Resource;
  singular: string;
  fields: Fields;
  row?: Row;
  onClose: () => void;
}) {
  const { reload, notify } = useRecords();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const draft = { id: "", ...row, ...values };
  const activeFields = typeof fields === "function" ? fields(draft) : fields;
  const valueOf = (field: FieldSpec) =>
    inputValue(field, row?.[field.name], values[field.name]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = Object.fromEntries(
        activeFields.map((field) => {
          const previous = row?.[field.name];
          const unchangedDate =
            field.kind === "date" &&
            previous != null &&
            !Object.hasOwn(values, field.name);
          return [
            field.name,
            unchangedDate ? previous : normalize(field, valueOf(field)),
          ];
        }),
      );
      const path =
        "/" + resource + (row ? "/" + encodeURIComponent(row.id) : "");
      await api(path, row ? "PUT" : "POST", payload);
      await reload();
      notify("Registro salvo.");
      onClose();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Não foi possível salvar.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title={row ? `Editar ${singular}` : `Adicionar ${singular}`}
      description="Preencha os campos e salve o registro."
    >
      <form onSubmit={(event) => void submit(event)}>
        <div className="form-grid">
          {activeFields
            .filter((field) => !field.hidden)
            .map((field) => {
              const value = valueOf(field);
              const change = (next: string) =>
                setValues((old) => ({ ...old, [field.name]: next }));
              return (
                <Field key={field.name} label={field.label} hint={field.hint}>
                  {field.kind === "checkbox" ? (
                    <input
                      type="checkbox"
                      checked={Boolean(value)}
                      onChange={(event) =>
                        change(event.target.checked ? "1" : "")
                      }
                    />
                  ) : field.kind === "select" ? (
                    <select
                      value={value}
                      required={field.required}
                      onChange={(event) => change(event.target.value)}
                    >
                      <option value="">
                        {field.required ? "Selecione" : "—"}
                      </option>
                      {field.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={
                        field.kind === "date" || field.kind === "month"
                          ? field.kind
                          : field.kind === "integer"
                            ? "number"
                            : "text"
                      }
                      inputMode={
                        field.kind === "money" || field.kind === "decimal"
                          ? "decimal"
                          : undefined
                      }
                      min={field.kind === "integer" ? field.min : undefined}
                      max={field.kind === "integer" ? field.max : undefined}
                      required={field.required}
                      value={value}
                      maxLength={field.maxLength}
                      onChange={(event) => change(event.target.value)}
                    />
                  )}
                </Field>
              );
            })}
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="dialog-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button type="submit" busy={busy}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function RecordList({
  resource,
  records,
  title,
  singular,
  addLabel,
  fields,
  columns,
  canCreate = true,
  toolbar,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: {
  resource: Resource;
  records: Row[];
  title: string;
  singular: string;
  addLabel?: string;
  fields: Fields;
  columns: Column[];
  canCreate?: boolean;
  toolbar?: ReactNode;
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
}) {
  const { reload, notify } = useRecords();
  const [editor, setEditor] = useState<Row | "new" | null>(null);
  const add = canCreate && (
    <AddButton onClick={() => setEditor("new")}>
      {addLabel ?? `Adicionar ${singular}`}
    </AddButton>
  );

  return (
    <Card title={title} action={add}>
      {toolbar}
      {records.length ? (
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label={title}
        >
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.label} scope="col">
                    {column.label}
                  </th>
                ))}
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody>
              {records.map((row) => (
                <tr key={row.id}>
                  {columns.map((column) => (
                    <td key={column.label}>{column.render(row)}</td>
                  ))}
                  <td>
                    <div className="row-actions">
                      <Button
                        variant="ghost"
                        aria-label={`Editar ${singular}`}
                        onClick={() => setEditor(row)}
                      >
                        <Pencil size={16} />
                      </Button>
                      <Confirm
                        label={`Excluir ${singular}`}
                        title={`Excluir ${singular}`}
                        description="O registro será removido."
                        danger
                        onConfirm={async () => {
                          await api(
                            `/${resource}/${encodeURIComponent(row.id)}`,
                            "DELETE",
                          );
                          await reload();
                          notify("Registro excluído.");
                        }}
                      >
                        <Trash2 size={16} />
                      </Confirm>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      )}
      {records.length > 0 && columns.length >= 4 && (
        <small className="table-hint">Deslize para ver mais colunas.</small>
      )}
      {editor && (
        <RecordEditor
          resource={resource}
          singular={singular}
          fields={fields}
          row={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
        />
      )}
    </Card>
  );
}
