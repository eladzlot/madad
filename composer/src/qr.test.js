import { describe, it, expect } from 'vitest';
import { encodeQr, matrixToPath, matrixToPngBlob, fullSize, QUIET_ZONE } from './qr.js';

describe('encodeQr', () => {
  it('produces a square matrix with a finder pattern in the top-left corner', async () => {
    const { size, dark } = await encodeQr('https://app.ezmadad.com/?items=phq9');
    expect(size).toBeGreaterThanOrEqual(21);
    expect((size - 21) % 4).toBe(0);              // every QR version is 21 + 4k
    expect(dark).toHaveLength(size);
    expect(dark.every(row => row.length === size)).toBe(true);
    // Finder pattern: 7×7 dark ring around a 3×3 dark centre with a light ring between.
    expect(dark[0].slice(0, 7)).toEqual([true, true, true, true, true, true, true]);
    expect(dark[1].slice(0, 7)).toEqual([true, false, false, false, false, false, true]);
    expect(dark[3].slice(0, 7)).toEqual([true, false, true, true, true, false, true]);
  });

  it('grows the version for a long URL and stays deterministic', async () => {
    const short = await encodeQr('https://x/?items=phq9');
    const long = await encodeQr('https://app.ezmadad.com/?items=phq9,gad7,pcl5,ocir,bdi2,who5#pid=TRC-2025-000123');
    expect(long.size).toBeGreaterThan(short.size);
    const again = await encodeQr('https://x/?items=phq9');
    expect(again).toEqual(short);
  });
});

describe('matrixToPath', () => {
  const m = { size: 3, dark: [[true, true, false], [false, false, false], [true, false, true]] };

  it('merges horizontal runs and offsets by the quiet zone', () => {
    expect(matrixToPath(m, 0)).toBe('M0 0h2v1h-2zM0 2h1v1h-1zM2 2h1v1h-1z');
    expect(matrixToPath(m, 4)).toBe('M4 4h2v1h-2zM4 6h1v1h-1zM6 6h1v1h-1z');
  });

  it('defaults to the standard 4-module quiet zone', () => {
    expect(QUIET_ZONE).toBe(4);
    expect(matrixToPath(m)).toBe(matrixToPath(m, 4));
    expect(fullSize(21)).toBe(29);
  });

  it('returns an empty path for an all-light matrix', () => {
    expect(matrixToPath({ size: 2, dark: [[false, false], [false, false]] })).toBe('');
  });
});

describe('matrixToPngBlob', () => {
  it('paints the background, then one rect per dark module, scaled and offset', async () => {
    const calls = [];
    const fakeBlob = { type: 'image/png' };
    const createCanvas = (w, h) => ({
      width: w, height: h,
      getContext: () => ({
        set fillStyle(v) { calls.push(['fill', v]); },
        fillRect: (...a) => calls.push(['rect', ...a]),
      }),
      toBlob: (cb, type) => { calls.push(['toBlob', type]); cb(fakeBlob); },
    });
    const m = { size: 2, dark: [[true, false], [false, true]] };
    const blob = await matrixToPngBlob(m, { scale: 10, quiet: 1, createCanvas });
    expect(blob).toBe(fakeBlob);
    expect(calls).toEqual([
      ['fill', '#fff'], ['rect', 0, 0, 40, 40],
      ['fill', '#000'], ['rect', 10, 10, 10, 10], ['rect', 20, 20, 10, 10],
      ['toBlob', 'image/png'],
    ]);
  });

  it('rejects when the canvas yields no blob', async () => {
    const createCanvas = () => ({
      getContext: () => ({ fillRect() {} }),
      toBlob: (cb) => cb(null),
    });
    await expect(matrixToPngBlob({ size: 1, dark: [[true]] }, { createCanvas })).rejects.toThrow(/toBlob/);
  });
});
