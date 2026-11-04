import { useId, useState } from "react";
import type { Choice } from "@workspace/api-client-react";
import { ObservationMatrix } from "./Participant";
import type { CasePreviewData } from "./library-model";
import {
  CaseQuickAccess,
  MobileImpressionSwitch,
  ResponseSelectionInstructions,
  type ImpressionRole,
  type ResponseReview,
} from "./ParticipantExperience";

type PreviewRole = "students" | "panel";
type PreviewCopy = ResponseReview & {
  mobileRole: ImpressionRole;
  error: string;
};
const emptyCopy = (): PreviewCopy => ({
  mainDiagnosticId: null,
  alternativeDiagnosticId: null,
  mainChoices: [],
  alternativeChoices: [],
  mobileRole: "main",
  error: "",
});

export function CasePreview({
  data,
  title = "Aperçu du questionnaire",
  initialRole = "students",
}: {
  data: CasePreviewData;
  title?: string;
  initialRole?: PreviewRole;
}) {
  const idPrefix = `preview-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [role, setRole] = useState<PreviewRole>(initialRole);
  const [copies, setCopies] = useState<Record<PreviewRole, PreviewCopy>>(
    () => ({
      students: emptyCopy(),
      panel: emptyCopy(),
    }),
  );
  const copy = copies[role];
  const expert = role === "panel";
  const update = (patch: Partial<PreviewCopy>) =>
    setCopies((current) => ({
      ...current,
      [role]: { ...current[role], ...patch },
    }));
  const scrollMatrix = () =>
    document
      .getElementById(`${idPrefix}-observation-matrix`)
      ?.scrollTo({ top: 0 });
  const selectSign = (
    id: string,
    sign: "+" | "-",
    choices: Choice[],
    set: (choices: Choice[]) => void,
  ) => {
    const selected = choices.find((choice) => choice.observationId === id);
    if (selected?.sign === sign)
      set(choices.filter((choice) => choice.observationId !== id));
    else if (selected)
      set(
        choices.map((choice) =>
          choice.observationId === id ? { ...choice, sign } : choice,
        ),
      );
    else if (choices.length < 5) set([...choices, { observationId: id, sign }]);
    else {
      update({
        error:
          "Cinq données au maximum par impression clinique. Retirez un choix pour en sélectionner un autre.",
      });
      return;
    }
    update({ error: "" });
  };
  return (
    <section className="case-preview" aria-label={title}>
      <header>
        <div className="eyebrow">
          {data.demonstrationLabel || "APERÇU LOCAL"}
        </div>
        <h2>{title}</h2>
        <p>{data.name || "PRC sans nom"}</p>
      </header>
      <p className="preview-scenario">
        {data.scenario || "Le scénario du cas apparaîtra ici."}
      </p>
      <p className="body-copy">{data.instructions}</p>
      <p className="preview-local-note">
        Vous pouvez essayer le tableau. Ces choix restent dans cette page :
        aucune copie et aucun score ne sont créés. Les essais étudiant et expert
        sont conservés séparément tant que cet aperçu reste ouvert.
      </p>
      <div
        className="preview-role-switch"
        role="group"
        aria-label="Choisir la vue du questionnaire"
      >
        <span>Essayer le questionnaire :</span>
        {(["students", "panel"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={role === value}
            aria-controls={`${idPrefix}-questionnaire`}
            onClick={() => {
              setRole(value);
              scrollMatrix();
            }}
          >
            {value === "panel" ? "Vue expert" : "Vue étudiant"}
          </button>
        ))}
      </div>
      <div id={`${idPrefix}-questionnaire`}>
        <ResponseSelectionInstructions expert={expert} exactFive />
        <div className="participant-response-tools">
          <CaseQuickAccess data={data} />
          <span className="participant-response-progress">
            Principale : {copy.mainChoices.length}/5 · Alternative :{" "}
            {copy.alternativeChoices.length}/5
          </span>
          <MobileImpressionSwitch
            controlsId={`${idPrefix}-observation-matrix`}
            active={copy.mobileRole}
            mainCount={copy.mainChoices.length}
            alternativeCount={copy.alternativeChoices.length}
            onChange={(mobileRole) => {
              update({ mobileRole });
              scrollMatrix();
            }}
          />
        </div>
        <ObservationMatrix
          idPrefix={idPrefix}
          mobileRole={copy.mobileRole}
          observations={data.observations.filter((o) => o.text.trim())}
          diagnostics={data.diagnostics}
          mainDiagnosticId={copy.mainDiagnosticId}
          alternativeDiagnosticId={copy.alternativeDiagnosticId}
          onDiagnosisChange={(role, value) => {
            if (role === "main") {
              update({ mainDiagnosticId: value, mainChoices: [], error: "" });
            } else {
              update({
                alternativeDiagnosticId: value,
                alternativeChoices: [],
                error: "",
              });
            }
          }}
          mainChoices={copy.mainChoices}
          alternativeChoices={copy.alternativeChoices}
          setMainChoices={(mainChoices) => update({ mainChoices })}
          setAlternativeChoices={(alternativeChoices) =>
            update({ alternativeChoices })
          }
          selectSign={selectSign}
          disabled={false}
          hasAlternative={true}
          expertPoints={expert}
        />
        {copy.error && (
          <p className="form-error" role="alert">
            {copy.error}
          </p>
        )}
      </div>
    </section>
  );
}
