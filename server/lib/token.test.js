import { describe, it, expect } from 'vitest';
import { signLink, verifyLink, buildLink, base64url, fromBase64url, hashIp } from './token.js';

const SECRET = 'test-secret-do-not-use';

describe('base64url', () => {
  it('round-trips bytes without padding characters', () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const s = base64url(bytes);
    expect(s).not.toMatch(/[+/=]/);
    expect([...fromBase64url(s)]).toEqual([...bytes]);
  });
  it('rejects non-base64url input', () => {
    expect(fromBase64url('not base64!')).toBeNull();
    expect(fromBase64url(42)).toBeNull();
  });
});

describe('signLink / verifyLink', () => {
  const now = 1_800_000_000;
  it('verifies a fresh signature and rejects tampering, expiry and wrong secret', async () => {
    const exp = now + 60;
    const sig = await signLink(SECRET, 'ABCDEFGH', exp);
    expect(await verifyLink(SECRET, 'ABCDEFGH', exp, sig, now)).toBe(true);
    expect(await verifyLink(SECRET, 'ABCDEFGX', exp, sig, now)).toBe(false);          // other uid
    expect(await verifyLink(SECRET, 'ABCDEFGH', exp + 1, sig, now)).toBe(false);      // other exp
    expect(await verifyLink(SECRET, 'ABCDEFGH', exp, sig, exp)).toBe(false);          // expired (exp not > now)
    expect(await verifyLink('other', 'ABCDEFGH', exp, sig, now)).toBe(false);         // rotated secret
    expect(await verifyLink(SECRET, 'ABCDEFGH', 'soon', sig, now)).toBe(false);       // non-numeric exp
    expect(await verifyLink(SECRET, 'ABCDEFGH', exp, 'AAAA', now)).toBe(false);       // wrong length
    expect(await verifyLink(SECRET, 'ABCDEFGH', exp, null, now)).toBe(false);
  });
});

describe('buildLink', () => {
  it('points at /aggregate/ on the given origin with uid, exp and a verifiable sig', async () => {
    const now = new Date('2026-09-14T10:00:00Z');
    const link = await buildLink({ secret: SECRET, origin: 'https://trial.example', uid: 'ABCDEFGH', ttlDays: 7, now });
    const u = new URL(link);
    expect(u.origin + u.pathname).toBe('https://trial.example/aggregate/');
    expect(u.searchParams.get('uid')).toBe('ABCDEFGH');
    const exp = Number(u.searchParams.get('exp'));
    expect(exp).toBe(Math.floor(now.getTime() / 1000) + 7 * 86400);
    expect(await verifyLink(SECRET, 'ABCDEFGH', exp, u.searchParams.get('sig'), Math.floor(now.getTime() / 1000))).toBe(true);
  });
});

describe('hashIp', () => {
  it('is stable per (ip, salt) and differs across salts; never stores the ip', async () => {
    const a = await hashIp('203.0.113.7', 's1');
    expect(a).toBe(await hashIp('203.0.113.7', 's1'));
    expect(a).not.toBe(await hashIp('203.0.113.7', 's2'));
    expect(a).not.toContain('203');
    expect(a).toHaveLength(32);
  });
});
