// Everything drawn to the canvas. Reads game state, never changes it.

import { Craft, GEARS, clamp } from './craft';
import { HALF_WIDTH, RaceState, Track, WALL_DIST, WALL_THICKNESS } from './track';

export interface Camera { x: number; y: number; zoom: number; shake: number }

export interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; hue: number; size: number }

export interface Toast { text: string; color: string; t: number }

/** A craft art image, trimmed to its visible pixels once it loads. Nose points up in the file. */
export interface Sprite { canvas: HTMLCanvasElement | null; aspect: number }

export function loadSprite(url: string, height = 256): Sprite {
  const sprite: Sprite = { canvas: null, aspect: 0.6 };
  const img = new Image();
  img.onload = () => {
    const probe = document.createElement('canvas');
    probe.width = img.width;
    probe.height = img.height;
    const pctx = probe.getContext('2d')!;
    pctx.drawImage(img, 0, 0);
    const data = pctx.getImageData(0, 0, img.width, img.height).data;
    let minX = img.width, minY = img.height, maxX = 0, maxY = 0;
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        if (data[(y * img.width + x) * 4 + 3] > 24) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    const w = maxX - minX + 1, h = maxY - minY + 1;
    const out = document.createElement('canvas');
    out.height = height;
    out.width = Math.round((w / h) * height);
    const octx = out.getContext('2d')!;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(img, minX, minY, w, h, 0, 0, out.width, out.height);
    sprite.canvas = out;
    sprite.aspect = w / h;
  };
  img.src = url;
  return sprite;
}

/** One racer: physics, race progress, art, minimap color and exhaust flame hue. */
export interface Car { craft: Craft; race: RaceState; sprite: Sprite; color: string; hue: number }

export interface RaceHud {
  position: number; racers: number; laps: number; countdown: string | null; banner: string | null;
  /** The player's catch-up pace bonus as a fraction (0.03 = +3%). */
  catchUp: number;
}

export interface Scene {
  time: number; cam: Camera; player: Car; cars: Car[]; track: Track; hud: RaceHud;
  particles: Particle[]; cursor: { x: number; y: number }; toast: Toast | null; locked: boolean;
}

export function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, s: Scene): void {
  const { cam } = s;
  ctx.fillStyle = '#07080f';
  ctx.fillRect(0, 0, w, h);

  const sx = (Math.random() - 0.5) * cam.shake, sy = (Math.random() - 0.5) * cam.shake;
  ctx.save();
  ctx.translate(w / 2 + sx, h / 2 + sy);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  drawGround(ctx, cam, w, h);
  drawTrack(ctx, s.track, s.time);
  drawParticles(ctx, s.particles);
  drawSlipstreams(ctx, s.cars, s.time);
  for (const car of s.cars) drawCraft(ctx, car.craft, s.time, car.sprite, car.hue);

  ctx.restore();

  drawMinimap(ctx, w, s.track, s.cars, s.player);
  drawLapPanel(ctx, s.player.race, s.time, s.hud);
  drawHud(ctx, w, h, s.player.craft, s.toast, s.locked);
  drawRaceBanners(ctx, w, h, s.hud);
  drawCursor(ctx, s.cursor);
}

function drawGround(ctx: CanvasRenderingContext2D, cam: Camera, w: number, h: number): void {
  // Only draw grid lines that are on screen.
  const viewW = w / cam.zoom, viewH = h / cam.zoom;
  const x0 = cam.x - viewW / 2, x1 = cam.x + viewW / 2;
  const y0 = cam.y - viewH / 2, y1 = cam.y + viewH / 2;
  ctx.fillStyle = '#0b0d1a';
  ctx.fillRect(x0, y0, viewW, viewH);

  for (const [step, color, width] of [[100, '#121630', 1], [500, '#1c2248', 2]] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
    ctx.stroke();
  }
}

/** Static track geometry as Path2Ds, built once per track. */
interface TrackPaths { center: Path2D; kerbRed: Path2D; kerbWhite: Path2D; strips: Path2D; lights: Path2D }
const pathCache = new WeakMap<Track, TrackPaths>();

const KERB_CURVE = 1 / 900;   // corners tighter than this radius get kerbs

function trackPaths(track: Track): TrackPaths {
  const cached = pathCache.get(track);
  if (cached) return cached;
  const pts = track.pts, m = pts.length;
  const center = new Path2D();
  center.moveTo(pts[0].x, pts[0].y);
  for (const p of pts) center.lineTo(p.x, p.y);
  center.closePath();

  const off = (i: number, d: number) => { const p = pts[i % m]; return [p.x + p.nx * d, p.y + p.ny * d]; };

  // Kerbs: striped quads along both edges through each corner.
  const kerbRed = new Path2D(), kerbWhite = new Path2D();
  for (let i = 0; i < m; i++) {
    if (Math.abs(pts[i].curve) < KERB_CURVE) continue;
    const path = Math.floor(i / 2) % 2 ? kerbRed : kerbWhite;
    for (const side of [1, -1]) {
      const a = off(i, side * (HALF_WIDTH - 16)), b = off(i + 1, side * (HALF_WIDTH - 16));
      const c = off(i + 1, side * HALF_WIDTH), d = off(i, side * HALF_WIDTH);
      path.moveTo(a[0], a[1]); path.lineTo(b[0], b[1]); path.lineTo(c[0], c[1]); path.lineTo(d[0], d[1]); path.closePath();
    }
  }

  // Faint light strips across the surface: they stream past and sell the speed.
  const strips = new Path2D();
  for (let i = 0; i < m; i += 8) {
    const a = off(i, HALF_WIDTH - 20), b = off(i, -(HALF_WIDTH - 20));
    strips.moveTo(a[0], a[1]); strips.lineTo(b[0], b[1]);
  }

  // Lights set into the top of both barriers.
  const lights = new Path2D();
  for (let i = 0; i < m; i += 6) {
    for (const side of [1, -1]) {
      const [x, y] = off(i, side * (HALF_WIDTH + WALL_THICKNESS / 2));
      lights.moveTo(x + 3.5, y);
      lights.arc(x, y, 3.5, 0, Math.PI * 2);
    }
  }

  const built = { center, kerbRed, kerbWhite, strips, lights };
  pathCache.set(track, built);
  return built;
}

function drawTrack(ctx: CanvasRenderingContext2D, track: Track, time: number): void {
  const p = trackPaths(track);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Barriers: a soft glow, the shadow they cast outward, then the barrier band itself with a
  // bright rim on its outer edge. Each is a wide stroke along the centerline; the racing
  // surface is drawn over the middle afterwards, so only the outer edges remain visible.
  ctx.strokeStyle = 'rgba(80, 220, 255, 0.16)';
  ctx.lineWidth = WALL_DIST * 2 + 34;
  ctx.stroke(p.center);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.lineWidth = WALL_DIST * 2 + 16;
  ctx.stroke(p.center);
  ctx.strokeStyle = '#4fe3ff';
  ctx.lineWidth = WALL_DIST * 2;
  ctx.stroke(p.center);
  ctx.strokeStyle = '#1d2a55';
  ctx.lineWidth = WALL_DIST * 2 - 6;
  ctx.stroke(p.center);
  // Bright inner face of the barrier, where you scrape.
  ctx.strokeStyle = '#bff6ff';
  ctx.lineWidth = HALF_WIDTH * 2 + 6;
  ctx.stroke(p.center);
  ctx.strokeStyle = '#23283f';
  ctx.lineWidth = HALF_WIDTH * 2;
  ctx.stroke(p.center);

  ctx.strokeStyle = 'rgba(120, 160, 255, 0.07)';
  ctx.lineWidth = 6;
  ctx.stroke(p.strips);

  ctx.fillStyle = '#ff2d75';
  ctx.fill(p.kerbRed);
  ctx.fillStyle = '#f2f4ff';
  ctx.fill(p.kerbWhite);

  const pulse = 0.55 + 0.45 * Math.sin(time * 4);
  ctx.fillStyle = `rgba(255, 79, 216, ${pulse})`;
  ctx.fill(p.lights);

  drawStartLine(ctx, track);
  ctx.restore();
}

function drawStartLine(ctx: CanvasRenderingContext2D, track: Track): void {
  const p = track.pts[0];
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(track.direction(0));
  // Checkered band across the track: x runs along the track, y across it.
  const sq = 13, cols = Math.floor((HALF_WIDTH * 2) / sq);
  const y0 = -(cols * sq) / 2;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 ? '#0a0a12' : '#ffffff';
      ctx.fillRect(r * sq - sq, y0 + c * sq, sq, sq);
    }
  }
  ctx.restore();
}

function drawMinimap(ctx: CanvasRenderingContext2D, w: number, track: Track, cars: Car[], player: Car): void {
  const b = track.bounds;
  const boxW = 220, boxH = 160, pad = 14;
  const scale = Math.min((boxW - pad * 2) / (b.maxX - b.minX), (boxH - pad * 2) / (b.maxY - b.minY));
  const x = w - boxW - 24, y = 24;
  const center = trackPaths(track).center;
  ctx.save();
  ctx.fillStyle = 'rgba(8,10,22,0.7)';
  roundRect(ctx, x, y, boxW, boxH, 12);
  ctx.fill();
  ctx.translate(x + boxW / 2, y + boxH / 2);
  ctx.scale(scale, scale);
  ctx.translate(-(b.minX + b.maxX) / 2, -(b.minY + b.maxY) / 2);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#3a4278';
  ctx.lineWidth = 9 / scale;
  ctx.stroke(center);
  ctx.strokeStyle = '#8a93c0';
  ctx.lineWidth = 3 / scale;
  ctx.stroke(center);
  const s = track.pts[0];
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(s.x, s.y, 4 / scale, 0, Math.PI * 2);
  ctx.fill();
  // Player drawn last so it sits on top.
  for (const car of [...cars.filter((c) => c !== player), player]) {
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.arc(car.craft.pos.x, car.craft.pos.y, (car === player ? 6 : 5) / scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawLapPanel(ctx: CanvasRenderingContext2D, race: RaceState, now: number, hud: RaceHud): void {
  const x = 24, y = 24;
  ctx.save();
  ctx.fillStyle = 'rgba(8,10,22,0.7)';
  roundRect(ctx, x, y, 220, 120, 12);
  ctx.fill();
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillStyle = '#8a93c0';
  ctx.fillText('LAP', x + 16, y + 28);
  ctx.font = '800 24px system-ui, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText(`${Math.min(race.lap + 1, hud.laps)}/${hud.laps}`, x + 50, y + 30);
  ctx.textAlign = 'right';
  ctx.fillStyle = hud.position === 1 ? '#ffd23f' : '#fff';
  ctx.fillText(`P${hud.position}`, x + 204, y + 30);
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillStyle = '#8a93c0';
  ctx.fillText(`/${hud.racers}`, x + 204, y + 46);
  if (hud.catchUp > 0) {
    ctx.fillStyle = '#4dff9a';
    ctx.fillText(`+${Math.round(hud.catchUp * 100)}% PACE`, x + 204, y + 110);
  }
  ctx.textAlign = 'left';
  ctx.font = '700 28px ui-monospace, Consolas, monospace';
  ctx.fillStyle = '#fff';
  ctx.fillText(formatTime(race.current(now)), x + 16, y + 66);
  ctx.font = '600 14px ui-monospace, Consolas, monospace';
  ctx.fillStyle = '#8a93c0';
  ctx.fillText(`LAST ${race.lastLap ? formatTime(race.lastLap) : '-:--.---'}`, x + 16, y + 90);
  ctx.fillStyle = race.bestLap ? '#c77dff' : '#8a93c0';
  ctx.fillText(`BEST ${race.bestLap ? formatTime(race.bestLap) : '-:--.---'}`, x + 16, y + 110);
  ctx.restore();
}

function drawRaceBanners(ctx: CanvasRenderingContext2D, w: number, h: number, hud: RaceHud): void {
  ctx.save();
  ctx.textAlign = 'center';
  if (hud.countdown) {
    ctx.font = '900 96px system-ui, sans-serif';
    ctx.fillStyle = hud.countdown === 'GO' ? '#4dff9a' : '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 16;
    ctx.fillText(hud.countdown, w / 2, h * 0.38);
  }
  if (hud.banner) {
    ctx.fillStyle = 'rgba(8,10,22,0.8)';
    roundRect(ctx, w / 2 - 210, h * 0.3 - 50, 420, 96, 14);
    ctx.fill();
    ctx.font = '900 40px system-ui, sans-serif';
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(hud.banner, w / 2, h * 0.3 + 2);
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillStyle = '#c8d2ff';
    ctx.fillText('R: race again   ·   Esc: menu', w / 2, h * 0.3 + 32);
  }
  ctx.restore();
}

export function formatTime(t: number): string {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

function drawCursor(ctx: CanvasRenderingContext2D, cursor: { x: number; y: number }): void {
  // A plain arrow pointer, tip at the cursor position.
  ctx.save();
  ctx.translate(cursor.x, cursor.y);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 22);
  ctx.lineTo(5.5, 16.5);
  ctx.lineTo(9.5, 25.5);
  ctx.lineTo(13, 24);
  ctx.lineTo(9, 15);
  ctx.lineTo(16.5, 15);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#0a0a12';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles) {
    const a = p.life / p.max;
    ctx.fillStyle = `hsla(${p.hue}, 100%, 60%, ${a * 0.55})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/** Craft size and where the rear exhausts sit, in world px (heading along +x). */
export const CRAFT_LENGTH = 80;
export const NOZZLE_BACK = CRAFT_LENGTH / 2 - 4;
export const NOZZLE_SIDE = 5.5;

function drawCraft(ctx: CanvasRenderingContext2D, c: Craft, time: number, sprite: Sprite, hue: number): void {
  const bob = Math.sin(time * 5 + c.pos.x * 0.001) * 2.5;
  const hoverHeight = 10 + bob;
  const width = CRAFT_LENGTH * sprite.aspect;

  // Shadow on the ground: the sprite's silhouette, shifted and blurred by hover height.
  ctx.save();
  ctx.translate(c.pos.x + hoverHeight * 0.6, c.pos.y + hoverHeight);
  ctx.rotate(c.heading);
  ctx.globalAlpha = 0.5;
  if (sprite.canvas) {
    ctx.filter = `brightness(0) blur(${2 + bob * 0.5}px)`;
    drawSprite(ctx, sprite);
  } else {
    ctx.fillStyle = '#000';
    ctx.fillRect(-CRAFT_LENGTH / 2, -width / 2, CRAFT_LENGTH, width);
  }
  ctx.restore();

  ctx.save();
  ctx.translate(c.pos.x, c.pos.y);
  ctx.rotate(c.heading);

  // Thruster flames out of the twin rear exhausts.
  const flame = 10 + c.thrust * 22 + Math.random() * 4;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const side of [-NOZZLE_SIDE, NOZZLE_SIDE]) {
    const g = ctx.createLinearGradient(-NOZZLE_BACK, 0, -NOZZLE_BACK - flame, 0);
    g.addColorStop(0, `hsla(${hue}, 100%, 75%, 0.95)`);
    g.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-NOZZLE_BACK, side - 4); ctx.lineTo(-NOZZLE_BACK - flame, side); ctx.lineTo(-NOZZLE_BACK, side + 4);
    ctx.fill();
  }
  ctx.restore();

  if (sprite.canvas) drawSprite(ctx, sprite);
  ctx.restore();
}

/**
 * The draft: while a car is towed, flowing wavy air lines run from its nose up to the tail of
 * the car it's following, in the follower's exhaust color, drifting forward as if sucked along.
 */
function drawSlipstreams(ctx: CanvasRenderingContext2D, cars: Car[], time: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const car of cars) {
    const c = car.craft, lead = c.slipFrom;
    if (!lead || c.slipstream < 0.05) continue;
    const ax = c.pos.x + Math.cos(c.heading) * CRAFT_LENGTH * 0.45;
    const ay = c.pos.y + Math.sin(c.heading) * CRAFT_LENGTH * 0.45;
    const bx = lead.pos.x - Math.cos(lead.heading) * CRAFT_LENGTH * 0.5;
    const by = lead.pos.y - Math.sin(lead.heading) * CRAFT_LENGTH * 0.5;
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    if (len < 4) continue;
    const ux = dx / len, uy = dy / len, px = -uy, py = ux;
    const steps = Math.max(6, Math.round(len / 8));
    for (const lane of [-1, 0, 1]) {
      ctx.strokeStyle = `hsla(${car.hue}, 100%, 72%, ${c.slipstream * (lane === 0 ? 0.55 : 0.35)})`;
      ctx.lineWidth = lane === 0 ? 2.5 : 1.5;
      ctx.setLineDash([14, 12]);
      ctx.lineDashOffset = -time * 160;     // dashes stream toward the car ahead
      ctx.beginPath();
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        // Lanes start wide at our nose and pinch in to the leader's tail, with a travelling wave.
        const spread = lane * 16 * (1 - t * 0.75);
        const wave = Math.sin(t * len / 22 - time * 14 + lane) * 2.5 * (1 - t * 0.5);
        const x = ax + ux * len * t + px * (spread + wave);
        const y = ay + uy * len * t + py * (spread + wave);
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Draw the sprite centered on the origin, pointing along +x (the heading). */
function drawSprite(ctx: CanvasRenderingContext2D, sprite: Sprite): void {
  const width = CRAFT_LENGTH * sprite.aspect;
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(sprite.canvas!, -width / 2, -CRAFT_LENGTH / 2, width, CRAFT_LENGTH);
}

function drawHud(ctx: CanvasRenderingContext2D, w: number, h: number, c: Craft, toast: Toast | null, locked: boolean): void {
  const x = w - 260, y = h - 150;
  ctx.save();
  ctx.fillStyle = 'rgba(8,10,22,0.7)';
  roundRect(ctx, x, y, 236, 126, 12);
  ctx.fill();

  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillStyle = '#8a93c0';
  ctx.fillText('SPEED', x + 16, y + 26);
  ctx.fillText('GEAR', x + 168, y + 26);

  ctx.font = '700 40px system-ui, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText(String(Math.round(c.speed / 4)), x + 16, y + 68);
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.fillStyle = '#8a93c0';
  ctx.fillText('km/h', x + 100, y + 68);

  ctx.font = '800 44px system-ui, sans-serif';
  ctx.fillStyle = c.rev > 0.9 ? '#ffd23f' : '#6ff3ff';
  ctx.fillText(String(c.gear + 1), x + 172, y + 70);

  // Rev bar: fills through the gear's speed band; the gearbox shifts up near the end.
  const bx = x + 16, by = y + 86, bw = 204, bh = 10;
  ctx.fillStyle = '#1b2040';
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = c.rev > 0.9 ? '#ffd23f' : '#3fa9ff';
  ctx.fillRect(bx, by, bw * c.rev, bh);

  // Slipstream meter: only shown while towing.
  if (c.slipstream > 0.05) {
    ctx.globalAlpha = clamp(c.slipstream * 2, 0, 1);
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.fillStyle = '#dff4ff';
    ctx.fillText('SLIPSTREAM', bx, y + 116);
    ctx.fillStyle = '#1b2040';
    ctx.fillRect(bx + 80, y + 108, bw - 80, 6);
    ctx.fillStyle = '#dff4ff';
    ctx.fillRect(bx + 80, y + 108, (bw - 80) * c.slipstream, 6);
    ctx.globalAlpha = 1;
  }

  // Gear pips.
  for (let i = 0; i < GEARS.length; i++) {
    ctx.fillStyle = i <= c.gear ? '#6ff3ff' : '#2a3060';
    ctx.fillRect(x + 168 + i * 11, y + 34, 8, 4);
  }

  if (toast && toast.t > 0) {
    ctx.globalAlpha = clamp(toast.t / 0.3, 0, 1);
    ctx.font = '800 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = toast.color;
    ctx.fillText(toast.text, w / 2, h * 0.22);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  ctx.font = '500 13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(200,210,255,0.7)';
  const help = locked
    ? 'Mouse: steer   W: accelerate   D / S / Space: brake   R: restart   Esc: pause'
    : 'Click to lock the mouse   Mouse: steer   W: accelerate   D / S / Space: brake   R: restart   Esc: pause';
  ctx.fillText(help, 16, h - 16);
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
