import type { PgBoss } from 'pg-boss';
import type { Pool } from '../db.js';
import { runCheckListing } from './check-listing.js';
import { runCleanup } from './cleanup.js';

// Every job in BUILD.md section 4. Handlers not built yet are no-ops that say which work package owns them.
export type JobDef = {
  name: string;
  /** cron expression (UTC) */
  cron?: string;
  /** work package that implements it */
  wp: string;
  run?: (pool: Pool) => Promise<unknown>;
};

export const JOBS: JobDef[] = [
  { name: 'settle-cycles', cron: '*/5 * * * *', wp: 'P3.2' },
  { name: 'score-fraud', wp: 'P3.3' },
  { name: 'process-withdrawals', cron: '*/15 * * * *', wp: 'P3.6' },
  { name: 'refresh-leaderboards', cron: '* * * * *', wp: 'P1.7' },
  { name: 'reconcile-ledgers', cron: '0 2 * * *', wp: 'P3.10' },
  { name: 'notify', cron: '* * * * *', wp: 'P3.1' },
  // P1.6: polls for freshly paid listings (rather than being enqueued by record_bid) so a missed trigger can never strand one.
  { name: 'check-listing', cron: '* * * * *', wp: 'P1.6', run: (pool) => runCheckListing(pool) },
  { name: 'cleanup', cron: '0 3 * * *', wp: 'P1.6', run: (pool) => runCleanup(pool) },
];

export async function registerJobs(boss: PgBoss, pool: Pool): Promise<void> {
  for (const job of JOBS) {
    await boss.createQueue(job.name);
    await boss.work(job.name, async () => {
      if (!job.run) {
        console.log(`[worker] ${job.name}: not implemented yet (${job.wp})`);
        return;
      }
      const result = await job.run(pool);
      const noisy = typeof result === 'object' && result !== null && Object.values(result).some((v) => v !== 0);
      if (noisy) console.log(`[worker] ${job.name}:`, result);
    });
    if (job.cron) await boss.schedule(job.name, job.cron);
  }
}
