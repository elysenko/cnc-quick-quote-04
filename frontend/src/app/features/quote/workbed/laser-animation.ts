/** One straight cut move, in screen pixels, with its own length pre-computed. */
export interface CutSegment { x1: number; y1: number; x2: number; y2: number; length: number; }

export function segmentsFrom(polylines: number[][]): CutSegment[] {
  const segments: CutSegment[] = [];
  for (const path of polylines) {
    for (let i = 2; i < path.length; i += 2) {
      const x1 = path[i - 2];
      const y1 = path[i - 1];
      const x2 = path[i];
      const y2 = path[i + 1];
      const length = Math.hypot(x2 - x1, y2 - y1);
      if (length > 0.01) segments.push({ x1, y1, x2, y2, length });
    }
  }
  return segments;
}

export function totalLength(segments: CutSegment[]): number {
  return segments.reduce((sum, s) => sum + s.length, 0);
}

/** Position of the head at `distance` along the concatenated cut path. */
export function pointAt(segments: CutSegment[], distance: number): { x: number; y: number } | null {
  let walked = 0;
  for (const s of segments) {
    if (walked + s.length >= distance) {
      const t = s.length === 0 ? 0 : (distance - walked) / s.length;
      return { x: s.x1 + (s.x2 - s.x1) * t, y: s.y1 + (s.y2 - s.y1) * t };
    }
    walked += s.length;
  }
  const last = segments[segments.length - 1];
  return last ? { x: last.x2, y: last.y2 } : null;
}

/**
 * requestAnimationFrame driver for the laser head. The consumer redraws only the
 * newly-completed span each frame — the finished cuts accumulate on their own
 * layer — so per-frame work stays flat regardless of how large the nest is.
 */
export class LaserAnimation {
  private frameId = 0;
  private lastTs = 0;
  private _distance = 0;
  private _running = false;

  /** @param onFrame receives (previousDistance, currentDistance). */
  constructor(
    private readonly onFrame: (from: number, to: number) => void,
    private readonly onStateChange: () => void = () => undefined,
  ) {}

  get running(): boolean { return this._running; }
  get distance(): number { return this._distance; }

  /** Pixels per second the head travels. */
  speed = 260;
  total = 0;

  start(): void {
    if (this._running || this.total <= 0) return;
    this._running = true;
    this.lastTs = 0;
    this.onStateChange();
    this.frameId = requestAnimationFrame(this.tick);
  }

  private readonly tick = (ts: number): void => {
    if (!this._running) return;
    if (this.lastTs === 0) this.lastTs = ts;
    // Clamp the delta so a backgrounded tab does not jump the head across the sheet.
    const dt = Math.min((ts - this.lastTs) / 1000, 0.05);
    this.lastTs = ts;

    const from = this._distance;
    let to = from + this.speed * dt;
    if (to >= this.total) {
      to = this.total;
      this._distance = 0;
      this.onFrame(from, to);
      this.lastTs = 0;
      this.frameId = requestAnimationFrame(this.restartPass);
      return;
    }
    this._distance = to;
    this.onFrame(from, to);
    this.frameId = requestAnimationFrame(this.tick);
  };

  /** Loops the pass so the bed keeps demonstrating the cut. */
  private readonly restartPass = (ts: number): void => {
    if (!this._running) return;
    this.onFrame(0, 0);
    this.lastTs = ts;
    this.frameId = requestAnimationFrame(this.tick);
  };

  /** Stops the head and rewinds it to the start of the path. */
  stopAndReset(): void {
    this._running = false;
    cancelAnimationFrame(this.frameId);
    this._distance = 0;
    this.lastTs = 0;
    this.onFrame(0, 0);
    this.onStateChange();
  }

  toggle(): void {
    if (this._running) this.stopAndReset();
    else this.start();
  }

  destroy(): void {
    this._running = false;
    cancelAnimationFrame(this.frameId);
  }
}
