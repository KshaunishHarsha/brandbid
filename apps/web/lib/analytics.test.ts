import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const posthogMock = vi.hoisted(() => ({
  init: vi.fn(),
  optIn: vi.fn(),
  optOut: vi.fn(),
  capture: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('posthog-js', () => ({
  default: {
    init: posthogMock.init,
    opt_in_capturing: posthogMock.optIn,
    opt_out_capturing: posthogMock.optOut,
    capture: posthogMock.capture,
    identify: posthogMock.identify,
    reset: posthogMock.reset,
  },
}));

function installStorage(initial: Record<string, string> = {}, blocked = false) {
  const values = new Map(Object.entries(initial));
  const fail = () => {
    if (blocked) throw new Error('storage blocked');
  };
  const localStorage = {
    getItem: vi.fn((key: string) => { fail(); return values.get(key) ?? null; }),
    setItem: vi.fn((key: string, value: string) => { fail(); values.set(key, value); }),
    removeItem: vi.fn((key: string) => { fail(); values.delete(key); }),
  };
  vi.stubGlobal('window', {
    location: { hostname: 'brandbid.test' },
    localStorage,
    dispatchEvent: vi.fn(),
  });
  return { values, localStorage };
}

async function loadAnalytics(configured = false) {
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', configured ? 'test-project-key' : '');
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', configured ? 'https://posthog.test' : '');
  vi.stubEnv('NODE_ENV', 'development');
  vi.resetModules();
  return import('./analytics');
}

describe('analytics consent and optional configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installStorage();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps analytics disabled without credentials and does not block the app', async () => {
    const analytics = await loadAnalytics();

    expect(() => analytics.initAnalytics()).not.toThrow();
    analytics.captureListingEvent('list_started');

    expect(posthogMock.init).not.toHaveBeenCalled();
    expect(posthogMock.capture).not.toHaveBeenCalled();
  });

  it('opts out by default and only captures after stored consent', async () => {
    const { values } = installStorage();
    const analytics = await loadAnalytics(true);

    analytics.initAnalytics();
    expect(posthogMock.init).toHaveBeenCalledWith('test-project-key', expect.objectContaining({
      autocapture: false,
      disable_session_recording: true,
      opt_out_capturing_by_default: true,
      opt_out_persistence_by_default: true,
    }));
    expect(posthogMock.optOut).toHaveBeenCalledOnce();
    analytics.captureListingEvent('list_started');
    expect(posthogMock.capture).not.toHaveBeenCalled();

    analytics.setAnalyticsConsent(true);
    expect(values.get(analytics.ANALYTICS_CONSENT_KEY)).toBe('yes');
    expect(posthogMock.optIn).toHaveBeenCalledOnce();
    expect(posthogMock.capture).toHaveBeenCalledWith('$pageview');

    analytics.captureListingEvent('list_started');
    expect(posthogMock.capture).toHaveBeenLastCalledWith('list_started', undefined);
  });

  it('uses a pseudonymous account ID without sending the account email', async () => {
    const { values } = installStorage({ bb_analytics_consent: 'yes' });
    const analytics = await loadAnalytics(true);

    analytics.initAnalytics();
    analytics.identifyAnalyticsUser('user-1');

    expect(posthogMock.identify).toHaveBeenCalledWith('user-1');
    expect(values.get('bb_analytics_user_id')).toBe('user-1');
  });

  it('treats blocked browser storage as no consent without breaking interactions', async () => {
    const { localStorage } = installStorage({}, true);
    const analytics = await loadAnalytics(true);

    expect(() => analytics.initAnalytics()).not.toThrow();
    expect(() => analytics.setAnalyticsConsent(true)).not.toThrow();
    expect(() => analytics.captureListingEvent('list_started')).not.toThrow();
    expect(() => analytics.identifyAnalyticsUser('user-1')).not.toThrow();
    expect(() => analytics.resetAnalyticsUser()).not.toThrow();
    expect(() => analytics.clearAnalyticsConsent()).not.toThrow();

    expect(posthogMock.optIn).not.toHaveBeenCalled();
    expect(posthogMock.capture).not.toHaveBeenCalled();
    expect(localStorage.setItem).toHaveBeenCalledOnce();
  });
});
