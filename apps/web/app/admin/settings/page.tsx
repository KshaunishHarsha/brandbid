import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth';

export const metadata = { title: 'Settings · Admin' };
type Settings = Record<string, unknown>;
const numberValue = (settings: Settings, key: string, fallback: number) => {
  const value = settings[key];
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : fallback;
};
const objectValue = (settings: Settings, key: string, fallback: object) => {
  const value = settings[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
};
const FRAUD_DEFAULTS = {
  flag_score: 50,
  r1: { promoters: 3, window_hours: 24, score: 40 },
  r2: { promoters: 3, window_days: 7, score: 50 },
  r3: { multiple: 5, min_qualified: 50, score: 30 },
  r4: { share_pct: 90, score: 20 },
  r5: { stddev_ms_max: 1000, min_samples: 20, score: 40 },
  r6: { min_qualified: 50, score: 30 },
  r7: { score: 40 },
  r8: { account_age_days: 7, cycle_cents_over: 5000, score: 25 },
  r9: { score: 60 },
  trust: { clean_cycle: 1, max: 50, confirmed_flag: -10, confirmed_self_promo: -50, review_below: 0, suspend_below: -30 },
};

export default async function AdminSettings({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const admin = await requireAdmin('/admin/settings');
  const { notice } = await searchParams;
  const { data, error } = await createAdminClient().rpc('admin_settings', { p_admin_id: admin.id });
  const settings = data && typeof data === 'object' && !Array.isArray(data) ? data as Settings : {};
  return (
    <main className="pt-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="mt-1 text-sm text-muted">Changes are audited. Raising the rate floor updates every lower brand rate and queues an owner notice. Existing visitor claims keep their original rates.</p>
      {notice && <p role="status" className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm">{notice}</p>}
      {error && <p role="alert" className="mt-4 text-sm text-danger">Could not load settings.</p>}
      {!error && <div className="mt-5 space-y-4">
        <NumberSetting setting="floor_cents" label="Minimum visitor rate (cents)" value={numberValue(settings, 'floor_cents', 10)} help="Minimum is 10 cents. Raising this also updates brands below the new floor." />
        <NumberSetting setting="budget_share_bps" label="Budget share (basis points)" value={numberValue(settings, 'budget_share_bps', 5000)} help="0 to 10,000. Applies to future bids." />
        <NumberSetting setting="min_withdrawal_cents" label="Minimum withdrawal (cents)" value={numberValue(settings, 'min_withdrawal_cents', 1000)} help="Minimum is 1,000 cents." />
        <NumberSetting setting="claim_days" label="Claim duration (days)" value={numberValue(settings, 'claim_days', 7)} help="Applies to new visitor claims." />
        <NumberSetting setting="cycle_hours" label="Earning cycle length (hours)" value={numberValue(settings, 'cycle_hours', 24)} help="Applies to new earning cycles." />
        <JsonSetting setting="fraud_thresholds" label="Fraud thresholds (JSON)" value={objectValue(settings, 'fraud_thresholds', FRAUD_DEFAULTS)} help="The flag score and each supported rule score are validated before saving." />
      </div>}
    </main>
  );
}

function NumberSetting({ setting, label, value, help }: { setting: string; label: string; value: number; help: string }) {
  return <SettingForm setting={setting} label={label} value={String(value)} help={help} />;
}

function JsonSetting({ setting, label, value, help }: { setting: string; label: string; value: object; help: string }) {
  return <SettingForm setting={setting} label={label} value={JSON.stringify(value, null, 2)} help={help} multiline />;
}

function SettingForm({ setting, label, value, help, multiline = false }: { setting: string; label: string; value: string; help: string; multiline?: boolean }) {
  return (
    <form method="post" action="/api/admin/settings" className="rounded-card border border-line bg-surface p-4">
      <input type="hidden" name="key" value={setting} />
      <label className="block text-sm font-semibold">{label}
        {multiline
          ? <textarea name="value" required rows={18} className="mt-2 block w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-xs" defaultValue={value} />
          : <input name="value" type="number" required min="0" step="1" className="num mt-2 block w-full max-w-xs rounded-lg border border-line bg-bg px-3 py-2 text-sm" defaultValue={value} />}
      </label>
      <p className="mt-2 text-xs text-muted">{help}</p>
      <label className="mt-3 block text-xs">Reason<input name="reason" required minLength={3} maxLength={500} className="mt-1 block w-full max-w-xl rounded-lg border border-line bg-bg px-3 py-2 text-sm" /></label>
      <button className="mt-3 rounded-lg border border-line px-3 py-2 text-sm font-semibold">Save setting</button>
    </form>
  );
}
