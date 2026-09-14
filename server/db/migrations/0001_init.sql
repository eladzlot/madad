-- Remote tracking schema — docs/REMOTE_SPEC.md §2.1.
-- No names, no contact details, no free text anywhere. The registry maps a
-- uid to the therapist who receives its doorbell emails; sessions hold the
-- envelope exactly as the patient app sent it; access_log is the security
-- and usage record.

CREATE TABLE registry (
  uid             TEXT PRIMARY KEY,   -- normalised: uppercase, no hyphen
  therapist_email TEXT NOT NULL,
  course          TEXT NOT NULL,
  label           TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX registry_email ON registry(therapist_email);

CREATE TABLE sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uid        TEXT NOT NULL REFERENCES registry(uid),
  envelope   TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX sessions_uid ON sessions(uid);

CREATE TABLE access_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  kind    TEXT NOT NULL,              -- 'check' | 'submit' | 'read' | 'link'
  uid     TEXT,                       -- as supplied (normalised), may be unregistered
  ok      INTEGER NOT NULL,           -- 1 success, 0 refused
  ip_hash TEXT,
  ts      TEXT NOT NULL
);
CREATE INDEX access_log_uid_ts ON access_log(uid, ts);
CREATE INDEX access_log_ip_ts ON access_log(ip_hash, kind, ts);
