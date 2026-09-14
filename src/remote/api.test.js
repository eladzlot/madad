import { describe, it, expect, vi } from 'vitest';
import { checkUid, submitSession } from './api.js';

const res = (status, body) => new Response(body == null ? null : JSON.stringify(body), { status, headers: body == null ? {} : { 'Content-Type': 'application/json' } });

describe('checkUid', () => {
  it('204 → ok; API 404 → unknown; bare 404 / 5xx / network / timeout → unavailable', async () => {
    expect(await checkUid('ABCD-EFGH', { fetchImpl: async () => res(204) })).toBe('ok');
    expect(await checkUid('ABCD-EFGH', { fetchImpl: async () => res(404, { error: 'unknown_uid' }) })).toBe('unknown');
    expect(await checkUid('ABCD-EFGH', { fetchImpl: async () => new Response('<html>', { status: 404 }) })).toBe('unavailable');
    expect(await checkUid('ABCD-EFGH', { fetchImpl: async () => res(500) })).toBe('unavailable');
    expect(await checkUid('ABCD-EFGH', { fetchImpl: async () => { throw new TypeError('network'); } })).toBe('unavailable');
    const never = (_u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
    expect(await checkUid('ABCD-EFGH', { fetchImpl: never, timeoutMs: 10 })).toBe('unavailable');
  });
  it('hits the same-origin v1 path with the uid encoded', async () => {
    const fetchImpl = vi.fn(async () => res(204));
    await checkUid('ab/cd', { fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/uids/ab%2Fcd');
    expect(fetchImpl.mock.calls[0][1].method).toBe('GET');
  });
});

describe('submitSession', () => {
  const payload = { uid: 'ABCD-EFGH', envelope: { schemaVersion: 1 } };

  it('posts JSON and reports success on 204', async () => {
    const fetchImpl = vi.fn(async () => res(204));
    expect(await submitSession(payload, { fetchImpl })).toEqual({ ok: true, status: 204, error: null });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/v1/sessions');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(payload);
  });

  it('retries once on network error or 5xx, then reports the last failure', async () => {
    const flaky = vi.fn().mockRejectedValueOnce(new TypeError('net')).mockResolvedValueOnce(res(204));
    expect((await submitSession(payload, { fetchImpl: flaky })).ok).toBe(true);
    expect(flaky).toHaveBeenCalledTimes(2);

    const down = vi.fn(async () => res(503));
    expect(await submitSession(payload, { fetchImpl: down })).toEqual({ ok: false, status: 503, error: null });
    expect(down).toHaveBeenCalledTimes(2);
  });

  it('does not retry an API refusal and surfaces its code', async () => {
    const refused = vi.fn(async () => res(404, { error: 'unknown_uid' }));
    expect(await submitSession(payload, { fetchImpl: refused })).toEqual({ ok: false, status: 404, error: 'unknown_uid' });
    expect(refused).toHaveBeenCalledTimes(1);
  });
});
