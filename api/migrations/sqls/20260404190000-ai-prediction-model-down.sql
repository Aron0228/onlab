ALTER TABLE github."issue"
ADD COLUMN IF NOT EXISTS priority text;

ALTER TABLE github."issue"
ADD COLUMN IF NOT EXISTS priority_reason text;

ALTER TABLE github."pull_request"
ADD COLUMN IF NOT EXISTS priority text;

ALTER TABLE github."pull_request"
ADD COLUMN IF NOT EXISTS priority_reason text;

UPDATE github."issue" AS issue
SET
  priority = prediction.priority,
  priority_reason = prediction.reason
FROM system."ai_prediction" AS prediction
WHERE prediction.source_type = 'github-issue'
  AND prediction.prediction_type = 'issue-priority'
  AND prediction.source_id = issue.id;

UPDATE github."pull_request" AS pull_request
SET
  priority = prediction.priority,
  priority_reason = prediction.reason
FROM system."ai_prediction" AS prediction
WHERE prediction.source_type = 'github-pull-request'
  AND prediction.prediction_type = 'pull-request-merge-risk'
  AND prediction.source_id = pull_request.id;

DROP TABLE IF EXISTS system."ai_prediction";
