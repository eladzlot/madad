import { describe, it, expect, vi, beforeEach } from 'vitest';
import { state } from './composer-state.js';

// Reset state before each test
beforeEach(() => {
  state.batteries      = [];
  state.questionnaires = [];
  state.sourceByItem   = new Map();
  state.selected       = [];
  state.warnings       = [];
});

// We need to mock fetch before importing loader functions
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { loadManifest, loadAllConfigs } = await import('./composer-loader.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

const minimalQ = (id, title = id, description = '') => ({
  id, title, description,
  items: [{ id: 'q1', type: 'likert', text: 'Q', options: [{ label: 'No', value: 0 }, { label: 'Yes', value: 1 }] }],
  scoring: { method: 'none' }, alerts: [],
});

const minimalBattery = (id, title = id, qId = 'phq9') => ({
  id, title, sequence: [{ questionnaireId: qId }],
});

function makeConfigResponse(questionnaires = [], batteries = []) {
  return {
    ok: true, status: 200,
    json: async () => ({ id: 'test', version: '1.0', questionnaires, batteries }),
  };
}

// ── loadManifest ──────────────────────────────────────────────────────────────

describe('loadManifest', () => {
  it('fetches MANIFEST_URL and returns parsed JSON', async () => {
    const manifest = { configs: [{ name: 'Test', url: '/configs/test.json' }] };
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => manifest });
    const result = await loadManifest();
    expect(result).toEqual(manifest);
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(loadManifest()).rejects.toThrow();
  });
});

// ── loadAllConfigs ────────────────────────────────────────────────────────────

describe('loadAllConfigs', () => {
  it('populates state.questionnaires from loaded configs', async () => {
    mockFetch.mockResolvedValueOnce(makeConfigResponse([minimalQ('phq9')]));
    await loadAllConfigs({ configs: [{ name: 'Test', url: '/configs/a.json' }] });
    expect(state.questionnaires).toHaveLength(1);
    expect(state.questionnaires[0].id).toBe('phq9');
  });

  it('populates state.batteries from loaded configs', async () => {
    mockFetch.mockResolvedValueOnce(makeConfigResponse([minimalQ('phq9')], [minimalBattery('intake')]));
    await loadAllConfigs({ configs: [{ name: 'Test', url: '/configs/a.json' }] });
    expect(state.batteries).toHaveLength(1);
    expect(state.batteries[0].id).toBe('intake');
  });

  it('sets sourceUrl on questionnaires', async () => {
    mockFetch.mockResolvedValueOnce(makeConfigResponse([minimalQ('phq9')]));
    await loadAllConfigs({ configs: [{ name: 'Test', url: '/configs/a.json' }] });
    expect(state.questionnaires[0].sourceUrl).toBe('/configs/a.json');
  });

  it('sets sourceUrl on batteries', async () => {
    mockFetch.mockResolvedValueOnce(makeConfigResponse([minimalQ('phq9')], [minimalBattery('intake')]));
    await loadAllConfigs({ configs: [{ name: 'Test', url: '/configs/a.json' }] });
    expect(state.batteries[0].sourceUrl).toBe('/configs/a.json');
  });

  it('populates sourceByItem map for questionnaires', async () => {
    mockFetch.mockResolvedValueOnce(makeConfigResponse([minimalQ('phq9')]));
    await loadAllConfigs({ configs: [{ name: 'Test', url: '/configs/a.json' }] });
    expect(state.sourceByItem.get('phq9')).toBe('/configs/a.json');
  });

  it('populates sourceByItem map for batteries', async () => {
    mockFetch.mockResolvedValueOnce(makeConfigResponse([minimalQ('phq9')], [minimalBattery('intake')]));
    await loadAllConfigs({ configs: [{ name: 'Test', url: '/configs/a.json' }] });
    expect(state.sourceByItem.get('intake')).toBe('/configs/a.json');
  });

  it('carries description through (empty string when absent)', async () => {
    mockFetch.mockResolvedValueOnce(makeConfigResponse([minimalQ('phq9', 'PHQ-9', '')]));
    await loadAllConfigs({ configs: [{ name: 'Test', url: '/configs/a.json' }] });
    expect(state.questionnaires[0].description).toBe('');
  });

  it('carries description when present', async () => {
    const q = { ...minimalQ('phq9'), description: 'A depression screener' };
    mockFetch.mockResolvedValueOnce(makeConfigResponse([q]));
    await loadAllConfigs({ configs: [{ name: 'Test', url: '/configs/a.json' }] });
    expect(state.questionnaires[0].description).toBe('A depression screener');
  });

  it('merges items from multiple configs', async () => {
    mockFetch
      .mockResolvedValueOnce(makeConfigResponse([minimalQ('phq9')]))
      .mockResolvedValueOnce(makeConfigResponse([minimalQ('gad7')]));
    await loadAllConfigs({
      configs: [
        { name: 'A', url: '/configs/a.json' },
        { name: 'B', url: '/configs/b.json' },
      ],
    });
    expect(state.questionnaires.map(q => q.id)).toContain('phq9');
    expect(state.questionnaires.map(q => q.id)).toContain('gad7');
  });

  it('continues and warns when one config fails to load', async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(makeConfigResponse([minimalQ('gad7')]));
    await loadAllConfigs({
      configs: [
        { name: 'Bad', url: '/configs/bad.json' },
        { name: 'Good', url: '/configs/good.json' },
      ],
    });
    expect(state.questionnaires).toHaveLength(1);
    expect(state.questionnaires[0].id).toBe('gad7');
    expect(state.warnings).toHaveLength(1);
  });

  it('adds a warning message for each failed config', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await loadAllConfigs({
      configs: [
        { name: 'A', url: '/configs/a.json' },
        { name: 'B', url: '/configs/b.json' },
      ],
    });
    expect(state.warnings).toHaveLength(2);
  });
});
