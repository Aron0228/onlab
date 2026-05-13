ALTER TABLE "communication"."channel_member"
    ADD COLUMN IF NOT EXISTS role varchar(16) NOT NULL DEFAULT 'MEMBER';

UPDATE "communication"."channel_member" member
SET role = 'ADMIN'
FROM "communication"."channel" channel
WHERE member.channel_id = channel.id
  AND channel.created_by_id = member.user_id;

ALTER TABLE "communication"."channel_member"
    ADD CONSTRAINT communication_channel_member_role_check CHECK (role IN ('ADMIN', 'MEMBER'));
