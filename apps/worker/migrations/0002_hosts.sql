-- Hosts sign in with SSO (Google for now) to keep the history of their rooms.
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT,
  name TEXT,
  picture TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- One row per SSO identity, so more providers can be linked to the same user later.
CREATE TABLE oauth_accounts (
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (provider, provider_user_id)
);
CREATE INDEX index_oauth_accounts_on_user_id ON oauth_accounts (user_id);

-- Login sessions; only the SHA-256 of the cookie token is stored.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX index_sessions_on_user_id ON sessions (user_id);

ALTER TABLE rooms ADD COLUMN owner_id INTEGER REFERENCES users (id);
CREATE INDEX index_rooms_on_owner_id ON rooms (owner_id);

-- One-time codes a screen (e.g. Electron) hands to the host's browser to add a room to their account.
CREATE TABLE room_claims (
  code_hash TEXT PRIMARY KEY,
  room_id INTEGER NOT NULL REFERENCES rooms (id),
  expires_at TEXT NOT NULL,
  used_at TEXT
);
