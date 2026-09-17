// clinician-styles.js — the shared clinician design vocabulary (D-15).
//
// Single source of truth for the styles every clinician surface uses:
// tokens (header navy, card surface, chart neutrals) and control classes
// (buttons, segmented control, card). Kept as a CSS string in a JS module
// because the aggregate's Lit components render in shadow DOM, which a
// plain stylesheet cannot reach:
//
//   • light-DOM surfaces (composer, aggregate page chrome) adopt it once
//     at the document level via adoptClinicianStyles();
//   • shadow-DOM components include it via unsafeCSS(clinicianCss) in
//     their static styles.
//
// @font-face, resets, and page layout stay in each surface's own CSS —
// Chromium ignores @font-face inside constructed stylesheets.
//
// Class names keep the `c-` prefix ("clinician-"): the composer already
// used these names, so it migrated here without churn.

export const clinicianCss = /* css */ `
  :root {
    /* ── Chrome (theme-independent) ─────────────────────────────────────────
       The clinician header and the composer's output rail: dark panels that
       hold in both colour schemes. Every chrome colour lives here so a
       deployment can re-hue the whole clinician shell from one block; the
       derived tints below (color-mix) follow automatically.

       מדד · CTR: Leaf chrome. Unlike the honey — whose chrome, ground and
       brand were all one hue — the palette splits them: the brand is H 142
       and every neutral, this chrome included, sits at H 169. The chrome is
       a dark neutral, so it belongs to the neutral family; a brand-hued rail
       would put a hue seam down the middle of the composer, between the rail
       and the catalog column beside it. Two rules hold header and rail
       together as ONE material:
         • the header stays DARKER than the rail. The header is the outer
           frame, the rail a panel inside it. Inverting this reads as a pale
           bar floating on an unrelated slab.
         • both sit at the same share of the sRGB chroma ceiling for their own
           lightness (~42%). Matching absolute chroma is not enough — the
           ceiling falls as a colour darkens, so a fixed chroma makes the
           darker surface proportionally more saturated and visibly a
           different material.

       The threshold line is deliberately COOL. Protanopia and deuteranopia
       (~8% of men) collapse the red–green axis but keep blue, so a warm
       threshold beside a warm data line is unreadable for them.

       That same axis is why --clin-alert-ring exists. A green series line
       lands on the yellow end of what survives protan/deutan and the cutoff
       holds the blue end, so the axis is already fully spent and a red alert
       ring has nowhere to sit — in dark mode it measured ΔE 6.9 from the line
       it is drawn 4px away from. The ring gives up hue instead and separates
       by lightness: a double ring in the text colour. The red is kept in the
       tooltip's alert text, which is never a discrimination task.

       KNOWN GAP: in dark mode the series and the cutoff sit ΔE 7.3 apart
       under TRITANOPIA, below the ΔE ≥ 18 this block holds elsewhere.
       Tritanopia is ~0.01% (against the 8% carried by protan/deutan), the
       cutoff is a dashed horizontal against a solid polyline with round
       markers, and the chart carries a full data table. Recorded, not fixed. */
    --clin-header-bg:        #21322b;   /* OKLab L .299 — white on it, 13.50:1 */
    --clin-rail-bg:          #2f453c;   /* OKLab L .369 — the panel inside the frame */
    --clin-rail-field:       #23352e;   /* fields, list rows, secondary buttons on the rail */
    --clin-rail-border:      #4d6f61;
    --clin-rail-text:        #b0d7c7;   /* body text on the rail — 6.57:1 */
    --clin-rail-text-strong: #d0f1e3;   /* input values, item titles — 8.53:1 */
    --clin-rail-label:       #9ebcb0;   /* section labels, empty-state copy — 5.04:1 */
    --clin-rail-hint:        #95b2a6;   /* 4.51:1 */
    --clin-rail-alert:       #f2a99f;   /* uid error line + field border on the rail — 5.38:1 */
    /* The ↺ glyph sits in the catalog toolbar, which is --color-surface — NOT
       the rail. The honey shipped the accent here and recorded 4.13:1 against
       the rail by mistake; on the surface it actually sits on, that value was
       2.11:1. The ink is the token that clears AA there. */
    --clin-reset-icon:       #397533;   /* on --color-surface — 4.65:1 */
    --clin-focus-stroke:     #21322b;   /* chart marker keyboard focus ring */
    --clin-heatmap-ink:      #0b281e;   /* fixed dark ink over pastel heatmap cells */
    --clin-alert-ring:       #0b281e;   /* chart alert marker — achromatic, see above */

    --clin-card-bg:   #FFFFFF;
    --clin-grid:      #00000014;
    --clin-cutoff:    #32618e;   /* slate, not amber — see the note above */
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --clin-reset-icon:    #83c57c;   /* on the dark --color-surface — 8.18:1 */
      --clin-search-bg:     #1e2723;
      --clin-search-border: #323e39;

      --clin-card-bg:   #181f1c;
      --clin-grid:      #ffffff1f;
      --clin-cutoff:    #82b1ed;
      --clin-alert-ring: #d3f0e4;
    }
  }

  /* ── Card — white content panel on the muted page background ──────────── */

  .c-card {
    background: var(--clin-card-bg, #FFFFFF);
    border: var(--border-width, 1px) solid var(--color-border, #bae4d2);
    border-radius: var(--radius-md, 12px);
    box-shadow: var(--shadow-sm, none);
    padding: var(--space-md, 16px);
  }

  /* ── Buttons ───────────────────────────────────────────────────────────── */

  .c-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs, 4px);
    min-block-size: var(--item-min-touch, 44px);
    padding-inline: var(--space-md, 16px);
    border-radius: var(--radius-sm, 6px);
    font-size: var(--font-size-sm, 14px);
    font-weight: var(--font-weight-medium, 500);
    font-family: inherit;
    cursor: pointer;
    border: var(--border-width, 1px) solid transparent;
    transition: background var(--transition-fast, 120ms ease), color var(--transition-fast, 120ms ease), border-color var(--transition-fast, 120ms ease);
    white-space: nowrap;
  }

  .c-btn:disabled { opacity: 0.45; cursor: not-allowed; }

  .c-btn--primary {
    background: var(--color-primary, #5aa053);
    color: var(--color-primary-text, #0b281e);
  }
  .c-btn--primary:not(:disabled):hover { background: var(--color-primary-hover, #73b06d); }

  .c-btn--secondary {
    background: var(--color-bg, #eefaf5);
    color: var(--color-text, #0b281e);
    border-color: var(--color-border, #bae4d2);
  }
  .c-btn--secondary:not(:disabled):hover {
    border-color: var(--color-primary, #5aa053);
    color: var(--color-primary-ink, #397533);
  }

  .c-btn--ghost {
    background: transparent;
    color: var(--color-text-muted, #576f65);
  }
  .c-btn--ghost:hover { color: var(--color-no, #8B3A3A); }

  .c-btn--active {
    background: var(--color-selected-bg, #dbfad6);
    border-color: var(--color-selected-border, #5aa053);
    color: var(--color-primary-ink, #397533);
  }

  .c-btn--copied { background: var(--color-yes, #14655f); color: #fff; }

  /* Small button (secondary actions, toolbars) */
  .c-btn--sm {
    min-block-size: 36px;
    padding-inline: var(--space-sm, 8px);
    font-size: var(--font-size-sm, 14px);
  }

  /* ── Segmented control — one-of-N view switcher ────────────────────────── */

  .c-seg {
    display: inline-flex;
    border: var(--border-width, 1px) solid var(--color-border, #bae4d2);
    border-radius: var(--radius-sm, 6px);
    background: var(--color-bg, #eefaf5);
    overflow: hidden;
  }

  .c-seg button {
    border: none;
    background: none;
    font-family: inherit;
    font-size: var(--font-size-sm, 14px);
    color: var(--color-text-muted, #576f65);
    min-block-size: 36px;
    padding-inline: var(--space-md, 16px);
    cursor: pointer;
    white-space: nowrap;
    transition: background var(--transition-fast, 120ms ease), color var(--transition-fast, 120ms ease);
  }

  .c-seg button + button {
    border-inline-start: var(--border-width, 1px) solid var(--color-border, #bae4d2);
  }

  .c-seg button[aria-pressed='true'] {
    background: var(--color-selected-bg, #dbfad6);
    color: var(--color-primary-ink, #397533);
    font-weight: var(--font-weight-medium, 500);
  }

  .c-seg button:not([aria-pressed='true']):hover { color: var(--color-text, #0b281e); }

  .c-seg button:focus-visible {
    outline: 2px solid var(--color-border-focus, #5aa053);
    outline-offset: -2px;
  }

  /* ── Value chip — a setting shown as its own value ─────────────────────── */
  /* Used on the dark clinician rail and in the mobile sheet: the closed state
     of a setting IS the setting, so a glance reads "Hebrew, no patient ID"
     without opening anything. An unset chip is dashed — an empty slot asking
     to be filled, the same idiom the idiographic param slots will need. */

  .c-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-block-size: 30px;
    padding-inline: 11px;
    border: var(--border-width, 1px) solid var(--clin-rail-border, #4d6f61);
    border-radius: var(--radius-pill, 999px);
    background: var(--clin-rail-field, #23352e);
    color: var(--clin-rail-text-strong, #d0f1e3);
    font-family: inherit;
    font-size: var(--font-size-sm, 14px);
    line-height: 1;
    cursor: pointer;
    transition: border-color var(--transition-fast, 120ms ease),
                color var(--transition-fast, 120ms ease);
  }

  .c-chip:hover { border-color: var(--color-accent, #77b770); }

  .c-chip[aria-expanded='true'] {
    border-color: var(--color-accent, #77b770);
    color: #ffffff;
  }

  /* No value yet — a dashed outline reads as an empty slot, not a disabled
     control, and the label says what filling it would do. */
  .c-chip--unset {
    background: none;
    border-style: dashed;
    color: var(--clin-rail-hint, #95b2a6);
  }

  .c-chip svg {
    inline-size: 14px;
    block-size: 14px;
    flex-shrink: 0;
    opacity: 0.8;
  }

  .c-chip .c-chip-value {
    font-family: ui-monospace, monospace;
    font-size: var(--font-size-xs, 12px);
    direction: ltr;
  }

  .c-chip:focus-visible {
    outline: 2px solid var(--color-border-focus, #5aa053);
    outline-offset: 2px;
  }
`;

let sheet;

/**
 * Adopt the clinician stylesheet at the document level (light-DOM surfaces).
 * Idempotent. No-ops where constructed stylesheets are unsupported (jsdom).
 */
export function adoptClinicianStyles(doc = document) {
  if (typeof CSSStyleSheet !== 'function' || !('adoptedStyleSheets' in doc)) return;
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(clinicianCss);
  }
  if (!doc.adoptedStyleSheets.includes(sheet)) {
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  }
}
