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
import { loadConfig } from '../../shared/config/loader.js';
import { parsePdfFile } from './parse-pdf.js';
import { createStore } from './store.js';
import './chart/trajectory-chart.js';
import './components/upload-list.js';
import './components/pid-filter.js';
import './components/raw-data-list.js';
import './components/session-detail.js';

const root = document.getElementById('aggregate-app');
const store = createStore();

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

async function refreshConfigs() {
  const configFiles = store.configFiles();
  const key = configFiles.join(',');
  if (key === loadedConfigKey || configFiles.length === 0) return;
  loadedConfigKey = key;
  try {
    const config = await loadConfig(configFiles);
    questionnairesById = new Map(config.questionnaires.map(q => [q.id, q]));
  } catch (err) {
    console.warn('[aggregate] config load failed — charts render without overlays:', err);
    questionnairesById = new Map();
  }
  update();
}

function template() {
  const series = store.series();
  const raw = store.rawInstruments();
  const pids = store.pids();
  const showFilter = store.sessionCount > 0 && (pids.length > 1 || (pids.length > 0 && store.hasUnidentified()));

  return html`
    <div class="a-header-wrap">
      <header class="a-header">
        <div class="a-brand">
          <span class="a-brand-name">מדד</span>
          <span class="a-brand-sep">|</span>
          <span class="a-brand-page">סיכום מטופל</span>
        </div>
        <div class="a-subtitle">הקבצים נטענים בדפדפן שלך בלבד. סגירת הכרטיסייה מוחקת אותם.</div>
      </header>
    </div>
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
          @point-selected=${(e) => selectPoint(e.detail)}
        ></trajectory-chart>
      `)}

      ${store.sessionCount > 0 && series.length === 0 && raw.length === 0 ? html`
        <p class="a-empty">אין מפגשים להצגה עבור הסינון הנוכחי.</p>
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
