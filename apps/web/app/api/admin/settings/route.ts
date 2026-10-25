import type { Json } from '@brandbid/db';
import { adminErrorNotice, backToQueue, requireAdminApi } from '@/lib/admin-api';
import { createAdminClient } from '@/lib/supabase/admin';

const EDITABLE = new Set(['floor_cents', 'budget_share_bps', 'min_withdrawal_cents', 'claim_days', 'cycle_hours', 'fraud_thresholds']);

export async function POST(req: Request) {
  const guard = await requireAdminApi(req);
  if (!guard.ok) return guard.response;
  const form = await req.formData();
  const key = form.get('key');
  const raw = form.get('value');
  const reason = form.get('reason');
  if (typeof key !== 'string' || !EDITABLE.has(key)) return backToQueue(req, 'Choose a supported setting.', '/admin/settings');
  if (typeof reason !== 'string' || reason.trim().length < 3) return backToQueue(req, 'Please give a reason (at least 3 characters).', '/admin/settings');
  if (typeof raw !== 'string' || raw.length > 20_000) return backToQueue(req, 'The setting value is missing or too long.', '/admin/settings');

  let value: Json;
  if (key === 'fraud_thresholds') {
    try { value = JSON.parse(raw); } catch { return backToQueue(req, 'Fraud thresholds must be valid JSON.', '/admin/settings'); }
  } else {
    if (!/^\d+$/.test(raw.trim())) return backToQueue(req, 'Enter a whole number of cents, basis points, days, or hours.', '/admin/settings');
    value = Number(raw.trim());
    if (!Number.isSafeInteger(value)) return backToQueue(req, 'That number is outside the supported range.', '/admin/settings');
  }

  const { data, error } = await createAdminClient().rpc('admin_update_setting', {
    p_key: key, p_value: value, p_reason: reason.trim().slice(0, 500), p_admin_id: guard.adminId,
  });
  if (error) return backToQueue(req, adminErrorNotice(error.message), '/admin/settings');
  const changed = data && typeof data === 'object' && (data as { changed?: boolean }).changed === true;
  return backToQueue(req, changed ? 'Setting saved and audited.' : 'Setting already had that value.', '/admin/settings');
}
