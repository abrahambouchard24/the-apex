// Mythic liveries: each unlockable skin paints the voxel car with its own pattern, not just new
// colours. A painter is asked for every cube of the car's paintwork (body paint, stripes and trim)
// with its position in car space and which way it faces, and returns that cube's colour (and
// whether it glows), or null to keep the plain skin colour.
//
// Car space (world px): x runs tail (-44) to nose (+40), y up from the skirt (the deck is at about
// y 11), z across the car (the hull is 13 either side, the pods out to 23).

export type Face = 'top' | 'side' | 'other';
export type Kind = 'paint' | 'dark' | 'white';
/** A cube's colour (0xRRGGBB) and whether it glows; null keeps the plain skin colour. */
export type Painted = [number, boolean] | null;
export type Painter = (x: number, y: number, z: number, kind: Kind, face: Face) => Painted;

// --- small helpers ---------------------------------------------------------------------------------

function hash3(x: number, y: number, z: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t: number) => t * t * (3 - 2 * t);
/** Value noise in 3D, 0..1. */
function noise(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), xf), l(c(0, 1, 0), c(1, 1, 0), xf), yf),
    l(l(c(0, 0, 1), c(1, 0, 1), xf), l(c(0, 1, 1), c(1, 1, 1), xf), yf), zf);
}
function fbm(x: number, y: number, z: number): number {
  return noise(x, y, z) * 0.55 + noise(x * 2.1, y * 2.1, z * 2.1) * 0.3 + noise(x * 4.3, y * 4.3, z * 4.3) * 0.15;
}
function mix(a: number, b: number, t: number): number {
  t = Math.max(0, Math.min(1, t));
  const ch = (s: number) => Math.round(((a >> s) & 255) + ((((b >> s) & 255) - ((a >> s) & 255)) * t));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
function hsl(h: number, s: number, l: number): number {
  h = ((h % 1) + 1) % 1;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => {
    t = ((t % 1) + 1) % 1;
    const v = t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
    return Math.round(v * 255);
  };
  return (f(h + 1 / 3) << 16) | (f(h) << 8) | f(h - 1 / 3);
}

const GOLD = 0xe3b85a, GOLD_DARK = 0x8a6420, IVORY = 0xf3ead2;

// --- the liveries ----------------------------------------------------------------------------------

const PAINTERS: Record<string, Painter> = {
  /** VERDIGRIS: an ancient bronze, gone sea-green with patina in the hollows. */
  verdigris(x, y, z, kind) {
    const n = fbm(x * 0.06 + 3, y * 0.09, z * 0.06);
    const bronze = mix(0x6e4a22, 0xb08850, noise(x * 0.4, y * 0.4, z * 0.4) * 0.6 + 0.2);
    if (kind === 'white') return [0xd9b56a, false];
    if (kind === 'dark') return [mix(0x2a1d10, 0x2f6a5a, n), false];
    return [n > 0.5 ? mix(bronze, 0x5fc2a2, (n - 0.5) * 3.2) : bronze, false];
  },

  /** OBSIDIAN: black volcanic glass, mended with gold along its cracks (kintsugi). */
  obsidian(x, y, z, kind) {
    if (kind === 'white') return [GOLD, false];
    const crack = Math.abs(fbm(x * 0.045, y * 0.06 + 7, z * 0.045) - 0.5);
    if (crack < 0.028) return [mix(GOLD, 0xffe6a0, hash3(x, y, z)), false];
    const glass = mix(0x0c0c11, 0x23232c, noise(x * 0.2, y * 0.2, z * 0.2));
    return [kind === 'dark' ? 0x08080b : glass, false];
  },

  /** AUREUS: solid gold, engraved all over with dragon scales. */
  aureus(x, y, z, kind, face) {
    if (kind === 'dark') return [0x3a2a0e, false];
    if (kind === 'white') return [0xfff1c8, false];
    const u = x, w = face === 'side' ? y * 1.4 : z;
    const row = Math.floor(w / 6), off = row % 2 ? 4 : 0;
    const cx = Math.floor((u + off) / 8) * 8 + 4 - off, cy = row * 6;
    const d = Math.hypot((u - cx) * 0.75, w - cy);
    const base = mix(0xc8962e, 0xf0cc6a, noise(x * 0.3, y * 0.3, z * 0.3));
    return [d > 4.2 && d < 5.6 ? GOLD_DARK : base, false];
  },

  /** ZEUS: storm ivory over a deep sky-blue skirt, a lightning bolt crackling down each flank. */
  zeus(x, y, z, kind, face) {
    if (kind === 'white') return [GOLD, false];
    if (kind === 'dark') return [0x13284f, false];
    if (face === 'side' && x > -36 && x < 32) {
      // The bolt: a jagged line along the flank, dropping as it runs back.
      const seg = Math.floor((x + 36) / 9), t = ((x + 36) % 9) / 9;
      const yb = 9.5 - seg * 0.35 + (seg % 2 ? -2.6 : 2.6) * (t < 0.5 ? t * 2 : 2 - t * 2) - (seg % 2 ? -1.3 : 1.3);
      if (Math.abs(y - yb) < 1.3) return [0xaee8ff, true];
      if (Math.abs(y - yb) < 2.4) return [0x2a6fd0, false];
      if (y < 6) return [0x1e3a6b, false];
    }
    if (face === 'top' && Math.abs(z) > 9) return [0xdfe6f2, false];
    return [0xf4f1e8, false];
  },

  /** MARBLE: white Carrara, veined in grey with the odd thread of gold. */
  marble(x, y, z, kind) {
    if (kind === 'white') return [GOLD, false];
    const warp = fbm(x * 0.05, y * 0.07, z * 0.05) * 4.2;
    const v = Math.abs(Math.sin((x * 0.06 + z * 0.045 + y * 0.03 + warp) * Math.PI));
    const base = kind === 'dark' ? 0xd2ccc0 : mix(0xf6f3ec, 0xe6e1d6, noise(x * 0.15, y * 0.15, z * 0.15));
    if (v < 0.06) return [hash3(x, y, z) > 0.75 ? GOLD : 0x8f887c, false];
    if (v < 0.14) return [mix(base, 0xa8a196, 0.55), false];
    return [base, false];
  },

  /** HELIOS (SUNFIRE): dawn red at the tail burning to gold at the nose, a sunburst across the deck. */
  sunfire(x, y, z, kind, face) {
    if (kind === 'dark') return [0x3a1020, false];
    if (kind === 'white') return [0xffe7a8, false];
    const t = (x + 44) / 84;
    const base = t < 0.5 ? mix(0x8e1a2e, 0xff6a2a, t * 2) : mix(0xff6a2a, 0xffc85a, (t - 0.5) * 2);
    if (face === 'top') {
      const a = Math.atan2(z, x - 6);
      if (Math.floor((a / Math.PI) * 14 + 14) % 2 === 0) return [mix(base, 0xfff0b0, 0.35), false];
    }
    return [base, false];
  },

  /** OPAL: milky stone with a play of colour that shifts along the car, and glinting flecks. */
  opal(x, y, z, kind) {
    if (kind === 'dark') return [0x2a2244, false];
    const n = fbm(x * 0.05, y * 0.08, z * 0.05);
    if (hash3(x * 3, y * 3, z * 3) > 0.985) return [hsl(n * 2.3, 0.9, 0.82), true];
    const h = 0.5 + Math.sin(x * 0.045 + n * 5) * 0.22 + z * 0.004;
    return [kind === 'white' ? 0xffffff : hsl(h, 0.5, 0.78 + n * 0.08), false];
  },

  /** PLATINUM: brushed metal with art-deco chevrons racing forward over the deck. */
  platinum(x, y, z, kind, face) {
    if (kind === 'dark') return [0x5a606c, false];
    const brushed = mix(0xc4cad4, 0xe9edf3, hash3(Math.floor(x / 2), 0, Math.floor(z / 6)) * 0.7 + noise(0, y * 0.5, z * 0.5) * 0.3);
    if (kind === 'white') return [0xffffff, false];
    if (face === 'top') {
      const c = ((x - Math.abs(z) * 1.1) % 14 + 14) % 14;
      if (c < 2.5) return [0x3b414c, false];
      if (c < 4) return [0xffffff, false];
    }
    return [brushed, false];
  },

  /** ATLANTIS: deep sea teal, a gold Greek-key meander along each flank and gold-capped waves. */
  atlantis(x, y, z, kind, face) {
    if (kind === 'white') return [0xe2c27a, false];
    if (kind === 'dark') return [0x0b2a2e, false];
    if (face === 'side' && x > -32 && x < 28) {
      // A meander: a 6 x 5 cube motif repeating down the side, between y 4 and 12.
      const KEY = ['#####.', '....#.', '.##.#.', '.#..#.', '.####.'];
      const i = ((Math.floor((x + 32) / 2) % 6) + 6) % 6, r = 4 - Math.floor((y - 3) / 2);
      if (r >= 0 && r < 5 && KEY[r][i] === '#') return [GOLD, false];
    }
    if (face === 'top') {
      const wave = Math.sin(x * 0.35) * 1.6;
      if (Math.abs(Math.abs(z) - 9.5 - wave) < 1) return [0xe2c27a, false];
    }
    return [mix(0x0f4a52, 0x1f7f88, fbm(x * 0.05, y * 0.1, z * 0.05)), false];
  },

  /** IMPERIAL: Tyrian purple with gold eagle-wing chevrons at the nose, pinstripes and a scatter of gold fleurons. */
  imperial(x, y, z, kind, face) {
    if (kind === 'white') return [GOLD, false];
    if (kind === 'dark') return [0x140a2a, false];
    if (face === 'top' && x > 12) {
      const c = ((x + Math.abs(z) * 1.3) % 9 + 9) % 9;
      if (c < 2) return [GOLD, false];
    }
    if (face === 'side' && (Math.abs(y - 5) < 0.9 || Math.abs(y - 10) < 0.9)) return [GOLD, false];
    const gx = Math.round(x / 8) * 8, gz = Math.round((face === 'side' ? y * 2 : z) / 8) * 8;
    if (Math.abs(x - gx) + Math.abs((face === 'side' ? y * 2 : z) - gz) < 1.6 && (gx / 8 + gz / 8) % 2 === 0) return [0xd9b25b, false];
    return [mix(0x2e1659, 0x47267f, noise(x * 0.1, y * 0.1, z * 0.1)), false];
  },

  /** CIRCUIT: a dark slab of the old machine city, its traces still glowing. */
  circuit(x, y, z, kind, face) {
    if (kind === 'dark') return [0x070d10, false];
    const i = Math.floor(x / 2), k = Math.floor((face === 'side' ? y * 1.5 : z) / 2);
    const run = k % 3 === 0 && hash3(Math.floor(i / 5), k, 1) > 0.35;
    const jog = i % 5 === 0 && hash3(i, Math.floor(k / 3), 2) > 0.55;
    if (kind === 'white' || run || jog) return [(run && jog) ? 0xd8fff0 : 0x3fffb0, true];
    return [mix(0x10191d, 0x1d2c33, noise(x * 0.2, y * 0.2, z * 0.2)), false];
  },

  /** VANTA: the black that swallows light, cut by one blood-red line nose to tail. */
  vanta(x, y, z, kind, face) {
    if (kind === 'white') return [0xff2d55, true];
    if (face === 'side' && Math.abs(y - 8) < 0.9 && x > -36 && x < 30) return [0xff2d55, true];
    return [kind === 'dark' ? 0x050506 : 0x101013, false];
  },
};

/** Liveries whose trim metal isn't the usual gold (wing leading edges, intake rings, fairings). */
const METAL: Record<string, number> = { platinum: 0xe9eef5, vanta: 0x2a2a31, circuit: 0x2a3a42, obsidian: 0xe3b85a };

/** The trim metal for a skin's pattern (undefined = the usual gold). */
export function liveryMetal(pattern?: string): number | undefined {
  return pattern ? METAL[pattern] : undefined;
}

/** The painter for a skin's pattern (undefined = plain colours). */
export function liveryPainter(pattern?: string): Painter | undefined {
  return pattern ? PAINTERS[pattern] : undefined;
}
