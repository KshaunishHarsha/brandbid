import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { isSameOrigin } from '@/lib/same-origin';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const target = new URL('/dash/notifications', req.url);
  const user = await getUser();
  if (!user) {
    target.pathname = '/signin';
    target.searchParams.set('next', '/dash/notifications');
    return NextResponse.redirect(target, 303);
  }
  const enabled = (await req.formData()).get('enabled');
  if (enabled !== 'true' && enabled !== 'false') {
    target.searchParams.set('notice', 'Choose whether optional product alerts should be on or off.');
    return NextResponse.redirect(target, 303);
  }
  const { error } = await createAdminClient().from('profiles').update({ product_emails_enabled: enabled === 'true' }).eq('id', user.id);
  target.searchParams.set('notice', error ? 'Your email preference could not be saved.' : enabled === 'true' ? 'Optional product alerts are on.' : 'You are unsubscribed from optional product alerts.');
  return NextResponse.redirect(target, 303);
}
