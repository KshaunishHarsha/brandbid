import { createRazorpayProcessor } from '@/lib/payments/razorpay';
import { handlePaymentWebhook } from '@/lib/payments/webhook';
import { createAdminClient } from '@/lib/supabase/admin';

// Razorpay -> record_bid. Signature-verified, idempotent. See lib/payments/webhook.ts.
export async function POST(req: Request) {
  const rawBody = await req.text(); // the signature covers the exact raw bytes
  const signature = req.headers.get('x-razorpay-signature') ?? '';

  const db = createAdminClient();
  const processor = createRazorpayProcessor({
    keyId: process.env.RAZORPAY_KEY_ID ?? '',
    keySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
  });

  const result = await handlePaymentWebhook(
    {
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
      log: (msg, extra) => console.log(`[razorpay-webhook] ${msg}`, extra ?? {}),
    },
    rawBody,
    signature,
  );

  return new Response(result.body, { status: result.status });
}
