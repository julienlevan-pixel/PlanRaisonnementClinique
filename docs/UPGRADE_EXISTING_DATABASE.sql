-- Mise à jour additive d’une base PRC déjà installée.
-- Aucun mot de passe, compte ou contenu existant n’est modifié.
BEGIN;
SELECT pg_advisory_xact_lock(742619034);
DO $prc_upgrade$
BEGIN
  IF to_regclass('prc_private.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'Installer le schema initial et son historique de migrations avant cette mise a jour.';
  END IF;
  IF NOT EXISTS (SELECT FROM prc_private.schema_migrations WHERE filename='002_workflow.sql') THEN
ALTER TABLE prc_private.prcs
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE prc_private.launches
  ADD COLUMN IF NOT EXISTS is_trial boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aggregate_snapshot jsonb;

ALTER TABLE prc_private.responses
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;

ALTER TABLE prc_private.participants
  ADD COLUMN IF NOT EXISTS join_key_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS participants_join_resume_unique
  ON prc_private.participants(launch_id, join_key_hash) WHERE join_key_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS prcs_owner_archive_updated_idx
  ON prc_private.prcs(owner_id, archived_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS launches_prc_version_idx
  ON prc_private.launches(prc_id, case_version, created_at DESC);
INSERT INTO prc_private.schema_migrations(filename) VALUES ('002_workflow.sql');
END IF;
  IF NOT EXISTS (SELECT FROM prc_private.schema_migrations WHERE filename='003_demo.sql') THEN
CREATE TABLE IF NOT EXISTS prc_private.demo_installations (
  owner_id uuid PRIMARY KEY REFERENCES prc_private.users(id),
  prc_id uuid NOT NULL UNIQUE REFERENCES prc_private.prcs(id),
  panel_launch_id uuid REFERENCES prc_private.launches(id),
  student_launch_id uuid REFERENCES prc_private.launches(id),
  fixture_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('building', 'pending', 'complete', 'failed')),
  lease_token uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON prc_private.demo_installations FROM PUBLIC;
REVOKE ALL ON prc_private.demo_installations FROM anon;
REVOKE ALL ON prc_private.demo_installations FROM authenticated;
INSERT INTO prc_private.schema_migrations(filename) VALUES ('003_demo.sql');
END IF;
END;
$prc_upgrade$;
COMMIT;
SELECT filename FROM prc_private.schema_migrations ORDER BY filename;
