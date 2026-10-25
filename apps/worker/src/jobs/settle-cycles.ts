import type { JobContext } from '../context.js';

export type SettlementResult = { available: number; flagged: number; expired: number };

export async function runSettleCycles(ctx: Pick<JobContext, 'pool'>): Promise<SettlementResult> {
  const { rows } = await ctx.pool.query<{ settle_due_earnings: SettlementResult }>(
    'select public.settle_due_earnings() as settle_due_earnings',
  );
  return rows[0]?.settle_due_earnings ?? { available: 0, flagged: 0, expired: 0 };
}
