import { describe, it, expect, vi } from 'vitest';
import { doorbellEmail, freshLinkEmail, createCloudflareEmail } from './email.js';

const LRM = '\u200E';

describe('doorbellEmail (D-3, §6)', () => {
  const msg = doorbellEmail({ uid: 'ABCD-EFGH', link: 'https://t.example/aggregate/?uid=ABCDEFGH&exp=1&sig=x', date: new Date('2026-09-14T10:00:00Z') });

  it('contains the uid, a date and the link, and nothing clinical', () => {
    for (const part of [msg.subject, msg.text, msg.html]) expect(part).toContain('ABCD-EFGH');
    expect(msg.text).toContain('14.9.2026');
    expect(msg.text).toContain('https://t.example/aggregate/');
    expect(msg.html).toContain('href="https://t.example/aggregate/');
    for (const word of ['PHQ', 'PCL', 'ציון', 'התראה']) expect(msg.text).not.toContain(word);
  });

  it('puts the uid first in the subject so there is only one direction boundary', () => {
    // A Latin token buried inside a Hebrew sentence is what reorders differently
    // across mail clients. Leading with it leaves a single trailing RTL run.
    expect(msg.subject.indexOf('ABCD-EFGH')).toBeLessThan(msg.subject.indexOf('מטופל'));
    expect(msg.subject).toMatch(/^\u200E/);
  });

  it('anchors every LTR token with LRM in the subject and the plain-text body', () => {
    // The text part has no markup to lean on, so the marks are the only defence.
    expect(msg.subject).toContain(`${LRM}ABCD-EFGH${LRM}`);
    expect(msg.text).toContain(`${LRM}ABCD-EFGH${LRM}`);
    expect(msg.text).toContain(`${LRM}14.9.2026${LRM}`);   // digit clusters reorder too
  });

  it('uses markup rather than control characters in the HTML part', () => {
    expect(msg.html).toContain('<bdi>ABCD-EFGH</bdi>');
    expect(msg.html).toContain('<bdi>14.9.2026</bdi>');
    expect(msg.html).toContain('dir="rtl"');
    expect(msg.html).not.toContain(LRM);
  });

  it('explains why the recipient got it, which keeps it out of the one-link phishing shape', () => {
    expect(msg.text).toContain('תוכנית ההכשרה');
    expect(msg.text).toContain('אפשר להשיב');
    expect(msg.text.split('\n').filter(Boolean).length).toBeGreaterThan(4);
  });
});

describe('freshLinkEmail', () => {
  const msg = freshLinkEmail({ uid: 'ABCD-EFGH', link: 'https://t.example/aggregate/?x' });

  it('carries the uid and the link, with the same bidi treatment', () => {
    expect(msg.subject).toContain(`${LRM}ABCD-EFGH${LRM}`);
    expect(msg.subject.indexOf('ABCD-EFGH')).toBeLessThan(msg.subject.indexOf('קישור'));
    expect(msg.text).toContain('https://t.example/aggregate/?x');
    expect(msg.html).toContain('<bdi>ABCD-EFGH</bdi>');
  });

  it('tells an unexpecting recipient the link only went to the registered address', () => {
    expect(msg.text).toContain('לכתובת הרשומה במערכת');
    expect(msg.text).toContain('אפשר להתעלם');
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
