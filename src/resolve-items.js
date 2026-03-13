// resolve-items.js
// Converts an ordered list of item tokens into a flat battery sequence.
//
// Public API:
//   resolveItems(tokens, config)  → BatteryNode[]
//
// Each token resolves as:
//   1. Battery ID  → sequence expanded inline (control-flow preserved)
//   2. Questionnaire ID → wrapped as { questionnaireId: token }
//
// Throws ItemResolutionError if a token is:
//   - found in both batteries and questionnaires (cross-entity collision across files;
//     intra-file collisions are caught at load time by config-validation.js)
//   - not found in either
//   - a battery that internally references a questionnaire not in config

export class ItemResolutionError extends Error {
  constructor(token, reason) {
    super(`Cannot resolve item "${token}": ${reason}`);
    this.name = 'ItemResolutionError';
    this.token = token;
  }
}

export function resolveItems(tokens, config) {
  const qMap = new Map(config.questionnaires.map(q => [q.id, q]));
  const bMap = new Map(config.batteries.map(b => [b.id, b]));

  function expandSequence(nodes, batteryId) {
    return nodes.map(node => {
      if (node.type === 'if') {
        return {
          ...node,
          then: expandSequence(node.then ?? [], batteryId),
          else: expandSequence(node.else ?? [], batteryId),
        };
      }
      if (node.type === 'randomize') {
        return { ...node, ids: expandSequence(node.ids ?? [], batteryId) };
      }
      if (node.questionnaireId) {
        if (!qMap.has(node.questionnaireId)) {
          throw new ItemResolutionError(
            node.questionnaireId,
            `questionnaire "${node.questionnaireId}" referenced inside battery "${batteryId}" ` +
            `was not found in any loaded config`
          );
        }
        return node;
      }
      return node;
    });
  }

  const sequence = [];

  for (const token of tokens) {
    const inQ = qMap.has(token);
    const inB = bMap.has(token);

    if (inQ && inB) {
      throw new ItemResolutionError(
        token,
        `"${token}" exists as both a questionnaire and a battery — IDs must be unique across both types`
      );
    }

    if (inB) {
      sequence.push(...expandSequence(bMap.get(token).sequence, token));
      continue;
    }

    if (inQ) {
      sequence.push({ questionnaireId: token });
      continue;
    }

    throw new ItemResolutionError(
      token,
      `"${token}" was not found as a questionnaire or battery in any loaded config`
    );
  }

  return sequence;
}
