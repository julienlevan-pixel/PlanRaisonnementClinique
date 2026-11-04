import { useState, type FormEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { QRCodeSVG } from "qrcode.react";
import { normalizeAccessCode } from "@workspace/prc-backend/access-code";
import { api } from "../app/api";
import { Btn, ErrorBox, Input } from "../app/ui";
import { getError } from "../app/utils";
import "./participant-access.css";

export function ShortJoinAddress() {
  const address = `${window.location.host}/rejoindre`;
  return (
    <p className="short-join-address">
      Sur ordinateur : <a href="/rejoindre">{address}</a>, puis saisissez le
      code.
    </p>
  );
}

export function ResumeParticipation() {
  const resume = useQuery({
    queryKey: ["participant-resume"],
    queryFn: () =>
      api<{
        available: boolean;
        name?: string;
        pseudonym?: string;
        isTrial?: boolean;
      }>("/api/participant/resume"),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  if (!resume.data?.available) return null;
  return (
    <section
      className="resume-participation"
      aria-label="Votre participation dans ce navigateur"
    >
      <strong>
        Bon retour{resume.data.pseudonym ? `, ${resume.data.pseudonym}` : ""}.
      </strong>
      <p>
        {resume.data.name}
        {resume.data.isTrial ? " · Essai" : ""}
      </p>
      <Link href="/participant" className="btn btn-primary">
        {resume.data.isTrial ? "Reprendre mon essai" : "Reprendre mon parcours"}
      </Link>
      <small>Votre participation est reconnue dans ce navigateur.</small>
    </section>
  );
}

export function AccessCodeForm({
  initialCode = "",
  autoFocus = false,
}: {
  initialCode?: string;
  autoFocus?: boolean;
}) {
  const [code, setCode] = useState(initialCode),
    [, navigate] = useLocation();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeAccessCode(code);
    if (normalized) navigate(`/join/${encodeURIComponent(normalized)}`);
  };
  return (
    <form className="access-code-form" onSubmit={submit}>
      <Input
        label="Code de la séance"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={40}
        required
        placeholder="Ex. : ABCD2345"
      />
      <small>Les minuscules, espaces et tirets sont acceptés.</small>
      <Btn type="submit">Trouver ma séance</Btn>
    </form>
  );
}

export function JoinEntry() {
  return (
    <div className="participant-layout">
      <main className="join-card">
        <div className="eyebrow">PARTICIPER SANS COMPTE</div>
        <h1>Rejoindre une séance</h1>
        <p>
          Scannez le QR code présenté par le professeur, ou saisissez son code
          ici.
        </p>
        <ResumeParticipation />
        <AccessCodeForm
          initialCode={
            new URLSearchParams(window.location.search).get("code") ?? ""
          }
        />
        <p className="access-browser-hint">
          Pour reprendre votre copie plus tard, utilisez ce même navigateur.
        </p>
        <Link href="/" className="back-link">
          ← Accueil
        </Link>
      </main>
    </div>
  );
}

export function JoinConfirmation({
  info,
}: {
  info: {
    name: string;
    role: "panel" | "students";
    deliveryMode?: string;
    teacherName?: string;
    caseCount?: number;
  };
}) {
  return (
    <section className="join-confirmation" aria-label="Confirmer votre séance">
      <strong>
        Vous participez comme{" "}
        {info.role === "panel" ? "clinicien expert" : "étudiant"}.
      </strong>
      {info.role === "panel" && (
        <p>Votre contribution aidera à construire le corrigé.</p>
      )}
      <dl>
        <div>
          <dt>Séance</dt>
          <dd>{info.name}</dd>
        </div>
        {info.teacherName && (
          <div>
            <dt>Professeur</dt>
            <dd>{info.teacherName}</dd>
          </div>
        )}
        <div>
          <dt>Cas</dt>
          <dd>{info.caseCount ?? 1}</dd>
        </div>
        <div>
          <dt>Déroulement</dt>
          <dd>
            {info.deliveryMode === "asynchronous"
              ? "Asynchrone · à votre rythme"
              : "Synchrone · guidé par le professeur"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function TestParticipantAccess({
  launchId,
  caseLabel,
  cases,
}: {
  launchId: string;
  caseLabel?: string;
  cases?: { id: string; name: string }[];
}) {
  const [selected, setSelected] = useState(launchId);
  const selectedIndex = cases?.findIndex((c) => c.id === selected) ?? -1;
  const label =
    selectedIndex >= 0
      ? `Cas ${selectedIndex + 1} · ${cases![selectedIndex].name}`
      : caseLabel;
  const trial = useMutation({
    mutationFn: () =>
      api<{ launchId: string; code: string; url: string }>(
        `/api/launches/${selected}/trial`,
        "POST",
        {},
      ),
  });
  return (
    <section
      className="participant-access-test"
      aria-label="Tester l’accès participant"
    >
      <h2>Vérifier l’accès avant l’accueil</h2>
      {cases && cases.length > 1 && (
        <label className="field">
          <span>Cas à tester</span>
          <select
            value={selected}
            disabled={trial.isPending}
            onChange={(e) => {
              setSelected(e.target.value);
              trial.reset();
            }}
          >
            {cases.map((item, index) => (
              <option key={item.id} value={item.id}>
                Cas {index + 1} · {item.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <p>
        {label ? `${label} · ` : ""}L’essai reprend le cas, le rôle et le barème
        enregistrés pour cette collecte. Ses réponses sont exclues des résultats
        réels.
      </p>
      {!trial.data ? (
        <Btn
          kind="outline"
          disabled={trial.isPending}
          onClick={() => trial.mutate()}
        >
          {trial.isPending
            ? "Préparation de l’essai…"
            : "Tester l’accès participant"}
        </Btn>
      ) : (
        <>
          <div className="trial-access-code">
            <QRCodeSVG
              value={trial.data.url}
              size={160}
              title="Rejoindre l’essai"
            />
            <div>
              <strong>ESSAI · {trial.data.code}</strong>
              <p>
                <a
                  href={trial.data.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ouvrir l’accès d’essai
                </a>
              </p>
              <ShortJoinAddress />
            </div>
          </div>
          <p>
            Indiquez un pseudonyme pour essayer le questionnaire. Les réponses
            d’essai sont ouvertes immédiatement. Le suivi de l’essai permet
            ensuite de tester la clôture et la restitution.
          </p>
          <a
            className="btn btn-outline"
            href={`/activity/${trial.data.launchId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Suivre et piloter l’essai
          </a>
        </>
      )}
      {trial.isError && (
        <ErrorBox
          message={getError(trial.error)}
          retry={() => trial.mutate()}
        />
      )}
    </section>
  );
}
