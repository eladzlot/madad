// Item Type Registry
// Single source of truth for all item type behaviour.
// Adding a new type: add one entry here, then build its component and PDF renderer.
//
// Each entry declares:
//   tag              — custom element tag name
//   autoAdvance      — fires 'advance' immediately after 'answer' (select/binary pattern)
//   skippableDefault — whether unanswered = valid to advance (overridden by item.required)
//   contributesToScore — whether scoring engine counts this type
//   answerShape      — 'scalar' | 'array' | 'object'

const REGISTRY = {
  select: {
    tag:                'item-select',
    autoAdvance:        true,
    skippableDefault:   false,
    contributesToScore: true,
    answerShape:        'scalar',
  },
  binary: {
    tag:                'item-binary',
    autoAdvance:        true,
    skippableDefault:   false,
    contributesToScore: true,
    answerShape:        'scalar',
  },
  instructions: {
    tag:                'item-instructions',
    autoAdvance:        false,  // fires 'advance' directly with no prior 'answer' event
    skippableDefault:   true,   // never needs an answer
    contributesToScore: false,
    answerShape:        'scalar',
  },
  text: {
    tag:                'item-text',
    autoAdvance:        false,  // requires explicit submit — never auto-advances
    skippableDefault:   true,   // skippable by default; set required:true to force
    contributesToScore: false,
    answerShape:        'scalar',
  },
  slider: {
    tag:                'item-slider',
    autoAdvance:        false,  // requires explicit submit
    skippableDefault:   false,  // required by default like select
    contributesToScore: true,
    answerShape:        'scalar',
  },
  multiselect: {
    tag:                'item-multiselect',
    autoAdvance:        false,   // requires explicit submit
    skippableDefault:   true,    // zero selections is valid — skippable by default
    contributesToScore: false,
    answerShape:        'array',
  },
};

/**
 * Whether this item type contributes to questionnaire scoring.
 * Replaces scattered `item.type === 'select' || item.type === 'binary'` checks.
 */
export function isScored(item) {
  return REGISTRY[item?.type]?.contributesToScore === true;
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
  if (shape === 'array') {
    // [] is valid (zero selections) unless required: true forces at least one
    if (item?.required === true) return Array.isArray(answer) && answer.length > 0;
    return Array.isArray(answer);
  }
  if (shape === 'object') return answer != null && typeof answer === 'object';
  return answer != null;
}

/**
 * The custom element tag for this item type.
 * Falls back to 'item-select' for unknown types (defensive — should not happen).
 */
export function tagForType(type) {
  return REGISTRY[type]?.tag ?? 'item-select';
}
