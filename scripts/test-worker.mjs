import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const tsxCli = fileURLToPath(import.meta.resolve('tsx/cli'));
const env = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
};

for (const testFile of [
  'apps/worker/src/jobs/check-listing.integration.ts',
  'apps/worker/src/jobs/admin-jobs.integration.ts',
]) {
  const result = spawnSync(process.execPath, [tsxCli, testFile], {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`Could not run ${testFile}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
