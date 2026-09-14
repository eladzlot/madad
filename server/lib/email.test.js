import { describe, it, expect, vi } from 'vitest';
import { doorbellEmail, freshLinkEmail, createCloudflareEmail } from './email.js';

describe('doorbellEmail (D-3)', () => {
  const msg = doorbellEmail({ uid: 'ABCD-EFGH', link: 'https://t.example/aggregate/?uid=ABCDEFGH&exp=1&sig=x', date: new Date('2026-09-14T10:00:00Z') });
  it('contains the uid, a date and the link, and nothing clinical', () => {
    for (const part of [msg.subject, msg.text, msg.html]) {
      expect(part).toContain('ABCD-EFGH');
    }
    expect(msg.text).toContain('14.9.2026');
    expect(msg.text).toContain('https://t.example/aggregate/');
    expect(msg.html).toContain('href="https://t.example/aggregate/');
    // No scores, instrument names or alerts can appear — the builder has no
    // access to them at all; assert the obvious words are absent anyway.
    for (const word of ['PHQ', 'PCL', 'ציון', 'התראה']) expect(msg.text).not.toContain(word);
  });
});

describe('freshLinkEmail', () => {
  it('carries the uid and the link', () => {
    const msg = freshLinkEmail({ uid: 'ABCD-EFGH', link: 'https://t.example/aggregate/?x' });
    expect(msg.subject).toContain('ABCD-EFGH');
    expect(msg.text).toContain('https://t.example/aggregate/?x');
  });
});

describe('createCloudflareEmail', () => {
  it('posts the REST payload shape (from.address, text + html) with the bearer token', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const email = createCloudflareEmail({ accountId: 'acc', apiToken: 'tok', from: 'madad@x.example', fromName: 'מדד', fetchImpl });
    const r = await email.send({ to: 't@y.example', subject: 's', text: 't', html: '<p>h</p>' });
    expect(r).toEqual({ ok: true, status: 200 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acc/email/sending/send');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ to: 't@y.example', from: { address: 'madad@x.example', name: 'מדד' }, subject: 's', text: 't', html: '<p>h</p>' });
  });
  it('never throws: unconfigured, HTTP error and network error all resolve to ok:false', async () => {
    expect((await createCloudflareEmail({}).send({ to: 'a' })).ok).toBe(false);
    const bad = createCloudflareEmail({ accountId: 'a', apiToken: 't', from: 'f', fetchImpl: async () => new Response('', { status: 500 }) });
    expect(await bad.send({ to: 'a' })).toEqual({ ok: false, status: 500 });
    const down = createCloudflareEmail({ accountId: 'a', apiToken: 't', from: 'f', fetchImpl: async () => { throw new Error('ECONN'); } });
    expect((await down.send({ to: 'a' })).ok).toBe(false);
  });
});
