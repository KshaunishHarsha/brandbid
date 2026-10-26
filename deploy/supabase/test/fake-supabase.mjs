// A fake `supabase` CLI for testing deploy/supabase/setup.mjs without touching any real project.
// Behaviour is steered by environment variables; every call is appended to $FAKE_LOG as one JSON line.
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const env = process.env;
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const workdir = flag('--workdir');

let migrations = [];
let config = '';
let hasTemplate = false;
if (workdir && existsSync(join(workdir, 'supabase'))) {
  const mdir = join(workdir, 'supabase', 'migrations');
  migrations = existsSync(mdir) ? readdirSync(mdir).sort() : [];
  const cfg = join(workdir, 'supabase', 'config.toml');
  config = existsSync(cfg) ? readFileSync(cfg, 'utf8') : '';
  hasTemplate = existsSync(join(workdir, 'supabase', 'templates', 'magic_link.html'));
}
appendFileSync(env.FAKE_LOG, JSON.stringify({ args, migrations, config, hasTemplate }) + '\n');

const err = (message) => { console.log(JSON.stringify({ _tag: 'Error', error: { code: 'X', message } })); process.exit(1); };
const [a, b] = args;

if (a === 'projects' && b === 'list') {
  if (env.FAKE_NOT_LOGGED_IN) err('Access token not provided. Supply an access token by running supabase login.');
  console.log(env.FAKE_PROJECTS ?? '[]');
} else if (a === 'link') {
  if (env.FAKE_LINK_FAIL) err('link failed');
  console.log(JSON.stringify({ project_ref: flag('--project-ref'), message: '' }));
} else if (a === 'db' && b === 'push') {
  const applied = (env.FAKE_APPLIED ?? '').split(',').filter(Boolean);
  const pending = env.FAKE_APPLIED === 'all' ? [] : migrations.filter((m) => !applied.includes(m));
  if (args.includes('--dry-run')) {
    console.log('Would push these migrations:');
    console.log(JSON.stringify({ upToDate: pending.length === 0, dryRun: true, migrations: pending }));
  } else {
    for (const m of pending) {
      console.log(`Applying migration ${m}...`);
      if (env.FAKE_FAIL_AT === m) err('ERROR: type citext does not exist (SQLSTATE 42704)');
    }
    console.log(JSON.stringify({ upToDate: false, dryRun: false, migrations: pending, message: 'Finished supabase db push.' }));
  }
} else if (a === 'config' && b === 'push') {
  if (args.includes('--yes')) {
    if (env.FAKE_CONFIG_FAIL) err(env.FAKE_CONFIG_FAIL);
    console.log('Applied.');
  } else if (env.FAKE_CONFIG_UPTODATE) {
    console.log('Remote Auth config is up to date.');
  } else {
    console.log('Updating Auth service with config:\nauth.site_url [update]\n  local:  "https://staging.example"\n  remote: "http://localhost:3000"\n\nDo you want to push auth config to remote? [y/N] ');
    console.log('{"schema_version":1}');
  }
} else if (a === 'projects' && b === 'api-keys') {
  console.log(JSON.stringify([{ name: 'anon', api_key: 'anon-dummy' }, { name: 'service_role', api_key: 'must-never-be-read' }]));
} else {
  err(`fake CLI: unexpected command ${args.join(' ')}`);
}
