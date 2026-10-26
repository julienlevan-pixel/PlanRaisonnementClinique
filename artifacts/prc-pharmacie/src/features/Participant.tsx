import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Save,
  ShieldCheck,
  Brain,
} from "lucide-react";
import { Link, useLocation, useParams } from "wouter";
import type { Choice } from "@workspace/api-client-react";
import type { AppActions } from "../app/actions";
import { Btn, Input, Loading, ErrorBox } from "../app/ui";
import { getError } from "../app/utils";
import { api } from "../app/api";
import {
  StudentReview,
  MaximumScoreGuide,
  type StudentReviewData,
} from "./StudentReview";
import {
  GradeDistribution,
  type GradeDistributionData,
} from "./GradeDistribution";
import "./participant.css";
import type { GradingSummary } from "./RubricEditor";
import {
  CasePresentation,
  SessionCountdown,
  type LiveSession,
} from "./LiveSession";

type Role = "main" | "alternative";
type CaseData = {
  liveSession?: LiveSession;
  grading?: GradingSummary;
  scoringVersion?: string;
  guidedReview?: boolean;
  deliveryMode?: "synchronous" | "asynchronous";
  requiredChoices?: number | null;
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
  liveSession?: LiveSession;
  joinInfo?: CaseData;
  participantCount?: number;
  serverNow?: string;
  status: string;
  role: "panel" | "students";
  reveals: Record<string, any>;
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
  positivePoints?: number;
  negativePoints?: number;
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
  gradeDistribution?: GradeDistributionData;
  guidedReview?: boolean;
  deliveryMode?: "synchronous" | "asynchronous";
  studentReview?: StudentReviewData;
  published: boolean;
  case: CaseData;
  response: SavedResponse;
  score: number | null;
  percentage?: number | null;
  components: Record<string, any>;
  panel: Aggregate;
  expertPanel?: Aggregate;
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
          <Brain size={20} />
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
      code,
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
              Aucun compte à créer. Indiquez votre nom ou pseudonyme. Pour
              reprendre ensuite votre copie, utilisez ce même navigateur ; le
              pseudonyme seul ne donne pas accès à une copie.
            </p>
            {info.data.guidedReview && (
              <p className="participant-notice">
                Deux impressions cliniques distinctes, cinq données cliniques
                pour chacune.{" "}
                {info.data.deliveryMode === "asynchronous"
                  ? "Votre corrigé personnel sera disponible dès la soumission."
                  : "Le professeur guidera la correction après la fin du temps de réponse."}
              </p>
            )}
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
        ? state?.liveSession
          ? 5000
          : 15000
        : false;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
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
  const context = useRef({
    online,
    submitted,
    status: "open",
    conflict,
    canAnswer: true,
  });
  const joinInfo = stateQuery.data?.joinInfo ?? responseQuery.data?.joinInfo;
  const status = stateQuery.data?.status ?? joinInfo?.status ?? "open";
  const liveSession = stateQuery.data?.liveSession ?? joinInfo?.liveSession;
  const canAnswer = !liveSession || liveSession.phase === "answering";
  context.current = { online, submitted, status, conflict, canAnswer };
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
      !context.current.canAnswer ||
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
      status !== "open" ||
      !canAnswer
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
    canAnswer,
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
    if (submitted || status !== "open" || submitting || !canAnswer) return;
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
      "Le diagnostic a changé : revoyez et sélectionnez à nouveau les signes de cette impression clinique.",
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
        choice.observationId === id ? { ...choice, sign } : choice,
      );
    else if (choices.length >= 5) {
      setNotice(
        "Cinq observations au maximum par impression clinique. Retirez un choix avant d’en ajouter un autre.",
      );
      return;
    } else next = [...choices, { observationId: id, sign }];
    edit(
      role === "main" ? { mainChoices: next } : { alternativeChoices: next },
    );
  };
  const transmit = async () => {
    if (!joinInfo || submitted || status !== "open" || !canAnswer) return;
    const missing: { message: string; target: string }[] = [];
    if (!draft.mainDiagnosticId)
      missing.push({
        message: "Choisissez votre impression clinique.",
        target: "participant-main-diagnosis",
      });
    if (!draft.alternativeDiagnosticId)
      missing.push({
        message: "Choisissez votre impression clinique alternative.",
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
        ((joinInfo.role === "panel" || joinInfo.requiredChoices === 5) &&
          choices.length !== 5)
      )
        missing.push({
          message:
            joinInfo.role === "panel" || joinInfo.requiredChoices === 5
              ? `Sélectionnez exactement cinq observations signées pour l’impression clinique ${name}.`
              : `Sélectionnez au moins une observation signée pour l’impression clinique ${name}.`,
          target: `participant-${role}-counter`,
        });
      if (joinInfo.role === "panel") {
        const unrated = choices.find(
          (choice) =>
            !Number.isInteger(choice.points) ||
            Number(choice.points) < 1 ||
            Number(choice.points) > 3,
        );
        if (unrated)
          missing.push({
            message: `Attribuez de 1 à 3 points à chaque donnée choisie pour l’impression clinique ${name}.`,
            target: `participant-${role}-points-${unrated.observationId}`,
          });
      }
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
  if (liveSession && status === "open" && !canAnswer && !submitted) {
    return (
      <div className="participant-layout">
        <ParticipantTop label="Séance synchrone" />
        <main className="participant-content">
          <h1>{joinInfo.name}</h1>
          <section
            className="session-waiting"
            aria-label="Salle d’attente de la séance"
          >
            <div className="eyebrow">
              {liveSession.phase === "lobby"
                ? "BIENVENUE"
                : "PRÉSENTATION DU CAS"}
            </div>
            <h2>
              {liveSession.phase === "lobby"
                ? "Vous avez rejoint la séance"
                : "Prenez connaissance du cas clinique"}
            </h2>
            <p>
              {liveSession.phase === "lobby"
                ? "Le professeur présentera bientôt le cas. Vous n’avez rien à faire : cet écran se met à jour automatiquement."
                : "Le professeur présente le cas. Vous pourrez choisir vos impressions cliniques et vos données lorsqu’il ouvrira les réponses."}
            </p>
            {stateQuery.data?.participantCount !== undefined && (
              <p className="session-joined-count">
                {stateQuery.data.participantCount} personne(s) ont rejoint la
                séance.
              </p>
            )}
            {!online && (
              <p role="status">
                Hors connexion. L’écran se remettra à jour au retour de la
                connexion.
              </p>
            )}
            {stateQuery.isError && (
              <ErrorBox
                message="La mise à jour de la séance est interrompue."
                retry={() => stateQuery.refetch()}
              />
            )}
          </section>
          {liveSession.phase === "case" && <CasePresentation data={joinInfo} />}
        </main>
      </div>
    );
  }
  const locked = submitted || status !== "open" || submitting || !canAnswer;
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
        {status === "open" && (
          <SessionCountdown
            session={liveSession}
            serverNow={stateQuery.data?.serverNow}
          />
        )}
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
        {joinInfo.role === "students" && (
          <MaximumScoreGuide
            scoringVersion={joinInfo.scoringVersion}
            grading={joinInfo.grading}
          />
        )}
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
          Choisissez l’impression clinique la plus probable, puis une impression
          clinique alternative plausible. Pour chacune, sélectionnez{" "}
          {joinInfo.role === "panel" || joinInfo.requiredChoices === 5
            ? "les cinq données"
            : "de une à cinq données"}{" "}
          qui permettent le mieux de la soutenir ou de la remettre en question.
        </p>
        <p className="body-copy">
          {joinInfo.role === "panel" && (
            <>
              Attribuez à chaque donnée choisie de 1 à 3 points : 1 = peu
              discriminante, 2 = modérément discriminante, 3 = très
              discriminante.{" "}
            </>
          )}
          Une même donnée peut soutenir une impression clinique et affaiblir
          l’autre. Cliquez à nouveau sur un signe retenu pour retirer ce choix.
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
          expertPoints={joinInfo.role === "panel"}
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
        <option value="">Choisir une impression clinique</option>
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
  expertPoints = false,
  renderObservation,
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
  expertPoints?: boolean;
  renderObservation?: (
    observation: { id: string; text: string; category: string },
    index: number,
  ) => ReactNode;
}) {
  const points = (
    observation: { id: string; text: string },
    role: Role,
    choices: Choice[],
  ) => {
    const selected = choices.find(
      (choice) => choice.observationId === observation.id,
    );
    if (!expertPoints || !selected) return null;
    return (
      <label className="expert-points">
        <span>Pouvoir discriminant</span>
        <select
          id={`participant-${role}-points-${observation.id}`}
          aria-label={`Points ${role === "main" ? "impression clinique" : "impression clinique alternative"} — ${observation.text}`}
          disabled={disabled}
          value={selected.points ?? ""}
          onChange={(event) => {
            const next = choices.map((choice) =>
              choice.observationId === observation.id
                ? {
                    ...choice,
                    points: event.target.value
                      ? Number(event.target.value)
                      : undefined,
                  }
                : choice,
            );
            (role === "main" ? setMainChoices : setAlternativeChoices)(next);
          }}
        >
          <option value="">Attribuer des points</option>
          <option value="1">1 · Peu discriminante</option>
          <option value="2">2 · Modérément discriminante</option>
          <option value="3">3 · Très discriminante</option>
        </select>
      </label>
    );
  };
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
        disabled={disabled || !!renderObservation}
        aria-label={`${role === "main" ? "Impression clinique" : "Impression clinique alternative"} : ${sign === "+" ? "En faveur" : "En défaveur"} — ${observation.text}`}
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
      aria-label={
        renderObservation
          ? "Création du tableau clinique"
          : "Justification des deux impressions cliniques"
      }
    >
      <table
        className={`prc-response-table${renderObservation ? " clinical-authoring-table" : ""}`}
      >
        <caption>
          {renderObservation
            ? "Votre tableau clinique se construit ici, ligne par ligne"
            : "Une liste de données cliniques, deux impressions cliniques indépendantes"}
        </caption>
        <thead>
          <tr>
            <th scope="col">Donnée clinique</th>
            <th scope="col">
              <span
                id={renderObservation ? undefined : "participant-main-counter"}
                tabIndex={-1}
                className="matrix-counter"
              >
                {renderObservation
                  ? "Impression clinique"
                  : `Principale · ${mainChoices.length}/5`}
              </span>
              {diagnostics && onDiagnosisChange && (
                <DiagnosticSelect
                  id="participant-main-diagnosis"
                  label="Impression clinique"
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
                  id={
                    renderObservation
                      ? undefined
                      : "participant-alternative-counter"
                  }
                  tabIndex={-1}
                  className="matrix-counter"
                >
                  {renderObservation
                    ? "Impression clinique alternative"
                    : `Alternative · ${alternativeChoices.length}/5`}
                </span>
                {diagnostics && onDiagnosisChange && (
                  <DiagnosticSelect
                    id="participant-alternative-diagnosis"
                    label="Impression clinique alternative"
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
                {renderObservation ? (
                  renderObservation(observation, index)
                ) : (
                  <>
                    <small>
                      {observation.category || "Autre"} · {index + 1}
                    </small>
                    <span>{observation.text}</span>
                  </>
                )}
              </th>
              <td>
                <div className="matrix-signs">
                  {cell(observation, "main", "+", mainChoices)}
                  {cell(observation, "main", "-", mainChoices)}
                </div>
                {points(observation, "main", mainChoices)}
              </td>
              {hasAlternative && (
                <td>
                  <div className="matrix-signs">
                    {cell(observation, "alternative", "+", alternativeChoices)}
                    {cell(observation, "alternative", "-", alternativeChoices)}
                  </div>
                  {points(observation, "alternative", alternativeChoices)}
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
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: (query) =>
      online &&
      visible &&
      query.state.data?.role === "panel" &&
      query.state.data.response.state === "submitted" &&
      query.state.data.status === "open"
        ? 15000
        : false,
    refetchIntervalInBackground: false,
  });
  const waiting =
    results.data?.role === "panel"
      ? !results.data.panel.referenceVisible
      : results.data?.status !== "published";
  const state = useQuery({
    queryKey: ["/api/participant/state"],
    queryFn: () => api<ActivityState>("/api/participant/state"),
    enabled:
      !!results.data &&
      (results.data.role !== "panel" ||
        results.data.response.state !== "submitted" ||
        results.data.status !== "open") &&
      online &&
      visible &&
      waiting,
    refetchInterval:
      online && visible && waiting
        ? results.data?.guidedReview
          ? 5000
          : 15000
        : false,
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
  const ownCopy = (["main", "alternative"] as const).map((copyRole) => (
    <OwnHypothesis
      key={copyRole}
      role={copyRole}
      data={data}
      corrected={published && !data.guidedReview}
    />
  ));
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
            <p>Note obtenue / note maximale du cas</p>
            <strong>
              {number(data.score)}
              <small> / {data.case.grading?.maximum ?? 20}</small>
            </strong>
            <span>
              {number(
                data.percentage ??
                  data.components.percentage ??
                  (Number(data.score) / (data.case.grading?.maximum ?? 20)) *
                    100,
              )}{" "}
              %
            </span>
            <div className="score-components">
              {[
                [
                  "mainDiagnosis",
                  "Impression clinique",
                  data.case.grading?.mainDiagnosisMaximum ?? 2,
                ],
                [
                  "mainJustification",
                  "Justification principale",
                  data.case.grading?.clinicalMaximum ?? 8,
                ],
                [
                  "alternativeDiagnosis",
                  "Impression clinique alternative",
                  data.case.grading?.alternativeDiagnosisMaximum ?? 2,
                ],
                [
                  "alternativeJustification",
                  "Justification alternative",
                  data.case.grading?.clinicalMaximum ?? 8,
                ],
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
              Barème pédagogique proposé : une référence issue du panel, et non
              une norme clinique universelle.
            </p>
          </section>
        ) : role === "panel" ? (
          <p className="body-copy">
            Les experts ne reçoivent pas de note sur la référence produite par
            leurs propres réponses. Après soumission, les tableaux du panel sont
            accessibles automatiquement, sans attendre la fermeture de la
            séance.
          </p>
        ) : submitted ? (
          <p className="body-copy">
            Votre note reste privée et masquée jusqu’à sa publication par le
            professeur. Les éléments de discussion apparaissent progressivement
            ci-dessous.
          </p>
        ) : null}
        {role === "students" && (
          <MaximumScoreGuide
            scoringVersion={data.case.scoringVersion}
            grading={data.case.grading}
          />
        )}
        <section className="participant-own-copy">
          {data.guidedReview && submitted ? (
            <details>
              <summary>
                Revoir mes deux impressions cliniques et mes données choisies
              </summary>
              {ownCopy}
            </details>
          ) : (
            <>
              <h2>
                {submitted
                  ? "Votre réponse définitive"
                  : "Votre brouillon enregistré"}
              </h2>
              {ownCopy}
            </>
          )}
        </section>
        {data.guidedReview && role === "students" && (
          <StudentReview
            review={data.studentReview}
            submitted={submitted}
            deliveryMode={data.deliveryMode}
          />
        )}
        {role === "students" && data.gradeDistribution && (
          <GradeDistribution
            data={data.gradeDistribution}
            ownScore={submitted ? data.score : null}
          />
        )}
        {role === "panel" && submitted && data.expertPanel && (
          <ExpertComparison data={data} panel={data.expertPanel} />
        )}
        {!data.guidedReview && (
          <AggregateSummary
            title="Référence du panel révélée"
            data={data.panel}
          />
        )}
        {!data.guidedReview && data.class && (
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
              <summary>Comprendre le barème pédagogique</summary>
              <p>
                {data.panel.reference.scoring?.description ||
                  "Chaque rôle comporte 2 points de diagnostic et 8 de justification. La justification utilise les points experts concordants et le plafond fixé dans la référence. Les anciennes références sans pondération utilisent les effectifs. L’étudiant n’attribue pas de points."}
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
        {role === "main"
          ? "Impression clinique"
          : "Impression clinique alternative"}{" "}
        :{" "}
        {data.case.diagnostics.find((diagnostic) => diagnostic.id === id)
          ?.label || "Non choisie"}
      </h3>
      {corrected && score?.represented === false && (
        <p className="participant-notice">
          Impression clinique non représentée dans le panel pour ce rôle. Les
          deux composantes de ce rôle valent zéro ; cela ne qualifie pas
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
              {data.case.role === "panel" && (
                <span className="expert-choice-count">
                  {choice.points ?? 1} point(s)
                  {choice.points === undefined
                    ? " · ancienne réponse non pondérée"
                    : ""}
                </span>
              )}
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
function ExpertComparison({
  data,
  panel,
}: {
  data: ParticipantResult;
  panel: Aggregate;
}) {
  return (
    <section
      className="expert-comparison"
      aria-label="Comparaison avec le panel"
    >
      <h2>Vos choix et ceux du panel</h2>
      <p>
        {panel.totalSubmissions ?? 0} réponse(s) définitive(s), vous compris.
        Les brouillons sont exclus. Les totaux se mettent à jour au fil des
        soumissions, en séance ou à distance.
      </p>
      <p>
        Pour chaque diagnostic, les choix en impression clinique principale et
        alternative sont réunis. Les points en faveur et en défaveur restent
        séparés ; ils ne s’annulent pas.
      </p>
      {data.case.diagnostics.map((diagnostic, index) => {
        const distributions =
          panel.distributions?.filter(
            (row) => row.diagnosticId === diagnostic.id,
          ) ?? [];
        const n = distributions.reduce((sum, row) => sum + row.expertCount, 0);
        const ownRole =
          data.response.mainDiagnosticId === diagnostic.id
            ? "main"
            : data.response.alternativeDiagnosticId === diagnostic.id
              ? "alternative"
              : null;
        const own =
          ownRole === "main"
            ? data.response.mainChoices
            : ownRole === "alternative"
              ? data.response.alternativeChoices
              : [];
        const rows = data.case.observations.map((observation) => {
          const counts = distributions.flatMap((row) =>
            row.observations.filter(
              (item) => item.observationId === observation.id,
            ),
          );
          const positive = counts.reduce((sum, row) => sum + row.positive, 0);
          const negative = counts.reduce((sum, row) => sum + row.negative, 0);
          const positivePoints = counts.reduce(
            (sum, row) => sum + (row.positivePoints ?? row.positive),
            0,
          );
          const negativePoints = counts.reduce(
            (sum, row) => sum + (row.negativePoints ?? row.negative),
            0,
          );
          return {
            observation,
            positive,
            negative,
            positivePoints,
            negativePoints,
            total: positivePoints + negativePoints,
          };
        });
        const maximum = Math.max(0, ...rows.map((row) => row.total));
        return (
          <article key={diagnostic.id} className="expert-diagnostic">
            <h3>
              Impression clinique {index + 1} · {diagnostic.label}
            </h3>
            <p>
              {n} expert(s) ont retenu ce diagnostic.
              {ownRole
                ? ` Votre impression clinique ${ownRole === "main" ? "principale" : "alternative"}.`
                : " Vous n’avez pas retenu ce diagnostic."}
            </p>
            <div
              className="participant-count-scroll"
              role="region"
              aria-label={`Tableau ${diagnostic.label}`}
              tabIndex={0}
            >
              <table className="participant-count-table expert-comparison-table">
                <caption>
                  {diagnostic.label} · {data.case.observations.length} données
                  cliniques · panel, vous compris
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Donnée clinique</th>
                    <th scope="col">Votre choix et vos points</th>
                    <th scope="col">
                      Panel en faveur (+)<small>Réponses · points</small>
                    </th>
                    <th scope="col">
                      Panel en défaveur (−)<small>Réponses · points</small>
                    </th>
                    <th scope="col">Total des points du panel</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const choice = own.find(
                      (item) => item.observationId === row.observation.id,
                    );
                    return (
                      <tr
                        key={row.observation.id}
                        className={choice ? "expert-own-selection" : undefined}
                      >
                        <th scope="row">{row.observation.text}</th>
                        <td>
                          {choice
                            ? `${choice.sign === "+" ? "+ En faveur" : "− En défaveur"} · ${choice.points ?? 1} point(s)`
                            : "Non choisie"}
                        </td>
                        <td>
                          {row.positive} / {n} · {row.positivePoints} pt
                        </td>
                        <td>
                          {row.negative} / {n} · {row.negativePoints} pt
                        </td>
                        <td>
                          <b>{row.total} pt</b>
                          {maximum > 0 && row.total === maximum && (
                            <small>Plus fort total pour ce diagnostic</small>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>
        );
      })}
    </section>
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
