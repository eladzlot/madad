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
//   fetch: fn              — injectable fetch (default: globalThis.fetch)
//   allowedOrigins: Set    — https:// origins permitted for external config URLs.
//                            Defaults to same-origin only (location.origin).
//                            Pass an explicit Set to allow trusted external servers.
//                            Pass an empty Set (new Set()) to block all external URLs.
//
// External-origin support is deliberately opt-in. To allow a trusted external
// config server in the future, pass its origin at the call site:
//   loadConfig(sources, { allowedOrigins: new Set(['https://configs.example.com']) })
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

import validate from './validate-schema.js';
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

// ─── URL resolution ───────────────────────────────────────────────────────────

// resolveSource validates the source string and returns a URL/path safe to fetch.
// allowedOrigins: Set<string> — permitted external https:// origins.
// Relative and same-origin paths are always allowed; http:// is never allowed.
function resolveSource(source, allowedOrigins) {
  if (/^https?:\/\//.test(source)) {
    let parsed;
    try { parsed = new URL(source); } catch {
      throw new ConfigError(`Invalid config URL: "${source}"`);
    }
    const isSameOrigin = allowedOrigins.has(parsed.origin);
    // Same-origin URLs are always permitted regardless of protocol.
    // (e.g. http://localhost in development is fine — no cross-origin risk.)
    if (isSameOrigin) return source;
    // External origins: HTTPS only, and must be explicitly listed.
    if (parsed.protocol !== 'https:') {
      throw new ConfigError(
        `External config URLs must use HTTPS: "${source}"`
      );
    }
    throw new ConfigError(
      `Config origin not permitted: "${parsed.origin}". ` +
      `Only same-origin configs are loaded by default. ` +
      `To allow an external config server, pass its origin in the allowedOrigins option.`
    );
  }
  if (source.startsWith('/')) return source;         // root-relative path
  if (source.includes('/') || source.endsWith('.json')) return source; // relative path
  return `configs/${source}.json`;                   // slug → relative path
}

// ─── Fetch and validate a single file ────────────────────────────────────────

async function fetchAndValidate(source, fetchFn, allowedOrigins) {
  const url = resolveSource(source, allowedOrigins);

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
  const {
    fetch: fetchFn = globalThis.fetch,
    // allowedOrigins: Set of https:// origins permitted for external config URLs.
    // Defaults to same-origin only. To allow a trusted external config server,
    // pass: allowedOrigins: new Set(['https://configs.example.com'])
    allowedOrigins = new Set(
      typeof location !== 'undefined' ? [location.origin] : []
    ),
  } = options;

  if (!sources || sources.length === 0) {
    throw new ConfigError('loadConfig requires at least one source.');
  }

  const results = await Promise.all(
    sources.map(src => fetchAndValidate(src, fetchFn, allowedOrigins))
  );

  const { questionnaires, batteries } = mergeConfigs(results);

  return {
    questionnaires,
    batteries,
    dependencies: results[0].data.dependencies ?? [],
    version:    results[0].data.version ?? null,
    resolvedAt: new Date().toISOString(),
  };
}
