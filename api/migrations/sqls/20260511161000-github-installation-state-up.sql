CREATE TABLE IF NOT EXISTS github.installation_state (
  nonce varchar(128) PRIMARY KEY,
  workspace_id integer NOT NULL REFERENCES system.workspace(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE,
  issued_at timestamp with time zone NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  consumed_at timestamp with time zone
);

CREATE INDEX IF NOT EXISTS github_installation_state_lookup_idx
ON github.installation_state (workspace_id, user_id, expires_at, consumed_at);
