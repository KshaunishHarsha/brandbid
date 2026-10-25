import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Still `middleware.ts` (not Next 16's `proxy.ts`): the OpenNext Cloudflare adapter supports edge
// middleware; Node-runtime proxy support is unverified (D43). Revisit in P1.12.
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Session refresh only on pages. The hot, anonymous paths must stay fast and cookie-free:
  // /go (click tracking), /out, /api/q (qualification), webhooks, generated images, static files.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|go/|out/|api/q|api/webhooks|api/og|api/story|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
