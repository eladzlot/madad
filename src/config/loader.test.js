import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadConfig, ConfigFetchError, ConfigValidationError, ConfigError } from './loader.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const minimalQ = (id = 'phq9') => ({
  id,
  title: 'Test',
  items: [{ id: 'q1', type: 'likert', text: 'Q1', options: [{ label: 'No', value: 0 }, { label: 'Yes', value: 1 }] }],
  scoring: { method: 'none' },
  alerts: [],
});

const minimalConfig = (questionnaires = [], batteries = []) => ({
  id: 'test_set',
  version: '1.0',
  questionnaires,
  batteries,
});

function makeFetch(responses) {
  // responses: { [url]: { ok, status, json } | Error }
  return vi.fn(async (url) => {
    const res = responses[url];
    if (!res) throw new TypeError(`fetch: unexpected URL "${url}"`);
    if (res instanceof Error) throw res;
    return {
      ok: res.ok ?? true,
      status: res.status ?? 200,
      statusText: res.statusText ?? 'OK',
      json: async () => res.body,
    };
  });
}

// ─── URL resolution ───────────────────────────────────────────────────────────

describe('URL resolution', () => {
  it('resolves slug to /configs/<slug>.json', async () => {
    const fetch = makeFetch({ '/configs/standard.json': { body: minimalConfig() } });
    await loadConfig(['standard'], { fetch });
    expect(fetch).toHaveBeenCalledWith('/configs/standard.json');
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
    const fetch = makeFetch({ '/configs/missing.json': { ok: false, status: 404, statusText: 'Not Found' } });
    await expect(loadConfig(['missing'], { fetch })).rejects.toBeInstanceOf(ConfigFetchError);
  });

  it('throws ConfigFetchError on network error', async () => {
    const fetch = makeFetch({ '/configs/bad.json': new TypeError('Failed to fetch') });
    await expect(loadConfig(['bad'], { fetch })).rejects.toBeInstanceOf(ConfigFetchError);
  });
});

// ─── Validation errors ────────────────────────────────────────────────────────

describe('validation errors', () => {
  it('throws ConfigValidationError for invalid config', async () => {
    const fetch = makeFetch({ '/configs/bad.json': { body: { not: 'valid' } } });
    await expect(loadConfig(['bad'], { fetch })).rejects.toBeInstanceOf(ConfigValidationError);
  });

  it('ConfigValidationError exposes validationErrors array', async () => {
    const fetch = makeFetch({ '/configs/bad.json': { body: {} } });
    const err = await loadConfig(['bad'], { fetch }).catch(e => e);
    expect(Array.isArray(err.validationErrors)).toBe(true);
    expect(err.validationErrors.length).toBeGreaterThan(0);
  });
});

// ─── Merge ────────────────────────────────────────────────────────────────────

describe('merging multiple sources', () => {
  it('merges questionnaires from multiple files', async () => {
    const fetch = makeFetch({
      '/configs/a.json': { body: minimalConfig([minimalQ('phq9')]) },
      '/configs/b.json': { body: minimalConfig([minimalQ('gad7')]) },
    });
    const config = await loadConfig(['a', 'b'], { fetch });
    expect(config.questionnaires.map(q => q.id)).toEqual(expect.arrayContaining(['phq9', 'gad7']));
  });

  it('later file wins on duplicate questionnaire ID', async () => {
    const q1 = { ...minimalQ('phq9'), title: 'First' };
    const q2 = { ...minimalQ('phq9'), title: 'Second' };
    const fetch = makeFetch({
      '/configs/a.json': { body: minimalConfig([q1]) },
      '/configs/b.json': { body: minimalConfig([q2]) },
    });
    const config = await loadConfig(['a', 'b'], { fetch });
    const phq9 = config.questionnaires.find(q => q.id === 'phq9');
    expect(phq9.title).toBe('Second');
  });

  it('merges batteries from multiple files', async () => {
    const bat = (id, qId) => ({ id, title: id, sequence: [{ questionnaireId: qId }] });
    const fetch = makeFetch({
      '/configs/a.json': { body: minimalConfig([minimalQ('phq9')], [bat('standard', 'phq9')]) },
      '/configs/b.json': { body: minimalConfig([minimalQ('gad7')], [bat('trauma', 'gad7')]) },
    });
    const config = await loadConfig(['a', 'b'], { fetch });
    expect(config.batteries.map(b => b.id)).toEqual(expect.arrayContaining(['standard', 'trauma']));
  });
});

// ─── filterIds ────────────────────────────────────────────────────────────────

describe('filterIds option', () => {
  it('filters questionnaires to specified IDs', async () => {
    const fetch = makeFetch({
      '/configs/a.json': { body: minimalConfig([minimalQ('phq9'), minimalQ('gad7'), minimalQ('pcl5')]) },
    });
    const config = await loadConfig(['a'], { fetch, filterIds: ['phq9', 'pcl5'] });
    expect(config.questionnaires.map(q => q.id)).toEqual(['phq9', 'pcl5']);
  });

  it('returns all questionnaires when filterIds is empty', async () => {
    const fetch = makeFetch({
      '/configs/a.json': { body: minimalConfig([minimalQ('phq9'), minimalQ('gad7')]) },
    });
    const config = await loadConfig(['a'], { fetch, filterIds: [] });
    expect(config.questionnaires).toHaveLength(2);
  });
});

// ─── Duplicate session keys ───────────────────────────────────────────────────

describe('duplicate session key validation', () => {
  it('throws ConfigError for duplicate questionnaireId in battery', async () => {
    const config = minimalConfig([minimalQ('phq9')], [{
      id: 'b', title: 'b',
      sequence: [{ questionnaireId: 'phq9' }, { questionnaireId: 'phq9' }],
    }]);
    const fetch = makeFetch({ '/configs/a.json': { body: config } });
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
    const fetch = makeFetch({ '/configs/a.json': { body: config } });
    await expect(loadConfig(['a'], { fetch })).resolves.toBeTruthy();
  });

  it('detects duplicates inside if branches', async () => {
    const config = minimalConfig([minimalQ('phq9'), minimalQ('pcl5')], [{
      id: 'b', title: 'b',
      sequence: [
        { questionnaireId: 'phq9' },
        { type: 'if', condition: 'score.phq9 >= 10',
          then: [{ questionnaireId: 'phq9' }], else: [] },
      ],
    }]);
    const fetch = makeFetch({ '/configs/a.json': { body: config } });
    await expect(loadConfig(['a'], { fetch })).rejects.toBeInstanceOf(ConfigError);
  });
});

// ─── Option set validation ────────────────────────────────────────────────────

describe('option set validation', () => {
  it('throws ConfigError for likert item with no options and no defaultOptionSetId', async () => {
    const q = {
      id: 'test', title: 'Test',
      items: [{ id: 'q1', type: 'likert', text: 'Q1' }], // no options, no optionSetId
      scoring: { method: 'none' }, alerts: [],
    };
    const fetch = makeFetch({ '/configs/a.json': { body: minimalConfig([q]) } });
    await expect(loadConfig(['a'], { fetch })).rejects.toBeInstanceOf(ConfigError);
  });

  it('throws ConfigError for likert referencing non-existent optionSetId', async () => {
    const q = {
      id: 'test', title: 'Test',
      items: [{ id: 'q1', type: 'likert', text: 'Q1', optionSetId: 'missing' }],
      scoring: { method: 'none' }, alerts: [],
    };
    const fetch = makeFetch({ '/configs/a.json': { body: minimalConfig([q]) } });
    await expect(loadConfig(['a'], { fetch })).rejects.toBeInstanceOf(ConfigError);
  });

  it('accepts likert with inline options', async () => {
    const fetch = makeFetch({ '/configs/a.json': { body: minimalConfig([minimalQ()]) } });
    await expect(loadConfig(['a'], { fetch })).resolves.toBeTruthy();
  });

  it('accepts likert with valid optionSetId', async () => {
    const q = {
      id: 'test', title: 'Test',
      optionSets: { scale: [{ label: 'No', value: 0 }, { label: 'Yes', value: 1 }] },
      items: [{ id: 'q1', type: 'likert', text: 'Q1', optionSetId: 'scale' }],
      scoring: { method: 'none' }, alerts: [],
    };
    const fetch = makeFetch({ '/configs/a.json': { body: minimalConfig([q]) } });
    await expect(loadConfig(['a'], { fetch })).resolves.toBeTruthy();
  });

  it('accepts likert with defaultOptionSetId', async () => {
    const q = {
      id: 'test', title: 'Test',
      defaultOptionSetId: 'scale',
      optionSets: { scale: [{ label: 'No', value: 0 }, { label: 'Yes', value: 1 }] },
      items: [{ id: 'q1', type: 'likert', text: 'Q1' }],
      scoring: { method: 'none' }, alerts: [],
    };
    const fetch = makeFetch({ '/configs/a.json': { body: minimalConfig([q]) } });
    await expect(loadConfig(['a'], { fetch })).resolves.toBeTruthy();
  });

  it('throws ConfigError for duplicate option values in inline options', async () => {
    const q = {
      id: 'test', title: 'Test',
      items: [{ id: 'q1', type: 'likert', text: 'Q1', options: [
        { label: 'No', value: 0 },
        { label: 'Also No', value: 0 },  // duplicate
        { label: 'Yes', value: 1 },
      ]}],
      scoring: { method: 'none' }, alerts: [],
    };
    const fetch = makeFetch({ '/configs/a.json': { body: minimalConfig([q]) } });
    await expect(loadConfig(['a'], { fetch })).rejects.toBeInstanceOf(ConfigError);
  });

  it('throws ConfigError for duplicate option values in an option set', async () => {
    const q = {
      id: 'test', title: 'Test',
      optionSets: { scale: [{ label: 'A', value: 1 }, { label: 'B', value: 1 }] },
      items: [{ id: 'q1', type: 'likert', text: 'Q1', optionSetId: 'scale' }],
      scoring: { method: 'none' }, alerts: [],
    };
    const fetch = makeFetch({ '/configs/a.json': { body: minimalConfig([q]) } });
    await expect(loadConfig(['a'], { fetch })).rejects.toBeInstanceOf(ConfigError);
  });
});

// ─── Binary option count validation ──────────────────────────────────────────

describe('binary option count validation', () => {
  function binaryQ(options) {
    return {
      ...minimalQ(),
      items: [{ id: 'b1', type: 'binary', text: 'שאלה בינארית', options }],
    };
  }

  it('accepts binary item with exactly 2 inline options', async () => {
    const q = binaryQ([{ label: 'כן', value: 1 }, { label: 'לא', value: 0 }]);
    const fetch = makeFetch({ '/configs/a.json': { body: minimalConfig([q]) } });
    await expect(loadConfig(['a'], { fetch })).resolves.toBeDefined();
  });

  it('throws when binary has 1 inline option (caught by schema)', async () => {
    const q = binaryQ([{ label: 'כן', value: 1 }]);
    const fetch = makeFetch({ '/configs/a.json': { body: minimalConfig([q]) } });
    // Schema enforces minItems:2 on optionList, so this throws ConfigValidationError
    await expect(loadConfig(['a'], { fetch })).rejects.toBeInstanceOf(ConfigValidationError);
  });

  it('throws ConfigError when binary has 3 inline options', async () => {
    const q = binaryQ([
      { label: 'א', value: 1 },
      { label: 'ב', value: 2 },
      { label: 'ג', value: 3 },
    ]);
    const fetch = makeFetch({ '/configs/a.json': { body: minimalConfig([q]) } });
    await expect(loadConfig(['a'], { fetch })).rejects.toBeInstanceOf(ConfigError);
  });

  it('throws ConfigError when binary option set has 3 options', async () => {
    const q = {
      ...minimalQ(),
      optionSets: {
        yesno: [
          { label: 'א', value: 1 },
          { label: 'ב', value: 2 },
          { label: 'ג', value: 3 },
        ],
      },
      items: [{ id: 'b1', type: 'binary', text: 'שאלה', optionSetId: 'yesno' }],
    };
    const fetch = makeFetch({ '/configs/a.json': { body: minimalConfig([q]) } });
    await expect(loadConfig(['a'], { fetch })).rejects.toBeInstanceOf(ConfigError);
  });

  it('accepts binary item referencing a 2-option option set', async () => {
    const q = {
      ...minimalQ(),
      optionSets: {
        yesno: [{ label: 'כן', value: 1 }, { label: 'לא', value: 0 }],
      },
      items: [{ id: 'b1', type: 'binary', text: 'שאלה', optionSetId: 'yesno' }],
    };
    const fetch = makeFetch({ '/configs/a.json': { body: minimalConfig([q]) } });
    await expect(loadConfig(['a'], { fetch })).resolves.toBeDefined();
  });
});

// ─── Return shape ─────────────────────────────────────────────────────────────

describe('resolved config shape', () => {
  it('returns questionnaires, batteries, version, resolvedAt', async () => {
    const fetch = makeFetch({ '/configs/a.json': { body: minimalConfig([minimalQ()]) } });
    const config = await loadConfig(['a'], { fetch });
    expect(config).toMatchObject({
      questionnaires: expect.any(Array),
      batteries: expect.any(Array),
      resolvedAt: expect.any(String),
    });
  });

  it('throws when no sources provided', async () => {
    await expect(loadConfig([], { fetch: vi.fn() })).rejects.toBeInstanceOf(ConfigError);
  });
});
