// build-catalog.js
// Pure catalog builder: manifest + parsed config files → catalog object.
//
// The catalog (public/composer/catalog.json) is the composer's only data
// source: a lightweight index of every questionnaire/battery (title,
// description, keywords, taxonomy meta, item count, time estimate) plus each
// entry's source token for patient-URL generation. The composer never
// downloads full configs — those are fetched only by the patient app (and,
// later, the preview).
//
// Cross-config dependencies are NOT in the catalog: generated URLs list only
// the selected items' sources, and the patient app's loadConfig auto-fetches
// each config's declared "dependencies" at runtime (BFS walk — see
// shared/config/loader.js). The composer needs no dependency knowledge.
//
// This module is pure (no fs, no fetch) so it can be unit-tested directly.
// The CLI wrapper that reads files and writes public/composer/catalog.json
// is scripts/build-catalog.mjs.
//
// Determinism contract: same inputs → byte-identical output. CI regenerates
// the catalog and byte-compares it against the committed file, so nothing
// time- or environment-dependent may enter the output.

export const CATALOG_VERSION = 1;

// Short-name derivation must match composer URL rules (COMPOSER_SPEC.md):
// 'configs/prod/<name>.json' → '<name>'; anything else stays a relative path.
const INTERNAL_CONFIG_PREFIX = 'configs/prod/';

// Per-item time estimates (seconds) for the completion-time heuristic.
// Deliberately rough — meta.durationMinutes overrides the estimate entirely.
const ITEM_SECONDS = {
  select: 6,
  binary: 6,
  slider: 8,
  multiselect: 12,
  text: 20,
  instructions: 8,
};

const DESCRIPTION_MAX = 140;

// toToken converts a manifest/dependency URL to the token used in generated
// patient URLs ('configs=' values) and as the catalog sources key.
export function toToken(url) {
  const noSlash = url.startsWith('/') ? url.slice(1) : url;
  if (noSlash.startsWith(INTERNAL_CONFIG_PREFIX) && noSlash.endsWith('.json')) {
    return noSlash.slice(INTERNAL_CONFIG_PREFIX.length, -'.json'.length);
  }
  return noSlash;
}

// truncate shortens a description for the catalog. Full text remains in the
// config file and is shown by the preview, which fetches the config itself.
function truncate(text) {
  if (!text) return '';
  if (text.length <= DESCRIPTION_MAX) return text;
  const cut = text.slice(0, DESCRIPTION_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > DESCRIPTION_MAX / 2 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

// countItems walks a questionnaire's items array.
// Returns { count, seconds, hasConditional } for the unconditional path:
// if-node contents are not counted (they may or may not be shown) but flip
// hasConditional; randomize contents always run, so they are counted.
// Instructions contribute reading time but not to the question count.
function countItems(items) {
  let count = 0;
  let seconds = 0;
  let hasConditional = false;
  for (const node of items ?? []) {
    if (node.type === 'if') {
      hasConditional = true;
    } else if (node.type === 'randomize') {
      const inner = countItems(node.ids);
      count += inner.count;
      seconds += inner.seconds;
      hasConditional = hasConditional || inner.hasConditional;
    } else if (node.type === 'instructions') {
      seconds += ITEM_SECONDS.instructions;
    } else {
      count += 1;
      seconds += ITEM_SECONDS[node.type] ?? ITEM_SECONDS.select;
    }
  }
  return { count, seconds, hasConditional };
}

// countBattery walks a battery sequence, resolving questionnaire refs through
// the cross-config questionnaire map. Unresolvable refs warn and are skipped
// (validate-configs enforces referential integrity separately).
function countBattery(sequence, questionnaireById, warn, label) {
  let count = 0;
  let seconds = 0;
  let hasConditional = false;
  for (const node of sequence ?? []) {
    if (node.questionnaireId !== undefined) {
      const q = questionnaireById.get(node.questionnaireId);
      if (!q) {
        warn(`${label}: sequence references unknown questionnaire "${node.questionnaireId}" — not counted`);
        continue;
      }
      count += q.count;
      seconds += q.seconds;
      hasConditional = hasConditional || q.hasConditional;
    } else if (node.type === 'if') {
      hasConditional = true;
    } else if (node.type === 'randomize') {
      const inner = countBattery(node.ids, questionnaireById, warn, label);
      count += inner.count;
      seconds += inner.seconds;
      hasConditional = hasConditional || inner.hasConditional;
    }
  }
  return { count, seconds, hasConditional };
}

function estMinutes(seconds, meta) {
  if (meta?.durationMinutes) return Math.ceil(meta.durationMinutes);
  return Math.max(1, Math.ceil(seconds / 60));
}

// metaFields maps an entity's meta block to catalog entry fields, applying
// catalog-level defaults (populations → adult; JSON has no undefined, so an
// absent type becomes null).
function metaFields(meta) {
  return {
    domains: meta?.domains ?? [],
    type: meta?.type ?? null,
    populations: meta?.populations ?? ['adult'],
    tags: meta?.tags ?? [],
    featured: meta?.featured ?? false,
  };
}

/**
 * buildCatalog — the pure builder.
 *
 * @param {object} manifest      {configs: [{name, url, hidden?, dev?}]}
 * @param {Map|object} configsByUrl  manifest entry url → parsed config JSON
 * @param {object} [options]     {warn: (msg) => void}
 * @returns {object} catalog     {catalogVersion, sources, entries}
 *
 * Semantics mirror the pre-catalog composer loader exactly:
 * - manifest order defines entry order (per config: batteries, then
 *   questionnaires — the composer splits them into two lists anyway)
 * - dev flags pass through onto entries; the composer filters at runtime by
 *   DEV mode
 * - hidden configs contribute no entries — nothing from them is selectable.
 *   (Their questionnaires still count toward battery sizes via the first
 *   pass, and the patient app still loads them via dependency auto-fetch.)
 */
export function buildCatalog(manifest, configsByUrl, options = {}) {
  const warn = options.warn ?? (() => {});
  const get = (url) =>
    configsByUrl instanceof Map ? configsByUrl.get(url) : configsByUrl[url];

  const entries = [];

  // First pass: cross-config questionnaire map for battery counting.
  const questionnaireById = new Map();
  for (const entry of manifest.configs) {
    const config = get(entry.url);
    if (!config) continue;
    for (const q of config.questionnaires ?? []) {
      questionnaireById.set(q.id, countItems(q.items));
    }
  }

  for (const entry of manifest.configs) {
    const config = get(entry.url);
    if (!config) {
      warn(`${entry.url}: config not provided — skipped`);
      continue;
    }
    const token = toToken(entry.url);
    const isDev = !!entry.dev;

    if (entry.hidden) continue;

    const missingMeta = (kind, id) => {
      // Dev/test fixtures are exempt — they never reach production.
      if (!isDev) warn(`${token}: ${kind} "${id}" has no meta block`);
    };

    for (const b of config.batteries ?? []) {
      if (!b.meta) missingMeta('battery', b.id);
      const counts = countBattery(b.sequence, questionnaireById, warn, `${token}/${b.id}`);
      entries.push({
        id: b.id,
        kind: 'battery',
        title: b.title,
        description: truncate(b.description),
        keywords: b.keywords ?? [],
        source: token,
        ...(isDev && { dev: true }),
        itemCount: counts.count,
        estMinutes: estMinutes(counts.seconds, b.meta),
        hasConditional: counts.hasConditional,
        ...metaFields(b.meta),
      });
    }
    for (const q of config.questionnaires ?? []) {
      if (!q.meta) missingMeta('questionnaire', q.id);
      const counts = countItems(q.items);
      entries.push({
        id: q.id,
        kind: 'questionnaire',
        title: q.title,
        description: truncate(q.description),
        keywords: q.keywords ?? [],
        source: token,
        ...(isDev && { dev: true }),
        itemCount: counts.count,
        estMinutes: estMinutes(counts.seconds, q.meta),
        hasConditional: counts.hasConditional,
        ...metaFields(q.meta),
      });
    }
  }

  return { catalogVersion: CATALOG_VERSION, entries };
}

// serializeCatalog — the canonical byte representation (used by both the
// writer and the CI freshness check; must stay deterministic).
export function serializeCatalog(catalog) {
  return JSON.stringify(catalog, null, 2) + '\n';
}
