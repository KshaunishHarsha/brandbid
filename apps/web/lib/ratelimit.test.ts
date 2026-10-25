import { describe, expect, it } from 'vitest';
import { memoryLimiter } from './ratelimit';

describe('memoryLimiter', () => {
  it('allows up to max then blocks, per key', async () => {
    const l = memoryLimiter(3, 1000, () => 0);
    for (let i = 0; i < 3; i++) expect((await l.limit('a')).success).toBe(true);
    expect((await l.limit('a')).success).toBe(false);
    expect((await l.limit('b')).success).toBe(true);
  });
  it('resets after the window', async () => {
    let t = 0;
    const l = memoryLimiter(1, 1000, () => t);
    expect((await l.limit('a')).success).toBe(true);
    expect((await l.limit('a')).success).toBe(false);
    t = 1001;
    expect((await l.limit('a')).success).toBe(true);
  });
});
