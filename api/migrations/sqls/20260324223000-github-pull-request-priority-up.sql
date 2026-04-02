ALTER TABLE github."pull_request"
ADD COLUMN IF NOT EXISTS priority text;

ALTER TABLE github."pull_request"
ADD COLUMN IF NOT EXISTS priority_reason text;
