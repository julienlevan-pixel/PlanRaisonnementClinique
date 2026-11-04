import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, Download, Trash2 } from "lucide-react";
import { api } from "../app/api";
import { Btn, Input, ErrorBox, Loading } from "../app/ui";
import { getError } from "../app/utils";
import { ParticipantDialog } from "./ParticipantExperience";
import "./attendance.css";

type AttendanceStatus =
  "unconfirmed" | "present" | "late" | "absent" | "excused";
type Entry = {
  id: string;
  revision: number;
  fullName: string;
  studentNumber: string | null;
  status: AttendanceStatus;
  source: string;
  confirmedAt: string | null;
  teacherMarkedAt: string | null;
  updatedAt: string;
  canDelete: boolean;
};
type AttendanceView = {
  installed: boolean;
  enabled: boolean;
  deliveryMode?: "synchronous" | "asynchronous";
  sourceFinished?: boolean;
  role?: "panel" | "students";
  register?: {
    id: string;
    open: boolean;
    collectStudentNumber: boolean;
    openedAt: string;
    closedAt: string | null;
  };
  entries?: Entry[];
  summary?: Record<AttendanceStatus, number>;
  own?: Entry | null;
};
const labels: Record<AttendanceStatus, string> = {
  unconfirmed: "À confirmer",
  present: "Présent·e",
  late: "En retard",
  absent: "Absent·e",
  excused: "Absence justifiée",
};
const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("fr-CA", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";
const poll = (data?: AttendanceView) =>
  navigator.onLine &&
  document.visibilityState === "visible" &&
  data?.installed !== false &&
  !data?.sourceFinished
    ? 15000
    : false;

export function AttendanceManager({
  kind,
  id,
  name,
}: {
  kind: "teaching-sessions" | "launches";
  id: string;
  name: string;
}) {
  const [opened, setOpened] = useState(false),
    [visited, setVisited] = useState(false),
    [collectNumber, setCollectNumber] = useState(false),
    [roster, setRoster] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [localError, setLocalError] = useState("");
  const cache = useQueryClient(),
    endpoint = `/api/attendance/${kind}/${id}`,
    key = ["attendance", kind, id];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api<AttendanceView>(endpoint),
    enabled: visited,
    retry: false,
    refetchInterval: (q) => poll(q.state.data),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const change = useMutation({
    onMutate: () => cache.cancelQueries({ queryKey: key }),
    mutationFn: ({
      suffix = "",
      data = {},
    }: {
      suffix?: string;
      data?: unknown;
    }) => api<AttendanceView>(endpoint + suffix, "POST", data),
    onSuccess: (data) => {
      cache.setQueryData(key, data);
      setLocalError("");
    },
    onError: (error: any) => {
      if (error.status === 409) void query.refetch();
    },
  });
  const view = query.data,
    register = view?.register,
    entries = view?.entries ?? [],
    summary = view?.summary;
  const recorded = (summary?.present ?? 0) + (summary?.late ?? 0),
    asynchronous = view?.deliveryMode === "asynchronous";
  const addRoster = (event: FormEvent) => {
    event.preventDefault();
    setLocalError("");
    const lines = roster
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!lines.length || lines.length > 500) {
      setLocalError("Ajoutez de 1 à 500 personnes, une par ligne.");
      return;
    }
    const rows = lines.map((line) => {
      const [fullName, studentNumber, ...extra] = line
        .split(";")
        .map((s) => s.trim());
      return { fullName, studentNumber: studentNumber || undefined, extra };
    });
    if (
      rows.some(
        (row) =>
          !row.fullName ||
          row.extra.length ||
          (!register?.collectStudentNumber && row.studentNumber),
      )
    ) {
      setLocalError(
        register?.collectStudentNumber
          ? "Utilisez : Nom et prénom ; matricule (facultatif dans la liste)."
          : "Indiquez seulement le nom et le prénom, une personne par ligne.",
      );
      return;
    }
    change.mutate(
      {
        suffix: "/roster",
        data: { rows: rows.map(({ extra, ...row }) => row) },
      },
      { onSuccess: () => setRoster("") },
    );
  };
  const exportCSV = () => {
    const cell = (value: unknown) => {
      let result = String(value ?? "");
      if (/^\s*[=+\-@]/.test(result)) result = "'" + result;
      return '"' + result.replaceAll('"', '""') + '"';
    };
    const rows = [
      [
        "Séance",
        "Nom et prénom",
        ...(register?.collectStudentNumber ? ["Matricule"] : []),
        "Statut",
        "Confirmation participante",
        "Correction professeur",
        "Modalité",
      ],
      ...entries.map((entry) => [
        name,
        entry.fullName,
        ...(register?.collectStudentNumber ? [entry.studentNumber] : []),
        labels[entry.status],
        entry.confirmedAt ?? "",
        entry.teacherMarkedAt ?? "",
        asynchronous ? "Participation asynchrone" : "Présence synchrone",
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + rows.map((row) => row.map(cell).join(";")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `presences-${name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .slice(0, 70)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="attendance-access" aria-label="Prise de présences">
      <div>
        <ClipboardCheck size={20} aria-hidden="true" />
        <span>
          <strong>Présences</strong>
          <small>
            Feuille nominative réservée au professeur
            {view?.enabled ? ` · ${recorded} enregistrée(s)` : ""}
          </small>
        </span>
      </div>
      <Btn
        kind="outline"
        onClick={() => {
          if (visited) void query.refetch();
          setVisited(true);
          setOpened(true);
        }}
      >
        Prendre les présences
      </Btn>
      {opened && (
        <ParticipantDialog
          title="Feuille de présence"
          busy={change.isPending}
          onClose={() => setOpened(false)}
        >
          <p className="attendance-name">{name}</p>
          {query.isPending ? (
            <Loading label="Ouverture de la feuille de présence…" />
          ) : query.isError ? (
            <ErrorBox
              message={getError(query.error)}
              retry={() => query.refetch()}
            />
          ) : view?.installed === false ? (
            <p className="participant-notice">
              La prise de présences sera disponible après la mise à jour de la
              base de données par l’administrateur.
            </p>
          ) : !view?.enabled ? (
            <>
              <p>
                Activez une feuille pour cette séance. Les participants
                confirmeront avec le même QR code ou code d’accès, sans créer de
                compte.
              </p>
              {view?.role === "students" && (
                <label className="attendance-option">
                  <input
                    type="checkbox"
                    checked={collectNumber}
                    onChange={(e) => setCollectNumber(e.target.checked)}
                  />
                  Recueillir aussi le matricule
                </label>
              )}
              {view?.sourceFinished && (
                <p>
                  La séance est terminée : vous pourrez renseigner cette feuille
                  manuellement.
                </p>
              )}
              <Btn
                disabled={change.isPending}
                onClick={() =>
                  change.mutate({
                    data: { collectStudentNumber: collectNumber },
                  })
                }
              >
                {change.isPending
                  ? "Activation…"
                  : view?.sourceFinished
                    ? "Créer la feuille de présence"
                    : "Activer la prise de présences"}
              </Btn>
            </>
          ) : (
            <>
              <p>
                {asynchronous
                  ? "Cette feuille confirme une participation asynchrone, sans attester une présence en classe."
                  : "Les participants déclarent leur présence. Vous pouvez vérifier et corriger chaque statut."}{" "}
                Les réponses et les points restent indépendants.
              </p>
              <div className="attendance-tools">
                <span
                  className="status"
                  data-tone={register?.open ? "running" : "neutral"}
                >
                  {register?.open
                    ? "Confirmations ouvertes"
                    : "Confirmations terminées"}
                </span>
                <Btn
                  kind="outline"
                  disabled={!entries.length}
                  onClick={exportCSV}
                >
                  <Download size={16} />
                  Exporter la feuille CSV
                </Btn>
              </div>
              {!entries.length &&
                register?.open &&
                view.role === "students" && (
                  <label className="attendance-option">
                    <input
                      type="checkbox"
                      checked={register.collectStudentNumber}
                      disabled={change.isPending}
                      onChange={(e) =>
                        change.mutate({
                          data: { collectStudentNumber: e.target.checked },
                        })
                      }
                    />
                    Recueillir aussi le matricule (modifiable avant l’ajout de
                    participants)
                  </label>
                )}
              <div className="attendance-counts">
                {(
                  [
                    "present",
                    "late",
                    "unconfirmed",
                    "absent",
                    "excused",
                  ] as const
                ).map((status) => (
                  <div key={status}>
                    <strong>{summary?.[status] ?? 0}</strong>
                    <span>
                      {asynchronous && status === "present"
                        ? "Participation confirmée"
                        : labels[status]}
                    </span>
                  </div>
                ))}
              </div>
              <details className="attendance-roster">
                <summary>Ajouter une liste de personnes attendues</summary>
                <form onSubmit={addRoster}>
                  <label className="field">
                    <span>Liste des participants attendus</span>
                    <textarea
                      value={roster}
                      onChange={(e) => setRoster(e.target.value)}
                      rows={5}
                      placeholder={
                        register?.collectStudentNumber
                          ? "Marie Tremblay ; 001234\nAlex Gagnon ; 001235"
                          : "Marie Tremblay\nAlex Gagnon"
                      }
                    />
                  </label>
                  <p>
                    Une personne par ligne
                    {register?.collectStudentNumber
                      ? ", avec son matricule après un point-virgule si vous l’avez"
                      : ""}
                    . Les doublons sont ignorés. Les personnes restent « À
                    confirmer » tant qu’aucun statut n’est renseigné.
                  </p>
                  <Btn
                    type="submit"
                    kind="outline"
                    disabled={change.isPending || !roster.trim()}
                  >
                    Ajouter à la feuille
                  </Btn>
                </form>
              </details>
              {entries.length > 0 ? (
                <>
                  <div className="attendance-filters">
                    <Input
                      label="Rechercher dans la feuille"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Nom ou matricule"
                    />
                    <label className="field">
                      <span>Filtrer les présences</span>
                      <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      >
                        <option value="all">Tous les statuts</option>
                        {Object.entries(labels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <ul
                    className="attendance-list"
                    aria-label="Présences des participants"
                  >
                    {entries
                      .filter(
                        (entry) =>
                          (filter === "all" || entry.status === filter) &&
                          `${entry.fullName} ${entry.studentNumber ?? ""}`
                            .toLocaleLowerCase("fr-CA")
                            .includes(search.toLocaleLowerCase("fr-CA")),
                      )
                      .sort((a, b) =>
                        a.fullName.localeCompare(b.fullName, "fr-CA"),
                      )
                      .map((entry) => (
                        <li key={entry.id}>
                          <div className="attendance-identity">
                            <strong>{entry.fullName}</strong>
                            {register?.collectStudentNumber && (
                              <span>
                                Matricule :{" "}
                                {entry.studentNumber || "Non renseigné"}
                              </span>
                            )}
                            <small>
                              {entry.confirmedAt
                                ? `Déclaration le ${date(entry.confirmedAt)}`
                                : "Aucune confirmation participante"}
                              {entry.teacherMarkedAt
                                ? ` · Statut corrigé le ${date(entry.teacherMarkedAt)}`
                                : ""}
                            </small>
                          </div>
                          <label className="field attendance-status">
                            <span>Statut de {entry.fullName}</span>
                            <select
                              aria-label={`Statut de ${entry.fullName}`}
                              value={entry.status}
                              disabled={change.isPending}
                              onChange={(e) =>
                                change.mutate({
                                  suffix: `/entries/${entry.id}`,
                                  data: {
                                    status: e.target.value,
                                    expectedRevision: entry.revision,
                                  },
                                })
                              }
                            >
                              {Object.entries(labels).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </label>
                          {entry.canDelete && (
                            <button
                              type="button"
                              className="attendance-delete"
                              disabled={change.isPending}
                              aria-label={`Retirer ${entry.fullName} de la liste attendue`}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Retirer ${entry.fullName} de la liste attendue ?`,
                                  )
                                )
                                  change.mutate({
                                    suffix: `/entries/${entry.id}/delete`,
                                    data: { expectedRevision: entry.revision },
                                  });
                              }}
                            >
                              <Trash2 size={17} />
                            </button>
                          )}
                        </li>
                      ))}
                  </ul>
                </>
              ) : (
                <p className="attendance-empty">
                  La feuille est prête. Les confirmations apparaîtront ici, même
                  avant la transmission des réponses. Vous pouvez aussi ajouter
                  une liste attendue.
                </p>
              )}
              <div className="attendance-footer">
                {register?.open ? (
                  <Btn
                    kind="outline"
                    disabled={change.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Terminer les confirmations de présence ? Les réponses au questionnaire restent disponibles selon le déroulement de la séance.",
                        )
                      )
                        change.mutate({ suffix: "/close" });
                    }}
                  >
                    Terminer les confirmations
                  </Btn>
                ) : !view?.sourceFinished ? (
                  <Btn
                    kind="outline"
                    disabled={change.isPending}
                    onClick={() => change.mutate({})}
                  >
                    Rouvrir les confirmations
                  </Btn>
                ) : null}
                <small>
                  « À confirmer » ne signifie pas « absent ». Vous renseignez
                  les absences explicitement.
                </small>
              </div>
            </>
          )}
          {(localError || change.isError) && (
            <p className="form-error" role="alert">
              {localError || getError(change.error)}
            </p>
          )}
        </ParticipantDialog>
      )}
    </section>
  );
}

export function ParticipantAttendance({ scopeKey }: { scopeKey: string }) {
  const [fullName, setFullName] = useState<string | null>(null),
    [number, setNumber] = useState<string | null>(null),
    cache = useQueryClient(),
    key = ["participant-attendance", scopeKey];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api<AttendanceView>("/api/participant/attendance"),
    retry: false,
    refetchInterval: (q) => poll(q.state.data),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const confirm = useMutation({
    onMutate: () => cache.cancelQueries({ queryKey: key }),
    mutationFn: () =>
      api<AttendanceView>("/api/participant/attendance", "POST", {
        fullName: fullName ?? query.data?.own?.fullName ?? "",
        studentNumber: number ?? query.data?.own?.studentNumber ?? undefined,
      }),
    onSuccess: (data) => cache.setQueryData(key, data),
    onError: (error: any) => {
      if (error.status === 409) void query.refetch();
    },
  });
  const view = query.data,
    own = view?.own,
    asynchronous = view?.deliveryMode === "asynchronous",
    recorded = own && own.status !== "unconfirmed";
  if (!view?.enabled || !view.register) return null;
  return (
    <section
      className={`attendance-participant${recorded ? " recorded" : ""}`}
      aria-label={
        asynchronous
          ? "Votre participation à la séance"
          : "Votre présence à la séance"
      }
    >
      <div className="attendance-participant-heading">
        <CheckCircle2 size={21} aria-hidden="true" />
        <h2>{asynchronous ? "Votre participation" : "Votre présence"}</h2>
      </div>
      {recorded ? (
        <>
          <p>
            <strong>{own.fullName}</strong> ·{" "}
            {asynchronous && own.status === "present"
              ? "Participation confirmée"
              : labels[own.status]}
          </p>
          <small>
            {own.teacherMarkedAt
              ? `Statut renseigné par le professeur le ${date(own.teacherMarkedAt)}`
              : `Confirmation enregistrée le ${date(own.confirmedAt)}`}
          </small>
          {["absent", "excused"].includes(own.status) && (
            <p>Pour faire corriger ce statut, adressez-vous au professeur.</p>
          )}
        </>
      ) : view.register.open ? (
        <>
          <p>
            {asynchronous
              ? "Confirmez votre participation à cette séance."
              : "Confirmez votre présence à cette séance."}{" "}
            Votre nom sera visible seulement par le professeur. Cette
            confirmation est indépendante de vos réponses et de votre note.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              confirm.mutate();
            }}
          >
            <Input
              label="Nom et prénom pour la feuille de présence"
              value={fullName ?? own?.fullName ?? ""}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={160}
              autoComplete="name"
              required
            />
            {view.register.collectStudentNumber && (
              <Input
                label="Matricule"
                value={number ?? own?.studentNumber ?? ""}
                onChange={(e) => setNumber(e.target.value)}
                maxLength={80}
                autoComplete="off"
                required
              />
            )}
            <Btn type="submit" disabled={confirm.isPending}>
              {confirm.isPending
                ? "Confirmation…"
                : asynchronous
                  ? "Confirmer ma participation"
                  : "Confirmer ma présence"}
            </Btn>
          </form>
        </>
      ) : (
        <p>
          Les confirmations sont terminées. Le professeur peut renseigner ou
          corriger votre statut.
        </p>
      )}
      {confirm.isError && (
        <p className="form-error" role="alert">
          {getError(confirm.error)}
        </p>
      )}
    </section>
  );
}
