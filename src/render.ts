// Everything drawn to the canvas. Reads game state, never changes it.

import { Craft, GEARS, clamp } from './craft';
import { ARENA, Pylon } from './world';

export interface Camera { x: number; y: number; zoom: number; shake: number }

export interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; hue: number; size: number }

export interface Toast { text: string; color: string; t: number }

const HALF = ARENA / 2;

export function drawFrame(
  ctx: CanvasRenderingContext2D, w: number, h: number, time: number,
  cam: Camera, craft: Craft, pylons: Pylon[], particles: Particle[],
  cursor: { x: number; y: number }, toast: Toast | null, locked: boolean,
): void {
  ctx.fillStyle = '#07080f';
  ctx.fillRect(0, 0, w, h);

  const sx = (Math.random() - 0.5) * cam.shake, sy = (Math.random() - 0.5) * cam.shake;
  ctx.save();
  ctx.translate(w / 2 + sx, h / 2 + sy);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  drawGround(ctx, cam, w, h);
  drawWalls(ctx, time);
  drawParticles(ctx, particles);
  for (const p of pylons) drawPylon(ctx, p, time);
  drawCraft(ctx, craft, time);

  ctx.restore();

  drawReticle(ctx, cursor);
  drawHud(ctx, w, h, craft, toast, locked);
}

function drawGround(ctx: CanvasRenderingContext2D, cam: Camera, w: number, h: number): void {
  // Only draw grid lines that are on screen.
  const viewW = w / cam.zoom, viewH = h / cam.zoom;
  const x0 = Math.max(-HALF, cam.x - viewW / 2), x1 = Math.min(HALF, cam.x + viewW / 2);
  const y0 = Math.max(-HALF, cam.y - viewH / 2), y1 = Math.min(HALF, cam.y + viewH / 2);
  ctx.fillStyle = '#0d1020';
  ctx.fillRect(-HALF, -HALF, ARENA, ARENA);

  for (const [step, color, width] of [[100, '#151a33', 1], [500, '#222a52', 2]] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
    ctx.stroke();
  }
}

function drawWalls(ctx: CanvasRenderingContext2D, time: number): void {
  ctx.save();
  ctx.strokeStyle = `hsl(${(time * 20) % 360}, 90%, 60%)`;
  ctx.shadowColor = ctx.strokeStyle;
  ctx.shadowBlur = 20;
  ctx.lineWidth = 8;
  ctx.strokeRect(-HALF, -HALF, ARENA, ARENA);
  ctx.restore();
}

function drawPylon(ctx: CanvasRenderingContext2D, p: Pylon, time: number): void {
  // Fake height: shadow offset down-right, body offset up.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.arc(p.x + 8, p.y + 10, p.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a1f3a';
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  const pulse = 0.6 + 0.4 * Math.sin(time * 3 + p.x);
  ctx.save();
  ctx.strokeStyle = `hsla(${p.hue}, 100%, 60%, ${pulse})`;
  ctx.shadowColor = `hsl(${p.hue}, 100%, 60%)`;
  ctx.shadowBlur = 14;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r - 3, 0, Math.PI * 2); ctx.stroke();
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

function drawCraft(ctx: CanvasRenderingContext2D, c: Craft, time: number): void {
  const bob = Math.sin(time * 5) * 2.5;
  const hoverHeight = 10 + bob;

  // Shadow on the ground; it shifts and blurs with hover height.
  ctx.save();
  ctx.translate(c.pos.x + hoverHeight * 0.6, c.pos.y + hoverHeight);
  ctx.rotate(c.heading);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.filter = `blur(${2 + bob * 0.5}px)`;
  hullPath(ctx);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(c.pos.x, c.pos.y);
  ctx.rotate(c.heading);

  // Thruster flames behind the hull.
  const flame = 10 + c.thrust * 18 + (c.boostFlash > 0 ? 26 : 0) + Math.random() * 4;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const hue = c.boostFlash > 0 ? 40 : 190;
  for (const side of [-8, 8]) {
    const g = ctx.createLinearGradient(-20, 0, -20 - flame, 0);
    g.addColorStop(0, `hsla(${hue}, 100%, 75%, 0.95)`);
    g.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-19, side - 4); ctx.lineTo(-20 - flame, side); ctx.lineTo(-19, side + 4);
    ctx.fill();
  }
  ctx.restore();

  // Hull: a wedge, pointing along +x (the heading).
  const body = ctx.createLinearGradient(0, -14, 0, 14);
  body.addColorStop(0, '#ff5a7a');
  body.addColorStop(0.5, '#e0204f');
  body.addColorStop(1, '#8a0f33');
  ctx.fillStyle = body;
  hullPath(ctx);
  ctx.fill();
  ctx.strokeStyle = '#ffd0dc';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Cockpit canopy.
  ctx.fillStyle = '#6ff3ff';
  ctx.beginPath();
  ctx.ellipse(4, 0, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Thruster housings.
  ctx.fillStyle = '#2a2f45';
  ctx.fillRect(-21, -12, 6, 8);
  ctx.fillRect(-21, 4, 6, 8);

  ctx.restore();
}

function hullPath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(24, 0);
  ctx.lineTo(4, -10);
  ctx.lineTo(-16, -15);
  ctx.lineTo(-20, -8);
  ctx.lineTo(-20, 8);
  ctx.lineTo(-16, 15);
  ctx.lineTo(4, 10);
  ctx.closePath();
}

function drawReticle(ctx: CanvasRenderingContext2D, cursor: { x: number; y: number }): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cursor.x, cursor.y, 10, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cursor.x - 16, cursor.y); ctx.lineTo(cursor.x - 6, cursor.y);
  ctx.moveTo(cursor.x + 6, cursor.y); ctx.lineTo(cursor.x + 16, cursor.y);
  ctx.moveTo(cursor.x, cursor.y - 16); ctx.lineTo(cursor.x, cursor.y - 6);
  ctx.moveTo(cursor.x, cursor.y + 6); ctx.lineTo(cursor.x, cursor.y + 16);
  ctx.stroke();
  ctx.restore();
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

  // Drift boost meter.
  ctx.fillStyle = '#1b2040';
  ctx.fillRect(bx, by + 18, bw, 6);
  ctx.fillStyle = '#ff4fd8';
  ctx.fillRect(bx, by + 18, bw * clamp(c.boostCharge / 220, 0, 1), 6);

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
    ? 'Mouse: steer   W: accelerate   D / S / Space: brake   Gears are automatic   R: reset   Esc: release mouse'
    : 'Click to lock the mouse   Mouse: steer   W: accelerate   D / S / Space: brake   R: reset';
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
