ALTER TABLE github."pull_request"
DROP COLUMN IF EXISTS priority_reason;

ALTER TABLE github."pull_request"
DROP COLUMN IF EXISTS priority;
