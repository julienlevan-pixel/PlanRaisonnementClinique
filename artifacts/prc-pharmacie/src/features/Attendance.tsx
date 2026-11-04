import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, Download } from "lucide-react";
import { api } from "../app/api";
import { Btn, Input, ErrorBox, Loading } from "../app/ui";
import { getError } from "../app/utils";
import { ParticipantDialog } from "./ParticipantExperience";
import {
  attendanceDate,
  attendanceTime,
  attendanceTimeZone,
  attendanceWorkbook,
  type AttendanceEntry,
} from "./attendance-export";
import "./attendance.css";

type AttendanceView = {
  available: boolean;
  finished: boolean;
  endedAt: string | null;
  entries?: AttendanceEntry[];
  count?: number;
  own?: AttendanceEntry | null;
};
const poll = (data?: AttendanceView) =>
  navigator.onLine &&
  document.visibilityState === "visible" &&
  data?.available !== false &&
  !data?.finished
    ? 15000
    : false;
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-CA");

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
    [search, setSearch] = useState(""),
    [exporting, setExporting] = useState(false),
    [exportError, setExportError] = useState("");
  const query = useQuery({
    queryKey: ["attendance", kind, id],
    queryFn: () => api<AttendanceView>(`/api/attendance/${kind}/${id}`),
    enabled: visited,
    retry: false,
    refetchInterval: (q) => (opened ? poll(q.state.data) : false),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const view = query.data,
    entries = view?.entries ?? [],
    timeZone = attendanceTimeZone();
  const filtered = entries.filter((entry) =>
    normalize(entry.fullName).includes(normalize(search.trim())),
  );
  const exportExcel = async () => {
    setExporting(true);
    setExportError("");
    try {
      // Export a fresh full list, even when the displayed list is filtered.
      const latest = await query.refetch();
      if (latest.error || !latest.data?.available)
        throw (
          latest.error ??
          new Error("La liste des présences n’est plus disponible.")
        );
      const buffer = await attendanceWorkbook(
        name,
        latest.data.entries ?? [],
        timeZone,
      );
      const url = URL.createObjectURL(
        new Blob([buffer], { type: "application/vnd.ms-excel" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `presences-${normalize(name)
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 70)}.xls`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setExportError(getError(error));
    } finally {
      setExporting(false);
    }
  };
  if (view?.available === false) return null;
  return (
    <section className="attendance-access" aria-label="Présences étudiantes">
      <div>
        <ClipboardCheck size={20} aria-hidden="true" />
        <span>
          <strong>Présences étudiantes</strong>
          <small>
            Inscription automatique pendant la séance synchrone
            {view ? ` · ${view.count ?? 0} étudiant(s)` : ""}
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
        Voir les présences
      </Btn>
      {opened && (
        <ParticipantDialog
          title="Présences étudiantes"
          busy={exporting}
          onClose={() => setOpened(false)}
        >
          <p className="attendance-name">{name}</p>
          {query.isPending ? (
            <Loading label="Chargement des présences…" />
          ) : query.isError ? (
            <ErrorBox
              message={getError(query.error)}
              retry={() => query.refetch()}
            />
          ) : (
            <>
              <p className="attendance-explanation">
                Les étudiants sont considérés présents dès qu’ils rejoignent la
                séance active. L’heure correspond à leur première inscription ;
                une reconnexion ne la modifie pas.
              </p>
              <div className="attendance-tools">
                <div>
                  <strong>{view?.count ?? 0} étudiant(s) présent(s)</strong>
                  <small>
                    {view?.finished
                      ? "Inscriptions terminées · liste conservée"
                      : "Séance active · mise à jour automatique"}
                  </small>
                </div>
                <Btn
                  kind="outline"
                  disabled={!entries.length || exporting}
                  onClick={() => void exportExcel()}
                >
                  <Download size={16} />
                  {exporting
                    ? "Préparation du fichier…"
                    : "Exporter en Excel (.xls)"}
                </Btn>
              </div>
              {view?.finished && (
                <p className="participant-notice">
                  La liste est arrêtée à la fin des inscriptions. Revenir
                  consulter une copie ou un bilan ne crée pas une nouvelle
                  présence.
                </p>
              )}
              <p className="attendance-timezone">Heure locale : {timeZone}</p>
              {entries.length ? (
                <>
                  <Input
                    label="Rechercher un étudiant"
                    placeholder="Nom et prénom"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {filtered.length ? (
                    <ul
                      className="attendance-list"
                      aria-label="Étudiants présents"
                    >
                      {filtered.map((entry) => (
                        <li key={entry.id}>
                          <strong>{entry.fullName}</strong>
                          <span>
                            <time dateTime={entry.joinedAt}>
                              {attendanceDate(entry.joinedAt, timeZone)} ·{" "}
                              {attendanceTime(entry.joinedAt, timeZone)}
                            </time>
                            <small>Première inscription</small>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="attendance-empty">
                      Aucun étudiant ne correspond à votre recherche.
                    </p>
                  )}
                </>
              ) : (
                <p className="attendance-empty">
                  {view?.finished
                    ? "Aucun étudiant n’a rejoint cette séance pendant son ouverture."
                    : "Aucun étudiant n’a encore rejoint cette séance. La liste se remplira automatiquement à leur entrée."}
                </p>
              )}
              <p className="attendance-footer">
                Liste nominative réservée au professeur. La présence est
                indépendante des réponses transmises et des notes.
              </p>
            </>
          )}
          {exportError && (
            <p className="form-error" role="alert">
              {exportError}
            </p>
          )}
        </ParticipantDialog>
      )}
    </section>
  );
}

export function ParticipantAttendance({
  scopeKey,
  eligible = true,
}: {
  scopeKey: string;
  eligible?: boolean;
}) {
  const query = useQuery({
    queryKey: ["participant-attendance", scopeKey],
    enabled: eligible,
    queryFn: () => api<AttendanceView>("/api/participant/attendance"),
    retry: false,
    refetchOnWindowFocus: true,
  });
  const view = query.data,
    own = view?.own,
    timeZone = attendanceTimeZone();
  if (!eligible || !view?.available || !own) return null;
  return (
    <section
      className="attendance-participant"
      aria-label="Votre présence à la séance"
    >
      <CheckCircle2 size={21} aria-hidden="true" />
      <div>
        <strong>Présence enregistrée</strong>
        <p>
          {own.fullName} · Inscription le{" "}
          <time dateTime={own.joinedAt}>
            {attendanceDate(own.joinedAt, timeZone)} à{" "}
            {attendanceTime(own.joinedAt, timeZone)}
          </time>
        </p>
        <small>
          Votre entrée pendant la séance suffit. Aucune confirmation à
          effectuer.
        </small>
      </div>
    </section>
  );
}
