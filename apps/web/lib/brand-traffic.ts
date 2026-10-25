import type { Json } from '@brandbid/db';
import { createClient } from '@/lib/supabase/server';

export type TrafficMeasures = { clicks: number; qualifiedVisitors: number; clickThroughs: number };
export type DailyTraffic = TrafficMeasures & { day: string };
export type TrafficBreakdown = TrafficMeasures & { channel: string };
export type CountryTraffic = TrafficMeasures & { country: string };
export type BrandTrafficStats = { daily: DailyTraffic[]; channels: TrafficBreakdown[]; countries: CountryTraffic[] };

type JsonObject = { [key: string]: Json | undefined };
const object = (value: Json | undefined): JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
const count = (value: Json | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
};
const label = (value: Json | undefined) => typeof value === 'string' ? value : '';

/** Call only after getMemberBrand succeeds; the SQL function checks membership again. */
export async function getBrandTrafficStats(brandId: string): Promise<BrandTrafficStats> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('brand_traffic_stats', { p_brand_id: brandId });
  if (error) throw new Error(`Could not load brand traffic: ${error.message}`);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Brand traffic returned invalid data');
  const root = object(data);
  const daily = Array.isArray(root.daily) ? root.daily.map((item) => {
    const row = object(item);
    return { day: label(row.day), clicks: count(row.clicks), qualifiedVisitors: count(row.qualified_visitors), clickThroughs: count(row.click_throughs) };
  }) : [];
  const channels = Array.isArray(root.channels) ? root.channels.map((item) => {
    const row = object(item);
    return { channel: label(row.channel), clicks: count(row.clicks), qualifiedVisitors: count(row.qualified_visitors), clickThroughs: count(row.click_throughs) };
  }) : [];
  const countries = Array.isArray(root.countries) ? root.countries.map((item) => {
    const row = object(item);
    return { country: label(row.country), clicks: count(row.clicks), qualifiedVisitors: count(row.qualified_visitors), clickThroughs: count(row.click_throughs) };
  }) : [];
  return { daily, channels, countries };
}
