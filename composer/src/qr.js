// qr.js — pure QR helpers for the composer.
//
// The encoder (qrcode-generator, MIT, zero deps) is loaded lazily on first use
// so it never sits in the composer startup bundle — a patient link exists only
// after the clinician picks something, and most sessions never open the QR at
// all. Everything else here is synchronous and framework-free so it unit-tests
// without a DOM: the matrix → SVG path conversion and the PNG rasteriser.

// Modules of blank border around the symbol. The QR spec asks for 4; scanners
// tolerate less but 4 keeps a dark-rail thumbnail reliable.
export const QUIET_ZONE = 4;

// Error correction M (≈15% recoverable). L would shave a version but a link
// shown on a laptop screen across a desk gets glare and camera shake; H would
// push a 90-char URL to version 7+ and shrink the modules on the thumbnail.
const ERROR_CORRECTION = 'M';

let encoderPromise = null;

function loadEncoder() {
  // Vite splits the dynamic import into its own chunk (budgeted separately in
  // scripts/check-size.mjs). The default export is the factory function.
  encoderPromise ??= import('qrcode-generator').then(m => m.default ?? m);
  return encoderPromise;
}

// Encodes `text` and returns { size, dark } where dark[row][col] is a boolean
// matrix of `size` × `size` modules (no quiet zone — callers add their own).
// Type number 0 lets the library pick the smallest version that fits.
export async function encodeQr(text) {
  const qrcode = await loadEncoder();
  const qr = qrcode(0, ERROR_CORRECTION);
  qr.addData(text, 'Byte');
  qr.make();
  const size = qr.getModuleCount();
  const dark = [];
  for (let r = 0; r < size; r++) {
    const row = new Array(size);
    for (let c = 0; c < size; c++) row[c] = qr.isDark(r, c);
    dark.push(row);
  }
  return { size, dark };
}

// One SVG path covering every dark module, in a coordinate space of one unit
// per module with the quiet zone already offset. Horizontal runs are merged
// into single rectangles so the path stays small (a version-5 code is ~1k
// chars instead of ~4k) and hairline seams between adjacent modules vanish.
export function matrixToPath({ size, dark }, quiet = QUIET_ZONE) {
  const parts = [];
  for (let r = 0; r < size; r++) {
    let c = 0;
    while (c < size) {
      if (!dark[r][c]) { c++; continue; }
      const start = c;
      while (c < size && dark[r][c]) c++;
      parts.push(`M${start + quiet} ${r + quiet}h${c - start}v1h${start - c}z`);
    }
  }
  return parts.join('');
}

// Total side length in modules once the quiet zone is added on every side.
export function fullSize(size, quiet = QUIET_ZONE) {
  return size + quiet * 2;
}

// Rasterises the matrix onto a canvas at `scale` device pixels per module and
// resolves to a PNG Blob. Kept here (not in the component) so the drawing is
// testable with a stub canvas and reusable if a print view ever wants it.
export function matrixToPngBlob({ size, dark }, { scale = 10, quiet = QUIET_ZONE, createCanvas } = {}) {
  const side = fullSize(size, quiet) * scale;
  const canvas = createCanvas ? createCanvas(side, side) : Object.assign(document.createElement('canvas'), { width: side, height: side });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, side, side);
  ctx.fillStyle = '#000';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (dark[r][c]) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
    }
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))), 'image/png');
  });
}
