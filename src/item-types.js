// Item Type Registry
// Single source of truth for all item type behaviour.
// Adding a new type: add one entry here, then build its component and PDF renderer.
//
// Each entry declares:
//   tag              — custom element tag name
//   autoAdvance      — fires 'advance' immediately after 'answer' (likert/binary pattern)
//   skippableDefault — whether unanswered = valid to advance (overridden by item.required)
//   contributesToScore — whether scoring engine counts this type
//   answerIsNumeric  — whether answer is always a number (for DSL context)
//   answerShape      — 'scalar' | 'array' | 'object'
//   pdfRenderer      — key into PDF_RENDERERS (see report.js)

const REGISTRY = {
  likert: {
    tag:                'item-likert',
    autoAdvance:        true,
    skippableDefault:   false,
    contributesToScore: true,
    answerIsNumeric:    true,
    answerShape:        'scalar',
    pdfRenderer:        'scored',
  },
  binary: {
    tag:                'item-binary',
    autoAdvance:        true,
    skippableDefault:   false,
    contributesToScore: true,
    answerIsNumeric:    true,
    answerShape:        'scalar',
    pdfRenderer:        'scored',
  },
  instructions: {
    tag:                'item-instructions',
    autoAdvance:        false,  // fires 'advance' directly with no prior 'answer' event
    skippableDefault:   true,   // never needs an answer
    contributesToScore: false,
    answerIsNumeric:    false,
    answerShape:        'scalar',
    pdfRenderer:        'instructions',
  },
  text: {
    tag:                'item-text',
    autoAdvance:        false,  // requires explicit submit — never auto-advances
    skippableDefault:   true,   // skippable by default; set required:true to force
    contributesToScore: false,
    answerIsNumeric:    false,
    answerShape:        'scalar',
    pdfRenderer:        'text',
  },
};

// Control-flow nodes — not rendered as items, never reach the component layer.
// Listed here so getType() doesn't throw for them if called defensively.
const CONTROL_NODES = new Set(['if', 'randomize']);

/**
 * Look up a type descriptor. Throws for unknown types (not control nodes).
 * @param {string} type
 * @returns {object}
 */
export function getType(type) {
  if (REGISTRY[type]) return REGISTRY[type];
  if (CONTROL_NODES.has(type)) throw new Error(`item-types: "${type}" is a control node, not an item type`);
  throw new Error(`item-types: unknown item type "${type}"`);
}

/**
 * Whether this item type contributes to questionnaire scoring.
 * Replaces scattered `item.type === 'likert' || item.type === 'binary'` checks.
 */
export function isScored(item) {
  return REGISTRY[item?.type]?.contributesToScore === true;
}

/**
 * Whether this item type's answer is always a numeric scalar.
 * Used to filter answers for DSL context — only numeric scalars are exposed.
 */
export function isNumericAnswer(item) {
  return REGISTRY[item?.type]?.answerIsNumeric === true;
}

/**
 * Whether this item type auto-advances after selection.
 * If false, the component must emit 'advance' explicitly (e.g. via a submit button).
 */
export function autoAdvances(item) {
  return REGISTRY[item?.type]?.autoAdvance === true;
}

/**
 * Whether this item can be skipped (advanced past without an answer).
 * Respects item.required override: true = must answer, false = may skip.
 * Falls back to type's skippableDefault.
 */
export function isSkippable(item) {
  if (item?.required === true)  return false;
  if (item?.required === false) return true;
  return REGISTRY[item?.type]?.skippableDefault === true;
}

/**
 * Whether the patient can currently advance past this item.
 * @param {object} item    — resolved item definition
 * @param {any}    answer  — current answer value (may be null/undefined)
 */
export function canAdvance(item, answer) {
  if (isSkippable(item)) return true;
  // Scalar types: need a non-null answer
  const shape = REGISTRY[item?.type]?.answerShape ?? 'scalar';
  if (shape === 'scalar') return answer != null;
  if (shape === 'array')  return Array.isArray(answer); // [] is valid
  if (shape === 'object') return answer != null && typeof answer === 'object';
  return answer != null;
}

/**
 * The custom element tag for this item type.
 * Falls back to 'item-likert' for unknown types (defensive — should not happen).
 */
export function tagForType(type) {
  return REGISTRY[type]?.tag ?? 'item-likert';
}
