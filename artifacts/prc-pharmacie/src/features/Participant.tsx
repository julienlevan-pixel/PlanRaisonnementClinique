import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Save,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { Link, useLocation, useParams } from "wouter";
import type { Choice } from "@workspace/api-client-react";
import type { AppActions } from "../app/actions";
import { Btn, Input, Loading, ErrorBox } from "../app/ui";
import { getError } from "../app/utils";
import { api } from "../app/api";
import "./participant.css";

type Role = "main" | "alternative";
type CaseData = {
  launchId: string;
  name: string;
  scenario: string;
  instructions?: string;
  role: "panel" | "students";
  status: string;
  isTrial?: boolean;
  diagnostics: { id: string; label: string }[];
  observations: { id: string; text: string; category: string }[];
};
type Draft = {
  mainDiagnosticId: string | null;
  alternativeDiagnosticId: string | null;
  mainChoices: Choice[];
  alternativeChoices: Choice[];
};
type SavedResponse = Draft & {
  state: "draft" | "submitted";
  revision: number;
  updatedAt?: string | null;
};
type ResponseEnvelope = { response: SavedResponse; joinInfo: CaseData };
type ActivityState = {
  status: string;
  role: "panel" | "students";
  reveals: Record<string, boolean>;
  published: boolean;
  responseState: string;
  revision: number;
  updatedAt?: string;
};
type CountRow = {
  observationId: string;
  label?: string;
  positive: number;
  negative: number;
  notSelected: number;
};
type Distribution = {
  diagnosticId: string;
  role: Role;
  expertCount: number;
  observations: CountRow[];
  ceiling: number;
};
type Aggregate = {
  totalSubmissions?: number;
  diagnostics?: Record<string, any>[];
  distributions?: Distribution[];
  referenceVisible?: boolean;
  reference?: { explanation?: string; scoring?: Record<string, any> } | null;
};
type ParticipantResult = {
  published: boolean;
  case: CaseData;
  response: SavedResponse;
  score: number | null;
  percentage?: number | null;
  components: Record<string, any>;
  panel: Aggregate;
  class?: Aggregate;
  role?: "panel" | "students";
  status?: string;
  reveals?: Record<string, boolean>;
};
const emptyDraft: Draft = {
  mainDiagnosticId: null,
  alternativeDiagnosticId: null,
  mainChoices: [],
  alternativeChoices: [],
};

function useAvailability() {
  const [online, setOnline] = useState(navigator.onLine);
  const [visible, setVisible] = useState(
    document.visibilityState === "visible",
  );
  useEffect(() => {
    const network = () => setOnline(navigator.onLine);
    const visibility = () => setVisible(document.visibilityState === "visible");
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return { online, visible };
}
function ParticipantTop({ label }: { label: string }) {
  return (
    <div className="participant-top">
      <Link href="/" className="brand">
        <span className="brand-mark">
          <Stethoscope size={20} />
        </span>
        <span>
          <b>PRC</b>
          <small>PHARMACIE</small>
        </span>
      </Link>
      <span className="secure-label">
        <ShieldCheck size={14} /> {label}
      </span>
    </div>
  );
}
function TrialNotice({ trial }: { trial?: boolean }) {
  return trial ? (
    <p className="participant-notice">
      Lancement d’essai isolé : ces réponses ne contribuent pas à un corrigé
      réel.
    </p>
  ) : null;
}

export function Join({ actions }: { actions: AppActions }) {
  const { code = "" } = useParams<{ code: string }>();
  const info = useQuery({
    queryKey: ["/api/join", code],
    queryFn: () => api<CaseData>(`/api/join/${encodeURIComponent(code)}`),
    enabled: !!code,
    retry: false,
  });
  const [, setLocation] = useLocation();
  const [pseudonym, setPseudonym] = useState("");
  const [error, setError] = useState("");
  const joinKeys = useRef<Record<string, string>>({});
  const invitationToken =
    new URLSearchParams(window.location.search).get("invite") || undefined;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!joinKeys.current[code]) {
      const storageKey = `prc-join-${code.toUpperCase()}`;
      try {
        joinKeys.current[code] =
          sessionStorage.getItem(storageKey) || crypto.randomUUID();
        sessionStorage.setItem(storageKey, joinKeys.current[code]);
      } catch {
        joinKeys.current[code] = crypto.randomUUID();
      }
    }
    const data = {
      pseudonym,
      invitationToken,
      joinKey: joinKeys.current[code],
    };
    actions.join.mutate(
      { launchId: info.data!.launchId, data },
      {
        onSuccess: () => setLocation("/participant"),
        onError: (error) => setError(getError(error)),
      },
    );
  };
  if (info.isPending)
    return (
      <div className="participant-layout">
        <Loading label="Vérification du code d’accès…" />
      </div>
    );
  if (info.isError || !info.data)
    return (
      <div className="participant-layout">
        <ErrorBox
          message="Ce code d’activité est invalide ou inaccessible. Vérifiez le code communiqué par votre enseignant."
          retry={() => info.refetch()}
        />
        <Link href="/" className="back-link">
          <ArrowLeft size={15} /> Accueil
        </Link>
      </div>
    );
  const closed = info.data.status !== "open";
  const missingInvitation = info.data.role === "panel" && !invitationToken;
  let savedJoinKey = joinKeys.current[code];
  try {
    savedJoinKey ||=
      sessionStorage.getItem(`prc-join-${code.toUpperCase()}`) ?? "";
  } catch {}
  const canResume =
    !!savedJoinKey || (info.data.role === "panel" && !!invitationToken);
  return (
    <div className="participant-layout">
      <ParticipantTop label="Activité privée" />
      <div className="join-card">
        <div className="eyebrow">
          {info.data.role === "panel"
            ? "PANEL D’EXPERTS"
            : "ACTIVITÉ ÉTUDIANTE"}
        </div>
        <h1>{info.data.name}</h1>
        <TrialNotice trial={info.data.isTrial} />
        {closed && !canResume ? (
          <p className="participant-notice" role="status">
            La collecte est fermée. Une participation existante reste accessible
            dans le navigateur utilisé pour répondre.
          </p>
        ) : missingInvitation ? (
          <p className="form-error" role="alert">
            Une invitation individuelle du professeur est nécessaire pour
            contribuer au panel. Le code de groupe seul ne suffit pas.
          </p>
        ) : (
          <>
            {closed && (
              <p className="participant-notice">
                La collecte est fermée. Votre accès de reprise permettra de
                retrouver une copie existante, sans créer de nouvelle
                participation.
              </p>
            )}
            <p className="body-copy">
              Indiquez le pseudonyme associé à votre réponse. Pour reprendre
              ensuite votre copie, utilisez ce même navigateur ; le pseudonyme
              seul ne donne pas accès à une copie.
            </p>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <form onSubmit={submit}>
              <Input
                label="Votre nom ou pseudonyme"
                maxLength={100}
                autoComplete="nickname"
                value={pseudonym}
                onChange={(event) => setPseudonym(event.target.value)}
                required
              />
              <Btn
                type="submit"
                className="full"
                disabled={actions.join.isPending}
              >
                {actions.join.isPending
                  ? "Ouverture…"
                  : closed
                    ? "Reprendre ma copie"
                    : "Rejoindre l’activité"}{" "}
                <ArrowRight size={16} />
              </Btn>
            </form>
          </>
        )}
        <Link href="/participant" className="back-link">
          Reprendre ma participation dans ce navigateur
        </Link>
      </div>
    </div>
  );
}

export function Participant({ actions: _actions }: { actions: AppActions }) {
  const { online, visible } = useAvailability();
  const responseQuery = useQuery({
    queryKey: ["/api/participant/response"],
    queryFn: () => api<ResponseEnvelope>("/api/participant/response"),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
  const stateQuery = useQuery({
    queryKey: ["/api/participant/state"],
    queryFn: () => api<ActivityState>("/api/participant/state"),
    enabled: !!responseQuery.data && online && visible,
    refetchInterval: (query) => {
      const state = query.state.data;
      return online &&
        visible &&
        !state?.published &&
        !(
          state?.role === "panel" &&
          state.status !== "open" &&
          state.reveals?.reference
        )
        ? 15000
        : false;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [validation, setValidation] = useState<
    { message: string; target: string }[]
  >([]);
  const [, setLocation] = useLocation();
  const latest = useRef(draft);
  latest.current = draft;
  const localVersion = useRef(0),
    acknowledgedVersion = useRef(0),
    revision = useRef(0);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const context = useRef({ online, submitted, status: "open", conflict });
  const joinInfo = responseQuery.data?.joinInfo;
  const status = stateQuery.data?.status ?? joinInfo?.status ?? "open";
  context.current = { online, submitted, status, conflict };
  const applyServerCopy = useCallback((response: SavedResponse) => {
    const copy = {
      mainDiagnosticId: response.mainDiagnosticId,
      alternativeDiagnosticId: response.alternativeDiagnosticId,
      mainChoices: response.mainChoices || [],
      alternativeChoices: response.alternativeChoices || [],
    };
    latest.current = copy;
    setDraft(copy);
    revision.current = response.revision ?? 0;
    localVersion.current = 0;
    acknowledgedVersion.current = 0;
    setDirty(false);
    setSubmitted(response.state === "submitted");
    setSavedAt(response.updatedAt ?? null);
    setConflict(false);
    setSaveError("");
    setValidation([]);
  }, []);
  useEffect(() => {
    if (responseQuery.data && !loaded) {
      applyServerCopy(responseQuery.data.response);
      setLoaded(true);
    }
  }, [responseQuery.data, loaded, applyServerCopy]);
  useEffect(() => {
    if (stateQuery.data?.responseState === "submitted") setSubmitted(true);
  }, [stateQuery.data?.responseState]);
  useEffect(() => {
    if (
      !loaded ||
      !stateQuery.data ||
      stateQuery.data.revision <= revision.current ||
      inFlight.current
    )
      return;
    if (dirty) setConflict(true);
    else {
      const observedVersion = localVersion.current;
      api<ResponseEnvelope>("/api/participant/response")
        .then((data) => {
          if (data.response.revision < revision.current) return;
          if (
            localVersion.current === observedVersion &&
            localVersion.current === acknowledgedVersion.current &&
            !inFlight.current
          )
            applyServerCopy(data.response);
          else if (data.response.revision > revision.current) setConflict(true);
        })
        .catch(() => {});
    }
  }, [stateQuery.data?.revision, loaded, dirty, applyServerCopy]);
  const saveDraft = useCallback(async function persist(): Promise<boolean> {
    if (inFlight.current) {
      const success = await inFlight.current;
      return success && localVersion.current > acknowledgedVersion.current
        ? persist()
        : success;
    }
    if (localVersion.current <= acknowledgedVersion.current) return true;
    if (
      !context.current.online ||
      context.current.submitted ||
      context.current.status !== "open" ||
      context.current.conflict
    )
      return false;
    const version = localVersion.current,
      snapshot = latest.current;
    const request = (async () => {
      setSaving(true);
      setSaveError("");
      try {
        const data = await api<ResponseEnvelope>(
          "/api/participant/response",
          "PUT",
          { ...snapshot, revision: revision.current },
        );
        revision.current = data.response.revision;
        acknowledgedVersion.current = version;
        if (localVersion.current === version) {
          const canonical = {
            mainDiagnosticId: data.response.mainDiagnosticId,
            alternativeDiagnosticId: data.response.alternativeDiagnosticId,
            mainChoices: data.response.mainChoices,
            alternativeChoices: data.response.alternativeChoices,
          };
          latest.current = canonical;
          setDraft(canonical);
        }
        setSavedAt(data.response.updatedAt ?? new Date().toISOString());
        setDirty(localVersion.current !== version);
        return true;
      } catch (error) {
        if (
          (error as any).status === 409 &&
          /chang|revision|récente/i.test(getError(error))
        )
          setConflict(true);
        setSaveError(
          error instanceof TypeError
            ? "Connexion interrompue : aucun enregistrement n’a été confirmé. Vos choix restent dans cette page ; réessayez après reconnexion."
            : getError(error),
        );
        stateQuery.refetch();
        return false;
      } finally {
        setSaving(false);
      }
    })();
    inFlight.current = request;
    const success = await request;
    inFlight.current = null;
    return success;
  }, []);
  useEffect(() => {
    if (
      !loaded ||
      !dirty ||
      !online ||
      conflict ||
      submitted ||
      submitting ||
      status !== "open"
    )
      return;
    const timer = window.setTimeout(() => {
      void saveDraft();
    }, 650);
    return () => window.clearTimeout(timer);
  }, [
    draft,
    dirty,
    online,
    conflict,
    loaded,
    submitted,
    submitting,
    status,
    saveDraft,
  ]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (
        localVersion.current > acknowledgedVersion.current &&
        !context.current.submitted
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const edit = (change: Partial<Draft>) => {
    if (submitted || status !== "open" || submitting) return;
    localVersion.current++;
    const next = { ...latest.current, ...change };
    latest.current = next;
    setDraft(next);
    setDirty(true);
    setValidation([]);
  };
  const changeDiagnosis = (role: Role, value: string | null) => {
    edit(
      role === "main"
        ? { mainDiagnosticId: value, mainChoices: [] }
        : { alternativeDiagnosticId: value, alternativeChoices: [] },
    );
    setNotice(
      "Le diagnostic a changé : revoyez et sélectionnez à nouveau les signes de cette hypothèse.",
    );
  };
  const selectSign = (
    id: string,
    sign: "+" | "-",
    choices: Choice[],
    _set: (v: Choice[]) => void,
    role: Role,
  ) => {
    const found = choices.find((choice) => choice.observationId === id);
    let next: Choice[];
    if (found?.sign === sign)
      next = choices.filter((choice) => choice.observationId !== id);
    else if (found)
      next = choices.map((choice) =>
        choice.observationId === id ? { observationId: id, sign } : choice,
      );
    else if (choices.length >= 5) {
      setNotice(
        "Cinq observations au maximum par hypothèse. Retirez un choix avant d’en ajouter un autre.",
      );
      return;
    } else next = [...choices, { observationId: id, sign }];
    edit(
      role === "main" ? { mainChoices: next } : { alternativeChoices: next },
    );
  };
  const transmit = async () => {
    if (!joinInfo || submitted || status !== "open") return;
    const missing: { message: string; target: string }[] = [];
    if (!draft.mainDiagnosticId)
      missing.push({
        message: "Choisissez votre diagnostic principal.",
        target: "participant-main-diagnosis",
      });
    if (!draft.alternativeDiagnosticId)
      missing.push({
        message: "Choisissez votre diagnostic alternatif.",
        target: "participant-alternative-diagnosis",
      });
    if (
      draft.mainDiagnosticId &&
      draft.mainDiagnosticId === draft.alternativeDiagnosticId
    )
      missing.push({
        message: "Choisissez deux diagnostics différents.",
        target: "participant-alternative-diagnosis",
      });
    for (const [role, choices, name] of [
      ["main", draft.mainChoices, "principale"],
      ["alternative", draft.alternativeChoices, "alternative"],
    ] as const) {
      if (
        choices.length < 1 ||
        (joinInfo.role === "panel" && choices.length !== 5)
      )
        missing.push({
          message:
            joinInfo.role === "panel"
              ? `Sélectionnez exactement cinq observations signées pour l’hypothèse ${name}.`
              : `Sélectionnez au moins une observation signée pour l’hypothèse ${name}.`,
          target: `participant-${role}-counter`,
        });
    }
    setValidation(missing);
    if (missing.length) {
      document.getElementById(missing[0].target)?.focus();
      return;
    }
    if (!online || conflict) {
      setSaveError(
        conflict
          ? "Chargez la copie enregistrée avant de soumettre."
          : "La connexion est interrompue. Vos choix sont conservés dans cette page ; reconnectez-vous pour les transmettre.",
      );
      return;
    }
    if (
      !window.confirm(
        "Confirmer la soumission définitive ? Votre copie sera verrouillée.",
      )
    )
      return;
    setSubmitting(true);
    try {
      if (!(await saveDraft())) return;
      const result = await api<SavedResponse>(
        "/api/participant/submit",
        "POST",
        { expectedRevision: revision.current },
      );
      setSubmitted(result.state === "submitted");
      setDirty(false);
      setLocation("/participant/results");
    } catch (error) {
      if (
        (error as any).status === 409 &&
        /chang|revision|récente/i.test(getError(error))
      )
        setConflict(true);
      setSaveError(getError(error));
      stateQuery.refetch();
    } finally {
      setSubmitting(false);
    }
  };
  const reloadCopy = async () => {
    if (
      dirty &&
      !window.confirm(
        "Charger la copie enregistrée sur le serveur ? Les modifications locales non enregistrées seront remplacées.",
      )
    )
      return;
    const observedVersion = localVersion.current;
    try {
      const data = await api<ResponseEnvelope>("/api/participant/response");
      if (
        localVersion.current !== observedVersion ||
        inFlight.current ||
        data.response.revision < revision.current
      ) {
        setConflict(true);
        setSaveError(
          "De nouveaux choix ont été saisis pendant le chargement. Ils ont été conservés ; relancez le chargement si vous souhaitez les remplacer.",
        );
        return;
      }
      applyServerCopy(data.response);
    } catch (error) {
      setSaveError(getError(error));
    }
  };
  if (responseQuery.isPending)
    return (
      <div className="participant-layout">
        <Loading label="Ouverture de votre copie…" />
      </div>
    );
  if (responseQuery.isError || !joinInfo)
    return (
      <div className="participant-layout">
        <ErrorBox
          message="Aucune copie participante n’est accessible dans ce navigateur. Rejoignez votre activité avec son code ou son invitation."
          retry={() => responseQuery.refetch()}
        />
        <Link href="/" className="back-link">
          Retour à l’accueil
        </Link>
      </div>
    );
  const locked = submitted || status !== "open" || submitting;
  const saveLabel = !online
    ? "Hors connexion — les nouveaux choix ne sont pas encore enregistrés"
    : saving
      ? "Enregistrement en cours…"
      : dirty
        ? "Modifications non encore enregistrées"
        : savedAt
          ? `Enregistré par le serveur à ${new Date(savedAt).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
          : "Copie ouverte — aucune modification en attente";
  return (
    <div className="participant-layout">
      <ParticipantTop label="Votre copie privée" />
      <main className="participant-content">
        <h1>{joinInfo.name}</h1>
        <TrialNotice trial={joinInfo.isTrial} />
        <section className="scenario-card">
          <div className="eyebrow">SITUATION CLINIQUE</div>
          <p>{joinInfo.scenario}</p>
          {joinInfo.instructions && (
            <div className="instructions">
              <b>Consignes</b>
              <p>{joinInfo.instructions}</p>
            </div>
          )}
        </section>
        <div
          className="participant-save-state"
          role="status"
          aria-live="polite"
        >
          <span className={`network-dot ${online ? "online" : "offline"}`} />
          {saveLabel}
        </div>
        {submitted ? (
          <p className="participant-notice">
            Votre réponse a été transmise et verrouillée.{" "}
            <Link href="/participant/results">Consulter la restitution</Link>
          </p>
        ) : status !== "open" ? (
          <p className="participant-notice">
            La collecte est fermée. Votre brouillon reste « Non soumis » et ne
            reçoit pas de zéro.{" "}
            <Link href="/participant/results">
              Voir la restitution disponible
            </Link>
          </p>
        ) : null}
        {notice && (
          <p className="participant-notice" role="status">
            {notice}
          </p>
        )}
        {conflict && (
          <div className="participant-conflict" role="alert">
            <b>Une autre version de cette copie est enregistrée.</b>
            <p>
              Vos choix visibles sont conservés. Aucun écrasement automatique
              n’a été effectué.
            </p>
            <Btn kind="outline" onClick={reloadCopy}>
              Charger la copie enregistrée
            </Btn>
          </div>
        )}
        {saveError && (
          <div className="form-error" role="alert">
            {saveError}
            {!conflict && (
              <button
                type="button"
                className="retry-save"
                onClick={() => void saveDraft()}
              >
                Réessayer l’enregistrement
              </button>
            )}
          </div>
        )}
        {validation.length > 0 && (
          <div className="participant-validation" role="alert">
            <b>Votre copie n’est pas encore complète :</b>
            <ul>
              {validation.map((item) => (
                <li key={item.target}>
                  <button
                    type="button"
                    onClick={() =>
                      document.getElementById(item.target)?.focus()
                    }
                  >
                    {item.message}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="body-copy">
          {joinInfo.role === "panel"
            ? "Choisissez exactement cinq données par hypothèse."
            : "Choisissez de une à cinq données par hypothèse."}{" "}
          Une même donnée peut soutenir une hypothèse et affaiblir l’autre.
          Cliquez à nouveau sur un signe retenu pour retirer ce choix.
        </p>
        <ObservationMatrix
          observations={joinInfo.observations}
          diagnostics={joinInfo.diagnostics}
          mainDiagnosticId={draft.mainDiagnosticId}
          alternativeDiagnosticId={draft.alternativeDiagnosticId}
          onDiagnosisChange={changeDiagnosis}
          mainChoices={draft.mainChoices}
          alternativeChoices={draft.alternativeChoices}
          setMainChoices={(choices) => edit({ mainChoices: choices })}
          setAlternativeChoices={(choices) =>
            edit({ alternativeChoices: choices })
          }
          selectSign={(id, sign, choices, set, role) =>
            selectSign(id, sign, choices, set, role ?? "main")
          }
          disabled={locked}
          hasAlternative
        />
        <div className="participant-actions">
          <span>
            {submitted
              ? "Soumission définitive enregistrée"
              : "Les choix non soumis restent un brouillon."}
          </span>
          <Btn
            kind="outline"
            disabled={locked || saving || !online || conflict || !dirty}
            onClick={() => void saveDraft()}
          >
            <Save size={15} /> Enregistrer
          </Btn>
          <Btn
            disabled={locked || saving || !online || conflict}
            onClick={transmit}
          >
            {submitting ? "Transmission…" : "Vérifier et transmettre"}{" "}
            <ArrowRight size={15} />
          </Btn>
        </div>
      </main>
      <footer className="entry-footer">
        PRC Pharmacie · Votre pseudonyme ne donne pas accès à une copie
        d’autrui.
      </footer>
    </div>
  );
}

export function DiagnosticSelect({
  label,
  options,
  value,
  onChange,
  id,
  disabled,
  excludedId,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string | null;
  onChange: (value: string | null) => void;
  id?: string;
  disabled?: boolean;
  excludedId?: string | null;
}) {
  return (
    <label className="diagnostic-select">
      <span>{label}</span>
      <select
        id={id}
        aria-label={label}
        disabled={disabled}
        value={value || ""}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">Choisir une hypothèse</option>
        {options.map((option) => (
          <option
            key={option.id}
            value={option.id}
            disabled={option.id === excludedId}
          >
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={16} />
    </label>
  );
}
export function ObservationMatrix({
  observations,
  mainChoices,
  alternativeChoices,
  setMainChoices,
  setAlternativeChoices,
  selectSign,
  disabled,
  hasAlternative,
  diagnostics,
  mainDiagnosticId,
  alternativeDiagnosticId,
  onDiagnosisChange,
}: {
  observations: { id: string; text: string; category: string }[];
  mainChoices: Choice[];
  alternativeChoices: Choice[];
  setMainChoices: (value: Choice[]) => void;
  setAlternativeChoices: (value: Choice[]) => void;
  selectSign: (
    id: string,
    sign: "+" | "-",
    choices: Choice[],
    set: (value: Choice[]) => void,
    role?: Role,
  ) => void;
  disabled: boolean;
  hasAlternative: boolean;
  diagnostics?: { id: string; label: string }[];
  mainDiagnosticId?: string | null;
  alternativeDiagnosticId?: string | null;
  onDiagnosisChange?: (role: Role, value: string | null) => void;
}) {
  const cell = (
    observation: { id: string; text: string },
    role: Role,
    sign: "+" | "-",
    choices: Choice[],
  ) => {
    const selected =
      choices.find((choice) => choice.observationId === observation.id)
        ?.sign === sign;
    return (
      <button
        type="button"
        disabled={disabled}
        aria-label={`${role === "main" ? "Hypothèse principale" : "Hypothèse alternative"} : ${sign === "+" ? "En faveur" : "En défaveur"} — ${observation.text}`}
        aria-pressed={selected}
        className={`sign-choice ${selected ? `active ${sign === "+" ? "positive" : "negative"}` : ""}`}
        onClick={() =>
          selectSign(
            observation.id,
            sign,
            choices,
            role === "main" ? setMainChoices : setAlternativeChoices,
            role,
          )
        }
        data-testid={`choice-${role}-${sign === "+" ? "positive" : "negative"}-${observation.id}`}
      >
        <b>{sign === "+" ? "+" : "−"}</b>
        <span>{sign === "+" ? "En faveur" : "En défaveur"}</span>
      </button>
    );
  };
  return (
    <section
      className="observation-choices prc-matrix-scroll"
      aria-label="Justification des deux hypothèses"
    >
      <table className="prc-response-table">
        <caption>
          Une liste de données cliniques, deux hypothèses indépendantes
        </caption>
        <thead>
          <tr>
            <th scope="col">Donnée clinique</th>
            <th scope="col">
              <span
                id="participant-main-counter"
                tabIndex={-1}
                className="matrix-counter"
              >
                Principale · {mainChoices.length}/5
              </span>
              {diagnostics && onDiagnosisChange && (
                <DiagnosticSelect
                  id="participant-main-diagnosis"
                  label="Diagnostic principal"
                  options={diagnostics}
                  value={mainDiagnosticId ?? null}
                  excludedId={alternativeDiagnosticId}
                  disabled={disabled}
                  onChange={(value) => onDiagnosisChange("main", value)}
                />
              )}
            </th>
            {hasAlternative && (
              <th scope="col">
                <span
                  id="participant-alternative-counter"
                  tabIndex={-1}
                  className="matrix-counter"
                >
                  Alternative · {alternativeChoices.length}/5
                </span>
                {diagnostics && onDiagnosisChange && (
                  <DiagnosticSelect
                    id="participant-alternative-diagnosis"
                    label="Diagnostic alternatif"
                    options={diagnostics}
                    value={alternativeDiagnosticId ?? null}
                    excludedId={mainDiagnosticId}
                    disabled={disabled}
                    onChange={(value) =>
                      onDiagnosisChange("alternative", value)
                    }
                  />
                )}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {observations.map((observation, index) => (
            <tr key={observation.id}>
              <th scope="row">
                <small>
                  {observation.category || "Autre"} · {index + 1}
                </small>
                <span>{observation.text}</span>
              </th>
              <td>
                <div className="matrix-signs">
                  {cell(observation, "main", "+", mainChoices)}
                  {cell(observation, "main", "-", mainChoices)}
                </div>
              </td>
              {hasAlternative && (
                <td>
                  <div className="matrix-signs">
                    {cell(observation, "alternative", "+", alternativeChoices)}
                    {cell(observation, "alternative", "-", alternativeChoices)}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!observations.length && (
        <p className="inline-empty">Aucune donnée clinique disponible.</p>
      )}
    </section>
  );
}

export function ParticipantResults() {
  const { online, visible } = useAvailability();
  const results = useQuery({
    queryKey: ["/api/participant/results"],
    queryFn: () => api<ParticipantResult>("/api/participant/results"),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const waiting =
    results.data?.role === "panel"
      ? !results.data.panel.referenceVisible
      : !results.data?.published;
  const state = useQuery({
    queryKey: ["/api/participant/state"],
    queryFn: () => api<ActivityState>("/api/participant/state"),
    enabled: !!results.data && online && visible && waiting,
    refetchInterval: online && visible && waiting ? 15000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
  const signature = state.data
    ? JSON.stringify([
        state.data.status,
        state.data.reveals,
        state.data.published,
      ])
    : "";
  const previousSignature = useRef("");
  useEffect(() => {
    if (!signature || !results.data) return;
    const snapshot = JSON.stringify([
      results.data.status,
      results.data.reveals,
      results.data.published,
    ]);
    if (signature !== snapshot && signature !== previousSignature.current) {
      previousSignature.current = signature;
      results.refetch();
    }
  }, [signature, results.data]);
  if (results.isPending)
    return (
      <div className="participant-layout">
        <Loading label="Chargement de votre restitution…" />
      </div>
    );
  if (results.isError || !results.data)
    return (
      <div className="participant-layout">
        <ErrorBox
          message="Votre restitution n’est pas accessible dans cette session."
          retry={() => results.refetch()}
        />
      </div>
    );
  const data = results.data,
    role = data.role ?? data.case.role,
    submitted = data.response.state === "submitted";
  const published =
    role === "students" && data.published && submitted && data.score !== null;
  return (
    <div className="participant-layout">
      <ParticipantTop label="Restitution privée" />
      <main className="participant-result-content">
        <div className="eyebrow">
          {role === "panel" ? "CONTRIBUTION EXPERTE" : "VOTRE COPIE"}
        </div>
        <h1>{data.case.name}</h1>
        <TrialNotice trial={data.case.isTrial} />
        {!submitted ? (
          <section className="participant-notice">
            <h2>Non soumis</h2>
            <p>
              Votre brouillon n’est pas une copie définitive : il est exclu des
              statistiques et ne reçoit aucune note.
            </p>
            {data.status === "open" && (
              <Link href="/participant">Reprendre mon brouillon</Link>
            )}
          </section>
        ) : (
          <p className="participant-notice">
            Votre soumission définitive est enregistrée et verrouillée.{" "}
            <Link href="/participant">Revoir ma copie</Link>
          </p>
        )}
        {published ? (
          <section className="participant-score">
            <h2>Votre résultat</h2>
            <strong>
              {number(data.score)}
              <small> / 20</small>
            </strong>
            <span>
              {number(
                data.percentage ??
                  data.components.percentage ??
                  Number(data.score) * 5,
              )}{" "}
              %
            </span>
            <div className="score-components">
              {[
                ["mainDiagnosis", "Diagnostic principal", 2],
                ["mainJustification", "Justification principale", 8],
                ["alternativeDiagnosis", "Diagnostic alternatif", 2],
                ["alternativeJustification", "Justification alternative", 8],
              ].map(([key, label, maximum]) => (
                <div key={key}>
                  <span>{label}</span>
                  <b>
                    {number(data.components[key] ?? 0)} / {maximum}
                  </b>
                </div>
              ))}
            </div>
            <p>
              Barème V1 proposé : une référence pédagogique issue du panel, et
              non une norme clinique universelle.
            </p>
          </section>
        ) : role === "panel" ? (
          <p className="body-copy">
            Les experts ne reçoivent pas de note sur la référence produite par
            leurs propres réponses. La synthèse devient accessible après
            fermeture du panel et révélation par le professeur.
          </p>
        ) : submitted ? (
          <p className="body-copy">
            Votre note reste privée et masquée jusqu’à sa publication par le
            professeur. Les éléments de discussion apparaissent progressivement
            ci-dessous.
          </p>
        ) : null}
        <section className="participant-own-copy">
          <h2>
            {submitted
              ? "Votre réponse définitive"
              : "Votre brouillon enregistré"}
          </h2>
          {(["main", "alternative"] as const).map((copyRole) => (
            <OwnHypothesis
              key={copyRole}
              role={copyRole}
              data={data}
              corrected={published}
            />
          ))}
        </section>
        <AggregateSummary
          title="Référence du panel révélée"
          data={data.panel}
        />
        {data.class && (
          <AggregateSummary
            title="Résultats collectifs révélés"
            data={data.class}
          />
        )}
        {data.panel.referenceVisible && data.panel.reference && (
          <section className="participant-reference">
            <h2>Explication du professeur</h2>
            <p>
              {data.panel.reference.explanation ||
                "Aucune explication complémentaire."}
            </p>
            <details>
              <summary>Comprendre le barème V1 proposé</summary>
              <p>
                {data.panel.reference.scoring?.description ||
                  "Chaque rôle comporte 2 points de diagnostic et 8 de justification. La justification est calculée avec les effectifs experts concordants et le plafond fixé dans la référence, indépendamment du nombre de choix de l’étudiant."}
              </p>
            </details>
          </section>
        )}
      </main>
      <footer className="entry-footer">
        Votre copie et votre score sont privés. Aucun classement individuel
        public.
      </footer>
    </div>
  );
}
function number(value: unknown) {
  return Number(value ?? 0).toLocaleString("fr-CA", {
    maximumFractionDigits: 2,
  });
}
function OwnHypothesis({
  role,
  data,
  corrected,
}: {
  role: Role;
  data: ParticipantResult;
  corrected: boolean;
}) {
  const id =
    role === "main"
      ? data.response.mainDiagnosticId
      : data.response.alternativeDiagnosticId;
  const choices =
    role === "main"
      ? data.response.mainChoices
      : data.response.alternativeChoices;
  const distribution = data.panel.distributions?.find(
    (row) => row.role === role && row.diagnosticId === id,
  );
  const score = data.components[role];
  return (
    <article className="own-hypothesis">
      <h3>
        {role === "main" ? "Hypothèse principale" : "Hypothèse alternative"} :{" "}
        {data.case.diagnostics.find((diagnostic) => diagnostic.id === id)
          ?.label || "Non choisie"}
      </h3>
      {corrected && score?.represented === false && (
        <p className="participant-notice">
          Hypothèse non représentée dans le panel pour ce rôle. Les deux
          composantes de ce rôle valent zéro ; cela ne qualifie pas
          automatiquement ce choix d’erreur clinique.
        </p>
      )}
      {corrected && distribution && (
        <p>
          Effectifs de référence pour ce diagnostic et ce rôle :{" "}
          <b>N = {distribution.expertCount}</b> expert(s). Plafond de
          justification C = {distribution.ceiling}.
        </p>
      )}
      <ul>
        {choices.map((choice) => {
          const observation = data.case.observations.find(
            (row) => row.id === choice.observationId,
          );
          const counts = distribution?.observations.find(
            (row) => row.observationId === choice.observationId,
          );
          return (
            <li key={choice.observationId}>
              <b>{choice.sign === "+" ? "+ En faveur" : "− En défaveur"}</b> —{" "}
              {observation?.text || "Observation"}
              {corrected && counts && (
                <span className="expert-choice-count">
                  {choice.sign === "+" ? counts.positive : counts.negative} /{" "}
                  {distribution!.expertCount} expert(s) ont retenu ce signe
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {!choices.length && <p>Aucune donnée sélectionnée.</p>}
      {corrected && distribution && (
        <details>
          <summary>Autres choix crédités et désaccords du panel</summary>
          <p>
            Les pourcentages utilisent N = {distribution.expertCount}, les
            experts ayant choisi ce diagnostic dans ce rôle.
          </p>
          <CountTable
            observations={distribution.observations}
            count={distribution.expertCount}
            caseData={data.case}
          />
        </details>
      )}
    </article>
  );
}
function CountTable({
  observations,
  count,
  caseData,
}: {
  observations: CountRow[];
  count: number;
  caseData?: CaseData;
}) {
  return (
    <div className="participant-count-scroll">
      <table className="participant-count-table">
        <thead>
          <tr>
            <th>Donnée</th>
            <th>En faveur (+)</th>
            <th>En défaveur (−)</th>
            <th>Non sélectionnée</th>
          </tr>
        </thead>
        <tbody>
          {observations.map((row) => (
            <tr key={row.observationId}>
              <th scope="row">
                {row.label ||
                  caseData?.observations.find(
                    (observation) => observation.id === row.observationId,
                  )?.text ||
                  row.observationId}
              </th>
              {[row.positive, row.negative, row.notSelected].map((value, i) => (
                <td key={i}>
                  {value} / {count} ({number(count ? (value * 100) / count : 0)}{" "}
                  %)
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function AggregateSummary({
  data,
  title,
}: {
  data?: Aggregate;
  title: string;
}) {
  if (
    !data ||
    ((!data.diagnostics || !data.diagnostics.length) &&
      (!data.distributions || !data.distributions.length))
  )
    return null;
  return (
    <section className="participant-aggregate">
      <h2>{title}</h2>
      <p>
        {data.totalSubmissions ?? 0} copie(s) définitive(s). Les brouillons sont
        exclus.
      </p>
      {data.diagnostics?.map((diagnostic) => (
        <div className="diagnostic-count" key={diagnostic.diagnosticId}>
          <h3>{diagnostic.label}</h3>
          {[
            ["mainCount", "mainPercent", "Principale"],
            ["alternativeCount", "alternativePercent", "Alternative"],
          ].map(([count, percent, label]) =>
            diagnostic[count] === undefined ? null : (
              <div key={count}>
                <span>
                  {label} : {diagnostic[count]} / {data.totalSubmissions} (
                  {number(diagnostic[percent])} %)
                </span>
                <meter
                  min={0}
                  max={100}
                  value={diagnostic[percent] ?? 0}
                  aria-label={`${diagnostic.label}, ${label}`}
                />
              </div>
            ),
          )}
        </div>
      ))}
      {data.distributions?.map((distribution) => (
        <details key={`${distribution.role}-${distribution.diagnosticId}`}>
          <summary>
            {distribution.role === "main" ? "Principale" : "Alternative"} —{" "}
            {data.diagnostics?.find(
              (row) => row.diagnosticId === distribution.diagnosticId,
            )?.label || distribution.diagnosticId}{" "}
            · N = {distribution.expertCount}
          </summary>
          <CountTable
            observations={distribution.observations}
            count={distribution.expertCount}
          />
        </details>
      ))}
    </section>
  );
}
