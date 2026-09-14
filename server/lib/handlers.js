// handlers.js — the four endpoints of REMOTE_SPEC §4 as pure functions.
//
// Each handler takes plain inputs plus a `deps` object and returns a
// Response. Nothing here touches Cloudflare directly: the route files in
// functions/api/v1/ build `deps` from the runtime env, and the tests build
// it from fakes. Error responses are generic by design (§4, §7).
//
// deps = {
//   db,            // db.js interface
//   email,         // { send({to, subject, text, html}) → {ok} }
//   loadConfig,    // (questionnaireId) → Promise<config JSON | null>
//   secret,        // HMAC secret for links
//   origin,        // 'https://…' — where links point
//   ipHash,        // salted hash of the caller's IP (string | null)
//   now,           // () => Date
//   limits: { linkTtlDays, submissionsPerUidPerDay, failedChecksPerIpPerHour, maxBodyBytes },
// }

import { normalizeUid, formatUid, isValidUid } from '../../shared/remote/uid.js';
import { validateEnvelope } from '../../shared/pdf/envelope-schema.js';
import { textItemIds } from '../../shared/remote/no-text-rule.js';
import { buildLink, verifyLink } from './token.js';
import { doorbellEmail, freshLinkEmail } from './email.js';

export const MAX_BODY_BYTES = 256 * 1024;

const NO_STORE = { 'Cache-Control': 'no-store' };
export const empty = (status) => new Response(null, { status, headers: NO_STORE });
export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...NO_STORE, 'Content-Type': 'application/json; charset=utf-8' } });
// Refusals carry a small JSON body so the client can tell an API refusal
// from a bare 404 off a static host with no API (it then fails open).
export const ERRORS = { 400: 'invalid', 403: 'forbidden', 404: 'unknown_uid', 413: 'too_large', 429: 'rate_limited' };
export const refuse = (status) => json({ error: ERRORS[status] ?? 'error' }, status);

const iso = (d) => d.toISOString();
const hoursAgo = (now, h) => iso(new Date(now.getTime() - h * 3600_000));

// ── 4.1 GET /api/v1/uids/<uid> ───────────────────────────────────────────────

export async function checkUid(rawUid, deps) {
  const now = deps.now();
  const uid = isValidUid(rawUid) ? normalizeUid(rawUid) : null;

  // Per-IP cap on failed checks: a guesser shows up here and gets slowed.
  if (deps.ipHash && deps.limits.failedChecksPerIpPerHour > 0) {
    const failed = await deps.db.countAccessSince({ kind: 'check', ipHash: deps.ipHash, ok: false, sinceIso: hoursAgo(now, 1) });
    if (failed >= deps.limits.failedChecksPerIpPerHour) {
      await deps.db.logAccess({ kind: 'check', uid, ok: false, ipHash: deps.ipHash, ts: iso(now) });
      return refuse(429);
    }
  }

  const row = uid ? await deps.db.findRegistry(uid) : null;
  await deps.db.logAccess({ kind: 'check', uid, ok: !!row, ipHash: deps.ipHash, ts: iso(now) });
  return row ? empty(204) : refuse(404);
}

// ── 4.2 POST /api/v1/sessions ────────────────────────────────────────────────

export async function submitSession(rawBody, deps) {
  const now = deps.now();
  const log = (uid, ok) => deps.db.logAccess({ kind: 'submit', uid, ok, ipHash: deps.ipHash, ts: iso(now) });

  if (typeof rawBody !== 'string' || new TextEncoder().encode(rawBody).length > (deps.limits.maxBodyBytes ?? MAX_BODY_BYTES)) {
    await log(null, false);
    return refuse(413);
  }
  let body;
  try { body = JSON.parse(rawBody); } catch { await log(null, false); return refuse(400); }
  if (!body || typeof body !== 'object' || !isValidUid(body.uid)) { await log(null, false); return refuse(400); }
  const uid = normalizeUid(body.uid);

  const row = await deps.db.findRegistry(uid);
  if (!row) { await log(uid, false); return refuse(404); }

  const envelope = body.envelope;
  const { valid } = validateEnvelope(envelope);
  if (!valid) { await log(uid, false); return refuse(400); }

  // D-2 defence in depth: the envelope's identity fields must be the uid and
  // nothing else — no name (the app emits '' when it collects none), and a
  // pid that is this uid.
  if ((envelope.name ?? '') !== '' || !isValidUid(envelope.pid) || normalizeUid(envelope.pid) !== uid) {
    await log(uid, false); return refuse(400);
  }

  // §5.3 no-text rule, server side: every instrument must exist in this
  // deployment and no answer may belong to a text item.
  if (!(await answersAreTextFree(envelope, deps.loadConfig))) { await log(uid, false); return refuse(400); }

  // §7 per-uid daily cap.
  const cap = deps.limits.submissionsPerUidPerDay;
  if (cap > 0 && (await deps.db.countSessionsSince(uid, hoursAgo(now, 24))) >= cap) {
    await log(uid, false); return refuse(429);
  }

  await deps.db.insertSession(uid, JSON.stringify(envelope), iso(now));
  await log(uid, true);

  // §6 doorbell. Failure is logged by the caller's runtime, never surfaced.
  const link = await buildLink({ secret: deps.secret, origin: deps.origin, uid, ttlDays: deps.limits.linkTtlDays, now });
  const msg = doorbellEmail({ uid: formatUid(uid), link, date: now });
  const sent = await deps.email.send({ to: row.therapist_email, ...msg });
  if (!sent.ok) deps.onEmailFailure?.({ uid, reason: sent.reason ?? sent.status });

  return empty(204);
}

async function answersAreTextFree(envelope, loadConfig) {
  const ss = envelope.sessionState;
  const cache = new Map();
  const configFor = async (qId) => {
    if (!cache.has(qId)) cache.set(qId, await loadConfig(qId));
    return cache.get(qId);
  };
  const ids = new Set(envelope.instruments.map(i => i.questionnaireId));
  for (const sessionKey of Object.keys(ss.answers)) ids.add(ss.questionnaireIds?.[sessionKey] ?? sessionKey);
  const forbidden = new Map();   // qId → Set(item ids)
  for (const qId of ids) {
    const cfg = await configFor(qId);
    const q = cfg?.questionnaires?.find(q => q.id === qId);
    if (!q) return false;                                   // unknown instrument
    forbidden.set(qId, new Set(textItemIds(q.items)));
  }
  for (const [sessionKey, answers] of Object.entries(ss.answers)) {
    const qId = ss.questionnaireIds?.[sessionKey] ?? sessionKey;
    const bad = forbidden.get(qId);
    for (const itemId of Object.keys(answers ?? {})) {
      if (bad.has(itemId) || itemId.endsWith('__text')) return false;
    }
  }
  return true;
}

// ── 4.3 GET /api/v1/sessions?uid&exp&sig ─────────────────────────────────────

export async function readSessions({ uid: rawUid, exp, sig }, deps) {
  const now = deps.now();
  const uid = isValidUid(rawUid) ? normalizeUid(rawUid) : null;
  const ok = uid !== null && await verifyLink(deps.secret, uid, exp, sig, Math.floor(now.getTime() / 1000));
  await deps.db.logAccess({ kind: 'read', uid, ok, ipHash: deps.ipHash, ts: iso(now) });
  if (!ok) return refuse(403);
  const sessions = await deps.db.listSessions(uid);
  return json({ uid: formatUid(uid), sessions });
}

// ── 4.4 POST /api/v1/links ───────────────────────────────────────────────────

export async function requestLink(rawBody, deps) {
  const now = deps.now();
  let body = null;
  try { body = JSON.parse(rawBody); } catch { /* fall through: always 204 */ }
  const uid = body && isValidUid(body.uid) ? normalizeUid(body.uid) : null;
  const row = uid ? await deps.db.findRegistry(uid) : null;
  await deps.db.logAccess({ kind: 'link', uid, ok: !!row, ipHash: deps.ipHash, ts: iso(now) });
  if (row) {
    const link = await buildLink({ secret: deps.secret, origin: deps.origin, uid, ttlDays: deps.limits.linkTtlDays, now });
    const sent = await deps.email.send({ to: row.therapist_email, ...freshLinkEmail({ uid: formatUid(uid), link }) });
    if (!sent.ok) deps.onEmailFailure?.({ uid, reason: sent.reason ?? sent.status });
  }
  return empty(204);   // never an oracle
}
