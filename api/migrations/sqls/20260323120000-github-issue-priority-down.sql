ALTER TABLE github."issue"
DROP COLUMN IF EXISTS priority_reason;

ALTER TABLE github."issue"
DROP COLUMN IF EXISTS priority;
