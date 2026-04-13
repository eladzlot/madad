import { describe, it, expect, vi } from 'vitest';
import { loadConfig, ConfigFetchError, ConfigValidationError, ConfigError } from './loader.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const minimalQ = (id = 'phq9') => ({
  id, title: 'Test',
  items: [{ id: 'q1', type: 'select', text: 'Q1', options: [{ label: 'No', value: 0 }, { label: 'Yes', value: 1 }] }],
  scoring: { method: 'none' }, alerts: [],
});

const minimalBattery = (id, qId = 'phq9') => ({ id, title: id, sequence: [{ questionnaireId: qId }] });

const minimalConfig = (questionnaires = [], batteries = []) => ({
  id: 'test_set', version: '1.0', questionnaires, batteries,
});

function makeFetch(responses) {
  return vi.fn(async (url) => {
    const res = responses[url];
    if (!res) throw new TypeError(`fetch: unexpected URL "${url}"`);
    if (res instanceof Error) throw res;
    return { ok: res.ok ?? true, status: res.status ?? 200, statusText: res.statusText ?? 'OK', json: async () => res.body };
  });
}

// ─── URL resolution ───────────────────────────────────────────────────────────

describe('URL resolution', () => {
  it('resolves slug to configs/<slug>.json', async () => {
    const fetch = makeFetch({ 'configs/standard.json': { body: minimalConfig() } });
    await loadConfig(['standard'], { fetch, fetchTimeoutMs: 0 });
    expect(fetch.mock.calls[0][0]).toBe('configs/standard.json');
  });

  it('uses full https URL when origin is explicitly allowed', async () => {
    const url = 'https://example.com/my-config.json';
    const fetch = makeFetch({ [url]: { body: minimalConfig() } });
    await loadConfig([url], { fetch, fetchTimeoutMs: 0, allowedOrigins: new Set(['https://example.com']) });
    expect(fetch.mock.calls[0][0]).toBe(url);
  });

  it('rejects https URL from origin not in allowedOrigins', async () => {
    const url = 'https://evil.example.com/config.json';
    const fetch = makeFetch({ [url]: { body: minimalConfig() } });
    await expect(
      loadConfig([url], { fetch, fetchTimeoutMs: 0 })
    ).rejects.toBeInstanceOf(ConfigError);
  });

  it('rejects http (non-TLS) URL for external origins even if listed in allowedOrigins', async () => {
    const url = 'http://example.com/config.json';
    const fetch = makeFetch({ [url]: { body: minimalConfig() } });
    await expect(
      loadConfig([url], { fetch, fetchTimeoutMs: 0, allowedOrigins: new Set() })
    ).rejects.toBeInstanceOf(ConfigError);
  });

  it('allows http (non-TLS) URL for same-origin (e.g. localhost in dev)', async () => {
    const url = 'http://localhost:5173/configs/test.json';
    const fetch = makeFetch({ [url]: { body: minimalConfig() } });
    await loadConfig([url], { fetch, fetchTimeoutMs: 0, allowedOrigins: new Set(['http://localhost:5173']) });
    expect(fetch.mock.calls[0][0]).toBe(url);
  });

  it('uses absolute path as-is', async () => {
    const fetch = makeFetch({ '/custom/path.json': { body: minimalConfig() } });
    await loadConfig(['/custom/path.json'], { fetch, fetchTimeoutMs: 0 });
    expect(fetch.mock.calls[0][0]).toBe('/custom/path.json');
  });
});

// ─── Fetch errors ─────────────────────────────────────────────────────────────

describe('fetch errors', () => {
  it('throws ConfigFetchError on HTTP 404', async () => {
    const fetch = makeFetch({ 'configs/missing.json': { ok: false, status: 404, statusText: 'Not Found' } });
    await expect(loadConfig(['missing'], { fetch })).rejects.toBeInstanceOf(ConfigFetchError);
  });

  it('throws ConfigFetchError on network error', async () => {
    const fetch = makeFetch({ 'configs/bad.json': new TypeError('Failed to fetch') });
    await expect(loadConfig(['bad'], { fetch })).rejects.toBeInstanceOf(ConfigFetchError);
  });
});

// ─── Validation errors ────────────────────────────────────────────────────────

describe('validation errors', () => {
  it('throws ConfigValidationError for invalid config', async () => {
    const fetch = makeFetch({ 'configs/bad.json': { body: { not: 'valid' } } });
    await expect(loadConfig(['bad'], { fetch })).rejects.toBeInstanceOf(ConfigValidationError);
  });

  it('ConfigValidationError exposes validationErrors array', async () => {
    const fetch = makeFetch({ 'configs/bad.json': { body: {} } });
    const err = await loadConfig(['bad'], { fetch }).catch(e => e);
    expect(Array.isArray(err.validationErrors)).toBe(true);
    expect(err.validationErrors.length).toBeGreaterThan(0);
  });
});

// ─── Return shape ─────────────────────────────────────────────────────────────

describe('resolved config shape', () => {
  it('returns questionnaires and batteries as arrays', async () => {
    const fetch = makeFetch({ 'configs/a.json': { body: minimalConfig([minimalQ()]) } });
    const config = await loadConfig(['a'], { fetch });
    expect(Array.isArray(config.questionnaires)).toBe(true);
    expect(Array.isArray(config.batteries)).toBe(true);
  });

  it('returns version and resolvedAt', async () => {
    const fetch = makeFetch({ 'configs/a.json': { body: minimalConfig([minimalQ()]) } });
    const config = await loadConfig(['a'], { fetch });
    expect(config).toMatchObject({ version: expect.any(String), resolvedAt: expect.any(String) });
  });

  it('exposes dependencies array from config file', async () => {
    const body = { ...minimalConfig([minimalQ()]), dependencies: ['configs/prod/standard.json'] };
    const fetch = makeFetch({ 'configs/a.json': { body } });
    const config = await loadConfig(['a'], { fetch });
    expect(config.dependencies).toEqual(['configs/prod/standard.json']);
  });

  it('returns empty dependencies array when not declared', async () => {
    const fetch = makeFetch({ 'configs/a.json': { body: minimalConfig([minimalQ()]) } });
    const config = await loadConfig(['a'], { fetch });
    expect(config.dependencies).toEqual([]);
  });

  it('throws when no sources provided', async () => {
    await expect(loadConfig([], { fetch: vi.fn() })).rejects.toBeInstanceOf(ConfigError);
  });
});

// ─── Merging multiple sources ─────────────────────────────────────────────────

describe('merging multiple sources', () => {
  it('merges questionnaires from multiple files', async () => {
    const fetch = makeFetch({
      'configs/a.json': { body: minimalConfig([minimalQ('phq9')]) },
      'configs/b.json': { body: minimalConfig([minimalQ('gad7')]) },
    });
    const config = await loadConfig(['a', 'b'], { fetch });
    expect(config.questionnaires.map(q => q.id)).toEqual(expect.arrayContaining(['phq9', 'gad7']));
  });

  it('merges batteries from multiple files', async () => {
    const fetch = makeFetch({
      'configs/a.json': { body: minimalConfig([minimalQ('phq9')], [minimalBattery('standard', 'phq9')]) },
      'configs/b.json': { body: minimalConfig([minimalQ('gad7')], [minimalBattery('trauma', 'gad7')]) },
    });
    const config = await loadConfig(['a', 'b'], { fetch });
    expect(config.batteries.map(b => b.id)).toEqual(expect.arrayContaining(['standard', 'trauma']));
  });

  it('throws ConfigError on duplicate questionnaire ID across files', async () => {
    const fetch = makeFetch({
      'configs/a.json': { body: minimalConfig([minimalQ('phq9')]) },
      'configs/b.json': { body: minimalConfig([minimalQ('phq9')]) },
    });
    await expect(loadConfig(['a', 'b'], { fetch })).rejects.toBeInstanceOf(ConfigError);
  });

  it('duplicate questionnaire error names the conflicting ID', async () => {
    const fetch = makeFetch({
      'configs/a.json': { body: minimalConfig([minimalQ('phq9')]) },
      'configs/b.json': { body: minimalConfig([minimalQ('phq9')]) },
    });
    const err = await loadConfig(['a', 'b'], { fetch }).catch(e => e);
    expect(err.message).toContain('phq9');
  });

  it('throws ConfigError on duplicate battery ID across files', async () => {
    const fetch = makeFetch({
      'configs/a.json': { body: minimalConfig([minimalQ('phq9')], [minimalBattery('intake', 'phq9')]) },
      'configs/b.json': { body: minimalConfig([minimalQ('gad7')], [minimalBattery('intake', 'gad7')]) },
    });
    await expect(loadConfig(['a', 'b'], { fetch })).rejects.toBeInstanceOf(ConfigError);
  });
});

// ─── Intra-file cross-entity collision ───────────────────────────────────────

describe('cross-entity ID collision (questionnaire ID = battery ID, same file)', () => {
  it('throws ConfigError when battery shares an ID with a questionnaire', async () => {
    const config = minimalConfig([minimalQ('intake')], [minimalBattery('intake', 'intake')]);
    const fetch = makeFetch({ 'configs/a.json': { body: config } });
    await expect(loadConfig(['a'], { fetch })).rejects.toBeInstanceOf(ConfigError);
  });

  it('does not throw when IDs are distinct', async () => {
    const config = minimalConfig([minimalQ('phq9')], [minimalBattery('standard', 'phq9')]);
    const fetch = makeFetch({ 'configs/a.json': { body: config } });
    await expect(loadConfig(['a'], { fetch })).resolves.toBeDefined();
  });
});

// ─── Duplicate session keys ───────────────────────────────────────────────────

describe('duplicate session key validation', () => {
  it('throws ConfigError for duplicate questionnaireId in battery', async () => {
    const config = minimalConfig([minimalQ('phq9')], [{
      id: 'b', title: 'b',
      sequence: [{ questionnaireId: 'phq9' }, { questionnaireId: 'phq9' }],
    }]);
    const fetch = makeFetch({ 'configs/a.json': { body: config } });
    await expect(loadConfig(['a'], { fetch })).rejects.toBeInstanceOf(ConfigError);
  });

  it('allows same questionnaireId with distinct instanceIds', async () => {
    const config = minimalConfig([minimalQ('phq9')], [{
      id: 'b', title: 'b',
      sequence: [
        { questionnaireId: 'phq9', instanceId: 'phq9_pre' },
        { questionnaireId: 'phq9', instanceId: 'phq9_post' },
      ],
    }]);
    const fetch = makeFetch({ 'configs/a.json': { body: config } });
    await expect(loadConfig(['a'], { fetch })).resolves.toBeTruthy();
  });
});

// ─── Option set validation ────────────────────────────────────────────────────

describe('option set validation', () => {
  it('throws ConfigError for select with no options and no defaultOptionSetId', async () => {
    const q = { id: 'test', title: 'Test', items: [{ id: 'q1', type: 'select', text: 'Q1' }], scoring: { method: 'none' }, alerts: [] };
    const fetch = makeFetch({ 'configs/a.json': { body: minimalConfig([q]) } });
    await expect(loadConfig(['a'], { fetch })).rejects.toBeInstanceOf(ConfigError);
  });

  it('accepts select with inline options', async () => {
    const fetch = makeFetch({ 'configs/a.json': { body: minimalConfig([minimalQ()]) } });
    await expect(loadConfig(['a'], { fetch })).resolves.toBeTruthy();
  });

  it('throws ConfigError for duplicate option values', async () => {
    const q = {
      id: 'test', title: 'Test',
      items: [{ id: 'q1', type: 'select', text: 'Q1', options: [{ label: 'No', value: 0 }, { label: 'Also No', value: 0 }, { label: 'Yes', value: 1 }] }],
      scoring: { method: 'none' }, alerts: [],
    };
    const fetch = makeFetch({ 'configs/a.json': { body: minimalConfig([q]) } });
    await expect(loadConfig(['a'], { fetch })).rejects.toBeInstanceOf(ConfigError);
  });
});

// ─── Binary option count ──────────────────────────────────────────────────────

describe('binary option count validation', () => {
  it('accepts binary with exactly 2 options', async () => {
    const q = { ...minimalQ(), items: [{ id: 'b1', type: 'binary', text: 'Q', options: [{ label: 'כן', value: 1 }, { label: 'לא', value: 0 }] }] };
    const fetch = makeFetch({ 'configs/a.json': { body: minimalConfig([q]) } });
    await expect(loadConfig(['a'], { fetch })).resolves.toBeDefined();
  });

  it('throws when binary has 3 options', async () => {
    const q = { ...minimalQ(), items: [{ id: 'b1', type: 'binary', text: 'Q', options: [{ label: 'א', value: 1 }, { label: 'ב', value: 2 }, { label: 'ג', value: 3 }] }] };
    const fetch = makeFetch({ 'configs/a.json': { body: minimalConfig([q]) } });
    await expect(loadConfig(['a'], { fetch })).rejects.toBeInstanceOf(ConfigError);
  });
});

// ─── Multi-source dependency merging (Bug 1.3) ────────────────────────────────

describe('dependency merging across multiple sources', () => {
  // loadConfig() must collect dependencies from ALL loaded config files,
  // not just the first one.

  it('returns dependencies from a single config', async () => {
    const config = { ...minimalConfig([minimalQ()]), dependencies: ['configs/prod/trauma.json'] };
    const fetch = makeFetch({ 'configs/a.json': { body: config } });
    const result = await loadConfig(['a'], { fetch });
    expect(result.dependencies).toEqual(['configs/prod/trauma.json']);
  });

  it('merges dependencies from both configs when loading two sources', async () => {
    const configA = { ...minimalConfig([minimalQ('phq9')]), dependencies: ['configs/prod/trauma.json'] };
    const configB = { ...minimalConfig([minimalQ('gad7')]), dependencies: ['configs/prod/standard.json'] };
    const fetch = makeFetch({
      'configs/a.json': { body: configA },
      'configs/b.json': { body: configB },
    });
    const result = await loadConfig(['a', 'b'], { fetch });
    expect(result.dependencies).toContain('configs/prod/trauma.json');
    expect(result.dependencies).toContain('configs/prod/standard.json');
  });

  it('deduplicates dependencies shared across multiple configs', async () => {
    const shared = 'configs/prod/standard.json';
    const configA = { ...minimalConfig([minimalQ('phq9')]), dependencies: [shared] };
    const configB = { ...minimalConfig([minimalQ('gad7')]), dependencies: [shared] };
    const fetch = makeFetch({
      'configs/a.json': { body: configA },
      'configs/b.json': { body: configB },
    });
    const result = await loadConfig(['a', 'b'], { fetch });
    expect(result.dependencies.filter(d => d === shared)).toHaveLength(1);
  });

  it('returns empty array when no config declares dependencies', async () => {
    const fetch = makeFetch({ 'configs/a.json': { body: minimalConfig([minimalQ()]) } });
    const result = await loadConfig(['a'], { fetch });
    expect(result.dependencies).toEqual([]);
  });
});

// ─── Fetch timeout ────────────────────────────────────────────────────────────

// A fetch mock that never resolves but rejects with AbortError when the
// provided signal fires. This simulates a hung network request.
function makeHangingFetch() {
  return vi.fn((url, { signal } = {}) =>
    new Promise((_, reject) => {
      signal?.addEventListener('abort', () => {
        reject(new DOMException('The user aborted a request.', 'AbortError'));
      });
    }),
  );
}

describe('fetch timeout', () => {
  it('throws ConfigFetchError with timedOut:true when fetch hangs past timeout', async () => {
    vi.useFakeTimers();
    try {
      const fetch = makeHangingFetch();
      const promise = loadConfig(['a'], { fetch, fetchTimeoutMs: 5000 });
      const errPromise = promise.catch(e => e); // register handler before timers fire
      await vi.runAllTimersAsync();
      const err = await errPromise;
      expect(err).toBeInstanceOf(ConfigFetchError);
      expect(err.timedOut).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('timedOut flag is false on normal HTTP errors', async () => {
    const fetch = makeFetch({ 'configs/a.json': { ok: false, status: 503, statusText: 'Service Unavailable' } });
    const err = await loadConfig(['a'], { fetch, fetchTimeoutMs: 5000 }).catch(e => e);
    expect(err).toBeInstanceOf(ConfigFetchError);
    expect(err.timedOut).toBe(false);
  });

  it('timedOut flag is false on network errors', async () => {
    const fetch = makeFetch({ 'configs/a.json': new TypeError('Failed to fetch') });
    const err = await loadConfig(['a'], { fetch, fetchTimeoutMs: 5000 }).catch(e => e);
    expect(err).toBeInstanceOf(ConfigFetchError);
    expect(err.timedOut).toBe(false);
  });

  it('error message names the timed-out URL', async () => {
    vi.useFakeTimers();
    try {
      const fetch = makeHangingFetch();
      const promise = loadConfig(['a'], { fetch, fetchTimeoutMs: 2000 });
      const errPromise = promise.catch(e => e);
      await vi.runAllTimersAsync();
      const err = await errPromise;
      expect(err.message).toContain('configs/a.json');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not fire timeout when fetch resolves before the deadline', async () => {
    vi.useFakeTimers();
    try {
      const fetch = makeFetch({ 'configs/a.json': { body: minimalConfig([minimalQ()]) } });
      // Resolves immediately — clearTimeout runs in finally before any timer fires.
      const resultPromise = loadConfig(['a'], { fetch, fetchTimeoutMs: 5000 });
      await vi.runAllTimersAsync();
      const result = await resultPromise;
      expect(result.questionnaires).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('disabling timeout (fetchTimeoutMs: 0) passes no signal to fetch', async () => {
    const fetch = vi.fn(async (url, options) => {
      // When timeout is disabled, fetchAndValidate must not pass an options object.
      expect(options).toBeUndefined();
      return { ok: true, status: 200, statusText: 'OK', json: async () => minimalConfig([minimalQ()]) };
    });
    await loadConfig(['a'], { fetch, fetchTimeoutMs: 0 });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('timeout applies independently to each source in a multi-source load', async () => {
    vi.useFakeTimers();
    try {
      // Source 'a' resolves immediately so its timer is cleared before advancing time.
      // Source 'b' hangs and should time out, causing Promise.all to reject.
      const fetch = vi.fn((url, { signal } = {}) => {
        if (url === 'configs/a.json') {
          return Promise.resolve({
            ok: true, status: 200, statusText: 'OK',
            json: async () => minimalConfig([minimalQ('phq9')]),
          });
        }
        return new Promise((_, reject) => {
          signal?.addEventListener('abort', () =>
            reject(new DOMException('The user aborted a request.', 'AbortError')),
          );
        });
      });

      const promise = loadConfig(['a', 'b'], { fetch, fetchTimeoutMs: 3000 });
      // Register .catch() before advancing timers so rejection is never unhandled.
      // runAllTimersAsync: flushes microtasks first (resolves 'a', clears its timer),
      // then fires the remaining timer for 'b', causing it to abort.
      const errPromise = promise.catch(e => e);
      await vi.runAllTimersAsync();
      const err = await errPromise;
      expect(err).toBeInstanceOf(ConfigFetchError);
      expect(err.timedOut).toBe(true);
      expect(err.url).toBe('configs/b.json');
    } finally {
      vi.useRealTimers();
    }
  });
});
