import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  FlaskConical,
  KeyRound,
  Plus,
  Search,
  ShieldCheck,
  Brain,
  Trash2,
  Users,
} from "lucide-react";
import { Link, Redirect, useLocation } from "wouter";
import {
  getGetCurrentUserQueryKey,
  getGetWorkspaceSummaryQueryKey,
  useGetCurrentUser,
  useGetWorkspaceSummary,
} from "@workspace/api-client-react";
import type { AppActions } from "../app/actions";
import { api } from "../app/api";
import {
  Btn,
  Empty,
  ErrorBox,
  Input,
  Loading,
  Metric,
  SectionTitle,
  Shell,
} from "../app/ui";
import { dateLabel, getError } from "../app/utils";
import { PasswordNotice } from "./Auth";
import { ProfessorOverview } from "./ProfessorJourney";
import { CasePreview } from "./CasePreview";
import {
  workflowLabel,
  type CasePreviewData,
  type PrcSummary,
} from "./library-model";
import "./library-editor.css";
import "./public-home.css";

type LibraryOperation = {
  kind: "duplicate" | "archive" | "restore" | "delete" | "demo" | "launch";
  id?: string;
  role?: "panel" | "students";
};

export function Home({
  actions,
  view = "dashboard",
}: {
  actions: AppActions;
  view?: "dashboard" | "library";
}) {
  const current = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey(), retry: false },
  });
  const user = current.isError ? undefined : current.data?.user;
  const canWork = !!user && !user.mustChangePassword;
  const summary = useGetWorkspaceSummary({
    query: {
      queryKey: getGetWorkspaceSummaryQueryKey(),
      enabled: canWork && view === "dashboard",
    },
  });
  const [search, setSearch] = useState("");
  const [querySearch, setQuerySearch] = useState("");
  const [archived, setArchived] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [demoProgress, setDemoProgress] = useState("");
  const publicDemoDetails = useRef<HTMLDetailsElement>(null);
  const [, navigate] = useLocation();
  const cache = useQueryClient();
  useEffect(() => {
    if (
      view === "library" &&
      new URLSearchParams(window.location.search).get("new") === "1"
    )
      setCreateOpen(true);
  }, [view]);
  useEffect(() => {
    const timer = window.setTimeout(() => setQuerySearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const prcs = useQuery({
    queryKey: ["library", querySearch, archived],
    queryFn: () =>
      api<PrcSummary[]>(
        `/api/prcs?q=${encodeURIComponent(querySearch)}${archived ? "&archived=true" : ""}`,
      ),
    enabled: canWork && view === "library",
  });
  const publicDemo = useQuery({
    queryKey: ["public-demo-case"],
    queryFn: () => api<CasePreviewData>("/api/demo-case"),
    enabled: !current.isLoading && !user && view === "dashboard",
    staleTime: Infinity,
  });
  const operation = useMutation({
    mutationFn: async (command: LibraryOperation) => {
      if (command.kind === "demo") {
        setDemoProgress("Préparation de votre démonstration…");
        for (let attempt = 0; attempt < 20; attempt++) {
          const result = await api<{
            prcId: string;
            pending?: boolean;
            progress?: {
              expertsSubmitted: number;
              totalExperts: number;
              studentsSubmitted: number;
              totalStudents: number;
            };
          }>("/api/demo", "POST", {});
          if (!result.pending) {
            setDemoProgress("Démonstration prête");
            return result;
          }
          setDemoProgress(
            result.progress
              ? `Préparation : ${result.progress.expertsSubmitted}/${result.progress.totalExperts} experts et ${result.progress.studentsSubmitted}/${result.progress.totalStudents} copies étudiantes.`
              : "Préparation de la prochaine étape…",
          );
        }
        throw new Error(
          "La préparation est enregistrée mais doit être poursuivie. Cliquez à nouveau sur la démonstration pour reprendre.",
        );
      }
      if (command.kind === "duplicate")
        return api<{ id: string }>(
          `/api/prcs/${command.id}/duplicate`,
          "POST",
          {},
        );
      if (command.kind === "delete")
        return api(`/api/prcs/${command.id}`, "DELETE", { confirm: true });
      if (command.kind === "launch")
        return api<{ id: string }>(`/api/prcs/${command.id}/launches`, "POST", {
          role: command.role,
        });
      return api(`/api/prcs/${command.id}`, "PATCH", {
        archived: command.kind === "archive",
      });
    },
    onSuccess: (result, command) => {
      setError("");
      setNotice(
        command.kind === "delete"
          ? "Le PRC et ses activités ont été supprimés définitivement."
          : "",
      );
      if (command.kind === "delete") {
        cache.removeQueries({ queryKey: ["editor", command.id] });
        cache.removeQueries({ queryKey: ["prc-sharing", command.id] });
      }
      cache.invalidateQueries({ queryKey: ["library"] });
      cache.invalidateQueries({ queryKey: getGetWorkspaceSummaryQueryKey() });
      if (command.kind === "demo") navigate(`/prc/${result.prcId}`);
      if (command.kind === "duplicate") navigate(`/prc/${result.id}`);
      if (command.kind === "launch") navigate(`/activity/${result.id}`);
    },
    onError: (cause) => {
      setError(getError(cause));
      setNotice("");
      setDemoProgress("");
    },
  });
  const next = (prc: PrcSummary) => {
    if (prc.permissions?.manageSessions === false) {
      navigate(`/prc/${prc.id}`);
      return;
    }
    const step = prc.workflow?.step || "prepare";
    if (step === "prepare") navigate(`/prc/${prc.id}`);
    else if (
      (step === "panel" || step === "reference") &&
      prc.workflow?.panelLaunchId
    )
      navigate(`/activity/${prc.workflow.panelLaunchId}`);
    else if (step === "students") navigate(`/prc/${prc.id}`);
    else operation.mutate({ kind: "launch", id: prc.id, role: "panel" });
  };
  const join = (event: FormEvent) => {
    event.preventDefault();
    if (code.trim()) navigate(`/join/${encodeURIComponent(code.trim())}`);
  };
  const create = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    actions.createPrc.mutate(
      {
        data: {
          name,
          scenario: "",
          instructions:
            "Choisissez deux diagnostics distincts. Pour chaque impression clinique, retenez les données discriminantes et indiquez si elles sont en faveur (+) ou en défaveur (−).",
          diagnostics: [],
          observations: [],
        },
      },
      {
        onSuccess: (prc) => {
          cache.invalidateQueries({ queryKey: ["library"] });
          setCreateOpen(false);
          navigate(`/prc/${prc.id}`);
        },
        onError: (cause) => {
          setError(getError(cause));
          setDemoProgress("");
        },
      },
    );
  };
  if (current.isLoading)
    return (
      <div className="auth-page">
        <Loading label="Vérification de la session…" />
      </div>
    );
  if (!user && view === "library") return <Redirect to="/login" />;
  if (!user)
    return (
      <div className="public-prc-home">
        <header className="public-prc-header">
          <Link href="/" className="brand">
            <span className="brand-mark">
              <Brain size={20} />
            </span>
            <span>
              <b>PRC</b>
              <small>PHARMACIE</small>
            </span>
          </Link>
          <Btn kind="outline" onClick={() => navigate("/login")}>
            Se connecter <ArrowRight size={16} />
          </Btn>
        </header>
        <main className="public-prc-content">
          <section
            className="public-prc-hero"
            aria-label="Bienvenue dans PRC Pharmacie"
          >
            <div className="reasoning-statement">
              <div className="reasoning-kicker">Raisonnement clinique</div>
              <div className="reasoning-line" aria-hidden="true" />
              <p className="reasoning-words">
                Observer.
                <br />
                Interpréter.
                <br />
                <em>Justifier.</em>
              </p>
              <p className="reasoning-description">
                Un espace de travail pour enseigner
                <br className="reasoning-desktop-break" /> la démarche clinique
                en pharmacie.
              </p>
            </div>
            <div className="public-prc-welcome">
              <div className="eyebrow">FACULTÉ DE PHARMACIE</div>
              <h1>Plan de raisonnement clinique (PRC)</h1>
              <p className="public-prc-description">
                Une application pour enseigner le raisonnement clinique en
                pharmacie. Créez des cas, recueillez l’avis d’experts et aidez
                les étudiants à justifier leurs impressions cliniques grâce aux
                données cliniques.
              </p>
              <form className="public-join" onSubmit={join}>
                <label htmlFor="public-code">Rejoindre une activité</label>
                <p>Saisissez le code transmis par votre enseignant.</p>
                <div>
                  <input
                    id="public-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    autoComplete="off"
                    placeholder="Code d’accès"
                    required
                  />
                  <button type="submit">
                    Rejoindre <ArrowRight size={16} />
                  </button>
                </div>
              </form>
              <a
                className="public-demo-link"
                href="#demo-toux"
                onClick={() => {
                  if (publicDemoDetails.current)
                    publicDemoDetails.current.open = true;
                }}
              >
                Découvrir l’exemple « Toux » <ArrowRight size={15} />
              </a>
            </div>
          </section>
          <details
            ref={publicDemoDetails}
            id="demo-toux"
            className="public-demo-section public-demo-disclosure"
          >
            <summary>
              <span className="demo-summary-icon" aria-hidden="true">
                <FlaskConical size={23} />
              </span>
              <span className="demo-summary-copy">
                <span className="demo-summary-title">
                  Découvrir un exemple : Toux
                </span>
                <span className="demo-summary-description">
                  Un cas clinique · 20 données · Deux impressions cliniques
                </span>
              </span>
              <span className="demo-summary-action">
                <span className="demo-label-open">Voir le questionnaire</span>
                <span className="demo-label-close">Refermer l’exemple</span>
                <ChevronDown size={20} aria-hidden="true" />
              </span>
            </summary>
            <div className="public-demo-body">
              <p className="public-demo-caption">Exemple fictif</p>
              {publicDemo.isLoading ? (
                <Loading label="Chargement des 20 observations de démonstration…" />
              ) : publicDemo.isError ? (
                <ErrorBox
                  message="L’aperçu fictif n’est pas disponible pour le moment."
                  retry={() => publicDemo.refetch()}
                />
              ) : publicDemo.data ? (
                <CasePreview
                  data={publicDemo.data}
                  title="Toux — essai du tableau"
                />
              ) : null}
            </div>
          </details>
        </main>
        <footer className="public-prc-footer">
          Ce logiciel a été créé par la Faculté de pharmacie de l’Université de
          Montréal.
        </footer>
      </div>
    );
  return (
    <Shell user={user} actions={actions}>
      {user.mustChangePassword && <PasswordNotice actions={actions} />}
      <SectionTitle
        eyebrow={view === "library" ? "BIBLIOTHÈQUE" : "TABLEAU DE BORD"}
        title={view === "library" ? "Mes PRC" : `Bonjour, ${user.username}`}
        aside={
          <Btn
            disabled={!canWork}
            onClick={() =>
              view === "library"
                ? setCreateOpen((value) => !value)
                : navigate("/prcs?new=1")
            }
          >
            <Plus size={16} /> Nouveau PRC
          </Btn>
        }
      />
      {canWork && view === "dashboard" && <ProfessorOverview />}
      <p className="intro-copy">
        {view === "library"
          ? "Vos cas et ceux partagés avec vous. Préparez le contenu, collaborez et retrouvez les versions conservées."
          : "Suivez vos séances, les participations et les activités récentes."}
      </p>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {view === "library" && createOpen && (
        <form className="inline-create" onSubmit={create}>
          <Input
            label="Nom du PRC"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex. Toux"
            maxLength={160}
          />
          <Btn type="submit" disabled={actions.createPrc.isPending}>
            Créer le brouillon
          </Btn>
          <Btn kind="quiet" onClick={() => setCreateOpen(false)}>
            Annuler
          </Btn>
        </form>
      )}
      {canWork &&
        (view === "library" ? (
          <>
            <section className="panel-card library-demo">
              <div>
                <div className="eyebrow">DÉMONSTRATION — DONNÉES FICTIVES</div>
                <h2>Un exemple complet : Toux</h2>
                <p>
                  20 observations, dix experts simulés, un corrigé généré et des
                  copies étudiantes. Votre exemple reste isolé des activités
                  réelles et des autres enseignants.
                </p>
                {demoProgress && <p role="status">{demoProgress}</p>}
              </div>
              <Btn
                kind="outline"
                disabled={operation.isPending}
                onClick={() => operation.mutate({ kind: "demo" })}
              >
                <FlaskConical size={16} /> Ouvrir ma démonstration Toux
              </Btn>
            </section>
            <section className="panel-card cas-panel">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow">BIBLIOTHÈQUE</div>
                  <h2>Mes PRC</h2>
                </div>
                <span className="count">{prcs.data?.length ?? "—"}</span>
              </div>
              <div className="library-toolbar">
                <label className="library-search">
                  <Search size={16} />
                  <span className="sr-only">Rechercher un PRC</span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Rechercher un PRC…"
                  />
                </label>
                <div className="library-tabs" aria-label="État des PRC">
                  <button
                    type="button"
                    aria-pressed={!archived}
                    onClick={() => setArchived(false)}
                  >
                    Actifs
                  </button>
                  <button
                    type="button"
                    aria-pressed={archived}
                    onClick={() => setArchived(true)}
                  >
                    Archives
                  </button>
                </div>
              </div>
              {prcs.isLoading ? (
                <Loading label="Chargement des PRC…" />
              ) : prcs.isError ? (
                <ErrorBox
                  message={getError(prcs.error)}
                  retry={() => prcs.refetch()}
                />
              ) : prcs.data?.length ? (
                <div className="library-cards">
                  {prcs.data.map((prc) => (
                    <article className="library-case" key={prc.id}>
                      <div className="library-case-heading">
                        <Link
                          href={`/prc/${prc.id}`}
                          data-testid={`link-prc-${prc.id}`}
                        >
                          <h3>{prc.name || "PRC sans nom"}</h3>
                        </Link>
                        {prc.isDemo && (
                          <span className="demo-badge">Données fictives</span>
                        )}
                        {prc.shared && (
                          <span className="demo-badge">
                            {prc.permissions?.share === false
                              ? `Partagé par ${prc.ownerUsername}`
                              : "En collaboration"}
                          </span>
                        )}
                        {prc.archived && (
                          <span className="demo-badge">Archivé</span>
                        )}
                      </div>
                      <p className="library-meta">
                        Modifié le {dateLabel(prc.updatedAt)} ·{" "}
                        {prc.launchCount} lancement
                        {prc.launchCount === 1 ? "" : "s"}
                      </p>
                      {prc.workflow?.missing?.length ? (
                        <ul
                          className="library-prerequisites"
                          aria-label="À compléter"
                        >
                          {prc.workflow.missing.map((missing) => (
                            <li key={missing}>{missing}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="library-stage">
                          {prc.workflow?.step === "students"
                            ? "Corrigé validé : prêt pour un nouveau groupe."
                            : prc.workflow?.step === "reference"
                              ? "Le panel est recueilli : établissez votre corrigé."
                              : "Le questionnaire peut être proposé au panel."}
                        </p>
                      )}
                      <div className="library-case-actions">
                        {prc.archived ? (
                          prc.permissions?.archive === false ? (
                            <span>PRC archivé</span>
                          ) : (
                            <Btn
                              disabled={operation.isPending}
                              onClick={() =>
                                operation.mutate({
                                  kind: "restore",
                                  id: prc.id,
                                })
                              }
                            >
                              Restaurer le PRC
                            </Btn>
                          )
                        ) : (
                          <Btn
                            disabled={operation.isPending}
                            onClick={() => next(prc)}
                          >
                            {prc.permissions?.manageSessions === false
                              ? "Modifier le PRC"
                              : workflowLabel(
                                  prc.workflow?.step || "prepare",
                                )}{" "}
                            <ArrowRight size={15} />
                          </Btn>
                        )}
                        <Link
                          className="library-text-link"
                          href={`/prc/${prc.id}`}
                        >
                          Modifier / historique
                        </Link>
                        <details className="library-more">
                          <summary>Autres actions</summary>
                          <button
                            type="button"
                            disabled={operation.isPending}
                            onClick={() =>
                              operation.mutate({
                                kind: "duplicate",
                                id: prc.id,
                              })
                            }
                          >
                            <Copy size={14} /> Dupliquer
                          </button>
                          {!prc.archived &&
                            prc.permissions?.archive !== false && (
                              <button
                                type="button"
                                disabled={operation.isPending}
                                onClick={() =>
                                  operation.mutate({
                                    kind: "archive",
                                    id: prc.id,
                                  })
                                }
                              >
                                Archiver
                              </button>
                            )}
                          {prc.permissions?.archive !== false &&
                            prc.permissions?.delete !== false && (
                              <button
                                type="button"
                                className="library-delete"
                                disabled={operation.isPending}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Supprimer définitivement « ${prc.name || "PRC sans nom"} » ?\n\nToutes ses versions, ses panels et groupes étudiants, leurs réponses et leurs corrigés seront supprimés. Les liens et codes d’accès cesseront de fonctionner, et les collaborateurs perdront ce PRC.\n\nCette action est irréversible. Pour conserver les résultats, choisissez plutôt Archiver.`,
                                    )
                                  )
                                    operation.mutate({
                                      kind: "delete",
                                      id: prc.id,
                                    });
                                }}
                              >
                                <Trash2 size={14} /> Supprimer définitivement
                              </button>
                            )}
                        </details>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  title={
                    search
                      ? "Aucun PRC ne correspond à la recherche"
                      : archived
                        ? "Aucun PRC archivé"
                        : "Créez votre premier PRC"
                  }
                  copy={
                    archived
                      ? "L’archivage conserve les versions, les copies et les résultats. Un PRC peut être restauré."
                      : "Vous pouvez enregistrer un brouillon incomplet et le terminer ensuite."
                  }
                  action={
                    !archived && !search ? (
                      <Btn onClick={() => setCreateOpen(true)}>
                        <Plus size={15} /> Nouveau PRC
                      </Btn>
                    ) : undefined
                  }
                />
              )}
            </section>
          </>
        ) : (
          <>
            <div className="metric-strip">
              <Metric
                label="PRC accessibles"
                value={summary.data?.prcCount}
                icon={<BookOpen size={18} />}
              />
              <Metric
                label="Activités ouvertes"
                value={summary.data?.activeLaunchCount}
                icon={<Activity size={18} />}
              />
              <Metric
                label="Participants"
                value={summary.data?.participantCount}
                icon={<Users size={18} />}
              />
              <Metric
                label="Copies soumises"
                value={summary.data?.submissionCount}
                icon={<Check size={18} />}
              />
            </div>
            <section className="workspace-library-link panel-card">
              <div>
                <h2>Préparer et retrouver vos cas</h2>
                <p>
                  Votre bibliothèque réunit vos PRC et les cas partagés avec
                  vous.
                </p>
              </div>
              <Link href="/prcs" className="btn btn-outline">
                Ouvrir Mes PRC <ArrowRight size={16} />
              </Link>
            </section>
            {summary.isLoading ? (
              <Loading />
            ) : summary.isError ? (
              <ErrorBox
                message="Le suivi n’a pas pu être chargé."
                retry={() => summary.refetch()}
              />
            ) : (
              <div className="dashboard-grid">
                <section className="panel-card recent-panel">
                  <h2>Activités en cours</h2>
                  <WorkspaceLaunches
                    launches={summary.data?.activeLaunches ?? []}
                    empty="Aucune activité ouverte"
                  />
                </section>
                <section className="panel-card recent-panel">
                  <h2>Activités récentes</h2>
                  <WorkspaceLaunches
                    launches={summary.data?.recentLaunches ?? []}
                    empty="Aucune activité récente"
                  />
                </section>
              </div>
            )}
          </>
        ))}
      <section className="join-band">
        <KeyRound size={22} />
        <div>
          <b>Rejoindre une activité</b>
          <p>Un code correspond à un seul lancement.</p>
        </div>
        <form onSubmit={join}>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            aria-label="Code d’accès"
            placeholder="Code d’accès"
          />
          <button type="submit" aria-label="Rejoindre">
            <ArrowRight size={18} />
          </button>
        </form>
      </section>
    </Shell>
  );
}

function WorkspaceLaunches({
  launches,
  empty,
}: {
  launches: Array<{
    id: string;
    name: string;
    role: string;
    createdAt: string;
    submissionCount: number;
    participantCount: number;
  }>;
  empty: string;
}) {
  return launches.length ? (
    <div className="launch-list">
      {launches.map((launch) => (
        <Link
          href={`/activity/${launch.id}`}
          className="launch-row"
          key={launch.id}
        >
          <span className="launch-glyph">
            <Activity size={17} />
          </span>
          <span>
            <b>{launch.name}</b>
            <small>
              {launch.role === "panel" ? "Panel" : "Étudiants"} ·{" "}
              {dateLabel(launch.createdAt)}
            </small>
          </span>
          <span className="launch-count">
            {launch.submissionCount}/{launch.participantCount}
          </span>
        </Link>
      ))}
    </div>
  ) : (
    <p className="intro-copy">{empty}</p>
  );
}
