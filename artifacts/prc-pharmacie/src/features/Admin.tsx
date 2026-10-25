import { useState, type FormEvent } from "react";
import { Plus, KeyRound } from "lucide-react";
import {
  getGetCurrentUserQueryKey,
  getListTeachersQueryKey,
  useGetCurrentUser,
  useListTeachers,
} from "@workspace/api-client-react";
import type { AppActions } from "../app/actions";
import {
  AuthenticatedPage,
  Btn,
  ErrorBox,
  Input,
  Loading,
  SectionTitle,
  Status,
} from "../app/ui";
import { getError } from "../app/utils";

export function Admin({ actions }: { actions: AppActions }) {
  const current = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey() },
  });
  const teachers = useListTeachers({
    query: {
      queryKey: getListTeachersQueryKey(),
      enabled:
        current.data?.user.role === "admin" &&
        !current.data.user.mustChangePassword,
    },
  });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  if (current.data?.user.role !== "admin")
    return (
      <AuthenticatedPage actions={actions}>
        <ErrorBox message="Cette page est réservée aux comptes administrateurs." />
      </AuthenticatedPage>
    );
  if (current.data.user.mustChangePassword)
    return (
      <AuthenticatedPage actions={actions}>
        <ErrorBox message="Changez votre mot de passe initial depuis le tableau de bord avant de gérer les accès." />
      </AuthenticatedPage>
    );
  const clearMessage = () => {
    setError("");
    setNotice("");
  };
  const create = (e: FormEvent) => {
    e.preventDefault();
    clearMessage();
    actions.createTeacher.mutate(
      { data: { username: username.trim(), password } },
      {
        onSuccess: () => {
          setUsername("");
          setPassword("");
          setNotice(
            "Compte enseignant créé. Le mot de passe devra être changé à la première connexion.",
          );
        },
        onError: (e) => setError(getError(e)),
      },
    );
  };
  const reset = (e: FormEvent) => {
    e.preventDefault();
    if (!resetId) return;
    clearMessage();
    actions.updateTeacher.mutate(
      { teacherId: resetId, data: { password: resetPassword } },
      {
        onSuccess: () => {
          setResetPassword("");
          setResetId(null);
          setNotice(
            "Mot de passe réinitialisé. Toutes les anciennes sessions de ce compte sont invalidées.",
          );
        },
        onError: (e) => setError(getError(e)),
      },
    );
  };
  const selected = teachers.data?.find((t) => t.id === resetId);
  return (
    <AuthenticatedPage actions={actions}>
      <SectionTitle
        eyebrow="GESTION FERMÉE DES ACCÈS"
        title="Administration des comptes"
      />
      <p className="intro-copy">
        Vous créez les accès enseignants. Les experts et les étudiants
        rejoignent leurs activités sans compte enseignant.
      </p>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <p className="save-status" role="status">
          {notice}
        </p>
      )}
      <div className="admin-grid">
        <section className="panel-card">
          <h2>Créer un compte enseignant</h2>
          <form onSubmit={create}>
            <Input
              label="Identifiant"
              minLength={3}
              maxLength={80}
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <Input
              label="Mot de passe provisoire (12 caractères minimum)"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={200}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Btn type="submit" disabled={actions.createTeacher.isPending}>
              <Plus size={15} /> Créer le compte
            </Btn>
          </form>
          {selected && (
            <form
              onSubmit={reset}
              className="panel-card"
              aria-label="Réinitialiser un mot de passe"
            >
              <h3>Réinitialiser l’accès de {selected.username}</h3>
              <p>
                Le compte conserve ses PRC et ses résultats. Ses sessions seront
                fermées et un changement de mot de passe sera demandé.
              </p>
              <Input
                label="Nouveau mot de passe provisoire"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={200}
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                required
              />
              <Btn type="submit" disabled={actions.updateTeacher.isPending}>
                Confirmer la réinitialisation
              </Btn>{" "}
              <Btn
                kind="quiet"
                onClick={() => {
                  setResetId(null);
                  setResetPassword("");
                }}
              >
                Annuler
              </Btn>
            </form>
          )}
        </section>
        <section className="panel-card">
          <h2>Comptes autorisés</h2>
          {teachers.isLoading ? (
            <Loading />
          ) : teachers.isError ? (
            <ErrorBox
              message="La liste des comptes est indisponible."
              retry={() => teachers.refetch()}
            />
          ) : (
            <div className="teacher-list">
              {teachers.data?.map((t) => (
                <div
                  className="teacher-row"
                  key={t.id}
                  style={{ flexWrap: "wrap", gap: 12 }}
                >
                  <span className="avatar">
                    {t.username.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="teacher-name">
                    <b>{t.username}</b>
                    <small>
                      {t.role === "admin" ? "Administrateur" : "Enseignant"}
                      {t.mustChangePassword
                        ? " · Changement de mot de passe requis"
                        : ""}
                    </small>
                  </span>
                  <Status value={t.active ? "actif" : "suspendu"} />
                  {t.id === current.data?.user.id ? (
                    <small>Votre compte</small>
                  ) : (
                    <>
                      <Btn
                        kind="outline"
                        disabled={actions.updateTeacher.isPending}
                        onClick={() => {
                          clearMessage();
                          setResetId(t.id);
                          setResetPassword("");
                        }}
                      >
                        <KeyRound size={14} /> Réinitialiser
                      </Btn>
                      <Btn
                        kind={t.active ? "danger" : "outline"}
                        disabled={actions.updateTeacher.isPending}
                        onClick={() => {
                          clearMessage();
                          actions.updateTeacher.mutate(
                            { teacherId: t.id, data: { active: !t.active } },
                            {
                              onSuccess: () =>
                                setNotice(
                                  t.active
                                    ? "Accès désactivé et sessions invalidées."
                                    : "Accès réactivé.",
                                ),
                              onError: (e) => setError(getError(e)),
                            },
                          );
                        }}
                      >
                        {t.active ? "Désactiver" : "Réactiver"}
                      </Btn>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AuthenticatedPage>
  );
}
