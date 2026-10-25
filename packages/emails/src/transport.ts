// Sending. Resend in real environments; the local Mailpit inbox in development so emails are visible without
// any account. Plain fetch (works anywhere). Never logs message bodies.

export type Mail = { to: string; subject: string; html: string; text: string };
export type Mailer = (mail: Mail) => Promise<void>;

export type MailerConfig = {
  resendApiKey?: string;
  from: string;
  /** Development only: Mailpit's base URL, e.g. http://127.0.0.1:54324. Ignored when a Resend key is set. */
  mailpitUrl?: string;
  fetchImpl?: typeof fetch;
};

function parseFrom(from: string): { email: string; name?: string } {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  return m ? { name: m[1] || undefined, email: m[2]! } : { email: from.trim() };
}

export function createMailer(cfg: MailerConfig): Mailer {
  const doFetch = cfg.fetchImpl ?? fetch;

  if (cfg.resendApiKey) {
    return async (mail) => {
      const res = await doFetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: cfg.from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
    };
  }

  if (cfg.mailpitUrl) {
    const base = cfg.mailpitUrl.replace(/\/+$/, '');
    const from = parseFrom(cfg.from);
    return async (mail) => {
      const res = await doFetch(`${base}/api/v1/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          From: { Email: from.email, Name: from.name },
          To: [{ Email: mail.to }],
          Subject: mail.subject,
          HTML: mail.html,
          Text: mail.text,
        }),
      });
      if (!res.ok) throw new Error(`Mailpit ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
    };
  }

  return async () => {
    throw new Error('Email is not configured: set RESEND_API_KEY (or MAILPIT_URL for local development)');
  };
}
