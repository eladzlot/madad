// Answer risk level — which answers a report highlights.
//
// 'high' for the worst option (the highest value, or the lowest on a
// reverse-scored item), 'med' for the second-worst option of a select item,
// null otherwise. Sliders use position in range: ≥ 80% high, ≥ 60% med.
//
// Consumers: src/pdf/report.js (response-table row fill) and the Aggregate's
// session-detail panel (answer rows), so a session reads the same in the PDF
// and on screen. `options` is the item's resolved option list
// (resolveItemOptions in ./options.js).
export function calcRiskLevel(item, value, options) {
  if (item.type === 'slider') {
    const { min = 0, max = 10 } = item;
    const range = max - min;
    if (range <= 0) return null;
    const pos = (value - min) / range;
    if (pos >= 0.8) return 'high';
    if (pos >= 0.6) return 'med';
    return null;
  }

  if (!options || options.length === 0) return null;

  // For reverse-scored items, the lowest raw value carries the highest clinical
  // risk (e.g. "אינני מודאגת שינטשו אותי" with value 0 = strong endorsement of
  // attachment anxiety after reversal). Sort descending for normal items, ascending
  // for reverse, then read worst/second-worst from the same end.
  const sorted = options.map(o => o.value).sort((a, b) => item.reverse ? a - b : b - a);
  const worst        = sorted[0];
  const secondWorst  = sorted[1];

  if (value === worst) return 'high';
  if (item.type === 'select' && value === secondWorst) return 'med';
  return null;
}
