// Placeholder. Real edge redirect lands in P2.5 (BUILD section 13, step A).
import { NextResponse } from 'next/server';
export const runtime = 'edge';

export async function GET(req: Request) {
  return NextResponse.redirect(new URL('/', req.url), 302);
}
