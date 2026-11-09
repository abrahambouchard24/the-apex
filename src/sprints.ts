// The five sprints: point-to-point routes built by hand from straights and arcs, each with its own
// kind of corners, and forks whose two lanes are separate roads with their own lines.
//
// Course pieces: S(px) a straight, L(deg, r) / R(deg, r) a left / right turn at radius r. A fork
// wraps the pieces it spans; each lane says what it offers (jump, charge, cool, plain), how far out
// its centre sits, and its shape (wave = a chicane run, bulge = a long sweeping loop out and back).
// On a bend the inside lane is shorter but tighter, the wide lane longer but faster.

import type { Course, ForkDef, LaneDef, Seg, TrackDef } from './track';

const S = (s: number): Seg => ({ s });
const L = (t: number, r: number): Seg => ({ t, r });
const R = (t: number, r: number): Seg => ({ t: -t, r });
const fork = (left: LaneDef, right: LaneDef, ...segs: Seg[]): { fork: ForkDef; segs: Seg[] } => ({ fork: { left, right }, segs });
/** A chicane run: a narrower lane weaving side to side (slower, so it carries a strip). */
const CHICANE: Partial<LaneDef> = { w: 112, wave: [120, 1400] };
// Lane building blocks. Straight lanes sit well out from the route so the two read as separate
// roads; a sweeper loops further out (longer but flowing); on a bend the inside lane is cut tight
// (a short line you have to brake for) and the wide lane keeps its speed.
const jump = (at?: number): LaneDef => ({ kind: 'jump', c: 380, at });
const road = (): LaneDef => ({ kind: 'plain', c: 380 });
const strip = (kind: 'charge' | 'cool'): LaneDef => ({ kind, c: 400 });
const sweeper = (kind: 'charge' | 'cool' | 'plain', bulge = 650): LaneDef => ({ kind, c: 400, bulge });
const chicane = (kind: 'charge' | 'cool'): LaneDef => ({ kind, c: 410, ...CHICANE });
/** The inside of a bend of radius r: a lane centred `tight` px from the bend's centre. */
const inside = (r: number, tight = 400, w = 115): LaneDef => ({ kind: 'plain', c: r - tight, w });
const wide = (kind: 'jump' | 'charge' | 'cool' | 'plain', at?: number): LaneDef => ({ kind, c: 300, at });

/** Esses: n bends of `deg` at radius r, alternating (starting left, or right if deg < 0), ending straight. */
const esses = (r: number, deg: number, n: number): Seg[] => {
  const out: Seg[] = [];
  for (let k = 0; k <= n; k++) {
    const d = (k === 0 || k === n ? deg / 2 : deg) * (k % 2 ? -1 : 1);
    out.push(d >= 0 ? L(d, r) : R(-d, r));
  }
  return out;
};
/** A square jog: four 90-degree street corners (left, right, right, left, or mirrored) with short streets. */
const jog = (r: number, street: number, left = true): Seg[] => {
  const a = (t: number) => (left ? L(t, r) : R(t, r)), b = (t: number) => (left ? R(t, r) : L(t, r));
  return [a(90), S(street), b(90), S(street), b(90), S(street), a(90), S(street)];
};
/** An S through a fork: lanes swap inside and outside, so their lengths even out. */
const bendy = (r: number, deg: number, left = true): Seg[] => (left ? [L(deg, r), R(deg * 2, r), L(deg, r)] : [R(deg, r), L(deg * 2, r), R(deg, r)]);

const FAE: Course = [
  S(2000),
  ...esses(600, 80, 4), S(400),
  // The glade: a jump at the end of the winding ride, or the long way round on a charging strip.
  fork(jump(0.9), sweeper('charge', 250), S(500), ...bendy(1300, 25), S(2700)),
  S(1400), R(90, 420), S(300), L(150, 380), S(300), L(30, 500), S(400),
  // A long left: the tight inside line, or wide round the hill with a jump on the way out.
  fork(inside(1050, 520), wide('jump', 0.85), S(500), L(100, 1050), S(2700)),
  R(50, 450), L(40, 450), R(90, 380), S(400),
  ...esses(500, 90, 4), S(400),
  // Through the trunks (a cool, shaded chicane), or the long charging loop.
  fork(chicane('cool'), sweeper('charge', 250), S(500), ...bendy(1400, 20, false), S(900)),
  S(300), L(70, 400), R(140, 350), L(100, 400), S(300),
  fork(wide('charge'), inside(1100), S(900), R(120, 1100), S(1200)),
  S(1200), R(90, 420), S(300),
  ...esses(450, 100, 3), S(400),
  fork(sweeper('cool', 250), jump(0.9), S(500), ...bendy(1300, 25, false), S(2700)),
  S(300), L(80, 380), R(80, 380), L(90, 380), S(500),
  fork(road(), chicane('charge'), S(500), ...bendy(1400, 20), S(1200)),
  L(90, 450), R(90, 450), S(2600),
];

const AVALON: Course = [
  // A spiral inward round the misty lake to the isle at its heart: lakeshore esses, standing-stone
  // chicanes, causeway jumps, every corner a left.
  S(2000), ...esses(700, 60, 4), S(400), ...esses(600, 70, 4), S(400),
  // The causeway: jump the reeds, or the cool misty shore road.
  fork(jump(0.9), sweeper('cool', 250), S(500), ...bendy(1300, 20), S(2700)),
  S(1400), L(90, 650),
  S(500),
  fork(chicane('charge'), road(), S(500), ...bendy(1400, 20, false), S(900)),
  S(400), ...esses(500, 80, 4), S(400), ...esses(600, 70, 4), S(400),
  L(45, 350), R(90, 350), L(45, 350), S(800),
  // The barrow corner: the tight inside line, or wide over the downs with a jump.
  fork(inside(900, 450), wide('jump', 0.85), S(600), L(90, 900), S(2700)),
  S(600), ...esses(600, 70, 4), S(700),
  fork(jump(0.9), strip('cool'), S(500), ...bendy(1300, 20, false), S(2700)),
  S(300), L(90, 550),
  S(400),
  // The standing stones: a cool chicane between them, or the charging ring road round them.
  fork(chicane('cool'), sweeper('charge', 250), S(500), ...bendy(1400, 20), S(900)),
  S(400), R(40, 400), L(80, 400), R(40, 400), S(400), ...esses(500, 80, 4), S(1200),
  fork(inside(950, 500), wide('charge'), S(800), L(90, 950), S(1200)),
  S(500), ...esses(500, 80, 4), S(400),
  fork(jump(0.9), sweeper('cool', 250), S(500), ...bendy(1300, 20), S(2700)),
  S(300), L(90, 500),
  S(400), R(45, 380), L(90, 380), R(45, 380), S(400),
  // The apple orchard onto the isle: the cool orchard aisle, or a jump over the wall.
  fork(strip('cool'), jump(0.9), S(500), ...bendy(1300, 20, false), S(2700)),
  S(300), L(90, 500), S(400), ...esses(450, 70, 2), S(2600),
];

const ZORO: Course = [
  // A lightning-bolt zigzag across the desert: legs east and back north-west, joined by 135-degree
  // hairpins, each leg kinked and broken up by dune chicanes.
  S(2400),
  fork(jump(0.9), sweeper('cool', 250), S(600), ...bendy(1400, 18), S(2800)),
  S(400), R(30, 500), L(30, 500), S(400), L(135, 380),
  S(600),
  fork(chicane('charge'), sweeper('cool', 250), S(500), ...bendy(1400, 18, false), S(1000)),
  S(400), L(25, 500), R(25, 500), S(300), R(135, 380),
  S(400), L(40, 450), R(40, 450), S(300),
  fork(strip('cool'), jump(0.9), S(600), ...bendy(1400, 18, false), S(2800)),
  S(400),
  // The fire-temple turn: the tight inside line, or the wide charging arc round the temple.
  fork(inside(1000, 420, 120), wide('charge'), S(800), L(90, 1000), S(800)),
  S(300), R(30, 450), L(75, 450), S(600),
  fork(jump(0.9), sweeper('charge', 250), S(600), ...bendy(1400, 18), S(2800)),
  S(400), L(30, 450), R(30, 450), S(300), R(135, 380),
  S(500), R(35, 450), L(35, 450), S(300),
  fork(chicane('cool'), road(), S(500), ...bendy(1400, 18), S(1200)),
  S(300), L(135, 380),
  S(600),
  fork(jump(0.9), sweeper('charge', 250), S(500), ...bendy(1400, 18, false), S(2800)),
  S(300), R(40, 450), L(40, 450), S(300), R(135, 380),
  S(500),
  fork(strip('cool'), jump(0.9), S(500), ...bendy(1400, 18), S(2800)),
  S(400), R(45, 500), L(45, 500), S(2600),
];

const BIFROST: Course = [
  S(2400),
  fork(jump(0.9), strip('charge'), S(500), ...bendy(1600, 22), S(2800)),
  L(60, 2000), R(120, 1800), L(60, 2000), S(300), R(40, 900), L(40, 900), S(400),
  // A great left arc: the inside rail, or the outer bridge with a jump on the way out.
  fork({ kind: 'plain', c: 1050, w: 130 }, wide('jump', 0.88), S(1200), L(60, 1700), S(2800)),
  L(30, 1700), R(45, 1400), L(45, 1400), R(60, 1000), S(400),
  fork(jump(0.9), sweeper('cool', 250), S(500), ...bendy(1600, 22, false), S(2800)),
  S(300), R(70, 1500), L(140, 1300), R(70, 1500), S(400),
  fork(wide('charge'), { kind: 'plain', c: 1100, w: 130 }, S(1200), R(65, 1800), S(2000)),
  R(35, 1800), L(50, 900), R(50, 900), L(40, 2000), S(400),
  fork(chicane('charge'), sweeper('cool', 250), S(400), ...bendy(1600, 20), S(1000)),
  L(80, 1500), R(80, 1500), S(300), L(45, 800), R(45, 800), S(400),
  fork(strip('cool'), jump(0.9), S(500), ...bendy(1600, 20, false), S(2800)),
  R(50, 1600), L(50, 1600), S(2600),
];

const DORADO: Course = [
  S(2000), R(30, 1000), L(60, 800), R(30, 1000), S(400),
  // The waterfall: jump it, or the cool spray road round the pool.
  fork(jump(0.9), sweeper('cool', 250), S(500), ...bendy(1300, 22), S(2800)),
  S(1400), L(30, 500), R(30, 500), S(1000),
  // The first switchbacks up the temple hill.
  L(180, 320), S(1400), R(180, 320), S(1400), L(180, 320), S(1000),
  R(90, 600), S(500),
  fork(chicane('charge'), road(), S(500), ...bendy(1400, 20, false), S(1100)),
  S(300), L(60, 420), R(120, 400), L(120, 400), R(60, 420), S(400),
  fork(inside(900), wide('charge'), S(500), L(90, 900), S(1600)),
  S(600), R(30, 500), L(30, 500), S(1800),
  // The second switchbacks.
  R(180, 320), S(1400), L(180, 320), S(1400), R(180, 320), S(1000),
  L(90, 600), S(500),
  fork(chicane('cool'), sweeper('charge', 250), S(500), ...bendy(1400, 20), S(1100)),
  S(300), R(60, 420), L(120, 400), R(120, 400), L(60, 420), S(400),
  fork(jump(0.9), sweeper('charge', 250), S(500), ...bendy(1300, 22, false), S(2800)),
  S(2600),
];

const sprint = (name: string, blurb: string, course: Course, theme: TrackDef['theme']): TrackDef =>
  ({ name, blurb, sprint: true, course, control: [], theme });

export const SPRINTS: TrackDef[] = [
  sprint('FAE FOREST', 'Enchanted forest sprint: flowing esses, glade jumps, chicanes through the trunks', FAE,
    { wall: '#9dffb8', wallFace: '#eaf7e6', lights: '210, 255, 190', kerb: '#c8a0ff', surface: '#1e2622' }),
  sprint('AVALON', 'Misty isle sprint: a spiral round the lake through the fog, standing stones and causeway jumps', AVALON,
    { wall: '#b9f0e6', wallFace: '#eef6f2', lights: '200, 240, 230', kerb: '#9a8cd8', surface: '#262c30' }),
  sprint('ZOROPERSIA', 'Desert fire-temple sprint: endless straights, hairpin turns, big jumps', ZORO,
    { wall: '#ff9a3d', wallFace: '#f6e2c4', lights: '255, 180, 90', kerb: '#2fb5a8', surface: '#2c2420' }),
  sprint('BIFROST', 'Rainbow bridge between floating islands: huge fast arcs and jump after jump', BIFROST,
    { wall: '#c9a6ff', wallFace: '#f3eaff', lights: '230, 210, 255', kerb: '#7fe8ff', surface: '#232036' }),
  sprint('EL DORADO', 'Golden jungle city: tight switchbacks up the temple hills, waterfall jumps', DORADO,
    { wall: '#f2c24a', wallFace: '#f4e6c0', lights: '255, 220, 140', kerb: '#2fae6b', surface: '#24271e' }),
];
