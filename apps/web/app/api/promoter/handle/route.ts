import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { handleAvailable } from '@/lib/promoter';
import { getLimiter } from '@/lib/ratelimit';

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await getLimiter('handle-availability', 30, 600).limit(user.id)).success) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const handle = new URL(req.url).searchParams.get('handle') ?? '';
  if (handle.length > 20) return NextResponse.json({ available: false });
  return NextResponse.json({ available: await handleAvailable(handle, user.id) }, { headers: { 'Cache-Control': 'no-store' } });
}
