ALTER TABLE system."ai_prediction"
ADD COLUMN IF NOT EXISTS estimated_hours integer,
ADD COLUMN IF NOT EXISTS estimation_confidence text;

ALTER TABLE system."ai_prediction"
DROP CONSTRAINT IF EXISTS ai_prediction_estimation_confidence_check;

ALTER TABLE system."ai_prediction"
ADD CONSTRAINT ai_prediction_estimation_confidence_check
  CHECK (
    estimation_confidence IN ('low', 'medium', 'high')
    OR estimation_confidence IS NULL
  );
