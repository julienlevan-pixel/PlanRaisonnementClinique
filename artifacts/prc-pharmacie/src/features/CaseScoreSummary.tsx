import { BarChart3 } from "lucide-react";
import type { GradingSummary } from "./RubricEditor";

const number = (value: number) =>
  Number(value).toLocaleString("fr-CA", { maximumFractionDigits: 2 });

/** Presents the published server score without changing the grading rules. */
export function CaseScoreSummary({
  score,
  percentage,
  components,
  grading,
}: {
  score: number;
  percentage: number;
  components: Record<string, number>;
  grading?: GradingSummary;
}) {
  const maximum = grading?.maximum ?? 20;
  return (
    <section
      className="participant-score score-summary"
      aria-label="Votre résultat"
    >
      <header>
        <div>
          <div className="eyebrow">BILAN PERSONNEL</div>
          <h2>Votre résultat</h2>
        </div>
        <BarChart3 size={26} aria-hidden="true" />
      </header>
      <p>Note obtenue / note maximale du cas</p>
      <div className="score-summary-value">
        <strong>
          {number(score)}
          <small> / {number(maximum)}</small>
        </strong>
        <span>{number(percentage)} %</span>
      </div>
      <meter
        min={0}
        max={maximum}
        value={score}
        aria-label={`Note obtenue : ${number(score)} sur ${number(maximum)}`}
      />
      <div className="score-components">
        {[
          {
            title: "Impression clinique",
            diagnosis: "mainDiagnosis",
            justification: "mainJustification",
            maximum: grading?.mainDiagnosisMaximum ?? 2,
            justificationLabel: "Justification principale",
          },
          {
            title: "Impression clinique alternative",
            diagnosis: "alternativeDiagnosis",
            justification: "alternativeJustification",
            maximum: grading?.alternativeDiagnosisMaximum ?? 2,
            justificationLabel: "Justification alternative",
          },
        ].map((item) => (
          <section className="score-impression" key={item.diagnosis}>
            <h3>{item.title}</h3>
            <dl>
              <div>
                <dt>Impression clinique</dt>
                <dd>
                  {number(components[item.diagnosis] ?? 0)} /{" "}
                  {number(item.maximum)}
                </dd>
              </div>
              <div>
                <dt>{item.justificationLabel}</dt>
                <dd>
                  {number(components[item.justification] ?? 0)} /{" "}
                  {number(grading?.clinicalMaximum ?? 8)}
                </dd>
              </div>
            </dl>
          </section>
        ))}
      </div>
      <p className="score-summary-note">
        Barème pédagogique proposé : une référence issue du panel, et non une
        norme clinique universelle.
      </p>
    </section>
  );
}
