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
import { readMoney } from "../shared/format";

type Value = string | number | boolean | null;
export type Row = { id: string; [key: string]: Value };
export type User = { id: string; email: string; display_name: string };
export type Option = { value: string; label: string };
export type Column = { label: string; render: (row: Row) => ReactNode };
export type FieldSpec = {
  name: string;
  label: string;
  kind?:
    | "text"
    | "textarea"
    | "date"
    | "month"
    | "datetime"
    | "integer"
    | "decimal"
    | "money"
    | "checkbox"
    | "select";
  options?: Option[];
  required?: boolean;
  defaultValue?: string | number | boolean;
  min?: number;
  max?: number;
  maxLength?: number;
  scale?: number;
  hint?: string;
  hidden?: boolean;
  omitBlank?: boolean;
};
export type Fields = FieldSpec[] | ((row?: Row) => FieldSpec[]);
type RecordsState = {
  data: Record<string, Row[]>;
  user: User;
  reload: () => Promise<void>;
  notify: (message: string) => void;
};
export const RecordsContext = createContext<RecordsState | null>(null);

export function useRecords() {
  const context = useContext(RecordsContext);
  if (!context) throw new Error("Dados da sessão indisponíveis.");
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

export function options(records: Row[], label = "name"): Option[] {
  return records.map((row) => ({
    value: row.id,
    label: String(row[label] || row.id),
  }));
}

export function recordName(records: Row[], value: unknown) {
  return (
    records.find((row) => row.id === String(value))?.name ??
    String(value || "—")
  );
}

export function formatAmount(cents: unknown, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(
    Number(cents ?? 0) / 100,
  );
}

function inputValue(field: FieldSpec, value: Value | undefined): string {
  if (value == null) return String(field.defaultValue ?? "");
  if (field.kind === "money" || field.kind === "decimal") {
    const scale = field.kind === "money" ? 2 : (field.scale ?? 0);
    return (Number(value) / 10 ** scale).toFixed(scale).replace(".", ",");
  }
  if (field.kind === "datetime")
    return String(value).replace(" ", "T").slice(0, 16);
  if (field.kind === "date") return String(value).slice(0, 10);
  return String(value);
}

function normalize(field: FieldSpec, value: Value): Value {
  if (field.kind === "checkbox") return Boolean(value);
  const text = String(value ?? "").trim();
  if (!text) {
    if (field.required) throw new Error(`Preencha o campo ${field.label}.`);
    return null;
  }
  if (field.kind === "datetime") return text.replace("T", " ") + ":00";
  if (field.kind === "money") {
    const cents = readMoney(text);
    if (
      (field.min !== undefined && cents < field.min * 100) ||
      (field.max !== undefined && cents > field.max * 100)
    ) {
      throw new Error(`Informe um valor válido em ${field.label}.`);
    }
    return cents;
  }
  if (field.kind === "integer" || field.kind === "decimal") {
    const value = Number(text.replace(",", "."));
    const scaled = Math.round(value * 10 ** (field.scale ?? 0));
    if (
      !/^-?\d+(?:[.,]\d+)?$/.test(text) ||
      !Number.isSafeInteger(scaled) ||
      (field.kind === "integer" && !Number.isInteger(value)) ||
      (field.min !== undefined && value < field.min) ||
      (field.max !== undefined && value > field.max)
    ) {
      throw new Error(`Informe um número válido em ${field.label}.`);
    }
    return scaled;
  }
  return text;
}

export function RecordEditor({
  resource,
  singular,
  fields,
  row,
  onClose,
  wide,
}: {
  resource: string;
  singular: string;
  fields: Fields;
  row?: Row;
  onClose: () => void;
  wide?: boolean;
}) {
  const { reload, notify } = useRecords();
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const record = { id: row?.id ?? "", ...row, ...values };
  const activeFields = typeof fields === "function" ? fields(record) : fields;

  function fieldValue(field: FieldSpec): Value {
    if (field.hidden) return null;
    if (Object.hasOwn(values, field.name)) return values[field.name];
    if (field.kind === "checkbox")
      return Boolean(row?.[field.name] ?? field.defaultValue ?? false);
    return inputValue(field, row?.[field.name]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = Object.fromEntries(
        activeFields
          .filter((field) => row || !field.omitBlank || fieldValue(field))
          .map((field) => {
            const previous = row?.[field.name];
            const unchangedDate =
              previous != null &&
              !field.hidden &&
              !Object.hasOwn(values, field.name) &&
              (field.kind === "date" || field.kind === "datetime");
            return [
              field.name,
              unchangedDate ? previous : normalize(field, fieldValue(field)),
            ];
          }),
      );
      await api(
        "/" + resource + (row ? "/" + encodeURIComponent(row.id) : ""),
        row ? "PUT" : "POST",
        payload,
      );
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
      wide={wide}
      title={row ? `Editar ${singular}` : `Adicionar ${singular}`}
      description="Preencha os campos e salve o registro."
    >
      <form onSubmit={(event) => void submit(event)}>
        <div className="form-grid">
          {activeFields
            .filter((field) => !field.hidden)
            .map((field) => {
              const value = fieldValue(field);
              const change = (value: string | boolean) =>
                setValues((old) => ({ ...old, [field.name]: value }));
              const text = String(value ?? "");
              return (
                <Field key={field.name} label={field.label} hint={field.hint}>
                  {field.kind === "checkbox" ? (
                    <input
                      type="checkbox"
                      checked={Boolean(value)}
                      onChange={(event) => change(event.target.checked)}
                    />
                  ) : field.kind === "select" ? (
                    <select
                      value={text}
                      required={field.required}
                      onChange={(event) => change(event.target.value)}
                    >
                      <option value="">
                        {field.required ? "Selecione" : "—"}
                      </option>
                      {text &&
                        !field.options?.some(
                          (option) => option.value === text,
                        ) && <option value={text}>{text}</option>}
                      {field.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : field.kind === "textarea" ? (
                    <textarea
                      required={field.required}
                      value={text}
                      maxLength={field.maxLength}
                      onChange={(event) => change(event.target.value)}
                    />
                  ) : (
                    <input
                      type={
                        field.kind === "datetime"
                          ? "datetime-local"
                          : field.kind === "integer"
                            ? "number"
                            : field.kind === "date" || field.kind === "month"
                              ? field.kind
                              : "text"
                      }
                      inputMode={
                        field.kind === "money" || field.kind === "decimal"
                          ? "decimal"
                          : undefined
                      }
                      required={field.required}
                      value={text}
                      min={field.kind === "integer" ? field.min : undefined}
                      max={field.kind === "integer" ? field.max : undefined}
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
  subtitle,
  singular,
  fields,
  columns,
  canCreate = Boolean(fields),
  canEdit = Boolean(fields),
  canDelete = Boolean(fields),
  actions,
  wide,
}: {
  resource: string;
  records: Row[];
  title?: string;
  subtitle?: string;
  singular: string;
  fields?: Fields;
  columns: Column[];
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  actions?: (row: Row) => ReactNode;
  wide?: boolean;
}) {
  const { reload, notify } = useRecords();
  const [editor, setEditor] = useState<Row | "new" | null>(null);
  const hasActions = canEdit || canDelete || Boolean(actions);
  const add = canCreate && (
    <AddButton onClick={() => setEditor("new")}>Adicionar {singular}</AddButton>
  );

  return (
    <Card title={title} subtitle={subtitle} action={add}>
      {!title && add && <div className="toolbar">{add}</div>}
      {records.length ? (
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label={title ?? singular}
        >
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.label} scope="col">
                    {column.label}
                  </th>
                ))}
                {hasActions && <th scope="col">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {records.map((row) => (
                <tr key={row.id}>
                  {columns.map((column) => (
                    <td key={column.label}>{column.render(row)}</td>
                  ))}
                  {hasActions && (
                    <td>
                      <div className="row-actions">
                        {actions?.(row)}
                        {canEdit && (
                          <Button
                            variant="ghost"
                            aria-label={`Editar ${singular}`}
                            onClick={() => setEditor(row)}
                          >
                            <Pencil size={16} />
                          </Button>
                        )}
                        {canDelete && (
                          <Confirm
                            label={`Excluir ${singular}`}
                            title="Excluir registro"
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
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="Nenhum registro"
          description="Os registros desta lista aparecerão aqui."
        />
      )}
      {records.length > 0 && columns.length >= 4 && (
        <small className="table-hint">Deslize para ver mais colunas.</small>
      )}
      {editor && fields && (
        <RecordEditor
          resource={resource}
          singular={singular}
          fields={fields}
          row={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
          wide={wide}
        />
      )}
    </Card>
  );
}
