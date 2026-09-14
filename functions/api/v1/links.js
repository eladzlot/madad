import { depsFrom, readBody } from '../../../server/lib/runtime.js';
import { requestLink, refuse } from '../../../server/lib/handlers.js';

export async function onRequestPost(context) {
  const body = await readBody(context.request);
  if (body === null) return refuse(413);
  return requestLink(body, await depsFrom(context));
}
