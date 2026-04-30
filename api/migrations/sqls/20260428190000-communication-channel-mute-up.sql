ALTER TABLE "communication"."channel_member"
    ADD COLUMN IF NOT EXISTS muted_at timestamp;
