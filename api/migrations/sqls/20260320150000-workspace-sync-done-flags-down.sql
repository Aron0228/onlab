ALTER TABLE "system".workspace
DROP COLUMN IF EXISTS pr_sync_done;

ALTER TABLE "system".workspace
DROP COLUMN IF EXISTS issue_sync_done;
