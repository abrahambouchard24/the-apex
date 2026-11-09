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

const FAE: Course = [
  S(2200),
  L(30, 1500), R(60, 1200), L(30, 1500), S(900),
  // The glade: a jump over the stream, or the long way round the great tree on a charging strip.
  fork(jump(0.35), sweeper('charge'), S(5600)),
  S(600), R(45, 1100), L(90, 950), R(45, 1100), S(900),
  // A long left: the tight inside line, or wide round the hill with a jump on the way out.
  fork(inside(1050, 520), wide('jump', 0.72), S(500), L(100, 1050), S(2600)),
  S(500), R(70, 900), S(400), L(40, 1400), S(1200),
  // Through the trunks (a cool, shaded chicane), or the long charging loop.
  fork(chicane('cool'), sweeper('charge', 600), S(5200)),
  S(700), L(55, 1000), R(110, 850), L(55, 1000), S(800),
  // A long right: wide over the charging stones, or the tight inside.
  fork(wide('charge'), inside(1100), S(900), R(120, 1100), S(1500)),
  S(600), L(35, 1600), R(35, 1600), S(1200),
  fork(sweeper('cool'), jump(), S(5400)),
  S(500), R(60, 1000), L(60, 1000), S(600), R(80, 900), L(40, 1300), S(1000),
  fork(road(), chicane('charge'), S(5000)),
  S(600), L(90, 1000), R(90, 1000), S(2600),
];

const CAMELOT: Course = [
  S(2400),
  L(90, 380), S(1600), R(90, 380), S(1200),
  // The drawbridge: jump the moat, or take the cool cloister road.
  fork(jump(), strip('cool'), S(4800)),
  R(90, 380), S(1400), L(90, 380), S(900),
  // Round the keep: the tight inside street, or wide with the rampart jump.
  fork(inside(900, 450), wide('jump', 0.78), S(700), L(90, 900), S(2400)),
  R(90, 360), S(1200), R(90, 360), S(1400), L(90, 360), S(800),
  // The courtyard: a charging chicane between the fountains, or the straight colonnade.
  fork(chicane('charge'), road(), S(5000)),
  L(90, 400), S(1800), R(90, 400), S(1000),
  fork(wide('charge'), inside(950, 500), S(500), R(90, 950), S(2200)),
  S(1200), L(90, 380), S(1500), L(90, 380), S(1200), R(90, 380), S(600),
  // The tiltyard: a jump down the lists, or the long cool sweep round the stands.
  fork(jump(), sweeper('cool'), S(5600)),
  S(600), L(90, 380), S(1400), R(90, 380), S(800),
  // The cathedral close: the cool aisle, or a jump over the cloister wall.
  fork(strip('cool'), jump(0.5), S(5000)),
  S(600), R(45, 800), L(45, 800), S(2800),
];

const ZORO: Course = [
  // A lightning-bolt zigzag across the desert: long straights east, 135-degree hairpins, long
  // diagonals back north-west.
  S(2500),
  fork(jump(), sweeper('cool', 700), S(6000)),
  S(900), L(135, 380),
  S(1200),
  fork(chicane('charge'), sweeper('cool'), S(5600)),
  S(1000), R(135, 380),
  S(1200), L(12, 2500), R(12, 2500), S(600),
  fork(strip('cool'), jump(), S(5600)),
  S(800),
  // The fire-temple turn: the tight inside line, or the wide charging arc round the temple.
  fork(inside(1000, 420, 120), wide('charge'), S(800), L(90, 1000), S(800)),
  S(600), L(45, 700), S(600),
  fork(jump(), sweeper('charge', 700), S(6000)),
  S(800), R(135, 380),
  S(1500),
  fork(chicane('cool'), road(), S(5400)),
  S(900), L(135, 380),
  S(1200),
  fork(jump(0.4), sweeper('charge'), S(5600)),
  S(1000), R(135, 380),
  S(1500),
  fork(strip('cool'), jump(), S(5000)),
  S(3000),
];

const BIFROST: Course = [
  S(2400),
  fork(jump(), strip('charge'), S(5000)),
  L(60, 2600), S(400), R(120, 2200), S(400), L(60, 2600), S(600),
  // A great left arc: the inside rail, or the outer bridge with a jump on the way out.
  fork({ kind: 'plain', c: 1050, w: 130 }, wide('jump', 0.85), S(1200), L(60, 1700), S(2400)),
  L(30, 1700), R(45, 2400), S(1500),
  fork(jump(0.3), sweeper('cool', 700), S(5600)),
  S(400), R(70, 2000), S(300), L(70, 2000), S(600),
  fork(wide('charge'), { kind: 'plain', c: 1100, w: 130 }, S(1200), R(65, 1800), S(2000)),
  R(35, 1800), L(40, 2500), S(1200),
  fork(chicane('charge'), sweeper('cool'), S(5200)),
  S(400), L(80, 1900), S(300), R(80, 1900), S(600),
  fork(strip('cool'), jump(), S(5000)),
  S(400), R(50, 2400), L(50, 2400), S(2800),
];

const DORADO: Course = [
  S(2200), R(30, 1200), L(30, 1200), S(800),
  // The waterfall: jump it, or the cool spray road round the pool.
  fork(jump(), sweeper('cool', 750), S(5200)),
  S(2600),
  // The first switchbacks up the temple hill.
  L(180, 320), S(1800), R(180, 320), S(1800), L(180, 320), S(1400),
  R(90, 600), S(800),
  fork(chicane('charge'), road(), S(5000)),
  S(500), L(60, 480), R(120, 450), L(60, 480), S(900),
  fork(inside(900), wide('charge'), S(500), L(90, 900), S(2000)),
  S(2400),
  // The second switchbacks.
  R(180, 320), S(1600), L(180, 320), S(1600), R(180, 320), S(1200),
  L(90, 600), S(800),
  fork(chicane('cool'), sweeper('charge'), S(5000)),
  S(500), R(60, 480), L(120, 450), R(60, 480), S(900),
  fork(jump(0.4), sweeper('charge', 750), S(5600)),
  S(2800),
];

const sprint = (name: string, blurb: string, course: Course, theme: TrackDef['theme']): TrackDef =>
  ({ name, blurb, sprint: true, course, control: [], theme });

export const SPRINTS: TrackDef[] = [
  sprint('FAE FOREST', 'Enchanted forest sprint: flowing esses, glade jumps, chicanes through the trunks', FAE,
    { wall: '#9dffb8', wallFace: '#eaf7e6', lights: '210, 255, 190', kerb: '#c8a0ff', surface: '#1e2622' }),
  sprint('NOVA CAMELOT', 'Castle-city sprint: square street corners, the drawbridge and the keep', CAMELOT,
    { wall: '#e8c25a', wallFace: '#ece6da', lights: '255, 230, 170', kerb: '#3d6fd8', surface: '#262a33' }),
  sprint('ZOROPERSIA', 'Desert fire-temple sprint: endless straights, hairpin turns, big jumps', ZORO,
    { wall: '#ff9a3d', wallFace: '#f6e2c4', lights: '255, 180, 90', kerb: '#2fb5a8', surface: '#2c2420' }),
  sprint('BIFROST', 'Rainbow bridge between floating islands: huge fast arcs and jump after jump', BIFROST,
    { wall: '#c9a6ff', wallFace: '#f3eaff', lights: '230, 210, 255', kerb: '#7fe8ff', surface: '#232036' }),
  sprint('EL DORADO', 'Golden jungle city: tight switchbacks up the temple hills, waterfall jumps', DORADO,
    { wall: '#f2c24a', wallFace: '#f4e6c0', lights: '255, 220, 140', kerb: '#2fae6b', surface: '#24271e' }),
];
