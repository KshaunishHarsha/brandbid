'use client';

import { useEffect, useState } from 'react';

const pad = (n: number) => String(n).padStart(2, '0');

function untilUtcMidnight(now: number) {
  const d = new Date(now);
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  const s = Math.max(0, Math.floor((end - now) / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

/** Time left on today's board (resets 00:00 UTC). Display only; the server decides the real boundary. */
export function Countdown({ className = '' }: { className?: string }) {
  const [text, setText] = useState('--:--:--');
  useEffect(() => {
    const tick = () => setText(untilUtcMidnight(Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  return <span className={`num ${className}`} suppressHydrationWarning>{text}</span>;
}
