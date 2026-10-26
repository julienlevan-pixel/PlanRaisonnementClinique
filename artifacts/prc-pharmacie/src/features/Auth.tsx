import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, ShieldCheck, Brain } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useHealthCheck } from "@workspace/api-client-react";
import type { AppActions } from "../app/actions";
import { Btn, Input } from "../app/ui";
import { getError } from "../app/utils";
export function PasswordNotice({ actions }: { actions: AppActions }) {
  const [expanded, setExpanded] = useState(true);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="password-notice">
      <div>
        <b>Modification du mot de passe requise</b>
        <p>Choisissez un nouveau mot de passe pour sécuriser votre compte.</p>
      </div>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {expanded && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            actions.password.mutate(
              { data: { currentPassword: current, newPassword: next } },
              {
                onSuccess: () => setExpanded(false),
                onError: (e) => setError(getError(e)),
              },
            );
          }}
        >
          <Input
            label="Mot de passe actuel"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
          <Input
            label="Nouveau mot de passe (12 caractères minimum)"
            type="password"
            minLength={12}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
          <Btn type="submit" disabled={actions.password.isPending}>
            Mettre à jour
          </Btn>
        </form>
      )}
    </div>
  );
}
export function Login({ actions }: { actions: AppActions }) {
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const health = useHealthCheck();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    actions.login.mutate(
      { data: { username, password } },
      {
        onSuccess: () => setLocation("/"),
        onError: (err) => setError(getError(err)),
      },
    );
  };
  return (
    <div className="auth-page">
      <Link href="/" className="brand auth-brand">
        <span className="brand-mark">
          <Brain size={20} />
        </span>
        <span>
          <b>PRC</b>
          <small>PHARMACIE</small>
        </span>
      </Link>
      <div className="auth-card">
        <div className="eyebrow">ACCÈS ENSEIGNANT</div>
        <h1>Connexion</h1>
        <p>Connectez-vous à votre espace pédagogique.</p>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <form onSubmit={submit}>
          <Input
            label="Identifiant"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <Input
            label="Mot de passe"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Btn
            type="submit"
            className="full"
            disabled={actions.login.isPending}
          >
            {actions.login.isPending ? "Connexion…" : "Se connecter"}{" "}
            <ArrowRight size={16} />
          </Btn>
        </form>
        <div className="auth-secure">
          <ShieldCheck size={15} /> Session protégée{" "}
          <span className={health.data?.status === "ok" ? "health-ok" : ""}>
            {health.data?.status === "ok" ? "Service opérationnel" : ""}
          </span>
        </div>
      </div>
      <Link className="back-link" href="/">
        <ArrowLeft size={15} /> Retour à l’accueil
      </Link>
    </div>
  );
}
