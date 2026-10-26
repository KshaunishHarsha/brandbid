#!/usr/bin/env node
// Sets up (or re-checks) a hosted Supabase project for brandbid in one go. See DEPLOYMENT.md section 3.
//
//   node deploy/supabase/setup.mjs <env> [<project-ref>] [options]
//
//   env           staging | production  (a folder under deploy/supabase/)
//   project-ref   the 20-letter id of the project (Project Settings > General). Optional if the env's
//                 project-ref file is already right; if given and different, the file is updated.
//
//   --dry-run      show every change that WOULD be made, apply nothing
//   --yes          do not stop to ask before applying (needed when not run from a terminal)
//   --templates    also push the email template (only works after custom SMTP is set up on the project)
//   --skip-db      skip the database migrations
//   --skip-config  skip the sign-in settings
//   --skip-verify  skip the final security check
//
// Needs the Supabase CLI, logged in as the account that owns the project (`supabase login`).
// Plain Node, no dependencies, so it runs the same on Windows, macOS and Linux. It never reads the service role key.
//
// What it does, in order: find the project in the logged-in account -> link -> preview then apply the database
// migrations -> preview then apply ONLY the sign-in settings declared in deploy/supabase/<env>/*.toml -> run
// scripts/verify-supabase.mjs against the project. It builds a throwaway project folder holding copies of the
// migrations and the settings, so it needs no symlinks, never pushes the repo's local-development config.toml, and
// leaves no linked-project state behind in the repo.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REF_RE = /^[a-z]{20}$/;

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const [envName, refArg] = argv.filter((a) => !a.startsWith('--'));
const KNOWN = new Set(['--dry-run', '--yes', '--templates', '--skip-db', '--skip-config', '--skip-verify', '--help']);

const say = (m = '') => console.log(m);
const step = (m) => say(`\n== ${m}`);
function die(message, hint) {
  console.error(`\nSTOPPED: ${message}`);
  if (hint) console.error(hint);
  process.exit(1);
}

if (flags.has('--help') || !envName) {
  say('Usage: node deploy/supabase/setup.mjs <staging|production> [<project-ref>] [--dry-run] [--yes] [--templates] [--skip-db] [--skip-config] [--skip-verify]');
  process.exit(envName ? 0 : 2);
}
for (const f of flags) if (!KNOWN.has(f)) die(`unknown option ${f}`);

const envDir = join(root, 'deploy', 'supabase', envName);
if (!existsSync(join(envDir, 'core.toml'))) {
  const known = readdirSync(join(root, 'deploy', 'supabase'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  die(`there is no settings folder for "${envName}"`, `Known environments: ${known.join(', ') || '(none)'}. For a new one, copy deploy/supabase/staging and edit it.`);
}
const refFile = join(envDir, 'project-ref');
const savedRef = existsSync(refFile) ? readFileSync(refFile, 'utf8').trim() : '';
const ref = refArg ?? savedRef;
if (!REF_RE.test(ref)) die(`"${ref || '(none)'}" is not a project ref`, 'It is 20 lowercase letters: Project Settings > General > Reference ID, or the part before .supabase.co in the project URL.');

/** Run the Supabase CLI. SUPABASE_CLI (a .mjs path) replaces it, which is how the tests drive this tool with a fake. */
function cli(args, { cwd = root } = {}) {
  const fake = process.env.SUPABASE_CLI;
  const r = fake
    ? spawnSync(process.execPath, [fake, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 })
    : spawnSync('supabase', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20, shell: process.platform === 'win32' });
  if (r.error?.code === 'ENOENT') die('the Supabase CLI is not installed', 'Install it from https://supabase.com/docs/guides/cli and run `supabase login`.');
  return { code: r.status ?? 1, out: r.stdout ?? '', err: r.stderr ?? '' };
}

/** The CLI reports failures as JSON lines like {"_tag":"Error","error":{"message":"..."}}. */
function cliError(r) {
  for (const line of `${r.out}\n${r.err}`.split(/\r?\n/)) {
    if (!line.startsWith('{')) continue;
    try {
      const j = JSON.parse(line);
      if (j._tag === 'Error') return String(j.error?.message ?? 'unknown error');
    } catch { /* not JSON */ }
  }
  return r.code === 0 ? '' : (r.err.trim() || r.out.trim() || `exit code ${r.code}`).slice(0, 600);
}
const jsonOut = (text) => { try { return JSON.parse(text); } catch { return undefined; } };
const lastJsonLine = (text) => {
  const lines = text.split(/\r?\n/).filter((l) => l.startsWith('{'));
  for (const l of lines.reverse()) { const j = jsonOut(l); if (j) return j; }
  return undefined;
};

async function confirm(question) {
  if (flags.has('--yes')) return true;
  if (!process.stdin.isTTY) die('this needs a person to confirm, but there is no terminal', 'Run it from a terminal, or add --yes.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
  rl.close();
  return a === 'y' || a === 'yes';
}

const dry = flags.has('--dry-run');
const work = mkdtempSync(join(tmpdir(), 'brandbid-supabase-'));
process.on('exit', () => rmSync(work, { recursive: true, force: true }));

say(`brandbid hosted Supabase setup: ${envName}${dry ? '  (DRY RUN: nothing will be changed)' : ''}`);

// ---------------------------------------------------------------------------------------------- 1. the project
step('1. Find the project in the logged-in Supabase account');
const list = cli(['projects', 'list', '-o', 'json']);
let projects = jsonOut(list.out);
projects = Array.isArray(projects) ? projects : projects?.projects;
if (list.code !== 0 || !Array.isArray(projects)) {
  die('could not list projects. Probably not logged in.', `Run: supabase login\n(${cliError(list).slice(0, 200)})`);
}
const project = projects.find((p) => p.ref === ref || p.id === ref);
if (!project) {
  die(`this Supabase login cannot see project ${ref}`,
    `The login can see ${projects.length} project(s), none with that id. It is probably the wrong account.\nRun: supabase logout, then supabase login with the account that owns the project (or an organization it was shared with).`);
}
say(`   found "${project.name}"  (${project.ref}, region ${project.region}, status ${project.status})`);
if (project.status !== 'ACTIVE_HEALTHY') {
  die(`the project is ${project.status}`, project.status === 'INACTIVE' ? 'It is paused. Restore it in the dashboard (Project > Restore), wait for it to become healthy, and run this again.' : 'Wait until it shows as healthy in the dashboard, then run this again.');
}
if (ref !== savedRef) {
  if (!dry) writeFileSync(refFile, `${ref}\n`);
  say(`   ${dry ? 'would record' : 'recorded'} this project in deploy/supabase/${envName}/project-ref${dry ? '' : ' (commit that file)'}`);
}
const url = `https://${ref}.supabase.co`;

// ---------------------------------------------------------------------------------------------- the throwaway folder
const settings = readFileSync(join(envDir, 'core.toml'), 'utf8');
let config = `project_id = "brandbid-${envName}"\n\n${settings}`;
mkdirSync(join(work, 'supabase', 'migrations'), { recursive: true });
const migrationsDir = join(root, 'packages', 'db', 'migrations');
const sqlFiles = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
if (sqlFiles.length === 0) die('found no migrations in packages/db/migrations');
for (const f of sqlFiles) copyFileSync(join(migrationsDir, f), join(work, 'supabase', 'migrations', f));
if (flags.has('--templates')) {
  mkdirSync(join(work, 'supabase', 'templates'), { recursive: true });
  copyFileSync(join(root, 'supabase', 'templates', 'magic_link.html'), join(work, 'supabase', 'templates', 'magic_link.html'));
  config += `\n${readFileSync(join(envDir, 'templates.toml'), 'utf8')}`;
}
writeFileSync(join(work, 'supabase', 'config.toml'), config);

step('2. Link');
const link = cli(['link', '--project-ref', ref, '--workdir', work]);
if (link.code !== 0) die(`could not link to the project: ${cliError(link)}`);
say('   linked');

// ---------------------------------------------------------------------------------------------- 3. migrations
if (!flags.has('--skip-db')) {
  step('3. Database migrations');
  const preview = cli(['db', 'push', '--linked', '--dry-run', '--workdir', work]);
  const pj = lastJsonLine(preview.out);
  if (preview.code !== 0 || !pj) die(`could not preview the migrations: ${cliError(preview)}`);
  const pending = pj.migrations ?? [];
  if (pending.length === 0) {
    say(`   up to date (all ${sqlFiles.length} migrations are already applied)`);
  } else {
    say(`   ${pending.length} migration(s) to apply:`);
    for (const m of pending) say(`     - ${m}`);
    if (dry) say('   (dry run: not applied)');
    else if (!(await confirm(`Apply these to ${project.name} (${ref})?`))) die('cancelled, nothing was changed');
    else {
      const push = cli(['db', 'push', '--linked', '--yes', '--workdir', work]);
      for (const line of push.out.split(/\r?\n/)) if (line.startsWith('Applying migration')) say(`   ${line}`);
      const err = cliError(push);
      if (push.code !== 0 || err) {
        die(`a migration failed: ${err}`, 'Each migration runs in its own transaction, so a failed one left nothing half-applied. Fix it, then run this again; the earlier ones are already recorded and will be skipped.');
      }
      say('   applied');
    }
  }
} else say('\n(skipping database migrations)');

// ---------------------------------------------------------------------------------------------- 4. sign-in settings
if (!flags.has('--skip-config')) {
  step(`4. Sign-in settings${flags.has('--templates') ? ' (including the email template)' : ''}`);
  const prev = cli(['config', 'push', '--workdir', work, '--project-ref', ref]); // no terminal: the confirmation prompt is declined, so this only previews
  const changed = prev.out.split(/\r?\n/).some((l) => /\[(update|content|local-only)\]/.test(l));
  const shown = prev.out.split(/\r?\n/).filter((l) => l && !l.startsWith('{') && !/^Do you want|^Pushing config|^Comparison scope|up to date|^Note:/.test(l));
  if (!changed) {
    say('   the project already has these settings');
  } else {
    for (const l of shown) say(`   ${l}`);
    if (dry) say('   (dry run: not applied)');
    else if (!(await confirm('Apply these settings?'))) die('cancelled; the database step (if any) is already done');
    else {
      const push = cli(['config', 'push', '--workdir', work, '--project-ref', ref, '--yes']);
      const err = cliError(push);
      if (push.code !== 0 || err) {
        die(`the settings were not applied: ${err}`,
          /template/i.test(err)
            ? 'Supabase only lets you change email templates after custom SMTP (Resend) is set up on the project. Do that in the dashboard (Authentication > SMTP Settings), then run this again with --templates. Nothing was changed.'
            : 'Nothing was changed (the settings are applied all-or-nothing).');
      }
      say('   applied');
    }
  }
} else say('\n(skipping sign-in settings)');

// ---------------------------------------------------------------------------------------------- 5. verify
let failed = 0;
let anon = '';
if (!flags.has('--skip-verify')) {
  step('5. Security check of the project');
  const keys = cli(['projects', 'api-keys', '--project-ref', ref, '-o', 'json']);
  let kj = jsonOut(keys.out);
  kj = Array.isArray(kj) ? kj : kj?.keys;
  const k = Array.isArray(kj) ? (kj.find((x) => x.name === 'anon' || x.id === 'anon') ?? kj.find((x) => /publishable/i.test(`${x.name} ${x.type ?? ''}`))) : undefined;
  anon = k?.api_key ?? '';
  if (!anon) {
    say('   Could not read the public (anon) key from the CLI. Run the check yourself:');
    say(`   node scripts/verify-supabase.mjs ${url} <anon-key>`);
    failed = 1;
  } else {
    const { verifyProject } = await import(pathToFileURL(join(root, 'scripts', 'verify-supabase.mjs')).href);
    const res = await verifyProject({ url, anon });
    failed = res.fail;
  }
}

// ---------------------------------------------------------------------------------------------- done
step(failed ? 'Finished, but the security check found problems (see FAIL above)' : 'Done');
say(`Project URL (public):  ${url}`);
if (anon) say(`Anon key (public):     ${anon}`);
say('The service role key is NOT shown here. Share it only through a password manager, and only with whoever sets up Cloudflare.');
say('\nStill to do by hand (if not done yet):');
say('  - Authentication > SMTP Settings: your Resend sender (host smtp.resend.com, port 465, user "resend", password = API key)');
say(`  - then: node deploy/supabase/setup.mjs ${envName} --templates --skip-db --skip-verify   (applies the email template)`);
say('  - make the first admin: see DEPLOYMENT.md "Making the first admin"');
say('  - when finished on a shared machine: supabase logout');
process.exit(failed ? 1 : 0);
