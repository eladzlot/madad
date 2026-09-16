// taxonomy.js — display labels for the catalog meta enums, in the clinician's
// UI language.
//
// The enum *values* are the schema's (shared/config/QuestionnaireSet.schema.json,
// mirrored in the generated catalog). Each maps to a `<group>.<value>` key in
// clinician/i18n; unknown values fall back to the raw value so a newly added
// enum never renders blank (makeT returns the key, so we check the table).

import { t } from '../../clinician/i18n/index.js';

// The three real category tabs (an entry belongs to exactly one — see tabOf).
// The composer also offers a synthetic 'all' tab in front of these; it is not a
// category, so it is not listed here and tabOf never returns it.
export const TABS = ['questionnaires', 'batteries', 'worksheets'];

export const ALL_TAB = 'all';

const label = (group, v) => {
  const key = `${group}.${v}`;
  const out = t(key);
  return out === key ? v : out;
};

export const tabLabel           = (v) => label('tab', v);
export const domainLabel        = (v) => label('domain', v);
export const populationLabel    = (v) => label('population', v);
export const typeLabel          = (v) => label('type', v);
// Labels for the answerable item *types* (used by the preview to name each
// item's kind). Distinct from typeLabel above, which labels the catalog meta
// `type` (screener/severity/…). When a new item type is added to
// shared/config/item-types.js, add its label to clinician/i18n too.
export const itemTypeLabel      = (v) => label('itemType', v);
export const scoringMethodLabel = (v) => label('scoring', v);
export const inputTypeLabel     = (v) => label('input', v);

// Which tab an entry belongs to. Worksheets (type) take precedence over the
// battery/questionnaire kind split — a worksheet is filed under דפי עבודה
// regardless of kind. Matches the plan's derivation.
export function tabOf(entry) {
  if (entry.type === 'worksheet') return 'worksheets';
  if (entry.kind === 'battery') return 'batteries';
  return 'questionnaires';
}
