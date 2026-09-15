// db.js — the D1 accessors the handlers need, and nothing else.
//
// Every query is a prepared statement. The interface is deliberately small
// so tests can substitute createMemoryDb() (see db-memory.js) and the
// handlers never touch D1 directly.

export function createD1Db(d1) {
  return {
    async findRegistry(uid) {
      return d1.prepare('SELECT uid, therapist_email, course FROM registry WHERE uid = ?').bind(uid).first();
    },
    async insertSession(uid, envelopeJson, createdAt) {
      await d1.prepare('INSERT INTO sessions (uid, envelope, created_at) VALUES (?, ?, ?)').bind(uid, envelopeJson, createdAt).run();
    },
    async listSessions(uid) {
      const { results } = await d1.prepare('SELECT envelope, created_at FROM sessions WHERE uid = ? ORDER BY created_at, id').bind(uid).all();
      return results.map(r => ({ envelope: JSON.parse(r.envelope), createdAt: r.created_at }));
    },
    async countSessionsSince(uid, sinceIso) {
      return d1.prepare('SELECT COUNT(*) AS n FROM sessions WHERE uid = ? AND created_at >= ?').bind(uid, sinceIso).first('n');
    },
    // Successful doorbells for one uid in a window — the suppression check
    // (§6). Only ok=1 counts: a failed send means the therapist was never
    // told, so the next submission should try again rather than suppress.
    async countEmailsSince(uid, sinceIso) {
      return d1.prepare("SELECT COUNT(*) AS n FROM access_log WHERE kind = 'email' AND uid = ? AND ok = 1 AND ts >= ?")
        .bind(uid, sinceIso).first('n');
    },
    async countAccessSince({ kind, ipHash, ok, sinceIso }) {
      return d1.prepare('SELECT COUNT(*) AS n FROM access_log WHERE kind = ? AND ip_hash = ? AND ok = ? AND ts >= ?')
        .bind(kind, ipHash, ok ? 1 : 0, sinceIso).first('n');
    },
    async logAccess({ kind, uid, ok, ipHash, ts }) {
      await d1.prepare('INSERT INTO access_log (kind, uid, ok, ip_hash, ts) VALUES (?, ?, ?, ?, ?)')
        .bind(kind, uid ?? null, ok ? 1 : 0, ipHash ?? null, ts).run();
    },
  };
}
