// no-text-rule.js — REMOTE_SPEC §5.3, decision D-11.
//
// On the remote deployment no free text may ever reach the server, so
// instruments containing `text` or `rated_text` items do not exist there.
// This module is the single predicate behind the three enforcement points:
//
//   1. scripts/build-catalog.mjs   — excluded from the composer's catalog
//   2. src/app.js                  — a session whose merged config contains
//                                    one refuses to start (hand-crafted URLs)
//   3. functions/api/v1/sessions   — envelopes referencing one are rejected
//
// The config files themselves are untouched (they belong to main); only
// their visibility changes. Configs flagged `dev: true` are exempt so the
// dev fixtures keep exercising every item type in tests.

export const TEXT_ITEM_TYPES = new Set(['text', 'rated_text']);

/** Ids of text-type items anywhere in an item sequence (recurses if/randomize). */
export function textItemIds(items) {
  const out = [];
  walk(items ?? [], (node) => {
    if (TEXT_ITEM_TYPES.has(node.type) && node.id != null) out.push(node.id);
  });
  return out;
}

export function questionnaireHasText(q) {
  return textItemIds(q?.items).length > 0;
}

/** Questionnaire ids referenced by a battery sequence (recurses if/randomize). */
export function sequenceQuestionnaireIds(sequence) {
  const out = [];
  walk(sequence ?? [], (node) => {
    if (node.questionnaireId != null) out.push(node.questionnaireId);
  });
  return out;
}

/**
 * The set of entity ids (questionnaires and batteries) that must not be
 * offered on the remote deployment, given every config file:
 *   • a questionnaire containing a text-type item
 *   • a battery whose sequence references such a questionnaire
 * Dev-flagged configs are skipped entirely.
 */
export function remoteExcludedIds(configs) {
  const excluded = new Set();
  const live = configs.filter(c => !c?.dev);
  for (const c of live) {
    for (const q of c.questionnaires ?? []) {
      if (questionnaireHasText(q)) excluded.add(q.id);
    }
  }
  for (const c of live) {
    for (const b of c.batteries ?? []) {
      if (sequenceQuestionnaireIds(b.sequence).some(id => excluded.has(id))) excluded.add(b.id);
    }
  }
  return excluded;
}

/** buildCatalog `exclude` predicate over a precomputed id set. */
export function remoteExclude(excludedIds) {
  return (entity) => excludedIds.has(entity.id);
}

/**
 * Runtime check on a merged config (loadConfig output). Returns the
 * questionnaires that contain text items, excluding those from dev-flagged
 * files; an empty array means the session may start.
 */
export function textInstrumentsIn(mergedConfig) {
  return (mergedConfig?.questionnaires ?? []).filter(q => !q.dev && questionnaireHasText(q));
}

function walk(nodes, visit) {
  for (const node of nodes) {
    if (node == null || typeof node !== 'object') continue;
    if (node.type === 'if') {
      walk(node.then ?? [], visit);
      walk(node.else ?? [], visit);
    } else if (node.type === 'randomize') {
      walk(node.ids ?? [], visit);
    } else {
      visit(node);
    }
  }
}
