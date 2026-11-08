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
  private drafts = new Slipstreams();
  private hemi = new THREE.HemisphereLight(0xc8d8ff, 0x261c34, 1.5);
  private sun = new THREE.DirectionalLight(0xffffff, 1.7);
  /** Unit vector toward the sun (the shadow light follows the player from this direction). */
  private sunDir = new THREE.Vector3(-0.5, 1, 0.35).normalize();
  private quality: 'high' | 'medium' | 'low' = 'high';
  private speedLines = new SpeedLines();
  private boostK = 0;            // eases toward 1 while boosting: the camera lunge
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
    // Cars cast real shadows from the track's sun. The shadow box is small and follows the player,
    // so it stays sharp and cheap.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -460; sc.right = 460; sc.top = 460; sc.bottom = -460; sc.near = 10; sc.far = 2400;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 1.5;
    this.scene.add(this.sun.target);
    this.camera.add(this.speedLines.lines);
    this.scene.add(this.camera);
    this.sparks = new Sparks();
    this.scene.add(this.sparks.points);
    this.scene.add(this.drafts.mesh);
  }

  /** Graphics quality from Settings: shadow sharpness, and on Low no shadows or speed lines. */
  setQuality(q: 'high' | 'medium' | 'low'): void {
    if (q === this.quality) return;
    this.quality = q;
    const shadows = q !== 'low';
    this.sun.castShadow = shadows;
    const size = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
    }
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
      // Shadows read best from a sun a little higher than the one painted in the sky.
      this.sunDir.set(Math.cos(a.sun.azim) * Math.cos(a.sun.elev), Math.max(0.45, Math.sin(a.sun.elev)), Math.sin(a.sun.azim) * Math.cos(a.sun.elev)).normalize();
    }
    this.world.animate(s.time);

    // Car rigs: one per car, built the first time it's seen.
    const seen = new Set<Car>();
    for (const car of s.cars) {
      let rig = this.rigs.get(car);
      if (!rig) {
        rig = new CarRig(car);
        if (car.ghost) ghostly(rig.root);
        this.rigs.set(car, rig);
        this.scene.add(rig.root);
      }
      rig.update(car, s.time, dt);
      seen.add(car);
    }
    for (const [car, rig] of this.rigs) {
      if (!seen.has(car)) { this.scene.remove(rig.root); dispose(rig.root); this.rigs.delete(car); }
    }
    this.sparks.update(s.particles);
    this.drafts.update(s.cars.filter((c) => !c.ghost), s.time);
    this.updateCamera(s, dt);
    const pc = s.player.craft;
    this.sun.target.position.set(pc.pos.x, 0, pc.pos.y);
    this.sun.position.set(pc.pos.x + this.sunDir.x * 1200, this.sunDir.y * 1200, pc.pos.y + this.sunDir.z * 1200);
    this.speedLines.update(this.quality === 'low' ? 0 : pc.speed, pc.deploying, dt);
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
    // Boosting: the camera eases back and the view widens, a lunge you can feel.
    this.boostK += ((c.deploying ? 1 : 0) - this.boostK) * (1 - Math.exp(-6 * dt));
    const back = 175 + speedFrac * 45 + this.boostK * 24, up = 62 + speedFrac * 8 - this.boostK * 4;
    const fx = Math.cos(this.camHeading), fy = Math.sin(this.camHeading);
    const shake = s.cam.shake * 0.5;
    // A smooth high-speed rumble from about 180 km/h (layered sines, not random jitter).
    const t = s.time, hum = this.quality === 'low' ? 0 : clamp((c.speed - 720) / 220, 0, 1) * 1.4;
    const rx = (Math.sin(t * 37) + Math.sin(t * 23.3) * 0.6) * hum, ry = (Math.sin(t * 41.7) + Math.sin(t * 29.1) * 0.5) * hum;
    this.camera.position.set(
      c.pos.x - fx * back + (Math.random() - 0.5) * shake - fy * rx,
      up + (Math.random() - 0.5) * shake + ry,
      c.pos.y - fy * back + (Math.random() - 0.5) * shake + fx * rx);
    this.camPos.set(c.pos.x, 0, c.pos.y);
    this.camera.lookAt(c.pos.x + fx * 150, 14, c.pos.y + fy * 150);
    if (this.debugCam) {
      const a = c.heading + this.debugCam.yaw;
      this.camera.position.set(c.pos.x + Math.cos(a) * this.debugCam.dist, this.debugCam.h, c.pos.y + Math.sin(a) * this.debugCam.dist);
      this.camera.lookAt(c.pos.x, 10, c.pos.y);
    }
    this.camera.fov = 66 + speedFrac * 14 + this.boostK * 8;   // wider at speed, and more on boost, for the sense of pace
    this.camera.updateProjectionMatrix();
  }
}

/**
 * Wind streaks: thin lines rushing past the camera, fading in from about 150 km/h and stronger
 * on boost. They live in camera space (the camera looks down -z), in a ring around the view centre
 * so they never cross the car.
 */
class SpeedLines {
  readonly lines: THREE.LineSegments;
  private n = 46;
  private pos: Float32Array;
  private seeds: { x: number; y: number; z: number }[] = [];
  private mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });

  constructor() {
    this.pos = new Float32Array(this.n * 6);
    for (let i = 0; i < this.n; i++) this.seeds.push(this.spawn(-60 - Math.random() * 900));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.lines = new THREE.LineSegments(g, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 10;
  }

  private spawn(z: number) {
    const a = Math.random() * Math.PI * 2, r = 90 + Math.random() * 170;
    return { x: Math.cos(a) * r * 1.6, y: Math.sin(a) * r, z };
  }

  update(speed: number, boosting: boolean, dt: number): void {
    const k = clamp((speed - 600) / 300, 0, 1);
    this.mat.opacity = k * (boosting ? 0.42 : 0.16);
    this.lines.visible = k > 0;
    if (!k) return;
    const len = 20 + k * 70 + (boosting ? 50 : 0);
    for (let i = 0; i < this.n; i++) {
      const sd = this.seeds[i];
      sd.z += speed * 1.4 * dt;
      if (sd.z > -30) this.seeds[i] = this.spawn(-700 - Math.random() * 300);
      const q = this.seeds[i];
      this.pos.set([q.x, q.y, q.z, q.x, q.y, q.z - len], i * 6);
    }
    (this.lines.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
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
  {
    // The deck faces straight up (normals for lighting the two layers below).
    const up = (g: THREE.BufferGeometry) => {
      const n = new Float32Array(g.getAttribute('position').count * 3);
      for (let k = 1; k < n.length; k += 3) n[k] = 1;
      g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
      return g;
    };
    // Shadows of the cars, cast onto the road.
    const catcher = add(up(ribbon(0, m, HALF_WIDTH, -HALF_WIDTH, 0.15, 0.15, 128)), new THREE.ShadowMaterial({ opacity: 0.38 }), 1);
    catcher.receiveShadow = true;
    // A glossy sheen: only the sun's specular highlight, added on top, so the deck reads polished.
    add(up(ribbon(0, m, HALF_WIDTH, -HALF_WIDTH, 0.3, 0.3, 128)), new THREE.MeshPhongMaterial({
      color: 0x000000, specular: new THREE.Color(atmos.sun.color).multiplyScalar(0.55), shininess: 26,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }), 1);
  }

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

  // Scenery props: built from simple shapes, then turned into voxels (all of them in two instanced
  // meshes for the whole map); moving parts, signs and see-through effects stay as they are.
  const spinners: { obj: THREE.Object3D; axis: 'x' | 'y' | 'z'; rate: number }[] = [];
  const sc = sceneryFor(track);
  const voxels = new PropVoxels();
  for (const p of [...sc.props, ...sc.overlays]) {
    const obj = propObject(p, spinners, atmos, theme.wall);
    if (!obj) continue;
    voxels.absorb(obj, spinners.map((sp) => sp.obj));
    group.add(obj);
  }
  for (const mesh of voxels.build()) group.add(mesh);

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
  const mat = new THREE.MeshBasicMaterial({ map: t });
  mat.userData.windows = { base, lit };
  return mat;
}

// --- voxel scenery ----------------------------------------------------------------------------------

/**
 * Turns props made of simple shapes (boxes, cylinders, cones, spheres, octahedra, dodecahedra)
 * into world-aligned cubes for the pixel-art look. Cube size follows the prop's size (small props
 * get fine cubes, mountains coarse ones), only cubes on the surface are kept, and every cube on the
 * map ends up in one of two instanced meshes (lit, or glowing), so it stays cheap to draw.
 */
const PROP_VOX_MIN = 5, PROP_VOX_MAX = 22, PROP_VOX_DIV = 16;
interface PropCube { x: number; y: number; z: number; size: number; color: THREE.Color; glow: boolean }

class PropVoxels {
  private cubes: PropCube[] = [];

  /** Convert the static solid parts of a prop to cubes and remove them from it. */
  absorb(obj: THREE.Object3D, moving: THREE.Object3D[]): void {
    obj.updateMatrixWorld(true);
    const parts: { mesh: THREE.Mesh; inv: THREE.Matrix4; centre: THREE.Vector3 }[] = [];
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !solidShape(m)) return;
      for (let a: THREE.Object3D | null = m; a; a = a.parent) if (moving.includes(a)) return;
      m.geometry.computeBoundingBox();
      parts.push({ mesh: m, inv: m.matrixWorld.clone().invert(), centre: m.geometry.boundingBox!.getCenter(new THREE.Vector3()) });
    });
    if (!parts.length) return;
    const box = new THREE.Box3();
    for (const pt of parts) box.expandByObject(pt.mesh);
    const dims = box.getSize(new THREE.Vector3());
    const size = Math.max(PROP_VOX_MIN, Math.min(PROP_VOX_MAX, Math.round(Math.max(dims.x, dims.y, dims.z) / PROP_VOX_DIV)));

    // Sample the prop's box on its own grid: each cell takes the first part it falls inside.
    const i0 = Math.floor(box.min.x / size), i1 = Math.ceil(box.max.x / size);
    const j0 = Math.max(0, Math.floor(box.min.y / size)), j1 = Math.ceil(box.max.y / size);
    const k0 = Math.floor(box.min.z / size), k1 = Math.ceil(box.max.z / size);
    const cells = new Map<string, { color: THREE.Color; glow: boolean }>();
    const world = new THREE.Vector3(), local = new THREE.Vector3();
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
      world.set((i + 0.5) * size, (j + 0.5) * size, (k + 0.5) * size);
      for (const pt of parts) {
        local.copy(world).applyMatrix4(pt.inv).sub(pt.centre);
        if (!insideShape(pt.mesh.geometry, local)) continue;
        cells.set(`${i},${j},${k}`, cubeColour(pt.mesh, local, j));
        break;
      }
    }
    for (const [key, c] of cells) {
      const [i, j, k] = key.split(',').map(Number);
      const hidden = cells.has(`${i + 1},${j},${k}`) && cells.has(`${i - 1},${j},${k}`) && cells.has(`${i},${j + 1},${k}`)
        && (j === j0 || cells.has(`${i},${j - 1},${k}`)) && cells.has(`${i},${j},${k + 1}`) && cells.has(`${i},${j},${k - 1}`);
      if (!hidden) this.cubes.push({ x: (i + 0.5) * size, y: (j + 0.5) * size, z: (k + 0.5) * size, size, ...c });
    }
    for (const pt of parts) pt.mesh.removeFromParent();
  }

  build(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
    for (const glow of [false, true]) {
      const list = this.cubes.filter((c) => c.glow === glow);
      if (!list.length) continue;
      const inst = new THREE.InstancedMesh(geo, glow ? new THREE.MeshBasicMaterial() : new THREE.MeshLambertMaterial(), list.length);
      list.forEach((c, n) => {
        m4.compose(pos.set(c.x, c.y, c.z), q, scl.setScalar(c.size));
        inst.setMatrixAt(n, m4);
        inst.setColorAt(n, c.color);
      });
      out.push(inst);
    }
    return out;
  }

  get count(): number { return this.cubes.length; }
}

/** Shapes the voxelizer understands (solid, opaque or near enough, and not a textured sign). */
function solidShape(m: THREE.Mesh): boolean {
  const mat = m.material as THREE.MeshBasicMaterial;
  if (Array.isArray(m.material) || mat.blending === THREE.AdditiveBlending || (mat.transparent && mat.opacity < 0.5)) return false;
  if (mat.map && !mat.userData.windows) return false;
  return ['BoxGeometry', 'CylinderGeometry', 'ConeGeometry', 'SphereGeometry', 'OctahedronGeometry', 'DodecahedronGeometry'].includes(m.geometry.type);
}

/** Whether a point (in the shape's own space, centred) lies inside it. Low-poly round shapes keep their facets. */
function insideShape(geo: THREE.BufferGeometry, v: THREE.Vector3): boolean {
  const g = geo as THREE.BufferGeometry & { parameters: Record<string, number> };
  const pr = g.parameters;
  switch (geo.type) {
    case 'BoxGeometry':
      return Math.abs(v.x) <= pr.width / 2 && Math.abs(v.y) <= pr.height / 2 && Math.abs(v.z) <= pr.depth / 2;
    case 'CylinderGeometry': case 'ConeGeometry': {
      const h = pr.height;
      if (Math.abs(v.y) > h / 2) return false;
      const t = (v.y + h / 2) / h;
      const rTop = geo.type === 'ConeGeometry' ? 0 : pr.radiusTop, rBot = geo.type === 'ConeGeometry' ? pr.radius : pr.radiusBottom;
      const r = rBot + (rTop - rBot) * t;
      const n = pr.radialSegments;
      // Distance to the edge of the n-sided cross-section, measured the way three.js lays out its sides.
      const rel = ((Math.atan2(v.x, v.z) % (2 * Math.PI / n)) + 2 * Math.PI / n) % (2 * Math.PI / n) - Math.PI / n;
      const edge = n <= 12 ? (r * Math.cos(Math.PI / n)) / Math.cos(rel) : r;
      return Math.hypot(v.x, v.z) <= edge;
    }
    case 'SphereGeometry': {
      // (Centred on its bounding box: a half sphere spans -r/2..r/2 here.)
      const half = (pr.thetaLength ?? Math.PI) < Math.PI - 0.01;
      const y = half ? v.y + pr.radius / 2 : v.y;
      return (!half || y >= 0) && v.x * v.x + y * y + v.z * v.z <= pr.radius * pr.radius;
    }
    case 'OctahedronGeometry':
      return Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z) <= pr.radius;
    case 'DodecahedronGeometry':
      return v.length() <= pr.radius * 0.88;
  }
  return false;
}

/** A cube's colour: the part's material, with lit window rows on building sides. */
function cubeColour(m: THREE.Mesh, local: THREE.Vector3, row: number): { color: THREE.Color; glow: boolean } {
  const mat = m.material as THREE.MeshPhongMaterial;
  const win = mat.userData.windows as { base: string; lit: string } | undefined;
  if (win) {
    const pr = (m.geometry as THREE.BoxGeometry).parameters;
    const onSide = Math.abs(local.y) < pr.height / 2 - 6;
    const hash = ((Math.round(local.x) * 73856093) ^ (row * 19349663) ^ (Math.round(local.z) * 83492791)) >>> 0;
    if (onSide && row % 2 === 1 && hash % 7 !== 0) return { color: new THREE.Color(win.lit), glow: true };
    return { color: new THREE.Color(win.base), glow: false };
  }
  const col = mat.color.clone();
  // Plain unlit materials are lights and neon trims: they keep glowing.
  if ((mat as THREE.Material).type === 'MeshBasicMaterial') return { color: col, glow: true };
  if (mat.emissive) col.add(mat.emissive.clone().multiplyScalar(0.6));
  // A little per-cube shade variation, so surfaces read as pixels.
  const hash = ((Math.round(local.x) * 73856093) ^ (row * 19349663) ^ (Math.round(local.z) * 83492791)) >>> 0;
  return { color: col.multiplyScalar(0.92 + (hash % 100) / 100 * 0.16), glow: false };
}

// --- the cars ------------------------------------------------------------------------------------

/**
 * The hovercraft, built from voxels (2 px cubes) for a detailed pixel-art look: about 86 long,
 * 50 wide and 30 tall, nose along +x. The shape is described in world px (`carVoxel`), sampled on
 * the voxel grid, and only cubes on the surface are kept. Each car is two instanced meshes (lit
 * cubes and glowing cubes) plus its rear wing.
 */
const VOX = 2;
type VoxKind = 'paint' | 'dark' | 'carbon' | 'metal' | 'glass' | 'shine' | 'white' | 'intake' | 'nozzle' | 'neon';
interface Voxel { x: number; y: number; z: number; kind: VoxKind }
const GLOWING: VoxKind[] = ['intake', 'nozzle', 'neon'];

/** Half-width of the hull at a point along the car (tapering to the nose and a little at the tail). */
function hullHalfWidth(x: number): number {
  if (x > 14) return Math.max(1.5, (13 * (40 - x)) / 26);
  if (x < -30) return 13 - (-30 - x) * 0.45;
  return 13;
}

/** Height of the hull deck (it slopes down toward the nose). */
function hullTop(x: number): number {
  return x > 18 ? 11 - (x - 18) * 0.25 : 11;
}

/** What the car is made of at a point (world px, y up from the bottom of the skirt), or null for air. */
function carVoxel(x: number, y: number, z: number): VoxKind | null {
  const az = Math.abs(z);
  const hw = hullHalfWidth(x), top = hullTop(x);
  // Twin thrusters: round pods with a metal rim around the glowing nozzle.
  for (const tz of [-7, 7]) {
    const r = Math.hypot(y - 7, z - tz);
    if (x >= -44 && x <= -30 && r <= 5.2) {
      if (x <= -41) return r <= 3 ? 'nozzle' : r <= 4.2 ? 'metal' : 'carbon';
      return 'carbon';
    }
  }
  // Front wing with livery endplates.
  if (x >= 31 && x <= 39 && y <= 4 && az <= 23) return az >= 21 ? 'paint' : 'carbon';
  if (x >= 29 && x <= 39 && az >= 21 && az <= 23 && y <= 10) return 'paint';
  // Side pods: rounded along their length, a livery stripe on top, glowing intakes at the front.
  const pr = Math.hypot(y - 7, az - 18);
  if (x >= -24 && x <= 20 && pr <= 4.8) {
    if (x >= 18) return pr <= 3 ? 'intake' : 'carbon';
    if (x <= -22) return 'carbon';
    return y >= 9 && pr >= 3.5 ? 'paint' : 'dark';
  }
  // Pod mounts tying the pods to the hull.
  if (x >= -12 && x <= 6 && y >= 5 && y <= 9 && az > hw && az < 15) return 'carbon';
  // Hover skirt, with a neon strip along its bottom edge.
  if (y < 3 && x >= -36 && x <= 34 && az <= hw + 3) return az > hw + 1 ? 'neon' : 'carbon';
  // Hull: rounded over the top, with a lower trim line, side pinstripes and a racing stripe.
  const round = Math.max(0, y - (top - 3)) * 1.3;
  if (x >= -40 && x <= 40 && y >= 3 && y <= top && az <= hw - round) {
    if (x > 37) return 'dark';
    if (y >= top - 2 && az <= 2.5 && x > -14) return 'white';
    if (y < 5) return 'dark';
    if (az >= hw - round - 2 && y >= 7 && y < 9 && x > -30 && x < 28) return 'white';
    return 'paint';
  }
  // Canopy: a glass bubble on a dark frame, with a glint.
  const cx = (x - 8) / 13, cy = (y - top) / 6.5, cz = z / 6.5;
  if (y > top && cx * cx + cy * cy + cz * cz <= 1) {
    if (y < top + 2.2 && cx * cx + cz * cz > 0.55) return 'dark';
    if (cx > 0.1 && cx < 0.6 && z < -1 && z > -5 && cy > 0.35) return 'shine';
    return 'glass';
  }
  // Airbox behind the cockpit, its intake facing forward.
  if (x >= -10 && x <= -2 && y > top && y <= top + 7 && az <= 3.5) {
    return x >= -3 && y >= top + 3 && az <= 2 ? 'glass' : 'dark';
  }
  // Engine cover with cooling vents.
  if (x >= -34 && x < -10 && y > top && y <= top + (x < -28 ? 2 : 4) && az <= 9) {
    if (y > top + 2 && x > -28 && az <= 6 && Math.floor((x + 40) / 4) % 2 === 0) return 'carbon';
    return 'dark';
  }
  // Rear wing struts.
  if (x >= -38 && x <= -34 && y > top && y <= 22 && Math.abs(az - 6) <= 1.2) return 'carbon';
  return null;
}

/** The rear wing, around its pivot (it tilts flat when DRS opens): a livery top, carbon underneath, endplates. */
function wingVoxel(x: number, y: number, z: number): VoxKind | null {
  const az = Math.abs(z);
  if (az >= 22 && az <= 25 && x >= -6 && x <= 6 && y >= -8 && y <= 4) return 'paint';
  if (x >= -6 && x <= 6 && y >= -1 && y <= 2 && az <= 23) return y >= 1 ? 'paint' : 'carbon';
  if (x <= -5 && y > 2 && y <= 4 && az <= 22) return 'carbon';   // gurney flap
  return null;
}

/** Sample a shape on the voxel grid, keeping only cubes with at least one open face. */
function sampleVoxels(shape: (x: number, y: number, z: number) => VoxKind | null,
  xr: [number, number], yr: [number, number], zr: [number, number]): Voxel[] {
  const kinds = new Map<string, VoxKind>();
  const at = (i: number, j: number, k: number) => kinds.get(`${i},${j},${k}`);
  for (let i = xr[0]; i <= xr[1]; i++) for (let j = yr[0]; j <= yr[1]; j++) for (let k = zr[0]; k <= zr[1]; k++) {
    const kind = shape((i + 0.5) * VOX, (j + 0.5) * VOX, k * VOX);
    if (kind) kinds.set(`${i},${j},${k}`, kind);
  }
  const out: Voxel[] = [];
  for (const [key, kind] of kinds) {
    const [i, j, k] = key.split(',').map(Number);
    const hidden = at(i + 1, j, k) && at(i - 1, j, k) && at(i, j + 1, k) && at(i, j - 1, k) && at(i, j, k + 1) && at(i, j, k - 1);
    if (!hidden) out.push({ x: (i + 0.5) * VOX, y: (j + 0.5) * VOX, z: k * VOX, kind });
  }
  return out;
}

let carVoxelCache: { hull: Voxel[]; wing: Voxel[] } | null = null;
function carVoxels() {
  return carVoxelCache ??= {
    hull: sampleVoxels(carVoxel, [-23, 21], [0, 13], [-13, 13]),
    wing: sampleVoxels(wingVoxel, [-4, 3], [-5, 2], [-13, 13]),
  };
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
    flame: new THREE.BoxGeometry(1, 6, 6).translate(-0.5, 0, 0),
    aura: new THREE.BoxGeometry(CRAFT_LENGTH + 12, 30, 52).translate(0, 12, 0),
    glow: radial('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'),
    shadow: radial('rgba(0,0,0,0.7)', 'rgba(0,0,0,0)'),
  };
  for (const r of Object.values(shared)) sharedRes.add(r);
  return shared;
}

/** Voxels as two instanced meshes: shaded cubes, and glowing ones that ignore the lighting. */
function voxelMeshes(voxels: Voxel[], colors: Record<VoxKind, THREE.Color>): THREE.Object3D[] {
  const s = carShared();
  const out: THREE.Object3D[] = [];
  for (const glowing of [false, true]) {
    const list = voxels.filter((v) => GLOWING.includes(v.kind) === glowing);
    if (!list.length) continue;
    const mat = glowing ? new THREE.MeshBasicMaterial() : new THREE.MeshLambertMaterial();
    const inst = new THREE.InstancedMesh(s.cube, mat, list.length);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    list.forEach((v, i) => {
      m4.makeTranslation(v.x, v.y, v.z);
      inst.setMatrixAt(i, m4);
      // A little per-cube shade variation, so the surfaces read as pixels.
      const hash = ((Math.round(v.x + 99) * 73856093) ^ (Math.round(v.y + 99) * 19349663) ^ (Math.round(v.z + 99) * 83492791)) >>> 0;
      const jitter = glowing ? 1 : 0.93 + (hash % 100) / 100 * 0.14;
      inst.setColorAt(i, col.copy(colors[v.kind]).multiplyScalar(jitter));
    });
    out.push(inst);
  }
  return out;
}

/** Make a car a Time Trial ghost: a faint sea-teal hologram (its own copies of the materials), no shadow. */
const GHOST_TINT = new THREE.Color(0x7fe6da);
function ghostly(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.material) return;
    m.castShadow = false;
    m.receiveShadow = false;
    const im = m as unknown as THREE.InstancedMesh;
    if (im.isInstancedMesh) im.instanceColor = null;   // one colour for every cube
    const fade = (mat: THREE.Material) => {
      const c = mat.clone() as THREE.MeshBasicMaterial;
      c.transparent = true;
      c.opacity = Math.min(c.opacity, 0.3);
      c.depthWrite = false;
      c.blending = THREE.AdditiveBlending;
      c.vertexColors = false;
      if (c.color) c.color.copy(GHOST_TINT);
      c.needsUpdate = true;
      return c;
    };
    m.material = Array.isArray(m.material) ? m.material.map(fade) : fade(m.material);
  });
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
    // A skin (unlocked colours) replaces the livery: body paint, trim, stripes and the neon glow.
    const sk = car.skin;
    const livery = new THREE.Color(sk?.body ?? car.color);
    const colors: Record<VoxKind, THREE.Color> = {
      paint: livery, dark: sk ? new THREE.Color(sk.trim) : livery.clone().multiplyScalar(0.5), carbon: new THREE.Color(0x1a1d2e),
      // Gold rims and ivory stripes, for the deco look; a skin's accent replaces the ivory.
      metal: new THREE.Color(0xd9b25b), glass: new THREE.Color(0x0e3a44), shine: new THREE.Color(0x9ff0ff),
      white: new THREE.Color(sk?.accent ?? 0xf3ead2), intake: new THREE.Color(0xdff6ff), nozzle: new THREE.Color(0xbff4ff),
      neon: sk ? new THREE.Color(sk.glow) : livery.clone().lerp(new THREE.Color(0xffffff), 0.35),
    };
    const vox = carVoxels();
    for (const m of voxelMeshes(vox.hull, colors)) { m.castShadow = true; this.body.add(m); }
    for (const m of voxelMeshes(vox.wing, colors)) { m.castShadow = true; this.wing.add(m); }
    this.wing.position.set(-36, 23, 0);   // the wing's pivot, above the struts
    this.body.add(this.wing);

    // The car number on the engine cover, in chunky pixels.
    const num = car.name.match(/^\d+/)?.[0];
    if (num) {
      const decal = textPlane(num, '#ffffff', 16, 10);
      const map = (decal.material as THREE.MeshBasicMaterial).map!;
      map.magFilter = THREE.NearestFilter;
      map.minFilter = THREE.NearestFilter;
      decal.geometry.rotateY(-Math.PI / 2);
      decal.position.set(-20, hullTop(-20) + 4.3, 0);
      this.body.add(decal);
    }

    // Blocky flames out of the twin thrusters.
    this.flameMat = new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
    for (const z of [-7, 7]) {
      const f = mesh(s.flame, this.flameMat, this.body);
      f.position.set(-44, 7, z);
      this.flames.push(f);
    }
    // A charge aura for a full ERS battery (purple) or an open DRS wing (green).
    this.auraMat = new THREE.MeshBasicMaterial({ color: ERS_GLOW, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide });
    this.aura = mesh(s.aura, this.auraMat, this.body);
    this.body.position.y = 9;   // hover height
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
      this.auraMat.opacity = 0.06 + Math.random() * 0.08;
    }
  }
}

// --- particles -------------------------------------------------------------------------------------

/** Sparks, drift trails and smoke from the 2D particle list, as glowing points. */
/**
 * Slipstream: glowing dashes streaming from a car's nose to the tail of the car it is drafting, in
 * three lanes that pinch in toward the leader (as in the top-down view), brighter the stronger the tow.
 */
const DRAFT_MAX = 720;
const DASH = 14, DASH_GAP = 12;
class Slipstreams {
  mesh: THREE.InstancedMesh;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);
  private pos = new THREE.Vector3();
  private scl = new THREE.Vector3();
  private col = new THREE.Color();

  constructor() {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), DRAFT_MAX);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, this.col.setRGB(0, 0, 0));
  }

  update(cars: Car[], time: number): void {
    let n = 0;
    for (const car of cars) {
      const c = car.craft, lead = c.slipFrom;
      if (!lead || c.slipstream < 0.05) continue;
      const ax = c.pos.x + Math.cos(c.heading) * CRAFT_LENGTH * 0.45, ay = c.pos.y + Math.sin(c.heading) * CRAFT_LENGTH * 0.45;
      const bx = lead.pos.x - Math.cos(lead.heading) * CRAFT_LENGTH * 0.5, by = lead.pos.y - Math.sin(lead.heading) * CRAFT_LENGTH * 0.5;
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
      if (len < 10) continue;
      const ux = dx / len, uy = dy / len, px = -uy, py = ux;
      this.q.setFromAxisAngle(this.up, -Math.atan2(uy, ux));
      const period = DASH + DASH_GAP;
      for (const lane of [-1, 0, 1]) {
        const strength = c.slipstream * (lane === 0 ? 0.9 : 0.6);
        // The dashes travel toward the car ahead.
        for (let d = (time * 160 + lane * 7) % period; d < len && n < DRAFT_MAX; d += period) {
          const t = d / len;
          const spread = lane * 16 * (1 - t * 0.75);
          const wave = Math.sin(t * len / 22 - time * 14 + lane) * 2.5 * (1 - t * 0.5);
          this.pos.set(ax + ux * d + px * (spread + wave), 9 + t * 3, ay + uy * d + py * (spread + wave));
          const thick = lane === 0 ? 2.2 : 1.4;
          this.scl.set(DASH, thick, thick);
          this.m4.compose(this.pos, this.q, this.scl);
          this.mesh.setMatrixAt(n, this.m4);
          // Fade in off our nose and out into the leader's wake.
          const fade = Math.min(1, t * 6) * Math.min(1, (1 - t) * 4);
          this.col.setHSL(car.hue / 360, 1, 0.72).multiplyScalar(strength * fade);
          this.mesh.setColorAt(n, this.col);
          n++;
        }
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

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

/**
 * Pictures of each car's 3D model at a three-quarter angle on a transparent background, for the
 * car selection cards. Rendered once with a small renderer of its own, which is then released.
 */
export function renderCarCards(cars: { color: string; name: string; hue: number; skin?: Car['skin'] }[], w = 360, h = 240): string[] {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(w, h, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x1c3a44, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(1, 1.6, 0.8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8ff0ff, 1.2);
  rim.position.set(-1.2, 0.6, -1);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(30, w / h, 1, 2000);
  camera.position.set(88, 56, 108);
  camera.lookAt(-4, 10, 0);
  const out: string[] = [];
  for (const c of cars) {
    const rig = new CarRig({ color: c.color, name: c.name, hue: c.hue, skin: c.skin } as Car);
    rig.root.rotation.y = 0.1;
    scene.add(rig.root);
    renderer.render(scene, camera);
    out.push(renderer.domElement.toDataURL('image/png'));
    scene.remove(rig.root);
    dispose(rig.root);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
