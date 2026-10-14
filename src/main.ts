import { Driver } from './ai';
import { Craft, clamp, collideCrafts, lerp } from './craft';
import { Input } from './input';
import { Camera, Car, NOZZLE_BACK, NOZZLE_SIDE, Particle, RaceHud, Toast, drawFrame, formatTime, loadSprite } from './render';
import { RaceState, Track, collideWalls, placeOnGrid } from './track';

const STEP = 1 / 60;
const RACE_LAPS = 3;
const COUNTDOWN = 3;          // seconds of 3-2-1 before GO
const AI_SKILL = 0.75;        // 1 = drives near the grip limit; lower brakes earlier and corners slower

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const input = new Input(canvas);

const track = new Track();
const SPRITES = {
  red: loadSprite('/sprites/craft-red.png'),
  cyan: loadSprite('/sprites/craft-cyan.webp'),
};

let player: Car;
let rivals: { car: Car; driver: Driver }[] = [];
let cars: Car[] = [];
let bestLap = 0;              // kept across restarts
const particles: Particle[] = [];
const cam: Camera = { x: 0, y: 0, zoom: 1, shake: 0 };
let toast: Toast | null = null;
let time = 0;
let goTime = 0;               // race time when the lights go out
let finishOrder: Car[] = [];

/** Line everyone up on the grid and start the countdown. */
function startRace(): void {
  const driver = new Driver(AI_SKILL, 1);
  const rival: Car = { craft: driver.craft, race: driver.race, sprite: SPRITES.cyan, color: '#3ff0ff' };
  rival.race.index = placeOnGrid(track, rival.craft, 0);
  rivals = [{ car: rival, driver }];

  player = { craft: new Craft(), race: new RaceState(), sprite: SPRITES.red, color: '#ff3d6e' };
  player.race.index = placeOnGrid(track, player.craft, 1);
  player.race.bestLap = bestLap;

  cars = [rival, player];
  finishOrder = [];
  particles.length = 0;
  goTime = time + COUNTDOWN;
  cam.x = player.craft.pos.x;
  cam.y = player.craft.pos.y;
  // Point the cursor down the straight so the craft doesn't swerve on the first frame.
  input.cursor.x = innerWidth / 2 + Math.cos(player.craft.heading) * 220;
  input.cursor.y = innerHeight / 2 + Math.sin(player.craft.heading) * 220;
}
startRace();

// Checked every frame: zoom and display changes alter devicePixelRatio without a resize event.
function fitCanvas(): void {
  const dpr = devicePixelRatio || 1;
  const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// Dev-only handle for poking at game state from the console.
if ((import.meta as unknown as { env: { DEV: boolean } }).env.DEV) {
  (window as unknown as { game: object }).game = {
    get player() { return player; }, get rivals() { return rivals; }, track,
    get time() { return time; }, get goTime() { return goTime; },
  };
}

function showToast(text: string, color: string): void { toast = { text, color, t: 1.6 }; }

function ordinal(n: number): string { return ['1ST', '2ND', '3RD'][n - 1] ?? `${n}TH`; }

function update(dt: number): void {
  time += dt;
  if (input.takeReset()) startRace();
  const racing = time >= goTime;

  // Player: aim from the craft's on-screen position toward the cursor.
  const pc = player.craft;
  const csx = (pc.pos.x - cam.x) * cam.zoom + innerWidth / 2;
  const csy = (pc.pos.y - cam.y) * cam.zoom + innerHeight / 2;
  const dx = input.cursor.x - csx, dy = input.cursor.y - csy;
  const aim = Math.hypot(dx, dy) > 24 ? Math.atan2(dy, dx) : pc.heading;
  pc.step(dt, racing ? aim : pc.heading, racing && input.throttle, racing && input.brake, player.race.offTrack);

  for (const { car, driver } of rivals) {
    const c = racing ? driver.think(track, time) : { aim: car.craft.heading, throttle: false, brake: false };
    car.craft.step(dt, c.aim, c.throttle, c.brake, car.race.offTrack);
  }

  for (const car of cars) {
    const lap = car.race.update(track, car.craft, time, racing);
    if (lap && car.race.lap === RACE_LAPS && !finishOrder.includes(car)) {
      finishOrder.push(car);
      if (car === player) showToast(`FINISHED ${ordinal(finishOrder.length)}`, '#ffd23f');
    } else if (lap && car === player) {
      if (lap === 'best') showToast(`BEST LAP  ${formatTime(player.race.lastLap)}`, '#c77dff');
      else showToast(`LAP  ${formatTime(player.race.lastLap)}`, '#ffffff');
    }
    const impact = collideWalls(track, car.craft, car.race);
    if (car === player && impact > 60) cam.shake = Math.min(18, impact / 25);
  }
  bestLap = player.race.bestLap;

  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const hit = collideCrafts(cars[i].craft, cars[j].craft);
      if (hit > 80 && (cars[i] === player || cars[j] === player)) cam.shake = Math.min(14, hit / 30);
    }
  }

  for (const car of cars) emitTrail(car.craft);
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
  const tx = pc.pos.x + pc.vel.x * lead, ty = pc.pos.y + pc.vel.y * lead;
  cam.x = lerp(cam.x, tx, 1 - Math.exp(-5 * dt));
  cam.y = lerp(cam.y, ty, 1 - Math.exp(-5 * dt));
  const targetZoom = lerp(1.15, 0.75, clamp(pc.speed / 880, 0, 1));
  cam.zoom = lerp(cam.zoom, targetZoom, 1 - Math.exp(-2 * dt));
  cam.shake = Math.max(0, cam.shake - 40 * dt);

  if (toast) toast.t -= dt;
}

function raceHud(): RaceHud {
  // Finished cars rank by finishing order; everyone else by distance covered.
  const ranked = [...cars].sort((a, b) => {
    const fa = finishOrder.indexOf(a), fb = finishOrder.indexOf(b);
    if (fa >= 0 || fb >= 0) return (fa < 0 ? Infinity : fa) - (fb < 0 ? Infinity : fb);
    return b.race.progress(track) - a.race.progress(track);
  });
  const left = goTime - time;
  const countdown = left > 0 ? String(Math.ceil(left)) : left > -0.8 ? 'GO' : null;
  const place = finishOrder.indexOf(player);
  const banner = place < 0 ? null : place === 0 ? 'YOU WIN!' : `FINISHED ${ordinal(place + 1)}`;
  return { position: ranked.indexOf(player) + 1, racers: cars.length, laps: RACE_LAPS, countdown, banner };
}

function emitTrail(craft: Craft): void {
  if (craft.speed < 20) return;
  const fx = Math.cos(craft.heading), fy = Math.sin(craft.heading);
  const slip = Math.abs(craft.slip);
  // Trail shifts cyan -> magenta with drift angle.
  const hue = lerp(190, 310, clamp(slip / 0.6, 0, 1));
  for (const side of [-NOZZLE_SIDE, NOZZLE_SIDE]) {
    const x = craft.pos.x - fx * NOZZLE_BACK - fy * side;
    const y = craft.pos.y - fy * NOZZLE_BACK + fx * side;
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
  fitCanvas();
  drawFrame(ctx, innerWidth, innerHeight, {
    time, cam, player, cars, track, hud: raceHud(),
    particles, cursor: input.cursor, toast, locked: input.locked,
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
