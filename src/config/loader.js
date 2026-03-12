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
//   ConfigFetchError      — HTTP failure or network error
//   ConfigValidationError — AJV schema violation
//   ConfigError           — semantic violation (duplicate session key, missing option set, etc.)

import Ajv from 'ajv/dist/2020.js';
import schema from './QuestionnaireSet.schema.json' with { type: 'json' };
import { validateConfigData, ConfigError } from './config-validation.js';

export { ConfigError };

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

  validateConfigData(data, url);

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
