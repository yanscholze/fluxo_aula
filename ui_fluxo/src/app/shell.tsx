import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router";
import { LayoutGroup, m, useReducedMotion } from "motion/react";
import { Dialog } from "radix-ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  CreditCard,
  Inbox,
  Landmark,
  LayoutDashboard,
  ListFilter,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plane,
  Plus,
  Settings,
  Sparkles,
  Sun,
  Tags,
  X,
} from "lucide-react";
import { Brand } from "./brand";
import { Login } from "./login";
import { usePanelScroll } from "./use-panel-scroll";
import {
  Button,
  IconButton,
  Loading,
  Modal,
  Notice,
} from "../design-system/ui";
import { Notifications } from "../features/secondary";
import { transactionFields } from "../features/finance-fields";
import {
  api,
  ApiError,
  RecordEditor,
  RecordsContext,
  type Row,
  type User,
} from "../features/records";
import { ColorTransition } from "../motion/color-transition";
import { PageReady, useColorNavigation } from "../motion/navigation";
import { MotionScene } from "../motion/scene";

const groups = [
  {
    label: "Seu espaço",
    items: [
      { to: "/painel", label: "Painel", icon: LayoutDashboard },
      { to: "/relatorios", label: "Relatórios", icon: ChartNoAxesCombined },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { to: "/lancamentos", label: "Lançamentos", icon: ArrowLeftRight },
      { to: "/contas", label: "Contas", icon: Landmark },
      { to: "/cartoes", label: "Cartões", icon: CreditCard },
      { to: "/categorias", label: "Categorias", icon: Tags },
      { to: "/planejamento", label: "Compromissos", icon: CalendarDays },
      { to: "/parcelamentos", label: "Parcelamentos", icon: ListFilter },
    ],
  },
  {
    label: "Organização",
    items: [
      { to: "/viagens", label: "Viagens", icon: Plane },
      { to: "/recompensas", label: "Recompensas", icon: Sparkles },
      { to: "/automaticos", label: "Capturas", icon: Inbox },
    ],
  },
];
const settings = {
  to: "/configuracoes",
  label: "Configurações",
  icon: Settings,
};
const sessionKey = ["session"];

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const id = useId();
  return (
    <>
      <Brand onClick={onNavigate} />
      <LayoutGroup id={id}>
        <div className="sidebar-nav">
          {groups.map(({ label, items }) => (
            <div className="nav-group" key={label}>
              <h2>{label}</h2>
              {items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  to={to}
                  key={to}
                  title={label}
                  aria-label={label}
                  className="nav-item"
                  onClick={onNavigate}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <m.span
                          className="nav-color-pill"
                          layoutId="active-navigation"
                        />
                      )}
                      <Icon size={17} strokeWidth={1.8} />
                      <span>{label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </div>
      </LayoutGroup>
    </>
  );
}

export default function Shell() {
  const client = useQueryClient();
  const location = useLocation();
  const session = useQuery({
    queryKey: sessionKey,
    queryFn: () => api<{ user: User | null }>("/session"),
  });
  const user = session.data?.user;
  const recordsKey = ["records", user?.id];
  const records = useQuery({
    queryKey: recordsKey,
    queryFn: () => api<Record<string, Row[]>>("/data"),
    enabled: Boolean(user),
  });
  const expired =
    records.error instanceof ApiError && records.error.status === 401;
  const reload = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: recordsKey }),
      client.invalidateQueries({ queryKey: sessionKey }),
    ]);
  };

  useEffect(() => {
    if (expired) client.setQueryData(sessionKey, { user: null });
  }, [client, expired]);

  if (session.isPending)
    return (
      <div className="load-error">
        <Loading />
      </div>
    );
  if (session.isError && !session.data) {
    return (
      <div className="load-error">
        <Notice tone="error">{session.error.message}</Notice>
        <Button onClick={() => void session.refetch()}>Tentar novamente</Button>
      </div>
    );
  }
  if (!user || expired) {
    if (location.pathname !== "/entrar")
      return <Navigate replace to="/entrar" />;
    return (
      <Login
        onSuccess={(user) => {
          client.removeQueries({ queryKey: ["records"] });
          client.setQueryData(sessionKey, { user });
        }}
      />
    );
  }
  if (location.pathname === "/entrar") return <Navigate replace to="/painel" />;
  return (
    <Workspace
      user={user}
      data={records.data}
      error={records.error?.message}
      reload={reload}
      onLogout={async () => {
        await api("/logout", "POST");
        client.setQueryData(sessionKey, { user: null });
        client.removeQueries({ queryKey: ["records"] });
      }}
    />
  );
}

function Workspace({
  user,
  data,
  error,
  reload,
  onLogout,
}: {
  user: User;
  data?: Record<string, Row[]>;
  error?: string;
  reload: () => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const color = useColorNavigation(navigate, reduced);
  const scroll = usePanelScroll(location.key, color.ready);
  const [theme, setTheme] = useState(
    document.documentElement.dataset.theme ?? "light",
  );
  const [collapsed, setCollapsed] = useState(false);
  const [menu, setMenu] = useState(false);
  const [notices, setNotices] = useState(false);
  const [editor, setEditor] = useState(false);
  const [toast, setToast] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useCallback((message: string) => {
    setToast(message);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 4500);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem("fluxo-ui:theme", next);
    } catch {
      /* Aplique o tema nesta janela. */
    }
  }

  function interceptNavigation(event: MouseEvent<HTMLDivElement>) {
    if (
      reduced ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.defaultPrevented
    )
      return;
    const anchor = (event.target as Element).closest<HTMLAnchorElement>(
      "a[href]",
    );
    if (!anchor || anchor.hasAttribute("download") || anchor.target) return;
    const url = new URL(anchor.href);
    if (
      url.origin !== window.location.origin ||
      url.pathname === location.pathname
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = anchor.getBoundingClientRect();
    color.start(
      event.detail > 0
        ? { x: event.clientX, y: event.clientY }
        : {
            x: bounds.left + bounds.width / 2,
            y: bounds.top + bounds.height / 2,
          },
      url.pathname + url.search + url.hash,
    );
  }

  const section = [...groups.flatMap((group) => group.items), settings].find(
    ({ to }) => to === location.pathname,
  )?.label;
  return (
    <RecordsContext.Provider value={{ data: data ?? {}, user, reload, notify }}>
      <div
        className={`app-shell${collapsed ? " collapsed" : ""}`}
        onClickCapture={interceptNavigation}
      >
        {color.transition && (
          <ColorTransition
            key={color.transition.id}
            origin={color.transition.origin}
            phase={color.transition.phase}
            onCovered={() => {
              setMenu(false);
              color.covered(color.transition!.id);
            }}
            onComplete={() => color.complete(color.transition!.id)}
          />
        )}
        <a className="skip-link" href="#conteudo">
          Ir para o conteúdo
        </a>
        <aside className="sidebar desktop-sidebar" aria-label="Menu principal">
          <Navigation />
          <div className="sidebar-bottom">
            <NavLink
              className="nav-item"
              to={settings.to}
              aria-label={settings.label}
            >
              <Settings size={17} />
              <span>{settings.label}</span>
            </NavLink>
            <Link to={settings.to} className="sidebar-profile">
              <span className="avatar">
                {user.display_name.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <strong>{user.display_name}</strong>
                <small>Meu perfil</small>
              </div>
            </Link>
          </div>
          <IconButton
            label={collapsed ? "Expandir menu" : "Recolher menu"}
            className="collapse-button"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <PanelLeftOpen size={15} />
            ) : (
              <PanelLeftClose size={15} />
            )}
          </IconButton>
        </aside>
        <div className="main-surface">
          <header className="topbar">
            <div className="topbar-left">
              <IconButton
                className="mobile-menu"
                label="Abrir menu"
                onClick={() => setMenu(true)}
              >
                <Menu size={21} />
              </IconButton>
              <span className="breadcrumb">
                <span className="status-dot" /> Seu espaço financeiro{" "}
                <span>/</span> <b>{section}</b>
              </span>
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
                label="Notificações"
                className="notification-button"
                onClick={() => setNotices(true)}
              >
                <Bell size={19} />
                {data?.app_notifications?.some((row) => !row.read_at) && <i />}
              </IconButton>
              <IconButton
                label="Sair"
                onClick={() =>
                  void onLogout().catch((error: Error) => notify(error.message))
                }
              >
                <LogOut size={18} />
              </IconButton>
            </div>
          </header>
          <main
            id="conteudo"
            ref={scroll.ref}
            onScroll={scroll.remember}
            tabIndex={-1}
          >
            <PageReady routeKey={location.key} onReady={scroll.restore}>
              <MotionScene key={location.pathname} replay={color.replay}>
                <div className="page-content">
                  {error && (
                    <Notice tone="error">
                      {error}{" "}
                      <Button variant="secondary" onClick={() => void reload()}>
                        Tentar novamente
                      </Button>
                    </Notice>
                  )}
                  {data ? <Outlet /> : error ? null : <Loading />}
                </div>
              </MotionScene>
            </PageReady>
          </main>
        </div>
        <nav className="bottom-nav" aria-label="Navegação rápida">
          <NavLink to="/painel">
            <LayoutDashboard size={20} />
            <span>Painel</span>
          </NavLink>
          <NavLink to="/lancamentos">
            <ArrowLeftRight size={20} />
            <span>Movimentos</span>
          </NavLink>
          <button
            className="quick-add"
            aria-label="Novo lançamento"
            disabled={!data}
            onClick={() => setEditor(true)}
          >
            <Plus size={24} />
          </button>
          <NavLink to="/cartoes">
            <CreditCard size={20} />
            <span>Cartões</span>
          </NavLink>
          <button onClick={() => setMenu(true)} aria-label="Abrir menu">
            <Menu size={20} />
            <span>Menu</span>
          </button>
        </nav>
        <Dialog.Root open={menu} onOpenChange={setMenu}>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="mobile-drawer">
              <Dialog.Title className="sr-only">Menu principal</Dialog.Title>
              <Dialog.Description className="sr-only">
                Áreas do Fluxo.
              </Dialog.Description>
              <Dialog.Close asChild>
                <IconButton label="Fechar menu" className="drawer-close">
                  <X size={20} />
                </IconButton>
              </Dialog.Close>
              <Navigation onNavigate={() => setMenu(false)} />
              <NavLink
                className="nav-item"
                to={settings.to}
                onClick={() => setMenu(false)}
              >
                <Settings size={18} /> Configurações
              </NavLink>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <Modal
          open={notices}
          onClose={() => setNotices(false)}
          title="Notificações"
          description="Avisos da sua conta."
        >
          {data && <Notifications />}
        </Modal>
        {editor && data && (
          <RecordEditor
            resource="transactions"
            singular="lançamento"
            fields={transactionFields(data)}
            onClose={() => setEditor(false)}
            wide
          />
        )}
        {toast && (
          <div role="status" className="toast">
            <span className="status-dot" />
            {toast}
          </div>
        )}
      </div>
    </RecordsContext.Provider>
  );
}
