'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Turnstile } from '@/components/Turnstile';
import { ActiveTimeQualificationTimer } from './active-time';

type Props = { clickId: string | null; linkCode: string | null; needsConsent: boolean; initialConsent: 'yes' | 'no' | null; viaHandle: string | null };

export function PromoQualification({ clickId, linkCode, needsConsent, initialConsent, viaHandle }: Props) {
  const [consent, setConsent] = useState(initialConsent);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReady, setTurnstileReady] = useState(!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  const [qualification, setQualification] = useState<{ activeMs: number; interactions: number } | null>(null);
  const fired = useRef(false);
  const requestSent = useRef(false);
  const canMeasure = !needsConsent || consent === 'yes';
  const onTurnstileToken = useCallback((token: string | null) => { setTurnstileToken(token); setTurnstileReady(true); }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('c') || url.searchParams.has('l')) {
      url.searchParams.delete('c'); url.searchParams.delete('l');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  useEffect(() => {
    if (!clickId || !canMeasure) return;
    const timer = new ActiveTimeQualificationTimer((activeMs, interactions) => {
      if (!fired.current) { fired.current = true; setQualification({ activeMs, interactions }); }
    });
    const events = ['pointermove', 'pointerdown', 'scroll', 'touchstart', 'keydown'] as const;
    const interaction = () => timer.interact(performance.now(), document.visibilityState === 'visible');
    const visibility = () => timer.visibilityChanged(performance.now(), document.visibilityState === 'visible');
    events.forEach((event) => document.addEventListener(event, interaction, { passive: true }));
    document.addEventListener('visibilitychange', visibility);
    const ticker = window.setInterval(() => timer.tick(performance.now()), 100);
    return () => { window.clearInterval(ticker); timer.stop(performance.now()); events.forEach((event) => document.removeEventListener(event, interaction)); document.removeEventListener('visibilitychange', visibility); };
  }, [clickId, canMeasure]);

  useEffect(() => {
    if (!qualification || !clickId || !turnstileReady || requestSent.current) return;
    requestSent.current = true;
    let cancelled = false;
    void (async () => {
      let fingerprint: string | undefined;
      if (!needsConsent || consent === 'yes') {
        try {
          const FingerprintJS = await import('@fingerprintjs/fingerprintjs');
          const agent = await FingerprintJS.load();
          fingerprint = (await agent.get()).visitorId;
        } catch { /* Qualification can continue using cookie/IP+UA signals. */ }
      }
      if (cancelled) return;
      const body = JSON.stringify({ clickId, linkCode, activeMs: qualification.activeMs, interactions: qualification.interactions, turnstileToken: turnstileToken ?? undefined, fingerprint });
      try { await fetch('/api/q', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }); } catch { /* Best-effort beacon; the click remains recorded. */ }
      setQualification(null);
    })();
    return () => { cancelled = true; };
  }, [qualification, clickId, linkCode, needsConsent, consent, turnstileToken, turnstileReady]);

  useEffect(() => {
    if (!qualification || turnstileReady) return;
    const timeout = window.setTimeout(() => setTurnstileReady(true), 2000);
    return () => window.clearTimeout(timeout);
  }, [qualification, turnstileReady]);

  async function chooseConsent(choice: 'yes' | 'no') {
    const response = await fetch('/api/consent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ choice, clickId }) });
    if (!response.ok) return;
    setConsent(choice);
  }

  return <>
    {viaHandle && <p className="mb-4 rounded-lg bg-accent/10 px-4 py-3 text-sm font-semibold">You&apos;re here via <span className="text-accent">@{viaHandle}</span> on brandbid</p>}
    {needsConsent && consent === null && <section className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-xl border border-line bg-surface p-4 shadow-xl" aria-label="Privacy choices">
      <p className="text-sm">Allow a visitor cookie and device recognition to measure qualified visits from promoter links? If you decline, we use only privacy-preserving network signals.</p>
      <div className="mt-3 flex justify-end gap-2"><button className="rounded-lg border border-line px-4 py-2 text-sm" onClick={() => void chooseConsent('no')}>Decline</button><button className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-accent-fg" onClick={() => void chooseConsent('yes')}>Accept</button></div>
    </section>}
    {qualification && <div className="sr-only" aria-hidden="true"><Turnstile onToken={onTurnstileToken} /></div>}
  </>;
}
