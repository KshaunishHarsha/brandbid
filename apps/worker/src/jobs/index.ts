import type { PgBoss } from 'pg-boss';
import type { JobContext } from '../context.js';
import { runCheckListing } from './check-listing.js';
import { runCleanup } from './cleanup.js';
import { runNotify } from './notify.js';
import { runProcessRefunds } from './process-refunds.js';
import { runReconcileLedgers } from './reconcile-ledgers.js';
import { runSettleCycles } from './settle-cycles.js';

// Every job in BUILD.md section 4. Handlers not built yet are no-ops that say which work package owns them.
export type JobDef = {
  name: string;
  /** cron expression (UTC) */
  cron?: string;
  /** work package that implements it */
  wp: string;
  run?: (ctx: JobContext) => Promise<unknown>;
};

export const JOBS: JobDef[] = [
  { name: 'settle-cycles', cron: '*/5 * * * *', wp: 'P3.2', run: (ctx) => runSettleCycles(ctx) },
  { name: 'score-fraud', wp: 'P3.3' },
  { name: 'process-withdrawals', cron: '*/15 * * * *', wp: 'P3.6' },
  { name: 'refresh-leaderboards', cron: '* * * * *', wp: 'P1.7' },
  { name: 'reconcile-ledgers', cron: '0 2 * * *', wp: 'P3.10', run: (ctx) => runReconcileLedgers(ctx) },
  // P1.9 sends the listing approved / rejected emails; the other kinds arrive with their phases (P3.1).
  { name: 'notify', cron: '* * * * *', wp: 'P3.1', run: (ctx) => runNotify(ctx) },
  // P1.6: polls for freshly paid listings (rather than being enqueued by record_bid) so a missed trigger can never strand one.
  { name: 'check-listing', cron: '* * * * *', wp: 'P1.6', run: (ctx) => runCheckListing(ctx.pool) },
  // P1.9: returns the money for rejected listings through the payment processor, retrying with backoff.
  { name: 'process-refunds', cron: '* * * * *', wp: 'P1.9', run: (ctx) => runProcessRefunds(ctx) },
  { name: 'cleanup', cron: '0 3 * * *', wp: 'P1.6', run: (ctx) => runCleanup(ctx.pool) },
];

export async function registerJobs(
  boss: PgBoss,
  ctx: JobContext,
  onJobRun?: () => void,
): Promise<void> {
  const placeholders: string[] = [];
  for (const job of JOBS) {
    await boss.createQueue(job.name);
    const run = job.run;
    if (!run) placeholders.push(`${job.name} (${job.wp})`);
    // Placeholders still register and run on schedule so the plumbing is exercised, but stay silent each minute.
    await boss.work(job.name, async () => {
      if (!run) return;
      onJobRun?.();
      const result = await run(ctx);
      const noisy =
        typeof result === 'object' && result !== null && Object.values(result).some((v) => v !== 0);
      if (noisy) console.log(`[worker] ${job.name}:`, result);
    });
    if (job.cron) await boss.schedule(job.name, job.cron);
  }
  console.log(`[worker] not built yet, registered as no-ops: ${placeholders.join(', ')}`);
}
