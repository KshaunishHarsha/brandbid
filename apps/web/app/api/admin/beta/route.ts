import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-api';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  const guard = await requireAdminApi(req);
  if (!guard.ok) return guard.response;
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  const open = form.has('open');
  const raw = String(form.get('emails') ?? '');
  if (raw.length > 20_000) return NextResponse.json({ error: 'too_many_emails' }, { status: 400 });
  const emails = [...new Set(raw.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
  if (emails.length > 500 || emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }
  const db = createAdminClient();
  const value = open ? null : emails;
  const { error } = await db.from('settings').update({ value }).eq('key', 'beta_allowlist').select('key').single();
  if (error) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  const { error: auditError } = await db.from('audit_log').insert({ actor_id: guard.adminId, action: 'beta_allowlist_changed', details: { open, count: emails.length } });
  if (auditError) {
    console.error('[beta] allowlist changed but audit insert failed:', auditError);
    return NextResponse.json({ error: 'audit_failed' }, { status: 503 });
  }
  return NextResponse.redirect(new URL('/admin/beta', req.url), 303);
}
