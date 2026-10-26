import { useState } from "react";
import "./grade-distribution.css";

export type GradeDistributionData = {
  maximum: number;
  gradedCount: number;
  excludedCount: number;
  average: number | null;
  median: number | null;
  lowest: number | null;
  highest: number | null;
  bins: {
    lower: number;
    upper: number;
    upperInclusive: boolean;
    count: number;
    percentage: number;
  }[];
};
const number = (value: number | null | undefined) =>
  value == null
    ? "—"
    : value.toLocaleString("fr-CA", { maximumFractionDigits: 2 });

export function GradeDistribution({
  data,
  ownScore,
  preview = false,
}: {
  data: GradeDistributionData;
  ownScore?: number | null;
  preview?: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const peak = Math.max(1, ...data.bins.map((bin) => bin.count));
  const ownBin =
    ownScore == null
      ? -1
      : data.bins.findIndex(
          (bin) =>
            ownScore >= bin.lower &&
            (ownScore < bin.upper ||
              (bin.upperInclusive && ownScore <= bin.upper)),
        );
  const active = selected === null ? undefined : data.bins[selected];
  return (
    <section
      className="panel-card grade-distribution"
      aria-label="Distribution des notes du groupe"
    >
      <div className="eyebrow">BILAN DU GROUPE · NOTES SUR {data.maximum}</div>
      <h2>Comment les notes se répartissent-elles ?</h2>
      <p>
        {data.gradedCount} copie(s) notée(s). {data.excludedCount} copie(s) sans
        note, exclue(s) du graphique. Les noms et les copies des autres
        étudiants restent privés.
      </p>
      {preview && (
        <p className="distribution-preview">
          Aperçu professeur : publiez les résultats en fin de révision pour
          partager ce graphique avec les étudiants.
        </p>
      )}
      <div className="distribution-metrics">
        {[
          ["Moyenne", data.average],
          ["Médiane", data.median],
          ["Plus basse", data.lowest],
          ["Plus haute", data.highest],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <span>{label}</span>
            <strong>
              {number(value as number | null)} <small>/ {data.maximum}</small>
            </strong>
          </div>
        ))}
      </div>
      {data.gradedCount ? (
        <>
          <div
            className="distribution-chart-scroll"
            tabIndex={0}
            role="region"
            aria-label="Histogramme des notes par tranches"
          >
            <div className="distribution-chart">
              {data.bins.map((bin, index) => (
                <button
                  type="button"
                  key={bin.lower}
                  className={`distribution-column${ownBin === index ? " distribution-own" : ""}`}
                  aria-label={`${number(bin.lower)} à ${number(bin.upper)}${bin.upperInclusive ? " inclus" : " exclus"} sur ${data.maximum} : ${bin.count} copie(s), ${number(bin.percentage)} %${ownBin === index ? ". Votre note est dans cette tranche." : ""}`}
                  aria-pressed={selected === index}
                  onClick={() => setSelected(selected === index ? null : index)}
                >
                  <span className="distribution-bar-space">
                    <b>{bin.count}</b>
                    <span
                      className="distribution-bar"
                      style={{ height: `${(bin.count * 100) / peak}%` }}
                    />
                  </span>
                  <span className="distribution-axis-label">
                    {number(bin.lower)}–{number(bin.upper)}
                  </span>
                  {ownBin === index && (
                    <span className="distribution-own-label">Vous</span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <p className="distribution-detail" role="status">
            {active
              ? `${number(active.lower)} à ${number(active.upper)} sur ${data.maximum} : ${active.count} copie(s), soit ${number(active.percentage)} % du groupe.`
              : "Sélectionnez une barre pour voir l’effectif et le pourcentage de cette tranche. La borne haute appartient à la tranche suivante, sauf pour la note maximale."}
          </p>
        </>
      ) : (
        <p>Aucune copie notée pour le moment.</p>
      )}
      {ownScore != null && (
        <p className="distribution-personal">
          Votre note :{" "}
          <strong>
            {number(ownScore)} / {data.maximum}
          </strong>
          . Votre tranche est mise en évidence.
        </p>
      )}
    </section>
  );
}
