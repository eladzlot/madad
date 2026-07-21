// preview-model.js — pure builder for the composer's static preview.
//
//   buildPreviewModel(config, entryId) → QuestionnaireModel | BatteryModel | null
//
// `config` is a ResolvedConfig from shared/config/loader.js (loadConfig), which
// for a battery already includes every referenced questionnaire (deps loaded).
// `entryId` is the catalog id of the entity to preview.
//
// The model is a plain, serialisable description of what the patient will see,
// plus a discovery/spec-sheet summary. It NEVER runs the engine: `if` conditions
// are shown structurally (as prettified DSL), never evaluated; `randomize` is
// shown as a marker. No DOM, no fetch — fully unit-testable.
//
// The item walk is flattened into an ordered list of render ENTRIES:
//   { kind: 'item', type, id, text, required, depth, options?, range?, inputType? }
//   { kind: 'condition', variant: 'if'|'else'|'randomize', label?, depth }
// A `condition` entry opens a group; following entries at depth+1 belong to it.
// The component renders condition entries as dividers and indents by `depth`.

import { resolveItemOptions } from '../../../shared/config/options.js';

// ── DSL cosmetics ─────────────────────────────────────────────────────────────
// Operator prettify only — item references (item.<id>) are left verbatim; the
// item ids shown on each rendered item make them legible without resolution.
export function prettifyCondition(condition) {
  return String(condition ?? '')
    .replaceAll('>=', '≥')
    .replaceAll('<=', '≤')
    .replaceAll('!=', '≠')
    .replaceAll('==', '=')
    .replaceAll('||', ' או ')
    .replaceAll('&&', ' וגם ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Item → render entry ───────────────────────────────────────────────────────
function buildItemEntry(item, questionnaire, depth) {
  const base = {
    kind:     'item',
    type:     item.type,
    id:       item.id,
    text:     item.text ?? '',
    required: item.required === true,
    depth,
  };
  switch (item.type) {
    case 'select':
    case 'binary':
      return { ...base, options: resolveItemOptions(item, questionnaire) };
    case 'multiselect':
      // Positional options (label only, no value) — identity is 1-based order.
      return { ...base, options: item.options ?? [] };
    case 'slider':
      return { ...base, range: { min: item.min, max: item.max, labels: item.labels ?? null } };
    case 'text':
      return { ...base, inputType: item.inputType ?? 'line' };
    default:
      // instructions (and any unknown type) render as text only.
      return base;
  }
}

// ── Item sequence walk (item-level if / randomize) ────────────────────────────
function walkItems(items, questionnaire, depth, out) {
  for (const node of items ?? []) {
    if (node.type === 'if') {
      out.push({ kind: 'condition', variant: 'if', label: prettifyCondition(node.condition), depth });
      walkItems(node.then, questionnaire, depth + 1, out);
      if (node.else?.length) {
        out.push({ kind: 'condition', variant: 'else', depth });
        walkItems(node.else, questionnaire, depth + 1, out);
      }
      continue;
    }
    if (node.type === 'randomize') {
      out.push({ kind: 'condition', variant: 'randomize', depth });
      walkItems(node.ids, questionnaire, depth + 1, out);
      continue;
    }
    out.push(buildItemEntry(node, questionnaire, depth));
  }
}

// ── Summary / scoring passthrough ─────────────────────────────────────────────
function buildSummary(entity, kind, nodes) {
  const meta = entity.meta ?? {};
  const summary = {
    kind,
    id:              entity.id,
    title:           entity.title ?? entity.id,
    description:     entity.description ?? '',
    domains:         meta.domains ?? [],
    populations:     meta.populations ?? [],
    type:            meta.type,
    tags:            meta.tags ?? [],
    keywords:        entity.keywords ?? [],
    featured:        meta.featured === true,
    durationMinutes: meta.durationMinutes,
  };
  if (nodes) {
    summary.itemCount = nodes.filter(n => n.kind === 'item' && n.type !== 'instructions').length;
  }
  return summary;
}

function buildSubscales(questionnaire) {
  const subscales = questionnaire.scoring?.subscales;
  if (!subscales) return [];
  const labels = questionnaire.subscaleLabels ?? {};
  return Object.entries(subscales).map(([id, itemIds]) => ({
    id,
    label:   labels[id] ?? id,
    itemIds: [...itemIds],
  }));
}

function buildAlerts(questionnaire) {
  return (questionnaire.alerts ?? []).map(a => ({
    severity:  a.severity,
    message:   a.message,
    condition: prettifyCondition(a.condition),
  }));
}

// ── Questionnaire model ───────────────────────────────────────────────────────
function buildQuestionnaireModel(questionnaire) {
  const nodes = [];
  walkItems(questionnaire.items, questionnaire, 0, nodes);
  return {
    kind:            'questionnaire',
    summary:         buildSummary(questionnaire, 'questionnaire', nodes),
    scoring:         { method: questionnaire.scoring?.method ?? null },
    subscales:       buildSubscales(questionnaire),
    interpretations: questionnaire.interpretations ?? null,
    psychometrics:   questionnaire.psychometrics ?? null,
    alerts:          buildAlerts(questionnaire),
    nodes,
  };
}

// ── Battery sequence walk (battery-level if / randomize) ──────────────────────
function walkSequence(sequence, findQuestionnaire, ctx, out) {
  for (const node of sequence ?? []) {
    if (node.type === 'if') {
      const condition = prettifyCondition(node.condition);
      walkSequence(node.then, findQuestionnaire, { ...ctx, condition, branch: 'then' }, out);
      if (node.else?.length) {
        walkSequence(node.else, findQuestionnaire, { ...ctx, condition, branch: 'else' }, out);
      }
      continue;
    }
    if (node.type === 'randomize') {
      walkSequence(node.ids, findQuestionnaire, { ...ctx, randomized: true }, out);
      continue;
    }
    const q = findQuestionnaire(node.questionnaireId);
    const sub = q ? buildQuestionnaireModel(q) : null;
    out.push({
      questionnaireId: node.questionnaireId,
      instanceId:      node.instanceId,
      title:           q?.title ?? node.questionnaireId,
      condition:       ctx.condition,
      branch:          ctx.branch,
      randomized:      ctx.randomized === true,
      itemCount:       sub?.summary.itemCount,
      missing:         !q,
      sub,
    });
  }
}

// ── Battery model ─────────────────────────────────────────────────────────────
function buildBatteryModel(battery, config) {
  const byId = new Map((config.questionnaires ?? []).map(q => [q.id, q]));
  const steps = [];
  walkSequence(battery.sequence, id => byId.get(id), {}, steps);
  return {
    kind:    'battery',
    summary: buildSummary(battery, 'battery', null),
    steps,
  };
}

// ── Public entry ──────────────────────────────────────────────────────────────
export function buildPreviewModel(config, entryId) {
  const battery = (config.batteries ?? []).find(b => b.id === entryId);
  if (battery) return buildBatteryModel(battery, config);

  const questionnaire = (config.questionnaires ?? []).find(q => q.id === entryId);
  if (questionnaire) return buildQuestionnaireModel(questionnaire);

  return null;
}
