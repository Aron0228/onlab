DROP INDEX IF EXISTS "system"."workspace_active_owner_idx";

ALTER TABLE "system"."workspace"
  DROP COLUMN IF EXISTS deleted_at;
