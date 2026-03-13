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
//   fetch: fn  — injectable fetch (default: globalThis.fetch)
//
// ResolvedConfig: {
//   questionnaires: Questionnaire[],
//   batteries:      Battery[],
//   version:        string | null,
//   resolvedAt:     string,
// }
//
// Errors thrown:
//   ConfigFetchError      — HTTP failure or network error
//   ConfigValidationError — AJV schema violation
//   ConfigError           — semantic violation (duplicate ID, missing option set, etc.)

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
  if (/^https?:\/\//.test(source) || source.startsWith('/')) return source;
  return `/configs/${source}.json`;
}

// ─── Fetch and validate a single file ────────────────────────────────────────

async function fetchAndValidate(source, fetchFn) {
  const url = resolveSource(source);

  let data;
  try {
    const res = await fetchFn(url);
    if (!res.ok) throw new ConfigFetchError(url, `HTTP ${res.status} ${res.statusText}`);
    data = await res.json();
  } catch (err) {
    if (err instanceof ConfigFetchError) throw err;
    throw new ConfigFetchError(url, err);
  }

  if (!validate(data)) throw new ConfigValidationError(url, validate.errors);

  validateConfigData(data, url);

  return { url, data };
}

// ─── Merge ────────────────────────────────────────────────────────────────────

function mergeConfigs(results) {
  const questionnaires = [];
  const batteries      = [];
  const seenQIds = new Set();
  const seenBIds = new Set();

  for (const { url, data } of results) {
    for (const q of data.questionnaires ?? []) {
      if (seenQIds.has(q.id)) {
        throw new ConfigError(
          `Duplicate questionnaire ID "${q.id}" found when merging configs (in "${url}"). ` +
          `Questionnaire IDs must be unique across all loaded configs.`
        );
      }
      seenQIds.add(q.id);
      questionnaires.push(q);
    }
    for (const b of data.batteries ?? []) {
      if (seenBIds.has(b.id)) {
        throw new ConfigError(
          `Duplicate battery ID "${b.id}" found when merging configs (in "${url}"). ` +
          `Battery IDs must be unique across all loaded configs.`
        );
      }
      seenBIds.add(b.id);
      batteries.push(b);
    }
  }

  return { questionnaires, batteries };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function loadConfig(sources, options = {}) {
  const { fetch: fetchFn = globalThis.fetch } = options;

  if (!sources || sources.length === 0) {
    throw new ConfigError('loadConfig requires at least one source.');
  }

  const results = await Promise.all(
    sources.map(src => fetchAndValidate(src, fetchFn))
  );

  const { questionnaires, batteries } = mergeConfigs(results);

  return {
    questionnaires,
    batteries,
    version:    results[0].data.version ?? null,
    resolvedAt: new Date().toISOString(),
  };
}
