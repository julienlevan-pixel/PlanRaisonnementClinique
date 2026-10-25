import { pool } from "@workspace/db";
import { createTeacherSession, hashToken } from "../security.js";
import { handleApiRequest } from "../handler.js";
import { ensureTeacherDemo } from "../demo.js";

async function main() {
  const connection = new URL(process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL ?? "");
  if (connection.hostname && !["localhost", "127.0.0.1", "[::1]"].includes(connection.hostname) && process.env.PRC_DEMO_ALLOW_REMOTE !== "1") {
    throw new Error("Pour une base distante, utiliser le bouton de démonstration de l’application ou confirmer explicitement PRC_DEMO_ALLOW_REMOTE=1.");
  }
  const username = process.env.PRC_DEMO_OWNER_USERNAME?.trim();
  if (!username) throw new Error("PRC_DEMO_OWNER_USERNAME est requis ; aucun compte n’est créé par cette commande.");
  const found = await pool.query<{ id: string; active: boolean; must_change_password: boolean }>(
    "SELECT id, active, must_change_password FROM prc_private.users WHERE lower(username) = lower($1)", [username],
  );
  const owner = found.rows[0];
  if (!owner || !owner.active || owner.must_change_password) throw new Error("Choisir un enseignant actif ayant déjà changé son mot de passe initial.");
  const session = await createTeacherSession(owner.id);
  try {
    const origin = process.env.APP_BASE_URL ?? "http://localhost:5173";
    let pending = true;
    for (let attempts = 0; pending && attempts < 20; attempts++) {
      const result = await ensureTeacherDemo(new Request(new URL("/api/demo", origin), { method: "POST", headers: { cookie: session.cookie.split(";")[0], origin } }), handleApiRequest);
      pending = result.pending;
    }
    if (pending) throw new Error("La démonstration est encore en préparation ; relancer cette même commande pour continuer.");
    process.stdout.write("Démonstration Toux préparée pour le compte choisi ; aucune activité réelle n’a été modifiée.\n");
  } finally {
    await pool.query("DELETE FROM prc_private.sessions WHERE token_hash = $1", [hashToken(session.rawToken)]);
  }
}

main().catch(error => {
  process.stderr.write(`Initialisation de démonstration interrompue : ${error instanceof Error ? error.message : "erreur inconnue"}\n`);
  process.exitCode = 1;
}).finally(() => pool.end());
