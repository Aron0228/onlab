ALTER TABLE github."issue"
ADD COLUMN IF NOT EXISTS status text;

UPDATE github."issue"
SET status = 'open'
WHERE status IS NULL;

ALTER TABLE github."issue"
ALTER COLUMN status SET NOT NULL;

ALTER TABLE github."pull_request"
ADD COLUMN IF NOT EXISTS status text;

UPDATE github."pull_request"
SET status = 'open'
WHERE status IS NULL;

ALTER TABLE github."pull_request"
ALTER COLUMN status SET NOT NULL;
