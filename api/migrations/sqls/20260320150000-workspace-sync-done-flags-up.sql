ALTER TABLE "system".workspace
ADD COLUMN IF NOT EXISTS issue_sync_done boolean NOT NULL DEFAULT FALSE;

ALTER TABLE "system".workspace
ADD COLUMN IF NOT EXISTS pr_sync_done boolean NOT NULL DEFAULT FALSE;
