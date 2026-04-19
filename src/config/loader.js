// Config Loader
// Fetches, validates, and merges one or more QuestionnaireSet config files.
// See IMPLEMENTATION_SPEC.md §8.
//
// Public API:
//   loadConfig(sources, options?)  → Promise<ResolvedConfig>
//
// sources: string[] — each entry is one of:
//   - A short name (alphanumeric, hyphens, underscores only) → expanded to
//     /<configBase><name>.json (default base: configs/prod/)
//   - A root-relative path (starts with /) → used as-is
//   - A path with slashes or .json extension → used as-is (legacy full path)
//   - A full https:// or http:// URL → validated against allowedOrigins
//
// options:
//   fetch: fn              — injectable fetch (default: globalThis.fetch)
//   allowedOrigins: Set    — https:// origins permitted for external config URLs.
//                            Defaults to same-origin only (location.origin).
//                            Pass an explicit Set to allow trusted external servers.
//                            Pass an empty Set (new Set()) to block all external URLs.
//   fetchTimeoutMs: number — abort fetch after this many ms (default: 10000).
//                            Pass 0 to disable the timeout (e.g. in unit tests that
//                            control timing themselves).
//   configBase: string     — base path for short-name expansion (default: 'configs/prod/').
//                            The expanded path is /<configBase><name>.json.
//                            Override in tests or non-standard deployments.
//   loadDependencies: bool — whether to auto-fetch configs declared in each
//                            file's "dependencies" array. Default: true.
//                            Set to false when the caller manages the full set
//                            of configs itself (e.g. the Composer, which loads
//                            every manifest entry directly and would otherwise
//                            register the same items twice — once from the
//                            direct fetch, once from the dependency auto-fetch).
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
//   ConfigFetchError      — HTTP failure, network error, or timeout (timedOut: true)
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
    // Set to true when the error was caused by the fetch timeout rather than an
    // HTTP error or network failure. Callers can use this to show a "check your
    // connection" message rather than a "bad URL" message.
    this.timedOut = false;
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
// configBase:    string — base path used when expanding short names.
// baseUrl:       string — deployment base path (Vite's import.meta.env.BASE_URL),
//                always starts and ends with '/'. Prepended to short-name and
//                legacy-relative paths so they resolve correctly under non-root
//                deployments (e.g. GitHub Pages at /madad/). Root-relative paths
//                (source starts with '/') bypass this — callers using absolute
//                paths are opting out of base-aware resolution.
// Relative and same-origin paths are always allowed; http:// is never allowed.
const SHORT_NAME_RE = /^[a-zA-Z0-9_-]+$/;

function resolveSource(source, allowedOrigins, configBase, baseUrl) {
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
  // Reject path traversal in any non-absolute, non-external source.
  if (source.includes('..')) {
    throw new ConfigError(
      `Invalid config source: "${source}". Path traversal is not permitted.`
    );
  }
  // Paths containing slashes or ending with .json are legacy full paths.
  // Normalise to baseUrl-prefixed (e.g. '/madad/configs/prod/standard.json')
  // so the visited-set key matches the key produced by the short-name branch.
  // Without consistent prefixing, 'configs/prod/standard.json' and the short
  // name 'standard' would appear as different keys and the same file would be
  // fetched twice, causing a duplicate-ID merge error.
  if (source.includes('/') || source.endsWith('.json')) {
    return source.startsWith('/') ? source : baseUrl + source;
  }
  // Short name: alphanumeric, hyphens, underscores only. Reject anything else
  // (e.g. path-traversal attempts like '../escape') before constructing a path.
  if (!SHORT_NAME_RE.test(source)) {
    throw new ConfigError(
      `Invalid config source: "${source}". ` +
      `Short names may only contain letters, digits, hyphens, and underscores.`
    );
  }
  return `${baseUrl}${configBase}${source}.json`;
}

// ─── Fetch and validate a single file ────────────────────────────────────────

async function fetchAndValidate(source, fetchFn, allowedOrigins, fetchTimeoutMs, configBase, baseUrl) {
  const url = resolveSource(source, allowedOrigins, configBase, baseUrl);

  // Optional abort-on-timeout. Disabled when fetchTimeoutMs is 0 or negative.
  let controller, timeoutId;
  if (fetchTimeoutMs > 0) {
    controller = new AbortController();
    timeoutId  = setTimeout(() => controller.abort(), fetchTimeoutMs);
  }

  let data;
  try {
    const fetchOptions = controller ? { signal: controller.signal } : undefined;
    const res = await fetchFn(url, fetchOptions);
    if (!res.ok) throw new ConfigFetchError(url, `HTTP ${res.status} ${res.statusText}`);
    data = await res.json();
  } catch (err) {
    if (err instanceof ConfigFetchError) throw err;
    if (err.name === 'AbortError') {
      const fetchErr = new ConfigFetchError(
        url,
        `Request timed out after ${fetchTimeoutMs}ms`,
      );
      fetchErr.timedOut = true;
      throw fetchErr;
    }
    throw new ConfigFetchError(url, err);
  } finally {
    // Always clear the timeout so it doesn't fire after a successful fetch.
    if (timeoutId !== undefined) clearTimeout(timeoutId);
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
    // fetchTimeoutMs: abort the fetch after this many milliseconds.
    // Default: 10 seconds. Pass 0 to disable (useful in tests that control timing).
    fetchTimeoutMs = 10_000,
    // configBase: base path used when expanding short config names.
    // Default: 'configs/prod/' → short name 'standard' expands to /configs/prod/standard.json
    // Override in tests or non-standard deployments.
    configBase = 'configs/prod/',
    // loadDependencies: when false, declared "dependencies" in each config are
    // ignored (no auto-fetch). The Composer sets this because it loads every
    // manifest entry itself and dep auto-fetch would cause double-registration.
    // See file-header comment.
    loadDependencies = true,
    // baseUrl: deployment base path (Vite's import.meta.env.BASE_URL). Prepended
    // to short-name and legacy-relative config paths so they resolve correctly
    // under non-root deployments (e.g. GitHub Pages at /madad/). In dev this is
    // '/', in production it is '/madad/'. Callers that need a custom base (tests,
    // special deployments) can override. Must start and end with '/'.
    baseUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/',
  } = options;

  if (!sources || sources.length === 0) {
    throw new ConfigError('loadConfig requires at least one source.');
  }

  // Breadth-first graph walk: fetch the requested sources, then auto-fetch any
  // dependencies they declare that haven't been loaded yet, and so on until the
  // graph is complete. Each wave is fetched in parallel; waves are sequential.
  // The visited set (keyed by resolved URL) prevents duplicate fetches and
  // breaks cycles.
  const visited = new Set();   // resolved URLs already fetched or in-flight
  const allResults = [];       // { url, data } from every fetched file

  let wave = sources.slice();  // current batch of sources to fetch

  while (wave.length > 0) {
    // Resolve each source to its canonical URL and skip any already visited.
    const toFetch = [];
    for (const src of wave) {
      const url = resolveSource(src, allowedOrigins, configBase, baseUrl);
      if (!visited.has(url)) {
        visited.add(url);
        toFetch.push(src);
      }
    }

    if (toFetch.length === 0) break;

    // Fetch this wave in parallel.
    const waveResults = await Promise.all(
      toFetch.map(src => fetchAndValidate(src, fetchFn, allowedOrigins, fetchTimeoutMs, configBase, baseUrl))
    );

    allResults.push(...waveResults);

    // Collect deps declared by this wave that haven't been visited yet.
    // These become the next wave. Skip entirely when caller opted out of
    // dependency auto-loading.
    if (!loadDependencies) break;
    wave = waveResults
      .flatMap(r => r.data.dependencies ?? [])
      .filter(dep => {
        try {
          return !visited.has(resolveSource(dep, allowedOrigins, configBase, baseUrl));
        } catch {
          return false; // resolveSource will throw again (and surface the error) in the next wave
        }
      });
  }

  const { questionnaires, batteries } = mergeConfigs(allResults);

  // Collect all declared dependencies across every loaded file, deduplicating.
  // Kept in the return value for informational purposes — callers can inspect
  // the full dependency graph regardless of what was in the URL.
  const allDependencies = [...new Set(allResults.flatMap(r => r.data.dependencies ?? []))];

  return {
    questionnaires,
    batteries,
    dependencies: allDependencies,
    version:    allResults[0].data.version ?? null,
    resolvedAt: new Date().toISOString(),
  };
}
