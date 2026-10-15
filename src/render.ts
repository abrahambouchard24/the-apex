// Everything drawn to the canvas. Reads game state, never changes it.

import { Craft, GEARS, clamp } from './craft';
import { drawGround as drawSceneryGround, drawOverlays, drawProps, View } from './scenery';
import { COOL_LANE, HALF_WIDTH, RaceState, Track, WALL_DIST, WALL_THICKNESS } from './track';

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
export interface Car { craft: Craft; race: RaceState; sprite: Sprite; color: string; hue: number; name: string }

export interface RaceHud {
  position: number; racers: number; laps: number; countdown: string | null; banner: string | null;
  /** The player's catch-up pace bonus as a fraction (0.03 = +3%). */
  catchUp: number;
  /** Show the turbo-start tip under the countdown. */
  launchHint: boolean;
  /** Time gaps to the cars just ahead of and behind the player (null when there isn't one). */
  ahead: { name: string; color: string; gap: number } | null;
  behind: { name: string; color: string; gap: number } | null;
  /** DRS is enabled for the player this lap (from lap 2). */
  drsAvailable: boolean;
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

  // The visible world rectangle, for culling scenery, and the camera centre its 2.5D lean is measured from.
  const viewW = w / cam.zoom, viewH = h / cam.zoom;
  const view: View = { x0: cam.x - viewW / 2, y0: cam.y - viewH / 2, x1: cam.x + viewW / 2, y1: cam.y + viewH / 2, cx: cam.x, cy: cam.y };
  drawSceneryGround(ctx, s.track, view, s.time);
  drawTrack(ctx, s.track, s.time);
  drawProps(ctx, s.track, view, s.time);
  drawParticles(ctx, s.particles);
  drawSlipstreams(ctx, s.cars, s.time);
  for (const car of s.cars) drawCraft(ctx, car.craft, s.time, car.sprite, car.hue);
  drawOverlays(ctx, s.track, view, s.time);

  ctx.restore();
  drawVignette(ctx, w, h);

  drawMinimap(ctx, w, h, s.track, s.cars, s.player);
  drawLapPanel(ctx, s.player.race, s.time, s.hud);
  drawGapPanel(ctx, s.hud);
  drawHud(ctx, w, h, s.player.craft, s.toast, s.locked, s.hud);
  drawRaceBanners(ctx, w, h, s.hud);
  drawCursor(ctx, s.cursor);
}

/** Static track geometry as Path2Ds, built once per track. */
interface TrackPaths {
  center: Path2D; kerbRed: Path2D; kerbWhite: Path2D; kerbEdge: Path2D; seams: Path2D; lanes: Path2D; rails: Path2D;
  chevrons: Path2D; lights: Path2D; coolLane: Path2D; coolLine: Path2D;
}
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

  // Kerbs: light-strip segments along both edges through each corner (lit and dark in turn),
  // with a thin glowing line along their inner edge.
  const kerbRed = new Path2D(), kerbWhite = new Path2D(), kerbEdge = new Path2D();
  for (let i = 0; i < m; i++) {
    if (Math.abs(pts[i].curve) < KERB_CURVE) continue;
    const path = Math.floor(i / 2) % 2 ? kerbRed : kerbWhite;
    for (const side of [1, -1]) {
      const a = off(i, side * (HALF_WIDTH - 14)), b = off(i + 1, side * (HALF_WIDTH - 14));
      const c = off(i + 1, side * HALF_WIDTH), d = off(i, side * HALF_WIDTH);
      path.moveTo(a[0], a[1]); path.lineTo(b[0], b[1]); path.lineTo(c[0], c[1]); path.lineTo(d[0], d[1]); path.closePath();
      kerbEdge.moveTo(a[0], a[1]); kerbEdge.lineTo(b[0], b[1]);
    }
  }

  // Deck plates: fine seams across the surface every few samples.
  const seams = new Path2D();
  for (let i = 0; i < m; i += 4) {
    const a = off(i, HALF_WIDTH - 16), b = off(i, -(HALF_WIDTH - 16));
    seams.moveTo(a[0], a[1]); seams.lineTo(b[0], b[1]);
  }
  // Lane guides a third of the way in from each edge, and the energy rails along both edges.
  const polyline = (path: Path2D, d: number) => {
    for (let i = 0; i <= m; i++) { const [x, y] = off(i, d); if (i) path.lineTo(x, y); else path.moveTo(x, y); }
  };
  const lanes = new Path2D(), rails = new Path2D();
  polyline(lanes, HALF_WIDTH / 3); polyline(lanes, -HALF_WIDTH / 3);
  polyline(rails, HALF_WIDTH - 4); polyline(rails, -(HALF_WIDTH - 4));

  // Chevrons pointing the way down the straights.
  const chevrons = new Path2D();
  for (let i = 0; i < m; i += 30) {
    let straight = true;
    for (let k = -6; k <= 6; k++) if (Math.abs(pts[(i + k + m) % m].curve) > 1 / 2500) straight = false;
    if (!straight) continue;
    const p = pts[i], dir = track.direction(i), fx = Math.cos(dir), fy = Math.sin(dir);
    for (const lane of [-HALF_WIDTH / 1.5, 0, HALF_WIDTH / 1.5]) {
      const cx = p.x + p.nx * lane, cy = p.y + p.ny * lane;
      chevrons.moveTo(cx - fx * 12 + p.nx * 18, cy - fy * 12 + p.ny * 18);
      chevrons.lineTo(cx + fx * 8, cy + fy * 8);
      chevrons.lineTo(cx - fx * 12 - p.nx * 18, cy - fy * 12 - p.ny * 18);
    }
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

  // Cooling lane: a band along the outside edge of the straight, plus its center line for the chevrons.
  const coolLane = new Path2D(), coolLine = new Path2D();
  const inner = COOL_LANE.side * (HALF_WIDTH - COOL_LANE.width), outer = COOL_LANE.side * HALF_WIDTH;
  for (let i = COOL_LANE.from; i <= COOL_LANE.to; i++) {
    const [x, y] = off(i, inner);
    if (i === COOL_LANE.from) coolLane.moveTo(x, y); else coolLane.lineTo(x, y);
  }
  for (let i = COOL_LANE.to; i >= COOL_LANE.from; i--) { const [x, y] = off(i, outer); coolLane.lineTo(x, y); }
  coolLane.closePath();
  for (let i = COOL_LANE.from; i <= COOL_LANE.to; i++) {
    const [x, y] = off(i, COOL_LANE.side * (HALF_WIDTH - COOL_LANE.width / 2));
    if (i === COOL_LANE.from) coolLine.moveTo(x, y); else coolLine.lineTo(x, y);
  }

  const built = { center, kerbRed, kerbWhite, kerbEdge, seams, lanes, rails, chevrons, lights, coolLane, coolLine };
  pathCache.set(track, built);
  return built;
}

function drawTrack(ctx: CanvasRenderingContext2D, track: Track, time: number): void {
  const p = trackPaths(track);
  const theme = track.theme;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Barriers: a soft glow, the shadow they cast outward, then the barrier band itself with a
  // bright rim on its outer edge. Each is a wide stroke along the centerline; the racing
  // surface is drawn over the middle afterwards, so only the outer edges remain visible.
  ctx.strokeStyle = theme.wall;
  ctx.globalAlpha = 0.16;
  ctx.lineWidth = WALL_DIST * 2 + 34;
  ctx.stroke(p.center);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.lineWidth = WALL_DIST * 2 + 16;
  ctx.stroke(p.center);
  ctx.strokeStyle = theme.wall;
  ctx.lineWidth = WALL_DIST * 2;
  ctx.stroke(p.center);
  ctx.strokeStyle = '#1d2a55';
  ctx.lineWidth = WALL_DIST * 2 - 6;
  ctx.stroke(p.center);
  // Bright inner face of the barrier, where you scrape.
  ctx.strokeStyle = theme.wallFace;
  ctx.lineWidth = HALF_WIDTH * 2 + 6;
  ctx.stroke(p.center);
  ctx.strokeStyle = theme.surface;
  ctx.lineWidth = HALF_WIDTH * 2;
  ctx.stroke(p.center);
  // A softly lit racing groove down the middle: darker toward the edges, brighter in the centre.
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.lineWidth = HALF_WIDTH * 2;
  ctx.stroke(p.center);
  ctx.strokeStyle = theme.surface;
  ctx.lineWidth = HALF_WIDTH * 2 - 36;
  ctx.stroke(p.center);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.028)';
  ctx.lineWidth = HALF_WIDTH * 1.2;
  ctx.stroke(p.center);
  ctx.lineWidth = HALF_WIDTH * 0.6;
  ctx.stroke(p.center);

  // Deck plate seams and lane guides.
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.lineWidth = 2;
  ctx.stroke(p.seams);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
  ctx.lineWidth = 1;
  ctx.translate(0, 1);
  ctx.stroke(p.seams);
  ctx.translate(0, -1);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = theme.wall;
  ctx.globalAlpha = 0.1;
  ctx.lineWidth = 2;
  ctx.setLineDash([26, 34]);
  ctx.stroke(p.lanes);
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.09;
  ctx.lineWidth = 5;
  ctx.lineJoin = 'miter';
  ctx.stroke(p.chevrons);
  ctx.restore();

  // Kerbs: lit segments in the track's colour, dark ones between, and a glowing inner edge.
  ctx.fillStyle = theme.kerb;
  ctx.fill(p.kerbRed);
  ctx.fillStyle = '#0d0f1c';
  ctx.fill(p.kerbWhite);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = theme.kerb;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2;
  ctx.stroke(p.kerbEdge);
  ctx.restore();

  // Energy rails along both edges, with pulses of light streaming forward along them.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = theme.wall;
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 9;
  ctx.stroke(p.rails);
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 2;
  ctx.stroke(p.rails);
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 3;
  ctx.setLineDash([46, 330]);
  ctx.lineDashOffset = -time * 1100;
  ctx.stroke(p.rails);
  ctx.restore();

  const pulse = 0.55 + 0.45 * Math.sin(time * 4);
  ctx.fillStyle = `rgba(${theme.lights}, ${pulse})`;
  ctx.fill(p.lights);

  drawCoolLane(ctx, track, p, time);

  drawDrsZones(ctx, track);
  drawStartLine(ctx, track, time);
  ctx.restore();
}

function drawCoolLane(ctx: CanvasRenderingContext2D, track: Track, p: TrackPaths, time: number): void {
  ctx.save();
  ctx.fillStyle = 'rgba(90, 210, 255, 0.16)';
  ctx.fill(p.coolLane);
  ctx.strokeStyle = 'rgba(150, 235, 255, 0.85)';
  ctx.lineWidth = 2;
  ctx.stroke(p.coolLane);
  // Chevrons flowing down the lane.
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(150, 235, 255, 0.5)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  const span = COOL_LANE.to - COOL_LANE.from;
  for (let k = 0; k < 8; k++) {
    const t = ((k / 8 + time * 0.35) % 1);
    const i = COOL_LANE.from + Math.floor(t * span);
    const pt = track.pts[i];
    const mid = COOL_LANE.side * (HALF_WIDTH - COOL_LANE.width / 2);
    const cx = pt.x + pt.nx * mid, cy = pt.y + pt.ny * mid;
    const dir = track.direction(i), fx = Math.cos(dir), fy = Math.sin(dir);
    const half = COOL_LANE.width * 0.3;
    ctx.beginPath();
    ctx.moveTo(cx - fx * 10 + pt.nx * half, cy - fy * 10 + pt.ny * half);
    ctx.lineTo(cx + fx * 6, cy + fy * 6);
    ctx.lineTo(cx - fx * 10 - pt.nx * half, cy - fy * 10 - pt.ny * half);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  // Label at the start of the lane.
  const s = track.pts[COOL_LANE.from + 2];
  const mid = COOL_LANE.side * (HALF_WIDTH - COOL_LANE.width / 2);
  ctx.translate(s.x + s.nx * mid, s.y + s.ny * mid);
  ctx.rotate(track.direction(COOL_LANE.from + 2));
  ctx.font = '800 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(200, 245, 255, 0.9)';
  ctx.fillText('COOL', 0, 0);
  ctx.restore();
}

/** A dashed green line and "DRS" across the track where each zone starts, a fainter line where it ends. */
function drawDrsZones(ctx: CanvasRenderingContext2D, track: Track): void {
  ctx.save();
  for (const z of track.drsZones) {
    for (const [i, start] of [[z.from, true], [z.to, false]] as const) {
      const p = track.pts[i];
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(track.direction(i));
      ctx.strokeStyle = start ? 'rgba(77, 255, 154, 0.85)' : 'rgba(77, 255, 154, 0.35)';
      ctx.lineWidth = start ? 4 : 2;
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      ctx.moveTo(0, -HALF_WIDTH + 6);
      ctx.lineTo(0, HALF_WIDTH - 6);
      ctx.stroke();
      if (start) {
        ctx.setLineDash([]);
        ctx.font = '900 22px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(77, 255, 154, 0.75)';
        ctx.rotate(Math.PI / 2);   // reads along the direction of travel
        ctx.fillText('DRS', 0, -26);
      }
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawStartLine(ctx: CanvasRenderingContext2D, track: Track, time: number): void {
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
  // Holographic gantry: glowing beams either side of the line and emitter posts at each end.
  ctx.globalCompositeOperation = 'lighter';
  const flicker = 0.75 + 0.25 * Math.sin(time * 9) * Math.sin(time * 3.7);
  for (const bx of [-sq - 7, sq + 7]) {
    ctx.fillStyle = `rgba(${track.theme.lights}, ${0.18 * flicker})`;
    ctx.fillRect(bx - 6, -HALF_WIDTH, 12, HALF_WIDTH * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.7 * flicker})`;
    ctx.fillRect(bx - 1, -HALF_WIDTH, 2, HALF_WIDTH * 2);
  }
  for (const side of [-1, 1]) {
    ctx.fillStyle = `rgba(${track.theme.lights}, 0.9)`;
    ctx.beginPath(); ctx.arc(0, side * (HALF_WIDTH + WALL_THICKNESS / 2), 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, side * (HALF_WIDTH + WALL_THICKNESS / 2), 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/**
 * How much bigger the minimap and the dash draw, so they can be read at a glance at speed:
 * about 1.6x on a full-HD screen, 1.45x at 1280x720, and normal size on small windows.
 */
function hudScale(w: number, h: number): number {
  return clamp(Math.min(w / 1280, h / 720) * 1.45, 1, 1.6);
}

function drawMinimap(ctx: CanvasRenderingContext2D, w: number, h: number, track: Track, cars: Car[], player: Car): void {
  const b = track.bounds;
  const k = hudScale(w, h);
  const boxW = 220 * k, boxH = 160 * k, pad = 14 * k;
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
  ctx.lineWidth = (9 * k) / scale;
  ctx.stroke(center);
  ctx.strokeStyle = '#8a93c0';
  ctx.lineWidth = (3 * k) / scale;
  ctx.stroke(center);
  const s = track.pts[0];
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(s.x, s.y, (4 * k) / scale, 0, Math.PI * 2);
  ctx.fill();
  // Player drawn last so it sits on top.
  for (const car of [...cars.filter((c) => c !== player), player]) {
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.arc(car.craft.pos.x, car.craft.pos.y, ((car === player ? 6 : 5) * k) / scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Live time gaps to the cars just ahead (+) and behind (-), under the lap panel. */
function drawGapPanel(ctx: CanvasRenderingContext2D, hud: RaceHud): void {
  const rows = [
    hud.ahead && { label: 'AHEAD', ...hud.ahead, text: `+${hud.ahead.gap.toFixed(1)}` },
    hud.behind && { label: 'BEHIND', ...hud.behind, text: `-${hud.behind.gap.toFixed(1)}` },
  ].filter((r): r is NonNullable<typeof r> => !!r);
  if (!rows.length) return;
  const x = 24, y = 152;
  ctx.save();
  ctx.fillStyle = 'rgba(8,10,22,0.7)';
  roundRect(ctx, x, y, 220, 16 + rows.length * 24, 12);
  ctx.fill();
  rows.forEach((r, i) => {
    const ry = y + 28 + i * 24;
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillStyle = '#8a93c0';
    ctx.textAlign = 'left';
    ctx.fillText(r.label, x + 16, ry);
    ctx.font = '800 13px system-ui, sans-serif';
    ctx.fillStyle = r.color;
    ctx.fillText(r.name, x + 70, ry);
    ctx.font = '700 15px ui-monospace, Consolas, monospace';
    // Within a second of the car ahead: green, you can get DRS on it.
    ctx.fillStyle = r.label === 'AHEAD' && r.gap < 1 ? '#4dff9a' : r.label === 'BEHIND' && r.gap < 1 ? '#ffb02e' : '#fff';
    ctx.textAlign = 'right';
    ctx.fillText(r.text, x + 204, ry);
  });
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
    if (hud.launchHint) {
      ctx.shadowBlur = 0;
      ctx.font = '700 16px system-ui, sans-serif';
      ctx.fillStyle = '#c8d2ff';
      ctx.fillText('Hold left click (brake), release it right on GO for a turbo start', w / 2, h * 0.38 + 40);
    }
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
  // (hue is reassigned below while ERS is deploying)
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
  const flame = 10 + c.thrust * 22 + (c.deploying ? 16 : 0) + Math.random() * 4;
  if (c.deploying) hue = 280;
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

  // Electric outlines: green while the DRS wing is open, purple while the ERS battery is full.
  if (sprite.canvas) {
    const full = c.energy >= ENERGY_FULL;
    // Both at once: the green charge crackles outside, the purple one hugs the hull.
    if (c.drsOpen) drawElectric(ctx, sprite, DRS_GLOW, full ? 4.5 : 2);
    if (full) drawElectric(ctx, sprite, ERS_GLOW, 2);
    drawSprite(ctx, sprite);
  }
  ctx.restore();
}

/** A soft darkening toward the screen edges that draws the eye to the middle (cached per size). */
let vignette: { w: number; h: number; g: CanvasGradient } | null = null;
function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  if (!vignette || vignette.w !== w || vignette.h !== h) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    g.addColorStop(0, 'rgba(4, 5, 12, 0)');
    g.addColorStop(1, 'rgba(4, 5, 12, 0.55)');
    vignette = { w, h, g };
  }
  ctx.fillStyle = vignette.g;
  ctx.fillRect(0, 0, w, h);
}

const DRS_GLOW = '#4dff9a';
const ERS_GLOW = '#b86bff';
/** The battery counts as full from here (it charges in small steps). */
const ENERGY_FULL = 0.995;

/** One solid-color copy of each sprite per color, for outlines. */
const silhouettes = new Map<HTMLCanvasElement, Map<string, HTMLCanvasElement>>();

function silhouette(sprite: Sprite, color: string): HTMLCanvasElement {
  const src = sprite.canvas!;
  let byColor = silhouettes.get(src);
  if (!byColor) silhouettes.set(src, byColor = new Map());
  let out = byColor.get(color);
  if (!out) {
    out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    const octx = out.getContext('2d')!;
    octx.drawImage(src, 0, 0);
    octx.globalCompositeOperation = 'source-in';
    octx.fillStyle = color;
    octx.fillRect(0, 0, out.width, out.height);
    byColor.set(color, out);
  }
  return out;
}

/**
 * An electric outline around the craft's own shape: a thin rim that jitters and flickers every
 * frame, a white-hot core, and short lightning arcs crackling off the hull.
 * Call in the craft's local frame (nose along +x).
 */
function drawElectric(ctx: CanvasRenderingContext2D, sprite: Sprite, color: string, thickness: number): void {
  const width = CRAFT_LENGTH * sprite.aspect;
  ctx.save();
  ctx.rotate(Math.PI / 2);
  // The rim: the silhouette nudged out in 8 directions, each by a slightly different random amount.
  const sil = silhouette(sprite, color);
  ctx.globalAlpha = 0.55 + Math.random() * 0.45;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, d = thickness * (0.6 + Math.random() * 0.8);
    ctx.drawImage(sil, -width / 2 + Math.cos(a) * d, -CRAFT_LENGTH / 2 + Math.sin(a) * d, width, CRAFT_LENGTH);
  }
  // White-hot core just outside the hull.
  const core = silhouette(sprite, '#ffffff');
  ctx.globalAlpha = 0.35 + Math.random() * 0.35;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    ctx.drawImage(core, -width / 2 + Math.cos(a), -CRAFT_LENGTH / 2 + Math.sin(a), width, CRAFT_LENGTH);
  }
  ctx.restore();

  // Lightning: a few jagged arcs that jump around the hull, redrawn somewhere new each frame.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'miter';
  const rx = CRAFT_LENGTH / 2 + thickness + 2, ry = width / 2 + thickness + 2;
  const arcs = 2 + Math.floor(Math.random() * 2);
  for (let n = 0; n < arcs; n++) {
    const start = Math.random() * Math.PI * 2, span = 0.5 + Math.random() * 0.6;
    const pts: [number, number][] = [];
    for (let k = 0; k <= 6; k++) {
      const t = start + (span * k) / 6;
      const out = k === 0 || k === 6 ? 0 : (Math.random() - 0.3) * 7;
      pts.push([Math.cos(t) * (rx + out), Math.sin(t) * (ry + out)]);
    }
    for (const [w, style] of [[3, color], [1, '#ffffff']] as const) {
      ctx.lineWidth = w;
      ctx.strokeStyle = style;
      ctx.globalAlpha = w === 3 ? 0.7 : 0.9;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
  }
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

function drawHud(ctx: CanvasRenderingContext2D, w: number, h: number, c: Craft, toast: Toast | null, locked: boolean, hud: RaceHud): void {
  ctx.save();
  // The dash is laid out at normal size, then scaled up from the bottom-right corner.
  ctx.save();
  ctx.translate(w - 24, h - 24);
  ctx.scale(hudScale(w, h), hudScale(w, h));
  const x = -236, y = -168;
  ctx.fillStyle = 'rgba(8,10,22,0.7)';
  roundRect(ctx, x, y, 236, 168, 12);
  ctx.fill();

  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillStyle = '#8a93c0';
  ctx.fillText('SPEED', x + 16, y + 26);
  ctx.fillText('GEAR', x + 168, y + 26);

  // DRS badge: solid green while the wing is open, an outline once DRS is enabled for the race.
  if (c.drsOpen || hud.drsAvailable) {
    const bx0 = x + 98, by0 = y + 12;
    ctx.save();
    roundRect(ctx, bx0, by0, 46, 20, 5);
    if (c.drsOpen) {
      ctx.fillStyle = '#4dff9a';
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(138, 147, 192, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.font = '800 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = c.drsOpen ? '#07080f' : 'rgba(138, 147, 192, 0.8)';
    ctx.fillText('DRS', bx0 + 23, by0 + 14);
    ctx.restore();
  }

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

  // Heat meter: green while cool, orange once it's costing speed, flashing red when overheated.
  const heatColor = c.overheated ? '#ff3d3d' : c.heat > 0.6 ? '#ffb02e' : '#4dff9a';
  ctx.font = '700 11px system-ui, sans-serif';
  ctx.fillStyle = c.overheated ? heatColor : '#8a93c0';
  ctx.fillStyle = c.cooling ? '#8feaff' : ctx.fillStyle;
  ctx.fillText(c.cooling ? 'COOLING' : c.overheated ? 'OVERHEAT' : 'HEAT', bx, y + 116);
  ctx.fillStyle = '#1b2040';
  ctx.fillRect(bx + 80, y + 108, bw - 80, 6);
  ctx.globalAlpha = c.overheated ? 0.55 + 0.45 * Math.sin(performance.now() / 90) : 1;
  ctx.fillStyle = heatColor;
  ctx.fillRect(bx + 80, y + 108, (bw - 80) * c.heat, 6);
  ctx.globalAlpha = 1;

  // ERS energy: violet, brighter while deploying.
  ctx.font = '700 11px system-ui, sans-serif';
  ctx.fillStyle = c.deploying ? '#d9a6ff' : '#8a93c0';
  ctx.fillText(c.deploying ? 'DEPLOYING' : 'ENERGY', bx, y + 136);
  ctx.fillStyle = '#1b2040';
  ctx.fillRect(bx + 80, y + 128, bw - 80, 6);
  ctx.fillStyle = c.deploying ? '#d9a6ff' : '#9d5cff';
  if (c.energy >= ENERGY_FULL) {
    // Full battery: the bar flickers with charge and a spark jumps along it.
    const flicker = Math.random();
    ctx.fillStyle = flicker > 0.8 ? '#ffffff' : `rgb(${Math.round(160 + flicker * 60)}, ${Math.round(95 + flicker * 70)}, 255)`;
    ctx.fillRect(bx + 80, y + 128, bw - 80, 6);
    const sx = bx + 80 + Math.random() * (bw - 80);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx - 6, y + 126); ctx.lineTo(sx - 1, y + 131); ctx.lineTo(sx + 2, y + 127); ctx.lineTo(sx + 7, y + 133);
    ctx.stroke();
  } else {
    ctx.fillRect(bx + 80, y + 128, (bw - 80) * c.energy, 6);
  }

  // Slipstream meter: only shown while towing.
  if (c.slipstream > 0.05) {
    ctx.globalAlpha = clamp(c.slipstream * 2, 0, 1);
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.fillStyle = '#dff4ff';
    ctx.fillText('SLIPSTREAM', bx, y + 156);
    ctx.fillStyle = '#1b2040';
    ctx.fillRect(bx + 80, y + 148, bw - 80, 6);
    ctx.fillStyle = '#dff4ff';
    ctx.fillRect(bx + 80, y + 148, (bw - 80) * c.slipstream, 6);
    ctx.globalAlpha = 1;
  }

  // Gear pips.
  for (let i = 0; i < GEARS.length; i++) {
    ctx.fillStyle = i <= c.gear ? '#6ff3ff' : '#2a3060';
    ctx.fillRect(x + 168 + i * 11, y + 34, 8, 4);
  }
  ctx.restore();

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
    ? 'Mouse: steer   Auto-accelerate   Left click: brake   Right click: boost   R: restart   Esc: pause'
    : 'Click to lock the mouse   Mouse: steer   Auto-accelerate   Left click: brake   Right click: boost   R: restart   Esc: pause';
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
