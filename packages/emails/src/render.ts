// Email templates (BUILD section 19). Plain string templates, no dependencies. Everything that came from a user
// (brand names, rejection reasons) is HTML-escaped; subjects are forced onto one line (no header injection).
import { formatUSD } from '@brandbid/shared';

export type RenderedEmail = { subject: string; html: string; text: string };
export type RenderContext = { siteUrl: string; unsubscribeUrl?: string };

/** Kinds this package can render. The notify job only sends these; other outbox rows wait for their phase. */
export const SUPPORTED_KINDS = [
  'welcome',
  'earnings_available',
  'withdrawal_paid',
  'withdrawal_failed',
  'withdrawal_under_review',
  'earnings_flagged',
  'earnings_reversed',
  'budget_used_up',
  'budget_below_10',
  'budget_refilled',
  'waitlist_expiring',
  'listing_approved',
  'listing_rejected',
  'outbid',
  'rate_floor_raised',
  'refund_eligible',
  'refund_done',
  'admin_review_digest',
  'reconciliation_failed',
  'brand_invite',
] as const;
export type EmailKind = (typeof SUPPORTED_KINDS)[number];
export const isSupportedKind = (k: string): k is EmailKind => (SUPPORTED_KINDS as readonly string[]).includes(k);

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const oneLine = (s: string) => s.replace(/[\r\n\p{Zl}\p{Zp}]+/gu, ' ').trim().slice(0, 200);
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const amount = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) ? formatUSD(v) : null);

function layout(body: string, ctx: RenderContext): string {
  const unsubscribe = ctx.unsubscribeUrl
    ? `<p style="font-size:12px;color:#777;margin-top:12px"><a href="${escapeHtml(ctx.unsubscribeUrl)}" style="color:#777">Unsubscribe from optional product alerts</a></p>`
    : '';
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:520px;margin:0 auto;padding:24px;line-height:1.5">
${body}
${unsubscribe}
<p style="font-size:12px;color:#777;margin-top:32px">brandbid · <a href="${escapeHtml(ctx.siteUrl)}" style="color:#777">${escapeHtml(ctx.siteUrl.replace(/^https?:\/\//, ''))}</a></p>
</body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${escapeHtml(href)}" style="background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${escapeHtml(label)}</a></p>`;

export function renderEmail(kind: string, payload: Record<string, unknown>, ctx: RenderContext): RenderedEmail | null {
  const site = ctx.siteUrl.replace(/\/+$/, '');
  const name = str(payload.name, 'your brand');

  const messages: Partial<Record<EmailKind, { subject: string; heading: string; body: string; href?: string; action?: string }>> = {
    welcome: { subject: 'Welcome to brandbid', heading: 'Welcome to brandbid', body: 'Your promoter profile is ready. You can now share brand links and track qualified visits.', href: `${site}/dash/promoter`, action: 'Open your dashboard' },
    earnings_available: { subject: 'Your brandbid earnings are available', heading: 'Earnings are available', body: `Your available earnings total ${amount(payload.amount_cents) ?? 'an updated amount'}. Open your dashboard to see the details.`, href: `${site}/dash/promoter`, action: 'View earnings' },
    withdrawal_paid: { subject: 'Your brandbid withdrawal was paid', heading: 'Withdrawal paid', body: `Your withdrawal of ${amount(payload.amount_cents) ?? 'the requested amount'} has been marked paid.`, href: `${site}/dash/promoter`, action: 'View your dashboard' },
    withdrawal_failed: { subject: 'Your brandbid withdrawal needs attention', heading: 'Withdrawal failed', body: `Your withdrawal could not be completed${payload.reason ? `: ${str(payload.reason)}` : '.'} Please review your payout details or contact support.`, href: `${site}/dash/promoter`, action: 'Review your dashboard' },
    withdrawal_under_review: { subject: 'Your brandbid withdrawal is under review', heading: 'Withdrawal under review', body: 'Your withdrawal needs a manual review. We will update you when the review is complete.', href: `${site}/dash/promoter`, action: 'View your dashboard' },
    earnings_flagged: { subject: 'Some brandbid earnings are under review', heading: 'Earnings under review', body: `Some earnings were flagged for review${payload.reason_category ? ` (${str(payload.reason_category)})` : ''}. They will remain unavailable while the review is open.`, href: `${site}/dash/promoter`, action: 'View your dashboard' },
    earnings_reversed: { subject: 'A brandbid earning was reversed', heading: 'Earning reversed', body: `An earning${amount(payload.amount_cents) ? ` of ${amount(payload.amount_cents)}` : ''} was reversed${payload.reason_category ? `: ${str(payload.reason_category)}` : '.'}.`, href: `${site}/dash/promoter`, action: 'View your dashboard' },
    budget_used_up: { subject: 'A brand you promote has used its budget', heading: 'Brand budget used up', body: `${str(payload.brand_name, 'A brand you promote')} has used its current promotion budget. New qualified visits may be waitlisted until its budget is replenished.`, href: `${site}/dash/promoter`, action: 'View your dashboard' },
    budget_below_10: { subject: 'Your brandbid promotion budget is running low', heading: 'Budget running low', body: `${name}'s promotion budget is below 10%. Add budget to keep attracting qualified visitors.`, href: `${site}/dash`, action: 'Open your dashboard' },
    budget_refilled: { subject: 'A brand you promote replenished its budget', heading: 'Brand budget replenished', body: `${str(payload.brand_name, 'A brand you promote')} replenished its budget${typeof payload.funded_count === 'number' ? `; ${payload.funded_count} waitlisted earning${payload.funded_count === 1 ? ' was' : 's were'} funded` : ''}.`, href: `${site}/dash/promoter`, action: 'View your dashboard' },
    waitlist_expiring: { subject: 'Some waitlisted earnings expire soon', heading: 'Waitlisted earnings expire soon', body: `You have ${typeof payload.count === 'number' ? payload.count : 'some'} waitlisted earning${payload.count === 1 ? '' : 's'} due to expire in 3 days unless the brand budget is replenished.`, href: `${site}/dash/promoter`, action: 'View waitlisted earnings' },
    outbid: { subject: 'Your brand was outbid on brandbid', heading: 'Your rank changed', body: `${name} was outbid${payload.new_rank ? ` and is now ranked #${payload.new_rank}` : ''}. Add budget from your dashboard to move up the leaderboard.`, href: `${site}/dash`, action: 'View your dashboard' },
    rate_floor_raised: { subject: 'Your brandbid promotion rate was updated', heading: 'Promotion rate updated', body: `${name}'s rate was raised to ${amount(payload.rate_cents) ?? 'the new minimum'} per qualified visitor to meet brandbid's updated minimum. Existing visitor claims keep their original rate.`, href: `${site}/dash`, action: 'View your dashboard' },
    refund_eligible: { subject: 'Your brandbid budget may be eligible for a refund', heading: 'Budget may be eligible for a refund', body: `${name} has had no budget activity for 30 days. Review the refund details in your dashboard.`, href: `${site}/dash`, action: 'Review your dashboard' },
    refund_done: { subject: 'Your brandbid refund is complete', heading: 'Refund complete', body: `A refund${amount(payload.amount_cents) ? ` of ${amount(payload.amount_cents)}` : ''} has been recorded for ${name}.`, href: `${site}/dash`, action: 'View your dashboard' },
    admin_review_digest: { subject: 'brandbid listing review queue', heading: 'Listings need review', body: `There ${payload.count === 1 ? 'is' : 'are'} ${typeof payload.count === 'number' ? payload.count : 'new'} item${payload.count === 1 ? '' : 's'} in the review queue.`, href: `${site}/admin/listings`, action: 'Open the review queue' },
    reconciliation_failed: { subject: 'brandbid ledger reconciliation failed', heading: 'Ledger reconciliation failed', body: `A reconciliation check reported an error${payload.details ? `: ${str(payload.details)}` : '.'} Please investigate the worker logs and ledger report.`, href: `${site}/admin`, action: 'Open admin' },
    brand_invite: { subject: 'You were invited to a brand team on brandbid', heading: 'Brand team invitation', body: `You were invited to join ${str(payload.brand_name, 'a brand')} on brandbid. Sign in with the invited email address to accept the invitation.`, href: `${site}/brands/invite/${/^[0-9a-f]{64}$/.test(str(payload.token)) ? str(payload.token) : ''}`, action: 'Accept invitation' },
  };

  const message = messages[kind as EmailKind];
  if (message) {
    const subject = oneLine(message.subject);
    const html = layout(`<h2 style="margin:0 0 12px">${escapeHtml(message.heading)}</h2><p>${escapeHtml(message.body)}</p>${message.href ? button(message.href, message.action ?? 'Open brandbid') : ''}`, ctx);
    return { subject, html, text: `${message.heading}\n\n${message.body}${message.href ? `\n\n${message.action ?? 'Open brandbid'}: ${message.href}` : ''}${ctx.unsubscribeUrl ? `\n\nUnsubscribe from optional product alerts: ${ctx.unsubscribeUrl}` : ''}\n` };
  }

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
