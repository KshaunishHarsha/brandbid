export class ActiveTimeQualificationTimer {
  private activeSince: number | null = null;
  private activeMs = 0;
  private interacted = false;
  private finished = false;

  private interactionCount = 0;

  constructor(private readonly onThreshold: (activeMs: number, interactions: number) => void, private readonly thresholdMs = 10_000) {}

  interact(now: number, visible: boolean) {
    this.interacted = true;
    this.interactionCount = Math.min(100, this.interactionCount + 1);
    if (visible) this.resume(now);
    this.check(now);
  }

  visibilityChanged(now: number, visible: boolean) {
    if (!visible) this.pause(now);
    else if (this.interacted) this.resume(now);
    this.check(now);
  }

  tick(now: number) { this.check(now); }

  stop(now: number) { this.pause(now); }

  private resume(now: number) {
    if (!this.finished && this.activeSince === null) this.activeSince = now;
  }

  private pause(now: number) {
    if (this.activeSince === null) return;
    this.activeMs += Math.max(0, now - this.activeSince);
    this.activeSince = null;
  }

  private check(now: number) {
    if (this.finished || !this.interacted) return;
    const total = this.activeMs + (this.activeSince === null ? 0 : Math.max(0, now - this.activeSince));
    if (total < this.thresholdMs) return;
    this.pause(now);
    this.finished = true;
    this.onThreshold(Math.max(this.thresholdMs, Math.round(total)), this.interactionCount);
  }
}
