// A circuit: a closed Catmull-Rom spline through hand-placed control points, sampled into a
// centerline polyline. Everything else (edges, kerbs, walls, laps) is measured from that line.

import type { Craft, Vec } from './craft';
import { SPRINTS } from './sprints';

/** Colors a track is drawn in: the barrier neon, its pulsing lights and the kerb stripe. */
export interface TrackTheme { wall: string; wallFace: string; lights: string; kerb: string; surface: string }

/** A circuit: control points of a closed spline, driven in order. Screen coords: +y is down. */
export interface TrackDef {
  name: string;
  blurb: string;
  /** The first point is the start/finish line; the last few should lie on the straight before it (the grid). */
  control: [number, number][];
  theme: TrackTheme;
  /** Layout scale: tracks with tight bends are spread out so the wide road still fits through them. */
  scale?: number;
  /**
   * Sprint: a point-to-point route raced once, start to finish, hand-built from straights and arcs
   * (`course`, which replaces `control`). Forks in it split the road into two separate lanes, each
   * with its own line, around an island.
   */
  sprint?: boolean;
  course?: Course;
}

/** A piece of a sprint route: a straight of `s` px, or a turn of `t` degrees (+ = left) at radius `r`. */
export type Seg = { s: number } | { t: number; r: number };
/** A sprint route: pieces in order; a fork wraps the pieces it spans. */
export type Course = (Seg | { fork: ForkDef; segs: Seg[] })[];
/**
 * One lane of a fork: what it offers, how far its centre sits from the route's centreline (px) at
 * full split, its half-width, and its shape: `wave` weaves it side to side ([amplitude, period]
 * px: a chicane run), `bulge` swings it out and back in a long arc (px further out at the middle).
 * A jump sits `at` this fraction along the full split (the lane must be straight there).
 */
export interface LaneDef { kind: LaneKind; c: number; w?: number; wave?: [number, number]; bulge?: number; at?: number; label?: string }
export interface ForkDef { left: LaneDef; right: LaneDef }

/**
 * What a fork lane offers: a jump (a glide that charges the boost), boost pads, a charging strip
 * (refills the battery while you're on it), a cooling strip, a fire lane (boost pads that heat you
 * up), or a plain road (at a turn, the inside line is shorter but tighter).
 */
export type LaneKind = 'jump' | 'boost' | 'charge' | 'cool' | 'fire' | 'plain';
/**
 * A fork: the road splits around an island from `from` to `to`; `left` / `right` lanes (side +1 /
 * -1). `curve` when it's on a bend (`sign` = the inside); `labels` name each lane on the fork sign;
 * `length` is each lane's length (px), measured along its centre.
 */
export interface Fork {
  from: number; to: number; curve: boolean; left: LaneKind; right: LaneKind; sign: number;
  labels: [string, string]; length: [number, number];
  /** A rough time for each lane (s), from its length and how tight it is, for the AI's choice. */
  time: [number, number];
}
/** A strip of lane surface with an effect, on one side of a fork. */
export interface Strip { side: number; kind: 'boost' | 'charge' | 'cool' | 'fire'; from: number; to: number }
const CHARGE_RATE = 0.45;         // battery per second on a charging strip
const FIRE_HEAT = 0.4;            // seconds of wall-grind heat per second on a fire lane
const PAD_HOLD = 0.9;             // seconds a pad's push lasts after leaving it

/**
 * A jump: a ramp from `from` rising to `height` at `lip`, a gap to `land` (sample indices), in the
 * lane on `side` (+1 = left of the centerline, -1 = right) of a split.
 */
export interface Jump { from: number; lip: number; land: number; height: number; side: number }
export const RAMP_LENGTH = 260;   // px of ramp
export const RAMP_HEIGHT = 70;    // px high at the lip
export const JUMP_GAP = 600;      // px of open air after the lip
// Forks: each lane eases out to its line over a distance that keeps it within about 30 degrees of
// the route, holds it, and eases back.
const LANE_HALF = 140;            // a lane's half-width unless its LaneDef says otherwise
const EASE_SLOPE = 2.7;           // ease length per px of sideways move
const EASE_MIN = 700;
const SAMPLE_PX = 20;             // spacing of a course's samples
const LANE_TOP = 820;             // px/s, for rough lane times
const LANE_GRIP = 480;            // px/s² of cornering, for rough lane times
const LEAD_IN = 70;               // samples of straight before the start line (the grid)
const RUNOFF = 1600;              // px of road past the finish line

/** Kerb width at the track edge through corners. */
export const KERB_WIDTH = 21;

const NEON: TrackTheme = { wall: '#3fe0d0', wallFace: '#f3ead2', lights: '255, 214, 140', kerb: '#e8c25a', surface: '#1f262b' };   // Apex Arena: marble, teal and gold

export const TRACKS: TrackDef[] = [
  {
    name: 'APEX ARENA',
    blurb: 'Futurist arena: chicane, hairpin, esses',
    scale: 1.27,
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
    name: 'VELOCITY COLOSSEUM',
    blurb: 'Marble colosseum oval: flat out, slipstream battles',
    theme: { wall: '#e8c25a', wallFace: '#f6efe0', lights: '255, 226, 170', kerb: '#c9a24a', surface: '#2a2826' },
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
    name: 'NEW YORK',
    blurb: 'Deco skyline streets: square corners, short straights',
    scale: 1.51,
    theme: { wall: '#f2b84b', wallFace: '#f1e3c4', lights: '255, 196, 110', kerb: '#3fe0d0', surface: '#22232a' },
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
    name: 'LAPPLAND',
    blurb: 'Arctic night under the aurora: long sweepers',
    theme: { wall: '#7dffd0', wallFace: '#eef6ff', lights: '200, 235, 255', kerb: '#9fb6d6', surface: '#20252c' },
    control: [
      [0, 1500],
      [1800, 1500],
      [3000, 1100],   // the long climb: one sweeper after another
      [3600, 200],
      [3300, -800],
      [2300, -1300],
      [1450, -1330],  // eased: the esses' first flick was a wall magnet
      [800, -1700],   // esses over the ridge
      [600, -2450],
      [-200, -3000],
      [-1300, -2700],
      [-1800, -1900], // the descent
      [-1650, -1000], // eased with the S-bend below (wall hits in AI races: 38 a race before, about 14 after)
      [-2200, -290],  // eased: the descent S-bend
      [-3000, 200],
      [-3300, 1100],
      [-2600, 1500],
      [-1500, 1500],
    ],
  },
  {
    name: 'NEW ATLANTIS',
    blurb: 'Marble city on the sea: fast sweepers, one big hairpin',
    theme: { wall: '#5fe6d6', wallFace: '#f0f7f4', lights: '255, 214, 120', kerb: '#e8c25a', surface: '#1c2a30' },
    control: [
      [0, 1400],      // start/finish on the quay
      [1600, 1400],
      [2600, 1300],   // T1: a long fast left
      [3200, 800],
      [3300, 0],
      [2900, -500],   // T2: tightens heading west
      [2200, -550],
      [1700, -250],   // T3-T4: a quick right-left kink
      [1100, -300],
      [600, -800],
      [650, -1500],   // T5: the lighthouse hairpin
      [200, -2000],
      [-500, -1900],
      [-700, -1300],
      [-1300, -900],  // T7: back along the docks
      [-2200, -1100],
      [-2900, -700],  // T8-T9: the long sweep home
      [-3000, 200],
      [-2500, 900],
      [-1600, 1300],
      [-800, 1400],
    ],
  },
  {
    name: 'CRYSTAL FRONT',
    blurb: 'Crystal war zone: tight switchbacks, few straights',
    theme: { wall: '#b98cff', wallFace: '#e6dcff', lights: '160, 220, 255', kerb: '#5fd8ff', surface: '#1f1d2c' },
    control: [
      [0, 1200],
      [1400, 1200],
      [2000, 900],    // T1-T2: left into the canyon
      [1950, 400],
      [1400, 200],
      [900, 400],     // T3: right, dropping back
      [450, 150],
      [450, -350],    // T4: left, climbing
      [950, -750],
      [1700, -850],
      [2300, -1250],  // T6: up the far wall
      [2200, -1950],
      [1500, -2250],  // T7: across the top
      [700, -2050],
      [200, -1550],   // T8-T9: the crystal switchbacks
      [-400, -1650],
      [-1000, -2150],
      [-1750, -2050],
      [-2050, -1350], // T10: down the west wall
      [-1650, -750],
      [-1950, -100],
      [-2450, 450],
      [-2250, 1050],  // T13: onto the straight
      [-1300, 1200],
      [-600, 1200],
    ],
  },
  {
    name: 'HIEROPOLIS',
    blurb: 'Sacred city of the sun: long straights, heavy braking',
    scale: 1.49,
    theme: { wall: '#f0b24a', wallFace: '#f3dfb8', lights: '255, 190, 110', kerb: '#c85a2a', surface: '#2c2620' },
    control: [
      [0, 1500],
      [2500, 1500],
      [3200, 1350],   // T1: hairpin at the end of the main straight
      [3350, 850],
      [2900, 600],
      [1000, 550],    // the long run back west
      [250, 350],     // T2: up and right
      [100, -200],
      [500, -700],
      [2500, -800],   // the second long straight
      [3200, -1100],  // T4: hairpin at the far end
      [3200, -1700],
      [2600, -1950],
      [400, -1950],   // the back straight
      [-900, -1850],  // T6: down the west side
      [-1700, -1350],
      [-1700, -600],  // T7-T8: chicane
      [-2100, -100],
      [-1800, 400],
      [-2050, 950],   // T9: the long sweep onto the main straight
      [-1950, 1350],
      [-1550, 1500],
      [-900, 1500],
    ],
  },
  {
    name: 'HANGING GARDENS',
    blurb: 'Terraced sky gardens with a long, sweeping carousel',
    scale: 1.44,
    theme: { wall: '#6fe0a0', wallFace: '#efe6cf', lights: '255, 230, 160', kerb: '#e8c25a', surface: '#232a24' },
    control: [
      [0, 1300],
      [1700, 1300],
      [2500, 1000],   // T1
      [2700, 300],
      [2400, -300],   // T2: left, heading west
      [1800, -500],
      [1400, -200],   // T3-T4: the rooftop dip
      [1000, -400],
      [600, -1000],
      [700, -1700],   // T5: into the carousel
      [300, -2300],
      [-500, -2500],  // the carousel: one long, steady left
      [-1300, -2300],
      [-1800, -1700],
      [-1900, -1000],
      [-1600, -400],
      [-1000, -200],  // out of the carousel, heading east
      [-550, 150],    // T8: a wide right, dropping south
      [-850, 600],
      [-1500, 650],
      [-1950, 520],   // T9-T10: a wide loop back onto the straight
      [-2400, 460],
      [-2697, 583],
      [-2820, 880],
      [-2697, 1177],
      [-2400, 1300],
      [-1600, 1300],
    ],
  },
  ...SPRINTS,
];

export const HALF_WIDTH = 195;     // half the racing surface width, px
export const WALL_THICKNESS = 14;  // barrier band drawn just outside the racing surface, px
export const WALL_DIST = HALF_WIDTH + WALL_THICKNESS;  // centerline to the outside of the barrier
const SAMPLES_PER_SEGMENT = 40;
const CRAFT_HALF_WIDTH = 22;      // how close the craft's center gets to a wall face
export const SECTORS = 10;         // checkpoints per lap; all must be passed in order

/**
 * Cooling lane: a strip along the outside edge of the main straight (right-hand side heading
 * down it, away from the infield). Driving over it sheds heat fast.
 */
export const COOL_LANE = { from: 6, to: 32, side: -1, width: 78 };

export interface TrackPoint { x: number; y: number; nx: number; ny: number; curve: number }

const DRS_STRAIGHT_CURVE = 1 / 2500; // gentler than this counts as straight
const DRS_MIN_SAMPLES = 36;          // a straight must be at least this long (~650 px) to get a zone
const DRS_TRIM = 4;                  // zone starts/ends this many samples inside the straight

export class Track {
  name: string;
  theme: TrackTheme;
  /** Centerline samples with unit left-normals and signed curvature. Index 0 is the start line. */
  pts: TrackPoint[] = [];
  bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  /** DRS zones: sample ranges on the long straights (from may be > to when a zone wraps the line). */
  drsZones: { from: number; to: number }[] = [];
  /** Sprint: raced once, start to finish (see TrackDef.sprint). */
  sprint = false;
  jumps: Jump[] = [];
  /** Distance along the centerline to each sample (px), and the full length. */
  dist: number[] = [];
  totalLength = 0;
  /** Which jump's ramp a sample is on (-1 for none), for groundAt. */
  private rampAt: Int16Array = new Int16Array(0);
  /** Point-to-point (sprints): route samples run 0..routeEnd, then the lead-in to the start line. */
  open = false;
  routeEnd = 0;
  finishIndex = 0;
  /** Forks on a sprint, and the effect strips on their lanes. */
  forks: Fork[] = [];
  strips: Strip[] = [];
  /**
   * The drivable road at each sample, as distances from the centerline on each side: the left lane
   * runs from `inL` to `outL` (toward the normal), the right lane from -`inR` to -`outR`. Outside a
   * fork the inner edges are 0 (one road); inside one, the island fills -inR..inL.
   */
  inL: Float32Array = new Float32Array(0);
  outL: Float32Array = new Float32Array(0);
  inR: Float32Array = new Float32Array(0);
  outR: Float32Array = new Float32Array(0);
  /** Curvature of each lane's centre line ([left, right]), for the AI's braking in a fork. */
  laneCurve: [Float32Array, Float32Array] = [new Float32Array(0), new Float32Array(0)];

  constructor(def: TrackDef = TRACKS[0]) {
    this.name = def.name;
    this.theme = def.theme;
    const k = def.scale ?? 1;
    const CONTROL = def.control.map(([x, y]) => [x * k, y * k] as [number, number]);
    const n = CONTROL.length;
    const raw: Vec[] = [];
    const per = SAMPLES_PER_SEGMENT;
    this.open = !!def.sprint;
    let forkSpans: { def: ForkDef; d0: number; d1: number; turn: number }[] = [];
    if (def.course) {
      // A hand-built route: walk it piece by piece, a sample every SAMPLE_PX.
      forkSpans = walkCourse(def.course, raw);
      this.routeEnd = raw.length - 1;
      const dx = raw[1].x - raw[0].x, dy = raw[1].y - raw[0].y, len = Math.hypot(dx, dy) || 1;
      for (let j = LEAD_IN; j >= 1; j--) raw.push({ x: raw[0].x - (dx / len) * len * j, y: raw[0].y - (dy / len) * len * j });
    } else if (this.open) {
      // The route from the start line to the end of the run-off, as an open spline...
      const at = (i: number) => CONTROL[Math.max(0, Math.min(n - 1, i))];
      for (let i = 0; i < n - 1; i++) {
        const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
        for (let s2 = 0; s2 < per; s2++) {
          const t = s2 / per;
          raw.push({ x: catmull(p0[0], p1[0], p2[0], p3[0], t), y: catmull(p0[1], p1[1], p2[1], p3[1], t) });
        }
      }
      raw.push({ x: CONTROL[n - 1][0], y: CONTROL[n - 1][1] });
      this.routeEnd = raw.length - 1;
      // ...then a straight lead-in to the start line, where the grid lines up.
      const dx = raw[1].x - raw[0].x, dy = raw[1].y - raw[0].y, len = Math.hypot(dx, dy) || 1;
      for (let j = LEAD_IN; j >= 1; j--) raw.push({ x: raw[0].x - (dx / len) * len * j, y: raw[0].y - (dy / len) * len * j });
    } else {
      for (let i = 0; i < n; i++) {
        const p0 = CONTROL[(i - 1 + n) % n], p1 = CONTROL[i], p2 = CONTROL[(i + 1) % n], p3 = CONTROL[(i + 2) % n];
        for (let s2 = 0; s2 < per; s2++) {
          const t = s2 / per;
          raw.push({ x: catmull(p0[0], p1[0], p2[0], p3[0], t), y: catmull(p0[1], p1[1], p2[1], p3[1], t) });
        }
      }
    }
    const m = raw.length;
    for (let i = 0; i < m; i++) {
      const a2 = raw[this.shift(i, -1, m)], b2 = raw[this.shift(i, 1, m)];
      const dx = b2.x - a2.x, dy = b2.y - a2.y, len = Math.hypot(dx, dy) || 1;
      this.pts.push({ x: raw[i].x, y: raw[i].y, nx: dy / len, ny: -dx / len, curve: 0 });
    }
    // Curvature: change in direction per px, smoothed so kerbs cover whole corners.
    const turn = this.pts.map((_, i) => {
      const a2 = this.pts[this.shift(i, -1, m)], b2 = this.pts[this.shift(i, 1, m)];
      const cross = a2.nx * b2.ny - a2.ny * b2.nx;
      const ds = Math.hypot(b2.x - a2.x, b2.y - a2.y) || 1;
      return cross / ds;
    });
    for (let i = 0; i < m; i++) {
      let sum = 0;
      for (let k2 = -6; k2 <= 6; k2++) sum += turn[this.shift(i, k2, m)];
      this.pts[i].curve = sum / 13;
    }
    this.inL = new Float32Array(m); this.inR = new Float32Array(m);
    this.outL = new Float32Array(m).fill(HALF_WIDTH); this.outR = new Float32Array(m).fill(HALF_WIDTH);

    this.bounds = {
      minX: Math.min(...this.pts.map((p) => p.x)) - WALL_DIST, maxX: Math.max(...this.pts.map((p) => p.x)) + WALL_DIST,
      minY: Math.min(...this.pts.map((p) => p.y)) - WALL_DIST, maxY: Math.max(...this.pts.map((p) => p.y)) + WALL_DIST,
    };
    this.findDrsZones();
    this.dist = [0];
    for (let i = 1; i < m; i++) this.dist.push(this.dist[i - 1] + Math.hypot(this.pts[i].x - this.pts[i - 1].x, this.pts[i].y - this.pts[i - 1].y));
    this.totalLength = this.open ? this.dist[this.routeEnd]
      : this.dist[m - 1] + Math.hypot(this.pts[0].x - this.pts[m - 1].x, this.pts[0].y - this.pts[m - 1].y);
    this.sprint = !!def.sprint;
    if (this.open) {
      let f = this.routeEnd;
      while (f > 0 && this.dist[this.routeEnd] - this.dist[f] < RUNOFF) f--;
      this.finishIndex = f;
    }
    this.rampAt = new Int16Array(m).fill(-1);
    for (const f of forkSpans) this.placeFork(f.def, f.d0, f.d1, f.turn);
    this.laneCurve = [this.curveOf(1), this.curveOf(-1)];
    for (const f of this.forks) {
      f.length = [this.laneLength(f.from, f.to, 1), this.laneLength(f.from, f.to, -1)];
      f.time = [this.laneTime(f.from, f.to, 1), this.laneTime(f.from, f.to, -1)];
    }
    // Forks make the road wider: grow the bounds to match.
    for (let i = 0; i < m; i++) for (const side of [1, -1]) {
      const p = this.pts[i], d = side * (this.outer(i, side) + WALL_THICKNESS);
      const x = p.x + p.nx * d, y = p.y + p.ny * d;
      this.bounds.minX = Math.min(this.bounds.minX, x); this.bounds.maxX = Math.max(this.bounds.maxX, x);
      this.bounds.minY = Math.min(this.bounds.minY, y); this.bounds.maxY = Math.max(this.bounds.maxY, y);
    }
  }

  /** The outer edge of the road on one side (+1 left, -1 right) at sample i, px from the centerline. */
  outer(i: number, side: number): number { return side > 0 ? this.outL[i] : this.outR[i]; }
  /** The island's edge on one side (0 outside a fork). */
  inner(i: number, side: number): number { return side > 0 ? this.inL[i] : this.inR[i]; }
  /** Whether sample i has an island (the road is split in two). */
  split(i: number): boolean { return this.inL[i] + this.inR[i] > 1; }
  /** The widest the road reaches from the centerline at sample i, either side. */
  reach(i: number): number { return Math.max(this.outL[i], this.outR[i]); }
  /** Which lane a point `lat` px from the centerline is in (+1 / -1), split at the island's middle. */
  sideOf(i: number, lat: number): number {
    return lat >= (this.inL[i] - this.inR[i]) / 2 ? 1 : -1;
  }
  /** The centre of the lane on `side` at sample i (the centerline where the road isn't split). */
  lanePoint(i: number, side: number): { x: number; y: number } {
    const p = this.pts[i];
    if (!this.split(i)) return { x: p.x, y: p.y };
    const d = side * (this.inner(i, side) + this.outer(i, side)) / 2;
    return { x: p.x + p.nx * d, y: p.y + p.ny * d };
  }
  /** Signed offset of a lane's centre from the centerline (0 where the road isn't split). */
  laneOffset(i: number, side: number): number {
    return this.split(i) ? side * (this.inner(i, side) + this.outer(i, side)) / 2 : 0;
  }
  /** The sample `px` further along than i, measured along the lane on `side` (or the centerline). */
  aheadBy(i: number, px: number, side = 0): number {
    let j = i, d = 0;
    for (let k = 0; k < 400 && d < px; k++) {
      const n = this.shift(j, 1);
      if (n === j) break;
      const a = side ? this.lanePoint(j, side) : this.pts[j], b = side ? this.lanePoint(n, side) : this.pts[n];
      d += Math.hypot(b.x - a.x, b.y - a.y);
      j = n;
    }
    return j;
  }
  /** Curvature to brake for at sample i in the lane on `side` (the centerline's outside forks). */
  curveAt(i: number, side = 0): number { return side && this.split(i) ? this.laneCurve[side > 0 ? 0 : 1][i] : this.pts[i].curve; }

  /** Rough seconds to drive a lane: each step at the speed its curvature allows. */
  private laneTime(from: number, to: number, side: number): number {
    let t = 0;
    const curve = this.laneCurve[side > 0 ? 0 : 1];
    for (let i = from; i < to; i++) {
      const a = this.lanePoint(i, side), b = this.lanePoint(i + 1, side);
      const k = Math.abs(curve[i]) + 1e-6;
      t += Math.hypot(b.x - a.x, b.y - a.y) / Math.min(LANE_TOP, Math.sqrt(LANE_GRIP / k));
    }
    return t;
  }

  private laneLength(from: number, to: number, side: number): number {
    let d = 0;
    for (let i = from; i < to; i++) { const a = this.lanePoint(i, side), b = this.lanePoint(i + 1, side); d += Math.hypot(b.x - a.x, b.y - a.y); }
    return d;
  }

  /** Curvature along one lane's centre line, smoothed like the centerline's. */
  private curveOf(side: number): Float32Array {
    const m = this.pts.length, out = new Float32Array(m);
    if (!this.forks.length) { for (let i = 0; i < m; i++) out[i] = this.pts[i].curve; return out; }
    const P = this.pts.map((p, i) => {
      const d = side * (this.inner(i, side) + this.outer(i, side)) / 2;
      return { x: p.x + p.nx * d, y: p.y + p.ny * d };
    });
    const raw = new Float32Array(m);
    for (let i = 0; i < m; i++) {
      const a = P[this.shift(i, -2, m)], b = P[i], c = P[this.shift(i, 2, m)];
      const ax = b.x - a.x, ay = b.y - a.y, bx = c.x - b.x, by = c.y - b.y;
      const la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1;
      // Signed turn per px, same sign convention as TrackPoint.curve (negative = turning left).
      raw[i] = ((ax * by - ay * bx) / (la * lb)) / ((la + lb) / 2);
    }
    for (let i = 0; i < m; i++) {
      let sum = 0;
      for (let k = -6; k <= 6; k++) sum += raw[this.shift(i, k, m)];
      out[i] = this.split(i) || this.inL[i] > 0 ? sum / 13 : this.pts[i].curve;
    }
    return out;
  }

  get length(): number { return this.pts.length; }

  /** Whether a sample lies in a DRS zone; returns the zone's index or -1. */
  drsZoneAt(i: number): number {
    return this.drsZones.findIndex((z) => (z.from <= z.to ? i >= z.from && i <= z.to : i >= z.from || i <= z.to));
  }

  /** Mark every long straight as a DRS zone. Runs that wrap past index 0 are joined up. */
  private findDrsZones(): void {
    const m = this.pts.length;
    const straight = this.pts.map((p, i) => Math.abs(p.curve) < DRS_STRAIGHT_CURVE && !(this.open && (i >= this.routeEnd - 2 && i <= this.routeEnd + 1)));
    // Start scanning just after a curved sample so a straight that wraps the line isn't split.
    const start = straight.findIndex((s) => !s);
    if (start < 0) return;
    let runStart = -1;
    for (let k = 1; k <= m; k++) {
      const i = (start + k) % m;
      if (straight[i] && runStart < 0) runStart = k;
      if ((!straight[i] || k === m) && runStart >= 0) {
        const len = k - runStart;
        if (len >= DRS_MIN_SAMPLES) {
          this.drsZones.push({ from: (start + runStart + DRS_TRIM) % m, to: (start + k - 1 - DRS_TRIM) % m });
        }
        runStart = -1;
      }
    }
  }

  /**
   * Sample `d` steps from `i` along the road. Loops wrap; a point-to-point route runs lead-in, then
   * route, and stops at either end instead of jumping across the break.
   */
  shift(i: number, d: number, m = this.pts.length): number {
    if (!this.open) return (((i + d) % m) + m) % m;
    const lead = m - 1 - this.routeEnd;
    const lin = i <= this.routeEnd ? i + lead : i - this.routeEnd - 1;
    const t = Math.max(0, Math.min(m - 1, lin + d));
    return t >= lead ? t - lead : this.routeEnd + 1 + t;
  }

  /** Whether the road between sample i and the next is missing (the break after a route's end). */
  isBreak(i: number): boolean { return this.open && i === this.routeEnd; }

  /** How far along the race a sample is, 0 at the start line to 1 at the finish (sprints). */
  fraction(i: number): number {
    if (!this.open) return i / this.pts.length;
    if (i > this.routeEnd) return 0;
    return Math.min(1, this.dist[i] / this.dist[this.finishIndex]);
  }

  /** Start line to finish line, in px. */
  get routeLength(): number { return this.open ? this.dist[this.finishIndex] : this.totalLength; }

  /**
   * A fork over the route from d0 to d1 px: each lane eases out to its own line (its centre, a weave
   * or a long bulge), holds it and eases back, leaving an island between the two. Jump lanes get a
   * ramp and a gap, charging and cooling lanes a strip along their full split.
   */
  private placeFork(def: ForkDef, d0: number, d1: number, turn: number): void {
    const U = d1 - d0;
    const idx = (d: number) => { let j = 0; while (j < this.routeEnd && this.dist[j] < d) j++; return j; };
    const a = idx(d0), b = idx(d1);
    const curve = Math.abs(turn) >= 45, inside = turn > 0 ? 1 : -1;
    const labels: [string, string] = ['', ''];
    for (const side of [1, -1]) {
      const L = side > 0 ? def.left : def.right, w = L.w ?? LANE_HALF;
      const E = Math.max(EASE_MIN, EASE_SLOPE * Math.max(L.c + w - HALF_WIDTH, L.c - w));
      const f0 = E, f1 = Math.max(E + 1, U - E);
      for (let i = a; i <= b; i++) {
        const u = this.dist[i] - d0;
        const t = smooth(Math.min(1, u / E, (U - u) / E));
        let c = L.c;
        if (L.bulge) c += L.bulge * Math.sin(Math.PI * clamp01((u - f0) / (f1 - f0))) ** 2;
        if (L.wave) {
          const [amp, per] = L.wave;
          const env = smooth(Math.min(1, Math.max(0, Math.min(u - f0, f1 - u) / (per / 2))));
          c += amp * env * Math.sin((2 * Math.PI * (u - f0)) / per);
        }
        const inn = t * (c - w), out = HALF_WIDTH + t * (c + w - HALF_WIDTH);
        if (side > 0) { this.inL[i] = Math.max(this.inL[i], inn); this.outL[i] = Math.max(this.outL[i], out); }
        else { this.inR[i] = Math.max(this.inR[i], inn); this.outR[i] = Math.max(this.outR[i], out); }
      }
      if (L.kind === 'jump') {
        // On the lane's full split, landing before it starts to ease back.
        const dj = Math.min(d0 + f0 + (L.at ?? 0.3) * (f1 - f0), d0 + f1 - RAMP_LENGTH - JUMP_GAP - 650);
        const from = idx(dj), lip = idx(dj + RAMP_LENGTH), land = idx(dj + RAMP_LENGTH + JUMP_GAP);
        this.jumps.push({ from, lip, land, height: RAMP_HEIGHT, side });
        for (let j = from; j <= lip; j++) this.rampAt[j] = this.jumps.length - 1;
      } else if (L.kind !== 'plain') {
        this.strips.push({ side, kind: L.kind, from: idx(d0 + E * 0.7), to: idx(d1 - E * 0.7) });
      }
      const shape = L.wave ? 'CHICANE' : L.bulge ? 'SWEEPER' : curve ? (side === inside ? 'INSIDE' : 'WIDE') : '';
      const kind = L.kind === 'plain' ? '' : L.kind === 'charge' ? 'CHARGE' : L.kind === 'cool' ? 'COOL' : L.kind.toUpperCase();
      labels[side > 0 ? 0 : 1] = L.label ?? ([shape, kind].filter(Boolean).join(' + ') || 'ROAD');
    }
    this.forks.push({ from: a, to: b, curve, left: def.left.kind, right: def.right.kind, sign: inside, labels, length: [0, 0], time: [0, 0] });
  }

  /** The fork whose split covers sample i, or null. */
  forkAt(i: number): Fork | null { return this.forks.find((f) => i >= f.from && i <= f.to) ?? null; }

  /** The effect strip under a point on sample i, or null. */
  stripAt(i: number, lat: number): Strip | null {
    if (!this.strips.length || !this.split(i)) return null;
    const side = this.sideOf(i, lat);
    return this.strips.find((st) => st.side === side && i >= st.from && i <= st.to) ?? null;
  }

  /** Road height at a point (ramps rise toward their lip, in their own lane; everywhere else 0). */
  groundAt(pos: Vec, index: number): number {
    const id = this.rampAt[index] ?? -1;
    if (id < 0) return 0;
    const j = this.jumps[id], p = this.pts[index];
    const lat = (pos.x - p.x) * p.nx + (pos.y - p.y) * p.ny;
    if (this.sideOf(index, lat) !== j.side) return 0;
    // How far along the ramp, from the sample plus the point's offset along the track.
    const along = this.dist[index] + (pos.x - p.x) * -p.ny + (pos.y - p.y) * p.nx;
    const t = (along - this.dist[j.from]) / (this.dist[j.lip] - this.dist[j.from]);
    return t <= 0 ? 0 : t >= 1.02 ? 0 : j.height * Math.min(1, t);
  }

  /** Whether a sample is over a jump's gap, and on which side (for drawing): the jump, or null. */
  gapAt(i: number): Jump | null { return this.jumps.find((j) => i >= j.lip && i < j.land) ?? null; }

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
    if (Math.sqrt(bestD) > this.reach(best) + WALL_THICKNESS + 110) scan(0, m - 1);
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
  if (track.strips.length && track.stripAt(index, lateral(track, craft, index))?.kind === 'cool') return true;
  if (index < COOL_LANE.from || index > COOL_LANE.to) return false;
  return lateral(track, craft, index) * COOL_LANE.side >= HALF_WIDTH - COOL_LANE.width;
}

/** Per-craft race state: where it is on the track, sectors passed, lap times. */
export class RaceState {
  index = 0;
  /** Race time this car last passed each track sample (NaN = not yet), for time gaps. */
  passTimes: number[] = [];
  nextSector = 1;
  lap = 0;               // laps completed
  lapStart = -1;         // race time the current lap started; -1 = timer not started
  lastLap = 0;
  bestLap = 0;

  /** Returns 'lap' or 'best' when a lap is completed this step. */
  update(track: Track, craft: Craft, now: number, started: boolean): 'lap' | 'best' | null {
    if (started && this.lapStart < 0) this.lapStart = now;
    if (this.passTimes.length !== track.length) this.passTimes = new Array(track.length).fill(NaN);
    const before = this.index;
    const near = track.nearest(craft.pos, this.index);
    this.index = near.index;
    // Stamp every sample crossed going forward (at speed a step can skip one or two).
    const moved = (this.index - before + track.length) % track.length;
    if (started && moved > 0 && moved < 40) {
      for (let k = 1; k <= moved; k++) this.passTimes[(before + k) % track.length] = now;
    }

    if (track.open) return this.updateOpen(track, craft, now);
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
        if (track.sprint && (this.nextSector - 1) % 3 === 0) craft.harvested = 0;
      }
    }
    return null;
  }

  /** Point-to-point: sectors by distance; the run ends at the finish line (counted as lap 1). */
  private updateOpen(track: Track, craft: Craft, now: number): 'lap' | 'best' | null {
    if (this.lap > 0 || this.lapStart < 0) return null;
    const f = track.fraction(this.index);
    const sector = Math.min(SECTORS - 1, Math.floor(f * SECTORS));
    // Sectors only count in order (no cutting ahead).
    if (sector === this.nextSector % SECTORS && sector > 0) {
      this.nextSector++;
      if ((this.nextSector - 1) % 3 === 0) craft.harvested = 0;
    }
    if (f >= 1 && this.nextSector >= SECTORS) {
      this.lastLap = now - this.lapStart;
      const best = this.bestLap === 0 || this.lastLap < this.bestLap;
      if (best) this.bestLap = this.lastLap;
      this.lap = 1;
      return best ? 'best' : 'lap';
    }
    return null;
  }

  current(now: number): number { return this.lapStart < 0 ? 0 : now - this.lapStart; }

  /**
   * Seconds this car is behind `ahead`: how long ago `ahead` passed the spot we're at now.
   * NaN if `ahead` isn't actually ahead (within a lap) or hasn't passed here yet.
   */
  gapBehind(ahead: RaceState, track: Track, now: number): number {
    const d = ahead.progress(track) - this.progress(track);
    if (d <= 0 || d >= track.length) return NaN;
    return now - ahead.passTimes[this.index];
  }

  /** Distance into the race in track samples (laps done + way into this lap), for positions. */
  progress(track: Track): number {
    if (track.open) return this.lap * track.length + (this.index > track.routeEnd ? this.index - track.length : this.index);
    const behindLine = this.nextSector === 1 && this.index > track.length / 2;
    return this.lap * track.length + (behindLine ? this.index - track.length : this.index);
  }
}

export interface WallContact { impact: number; x: number; y: number }

/** Keep the craft between the walls, scraping along them. Returns the contact, or null if clear. */
export function collideWalls(track: Track, craft: Craft, race: RaceState, dt: number): WallContact | null {
  const i = race.index, p = track.pts[i];
  craft.ground = track.groundAt(craft.pos, i);
  if (track.strips.length && craft.onGround) {
    const st = track.stripAt(i, (craft.pos.x - p.x) * p.nx + (craft.pos.y - p.y) * p.ny);
    if (st?.kind === 'boost' || st?.kind === 'fire') craft.pad = PAD_HOLD;
    if (st?.kind === 'fire') craft.addHeat(0, FIRE_HEAT * dt);
    if (st?.kind === 'charge') craft.energy = Math.min(1, craft.energy + CHARGE_RATE * dt);
  }
  const ox = craft.pos.x - p.x, oy = craft.pos.y - p.y;
  const lat = ox * p.nx + oy * p.ny, along = ox * -p.ny + oy * p.nx;
  const outL = track.outL[i] - CRAFT_HALF_WIDTH, outR = track.outR[i] - CRAFT_HALF_WIDTH;
  const inL = track.inL[i], inR = track.inR[i];
  const side = track.sideOf(i, lat);
  let target = lat, nx = 0, ny = 0, wallLat = 0;
  if (lat > outL || lat < -outR) {
    // The outside wall: push back in.
    const sign = lat > 0 ? 1 : -1;
    target = sign > 0 ? outL : -outR; nx = -sign * p.nx; ny = -sign * p.ny;
    wallLat = sign > 0 ? track.outL[i] : -track.outR[i];
  } else if (inL + inR > 1 && lat < inL + CRAFT_HALF_WIDTH && lat > -inR - CRAFT_HALF_WIDTH) {
    // The island between two lanes: push out to whichever side we're on.
    target = side > 0 ? inL + CRAFT_HALF_WIDTH : -inR - CRAFT_HALF_WIDTH; nx = side * p.nx; ny = side * p.ny;
    wallLat = side > 0 ? inL : -inR;
  }
  let hit = target !== lat;
  if (hit) {
    craft.pos.x += (target - lat) * p.nx;
    craft.pos.y += (target - lat) * p.ny;
  }
  // The end of a point-to-point road.
  if (track.open && i >= track.routeEnd - 1 && i <= track.routeEnd && along > 0) {
    craft.pos.x -= along * -p.ny; craft.pos.y -= along * p.nx;
    nx = p.ny; ny = -p.nx; hit = true;
  }
  if (!hit) return null;
  const impact = craft.scrape({ x: nx, y: ny }, dt);
  return { impact, x: p.x + p.nx * wallLat, y: p.y + p.ny * wallLat };
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

function smooth(e: number): number { const t = Math.max(0, Math.min(1, e)); return t * t * (3 - 2 * t); }
function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }

/**
 * Walk a hand-built course, pushing a sample every SAMPLE_PX (start at the origin heading east).
 * Returns each fork's span along the route (px) and how far it turns (degrees, + = left).
 */
function walkCourse(course: Course, raw: Vec[]): { def: ForkDef; d0: number; d1: number; turn: number }[] {
  let x = 0, y = 0, a = 0, d = 0;
  raw.push({ x, y });
  const spans: { def: ForkDef; d0: number; d1: number; turn: number }[] = [];
  const walk = (seg: Seg): number => {
    const len = 's' in seg ? seg.s : (seg.r * Math.abs(seg.t) * Math.PI) / 180;
    const n = Math.max(1, Math.round(len / SAMPLE_PX)), step = len / n;
    const turn = 's' in seg ? 0 : (-seg.t * Math.PI) / 180 / n;   // + = left: the heading turns toward the normal
    for (let k = 0; k < n; k++) {
      const mid = a + turn / 2;
      x += Math.cos(mid) * step; y += Math.sin(mid) * step; a += turn;
      d += step;
      raw.push({ x, y });
    }
    return 's' in seg ? 0 : seg.t;
  };
  for (const item of course) {
    if ('fork' in item) {
      const d0 = d;
      let turn = 0;
      for (const seg of item.segs) turn += walk(seg);
      spans.push({ def: item.fork, d0, d1: d, turn });
    } else walk(item);
  }
  return spans;
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
