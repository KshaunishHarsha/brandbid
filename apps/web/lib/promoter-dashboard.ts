import type { Json } from '@brandbid/db';
import { createAdminClient } from '@/lib/supabase/admin';

export type PromoterWaitlistedEarning = { amountCents: number; createdAt: string; expiresAt: string };
export type PromoterLinkStats = {
  linkId: string; linkCode: string; linkStatus: string; channel: string; linkCreatedAt: string;
  brandId: string; brandName: string; brandSlug: string; brandStatus: string; adsEnabled: boolean;
  brandBudgetCents: number; brandRateCents: number; clicks: number; qualifiedVisitors: number;
  pendingCents: number; pendingCount: number; nextSettlementAt: string | null; waitlistedCents: number;
  waitlistedEarnings: PromoterWaitlistedEarning[]; currentCycleEndsAt: string;
};
export type PromoterDashboardData = {
  totals: {
    pendingCents: number; waitlistedCents: number; balanceCents: number; minWithdrawalCents: number;
    phoneVerified: boolean; kycStatus: string; payoutAccountVerified: boolean; withdrawalOpen: boolean; accountActive: boolean;
  };
  withdrawals: Array<{ id: string; amountCents: number; feeCents: number | null; provider: string; status: string; createdAt: string; paidAt: string | null }>;
  links: PromoterLinkStats[];
};

type JsonObject = { [key: string]: Json | undefined };
const object = (value: Json | undefined): JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
const number = (value: Json | undefined, fallback = 0) => {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
};
const signedNumber = (value: Json | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) ? parsed : 0;
};
const string = (value: Json | undefined) => typeof value === 'string' ? value : '';
const nullableString = (value: Json | undefined) => typeof value === 'string' ? value : null;

/** Call only after the page has authenticated the promoter; the SQL function is service-role-only. */
export async function getPromoterDashboard(promoterId: string): Promise<PromoterDashboardData> {
  const { data, error } = await createAdminClient().rpc('promoter_dashboard', { p_promoter_id: promoterId });
  if (error) throw new Error(`Could not load promoter dashboard: ${error.message}`);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Promoter dashboard returned invalid data');
  const root = object(data);
  const totals = object(root.totals);
  const wallet = object(root.wallet);
  const withdrawals = Array.isArray(wallet.withdrawals) ? wallet.withdrawals.map((raw) => {
    const row = object(raw);
    return {
      id: string(row.id), amountCents: number(row.amount_cents), feeCents: row.fee_cents == null ? null : number(row.fee_cents),
      provider: string(row.provider), status: string(row.status), createdAt: string(row.created_at), paidAt: nullableString(row.paid_at),
    };
  }) : [];
  const links = Array.isArray(root.links) ? root.links.map((raw): PromoterLinkStats => {
    const row = object(raw);
    const waitlistedEarnings = Array.isArray(row.waitlisted_earnings)
      ? row.waitlisted_earnings.map((entry) => {
        const earning = object(entry);
        return { amountCents: number(earning.amount_cents), createdAt: string(earning.created_at), expiresAt: string(earning.expires_at) };
      })
      : [];
    return {
      linkId: string(row.link_id), linkCode: string(row.link_code), linkStatus: string(row.link_status), channel: string(row.channel), linkCreatedAt: string(row.link_created_at),
      brandId: string(row.brand_id), brandName: string(row.brand_name), brandSlug: string(row.brand_slug), brandStatus: string(row.brand_status), adsEnabled: row.ads_enabled === true,
      brandBudgetCents: number(row.brand_budget_cents), brandRateCents: number(row.brand_rate_cents), clicks: number(row.clicks), qualifiedVisitors: number(row.qualified_visitors),
      pendingCents: number(row.pending_cents), pendingCount: number(row.pending_count), nextSettlementAt: nullableString(row.next_settlement_at), waitlistedCents: number(row.waitlisted_cents),
      waitlistedEarnings, currentCycleEndsAt: string(row.current_cycle_ends_at),
    };
  }) : [];
  return {
    totals: {
      pendingCents: number(totals.pending_cents), waitlistedCents: number(totals.waitlisted_cents),
      balanceCents: signedNumber(wallet.balance_cents), minWithdrawalCents: number(wallet.min_withdrawal_cents, 1000),
      phoneVerified: wallet.phone_verified === true, kycStatus: string(wallet.kyc_status),
      payoutAccountVerified: wallet.payout_account_verified === true, withdrawalOpen: wallet.withdrawal_open === true,
      accountActive: wallet.account_active === true,
    },
    withdrawals,
    links,
  };
}
