// Ghost laps for Time Trial: the player's best lap on each track, recorded as positions and
// headings 30 times a second, saved in the browser, and replayed as a see-through car.

const KEY = 'the-apex-ghosts';
export const GHOST_RATE = 30;   // frames per second

/** One recorded lap. frames is flat [x, y, heading, x, y, heading, ...] from the lap's start. */
export interface GhostLap { time: number; livery: number; skin?: string; frames: number[] }

function loadAll(): Record<string, GhostLap> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { return {}; }
}

export function loadGhost(track: string): GhostLap | null {
  const g = loadAll()[track];
  return g && Array.isArray(g.frames) && g.frames.length >= 6 ? g : null;
}

export function saveGhost(track: string, g: GhostLap): void {
  const all = loadAll();
  all[track] = g;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage full: keep it for this session only */ }
}

/** Records the lap in progress: call reset() as a lap starts and step() every physics step. */
export class GhostRecorder {
  private frames: number[] = [];
  private steps = 0;
  reset(): void { this.frames = []; this.steps = 0; }
  /** stepRate = physics steps per second (60); keeps every (stepRate / GHOST_RATE)th step. */
  step(x: number, y: number, heading: number, stepRate: number): void {
    if (this.steps++ % Math.round(stepRate / GHOST_RATE) === 0) {
      this.frames.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(heading * 1000) / 1000);
    }
  }
  take(): number[] { const f = this.frames; this.reset(); return f; }
}

/** Where the ghost is t seconds into its lap (null once the lap is over). */
export function ghostPose(g: GhostLap, t: number): { x: number; y: number; heading: number; vx: number; vy: number } | null {
  const n = g.frames.length / 3;
  const f = t * GHOST_RATE;
  if (f < 0 || f >= n - 1) return null;
  const i = Math.floor(f), k = f - i, a = i * 3, b = a + 3, fr = g.frames;
  let dh = fr[b + 2] - fr[a + 2];
  dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  return {
    x: fr[a] + (fr[b] - fr[a]) * k,
    y: fr[a + 1] + (fr[b + 1] - fr[a + 1]) * k,
    heading: fr[a + 2] + dh * k,
    vx: (fr[b] - fr[a]) * GHOST_RATE,
    vy: (fr[b + 1] - fr[a + 1]) * GHOST_RATE,
  };
}
