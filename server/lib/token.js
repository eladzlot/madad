// token.js — signed, expiring therapist links (REMOTE_SPEC §4.5).
//
//   sig = base64url( HMAC-SHA256( secret, `${uid}.${exp}` ) )
//
// Stateless: the secret is the only state. WebCrypto's verify() is the
// constant-time comparison. Works in Workers, browsers and node ≥ 20.

const enc = new TextEncoder();

async function key(secret, usage) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

export function base64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64url(str) {
  if (typeof str !== 'string' || !/^[A-Za-z0-9_-]*$/.test(str)) return null;
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  try {
    const bin = atob(b64);
    return Uint8Array.from(bin, c => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** @returns {Promise<string>} base64url signature over `${uid}.${exp}` */
export async function signLink(secret, uid, exp) {
  const k = await key(secret, 'sign');
  return base64url(await crypto.subtle.sign('HMAC', k, enc.encode(`${uid}.${exp}`)));
}

/** True only if the signature matches AND exp is still in the future. */
export async function verifyLink(secret, uid, exp, sig, nowSeconds = Math.floor(Date.now() / 1000)) {
  const expNum = Number(exp);
  if (!Number.isInteger(expNum) || expNum <= nowSeconds) return false;
  const bytes = fromBase64url(sig);
  if (!bytes || bytes.length !== 32) return false;
  const k = await key(secret, 'verify');
  return crypto.subtle.verify('HMAC', k, bytes, enc.encode(`${uid}.${expNum}`));
}

/** Absolute Aggregate link for a uid, valid for ttlDays from `now`. */
export async function buildLink({ secret, origin, uid, ttlDays, now = new Date() }) {
  const exp = Math.floor(now.getTime() / 1000) + Math.round(ttlDays * 86400);
  const sig = await signLink(secret, uid, exp);
  const u = new URL('/aggregate/', origin);
  u.searchParams.set('uid', uid);
  u.searchParams.set('exp', String(exp));
  u.searchParams.set('sig', sig);
  return u.toString();
}

/** Salted SHA-256 of a client IP, hex — what access_log stores instead of the IP. */
export async function hashIp(ip, salt) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(`${salt}|${ip ?? ''}`));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
