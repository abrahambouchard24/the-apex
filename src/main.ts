import { Craft, clamp, lerp } from './craft';
import { Input } from './input';
import { Camera, Particle, Toast, drawFrame } from './render';
import { collide, makePylons } from './world';

const STEP = 1 / 60;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const input = new Input(canvas);

let craft = new Craft();
const pylons = makePylons();
const particles: Particle[] = [];
const cam: Camera = { x: 0, y: 0, zoom: 1, shake: 0 };
let toast: Toast | null = null;
let time = 0;

function resize(): void {
  const dpr = devicePixelRatio || 1;
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize);
resize();

function showToast(text: string, color: string): void { toast = { text, color, t: 1.1 }; }

function update(dt: number): void {
  time += dt;

  if (input.takeReset()) { craft = new Craft(); particles.length = 0; }

  for (let n = input.takeShifts(); n > 0; n--) {
    const result = craft.shiftUp();
    if (result === 'perfect') showToast('PERFECT SHIFT', '#ffd23f');
  }

  // Aim from the craft's on-screen position toward the cursor.
  const csx = (craft.pos.x - cam.x) * cam.zoom + innerWidth / 2;
  const csy = (craft.pos.y - cam.y) * cam.zoom + innerHeight / 2;
  const dx = input.cursor.x - csx, dy = input.cursor.y - csy;
  const aim = Math.hypot(dx, dy) > 24 ? Math.atan2(dy, dx) : craft.heading;

  const boostBefore = craft.boostCharge;
  craft.step(dt, aim, input.brake);
  if (boostBefore > 40 && craft.boostCharge === 0 && craft.boostFlash > 0.45) {
    showToast(`DRIFT BOOST +${Math.round(boostBefore / 4)}`, '#ff4fd8');
  }

  const impact = collide(craft, pylons);
  if (impact > 60) cam.shake = Math.min(18, impact / 25);

  emitTrail();
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.94;
    p.vy *= 0.94;
  }

  // Camera: lead ahead of the velocity, pull back a little at speed.
  const lead = 0.35;
  const tx = craft.pos.x + craft.vel.x * lead, ty = craft.pos.y + craft.vel.y * lead;
  cam.x = lerp(cam.x, tx, 1 - Math.exp(-5 * dt));
  cam.y = lerp(cam.y, ty, 1 - Math.exp(-5 * dt));
  const targetZoom = lerp(1.15, 0.75, clamp(craft.speed / 880, 0, 1));
  cam.zoom = lerp(cam.zoom, targetZoom, 1 - Math.exp(-2 * dt));
  cam.shake = Math.max(0, cam.shake - 40 * dt);

  if (toast) toast.t -= dt;
}

function emitTrail(): void {
  if (craft.speed < 20) return;
  const fx = Math.cos(craft.heading), fy = Math.sin(craft.heading);
  const slip = Math.abs(craft.slip);
  // Trail shifts cyan -> magenta with drift angle; gold during a boost.
  const hue = craft.boostFlash > 0 ? 40 : lerp(190, 310, clamp(slip / 0.6, 0, 1));
  for (const side of [-8, 8]) {
    const x = craft.pos.x - fx * 22 - fy * side;
    const y = craft.pos.y - fy * 22 + fx * side;
    particles.push({
      x, y,
      vx: -fx * 60 + (Math.random() - 0.5) * 30,
      vy: -fy * 60 + (Math.random() - 0.5) * 30,
      life: 0.6, max: 0.6, hue, size: 4 + craft.thrust * 3 + (craft.drifting ? 3 : 0),
    });
  }
}

let last = performance.now();
let acc = 0;
function frame(now: number): void {
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  while (acc >= STEP) { update(STEP); acc -= STEP; }
  drawFrame(ctx, innerWidth, innerHeight, time, cam, craft, pylons, particles, input.cursor, toast, input.locked);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
