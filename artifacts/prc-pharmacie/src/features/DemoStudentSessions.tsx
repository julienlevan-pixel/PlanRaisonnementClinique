import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, FlaskConical } from "lucide-react";
import { getGetWorkspaceSummaryQueryKey } from "@workspace/api-client-react";
import { api } from "../app/api";
import { Btn } from "../app/ui";
import { getError } from "../app/utils";
import type { PrcDetail } from "./library-model";
import "./demo-student-sessions.css";

type Mode = "synchronous" | "asynchronous";
type Session = { id: string; code: string; deliveryMode: Mode };

export function DemoStudentSessions({
  document,
  blocked,
}: {
  document: PrcDetail;
  blocked: boolean;
}) {
  const cache = useQueryClient();
  const ready =
    !document.archived && document.workflow?.referenceStatus === "validated";
  const start = useMutation({
    mutationFn: (deliveryMode: Mode) =>
      api<Session>(`/api/prcs/${document.id}/demo-session`, "POST", {
        deliveryMode,
      }),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["editor", document.id] }),
        cache.invalidateQueries({ queryKey: ["library"] }),
        cache.invalidateQueries({ queryKey: getGetWorkspaceSummaryQueryKey() }),
      ]);
    },
  });
  return (
    <section
      className="panel-card demo-student-sessions"
      aria-label="Essayer Toux avec des étudiants"
    >
      <div className="eyebrow">
        <FlaskConical size={16} /> DÉMONSTRATION — DONNÉES FICTIVES
      </div>
      <h2>Essayer Toux avec des étudiants</h2>
      <p>
        L’exemple initial comprend dix experts fictifs ayant répondu avec des
        notes de 1 à 3, un corrigé calculé et des copies étudiantes
        illustratives. Ouvrez une séance pour que vos étudiants répondent à leur
        tour, sans compte à créer.
      </p>
      {!ready && (
        <p>
          Un corrigé validé et un PRC actif sont nécessaires. Si vous avez
          modifié le cas, recueillez un nouveau panel pour cette version.
        </p>
      )}
      {blocked && (
        <p>Terminez l’enregistrement du cas avant d’ouvrir une séance.</p>
      )}
      {start.isError && (
        <p className="form-error" role="alert">
          {getError(start.error)}
        </p>
      )}
      <div className="demo-session-grid">
        {(["synchronous", "asynchronous"] as const).map((mode) => {
          const existing = document.launches?.find(
            (launch) =>
              launch.role === "students" &&
              launch.status === "open" &&
              launch.guidedReview &&
              launch.scoringVersion === "custom-rubric-v1" &&
              launch.grading?.rubricRevision ===
                (document.workflow?.rubricRevision ?? 1) &&
              launch.caseVersion === document.version &&
              launch.deliveryMode === mode &&
              launch.code,
          );
          const session = existing;
          return (
            <div className="demo-session-card" key={mode}>
              <h3>
                {mode === "synchronous"
                  ? "En séance synchrone"
                  : "En autonomie asynchrone"}
              </h3>
              <p>
                {mode === "synchronous"
                  ? "Les étudiants répondent. Vous fermez les réponses, puis affichez la comparaison et les corrigés une hypothèse à la fois."
                  : "Vous autorisez cette modalité. Après sa soumission, chaque étudiant voit ses réponses, le corrigé expert et son pointage."}
              </p>
              {session?.code && ready ? (
                <>
                  <p className="demo-session-code">
                    Code à partager : <strong>{session.code}</strong>
                  </p>
                  <a
                    className="btn btn-primary"
                    href={`/join/${encodeURIComponent(session.code)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Ouvrir le questionnaire étudiant <ArrowRight size={15} />
                  </a>
                  <Link
                    className="library-text-link"
                    href={`/activity/${session.id}`}
                  >
                    Gérer la séance et afficher le QR code
                  </Link>
                </>
              ) : (
                <Btn
                  kind={mode === "synchronous" ? "primary" : "outline"}
                  disabled={!ready || blocked || start.isPending}
                  onClick={() => start.mutate(mode)}
                >
                  {start.isPending && start.variables === mode
                    ? "Préparation…"
                    : mode === "synchronous"
                      ? "Ouvrir la séance synchrone"
                      : "Autoriser la séance asynchrone"}
                </Btn>
              )}
            </div>
          );
        })}
      </div>
      <small>
        Les deux codes sont distincts. Une séance ouverte est réutilisée ; si
        elle est terminée, une nouvelle séance peut être ouverte. Le corrigé
        expert reste le même.
      </small>
    </section>
  );
}
