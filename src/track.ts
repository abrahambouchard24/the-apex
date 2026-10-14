// The circuit: a closed Catmull-Rom spline through hand-placed control points, sampled into a
// centerline polyline. Everything else (edges, kerbs, walls, laps) is measured from that line.

import type { Craft, Vec } from './craft';

/** Control points of the circuit, driven in this order. Screen coords: +y is down. */
const CONTROL: [number, number][] = [
  [-1800, 1200],  // start/finish straight, heading east
  [0, 1200],
  [1800, 1200],
  [2450, 950],    // T1: long left-hander
  [2600, 350],
  [2250, -50],
  [1650, -50],    // T3-T4: chicane
  [1350, 200],
  [950, 200],
  [600, -150],
  [700, -850],    // T5: fast sweeper
  [1250, -1250],
  [1350, -1800],  // T7: hairpin
  [950, -2150],
  [450, -1900],
  [-100, -1350],  // back straight, diving south-west
  [-800, -1250],
  [-1500, -1550],
  [-2250, -1350],
  [-2550, -650],  // T11-T12: esses
  [-2150, -100],
  [-2550, 500],
  [-2500, 1050],  // final corner onto the straight
];

export const HALF_WIDTH = 130;     // half the racing surface width, px
export const WALL_DIST = 270;      // centerline to barrier, px (runoff is the gap)
const SAMPLES_PER_SEGMENT = 40;
const CRAFT_RADIUS = 24;
export const SECTORS = 10;         // checkpoints per lap; all must be passed in order

export interface TrackPoint { x: number; y: number; nx: number; ny: number; curve: number }

export class Track {
  /** Centerline samples with unit left-normals and signed curvature. Index 0 is the start line. */
  pts: TrackPoint[] = [];
  bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  constructor() {
    const n = CONTROL.length;
    const raw: Vec[] = [];
    for (let i = 0; i < n; i++) {
      const p0 = CONTROL[(i - 1 + n) % n], p1 = CONTROL[i], p2 = CONTROL[(i + 1) % n], p3 = CONTROL[(i + 2) % n];
      for (let s = 0; s < SAMPLES_PER_SEGMENT; s++) {
        const t = s / SAMPLES_PER_SEGMENT;
        raw.push({ x: catmull(p0[0], p1[0], p2[0], p3[0], t), y: catmull(p0[1], p1[1], p2[1], p3[1], t) });
      }
    }
    const m = raw.length;
    for (let i = 0; i < m; i++) {
      const a = raw[(i - 1 + m) % m], b = raw[(i + 1) % m];
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      this.pts.push({ x: raw[i].x, y: raw[i].y, nx: dy / len, ny: -dx / len, curve: 0 });
    }
    // Curvature: change in direction per px, smoothed so kerbs cover whole corners.
    const turn = this.pts.map((_, i) => {
      const a = this.pts[(i - 1 + m) % m], b = this.pts[(i + 1) % m];
      const cross = a.nx * b.ny - a.ny * b.nx;
      const ds = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return cross / ds;
    });
    for (let i = 0; i < m; i++) {
      let sum = 0;
      for (let k = -6; k <= 6; k++) sum += turn[(i + k + m) % m];
      this.pts[i].curve = sum / 13;
    }

    this.bounds = {
      minX: Math.min(...this.pts.map((p) => p.x)) - WALL_DIST, maxX: Math.max(...this.pts.map((p) => p.x)) + WALL_DIST,
      minY: Math.min(...this.pts.map((p) => p.y)) - WALL_DIST, maxY: Math.max(...this.pts.map((p) => p.y)) + WALL_DIST,
    };
  }

  get length(): number { return this.pts.length; }

  /** Heading (radians) of the track at a sample. */
  direction(i: number): number {
    const p = this.pts[i];
    return Math.atan2(p.nx, -p.ny);
  }

  /** Nearest centerline sample to a point, searching near a hint index first (cheap per frame). */
  nearest(pos: Vec, hint: number): { index: number; dist: number } {
    const m = this.pts.length;
    let best = -1, bestD = Infinity;
    const scan = (from: number, to: number) => {
      for (let k = from; k <= to; k++) {
        const i = ((k % m) + m) % m;
        const p = this.pts[i];
        const d = (p.x - pos.x) ** 2 + (p.y - pos.y) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
    };
    scan(hint - 60, hint + 60);
    // Far from the hint (e.g. after a reset): fall back to a full search.
    if (Math.sqrt(bestD) > WALL_DIST * 1.5) scan(0, m - 1);
    return { index: best, dist: Math.sqrt(bestD) };
  }
}

/** Per-craft race state: where it is on the track, sectors passed, lap times. */
export class RaceState {
  index = 0;
  offTrack = false;
  nextSector = 1;
  lap = 0;               // laps completed
  lapStart = -1;         // race time the current lap started; -1 = timer not started
  lastLap = 0;
  bestLap = 0;

  /** Returns 'lap' or 'best' when a lap is completed this step. */
  update(track: Track, craft: Craft, now: number, started: boolean): 'lap' | 'best' | null {
    if (started && this.lapStart < 0) this.lapStart = now;
    const near = track.nearest(craft.pos, this.index);
    this.index = near.index;
    this.offTrack = near.dist > HALF_WIDTH;

    const sector = Math.floor((this.index / track.length) * SECTORS);
    if (sector === this.nextSector % SECTORS) {
      if (this.nextSector === SECTORS) {
        // Back across the start line with every checkpoint passed.
        this.nextSector = 1;
        if (this.lapStart >= 0) {
          this.lastLap = now - this.lapStart;
          const best = this.bestLap === 0 || this.lastLap < this.bestLap;
          if (best) this.bestLap = this.lastLap;
          this.lap++;
          this.lapStart = now;
          return best ? 'best' : 'lap';
        }
      } else {
        this.nextSector++;
      }
    }
    return null;
  }

  current(now: number): number { return this.lapStart < 0 ? 0 : now - this.lapStart; }
}

/** Keep the craft inside the barriers. Returns impact speed lost (0 = no hit) for screen shake. */
export function collideWalls(track: Track, craft: Craft, race: RaceState): number {
  const p = track.pts[race.index];
  const dx = craft.pos.x - p.x, dy = craft.pos.y - p.y;
  const d = Math.hypot(dx, dy);
  const lim = WALL_DIST - CRAFT_RADIUS;
  if (d <= lim) return 0;
  // Push back inside and bounce off a wall facing the centerline.
  const n = { x: -dx / d, y: -dy / d };
  craft.pos.x = p.x - n.x * lim;
  craft.pos.y = p.y - n.y * lim;
  const before = craft.speed;
  craft.bounce(n);
  return before - craft.speed;
}

/** Place a craft on the grid, just behind the start line and pointing down the straight. */
export function placeOnGrid(track: Track, craft: Craft): void {
  const back = track.length - 6;
  const p = track.pts[back];
  craft.pos = { x: p.x, y: p.y };
  craft.vel = { x: 0, y: 0 };
  craft.heading = track.direction(back);
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
