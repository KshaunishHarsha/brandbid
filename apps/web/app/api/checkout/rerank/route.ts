import { NextResponse } from 'next/server';
import { z } from 'zod';
import { toCents } from '@brandbid/shared';
import { getMemberBrand } from '@/lib/dashboard';
import { checkoutKeyId, getProcessor, paymentsMode } from '@/lib/payments';
import { getLimiter } from '@/lib/ratelimit';
import { isSameOrigin } from '@/lib/same-origin';
import { createAdminClient } from '@/lib/supabase/admin';

const MAX_BID_CENTS = 10_000_000; // $100,000: guards against typos
const Body = z.object({ slug: z.string().max(60), amount: z.string().max(20) });
const err = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });

// A member pays more for their live brand: moves it up the board and adds to its ad budget (D1, D19).
// The bid is recorded by the payment webhook exactly like a first listing; this only creates the order.
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return err('forbidden', 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err('invalid', 400);

  const member = await getMemberBrand(parsed.data.slug);
  if (!member) return err('not_found', 404);
  if (member.brand.status !== 'active') return err('not_live', 409);

  let amountCents: number;
  try {
    amountCents = toCents(parsed.data.amount);
  } catch {
    return err('invalid_amount', 400);
  }

  const { data: min } = await createAdminClient().from('settings').select('value').eq('key', 'min_bid_cents').single();
  const minBid = Number(min?.value);
  if (!Number.isFinite(minBid)) return err('server_misconfigured', 500);
  if (amountCents < minBid) return err('below_minimum', 400, { minCents: minBid });
  if (amountCents > MAX_BID_CENTS) return err('above_maximum', 400);

  if (!(await getLimiter('rerank-user', 10, 3600).limit(member.user.id)).success) return err('rate_limited', 429);

  try {
    const order = await getProcessor().createOrder({
      amountCents,
      receipt: `rerank_${member.brand.id.slice(0, 8)}`,
      notes: { brand_id: member.brand.id, payer_id: member.user.id },
    });
    return NextResponse.json({ brandId: member.brand.id, payerId: member.user.id, email: member.user.email, order: { ...order, keyId: checkoutKeyId(), mode: paymentsMode() } });
  } catch (e) {
    console.error('[rerank] createOrder failed:', e);
    return err('payment_unavailable', 502);
  }
}
