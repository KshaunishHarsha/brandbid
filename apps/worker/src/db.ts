import pg from 'pg';
import { env } from './env.js';

// Direct Postgres connection (the worker is trusted: it runs as the database owner, like migrations do).
export function createPool(): pg.Pool {
  return new pg.Pool({ connectionString: env.databaseUrl, max: 5 });
}
export type Pool = pg.Pool;
