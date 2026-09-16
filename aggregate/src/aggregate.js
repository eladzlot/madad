// aggregate.js — composition root for the Aggregate surface (סיכום מטופל).
//
// Clinician-side, read-only, stateless (AGGREGATE_SPEC §1): PDFs are parsed
// in the browser, charts render from the embedded data.json envelopes,
// closing the tab discards everything. No uploads leave the device.
//
// Wiring only — parsing lives in parse-pdf.js, state in store.js, geometry
// in chart/, presentation in components/. This file is excluded from unit
// coverage (like composer.js); the e2e round-trip exercises it.

import './aggregate.css';
import { render, html } from 'lit';
import { adoptClinicianStyles } from '../../clinician/styles/clinician-styles.js';
import { bootLang, t } from '../../clinician/i18n/index.js';
import { LANGS, DEFAULT_LANG, configBaseFor } from '../../shared/i18n/core.js';
import { loadConfig } from '../../shared/config/loader.js';
import { parsePdfFile } from './parse-pdf.js';
import { createStore } from './store.js';
import { paddedTimeDomain } from './chart/scales.js';

adoptClinicianStyles();

const root = document.getElementById('aggregate-app');

// Language first (docs/I18N_SPEC.md L-7): the components are imported after
// the strings are in place so no template renders with the wrong table.
const uiLang = await bootLang({ titleKey: 'aggregate.title' });
await Promise.all([
  import('../../clinician/components/clinician-nav.js'),
  import('./chart/trajectory-chart.js'),
  import('./components/upload-list.js'),
  import('./components/pid-filter.js'),
  import('./components/raw-data-list.js'),
  import('./components/session-detail.js'),
]);

const store = createStore({ locale: LANGS[uiLang].locale });

// qId → questionnaire config (for interpretations overlays and subscale
// labels). Loaded lazily from the configs the uploaded envelopes reference;
// a load failure only costs the overlays, never the charts.
let questionnairesById = new Map();
let loadedConfigKey = '';

// The point open in the detail panel: { session, sessionKey, questionnaireId },
// or null. Scoped to a single questionnaire — the panel opens from a chart
// point, and a point belongs to one instrument.
let selected = null;

async function handleFiles(files) {
  const parsed = await Promise.all(
    files.map(async (file) => ({ file, result: await parsePdfFile(file) }))
  );
  store.addFiles(parsed);
  refreshConfigs();
}

// Configs are loaded in the clinician's UI language so titles, severity
// bands and subscale labels read in that language, falling back per
// instrument to the Hebrew (canonical) file when no translation exists. A
// load failure only costs the overlays, never the charts.
async function loadConfigFor(id) {
  if (uiLang !== DEFAULT_LANG) {
    try {
      return await loadConfig([id], { configBase: configBaseFor(uiLang) });
    } catch { /* no translation — fall through to Hebrew */ }
  }
  return loadConfig([id]);
}

async function refreshConfigs() {
  const configFiles = store.configFiles();
  const key = configFiles.join(',');
  if (key === loadedConfigKey || configFiles.length === 0) return;
  loadedConfigKey = key;
  const results = await Promise.allSettled(configFiles.map(loadConfigFor));
  questionnairesById = new Map();
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      for (const q of r.value.questionnaires) questionnairesById.set(q.id, q);
    } else {
      console.warn(`[aggregate] config load failed for ${configFiles[i]} — chart renders without overlays:`, r.reason);
    }
  });
  update();
}

// The instrument title the clinician sees: the loaded config's (UI language)
// over the envelope's (the language the patient answered in).
const titled = (s) => ({ ...s, title: questionnairesById.get(s.questionnaireId)?.title ?? s.title });

function template() {
  const series = store.series().map(titled);
  const raw = store.rawInstruments().map(titled);
  const pids = store.pids();
  const showFilter = store.sessionCount > 0 && (pids.length > 1 || (pids.length > 0 && store.hasUnidentified()));

  // One shared x-domain across every chart: the same date lands at the same
  // horizontal position in all instruments, so trajectories compare
  // vertically (weekly PHQ-9 above monthly WSAS reads as one story).
  const allDates = series.flatMap(s => s.points.map(p => p.date)).sort((a, b) => a - b);
  const domain = allDates.length ? paddedTimeDomain(allDates) : undefined;

  return html`
    <clinician-nav page="aggregate" subtitle=${t('aggregate.subtitle')}></clinician-nav>
    <div class="a-container">
      <upload-list
        .files=${store.files}
        @files-selected=${(e) => handleFiles(e.detail.files)}
      ></upload-list>

      ${showFilter ? html`
        <pid-filter
          .pids=${pids}
          .hasUnidentified=${store.hasUnidentified()}
          .value=${store.pidFilter}
          @pid-change=${(e) => store.setPidFilter(e.detail.value)}
        ></pid-filter>
      ` : ''}

      ${series.map(s => html`
        <trajectory-chart
          .series=${s}
          .questionnaire=${questionnairesById.get(s.questionnaireId)}
          .domain=${domain}
          @point-selected=${(e) => selectPoint(e.detail)}
        ></trajectory-chart>
      `)}

      ${store.sessionCount > 0 && series.length === 0 && raw.length === 0 ? html`
        <p class="a-empty">${t('aggregate.empty')}</p>
      ` : ''}

      <raw-data-list .instruments=${raw}></raw-data-list>

      ${selected ? html`
        <session-detail
          .session=${selected.session}
          .sessionKey=${selected.sessionKey}
          .questionnaireId=${selected.questionnaireId}
          .questionnaires=${questionnairesById}
          @panel-closed=${() => selectPoint(null)}
        ></session-detail>
      ` : ''}
    </div>
  `;
}

function selectPoint(detail) {
  selected = detail == null ? null : {
    session: store.getSession(detail.sessionId),
    sessionKey: detail.sessionKey,
    questionnaireId: detail.questionnaireId,
  };
  if (selected && !selected.session) selected = null;
  update();
}

function update() {
  render(template(), root);
}

store.subscribe(update);
update();
