import { describe, it, expect, vi, beforeEach } from 'vitest';
import { state } from './composer-state.js';

// Reset state before each test
beforeEach(() => {
  state.batteries             = [];
  state.questionnaires        = [];
  state.sourceByItem          = new Map();
  state.dependenciesBySource  = new Map();
  state.selected              = [];
  state.warnings              = [];
});

// We need to mock fetch before importing loader functions
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { loadManifest, loadAllConfigs } = await import('./composer-loader.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

const minimalQ = (id, title = id, description = '') => ({
  id, title, description,
  items: [{ id: 'q1', type: 'select', text: 'Q', options: [{ label: 'No', value: 0 }, { label: 'Yes', value: 1 }] }],
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

function makeConfigResponseWithDeps(questionnaires = [], batteries = [], dependencies = []) {
  return {
    ok: true, status: 200,
    json: async () => ({ id: 'test', version: '1.0', questionnaires, batteries, dependencies }),
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
    expect(state.questionnaires[0].sourceUrl).toBe('configs/a.json');
  });

  it('sets sourceUrl on batteries', async () => {
    mockFetch.mockResolvedValueOnce(makeConfigResponse([minimalQ('phq9')], [minimalBattery('intake')]));
    await loadAllConfigs({ configs: [{ name: 'Test', url: '/configs/a.json' }] });
    expect(state.batteries[0].sourceUrl).toBe('configs/a.json');
  });

  it('populates sourceByItem map for questionnaires', async () => {
    mockFetch.mockResolvedValueOnce(makeConfigResponse([minimalQ('phq9')]));
    await loadAllConfigs({ configs: [{ name: 'Test', url: '/configs/a.json' }] });
    expect(state.sourceByItem.get('phq9')).toBe('configs/a.json');
  });

  it('populates sourceByItem map for batteries', async () => {
    mockFetch.mockResolvedValueOnce(makeConfigResponse([minimalQ('phq9')], [minimalBattery('intake')]));
    await loadAllConfigs({ configs: [{ name: 'Test', url: '/configs/a.json' }] });
    expect(state.sourceByItem.get('intake')).toBe('configs/a.json');
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

  it('includes configs marked dev:true when running in dev mode (Vitest sets DEV=true)', async () => {
    // Vitest runs with import.meta.env.DEV = true, so dev configs are included
    mockFetch
      .mockResolvedValueOnce(makeConfigResponse([minimalQ('phq9')]))
      .mockResolvedValueOnce(makeConfigResponse([minimalQ('e2e_q')]));
    await loadAllConfigs({
      configs: [
        { name: 'Prod', url: '/configs/prod/standard.json' },
        { name: 'Dev only', url: '/configs/test/e2e.json', dev: true },
      ],
    });
    // Both configs loaded because IS_DEV=true in test environment
    expect(state.questionnaires.map(q => q.id)).toContain('phq9');
    expect(state.questionnaires.map(q => q.id)).toContain('e2e_q');
  });

  it('marks questionnaires from hidden configs with hidden:true', async () => {
    mockFetch.mockResolvedValueOnce(makeConfigResponse([minimalQ('e2e_q')]));
    await loadAllConfigs({
      configs: [{ name: 'E2E', url: '/configs/test/e2e.json', hidden: true }],
    });
    expect(state.questionnaires[0].hidden).toBe(true);
  });

  it('marks questionnaires from non-hidden configs with hidden:false', async () => {
    mockFetch.mockResolvedValueOnce(makeConfigResponse([minimalQ('phq9')]));
    await loadAllConfigs({
      configs: [{ name: 'Prod', url: '/configs/prod/standard.json' }],
    });
    expect(state.questionnaires[0].hidden).toBe(false);
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


  it('warning includes the fetch URL when config fails', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await loadAllConfigs({ configs: [{ name: 'Bad', url: '/configs/bad.json' }] });
    expect(state.warnings[0]).toContain('/configs/bad.json');
  });

  it('warning includes validation error detail when config fails schema validation', async () => {
    // Serve a config that fails AJV schema validation (missing required 'id' field)
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ version: '1.0', questionnaires: [] }), // missing top-level 'id'
    });
    await loadAllConfigs({ configs: [{ name: 'Invalid', url: '/configs/invalid.json' }] });
    expect(state.warnings).toHaveLength(1);
    // Warning should contain the URL
    expect(state.warnings[0]).toContain('/configs/invalid.json');
    // Warning should contain some validation detail, not just the URL
    expect(state.warnings[0].length).toBeGreaterThan('/configs/invalid.json'.length + 5);
  });

  // ── dependency declaration ────────────────────────────────────────────────────

  it('populates dependenciesBySource when config declares dependencies', async () => {
    mockFetch.mockResolvedValueOnce(
      makeConfigResponseWithDeps([minimalQ('diamond_sr')], [minimalBattery('clinical_intake', 'Clinical Intake', 'diamond_sr')], ['configs/prod/standard.json'])
    );
    await loadAllConfigs({ configs: [{ name: 'Intake', url: '/configs/prod/intake.json' }] });
    expect(state.dependenciesBySource.get('configs/prod/intake.json')).toEqual(['configs/prod/standard.json']);
  });

  it('strips leading slash from declared dependency paths', async () => {
    mockFetch.mockResolvedValueOnce(
      makeConfigResponseWithDeps([minimalQ('q1')], [], ['/configs/prod/standard.json'])
    );
    await loadAllConfigs({ configs: [{ name: 'Test', url: '/configs/a.json' }] });
    expect(state.dependenciesBySource.get('configs/a.json')).toEqual(['configs/prod/standard.json']);
  });

  it('does not set dependenciesBySource entry when no dependencies declared', async () => {
    mockFetch.mockResolvedValueOnce(makeConfigResponse([minimalQ('phq9')]));
    await loadAllConfigs({ configs: [{ name: 'Test', url: '/configs/a.json' }] });
    expect(state.dependenciesBySource.has('configs/a.json')).toBe(false);
  });

  it('buildUrl includes dependency source when battery config declares it', async () => {
    // Load intake.json which has clinical_intake battery and depends on standard.json
    mockFetch.mockResolvedValueOnce(
      makeConfigResponseWithDeps(
        [minimalQ('diamond_sr')],
        [minimalBattery('clinical_intake', 'Clinical Intake', 'diamond_sr')],
        ['configs/prod/standard.json']
      )
    );
    await loadAllConfigs({ configs: [{ name: 'Intake', url: '/configs/prod/intake.json' }] });

    // Select the battery
    const { buildUrl } = await import('./composer-state.js');
    state.selected = ['clinical_intake'];
    const url = buildUrl('http://localhost');
    const configs = new URL(url).searchParams.get('configs').split(',');
    expect(configs).toContain('configs/prod/intake.json');
    expect(configs).toContain('configs/prod/standard.json');
  });
});
