import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { loadCatalog, CATALOG_VERSION, CATALOG_URL } = await import('./composer-loader.js');

beforeEach(() => { mockFetch.mockReset(); });

function catalog(entries = []) {
  return { catalogVersion: CATALOG_VERSION, entries };
}

describe('loadCatalog', () => {
  it('fetches CATALOG_URL and returns parsed JSON', async () => {
    const cat = catalog([{ id: 'phq9' }]);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => cat });
    const result = await loadCatalog();
    expect(mockFetch.mock.calls[0][0]).toBe(CATALOG_URL);
    expect(result).toEqual(cat);
  });

  it('revalidates with cache: no-cache (mutable, unhashed file)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => catalog() });
    await loadCatalog();
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ cache: 'no-cache' });
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(loadCatalog()).rejects.toThrow('404');
  });
});
