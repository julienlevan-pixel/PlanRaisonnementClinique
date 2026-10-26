import { useEffect, useState } from "react";
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
}: {
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
