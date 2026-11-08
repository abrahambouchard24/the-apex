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
  /** Layout scale: tracks with tight bends are spread out so the wide road still fits through them. */
  scale?: number;
  /**
   * Sprint: one long route raced once (no laps), with jumps on its long straights. Sprints are
   * dense loops, so they set how many samples each control segment gets and how many jumps to place.
   */
  sprint?: boolean;
  samples?: number;
  jumps?: number;
}

/** A jump: a ramp from `from` rising to `height` at `lip`, a gap to `land` (sample indices). */
export interface Jump { from: number; lip: number; land: number; height: number }
export const RAMP_LENGTH = 260;   // px of ramp
export const RAMP_HEIGHT = 60;    // px high at the lip
export const JUMP_GAP = 380;      // px of open air after the lip

/** Kerb width at the track edge through corners. */
export const KERB_WIDTH = 21;

const NEON: TrackTheme = { wall: '#4fe3ff', wallFace: '#bff6ff', lights: '255, 79, 216', kerb: '#ff2d75', surface: '#23283f' };

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
    name: 'NEW YORK',
    blurb: 'Deco skyline streets: square corners, short straights',
    scale: 1.51,
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
    name: 'LAPPLAND',
    blurb: 'Arctic night under the aurora: long sweepers',
    theme: { wall: '#cfd8e3', wallFace: '#f2f5f8', lights: '220, 235, 255', kerb: '#8a919c', surface: '#232427' },
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
    theme: { wall: '#3fd0ff', wallFace: '#c9f3ff', lights: '255, 210, 90', kerb: '#2f8cff', surface: '#1d2536' },
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
    theme: { wall: '#b98cff', wallFace: '#eadcff', lights: '120, 220, 255', kerb: '#8f5cff', surface: '#221f35' },
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
    theme: { wall: '#ffb347', wallFace: '#ffe6c2', lights: '255, 120, 60', kerb: '#ff6a2b', surface: '#2a2420' },
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
    theme: { wall: '#ff5e8a', wallFace: '#ffd3e0', lights: '255, 240, 120', kerb: '#ff3060', surface: '#251c2a' },
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
  // --- sprints: one long route each, no laps, with jumps ---------------------------------------
  {
    name: 'FAE FOREST',
    blurb: 'Enchanted forest sprint: flowing sweepers and glade jumps',
    sprint: true, samples: 26, jumps: 9,
    theme: { wall: '#7dffb0', wallFace: '#e6fff0', lights: '190, 255, 210', kerb: '#c88bff', surface: '#1e2a26' },
    // Generated route (a big loop of switchbacks, sweepers and straights), raced once.
    control: [
      [-4100, 4500], [-3561, 4447], [-3135, 4133], [-2686, 3879], [-2170, 3914], [-1756, 4224], [-1292, 4480], [-749, 4489],
      [-372, 4142], [-352, 3615], [-352, 3088], [-352, 2562], [-285, 2049], [148, 1799], [581, 2049], [648, 2562],
      [648, 3088], [648, 3614], [668, 4141], [1045, 4488], [1590, 4520], [2045, 4800], [2535, 4967], [3024, 4800],
      [3478, 4521], [4022, 4499], [4542, 4499], [5062, 4499], [5598, 4499], [6090, 4339], [6413, 3934], [6478, 3415],
      [6478, 2882], [6419, 2356], [6090, 1942], [5906, 1452], [6065, 952], [6403, 544], [6478, 21], [6478, -512],
      [6379, -1029], [5897, -1216], [5377, -1216], [4857, -1237], [4524, -1615], [4712, -2082], [5218, -2176], [5738, -2176],
      [6255, -2250], [6476, -2717], [6476, -3250], [6458, -3780], [6213, -4235], [5757, -4481], [5229, -4499], [4698, -4499],
      [4192, -4388], [3994, -3918], [3994, -3390], [3994, -2862], [3883, -2357], [3413, -2163], [3002, -2461], [2955, -2984],
      [2955, -3512], [2952, -4040], [2653, -4452], [2129, -4499], [1597, -4499], [1070, -4447], [647, -4132], [250, -3803],
      [-262, -3745], [-721, -3978], [-1089, -4355], [-1597, -4498], [-2128, -4498], [-2659, -4498], [-3082, -4202], [-3118, -3673],
      [-3118, -3146], [-3118, -2619], [-3296, -2144], [-3796, -2080], [-4077, -2497], [-4077, -3025], [-4077, -3552], [-4081, -4080],
      [-4413, -4475], [-4946, -4497], [-5477, -4497], [-5993, -4417], [-6383, -4076], [-6521, -3577], [-6521, -3047], [-6527, -2514],
      [-6770, -2038], [-6986, -1568], [-6869, -1064], [-6567, -624], [-6521, -91], [-6521, 440], [-6403, 946], [-5921, 1123],
      [-5401, 1123], [-4881, 1123], [-4371, 1189], [-4121, 1622], [-4371, 2055], [-4881, 2122], [-5401, 2122], [-5921, 2122],
      [-6402, 2298], [-6520, 2806], [-6520, 3336], [-6483, 3860], [-6197, 4292], [-5721, 4496], [-5195, 4501], [-4668, 4501],
    ],
  },
  {
    name: 'NOVA CAMELOT',
    blurb: 'Castle-city sprint: long straights and tight castle ramps',
    sprint: true, samples: 26, jumps: 10,
    theme: { wall: '#ffd23f', wallFace: '#fff6d8', lights: '255, 236, 170', kerb: '#3d7bff', surface: '#262a36' },
    // Generated route (a big loop of switchbacks, sweepers and straights), raced once.
    control: [
      [-4900, 4500], [-4374, 4500], [-3848, 4500], [-3328, 4500], [-2808, 4500], [-2288, 4500], [-1764, 4500], [-1237, 4500],
      [-788, 4254], [-747, 3729], [-747, 3209], [-747, 2689], [-747, 2169], [-550, 1708], [-52, 1732], [112, 2210],
      [112, 2730], [112, 3250], [112, 3770], [173, 4290], [644, 4499], [1170, 4499], [1697, 4458], [1943, 4008],
      [1943, 3488], [1943, 2968], [1943, 2448], [1966, 1928], [2373, 1638], [2779, 1928], [2803, 2449], [2803, 2969],
      [2803, 3489], [2803, 4009], [3048, 4457], [3577, 4497], [4104, 4497], [4625, 4497], [5145, 4497], [5668, 4497],
      [6195, 4497], [6706, 4399], [6974, 3959], [6977, 3434], [6977, 2910], [6977, 2385], [6836, 1886], [6323, 1775],
      [5797, 1775], [5271, 1775], [4745, 1764], [4418, 1387], [4668, 954], [5191, 916], [5717, 916], [6243, 916],
      [6767, 855], [6975, 385], [6975, -140], [6975, -664], [6975, -1188], [6975, -1708], [6975, -2268], [6975, -2793],
      [6975, -3317], [6975, -3841], [6800, -4325], [6315, -4501], [5789, -4501], [5264, -4501], [4738, -4501], [4215, -4501],
      [3695, -4501], [3175, -4501], [2653, -4501], [2128, -4501], [1603, -4501], [1077, -4501], [577, -4360], [467, -3850],
      [467, -3330], [467, -2810], [467, -2290], [455, -1769], [78, -1442], [-354, -1692], [-393, -2211], [-393, -2731],
      [-393, -3251], [-393, -3771], [-454, -4291], [-924, -4499], [-1450, -4499], [-1975, -4499], [-2501, -4499], [-3019, -4415],
      [-3192, -3929], [-3192, -3409], [-3192, -2889], [-3192, -2369], [-3192, -1849], [-3501, -1456], [-3972, -1620], [-4051, -2130],
      [-4051, -2650], [-4051, -3170], [-4051, -3690], [-4076, -4213], [-4502, -4498], [-5028, -4498], [-5553, -4498], [-6079, -4498],
      [-6603, -4470], [-6980, -4119], [-7022, -3598], [-7022, -3078], [-7022, -2558], [-7009, -2035], [-6613, -1709], [-6091, -1709],
      [-5571, -1709], [-5051, -1709], [-4609, -1477], [-4680, -983], [-5172, -850], [-5692, -850], [-6212, -850], [-6736, -825],
      [-7020, -399], [-7020, 121], [-7020, 641], [-7020, 1201], [-7020, 1721], [-7020, 2241], [-7020, 2761], [-7020, 3281],
      [-7020, 3801], [-6873, 4295], [-6400, 4500], [-5873, 4500], [-5346, 4500],
    ],
  },
  {
    name: 'ZOROPERSIA',
    blurb: 'Persian fire-temple sprint: long straights and big jumps',
    sprint: true, samples: 26, jumps: 12,
    theme: { wall: '#ff8a1f', wallFace: '#ffe8cc', lights: '255, 200, 120', kerb: '#4fe3ff', surface: '#2e2622' },
    // Generated route (a big loop of switchbacks, sweepers and straights), raced once.
    control: [
      [-6500, 4000], [-5969, 4000], [-5441, 4000], [-4921, 4000], [-4401, 4000], [-3881, 4000], [-3361, 4000], [-2838, 4000],
      [-2307, 4000], [-1772, 3966], [-1289, 3727], [-780, 3602], [-271, 3727], [211, 3966], [747, 3999], [1278, 3999],
      [1801, 3999], [2321, 3999], [2841, 3999], [3361, 3999], [3881, 3999], [4409, 3999], [4940, 3999], [5393, 3769],
      [5480, 3257], [5480, 2731], [5480, 2206], [5480, 1680], [5646, 1198], [6141, 1079], [6500, 1438], [6519, 1964],
      [6519, 2489], [6519, 3015], [6522, 3541], [6821, 3952], [7345, 3999], [7876, 3999], [8389, 3911], [8790, 3584],
      [8973, 3100], [8978, 2565], [8967, 2026], [8730, 1545], [8558, 1055], [8685, 551], [8948, 86], [8977, -453],
      [8977, -992], [8977, -1552], [8977, -2072], [8977, -2606], [8968, -3141], [8765, -3617], [8351, -3928], [7834, -4000],
      [7298, -4000], [6763, -4000], [6238, -4000], [5718, -4000], [5198, -4000], [4678, -4000], [4157, -4000], [3622, -4000],
      [3086, -4000], [2570, -3913], [2340, -3460], [2340, -2940], [2340, -2420], [2340, -1900], [2330, -1379], [2000, -992],
      [1498, -1072], [1300, -1541], [1300, -2061], [1300, -2581], [1300, -3101], [1281, -3622], [922, -3981], [389, -4000],
      [-146, -4000], [-683, -4005], [-1192, -4187], [-1678, -4386], [-2200, -4338], [-2672, -4088], [-3205, -4001], [-3740, -4001],
      [-4276, -4001], [-4802, -4001], [-5322, -4001], [-5842, -4001], [-6362, -4001], [-6888, -4001], [-7423, -4001], [-7959, -4001],
      [-8468, -3896], [-8855, -3552], [-9019, -3061], [-9021, -2540], [-9021, -2019], [-9021, -1498], [-9001, -972], [-8749, -499],
      [-8599, -1], [-8749, 496], [-9001, 968], [-9020, 1496], [-9020, 2017], [-9020, 2538], [-9018, 3059], [-8854, 3550],
      [-8467, 3893], [-7959, 3999], [-7432, 3999], [-6905, 3999],
    ],
  },
  {
    name: 'BIFROST',
    blurb: 'Rainbow bridge between floating islands: jump after jump',
    sprint: true, samples: 26, jumps: 14,
    theme: { wall: '#b98cff', wallFace: '#f3eaff', lights: '230, 210, 255', kerb: '#4fe3ff', surface: '#232036' },
    // Generated route (a big loop of switchbacks, sweepers and straights), raced once.
    control: [
      [-5000, 5000], [-4472, 5000], [-3945, 5000], [-3417, 4954], [-3091, 4544], [-3081, 4019], [-3081, 3499], [-3081, 2979],
      [-3081, 2459], [-3081, 1939], [-2925, 1451], [-2440, 1286], [-2023, 1584], [-1962, 2100], [-1962, 2620], [-1962, 3140],
      [-1962, 3660], [-1962, 4180], [-1897, 4701], [-1465, 4996], [-935, 4999], [-407, 4999], [123, 4980], [507, 4624],
      [538, 4098], [538, 3578], [538, 3058], [538, 2538], [538, 2018], [642, 1513], [1098, 1279], [1553, 1513],
      [1657, 2019], [1657, 2579], [1657, 3099], [1657, 3619], [1657, 4139], [1704, 4662], [2113, 4989], [2644, 4998],
      [3171, 4998], [3699, 4998], [4226, 4998], [4753, 4998], [5280, 4998], [5808, 4998], [6336, 4998], [6851, 4926],
      [7265, 4615], [7468, 4139], [7478, 3615], [7478, 3091], [7478, 2567], [7392, 2048], [6939, 1786], [6417, 1786],
      [5897, 1786], [5377, 1786], [4857, 1786], [4359, 1657], [4159, 1185], [4426, 748], [4938, 666], [5458, 666],
      [5978, 666], [6498, 666], [7021, 657], [7430, 331], [7477, -197], [7477, -721], [7477, -1245], [7477, -1768],
      [7477, -2288], [7477, -2811], [7477, -3335], [7477, -3860], [7405, -4374], [7094, -4788], [6617, -4991], [6089, -5001],
      [5559, -5001], [5028, -5001], [4499, -5001], [3972, -5001], [3445, -5001], [2916, -5001], [2385, -5001], [1855, -5001],
      [1323, -4982], [939, -4626], [908, -4100], [908, -3580], [908, -3060], [908, -2540], [908, -2020], [804, -1515],
      [348, -1280], [-107, -1515], [-212, -2021], [-212, -2541], [-212, -3061], [-212, -3581], [-212, -4141], [-258, -4664],
      [-667, -4990], [-1200, -5000], [-1731, -5000], [-2262, -5000], [-2788, -4935], [-3083, -4503], [-3086, -3979], [-3086, -3459],
      [-3086, -2939], [-3086, -2419], [-3086, -1899], [-3272, -1422], [-3768, -1293], [-4161, -1620], [-4206, -2140], [-4206, -2660],
      [-4206, -3180], [-4206, -3700], [-4206, -4220], [-4291, -4737], [-4744, -4999], [-5276, -4999], [-5807, -4999], [-6337, -4999],
      [-6857, -4941], [-7283, -4647], [-7505, -4179], [-7521, -3659], [-7521, -3139], [-7521, -2619], [-7521, -2099], [-7521, -1579],
      [-7518, -1057], [-7223, -624], [-6700, -560], [-6180, -560], [-5660, -560], [-5140, -560], [-4619, -542], [-4238, -200],
      [-4294, 309], [-4740, 560], [-5261, 560], [-5781, 560], [-6301, 560], [-6821, 560], [-7326, 695], [-7520, 1180],
      [-7520, 1700], [-7520, 2220], [-7520, 2740], [-7520, 3260], [-7520, 3780], [-7475, 4298], [-7198, 4735], [-6740, 4976],
      [-6216, 5000], [-5689, 5000],
    ],
  },
  {
    name: 'EL DORADO',
    blurb: 'Golden jungle city: tight switchbacks and waterfall jumps',
    sprint: true, samples: 26, jumps: 9,
    theme: { wall: '#ffd23f', wallFace: '#fff2c8', lights: '255, 230, 150', kerb: '#2fd16b', surface: '#24261c' },
    // Generated route (a big loop of switchbacks, sweepers and straights), raced once.
    control: [
      [-6050, 4750], [-5515, 4750], [-4981, 4750], [-4472, 4642], [-4335, 4148], [-4335, 3621], [-4335, 3094], [-4253, 2580],
      [-3774, 2435], [-3496, 2851], [-3496, 3378], [-3496, 3905], [-3484, 4432], [-3097, 4750], [-2562, 4750], [-2027, 4750],
      [-1510, 4668], [-1340, 4188], [-1340, 3661], [-1340, 3134], [-1281, 2614], [-819, 2423], [-501, 2810], [-501, 3337],
      [-501, 3864], [-497, 4392], [-143, 4746], [392, 4750], [926, 4750], [1463, 4712], [1910, 4414], [2425, 4369],
      [2870, 4659], [3399, 4749], [3934, 4749], [4468, 4749], [4910, 4509], [4950, 3984], [4950, 3457], [4950, 2930],
      [5153, 2469], [5652, 2518], [5789, 3012], [5789, 3539], [5789, 4066], [5871, 4580], [6353, 4749], [6887, 4749],
      [7422, 4749], [7927, 4623], [8211, 4191], [8225, 3664], [8225, 3137], [8225, 2610], [8021, 2149], [7505, 2090],
      [6985, 2090], [6494, 1952], [6445, 1454], [6906, 1250], [7426, 1250], [7947, 1226], [8225, 810], [8225, 283],
      [8225, -244], [8227, -771], [8448, -1242], [8538, -1751], [8290, -2213], [8225, -2732], [8225, -3259], [8225, -3786],
      [8176, -4308], [7821, -4684], [7300, -4749], [6769, -4749], [6237, -4749], [5708, -4725], [5430, -4309], [5430, -3782],
      [5430, -3255], [5418, -2727], [5031, -2410], [4614, -2688], [4590, -3215], [4590, -3742], [4590, -4269], [4350, -4709],
      [3823, -4749], [3292, -4749], [2760, -4749], [2244, -4667], [2075, -4187], [2075, -3660], [2075, -3133], [2016, -2613],
      [1553, -2422], [1236, -2809], [1236, -3336], [1236, -3863], [1232, -4391], [878, -4745], [346, -4749], [-186, -4749],
      [-717, -4749], [-1198, -4579], [-1280, -4065], [-1280, -3538], [-1280, -3011], [-1417, -2518], [-1915, -2469], [-2119, -2931],
      [-2119, -3458], [-2119, -3985], [-2159, -4509], [-2600, -4749], [-3132, -4749], [-3663, -4749], [-4194, -4749], [-4610, -4471],
      [-4634, -3944], [-4634, -3417], [-4634, -2890], [-4874, -2449], [-5365, -2547], [-5474, -3053], [-5474, -3580], [-5474, -4107],
      [-5582, -4611], [-6077, -4749], [-6609, -4749], [-7140, -4749], [-7671, -4742], [-8119, -4483], [-8269, -3989], [-8269, -3467],
      [-8269, -2945], [-8269, -2424], [-8269, -1902], [-8269, -1380], [-8269, -859], [-7991, -444], [-7469, -420], [-6949, -420],
      [-6429, -420], [-6042, -102], [-6234, 360], [-6750, 420], [-7270, 420], [-7790, 420], [-8230, 660], [-8269, 1181],
      [-8269, 1703], [-8269, 2224], [-8269, 2746], [-8269, 3267], [-8269, 3789], [-8220, 4308], [-7865, 4684], [-7347, 4749],
      [-6820, 4749],
    ],
  },
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

  constructor(def: TrackDef = TRACKS[0]) {
    this.name = def.name;
    this.theme = def.theme;
    const k = def.scale ?? 1;
    const CONTROL = def.control.map(([x, y]) => [x * k, y * k] as [number, number]);
    const n = CONTROL.length;
    const raw: Vec[] = [];
    for (let i = 0; i < n; i++) {
      const p0 = CONTROL[(i - 1 + n) % n], p1 = CONTROL[i], p2 = CONTROL[(i + 1) % n], p3 = CONTROL[(i + 2) % n];
      const per = def.samples ?? SAMPLES_PER_SEGMENT;
      for (let s = 0; s < per; s++) {
        const t = s / per;
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
    this.findDrsZones();
    this.dist = [0];
    for (let i = 1; i < m; i++) this.dist.push(this.dist[i - 1] + Math.hypot(this.pts[i].x - this.pts[i - 1].x, this.pts[i].y - this.pts[i - 1].y));
    this.totalLength = this.dist[m - 1] + Math.hypot(this.pts[0].x - this.pts[m - 1].x, this.pts[0].y - this.pts[m - 1].y);
    this.sprint = !!def.sprint;
    this.rampAt = new Int16Array(m).fill(-1);
    if (def.jumps) this.placeJumps(def.jumps);
  }

  get length(): number { return this.pts.length; }

  /** Whether a sample lies in a DRS zone; returns the zone's index or -1. */
  drsZoneAt(i: number): number {
    return this.drsZones.findIndex((z) => (z.from <= z.to ? i >= z.from && i <= z.to : i >= z.from || i <= z.to));
  }

  /** Mark every long straight as a DRS zone. Runs that wrap past index 0 are joined up. */
  private findDrsZones(): void {
    const m = this.pts.length;
    const straight = this.pts.map((p) => Math.abs(p.curve) < DRS_STRAIGHT_CURVE);
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
   * Put jumps on the long straights, spread along the route (none near the start and finish, so the
   * grid and the run to the line stay flat).
   */
  private placeJumps(count: number): void {
    const m = this.pts.length;
    const need = RAMP_LENGTH + JUMP_GAP + 300;
    const spots: number[] = [];
    let run = -1;
    for (let i = 0; i <= m; i++) {
      const straight = i < m && Math.abs(this.pts[i].curve) < 1 / 1800;   // straight, or nearly
      if (straight && run < 0) run = i;
      if ((!straight || i === m) && run >= 0) {
        if (this.dist[Math.min(i, m - 1)] - this.dist[run] >= need) spots.push(run + 4);
        run = -1;
      }
    }
    const usable = spots.filter((i) => this.dist[i] > this.totalLength * 0.08 && this.dist[i] < this.totalLength * 0.93);
    const pickN = Math.min(count, usable.length);
    for (let k = 0; k < pickN; k++) {
      const from = usable[Math.floor(((k + 0.5) / pickN) * usable.length)];
      const at = (d: number) => { let j = from; while (j < m - 1 && this.dist[j] - this.dist[from] < d) j++; return j; };
      const lip = at(RAMP_LENGTH), land = at(RAMP_LENGTH + JUMP_GAP);
      this.jumps.push({ from, lip, land, height: RAMP_HEIGHT });
      for (let j = from; j <= lip; j++) this.rampAt[j] = this.jumps.length - 1;
    }
  }

  /** Road height at a point (ramps rise toward their lip; everywhere else it's 0). */
  groundAt(pos: Vec, index: number): number {
    const id = this.rampAt[index] ?? -1;
    if (id < 0) return 0;
    const j = this.jumps[id], p = this.pts[index];
    // How far along the ramp, from the sample plus the point's offset along the track.
    const along = this.dist[index] + (pos.x - p.x) * -p.ny + (pos.y - p.y) * p.nx;
    const t = (along - this.dist[j.from]) / (this.dist[j.lip] - this.dist[j.from]);
    return t <= 0 ? 0 : t >= 1.02 ? 0 : j.height * Math.min(1, t);
  }

  /** Whether a sample is over a jump's gap (for drawing). */
  inGap(i: number): boolean { return this.jumps.some((j) => i > j.lip && i < j.land); }

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
  craft.ground = track.groundAt(craft.pos, race.index);
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
