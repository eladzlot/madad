// runtime.js — builds the handlers' `deps` from a Pages Functions context.
// The only file that knows about Cloudflare bindings; kept free of logic so
// the handlers stay testable with fakes.

import { createD1Db } from './db.js';
import { createCloudflareEmail } from './email.js';
import { hashIp } from './token.js';
import { MAX_BODY_BYTES } from './handlers.js';

const num = (v, fallback) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };

export async function depsFrom(context) {
  const { request, env } = context;
  const origin = new URL(request.url).origin;
  const ip = request.headers.get('CF-Connecting-IP');
  return {
    db: createD1Db(env.DB),
    email: createCloudflareEmail({ accountId: env.CF_ACCOUNT_ID, apiToken: env.EMAIL_API_TOKEN, from: env.EMAIL_FROM, fromName: env.EMAIL_FROM_NAME }),
    // Configs ship in the same deploy artifact; ASSETS serves them (no network).
    loadConfig: async (id) => {
      if (!/^[a-z0-9_]+$/i.test(id)) return null;
      const res = await env.ASSETS.fetch(new URL(`/configs/prod/${id}.json`, origin));
      return res.ok ? res.json() : null;
    },
    secret: env.HMAC_SECRET,
    origin,
    ipHash: ip ? await hashIp(ip, env.IP_SALT ?? '') : null,
    now: () => new Date(),
    limits: {
      linkTtlDays: num(env.LINK_TTL_DAYS, 7),
      submissionsPerUidPerDay: num(env.SUBMISSIONS_PER_UID_PER_DAY, 20),
      failedChecksPerIpPerHour: num(env.FAILED_CHECKS_PER_IP_PER_HOUR, 30),
      maxBodyBytes: MAX_BODY_BYTES,
    },
    onEmailFailure: (info) => console.error('remote: email failed', info),
  };
}

/** Read a request body as text, refusing early on a declared oversize. */
export async function readBody(request) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  const text = await request.text();
  return text.length > MAX_BODY_BYTES ? null : text;
}
