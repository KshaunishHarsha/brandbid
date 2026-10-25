import type { PgBoss } from 'pg-boss';

// Every job in BUILD.md section 4. Handlers are no-ops until their work package lands.
export type JobDef = {
  name: string;
  /** cron expression (UTC); omit for jobs enqueued on demand */
  cron?: string;
  /** work package that implements it */
  wp: string;
};

export const JOBS: JobDef[] = [
  { name: 'settle-cycles', cron: '*/5 * * * *', wp: 'P3.2' },
  { name: 'score-fraud', wp: 'P3.3' },
  { name: 'process-withdrawals', cron: '*/15 * * * *', wp: 'P3.6' },
  { name: 'refresh-leaderboards', cron: '* * * * *', wp: 'P1.7' },
  { name: 'reconcile-ledgers', cron: '0 2 * * *', wp: 'P3.10' },
  { name: 'notify', cron: '* * * * *', wp: 'P3.1' },
  { name: 'check-listing', wp: 'P1.6' },
];

export async function registerJobs(boss: PgBoss): Promise<void> {
  for (const job of JOBS) {
    await boss.createQueue(job.name);
    await boss.work(job.name, async () => {
      console.log(`[worker] ${job.name}: not implemented yet (${job.wp})`);
    });
    if (job.cron) await boss.schedule(job.name, job.cron);
  }
}
