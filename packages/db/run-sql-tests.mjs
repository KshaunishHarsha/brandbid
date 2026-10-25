import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const testDirectory = resolve(repoRoot, 'packages/db/tests');
const sqlFiles = readdirSync(testDirectory)
  .filter((name) => name.endsWith('.sql'))
  .sort();

if (sqlFiles.length === 0) {
  console.log('No SQL tests yet.');
  process.exit(0);
}

const hostPsql = spawnSync('psql', ['--version'], { encoding: 'utf8' });
const useHostPsql = !hostPsql.error && hostPsql.status === 0;
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

for (const name of sqlFiles) {
  const filePath = resolve(testDirectory, name);
  const sql = readFileSync(filePath, 'utf8');
  console.log(`== packages/db/tests/${name}`);

  const command = useHostPsql ? 'psql' : 'docker';
  const args = useHostPsql
    ? [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-f', filePath]
    : ['exec', '-i', 'supabase_db_brandbid', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    input: useHostPsql ? undefined : sql,
    stdio: useHostPsql ? 'inherit' : ['pipe', 'inherit', 'inherit'],
  });

  if (result.error) {
    console.error(`Could not run ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
