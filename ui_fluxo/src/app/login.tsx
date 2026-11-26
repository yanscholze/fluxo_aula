import { useState, type FormEvent } from "react";
import { Brand } from "./brand";
import { Button, Field, Notice } from "../design-system/ui";
import { api, type User } from "../features/records";

export function Login({ onSuccess }: { onSuccess: (user: User) => void }) {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = Object.fromEntries(new FormData(event.currentTarget));
      const { user } = await api<{ user: User }>(
        register ? "/register" : "/login",
        "POST",
        body,
      );
      onSuccess(user);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Não foi possível entrar.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-story">
        <Brand />
        <div>
          <h1>Seu dinheiro em perspectiva.</h1>
          <p>Acompanhe contas, cartões e lançamentos em um só lugar.</p>
          <div className="login-orbit" aria-hidden="true">
            <span />
            <span />
            <i>f.</i>
          </div>
        </div>
      </div>
      <div className="login-form">
        <h2>{register ? "Crie sua conta" : "Entre no Fluxo"}</h2>
        <form
          className="record-stack login-fields"
          onSubmit={(event) => void submit(event)}
        >
          {register && (
            <Field label="Seu nome">
              <input
                name="display_name"
                autoComplete="name"
                maxLength={255}
                required
              />
            </Field>
          )}
          <Field label="E-mail">
            <input
              type="email"
              name="email"
              autoComplete="email"
              maxLength={255}
              required
            />
          </Field>
          <Field
            label="Senha"
            hint={register ? "Use pelo menos 8 caracteres." : undefined}
          >
            <input
              type="password"
              name="password"
              autoComplete={register ? "new-password" : "current-password"}
              minLength={register ? 8 : undefined}
              maxLength={255}
              required
            />
          </Field>
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" busy={busy}>
            {register ? "Criar conta" : "Entrar"}
          </Button>
        </form>
        <button
          className="text-link"
          type="button"
          disabled={busy}
          onClick={() => {
            setRegister(!register);
            setError("");
          }}
        >
          {register ? "Já tenho uma conta" : "Criar uma conta"}
        </button>
      </div>
    </main>
  );
}
