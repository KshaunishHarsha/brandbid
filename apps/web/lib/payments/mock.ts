import { createRazorpayProcessor } from './razorpay';
import type { PaymentProcessor } from './types';

// Local-only stand-in for Razorpay so the whole listing flow can be run without keys (PAYMENTS_MODE=mock).
// It reuses the real Razorpay parsing and signature code; only the HTTP calls are faked.
// Refused in production by paymentsMode().

export const MOCK_WEBHOOK_SECRET = 'mock-webhook-secret';

const mockFetch = (async (url: string, init?: RequestInit) => {
  const u = String(url);
  const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
  if (u.endsWith('/orders') && init?.method === 'POST') {
    const body = JSON.parse(String(init.body)) as { amount: number; currency: string };
    return json({ id: `order_mock_${crypto.randomUUID().slice(0, 12)}`, amount: body.amount, currency: body.currency });
  }
  if (u.includes('/refund')) return json({ id: `rfnd_mock_${crypto.randomUUID().slice(0, 12)}` });
  if (u.includes('/orders/')) return json({ notes: {} });
  return new Response('not found', { status: 404 });
}) as typeof fetch;

export function createMockProcessor(): PaymentProcessor {
  return createRazorpayProcessor({
    keyId: 'mock',
    keySecret: 'mock',
    webhookSecret: MOCK_WEBHOOK_SECRET,
    fetchImpl: mockFetch,
  });
}
