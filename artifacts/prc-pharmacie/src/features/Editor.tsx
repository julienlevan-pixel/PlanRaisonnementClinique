import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Eye,
  FlaskConical,
  Plus,
  Save,
  Undo2,
  X,
} from "lucide-react";
import { Link, useLocation, useParams } from "wouter";
import {
  getGetWorkspaceSummaryQueryKey,
  getListPrcsQueryKey,
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
} from "../app/ui";
import { dateLabel, getError } from "../app/utils";
import { CasePreview } from "./CasePreview";
import { Sharing } from "./Sharing";
import { DemoStudentSessions } from "./DemoStudentSessions";
import { ObservationMatrix } from "./Participant";
import "./student-review.css";
import {
  clinicalDataCategories,
  workflowLabel,
  type Observation,
  type PrcDetail,
} from "./library-model";
import "./library-editor.css";

type FormData = {
  name: string;
  scenario: string;
  instructions: string;
  diagnostics: string[];
  observations: Observation[];
};
type UndoEntry = {
  label: string;
  observations?: Observation[];
  diagnostics?: string[];
};
const emptyForm = (): FormData => ({
  name: "",
  scenario: "",
  instructions:
    "Choisissez deux diagnostics distincts. Pour chaque impression clinique, retenez les données discriminantes et indiquez si elles sont en faveur (+) ou en défaveur (−). Panel : cinq données par impression clinique. Étudiants : de une à cinq.",
  diagnostics: [],
  observations: [],
});
const fromDocument = (data: PrcDetail): FormData => ({
  name: data.name,
  scenario: data.scenario,
  instructions: data.instructions,
  diagnostics: data.diagnostics.map((diagnostic) => diagnostic.label),
  observations: [...data.observations].sort((a, b) => a.position - b.position),
});
const normalizeOrder = (observations: Observation[]) =>
  observations.map((observation, position) => ({ ...observation, position }));

export function PrcEditor({ actions }: { actions: AppActions }) {
  const { prcId = "new" } = useParams<{ prcId: string }>();
  const isNew = prcId === "new";
  const [, navigate] = useLocation();
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["editor", prcId],
    queryFn: () => api<PrcDetail>(`/api/prcs/${prcId}`),
    enabled: !isNew,
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      query.state.data?.shared && document.visibilityState === "visible"
        ? 15000
        : false,
    refetchIntervalInBackground: false,
  });
  const [form, setForm] = useState<FormData>(emptyForm);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [bulk, setBulk] = useState("");
  const [history, setHistory] = useState<UndoEntry[]>([]);
  const [preview, setPreview] = useState(false);
  const [sharingOpen, setSharingOpen] = useState(false);
  const [conflict, setConflict] = useState(false);
  const baseVersion = useRef<number | null>(null);
  const [deliveryMode, setDeliveryMode] = useState<
    "synchronous" | "asynchronous"
  >("synchronous");
  const [trial, setTrial] = useState<{
    invitationUrl: string;
    code: string;
    launch: { id: string };
  } | null>(null);
  const loaded = useRef<string | null>(null);
  const pendingObservationFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingObservationFocus.current) return;
    document
      .getElementById(`editor-observation-${pendingObservationFocus.current}`)
      ?.focus();
    pendingObservationFocus.current = null;
  }, [form.observations]);
  useEffect(() => {
    if (loaded.current === prcId) return;
    if (isNew || query.data) {
      setForm(isNew ? emptyForm() : fromDocument(query.data!));
      baseVersion.current = isNew ? null : query.data!.version;
      setConflict(false);
      setDirty(false);
      setHistory([]);
      setTrial(null);
      setDeliveryMode("synchronous");
      setError("");
      setStatus("");
      loaded.current = prcId;
    }
  }, [prcId, isNew, query.data]);
  useEffect(() => {
    if (
      !query.data ||
      dirty ||
      saving ||
      busy ||
      conflict ||
      loaded.current !== prcId ||
      query.data.version === baseVersion.current
    )
      return;
    setForm(fromDocument(query.data));
    baseVersion.current = query.data.version;
    setStatus("Version récente chargée");
  }, [query.data, dirty, saving, busy, conflict, prcId]);
  const canManageSessions =
    isNew || query.data?.permissions?.manageSessions !== false;
  const newerVersion =
    !isNew &&
    !!query.data &&
    baseVersion.current !== null &&
    query.data.version > baseVersion.current;
  const loadLatest = async () => {
    if (
      dirty &&
      !window.confirm(
        "Charger la version récente ? Vos modifications locales non enregistrées seront remplacées.",
      )
    )
      return;
    setBusy(true);
    try {
      const document = await api<PrcDetail>(`/api/prcs/${prcId}`);
      setForm(fromDocument(document));
      baseVersion.current = document.version;
      setDirty(false);
      setConflict(false);
      setHistory([]);
      setError("");
      setStatus("Version récente chargée");
      cache.setQueryData(["editor", prcId], document);
    } catch (cause) {
      setError(getError(cause));
    } finally {
      setBusy(false);
    }
  };
  const update = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setDirty(true);
    setStatus("Modifications non enregistrées");
  };
  const remember = (entry: UndoEntry) =>
    setHistory((previous) => [...previous.slice(-19), entry]);
  const addObservation = () => {
    const id = crypto.randomUUID();
    pendingObservationFocus.current = id;
    update("observations", [
      ...form.observations,
      { id, text: "", category: "Autre", position: form.observations.length },
    ]);
  };
  const undo = () => {
    const entry = history.at(-1);
    if (!entry) return;
    setHistory((previous) => previous.slice(0, -1));
    if (entry.observations) {
      const current = new Map(
        form.observations.map((observation) => [observation.id, observation]),
      );
      const previousIds = new Set(
        entry.observations.map((observation) => observation.id),
      );
      update(
        "observations",
        normalizeOrder([
          ...entry.observations.map(
            (observation) => current.get(observation.id) || observation,
          ),
          ...form.observations.filter(
            (observation) => !previousIds.has(observation.id),
          ),
        ]),
      );
    }
    if (entry.diagnostics) update("diagnostics", entry.diagnostics);
  };
  const importObservations = () => {
    const lines = bulk
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) return;
    const observations = lines.map((line, index) => {
      const divider = line.indexOf("|");
      return {
        id: crypto.randomUUID(),
        text: (divider < 0 ? line : line.slice(0, divider)).trim(),
        category:
          divider < 0 ? "Autre" : line.slice(divider + 1).trim() || "Autre",
        position: form.observations.length + index,
      };
    });
    update("observations", [...form.observations, ...observations]);
    setBulk("");
  };
  const move = (index: number, delta: number) => {
    const observations = [...form.observations];
    remember({
      label: "le déplacement",
      observations: structuredClone(observations),
    });
    [observations[index], observations[index + delta]] = [
      observations[index + delta],
      observations[index],
    ];
    update("observations", normalizeOrder(observations));
  };
  const missing = [
    ...(!form.name.trim()
      ? [{ text: "Donner un nom au PRC", id: "prc-name" }]
      : []),
    ...(!form.scenario.trim()
      ? [{ text: "Rédiger le scénario", id: "prc-scenario" }]
      : []),
    ...(new Set(form.diagnostics.map((label) => label.trim()).filter(Boolean))
      .size < 2
      ? [
          {
            text: "Proposer au moins deux diagnostics distincts",
            id: "prc-diagnostics",
          },
        ]
      : []),
    ...(form.observations.filter((observation) => observation.text.trim())
      .length < 5
      ? [
          {
            text: "Saisir au moins cinq observations pour le panel",
            id: "prc-observations",
          },
        ]
      : []),
  ];
  const focus = (id: string) => {
    const element = document.getElementById(id);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    element?.focus();
  };
  const save = async (): Promise<PrcDetail> => {
    setSaving(true);
    setError("");
    setStatus("Enregistrement…");
    try {
      if (conflict)
        throw new Error(
          "Chargez la version récente avant d’enregistrer. Vos modifications locales sont conservées.",
        );
      const result = await api<PrcDetail>(
        isNew ? "/api/prcs" : `/api/prcs/${prcId}`,
        isNew ? "POST" : "PUT",
        {
          ...form,
          ...(!isNew ? { version: baseVersion.current } : {}),
          observations: normalizeOrder(form.observations),
        },
      );
      const document = await api<PrcDetail>(`/api/prcs/${result.id}`);
      setForm(fromDocument(document));
      setDirty(false);
      setHistory([]);
      setStatus("Enregistré en base");
      baseVersion.current = document.version;
      loaded.current = result.id;
      cache.setQueryData(["editor", result.id], document);
      cache.invalidateQueries({ queryKey: ["library"] });
      cache.invalidateQueries({ queryKey: getListPrcsQueryKey() });
      cache.invalidateQueries({ queryKey: getGetWorkspaceSummaryQueryKey() });
      if (isNew) navigate(`/prc/${result.id}`);
      return document;
    } catch (cause) {
      if ((cause as { status?: number }).status === 409) {
        setConflict(true);
        void query.refetch();
      }
      setStatus("Enregistrement impossible");
      setError(getError(cause));
      throw cause;
    } finally {
      setSaving(false);
    }
  };
  const submitSave = (event: FormEvent) => {
    event.preventDefault();
    save().catch(() => {});
  };
  const launch = async (role: "panel" | "students" | "trial") => {
    if (!canManageSessions || conflict) return;
    if (missing.length) {
      setError(
        "Complétez les éléments indiqués avant de lancer le questionnaire. Un brouillon incomplet peut être enregistré.",
      );
      focus(missing[0].id);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const document = isNew || dirty ? await save() : query.data!;
      if (role === "trial") {
        const result = await api<{
          invitationUrl: string;
          code: string;
          launch: { id: string };
        }>(`/api/prcs/${document.id}/trial`, "POST", {});
        setTrial(result);
        cache.invalidateQueries({ queryKey: ["editor", document.id] });
      } else {
        const result = await api<{ id: string }>(
          `/api/prcs/${document.id}/launches`,
          "POST",
          { role, ...(role === "students" ? { deliveryMode } : {}) },
        );
        navigate(`/activity/${result.id}`);
      }
    } catch (cause) {
      setError(getError(cause));
    } finally {
      setBusy(false);
    }
  };
  const step = missing.length
    ? "prepare"
    : dirty
      ? "panel"
      : query.data?.workflow?.step || "panel";
  const next = () => {
    if (step === "prepare") {
      focus(missing[0]?.id || "prc-name");
      return;
    }
    if (!dirty && query.data?.workflow?.panelLaunchId && step !== "students") {
      navigate(`/activity/${query.data.workflow.panelLaunchId}`);
      return;
    }
    launch(step === "students" ? "students" : "panel");
  };
  if (!isNew && query.isLoading)
    return (
      <AuthenticatedPage actions={actions}>
        <Loading label="Chargement du PRC…" />
      </AuthenticatedPage>
    );
  if (!isNew && query.isError)
    return (
      <AuthenticatedPage actions={actions}>
        <ErrorBox
          message={getError(query.error)}
          retry={() => query.refetch()}
        />
      </AuthenticatedPage>
    );
  return (
    <AuthenticatedPage actions={actions}>
      <div className="back-heading">
        <Link href="/prcs" className="back-link">
          <ArrowLeft size={15} /> Mes PRC
        </Link>
        <div className="editor-actions">
          {!isNew && (
            <Btn
              kind="outline"
              onClick={() => setSharingOpen((value) => !value)}
            >
              {sharingOpen
                ? "Fermer le partage"
                : query.data?.permissions?.share === false
                  ? "Collaborateurs"
                  : "Partager"}
            </Btn>
          )}
          <Btn kind="outline" onClick={() => setPreview((value) => !value)}>
            <Eye size={15} />{" "}
            {preview ? "Fermer l’aperçu" : "Prévisualiser le questionnaire"}
          </Btn>
          <Btn
            kind="outline"
            disabled={saving || busy || conflict || (!dirty && !isNew)}
            onClick={() => save().catch(() => {})}
          >
            <Save size={15} /> Enregistrer
          </Btn>
        </div>
      </div>
      <SectionTitle
        eyebrow={
          query.data?.isDemo
            ? "DÉMONSTRATION — DONNÉES FICTIVES"
            : isNew
              ? "NOUVEAU PRC"
              : "PRÉPARER LE PRC"
        }
        title={form.name || "PRC sans nom"}
        aside={
          !isNew ? (
            <span className="editor-version">
              Version {query.data?.version}
              {query.data?.archived ? " · Archivé" : ""}
            </span>
          ) : undefined
        }
      />
      <div className="editor-progress">
        <span className="save-status" role="status">
          {saving
            ? "Enregistrement…"
            : status ||
              (isNew
                ? "Brouillon non enregistré"
                : dirty
                  ? "Modifications non enregistrées"
                  : "Toutes les modifications sont enregistrées")}
        </span>
        <Btn
          kind="quiet"
          disabled={!history.length || saving || busy}
          onClick={undo}
        >
          <Undo2 size={15} /> Annuler{" "}
          {history.at(-1)?.label || "la dernière action"}
        </Btn>
      </div>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {(conflict || newerVersion) && (
        <section className="editor-conflict" role="alert">
          <b>Une version plus récente de ce PRC est disponible.</b>
          <p>
            Vos modifications locales sont conservées. Chargez la version
            récente avant d’enregistrer pour préserver le travail de l’autre
            professeur.
          </p>
          <Btn
            kind="outline"
            disabled={saving || busy}
            onClick={() => void loadLatest()}
          >
            Charger la version récente
          </Btn>
        </section>
      )}
      {sharingOpen && !isNew && <Sharing prcId={prcId} />}

      {query.data?.isDemo && canManageSessions && (
        <DemoStudentSessions
          document={query.data}
          blocked={dirty || saving || busy || conflict || newerVersion}
        />
      )}

      {trial && (
        <section className="trial-banner" role="status">
          <FlaskConical size={24} />
          <div>
            <b>Votre lancement d’essai est prêt</b>
            <p>
              Il utilise le vrai questionnaire, mais ses copies sont exclues des
              panels et corrigés réels. Code : <strong>{trial.code}</strong>.
            </p>
            <a
              className="trial-link"
              href={trial.invitationUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ouvrir le questionnaire d’essai <ArrowRight size={15} />
            </a>
            <Link
              className="library-text-link"
              href={`/activity/${trial.launch.id}`}
            >
              Voir le suivi de l’essai
            </Link>
          </div>
        </section>
      )}
      {preview && (
        <CasePreview
          title="Prévisualisation du questionnaire"
          data={{
            ...form,
            diagnostics: form.diagnostics.map((label, index) => ({
              id: `preview-diagnostic-${index}`,
              label,
            })),
            demonstrationLabel: query.data?.isDemo
              ? "Démonstration — données fictives"
              : undefined,
          }}
        />
      )}
      <form id="prc-form" onSubmit={submitSave} className="editor-layout">
        <fieldset
          className="editor-main editor-fieldset"
          disabled={saving || busy}
        >
          <section className="panel-card editor-card">
            <div className="editor-section-head">
              <span className="step-number">01</span>
              <div>
                <h2>Le cas clinique</h2>
                <p>
                  Un seul nom accompagnera le panel, le corrigé et chaque groupe
                  étudiant.
                </p>
              </div>
            </div>
            <Input
              id="prc-name"
              label="Nom du PRC"
              maxLength={160}
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="Ex. Toux"
            />
            <Area
              id="prc-scenario"
              label="Scénario clinique"
              maxLength={20000}
              rows={8}
              value={form.scenario}
              onChange={(event) => update("scenario", event.target.value)}
              placeholder="Présentez la situation, les antécédents et le contexte de consultation…"
            />
            <details className="editor-advanced">
              <summary>Consignes aux participants</summary>
              <Area
                label="Consignes"
                maxLength={5000}
                rows={4}
                value={form.instructions}
                onChange={(event) => update("instructions", event.target.value)}
              />
            </details>
          </section>
          <section
            className="panel-card editor-card"
            id="prc-diagnostics"
            tabIndex={-1}
          >
            <div className="editor-section-head">
              <span className="step-number">02</span>
              <div>
                <h2>Diagnostics proposés</h2>
                <p>
                  Au moins deux possibilités distinctes. Aucune bonne réponse ni
                  point n’est défini avant le panel.
                </p>
              </div>
            </div>
            <div className="editable-list">
              {form.diagnostics.map((diagnostic, index) => (
                <div className="editable-row" key={index}>
                  <span className="list-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <input
                    value={diagnostic}
                    maxLength={240}
                    onChange={(event) =>
                      update(
                        "diagnostics",
                        form.diagnostics.map((value, position) =>
                          position === index ? event.target.value : value,
                        ),
                      )
                    }
                    aria-label={`Diagnostic ${index + 1}`}
                    data-testid={`input-diagnostic-${index}`}
                  />
                  <button
                    type="button"
                    aria-label={`Supprimer le diagnostic ${index + 1}`}
                    onClick={() => {
                      remember({
                        label: "la suppression du diagnostic",
                        diagnostics: [...form.diagnostics],
                      });
                      update(
                        "diagnostics",
                        form.diagnostics.filter(
                          (_, position) => position !== index,
                        ),
                      );
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="add-row"
              onClick={() => update("diagnostics", [...form.diagnostics, ""])}
            >
              <Plus size={15} /> Ajouter un diagnostic
            </button>
          </section>
        </fieldset>
        <fieldset
          className="editor-fieldset clinical-builder"
          disabled={saving || busy}
        >
          <section
            className="panel-card editor-card clinical-table-editor"
            id="prc-observations"
            tabIndex={-1}
          >
            <div className="editor-section-head">
              <span className="step-number">03</span>
              <div>
                <h2>Données cliniques · tableau du questionnaire</h2>
                <p>
                  Ajoutez une ligne, choisissez son type et saisissez la donnée
                  clinique. Vous construisez directement la grille que verront
                  les participants.
                </p>
              </div>
            </div>
            <div className="clinical-table-toolbar">
              <Btn kind="outline" onClick={addObservation}>
                <Plus size={15} /> Ajouter une ligne
              </Btn>
              <span>
                {form.observations.length} ligne(s) ·{" "}
                {
                  form.observations.filter((observation) =>
                    observation.text.trim(),
                  ).length
                }{" "}
                donnée(s) renseignée(s)
              </span>
            </div>
            <p className="field-hint">
              Les colonnes + et − montrent le questionnaire final. Les
              participants y indiqueront leurs propres choix.
            </p>
            <ObservationMatrix
              observations={form.observations}
              mainChoices={[]}
              alternativeChoices={[]}
              setMainChoices={() => {}}
              setAlternativeChoices={() => {}}
              selectSign={() => {}}
              disabled={saving || busy}
              hasAlternative
              renderObservation={(observation, index) => (
                <div className="clinical-row-fields">
                  <div className="clinical-row-heading">
                    <b>Donnée {String(index + 1).padStart(2, "0")}</b>
                    <div className="obs-order">
                      <button
                        type="button"
                        disabled={index === 0}
                        aria-label={`Monter l’observation ${index + 1}`}
                        onClick={() => move(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={index === form.observations.length - 1}
                        aria-label={`Descendre l’observation ${index + 1}`}
                        onClick={() => move(index, 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        aria-label={`Supprimer l’observation ${index + 1}`}
                        onClick={() => {
                          remember({
                            label: "la suppression de l’observation",
                            observations: structuredClone(form.observations),
                          });
                          update(
                            "observations",
                            normalizeOrder(
                              form.observations.filter(
                                (value) => value.id !== observation.id,
                              ),
                            ),
                          );
                        }}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                  <label className="clinical-category">
                    <span>Type de donnée clinique</span>
                    <select
                      aria-label={`Catégorie de l’observation ${index + 1}`}
                      value={observation.category || "Autre"}
                      onChange={(event) =>
                        update(
                          "observations",
                          form.observations.map((value) =>
                            value.id === observation.id
                              ? { ...value, category: event.target.value }
                              : value,
                          ),
                        )
                      }
                    >
                      {observation.category &&
                        !clinicalDataCategories.some(
                          (category) => category === observation.category,
                        ) && (
                          <option value={observation.category}>
                            {observation.category} (catégorie existante)
                          </option>
                        )}
                      {clinicalDataCategories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="clinical-row-text">
                    <label
                      htmlFor={`editor-observation-${observation.id}`}
                      className="sr-only"
                    >
                      Texte de l’observation {index + 1}
                    </label>
                    <textarea
                      id={`editor-observation-${observation.id}`}
                      rows={3}
                      value={observation.text}
                      placeholder="Ex. Température à 38,5 °C, mesurée à la consultation"
                      onChange={(event) =>
                        update(
                          "observations",
                          form.observations.map((value) =>
                            value.id === observation.id
                              ? { ...value, text: event.target.value }
                              : value,
                          ),
                        )
                      }
                    />
                  </div>
                </div>
              )}
            />
            {form.observations.length > 0 && (
              <button
                type="button"
                className="add-row"
                onClick={addObservation}
              >
                <Plus size={15} /> Ajouter la ligne suivante
              </button>
            )}
            <details className="editor-advanced clinical-bulk-import">
              <summary>Importer plusieurs données (facultatif)</summary>
              <Area
                label="Coller les observations, une par ligne"
                value={bulk}
                onChange={(event) => setBulk(event.target.value)}
                rows={5}
                placeholder={
                  "Toux sèche depuis trois semaines | Description de la plainte\nAbsence de fièvre | Examen physique"
                }
              />
              <small className="field-hint">
                Type facultatif après le caractère |. Le type par défaut est «
                Autre ».
              </small>
              <div className="editor-actions">
                <Btn
                  kind="outline"
                  onClick={importObservations}
                  disabled={!bulk.trim()}
                >
                  Importer les lignes
                </Btn>
                <Btn
                  kind="quiet"
                  onClick={() =>
                    update("observations", [
                      ...form.observations,
                      ...Array.from({ length: 20 }, (_, index) => ({
                        id: crypto.randomUUID(),
                        text: "",
                        category: "Autre",
                        position: form.observations.length + index,
                      })),
                    ])
                  }
                >
                  Créer 20 lignes vides
                </Btn>
              </div>
            </details>
          </section>
          <div className="editor-actions">
            <Btn
              type="submit"
              disabled={saving || busy || conflict || (!dirty && !isNew)}
            >
              <Save size={15} /> Enregistrer le brouillon
            </Btn>
            <small>
              L’annulation agit sur le brouillon local ; les anciennes copies
              restent figées.
            </small>
          </div>
        </fieldset>
        <aside className="editor-rail">
          <div className="rail-card">
            <div className="eyebrow">PROCHAINE ÉTAPE</div>
            <h3>
              {query.data?.archived ? "PRC archivé" : workflowLabel(step)}
            </h3>
            {!canManageSessions ? (
              <p>
                Vous pouvez modifier le contenu de ce PRC. Le propriétaire gère
                les panels et les groupes, ou peut vous en donner l’accès.
              </p>
            ) : query.data?.archived ? (
              <p>
                Restaurez ce PRC depuis les archives de la bibliothèque pour
                lancer une nouvelle activité.
              </p>
            ) : (
              <>
                {missing.length ? (
                  <ul className="editor-missing">
                    {missing.map((item) => (
                      <li key={item.id}>
                        <button type="button" onClick={() => focus(item.id)}>
                          {item.text} <ArrowRight size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    {dirty
                      ? "Les modifications seront enregistrées avant le lancement. Une modification clinique crée une nouvelle version."
                      : step === "students"
                        ? "Le corrigé de cette version est validé. Chaque nouveau groupe sera indépendant."
                        : step === "reference"
                          ? "Consultez les distributions du panel puis validez votre référence."
                          : "Le questionnaire est prêt pour le panel."}
                  </p>
                )}
                {step === "students" && (
                  <>
                    {query.data?.workflow?.panelLaunchId && (
                      <Link
                        className="library-text-link"
                        href={`/activity/${query.data.workflow.panelLaunchId}`}
                      >
                        Consulter ou personnaliser le barème du corrigé
                      </Link>
                    )}
                    <label className="student-delivery">
                      <span>Modalité du groupe étudiant</span>
                      <select
                        aria-label="Modalité du groupe étudiant"
                        value={deliveryMode}
                        disabled={saving || busy}
                        onChange={(event) =>
                          setDeliveryMode(
                            event.target.value as
                              "synchronous" | "asynchronous",
                          )
                        }
                      >
                        <option value="synchronous">
                          Synchrone · correction guidée en séance
                        </option>
                        <option value="asynchronous">
                          Asynchrone · autoriser le corrigé dès la soumission
                        </option>
                      </select>
                      <small>
                        Le professeur choisit la modalité. Les étudiants ne
                        peuvent pas la modifier.{" "}
                        {deliveryMode === "synchronous"
                          ? "Vous terminez le temps de réponse, puis révélez la comparaison et les impressions cliniques une à une."
                          : "Chaque étudiant voit uniquement ses réponses face au corrigé expert et sa note, dès sa soumission."}
                      </small>
                    </label>
                  </>
                )}
                <Btn disabled={saving || busy || conflict} onClick={next}>
                  {dirty && step !== "prepare"
                    ? "Enregistrer puis continuer"
                    : workflowLabel(step)}{" "}
                  <ArrowRight size={15} />
                </Btn>
                <Btn
                  kind="outline"
                  disabled={saving || busy || conflict || missing.length > 0}
                  onClick={() => launch("trial")}
                >
                  <FlaskConical size={16} /> Tester comme participant
                </Btn>
              </>
            )}
          </div>
          <div className="rail-card muted-rail">
            <BookOpen size={18} />
            <b>Versions et corrigés conservés</b>
            <span>
              Modifier le cas ne modifie jamais le questionnaire d’un lancement
              existant. Un nouveau contenu clinique nécessite un nouveau panel.
            </span>
          </div>
        </aside>
      </form>
      {!isNew && (
        <section className="panel-card editor-history" id="history">
          <div className="eyebrow">HISTORIQUE CONSERVÉ</div>
          <h2>Lancements de ce PRC</h2>
          {query.data?.launches?.length ? (
            <div className="history-list">
              {query.data.launches.map((launch) => (
                <Link href={`/activity/${launch.id}`} key={launch.id}>
                  <span>
                    <b>{launch.name || form.name}</b>
                    <small>
                      {launch.isTrial
                        ? "Essai isolé"
                        : launch.role === "panel"
                          ? "Panel"
                          : "Groupe étudiant"}{" "}
                      · {dateLabel(launch.createdAt)} · Version{" "}
                      {launch.caseVersion || "—"}
                    </small>
                  </span>
                  <span>
                    {launch.submissionCount}/{launch.participantCount} copies ·{" "}
                    {launch.status}
                  </span>
                  <ArrowRight size={16} />
                </Link>
              ))}
            </div>
          ) : (
            <p>
              Aucun lancement. Les futures activités et leurs résultats
              resteront accessibles ici.
            </p>
          )}
        </section>
      )}
    </AuthenticatedPage>
  );
}

export function CheckLine({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className={ok ? "checkline done" : "checkline"}>
      <span>{ok ? <Check size={12} /> : "·"}</span>
      {text}
    </div>
  );
}
