BEGIN;
ALTER TABLE prc_private.teaching_sessions ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'synchronous' CHECK (delivery_mode IN ('synchronous','asynchronous'));
ALTER TABLE prc_private.teaching_sessions DROP CONSTRAINT IF EXISTS teaching_async_students_check;
ALTER TABLE prc_private.teaching_sessions ADD CONSTRAINT teaching_async_students_check CHECK (delivery_mode='synchronous' OR role='students');
ALTER TABLE prc_private.teaching_members ADD COLUMN IF NOT EXISTS current_position integer NOT NULL DEFAULT 0 CHECK (current_position>=0);
ALTER TABLE prc_private.teaching_members ADD COLUMN IF NOT EXISTS finished_at timestamptz;
COMMIT;
