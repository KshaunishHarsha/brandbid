'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Turnstile } from '@/components/Turnstile';
import { captureListingEvent } from '@/lib/analytics';

type Category = { id: number; name: string; requires_review: boolean };
type Step = 1 | 2 | 3;

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open(): void };
  }
}

const ERRORS: Record<string, string> = {
  email_mismatch: 'The two email addresses do not match.',
  below_minimum: 'That is below the minimum bid.',
  above_maximum: 'That is above the maximum bid. Contact us for larger amounts.',
  invalid_amount: 'Enter an amount like 25 or 25.50.',
  invalid_url: 'That website address is not valid.',
  invalid_logo: 'The logo must be a PNG, JPEG or WebP image.',
  logo_too_large: 'The logo must be under 1 MB.',
  already_listed: 'That website is already listed.',
  rate_limited: 'Too many attempts. Please wait a bit and try again.',
  bot_check_failed: 'Bot check failed. Reload the page and try again.',
  payment_unavailable: 'Payments are unavailable right now. Please try again shortly.',
};

/** 5100 -> "51", 5150 -> "51.50" */
function dollars(cents: number): string {
  return (cents / 100).toFixed(2).replace(/\.00$/, '');
}

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

export function ListWizard({
  categories,
  signedInEmail,
  minBidCents,
  ladder,
  initialCents,
}: {
  categories: Category[];
  signedInEmail: string | null;
  minBidCents: number;
  ladder: Array<{ rank: number; priceCents: number }>;
  initialCents: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const [amount, setAmount] = useState(dollars(initialCents));
  const [email, setEmail] = useState('');
  const [emailConfirm, setEmailConfirm] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const onToken = useCallback((t: string | null) => setToken(t), []);
  const needsBotCheck = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const [mock, setMock] = useState<null | {
    orderId: string;
    brandId: string;
    payerId: string;
    amountCents: number;
    done: string;
  }>(null);

  useEffect(() => captureListingEvent('list_started'), []);

  function pickLogo(file: File | null) {
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogo(file);
    setLogoPreview(file ? URL.createObjectURL(file) : null);
  }

  const minDollars = (minBidCents / 100).toString();
  const amountOk =
    /^\d+(\.\d{1,2})?$/.test(amount) && Math.round(parseFloat(amount) * 100) >= minBidCents;

  async function prefill(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNote('');
    try {
      const res = await fetch('/api/brands/prefill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (res.status === 409)
        return setError(`That website is already listed. See it at /b/${data.slug}.`);
      if (!res.ok)
        return setError(data.message ?? ERRORS[data.error] ?? 'Something went wrong. Try again.');
      setUrl(data.url);
      setName(data.name ?? '');
      setDescription(data.description ?? '');
      setImageUrl(data.image ?? null);
      if (data.warning)
        setNote("We couldn't read that page, so please fill in the details yourself.");
      captureListingEvent('list_prefilled', { automatic: !data.warning });
      setStep(2);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function details(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (logo && logo.size > 1024 * 1024) return setError(ERRORS.logo_too_large!);
    setStep(3);
  }

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.set('url', url);
      form.set('name', name);
      form.set('description', description);
      form.set('categoryId', String(categoryId));
      form.set('amount', amount);
      if (imageUrl) form.set('imageUrl', imageUrl);
      if (logo) form.set('logo', logo);
      if (!signedInEmail) {
        form.set('email', email);
        form.set('emailConfirm', emailConfirm);
      }
      if (token) form.set('turnstileToken', token);

      const res = await fetch('/api/checkout', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === 'already_listed'
            ? `That website is already listed (/b/${data.slug}).`
            : (ERRORS[data.error] ?? 'Something went wrong. Try again.'),
        );
        return setBusy(false);
      }

      const done = `/list/done?id=${data.brandId}&t=${data.statusToken}`;
      const order = data.order as {
        orderId: string;
        keyId: string;
        amountCents: number;
        mode: string;
      };
      captureListingEvent('checkout_started', { amount_cents: order.amountCents });

      if (order.mode === 'mock') {
        setMock({
          orderId: order.orderId,
          brandId: data.brandId,
          payerId: data.payerId,
          amountCents: order.amountCents,
          done,
        });
        return setBusy(false);
      }

      await loadRazorpay();
      const rzp = new window.Razorpay!({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountCents,
        currency: 'USD',
        name: 'brandbid',
        description: `Listing: ${name}`,
        prefill: { email: data.email },
        theme: { color: '#111111' },
        // The bid is recorded by the server webhook, not by this callback: this only moves the page along.
        handler: () => router.push(done),
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.open();
    } catch {
      setError('Network error. Try again.');
      setBusy(false);
    }
  }

  async function mockPay() {
    if (!mock) return;
    setBusy(true);
    const res = await fetch('/api/dev/mock-pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: mock.orderId,
        brandId: mock.brandId,
        payerId: mock.payerId,
        amountCents: mock.amountCents,
      }),
    });
    if (res.ok) router.push(mock.done);
    else {
      setError('Mock payment failed.');
      setBusy(false);
    }
  }

  const input =
    'w-full rounded-lg border border-black/20 bg-transparent px-3 py-3 dark:border-white/30';
  const primary =
    'w-full rounded-lg bg-black px-4 py-3 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black';

  if (mock) {
    return (
      <div className="space-y-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
        <h2 className="font-semibold">Test mode: no real payment</h2>
        <p className="text-sm">
          This is the local mock checkout (PAYMENTS_MODE=mock). Press the button to pretend the
          payment succeeded.
        </p>
        <button onClick={mockPay} disabled={busy} className={primary}>
          {busy ? 'Working…' : `Simulate paying $${(mock.amountCents / 100).toFixed(2)}`}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <ol className="mb-6 flex gap-2 text-xs opacity-70" aria-label="Progress">
        {['Website', 'Details', 'Pay'].map((label, i) => (
          <li key={label} className={step === i + 1 ? 'font-bold opacity-100' : ''}>
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <form onSubmit={prefill} className="space-y-3">
          <label htmlFor="url" className="block text-sm font-medium">
            Your website
          </label>
          <input
            id="url"
            className={input}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="yourbrand.com"
            required
            autoFocus
            inputMode="url"
          />
          <p className="text-xs opacity-60">
            We read your page to pre-fill the name, description and logo. You can edit everything.
          </p>
          <button className={primary} disabled={busy || !url.trim()}>
            {busy ? 'Reading your site…' : 'Continue'}
          </button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={details} className="space-y-4">
          {note && <p className="rounded-lg bg-amber-500/10 p-3 text-sm">{note}</p>}
          <div>
            <label htmlFor="name" className="block text-sm font-medium">
              Brand name
            </label>
            <input
              id="name"
              className={input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={60}
              required
            />
          </div>
          <div>
            <label htmlFor="desc" className="block text-sm font-medium">
              One-line description
            </label>
            <textarea
              id="desc"
              className={input}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              minLength={10}
              maxLength={160}
              rows={2}
              required
            />
            <p className="text-right text-xs opacity-60">{description.length}/160</p>
          </div>
          <div>
            <label htmlFor="cat" className="block text-sm font-medium">
              Category
            </label>
            <select
              id="cat"
              className={input}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}
              required
            >
              <option value="">Choose…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.requires_review ? ' (manual review)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="block text-sm font-medium">Logo</span>
            <div className="mt-2 flex items-center gap-3">
              {(logoPreview ?? imageUrl) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={(logoPreview ?? imageUrl)!}
                  alt="Logo preview"
                  referrerPolicy="no-referrer"
                  className="h-14 w-14 rounded-lg border object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-lg border text-lg font-bold">
                  {name.slice(0, 1).toUpperCase() || '?'}
                </div>
              )}
              <label className="cursor-pointer text-sm underline">
                Upload your own
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => pickLogo(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <p className="mt-1 text-xs opacity-60">PNG, JPEG or WebP, under 1 MB.</p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-lg border px-4 py-3"
            >
              Back
            </button>
            <button className={primary} disabled={!categoryId}>
              Continue
            </button>
          </div>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={pay} className="space-y-4">
          <div>
            <span className="block text-sm font-medium">How much do you want to pay?</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {ladder.map((step) => {
                const label =
                  step.priceCents <= minBidCents ? 'Join the board' : `Take #${step.rank}`;
                const selected = amount === dollars(step.priceCents);
                return (
                  <button
                    type="button"
                    key={step.rank}
                    onClick={() => setAmount(dollars(step.priceCents))}
                    className={`rounded-lg border border-line px-3 py-2 text-left text-sm ${selected ? 'bg-accent text-accent-fg' : 'bg-surface'}`}
                  >
                    <span className="block font-semibold">${dollars(step.priceCents)}</span>
                    <span className="block text-xs opacity-70">{label}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span>$</span>
              <input
                className={input}
                value={amount}
                onChange={(e) => setAmount(e.target.value.trim())}
                inputMode="decimal"
                aria-label="Amount in dollars"
              />
            </div>
            <p className="mt-1 text-xs opacity-60">
              Minimum ${minDollars}. Prices move as others bid, and a higher total ranks you higher.
              Half becomes your ad budget; promoters are paid from it per qualified visitor.
            </p>
          </div>

          {signedInEmail ? (
            <p className="text-sm">
              Listing as <strong>{signedInEmail}</strong>
            </p>
          ) : (
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium">
                Your email
              </label>
              <input
                id="email"
                type="email"
                className={input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
              <input
                type="email"
                className={input}
                value={emailConfirm}
                onChange={(e) => setEmailConfirm(e.target.value)}
                placeholder="Type it again"
                aria-label="Confirm email"
                required
              />
              <p className="text-xs opacity-60">
                No password. We email you a link to manage your listing, so double-check this
                address.
              </p>
            </div>
          )}

          <Turnstile onToken={onToken} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-lg border px-4 py-3"
            >
              Back
            </button>
            <button className={primary} disabled={busy || !amountOk || (needsBotCheck && !token)}>
              {busy
                ? 'Starting checkout…'
                : amountOk
                  ? `Pay $${parseFloat(amount).toFixed(2)}`
                  : 'Pay'}
            </button>
          </div>
          <p className="text-center text-xs opacity-60">Rejected listings are refunded in full.</p>
        </form>
      )}
    </div>
  );
}
