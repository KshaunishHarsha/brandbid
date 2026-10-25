// Email templates (BUILD section 19). Plain string templates, no dependencies. Everything that came from a user
// (brand names, rejection reasons) is HTML-escaped; subjects are forced onto one line (no header injection).
import { formatUSD } from '@brandbid/shared';

export type RenderedEmail = { subject: string; html: string; text: string };
export type RenderContext = { siteUrl: string };

/** Kinds this package can render. The notify job only sends these; other outbox rows wait for their phase. */
export const SUPPORTED_KINDS = ['listing_approved', 'listing_rejected'] as const;
export type EmailKind = (typeof SUPPORTED_KINDS)[number];
export const isSupportedKind = (k: string): k is EmailKind => (SUPPORTED_KINDS as readonly string[]).includes(k);

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const oneLine = (s: string) => s.replace(/[\r\n\p{Zl}\p{Zp}]+/gu, ' ').trim().slice(0, 200);
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);

function layout(body: string, ctx: RenderContext): string {
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:520px;margin:0 auto;padding:24px;line-height:1.5">
${body}
<p style="font-size:12px;color:#777;margin-top:32px">brandbid · <a href="${escapeHtml(ctx.siteUrl)}" style="color:#777">${escapeHtml(ctx.siteUrl.replace(/^https?:\/\//, ''))}</a></p>
</body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${escapeHtml(href)}" style="background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${escapeHtml(label)}</a></p>`;

export function renderEmail(kind: string, payload: Record<string, unknown>, ctx: RenderContext): RenderedEmail | null {
  const site = ctx.siteUrl.replace(/\/+$/, '');
  const name = str(payload.name, 'your brand');

  if (kind === 'listing_approved') {
    const slug = str(payload.slug);
    const page = slug && /^[a-z0-9-]+$/i.test(slug) ? `${site}/b/${slug}` : site;
    return {
      subject: oneLine(`${name} is live on brandbid`),
      html: layout(
        `<h2 style="margin:0 0 12px">You're live 🎉</h2>
<p><strong>${escapeHtml(name)}</strong> passed review and is now on the brandbid leaderboard.</p>
${button(page, 'View your listing')}
<p>Manage your listing and your budget from your dashboard: <a href="${escapeHtml(site)}/dash">${escapeHtml(site)}/dash</a>.</p>`,
        ctx,
      ),
      text: `${name} is live on brandbid!\n\nView your listing: ${page}\nYour dashboard: ${site}/dash\n`,
    };
  }

  if (kind === 'listing_rejected') {
    const reason = str(payload.reason, 'It did not meet our listing policy.');
    const refund = typeof payload.refund_cents === 'number' && Number.isSafeInteger(payload.refund_cents) ? payload.refund_cents : null;
    const refundLine =
      refund !== null
        ? `We are refunding the full ${formatUSD(refund)} you paid, to your original payment method. Depending on your bank it usually arrives within 5 to 10 business days.`
        : 'We are refunding the full amount you paid, to your original payment method.';
    return {
      subject: oneLine(`We couldn't list ${name}: your payment is being refunded`),
      html: layout(
        `<h2 style="margin:0 0 12px">We couldn't list ${escapeHtml(name)}</h2>
<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>
<p>${escapeHtml(refundLine)}</p>
<p>You can fix the issue and list again at any time.</p>
${button(`${site}/list`, 'List a brand')}`,
        ctx,
      ),
      text: `We couldn't list ${name}.\n\nReason: ${reason}\n\n${refundLine}\n\nYou can list again any time: ${site}/list\n`,
    };
  }

  return null;
}
