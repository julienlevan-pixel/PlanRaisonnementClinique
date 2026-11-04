import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  StudentChoiceAnalysis as Analysis,
  StudentDiagnosticChoices,
} from "@workspace/api-client-react";
import { api } from "../app/api";
import { ErrorBox, Loading, Input } from "../app/ui";
import { getError } from "../app/utils";
import "./grade-distribution.css";
import "./student-choice-analysis.css";

const number = (value: number) =>
  value.toLocaleString("fr-CA", { maximumFractionDigits: 1 });
const frequency = (count: number, total: number) =>
  `${count}/${total} (${number(total ? (count * 100) / total : 0)} %)`;
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-CA");
function Stack({
  first,
  second = 0,
  total,
  panel = false,
}: {
  first: number;
  second?: number;
  total: number;
  panel?: boolean;
}) {
  return (
    <span
      className={`choice-track${panel ? " choice-panel" : ""}`}
      aria-hidden="true"
    >
      <span
        className="choice-fill"
        style={{ width: `${total ? (first * 100) / total : 0}%` }}
      />
      <span
        className="choice-fill choice-second"
        style={{ width: `${total ? (second * 100) / total : 0}%` }}
      />
    </span>
  );
}
function GroupLine({
  label,
  first,
  second = 0,
  total,
  panel = false,
  signed = false,
}: {
  label: string;
  first: number;
  second?: number;
  total: number;
  panel?: boolean;
  signed?: boolean;
}) {
  return (
    <span className="choice-group-line">
      <span className="choice-group-label">{label}</span>
      <span className="choice-group-visual">
        <Stack first={first} second={second} total={total} panel={panel} />
        <span className="choice-group-numbers">
          {total
            ? signed
              ? `+ ${frequency(first, total)} · − ${frequency(second, total)}`
              : frequency(first + second, total)
            : "Aucune réponse pour cette impression"}
        </span>
      </span>
    </span>
  );
}

function Observations({
  diagnostic,
}: {
  diagnostic: StudentDiagnosticChoices;
}) {
  const [search, setSearch] = useState(""),
    [order, setOrder] = useState("case");
  const comparable = diagnostic.totalCount > 0 && diagnostic.panelCount > 0;
  const observations = diagnostic.observations.filter((row) =>
    normalize(`${row.label} ${row.category}`).includes(
      normalize(search.trim()),
    ),
  );
  if (order === "gap" && comparable)
    observations.sort(
      (a, b) =>
        Math.max(
          Math.abs(b.positivePercent - b.panelPositivePercent),
          Math.abs(b.negativePercent - b.panelNegativePercent),
        ) -
        Math.max(
          Math.abs(a.positivePercent - a.panelPositivePercent),
          Math.abs(a.negativePercent - a.panelNegativePercent),
        ),
    );
  return (
    <section
      className="choice-observations"
      aria-label={`Données cliniques pour ${diagnostic.label}`}
    >
      <h3>Données retenues pour {diagnostic.label}</h3>
      <p>
        Parmi les <strong>{diagnostic.totalCount} étudiants</strong> et les{" "}
        <strong>{diagnostic.panelCount} experts</strong> ayant retenu cette
        impression, principale ou alternative. Chaque barre utilise l’effectif
        de son groupe.
      </p>
      <p className="choice-legend">
        <span>+ En faveur</span>
        <span className="choice-hatched">− En défaveur</span>
        <span>Espace restant : donnée non retenue</span>
      </p>
      {!comparable && (
        <p className="choice-notice">
          {diagnostic.totalCount === 0
            ? "Aucun étudiant n’a retenu cette impression. Les données étudiantes sont sans réponse, et non des réponses incorrectes."
            : "Aucun expert n’a retenu cette impression : la comparaison des données au panel n’est pas disponible."}
        </p>
      )}
      <div className="choice-controls">
        <Input
          label="Rechercher une donnée clinique"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Donnée ou catégorie"
        />
        <label className="field">
          <span>Ordre des données</span>
          <select
            aria-label="Ordre des données"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
          >
            <option value="case">Ordre du cas clinique</option>
            <option value="gap" disabled={!comparable}>
              Écarts au panel les plus marqués
            </option>
          </select>
        </label>
      </div>
      {order === "gap" && comparable && (
        <p className="choice-notice">
          Tri par le plus grand écart de fréquence pour un signe (+ ou −). Un
          écart décrit les choix ; il ne constitue pas une note.
        </p>
      )}
      <ul className="choice-observation-list">
        {observations.map((row) => (
          <li key={row.observationId}>
            <h4>{row.label}</h4>
            <span className="choice-category">{row.category}</span>
            <GroupLine
              label="Étudiants"
              first={row.positive}
              second={row.negative}
              total={diagnostic.totalCount}
              signed
            />
            <GroupLine
              label="Panel expert"
              first={row.panelPositive}
              second={row.panelNegative}
              total={diagnostic.panelCount}
              panel
              signed
            />
            <small>
              Non retenue par les étudiants :{" "}
              {diagnostic.totalCount
                ? frequency(row.notSelected, diagnostic.totalCount)
                : "sans réponse"}
              .
            </small>
          </li>
        ))}
      </ul>
      {!observations.length && (
        <p>Aucune donnée ne correspond à votre recherche.</p>
      )}
    </section>
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
    [caseId, setCaseId] = useState<string | null>(null),
    [diagnosticId, setDiagnosticId] = useState<string | null>(null);
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
  const diagnostics = [...(data?.diagnostics ?? [])].sort(
    (a, b) => b.totalCount - a.totalCount || b.panelCount - a.panelCount,
  );
  const selected =
    diagnostics.find((row) => row.diagnosticId === diagnosticId) ??
    diagnostics[0];
  return (
    <details
      className="panel-card grade-distribution choice-analysis"
      open={opened}
      onToggle={(e) => setOpened(e.currentTarget.open)}
    >
      <summary>
        <span className="eyebrow">BILAN DU GROUPE · CHOIX</span>
        <h2>Impressions cliniques et données retenues</h2>
        <span>
          {opened ? "Réduire" : "Ouvrir"} la synthèse collective · réservée au
          professeur
        </span>
      </summary>
      {opened && (
        <div className="choice-analysis-content">
          <p>
            Comprenez les choix du groupe au-delà des notes. Cette synthèse ne
            présente aucun nom ni réponse individuelle.
          </p>
          {cases.length > 1 && (
            <label className="field">
              <span>Cas à analyser</span>
              <select
                aria-label="Cas à analyser"
                value={selectedCase?.id}
                onChange={(e) => {
                  setCaseId(e.target.value);
                  setDiagnosticId(null);
                }}
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
            <Loading label="Chargement des choix du groupe…" />
          ) : query.isError ? (
            <ErrorBox
              message={getError(query.error)}
              retry={() => query.refetch()}
            />
          ) : (
            data && (
              <>
                <h3 className="choice-case-title">{data.caseName}</h3>
                <div className="distribution-metrics">
                  <div>
                    <span>Copies définitives</span>
                    <strong>
                      {data.submittedCount}{" "}
                      <small>/ {data.participantCount}</small>
                    </strong>
                  </div>
                  <div>
                    <span>Non soumises · exclues</span>
                    <strong>{data.excludedCount}</strong>
                  </div>
                  <div>
                    <span>Panel du corrigé</span>
                    <strong>
                      {data.panelTotal} <small>experts</small>
                    </strong>
                  </div>
                  <div>
                    <span>Impressions proposées</span>
                    <strong>{diagnostics.length}</strong>
                  </div>
                </div>
                <p>
                  {data.status === "open"
                    ? "Bilan provisoire : les nouvelles copies définitives sont prises en compte automatiquement."
                    : "Bilan des copies définitives du cas."}{" "}
                  Les brouillons ne sont jamais comptés.
                </p>
                {!data.submittedCount ? (
                  <p className="choice-notice">
                    Aucune copie définitive pour ce cas. Les graphiques
                    apparaîtront après la première soumission.
                  </p>
                ) : (
                  <>
                    <h3>Quelles impressions le groupe a-t-il retenues ?</h3>
                    <p>
                      Pourcentages sur{" "}
                      <strong>{data.submittedCount} étudiants</strong> et{" "}
                      <strong>{data.panelTotal} experts</strong>. Chacun choisit
                      deux impressions distinctes : la somme des pourcentages
                      sur tous les diagnostics vaut donc 200 %. Sélectionnez une
                      impression pour voir ses données cliniques.
                    </p>
                    <p className="choice-legend">
                      <span>
                        Étudiants · partie pleine : impression clinique
                      </span>
                      <span className="choice-hatched">
                        Étudiants · partie hachurée : alternative
                      </span>
                    </p>
                    <ul
                      className="choice-diagnostic-list"
                      aria-label="Répartition des impressions cliniques"
                    >
                      {diagnostics.map((row) => (
                        <li key={row.diagnosticId}>
                          <button
                            type="button"
                            aria-pressed={
                              selected?.diagnosticId === row.diagnosticId
                            }
                            aria-label={`Voir les données pour ${row.label}`}
                            onClick={() => setDiagnosticId(row.diagnosticId)}
                          >
                            <strong>{row.label}</strong>
                            <GroupLine
                              label="Étudiants"
                              first={row.mainCount}
                              second={row.alternativeCount}
                              total={data.submittedCount}
                            />
                            <span className="choice-role-counts">
                              Impression clinique :{" "}
                              {frequency(row.mainCount, data.submittedCount)} ·
                              Alternative :{" "}
                              {frequency(
                                row.alternativeCount,
                                data.submittedCount,
                              )}
                            </span>
                            <GroupLine
                              label="Panel expert"
                              first={row.panelCount}
                              total={data.panelTotal}
                              panel
                            />
                          </button>
                        </li>
                      ))}
                    </ul>
                    {selected && (
                      <Observations
                        key={`${selectedCase.id}-${selected.diagnosticId}`}
                        diagnostic={selected}
                      />
                    )}
                  </>
                )}
              </>
            )
          )}
        </div>
      )}
    </details>
  );
}
