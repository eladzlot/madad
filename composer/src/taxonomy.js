// taxonomy.js — Hebrew display labels for the catalog meta enums.
//
// The enum *values* are the schema's (shared/config/QuestionnaireSet.schema.json,
// mirrored in the generated catalog). These maps give each a clinician-facing
// Hebrew label for tabs, filter chips, and card badges. Unknown values fall
// back to the raw value so a newly added enum never renders blank.

// The three real category tabs (an entry belongs to exactly one — see tabOf).
// The composer also offers a synthetic 'all' tab in front of these; it is not a
// category, so it is not listed here and tabOf never returns it.
export const TABS = ['questionnaires', 'batteries', 'worksheets'];

export const ALL_TAB = 'all';

export const TAB_LABELS = {
  all:            'הכל',
  questionnaires: 'שאלונים',
  batteries:      'סוללות',
  worksheets:     'דפי עבודה',
};

export const DOMAIN_LABELS = {
  depression:         'דיכאון',
  anxiety:            'חרדה',
  ocd:                'OCD',
  trauma:             'טראומה',
  psychosis:          'פסיכוזה',
  sleep:              'שינה',
  anger:              'כעס',
  social:             'חברתי',
  attachment:         'התקשרות',
  emotion_regulation: 'ויסות רגשי',
  functioning:        'תפקוד',
  alliance:           'ברית טיפולית',
  neurodevelopmental: 'נוירו-התפתחותי',
  intake:             'אינטייק',
  general:            'כללי',
};

export const POPULATION_LABELS = {
  adult:      'מבוגרים',
  adolescent: 'מתבגרים',
  child:      'ילדים',
  parent:     'הורים',
};

export const TYPE_LABELS = {
  screener:  'איתור',
  severity:  'חומרה',
  process:   'תהליך',
  worksheet: 'דף עבודה',
  other:     'אחר',
};

// Hebrew labels for the answerable item *types* (used by the preview to name each
// item's kind). Distinct from TYPE_LABELS above, which labels the catalog meta
// `type` (screener/severity/…). When a new item type is added to
// shared/config/item-types.js, add its label here too (see that file's header).
export const ITEM_TYPE_LABELS = {
  instructions: 'הנחיה',
  select:       'בחירה',
  binary:       'כן/לא',
  slider:       'סקאלה',
  text:         'טקסט חופשי',
  multiselect:  'בחירה מרובה',
};

// Hebrew labels for the scoring.method enum (shown in the preview).
export const SCORING_METHOD_LABELS = {
  none:      'ללא ניקוד',
  sum:       'סכום',
  average:   'ממוצע',
  subscales: 'תת-סולמות',
  custom:    'מותאם אישית',
};

export const itemTypeLabel      = (v) => ITEM_TYPE_LABELS[v] ?? v;
export const scoringMethodLabel = (v) => SCORING_METHOD_LABELS[v] ?? v;

export const domainLabel     = (v) => DOMAIN_LABELS[v] ?? v;
export const populationLabel = (v) => POPULATION_LABELS[v] ?? v;
export const typeLabel       = (v) => TYPE_LABELS[v] ?? v;
export const tabLabel        = (v) => TAB_LABELS[v] ?? v;

// Which tab an entry belongs to. Worksheets (type) take precedence over the
// battery/questionnaire kind split — a worksheet is filed under דפי עבודה
// regardless of kind. Matches the plan's derivation.
export function tabOf(entry) {
  if (entry.type === 'worksheet') return 'worksheets';
  if (entry.kind === 'battery') return 'batteries';
  return 'questionnaires';
}
