import { describe, expect, it } from 'vitest';
import { createJobHeartbeat } from './heartbeat.js';

describe('job heartbeat', () => {
  it('checks in once per minute and alerts once after ten minutes without a real job', () => {
    let time = 0;
    const reports: string[] = [];
    const heartbeat = createJobHeartbeat(
      (kind) => reports.push(kind),
      () => time,
    );
    heartbeat.jobRan();
    time = 30_000;
    heartbeat.jobRan();
    time = 9 * 60_000 + 30_000;
    heartbeat.check();
    expect(reports).toEqual(['checkin']);
    time = 10 * 60_000 + 30_000;
    heartbeat.check();
    heartbeat.check();
    expect(reports).toEqual(['checkin', 'stalled']);
    heartbeat.jobRan();
    expect(reports).toEqual(['checkin', 'stalled', 'checkin']);
    time += 10 * 60_000;
    heartbeat.check();
    expect(reports.at(-1)).toBe('stalled');
  });
});
