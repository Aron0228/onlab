ALTER TABLE github."issue"
ADD COLUMN IF NOT EXISTS priority text;

ALTER TABLE github."issue"
ADD COLUMN IF NOT EXISTS priority_reason text;
