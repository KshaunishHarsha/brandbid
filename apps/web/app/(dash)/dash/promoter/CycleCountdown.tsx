'use client';

import { useEffect, useState } from 'react';

function remaining(endsAt: string, now: number) {
  const ms = Date.parse(endsAt) - now;
  if (ms <= 0) return 'settling now';
  const totalMinutes = Math.ceil(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return [days ? `${days}d` : null, hours || days ? `${hours}h` : null, `${minutes}m`].filter(Boolean).join(' ');
}

export function CycleCountdown({ endsAt, nowAt }: { endsAt: string; nowAt: string }) {
  const [now, setNow] = useState(() => Date.parse(nowAt));
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return <time dateTime={endsAt}>{remaining(endsAt, now)}</time>;
}
