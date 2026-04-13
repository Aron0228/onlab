ALTER TABLE system."ai_prediction"
ADD COLUMN IF NOT EXISTS reviewer_suggestions jsonb;
