import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const metadata = { title: 'Reconciliation · Admin' };
type Run = { id: string; started_at: string; completed_at: string | null; passed: boolean; violation_count: number; violations: unknown; user_agents_stripped: number };
const isRun = (value: unknown): value is Run => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const run = value as Record<string, unknown>;
  return typeof run.id === 'string' && typeof run.started_at === 'string' && typeof run.passed === 'boolean'
    && typeof run.violation_count === 'number' && typeof run.user_agents_stripped === 'number';
};

export default async function ReconciliationPage() {
  const admin = await requireAdmin('/admin/reconciliation');
  const { data, error } = await createAdminClient().rpc('admin_reconciliation_history', { p_admin_id: admin.id, p_limit: 30 });
  const runs = Array.isArray(data) ? (data as unknown[]).filter(isRun) : [];

  return (
    <main className="pt-6">
      <h1 className="text-2xl font-bold">Reconciliation</h1>
      <p className="mt-1 text-sm text-muted">Nightly checks compare money caches with ledgers and verify earning, bid, waitlist, and clawback invariants. Click user agents older than 90 days are removed during the run.</p>
      {error && <p role="alert" className="mt-4 text-sm text-danger">Could not load reconciliation history.</p>}
      {!error && runs.length === 0 && <p className="mt-6 rounded-card border border-line bg-surface p-4 text-sm">No reconciliation runs yet. The worker runs this job nightly at 02:00 UTC.</p>}
      <ol className="mt-5 space-y-3">
        {runs.map((run) => {
          const violations = Array.isArray(run.violations) ? run.violations : [];
          return (
            <li key={run.id} className="rounded-card border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className={`font-bold ${run.passed ? 'text-emerald-700' : 'text-danger'}`}>{run.passed ? 'Passed' : `Failed · ${run.violation_count} violation(s)`}</h2>
                  <p className="mt-1 text-sm text-muted">Started {new Date(run.started_at).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC</p>
                  <p className="text-xs text-muted">User agents stripped: {run.user_agents_stripped} · Run {run.id}</p>
                </div>
                {!run.passed && <details className="min-w-64 flex-1 text-sm"><summary className="cursor-pointer font-semibold">View violations</summary>
                  <ul className="mt-2 space-y-2">
                    {violations.map((violation, i) => <li key={i} className="rounded border border-line p-2 font-mono text-xs break-all">{JSON.stringify(violation)}</li>)}
                  </ul>
                </details>}
              </div>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
