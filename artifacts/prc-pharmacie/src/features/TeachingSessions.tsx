import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import { QRCodeSVG } from "qrcode.react";
import type { AppActions } from "../app/actions";
import { api } from "../app/api";
import { getError } from "../app/utils";
import {
  AuthenticatedPage,
  Btn,
  ErrorBox,
  Input,
  Loading,
  SectionTitle,
} from "../app/ui";
import { ActivityPage, ProjectionPage } from "./Activity";
import {
  GradeDistribution,
  type GradeDistributionData,
} from "./GradeDistribution";
import "./teaching-sessions.css";

type CaseOption = {
  id: string;
  name: string;
  version: number;
  ready: boolean;
  corrected: boolean;
};
type Case = {
  skipped?: boolean;
  id: string;
  name: string;
  status: string;
  position: number;
  maximum: number;
};
type Member = {
  id?: string;
  pseudonym?: string;
  currentSubmitted: boolean;
  submittedCount: number;
  complete: boolean;
  score: number | null;
  subtotal: number;
  gradedMaximum: number;
  cases: {
    name: string;
    position: number;
    submitted: boolean;
    skipped?: boolean;
    maximum: number;
    score: number | null;
  }[];
};
type Report = {
  gradedCaseCount?: number;
  maximum: number;
  caseCount: number;
  memberCount: number;
  distribution?: GradeDistributionData;
  members?: Member[];
  own?: Member | null;
};
type TeachingSession = {
  deliveryMode?: "synchronous" | "asynchronous";
  archivedAt?: string | null;
  id: string;
  name: string;
  code: string;
  role: "panel" | "students";
  status: "open" | "finished";
  currentPosition: number;
  cases: Case[];
  report: Report;
};
const number = (n: number) =>
  n.toLocaleString("fr-CA", { maximumFractionDigits: 2 });

export function TeachingSessions({ actions }: { actions: AppActions }) {
  const [, navigate] = useLocation(),
    cache = useQueryClient();
  const [creating, setCreating] = useState(
    new URLSearchParams(window.location.search).get("new") === "1",
  );
  const [name, setName] = useState(""),
    [role, setRole] = useState<"students" | "panel">("students"),
    [ids, setIds] = useState<string[]>([]);
  const [deliveryMode, setDeliveryMode] = useState<
    "synchronous" | "asynchronous"
  >("synchronous");
  const [archived, setArchived] = useState(false);
  const list = useQuery({
    queryKey: ["teaching-sessions", archived],
    queryFn: () =>
      api<any[]>(`/api/teaching-sessions${archived ? "?archived=true" : ""}`),
  });
  const options = useQuery({
    queryKey: ["teaching-options"],
    queryFn: () => api<CaseOption[]>("/api/teaching-sessions/options"),
    enabled: creating,
  });
  const create = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/api/teaching-sessions", "POST", {
        name,
        role,
        prcIds: ids,
        deliveryMode: role === "students" ? deliveryMode : "synchronous",
      }),
    onSuccess: async (data) => {
      await cache.invalidateQueries({ queryKey: ["teaching-sessions"] });
      navigate(`/seances/${data.id}`);
    },
  });
  const invalid = ids.some((id) => {
    const item = options.data?.find((c) => c.id === id);
    return !item?.ready || (role === "students" && !item.corrected);
  });
  const move = (index: number, delta: number) =>
    setIds((previous) => {
      const next = [...previous];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    });
  return (
    <AuthenticatedPage actions={actions}>
      <SectionTitle
        eyebrow="ORGANISER ET ANIMER"
        title="Mes séances"
        aside={
          <Btn onClick={() => setCreating(!creating)}>Nouvelle séance</Btn>
        }
      />
      <p>
        Une séance, un code, plusieurs cas. Les participants s’identifient une
        seule fois. Guidez le groupe en synchrone ou autorisez un parcours
        autonome en asynchrone.
      </p>
      <label className="session-archive-filter">
        <input
          type="checkbox"
          checked={archived}
          onChange={(e) => setArchived(e.target.checked)}
        />{" "}
        Afficher les séances archivées
      </label>
      {list.isError && (
        <ErrorBox message={getError(list.error)} retry={() => list.refetch()} />
      )}
      {creating && (
        <form
          className="panel-card session-builder"
          aria-label="Créer une séance"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() && ids.length && !invalid) create.mutate();
          }}
        >
          <h2>Préparer une séance</h2>
          <Input
            label="Nom de la séance"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={160}
            required
          />
          <label className="field">
            <span>Participants de la séance</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              disabled={create.isPending}
            >
              <option value="students">
                Étudiants · correction guidée et bilan des notes
              </option>
              <option value="panel">
                Cliniciens experts · constitution des corrigés
              </option>
            </select>
          </label>
          {role === "students" && (
            <label className="field">
              <span>Déroulement de la séance</span>
              <select
                value={deliveryMode}
                onChange={(e) =>
                  setDeliveryMode(e.target.value as typeof deliveryMode)
                }
                disabled={create.isPending}
              >
                <option value="synchronous">
                  Synchrone · je guide le groupe
                </option>
                <option value="asynchronous">
                  Asynchrone · chacun avance à son rythme
                </option>
              </select>
              <small>
                En asynchrone : réponse, corrigé personnel, cas suivant et
                bilan, sans attendre le groupe. Ce choix est réservé au
                professeur.
              </small>
            </label>
          )}
          <p>
            Choisissez jusqu’à 20 PRC. Pour les étudiants, chaque cas doit
            disposer d’un corrigé validé. Les versions des cas et des barèmes
            seront fixées à la création de la séance.
          </p>
          {options.isPending ? (
            <Loading />
          ) : options.isError ? (
            <ErrorBox
              message={getError(options.error)}
              retry={() => options.refetch()}
            />
          ) : (
            <fieldset className="session-options">
              <legend>Cas disponibles</legend>
              {options.data?.length ? (
                options.data.map((c) => (
                  <label key={c.id}>
                    <input
                      type="checkbox"
                      checked={ids.includes(c.id)}
                      disabled={
                        create.isPending ||
                        (!ids.includes(c.id) &&
                          (!c.ready ||
                            (role === "students" && !c.corrected) ||
                            ids.length >= 20))
                      }
                      onChange={(e) =>
                        setIds(
                          e.target.checked
                            ? [...ids, c.id]
                            : ids.filter((id) => id !== c.id),
                        )
                      }
                    />
                    <span>
                      {c.name || "PRC sans nom"}{" "}
                      <small>
                        Version {c.version} ·{" "}
                        {!c.ready
                          ? "À compléter"
                          : c.corrected
                            ? "Corrigé validé"
                            : "Panel à recueillir"}
                      </small>
                    </span>
                  </label>
                ))
              ) : (
                <p>
                  Préparez d’abord vos cas dans{" "}
                  <Link href="/prcs">Mes PRC</Link>.
                </p>
              )}
            </fieldset>
          )}
          {!!ids.length && (
            <section aria-label="Ordre des cas">
              <h3>Ordre de présentation</h3>
              <ol className="session-order">
                {ids.map((id, index) => (
                  <li key={id}>
                    <span>{options.data?.find((c) => c.id === id)?.name}</span>
                    <div>
                      <button
                        type="button"
                        aria-label={`Monter le cas ${index + 1}`}
                        disabled={!index || create.isPending}
                        onClick={() => move(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Descendre le cas ${index + 1}`}
                        disabled={index === ids.length - 1 || create.isPending}
                        onClick={() => move(index, 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        disabled={create.isPending}
                        aria-label={`Retirer le cas ${index + 1}`}
                        onClick={() =>
                          setIds(ids.filter((value) => value !== id))
                        }
                      >
                        Retirer
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {invalid && (
            <p className="form-error">
              Un cas sélectionné n’est pas prêt pour ce public. Retirez-le ou
              complétez son corrigé.
            </p>
          )}
          {create.isError && (
            <p role="alert" className="form-error">
              {getError(create.error)}
            </p>
          )}
          <Btn
            type="submit"
            disabled={
              create.isPending || !name.trim() || !ids.length || invalid
            }
          >
            {create.isPending
              ? "Création…"
              : `Créer la séance (${ids.length} cas)`}
          </Btn>
        </form>
      )}
      {list.isPending ? (
        <Loading />
      ) : (
        <div className="teaching-session-list">
          {list.data?.map((s) => (
            <article className="panel-card" key={s.id}>
              <div className="eyebrow">
                {s.role === "students" ? "SÉANCE ÉTUDIANTE" : "PANEL EXPERT"} ·{" "}
                {s.status === "finished" ? "TERMINÉE" : "EN COURS"}
              </div>
              <h2>{s.name}</h2>
              <p>
                {s.caseCount} cas ·{" "}
                {s.deliveryMode === "asynchronous" ? "Asynchrone" : "Synchrone"}{" "}
                · {s.memberCount} participant(s) · Code <b>{s.code}</b>
              </p>
              <Link className="btn btn-primary" href={`/seances/${s.id}`}>
                {s.status === "finished"
                  ? "Consulter le bilan"
                  : "Animer la séance"}
              </Link>
            </article>
          ))}
        </div>
      )}
    </AuthenticatedPage>
  );
}

function SessionCaseProgress({ session }: { session: TeachingSession }) {
  return (
    <ol className="teaching-case-progress" aria-label="Progression des cas">
      {session.cases.map((c) => (
        <li
          key={c.id}
          aria-current={
            session.status === "open" && c.position === session.currentPosition
              ? "step"
              : undefined
          }
        >
          <span>Cas {c.position + 1}</span>
          <strong>{c.name}</strong>
          <small>
            {session.deliveryMode === "asynchronous"
              ? "Parcours individuel"
              : c.skipped
                ? "Non évalué"
                : c.position < session.currentPosition ||
                    session.status === "finished"
                  ? "Révision terminée"
                  : c.position === session.currentPosition
                    ? "Cas actif"
                    : "À venir"}
          </small>
        </li>
      ))}
    </ol>
  );
}

function CumulativeReport({
  report,
  role,
  own = false,
  privateResults = false,
}: {
  report: Report;
  role: "students" | "panel";
  own?: boolean;
  privateResults?: boolean;
}) {
  const member = report.own;
  return (
    <section className="session-final" aria-label="Bilan de la séance">
      <h2>Bilan de la séance</h2>
      <p>
        {report.caseCount} cas · {report.memberCount} participant(s).
      </p>
      {role === "students" && report.maximum > 0 && (
        <p>
          Maximum de la séance :{" "}
          <strong>{number(report.maximum)} points</strong>, somme des maxima des
          cas et de leurs barèmes enregistrés.
        </p>
      )}
      {role === "students" && report.maximum === 0 && (
        <p>Aucun cas n’a été évalué. Aucune note globale n’est attribuée.</p>
      )}
      {report.gradedCaseCount !== undefined &&
        report.gradedCaseCount < report.caseCount && (
          <p>
            {report.caseCount - report.gradedCaseCount} cas non évalué(s),
            exclu(s) de la note et de son maximum.
          </p>
        )}
      {own && member && (
        <>
          <h3>
            {role === "panel"
              ? "Vos contributions"
              : member.complete
                ? "Votre résultat global"
                : "Votre bilan partiel"}
          </h3>
          {role === "students" && (
            <p className="session-total">
              {member.gradedMaximum === 0
                ? "Aucun cas noté"
                : member.complete
                  ? `${number(member.score!)} / ${number(report.maximum)}`
                  : `${number(member.subtotal)} / ${number(member.gradedMaximum)} sur les cas soumis`}
            </p>
          )}
          <p>
            {member.submittedCount} cas soumis sur {report.caseCount}.
            {role === "students" &&
              !member.complete &&
              " Les cas non soumis ne reçoivent pas de zéro. Votre participation incomplète est exclue de la distribution des notes globales."}
          </p>
          <div className="session-table-scroll">
            <table className="review-table">
              <thead>
                <tr>
                  <th>Cas</th>
                  <th>
                    {role === "students" ? "Votre résultat" : "Contribution"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {member.cases.map((c) => (
                  <tr key={c.position}>
                    <th scope="row">
                      {c.position + 1}. {c.name}
                    </th>
                    <td>
                      {c.skipped
                        ? "Non évalué · exclu de la note"
                        : role === "panel"
                          ? c.submitted
                            ? "Soumise"
                            : "Non soumise"
                          : c.score === null
                            ? "Non soumis"
                            : `${number(c.score)} / ${number(c.maximum)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {privateResults && !!report.members?.length && (
        <details className="panel-card">
          <summary>Résultats individuels · Réservés au professeur</summary>
          <div className="session-table-scroll">
            <table className="review-table">
              <thead>
                <tr>
                  <th>Participant</th>
                  <th>Cas soumis</th>
                  <th>
                    {role === "students" ? "Note globale" : "Participation"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.members.map((m) => (
                  <tr key={m.id}>
                    <th scope="row">{m.pseudonym}</th>
                    <td>
                      {m.submittedCount} / {report.caseCount}
                    </td>
                    <td>
                      {role === "panel"
                        ? "Contribution experte"
                        : m.complete
                          ? `${number(m.score ?? 0)} / ${number(report.maximum)}`
                          : "Participation partielle · sans note globale"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {report.distribution && (
        <>
          <p>
            Le graphique comprend uniquement les participants ayant une note
            pour tous les cas. Les participations incomplètes sont comptées
            séparément.
          </p>
          <GradeDistribution
            data={report.distribution}
            ownScore={own ? member?.score : null}
          />
        </>
      )}
    </section>
  );
}

export function TeachingSessionPage({ actions }: { actions: AppActions }) {
  const { sessionId = "" } = useParams<{ sessionId: string }>(),
    cache = useQueryClient(),
    [, navigate] = useLocation();
  const session = useQuery({
    queryKey: ["teaching-session", sessionId],
    queryFn: () => api<TeachingSession>(`/api/teaching-sessions/${sessionId}`),
    refetchInterval: (q) => (q.state.data?.status === "open" ? 5000 : false),
    refetchIntervalInBackground: false,
  });
  const advance = useMutation({
    mutationFn: (skipUnanswered: boolean) =>
      api(`/api/teaching-sessions/${sessionId}/next`, "POST", {
        expectedPosition: session.data!.currentPosition,
        ...(skipUnanswered ? { skipUnanswered: true } : {}),
      }),
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: ["teaching-session", sessionId] }),
  });
  const archive = useMutation({
    mutationFn: () =>
      api(`/api/teaching-sessions/${sessionId}/archive`, "POST", {
        archived: !session.data?.archivedAt,
      }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["teaching-sessions"] });
      navigate("/seances");
    },
  });
  const reuse = useMutation({
    mutationFn: () =>
      api<{ id: string }>(
        `/api/teaching-sessions/${sessionId}/asynchronous`,
        "POST",
        {},
      ),
    onSuccess: async (created) => {
      await cache.invalidateQueries({ queryKey: ["teaching-sessions"] });
      navigate(`/seances/${created.id}`);
    },
  });
  const mode = useMutation({
    mutationFn: (deliveryMode: string) =>
      api(`/api/teaching-sessions/${sessionId}/mode`, "POST", { deliveryMode }),
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: ["teaching-session", sessionId] }),
  });
  const finish = useMutation({
    mutationFn: () =>
      api(`/api/teaching-sessions/${sessionId}/finish`, "POST", {}),
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: ["teaching-session", sessionId] }),
  });
  const s = session.data,
    current = s?.cases[s.currentPosition];
  const canAdvance =
    current &&
    (s?.role === "students"
      ? current.status === "published"
      : current.status !== "open");
  const canSkip =
    !!current &&
    s?.role === "students" &&
    current.status !== "open" &&
    current.status !== "published" &&
    Array.isArray(s.report.members) &&
    s.report.members.every((m) => !m.currentSubmitted);
  return (
    <AuthenticatedPage actions={actions}>
      <Link href="/seances" className="back-link">
        ← Mes séances
      </Link>
      {session.isPending ? (
        <Loading />
      ) : session.isError || !s ? (
        <ErrorBox
          message={getError(session.error)}
          retry={() => session.refetch()}
        />
      ) : (
        <>
          <SectionTitle
            eyebrow={
              s.role === "students" ? "SÉANCE ÉTUDIANTE" : "PANEL EXPERT"
            }
            title={s.name}
            aside={
              <a
                className="btn btn-outline"
                href={`/seances/${s.id}/projection`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ouvrir la projection de la séance
              </a>
            }
          />
          <p className="session-shared-code">
            Code unique pour tous les cas : <strong>{s.code}</strong>
          </p>
          {s.role === "students" && s.status === "open" && (
            <section className="panel-card">
              <h2>
                {s.deliveryMode === "asynchronous"
                  ? "Parcours asynchrone activé"
                  : "Séance synchrone"}
              </h2>
              <p>
                {s.deliveryMode === "asynchronous"
                  ? "Chaque étudiant répond, consulte son corrigé et passe au cas suivant sans votre intervention. Son bilan personnel apparaît dès qu’il termine."
                  : "Vous présentez les cas et guidez les étapes pour tout le groupe."}
              </p>
              {s.report.memberCount === 0 && (
                <>
                  <Btn
                    kind="outline"
                    disabled={mode.isPending}
                    onClick={() =>
                      mode.mutate(
                        s.deliveryMode === "asynchronous"
                          ? "synchronous"
                          : "asynchronous",
                      )
                    }
                  >
                    {s.deliveryMode === "asynchronous"
                      ? "Revenir au synchrone"
                      : "Activer le parcours asynchrone"}
                  </Btn>
                  <p>
                    Choisissez le mode avant l’arrivée des participants et le
                    début de la présentation. Les cas et les barèmes restent
                    identiques.
                  </p>
                </>
              )}
              {mode.isError && <p role="alert">{getError(mode.error)}</p>}
            </section>
          )}
          {s.role === "students" && s.deliveryMode !== "asynchronous" && (
            <section className="panel-card">
              <h2>Proposer cette préparation en asynchrone</h2>
              <p>
                Ouvrez un nouveau parcours avec les mêmes cas, leur ordre et
                leurs barèmes enregistrés. Un nouveau code permettra aux
                étudiants de répondre à leur rythme. Les réponses de cette
                séance seront conservées séparément ; les PRC ne sont pas
                dupliqués.
              </p>
              <Btn
                kind="outline"
                disabled={reuse.isPending}
                onClick={() => reuse.mutate()}
              >
                {reuse.isPending ? "Préparation…" : "Réutiliser en asynchrone"}
              </Btn>
              {reuse.isError && <p role="alert">{getError(reuse.error)}</p>}
            </section>
          )}
          <SessionCaseProgress session={s} />
          {s.status === "finished" ? (
            <>
              <CumulativeReport
                report={s.report}
                role={s.role}
                privateResults
              />
              {s.role === "panel" && (
                <section className="panel-card">
                  <h2>Établir les corrigés des cas</h2>
                  <p>
                    Retrouvez chaque panel pour générer et valider son corrigé,
                    puis personnaliser son barème avant une séance étudiante.
                  </p>
                  <ul>
                    {s.cases.map((c) => (
                      <li key={c.id}>
                        <Link
                          className="library-text-link"
                          href={`/activity/${c.id}`}
                        >
                          {c.position + 1}. {c.name} · Ouvrir le panel
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <Btn
                kind="outline"
                onClick={() => archive.mutate()}
                disabled={archive.isPending}
              >
                {s.archivedAt ? "Restaurer la séance" : "Archiver la séance"}
              </Btn>
              {archive.isError && <p role="alert">{getError(archive.error)}</p>}
            </>
          ) : s.deliveryMode === "asynchronous" ? (
            <>
              <section
                className="panel-card session-attendance"
                aria-label="Suivi des participants"
              >
                <h2>Progression des étudiants</h2>
                <QRCodeSVG
                  value={new URL(
                    `/join/${encodeURIComponent(s.code)}`,
                    window.location.origin,
                  ).toString()}
                  size={160}
                  title="Rejoindre la séance asynchrone"
                />
                <p>
                  {s.report.memberCount} participant(s). Les corrigés
                  individuels sont disponibles après chaque soumission. La
                  distribution du groupe sera publiée à la clôture.
                </p>
                <ul>
                  {s.report.members?.map((m) => (
                    <li key={m.id}>
                      <span>{m.pseudonym}</span>
                      <strong>
                        {m.submittedCount} / {s.cases.length} cas soumis
                      </strong>
                    </li>
                  ))}
                </ul>
                <p>
                  <a
                    className="btn btn-primary"
                    href={`/join/${encodeURIComponent(s.code)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Ouvrir le lien étudiant
                  </a>
                </p>
              </section>
              <CumulativeReport
                report={s.report}
                role={s.role}
                privateResults
              />
              <section className="panel-card session-next">
                <h2>Clôturer la séance</h2>
                <p>
                  Les étudiants terminent à leur rythme. Clôturez quand la
                  période de participation est terminée : les réponses seront
                  fermées et la distribution anonyme sera publiée. Les copies
                  incomplètes conserveront leur bilan partiel.
                </p>
                <Btn
                  disabled={finish.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Fermer les réponses pour tous et publier la distribution anonyme du groupe ? Les étudiants encore en cours ne pourront plus soumettre.",
                      )
                    )
                      finish.mutate();
                  }}
                >
                  Clôturer et publier le bilan du groupe
                </Btn>
                {finish.isError && <p role="alert">{getError(finish.error)}</p>}
              </section>
            </>
          ) : (
            <>
              <section
                className="panel-card session-attendance"
                aria-label="Suivi des participants"
              >
                <h2>
                  Cas {s.currentPosition + 1} sur {s.cases.length} ·{" "}
                  {current?.name}
                </h2>
                <p>
                  {s.report.memberCount} personne(s) ont rejoint. Ce code reste
                  le même pendant toute la séance.
                </p>
                <details>
                  <summary>
                    Qui a soumis ? · Suivi réservé au professeur
                  </summary>
                  <ul>
                    {s.report.members?.map((m) => (
                      <li key={m.id}>
                        <span>{m.pseudonym}</span>
                        <strong>
                          {m.currentSubmitted
                            ? "Réponse soumise"
                            : "Non soumise"}
                        </strong>
                        <small>
                          {m.submittedCount}/{s.cases.length} cas soumis
                        </small>
                      </li>
                    ))}
                  </ul>
                </details>
              </section>
              {current && (
                <ActivityPage
                  key={current.id}
                  actions={actions}
                  activityId={current.id}
                  embedded
                  sessionAccess={{ code: s.code }}
                />
              )}
              <section className="panel-card session-next">
                <h2>
                  {s.currentPosition === s.cases.length - 1
                    ? "Terminer la séance"
                    : "Continuer la séance"}
                </h2>
                <p>
                  {s.role === "students"
                    ? "Fermez les réponses, discutez du corrigé et publiez les résultats de ce cas avant de poursuivre."
                    : "Fermez la collecte et discutez des choix du panel avant de poursuivre. Vous pourrez établir les corrigés de chaque cas depuis Mes PRC."}
                </p>
                {advance.isError && (
                  <p className="form-error" role="alert">
                    {getError(advance.error)}
                  </p>
                )}
                <Btn
                  disabled={(!canAdvance && !canSkip) || advance.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        canSkip
                          ? "Aucune réponse n’a été soumise pour ce cas. L’exclure de la note globale et de son maximum, puis continuer ?"
                          : s.currentPosition === s.cases.length - 1
                            ? "Terminer la séance et afficher le bilan commun ?"
                            : "Passer au cas suivant pour tous les participants ? Les réponses du cas actuel restent verrouillées.",
                      )
                    )
                      advance.mutate(canSkip);
                  }}
                >
                  {canSkip
                    ? s.currentPosition === s.cases.length - 1
                      ? "Terminer sans noter ce cas"
                      : "Passer sans noter ce cas"
                    : s.currentPosition === s.cases.length - 1
                      ? "Terminer et afficher le bilan"
                      : "Passer au cas suivant"}
                </Btn>
              </section>
            </>
          )}
        </>
      )}
    </AuthenticatedPage>
  );
}

export function TeachingProjection() {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const query = useQuery({
    queryKey: ["teaching-projection", sessionId],
    queryFn: () =>
      api<TeachingSession>(`/api/teaching-sessions/${sessionId}/projection`),
    refetchInterval: (q) =>
      q.state.data?.status === "finished" ? false : 5000,
    refetchIntervalInBackground: false,
  });
  const s = query.data;
  if (query.isPending) return <Loading />;
  if (query.isError || !s)
    return (
      <ErrorBox message={getError(query.error)} retry={() => query.refetch()} />
    );
  return (
    <div className="teaching-projection">
      <header className="teaching-projection-heading">
        <h1>{s.name}</h1>
        <p>
          {s.status === "finished"
            ? "Séance terminée"
            : s.deliveryMode === "asynchronous"
              ? "Parcours asynchrone"
              : `Cas ${s.currentPosition + 1} sur ${s.cases.length}`}{" "}
          · Code <strong>{s.code}</strong>
        </p>
      </header>
      {s.status === "finished" || s.deliveryMode === "asynchronous" ? (
        <main className="projection-page">
          {s.deliveryMode === "asynchronous" && s.status !== "finished" ? (
            <p>
              Parcours asynchrone en cours. Code : <strong>{s.code}</strong>.
              Chaque étudiant avance à son rythme ; le bilan collectif sera
              publié à la clôture.
            </p>
          ) : (
            <CumulativeReport report={s.report} role={s.role} />
          )}
        </main>
      ) : (
        <ProjectionPage
          key={s.cases[s.currentPosition].id}
          activityId={s.cases[s.currentPosition].id}
          sessionCode={s.code}
        />
      )}
    </div>
  );
}

export function TeachingParticipantBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const [location] = useLocation();
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["teaching-member-context"],
    queryFn: () =>
      api<{
        session: null | {
          id: string;
          name: string;
          status: string;
          role: "panel" | "students";
          position: number;
          total: number;
          currentLaunchId: string;
          deliveryMode?: string;
          currentSubmitted?: boolean;
          groupFinished?: boolean;
        };
        report?: Report;
      }>("/api/participant/teaching-session"),
    refetchInterval: (q) =>
      q.state.data?.session &&
      (q.state.data.session.status === "open" ||
        q.state.data.session.groupFinished === false)
        ? 5000
        : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const advance = useMutation({
    mutationFn: () =>
      api("/api/participant/teaching-session/next", "POST", {
        launchId: query.data?.session?.currentLaunchId,
        expectedPosition: query.data?.session?.position,
      }),
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: ["teaching-member-context"] }),
  });
  const initial = useRef<string | null>(null),
    s = query.data?.session;
  if (s && !initial.current) initial.current = s.currentLaunchId;
  const changed = s && initial.current !== s.currentLaunchId;
  useEffect(() => {
    if (changed) window.location.replace("/participant");
  }, [changed]);
  if (query.isPending || changed)
    return <Loading label="Ouverture du cas de la séance…" />;
  if (query.isError) {
    if ([401, 503].includes((query.error as any).status))
      return <>{children}</>;
    return (
      <ErrorBox message={getError(query.error)} retry={() => query.refetch()} />
    );
  }
  if (!s) return <>{children}</>;
  return (
    <>
      <header className="teaching-participant-progress">
        <strong>{s.name}</strong>
        <span>
          {s.status === "finished"
            ? "Séance terminée"
            : `Cas ${s.position + 1} sur ${s.total}`}
        </span>
      </header>
      {s.status === "finished" && query.data?.report ? (
        <main className="participant-result-content">
          <CumulativeReport role={s.role} report={query.data.report} own />
          {s.deliveryMode === "asynchronous" && !s.groupFinished && (
            <p>
              Votre parcours est terminé. Vous pouvez revenir à ce bilan avec le
              même navigateur. La distribution anonyme du groupe sera disponible
              lorsque le professeur clôturera la séance.
            </p>
          )}
        </main>
      ) : (
        <>
          {s.deliveryMode === "asynchronous" && !s.currentSubmitted && (
            <p className="teaching-participant-progress">
              Avancez à votre rythme : répondez au cas, consultez votre corrigé
              puis passez au suivant. Vos réponses sont enregistrées
              automatiquement. Reprenez avec le même navigateur.
            </p>
          )}
          {children}
          {s.deliveryMode === "asynchronous" &&
            s.currentSubmitted &&
            location === "/participant/results" && (
              <section className="panel-card session-next">
                <h2>
                  {s.position === s.total - 1
                    ? "Vous avez répondu à tous les cas"
                    : "Prêt pour la suite ?"}
                </h2>
                <p>
                  Vos réponses sont définitives. Prenez le temps de consulter le
                  corrigé avant de continuer.
                </p>
                <Btn
                  disabled={advance.isPending}
                  onClick={() => advance.mutate()}
                >
                  {advance.isPending
                    ? "Ouverture…"
                    : s.position === s.total - 1
                      ? "Voir mon bilan de séance"
                      : "Passer au cas suivant"}
                </Btn>
                {advance.isError && (
                  <p role="alert">{getError(advance.error)}</p>
                )}
              </section>
            )}
        </>
      )}
    </>
  );
}
