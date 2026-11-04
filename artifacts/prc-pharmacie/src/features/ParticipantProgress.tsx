import type { LiveSession } from "./LiveSession";
import "./participant-access.css";

export function ParticipantProgress({
  expert,
  asynchronous,
  session,
  submitted = false,
  published = false,
  correcting = false,
  closed = false,
  hasNextCase,
}: {
  expert: boolean;
  asynchronous: boolean;
  session?: LiveSession;
  submitted?: boolean;
  published?: boolean;
  correcting?: boolean;
  closed?: boolean;
  hasNextCase?: boolean;
}) {
  const stages = asynchronous
    ? expert
      ? ["Réponse", "Comparaison du panel"]
      : [
          "Réponse",
          "Mon corrigé",
          ...(hasNextCase === undefined
            ? []
            : [hasNextCase ? "Cas suivant" : "Bilan"]),
        ]
    : expert
      ? ["Accueil", "Présentation", "Réponse", "Comparaison du panel"]
      : [
          "Accueil",
          "Présentation",
          "Réponse",
          "Discussion",
          "Corrigé",
          "Bilan",
        ];
  const current = asynchronous
    ? submitted
      ? 1
      : 0
    : expert && submitted
      ? 3
      : published
        ? 5
        : correcting
          ? 4
          : submitted || closed
            ? 3
            : session?.phase === "lobby"
              ? 0
              : session?.phase === "case"
                ? 1
                : 2;
  const message =
    !submitted && closed
      ? "La collecte est terminée. Votre copie non transmise reste un brouillon."
      : submitted
        ? expert
          ? "Contribution transmise · Comparez vos choix aux réponses anonymes du panel."
          : asynchronous
            ? hasNextCase === true
              ? "Réponse transmise · Consultez votre corrigé, puis continuez vers le cas suivant."
              : hasNextCase === false
                ? "Réponse transmise · Consultez votre corrigé, puis ouvrez votre bilan de séance."
                : "Réponse transmise · Votre corrigé personnel est disponible."
            : published
              ? hasNextCase
                ? "Résultat disponible · Le professeur ouvrira le cas suivant."
                : "Votre résultat est disponible."
              : correcting
                ? "Corrigé en cours · Comparez vos choix au corrigé affiché par le professeur."
                : "Réponse transmise · Le professeur guidera la discussion et la correction."
        : session?.phase === "lobby"
          ? "Accueil · Le professeur présentera bientôt le cas."
          : session?.phase === "case"
            ? "Présentation du cas · Attendez l’ouverture des réponses."
            : asynchronous
              ? "À votre rythme · Répondez, vérifiez puis transmettez votre copie."
              : "Réponses ouvertes · Choisissez vos impressions cliniques et vos données.";
  return (
    <section
      className="participant-journey"
      aria-label="Votre progression dans le cas"
    >
      {submitted &&
        !expert &&
        !asynchronous &&
        !published &&
        !correcting &&
        !closed && <h2>Réponse reçue</h2>}
      <p role="status">
        <strong>{message}</strong>
      </p>
      <ol aria-label="Étapes de votre participation">
        {stages.map((stage, index) => (
          <li
            key={stage}
            aria-current={index === current ? "step" : undefined}
            data-completed={index < current || undefined}
          >
            {stage}
          </li>
        ))}
      </ol>
      {!asynchronous && (
        <small>
          L’écran se met à jour automatiquement au fil des étapes ouvertes par
          le professeur.
        </small>
      )}
    </section>
  );
}
