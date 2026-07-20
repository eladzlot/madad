// build-catalog.js
// Pure catalog builder: parsed config files → catalog object.
//
// The catalog (public/composer/catalog.json) is the composer's only data
// source: a lightweight index of every questionnaire/battery (title,
// description, keywords, taxonomy meta, item count, time estimate). The
// composer never downloads full configs — those are fetched only by the
// patient app (and, later, the preview).
//
// No source/dependency information is in the catalog: item IDs are addresses
// (configs/prod/<id>.json — filename = entity id, enforced by
// validate:configs), so patient URLs carry only `items=` and the patient
// app's loadConfig derives files from tokens and auto-fetches declared
// battery dependencies (BFS walk — see shared/config/loader.js).
//
// This module is pure (no fs, no fetch) so it can be unit-tested directly.
// The CLI wrapper that reads files and writes public/composer/catalog.json
// is scripts/build-catalog.mjs.
//
// Determinism contract: same inputs → byte-identical output. CI regenerates
// the catalog and byte-compares it against the committed file, so nothing
// time- or environment-dependent may enter the output.

export const CATALOG_VERSION = 1;

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
 * @param {object[]} configs     parsed config files, in the order their
 *                               entries should appear (CLI passes sorted
 *                               filename order)
 * @param {object} [options]     {warn: (msg) => void}
 * @returns {object} catalog     {catalogVersion, entries}
 *
 * - a config's `dev: true` flag passes through onto its entries; the
 *   composer filters at runtime by DEV mode
 * - battery item counts resolve questionnaire refs across all given configs
 *   (batteries live in their own files and reference other files' content)
 */
export function buildCatalog(configs, options = {}) {
  const warn = options.warn ?? (() => {});
  const entries = [];

  // First pass: cross-config questionnaire map for battery counting.
  const questionnaireById = new Map();
  for (const config of configs) {
    for (const q of config.questionnaires ?? []) {
      questionnaireById.set(q.id, countItems(q.items));
    }
  }

  for (const config of configs) {
    const isDev = !!config.dev;

    const missingMeta = (kind, id) => {
      // Dev/test fixtures are exempt — they never reach production.
      if (!isDev) warn(`${config.id}: ${kind} "${id}" has no meta block`);
    };

    for (const b of config.batteries ?? []) {
      if (!b.meta) missingMeta('battery', b.id);
      const counts = countBattery(b.sequence, questionnaireById, warn, `${config.id}/${b.id}`);
      entries.push({
        id: b.id,
        kind: 'battery',
        title: b.title,
        description: truncate(b.description),
        keywords: b.keywords ?? [],
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
