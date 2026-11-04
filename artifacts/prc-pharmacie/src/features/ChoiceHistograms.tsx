import { useState, type ReactNode } from "react";
import type {
  StudentChoiceAnalysis as Analysis,
  StudentDiagnosticChoices,
} from "@workspace/api-client-react";
import "./student-choice-analysis.css";
export type ChoiceCharts = Pick<
  Analysis,
  "submittedCount" | "panelTotal" | "main" | "alternative"
>;
const number = (value: number) =>
  value.toLocaleString("fr-CA", { maximumFractionDigits: 1 });
type Row = { label: string; count: number; panelCount: number };
function Bar({
  count,
  total,
  expert = false,
}: {
  count: number;
  total: number;
  expert?: boolean;
}) {
  const percentage = total ? (count * 100) / total : 0;
  const group = expert ? "Experts" : "Étudiants";
  return (
    <div
      className={`choice-bar${expert ? " choice-bar-experts" : ""}`}
      role="img"
      aria-label={
        total
          ? `${group} : ${count} sur ${total}, ${number(percentage)} %`
          : `${group} : aucune sélection de cette impression`
      }
    >
      <span className="choice-bar-group" aria-hidden="true">
        {group}
      </span>
      <span className="choice-track" aria-hidden="true">
        <span className="choice-fill" style={{ width: `${percentage}%` }} />
      </span>
      <span className="choice-value" aria-hidden="true">
        <strong>{total ? `${number(percentage)} %` : "—"}</strong>
        {total > 0 && (
          <small>
            {count}/{total}
          </small>
        )}
      </span>
    </div>
  );
}
export function Histogram({
  title,
  rows,
  studentTotal,
  expertTotal,
  children,
  showStudents = true,
}: {
  title: string;
  rows: Row[];
  studentTotal: number;
  expertTotal: number;
  children?: ReactNode;
  showStudents?: boolean;
}) {
  return (
    <section className="choice-histogram" aria-label={title}>
      <h3>{title}</h3>
      {children}
      <div className="choice-legend">
        {showStudents && (
          <span className="choice-legend-students">
            Étudiants ({studentTotal})
          </span>
        )}
        <span className="choice-legend-experts">Experts ({expertTotal})</span>
      </div>
      <div className="choice-scale" aria-hidden="true">
        <span>0 %</span>
        <span>100 %</span>
      </div>
      <ul className="choice-bars">
        {rows.map((row, index) => (
          <li key={index}>
            <h4>{row.label}</h4>
            {showStudents && <Bar count={row.count} total={studentTotal} />}
            <Bar count={row.panelCount} total={expertTotal} expert />
          </li>
        ))}
      </ul>
    </section>
  );
}
export function ClinicalHistogram({
  diagnostics,
  alternative = false,
  diagnosticId,
  showStudents = true,
}: {
  diagnostics: StudentDiagnosticChoices[];
  alternative?: boolean;
  diagnosticId?: string;
  showStudents?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    diagnostics.find(
      (row) => row.diagnosticId === (diagnosticId ?? selectedId),
    ) ??
    [...diagnostics].sort(
      (a, b) => b.count - a.count || b.panelCount - a.panelCount,
    )[0];
  if (!selected) return null;
  return (
    <Histogram
      title={
        alternative
          ? "4. Données cliniques de l’alternative"
          : "3. Données cliniques de l’impression"
      }
      rows={selected.observations}
      studentTotal={selected.count}
      expertTotal={selected.panelCount}
      showStudents={showStudents}
    >
      {diagnosticId ? (
        <p className="choice-active-diagnostic">{selected.label}</p>
      ) : (
        <label className="field">
          <span>
            {alternative
              ? "Impression clinique alternative"
              : "Impression clinique"}
          </span>
          <select
            aria-label={
              alternative
                ? "Impression clinique alternative"
                : "Impression clinique"
            }
            value={selected.diagnosticId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {diagnostics.map((row) => (
              <option key={row.diagnosticId} value={row.diagnosticId}>
                {row.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </Histogram>
  );
}

export function expertChoices(data: ChoiceCharts): ChoiceCharts {
  return {
    ...data,
    main: data.main.filter((row) => row.panelCount > 0),
    alternative: data.alternative.filter((row) => row.panelCount > 0),
  };
}
export function ImpressionHistograms({
  data,
  showStudents = true,
}: {
  data: ChoiceCharts;
  showStudents?: boolean;
}) {
  return (
    <div className="choice-histograms choice-impressions">
      <Histogram
        title="1. Impression clinique"
        rows={data.main}
        studentTotal={data.submittedCount}
        expertTotal={data.panelTotal}
        showStudents={showStudents}
      />
      <Histogram
        title="2. Impression clinique alternative"
        rows={data.alternative}
        studentTotal={data.submittedCount}
        expertTotal={data.panelTotal}
        showStudents={showStudents}
      />
    </div>
  );
}
export function RevealedClinicalHistograms({
  data,
  diagnosticId,
  showStudents = true,
}: {
  data?: ChoiceCharts;
  diagnosticId: string;
  showStudents?: boolean;
}) {
  if (!data) return null;
  const main = data.main.filter(
    (row) =>
      row.diagnosticId === diagnosticId &&
      row.panelCount > 0 &&
      row.observations.length > 0,
  );
  const alternative = data.alternative.filter(
    (row) =>
      row.diagnosticId === diagnosticId &&
      row.panelCount > 0 &&
      row.observations.length > 0,
  );
  if (!main.length && !alternative.length) return null;
  return (
    <div className="choice-histograms choice-clinical">
      {main.length > 0 && (
        <ClinicalHistogram
          diagnostics={main}
          diagnosticId={diagnosticId}
          showStudents={showStudents}
        />
      )}
      {alternative.length > 0 && (
        <ClinicalHistogram
          diagnostics={alternative}
          diagnosticId={diagnosticId}
          alternative
          showStudents={showStudents}
        />
      )}
    </div>
  );
}
