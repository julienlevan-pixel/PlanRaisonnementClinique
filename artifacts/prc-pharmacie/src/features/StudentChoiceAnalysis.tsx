import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  StudentChoiceAnalysis as Analysis,
  StudentDiagnosticChoices,
} from "@workspace/api-client-react";
import { api } from "../app/api";
import { ErrorBox, Loading } from "../app/ui";
import { getError } from "../app/utils";
import "./student-choice-analysis.css";

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
function Histogram({
  title,
  rows,
  studentTotal,
  expertTotal,
  children,
}: {
  title: string;
  rows: Row[];
  studentTotal: number;
  expertTotal: number;
  children?: ReactNode;
}) {
  return (
    <section className="choice-histogram" aria-label={title}>
      <h3>{title}</h3>
      {children}
      <div className="choice-legend">
        <span className="choice-legend-students">
          Étudiants ({studentTotal})
        </span>
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
            <Bar count={row.count} total={studentTotal} />
            <Bar count={row.panelCount} total={expertTotal} expert />
          </li>
        ))}
      </ul>
    </section>
  );
}
function ClinicalHistogram({
  diagnostics,
  alternative = false,
}: {
  diagnostics: StudentDiagnosticChoices[];
  alternative?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    diagnostics.find((row) => row.diagnosticId === selectedId) ??
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
    >
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
    </Histogram>
  );
}

export function StudentChoiceAnalysis({
  cases,
  currentCaseId,
}: {
  cases: { id: string; name: string; position?: number }[];
  currentCaseId?: string;
}) {
  const [opened, setOpened] = useState(false),
    [caseId, setCaseId] = useState<string | null>(null);
  const selectedCase =
    cases.find((row) => row.id === (caseId ?? currentCaseId)) ?? cases[0];
  const query = useQuery({
    queryKey: ["student-choice-analysis", selectedCase?.id],
    queryFn: () =>
      api<Analysis>(`/api/launches/${selectedCase!.id}/choice-analysis`),
    enabled: opened && !!selectedCase,
    retry: false,
    refetchInterval: (q) =>
      opened &&
      q.state.data?.status === "open" &&
      navigator.onLine &&
      document.visibilityState === "visible"
        ? 15000
        : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const data = query.data;
  return (
    <details
      className="panel-card choice-analysis"
      open={opened}
      onToggle={(e) => setOpened(e.currentTarget.open)}
    >
      <summary>
        <span className="eyebrow">RÉSULTATS DU GROUPE</span>
        <h2>Impressions et données cliniques</h2>
      </summary>
      {opened && (
        <div className="choice-analysis-content">
          {cases.length > 1 && (
            <label className="field">
              <span>Cas à analyser</span>
              <select
                aria-label="Cas à analyser"
                value={selectedCase?.id}
                onChange={(e) => setCaseId(e.target.value)}
              >
                {cases.map((row, index) => (
                  <option key={row.id} value={row.id}>
                    {(row.position ?? index) + 1}. {row.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {query.isPending ? (
            <Loading label="Chargement des histogrammes…" />
          ) : query.isError ? (
            <ErrorBox
              message={getError(query.error)}
              retry={() => query.refetch()}
            />
          ) : (
            data && (
              <>
                <h3 className="choice-case-title">{data.caseName}</h3>
                {data.submittedCount > 0 ? (
                  <div className="choice-histograms">
                    <Histogram
                      title="1. Impression clinique"
                      rows={data.main}
                      studentTotal={data.submittedCount}
                      expertTotal={data.panelTotal}
                    />
                    <Histogram
                      title="2. Impression clinique alternative"
                      rows={data.alternative}
                      studentTotal={data.submittedCount}
                      expertTotal={data.panelTotal}
                    />
                    <ClinicalHistogram
                      key={`${selectedCase.id}-main`}
                      diagnostics={data.main}
                    />
                    <ClinicalHistogram
                      key={`${selectedCase.id}-alternative`}
                      diagnostics={data.alternative}
                      alternative
                    />
                  </div>
                ) : (
                  <p role="status">
                    Les histogrammes s’afficheront après la première soumission.
                  </p>
                )}
              </>
            )
          )}
        </div>
      )}
    </details>
  );
}
