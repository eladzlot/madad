import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { checkUid, submitSession, readSessions, requestLink } from './handlers.js';
import { createMemoryDb } from './db-memory.js';
import { buildLink, signLink } from './token.js';
import { buildEnvelope } from '../../shared/pdf/envelope-schema.js';
import { generateUid, normalizeUid } from '../../shared/remote/uid.js';

const SECRET = 'unit-secret';
const UID = generateUid(() => Uint8Array.from([1, 2, 3, 4, 5, 6, 7]));   // XXXX-XXXX
const NUID = normalizeUid(UID);
const OTHER = generateUid(() => Uint8Array.from([9, 9, 9, 9, 9, 9, 9]));
const NOW = new Date('2026-09-14T10:00:00Z');

const prod = (id) => JSON.parse(readFileSync(new URL(`../../public/configs/prod/${id}.json`, import.meta.url), 'utf8'));
const loadConfig = async (id) => { try { return prod(id); } catch { return null; } };

function phq9Envelope(overrides = {}) {
  const cfg = prod('phq9');
  const answers = Object.fromEntries(cfg.questionnaires[0].items.filter(i => i.type === 'select').map(i => [i.id, 1]));
  return buildEnvelope({
    sessionState: { answers: { phq9: answers }, scores: { phq9: { total: 9 } }, alerts: {}, questionnaireIds: {} },
    config: { questionnaires: cfg.questionnaires.map(q => ({ ...q, configFile: 'configs/prod/phq9.json' })) },
    session: { name: '', pid: UID },
    now: NOW,
    ...overrides,
  });
}

function makeDeps(overrides = {}) {
  const db = createMemoryDb({ registry: [{ uid: NUID, therapist_email: 't@clinic.example', course: 'c1' }] });
  const email = { send: vi.fn(async () => ({ ok: true, status: 200 })) };
  return {
    db, email, loadConfig, secret: SECRET, origin: 'https://trial.example', ipHash: 'iphash-a',
    now: () => NOW,
    limits: { linkTtlDays: 7, submissionsPerUidPerDay: 3, failedChecksPerIpPerHour: 3, doorbellWindowHours: 1, maxBodyBytes: 256 * 1024 },
    onEmailFailure: vi.fn(),
    ...overrides,
  };
}

describe('checkUid (§4.1)', () => {
  let deps;
  beforeEach(() => { deps = makeDeps(); });

  it('204 for a registered uid in any spelling; 404 otherwise; both logged', async () => {
    expect((await checkUid(UID.toLowerCase(), deps)).status).toBe(204);
    const r = await checkUid(OTHER, deps);
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: 'unknown_uid' });
    expect((await checkUid('garbage', deps)).status).toBe(404);
    expect(deps.db.tables.access_log.map(a => [a.kind, a.uid, a.ok])).toEqual([
      ['check', NUID, 1], ['check', normalizeUid(OTHER), 0], ['check', null, 0],
    ]);
    expect(deps.db.tables.access_log[0].ip_hash).toBe('iphash-a');
  });

  it('429 once an IP has exceeded the failed-check cap within the hour', async () => {
    for (let i = 0; i < 3; i++) await checkUid(OTHER, deps);
    expect((await checkUid(UID, deps)).status).toBe(429);            // even a valid uid is refused now
    const fresh = makeDeps({ db: deps.db, ipHash: 'iphash-b' });
    expect((await checkUid(UID, fresh)).status).toBe(204);           // another IP is unaffected
  });
});

describe('submitSession (§4.2)', () => {
  let deps;
  beforeEach(() => { deps = makeDeps(); });
  const post = (body) => submitSession(typeof body === 'string' ? body : JSON.stringify(body), deps);

  it('stores a valid envelope verbatim, logs, and emails a doorbell with a working link', async () => {
    const env = phq9Envelope();
    expect((await post({ uid: UID.toLowerCase(), envelope: env })).status).toBe(204);
    expect(deps.db.tables.sessions).toHaveLength(1);
    expect(JSON.parse(deps.db.tables.sessions[0].envelope)).toEqual(env);
    expect(deps.db.tables.sessions[0].uid).toBe(NUID);
    expect(deps.db.tables.access_log.filter(a => a.kind === 'submit')).toEqual([expect.objectContaining({ uid: NUID, ok: 1 })]);
    expect(deps.db.tables.access_log.filter(a => a.kind === 'email')).toEqual([expect.objectContaining({ uid: NUID, ok: 1, ip_hash: null })]);

    expect(deps.email.send).toHaveBeenCalledOnce();
    const msg = deps.email.send.mock.calls[0][0];
    expect(msg.to).toBe('t@clinic.example');
    expect(msg.subject).toContain(UID);
    const link = new URL(msg.text.match(/https:\/\/\S+/)[0]);
    const read = await readSessions({ uid: link.searchParams.get('uid'), exp: link.searchParams.get('exp'), sig: link.searchParams.get('sig') }, deps);
    expect(read.status).toBe(200);
  });

  it('404 for an unregistered uid (with a JSON body — the client keys on it), 400 for malformed bodies', async () => {
    const r = await post({ uid: OTHER, envelope: phq9Envelope() });
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: 'unknown_uid' });
    expect((await post('{nope')).status).toBe(400);
    expect((await post({ uid: 'x', envelope: {} })).status).toBe(400);
    expect((await post({ uid: UID, envelope: { schemaVersion: 1 } })).status).toBe(400);
    expect(deps.db.tables.sessions).toHaveLength(0);
    expect(deps.email.send).not.toHaveBeenCalled();
  });

  it('400 when the envelope carries a name or a pid that is not the uid (D-2)', async () => {
    expect((await post({ uid: UID, envelope: phq9Envelope({ session: { name: 'ישראל', pid: UID } }) })).status).toBe(400);
    expect((await post({ uid: UID, envelope: phq9Envelope({ session: { name: '', pid: OTHER } }) })).status).toBe(400);
    expect((await post({ uid: UID, envelope: phq9Envelope({ session: { pid: null } }) })).status).toBe(400);
  });

  it('400 when an answer belongs to a text item or an unknown instrument (§5.3)', async () => {
    const withText = phq9Envelope();
    withText.sessionState.answers.phq9['9__text'] = 'free text';
    expect((await post({ uid: UID, envelope: withText })).status).toBe(400);

    const top3 = prod('top3');
    const textItem = top3.questionnaires[0].items.find(i => i.type === 'text' || i.type === 'rated_text');
    const env = buildEnvelope({
      sessionState: { answers: { top3: { [textItem.id]: 'my problem' } }, scores: {}, alerts: {}, questionnaireIds: {} },
      config: { questionnaires: top3.questionnaires }, session: { name: '', pid: UID }, now: NOW,
    });
    expect((await post({ uid: UID, envelope: env })).status).toBe(400);

    const unknown = phq9Envelope();
    unknown.instruments.push({ questionnaireId: 'not_a_real_instrument', title: null, configFile: null });
    expect((await post({ uid: UID, envelope: unknown })).status).toBe(400);
  });

  it('413 over the body cap, 429 over the per-uid daily cap', async () => {
    expect((await post('x'.repeat(256 * 1024 + 1))).status).toBe(413);
    for (let i = 0; i < 3; i++) expect((await post({ uid: UID, envelope: phq9Envelope() })).status).toBe(204);
    expect((await post({ uid: UID, envelope: phq9Envelope() })).status).toBe(429);
    expect(deps.db.tables.sessions).toHaveLength(3);
    expect(deps.email.send).toHaveBeenCalledOnce();          // three sittings, one doorbell (§6)
  });

  it('email failure does not fail the submission, is logged, and does not suppress the next attempt', async () => {
    deps.email.send = vi.fn(async () => ({ ok: false, status: 500 }));
    expect((await post({ uid: UID, envelope: phq9Envelope() })).status).toBe(204);
    expect(deps.db.tables.sessions).toHaveLength(1);
    expect(deps.onEmailFailure).toHaveBeenCalledWith(expect.objectContaining({ uid: NUID }));
    // The loss is queryable rather than console-only.
    expect(deps.db.tables.access_log.filter(a => a.kind === 'email')).toEqual([expect.objectContaining({ uid: NUID, ok: 0 })]);
    // Nobody was told, so the next submission must try again.
    deps.email.send = vi.fn(async () => ({ ok: true, status: 200 }));
    expect((await post({ uid: UID, envelope: phq9Envelope() })).status).toBe(204);
    expect(deps.email.send).toHaveBeenCalledOnce();
  });

  it('suppresses a repeat doorbell within the window and sends again after it', async () => {
    // The app re-submits whenever answers change after a completion. Two
    // sittings here, leaving room under the per-uid daily cap (3) for the
    // post-window submission below.
    for (let i = 0; i < 2; i++) expect((await post({ uid: UID, envelope: phq9Envelope() })).status).toBe(204);
    expect(deps.db.tables.sessions).toHaveLength(2);
    expect(deps.email.send).toHaveBeenCalledOnce();

    // A different patient of the same therapist is never suppressed.
    deps.db.tables.registry.push({ uid: normalizeUid(OTHER), therapist_email: 't@clinic.example', course: 'c1' });
    expect((await post({ uid: OTHER, envelope: phq9Envelope({ session: { name: '', pid: OTHER } }) })).status).toBe(204);
    expect(deps.email.send).toHaveBeenCalledTimes(2);

    // Past the window, the same uid notifies again.
    const later = makeDeps({ db: deps.db, email: deps.email, now: () => new Date(NOW.getTime() + 2 * 3600_000) });
    expect((await submitSession(JSON.stringify({ uid: UID, envelope: phq9Envelope() }), later)).status).toBe(204);
    expect(deps.email.send).toHaveBeenCalledTimes(3);
  });

  it('a window of 0 disables suppression', async () => {
    const always = makeDeps({ limits: { ...deps.limits, doorbellWindowHours: 0 } });
    for (let i = 0; i < 2; i++) await submitSession(JSON.stringify({ uid: UID, envelope: phq9Envelope() }), always);
    expect(always.email.send).toHaveBeenCalledTimes(2);
  });
});

describe('readSessions (§4.3)', () => {
  it('returns the uid\'s sessions in order for a valid link; 403 otherwise; every attempt logged', async () => {
    const deps = makeDeps();
    await deps.db.insertSession(NUID, JSON.stringify({ n: 2 }), '2026-09-02T00:00:00Z');
    await deps.db.insertSession(NUID, JSON.stringify({ n: 1 }), '2026-09-01T00:00:00Z');
    await deps.db.insertSession(normalizeUid(OTHER), JSON.stringify({ n: 9 }), '2026-09-01T00:00:00Z');

    const link = new URL(await buildLink({ secret: SECRET, origin: 'https://trial.example', uid: NUID, ttlDays: 7, now: NOW }));
    const q = { uid: link.searchParams.get('uid'), exp: link.searchParams.get('exp'), sig: link.searchParams.get('sig') };
    const ok = await readSessions(q, deps);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Cache-Control')).toBe('no-store');
    const body = await ok.json();
    expect(body.uid).toBe(UID);
    expect(body.sessions.map(s => s.envelope.n)).toEqual([1, 2]);

    expect((await readSessions({ ...q, uid: OTHER }, deps)).status).toBe(403);
    expect((await readSessions({ ...q, sig: 'bad' }, deps)).status).toBe(403);
    const late = makeDeps({ db: deps.db, now: () => new Date(NOW.getTime() + 8 * 86400_000) });
    expect((await readSessions(q, late)).status).toBe(403);
    expect(deps.db.tables.access_log.filter(a => a.kind === 'read').map(a => a.ok)).toEqual([1, 0, 0, 0]);
  });
});

describe('requestLink (§4.4)', () => {
  it('always 204; emails a fresh link only for registered uids', async () => {
    const deps = makeDeps();
    expect((await requestLink(JSON.stringify({ uid: OTHER }), deps)).status).toBe(204);
    expect((await requestLink('garbage', deps)).status).toBe(204);
    expect(deps.email.send).not.toHaveBeenCalled();

    expect((await requestLink(JSON.stringify({ uid: UID.toLowerCase() }), deps)).status).toBe(204);
    expect(deps.email.send).toHaveBeenCalledOnce();
    const msg = deps.email.send.mock.calls[0][0];
    expect(msg.to).toBe('t@clinic.example');
    const link = new URL(msg.text.match(/https:\/\/\S+/)[0]);
    const exp = Number(link.searchParams.get('exp'));
    expect(await signLink(SECRET, NUID, exp)).toBe(link.searchParams.get('sig'));
    expect(deps.db.tables.access_log.map(a => [a.kind, a.ok])).toEqual([['link', 0], ['link', 0], ['link', 1], ['email', 1]]);
  });

  it('is never suppressed — a therapist asking twice gets two links', async () => {
    const deps = makeDeps();
    await requestLink(JSON.stringify({ uid: UID }), deps);
    await requestLink(JSON.stringify({ uid: UID }), deps);
    expect(deps.email.send).toHaveBeenCalledTimes(2);
  });
});
