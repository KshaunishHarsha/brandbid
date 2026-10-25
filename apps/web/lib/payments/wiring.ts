import { sendSignInLink } from '@/lib/auth-email';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PaymentProcessor } from '@brandbid/payments';
import type { WebhookDeps } from './webhook';

/** Real side effects for the payment webhook handler: database, audit log, and the post-payment email. */
export function buildWebhookDeps(processor: PaymentProcessor): WebhookDeps {
  const db = createAdminClient();
  return {
    processor,
    async recordBid(a) {
      const { data, error } = await db.rpc('record_bid', {
        p_brand_id: a.brandId,
        p_payer_id: a.payerId,
        p_amount_cents: a.amountCents,
        p_processor: a.processor,
        p_processor_payment_id: a.paymentId,
        p_payer_email: a.email ?? undefined,
        p_payment_fingerprint: a.fingerprint ?? undefined,
      });
      if (error) return { ok: false, code: error.code ?? null, message: error.message };
      return { ok: true, created: (data as { created?: boolean } | null)?.created === true };
    },
    async wasRefunded(paymentId) {
      const { count } = await db
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('action', 'payment_auto_refunded')
        .eq('details->>payment_id', paymentId);
      return (count ?? 0) > 0;
    },
    async audit(action, details) {
      const { error } = await db.from('audit_log').insert({ action, details: details as never });
      if (error) throw new Error(`audit_log insert failed: ${error.message}`);
    },
    // D45: a brand that paid as a guest gets a one-click link to its dashboard.
    async afterRecorded(a) {
      const { data } = await db.auth.admin.getUserById(a.payerId);
      const user = data.user;
      if (user?.email && !user.last_sign_in_at) await sendSignInLink(user.email, '/dash');
    },
    log: (msg, extra) => console.log(`[payments] ${msg}`, extra ?? {}),
  };
}
