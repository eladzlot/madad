// config-validation.js
// Semantic validation for QuestionnaireSet config objects.
// Used by loader.js (browser) and scripts/validate-configs.mjs (Node CI).
//
// Public API:
//   collectConfigErrors(data)
//     Runs all semantic checks. Returns string[]. Never throws.
//
//   validateConfigData(data, url)
//     Calls collectConfigErrors and throws ConfigError on the first violation.
//     url is appended to the message for context.
//
// Error classes:
//   ConfigError  — re-exported so callers don't need a separate import.

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

// ── Session key validation ────────────────────────────────────────────────────

function collectSessionKeys(nodes) {
  const keys = [];
  for (const node of nodes ?? []) {
    if (node.type === 'if') {
      keys.push(...collectSessionKeys(node.then ?? []));
      keys.push(...collectSessionKeys(node.else ?? []));
    } else if (node.type === 'randomize') {
      keys.push(...collectSessionKeys(node.ids ?? []));
    } else if (node.questionnaireId) {
      keys.push(node.instanceId ?? node.questionnaireId);
    }
  }
  return keys;
}

function checkDuplicateSessionKeys(data, errors) {
  for (const battery of data.batteries ?? []) {
    const keys = collectSessionKeys(battery.sequence ?? []);
    const seen = new Set();
    for (const key of keys) {
      if (seen.has(key)) {
        errors.push(
          `Battery "${battery.id}" has duplicate session key "${key}". ` +
          `Use instanceId to distinguish repeated questionnaire instances.`
        );
      }
      seen.add(key);
    }
  }
}

// ── Item ID uniqueness ────────────────────────────────────────────────────────

function collectAllItemIds(items, ids) {
  for (const item of items ?? []) {
    if (item.type === 'if') {
      collectAllItemIds(item.then, ids);
      collectAllItemIds(item.else, ids);
    } else if (item.type === 'randomize') {
      collectAllItemIds(item.ids, ids);
    } else if (item.id) {
      ids.push(item.id);
    }
  }
}

function checkDuplicateItemIds(data, errors) {
  for (const q of data.questionnaires ?? []) {
    const ids = [];
    collectAllItemIds(q.items, ids);
    const seen = new Set();
    for (const id of ids) {
      if (seen.has(id)) {
        errors.push(`Questionnaire "${q.id}": duplicate item id "${id}".`);
      }
      seen.add(id);
    }
  }
}

// ── Option set validation ─────────────────────────────────────────────────────

function checkUniqueOptionValues(options, label, errors) {
  const seen = new Set();
  for (const opt of options ?? []) {
    if (seen.has(opt.value)) {
      errors.push(
        `${label} has duplicate option value ${opt.value}. Option values must be unique.`
      );
    }
    seen.add(opt.value);
  }
}

function checkBinaryOptionCount(options, label, errors) {
  if (options.length !== 2) {
    errors.push(`${label} must have exactly 2 options, got ${options.length}.`);
  }
}

function checkItemOptions(items, q, optionSetIds, errors) {
  for (const item of items ?? []) {
    if (item.type === 'if') {
      checkItemOptions(item.then, q, optionSetIds, errors);
      checkItemOptions(item.else, q, optionSetIds, errors);
      continue;
    }
    if (item.type === 'randomize') {
      checkItemOptions(item.ids, q, optionSetIds, errors);
      continue;
    }
    if (item.type !== 'select' && item.type !== 'binary') continue;

    const label = `Questionnaire "${q.id}" › item "${item.id}"`;

    if (item.options) {
      checkUniqueOptionValues(item.options, label, errors);
      if (item.type === 'binary') checkBinaryOptionCount(item.options, label, errors);
      continue;
    }

    // Binary items MUST have explicit option labels (either inline or via optionSet/defaultOptionSet).
    // There are no built-in fallback labels — each questionnaire must define its own.

    const ref = item.optionSetId ?? q.defaultOptionSetId;
    if (!ref) {
      errors.push(
        `${label} (${item.type}): no options, no optionSetId, ` +
        `and no defaultOptionSetId on the questionnaire.`
      );
      continue;
    }
    if (!optionSetIds.has(ref)) {
      errors.push(`${label}: references optionSetId "${ref}" which does not exist.`);
      continue;
    }
    if (item.type === 'binary') {
      checkBinaryOptionCount(q.optionSets[ref], `${label} (via optionSet "${ref}")`, errors);
    }
  }
}

function checkOptionSets(data, errors) {
  for (const q of data.questionnaires ?? []) {
    const optionSetIds = new Set(Object.keys(q.optionSets ?? {}));
    for (const [setId, options] of Object.entries(q.optionSets ?? {})) {
      checkUniqueOptionValues(
        options,
        `Questionnaire "${q.id}" › optionSet "${setId}"`,
        errors
      );
    }
    checkItemOptions(q.items, q, optionSetIds, errors);
  }
}

// ── Scoring reference validation ──────────────────────────────────────────────

function collectLeafItemIds(items, ids = new Set()) {
  for (const item of items ?? []) {
    if (item.type === 'if') {
      collectLeafItemIds(item.then, ids);
      collectLeafItemIds(item.else, ids);
    } else if (item.type === 'randomize') {
      collectLeafItemIds(item.ids, ids);
    } else if (item.id) {
      ids.add(item.id);
    }
  }
  return ids;
}

function checkScoringRefs(data, errors) {
  for (const q of data.questionnaires ?? []) {
    if (q.scoring?.method !== 'subscales') continue;
    const itemIds = collectLeafItemIds(q.items);
    for (const [name, ids] of Object.entries(q.scoring.subscales ?? {})) {
      for (const id of ids) {
        if (!itemIds.has(id)) {
          errors.push(
            `Questionnaire "${q.id}" › scoring.subscales["${name}"]: ` +
            `references item "${id}" which does not exist.`
          );
        }
      }
    }
  }
}

// ── Cross-entity uniqueness ───────────────────────────────────────────────────
// Battery IDs and questionnaire IDs share a single namespace in the runtime's
// items resolution. Collisions within the same file are a hard error.

function checkCrossEntityIdCollisions(data, errors) {
  const questionnaireIds = new Set((data.questionnaires ?? []).map(q => q.id));
  for (const battery of data.batteries ?? []) {
    if (questionnaireIds.has(battery.id)) {
      errors.push(
        `ID "${battery.id}" is used by both a questionnaire and a battery. ` +
        `Questionnaire and battery IDs must be unique across both types.`
      );
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Collect all semantic errors in a parsed QuestionnaireSet object.
 * Returns an array of human-readable strings. Never throws.
 *
 * @param   {object}   data
 * @returns {string[]}
 */
// ── Slider validation ─────────────────────────────────────────────────────────

function checkSliderItemsInList(items, qId, errors) {
  for (const item of items ?? []) {
    if (item.type === 'if') {
      checkSliderItemsInList(item.then, qId, errors);
      checkSliderItemsInList(item.else, qId, errors);
      continue;
    }
    if (item.type === 'randomize') {
      checkSliderItemsInList(item.ids, qId, errors);
      continue;
    }
    if (item.type !== 'slider') continue;
    const label = `Questionnaire "${qId}" › item "${item.id}" (slider)`;
    if (item.min >= item.max) {
      errors.push(`${label}: min (${item.min}) must be less than max (${item.max}).`);
    }
    if (item.step != null && item.step <= 0) {
      errors.push(`${label}: step must be greater than 0.`);
    }
  }
}

function checkSliderItems(data, errors) {
  for (const q of data.questionnaires ?? []) {
    checkSliderItemsInList(q.items, q.id, errors);
  }
}

export function collectConfigErrors(data) {
  const errors = [];
  checkDuplicateSessionKeys(data, errors);
  checkDuplicateItemIds(data, errors);
  checkOptionSets(data, errors);
  checkScoringRefs(data, errors);
  checkSliderItems(data, errors);
  checkCrossEntityIdCollisions(data, errors);
  return errors;
}

/**
 * Validate a parsed QuestionnaireSet object, throwing on the first violation.
 * url is appended to the error message so the caller knows which file failed.
 *
 * @param   {object} data
 * @param   {string} url   — source URL or path, for error messages
 * @throws  {ConfigError}
 */
export function validateConfigData(data, url) {
  const errors = collectConfigErrors(data);
  if (errors.length > 0) {
    throw new ConfigError(`${errors[0]}${url ? ` (${url})` : ''}`);
  }
}

/**
 * Check that every questionnaireId referenced inside batteries resolves to a
 * questionnaire available at runtime — either in the same config or in a
 * declared dependency.
 *
 * @param {Array<{rel: string, data: object}>} configFiles
 *   — All loaded config files, each with a relative path and parsed data.
 * @returns {string[]} — Error messages, empty if all references resolve.
 */
export function checkCrossFileBatteryRefs(configFiles) {
  // Map each file's rel path → Set of questionnaire IDs it provides
  const idsByFile = new Map();
  for (const { rel, data } of configFiles) {
    idsByFile.set(rel, new Set((data.questionnaires ?? []).map(q => q.id)));
  }

  // Resolve a dependency path string to the matching rel key
  function depToRel(dep) {
    const normalised = dep.startsWith('public/') ? dep : `public/${dep}`;
    for (const rel of idsByFile.keys()) {
      if (rel === normalised || rel.endsWith('/' + normalised) || rel.endsWith(normalised)) {
        return rel;
      }
    }
    return null;
  }

  function collectRefs(sequence) {
    const refs = [];
    for (const node of sequence ?? []) {
      if (node.questionnaireId) refs.push(node.questionnaireId);
      if (node.then) refs.push(...collectRefs(node.then));
      if (node.else) refs.push(...collectRefs(node.else));
    }
    return refs;
  }

  const errors = [];
  for (const { rel, data } of configFiles) {
    if (!data.batteries?.length) continue;

    // IDs available at runtime: own + declared dependencies
    const available = new Set(idsByFile.get(rel));
    for (const dep of data.dependencies ?? []) {
      const depRel = depToRel(dep);
      if (depRel) for (const id of idsByFile.get(depRel) ?? []) available.add(id);
    }

    for (const battery of data.batteries) {
      for (const ref of collectRefs(battery.sequence)) {
        if (!available.has(ref)) {
          errors.push(
            `Battery "${battery.id}" in ${rel} references questionnaire "${ref}" ` +
            `which is not in this file or its declared dependencies. ` +
            `Add the config that defines "${ref}" to this file's "dependencies" array.`
          );
        }
      }
    }
  }
  return errors;
}
