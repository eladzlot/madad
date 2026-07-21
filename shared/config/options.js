// Option resolution — the single source of truth for turning an item's option
// reference into a concrete [{label, value}] array.
//
// Resolution order (highest priority first):
//   1. item.options            — inline options on the item
//   2. optionSets[item.optionSetId]        — a named set on the questionnaire
//   3. optionSets[defaultOptionSetId]      — the questionnaire default
//   4. []                      — nothing resolvable (author error for
//                                select/binary; caught by validate:configs)
//
// Returns the SAME array reference when one is found (no copy) so identity holds
// for callers that compare references. Returns a fresh [] only when nothing
// resolves.
//
// Consumers: src/engine/scoring.js (responseRange), src/controller.js (item
// resolution before mount), src/pdf/report.js (report rows), and the composer
// preview model. config-validation.js deliberately does NOT use this — it must
// distinguish the missing cases to emit specific author errors.
export function resolveItemOptions(item, questionnaire) {
  if (item.options) return item.options;
  const setId = item.optionSetId ?? questionnaire?.defaultOptionSetId;
  return questionnaire?.optionSets?.[setId] ?? [];
}
