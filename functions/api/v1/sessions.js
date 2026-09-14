import { depsFrom, readBody } from '../../../server/lib/runtime.js';
import { submitSession, readSessions, empty } from '../../../server/lib/handlers.js';

export async function onRequestPost(context) {
  const body = await readBody(context.request);
  if (body === null) return empty(413);
  return submitSession(body, await depsFrom(context));
}

export async function onRequestGet(context) {
  const p = new URL(context.request.url).searchParams;
  return readSessions({ uid: p.get('uid'), exp: p.get('exp'), sig: p.get('sig') }, await depsFrom(context));
}
