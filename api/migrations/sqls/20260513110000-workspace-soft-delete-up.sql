ALTER TABLE "system"."workspace"
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS workspace_active_owner_idx
  ON "system"."workspace"(owner_id)
  WHERE deleted_at IS NULL;
