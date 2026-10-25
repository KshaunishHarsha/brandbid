// Run a single job immediately, outside the scheduler. Handy for ops and debugging:
//   DATABASE_URL=... pnpm --filter worker run-once check-listing
import { createPool } from './db.js';
import { JOBS } from './jobs/index.js';

const name = process.argv[2];
const job = JOBS.find((j) => j.name === name);
if (!job?.run) {
  console.error(`Usage: run-once <job>. Runnable jobs: ${JOBS.filter((j) => j.run).map((j) => j.name).join(', ')}`);
  process.exit(1);
}

const pool = createPool();
try {
  console.log(`${job.name}:`, await job.run(pool));
} finally {
  await pool.end();
}
