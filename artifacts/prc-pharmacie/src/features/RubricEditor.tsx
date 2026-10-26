import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../app/api";
import { Btn } from "../app/ui";
import { getError } from "../app/utils";
import "./rubric-editor.css";

export type ProfessorRubric = {
  version: string;
  revision: number;
  clinicalMaximum: number;
  diagnostics: {
    diagnosticId: string;
    mainPoints: number;
    alternativePoints: number;
    observations: {
      observationId: string;
      positivePoints: number;
      negativePoints: number;
    }[];
  }[];
};
export type GradingSummary = {
  maximum: number;
  attainableMaximum: number;
  mainDiagnosisMaximum: number;
  alternativeDiagnosisMaximum: number;
  clinicalMaximum: number;
  rubricRevision?: number;
};
const number = (value: number) =>
  value.toLocaleString("fr-CA", { maximumFractionDigits: 2 });
export function previewGrading(rubric: ProfessorRubric): GradingSummary {
  const mainDiagnosisMaximum = Math.max(
    0,
    ...rubric.diagnostics.map((row) => row.mainPoints),
  );
  const alternativeDiagnosisMaximum = Math.max(
    0,
    ...rubric.diagnostics.map((row) => row.alternativePoints),
  );
  const clinical = (row: ProfessorRubric["diagnostics"][number]) =>
    Math.min(
      rubric.clinicalMaximum,
      row.observations
        .map((item) => Math.max(item.positivePoints, item.negativePoints))
        .sort((a, b) => b - a)
        .slice(0, 5)
        .reduce((a, b) => a + b, 0),
    );
  let attainableMaximum = 0;
  for (const main of rubric.diagnostics)
    for (const alternative of rubric.diagnostics)
      if (main.diagnosticId !== alternative.diagnosticId)
        attainableMaximum = Math.max(
          attainableMaximum,
          main.mainPoints +
            clinical(main) +
            alternative.alternativePoints +
            clinical(alternative),
        );
  return {
    maximum:
      mainDiagnosisMaximum +
      alternativeDiagnosisMaximum +
      2 * rubric.clinicalMaximum,
    attainableMaximum,
    mainDiagnosisMaximum,
    alternativeDiagnosisMaximum,
    clinicalMaximum: rubric.clinicalMaximum,
    rubricRevision: rubric.revision,
  };
}

export function RubricEditor({
  launchId,
  rubric,
  suggestedRubric,
  caseData,
  distributions,
  onDirty,
}: {
  launchId: string;
  rubric: ProfessorRubric;
  suggestedRubric?: ProfessorRubric;
  caseData: {
    diagnostics: { id: string; label: string }[];
    observations: { id: string; text: string }[];
  };
  distributions: any[];
  onDirty: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(rubric));
  const [dirty, setDirty] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState("");
  const cache = useQueryClient();
  useEffect(() => {
    if (!dirty) setDraft(structuredClone(rubric));
  }, [rubric.revision]);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  const edit = (value: ProfessorRubric) => {
    setDraft(value);
    setDirty(true);
  };
  const save = useMutation({
    mutationFn: () =>
      api<any>(`/api/launches/${launchId}/reference/rubric`, "PUT", {
        revision: draft.revision,
        rubric: draft,
      }),
    onSuccess: async (result) => {
      setDraft(result.rubric);
      setDirty(false);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["activity", launchId] }),
        cache.invalidateQueries({ queryKey: ["editor"] }),
        cache.invalidateQueries({ queryKey: ["library"] }),
      ]);
    },
  });
  const summary = previewGrading(draft);
  const stale = rubric.revision !== draft.revision;
  const reload = async () => {
    if (
      dirty &&
      !window.confirm(
        "Remplacer vos modifications locales par le barème enregistré ?",
      )
    )
      return;
    setReloading(true);
    setReloadError("");
    try {
      const latest = await api<any>(`/api/launches/${launchId}`);
      cache.setQueryData(["activity", launchId], latest);
      setDraft(structuredClone(latest.reference.rubric));
      setDirty(false);
      save.reset();
    } catch (error) {
      setReloadError(getError(error));
    } finally {
      setReloading(false);
    }
  };
  const input = (
    label: string,
    value: number,
    change: (value: number) => void,
  ) => (
    <label className="rubric-points">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        min="0"
        max="100"
        step="0.01"
        value={value}
        disabled={save.isPending || reloading}
        onChange={(event) => change(Number(event.target.value))}
      />
    </label>
  );
  return (
    <section
      className="rubric-editor"
      aria-label="Barème personnalisable du professeur"
    >
      <h3>Barème personnalisable</h3>
      <p>
        <b>Note maximale : {number(summary.maximum)} points.</b> Vous pouvez
        modifier les valeurs ci-dessous avant de les enregistrer.
      </p>
      <details className="rubric-instructions" open>
        <summary>Comment utiliser ce barème ?</summary>
        <p>
          Ces valeurs sont proposées par défaut, puis modifiables par le
          professeur :
        </p>
        <ul>
          <li>
            Impression principale : 3 points pour la plus choisie par le panel,
            y compris les ex æquo ; 1 point pour une autre impression retenue
            par au moins un expert ; sinon 0.
          </li>
          <li>
            Impression alternative : 2 points si au moins un expert l’a retenue
            ; sinon 0.
          </li>
          <li>
            Données cliniques, pour chaque diagnostic et chaque signe : 75 % et
            plus = 1 point ; 50 % à moins de 75 % = 0,5 ; moins de 50 % = 0.
          </li>
          <li>
            Le pourcentage est calculé parmi les experts ayant retenu ce
            diagnostic, en principale ou en alternative. Les cinq données de
            l’étudiant s’additionnent, avec un plafond de 5 points par
            impression par défaut.
          </li>
        </ul>
        <p>
          Les notes expertes de 1 à 3 restent un indicateur d’importance ; les
          points proposés ici reposent sur les fréquences. Ajustez le
          solutionnaire selon votre jugement pédagogique. Chaque groupe conserve
          une copie du barème utilisé à son ouverture, même si vous le modifiez
          ensuite pour les groupes suivants.
        </p>
      </details>
      {input(
        "Plafond des données cliniques par impression",
        draft.clinicalMaximum,
        (value) => edit({ ...draft, clinicalMaximum: value }),
      )}
      {summary.attainableMaximum < summary.maximum && (
        <p className="rubric-attainable">
          Avec les points actuels, le meilleur score réalisable est{" "}
          {number(summary.attainableMaximum)} / {number(summary.maximum)}. Vous
          pouvez ajuster les données ou le plafond ; aucune remise à l’échelle
          automatique n’est appliquée.
        </p>
      )}
      {draft.diagnostics.map((diagnostic, index) => {
        const label =
          caseData.diagnostics.find((row) => row.id === diagnostic.diagnosticId)
            ?.label ?? diagnostic.diagnosticId;
        const matching = distributions.filter(
          (row) => row.diagnosticId === diagnostic.diagnosticId,
        );
        const experts = matching.reduce((sum, row) => sum + row.expertCount, 0);
        const update = (row: typeof diagnostic) =>
          edit({
            ...draft,
            diagnostics: draft.diagnostics.map((prior, i) =>
              i === index ? row : prior,
            ),
          });
        return (
          <details className="rubric-diagnostic" key={diagnostic.diagnosticId}>
            <summary>
              {label} · principale {number(diagnostic.mainPoints)} pt ·
              alternative {number(diagnostic.alternativePoints)} pt
            </summary>
            <p>
              {experts} expert(s) ont retenu ce diagnostic, tous rôles réunis.
            </p>
            <div className="rubric-diagnosis-points">
              {input(
                `Diagnostic principal — ${label}`,
                diagnostic.mainPoints,
                (value) => update({ ...diagnostic, mainPoints: value }),
              )}
              {input(
                `Diagnostic alternatif — ${label}`,
                diagnostic.alternativePoints,
                (value) => update({ ...diagnostic, alternativePoints: value }),
              )}
            </div>
            <p className="rubric-scroll-hint">
              Glissez le tableau horizontalement pour voir les fréquences et
              modifier les points + et −.
            </p>
            <div
              className="rubric-table-scroll"
              role="region"
              aria-label={`Points des données — ${label}`}
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th>Donnée clinique</th>
                    <th>Choix +</th>
                    <th>Points +</th>
                    <th>Choix −</th>
                    <th>Points −</th>
                  </tr>
                </thead>
                <tbody>
                  {diagnostic.observations.map(
                    (observation, observationIndex) => {
                      const text =
                        caseData.observations.find(
                          (row) => row.id === observation.observationId,
                        )?.text ?? observation.observationId;
                      const positive = matching.reduce(
                        (sum, row) =>
                          sum +
                          (row.observations.find(
                            (item: any) =>
                              item.observationId === observation.observationId,
                          )?.positive ?? 0),
                        0,
                      );
                      const negative = matching.reduce(
                        (sum, row) =>
                          sum +
                          (row.observations.find(
                            (item: any) =>
                              item.observationId === observation.observationId,
                          )?.negative ?? 0),
                        0,
                      );
                      const change = (
                        key: "positivePoints" | "negativePoints",
                        value: number,
                      ) =>
                        update({
                          ...diagnostic,
                          observations: diagnostic.observations.map(
                            (prior, i) =>
                              i === observationIndex
                                ? { ...prior, [key]: value }
                                : prior,
                          ),
                        });
                      return (
                        <tr key={observation.observationId}>
                          <th scope="row">{text}</th>
                          <td>
                            {positive}/{experts}
                            <small>
                              {number(experts ? (positive * 100) / experts : 0)}{" "}
                              %
                            </small>
                          </td>
                          <td>
                            {input(
                              `Points + — ${label} — ${text}`,
                              observation.positivePoints,
                              (value) => change("positivePoints", value),
                            )}
                          </td>
                          <td>
                            {negative}/{experts}
                            <small>
                              {number(experts ? (negative * 100) / experts : 0)}{" "}
                              %
                            </small>
                          </td>
                          <td>
                            {input(
                              `Points − — ${label} — ${text}`,
                              observation.negativePoints,
                              (value) => change("negativePoints", value),
                            )}
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            </div>
          </details>
        );
      })}
      {(save.isError || reloadError) && (
        <p className="form-error" role="alert">
          {reloadError || getError(save.error)}
        </p>
      )}
      {stale && dirty && (
        <p role="alert">
          Une autre version du barème est disponible. Rechargez-la avant
          d’enregistrer.
        </p>
      )}
      <div className="rubric-actions">
        <Btn
          disabled={!dirty || save.isPending || reloading || stale}
          onClick={() => save.mutate()}
        >
          Enregistrer le barème
        </Btn>
        <Btn
          kind="outline"
          disabled={save.isPending || reloading}
          onClick={() => void reload()}
        >
          Recharger le barème enregistré
        </Btn>
        {suggestedRubric && (
          <Btn
            kind="quiet"
            disabled={save.isPending || reloading}
            onClick={() => {
              if (
                window.confirm(
                  "Rétablir localement les valeurs proposées ? Enregistrez ensuite pour les appliquer aux prochains groupes.",
                )
              )
                edit({
                  ...structuredClone(suggestedRubric),
                  revision: draft.revision,
                });
            }}
          >
            Rétablir les valeurs proposées
          </Btn>
        )}
      </div>
      <p role="status">
        {dirty
          ? "Modifications non enregistrées. Enregistrez avant de lancer un groupe."
          : `Barème enregistré · version ${draft.revision}. Les groupes déjà ouverts gardent leurs points.`}
      </p>
    </section>
  );
}
