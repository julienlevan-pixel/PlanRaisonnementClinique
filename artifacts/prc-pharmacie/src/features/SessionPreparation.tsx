import { useEffect, useRef, useState } from "react";
import { Btn } from "../app/ui";
import { CasePreview } from "./CasePreview";
import type { CasePreviewData } from "./library-model";
import type { GradingSummary } from "./RubricEditor";
import "./session-preparation.css";

export type PreparedCase = CasePreviewData & {
  id: string;
  version: number;
  corrected: boolean;
  grading: GradingSummary | null;
};
export type TeachingPreparation = {
  role: "panel" | "students";
  deliveryMode: "synchronous" | "asynchronous";
  maximum: number | null;
  attainableMaximum: number | null;
  preparationToken: string;
  cases: PreparedCase[];
};
const number = (value: number) =>
  value.toLocaleString("fr-CA", { maximumFractionDigits: 2 });
function Preview({ item, expert }: { item: PreparedCase; expert: boolean }) {
  const [opened, setOpened] = useState(false);
  return (
    <details
      className="preparation-preview"
      onToggle={(e) => {
        if (e.currentTarget.open) setOpened(true);
      }}
    >
      <summary>
        {expert ? "Aperçu expert" : "Aperçu étudiant"} · {item.name}
      </summary>
      {opened && (
        <CasePreview
          key={`${item.id}-${item.version}`}
          data={item}
          expertPoints={expert}
          title={
            expert
              ? "Essayer le questionnaire expert"
              : "Essayer le questionnaire étudiant"
          }
        />
      )}
    </details>
  );
}
export function SessionPreparationReview({
  name,
  data,
  busy,
  refreshing,
  onEdit,
  onRefresh,
}: {
  name: string;
  data: TeachingPreparation;
  busy: boolean;
  refreshing: boolean;
  onEdit: () => void;
  onRefresh: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [data.preparationToken]);
  const student = data.role === "students",
    synchronous = data.deliveryMode === "synchronous";
  return (
    <section
      className="session-preparation-review"
      aria-label="Récapitulatif de la séance"
    >
      <div className="eyebrow">DERNIÈRE VÉRIFICATION</div>
      <h2 ref={heading} tabIndex={-1}>
        Vérifier avant de créer la séance
      </h2>
      <h3>{name}</h3>
      <dl className="preparation-summary">
        <div>
          <dt>Participants</dt>
          <dd>{student ? "Étudiants" : "Cliniciens experts"}</dd>
        </div>
        <div>
          <dt>Déroulement</dt>
          <dd>{synchronous ? "Synchrone" : "Asynchrone"}</dd>
        </div>
        <div>
          <dt>Cas dans l’ordre choisi</dt>
          <dd>{data.cases.length}</dd>
        </div>
        <div>
          <dt>{student ? "Note maximale de la séance" : "Pointage"}</dt>
          <dd>
            {student && data.maximum !== null
              ? `${number(data.maximum)} points`
              : "Sans note étudiante"}
          </dd>
        </div>
      </dl>
      <p className="preparation-mode">
        {synchronous
          ? "Vous présenterez les cas, ouvrirez les réponses puis guiderez la discussion. La création prépare la salle ; elle n’ouvre pas les réponses."
          : "Vous autorisez un parcours autonome : chaque étudiant répond, consulte son corrigé et avance jusqu’à son bilan, sans attendre le groupe."}
      </p>
      <p>
        {student
          ? "Pour chaque cas, les étudiants retiendront deux impressions cliniques distinctes et cinq données pour chacune, avec leur signe + ou −."
          : "Pour chaque cas, les experts retiendront deux impressions cliniques et cinq données signées pour chacune. Ils attribueront une importance de 1 à 3 à chaque donnée choisie."}
      </p>
      {student &&
        data.maximum !== null &&
        data.attainableMaximum !== null &&
        data.attainableMaximum < data.maximum && (
          <p>
            Avec ces barèmes, le meilleur score réalisable est{" "}
            {number(data.attainableMaximum)} / {number(data.maximum)}. Les notes
            ne sont pas remises à l’échelle.
          </p>
        )}
      <h3>Cas, corrigés et barèmes vérifiés</h3>
      <ol className="preparation-cases">
        {data.cases.map((c, index) => (
          <li key={c.id}>
            <div className="preparation-case-title">
              <strong>
                Cas {index + 1} · {c.name}
              </strong>
              <span>
                Version {c.version}
                {c.grading ? ` · ${number(c.grading.maximum)} points` : ""}
              </span>
            </div>
            <p className="preparation-ready">
              ✓ Cas complet ·{" "}
              {student
                ? "Corrigé validé"
                : "Corrigé à construire avec ce panel"}
            </p>
            <p>
              {c.diagnostics.length} impressions cliniques proposées ·{" "}
              {c.observations.filter((o) => o.text.trim()).length} données
              cliniques.
            </p>
            <Preview item={c} expert={!student} />
          </li>
        ))}
      </ol>
      <p>
        Les versions et les barèmes affichés seront enregistrés pour cette
        séance. L’aperçu reste local : aucune réponse et aucune note d’essai ne
        sont enregistrées.
      </p>
      <div className="preparation-actions">
        <Btn type="submit" disabled={busy || refreshing}>
          {busy ? "Création…" : `Créer la séance (${data.cases.length} cas)`}
        </Btn>
        <Btn
          kind="outline"
          type="button"
          disabled={busy || refreshing}
          onClick={onEdit}
        >
          Modifier la préparation
        </Btn>
        <Btn
          kind="quiet"
          type="button"
          disabled={busy || refreshing}
          onClick={onRefresh}
        >
          {refreshing ? "Actualisation…" : "Actualiser le récapitulatif"}
        </Btn>
      </div>
    </section>
  );
}
