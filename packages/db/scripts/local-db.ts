import { Client } from 'pg';

export const DEFAULT_LOCAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export function databaseUrl() {
  return process.env.DATABASE_URL ?? DEFAULT_LOCAL_DATABASE_URL;
}

export function assertLocalDatabaseUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('DATABASE_URL must be a valid PostgreSQL URL'); }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error('Seed scripts only connect to a local database. DATABASE_URL must use localhost, 127.0.0.1 or ::1.');
  }
}

export async function connectLocalDatabase(value = databaseUrl()) {
  assertLocalDatabaseUrl(value);
  const client = new Client({ connectionString: value });
  await client.connect();
  return client;
}
