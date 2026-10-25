/** Tracks real worker handlers, not scheduled placeholder queues. */
export function createJobHeartbeat(
  report: (kind: 'checkin' | 'stalled') => void,
  now: () => number = Date.now,
) {
  const tenMinutes = 10 * 60_000;
  let lastRun = now();
  let lastCheckinMinute = -1;
  let alerted = false;

  return {
    jobRan() {
      lastRun = now();
      alerted = false;
      const minute = Math.floor(lastRun / 60_000);
      if (minute !== lastCheckinMinute) {
        lastCheckinMinute = minute;
        report('checkin');
      }
    },
    check() {
      if (!alerted && now() - lastRun >= tenMinutes) {
        alerted = true;
        report('stalled');
      }
    },
  };
}
