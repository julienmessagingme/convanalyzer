-- 007_drop_dead_columns.sql
-- Remove unused columns from messages table

ALTER TABLE messages DROP COLUMN IF EXISTS failure_signal;
ALTER TABLE messages DROP COLUMN IF EXISTS failure_score;
ALTER TABLE messages DROP COLUMN IF EXISTS failure_reason;
ALTER TABLE messages DROP COLUMN IF EXISTS prompt_version;
