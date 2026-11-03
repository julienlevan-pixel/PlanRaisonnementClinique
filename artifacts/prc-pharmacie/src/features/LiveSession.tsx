import { useEffect, useState, type ReactNode } from "react";
import { Btn } from "../app/ui";
import "./live-session.css";

export type LiveSession = {
  phase: "lobby" | "case" | "answering";
  openedAt?: string;
  endsAt?: string | null;
};

export function SessionCountdown({
  session,
  serverNow,
}: {
  session?: LiveSession;
  serverNow?: string;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (!session?.endsAt) {
      setRemaining(null);
      return;
    }
    const offset = serverNow ? Date.parse(serverNow) - Date.now() : 0;
    const update = () =>
      setRemaining(
        Math.max(
          0,
          Math.ceil((Date.parse(session.endsAt!) - Date.now() - offset) / 1000),
        ),
      );
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [session?.endsAt, serverNow]);
  if (remaining === null) return null;
  return (
    <div className={`session-countdown${remaining === 0 ? " elapsed" : ""}`}>
      <span>Temps de réflexion</span>
      <strong role="timer" aria-label="Temps de réflexion restant">
        {remaining === 0
          ? "Temps écoulé"
          : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}
      </strong>
      <small>Le professeur annonce la fin et ferme les réponses.</small>
    </div>
  );
}

export function CasePresentation({
  data,
}: {
  data: {
    scenario: string;
    instructions?: string;
    observations?: Array<{ id: string; text: string; category?: string }>;
  };
}) {
  return (
    <section className="session-case" aria-label="Présentation du cas clinique">
      <div className="eyebrow">SITUATION CLINIQUE</div>
      <h2>Le cas clinique</h2>
      <p className="session-scenario">{data.scenario}</p>
      {data.instructions && (
        <p className="session-instructions">{data.instructions}</p>
      )}
      {!!data.observations?.length && (
        <div className="session-observations">
          <h3>Données cliniques</h3>
          <ul>
            {data.observations.map((row) => (
              <li key={row.id}>
                <small>{row.category || "Autre"}</small>
                <span>{row.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function LiveSessionControls({
  session,
  busy,
  serverNow,
  onAction,
  showSteps = true,
}: {
  showSteps?: boolean;
  session: LiveSession;
  busy: boolean;
  serverNow?: string;
  onAction: (input: {
    action: "present" | "open";
    durationMinutes?: number | null;
  }) => void;
}) {
  const [minutes, setMinutes] = useState("");
  const validDuration =
    !minutes ||
    (Number.isInteger(Number(minutes)) &&
      Number(minutes) >= 1 &&
      Number(minutes) <= 180);
  return (
    <section
      className="panel-card live-session-controls"
      aria-label="Piloter la séance synchrone"
    >
      {showSteps && (
        <ol className="session-steps" aria-label="Étapes de la séance">
          {(
            [
              ["lobby", "Accueil"],
              ["case", "Présentation du cas"],
              ["answering", "Réponses ouvertes"],
            ] as const
          ).map(([phase, label]) => (
            <li
              key={phase}
              aria-current={session.phase === phase ? "step" : undefined}
            >
              {label}
            </li>
          ))}
        </ol>
      )}
      {session.phase === "lobby" ? (
        <>
          <h2>Accueillir les participants</h2>
          <p>
            Partagez le QR code ou le code d’accès. Chacun rejoint la salle
            d’attente, sans compte à créer. Le cas et les choix restent masqués.
          </p>
          <Btn disabled={busy} onClick={() => onAction({ action: "present" })}>
            Présenter le cas
          </Btn>
        </>
      ) : session.phase === "case" ? (
        <>
          <h2>Présenter avant de faire répondre</h2>
          <p>
            Le cas est visible sur la projection et les appareils. Les
            sélections restent fermées jusqu’à votre signal. La projection
            conservera le cas pendant les réponses.
          </p>
          <label className="field session-duration">
            <span>Chronomètre facultatif (minutes)</span>
            <input
              type="number"
              min="1"
              max="180"
              step="1"
              value={minutes}
              disabled={busy}
              placeholder="Sans chronomètre"
              onChange={(event) => setMinutes(event.target.value)}
            />
          </label>
          {!validDuration && (
            <p className="form-error" role="alert">
              Indiquez de 1 à 180 minutes, ou laissez le champ vide.
            </p>
          )}
          <Btn
            disabled={busy || !validDuration}
            onClick={() =>
              onAction({
                action: "open",
                durationMinutes: minutes ? Number(minutes) : null,
              })
            }
          >
            Ouvrir les réponses
          </Btn>
          <small>
            Le chronomètre ne transmet ni ne ferme les copies automatiquement.
          </small>
        </>
      ) : (
        <>
          <h2>Les participants répondent</h2>
          <p>
            Gardez le cas projeté pendant la réflexion. Suivez les soumissions,
            annoncez la fin, puis fermez les réponses avant la discussion.
          </p>
          <SessionCountdown session={session} serverNow={serverNow} />
        </>
      )}
    </section>
  );
}

export function SynchronousCockpit({
  phase,
  status,
  role,
  validated,
  comparisonVisible,
  corrected = 0,
  diagnosticCount = 0,
  code,
  participants,
  submitted,
  children,
  onClose,
  busy,
}: {
  phase: LiveSession["phase"];
  status: string;
  role: string;
  validated: boolean;
  comparisonVisible: boolean;
  corrected?: number;
  diagnosticCount?: number;
  code: string;
  participants: number;
  submitted: number;
  children?: ReactNode;
  onClose: () => void;
  busy: boolean;
}) {
  const closed = status !== "open",
    students = role === "students";
  const stages = students
    ? [
        "Accueil",
        "Présentation",
        "Réponses",
        "Comparaison",
        "Corrigés",
        "Bilan",
      ]
    : [
        "Accueil",
        "Présentation",
        "Réponses",
        "Analyse du panel",
        "Corrigé validé",
      ];
  const current = closed
    ? students
      ? status === "published"
        ? 5
        : comparisonVisible
          ? 4
          : 3
      : validated
        ? 4
        : 3
    : phase === "lobby"
      ? 0
      : phase === "case"
        ? 1
        : 2;
  const next =
    status === "published"
      ? "Le bilan est publié ; vous pouvez poursuivre ou terminer la séance."
      : !closed
        ? phase === "lobby"
          ? "Présentez le cas quand les participants sont prêts."
          : phase === "case"
            ? "Ouvrez les réponses après votre présentation."
            : "Annoncez la fin, puis fermez les réponses pour commencer la discussion."
        : students
          ? !comparisonVisible
            ? "Affichez d’abord la comparaison des impressions cliniques."
            : corrected >= diagnosticCount && diagnosticCount > 0
              ? "Les corrigés ont été montrés. Vous pouvez publier les résultats."
              : "Affichez les corrigés un à un ; chaque étudiant voit ses propres points."
          : validated
            ? "Le corrigé est prêt pour une séance étudiante."
            : "Examinez le panel, générez le corrigé puis validez le barème.";
  const target = students
    ? status === "published" ||
      (comparisonVisible && corrected >= diagnosticCount && diagnosticCount > 0)
      ? "#activity-publication"
      : "#activity-review-controls"
    : "#activity-reference-controls";
  return (
    <section
      className="panel-card synchronous-cockpit"
      aria-label="Suivi de la séance synchrone"
    >
      <div className="eyebrow">
        ÉTAPE {current + 1} / {stages.length} ·{" "}
        {stages[current].toLocaleUpperCase("fr")}
      </div>
      <ol
        className="cockpit-stages"
        aria-label="Déroulement de la séance synchrone"
      >
        {stages.map((stage, i) => (
          <li
            key={stage}
            aria-current={current === i ? "step" : undefined}
            className={i < current ? "completed" : undefined}
          >
            {i < current ? "✓ " : `${i + 1}. `}
            {stage}
          </li>
        ))}
      </ol>
      <div className="cockpit-summary">
        <div>
          <span>CODE D’ACCÈS</span>
          <strong>{code}</strong>
        </div>
        <div>
          <span>PARTICIPANTS AYANT REJOINT</span>
          <strong>{participants}</strong>
        </div>
        <div>
          <span>SOUMISSIONS REÇUES</span>
          <strong>
            {submitted} / {participants}
          </strong>
        </div>
        <div>
          <span>NON SOUMISES</span>
          <strong>{Math.max(0, participants - submitted)}</strong>
        </div>
      </div>
      <progress
        value={Math.min(submitted, participants)}
        max={Math.max(1, participants)}
        aria-label="Copies soumises parmi les participants ayant rejoint"
      />
      <p className="cockpit-next">
        <strong>Prochaine action</strong>
        <span>{next}</span>
      </p>
      {children}
      {!closed && phase === "answering" && (
        <Btn kind="danger" disabled={busy} onClick={onClose}>
          {students ? "Terminer le temps de réponse" : "Fermer la collecte"}
        </Btn>
      )}
      {closed && (
        <a className="btn btn-outline" href={target}>
          {students
            ? status === "published"
              ? "Voir le bilan publié"
              : "Aller aux commandes de correction"
            : validated
              ? "Revoir le corrigé et le barème"
              : "Établir le corrigé"}
        </a>
      )}
    </section>
  );
}
