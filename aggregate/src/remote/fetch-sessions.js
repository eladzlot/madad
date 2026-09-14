// fetch-sessions.js — the Aggregate's server read path (REMOTE_SPEC §4.3,
// §4.4, §5.2). Same origin; the CSP's connect-src 'self' covers it.
//
// A link is /aggregate/?uid=…&exp=…&sig=…. With all three present the page
// enters fetch mode; without them it is the PDF-drop surface as on main.

const base = () => `${import.meta.env.BASE_URL}api/v1/`;

/** The signed-link params from a Location-like, or null when not a link. */
export function readLinkParams(loc = location) {
  const p = new URLSearchParams(loc.search);
  const uid = p.get('uid'), exp = p.get('exp'), sig = p.get('sig');
  return uid && exp && sig ? { uid, exp, sig } : null;
}

async function withTimeout(fetchImpl, url, init, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return await fetchImpl(url, { ...init, signal: ctrl.signal }); } finally { clearTimeout(t); }
}

/**
 * @returns {Promise<{status:'ok', uid:string, sessions:Array<{envelope:object, createdAt:string}>}
 *                  | {status:'expired'} | {status:'error'}>}
 * 403 means the link is expired, tampered or signed with a rotated secret —
 * indistinguishable by design (§4.3); all of them are cured by a fresh link.
 */
export async function fetchSessions({ uid, exp, sig }, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const url = `${base()}sessions?${new URLSearchParams({ uid, exp, sig })}`;
  try {
    const res = await withTimeout(fetchImpl, url, { method: 'GET', cache: 'no-store' }, timeoutMs);
    if (res.status === 403) return { status: 'expired' };
    if (!res.ok) return { status: 'error' };
    const body = await res.json();
    if (!body || !Array.isArray(body.sessions)) return { status: 'error' };
    return { status: 'ok', uid: body.uid ?? uid, sessions: body.sessions };
  } catch {
    return { status: 'error' };
  }
}

/** §4.4 — always resolves; true only when the API answered 204. */
export async function requestFreshLink(uid, { fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  try {
    const res = await withTimeout(fetchImpl, `${base()}links`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid }), cache: 'no-store',
    }, timeoutMs);
    return res.status === 204;
  } catch {
    return false;
  }
}
