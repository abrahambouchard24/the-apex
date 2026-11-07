// Chase camera: the same race drawn in 3D from behind the player's car, with three.js.
// Like render.ts it only reads game state. World (x, y) maps to three.js (x, z), with y up,
// so the circuits keep the layout they have from above.
//
// The cars are modelled from simple parts (hull, canopy, pods, wing, thrusters) in their livery
// colours; the track is built once per circuit from its sampled centerline.

import * as THREE from 'three';
import { CRAFT_LENGTH, type Camera, type Car, type Particle } from './render';
import { COOL_LANE, HALF_WIDTH, KERB_WIDTH, Track, WALL_DIST, WALL_THICKNESS } from './track';
import { groundCanvas, groundMoves, sceneryFor, type Prop } from './scenery';

const WALL_H = 24;            // barrier height
const KERB_CURVE = 1 / 900;   // corners tighter than this get kerbs (as in render.ts)
const ENERGY_FULL = 0.995;
const DRS_GLOW = 0x4dff9a, ERS_GLOW = 0xb86bff;

/**
 * Each circuit's atmosphere: time of day, sky, haze, light, and the clean architecture it is
 * built from. The look is restrained on purpose: light or neutral surfaces, one accent colour
 * (the track theme's), crisp glowing lines, and a quiet skyline sitting back in the haze.
 */
interface Atmos {
  sky: [string, string, string];   // zenith, mid, horizon
  sun: { color: string; elev: number; azim: number; size: number; light: number };
  stars: number;                   // how many (0 for daylight)
  fog: string; fogNear: number; fogFar: number;
  hemi: [string, string, number];  // sky light, ground light, intensity
  ground: string;                  // tint over the ground texture
  road: string;                    // racing deck
  wall: [string, string];          // barrier panel, top to foot
  skyline: 'towers' | 'city' | 'peaks' | 'dunes' | 'mesas' | 'clouds';
  skylineColor: string;
  windows: string;                 // the one colour building windows glow
  gates: number;                   // light gates arching over the track
}

const ATMOS: Record<string, Atmos> = {
  'APEX GRAND PRIX': {   // clear blue dusk, white circuit architecture
    sky: ['#14244f', '#3f6fb4', '#f2c9a4'], sun: { color: '#ffd9b0', elev: 0.12, azim: 2.4, size: 260, light: 1.6 }, stars: 0,
    fog: '#a9b9d6', fogNear: 2200, fogFar: 9500, hemi: ['#d8e4ff', '#3a3550', 1.7], ground: '#8a94b0',
    road: '#30374a', wall: ['#eef3fa', '#b7c3d8'], skyline: 'towers', skylineColor: '#7d90b8', windows: '#dbe9ff', gates: 3,
  },
  'VELOCITY RING': {     // golden hour over the stadium
    sky: ['#2c2a62', '#c8686a', '#ffd79a'], sun: { color: '#ffc27a', elev: 0.07, azim: 0.9, size: 420, light: 1.8 }, stars: 0,
    fog: '#e3a77e', fogNear: 2000, fogFar: 9000, hemi: ['#ffe2c4', '#4a3040', 1.6], ground: '#b89a86',
    road: '#36323c', wall: ['#fbf4ea', '#d6c2a8'], skyline: 'towers', skylineColor: '#a8768a', windows: '#ffe7c4', gates: 2,
  },
  'NEON STREETS': {      // the night track: a clean city under a magenta haze
    sky: ['#05040e', '#1b0d38', '#b02f7c'], sun: { color: '#ff9fd6', elev: 0.32, azim: 4.2, size: 120, light: 0.7 }, stars: 0,
    fog: '#2a1240', fogNear: 1400, fogFar: 7000, hemi: ['#9a8cff', '#1a1028', 1.25], ground: '#9aa0c8',
    road: '#1d1b2c', wall: ['#2a2442', '#14111f'], skyline: 'city', skylineColor: '#1a1030', windows: '#9fe9ff', gates: 4,
  },
  'SUMMIT PASS': {       // bright alpine day
    sky: ['#2f6fcf', '#86b9ee', '#eef6ff'], sun: { color: '#ffffff', elev: 0.6, azim: 3.6, size: 160, light: 2.3 }, stars: 0,
    fog: '#d6e4f3', fogNear: 2600, fogFar: 11000, hemi: ['#e6f0ff', '#5a6070', 1.9], ground: '#c4ccd8',
    road: '#40444f', wall: ['#f7f9fc', '#c8d2de'], skyline: 'peaks', skylineColor: '#9fb2cc', windows: '#e8f2ff', gates: 2,
  },
  'HARBOR LIGHTS': {     // blue hour, the sun going down over the sea
    sky: ['#0d1d44', '#355f9e', '#ffb07a'], sun: { color: '#ffb27a', elev: 0.05, azim: 5.5, size: 360, light: 1.4 }, stars: 30,
    fog: '#5c7aa6', fogNear: 2000, fogFar: 9000, hemi: ['#c4d6ff', '#202a40', 1.6], ground: '#2f5590',
    road: '#2c3446', wall: ['#eef4fb', '#b6c6da'], skyline: 'city', skylineColor: '#3a4d78', windows: '#ffe1b8', gates: 2,
  },
  'CRYSTAL CANYON': {    // violet twilight between the mesas
    sky: ['#0f0a2a', '#4a2b8a', '#f2a6d4'], sun: { color: '#ffc2e6', elev: 0.04, azim: 1.6, size: 300, light: 1.2 }, stars: 300,
    fog: '#5a3a86', fogNear: 1800, fogFar: 8000, hemi: ['#d8c4ff', '#24183a', 1.55], ground: '#b8a8d8',
    road: '#28233c', wall: ['#f1ebff', '#bcaee0'], skyline: 'mesas', skylineColor: '#4a3478', windows: '#e6d6ff', gates: 3,
  },
  'DESERT MIRAGE': {     // hot, bright afternoon
    sky: ['#2a68c8', '#7fb3ea', '#fde7bf'], sun: { color: '#fff4dc', elev: 0.45, azim: 0.4, size: 220, light: 2.4 }, stars: 0,
    fog: '#f0d8b0', fogNear: 2600, fogFar: 11000, hemi: ['#fff1dc', '#6a5038', 1.8], ground: '#f2dcb8',
    road: '#463e38', wall: ['#fff8ec', '#e2c9a2'], skyline: 'dunes', skylineColor: '#d8b483', windows: '#fff0d4', gates: 2,
  },
  'SKYLINE CAROUSEL': {  // sunset above the clouds
    sky: ['#1a1440', '#c64f86', '#ffcf8a'], sun: { color: '#ffb48a', elev: 0.08, azim: 3.1, size: 460, light: 1.6 }, stars: 0,
    fog: '#d48aa0', fogNear: 2000, fogFar: 9500, hemi: ['#ffd8e6', '#3a2440', 1.6], ground: '#c8a8c0',
    road: '#2e2838', wall: ['#fff6f8', '#dcc4d2'], skyline: 'clouds', skylineColor: '#f2c2cc', windows: '#ffd6e4', gates: 3,
  },
};
const DEFAULT_ATMOS = ATMOS['APEX GRAND PRIX'];

export interface ChaseScene {
  time: number; cam: Camera; player: Car; cars: Car[]; track: Track; particles: Particle[];
}

export class ChaseView {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(70, 1, 4, 12000);
  private world: TrackWorld | null = null;
  private rigs = new Map<Car, CarRig>();
  private camHeading = 0;
  private camFor: Car | null = null;
  private camPos = new THREE.Vector3();
  private lastNow = 0;
  private sparks: Sparks;
  private hemi = new THREE.HemisphereLight(0xc8d8ff, 0x261c34, 1.5);
  private sun = new THREE.DirectionalLight(0xffffff, 1.7);
  /** Dev only: orbit the player's car instead of chasing it (yaw relative to its heading). */
  debugCam: { yaw: number; dist: number; h: number } | null = null;

  constructor() {
    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '0', display: 'none' });
    document.body.prepend(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(this.hemi);
    this.sun.position.set(-0.5, 1, 0.35);
    this.scene.add(this.sun);
    this.sparks = new Sparks();
    this.scene.add(this.sparks.points);
  }

  set visible(on: boolean) { this.canvas.style.display = on ? 'block' : 'none'; }

  render(s: ChaseScene, pixelRatio: number): void {
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, Math.max(0, now - this.lastNow));
    this.lastNow = now;

    if (this.renderer.getPixelRatio() !== pixelRatio) this.renderer.setPixelRatio(pixelRatio);
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x !== innerWidth || size.y !== innerHeight) this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;

    if (!this.world || this.world.track !== s.track) {
      if (this.world) { this.scene.remove(this.world.group); dispose(this.world.group); }
      this.world = buildWorld(s.track, this.renderer.capabilities.getMaxAnisotropy());
      this.scene.add(this.world.group);
      // The track's atmosphere: sky colour behind the dome, haze, and the light it's lit by.
      const a = this.world.atmos;
      this.scene.background = new THREE.Color(a.sky[2]);
      this.scene.fog = new THREE.Fog(a.fog, a.fogNear, a.fogFar);
      this.hemi.color.set(a.hemi[0]); this.hemi.groundColor.set(a.hemi[1]); this.hemi.intensity = a.hemi[2];
      this.sun.color.set(a.sun.color); this.sun.intensity = a.sun.light;
      this.sun.position.set(Math.cos(a.sun.azim) * Math.cos(a.sun.elev), Math.max(0.25, Math.sin(a.sun.elev)), Math.sin(a.sun.azim) * Math.cos(a.sun.elev));
    }
    this.world.animate(s.time);

    // Car rigs: one per car, built the first time it's seen.
    const seen = new Set<Car>();
    for (const car of s.cars) {
      let rig = this.rigs.get(car);
      if (!rig) { rig = new CarRig(car); this.rigs.set(car, rig); this.scene.add(rig.root); }
      rig.update(car, s.time, dt);
      seen.add(car);
    }
    for (const [car, rig] of this.rigs) {
      if (!seen.has(car)) { this.scene.remove(rig.root); dispose(rig.root); this.rigs.delete(car); }
    }
    this.sparks.update(s.particles);
    this.updateCamera(s, dt);
    this.renderer.render(this.scene, this.camera);
  }

  /** Behind and above the player's car, swinging round after it a little late so drifts show. */
  private updateCamera(s: ChaseScene, dt: number): void {
    const c = s.player.craft;
    const speedFrac = Math.min(1, c.speed / 880);
    const jumped = this.camFor !== s.player || Math.hypot(this.camPos.x - c.pos.x, this.camPos.z - c.pos.y) > 900;
    if (jumped) this.camHeading = c.heading;
    else this.camHeading += wrapAngle(c.heading - this.camHeading) * (1 - Math.exp(-5.5 * dt));
    this.camFor = s.player;
    const back = 175 + speedFrac * 45, up = 62 + speedFrac * 8;
    const fx = Math.cos(this.camHeading), fy = Math.sin(this.camHeading);
    const shake = s.cam.shake * 0.5;
    this.camera.position.set(
      c.pos.x - fx * back + (Math.random() - 0.5) * shake,
      up + (Math.random() - 0.5) * shake,
      c.pos.y - fy * back + (Math.random() - 0.5) * shake);
    this.camPos.set(c.pos.x, 0, c.pos.y);
    this.camera.lookAt(c.pos.x + fx * 150, 14, c.pos.y + fy * 150);
    if (this.debugCam) {
      const a = c.heading + this.debugCam.yaw;
      this.camera.position.set(c.pos.x + Math.cos(a) * this.debugCam.dist, this.debugCam.h, c.pos.y + Math.sin(a) * this.debugCam.dist);
      this.camera.lookAt(c.pos.x, 10, c.pos.y);
    }
    this.camera.fov = 66 + speedFrac * 14;   // a little wider at speed, for the sense of pace
    this.camera.updateProjectionMatrix();
  }
}

// --- the circuit ---------------------------------------------------------------------------------

interface TrackWorld { track: Track; group: THREE.Group; atmos: Atmos; animate(time: number): void }

function buildWorld(track: Track, aniso: number): TrackWorld {
  const group = new THREE.Group();
  const theme = track.theme;
  const atmos = ATMOS[track.name] ?? DEFAULT_ATMOS;
  const pts = track.pts, m = pts.length;
  // Distance along the centerline at each sample (the last entry closes the loop).
  const dist = [0];
  for (let i = 1; i <= m; i++) dist.push(dist[i - 1] + Math.hypot(pts[i % m].x - pts[i - 1].x, pts[i % m].y - pts[i - 1].y));

  /** A strip along the track between two offsets from the centerline (left is +), at height y. */
  const ribbon = (from: number, to: number, dA: number, dB: number, yA: number, yB: number, vLen: number): THREE.BufferGeometry => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = from, k = 0; i <= to; i++, k++) {
      const p = pts[i % m];
      pos.push(p.x + p.nx * dA, yA, p.y + p.ny * dA, p.x + p.nx * dB, yB, p.y + p.ny * dB);
      const v = (dist[i % (m + 1)] + (i > m ? dist[m] : 0)) / vLen;
      uv.push(0, v, 1, v);
      if (k) idx.push(2 * k - 2, 2 * k - 1, 2 * k, 2 * k - 1, 2 * k + 1, 2 * k);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  };
  const tex = (c: HTMLCanvasElement, repeat = true) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  const basic = (o: THREE.MeshBasicMaterialParameters) => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, ...o });
  const additive = (o: THREE.MeshBasicMaterialParameters) =>
    basic({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true, ...o });
  const add = (g: THREE.BufferGeometry, mat: THREE.Material, order = 0) => {
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = order;
    group.add(mesh);
    return mesh;
  };

  // Ground: the track's own ground tile, repeated (Harbor Lights' water drifts).
  const b = track.bounds, margin = 7000;
  const gw = b.maxX - b.minX + margin * 2, gh = b.maxY - b.minY + margin * 2;
  // A light, clean ground in the atmosphere's colour, with the track's own pattern laid faintly over it.
  const groundTex = tex(canvas2d(512, 512, (g) => {
    g.fillStyle = atmos.ground; g.fillRect(0, 0, 512, 512);
    g.globalAlpha = groundMoves(track) ? 0.5 : 0.22;   // water keeps more of its waves
    g.drawImage(groundCanvas(sceneryFor(track).ground), 0, 0, 512, 512);
  }));
  groundTex.repeat.set(gw / 512, gh / 512);
  const ground = new THREE.PlaneGeometry(gw, gh).rotateX(-Math.PI / 2);
  add(ground, basic({ map: groundTex })).position.set((b.minX + b.maxX) / 2, -1, (b.minY + b.maxY) / 2);

  // Racing surface: the deck, darker toward the edges, with plate seams and lane guides.
  const road = canvas2d(256, 256, (g) => {
    g.fillStyle = atmos.road; g.fillRect(0, 0, 256, 256);
    const across = g.createLinearGradient(0, 0, 256, 0);
    across.addColorStop(0, 'rgba(0,0,0,0.3)'); across.addColorStop(0.14, 'rgba(0,0,0,0.05)');
    across.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    across.addColorStop(0.86, 'rgba(0,0,0,0.05)'); across.addColorStop(1, 'rgba(0,0,0,0.3)');
    g.fillStyle = across; g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(16, 0, 224, 3);
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(16, 3, 224, 1);
    g.fillStyle = theme.wall; g.globalAlpha = 0.28;
    for (const u of [256 / 3, 512 / 3]) { g.fillRect(u - 1.5, 30, 3, 70); g.fillRect(u - 1.5, 158, 3, 70); }
  });
  add(ribbon(0, m, HALF_WIDTH, -HALF_WIDTH, 0, 0, 128), basic({ map: tex(road) }));

  // Kerbs through the corners: lit and dark blocks in turn, slightly raised.
  {
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const lit = new THREE.Color(theme.kerb), dark = new THREE.Color('#0d0f1c');
    for (let i = 0; i < m; i++) {
      if (Math.abs(pts[i].curve) < KERB_CURVE) continue;
      const c = Math.floor(i / 2) % 2 ? lit : dark;
      for (const side of [1, -1]) {
        const base = pos.length / 3;
        for (const [j, d] of [[i, HALF_WIDTH - KERB_WIDTH], [i + 1, HALF_WIDTH - KERB_WIDTH], [i + 1, HALF_WIDTH], [i, HALF_WIDTH]] as const) {
          const p = pts[j % m];
          pos.push(p.x + p.nx * d * side, 0.8, p.y + p.ny * d * side);
          col.push(c.r, c.g, c.b);
        }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    add(g, basic({ vertexColors: true }));
  }

  // Barriers: a dark panel facing the track with a bright foot and a coloured top edge, the top,
  // the outer face, and a neon glow on the ground outside.
  const face = canvas2d(4, 64, (g) => {
    const v = g.createLinearGradient(0, 0, 0, 64);
    v.addColorStop(0, atmos.wall[0]); v.addColorStop(1, atmos.wall[1]);
    g.fillStyle = v; g.fillRect(0, 0, 4, 64);
    g.fillStyle = theme.wall; g.fillRect(0, 0, 4, 7);
    g.fillStyle = theme.wallFace; g.fillRect(0, 60, 4, 4);
  });
  const faceTex = tex(face, false);
  const faceMat = basic({ map: faceTex });
  const topMat = basic({ color: theme.wall });
  const outerMat = basic({ color: new THREE.Color(atmos.wall[1]).multiplyScalar(0.75) });
  const glow = canvas2d(64, 4, (g) => {
    const h = g.createLinearGradient(0, 0, 64, 0);
    h.addColorStop(0, 'rgba(255,255,255,0.55)'); h.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = h; g.fillRect(0, 0, 64, 4);
  });
  const glowMat = additive({ map: tex(glow, false), color: theme.wall });
  // The rail pulses streaming forward along the top of the wall.
  const pulse = canvas2d(8, 256, (g) => {
    const v = g.createLinearGradient(0, 0, 0, 40);
    v.addColorStop(0, 'rgba(255,255,255,0)'); v.addColorStop(0.7, 'rgba(255,255,255,1)'); v.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = v; g.fillRect(0, 0, 8, 40);
  });
  const pulseTex = tex(pulse);
  const pulseMat = additive({ map: pulseTex });
  // Lights set into the top of the barriers.
  const lamp = canvas2d(16, 64, (g) => {
    const r = g.createRadialGradient(8, 32, 0, 8, 32, 7);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 16, 64);
  });
  const lampMat = additive({ map: tex(lamp), color: `rgb(${theme.lights})` });
  for (const side of [1, -1]) {
    const inner = side * HALF_WIDTH, outer = side * WALL_DIST, mid = side * (HALF_WIDTH + WALL_THICKNESS / 2);
    add(ribbon(0, m, inner, inner, WALL_H, 0, 1e9), faceMat).geometry.setAttribute('uv', wallUv(m));
    add(ribbon(0, m, inner, outer, WALL_H, WALL_H, 1e9), topMat);
    add(ribbon(0, m, outer, outer, WALL_H, 0, 1e9), outerMat);
    add(ribbon(0, m, outer, outer + side * 46, 0.4, 0.4, 1e9), glowMat, 1).geometry.setAttribute('uv', glowUv(m));
    const railD = side * (HALF_WIDTH - 0.6);
    add(ribbon(0, m, railD, railD, WALL_H - 1, WALL_H - 6, 376), pulseMat, 2);
    add(ribbon(0, m, mid - side * 3, mid + side * 3, WALL_H + 0.3, WALL_H + 0.3, 110), lampMat, 2);
  }

  // Cooling lane: a tinted band with chevrons flowing along it.
  const coolIn = COOL_LANE.side * (HALF_WIDTH - COOL_LANE.width), coolOut = COOL_LANE.side * HALF_WIDTH;
  add(ribbon(COOL_LANE.from, COOL_LANE.to, coolIn, coolOut, 0.5, 0.5, 1e9), basic({ color: 0x5ad2ff, transparent: true, opacity: 0.2, depthWrite: false }), 1);
  const chev = canvas2d(64, 64, (g) => {
    g.strokeStyle = 'rgba(150,235,255,0.8)'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(12, 44); g.lineTo(32, 22); g.lineTo(52, 44); g.stroke();
  });
  const chevTex = tex(chev);
  add(ribbon(COOL_LANE.from, COOL_LANE.to, coolIn, coolOut, 0.7, 0.7, 60), additive({ map: chevTex }), 2);
  {
    const s = pts[COOL_LANE.from + 2], d = COOL_LANE.side * (HALF_WIDTH - COOL_LANE.width / 2);
    const label = textPlane('COOL', 'rgba(200,245,255,0.9)', 46, 18);
    label.position.set(s.x + s.nx * d, 0.9, s.y + s.ny * d);
    label.rotation.y = -track.direction(COOL_LANE.from + 2) - Math.PI / 2;
    group.add(label);
  }

  // DRS zones: a dashed green line across the track where each starts, fainter where it ends.
  for (const z of track.drsZones) {
    for (const [i, start] of [[z.from, true], [z.to, false]] as const) {
      const p = pts[i];
      const line = new THREE.Mesh(new THREE.PlaneGeometry(start ? 5 : 3, HALF_WIDTH * 2 - 12).rotateX(-Math.PI / 2),
        basic({ map: tex(canvas2d(4, 64, (g) => { for (let k = 0; k < 64; k += 11) { g.fillStyle = '#4dff9a'; g.fillRect(0, k, 4, 6); } }), false),
          transparent: true, opacity: start ? 0.9 : 0.4, depthWrite: false }));
      line.position.set(p.x, 0.9, p.y);
      line.rotation.y = -track.direction(i);
      group.add(line);
      if (start) {
        const label = textPlane('DRS', 'rgba(77,255,154,0.85)', 40, 16);
        const d = track.direction(i);
        label.position.set(p.x - Math.cos(d) * 30, 0.9, p.y - Math.sin(d) * 30);
        label.rotation.y = -d - Math.PI / 2;
        group.add(label);
      }
    }
  }

  // Start line: a checkered band and a lit gantry over the track.
  {
    const p = pts[0], dir = track.direction(0);
    const checker = canvas2d(32, 320, (g) => {
      for (let r = 0; r < 2; r++) for (let c = 0; c < 20; c++) { g.fillStyle = (r + c) % 2 ? '#0a0a12' : '#ffffff'; g.fillRect(r * 16, c * 16, 16, 16); }
    });
    const band = new THREE.Mesh(new THREE.PlaneGeometry(26, HALF_WIDTH * 2).rotateX(-Math.PI / 2), basic({ map: tex(checker, false) }));
    band.position.set(p.x, 0.9, p.y);
    band.rotation.y = -dir;
    group.add(band);
    const gantry = new THREE.Group();
    const lightCol = new THREE.Color(`rgb(${theme.lights})`);
    const postMat = new THREE.MeshPhongMaterial({ color: 0x1b2348, emissive: 0x0b1028 });
    const span = WALL_DIST * 2 + 16;
    for (const side of [1, -1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(10, 120, 10), postMat);
      post.position.set(0, 60, side * span / 2);
      gantry.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(12, 14, span + 10), postMat);
    beam.position.y = 120;
    gantry.add(beam);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(13, 3, span + 12), basic({ color: lightCol }));
    strip.position.y = 114;
    gantry.add(strip);
    const sign = textPlane('THE APEX', '#ffffff', 150, 22, theme.wall);
    sign.geometry.rotateX(Math.PI / 2).rotateY(Math.PI / 2);   // stand it up, facing the oncoming cars
    sign.position.set(-6.5, 120, 0);
    gantry.add(bothWays(sign));
    gantry.position.set(p.x, 0, p.y);
    gantry.rotation.y = -dir;
    group.add(gantry);
  }

  // Scenery props, as simple 3D shapes.
  const spinners: { obj: THREE.Object3D; axis: 'x' | 'y' | 'z'; rate: number }[] = [];
  const sc = sceneryFor(track);
  for (const p of [...sc.props, ...sc.overlays]) {
    const obj = propObject(p, spinners, atmos, theme.wall);
    if (obj) group.add(obj);
  }

  // Light gates: slim white arches over the track with a soft line of the accent colour inside.
  {
    const gateMat = new THREE.MeshPhongMaterial({ color: 0xf4f7fc, emissive: 0x30343e, shininess: 60 });
    const lineMat = additive({ color: theme.wall, opacity: 0.85 });
    const span = WALL_DIST + 10;
    for (let k = 1; k <= atmos.gates; k++) {
      const i = Math.floor((k / (atmos.gates + 1)) * m);
      const p = pts[i], dir = track.direction(i);
      const gate = new THREE.Group();
      gate.add(new THREE.Mesh(new THREE.TorusGeometry(span, 6, 10, 48, Math.PI), gateMat));
      gate.add(new THREE.Mesh(new THREE.TorusGeometry(span - 7, 1.6, 6, 48, Math.PI), lineMat));
      gate.position.set(p.x, 0, p.y);
      gate.rotation.y = -dir + Math.PI / 2;   // the arch stands across the road
      group.add(gate);
    }
  }

  // Sky: a smooth gradient dome (zenith to horizon), the sun low in it, and stars only where it's dark.
  const cx = (b.minX + b.maxX) / 2, cz = (b.minY + b.maxY) / 2;
  const skyTex = canvas2d(4, 256, (g) => {
    const v = g.createLinearGradient(0, 0, 0, 256);
    // The chase camera mostly sees the lowest part of the dome, so the middle colour sits low.
    v.addColorStop(0, atmos.sky[0]); v.addColorStop(0.8, atmos.sky[1]); v.addColorStop(1, atmos.sky[2]);
    g.fillStyle = v; g.fillRect(0, 0, 4, 256);
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(10000, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: tex(skyTex, false), side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.position.set(cx, -40, cz);
  dome.renderOrder = -2;
  group.add(dome);
  {
    // The sun: a soft disc with a wide glow, sitting in the sky in the light's direction.
    const sunTex = canvas2d(128, 128, (g) => {
      const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.16, 'rgba(255,255,255,0.95)');
      r.addColorStop(0.22, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    });
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(sunTex, false), color: atmos.sun.color, fog: false,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const R = 9200, e = atmos.sun.elev, az = atmos.sun.azim;
    sun.position.set(cx + Math.cos(az) * Math.cos(e) * R, Math.sin(e) * R + 80, cz + Math.sin(az) * Math.cos(e) * R);
    sun.scale.setScalar(atmos.sun.size * 6);
    sun.renderOrder = -1;
    group.add(sun);
  }
  if (atmos.stars) {
    const star: number[] = [];
    for (let k = 0; k < atmos.stars; k++) {
      const a = Math.random() * Math.PI * 2, e = 0.35 + Math.random() * 1.1;
      star.push(cx + Math.cos(a) * Math.cos(e) * 9000, Math.sin(e) * 9000, cz + Math.sin(a) * Math.cos(e) * 9000);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(star, 3));
    group.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xe6ecff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 })));
  }
  group.add(skyline(atmos, cx, cz, Math.max(b.maxX - b.minX, b.maxY - b.minY) / 2 + 4800));

  const water = groundMoves(track);
  return {
    track, group, atmos,
    animate(time: number) {
      pulseTex.offset.y = -(time * 1100) / 376;
      lampMat.opacity = 0.55 + 0.45 * Math.sin(time * 4);
      chevTex.offset.y = -time * 0.35 * 9;
      if (water) groundTex.offset.set(-(time * 18) / 512, (time * 7) / 512);
      for (const s of spinners) s.obj.rotation[s.axis] = time * s.rate;
    },
  };
}

/**
 * A quiet ring of silhouettes on the horizon: towers, a city, peaks, dunes, mesas or a cloud
 * bank. One instanced shape, flat colour, no fog, so it reads as distant and doesn't compete.
 */
function skyline(a: Atmos, cx: number, cz: number, radius: number): THREE.Object3D {
  const n = a.skyline === 'city' ? 150 : a.skyline === 'towers' ? 44 : a.skyline === 'clouds' ? 60 : 46;
  const geo = a.skyline === 'peaks' ? new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0)
    : a.skyline === 'dunes' || a.skyline === 'clouds' ? new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)
    : a.skyline === 'mesas' ? new THREE.CylinderGeometry(0.85, 1, 1, 9).translate(0, 0.5, 0)
    : new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  // Atmospheric perspective: the silhouettes take on some of the horizon's colour.
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(a.skylineColor).lerp(new THREE.Color(a.sky[2]), 0.3), fog: false });
  const inst = new THREE.InstancedMesh(geo, mat, n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  let seed = 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < n; k++) {
    const ang = (k / n) * Math.PI * 2 + rand() * 0.04;
    const r = radius * (1 + rand() * 0.25);
    pos.set(cx + Math.cos(ang) * r, -20, cz + Math.sin(ang) * r);
    switch (a.skyline) {
      case 'towers': scl.set(60 + rand() * 70, 300 + rand() * (rand() < 0.3 ? 1300 : 600), 60 + rand() * 70); break;
      case 'city': scl.set(120 + rand() * 200, 150 + rand() * (rand() < 0.2 ? 900 : 380), 120 + rand() * 200); break;
      case 'peaks': scl.set(700 + rand() * 900, 600 + rand() * 1100, 700 + rand() * 900); break;
      case 'dunes': scl.set(900 + rand() * 900, 120 + rand() * 160, 600 + rand() * 600); break;
      case 'mesas': scl.set(400 + rand() * 600, 260 + rand() * 420, 400 + rand() * 600); break;
      case 'clouds': scl.set(900 + rand() * 900, 140 + rand() * 120, 700 + rand() * 700); pos.y = -60; break;
    }
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI);
    m4.compose(pos, q, scl);
    inst.setMatrixAt(k, m4);
  }
  inst.renderOrder = -1;
  return inst;
}

/** Wall faces map the full texture height from top to bottom. */
function wallUv(m: number): THREE.Float32BufferAttribute {
  const uv: number[] = [];
  for (let i = 0; i <= m; i++) uv.push(0.5, 1, 0.5, 0);
  return new THREE.Float32BufferAttribute(uv, 2);
}

/** The ground glow fades from the wall outward. */
function glowUv(m: number): THREE.Float32BufferAttribute {
  const uv: number[] = [];
  for (let i = 0; i <= m; i++) uv.push(0, 0.5, 1, 0.5);
  return new THREE.Float32BufferAttribute(uv, 2);
}

// --- scenery ---------------------------------------------------------------------------------------

function propObject(p: Prop, spinners: { obj: THREE.Object3D; axis: 'x' | 'y' | 'z'; rate: number }[], atmos: Atmos, accent: string): THREE.Object3D | null {
  const g = new THREE.Group();
  g.position.set(p.x, 0, p.y);
  g.rotation.y = -(p.rot ?? 0);
  const phong = (color: THREE.ColorRepresentation, emissive: THREE.ColorRepresentation = 0x000000) => new THREE.MeshPhongMaterial({ color, emissive, flatShading: true });
  const glowing = (color: THREE.ColorRepresentation) => new THREE.MeshBasicMaterial({ color });
  const put = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  const w = p.w ?? p.r * 1.6, d = p.d ?? p.r * 1.6, h = Math.max(4, p.h);
  switch (p.kind) {
    case 'pine': case 'pine-snow': {
      put(new THREE.CylinderGeometry(3, 4, 14, 6), phong(0x4a3424), 0, 7);
      put(new THREE.ConeGeometry(p.r * 0.75, p.r * 2.4, 7), phong(0x1f5a3c), 0, 14 + p.r * 1.2);
      if (p.kind === 'pine-snow') put(new THREE.ConeGeometry(p.r * 0.4, p.r * 1.1, 7), phong(0xeef4ff), 0, 14 + p.r * 1.95);
      break;
    }
    case 'rock':
      put(new THREE.DodecahedronGeometry(p.r * 0.7, 0), phong(p.color ?? 0x5a5c6e), 0, p.r * 0.2).scale.set(1, 0.55, 1);
      break;
    case 'peak': {
      const col = p.color === 'violet' ? 0x5b3b8c : 0x4a4f66;
      put(new THREE.ConeGeometry(p.r, h * 2.2, 7), phong(col), 0, h * 1.1);
      put(new THREE.ConeGeometry(p.r * 0.34, h * 0.75, 7), phong(p.color === 'violet' ? 0xd7b8ff : 0xf2f6ff), 0, h * 1.85);
      break;
    }
    case 'pyramid':
      put(new THREE.ConeGeometry(p.r, h, 4), phong(0xc99a5b), 0, h / 2).rotation.y = Math.PI / 4;
      break;
    case 'crystal':
      put(new THREE.OctahedronGeometry(p.r * 0.5, 0), new THREE.MeshPhongMaterial({ color: p.color ?? 0xb48cff, emissive: p.color ?? 0x6a3cff, emissiveIntensity: 0.6, transparent: true, opacity: 0.85, flatShading: true }), 0, h * 0.6).scale.set(1, h / p.r * 1.4, 1);
      break;
    case 'floodlight': {
      put(new THREE.CylinderGeometry(2.5, 3.5, h, 6), phong(0x3a4060), 0, h / 2);
      put(new THREE.BoxGeometry(26, 8, 14), glowing(0xfff6d8), 0, h + 4);
      break;
    }
    case 'building': case 'skyscraper': case 'container': case 'grandstand': {
      const tall = p.kind === 'skyscraper' || p.kind === 'building';
      const body = put(new THREE.BoxGeometry(w, h, d), tall ? windowsMaterial(p.color ?? '#20253d', atmos.windows, w, h)
        : phong(p.color ?? (p.kind === 'grandstand' ? 0xdfe4ee : 0x8a3b3b)), 0, h / 2);
      if (p.kind === 'grandstand') {
        // Clean tiers with a single soft accent line along the front edge.
        for (let k = 0; k < 4; k++) put(new THREE.BoxGeometry(w * 0.98, 2, d * 0.22), phong(0xe9edf5), 0, h * (0.3 + k * 0.18), -d * 0.3 + k * d * 0.2);
        put(new THREE.BoxGeometry(w * 0.98, 1.6, 1.6), glowing(accent), 0, h * 0.3 + 1.5, -d * 0.3 - d * 0.11);
      }
      // One accent for the whole skyline: every roof trim in the track's colour.
      if (p.accent) put(new THREE.BoxGeometry(w + 2, 3, d + 2), glowing(accent), 0, h + 1.5);
      if (p.text) {
        const sign = textPlane(p.text, '#ffffff', Math.min(w * 0.8, 260), 34, p.accent ?? '#4fe3ff');
        sign.geometry.rotateX(Math.PI / 2);
        sign.position.set(0, h * 0.6, d / 2 + 1);
        g.add(sign);
      }
      void body;
      break;
    }
    case 'billboard': case 'scoreboard': {
      const pw = p.w ?? 240, ph = p.kind === 'scoreboard' ? 90 : 60;
      for (const s of [-1, 1]) put(new THREE.BoxGeometry(5, h, 5), phong(0x30365a), s * pw * 0.35, h / 2);
      const sign = textPlane(p.text ?? '', '#ffffff', pw, ph, p.accent ?? '#4fe3ff');
      sign.geometry.rotateX(Math.PI / 2);
      sign.position.set(0, h + ph / 2, 0);
      g.add(bothWays(sign));
      spinners.push({ obj: sign, axis: 'y', rate: p.kind === 'scoreboard' ? 0.25 : 0 });
      break;
    }
    case 'lighthouse': {
      const tower = new THREE.CylinderGeometry(p.r * 0.16, p.r * 0.26, h * 0.6, 14);
      put(tower, phong(0xf2f2f2), 0, h * 0.3);
      for (let k = 0; k < 3; k++) put(new THREE.CylinderGeometry(p.r * 0.2 - k * 2, p.r * 0.22 - k * 2, 18, 14), phong(0xd8364a), 0, h * (0.1 + k * 0.17));
      put(new THREE.SphereGeometry(p.r * 0.14, 12, 8), glowing(0xfff3b0), 0, h * 0.63);
      break;
    }
    case 'beam': {
      const beam = new THREE.Group();
      const cone = new THREE.Mesh(new THREE.ConeGeometry(220, 1600, 24, 1, true).translate(0, -800, 0).rotateZ(Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      beam.add(cone);
      beam.position.y = h * 0.63;
      g.add(beam);
      spinners.push({ obj: beam, axis: 'y', rate: 0.6 });
      break;
    }
    case 'blimp': {
      const orbit = new THREE.Group();
      const blimp = new THREE.Group();
      blimp.add(new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12).scale(130, 40, 40), phong(0xe8ecff)));
      const sign = textPlane(p.text ?? 'APEX', '#ff3d6e', 150, 30);
      sign.geometry.rotateX(Math.PI / 2);
      sign.position.z = 41;
      blimp.add(sign);
      blimp.position.set(p.r * 0.6, 520, 0);
      orbit.add(blimp);
      g.add(orbit);
      spinners.push({ obj: orbit, axis: 'y', rate: 0.05 });
      break;
    }
    case 'turbine': {
      put(new THREE.CylinderGeometry(3, 6, h, 8), phong(0xe8e8f0), 0, h / 2);
      const rotor = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(4, 90, 2).translate(0, 45, 0), phong(0xf4f4fa));
        blade.rotation.z = (k / 3) * Math.PI * 2;
        rotor.add(blade);
      }
      rotor.position.set(0, h, 6);
      g.add(rotor);
      spinners.push({ obj: rotor, axis: 'z', rate: 1.2 + (p.seed % 1) });
      break;
    }
    case 'crane': {
      put(new THREE.BoxGeometry(14, h, 14), phong(0xf2b233), 0, h / 2);
      put(new THREE.BoxGeometry(220, 10, 10), phong(0xf2b233), 60, h);
      break;
    }
    case 'solar':
      put(new THREE.BoxGeometry(w, 3, d), phong(0x1b2c66, 0x0a1440), 0, 8).rotation.x = 0.35;
      break;
    case 'pier':
      put(new THREE.BoxGeometry(w, 4, d), phong(0x3a3f52), 0, 1);
      break;
    case 'helipad': {
      put(new THREE.CylinderGeometry(p.r * 0.8, p.r * 0.8, 2, 32), phong(0x2a2f44), 0, 1);
      const hmark = textPlane('H', '#ffffff', 60, 60);
      hmark.position.y = 2.2;
      g.add(hmark);
      break;
    }
    case 'boat':
      put(new THREE.BoxGeometry(110, 14, 34), phong(0xe9edf6), 0, 6);
      put(new THREE.BoxGeometry(40, 12, 24), phong(p.accent ?? 0x3fd0ff), -10, 19);
      break;
    default:
      if (p.layer === 0 && p.h === 0) return null;
      put(new THREE.BoxGeometry(w, h, d), phong(p.color ?? 0x2a2f48), 0, h / 2);
  }
  return g;
}

/** Building sides with a grid of lit windows. */
function windowsMaterial(base: string, lit: string, w: number, h: number): THREE.Material {
  // Clean floor bands: a glazed strip of light along each storey, a few dimmed, all one colour.
  const c = canvas2d(64, 128, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 64, 128);
    for (let y = 8; y < 128; y += 16) {
      g.fillStyle = lit;
      g.globalAlpha = Math.random() < 0.18 ? 0.18 : 0.75;
      g.fillRect(0, y, 64, 4);
      g.globalAlpha = 0.12;
      g.fillRect(0, y - 3, 64, 3);
    }
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(255,255,255,0.08)';   // slim mullions
    for (let x = 0; x < 64; x += 16) g.fillRect(x, 0, 1, 128);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(Math.max(1, w / 64), Math.max(1, h / 128));
  return new THREE.MeshBasicMaterial({ map: t });
}

// --- the cars ------------------------------------------------------------------------------------

/**
 * The hovercraft, built from voxels (4 px cubes) for a pixel-art look: 20 long, 11 wide, 6 tall,
 * nose along +x. Each car is two instanced meshes (lit cubes and glowing cubes) plus its wing.
 */
const VOX = 4;
type VoxKind = 'paint' | 'dark' | 'carbon' | 'glass' | 'shine' | 'white' | 'intake' | 'nozzle';
interface Voxel { x: number; y: number; z: number; kind: VoxKind }
const GLOWING: VoxKind[] = ['intake', 'nozzle'];

/** Half-width of the hull (in voxels) at each step from the tail (0) to the nose (19). */
const HULL_HW = [2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 1, 1, 0];

function hullVoxels(): Voxel[] {
  const grid = new Map<string, Voxel>();
  const set = (x: number, y: number, z: number, kind: VoxKind) => grid.set(`${x},${y},${z}`, { x, y, z, kind });
  for (let x = 0; x < 20; x++) {
    const hw = HULL_HW[x];
    if (x >= 1 && x <= 17) for (let z = -hw - 1; z <= hw + 1; z++) set(x, 0, z, 'carbon');           // hover skirt
    for (let z = -hw; z <= hw; z++) set(x, 1, z, 'paint');                                             // lower hull
    if (x >= 1 && x <= 17) for (let z = -(hw - 1); z <= hw - 1; z++) set(x, 2, z, x >= 7 && z === 0 ? 'white' : 'paint');
  }
  for (const z of [-4, 4]) {
    for (let x = 3; x <= 13; x++) for (const y of [1, 2]) set(x, y, z, 'dark');                       // side pods
    for (const y of [1, 2]) set(14, y, z, 'intake');
  }
  for (let x = 9; x <= 13; x++) for (let z = -1; z <= 1; z++) set(x, 3, z, x === 12 && z === -1 ? 'shine' : 'glass');  // canopy
  set(10, 4, 0, 'glass');
  for (let x = 1; x <= 6; x++) for (let z = -2; z <= 2; z++) set(x, 3, z, 'dark');                    // engine cover
  for (let x = 18; x <= 19; x++) for (let z = -5; z <= 5; z++) set(x, 0, z, Math.abs(z) === 5 ? 'paint' : 'carbon');  // front wing
  for (const z of [-5, 5]) for (let x = 18; x <= 19; x++) set(x, 1, z, 'paint');
  for (const z of [-2, 2]) {
    for (const y of [1, 2]) { set(0, y, z, 'carbon'); set(-1, y, z, 'nozzle'); }                      // thrusters
    for (const y of [3, 4]) set(1, y, z, 'carbon');                                                    // wing struts
  }
  return [...grid.values()];
}

/** The rear wing, around its pivot (it tilts flat when DRS opens). */
function wingVoxels(): Voxel[] {
  const v: Voxel[] = [];
  for (let x = -1; x <= 1; x++) for (let z = -5; z <= 5; z++) v.push({ x, y: 0, z, kind: 'carbon' });
  for (const z of [-5, 5]) for (let x = -1; x <= 1; x++) v.push({ x, y: -1, z, kind: 'paint' });
  return v;
}

let shared: { cube: THREE.BufferGeometry; flame: THREE.BufferGeometry; aura: THREE.BufferGeometry; glow: THREE.Texture; shadow: THREE.Texture } | null = null;
const sharedRes = new Set<unknown>();

function carShared() {
  if (shared) return shared;
  const radial = (inner: string, outer: string) => {
    const t = new THREE.CanvasTexture(canvas2d(64, 64, (g) => {
      const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, inner); r.addColorStop(1, outer);
      g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    }));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  shared = {
    cube: new THREE.BoxGeometry(VOX, VOX, VOX),
    // A block one unit long reaching back along -x from the nozzle (scaled to the flame length).
    flame: new THREE.BoxGeometry(1, 7, 7).translate(-0.5, 0, 0),
    aura: new THREE.BoxGeometry(CRAFT_LENGTH + 12, 30, 52).translate(0, 12, 0),
    glow: radial('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'),
    shadow: radial('rgba(0,0,0,0.7)', 'rgba(0,0,0,0)'),
  };
  for (const r of Object.values(shared)) sharedRes.add(r);
  return shared;
}

/** Voxels as two instanced meshes: shaded cubes, and glowing ones that ignore the lighting. */
function voxelMeshes(voxels: Voxel[], colors: Record<VoxKind, THREE.Color>, origin: [number, number, number]): THREE.Object3D[] {
  const s = carShared();
  const out: THREE.Object3D[] = [];
  for (const glowing of [false, true]) {
    const list = voxels.filter((v) => GLOWING.includes(v.kind) === glowing);
    if (!list.length) continue;
    const mat = glowing ? new THREE.MeshBasicMaterial() : new THREE.MeshLambertMaterial();
    const inst = new THREE.InstancedMesh(s.cube, mat, list.length);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    list.forEach((v, i) => {
      m4.makeTranslation((v.x - origin[0]) * VOX, (v.y - origin[1]) * VOX + VOX / 2, (v.z - origin[2]) * VOX);
      inst.setMatrixAt(i, m4);
      // A little per-cube shade variation, so the surfaces read as pixels.
      const hash = (((v.x + 7) * 73856093) ^ ((v.y + 7) * 19349663) ^ ((v.z + 7) * 83492791)) >>> 0;
      const jitter = glowing ? 1 : 0.93 + (hash % 100) / 100 * 0.14;
      inst.setColorAt(i, col.copy(colors[v.kind]).multiplyScalar(jitter));
    });
    out.push(inst);
  }
  return out;
}

class CarRig {
  root = new THREE.Group();
  private body = new THREE.Group();
  private wing = new THREE.Group();
  private flames: THREE.Mesh[] = [];
  private flameMat: THREE.MeshBasicMaterial;
  private aura: THREE.Mesh;
  private auraMat: THREE.MeshBasicMaterial;
  private lastHeading: number | null = null;
  private roll = 0;
  private pitch = 0;
  private wingTilt = 0;

  constructor(car: Car) {
    const s = carShared();
    const livery = new THREE.Color(car.color);
    const colors: Record<VoxKind, THREE.Color> = {
      paint: livery, dark: livery.clone().multiplyScalar(0.5), carbon: new THREE.Color(0x1a1d2e),
      glass: new THREE.Color(0x10204a), shine: new THREE.Color(0x7fb4ff), white: new THREE.Color(0xf2f4ff),
      intake: new THREE.Color(0xdff6ff), nozzle: new THREE.Color(0xbff4ff),
    };
    // Grid x 0..19 is centred on the car; the wing's pivot sits above the tail.
    for (const m of voxelMeshes(hullVoxels(), colors, [9.5, 0, 0])) this.body.add(m);
    for (const m of voxelMeshes(wingVoxels(), colors, [0, 0, 0])) this.wing.add(m);
    this.wing.position.set((1 - 9.5) * VOX, 5 * VOX, 0);
    this.body.add(this.wing);

    // The car number on the engine cover, in chunky pixels.
    const num = car.name.match(/^\d+/)?.[0];
    if (num) {
      const decal = textPlane(num, '#ffffff', 16, 10);
      const map = (decal.material as THREE.MeshBasicMaterial).map!;
      map.magFilter = THREE.NearestFilter;
      map.minFilter = THREE.NearestFilter;
      decal.geometry.rotateY(-Math.PI / 2);
      decal.position.set((3.5 - 9.5) * VOX, 4 * VOX + 0.2, 0);
      this.body.add(decal);
    }

    // Blocky flames out of the twin thrusters.
    this.flameMat = new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
    for (const z of [-2, 2]) {
      const f = mesh(s.flame, this.flameMat, this.body);
      f.position.set((-1.5 - 9.5) * VOX, 2 * VOX, z * VOX);
      this.flames.push(f);
    }
    // A charge aura for a full ERS battery (purple) or an open DRS wing (green).
    this.auraMat = new THREE.MeshBasicMaterial({ color: ERS_GLOW, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide });
    this.aura = mesh(s.aura, this.auraMat, this.body);
    this.root.add(this.body);

    // On the ground: a soft shadow and the livery-coloured underglow of the hover pads.
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(CRAFT_LENGTH * 1.15, 54).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: s.shadow, transparent: true, depthWrite: false }));
    shadow.position.set(-4, 0.25, 4);
    shadow.renderOrder = 3;
    this.root.add(shadow);
    const under = new THREE.Mesh(new THREE.PlaneGeometry(CRAFT_LENGTH * 1.3, 70).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: s.glow, color: livery, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    under.position.y = 0.35;
    under.renderOrder = 4;
    this.root.add(under);
  }

  update(car: Car, time: number, dt: number): void {
    const c = car.craft;
    this.root.position.set(c.pos.x, 0, c.pos.y);
    this.root.rotation.y = -c.heading;
    const racing = car.race.lapStart >= 0;
    this.body.position.y = 9 + (racing ? Math.sin(time * 5 + c.pos.x * 0.001) * 2 : 0);

    // Lean into turns and slides; dip the nose under braking, lift it a touch under power.
    const turn = this.lastHeading === null || dt <= 0 ? 0 : wrapAngle(c.heading - this.lastHeading) / dt;
    this.lastHeading = c.heading;
    const k = 1 - Math.exp(-8 * dt);
    this.roll += (clamp(turn * 0.11 + c.slip * 0.25, -0.38, 0.38) - this.roll) * k;
    this.pitch += ((c.braking ? -0.07 : c.thrust * 0.025) - this.pitch) * k;
    this.body.rotation.set(this.roll, 0, this.pitch);

    const hue = c.deploying ? 280 : car.hue;
    const flame = 10 + c.thrust * 22 + (c.deploying ? 16 : 0) + Math.random() * 4;
    this.flameMat.color.setHSL(hue / 360, 1, 0.5);
    this.flameMat.opacity = 0.45 + c.thrust * 0.4;
    // Flames grow in whole voxel steps, keeping the pixel look.
    const len = Math.max(VOX, Math.round(flame / VOX) * VOX);
    for (const f of this.flames) f.scale.set(len, 1, 1);

    this.wingTilt += ((c.drsOpen ? -0.45 : 0) - this.wingTilt) * (1 - Math.exp(-12 * dt));
    this.wing.rotation.z = this.wingTilt;

    const full = c.energy >= ENERGY_FULL;
    this.aura.visible = full || c.drsOpen;
    if (this.aura.visible) {
      this.auraMat.color.setHex(c.drsOpen ? DRS_GLOW : ERS_GLOW);
      this.auraMat.opacity = 0.18 + Math.random() * 0.22;
    }
  }
}

// --- particles -------------------------------------------------------------------------------------

/** Sparks, drift trails and smoke from the 2D particle list, as glowing points. */
class Sparks {
  points: THREE.Points;
  private pos = new Float32Array(3 * 3000);
  private col = new Float32Array(3 * 3000);
  private geo = new THREE.BufferGeometry();
  private c = new THREE.Color();

  constructor() {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const dot = new THREE.CanvasTexture(canvas2d(32, 32, (g) => {
      const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, 32, 32);
    }));
    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({
      size: 5, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
  }

  update(list: Particle[]): void {
    const n = Math.min(list.length, 3000);
    for (let i = 0; i < n; i++) {
      const p = list[i];
      const fade = Math.max(0, p.life / p.max);
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = 4 + (1 - fade) * 6; this.pos[i * 3 + 2] = p.y;
      this.c.setHSL(p.hue / 360, 1, 0.6).multiplyScalar(fade);
      this.col[i * 3] = this.c.r; this.col[i * 3 + 1] = this.c.g; this.col[i * 3 + 2] = this.c.b;
    }
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

// --- helpers ---------------------------------------------------------------------------------------

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent?: THREE.Object3D): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  parent?.add(m);
  return m;
}

function canvas2d(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  return c;
}

/** A flat label lying on the ground (rotate its geometry to stand it up), width x height in world px. */
function textPlane(text: string, color: string, w: number, h: number, back?: string): THREE.Mesh {
  const scale = 4;
  const c = canvas2d(Math.ceil(w * scale), Math.ceil(h * scale), (g) => {
    if (back) {
      g.fillStyle = '#0b0e1c'; g.fillRect(0, 0, w * scale, h * scale);
      g.strokeStyle = back; g.lineWidth = 3 * scale; g.strokeRect(1.5 * scale, 1.5 * scale, (w - 3) * scale, (h - 3) * scale);
    }
    g.fillStyle = color;
    g.font = `900 ${Math.floor(h * scale * 0.62)}px system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, (w * scale) / 2, (h * scale) / 2 + scale, w * scale * 0.92);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: t, transparent: !back, depthWrite: !!back }));
}

/** A standing sign seen from both sides: a second face turned round, so the text never reads mirrored. */
function bothWays(sign: THREE.Mesh): THREE.Mesh {
  const backFace = new THREE.Mesh(sign.geometry, sign.material);
  backFace.rotation.y = Math.PI;
  sign.add(backFace);
  return sign;
}

function dispose(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !sharedRes.has(m.geometry)) m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      const map = (mat as THREE.MeshBasicMaterial).map;
      if (map && !sharedRes.has(map)) map.dispose();
      mat.dispose();
    }
  });
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
