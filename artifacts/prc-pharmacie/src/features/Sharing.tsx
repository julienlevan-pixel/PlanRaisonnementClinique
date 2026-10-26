import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../app/api";
import { Btn, ErrorBox, Input, Loading } from "../app/ui";
import { getError } from "../app/utils";
import { getGetWorkspaceSummaryQueryKey } from "@workspace/api-client-react";
import "./sharing.css";

type Member = {
  id: string;
  username: string;
  active: boolean;
  manageSessions: boolean;
};
type SharingData = {
  owner: { id: string; username: string };
  canShare: boolean;
  collaborators: Member[];
};
export function Sharing({ prcId }: { prcId: string }) {
  const cache = useQueryClient();
  const [username, setUsername] = useState("");
  const [manageSessions, setManageSessions] = useState(false);
  const [message, setMessage] = useState("");
  const access = useQuery({
    queryKey: ["prc-sharing", prcId],
    queryFn: () => api<SharingData>(`/api/prcs/${prcId}/collaborators`),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (command: {
      kind: "add" | "remove";
      username?: string;
      manageSessions?: boolean;
      id?: string;
    }) =>
      command.kind === "remove"
        ? api(`/api/prcs/${prcId}/collaborators/${command.id}`, "DELETE")
        : api(`/api/prcs/${prcId}/collaborators`, "POST", {
            username: command.username,
            manageSessions: command.manageSessions,
          }),
    onSuccess: async (_, command) => {
      if (command.kind === "add") setUsername("");
      setMessage(
        command.kind === "remove"
          ? "Accès retiré."
          : "Partage enregistré. Le professeur retrouve ce même cas dans « Mes PRC ».",
      );
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["prc-sharing", prcId] }),
        cache.invalidateQueries({ queryKey: ["editor", prcId] }),
        cache.invalidateQueries({ queryKey: ["library"] }),
        cache.invalidateQueries({ queryKey: getGetWorkspaceSummaryQueryKey() }),
      ]);
    },
  });
  return (
    <section
      className="panel-card prc-sharing"
      aria-label="Collaboration sur ce PRC"
    >
      <h2>Collaborer sur ce PRC</h2>
      <p>
        Un même cas, modifiable par les professeurs autorisés. Les séances déjà
        lancées conservent leur version clinique.
      </p>
      {access.isPending ? (
        <Loading />
      ) : access.isError ? (
        <ErrorBox
          message={getError(access.error)}
          retry={() => access.refetch()}
        />
      ) : (
        <>
          <p>
            Propriétaire : <b>{access.data.owner.username}</b>
          </p>
          {access.data.collaborators.length ? (
            <ul className="collaborator-list">
              {access.data.collaborators.map((member) => (
                <li key={member.id}>
                  <div>
                    <b>{member.username}</b>
                    <span>
                      {member.active
                        ? "Peut modifier le contenu"
                        : "Compte désactivé"}
                      {member.manageSessions
                        ? " · Gère aussi les panels, groupes et copies"
                        : ""}
                    </span>
                  </div>
                  {access.data.canShare && (
                    <div className="collaborator-actions">
                      <label>
                        <input
                          type="checkbox"
                          aria-label={`Autoriser la gestion des séances pour ${member.username}`}
                          checked={member.manageSessions}
                          disabled={mutation.isPending}
                          onChange={(event) =>
                            mutation.mutate({
                              kind: "add",
                              username: member.username,
                              manageSessions: event.target.checked,
                            })
                          }
                        />
                        Gestion des séances
                      </label>
                      <Btn
                        kind="quiet"
                        disabled={mutation.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Retirer l’accès de ${member.username} à ce PRC ?`,
                            )
                          )
                            mutation.mutate({ kind: "remove", id: member.id });
                        }}
                      >
                        Retirer l’accès de {member.username}
                      </Btn>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="intro-copy">Ce PRC n’est pas encore partagé.</p>
          )}
          {access.data.canShare ? (
            <form
              className="sharing-form"
              onSubmit={(event) => {
                event.preventDefault();
                setMessage("");
                mutation.mutate({
                  kind: "add",
                  username: username.trim(),
                  manageSessions,
                });
              }}
            >
              <Input
                label="Identifiant PRC du professeur"
                value={username}
                maxLength={80}
                required
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Ex. marie_dupont"
              />
              <p className="field-hint">
                Le collègue doit déjà disposer d’un compte enseignant PRC.
              </p>
              <label className="sharing-session-option">
                <input
                  type="checkbox"
                  checked={manageSessions}
                  disabled={mutation.isPending}
                  onChange={(event) => setManageSessions(event.target.checked)}
                />
                Autoriser aussi la gestion des panels, groupes et copies
                étudiantes
              </label>
              <Btn
                type="submit"
                disabled={mutation.isPending || !username.trim()}
              >
                Partager ce PRC
              </Btn>
            </form>
          ) : (
            <p className="field-hint">
              Le propriétaire gère les accès. Vous travaillez sur le même
              contenu et les mêmes versions.
            </p>
          )}
        </>
      )}
      {mutation.isError && (
        <p className="form-error" role="alert">
          {getError(mutation.error)}
        </p>
      )}
      {message && (
        <p role="status" className="sharing-success">
          {message}
        </p>
      )}
    </section>
  );
}
