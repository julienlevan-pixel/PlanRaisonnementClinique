import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Choice } from "@workspace/api-client-react";
import { Btn } from "../app/ui";
import { CasePresentation } from "./LiveSession";
import type { StudentReviewData } from "./StudentReview";
import "./participant-experience.css";

export type ImpressionRole = "main" | "alternative";
export type ResponseReview = {
  mainDiagnosticId: string | null;
  alternativeDiagnosticId: string | null;
  mainChoices: Choice[];
  alternativeChoices: Choice[];
};
export type ResponseCase = {
  name?: string;
  scenario: string;
  instructions?: string;
  diagnostics: { id: string; label: string }[];
  observations: { id: string; text: string; category?: string }[];
};
export function ParticipantInstructions({
  expert,
  asynchronous,
  exactFive,
}: {
  expert: boolean;
  asynchronous: boolean;
  exactFive: boolean;
}) {
  return (
    <section
      className="participant-start-guide"
      aria-label={
        expert ? "Votre contribution au panel" : "Votre parcours étudiant"
      }
    >
      <h2>
        {expert
          ? "Contribuer au corrigé collectif"
          : "Comment répondre à ce cas"}
      </h2>
      <p>
        {expert
          ? "Vos choix aideront le professeur à construire le corrigé. Vous ne recevez pas de note."
          : "Vos réponses seront comparées au corrigé et au barème de cette séance."}
      </p>
      <ol>
        <li>
          Retenez une impression clinique principale et une alternative,
          différentes.
        </li>
        <li>
          Pour chacune, choisissez{" "}
          {exactFive ? "cinq données" : "de une à cinq données"} en précisant
          leur signe : + en faveur, − en défaveur.
        </li>
        {expert && (
          <li>
            Attribuez une importance de 1 à 3 à chaque donnée choisie, selon son
            pouvoir discriminant.
          </li>
        )}
        <li>Vérifiez votre copie, puis transmettez-la définitivement.</li>
      </ol>
      <p>
        {expert
          ? "Vous pourrez ensuite comparer vos choix aux réponses anonymes du panel."
          : asynchronous
            ? "Votre corrigé personnel sera disponible immédiatement après transmission."
            : "Le professeur guidera ensuite la comparaison et la correction ; cet écran se mettra à jour automatiquement."}
      </p>
    </section>
  );
}
function ParticipantDialog({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const node = dialog.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (node && !node.open) node.showModal();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (node?.open) node.close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="participant-dialog"
      aria-labelledby={id}
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      onClose={() => {
        if (!dialog.current?.open) onClose();
      }}
    >
      <header>
        <h2 id={id}>{title}</h2>
        <Btn
          kind="outline"
          disabled={busy}
          onClick={() => dialog.current?.close()}
        >
          Fermer
        </Btn>
      </header>
      <div className="participant-dialog-content">{children}</div>
    </dialog>
  );
}
export function CaseQuickAccess({
  data,
  disabled = false,
}: {
  data: ResponseCase;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Btn kind="outline" disabled={disabled} onClick={() => setOpen(true)}>
        Revoir le cas
      </Btn>
      {open && (
        <ParticipantDialog
          title="Revoir le cas clinique"
          onClose={() => setOpen(false)}
        >
          <p className="case-reminder-title">{data.name}</p>
          <CasePresentation data={data} />
        </ParticipantDialog>
      )}
    </>
  );
}
export function MobileImpressionSwitch({
  active,
  onChange,
  mainCount,
  alternativeCount,
}: {
  active: ImpressionRole;
  onChange: (role: ImpressionRole) => void;
  mainCount: number;
  alternativeCount: number;
}) {
  return (
    <div
      className="mobile-impression-switch"
      role="group"
      aria-label="Choisir l’impression clinique à afficher"
    >
      <button
        type="button"
        aria-pressed={active === "main"}
        onClick={() => onChange("main")}
      >
        Principale · {mainCount}/5
      </button>
      <button
        type="button"
        aria-pressed={active === "alternative"}
        onClick={() => onChange("alternative")}
      >
        Alternative · {alternativeCount}/5
      </button>
    </div>
  );
}
export function SubmissionReview({
  data,
  copy,
  expert,
  busy,
  disabled,
  error,
  onClose,
  onEdit,
  onConfirm,
}: {
  data: ResponseCase;
  copy: ResponseReview;
  expert: boolean;
  busy: boolean;
  disabled: boolean;
  error?: string;
  onClose: () => void;
  onEdit: (role: ImpressionRole) => void;
  onConfirm: () => void;
}) {
  return (
    <ParticipantDialog
      title="Vérifier ma réponse avant transmission"
      busy={busy}
      onClose={onClose}
    >
      <p>
        Voici votre copie enregistrée. Vérifiez les impressions, les données et
        leurs signes{expert ? ", ainsi que chaque importance de 1 à 3" : ""}. La
        transmission sera définitive.
      </p>
      <div className="submission-review-copies">
        {(["main", "alternative"] as const).map((role) => {
          const diagnosis =
              role === "main"
                ? copy.mainDiagnosticId
                : copy.alternativeDiagnosticId,
            choices =
              role === "main" ? copy.mainChoices : copy.alternativeChoices;
          return (
            <section
              className="submission-review-copy"
              key={role}
              aria-label={
                role === "main"
                  ? "Vérification de l’impression principale"
                  : "Vérification de l’impression alternative"
              }
            >
              <h3>
                {role === "main"
                  ? "Impression principale"
                  : "Impression alternative"}
              </h3>
              <p className="review-diagnosis">
                {data.diagnostics.find((d) => d.id === diagnosis)?.label ??
                  "Non choisie"}
              </p>
              <p>{choices.length} donnée(s) choisie(s).</p>
              <ol>
                {choices.map((c) => (
                  <li key={c.observationId}>
                    <strong
                      className={
                        c.sign === "+" ? "review-positive" : "review-negative"
                      }
                    >
                      {c.sign === "+" ? "+ En faveur" : "− En défaveur"}
                    </strong>
                    <span>
                      {data.observations.find((o) => o.id === c.observationId)
                        ?.text ?? "Donnée clinique"}
                    </span>
                    {expert && <small>Importance : {c.points} / 3</small>}
                  </li>
                ))}
              </ol>
              <Btn kind="outline" disabled={busy} onClick={() => onEdit(role)}>
                Modifier{" "}
                {role === "main"
                  ? "l’impression principale"
                  : "l’impression alternative"}
              </Btn>
            </section>
          );
        })}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="submission-review-actions">
        <Btn disabled={busy || disabled} onClick={onConfirm}>
          {busy ? "Transmission…" : "Transmettre définitivement"}
        </Btn>
        <Btn kind="outline" disabled={busy} onClick={onClose}>
          Reprendre mes choix
        </Btn>
      </div>
    </ParticipantDialog>
  );
}
export function PersonalFeedback({ review }: { review?: StudentReviewData }) {
  const corrections =
    review?.corrections.filter(
      (c) =>
        !!c.selectedRole &&
        c.score !== null &&
        c.score !== undefined &&
        c.maximum > 0,
    ) ?? [];
  if (!corrections.length) return null;
  const credited = corrections.find((c) => (c.diagnosisScore ?? 0) > 0),
    creditedRow = corrections.flatMap((c) =>
      (c.zeroByRubric ?? !c.represented) || (c.justificationScore ?? 0) <= 0
        ? []
        : c.observations
            .filter(
              (o) =>
                o.studentSign &&
                (o.earnedScorePoints ?? o.earnedPoints ?? 0) > 0,
            )
            .map((o) => ({ c, o })),
    )[0];
  const incomplete = corrections.filter(
    (c) => Number(c.score) < c.maximum - 0.005,
  );
  const zero = incomplete.find((c) => c.zeroByRubric ?? !c.represented);
  const sign = incomplete.flatMap((c) =>
    c.observations
      .filter(
        (o) =>
          o.studentSign &&
          o.positiveScorePoints !== undefined &&
          (o.studentSign === "+"
            ? o.positiveScorePoints
            : o.negativeScorePoints) === 0 &&
          Math.max(o.positiveScorePoints ?? 0, o.negativeScorePoints ?? 0) > 0,
      )
      .map((o) => ({ c, o })),
  )[0];
  const missed = incomplete.flatMap((c) =>
    c.observations
      .filter((o) => !o.studentSign && (o.referenceScorePoints ?? 0) > 0)
      .map((o) => ({ c, o })),
  )[0];
  const number = (n: number) =>
    n.toLocaleString("fr-CA", { maximumFractionDigits: 2 });
  return (
    <section className="personal-feedback" aria-label="Votre retour personnel">
      <h2>Vos points forts et vos pistes de révision</h2>
      <p>
        Ce retour s’appuie sur les éléments du corrigé déjà disponibles et le
        barème de cette séance.
      </p>
      {(creditedRow || credited) && (
        <div>
          <h3>Point fort</h3>
          <p>
            {creditedRow ? (
              <>
                Votre sélection de « {creditedRow.o.label} » pour «{" "}
                {creditedRow.c.label} » est créditée dans ce barème.
              </>
            ) : (
              <>
                Votre choix de « {credited!.label} » rapporte{" "}
                {number(credited!.diagnosisScore!)} point(s) pour l’impression
                clinique.
              </>
            )}
          </p>
        </div>
      )}
      <div>
        <h3>{incomplete.length ? "À revoir" : "Sur les éléments corrigés"}</h3>
        <p>
          {zero ? (
            <>
              L’impression « {zero.label} » ne rapporte aucun point dans ce
              barème. Consultez les impressions retenues dans le corrigé.
            </>
          ) : sign ? (
            <>
              Pour « {sign.c.label} », comparez le signe choisi pour «{" "}
              {sign.o.label} » : le barème accorde{" "}
              {number(sign.o.positiveScorePoints ?? 0)} point(s) au signe + et{" "}
              {number(sign.o.negativeScorePoints ?? 0)} au signe −.
            </>
          ) : missed ? (
            <>
              Pour « {missed.c.label} », examinez « {missed.o.label} », une
              donnée non sélectionnée qui est créditée dans ce corrigé.
            </>
          ) : incomplete.length ? (
            "Comparez vos choix et leurs points au détail du corrigé ci-dessous, impression par impression."
          ) : (
            "Vous obtenez le maximum sur les éléments déjà corrigés. Vous pouvez relire les tableaux pour approfondir votre justification."
          )}
        </p>
      </div>
    </section>
  );
}
