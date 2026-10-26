import {
  useEffect,
  useState,
  type ReactNode,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import {
  BookOpen,
  ClipboardList,
  FlaskConical,
  LogOut,
  Menu,
  Settings2,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  getGetCurrentUserQueryKey,
  useGetCurrentUser,
} from "@workspace/api-client-react";
import type { AppActions } from "./actions";
export function Btn({
  children,
  onClick,
  kind = "primary",
  disabled,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: "primary" | "outline" | "quiet" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-testid={`button-${String(children)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}`}
      className={`btn btn-${kind} ${className}`}
    >
      {children}
    </button>
  );
}
export function Input({
  label,
  ...props
}: {
  label: string;
  "data-testid"?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        {...props}
        data-testid={
          props["data-testid"] ||
          `input-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
        }
      />
    </label>
  );
}
export function Area({
  label,
  ...props
}: {
  label: string;
  "data-testid"?: string;
} & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea
        {...props}
        data-testid={
          props["data-testid"] ||
          `textarea-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
        }
      />
    </label>
  );
}
export function SectionTitle({
  eyebrow,
  title,
  aside,
}: {
  eyebrow?: string;
  title: string;
  aside?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
      </div>
      {aside}
    </div>
  );
}
export function Status({ value }: { value?: string | null }) {
  const val = value || "brouillon";
  return (
    <span
      className={`status status-${val.toLowerCase().replace(/[^a-z]+/g, "-")}`}
    >
      {val.replaceAll("_", " ")}
    </span>
  );
}
export function Loading({
  label = "Chargement des données…",
}: {
  label?: string;
}) {
  return (
    <div className="loading-box" role="status">
      <span className="skeleton-line" />
      <span className="skeleton-line short" />
      <span>{label}</span>
    </div>
  );
}
export function ErrorBox({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="error-box" role="alert">
      <strong>Impossible de charger cette page.</strong>
      <p>{message}</p>
      {retry && (
        <Btn kind="outline" onClick={retry}>
          Réessayer
        </Btn>
      )}
    </div>
  );
}
export function Shell({
  children,
  user,
  actions,
}: {
  children: ReactNode;
  user?: { username: string; role: string };
  actions: AppActions;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();
  const active = (href: string) =>
    location === href || (href !== "/" && location.startsWith(href));
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Stethoscope size={20} />
          </span>
          <span>
            <b>PRC</b>
            <small>PHARMACIE</small>
          </span>
        </Link>
        <div className="side-label">ESPACE PÉDAGOGIQUE</div>
        <nav className="side-nav">
          <Link
            href="/"
            className={active("/") ? "nav-item selected" : "nav-item"}
            aria-current={active('/') ? 'page' : undefined}
            onClick={() => setMobileOpen(false)}
          >
            <ClipboardList size={17} />
            Vue d’ensemble
          </Link>
          <Link
            href="/prcs"
            aria-current={active('/prcs') || active('/prc/') ? 'page' : undefined}
            className={
              active("/prcs") || active("/prc/")
                ? "nav-item selected"
                : "nav-item"
            }
            onClick={() => setMobileOpen(false)}
          >
            <BookOpen size={17} />
            Mes PRC
          </Link>
          {user?.role === "admin" && (
            <Link
              href="/admin"
              className={active("/admin") ? "nav-item selected" : "nav-item"}
            >
              <Settings2 size={17} />
              Administration
            </Link>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="side-note">
            <ShieldCheck size={16} />
            <span>
              Données pédagogiques
              <br />à accès contrôlé
            </span>
          </div>
          {user && (
            <button
              className="account-row"
              onClick={() => actions.logout.mutate()}
              data-testid="button-logout"
            >
              <span className="avatar">
                {user.username.slice(0, 1).toUpperCase()}
              </span>
              <span className="account-copy">
                <b>{user.username}</b>
                <small>
                  {user.role === "admin" ? "Administration" : "Enseignant·e"}
                </small>
              </span>
              <LogOut size={16} />
            </button>
          )}
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <button
            className="mobile-menu"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Ouvrir le menu"
          >
            <Menu size={20} />
          </button>
          <div className="crumb">
            <span>PRC Pharmacie</span>
            <span className="crumb-sep">/</span>
            <span>
              {location === "/"
                ? "Espace enseignant"
                : location.startsWith("/admin")
                  ? "Administration"
                  : "Activité pédagogique"}
            </span>
          </div>
          <div className="top-meta">
            <span className="live-dot" /> Environnement sécurisé
          </div>
        </header>
        <div className="content page-enter">{children}</div>
        <footer className="footer">
          <span>PRC Pharmacie</span>
          <span>Outil pédagogique de raisonnement clinique</span>
          <span>© Faculté de pharmacie</span>
        </footer>
      </main>
    </div>
  );
}
export function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value?: number;
  icon: ReactNode;
}) {
  return (
    <div className="metric">
      <span className="metric-icon">{icon}</span>
      <span className="metric-val">{value ?? "—"}</span>
      <span className="metric-label">{label}</span>
    </div>
  );
}
export function Empty({
  title,
  copy,
  action,
}: {
  title: string;
  copy: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-mark">
        <FlaskConical size={20} />
      </span>
      <b>{title}</b>
      <p>{copy}</p>
      {action}
    </div>
  );
}
export function AuthenticatedPage({
  children,
  actions,
}: {
  children: ReactNode;
  actions: AppActions;
}) {
  const current = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey(), retry: false },
  });
  const [, setLocation] = useLocation();
  const denied =
    !current.data?.user ||
    (current.error as { status?: number } | null)?.status === 401;
  useEffect(() => {
    if (!current.isLoading && denied) setLocation("/login");
  }, [current.isLoading, denied, setLocation]);
  if (current.isLoading)
    return (
      <div className="auth-page">
        <Loading label="Vérification de la session…" />
      </div>
    );
  if (denied || !current.data?.user) return null;
  return (
    <Shell user={current.data.user} actions={actions}>
      {children}
    </Shell>
  );
}
