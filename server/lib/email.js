// email.js — the notification seam (REMOTE_SPEC §6).
//
// Two pure builders produce the message bodies (tested), and one provider
// sends them. The provider is Cloudflare Email Service over its REST API;
// swapping to Resend/Postmark means replacing createCloudflareEmail() only.
//
// Body rule (D-3): the uid, the date and a link. Never scores, never
// instrument names, never anything about the patient.

const DATE_FMT = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Asia/Jerusalem' });

export function doorbellEmail({ uid, link, date }) {
  const when = DATE_FMT.format(date);
  return {
    subject: `מדד — מטופל ${uid} השלים שאלון`,
    text: [
      `מטופל ${uid} השלים שאלון בתאריך ${when}.`,
      '',
      `לצפייה בסיכום המטופל: ${link}`,
      '',
      'הקישור תקף שבעה ימים. אם פג, אפשר לבקש קישור חדש בעמוד הסיכום.',
      'הודעה זו אינה מכילה תוצאות; הן מוצגות רק בעמוד הסיכום.',
    ].join('\n'),
    html: [
      `<p dir="rtl">מטופל <bdi>${uid}</bdi> השלים שאלון בתאריך ${when}.</p>`,
      `<p dir="rtl"><a href="${link}">לצפייה בסיכום המטופל</a></p>`,
      '<p dir="rtl" style="color:#666">הקישור תקף שבעה ימים. אם פג, אפשר לבקש קישור חדש בעמוד הסיכום.<br>',
      'הודעה זו אינה מכילה תוצאות; הן מוצגות רק בעמוד הסיכום.</p>',
    ].join('\n'),
  };
}

export function freshLinkEmail({ uid, link }) {
  return {
    subject: `מדד — קישור חדש לסיכום המטופל ${uid}`,
    text: [
      `ביקשתם קישור חדש לסיכום המטופל ${uid}:`,
      link,
      '',
      'הקישור תקף שבעה ימים. אם לא ביקשתם אותו, אפשר להתעלם מהודעה זו.',
    ].join('\n'),
    html: [
      `<p dir="rtl">ביקשתם קישור חדש לסיכום המטופל <bdi>${uid}</bdi>:</p>`,
      `<p dir="rtl"><a href="${link}">לצפייה בסיכום המטופל</a></p>`,
      '<p dir="rtl" style="color:#666">הקישור תקף שבעה ימים. אם לא ביקשתם אותו, אפשר להתעלם מהודעה זו.</p>',
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
