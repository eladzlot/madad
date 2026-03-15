import { describe, it, expect, vi } from 'vitest';
import { loadConfig, ConfigFetchError, ConfigValidationError, ConfigError } from './loader.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const minimalQ = (id = 'phq9') => ({
  id, title: 'Test',
  items: [{ id: 'q1', type: 'likert', text: 'Q1', options: [{ label: 'No', value: 0 }, { label: 'Yes', value: 1 }] }],
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
    await loadConfig(['standard'], { fetch });
    expect(fetch).toHaveBeenCalledWith('configs/standard.json');
  });

  it('uses full https URL as-is', async () => {
    const url = 'https://example.com/my-config.json';
    const fetch = makeFetch({ [url]: { body: minimalConfig() } });
    await loadConfig([url], { fetch });
    expect(fetch).toHaveBeenCalledWith(url);
  });

  it('uses absolute path as-is', async () => {
    const fetch = makeFetch({ '/custom/path.json': { body: minimalConfig() } });
    await loadConfig(['/custom/path.json'], { fetch });
    expect(fetch).toHaveBeenCalledWith('/custom/path.json');
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
  it('throws ConfigError for likert with no options and no defaultOptionSetId', async () => {
    const q = { id: 'test', title: 'Test', items: [{ id: 'q1', type: 'likert', text: 'Q1' }], scoring: { method: 'none' }, alerts: [] };
    const fetch = makeFetch({ 'configs/a.json': { body: minimalConfig([q]) } });
    await expect(loadConfig(['a'], { fetch })).rejects.toBeInstanceOf(ConfigError);
  });

  it('accepts likert with inline options', async () => {
    const fetch = makeFetch({ 'configs/a.json': { body: minimalConfig([minimalQ()]) } });
    await expect(loadConfig(['a'], { fetch })).resolves.toBeTruthy();
  });

  it('throws ConfigError for duplicate option values', async () => {
    const q = {
      id: 'test', title: 'Test',
      items: [{ id: 'q1', type: 'likert', text: 'Q1', options: [{ label: 'No', value: 0 }, { label: 'Also No', value: 0 }, { label: 'Yes', value: 1 }] }],
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
