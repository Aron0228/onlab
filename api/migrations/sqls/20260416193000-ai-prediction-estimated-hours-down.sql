ALTER TABLE system."ai_prediction"
DROP CONSTRAINT IF EXISTS ai_prediction_estimation_confidence_check;

ALTER TABLE system."ai_prediction"
DROP COLUMN IF EXISTS estimation_confidence,
DROP COLUMN IF EXISTS estimated_hours;
