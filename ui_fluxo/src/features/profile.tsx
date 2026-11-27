import { useState, type FormEvent } from "react";
import { Button, Card, Field, Notice, PageHeading } from "../design-system/ui";
import { api, useRecords, type User } from "./records";

const avatarTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];

function readAvatar(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
}

export function Profile() {
  const { user, updateUser, notify } = useRecords();
  const [name, setName] = useState(user.display_name);
  const [avatar, setAvatar] = useState(user.avatar_data);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const changed =
    avatar !== user.avatar_data || name.trim() !== user.display_name;

  async function selectAvatar(file: File) {
    setError("");
    if (!avatarTypes.includes(file.type) || file.size > 256_000) {
      setError("Escolha uma imagem PNG, JPEG, WebP ou GIF de até 250 KB.");
      return;
    }
    setReading(true);
    try {
      setAvatar(await readAvatar(file));
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Não foi possível ler a imagem.",
      );
    } finally {
      setReading(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const reply = await api<{ user: User }>("/profile", "PATCH", {
        display_name: name.trim(),
        ...(avatar !== user.avatar_data ? { avatar_data: avatar } : {}),
      });
      updateUser(reply.user);
      setName(reply.user.display_name);
      setAvatar(reply.user.avatar_data);
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
    <>
      <PageHeading
        title="Perfil"
        description="Atualize o nome e a foto da sua conta."
      />
      <Card title="Seus dados">
        <div className="profile-preview">
          {avatar ? (
            <img className="profile-avatar" src={avatar} alt="Foto de perfil" />
          ) : (
            <span className="profile-avatar" aria-hidden="true">
              {(name.trim() || user.display_name).slice(0, 1).toUpperCase()}
            </span>
          )}
          <div>
            <strong>{name.trim() || user.display_name}</strong>
            <p>{user.email}</p>
          </div>
        </div>
        <form
          className="record-stack profile-form"
          onSubmit={(event) => void save(event)}
        >
          <Field label="Nome de exibição">
            <input
              autoComplete="name"
              required
              maxLength={255}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field
            label="Foto de perfil"
            hint="PNG, JPEG, WebP ou GIF de até 250 KB."
          >
            <input
              type="file"
              accept={avatarTypes.join(",")}
              disabled={reading || saving}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void selectAvatar(file);
              }}
            />
          </Field>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="profile-actions">
            {avatar && (
              <Button
                type="button"
                variant="secondary"
                disabled={reading || saving}
                onClick={() => setAvatar(null)}
              >
                Remover foto
              </Button>
            )}
            <Button
              type="submit"
              busy={saving}
              disabled={reading || !name.trim() || !changed}
            >
              Salvar perfil
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
