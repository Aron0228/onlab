ALTER TABLE "communication"."channel_member"
    DROP CONSTRAINT IF EXISTS communication_channel_member_role_check;

ALTER TABLE "communication"."channel_member"
    DROP COLUMN IF EXISTS role;
