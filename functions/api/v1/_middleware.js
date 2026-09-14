// Every /api/v1/* response: never cached, and an unexpected throw becomes a
// generic 500 instead of a stack trace (REMOTE_SPEC §4).
export async function onRequest(context) {
  let res;
  try {
    res = await context.next();
  } catch (err) {
    console.error('remote: unhandled', err);
    res = new Response(null, { status: 500 });
  }
  const headers = new Headers(res.headers);
  headers.set('Cache-Control', 'no-store');
  return new Response(res.body, { status: res.status, headers });
}
