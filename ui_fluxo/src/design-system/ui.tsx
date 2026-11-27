import {
  cloneElement,
  useId,
  useState,
  type ReactNode,
  type ReactElement,
  type ButtonHTMLAttributes,
} from "react";
import { Dialog as RDialog } from "radix-ui";
import { X, Plus, AlertCircle, Inbox, LoaderCircle } from "lucide-react";
import { money } from "../shared/format";
export function Button({
  children,
  variant = "primary",
  className = "",
  busy = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  busy?: boolean;
}) {
  return (
    <button
      className={`button ${variant} ${className}`}
      {...props}
      disabled={props.disabled || busy}
    >
      {busy ? <LoaderCircle className="spin" size={16} /> : null}
      {children}
    </button>
  );
}
export function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...props}
      aria-label={label}
      title={label}
      className={`icon-button ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}
export function PageHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </header>
  );
}
export function Card({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="card">
      {title && (
        <div className="card-heading">
          <div>
            <h2>{title}</h2>
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "positive" | "negative" | "warning" | "neutral" | "purple" | "blue";
}) {
  return (
    <span className={`badge ${tone}`}>
      <span className="badge-dot" />
      {children}
    </span>
  );
}
export function Metric({
  label,
  value,
  hint,
  icon,
  color = "#518FF1",
}: {
  label: string;
  value: number;
  hint: string;
  icon: ReactNode;
  color?: string;
}) {
  return (
    <div className="metric card">
      <div className="metric-top">
        <span
          className="metric-icon"
          style={{ color, background: `${color}18` }}
        >
          {icon}
        </span>
        <span>{label}</span>
      </div>
      <strong className="metric-value">{money(value)}</strong>
      <p className="metric-hint">{hint}</p>
    </div>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span>
        <Inbox size={25} />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "error" | "success";
}) {
  return (
    <div
      className={`notice ${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <AlertCircle size={17} />
      <div>{children}</div>
    </div>
  );
}
export function Loading() {
  return (
    <div
      aria-label="Carregando dados"
      aria-busy="true"
      className="loading-grid"
    >
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactElement<{
    "aria-labelledby"?: string;
    "aria-describedby"?: string;
  }>;
  hint?: string;
}) {
  const id = useId();
  return (
    <label className="field">
      <span id={id}>{label}</span>
      {cloneElement(children, {
        "aria-labelledby": id,
        "aria-describedby": hint ? id + "-hint" : undefined,
      })}
      {hint && <small id={id + "-hint"}>{hint}</small>}
    </label>
  );
}
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <RDialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <RDialog.Portal>
        <RDialog.Overlay className="dialog-overlay" />
        <RDialog.Content className="dialog-content">
          <div className="dialog-heading">
            <div>
              <RDialog.Title>{title}</RDialog.Title>
              <RDialog.Description>
                {description ?? "Confira os dados antes de continuar."}
              </RDialog.Description>
            </div>
            <RDialog.Close asChild>
              <IconButton label="Fechar">
                <X size={20} />
              </IconButton>
            </RDialog.Close>
          </div>
          {children}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
export function Confirm({
  label,
  title,
  description,
  onConfirm,
  danger = false,
  children,
}: {
  label: string;
  title: string;
  description: string;
  onConfirm: () => Promise<unknown>;
  danger?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <Button
        variant={danger ? "ghost" : "secondary"}
        aria-label={label}
        onClick={() => setOpen(true)}
      >
        {children ?? label}
      </Button>
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title={title}
        description={description}
      >
        {error && <Notice tone="error">{error}</Notice>}
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            busy={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await onConfirm();
                setOpen(false);
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Não foi possível concluir.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirmar
          </Button>
        </div>
      </Modal>
    </>
  );
}
export function AddButton({
  children = "Adicionar",
  onClick,
}: {
  children?: ReactNode;
  onClick: () => void;
}) {
  return (
    <Button onClick={onClick}>
      <Plus size={17} />
      {children}
    </Button>
  );
}
