import { getProcessor } from '@/lib/payments';
import { buildWebhookDeps } from '@/lib/payments/wiring';
import { handlePaymentWebhook } from '@/lib/payments/webhook';

// Razorpay -> record_bid. Signature-verified, idempotent. See lib/payments/webhook.ts.
export async function POST(req: Request) {
  const rawBody = await req.text(); // the signature covers the exact raw bytes
  const signature = req.headers.get('x-razorpay-signature') ?? '';
  const result = await handlePaymentWebhook(buildWebhookDeps(getProcessor()), rawBody, signature);
  return new Response(result.body, { status: result.status });
}
