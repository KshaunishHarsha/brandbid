import { hmac } from '@brandbid/shared';
import type { CapturedPayment, CheckoutOrder, PaymentProcessor } from './types';

// Razorpay implementation. Plain fetch + Web Crypto only, so it runs on Cloudflare Workers (D43).
// API: https://razorpay.com/docs/api/  (verify field names against test mode when wiring P1.6)

const API = 'https://api.razorpay.com/v1';

export type RazorpayConfig = {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  fetchImpl?: typeof fetch;
};

/** Constant-time string comparison (both are hex digests of equal expected length). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function asNotes(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string' || typeof val === 'number') out[k] = String(val);
  }
  return out;
}

export function createRazorpayProcessor(cfg: RazorpayConfig): PaymentProcessor {
  const doFetch = cfg.fetchImpl ?? fetch;
  const auth = 'Basic ' + btoa(`${cfg.keyId}:${cfg.keySecret}`);

  async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const res = await doFetch(`${API}${path}`, {
      method: init?.method ?? 'GET',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Razorpay ${init?.method ?? 'GET'} ${path} failed: ${res.status} ${text.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }

  return {
    name: 'razorpay',

    async createOrder({ amountCents, receipt, notes }): Promise<CheckoutOrder> {
      if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new RangeError('Invalid amount');
      const order = await call<{ id: string; amount: number; currency: string }>('/orders', {
        method: 'POST',
        body: { amount: amountCents, currency: 'USD', receipt: receipt.slice(0, 40), notes },
      });
      return { orderId: order.id, amountCents: order.amount, currency: 'USD' };
    },

    async verifyWebhook(rawBody, signature) {
      if (!signature || !cfg.webhookSecret) return false;
      const expected = await hmac(cfg.webhookSecret, rawBody);
      return safeEqual(expected, signature.trim().toLowerCase());
    },

    parseEvent(json): CapturedPayment | null {
      const j = json as { event?: unknown; payload?: { payment?: { entity?: Record<string, unknown> } } };
      if (j?.event !== 'payment.captured') return null; // we act on this event only (not order.paid) to avoid double handling
      const p = j.payload?.payment?.entity;
      if (!p || typeof p.id !== 'string' || typeof p.amount !== 'number') return null;
      return {
        processor: 'razorpay',
        paymentId: p.id,
        orderId: typeof p.order_id === 'string' ? p.order_id : null,
        amountCents: p.amount,
        currency: typeof p.currency === 'string' ? p.currency.toUpperCase() : '',
        email: typeof p.email === 'string' ? p.email : null,
        fingerprint: typeof p.card_id === 'string' ? p.card_id : null,
        notes: asNotes(p.notes),
      };
    },

    async fetchOrderNotes(orderId) {
      const order = await call<{ notes?: unknown }>(`/orders/${encodeURIComponent(orderId)}`);
      return asNotes(order.notes);
    },

    async refund(paymentId, amountCents, reason) {
      const r = await call<{ id: string }>(`/payments/${encodeURIComponent(paymentId)}/refund`, {
        method: 'POST',
        body: { amount: amountCents, notes: { reason } },
      });
      return r.id;
    },
  };
}
