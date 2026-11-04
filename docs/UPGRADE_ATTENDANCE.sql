-- Historique de la migration 007 : inutile pour la liste automatique des présences synchrones.
-- Voir PRESENCES.md ; conservé uniquement pour les anciennes installations.
-- Anciennes présences manuelles : script compatible avec les migrations 001 à 006.
-- Ajoute uniquement des tables privées ; les comptes, cas, réponses et points sont conservés.
BEGIN;
SELECT pg_advisory_xact_lock(742619034);

CREATE TABLE IF NOT EXISTS prc_private.attendance_registers (
  id uuid PRIMARY KEY,
  teaching_session_id uuid UNIQUE REFERENCES prc_private.teaching_sessions(id) ON DELETE CASCADE,
  launch_id uuid UNIQUE REFERENCES prc_private.launches(id) ON DELETE CASCADE,
  collect_student_number boolean NOT NULL DEFAULT false,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  CHECK (num_nonnulls(teaching_session_id,launch_id)=1)
);

CREATE TABLE IF NOT EXISTS prc_private.attendance_entries (
  id uuid PRIMARY KEY,
  register_id uuid NOT NULL REFERENCES prc_private.attendance_registers(id) ON DELETE CASCADE,
  teaching_member_id uuid REFERENCES prc_private.teaching_members(id) ON DELETE SET NULL,
  participant_id uuid REFERENCES prc_private.participants(id) ON DELETE SET NULL,
  full_name text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 1 AND 160),
  student_number text CHECK (student_number IS NULL OR length(student_number) BETWEEN 1 AND 80),
  status text NOT NULL DEFAULT 'unconfirmed' CHECK (status IN ('unconfirmed','present','late','absent','excused')),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  source text NOT NULL CHECK (source IN ('roster','participant')),
  confirmed_at timestamptz,
  teacher_marked_at timestamptz,
  recorded_by uuid REFERENCES prc_private.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(teaching_member_id,participant_id)<=1)
);
CREATE INDEX IF NOT EXISTS attendance_register_entries_idx ON prc_private.attendance_entries(register_id,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_member_unique ON prc_private.attendance_entries(register_id,teaching_member_id) WHERE teaching_member_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_participant_unique ON prc_private.attendance_entries(register_id,participant_id) WHERE participant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_number_unique ON prc_private.attendance_entries(register_id,lower(student_number)) WHERE student_number IS NOT NULL;

REVOKE ALL ON prc_private.attendance_registers,prc_private.attendance_entries FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS prc_private.schema_migrations (
  filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO prc_private.schema_migrations(filename) VALUES('007_attendance.sql') ON CONFLICT DO NOTHING;
COMMIT;

SELECT
  to_regclass('prc_private.attendance_registers') IS NOT NULL AS feuilles_presences_installees,
  to_regclass('prc_private.attendance_entries') IS NOT NULL AS confirmations_installees;
