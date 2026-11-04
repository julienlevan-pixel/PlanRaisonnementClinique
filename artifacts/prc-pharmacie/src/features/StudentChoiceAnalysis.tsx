import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { StudentChoiceAnalysis as Analysis } from "@workspace/api-client-react";
import { api } from "../app/api";
import { ErrorBox, Loading } from "../app/ui";
import { getError } from "../app/utils";
import { ImpressionHistograms, ClinicalHistogram } from "./ChoiceHistograms";
export function StudentChoiceAnalysis({
  cases,
  currentCaseId,
}: {
  cases: { id: string; name: string; position?: number }[];
  currentCaseId?: string;
}) {
  const [opened, setOpened] = useState(false),
    [caseId, setCaseId] = useState<string | null>(null),
    [includeStudents, setIncludeStudents] = useState(false);
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
  const outsidePanel =
    data &&
    [...data.main, ...data.alternative].some(
      (row) => row.count > 0 && row.panelCount === 0,
    );
  const visible = data
    ? {
        ...data,
        main: data.main.filter(
          (row) => row.panelCount > 0 || (includeStudents && row.count > 0),
        ),
        alternative: data.alternative.filter(
          (row) => row.panelCount > 0 || (includeStudents && row.count > 0),
        ),
      }
    : undefined;
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
                  <>
                    {outsidePanel && (
                      <label className="choice-scope">
                        <input
                          type="checkbox"
                          checked={includeStudents}
                          onChange={(e) => setIncludeStudents(e.target.checked)}
                        />
                        Afficher tous les choix des étudiants
                      </label>
                    )}
                    <ImpressionHistograms data={visible!} />
                    <div className="choice-histograms choice-clinical">
                      <ClinicalHistogram
                        key={`${selectedCase.id}-main`}
                        diagnostics={visible!.main}
                      />
                      <ClinicalHistogram
                        key={`${selectedCase.id}-alternative`}
                        diagnostics={visible!.alternative}
                        alternative
                      />
                    </div>
                  </>
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
