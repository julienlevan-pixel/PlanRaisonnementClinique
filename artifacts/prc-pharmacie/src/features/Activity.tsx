import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { Link, useLocation, useParams } from "wouter";
import { QRCodeSVG } from "qrcode.react";
import {
  getGetCurrentUserQueryKey,
  useGetCurrentUser,
} from "@workspace/api-client-react";
import type { AppActions } from "../app/actions";
import { api } from "../app/api";
import {
  Area,
  AuthenticatedPage,
  Btn,
  ErrorBox,
  Input,
  Loading,
  SectionTitle,
  Status,
} from "../app/ui";
import { dateLabel, getError } from "../app/utils";
import "./activity.css";

type Role = "main" | "alternative";
type Aggregate = {
  totalSubmissions?: number;
  minimumPanelSize?: number;
  diagnostics?: any[];
  distributions?: any[];
};
const stages = [
  ["mainDiagnostic", "Hypothèses principales"],
  ["mainArguments", "Arguments des principales"],
  ["alternativeDiagnostic", "Hypothèses alternatives"],
  ["alternativeArguments", "Arguments des alternatives"],
  ["reference", "Corrigé et explications"],
] as const;

function useVisible() {
  const [visible, setVisible] = useState(
    () => document.visibilityState !== "hidden",
  );
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}
function percent(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} %`
    : "—";
}

export function ResultsSummary({
  data,
}: {
  data: Aggregate | null | undefined;
}) {
  return data ? (
    <AggregateComparison panel={data} />
  ) : (
    <p className="inline-empty">Aucun résultat disponible.</p>
  );
}

export function AggregateComparison({
  panel,
  classroom,
  caseData,
  reveals,
}: {
  panel?: Aggregate | null;
  classroom?: Aggregate | null;
  caseData?: any;
  reveals?: any;
}) {
  const [role, setRole] = useState<Role>("main");
  const [diagnosticId, setDiagnosticId] = useState("");
  const received = [
    ...(panel?.diagnostics ?? []),
    ...(classroom?.diagnostics ?? []),
  ];
  const diagnostics = [
    ...new Map<string, any>(
      (received.length ? received : (caseData?.diagnostics ?? [])).map(
        (d: any) =>
          [
            String(d.diagnosticId ?? d.id),
            { ...d, diagnosticId: d.diagnosticId ?? d.id },
          ] as [string, any],
      ),
    ).values(),
  ];
  const selected =
    diagnostics.find((d) => d.diagnosticId === diagnosticId) ?? diagnostics[0];
  const selectedId = selected?.diagnosticId;
  const main = role === "main";
  const countKey = main ? "mainCount" : "alternativeCount";
  const percentKey = main ? "mainPercent" : "alternativePercent";
  const diagnosticVisible =
    !reveals || !!reveals[main ? "mainDiagnostic" : "alternativeDiagnostic"];
  const argumentsVisible =
    !reveals || !!reveals[main ? "mainArguments" : "alternativeArguments"];
  const panelDistribution = panel?.distributions?.find(
    (row) => row.role === role && row.diagnosticId === selectedId,
  );
  const classDistribution = classroom?.distributions?.find(
    (row) => row.role === role && row.diagnosticId === selectedId,
  );
  const observationIds = [
    ...new Set<string>(
      [
        ...(panelDistribution?.observations ?? []),
        ...(classDistribution?.observations ?? []),
      ].map((row) => row.observationId),
    ),
  ];
  const label = (id: string) =>
    panelDistribution?.observations?.find(
      (row: any) => row.observationId === id,
    )?.label ||
    classDistribution?.observations?.find(
      (row: any) => row.observationId === id,
    )?.label ||
    caseData?.observations?.find((row: any) => row.id === id)?.text ||
    id;
  return (
    <div className="prc-aggregate">
      <div className="aggregate-denominators">
        <span>
          Panel : <b>{panel?.totalSubmissions ?? 0}</b> copies définitives
        </span>
        {classroom && (
          <span>
            Classe : <b>{classroom.totalSubmissions ?? 0}</b> copies définitives
          </span>
        )}
      </div>
      <label className="field">
        <span>Rôle de l’hypothèse</span>
        <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="main">Principale</option>
          <option value="alternative">Alternative</option>
        </select>
      </label>
      {diagnosticVisible ? (
        <div className="activity-table-scroll">
          <table className="activity-table">
            <caption>
              Choix diagnostiques — pourcentages sur toutes les copies
              définitives de chaque groupe
            </caption>
            <thead>
              <tr>
                <th>Diagnostic</th>
                {classroom && <th>Classe</th>}
                <th>Panel</th>
              </tr>
            </thead>
            <tbody>
              {diagnostics.map((d) => {
                const c = classroom?.diagnostics?.find(
                  (row) => row.diagnosticId === d.diagnosticId,
                );
                const p = panel?.diagnostics?.find(
                  (row) => row.diagnosticId === d.diagnosticId,
                );
                return (
                  <tr key={d.diagnosticId}>
                    <th scope="row">{d.label || d.diagnosticId}</th>
                    {classroom && (
                      <td>
                        {c?.[countKey] ?? "—"}{" "}
                        <small>({percent(c?.[percentKey])})</small>
                      </td>
                    )}
                    <td>
                      {p?.[countKey] ?? "—"}{" "}
                      <small>({percent(p?.[percentKey])})</small>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="stage-wait">
          Les hypothèses {main ? "principales" : "alternatives"} n’ont pas
          encore été révélées.
        </p>
      )}
      {argumentsVisible ? (
        <>
          <label className="field">
            <span>Diagnostic à comparer</span>
            <select
              value={selectedId ?? ""}
              onChange={(e) => setDiagnosticId(e.target.value)}
            >
              {diagnostics.map((d) => (
                <option key={d.diagnosticId} value={d.diagnosticId}>
                  {d.label || d.diagnosticId}
                </option>
              ))}
            </select>
          </label>
          <p className="denominator-note">
            Pour ce diagnostic et ce rôle : panel N ={" "}
            <b>{panelDistribution?.expertCount ?? 0}</b>
            {classroom && (
              <>
                {" "}
                ; classe N = <b>{classDistribution?.expertCount ?? 0}</b>
              </>
            )}
            . Les pourcentages ci-dessous utilisent ces dénominateurs.
          </p>
          {observationIds.length ? (
            <div className="comparison-list">
              {observationIds.map((id) => (
                <section className="comparison-observation" key={id}>
                  <h4>{label(id)}</h4>
                  {classroom && (
                    <DirectionBar
                      label="Classe"
                      distribution={classDistribution}
                      observationId={id}
                    />
                  )}
                  <DirectionBar
                    label="Panel"
                    distribution={panelDistribution}
                    observationId={id}
                  />
                </section>
              ))}
            </div>
          ) : (
            <p className="inline-empty">
              Aucune distribution disponible pour ce diagnostic dans ce rôle.
            </p>
          )}
        </>
      ) : (
        <p className="stage-wait">
          Les arguments {main ? "principaux" : "alternatifs"} n’ont pas encore
          été révélés.
        </p>
      )}
    </div>
  );
}
function DirectionBar({
  label,
  distribution,
  observationId,
}: {
  label: string;
  distribution: any;
  observationId: string;
}) {
  const row = distribution?.observations?.find(
    (item: any) => item.observationId === observationId,
  );
  const n = distribution?.expertCount ?? 0;
  const values = [
    Number(row?.positive ?? 0),
    Number(row?.negative ?? 0),
    Number(row?.notSelected ?? 0),
  ];
  const labels = ["En faveur (+)", "En défaveur (−)", "Non sélectionnée"];
  return (
    <div className="direction-comparison">
      <b>
        {label} <small>N = {n}</small>
      </b>
      <div className="direction-stack" aria-hidden="true">
        {values.map((value, i) => (
          <span
            key={i}
            className={`direction-${i}`}
            style={{ width: `${n ? (value / n) * 100 : 0}%` }}
          />
        ))}
      </div>
      <div className="direction-values">
        {values.map((value, i) => (
          <span key={i}>
            <i className={`direction-${i}`} aria-hidden="true" />
            {labels[i]} : <b>{value}</b> ({percent(n ? (value / n) * 100 : 0)})
          </span>
        ))}
      </div>
    </div>
  );
}

export function ActivityPage({ actions }: { actions: AppActions }) {
  const { launchId = "" } = useParams<{ launchId: string }>();
  const visible = useVisible();
  const qc = useQueryClient();
  const launch = useQuery({
    queryKey: ["activity", launchId],
    queryFn: () => api<any>(`/api/launches/${launchId}`),
    enabled: !!launchId,
    refetchInterval: (query) =>
      visible && query.state.data?.status === "open" ? 5000 : false,
    refetchIntervalInBackground: false,
  });
  const l = launch.data;
  const panel = useQuery({
    queryKey: ["activity-panel", launchId],
    queryFn: () => api<Aggregate>(`/api/launches/${launchId}/panel-results`),
    enabled: !!l && l.role === "panel" && l.status !== "open",
    retry: false,
  });
  const results = useQuery({
    queryKey: ["activity-results", launchId],
    queryFn: () => api<any>(`/api/launches/${launchId}/results`),
    enabled: !!l && l.role === "students" && l.status !== "open",
    retry: false,
  });
  const [invitation, setInvitation] = useState<{
    url: string;
    code: string;
  } | null>(null);
  const [invitationName, setInvitationName] = useState("");
  const [explanation, setExplanation] = useState("");
  const [minimum, setMinimum] = useState("5");
  const [error, setError] = useState("");
  const reference = l?.reference;
  useEffect(() => {
    if (reference) {
      setExplanation(reference.explanation ?? "");
      setMinimum(String(reference.minimumPanelSize ?? 5));
    }
  }, [reference?.status, reference?.explanation, reference?.minimumPanelSize]);
  const mutate = useMutation({
    mutationFn: ({ suffix, data }: { suffix: string; data?: any }) =>
      api<any>(`/api/launches/${launchId}/${suffix}`, "POST", data ?? {}),
    onSuccess: async () => {
      setError("");
      await Promise.all(
        ["activity", "activity-panel", "activity-results"].map((key) =>
          qc.invalidateQueries({ queryKey: [key, launchId] }),
        ),
      );
    },
    onError: (e) => setError(getError(e)),
  });
  const run = (suffix: string, data?: any) => mutate.mutate({ suffix, data });
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setError(
        "La copie automatique est indisponible. Sélectionnez le lien affiché.",
      );
    }
  };
  if (launch.isPending)
    return (
      <AuthenticatedPage actions={actions}>
        <Loading label="Ouverture de l’activité…" />
      </AuthenticatedPage>
    );
  if (!l || launch.isError)
    return (
      <AuthenticatedPage actions={actions}>
        <ErrorBox
          message={getError(launch.error)}
          retry={() => launch.refetch()}
        />
      </AuthenticatedPage>
    );
  const name = l.case?.name || l.prcName || l.name;
  const submitted = Number(l.submissionCount ?? 0),
    participants = Number(l.participantCount ?? 0),
    unsent = Math.max(0, participants - submitted);
  const accessUrl = new URL(
    `/join/${encodeURIComponent(l.code)}`,
    window.location.origin,
  ).toString();
  const validated =
    reference?.status === "validated" || l.referenceStatus === "validated";
  const closed = l.status !== "open",
    busy = mutate.isPending;
  const close = () => {
    if (
      window.confirm(
        `Fermer définitivement cette collecte ? ${unsent} copie(s) restent non soumises. Elles conserveront ce statut, sans recevoir une note de zéro.`,
      )
    )
      run("close");
  };
  const reveal = (key: string, checked: boolean) =>
    run("reveal", { [key]: checked });
  const createInvitation = () =>
    mutate.mutate(
      {
        suffix: "invitations",
        data: { name: invitationName.trim() || "Expert invité" },
      },
      {
        onSuccess: (data) => {
          setInvitation(data);
          setInvitationName("");
        },
      },
    );
  return (
    <AuthenticatedPage actions={actions}>
      <div className="back-heading">
        <Link href={`/prc/${l.prcId}`} className="back-link">
          <ArrowLeft size={15} /> Revenir au PRC
        </Link>
        <a
          className="btn btn-outline projection-link"
          href={`/projection/${launchId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={16} /> Ouvrir la projection
        </a>
      </div>
      <SectionTitle
        eyebrow={
          l.isTrial
            ? "LANCEMENT D’ESSAI ISOLÉ"
            : l.role === "panel"
              ? "RECUEILLIR LE PANEL"
              : "ANIMER AVEC LES ÉTUDIANTS"
        }
        title={name}
        aside={<Status value={l.status} />}
      />
      <p className="activity-context">
        {l.role === "panel" ? "Panel d’experts" : "Groupe étudiant"} ·{" "}
        {dateLabel(l.createdAt)}
        {l.isTrial &&
          " · Les copies de cet essai ne peuvent pas devenir un corrigé réel."}
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="activity-info">
        <div>
          <span>CODE D’ACCÈS</span>
          <b className="mono">{l.code}</b>
        </div>
        <div>
          <span>PARTICIPANTS</span>
          <b>{participants}</b>
        </div>
        <div>
          <span>SOUMISSIONS</span>
          <b>{submitted}</b>
        </div>
        <div>
          <span>NON SOUMISES</span>
          <b>{unsent}</b>
        </div>
      </div>
      <section className="next-command panel-card">
        <div>
          <div className="eyebrow">PROCHAINE ÉTAPE</div>
          <h2>
            {!closed
              ? "Recueillir les copies, puis fermer la collecte"
              : l.role === "panel"
                ? validated
                  ? "Le corrigé est validé : lancez un groupe étudiant depuis le PRC"
                  : reference?.status === "draft"
                    ? "Consulter les distributions et valider le corrigé"
                    : "Générer le corrigé à partir du panel fermé"
                : l.status === "published"
                  ? "Les copies corrigées sont accessibles dans les espaces privés"
                  : "Révéler progressivement, puis publier les copies corrigées"}
          </h2>
        </div>
        {!closed && (
          <Btn kind="danger" disabled={busy} onClick={close}>
            Fermer la collecte
          </Btn>
        )}
        {closed && l.role === "panel" && validated && (
          <Link href={`/prc/${l.prcId}`} className="btn btn-primary">
            Lancer avec les étudiants
          </Link>
        )}
      </section>
      {l.role === "students" ? (
        <section className="access-card">
          <QRCodeSVG
            value={accessUrl}
            size={132}
            level="M"
            title="Rejoindre ce groupe étudiant"
          />
          <div>
            <div className="eyebrow">ACCÈS ÉTUDIANT</div>
            <b>{l.code}</b>
            <p>
              <a href={accessUrl}>{accessUrl}</a>
            </p>
            <Btn kind="outline" onClick={() => copy(accessUrl)}>
              <Copy size={15} /> Copier le lien
            </Btn>
          </div>
        </section>
      ) : (
        !closed && (
          <section className="panel-card">
            <h2>Inviter un expert</h2>
            <p>
              Chaque contribution nécessite son propre lien d’invitation. Le
              code seul ne donne pas accès au panel.
            </p>
            <form
              className="invitation-form"
              onSubmit={(e) => {
                e.preventDefault();
                createInvitation();
              }}
            >
              <Input
                label="Nom de l’invitation"
                value={invitationName}
                maxLength={160}
                onChange={(e) => setInvitationName(e.target.value)}
                placeholder="Ex. Expert 1"
              />
              <Btn type="submit" disabled={busy}>
                <Users size={15} /> Créer une invitation
              </Btn>
            </form>
          </section>
        )
      )}
      {invitation && (
        <section className="invitation-banner">
          <QRCodeSVG
            value={new URL(invitation.url, window.location.origin).toString()}
            size={108}
            level="M"
            title="Invitation individuelle au panel"
          />
          <div>
            <b>Invitation individuelle créée</b>
            <p>
              <a href={invitation.url}>
                {new URL(invitation.url, window.location.origin).toString()}
              </a>
            </p>
            <Btn
              kind="outline"
              onClick={() =>
                copy(new URL(invitation.url, window.location.origin).toString())
              }
            >
              Copier l’invitation
            </Btn>
          </div>
          <Btn kind="quiet" onClick={() => setInvitation(null)}>
            <X size={16} /> Fermer
          </Btn>
        </section>
      )}
      <section className="panel-card">
        <h2>
          {l.role === "panel"
            ? "Distributions du panel"
            : "Comparer la classe et le panel"}
        </h2>
        {!closed ? (
          <p className="stage-wait">
            Les résultats collectifs restent masqués pendant la collecte. Seuls
            les effectifs de participation sont actualisés.
          </p>
        ) : (panel.isPending && l.role === "panel") ||
          (results.isPending && l.role === "students") ? (
          <Loading />
        ) : (panel.isError && l.role === "panel") ||
          (results.isError && l.role === "students") ? (
          <ErrorBox
            message="Les distributions n’ont pas pu être chargées."
            retry={() => {
              panel.refetch();
              results.refetch();
            }}
          />
        ) : (
          <AggregateComparison
            panel={l.role === "panel" ? panel.data : results.data?.panel}
            classroom={l.role === "students" ? results.data?.class : undefined}
            caseData={l.case}
          />
        )}
      </section>
      {closed && (
        <section className="panel-card">
          <h2>Révélation progressive</h2>
          <p>
            Ces étapes sont enregistrées sur le serveur et conservées après
            actualisation. Les notes privées restent masquées jusqu’à leur
            publication.
          </p>
          <div className="reveal-list">
            {stages.map(([key, label], index) => (
              <label className="toggle-line" key={key}>
                <span>
                  <b>
                    {index + 1}. {label}
                  </b>
                </span>
                <input
                  type="checkbox"
                  checked={!!l.reveals?.[key]}
                  disabled={busy}
                  onChange={(e) => reveal(key, e.target.checked)}
                  data-testid={`toggle-reveal-${key}`}
                />
              </label>
            ))}
          </div>
          <label className="top-diagnosis-option">
            <input
              type="checkbox"
              checked={!!l.reveals?.mainDiagnosticTopOnly}
              disabled={busy}
              onChange={(e) =>
                reveal("mainDiagnosticTopOnly", e.target.checked)
              }
            />{" "}
            Montrer d’abord l’hypothèse principale la plus fréquente (toutes les
            égalités sont conservées)
          </label>
          {l.role === "panel" && (
            <p>
              Les experts accèdent aux résultats du panel uniquement après
              activation de « Corrigé et explications ». Aucune note ne leur est
              attribuée.
            </p>
          )}
        </section>
      )}
      {l.role === "panel" && closed && !l.isTrial && (
        <section className="panel-card reference-card">
          <div className="panel-heading">
            <h2>Établir le corrigé</h2>
            <Status
              value={reference?.status ?? l.referenceStatus ?? "à générer"}
            />
          </div>
          <ScoringRule scoring={reference?.scoring} />
          {validated ? (
            <>
              <p className="reference-locked">
                Le corrigé est validé et immuable. Il conserve les copies
                sources, les choix minoritaires et la version clinique utilisée.
              </p>
              <p>
                {reference?.explanation || "Aucune explication complémentaire."}
              </p>
            </>
          ) : (
            <div className="reference-controls">
              <Input
                label="Minimum de copies expertes définitives"
                type="number"
                min={1}
                max={100}
                value={minimum}
                onChange={(e) => setMinimum(e.target.value)}
              />
              <Btn
                kind="outline"
                disabled={
                  busy ||
                  submitted < Number(minimum) ||
                  !Number.isInteger(Number(minimum)) ||
                  Number(minimum) < 1
                }
                onClick={() =>
                  run("reference/generate", {
                    minimumPanelSize: Number(minimum),
                  })
                }
              >
                {reference ? "Régénérer le brouillon" : "Générer le corrigé"}
              </Btn>
              {submitted < Number(minimum) && (
                <p className="form-error">
                  {submitted} copie(s) définitive(s) pour un minimum de{" "}
                  {minimum}.
                </p>
              )}
              <Area
                label="Explication du professeur (facultative)"
                value={explanation}
                maxLength={5000}
                rows={4}
                onChange={(e) => setExplanation(e.target.value)}
              />
              <Btn
                disabled={busy || reference?.status !== "draft"}
                onClick={() => {
                  if (
                    window.confirm(
                      "Valider définitivement ce corrigé et son barème ? Il ne sera plus modifiable.",
                    )
                  )
                    run("reference/validate", { explanation });
                }}
              >
                Valider le corrigé
              </Btn>
            </div>
          )}
        </section>
      )}
      {l.role === "students" &&
        closed &&
        Array.isArray(results.data?.participants) && (
          <TeacherCopies participants={results.data.participants} />
        )}
      {l.role === "students" && (
        <section className="publish-row">
          <div>
            <b>Publier les copies corrigées privées</b>
            <p>
              Chaque étudiant voit seulement sa copie et ses quatre composantes.
              Les {unsent} copies non soumises restent sans note.
            </p>
          </div>
          <Btn
            disabled={
              busy ||
              !closed ||
              !validated ||
              submitted === 0 ||
              l.status === "published"
            }
            onClick={() => run("publish")}
          >
            <ShieldCheck size={15} />{" "}
            {l.status === "published"
              ? "Résultats publiés"
              : "Publier les résultats"}
          </Btn>
        </section>
      )}
    </AuthenticatedPage>
  );
}

export function ScoringRule({ scoring }: { scoring?: any }) {
  return (
    <details className="scoring-rule" open>
      <summary>
        Barème pédagogique proposé — {scoring?.version || "V1"} · /20
      </summary>
      <p>
        Hypothèse principale : diagnostic 2 points + justification 8 points.
        Hypothèse alternative : diagnostic 2 points + justification 8 points.
      </p>
      <p>
        Un diagnostic est crédité lorsqu’au moins un expert l’a retenu dans le
        même rôle. La justification vaut <b>8 × R / C</b> : R est la somme des
        effectifs experts pour les données et signes choisis ; C est la somme
        des cinq plus grands maxima +/−, une valeur par donnée. Le nombre de
        choix de l’étudiant ne réduit pas C.
      </p>
      <p>
        Les désaccords et choix minoritaires sont conservés. Une hypothèse non
        représentée reçoit zéro dans ce rôle ; un choix non crédité n’est pas
        automatiquement une erreur clinique. Cette règle est une proposition
        pédagogique, pas une norme universelle des PRC.
      </p>
    </details>
  );
}

function TeacherCopies({ participants }: { participants: any[] }) {
  return (
    <details className="panel-card teacher-private-copies">
      <summary>
        Copies individuelles — consultation privée du professeur
      </summary>
      <p>
        Ce tableau n’apparaît jamais dans la projection collective. Les copies
        non soumises n’ont pas de note.
      </p>
      <div className="activity-table-scroll">
        <table className="activity-table">
          <thead>
            <tr>
              <th>Participant</th>
              <th>Copie</th>
              <th>Diagnostic principal /2</th>
              <th>Justification principale /8</th>
              <th>Diagnostic alternatif /2</th>
              <th>Justification alternative /8</th>
              <th>Total /20</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p, index) => (
              <tr key={p.id ?? index}>
                <th scope="row">{p.pseudonym}</th>
                <td>{p.state === "submitted" ? "Soumise" : "Non soumise"}</td>
                {[
                  "mainDiagnosis",
                  "mainJustification",
                  "alternativeDiagnosis",
                  "alternativeJustification",
                ].map((key) => (
                  <td key={key}>
                    {p.state === "submitted" &&
                    typeof p.components?.[key] === "number"
                      ? p.components[key].toLocaleString("fr-CA", {
                          maximumFractionDigits: 2,
                        })
                      : "—"}
                  </td>
                ))}
                <td>
                  {p.state === "submitted" && typeof p.score === "number"
                    ? p.score.toLocaleString("fr-CA", {
                        maximumFractionDigits: 2,
                      })
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function ProjectionPage() {
  const { launchId = "" } = useParams<{ launchId: string }>();
  const visible = useVisible();
  const projection = useQuery({
    queryKey: ["projection", launchId],
    queryFn: () => api<any>(`/api/launches/${launchId}/projection`),
    refetchInterval: visible ? 5000 : false,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const p = projection.data;
  if (projection.isPending)
    return (
      <main className="projection-page">
        <Loading label="Ouverture de la projection…" />
      </main>
    );
  if (!p || projection.isError)
    return (
      <main className="projection-page">
        <ErrorBox
          message="La projection est réservée au professeur propriétaire de ce PRC."
          retry={() => projection.refetch()}
        />
        <Link href="/login">Connexion enseignante</Link>
      </main>
    );
  return (
    <main className="projection-page">
      <header className="projection-header">
        <div>
          <p>PLAN DE RAISONNEMENT CLINIQUE · PROJECTION COLLECTIVE</p>
          <h1>{p.case?.name || p.launch?.name}</h1>
        </div>
        <div>
          <span>Code d’activité</span>
          <b>{p.launch?.code || p.code}</b>
          <Status value={p.status || p.launch?.status} />
        </div>
      </header>
      <p className="projection-privacy">
        Vue collective : aucune identité, copie individuelle ou note personnelle
        n’est affichée.
      </p>
      {(p.status || p.launch?.status) === "open" ? (
        <section className="panel-card">
          <h2>Réponses en cours</h2>
          <p>Les résultats restent masqués pendant la collecte.</p>
          <p>
            {p.launch?.submissionCount ?? 0} soumission(s) sur{" "}
            {p.launch?.participantCount ?? 0} participant(s).
          </p>
        </section>
      ) : (
        <section className="panel-card">
          <AggregateComparison
            panel={p.panel}
            classroom={p.role === "students" ? p.class : undefined}
            caseData={p.case}
            reveals={p.reveals || p.launch?.reveals}
          />
          {(p.reveals || p.launch?.reveals)?.reference && p.reference && (
            <section>
              <h2>Corrigé et explications</h2>
              <ScoringRule scoring={p.reference.scoring} />
              <p>
                {p.reference.explanation ||
                  "Aucune explication complémentaire."}
              </p>
            </section>
          )}
        </section>
      )}
      <footer>
        Les étapes affichées sont pilotées depuis l’écran d’animation du
        professeur.
      </footer>
    </main>
  );
}

export function ProtectedActivity({ actions }: { actions: AppActions }) {
  const current = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey(), retry: false },
  });
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (!current.isLoading && !current.data?.user) setLocation("/login");
  }, [current.isLoading, current.data, setLocation]);
  if (current.isLoading || !current.data?.user)
    return (
      <div className="auth-page">
        <Loading label="Vérification de la session…" />
      </div>
    );
  return <ActivityPage actions={actions} />;
}
