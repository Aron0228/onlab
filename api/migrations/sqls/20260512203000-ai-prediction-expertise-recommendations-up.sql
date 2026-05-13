ALTER TABLE system."ai_prediction"
ADD COLUMN IF NOT EXISTS expertise_recommendations jsonb;
