-- Partage des PRC : mise à jour additive d’une base installée (001, 002, 003).
-- À exécuter une fois dans Supabase SQL Editor avant le déploiement de cette branche.
-- Aucun compte, cas, corrigé ou réponse existant n’est remplacé.
BEGIN;
SELECT pg_advisory_xact_lock(742619034);
CREATE TABLE IF NOT EXISTS prc_private.prc_collaborators (
  prc_id uuid NOT NULL REFERENCES prc_private.prcs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES prc_private.users(id) ON DELETE CASCADE,
  can_manage_sessions boolean NOT NULL DEFAULT false,
  added_by uuid NOT NULL REFERENCES prc_private.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (prc_id, user_id)
);
CREATE INDEX IF NOT EXISTS prc_collaborators_user_idx ON prc_private.prc_collaborators(user_id, prc_id);

CREATE OR REPLACE FUNCTION prc_private.can_access_prc(target uuid, actor uuid, sessions boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM prc_private.prcs p WHERE p.id = target AND (
      p.owner_id = actor OR EXISTS (
        SELECT 1 FROM prc_private.prc_collaborators c
        WHERE c.prc_id = p.id AND c.user_id = actor AND (NOT sessions OR c.can_manage_sessions)
      )
    )
  );
$$;
DO $upgrade$ BEGIN
  IF to_regclass('prc_private.teaching_sessions') IS NULL THEN
    EXECUTE $function$CREATE OR REPLACE FUNCTION prc_private.can_manage_launch(target uuid, actor uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM prc_private.launches l
    WHERE l.id = target AND prc_private.can_access_prc(l.prc_id, actor, true));
$$;$function$;
  END IF;
END $upgrade$;

REVOKE ALL ON prc_private.prc_collaborators FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION prc_private.can_access_prc(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION prc_private.can_manage_launch(uuid, uuid) FROM PUBLIC, anon, authenticated;
INSERT INTO prc_private.schema_migrations(filename) VALUES('004_collaboration.sql') ON CONFLICT(filename) DO NOTHING;
COMMIT;
