import { depsFrom } from '../../../../server/lib/runtime.js';
import { checkUid } from '../../../../server/lib/handlers.js';

export async function onRequestGet(context) {
  return checkUid(String(context.params.uid ?? ''), await depsFrom(context));
}
