// db-memory.js — an in-memory implementation of the db.js interface for
// tests and for the mock server the e2e suite drives. Same semantics, plain
// arrays; also exposes its tables for assertions.

export function createMemoryDb({ registry = [] } = {}) {
  const tables = {
    registry: registry.map(r => ({ label: null, created_at: new Date().toISOString(), ...r })),
    sessions: [],
    access_log: [],
  };
  return {
    tables,
    async findRegistry(uid) {
      const r = tables.registry.find(r => r.uid === uid);
      return r ? { uid: r.uid, therapist_email: r.therapist_email, course: r.course } : null;
    },
    async insertSession(uid, envelopeJson, createdAt) {
      tables.sessions.push({ id: tables.sessions.length + 1, uid, envelope: envelopeJson, created_at: createdAt });
    },
    async listSessions(uid) {
      return tables.sessions.filter(s => s.uid === uid)
        .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)
        .map(s => ({ envelope: JSON.parse(s.envelope), createdAt: s.created_at }));
    },
    async countSessionsSince(uid, sinceIso) {
      return tables.sessions.filter(s => s.uid === uid && s.created_at >= sinceIso).length;
    },
    async countAccessSince({ kind, ipHash, ok, sinceIso }) {
      return tables.access_log.filter(a => a.kind === kind && a.ip_hash === ipHash && a.ok === (ok ? 1 : 0) && a.ts >= sinceIso).length;
    },
    async logAccess({ kind, uid, ok, ipHash, ts }) {
      tables.access_log.push({ id: tables.access_log.length + 1, kind, uid: uid ?? null, ok: ok ? 1 : 0, ip_hash: ipHash ?? null, ts });
    },
  };
}
