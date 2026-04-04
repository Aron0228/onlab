CREATE TABLE IF NOT EXISTS system."ai_prediction" (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_type text NOT NULL,
  source_id integer NOT NULL,
  prediction_type text NOT NULL,
  priority text,
  reason text,
  findings jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_prediction_source_type_check
    CHECK (source_type IN ('github-issue', 'github-pull-request')),
  CONSTRAINT ai_prediction_prediction_type_check
    CHECK (
      prediction_type IN ('issue-priority', 'pull-request-merge-risk')
    ),
  CONSTRAINT ai_prediction_source_unique
    UNIQUE (source_type, source_id, prediction_type)
);

CREATE INDEX IF NOT EXISTS ai_prediction_source_lookup_idx
  ON system."ai_prediction" (source_type, source_id);

INSERT INTO system."ai_prediction" (
  source_type,
  source_id,
  prediction_type,
  priority,
  reason
)
SELECT
  'github-issue',
  id,
  'issue-priority',
  priority,
  priority_reason
FROM github."issue"
WHERE priority IS NOT NULL OR priority_reason IS NOT NULL
ON CONFLICT (source_type, source_id, prediction_type)
DO UPDATE SET
  priority = EXCLUDED.priority,
  reason = EXCLUDED.reason,
  updated_at = now();

INSERT INTO system."ai_prediction" (
  source_type,
  source_id,
  prediction_type,
  priority,
  reason
)
SELECT
  'github-pull-request',
  id,
  'pull-request-merge-risk',
  priority,
  priority_reason
FROM github."pull_request"
WHERE priority IS NOT NULL OR priority_reason IS NOT NULL
ON CONFLICT (source_type, source_id, prediction_type)
DO UPDATE SET
  priority = EXCLUDED.priority,
  reason = EXCLUDED.reason,
  updated_at = now();

ALTER TABLE github."issue"
DROP COLUMN IF EXISTS priority,
DROP COLUMN IF EXISTS priority_reason;

ALTER TABLE github."pull_request"
DROP COLUMN IF EXISTS priority,
DROP COLUMN IF EXISTS priority_reason;
