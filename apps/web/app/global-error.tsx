'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html>
      <body style={{ padding: 24, fontFamily: 'sans-serif' }}>Something went wrong.</body>
    </html>
  );
}
