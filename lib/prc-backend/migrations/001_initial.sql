BEGIN;

CREATE SCHEMA IF NOT EXISTS prc_private;
REVOKE ALL ON SCHEMA prc_private FROM PUBLIC;
REVOKE ALL ON SCHEMA prc_private FROM anon;
REVOKE ALL ON SCHEMA prc_private FROM authenticated;

CREATE TABLE IF NOT EXISTS prc_private.users (
  id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('admin', 'teacher')),
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique
  ON prc_private.users (lower(username));

CREATE TABLE IF NOT EXISTS prc_private.sessions (
  token_hash text PRIMARY KEY,
  user_id uuid REFERENCES prc_private.users(id) ON DELETE CASCADE,
  participant_id uuid,
  csrf_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((user_id IS NOT NULL)::integer + (participant_id IS NOT NULL)::integer = 1)
);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON prc_private.sessions(expires_at);

CREATE TABLE IF NOT EXISTS prc_private.login_attempts (
  id text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz
);

CREATE TABLE IF NOT EXISTS prc_private.prcs (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES prc_private.users(id),
  current_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prcs_owner_updated_idx ON prc_private.prcs(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS prc_private.prc_versions (
  prc_id uuid NOT NULL REFERENCES prc_private.prcs(id) ON DELETE CASCADE,
  version integer NOT NULL,
  name text NOT NULL DEFAULT '',
  scenario text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  diagnostics jsonb NOT NULL DEFAULT '[]'::jsonb,
  observations jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (prc_id, version)
);

CREATE TABLE IF NOT EXISTS prc_private.launches (
  id uuid PRIMARY KEY,
  prc_id uuid NOT NULL REFERENCES prc_private.prcs(id),
  owner_id uuid NOT NULL REFERENCES prc_private.users(id),
  role text NOT NULL CHECK (role IN ('panel', 'students')),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('open', 'closed', 'revealed', 'published')),
  case_version integer NOT NULL,
  case_snapshot jsonb NOT NULL,
  reference_id uuid,
  reveals jsonb NOT NULL DEFAULT '{"mainDiagnostic":false,"mainArguments":false,"alternativeDiagnostic":false,"alternativeArguments":false,"reference":false}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  published_at timestamptz
);
CREATE INDEX IF NOT EXISTS launches_owner_created_idx ON prc_private.launches(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS launches_code_idx ON prc_private.launches(code);

CREATE TABLE IF NOT EXISTS prc_private.invitations (
  id uuid PRIMARY KEY,
  launch_id uuid NOT NULL REFERENCES prc_private.launches(id) ON DELETE CASCADE,
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  used_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prc_private.participants (
  id uuid PRIMARY KEY,
  launch_id uuid NOT NULL REFERENCES prc_private.launches(id) ON DELETE CASCADE,
  pseudonym text NOT NULL,
  role text NOT NULL CHECK (role IN ('panel', 'students')),
  invitation_id uuid REFERENCES prc_private.invitations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (launch_id, id)
);
CREATE INDEX IF NOT EXISTS participants_launch_idx ON prc_private.participants(launch_id);

ALTER TABLE prc_private.sessions
  ADD CONSTRAINT sessions_participant_fk
  FOREIGN KEY (participant_id) REFERENCES prc_private.participants(id) ON DELETE CASCADE;

ALTER TABLE prc_private.invitations
  ADD CONSTRAINT invitations_used_by_fk
  FOREIGN KEY (used_by) REFERENCES prc_private.participants(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS prc_private.responses (
  participant_id uuid PRIMARY KEY REFERENCES prc_private.participants(id) ON DELETE CASCADE,
  launch_id uuid NOT NULL REFERENCES prc_private.launches(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('draft', 'submitted')),
  main_diagnostic_id text,
  alternative_diagnostic_id text,
  main_choices jsonb NOT NULL DEFAULT '[]'::jsonb,
  alternative_choices jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  score numeric(5,2),
  score_components jsonb,
  UNIQUE (launch_id, participant_id)
);
CREATE INDEX IF NOT EXISTS responses_launch_state_idx ON prc_private.responses(launch_id, state);

CREATE TABLE IF NOT EXISTS prc_private.references (
  id uuid PRIMARY KEY,
  launch_id uuid NOT NULL UNIQUE REFERENCES prc_private.launches(id),
  status text NOT NULL CHECK (status IN ('draft', 'validated')),
  minimum_panel_size integer NOT NULL CHECK (minimum_panel_size > 0),
  panel_size integer NOT NULL,
  explanation text NOT NULL DEFAULT '',
  source_submission_ids uuid[] NOT NULL,
  snapshot jsonb NOT NULL,
  scoring_version text NOT NULL DEFAULT 'v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  validated_at timestamptz
);
ALTER TABLE prc_private.launches
  ADD CONSTRAINT launches_reference_fk
  FOREIGN KEY (reference_id) REFERENCES prc_private.references(id);

REVOKE ALL ON ALL TABLES IN SCHEMA prc_private FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA prc_private FROM anon;
REVOKE ALL ON ALL TABLES IN SCHEMA prc_private FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA prc_private REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA prc_private REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA prc_private REVOKE ALL ON TABLES FROM authenticated;

COMMIT;
