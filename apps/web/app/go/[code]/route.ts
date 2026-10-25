// Placeholder. Real redirect lands in P2.5 (BUILD section 13, step A).
// No `runtime = 'edge'`: the OpenNext Cloudflare adapter fails the build on it (D43).
// Workers run at Cloudflare's edge in every region anyway.
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  return NextResponse.redirect(new URL('/', req.url), 302);
}
