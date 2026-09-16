// email.js — the notification seam (REMOTE_SPEC §6).
//
// Two pure builders produce the message bodies (tested), and one provider
// sends them. The provider is Cloudflare Email Service over its REST API;
// swapping to Resend/Postmark means replacing createCloudflareEmail() only.
//
// Body rule (D-3): the uid, the date and a link. Never scores, never
// instrument names, never anything about the patient.

const DATE_FMT = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Asia/Jerusalem' });

// Bidi (REMOTE_SPEC §6). A mail subject carries no direction metadata, so each
// client guesses: some use first-strong, some assume LTR outright. A Hebrew
// sentence with a Latin uid buried in the middle therefore reorders differently
// everywhere, and the uid — the one token a therapist scans for — is what moves.
//
// Two defences, structure first:
//   1. The uid leads the subject and the Hebrew is a single trailing run. There
//      is only one direction boundary, so no client has room to scramble it.
//   2. LRM (U+200E) anchors the neutral characters next to each LTR token, in
//      the subject and in the plain-text body, which has no markup to lean on.
//      LRM is used rather than the newer isolates (U+2066/U+2069) because it
//      dates to Unicode 2.0 and old mail clients render isolates as garbage.
// The HTML part additionally uses dir="rtl" plus <bdi>, which is the proper
// mechanism where markup exists.
const LRM = '\u200E';
const ltr = (s) => `${LRM}${s}${LRM}`;

// Deliverability (REMOTE_SPEC §6). A one-line message wrapped around a single
// link is the shape of a phishing mail and filters treat it as such. These
// bodies say who is writing, why this person is receiving it, and what the mail
// does not contain — all true, all useful, and it keeps the text-to-link ratio
// out of the range that trips filters. No List-Unsubscribe header: a therapist
// cannot opt out of being told their own patient submitted, so the header would
// be a lie. Replies are the pressure valve instead, which is why madad@ has to
// be a real mailbox.
const WHY_YOU_GOT_THIS = [
  'הודעה זו נשלחה אליכם כמטפלים במסגרת תוכנית ההכשרה.',
  'היא אינה מכילה תוצאות, שמות או פרטים מזהים — רק המזהה שהקצתם למטופל.',
  'התוצאות מוצגות אך ורק בעמוד הסיכום. אפשר להשיב להודעה זו.',
];

export function doorbellEmail({ uid, link, date }) {
  const when = DATE_FMT.format(date);
  return {
    subject: `${ltr(uid)} — מטופל השלים שאלון`,
    text: [
      `מטופל ${ltr(uid)} השלים שאלון בתאריך ${ltr(when)}.`,
      '',
      `לצפייה בסיכום המטופל: ${link}`,
      '',
      'הקישור תקף שבעה ימים. אם פג, אפשר לבקש קישור חדש בעמוד הסיכום.',
      '',
      ...WHY_YOU_GOT_THIS,
    ].join('\n'),
    html: [
      `<p dir="rtl">מטופל <bdi>${uid}</bdi> השלים שאלון בתאריך <bdi>${when}</bdi>.</p>`,
      `<p dir="rtl"><a href="${link}">לצפייה בסיכום המטופל</a></p>`,
      '<p dir="rtl">הקישור תקף שבעה ימים. אם פג, אפשר לבקש קישור חדש בעמוד הסיכום.</p>',
      `<p dir="rtl" style="color:#666">${WHY_YOU_GOT_THIS.join('<br>')}</p>`,
    ].join('\n'),
  };
}

export function freshLinkEmail({ uid, link }) {
  return {
    subject: `${ltr(uid)} — קישור חדש לסיכום המטופל`,
    text: [
      `ביקשתם קישור חדש לסיכום המטופל ${ltr(uid)}:`,
      link,
      '',
      'הקישור תקף שבעה ימים.',
      'אם לא ביקשתם אותו, אפשר להתעלם מהודעה זו — הקישור נשלח רק לכתובת הרשומה במערכת.',
      '',
      ...WHY_YOU_GOT_THIS,
    ].join('\n'),
    html: [
      `<p dir="rtl">ביקשתם קישור חדש לסיכום המטופל <bdi>${uid}</bdi>:</p>`,
      `<p dir="rtl"><a href="${link}">לצפייה בסיכום המטופל</a></p>`,
      '<p dir="rtl">הקישור תקף שבעה ימים. אם לא ביקשתם אותו, אפשר להתעלם מהודעה זו — הקישור נשלח רק לכתובת הרשומה במערכת.</p>',
      `<p dir="rtl" style="color:#666">${WHY_YOU_GOT_THIS.join('<br>')}</p>`,
    ].join('\n'),
  };
}

/**
 * Cloudflare Email Service, REST flavour (the Pages Functions runtime has no
 * send_email binding). `fetchImpl` is injectable for tests.
 * send() resolves to { ok, status } and never throws — email failure must not
 * fail a submission (§6).
 */
export function createCloudflareEmail({ accountId, apiToken, from, fromName, fetchImpl = fetch }) {
  return {
    async send({ to, subject, text, html }) {
      if (!accountId || !apiToken || !from) return { ok: false, status: 0, reason: 'email not configured' };
      try {
        const res = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ to, from: { address: from, name: fromName }, subject, text, html }),
        });
        return { ok: res.ok, status: res.status };
      } catch (err) {
        return { ok: false, status: 0, reason: String(err?.message ?? err) };
      }
    },
  };
}
