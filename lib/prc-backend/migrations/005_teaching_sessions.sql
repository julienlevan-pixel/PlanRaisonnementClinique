BEGIN;

CREATE TABLE IF NOT EXISTS prc_private.teaching_sessions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES prc_private.users(id),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('panel','students')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','finished')),
  current_position integer NOT NULL DEFAULT 0 CHECK (current_position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  archived_at timestamptz
);
CREATE INDEX IF NOT EXISTS teaching_sessions_owner_idx ON prc_private.teaching_sessions(owner_id,created_at DESC);
CREATE TABLE IF NOT EXISTS prc_private.teaching_session_cases (
  session_id uuid NOT NULL REFERENCES prc_private.teaching_sessions(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 0),
  launch_id uuid NOT NULL UNIQUE REFERENCES prc_private.launches(id),
  PRIMARY KEY(session_id,position)
);
CREATE TABLE IF NOT EXISTS prc_private.teaching_members (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES prc_private.teaching_sessions(id) ON DELETE CASCADE,
  pseudonym text NOT NULL,
  join_key_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id,join_key_hash)
);
ALTER TABLE prc_private.participants ADD COLUMN IF NOT EXISTS teaching_member_id uuid REFERENCES prc_private.teaching_members(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS teaching_member_case_unique ON prc_private.participants(teaching_member_id,launch_id) WHERE teaching_member_id IS NOT NULL;
ALTER TABLE prc_private.sessions ADD COLUMN IF NOT EXISTS teaching_member_id uuid REFERENCES prc_private.teaching_members(id) ON DELETE CASCADE;
ALTER TABLE prc_private.sessions DROP CONSTRAINT IF EXISTS sessions_check;
ALTER TABLE prc_private.sessions DROP CONSTRAINT IF EXISTS sessions_identity_check;
ALTER TABLE prc_private.sessions ADD CONSTRAINT sessions_identity_check CHECK (
  (user_id IS NOT NULL)::integer + (participant_id IS NOT NULL)::integer + (teaching_member_id IS NOT NULL)::integer = 1
);
CREATE OR REPLACE FUNCTION prc_private.can_manage_teaching_session(target uuid, actor uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM prc_private.teaching_sessions s WHERE s.id=target AND s.owner_id=actor)
    AND NOT EXISTS(SELECT 1 FROM prc_private.teaching_session_cases c JOIN prc_private.launches l ON l.id=c.launch_id
      WHERE c.session_id=target AND NOT prc_private.can_access_prc(l.prc_id,actor,true));
$$;
CREATE OR REPLACE FUNCTION prc_private.can_manage_launch(target uuid, actor uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM prc_private.launches l WHERE l.id=target
    AND prc_private.can_access_prc(l.prc_id,actor,true)
    AND (NOT EXISTS(SELECT 1 FROM prc_private.teaching_session_cases c WHERE c.launch_id=l.id)
      OR EXISTS(SELECT 1 FROM prc_private.teaching_session_cases c WHERE c.launch_id=l.id AND prc_private.can_manage_teaching_session(c.session_id,actor))));
$$;
REVOKE ALL ON prc_private.teaching_sessions,prc_private.teaching_session_cases,prc_private.teaching_members FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION prc_private.can_manage_teaching_session(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION prc_private.can_manage_launch(uuid,uuid) FROM PUBLIC,anon,authenticated;

COMMIT;
