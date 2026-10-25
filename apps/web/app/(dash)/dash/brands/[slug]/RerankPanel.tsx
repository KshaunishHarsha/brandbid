'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open(): void };
  }
}

type Props = {
  slug: string; brandName: string; minBidCents: number;
  ladder: Array<{ rank: number; priceCents: number }>; suggestedCents: number; owedCents: number;
};

const dollars = (cents: number) => (cents / 100).toFixed(2).replace(/\.00$/, '');

const ERRORS: Record<string, string> = {
  below_minimum: 'That is below the minimum bid.',
  above_maximum: 'That is above the maximum bid.',
  invalid_amount: 'Enter an amount like 25 or 25.50.',
  rate_limited: 'Too many attempts. Please wait a bit.',
  not_live: 'Your listing is not live, so it cannot be moved up yet.',
  payment_unavailable: 'Payments are unavailable right now. Try again shortly.',
};

function loadRazorpay(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the payment form'));
    document.head.appendChild(s);
  });
}

export function RerankPanel({ slug, brandName, minBidCents, ladder, suggestedCents, owedCents }: Props) {
  const router = useRouter();
  const [amount, setAmount] = useState(dollars(suggestedCents));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mock, setMock] = useState<null | { orderId: string; brandId: string; payerId: string; amountCents: number }>(null);
  const amountOk = /^\d+(\.\d{1,2})?$/.test(amount) && Math.round(parseFloat(amount) * 100) >= minBidCents;
  const done = () => router.replace(`/dash/brands/${slug}?paid=1`);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/checkout/rerank', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, amount }) });
      const data = await res.json();
      if (!res.ok) {
        setError(ERRORS[data.error] ?? 'Something went wrong. Try again.');
        return setBusy(false);
      }
      const order = data.order as { orderId: string; keyId: string; amountCents: number; mode: string };
      if (order.mode === 'mock') {
        setMock({ orderId: order.orderId, brandId: data.brandId, payerId: data.payerId, amountCents: order.amountCents });
        return setBusy(false);
      }
      await loadRazorpay();
      new window.Razorpay!({
        key: order.keyId, order_id: order.orderId, amount: order.amountCents, currency: 'USD', name: 'brandbid',
        description: `Move up: ${brandName}`, prefill: { email: data.email }, theme: { color: '#111111' },
        // The bid is recorded by the server webhook; this only moves the page along.
        handler: done,
        modal: { ondismiss: () => setBusy(false) },
      }).open();
    } catch {
      setError('Network error. Try again.');
      setBusy(false);
    }
  }

  async function mockPay() {
    if (!mock) return;
    setBusy(true);
    const res = await fetch('/api/dev/mock-pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mock) });
    if (res.ok) done();
    else {
      setError('Mock payment failed.');
      setBusy(false);
    }
  }

  const input = 'w-full rounded-lg border border-line bg-bg px-3 py-3';
  const primary = 'w-full rounded-lg bg-accent px-4 py-3 font-semibold text-accent-fg disabled:opacity-50';

  if (mock) {
    return (
      <div className="space-y-3 rounded-lg border border-gold/60 bg-gold/10 p-4">
        <h3 className="font-semibold">Test mode: no real payment</h3>
        <button onClick={mockPay} disabled={busy} className={primary}>{busy ? 'Working…' : `Simulate paying $${(mock.amountCents / 100).toFixed(2)}`}</button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={pay} className="space-y-3">
      {ladder.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {ladder.map((step) => (
            <button type="button" key={step.rank} onClick={() => setAmount(dollars(step.priceCents))}
              className={`rounded-lg border border-line px-3 py-2 text-left text-sm ${amount === dollars(step.priceCents) ? 'bg-accent text-accent-fg' : 'bg-surface'}`}>
              <span className="block font-semibold">${dollars(step.priceCents)}</span>
              <span className="block text-xs opacity-70">Reach #{step.rank}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <span>$</span>
        <input className={input} value={amount} onChange={(e) => setAmount(e.target.value.trim())} inputMode="decimal" aria-label="Amount in dollars" />
      </div>
      <p className="text-xs text-muted">
        Minimum ${dollars(minBidCents)}. Every payment raises your total and adds half to your ad budget.
        {owedCents > 0 && ` Your next $${dollars(owedCents)} of budget pays visitors who are already waiting, first.`}
      </p>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button className={primary} disabled={busy || !amountOk}>{busy ? 'Starting checkout…' : amountOk ? `Pay $${parseFloat(amount).toFixed(2)}` : 'Pay'}</button>
    </form>
  );
}
