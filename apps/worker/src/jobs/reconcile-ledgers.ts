import * as Sentry from '@sentry/node';
import type { JobContext } from '../context.js';

type Reconciliation = { run_id: string; passed: boolean; violation_count: number; violations: unknown[] };

/** Runs the persisted money checks and the 90-day click user-agent retention sweep. */
export async function runReconcileLedgers(ctx: Pick<JobContext, 'pool'>): Promise<{
  run_id: string;
  passed: boolean;
  violation_count: number;
  user_agents_stripped: number;
}> {
  const { rows } = await ctx.pool.query<{ result: Reconciliation }>('select public.run_reconciliation() as result');
  const result = rows[0]?.result;
  if (!result) throw new Error('run_reconciliation returned no result');

  const { rows: strippedRows } = await ctx.pool.query<{ count: number }>(
    'select public.strip_old_user_agents() as count',
  );
  const stripped = Number(strippedRows[0]?.count ?? 0);
  await ctx.pool.query('update public.reconciliation_runs set user_agents_stripped = $2 where id = $1', [result.run_id, stripped]);

  if (!result.passed) {
    const message = `Ledger reconciliation found ${result.violation_count} violation(s)`;
    console.error('[worker] reconciliation failed', { run_id: result.run_id, violations: result.violations });
    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.setTag('job', 'reconcile-ledgers');
      scope.setContext('reconciliation', {
        run_id: result.run_id,
        violation_count: result.violation_count,
        violations: result.violations.slice(0, 50),
      });
      Sentry.captureMessage(message);
    });
  }

  return { run_id: result.run_id, passed: result.passed, violation_count: result.violation_count, user_agents_stripped: stripped };
}
