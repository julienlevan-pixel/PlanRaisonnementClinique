BEGIN;

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

COMMIT;
