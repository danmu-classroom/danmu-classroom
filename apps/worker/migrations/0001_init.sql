-- Rooms opened by a screen. A key is unique among online rooms only, so keys get reused.
CREATE TABLE rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  online INTEGER NOT NULL DEFAULT 1,
  auth_token TEXT NOT NULL UNIQUE,
  auth_token_sent_at TEXT NOT NULL,
  creator_ip TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX index_rooms_on_online_key ON rooms (key) WHERE online = 1;
CREATE INDEX index_rooms_on_online ON rooms (online);

-- People sending danmus (LINE users, test clients). LINE bot conversation state lives here too.
CREATE TABLE senders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  uid TEXT NOT NULL,
  room_key TEXT,
  last_action TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX index_senders_on_provider_uid ON senders (provider, uid);

-- Danmu history (delivery to screens goes through the room's Durable Object).
CREATE TABLE danmus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES rooms (id),
  sender_id INTEGER NOT NULL REFERENCES senders (id),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX index_danmus_on_room_id ON danmus (room_id);
