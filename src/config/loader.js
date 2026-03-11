// Config Loader
// Fetches, validates, and merges one or more QuestionnaireSet config files.
// See IMPLEMENTATION_SPEC.md §8.
//
// Public API:
//   loadConfig(sources, options?)  → Promise<ResolvedConfig>
//
// sources: string[] — each entry is either:
//   - A slug (no slashes, no protocol) → resolved to /configs/<slug>.json
//   - A full URL (starts with https:// or http:// or /) → used as-is
//
// options:
//   filterIds: string[]   — keep only questionnaires with these IDs (from URL ?questionnaires=)
//   fetch: fn             — injectable fetch (default: globalThis.fetch)
//
// ResolvedConfig: {
//   questionnaires: Questionnaire[],
//   batteries:      Battery[],
//   version:        string,
//   resolvedAt:     string,   // ISO timestamp
// }
//
// Errors thrown:
//   ConfigFetchError    — HTTP failure or network error
//   ConfigValidationError — AJV schema violation (message in Hebrew + English)
//   ConfigError         — semantic violation (duplicate session key, missing option set, etc.)

import Ajv from 'ajv/dist/2020.js';
import schema from './QuestionnaireSet.schema.json' with { type: 'json' };

// ─── Error classes ────────────────────────────────────────────────────────────

export class ConfigFetchError extends Error {
  constructor(url, cause) {
    super(`Failed to fetch config from "${url}": ${cause?.message ?? cause}`);
    this.name = 'ConfigFetchError';
    this.url = url;
  }
}

export class ConfigValidationError extends Error {
  constructor(url, errors) {
    const summary = errors.map(e => `  ${e.instancePath || '/'} — ${e.message}`).join('\n');
    super(`Config file "${url}" failed validation:\n${summary}`);
    this.name = 'ConfigValidationError';
    this.url = url;
    this.validationErrors = errors;
  }
}

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

// ─── AJV setup ────────────────────────────────────────────────────────────────

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

// ─── URL resolution ───────────────────────────────────────────────────────────

function resolveSource(source) {
  // Full URL or absolute path — use as-is
  if (/^https?:\/\//.test(source) || source.startsWith('/')) {
    return source;
  }
  // Slug — resolve relative to /configs/
  return `/configs/${source}.json`;
}

// ─── Duplicate session key validation ────────────────────────────────────────

/**
 * Recursively collect all possible session keys from a battery sequence.
 * Walks into if.then, if.else, and randomize.ids branches.
 */
function collectSessionKeys(nodes) {
  const keys = [];
  for (const node of nodes) {
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

function validateNoDuplicateSessionKeys(batteries, url) {
  for (const battery of batteries ?? []) {
    const keys = collectSessionKeys(battery.sequence ?? []);
    const seen = new Set();
    for (const key of keys) {
      if (seen.has(key)) {
        throw new ConfigError(
          `Battery "${battery.id}" in "${url}" has duplicate session key "${key}". ` +
          `Use instanceId to distinguish repeated questionnaire instances.`
        );
      }
      seen.add(key);
    }
  }
}

// ─── Default option set validation ───────────────────────────────────────────

function checkUniqueOptionValues(options, itemId, questionnaireId, url) {
  const seen = new Set();
  for (const opt of options) {
    if (seen.has(opt.value)) {
      throw new ConfigError(
        `Item "${itemId}" in questionnaire "${questionnaireId}" (${url}) has duplicate option value "${opt.value}". ` +
        `Option values must be unique within an item.`
      );
    }
    seen.add(opt.value);
  }
}

function checkBinaryOptionCount(options, itemId, questionnaireId, url) {
  if (options.length !== 2) {
    throw new ConfigError(
      `Binary item "${itemId}" in questionnaire "${questionnaireId}" (${url}) ` +
      `must have exactly 2 options, got ${options.length}.`
    );
  }
}

function validateOptionSets(questionnaires, url) {
  for (const q of questionnaires ?? []) {
    const optionSetIds = new Set(Object.keys(q.optionSets ?? {}));

    // Validate uniqueness of values within each option set
    for (const [setId, options] of Object.entries(q.optionSets ?? {})) {
      checkUniqueOptionValues(options, `optionSet:${setId}`, q.id, url);
    }

    for (const item of q.items ?? []) {
      if (item.type !== 'likert' && item.type !== 'binary') continue;

      if (item.options) {
        checkUniqueOptionValues(item.options, item.id, q.id, url);
        if (item.type === 'binary') checkBinaryOptionCount(item.options, item.id, q.id, url);
        continue;
      }

      // Option set reference — validate it exists
      const ref = item.optionSetId ?? q.defaultOptionSetId;
      if (!ref) {
        throw new ConfigError(
          `Binary item "${item.id}" in questionnaire "${q.id}" (${url}) has no options, ` +
          `no optionSetId, and no defaultOptionSetId on the questionnaire.`
        );
      }
      if (!optionSetIds.has(ref)) {
        throw new ConfigError(
          `Item "${item.id}" in questionnaire "${q.id}" (${url}) references ` +
          `optionSetId "${ref}" which does not exist.`
        );
      }
      // For binary items using an option set — validate count
      if (item.type === 'binary') {
        const options = q.optionSets[ref];
        checkBinaryOptionCount(options, item.id, q.id, url);
      }
    }
  }
}

// ─── Fetch and validate a single file ────────────────────────────────────────

async function fetchAndValidate(source, fetchFn) {
  const url = resolveSource(source);

  let data;
  try {
    const res = await fetchFn(url);
    if (!res.ok) {
      throw new ConfigFetchError(url, `HTTP ${res.status} ${res.statusText}`);
    }
    data = await res.json();
  } catch (err) {
    if (err instanceof ConfigFetchError) throw err;
    throw new ConfigFetchError(url, err);
  }

  const valid = validate(data);
  if (!valid) {
    throw new ConfigValidationError(url, validate.errors);
  }

  validateNoDuplicateSessionKeys(data.batteries, url);
  validateOptionSets(data.questionnaires, url);

  return { url, data };
}

// ─── Merge ────────────────────────────────────────────────────────────────────

function mergeConfigs(results) {
  const questionnairesById = new Map();
  const batteriesById = new Map();

  for (const { data } of results) {
    for (const q of data.questionnaires ?? []) {
      // Later files win on duplicate questionnaire IDs
      questionnairesById.set(q.id, q);
    }
    for (const b of data.batteries ?? []) {
      batteriesById.set(b.id, b);
    }
  }

  return {
    questionnaires: [...questionnairesById.values()],
    batteries:      [...batteriesById.values()],
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load, validate, and merge one or more config sources.
 *
 * @param {string[]} sources  — slugs or full URLs
 * @param {object}   options
 * @param {string[]} [options.filterIds]  — keep only these questionnaire IDs
 * @param {Function} [options.fetch]      — injectable fetch (default: globalThis.fetch)
 * @returns {Promise<ResolvedConfig>}
 */
export async function loadConfig(sources, options = {}) {
  const { filterIds, fetch: fetchFn = globalThis.fetch } = options;

  if (!sources || sources.length === 0) {
    throw new ConfigError('loadConfig requires at least one source.');
  }

  const results = await Promise.all(
    sources.map(src => fetchAndValidate(src, fetchFn))
  );

  const { questionnaires, batteries } = mergeConfigs(results);

  const filtered = filterIds && filterIds.length > 0
    ? questionnaires.filter(q => filterIds.includes(q.id))
    : questionnaires;

  return {
    questionnaires: filtered,
    batteries,
    version:    results[0].data.version ?? null,
    resolvedAt: new Date().toISOString(),
  };
}
