import type { ReactNode } from "react";
import { Link } from "wouter";
import type { Workflow } from "./library-model";
import "./professor-journey.css";

const stages = [
  {
    id: "prepare",
    title: "Préparer le cas",
    detail: "Scénario, impressions cliniques et données à sélectionner.",
  },
  {
    id: "panel",
    title: "Recueillir le panel",
    detail: "Invitez les experts, puis fermez leur collecte.",
  },
  {
    id: "reference",
    title: "Valider le corrigé",
    detail:
      "Examinez les réponses et personnalisez le barème avant de valider.",
  },
  {
    id: "students",
    title: "Organiser la séance",
    detail:
      "Réunissez les cas et choisissez le parcours synchrone ou asynchrone.",
  },
] as const;

export function ProfessorJourney({
  step,
  children,
  note,
  compact = false,
}: {
  step?: Workflow["step"];
  children?: ReactNode;
  note?: string;
  compact?: boolean;
}) {
  const index = stages.findIndex((s) => s.id === step);
  return (
    <section
      className={`professor-journey${compact ? " compact" : ""}`}
      aria-label="Parcours du professeur"
    >
      <div className="eyebrow">DU CAS À LA SÉANCE</div>
      <ol aria-label="Étapes de préparation">
        {stages.map((s, i) => (
          <li
            key={s.id}
            aria-current={i === index ? "step" : undefined}
            className={index > i ? "completed" : undefined}
          >
            <span
              className="journey-number"
              aria-label={index > i ? "Étape terminée" : undefined}
            >
              {index > i ? "✓" : i + 1}
            </span>
            <div>
              <strong>{s.title}</strong>
              <small>{s.detail}</small>
            </div>
          </li>
        ))}
      </ol>
      {step ? (
        <p className="journey-next">
          <strong>
            Votre prochaine étape :{" "}
            {stages[index].title.toLocaleLowerCase("fr")}.
          </strong>
          {note && <> {note}</>}
        </p>
      ) : (
        <p>
          Commencez dans <strong>Mes PRC</strong> pour préparer le contenu et
          son corrigé. Retrouvez ensuite l’animation et les bilans dans{" "}
          <strong>Mes séances</strong>.
        </p>
      )}
      {children && <div className="journey-actions">{children}</div>}
    </section>
  );
}
export function ProfessorOverview() {
  return (
    <ProfessorJourney>
      <Link className="btn btn-outline" href="/prcs">
        Préparer ou reprendre un PRC
      </Link>
      <Link className="btn btn-primary" href="/seances?new=1">
        Organiser une séance avec plusieurs cas
      </Link>
    </ProfessorJourney>
  );
}
