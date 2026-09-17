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

       מדד · CTR: burnt-honey chrome, the dark end of the brand hue (H 62),
       lifted well clear of the burgundy's near-black (header L* 20, rail
       L* 27). Two rules hold these together as ONE material:
         • the header stays DARKER than the rail. The header is the outer
           frame, the rail a panel inside it. Inverting this reads as a pale
           bar floating on an unrelated slab.
         • both sit at the same share of the sRGB chroma ceiling for their own
           lightness (~42%). Matching absolute chroma is not enough — the
           ceiling falls as a colour darkens, so a fixed chroma makes the
           darker surface proportionally more saturated and visibly a
           different, redder material.

       The threshold line is deliberately COOL. Protanopia and deuteranopia
       (~8% of men) collapse the red–green axis but keep blue, so a warm
       threshold beside a warm data line is unreadable for them: in dark mode
       the old #E8A33D sat ΔE 1.0 from the new primary. */
    --clin-header-bg:        #392a1e;   /* L* 30 — white on it, 13.78:1 */
    --clin-rail-bg:          #4e3b2c;   /* L* 37 — the panel inside the frame */
    --clin-rail-field:       #3c2d20;   /* fields, list rows, secondary buttons on the rail */
    --clin-rail-border:      #7b6048;
    --clin-rail-text:        #dbc9b9;   /* body text on the rail — 6.58:1 */
    --clin-rail-text-strong: #f1e6dc;   /* input values, item titles — 8.61:1 */
    --clin-rail-label:       #c8af9b;   /* section labels, empty-state copy — 5.07:1 */
    --clin-rail-hint:        #bea590;   /* 4.52:1 */
    --clin-rail-alert:       #f2a99f;   /* uid error line + field border on the rail — 5.5:1 */
    --clin-reset-icon:       #da924f;   /* the ↺ glyph in the catalog toolbar — 4.13:1 */
    --clin-focus-stroke:     #392a1e;   /* chart marker keyboard focus ring */
    --clin-heatmap-ink:      #311c08;   /* fixed dark ink over pastel heatmap cells */

    --clin-card-bg:   #FFFFFF;
    --clin-grid:      #00000014;
    --clin-cutoff:    #32618e;   /* slate, not amber — see the note below */
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --clin-reset-icon:    #f3b680;
      --clin-search-bg:     #2a231c;
      --clin-search-border: #443830;

      --clin-card-bg: #211c17;
      --clin-grid:    #ffffff1f;
      --clin-cutoff:  #82b1ed;
    }
  }

  /* ── Card — white content panel on the muted page background ──────────── */

  .c-card {
    background: var(--clin-card-bg, #fff);
    border: var(--border-width, 1px) solid var(--color-border, #e4d6cb);
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
    background: var(--color-primary, #c37829);
    color: var(--color-primary-text, #fff);
  }
  .c-btn--primary:not(:disabled):hover { background: var(--color-primary-hover, #d18d4e); }

  .c-btn--secondary {
    background: var(--color-bg, #faf6f3);
    color: var(--color-text, #311c08);
    border-color: var(--color-border, #e4d6cb);
  }
  .c-btn--secondary:not(:disabled):hover {
    border-color: var(--color-primary, #c37829);
    color: var(--color-primary-ink, #995600);
  }

  .c-btn--ghost {
    background: transparent;
    color: var(--color-text-muted, #796453);
  }
  .c-btn--ghost:hover { color: var(--color-no, #8B3A3A); }

  .c-btn--active {
    background: var(--color-selected-bg, #ffecdd);
    border-color: var(--color-selected-border, #da924f);
    color: var(--color-primary-ink, #995600);
  }

  .c-btn--copied { background: var(--color-yes, #276749); color: #fff; }

  /* Small button (secondary actions, toolbars) */
  .c-btn--sm {
    min-block-size: 36px;
    padding-inline: var(--space-sm, 8px);
    font-size: var(--font-size-sm, 14px);
  }

  /* ── Segmented control — one-of-N view switcher ────────────────────────── */

  .c-seg {
    display: inline-flex;
    border: var(--border-width, 1px) solid var(--color-border, #e4d6cb);
    border-radius: var(--radius-sm, 6px);
    background: var(--color-bg, #faf6f3);
    overflow: hidden;
  }

  .c-seg button {
    border: none;
    background: none;
    font-family: inherit;
    font-size: var(--font-size-sm, 14px);
    color: var(--color-text-muted, #796453);
    min-block-size: 36px;
    padding-inline: var(--space-md, 16px);
    cursor: pointer;
    white-space: nowrap;
    transition: background var(--transition-fast, 120ms ease), color var(--transition-fast, 120ms ease);
  }

  .c-seg button + button {
    border-inline-start: var(--border-width, 1px) solid var(--color-border, #e4d6cb);
  }

  .c-seg button[aria-pressed='true'] {
    background: var(--color-selected-bg, #ffecdd);
    color: var(--color-primary-ink, #995600);
    font-weight: var(--font-weight-medium, 500);
  }

  .c-seg button:not([aria-pressed='true']):hover { color: var(--color-text, #311c08); }

  .c-seg button:focus-visible {
    outline: 2px solid var(--color-border-focus, #da924f);
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
    border: var(--border-width, 1px) solid var(--clin-rail-border, #304860);
    border-radius: var(--radius-pill, 999px);
    background: var(--clin-rail-field, #2A3D52);
    color: var(--clin-rail-text-strong, #C0D4E4);
    font-family: inherit;
    font-size: var(--font-size-sm, 14px);
    line-height: 1;
    cursor: pointer;
    transition: border-color var(--transition-fast, 120ms ease),
                color var(--transition-fast, 120ms ease);
  }

  .c-chip:hover { border-color: var(--color-accent, #2BB3C0); }

  .c-chip[aria-expanded='true'] {
    border-color: var(--color-accent, #2BB3C0);
    color: #ffffff;
  }

  /* No value yet — a dashed outline reads as an empty slot, not a disabled
     control, and the label says what filling it would do. */
  .c-chip--unset {
    background: none;
    border-style: dashed;
    color: var(--clin-rail-hint, #aec8dc);
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
    outline: 2px solid var(--color-border-focus, #2BB3C0);
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
