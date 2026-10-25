import { NextResponse } from 'next/server';
import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { paymentsMode } from '@/lib/payments';
import { MOCK_WEBHOOK_SECRET } from '@/lib/payments/mock';
import { buildWebhookDeps } from '@/lib/payments/wiring';
import { createMockProcessor } from '@/lib/payments/mock';
import { handlePaymentWebhook } from '@/lib/payments/webhook';

// DEV ONLY. "Pays" a mock order by sending ourselves a correctly signed payment.captured webhook,
// through exactly the same handler the real Razorpay webhook uses. 404 unless PAYMENTS_MODE=mock.
const Body = z.object({
  orderId: z.string().min(1),
  brandId: z.uuid(),
  payerId: z.uuid(),
  amountCents: z.number().int().positive(),
});

export async function POST(req: Request) {
  let mock = false;
  try {
    mock = paymentsMode() === 'mock';
  } catch {
    mock = false;
  }
  if (!mock) return new NextResponse('Not found', { status: 404 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  const { orderId, brandId, payerId, amountCents } = parsed.data;

  const rawBody = JSON.stringify({
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: `pay_mock_${orderId.replace(/^order_mock_/, '')}`,
          order_id: orderId,
          amount: amountCents,
          currency: 'USD',
          email: null,
          notes: { brand_id: brandId, payer_id: payerId },
        },
      },
    },
  });
  const signature = createHmac('sha256', MOCK_WEBHOOK_SECRET).update(rawBody).digest('hex');
  const result = await handlePaymentWebhook(buildWebhookDeps(createMockProcessor()), rawBody, signature);
  return NextResponse.json({ result: result.body }, { status: result.status });
}
