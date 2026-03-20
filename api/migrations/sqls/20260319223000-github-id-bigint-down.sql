ALTER TABLE github."issue"
ALTER COLUMN github_id TYPE integer;

ALTER TABLE github."repository"
ALTER COLUMN github_repo_id TYPE integer;
