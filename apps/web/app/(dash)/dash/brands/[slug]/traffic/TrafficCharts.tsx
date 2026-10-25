'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CountryTraffic, DailyTraffic, TrafficBreakdown, TrafficMeasures } from '@/lib/brand-traffic';

const SERIES = [
  { key: 'clicks', label: 'Clicks', color: 'var(--accent)' },
  { key: 'qualifiedVisitors', label: 'Qualified visitors', color: 'var(--positive)' },
  { key: 'clickThroughs', label: 'Click-throughs', color: 'var(--gold)' },
] as const;
const CHANNEL_LABELS: Record<string, string> = { story: 'Instagram story', linkedin: 'LinkedIn', x: 'X', link: 'Direct link' };

export function TrafficCharts({ daily, channels, countries }: { daily: DailyTraffic[]; channels: TrafficBreakdown[]; countries: CountryTraffic[] }) {
  const topCountries = useMemo(() => {
    const top = countries.slice(0, 8);
    const rest = countries.slice(8);
    if (rest.length === 0) return top;
    return [...top, {
      country: 'Other countries',
      clicks: rest.reduce((sum, row) => sum + row.clicks, 0),
      qualifiedVisitors: rest.reduce((sum, row) => sum + row.qualifiedVisitors, 0),
      clickThroughs: rest.reduce((sum, row) => sum + row.clickThroughs, 0),
    }];
  }, [countries]);

  return (
    <div className="mt-8 space-y-10">
      <section aria-labelledby="daily-title">
        <h2 id="daily-title" className="text-lg font-semibold">Daily traffic</h2>
        <p className="mb-2 text-xs text-muted">Events per day. Clicks exclude ignored traffic.</p>
        <DailyChart data={daily} />
      </section>
      <section aria-labelledby="channels-title">
        <h2 id="channels-title" className="text-lg font-semibold">By channel</h2>
        <Breakdown rows={channels.map((row) => ({ ...row, name: CHANNEL_LABELS[row.channel] ?? row.channel }))} />
      </section>
      <section aria-labelledby="countries-title">
        <h2 id="countries-title" className="text-lg font-semibold">By country</h2>
        <p className="mb-2 text-xs text-muted">Top countries by clicks; the rest are combined.</p>
        <Breakdown rows={topCountries.map((row) => ({ ...row, name: row.country }))} />
      </section>
    </div>
  );
}

function DailyChart({ data }: { data: DailyTraffic[] }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(320, Math.floor(entry.contentRect.width)));
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  const height = 260;
  const margin = { top: 14, right: 14, bottom: 42, left: 46 };
  const plotWidth = Math.max(1, width - margin.left - margin.right);
  const plotHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(1, ...data.flatMap((row) => SERIES.map((series) => row[series.key])));
  const maxY = Math.max(1, Math.ceil(maxValue / 5) * 5);
  const x = (index: number) => margin.left + (data.length <= 1 ? plotWidth / 2 : (index / (data.length - 1)) * plotWidth);
  const y = (value: number) => margin.top + plotHeight - (value / maxY) * plotHeight;
  const ticks = [...new Set([0, Math.ceil(maxY / 2), maxY])];
  const xIndices = [...new Set([0, 7, 14, 21, Math.max(0, data.length - 1)])].filter((index) => index < data.length);
  const dateLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const path = (key: typeof SERIES[number]['key']) => data.map((row, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(row[key])}`).join(' ');

  return (
    <div ref={container} className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="img" aria-labelledby="daily-chart-label daily-chart-description">
        <title id="daily-chart-label">Daily clicks, qualified visitors and click-throughs</title>
        <desc id="daily-chart-description">Line chart for the last 30 days in UTC. Clicks exclude ignored traffic. Use the labeled table below for exact counts.</desc>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} stroke="var(--line)" strokeWidth="1" />
            <text x={margin.left - 8} y={y(tick) + 4} textAnchor="end" fill="var(--muted)" fontSize="11">{tick.toLocaleString()}</text>
          </g>
        ))}
        {xIndices.map((index) => (
          <text key={index} x={x(index)} y={height - 20} textAnchor={index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle'} fill="var(--muted)" fontSize="11">{dateLabel(data[index]!.day)}</text>
        ))}
        {SERIES.map((series) => (
          <path key={series.key} d={path(series.key)} fill="none" stroke={series.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
            <title>{series.label}</title>
          </path>
        ))}
        <text x={margin.left + plotWidth / 2} y={height - 3} textAnchor="middle" fill="var(--muted)" fontSize="11">Day (UTC)</text>
        <text transform={`translate(12 ${margin.top + plotHeight / 2}) rotate(-90)`} textAnchor="middle" fill="var(--muted)" fontSize="11">Events</text>
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs">
        {SERIES.map((series) => <span key={series.key} className="inline-flex items-center gap-2"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: series.color }} />{series.label}</span>)}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer underline">Show daily counts</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead><tr className="text-muted"><th className="py-1 pr-3">Day (UTC)</th><th className="py-1 pr-3">Clicks</th><th className="py-1 pr-3">Qualified</th><th className="py-1">Click-throughs</th></tr></thead>
            <tbody>{data.map((row) => <tr key={row.day} className="border-t border-line"><td className="py-1 pr-3">{dateLabel(row.day)}</td><td className="num py-1 pr-3">{row.clicks}</td><td className="num py-1 pr-3">{row.qualifiedVisitors}</td><td className="num py-1">{row.clickThroughs}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function Breakdown({ rows }: { rows: (TrafficMeasures & { name: string })[] }) {
  const maxValue = Math.max(1, ...rows.flatMap((row) => SERIES.map((series) => row[series.key])));
  if (rows.length === 0) return <p className="mt-2 text-sm text-muted">No traffic in the last 30 days.</p>;
  return (
    <div className="mt-3 space-y-4">
      {rows.map((row) => (
        <div key={row.name} className="grid grid-cols-[minmax(6rem,9rem)_1fr] gap-x-4 gap-y-2 sm:grid-cols-[minmax(8rem,12rem)_1fr]">
          <strong className="row-span-3 self-center truncate text-sm" title={row.name}>{row.name}</strong>
          {SERIES.map((series) => {
            const value = row[series.key];
            return (
              <div key={series.key} className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-2 text-xs">
                <span className="text-muted">{series.label}</span>
                <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full" style={{ width: `${(value / maxValue) * 100}%`, backgroundColor: series.color }} /></span>
                <span className="num text-right">{value.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
