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

const root = document.getElementById('aggregate-app');
const store = createStore();

// qId → questionnaire config (for interpretations overlays). Loaded lazily
// from the configs the uploaded envelopes reference; a load failure only
// costs the overlays, never the charts.
let questionnairesById = new Map();
let loadedConfigKey = '';

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
    <div class="a-container">
      <header class="a-header">
        <h1>מדד — סיכום מטופל</h1>
        <p class="a-privacy">הקבצים נטענים בדפדפן שלך בלבד. סגירת הכרטיסייה מוחקת אותם.</p>
      </header>

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
          .interpretations=${questionnairesById.get(s.questionnaireId)?.interpretations}
        ></trajectory-chart>
      `)}

      ${store.sessionCount > 0 && series.length === 0 && raw.length === 0 ? html`
        <p class="a-empty">אין מפגשים להצגה עבור הסינון הנוכחי.</p>
      ` : ''}

      <raw-data-list .instruments=${raw}></raw-data-list>
    </div>
  `;
}

function update() {
  render(template(), root);
}

store.subscribe(update);
update();
