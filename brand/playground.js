(function initialisePlayground() {
  'use strict';

  // The master mark, live (font-dependent text), driven by the controls. The
  // production files come from `node brand/generate.mjs` (outlined text).
  const { DEFAULTS, renderLogo } = globalThis.MadadLogo;
  const controls = ['accent', 'ink', 'weight', 'tracking', 'lineThickness'];
  const root = document.querySelector('#designs');
  const FONT = '../public/fonts/NotoSansHebrew-Bold.ttf';

  function currentOptions() {
    return Object.fromEntries(controls.map(id => {
      const input = document.querySelector(`#${id}`);
      const value = input.type === 'color' ? input.value : Number(input.value);
      return [id, value];
    }));
  }

  function downloadSvg(filename, svg) {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const SHOWN = [
    { title: 'The mark', settings: {} },
    { title: 'With the Hebrew tagline', settings: { tagline: 'he' } },
    { title: 'With the English tagline', settings: { tagline: 'en' } },
    { title: 'Hebrew name alone (single-language header)', settings: { variant: 'he' } },
    { title: 'English name alone (single-language header)', settings: { variant: 'en' } },
  ];

  function render() {
    const opts = currentOptions();
    const svg = (settings, mode) => renderLogo(opts, { fontHref: FONT, mode, ...settings });
    root.innerHTML = SHOWN.map((s, i) => `<article class="design-card design-card-wide">
        <div class="card-copy"><h2>${s.title}</h2></div>
        <div class="preview">${svg(s.settings, 'light')}</div>
        <div class="preview preview-dark">${svg(s.settings, 'dark')}</div>
        ${i === 0 ? `<div class="sizes">
          <div class="size-row"><span class="test-label">Header (44 px)</span><div class="at">${svg({ height: 44 }, 'light')}</div></div>
          <div class="size-row"><span class="test-label">Small (24 px)</span><div class="at">${svg({ height: 24 }, 'light')}</div></div>
          <div class="size-row"><span class="test-label">One colour</span><div class="at">${svg({ height: 44 }, 'mono-ink')}</div></div>
        </div>` : ''}
        <div class="tests"><button class="download" type="button" data-shown="${i}">Download SVG (live text)</button></div>
      </article>`).join('');
    root.querySelectorAll('[data-shown]').forEach(button => {
      button.addEventListener('click', () => {
        const s = SHOWN[Number(button.dataset.shown)].settings;
        const name = ['madad', s.tagline && `tagline-${s.tagline}`, s.variant && `wordmark-${s.variant}`].filter(Boolean).join('-');
        downloadSvg(`${name}.svg`, renderLogo(opts, s));
      });
    });
  }

  controls.forEach(id => {
    const input = document.querySelector(`#${id}`);
    input.addEventListener('input', () => {
      const output = document.querySelector(`#${id}-value`);
      if (output) output.value = input.value.replace('-', '−');
      render();
    });
  });

  document.querySelector('#reset').addEventListener('click', () => {
    controls.forEach(id => {
      document.querySelector(`#${id}`).value = DEFAULTS[id];
      const output = document.querySelector(`#${id}-value`);
      if (output) output.value = String(DEFAULTS[id]).replace('-', '−');
    });
    render();
  });

  render();
})();
