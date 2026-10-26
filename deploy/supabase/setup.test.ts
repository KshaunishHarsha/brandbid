import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Drives deploy/supabase/setup.mjs against a fake Supabase CLI, inside a throwaway copy of the repo layout, so no real
// project (and nothing in this repo) is ever touched.
const repo = resolve(__dirname, '../..');
const REF = 'abcdefghijklmnopqrst';
const OTHER = 'zyxwvutsrqponmlkjihg';
const OK = [{ ref: REF, id: REF, name: 'brandbid-staging', region: 'ap-south-1', status: 'ACTIVE_HEALTHY' }];

let tmp: string;
let logFile: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'setup-test-'));
  logFile = join(tmp, 'calls.jsonl');
  writeFileSync(logFile, '');
  mkdirSync(join(tmp, 'deploy/supabase/staging'), { recursive: true });
  cpSync(join(repo, 'deploy/supabase/setup.mjs'), join(tmp, 'deploy/supabase/setup.mjs'));
  cpSync(join(repo, 'deploy/supabase/staging/core.toml'), join(tmp, 'deploy/supabase/staging/core.toml'));
  cpSync(join(repo, 'deploy/supabase/staging/templates.toml'), join(tmp, 'deploy/supabase/staging/templates.toml'));
  writeFileSync(join(tmp, 'deploy/supabase/staging/project-ref'), `${REF}\n`);
  mkdirSync(join(tmp, 'packages/db/migrations'), { recursive: true });
  writeFileSync(join(tmp, 'packages/db/migrations/001_a.sql'), 'select 1;');
  writeFileSync(join(tmp, 'packages/db/migrations/002_b.sql'), 'select 2;');
  mkdirSync(join(tmp, 'supabase/templates'), { recursive: true });
  writeFileSync(join(tmp, 'supabase/templates/magic_link.html'), '<p>hi</p>');
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

function run(args: string[], env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [join(tmp, 'deploy/supabase/setup.mjs'), ...args], {
    cwd: tmp,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', SUPABASE_CLI: join(repo, 'deploy/supabase/test/fake-supabase.mjs'), FAKE_LOG: logFile, FAKE_PROJECTS: JSON.stringify(OK), ...env },
  });
  const calls = readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { args: string[]; migrations: string[]; config: string; hasTemplate: boolean });
  return { code: r.status, out: r.stdout + r.stderr, calls, cmds: calls.map((c) => c.args.slice(0, 3).join(' ')) };
}
const applied = (cmds: string[]) => cmds.filter((c) => /^db push --linked$/.test(c) || false);

describe('input checks (nothing is called)', () => {
  it('shows usage with no arguments', () => {
    const r = run([]);
    expect(r.code).toBe(2);
    expect(r.out).toContain('Usage:');
    expect(r.calls).toHaveLength(0);
  });
  it('refuses an unknown environment and lists the known ones', () => {
    const r = run(['qa']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('no settings folder for "qa"');
    expect(r.out).toContain('staging');
    expect(r.calls).toHaveLength(0);
  });
  it.each(['not-a-ref', 'ABCDEFGHIJKLMNOPQRST', 'abc', 'abcdefghijklmnopqrstu'])('refuses the malformed project ref %s', (ref) => {
    const r = run(['staging', ref]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('is not a project ref');
    expect(r.calls).toHaveLength(0);
  });
  it('refuses an unknown option', () => {
    const r = run(['staging', '--frobnicate']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('unknown option --frobnicate');
  });
});

describe('finding the project', () => {
  it('tells you to log in when the CLI is not logged in', () => {
    const r = run(['staging', '--yes'], { FAKE_NOT_LOGGED_IN: '1' });
    expect(r.code).toBe(1);
    expect(r.out).toContain('supabase login');
    expect(r.cmds).toEqual(['projects list -o']);
  });
  it('explains a wrong account without naming the account\'s other projects', () => {
    const r = run(['staging', '--yes'], { FAKE_PROJECTS: JSON.stringify([{ ref: OTHER, name: 'SECRET-OTHER-PROJECT', status: 'ACTIVE_HEALTHY' }]) });
    expect(r.code).toBe(1);
    expect(r.out).toContain('cannot see project');
    expect(r.out).toContain('supabase logout');
    expect(r.out).not.toContain('SECRET-OTHER-PROJECT');
    expect(r.cmds).toEqual(['projects list -o']);
  });
  it('stops on a paused project and says how to restore it, before changing anything', () => {
    const r = run(['staging', '--yes'], { FAKE_PROJECTS: JSON.stringify([{ ...OK[0], status: 'INACTIVE' }]) });
    expect(r.code).toBe(1);
    expect(r.out).toContain('INACTIVE');
    expect(r.out).toContain('Restore');
    expect(r.cmds).toEqual(['projects list -o']);
  });
});

describe('the full run', () => {
  const full = ['staging', '--yes', '--skip-verify'];

  it('links, applies the migrations, then the settings, in that order', () => {
    const r = run(full);
    expect(r.code).toBe(0);
    expect(r.cmds).toEqual(['projects list -o', 'link --project-ref abcdefghijklmnopqrst', 'db push --linked', 'db push --linked', 'config push --workdir', 'config push --workdir']);
    expect(r.calls[2]!.args).toContain('--dry-run');
    expect(r.calls[3]!.args).toContain('--yes');
    expect(r.calls[5]!.args).toContain('--yes');
    expect(r.out).toContain('Applying migration 001_a.sql');
    expect(r.out).toContain('Done');
  });
  it('works from a throwaway folder holding copies of the migrations and ONLY the declared settings', () => {
    const push = run(full).calls[3]!;
    expect(push.migrations).toEqual(['001_a.sql', '002_b.sql']);
    expect(push.config).toContain('site_url = "https://staging.brandbid.wtf"');
    expect(push.config).toContain('enable_confirmations = true');
    expect(push.config).not.toContain('email_sent');
    expect(push.config).not.toContain('template');
    expect(push.hasTemplate).toBe(false);
  });
  it('--templates adds the email template and its file', () => {
    const calls = run([...full, '--templates']).calls;
    const cfg = calls[calls.length - 1]!;
    expect(cfg.config).toContain('auth.email.template.magic_link');
    expect(cfg.hasTemplate).toBe(true);
  });
  it('never touches the repo: no project-ref change when the ref is the same', () => {
    run(full);
    expect(readFileSync(join(tmp, 'deploy/supabase/staging/project-ref'), 'utf8').trim()).toBe(REF);
  });
  it('records a new project ref when one is given, and says to commit it', () => {
    const r = run(['staging', OTHER, '--yes', '--skip-verify'], { FAKE_PROJECTS: JSON.stringify([{ ...OK[0], ref: OTHER, id: OTHER }]) });
    expect(r.code).toBe(0);
    expect(readFileSync(join(tmp, 'deploy/supabase/staging/project-ref'), 'utf8').trim()).toBe(OTHER);
    expect(r.out).toContain('commit that file');
  });
  it('--dry-run applies nothing and writes nothing', () => {
    const r = run(['staging', OTHER, '--dry-run', '--skip-verify'], { FAKE_PROJECTS: JSON.stringify([{ ...OK[0], ref: OTHER, id: OTHER }]) });
    expect(r.code).toBe(0);
    expect(r.calls.some((c) => c.args.includes('--yes'))).toBe(false);
    expect(r.out).toContain('dry run: not applied');
    expect(readFileSync(join(tmp, 'deploy/supabase/staging/project-ref'), 'utf8').trim()).toBe(REF);
  });
  it('does nothing when everything is already up to date', () => {
    const r = run(full, { FAKE_APPLIED: 'all', FAKE_CONFIG_UPTODATE: '1' });
    expect(r.code).toBe(0);
    expect(r.calls.some((c) => c.args.includes('--yes'))).toBe(false);
    expect(r.out).toContain('up to date');
    expect(r.out).toContain('already has these settings');
  });
  it('--skip-db and --skip-config skip those steps', () => {
    const r = run([...full, '--skip-db', '--skip-config']);
    expect(r.cmds).toEqual(['projects list -o', 'link --project-ref abcdefghijklmnopqrst']);
  });
});

describe('safety gates', () => {
  it('refuses to apply without --yes when there is no terminal, and applies nothing', () => {
    const r = run(['staging', '--skip-verify']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('needs a person to confirm');
    expect(r.calls.some((c) => c.args.includes('--yes'))).toBe(false);
  });
});

describe('failures', () => {
  it('stops at a failing migration, shows the real error, and does not go on to the settings', () => {
    const r = run(['staging', '--yes', '--skip-verify'], { FAKE_FAIL_AT: '002_b.sql' });
    expect(r.code).toBe(1);
    expect(r.out).toContain('type citext does not exist');
    expect(r.out).toContain('nothing half-applied');
    expect(r.cmds.filter((c) => c.startsWith('config'))).toHaveLength(0);
  });
  it('explains the email-template refusal and that nothing was changed', () => {
    const r = run(['staging', '--yes', '--skip-verify', '--templates'], { FAKE_CONFIG_FAIL: 'Email template modification is not available for free tier projects using the default SMTP' });
    expect(r.code).toBe(1);
    expect(r.out).toContain('SMTP');
    expect(r.out).toContain('Nothing was changed');
  });
  it('reports a link failure', () => {
    const r = run(['staging', '--yes', '--skip-verify'], { FAKE_LINK_FAIL: '1' });
    expect(r.code).toBe(1);
    expect(r.out).toContain('could not link');
    expect(r.cmds.some((c) => c.startsWith('db push'))).toBe(false);
  });
});

describe('secrets', () => {
  it('never asks for secret keys: no --reveal, and the keys are not even requested when verification is skipped', () => {
    const r = run(['staging', '--yes', '--skip-verify']);
    expect(r.calls.some((c) => c.args.includes('--reveal'))).toBe(false);
    expect(r.calls.some((c) => c.args.includes('api-keys'))).toBe(false);
    expect(r.out).not.toContain('must-never-be-read');
  });
  it('cleans up its temporary folder', () => {
    const before = existsSync(tmp);
    run(['staging', '--yes', '--skip-verify']);
    expect(before).toBe(true);
    expect(existsSync(join(tmp, 'deploy/supabase/staging/supabase'))).toBe(false); // nothing was left inside the repo layout
  });
});
