(function attachMadadLogo(global) {
  'use strict';

  // The Madad mark (master, chosen 2026-10-06): "מדד | Madad" — Hebrew on the
  // left, English on the right, a quiet bar between them, and one accent rule
  // under both with three even ticks. Optionally a tagline, one language at a
  // time, centred under the rule.
  //
  // Everything here is geometry. Text goes through `settings.text` — live
  // <text> in the playground (tunable), outlined paths in the exports
  // (generate.mjs) — so both draw the same mark.

  const DEFAULTS = Object.freeze({
    ink: '#162232',
    accent: '#1A9FAD',
    weight: 700,
    tracking: -1.5,
    lineThickness: 4,
  });

  // Colour schemes. `bar` is the separator; the rule and ticks take `accent`.
  const SCHEMES = Object.freeze({
    light: { ink: null, accent: null, bar: 'ink35', tagline: 'ink72' },
    dark: { ink: '#FFFFFF', accent: null, bar: 'white35', tagline: 'white78' },
    'mono-ink': { ink: null, accent: 'ink', bar: 'ink', tagline: 'ink' },
    'mono-white': { ink: '#FFFFFF', accent: '#FFFFFF', bar: '#FFFFFF', tagline: '#FFFFFF' },
  });

  // Measured from NotoSansHebrew-Bold at 86 px with −1.5 tracking: advance
  // widths, and the letter heights used to match the two scripts. Hebrew
  // letters stand 53 px, Latin capitals 62: the Hebrew is set 1.17× larger
  // so the two names look the same size.
  const METRICS = Object.freeze({ size: 86, en: 284.8, he: 155.6, capEn: 62, heScale: 1.17 });
  const TAGLINE = Object.freeze({ he: 'מדידה ללא חיכוך', en: 'Frictionless measurement' });
  const TAGLINE_SIZE = 32;
  const GAP = 30;              // name ↔ bar
  const BASELINE = 106;        // the names' baseline
  const RULE_Y = 134;          // the rule

  function esc(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
    })[char]);
  }

  function colours(o, mode) {
    const s = SCHEMES[mode] || SCHEMES.light;
    const pick = (v) => ({
      ink35: [o.ink, 0.35], ink72: [o.ink, 0.72], white35: ['#FFFFFF', 0.35], white78: ['#FFFFFF', 0.78], ink: [o.ink, 1],
    })[v] || [v, 1];
    return {
      ink: s.ink || o.ink,
      accent: s.accent === 'ink' ? o.ink : (s.accent || o.accent),
      bar: pick(s.bar),
      tagline: pick(s.tagline),
    };
  }

  // Live text (the playground). generate.mjs passes its own, drawing paths.
  function liveText(str, { x, y, size, fill, opacity = 1, weight = 700, direction = 'ltr', tracking = 0 }) {
    const family = weight >= 600 ? 'Madad Noto' : 'Madad Noto Text';
    return `<text x="${x}" y="${y}" fill="${esc(fill)}"${opacity < 1 ? ` fill-opacity="${opacity}"` : ''} font-family="'${family}', 'Noto Sans Hebrew', Arial, sans-serif" font-size="${size}" font-weight="${weight}" letter-spacing="${tracking}" text-anchor="middle" direction="${direction}">${esc(str)}</text>`;
  }

  function fontCss(fontHref = '../../public/fonts/NotoSansHebrew-Bold.ttf') {
    const regular = fontHref.replace(/Bold\.ttf$/, 'Regular.ttf');
    return `@font-face { font-family: 'Madad Noto'; src: url('${esc(fontHref)}') format('truetype'); font-weight: 700; }
      @font-face { font-family: 'Madad Noto Text'; src: url('${esc(regular)}') format('truetype'); font-weight: 400; }`;
  }

  const line = (x1, y1, x2, y2, stroke, width, opacity = 1) =>
    `<line x1="${+x1.toFixed(2)}" y1="${y1}" x2="${+x2.toFixed(2)}" y2="${y2}" stroke="${esc(stroke)}"${opacity < 1 ? ` stroke-opacity="${opacity}"` : ''} stroke-width="${width}" stroke-linecap="round"/>`;

  function rule(left, right, o, c) {
    const tw = Math.max(1.5, o.lineThickness * 0.55);
    return line(left, RULE_Y, right, RULE_Y, c.accent, o.lineThickness)
      + [0.25, 0.5, 0.75].map(r => {
        const x = left + (right - left) * r;
        return line(x, RULE_Y - 3, x, RULE_Y + 5, c.accent, tw);
      }).join('');
  }

  /**
   * The mark's parts and its box.
   *   variant: 'master' (both names) | 'he' | 'en' (one name, same rule system)
   *   tagline: null | 'he' | 'en'
   */
  function compose(o, mode, { variant = 'master', tagline = null, text = liveText } = {}) {
    const c = colours(o, mode);
    const { size, heScale, capEn } = METRICS;
    const track = o.tracking + 1.5;                       // metrics were taken at −1.5
    const wEn = METRICS.en + track * 4;
    const wHe = (METRICS.he + track * 2) * heScale;
    const name = (lang, cx) => text(lang === 'en' ? 'Madad' : 'מדד', {
      x: cx, y: BASELINE, size: lang === 'he' ? size * heScale : size, fill: c.ink,
      weight: o.weight, direction: lang === 'en' ? 'ltr' : 'rtl', tracking: lang === 'he' ? o.tracking * heScale : o.tracking,
    });
    let parts, right;
    if (variant === 'master') {
      right = wHe + GAP * 2 + wEn;
      const barX = wHe + GAP;
      parts = name('he', wHe / 2) + name('en', barX + GAP + wEn / 2)
        + line(barX, BASELINE - capEn + 4, barX, BASELINE, c.bar[0], Math.max(2, o.lineThickness * 0.75), c.bar[1]);
    } else {
      right = variant === 'he' ? wHe : wEn;
      parts = name(variant, right / 2);
    }
    parts += rule(0, right, o, c);
    let bottom = RULE_Y + 5;
    if (tagline) {
      parts += text(TAGLINE[tagline], {
        x: right / 2, y: RULE_Y + 48, size: TAGLINE_SIZE, fill: c.tagline[0], opacity: c.tagline[1],
        weight: 400, direction: tagline === 'en' ? 'ltr' : 'rtl',
      });
      bottom = RULE_Y + 48 + 9;                           // descenders
    }
    // The tallest letters: the Latin ascenders (d) rise ~5 px above the cap
    // height; Hebrew letters sit at cap height (they are scaled to it).
    const top = BASELINE - capEn - (variant === 'he' ? 0 : 6);
    return { parts, box: { x: 0, y: top, w: right, h: bottom - top } };
  }

  /**
   * A complete SVG. settings:
   *   mode: light | dark | mono-ink | mono-white
   *   variant, tagline: see compose()
   *   pad: clear space around the mark, as a share of the cap height (default 0.5)
   *   background: a colour to fill behind it (default: none, transparent)
   *   height: the SVG's rendered height (default: its own units)
   *   text: a text renderer (default: live text with an @font-face)
   *   fontHref: the bold font's URL, for live text
   */
  function renderLogo(input = {}, settings = {}) {
    const o = { ...DEFAULTS, ...input };
    const { parts, box } = compose(o, settings.mode || 'light', settings);
    const pad = (settings.pad ?? 0.5) * METRICS.capEn;
    const vb = [box.x - pad, box.y - pad, box.w + 2 * pad, box.h + 2 * pad].map(v => +v.toFixed(2));
    const scale = settings.height ? settings.height / vb[3] : 1;
    const w = +(vb[2] * scale).toFixed(2), h = +(vb[3] * scale).toFixed(2);
    const live = !settings.text;
    const title = `Madad${settings.tagline ? ` — ${TAGLINE[settings.tagline]}` : ''}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb.join(' ')}" role="img" aria-label="${esc(title)}">
${live ? `<style>${fontCss(settings.fontHref)}</style>\n` : ''}${settings.background ? `<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="${esc(settings.background)}"/>` : ''}${parts}
</svg>\n`;
  }

  global.MadadLogo = Object.freeze({ DEFAULTS, METRICS, TAGLINE, compose, renderLogo, esc });
})(globalThis);
