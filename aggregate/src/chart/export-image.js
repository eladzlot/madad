// export-image.js — browser glue for chart export (AGGREGATE_SPEC §6):
// SVG string → Blob, SVG → canvas → PNG Blob, and the download anchor.
// Everything renders locally; no data leaves the device.
//
// The SVG built by export-svg.js is self-contained (no external resources,
// no stylesheets), so drawing it onto a canvas does not taint it and
// toBlob stays available.

export function svgBlob(svg) {
  return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
}

/**
 * Rasterize a standalone SVG document to a PNG Blob at `scale`× density
 * (§6: logical 800×500 exported at 2× → 1600×1000 px).
 */
export async function svgToPngBlob(svg, { width, height, scale = 2 }) {
  const url = URL.createObjectURL(svgBlob(svg));
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))),
        'image/png'
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function canCopyImage() {
  return typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write;
}

/**
 * Rasterize and place a PNG on the clipboard. The ClipboardItem is
 * constructed synchronously with the *pending* blob promise — Safari
 * rejects clipboard writes that happen after an await breaks the user
 * gesture, and the promise form keeps the write inside it.
 */
export async function copyPngToClipboard(svg, { width, height, scale = 2 }) {
  const item = new ClipboardItem({ 'image/png': svgToPngBlob(svg, { width, height, scale }) });
  await navigator.clipboard.write([item]);
}

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Revoke on the next tick — revoking synchronously can cancel the
  // download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('SVG image failed to load'));
    img.src = url;
  });
}
