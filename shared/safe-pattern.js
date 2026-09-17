// safe-pattern.js
// Single source of truth for the ReDoS guard on config-supplied `pattern`
// fields (item type `text`).
//
// Used by both:
//   - the patient app (src/components/item-text.js) — skips unsafe patterns
//     at validation time rather than running them against a typed answer
//   - config validation (shared/config/config-validation.js) — rejects unsafe
//     patterns in CI, where the config author gets an actionable error
//
// Why a syntactic check: JS has no regex timeout and no way to abort a running
// match, so a pattern with catastrophic backtracking freezes the tab for as
// long as it takes — a `(a|a)+` against 30 characters runs for over a minute.
// The only defence available before the match starts is to refuse the shapes
// that cause it, and to bound the input the match runs against.
//
// This is a conservative syntactic check, not a ReDoS solver. It rejects the
// three classic ambiguity shapes below; everything it lets through is bounded
// by MAX_VALIDATED_LENGTH, which keeps polynomial (rather than exponential)
// backtracking within a few milliseconds.
//
// Public API:
//   MAX_PATTERN_LENGTH    — longest accepted pattern source
//   MAX_VALIDATED_LENGTH  — longest input a pattern is run against
//   isSafePattern(p)      → boolean
//   unsafePatternReason(p) → string | null  (why it was rejected, for CI)

export const MAX_PATTERN_LENGTH = 200;
export const MAX_VALIDATED_LENGTH = 1000;

// Each entry: [test, reason]. Order matters only for which reason is reported.
const UNSAFE_SHAPES = [
  // Nested quantifiers: (x+)+ (x*)+ (x+)* (x?)+ — exponential.
  [/\([^)]*[*+?][^)]*\)[*+?]/, 'a quantified group that itself contains a quantifier, e.g. (a+)+'],
  // Adjacent quantified groups: )+( )*( — exponential when the groups overlap.
  [/\)[*+?]\s*\(/, 'two adjacent quantified groups, e.g. (a)+(b)+'],
  // Quantified alternation: (a|a)+ (a|ab)* — exponential when the branches
  // can match the same text. Distinguishing overlapping branches from disjoint
  // ones is undecidable in general, so all quantified alternation is refused.
  [/\([^)]*\|[^)]*\)[*+]/, 'a quantified group containing an alternation, e.g. (a|b)+'],
];

export function unsafePatternReason(pattern) {
  if (typeof pattern !== 'string') return 'pattern must be a string';
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return `pattern exceeds ${MAX_PATTERN_LENGTH} characters`;
  }
  for (const [re, reason] of UNSAFE_SHAPES) {
    if (re.test(pattern)) return `pattern contains ${reason}`;
  }
  try {
    new RegExp(pattern);
  } catch (err) {
    return `pattern is not a valid regular expression: ${err.message}`;
  }
  return null;
}

export function isSafePattern(pattern) {
  return unsafePatternReason(pattern) === null;
}
