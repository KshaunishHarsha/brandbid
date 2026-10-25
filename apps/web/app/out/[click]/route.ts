// Placeholder. Outbound redirect lands in P2.9 (BUILD section 13, step D).
import { NextResponse } from 'next/server';
export async function GET(req: Request) {
  return NextResponse.redirect(new URL('/', req.url), 302);
}
