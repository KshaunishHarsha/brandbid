import { NextResponse } from 'next/server';
import { isSameOrigin } from '@/lib/same-origin';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMemberBrand } from '@/lib/dashboard';

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { slug } = await params;
  const member = await getMemberBrand(slug);
  if (!member || member.brand.status !== 'active') return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const form = await req.formData();
  const reason = form.get('reason');
  const target = new URL(`/dash/brands/${encodeURIComponent(member.brand.slug)}`, req.url);
  if (typeof reason !== 'string' || reason.trim().length < 10) {
    target.searchParams.set('notice', 'Please describe the suspicious traffic in at least 10 characters.');
    return NextResponse.redirect(target, 303);
  }

  const { error } = await createAdminClient().rpc('report_brand_suspicious_traffic', {
    p_brand_id: member.brand.id, p_reporter_id: member.user.id, p_reason: reason.trim().slice(0, 1000),
  });
  const messages: Record<string, string> = {
    brand_report_rate_limited: 'A report for this brand was already sent from your account in the last 24 hours.',
    brand_not_reportable: 'Only active brands can report traffic.',
    brand_membership_required: 'You no longer have access to this brand.',
    report_reason_required: 'Please describe the suspicious traffic in at least 10 characters.',
  };
  target.searchParams.set('notice', error ? messages[error.message] ?? 'The report could not be sent. Please try again.' : 'Report sent to the review team.');
  return NextResponse.redirect(target, 303);
}
