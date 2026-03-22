ALTER TABLE github."pull_request"
DROP COLUMN IF EXISTS status;

ALTER TABLE github."issue"
DROP COLUMN IF EXISTS status;
