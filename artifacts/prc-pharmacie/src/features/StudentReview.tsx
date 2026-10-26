import { useEffect, useState } from "react";
import { Btn } from "../app/ui";
import "./student-review.css";
import type { GradingSummary } from "./RubricEditor";

export type DiagnosticComparison = {
  topDiagnosis?: boolean;
  diagnosticId: string;
  label: string;
  panelCount: number;
  panelPercent: number;
  panelTotal: number;
  studentCount: number;
  studentPercent: number;
  studentTotal: number;
};
export type DiagnosticCorrection = {
  diagnosisMaximum?: number;
  clinicalMaximum?: number;
  zeroByRubric?: boolean;
  topDiagnosis?: boolean;
  diagnosticId: string;
  label: string;
  panelCount: number;
  represented: boolean;
  selectedRole?: "main" | "alternative" | null;
  score?: number | null;
  diagnosisScore?: number | null;
  justificationScore?: number | null;
  raw?: number | null;
  maximum: number;
  ceiling: number;
  observations: {
    observationId: string;
    label: string;
    category: string;
    positive: number;
    negative: number;
    positivePoints: number;
    negativePoints: number;
    positiveScorePoints?: number;
    negativeScorePoints?: number;
    studentSign?: "+" | "-" | null;
    earnedPoints?: number;
    earnedScorePoints?: number;
    referenceScorePoints?: number;
    topClinical?: boolean;
    bestSigns?: string[];
  }[];
};
export type StudentReviewData = {
  scoringVersion?: string;
  maximum?: number;
  deliveryMode: "synchronous" | "asynchronous";
  comparisonVisible: boolean;
  comparison: DiagnosticComparison[];
  corrections: DiagnosticCorrection[];
  activeDiagnosticId?: string | null;
  explanation?: string;
};
const number = (value: number | null | undefined) =>
  Number(value ?? 0).toLocaleString("fr-CA", { maximumFractionDigits: 2 });

export function MaximumScoreGuide({
  scoringVersion,
  grading,
}: {
  scoringVersion?: string;
  grading?: GradingSummary;
}) {
  if (scoringVersion === "custom-rubric-v1" && grading)
    return (
      <section
        className="maximum-score-guide"
        aria-label="Comprendre la note maximale du cas"
      >
        <div>
          <span>NOTE MAXIMALE DU CAS</span>
          <strong>{number(grading.maximum)} points</strong>
        </div>
        <p>
          Impression principale : diagnostic sur{" "}
          {number(grading.mainDiagnosisMaximum)} + données sur{" "}
          {number(grading.clinicalMaximum)}. Impression alternative : diagnostic
          sur {number(grading.alternativeDiagnosisMaximum)} + données sur{" "}
          {number(grading.clinicalMaximum)}.
        </p>
        <p>
          Retenez deux impressions distinctes et cinq données signées par
          impression. Les points des données s’additionnent jusqu’au plafond
          indiqué. Les valeurs sont celles du barème enregistré par le
          professeur pour cette séance, proposé à partir des fréquences du panel
          puis personnalisable.
        </p>
        {grading.attainableMaximum < grading.maximum && (
          <small>
            Avec les valeurs de ce barème, le meilleur score réalisable est{" "}
            {number(grading.attainableMaximum)} / {number(grading.maximum)}.
            Aucune remise à l’échelle automatique.
          </small>
        )}
      </section>
    );
  const topTwo = scoringVersion === "top-two-v1";
  return (
    <section
      className="maximum-score-guide"
      aria-label="Comprendre la note maximale du cas"
    >
      <div>
        <span>NOTE MAXIMALE DU CAS</span>
        <strong>20 points</strong>
      </div>
      <p>
        <b>Deux impressions cliniques, 10 points chacune :</b> 2 points pour le
        diagnostic et 8 points pour ses cinq données cliniques.
      </p>
      <p>
        {topTwo
          ? "Pour obtenir 20 / 20 : retenir les deux impressions les plus choisies par le panel et, pour chacune, une meilleure sélection de cinq données avec les signes + ou − du corrigé. Les ex æquo au deuxième rang et parmi les données sont acceptés."
          : "Le diagnostic doit être représenté dans le panel. Le plein pointage des données correspond aux cinq meilleurs poids experts, avec les bons signes + ou −. Cette séance conserve son barème historique."}
      </p>
      {topTwo && (
        <small>
          Les impressions moins fréquentes gardent des points diagnostiques
          partiels selon leur fréquence et les deux meilleurs effectifs du
          panel. Une impression qu’aucun expert n’a retenue ne rapporte aucun
          point, y compris pour les données.
        </small>
      )}
    </section>
  );
}

export function HypothesisComparison({
  rows,
}: {
  rows: DiagnosticComparison[];
}) {
  return (
    <section
      className="hypothesis-comparison"
      aria-label="Comparaison des hypothèses"
    >
      <h2>Quelles hypothèses ont été retenues ?</h2>
      <p>
        Les diagnostics proposés sont classés du plus au moins choisi par les
        experts.
      </p>
      <div
        className="review-table-scroll"
        role="region"
        aria-label="Effectifs et pourcentages par hypothèse"
        tabIndex={0}
      >
        <table className="review-table hypothesis-comparison-table">
          <caption>
            Principale ou alternative · réponses définitives uniquement
          </caption>
          <thead>
            <tr>
              <th scope="col">Hypothèse diagnostique</th>
              <th scope="col">Étudiants</th>
              <th scope="col">Experts cliniques</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.diagnosticId}>
                <th scope="row">
                  {row.label}
                  {row.topDiagnosis && (
                    <small className="review-best">
                      Top 2 du panel · candidat au plein crédit
                    </small>
                  )}
                  {!row.panelCount && (
                    <small>Aucun expert · aucun point au barème</small>
                  )}
                </th>
                <td>
                  <b>
                    {row.studentCount} / {row.studentTotal}
                  </b>{" "}
                  <span>({number(row.studentPercent)} %)</span>
                  <div className="review-bar students" aria-hidden="true">
                    <span style={{ width: `${row.studentPercent}%` }} />
                  </div>
                </td>
                <td>
                  <b>
                    {row.panelCount} / {row.panelTotal}
                  </b>{" "}
                  <span>({number(row.panelPercent)} %)</span>
                  <div className="review-bar experts" aria-hidden="true">
                    <span style={{ width: `${row.panelPercent}%` }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="review-note">
        Le pourcentage indique la proportion des participants ayant retenu ce
        diagnostic. Chacun choisit deux hypothèses distinctes : la somme des
        pourcentages peut donc atteindre 200 %.
      </p>
    </section>
  );
}

export function DiagnosticCorrectionTable({
  correction,
  active = false,
}: {
  correction: DiagnosticCorrection;
  active?: boolean;
}) {
  const personal = correction.selectedRole !== undefined;
  const chosen = !!correction.selectedRole;
  return (
    <article
      id={`student-correction-${correction.diagnosticId}`}
      className={`diagnostic-correction${active ? " active-correction" : ""}`}
      aria-label={`Corrigé ${correction.label}`}
    >
      <header>
        <div>
          {active && <div className="eyebrow">CORRECTION EN COURS</div>}
          <h3>{correction.label}</h3>
          {correction.topDiagnosis !== undefined && correction.represented && (
            <small className="review-best">
              {correction.topDiagnosis
                ? "Top 2 du panel · diagnostic sur 2 points"
                : "Impression minoritaire · crédit diagnostique partiel"}
            </small>
          )}
        </div>
        {personal && chosen && (
          <span className="hypothesis-score">
            {number(correction.score)} / {correction.maximum}
          </span>
        )}
      </header>
      {personal && !chosen && (
        <p className="participant-notice">
          Vous n’avez pas sélectionné cette réponse.
        </p>
      )}
      {chosen && (
        <p>
          Votre hypothèse{" "}
          {correction.selectedRole === "main" ? "principale" : "alternative"} ·{" "}
          {correction.panelCount} expert(s) ont retenu ce diagnostic.
        </p>
      )}
      {(correction.zeroByRubric ?? !correction.represented) && (
        <p className="review-zero">
          {correction.observations.some(
            (row) => row.positiveScorePoints !== undefined,
          )
            ? "Cette hypothèse ne rapporte aucun point dans ce corrigé : 0 pour le diagnostic et 0 pour les données cliniques."
            : "Aucun clinicien du panel n’a retenu cette hypothèse : 0 point pour le diagnostic et 0 point pour les données cliniques."}
        </p>
      )}
      <div
        className="review-table-scroll"
        role="region"
        aria-label={`Données cliniques du corrigé ${correction.label}`}
        tabIndex={0}
      >
        <table className="review-table correction-table">
          <caption>
            Toutes les données cliniques · votes des experts et points par signe
          </caption>
          <thead>
            <tr>
              <th scope="col">Donnée clinique</th>
              {personal && <th scope="col">Votre réponse</th>}
              <th scope="col">Corrigé et barème</th>
              {personal && chosen && <th scope="col">Points obtenus</th>}
            </tr>
          </thead>
          <tbody>
            {correction.observations.map((row) => (
              <tr
                key={row.observationId}
                className={row.studentSign ? "review-own-choice" : undefined}
              >
                <th scope="row">
                  <small>{row.category}</small>
                  {row.label}
                  {row.topClinical && (
                    <small className="review-best">
                      Meilleure sélection de cinq · signe{" "}
                      {row.bestSigns?.join(" ou ")}
                    </small>
                  )}
                </th>
                {personal && (
                  <td>
                    {row.studentSign === "+"
                      ? "+ En faveur"
                      : row.studentSign === "-"
                        ? "− En défaveur"
                        : "Non sélectionnée"}
                  </td>
                )}
                <td>
                  <span className="review-positive">
                    + : {row.positive} réponse(s) · {row.positivePoints} pt
                    experts
                  </span>
                  <span className="review-negative">
                    − : {row.negative} réponse(s) · {row.negativePoints} pt
                    experts
                  </span>
                  {row.positiveScorePoints !== undefined && (
                    <small>
                      <b>
                        Barème : + {number(row.positiveScorePoints)} pt · −{" "}
                        {number(row.negativeScorePoints)} pt
                      </b>
                    </small>
                  )}
                </td>
                {personal && chosen && (
                  <td>
                    {number(
                      row.earnedScorePoints ??
                        (correction.ceiling
                          ? (8 * (row.earnedPoints ?? 0)) / correction.ceiling
                          : 0),
                    )}{" "}
                    pt
                    <small>
                      sur{" "}
                      {number(
                        row.referenceScorePoints ??
                          (correction.ceiling
                            ? (8 *
                                Math.max(
                                  row.positivePoints,
                                  row.negativePoints,
                                )) /
                              correction.ceiling
                            : 0),
                      )}{" "}
                      possible(s) pour cette donnée
                    </small>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {personal && chosen && (
        <footer className="hypothesis-score-detail">
          {correction.observations.some(
            (row) => row.positiveScorePoints !== undefined,
          ) ? (
            <p>
              Points des données avant plafonnement :{" "}
              <b>{number(correction.raw)}</b> · plafond de cette impression :{" "}
              <b>{correction.clinicalMaximum ?? 5}</b>.
            </p>
          ) : (
            <p>
              Points concordants :{" "}
              <b>
                {number(correction.raw)} / {number(correction.ceiling)}
              </b>{" "}
              points de référence.
            </p>
          )}
          <div>
            <span>
              Diagnostic{" "}
              <b>
                {number(correction.diagnosisScore)} /{" "}
                {correction.diagnosisMaximum ?? 2}
              </b>
            </span>
            <span>
              Données cliniques{" "}
              <b>
                {number(correction.justificationScore)} /{" "}
                {correction.clinicalMaximum ?? 8}
              </b>
            </span>
            <strong>
              Total de cette hypothèse : {number(correction.score)} /{" "}
              {correction.maximum}
            </strong>
          </div>
        </footer>
      )}
    </article>
  );
}

export function StudentReview({
  review,
  submitted,
  deliveryMode,
}: {
  review?: StudentReviewData;
  submitted: boolean;
  deliveryMode?: "synchronous" | "asynchronous";
}) {
  useEffect(() => {
    if (review?.activeDiagnosticId)
      document
        .getElementById(`student-correction-${review.activeDiagnosticId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [review?.activeDiagnosticId]);
  return (
    <section className="student-review" aria-label="Votre correction guidée">
      {(review?.deliveryMode ?? deliveryMode) === "asynchronous" ? (
        <h2>Vos réponses face au corrigé des experts</h2>
      ) : (
        <h2>Discussion du cas avec votre professeur</h2>
      )}
      {!submitted && (
        <p className="participant-notice">
          Votre copie n’a pas été soumise : aucune note ne lui est attribuée.
        </p>
      )}
      {review?.comparisonVisible && (
        <HypothesisComparison rows={review.comparison} />
      )}
      {!review?.corrections.length && (
        <p className="review-wait" role="status">
          {(review?.deliveryMode ?? deliveryMode) === "asynchronous"
            ? "Le corrigé individuel est réservé aux copies soumises."
            : review?.comparisonVisible
              ? "La comparaison est affichée. Le professeur va ouvrir le corrigé de la première hypothèse."
              : "Votre copie est conservée. Le professeur terminera le temps de réponse, puis affichera la comparaison et les corrigés, étape par étape."}
        </p>
      )}
      {review?.corrections.map((correction) => (
        <DiagnosticCorrectionTable
          key={correction.diagnosticId}
          correction={correction}
          active={review.activeDiagnosticId === correction.diagnosticId}
        />
      ))}
      {review?.explanation && (
        <section className="participant-reference">
          <h3>Explication du professeur</h3>
          <p>{review.explanation}</p>
        </section>
      )}
    </section>
  );
}

export function DiscussionControls({
  discussion,
  reveals,
  busy,
  onAction,
}: {
  discussion?: StudentReviewData;
  reveals: Record<string, any>;
  busy: boolean;
  onAction: (data: {
    action: "comparison" | "diagnostic";
    diagnosticId?: string;
  }) => void;
}) {
  const [selection, setSelection] = useState("");
  if (!discussion) return <p>Chargement de la discussion…</p>;
  const corrected: string[] = reveals.correctedDiagnosticIds ?? [];
  const next = discussion.comparison.find(
    (row) => !corrected.includes(row.diagnosticId),
  );
  const id =
    selection ||
    next?.diagnosticId ||
    discussion.comparison[0]?.diagnosticId ||
    "";
  const current = discussion.comparison.find((row) => row.diagnosticId === id);
  const visible = !!reveals.diagnosticComparison;
  return (
    <section className="discussion-controls panel-card">
      <div className="eyebrow">ANIMER LA DISCUSSION</div>
      <h2>Une hypothèse à la fois</h2>
      <p>
        1. Affichez la comparaison. 2. Corrigez les hypothèses dans l’ordre des
        choix experts. Les étudiants suivent les mêmes étapes sur leur écran,
        avec leur propre réponse et leurs points.
      </p>
      <Btn
        disabled={busy || visible}
        onClick={() => onAction({ action: "comparison" })}
      >
        {visible
          ? "Comparaison affichée aux étudiants"
          : "Afficher la comparaison des hypothèses"}
      </Btn>
      <label className="discussion-diagnostic">
        <span>Hypothèse à corriger</span>
        <select
          aria-label="Hypothèse à corriger"
          disabled={busy || !visible}
          value={id}
          onChange={(event) => setSelection(event.target.value)}
        >
          {discussion.comparison.map((row) => (
            <option key={row.diagnosticId} value={row.diagnosticId}>
              {row.label} · {row.panelCount} expert(s)
              {corrected.includes(row.diagnosticId) ? " · déjà révélée" : ""}
            </option>
          ))}
        </select>
      </label>
      <Btn
        disabled={busy || !visible || !id}
        onClick={() => {
          onAction({ action: "diagnostic", diagnosticId: id });
          setSelection("");
        }}
      >
        Afficher le corrigé : {current?.label ?? "hypothèse"}
      </Btn>
      <p className="review-note">
        {corrected.length} / {discussion.comparison.length} corrigé(s)
        révélé(s). Les étapes restent accessibles après rechargement.
      </p>
      <HypothesisComparison rows={discussion.comparison} />
    </section>
  );
}
