import { describe, it, expect, vi } from 'vitest';
import { readLinkParams, fetchSessions, requestFreshLink } from './fetch-sessions.js';

const res = (status, body) => new Response(body == null ? null : JSON.stringify(body), { status, headers: body == null ? {} : { 'Content-Type': 'application/json' } });

describe('readLinkParams', () => {
  it('needs all three params', () => {
    expect(readLinkParams({ search: '?uid=A&exp=1&sig=s' })).toEqual({ uid: 'A', exp: '1', sig: 's' });
    expect(readLinkParams({ search: '?uid=A&exp=1' })).toBeNull();
    expect(readLinkParams({ search: '' })).toBeNull();
  });
});

describe('fetchSessions', () => {
  const link = { uid: 'ABCDEFGH', exp: '1', sig: 'x' };
  it('ok → sessions; 403 → expired; other failures → error', async () => {
    const fetchImpl = vi.fn(async () => res(200, { uid: 'ABCD-EFGH', sessions: [{ envelope: { a: 1 }, createdAt: 't' }] }));
    expect(await fetchSessions(link, { fetchImpl })).toEqual({ status: 'ok', uid: 'ABCD-EFGH', sessions: [{ envelope: { a: 1 }, createdAt: 't' }] });
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/sessions?uid=ABCDEFGH&exp=1&sig=x');
    expect(await fetchSessions(link, { fetchImpl: async () => res(403, { error: 'forbidden' }) })).toEqual({ status: 'expired' });
    expect(await fetchSessions(link, { fetchImpl: async () => res(500) })).toEqual({ status: 'error' });
    expect(await fetchSessions(link, { fetchImpl: async () => new Response('<html>', { status: 200 }) })).toEqual({ status: 'error' });
    expect(await fetchSessions(link, { fetchImpl: async () => { throw new TypeError('net'); } })).toEqual({ status: 'error' });
  });
});

describe('requestFreshLink', () => {
  it('posts the uid and reports only a 204 as success', async () => {
    const fetchImpl = vi.fn(async () => res(204));
    expect(await requestFreshLink('ABCD-EFGH', { fetchImpl })).toBe(true);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ uid: 'ABCD-EFGH' });
    expect(await requestFreshLink('x', { fetchImpl: async () => res(500) })).toBe(false);
    expect(await requestFreshLink('x', { fetchImpl: async () => { throw new Error('net'); } })).toBe(false);
  });
});
