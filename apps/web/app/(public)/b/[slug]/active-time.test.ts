import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActiveTimeQualificationTimer } from './active-time';

describe('ActiveTimeQualificationTimer', () => {
  afterEach(() => vi.useRealTimers());

  it('does not count an idle page and qualifies once after 10 active seconds', () => {
    vi.useFakeTimers();
    const qualified = vi.fn();
    const timer = new ActiveTimeQualificationTimer(qualified);
    vi.advanceTimersByTime(20_000);
    timer.tick(Date.now());
    expect(qualified).not.toHaveBeenCalled();

    timer.interact(Date.now(), true);
    vi.advanceTimersByTime(9_900);
    timer.tick(Date.now());
    expect(qualified).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    timer.tick(Date.now());
    timer.tick(Date.now() + 10_000);
    expect(qualified).toHaveBeenCalledTimes(1);
  });

  it('pauses while hidden and resumes after the tab becomes visible', () => {
    vi.useFakeTimers();
    const qualified = vi.fn();
    const timer = new ActiveTimeQualificationTimer(qualified);
    timer.interact(Date.now(), true);
    vi.advanceTimersByTime(5_000);
    timer.visibilityChanged(Date.now(), false);
    vi.advanceTimersByTime(30_000);
    timer.tick(Date.now());
    expect(qualified).not.toHaveBeenCalled();

    timer.visibilityChanged(Date.now(), true);
    vi.advanceTimersByTime(4_999);
    timer.tick(Date.now());
    expect(qualified).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    timer.tick(Date.now());
    expect(qualified).toHaveBeenCalledTimes(1);
  });
});
