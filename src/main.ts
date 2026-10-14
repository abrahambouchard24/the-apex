import { Driver } from './ai';
import { Sound } from './audio';
import { Craft, LAUNCH_TIME, STALL_TIME, clamp, collideCrafts, lerp } from './craft';
import { Input } from './input';
import { Menus, ResultRow, TrackChoice } from './menu';
import { Camera, Car, NOZZLE_BACK, NOZZLE_SIDE, Particle, RaceHud, Toast, drawFrame, formatTime, loadSprite } from './render';
import { RaceState, TRACKS, Track, collideWalls, inCoolingLane, placeOnGrid } from './track';

const STEP = 1 / 60;
const RACE_LAPS = 3;
const COUNTDOWN = 3;          // seconds of 3-2-1 before GO
// AI skill range: 1 = drives near the grip limit; lower brakes earlier and corners slower.
const AI_SKILL_MIN = 0.7;
const AI_SKILL_MAX = 0.9;
const RESULTS_DELAY = 2.5;    // seconds after the player finishes before the results screen
const CATCH_UP_PER_PLACE = 0.01;  // +1% pace for every place behind the leader
// Turbo start: press W in this window around GO for a perfect launch. Holding W from earlier is a jump start.
const LAUNCH_EARLY = 0.3;     // s before GO a press still counts as perfect
const LAUNCH_LATE = 0.15;     // s after GO a press still counts as perfect

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const input = new Input(canvas);
const sound = new Sound();

const tracks = TRACKS.map((def) => new Track(def));
let trackIndex = 0;
let track = tracks[0];
/** The field. The player picks one on the start screen; the rest are AI. hue = exhaust flame color. */
const LIVERIES = [
  { name: '01 RED', url: '/sprites/craft-red.png', color: '#ff3d6e', hue: 190 },
  { name: '02 CYAN', url: '/sprites/craft-cyan.webp', color: '#3ff0ff', hue: 190 },
  { name: '03 GREEN', url: '/sprites/craft-green.png', color: '#2fd16b', hue: 120 },
  { name: '04 ORANGE', url: '/sprites/craft-orange.png', color: '#ff8a1f', hue: 35 },
  { name: '05 PURPLE', url: '/sprites/craft-purple.png', color: '#a46bff', hue: 275 },
  { name: '06 BLUE', url: '/sprites/craft-blue.png', color: '#3d7bff', hue: 215 },
].map((l) => ({ ...l, sprite: loadSprite(l.url) }));

/** menu = start screen; paused = pause menu; racing = the simulation runs; results = it keeps
 * running behind the results table while the rest of the field finishes. */
let mode: 'menu' | 'racing' | 'paused' | 'results' = 'menu';
let playerLivery = 0;
let pausedAt = 0;             // performance.now() when the pause menu opened

let player: Car;
let rivals: { car: Car; driver: Driver }[] = [];
let cars: Car[] = [];
const names = new Map<Car, string>();
const bestLaps = TRACKS.map(() => 0);   // the player's best lap per track, kept across restarts
const particles: Particle[] = [];
const cam: Camera = { x: 0, y: 0, zoom: 1, shake: 0 };
let toast: Toast | null = null;
let time = 0;
let goTime = 0;               // race time when the lights go out
let finishOrder: Car[] = [];
const finishTimes = new Map<Car, number>();   // race time from the lights going out
let autopilot: Driver | null = null;          // drives the player's car once it has finished
let resultsAt = 0;            // race time to show the results screen; 0 = not yet
let resultsRefresh = 0;
let lastCount = 0;            // countdown number last beeped
// Launch judging for the player, and whether the AI have rolled their starts.
let launchJudged = false;
let lastPressAt = -Infinity;
let prevThrottle = false;
let aiLaunched = false;

function livery(i: number) {
  const { sprite, color, hue } = LIVERIES[i];
  return { sprite, color, hue };
}

/** Line everyone up on the grid and start the countdown. */
function startRace(): void {
  names.clear();
  rivals = LIVERIES.map((_, i) => i).filter((i) => i !== playerLivery).map((li, k) => {
    const skill = lerp(AI_SKILL_MIN, AI_SKILL_MAX, Math.random());
    const driver = new Driver(skill, k + 1);
    const car = { craft: driver.craft, race: driver.race, ...livery(li) };
    names.set(car, LIVERIES[li].name);
    return { car, driver };
  });
  player = { craft: new Craft(), race: new RaceState(), ...livery(playerLivery) };
  names.set(player, LIVERIES[playerLivery].name);
  player.race.bestLap = bestLaps[trackIndex];
  cars = [...rivals.map((r) => r.car), player];

  // Random grid: shuffle everyone (player included) into the slots.
  const slots = cars.map((_, i) => i);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  cars.forEach((car, i) => { car.race.index = placeOnGrid(track, car.craft, slots[i]); });

  finishOrder = [];
  finishTimes.clear();
  autopilot = null;
  resultsAt = 0;
  lastCount = COUNTDOWN + 1;
  launchJudged = false;
  lastPressAt = -Infinity;
  prevThrottle = input.throttle;
  aiLaunched = false;
  particles.length = 0;
  goTime = time + COUNTDOWN;
  cam.x = player.craft.pos.x;
  cam.y = player.craft.pos.y;
  // Point the cursor down the straight so the craft doesn't swerve on the first frame.
  input.cursor.x = innerWidth / 2 + Math.cos(player.craft.heading) * 220;
  input.cursor.y = innerHeight / 2 + Math.sin(player.craft.heading) * 220;
}
startRace();   // lines up the grid behind the start screen

/** Track cards for the start screen: each outline scaled into a 120 x 80 box. */
const trackChoices: TrackChoice[] = tracks.map((t, i) => {
  const b = t.bounds, scale = Math.min(110 / (b.maxX - b.minX), 70 / (b.maxY - b.minY));
  const ox = 60 - ((b.minX + b.maxX) / 2) * scale, oy = 40 - ((b.minY + b.maxY) / 2) * scale;
  const outline = t.pts.filter((_, k) => k % 6 === 0)
    .map((p) => `${(p.x * scale + ox).toFixed(1)},${(p.y * scale + oy).toFixed(1)}`).join(' ');
  return { name: TRACKS[i].name, blurb: TRACKS[i].blurb, outline, color: t.theme.wall };
});

const menus = new Menus(LIVERIES, trackChoices, {
  start(carIndex, trackChoice) {
    playerLivery = carIndex;
    trackIndex = trackChoice;
    track = tracks[trackIndex];
    startRace();
    play();
  },
  resume: play,
  restart() { startRace(); play(); },
  changeCar() {
    mode = 'menu';
    sound.menu();
    input.unlock();
    menus.select(playerLivery);
    menus.selectTrack(trackIndex);
    menus.showStart();
  },
});

function play(): void {
  mode = 'racing';
  sound.unlock();
  sound.race();
  menus.hide();
  input.release();
  input.takePause();   // drop keys pressed while in a menu
  input.takeReset();
  input.lock();
}

function pause(): void {
  if (mode !== 'racing') return;
  mode = 'paused';
  pausedAt = performance.now();
  sound.pause();
  input.release();
  input.unlock();
  menus.showPause();
}

// Browsers only allow audio after a click or key press: start the menu music on the first one.
const startAudio = () => {
  sound.unlock();
  removeEventListener('pointerdown', startAudio);
  removeEventListener('keydown', startAudio);
};
addEventListener('pointerdown', startAudio);
addEventListener('keydown', startAudio);

// Losing the mouse lock mid-race (the browser eats the first Esc for this) pauses the game.
input.onUnlock = pause;

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
    get player() { return player; }, get rivals() { return rivals; }, get track() { return track; },
    get mode() { return mode; },
    /** Let an AI drive the player's car (for testing whole races). */
    autodrive() {
      autopilot = new Driver(0.85, 7);
      autopilot.craft = player.craft;
      autopilot.race = player.race;
    },
    /** Step the simulation by hand (e.g. while the tab is hidden and animation frames are paused). */
    advance(seconds: number) {
      for (let i = 0; i < Math.round(seconds / STEP) && (mode === 'racing' || mode === 'results'); i++) update(STEP);
      drawFrame(ctx, innerWidth, innerHeight, {
        time, cam, player, cars, track, hud: raceHud(),
        particles, cursor: input.cursor, toast, locked: input.locked,
      });
    },
    get time() { return time; }, get goTime() { return goTime; }, cam,
  };
}

function showToast(text: string, color: string): void { toast = { text, color, t: 1.6 }; }

function ordinal(n: number): string { return ['1ST', '2ND', '3RD'][n - 1] ?? `${n}TH`; }

function update(dt: number): void {
  if (input.takePause()) { pause(); return; }
  time += dt;
  if (input.takeReset() && mode === 'racing') startRace();
  const racing = time >= goTime;

  // Countdown beeps: 3, 2, 1, then a long one for GO.
  const count = Math.max(0, Math.ceil(goTime - time));
  if (count !== lastCount) {
    if (count <= COUNTDOWN) sound.beep(count === 0);
    lastCount = count;
  }
  judgeLaunches(racing);

  const crafts = cars.map((c) => c.craft);
  for (const c of crafts) c.feelWake(crafts, dt);
  // Rubber band: each place behind the leader is worth +1% pace (none before the start or once finished).
  rankCars().forEach((car, place) => {
    car.craft.catchUp = racing && !finishOrder.includes(car) ? place * CATCH_UP_PER_PLACE : 0;
  });

  // Player: aim from the craft's on-screen position toward the cursor.
  const pc = player.craft;
  const csx = (pc.pos.x - cam.x) * cam.zoom + innerWidth / 2;
  const csy = (pc.pos.y - cam.y) * cam.zoom + innerHeight / 2;
  const dx = input.cursor.x - csx, dy = input.cursor.y - csy;
  const aim = Math.hypot(dx, dy) > 24 ? Math.atan2(dy, dx) : pc.heading;
  if (autopilot && racing) {
    const c = autopilot.think(track, time, cars);
    pc.step(dt, c.aim, c.throttle, c.brake);
  } else {
    pc.step(dt, racing ? aim : pc.heading, racing && input.throttle, racing && input.brake);
  }
  sound.engine(pc.gear, pc.rev, pc.thrust, clamp(pc.speed / 880, 0, 1));
  if (pc.shifted === 1) sound.whoosh();

  for (const { car, driver } of rivals) {
    const c = racing ? driver.think(track, time, cars) : { aim: car.craft.heading, throttle: false, brake: false };
    car.craft.step(dt, c.aim, c.throttle, c.brake);
  }

  let scraping = 0;
  for (const car of cars) {
    const lap = car.race.update(track, car.craft, time, racing);
    if (lap && car.race.lap === RACE_LAPS && !finishOrder.includes(car)) {
      finishOrder.push(car);
      finishTimes.set(car, time - goTime);
      if (car === player) {
        showToast(`FINISHED ${ordinal(finishOrder.length)}`, '#ffd23f');
        sound.chime(true);
        // Hand the car to an AI driver for the cool-down lap.
        autopilot = new Driver(0.6, 9);
        autopilot.craft = player.craft;
        autopilot.race = player.race;
        resultsAt = time + RESULTS_DELAY;
      }
    } else if (lap && car === player && !autopilot) {
      sound.chime(lap === 'best');
      if (lap === 'best') showToast(`BEST LAP  ${formatTime(player.race.lastLap)}`, '#c77dff');
      else showToast(`LAP  ${formatTime(player.race.lastLap)}`, '#ffffff');
    }
    const contact = collideWalls(track, car.craft, car.race, dt);
    if (contact) {
      emitSparks(contact.x, contact.y, car.craft);
      if (car === player) {
        scraping = clamp(car.craft.speed / 500, 0.25, 1);
        if (contact.impact > 80) cam.shake = Math.min(16, contact.impact / 25);
        if (contact.impact > 120) sound.thud(contact.impact);
      }
    }
  }
  sound.scrape(scraping);
  bestLaps[trackIndex] = player.race.bestLap;

  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const hit = collideCrafts(cars[i].craft, cars[j].craft);
      if (hit > 80 && (cars[i] === player || cars[j] === player)) {
        cam.shake = Math.min(14, hit / 30);
        sound.thud(hit);
      }
    }
  }

  for (const car of cars) {
    car.craft.cooling = inCoolingLane(track, car.craft, car.race.index);
    emitTrail(car.craft, car.hue);
    emitHeat(car.craft);
  }
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

  if (mode === 'racing' && resultsAt && time >= resultsAt) {
    mode = 'results';
    sound.menu();
    input.release();
    input.unlock();
  }
  if (mode === 'results' && time >= resultsRefresh) {
    resultsRefresh = time + 0.25;
    menus.showResults(TRACKS[trackIndex].name, resultRows());
  }
}

/** Race order: finished cars by finishing order, everyone else by distance covered. */
function rankCars(): Car[] {
  return [...cars].sort((a, b) => {
    const fa = finishOrder.indexOf(a), fb = finishOrder.indexOf(b);
    if (fa >= 0 || fb >= 0) return (fa < 0 ? Infinity : fa) - (fb < 0 ? Infinity : fb);
    return b.race.progress(track) - a.race.progress(track);
  });
}

/** The results table: finish time and gap to the winner, or the lap a car is still on. */
function resultRows(): ResultRow[] {
  const winner = finishTimes.get(finishOrder[0]) ?? 0;
  return rankCars().map((car) => {
    const t = finishTimes.get(car);
    return {
      name: names.get(car) ?? '',
      color: car.color,
      time: t === undefined ? `LAP ${Math.min(car.race.lap + 1, RACE_LAPS)}/${RACE_LAPS}` : formatTime(t),
      gap: t === undefined ? 'RUNNING' : t === winner ? '' : `+${(t - winner).toFixed(3)}`,
      best: car.race.bestLap ? formatTime(car.race.bestLap) : '-',
      player: car === player,
    };
  });
}

function raceHud(): RaceHud {
  const ranked = rankCars();
  const left = goTime - time;
  const countdown = mode === 'menu' ? null : left > 0 ? String(Math.ceil(left)) : left > -0.8 ? 'GO' : null;
  const launchHint = mode !== 'menu' && left > 0;
  const place = finishOrder.indexOf(player);
  const banner = place < 0 || mode === 'results' ? null : place === 0 ? 'YOU WIN!' : `FINISHED ${ordinal(place + 1)}`;
  return {
    position: ranked.indexOf(player) + 1, racers: cars.length, laps: RACE_LAPS, countdown, banner,
    catchUp: player.craft.catchUp, launchHint,
  };
}

/**
 * Turbo start. The player gets a perfect launch for pressing W within a short window around GO
 * and a stall for holding it from earlier (a jump start). The AI roll their own starts at GO.
 */
function judgeLaunches(racing: boolean): void {
  const pressed = input.throttle && !prevThrottle;
  prevThrottle = input.throttle;
  if (!launchJudged) {
    if (pressed) lastPressAt = time;
    if (racing) {
      const sinceGo = time - goTime;
      let result: 'perfect' | 'stall' | 'normal' | null = null;
      if (sinceGo < 1e-9 + 1 / 60 && input.throttle) {
        // Already holding W as the lights go out: perfect if it went down just before GO.
        result = lastPressAt >= goTime - LAUNCH_EARLY ? 'perfect' : 'stall';
      } else if (pressed) {
        result = sinceGo <= LAUNCH_LATE ? 'perfect' : 'normal';
      } else if (sinceGo > LAUNCH_LATE) {
        result = 'normal';
      }
      if (result) {
        launchJudged = true;
        if (result === 'perfect') {
          player.craft.launch = LAUNCH_TIME;
          showToast('PERFECT START!', '#4dff9a');
        } else if (result === 'stall') {
          player.craft.stall = STALL_TIME;
          showToast('JUMP START - STALLED', '#ffb02e');
        }
      }
    }
  }
  if (racing && !aiLaunched) {
    aiLaunched = true;
    for (const { car, driver } of rivals) {
      const roll = driver.rollLaunch();
      if (roll === 'perfect') car.craft.launch = LAUNCH_TIME;
      if (roll === 'stall') car.craft.stall = STALL_TIME;
    }
  }
}

/** Smoke puffs off a craft running hot; thicker and redder as it nears overheating. */
function emitHeat(craft: Craft): void {
  if (craft.cooling && craft.heat > 0.02) {
    // Blue vapor boiling off while the lane pulls the heat out.
    particles.push({
      x: craft.pos.x + (Math.random() - 0.5) * 30,
      y: craft.pos.y + (Math.random() - 0.5) * 30,
      vx: -craft.vel.x * 0.25 + (Math.random() - 0.5) * 50,
      vy: -craft.vel.y * 0.25 + (Math.random() - 0.5) * 50,
      life: 0.6, max: 0.6, hue: 195, size: 5 + craft.heat * 5,
    });
    return;
  }
  if (craft.heat < 0.5 || Math.random() > craft.heat * 0.6) return;
  const hot = craft.overheated ? 1 : (craft.heat - 0.5) / 0.5;
  particles.push({
    x: craft.pos.x + (Math.random() - 0.5) * 20,
    y: craft.pos.y + (Math.random() - 0.5) * 20,
    vx: -craft.vel.x * 0.1 + (Math.random() - 0.5) * 40,
    vy: -craft.vel.y * 0.1 + (Math.random() - 0.5) * 40 - 30,
    life: 0.7, max: 0.7, hue: lerp(40, 5, hot), size: 6 + hot * 6,
  });
}

/** Orange sparks thrown back along the wall while a craft grinds against it. */
function emitSparks(x: number, y: number, craft: Craft): void {
  if (craft.speed < 40) return;
  for (let k = 0; k < 3; k++) {
    particles.push({
      x, y,
      vx: craft.vel.x * 0.35 + (Math.random() - 0.5) * 160,
      vy: craft.vel.y * 0.35 + (Math.random() - 0.5) * 160,
      life: 0.35, max: 0.35, hue: 30 + Math.random() * 25, size: 2 + Math.random() * 2,
    });
  }
}

function emitTrail(craft: Craft, baseHue: number): void {
  if (craft.speed < 20) return;
  const fx = Math.cos(craft.heading), fy = Math.sin(craft.heading);
  const slip = Math.abs(craft.slip);
  // Trail starts in the car's exhaust color and shifts toward magenta with drift angle.
  const hue = lerp(baseHue, 310, clamp(slip / 0.6, 0, 1));
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
  if (input.takeMute()) showToast(sound.toggleMute() ? 'SOUND OFF' : 'SOUND ON', '#ffffff');
  if (mode === 'racing' || mode === 'results') {
    while (acc >= STEP && (mode === 'racing' || mode === 'results')) { update(STEP); acc -= STEP; }
  } else {
    acc = 0;
    // Esc / P on the pause menu resumes.
    // (Ignored briefly after pausing: one Esc can both release the mouse lock and arrive as a key.)
    if (input.takePause() && mode === 'paused' && now - pausedAt > 300) play();
  }
  fitCanvas();
  drawFrame(ctx, innerWidth, innerHeight, {
    time, cam, player, cars, track, hud: raceHud(),
    particles, cursor: input.cursor, toast, locked: input.locked,
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
