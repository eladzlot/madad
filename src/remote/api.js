// api.js — the patient app's client for the remote deployment's API
// (REMOTE_SPEC §4.1, §4.2). Same origin, so the CSP's connect-src 'self'
// covers it and there is no CORS.
//
// Fail-open rule (D-9): only an API refusal — a 404 whose body is
// { error: 'unknown_uid' } — blocks a session. A bare 404 off a static host
// (no API deployed, e.g. the Vite dev server), a 5xx, a timeout or a network
// error all report 'unavailable' and the session proceeds; the submit
// fallback (download the PDF) covers that case.

const base = () => `${import.meta.env.BASE_URL}api/v1/`;

async function fetchWithTimeout(url, init, timeoutMs, fetchImpl) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function errorCode(res) {
  try {
    const body = await res.json();
    return typeof body?.error === 'string' ? body.error : null;
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<'ok'|'unknown'|'unavailable'>}
 */
export async function checkUid(uid, { fetchImpl = fetch, timeoutMs = 6000 } = {}) {
  try {
    const res = await fetchWithTimeout(`${base()}uids/${encodeURIComponent(uid)}`, { method: 'GET', cache: 'no-store' }, timeoutMs, fetchImpl);
    if (res.status === 204) return 'ok';
    if (res.status === 404 && (await errorCode(res)) === 'unknown_uid') return 'unknown';
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}

/**
 * POST the envelope. One automatic retry on a network error / 5xx; an API
 * refusal (4xx with a JSON error) is returned as-is — retrying it would not
 * help and the patient must be told to use the PDF instead.
 *
 * @returns {Promise<{ ok: boolean, status: number, error: string|null }>}
 */
export async function submitSession({ uid, envelope }, { fetchImpl = fetch, timeoutMs = 15000, retries = 1 } = {}) {
  const body = JSON.stringify({ uid, envelope });
  let last = { ok: false, status: 0, error: null };
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(`${base()}sessions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body, cache: 'no-store',
      }, timeoutMs, fetchImpl);
      if (res.status === 204) return { ok: true, status: 204, error: null };
      const error = await errorCode(res);
      last = { ok: false, status: res.status, error };
      if (res.status < 500 && error) return last;         // refused: do not retry
    } catch {
      last = { ok: false, status: 0, error: null };
    }
  }
  return last;
}
