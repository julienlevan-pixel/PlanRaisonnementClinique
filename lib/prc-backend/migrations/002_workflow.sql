BEGIN;

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

COMMIT;
