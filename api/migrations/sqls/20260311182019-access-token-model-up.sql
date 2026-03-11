CREATE TABLE IF NOT EXISTS auth.access_token(
	id text PRIMARY KEY,
	user_id integer NOT NULL REFERENCES auth."user"(id),
	github_token text NOT NULL,
	created_at timestamp NOT NULL DEFAULT now(),
	expires_at timestamp NOT NULL,
	revoked boolean NOT NULL DEFAULT FALSE
);