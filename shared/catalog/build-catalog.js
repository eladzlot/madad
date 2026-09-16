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

import { DEFAULT_LANG, LANG_CODES } from '../i18n/core.js';

// v2 (multi-language): entries carry `languages` (which patient languages the
// instrument can be sent in) and `i18n` (clinician-facing title/description/
// keywords per non-Hebrew language). See docs/I18N_SPEC.md §5.
export const CATALOG_VERSION = 2;

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

// collectRefs lists every questionnaire id a battery sequence can reach.
function collectRefs(sequence) {
  const refs = [];
  for (const node of sequence ?? []) {
    if (node.questionnaireId !== undefined) refs.push(node.questionnaireId);
    if (node.then) refs.push(...collectRefs(node.then));
    if (node.else) refs.push(...collectRefs(node.else));
    if (node.ids)  refs.push(...collectRefs(node.ids));
  }
  return refs;
}

// languageIndex builds, per non-Hebrew language, a map of entity id →
// { title, description, keywords } from that language's config files, plus
// the set of questionnaire ids it provides (for battery completeness).
function languageIndex(translations, warn) {
  const index = new Map();   // lang → { text: Map(id → fields), questionnaireIds: Set }
  for (const lang of Object.keys(translations ?? {})) {
    if (lang === DEFAULT_LANG || !LANG_CODES.includes(lang)) {
      warn(`translations: unknown language "${lang}" ignored`);
      continue;
    }
    const text = new Map();
    const questionnaireIds = new Set();
    for (const config of translations[lang] ?? []) {
      for (const q of config.questionnaires ?? []) {
        questionnaireIds.add(q.id);
        text.set(q.id, { title: q.title, description: truncate(q.description), keywords: q.keywords ?? [], sequence: null });
      }
      for (const b of config.batteries ?? []) {
        text.set(b.id, { title: b.title, description: truncate(b.description), keywords: b.keywords ?? [], sequence: b.sequence });
      }
    }
    index.set(lang, { text, questionnaireIds });
  }
  return index;
}

// languageFields returns { languages, i18n } for one entity: Hebrew always,
// plus every language whose files carry it (a battery only when every
// questionnaire it sequences exists in that language too).
function languageFields(id, kind, langIndex, warn) {
  const languages = [DEFAULT_LANG];
  const i18n = {};
  for (const [lang, { text, questionnaireIds }] of langIndex) {
    const entry = text.get(id);
    if (!entry) continue;
    if (kind === 'battery') {
      const missing = collectRefs(entry.sequence).filter(ref => !questionnaireIds.has(ref));
      if (missing.length) {
        warn(`${lang}/${id}: battery not offered in "${lang}" — missing ${missing.join(', ')}`);
        continue;
      }
    }
    languages.push(lang);
    i18n[lang] = { title: entry.title, description: entry.description, keywords: entry.keywords };
  }
  return { languages, ...(Object.keys(i18n).length && { i18n }) };
}

/**
 * buildCatalog — the pure builder.
 *
 * @param {object[]} configs     parsed Hebrew (canonical) config files, in
 *                               the order their entries should appear (CLI
 *                               passes sorted filename order)
 * @param {object} [options]     {warn: (msg) => void,
 *                                exclude: (entity, kind, config) => boolean,
 *                                translations: { [lang]: object[] } — parsed
 *                                  configs from public/configs/prod/<lang>/}
 * @returns {object} catalog     {catalogVersion, entries}
 *
 * - every entry carries `languages` (Hebrew first, then each language that
 *   has the instrument — for a battery, only when every questionnaire it
 *   sequences is translated too) and, when translated, `i18n[lang]` with
 *   the title/description/keywords the composer shows in that UI language
 * - a config's `dev: true` flag passes through onto its entries; the
 *   composer filters at runtime by DEV mode
 * - `exclude` (optional) is asked once per battery/questionnaire with the
 *   entity, its kind ('battery' | 'questionnaire') and the config it came
 *   from; a truthy return leaves it out of the catalog entirely. Default:
 *   nothing is excluded. Deployments that must not offer certain
 *   instruments (e.g. ones with free-text items) hook in here without
 *   touching the config files.
 * - battery item counts resolve questionnaire refs across all given configs
 *   (batteries live in their own files and reference other files' content)
 */
export function buildCatalog(configs, options = {}) {
  const warn = options.warn ?? (() => {});
  const exclude = options.exclude ?? (() => false);
  const langIndex = languageIndex(options.translations, warn);
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
      if (exclude(b, 'battery', config)) continue;
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
        ...languageFields(b.id, 'battery', langIndex, warn),
      });
    }
    for (const q of config.questionnaires ?? []) {
      if (exclude(q, 'questionnaire', config)) continue;
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
        ...languageFields(q.id, 'questionnaire', langIndex, warn),
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
