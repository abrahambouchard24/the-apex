// A circuit: a closed Catmull-Rom spline through hand-placed control points, sampled into a
// centerline polyline. Everything else (edges, kerbs, walls, laps) is measured from that line.

import type { Craft, Vec } from './craft';

/** Colors a track is drawn in: the barrier neon, its pulsing lights and the kerb stripe. */
export interface TrackTheme { wall: string; wallFace: string; lights: string; kerb: string; surface: string }

/** A circuit: control points of a closed spline, driven in order. Screen coords: +y is down. */
export interface TrackDef {
  name: string;
  blurb: string;
  /** The first point is the start/finish line; the last few should lie on the straight before it (the grid). */
  control: [number, number][];
  theme: TrackTheme;
}

const NEON: TrackTheme = { wall: '#4fe3ff', wallFace: '#bff6ff', lights: '255, 79, 216', kerb: '#ff2d75', surface: '#23283f' };

export const TRACKS: TrackDef[] = [
  {
    name: 'APEX GRAND PRIX',
    blurb: 'Balanced F1 circuit: chicane, hairpin, esses',
    theme: NEON,
    control: [
      [0, 1200],      // start/finish line, halfway down the main straight heading east
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
      [-1800, 1200],  // main straight: the grid lines up here
    ],
  },
  {
    name: 'VELOCITY RING',
    blurb: 'Fast oval: flat out, slipstream battles',
    theme: { wall: '#ffd23f', wallFace: '#fff3c4', lights: '255, 140, 40', kerb: '#ff8a1f', surface: '#26252f' },
    control: [
      [0, 1400],
      [2000, 1400],
      [3300, 1200],   // T1-T2: one long sweep round the east end
      [3900, 500],
      [3800, -400],
      [3100, -950],
      [1900, -1100],  // back straight with a gentle kink
      [700, -900],
      [-600, -1100],
      [-1900, -1100],
      [-3100, -800],  // T3-T4
      [-3800, -100],
      [-3600, 800],
      [-2600, 1350],
      [-1500, 1400],
    ],
  },
  {
    name: 'NEON STREETS',
    blurb: 'Tight street circuit: square corners, short straights',
    theme: { wall: '#ff4fd8', wallFace: '#ffd1f4', lights: '79, 227, 255', kerb: '#4fe3ff', surface: '#211f33' },
    control: [
      [0, 1000],
      [1300, 1000],
      [1650, 850],    // T1: right-angle left, heading north
      [1700, 450],
      [1550, 150],    // T2: left, heading west
      [1050, 100],
      [750, -100],    // T3: right, heading north
      [700, -600],
      [900, -880],    // T4: right, heading east
      [1400, -900],
      [1720, -1150],  // T5: left, heading north
      [1760, -1450],
      [1450, -1780],  // T6: left, the long run west
      [-200, -1780],
      [-560, -1600],  // T7: left, heading south
      [-640, -1280],
      [-600, -1000],
      [-300, -700],   // T8-T9: chicane
      [-250, -400],
      [-550, -200],
      [-1150, -200],
      [-1500, 50],    // T10: left, heading south
      [-1500, 650],
      [-1250, 980],   // T11: left onto the straight
      [-700, 1000],
    ],
  },
  {
    name: 'SUMMIT PASS',
    blurb: 'Mountain road: long sweepers, flowing esses',
    theme: { wall: '#7dffb0', wallFace: '#dcffe9', lights: '200, 255, 120', kerb: '#2fd16b', surface: '#1f2a2a' },
    control: [
      [0, 1500],
      [1800, 1500],
      [3000, 1100],   // the long climb: one sweeper after another
      [3600, 200],
      [3300, -800],
      [2300, -1300],
      [1400, -1150],
      [800, -1700],   // esses over the ridge
      [600, -2450],
      [-200, -3000],
      [-1300, -2700],
      [-1800, -1900], // the descent
      [-1700, -1000],
      [-2150, -200],
      [-3000, 200],
      [-3300, 1100],
      [-2600, 1500],
      [-1500, 1500],
    ],
  },
];

export const HALF_WIDTH = 130;     // half the racing surface width, px
export const WALL_THICKNESS = 14;  // barrier band drawn just outside the racing surface, px
export const WALL_DIST = HALF_WIDTH + WALL_THICKNESS;  // centerline to the outside of the barrier
const SAMPLES_PER_SEGMENT = 40;
const CRAFT_HALF_WIDTH = 22;      // how close the craft's center gets to a wall face
export const SECTORS = 10;         // checkpoints per lap; all must be passed in order

/**
 * Cooling lane: a strip along the outside edge of the main straight (right-hand side heading
 * down it, away from the infield). Driving over it sheds heat fast.
 */
export const COOL_LANE = { from: 6, to: 32, side: -1, width: 52 };

export interface TrackPoint { x: number; y: number; nx: number; ny: number; curve: number }

export class Track {
  name: string;
  theme: TrackTheme;
  /** Centerline samples with unit left-normals and signed curvature. Index 0 is the start line. */
  pts: TrackPoint[] = [];
  bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  constructor(def: TrackDef = TRACKS[0]) {
    this.name = def.name;
    this.theme = def.theme;
    const CONTROL = def.control;
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

/** Signed distance from the centerline at a sample (+ = track-left, toward the normal). */
export function lateral(track: Track, craft: Craft, index: number): number {
  const p = track.pts[index];
  return (craft.pos.x - p.x) * p.nx + (craft.pos.y - p.y) * p.ny;
}

/** Whether a craft is over the cooling lane right now. */
export function inCoolingLane(track: Track, craft: Craft, index: number): boolean {
  if (index < COOL_LANE.from || index > COOL_LANE.to) return false;
  return lateral(track, craft, index) * COOL_LANE.side >= HALF_WIDTH - COOL_LANE.width;
}

/** Per-craft race state: where it is on the track, sectors passed, lap times. */
export class RaceState {
  index = 0;
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

  /** Distance into the race in track samples (laps done + way into this lap), for positions. */
  progress(track: Track): number {
    const behindLine = this.nextSector === 1 && this.index > track.length / 2;
    return this.lap * track.length + (behindLine ? this.index - track.length : this.index);
  }
}

export interface WallContact { impact: number; x: number; y: number }

/** Keep the craft between the walls, scraping along them. Returns the contact, or null if clear. */
export function collideWalls(track: Track, craft: Craft, race: RaceState, dt: number): WallContact | null {
  const p = track.pts[race.index];
  const dx = craft.pos.x - p.x, dy = craft.pos.y - p.y;
  const d = Math.hypot(dx, dy);
  const lim = HALF_WIDTH - CRAFT_HALF_WIDTH;
  if (d <= lim) return null;
  // Push back to the wall face and grind along it.
  const n = { x: -dx / d, y: -dy / d };
  craft.pos.x = p.x - n.x * lim;
  craft.pos.y = p.y - n.y * lim;
  const impact = craft.scrape(n, dt);
  return { impact, x: p.x - n.x * HALF_WIDTH, y: p.y - n.y * HALF_WIDTH };
}

/**
 * Place a craft in a grid slot behind the start line, pointing down the straight.
 * Slot 0 is pole; slots stagger left/right like an F1 grid. Returns the sample index used.
 */
export function placeOnGrid(track: Track, craft: Craft, slot = 0): number {
  const back = track.length - 8 - slot * 9;
  const p = track.pts[back];
  const side = slot % 2 === 0 ? 55 : -55;
  craft.pos = { x: p.x + p.nx * side, y: p.y + p.ny * side };
  craft.vel = { x: 0, y: 0 };
  craft.heading = track.direction(back);
  return back;
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
