import { useEffect, useRef, useState } from "react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  CreditCard,
  Landmark,
  ListOrdered,
  LogOut,
  Moon,
  Sun,
  Tags,
  UserRound,
} from "lucide-react";
import { Brand } from "./brand";
import { Login } from "./login";
import { Button, IconButton, Loading, Notice } from "../design-system/ui";
import {
  api,
  ApiError,
  RecordsContext,
  type Records,
  type User,
} from "../features/records";

const pages = [
  {
    path: "/lancamentos",
    label: "Lançamentos",
    short: "Extrato",
    icon: ArrowLeftRight,
  },
  { path: "/contas", label: "Contas", icon: Landmark },
  { path: "/categorias", label: "Categorias", icon: Tags },
  { path: "/cartoes", label: "Cartões", icon: CreditCard },
  {
    path: "/parcelamentos",
    label: "Parcelamentos",
    short: "Parcelas",
    icon: ListOrdered,
  },
  { path: "/perfil", label: "Perfil", icon: UserRound },
];

function MenuLinks({ sidebar = false }: { sidebar?: boolean }) {
  return pages.map(({ path, icon: Icon, label, short }) => (
    <NavLink
      key={path}
      to={path}
      className={sidebar ? "nav-item" : undefined}
      title={label}
      aria-label={label}
    >
      <Icon size={sidebar ? 17 : 20} strokeWidth={1.8} />
      <span>{sidebar ? label : (short ?? label)}</span>
    </NavLink>
  ));
}

type Session = { user: User | null };
const sessionKey = ["session"];

export default function Shell() {
  const client = useQueryClient();
  const { pathname, search } = useLocation();
  const session = useQuery({
    queryKey: sessionKey,
    queryFn: () => api<Session>("/session"),
  });

  function updateUser(user: User | null) {
    client.setQueryData<Session>(sessionKey, { user });
    if (!user) client.removeQueries({ queryKey: ["records"] });
  }

  if (session.isPending)
    return (
      <div className="session-message">
        <Loading />
      </div>
    );
  if (session.isError && !session.data) {
    return (
      <div className="session-message">
        <Notice tone="error">
          {session.error.message}
          <Button variant="secondary" onClick={() => void session.refetch()}>
            Tentar novamente
          </Button>
        </Notice>
      </div>
    );
  }

  const user = session.data?.user;
  if (!user) {
    return pathname === "/entrar" ? (
      <Login onSuccess={updateUser} />
    ) : (
      <Navigate to="/entrar" replace state={{ from: pathname + search }} />
    );
  }
  if (pathname === "/entrar") return <ReturnToWorkspace />;
  return (
    <Workspace
      key={user.id}
      user={user}
      updateUser={updateUser}
      onLogout={async () => {
        await api("/logout", "POST");
        updateUser(null);
      }}
    />
  );
}

function ReturnToWorkspace() {
  const { state } = useLocation();
  const from = state?.from;
  const target =
    typeof from === "string" &&
    pages.some(({ path }) => path === from.split("?")[0])
      ? from
      : "/lancamentos";
  return <Navigate to={target} replace />;
}

function Workspace({
  user,
  updateUser,
  onLogout,
}: {
  user: User;
  updateUser: (user: User | null) => void;
  onLogout: () => Promise<void>;
}) {
  const { data, error, refetch } = useQuery({
    queryKey: ["records", user.id],
    queryFn: () => api<Records>("/data"),
  });
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [toast, setToast] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [theme, setTheme] = useState(
    document.documentElement.dataset.theme ?? "light",
  );

  useEffect(() => {
    main.current?.scrollTo({ top: 0 });
  }, [pathname]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) updateUser(null);
  }, [error, updateUser]);

  async function reload() {
    await refetch();
  }

  function notify(message: string) {
    setToast(message);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 4500);
  }

  async function logout() {
    setLoggingOut(true);
    try {
      await onLogout();
    } catch (failure) {
      notify(
        failure instanceof Error ? failure.message : "Não foi possível sair.",
      );
      setLoggingOut(false);
    }
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem("fluxo-ui:theme", next);
    } catch {
      // O tema ainda pode ser alterado nesta janela.
    }
  }

  const section = pages.find(({ path }) => path === pathname)?.label;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#conteudo">
        Ir para o conteúdo
      </a>
      <aside className="sidebar desktop-sidebar">
        <Brand />
        <nav className="sidebar-nav" aria-label="Menu principal">
          <div className="nav-group">
            <MenuLinks sidebar />
          </div>
        </nav>
      </aside>
      <div className="main-surface">
        <header className="topbar">
          <div className="topbar-left">
            <span className="breadcrumb">
              <span className="status-dot" /> Fluxo <span>/</span>{" "}
              <b>{section}</b>
            </span>
            <div className="mobile-brand">
              <Brand />
            </div>
          </div>
          <div className="topbar-actions">
            <IconButton
              label={
                theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"
              }
              onClick={toggleTheme}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </IconButton>
            <IconButton
              label="Sair"
              onClick={() => void logout()}
              disabled={loggingOut}
            >
              <LogOut size={18} />
            </IconButton>
          </div>
        </header>
        <main id="conteudo" ref={main} tabIndex={-1}>
          <div className="page-content">
            {error && (
              <Notice tone="error">
                {error.message}{" "}
                <Button variant="secondary" onClick={() => void reload()}>
                  Tentar novamente
                </Button>
              </Notice>
            )}
            {data ? (
              <RecordsContext.Provider
                value={{ data, user, updateUser, reload, notify }}
              >
                <Outlet />
              </RecordsContext.Provider>
            ) : (
              !error && <Loading />
            )}
          </div>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Navegação principal">
        <MenuLinks />
      </nav>
      {toast && (
        <div role="status" className="toast">
          <span className="status-dot" />
          {toast}
        </div>
      )}
    </div>
  );
}
