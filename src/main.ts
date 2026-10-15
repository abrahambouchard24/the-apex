import { Driver } from './ai';
import { Sound } from './audio';
import { Craft, LAUNCH_TIME, Mods, NO_MODS, STALL_TIME, clamp, collideCrafts, lerp } from './craft';
import { Input } from './input';
import { Menus, RaceSetup, ResultRow, ResultsView, StandingRow, TrackChoice } from './menu';
import { Camera, Car, NOZZLE_BACK, NOZZLE_SIDE, Particle, RaceHud, Toast, drawFrame, formatTime, loadSprite } from './render';
import {
  MISSIONS, REPLAY_SHARE, Save, Speaker, loadSave, met, playerMods, rivalMods, writeSave,
} from './story';
import { StoryUI } from './storyui';
import { RaceState, TRACKS, Track, WALL_DIST, collideWalls, inCoolingLane, placeOnGrid } from './track';

const STEP = 1 / 60;
const COUNTDOWN = 3;          // seconds of 3-2-1 before GO
// AI skill range: 1 = drives near the grip limit; lower brakes earlier and corners slower.
const AI_SKILL_MIN = 0.82;
const AI_SKILL_MAX = 0.97;
const RESULTS_DELAY = 2.5;    // seconds after the player finishes before the results screen
const CATCH_UP_PER_PLACE = 0.01;  // +1% pace for every place behind the leader
// Turbo start: let go of the brake in this window around GO for a perfect launch; earlier is a jump start.
const LAUNCH_EARLY = 0.3;     // s before GO a press still counts as perfect
const LAUNCH_LATE = 0.15;     // s after GO a press still counts as perfect
// DRS: from this lap on, being within DRS_GAP seconds of the car ahead when entering a zone opens the wing.
const DRS_FROM_LAP = 1;       // laps completed, i.e. DRS is enabled from lap 2
const DRS_GAP = 1.0;          // s
/** Season points for 1st to 6th. */
const POINTS = [10, 8, 6, 4, 2, 1];

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
let raceLaps = 3;

/**
 * A season: a run of races rotating through the tracks from the opening one, scored by finishing
 * position. points holds the totals from completed races, keyed by car name.
 */
interface Season { races: number; round: number; openingTrack: number; points: Map<string, number> }
let season: Season | null = null;

/** Story mode: the saved progress, and the mission being raced (null outside a story race). */
let save: Save | null = loadSave();
let mission: number | null = null;
/** Which story character drives which car, for goals like "finish ahead of Judah". */
const whoDrives = new Map<Speaker, Car>();
let overheatedThisRace = false;
let raceBestLap = 0;          // the player's best lap in this race only (for lap-time goals)

/** One AI car in a race: its livery, name, driving skill and performance mods. */
interface Entry { livery: number; name: string; skill: number; mods: Mods; who?: Speaker }

/** Everything that differs between a quick race, a season round and a story mission. */
interface RaceConfig {
  field: Entry[];
  playerName: string;
  playerMods: Mods;
  grid: 'random' | 'back' | 'pole';
  startHeat: number;
}

/** The race about to start: a story mission's set-up, or the usual full field. */
function raceConfig(): RaceConfig {
  if (mission !== null && save) {
    const m = MISSIONS[mission];
    return {
      field: m.rivals.map((e) => ({ livery: e.livery, name: e.name, skill: e.skill, mods: rivalMods(m, e, playerMods(save!)), who: e.who })),
      playerName: save.name, playerMods: playerMods(save), grid: m.grid, startHeat: m.startHeat ?? 0,
    };
  }
  return {
    field: LIVERIES.map((_, i) => i).filter((i) => i !== playerLivery).map((li) => ({
      livery: li, name: LIVERIES[li].name, skill: lerp(AI_SKILL_MIN, AI_SKILL_MAX, Math.random()), mods: { ...NO_MODS },
    })),
    playerName: LIVERIES[playerLivery].name, playerMods: { ...NO_MODS }, grid: 'random', startHeat: 0,
  };
}

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
let prevBrake = false;
let launchArmed = false;      // brake held during the countdown
let releasedAt = -1;          // race time the brake was let go (-1 = not yet)
let aiLaunched = false;
/** Per car: the DRS zone it's in (-1 = none) and whether it earned DRS on entering it. */
const drs = new Map<Car, { zone: number; earned: boolean }>();

function livery(i: number) {
  const { sprite, color, hue, name } = LIVERIES[i];
  return { sprite, color, hue, name };
}

/** Line everyone up on the grid and start the countdown. */
function startRace(): void {
  const cfg = raceConfig();
  names.clear();
  whoDrives.clear();
  rivals = cfg.field.map((e, k) => {
    const driver = new Driver(e.skill, k + 1);
    driver.craft.mods = { ...e.mods };
    const car: Car = { craft: driver.craft, race: driver.race, ...livery(e.livery), name: e.name };
    names.set(car, e.name);
    if (e.who) whoDrives.set(e.who, car);
    return { car, driver };
  });
  const pl = mission !== null ? 0 : playerLivery;   // in Story you drive Leopard GP's red 01
  player = { craft: new Craft(), race: new RaceState(), ...livery(pl), name: cfg.playerName };
  player.craft.mods = { ...cfg.playerMods };
  player.craft.heat = cfg.startHeat;
  names.set(player, cfg.playerName);
  player.race.bestLap = mission !== null ? 0 : bestLaps[trackIndex];
  cars = [...rivals.map((r) => r.car), player];
  overheatedThisRace = false;
  raceBestLap = 0;

  // Grid: shuffle the AI into the slots; the player goes on pole, at the back, or anywhere.
  const slots = cars.map((_, i) => i);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const want = cfg.grid === 'back' ? cars.length - 1 : cfg.grid === 'pole' ? 0 : -1;
  if (want >= 0) {
    const pi = cars.indexOf(player), holder = slots.indexOf(want);
    [slots[pi], slots[holder]] = [slots[holder], slots[pi]];
  }
  cars.forEach((car, i) => { car.race.index = placeOnGrid(track, car.craft, slots[i]); });

  finishOrder = [];
  finishTimes.clear();
  autopilot = null;
  resultsAt = 0;
  lastCount = COUNTDOWN + 1;
  launchJudged = false;
  drs.clear();
  prevBrake = input.brake;
  launchArmed = false;
  releasedAt = -1;
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
  story() {
    menus.hide();
    storyUI.open(save);
  },
  start(setup: RaceSetup) {
    mission = null;
    playerLivery = setup.car;
    raceLaps = setup.laps;
    season = setup.races > 1 ? { races: setup.races, round: 0, openingTrack: setup.track, points: new Map() } : null;
    menus.setSeason(!!season);
    startRound(setup.track);
  },
  resume: play,
  restart() { startRace(); play(); },
  action(act) {
    if (act === 'next' && season) {
      scoreRound(season);
      season.round++;
      startRound((season.openingTrack + season.round) % tracks.length);
    }
    if (act === 'newseason' && season) {
      season = { ...season, round: 0, points: new Map() };
      startRound(season.openingTrack);
    }
  },
  changeCar() {
    if (mission !== null) {
      // Leaving a story race: back to the chapter map.
      mission = null;
      mode = 'menu';
      sound.menu();
      input.unlock();
      menus.hide();
      storyUI.open(save);
      return;
    }
    season = null;
    menus.setSeason(false);
    mode = 'menu';
    sound.menu();
    input.unlock();
    menus.select(playerLivery);
    menus.selectTrack(trackIndex);
    menus.showStart();
  },
});

/** Set a mission up: its track, laps and field. */
function loadMission(i: number): void {
  const m = MISSIONS[i];
  mission = i;
  season = null;
  raceLaps = m.laps;
  trackIndex = TRACKS.findIndex((t) => t.name === m.track);
  track = tracks[trackIndex];
  menus.setSeason(false);
  menus.setStory(true);
}

function storyRace(i: number): void {
  loadMission(i);
  startRound(trackIndex);
  showToast(MISSIONS[i].title, '#ff3d6e');
}

const storyUI = new StoryUI({
  preview(i) {
    loadMission(i);
    mode = 'menu';
    startRace();
  },
  race: storyRace,
  exit() {
    mode = 'menu';   // stop any finished race in the background from bringing up its results
    storyUI.hide();
    menus.showFront();
  },
  saved(s) {
    save = s;
    writeSave(s);
  },
});

/** Judge a finished story race: goals, points and progress, then hand over to the story screens. */
function finishMission(): void {
  if (mission === null || !save) return;
  const m = MISSIONS[mission];
  const ranked = rankCars();
  const winnerCar = ranked[0];
  const winner = winnerCar === player ? 'player' as const
    : [...whoDrives.entries()].find(([, car]) => car === winnerCar)?.[0] ?? null;
  const outcome = {
    place: ranked.indexOf(player) + 1,
    winner,
    ahead: (who: Speaker) => {
      const car = whoDrives.get(who);
      return !car || ranked.indexOf(player) < ranked.indexOf(car);
    },
    bestLap: raceBestLap,
    overheated: overheatedThisRace,
  };
  const goal = met(m.goal, outcome);
  const beatJudahNow = whoDrives.has('judah') && outcome.ahead('judah');
  // The bonus is shown as met or not either way, but only pays out with the main goal.
  const bonus = !!m.bonus && met(m.bonus, outcome);
  const first = !save.done.includes(m.id);
  const share = first ? 1 : REPLAY_SHARE;
  const earned = goal ? Math.round((m.points + (bonus ? m.bonusPoints : 0)) * share) : 0;
  if (goal) {
    save.points += earned;
    if (!save.done.includes(m.id)) save.done.push(m.id);
    if (bonus && !save.bonus.includes(m.id)) save.bonus.push(m.id);
    writeSave(save);
  }
  const index = mission;
  mission = null;
  menus.setStory(false);
  storyUI.finish({ index, success: goal, goal, bonus, earned, first: goal && first, outcome }, save);
  if (beatJudahNow && !(save.flags ?? []).includes('beat-judah')) {
    save.flags = [...(save.flags ?? []), 'beat-judah'];
    writeSave(save);
  }
}

/** Load a track and start a race on it (in a season, announce which round it is). */
function startRound(index: number): void {
  trackIndex = index;
  track = tracks[trackIndex];
  startRace();
  play();
  if (season) showToast(`RACE ${season.round + 1} OF ${season.races}  ·  ${TRACKS[trackIndex].name}`, '#ffd23f');
}

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
    get save() { return save; },
    /** Start a story mission directly (skipping its dialogue). */
    mission(i: number) { if (!save) save = { name: 'TEST', points: 0, upgrades: {}, done: [], bonus: [] }; storyUI.hide(); menus.hide(); storyRace(i); },
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
  const ranked = rankCars();
  ranked.forEach((car, place) => {
    car.craft.catchUp = racing && !finishOrder.includes(car) ? place * CATCH_UP_PER_PLACE : 0;
  });
  updateDrs(ranked, racing);

  // Player: aim from the craft's on-screen position toward the cursor.
  const pc = player.craft;
  const csx = (pc.pos.x - cam.x) * cam.zoom + innerWidth / 2;
  const csy = (pc.pos.y - cam.y) * cam.zoom + innerHeight / 2;
  const dx = input.cursor.x - csx, dy = input.cursor.y - csy;
  const aim = Math.hypot(dx, dy) > 24 ? Math.atan2(dy, dx) : pc.heading;
  if (autopilot && racing) {
    const c = autopilot.think(track, time, cars);
    pc.deploy = c.deploy;
    pc.step(dt, c.aim, c.throttle, c.brake);
  } else {
    pc.deploy = racing && input.deploy;
    // The throttle is always on; holding brake slows down (and the gearbox shifts down with it).
    pc.step(dt, racing ? aim : pc.heading, racing && !input.brake, racing && input.brake);
  }
  sound.engine(pc.gear, pc.rev, pc.thrust, clamp(pc.speed / 880, 0, 1));
  if (pc.shifted === 1) sound.whoosh();

  for (const { car, driver } of rivals) {
    const c = racing ? driver.think(track, time, cars) : { aim: car.craft.heading, throttle: false, brake: false, deploy: false };
    car.craft.deploy = c.deploy;
    car.craft.step(dt, c.aim, c.throttle, c.brake);
  }

  let scraping = 0;
  for (const car of cars) {
    const lap = car.race.update(track, car.craft, time, racing);
    if (lap) car.craft.harvested = 0;   // a fresh ERS harvest allowance each lap
    if (lap && car.race.lap === raceLaps && !finishOrder.includes(car)) {
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
    }
    if (lap && car === player && car.race.lap <= raceLaps && (raceBestLap === 0 || player.race.lastLap < raceBestLap)) {
      raceBestLap = player.race.lastLap;
    }
    if (car === player && !finishOrder.includes(player) && car.craft.overheated) overheatedThisRace = true;
    if (lap && car === player && !autopilot && car.race.lap < raceLaps) {
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
  celebrate(dt);
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
    if (mission !== null) finishMission();
  }
  if (mode === 'results' && time >= resultsRefresh && !storyUI.visible) {
    resultsRefresh = time + 0.25;
    menus.showResults(resultsView());
  }
}

/** Points each car is on course to score in this race (final once everyone has finished). */
function racePoints(): Map<Car, number> {
  return new Map(rankCars().map((car, place) => [car, POINTS[place] ?? 0]));
}

/** Bank this race's points into the season totals. */
function scoreRound(s: Season): void {
  for (const [car, pts] of racePoints()) {
    const name = names.get(car) ?? '';
    s.points.set(name, (s.points.get(name) ?? 0) + pts);
  }
}

/** What the results screen shows: the race, plus the standings and next steps in a season. */
function resultsView(): ResultsView {
  const rows = resultRows();
  const subtitle = `${TRACKS[trackIndex].name}  ·  ${raceLaps} ${raceLaps === 1 ? 'LAP' : 'LAPS'}`;
  if (!season) {
    return {
      title: 'RESULTS', subtitle, rows,
      buttons: [{ act: 'restart', label: 'RACE AGAIN', primary: true }, { act: 'change', label: 'CHANGE CAR' }],
    };
  }
  const gained = racePoints();
  for (const [i, car] of rankCars().entries()) rows[i].points = gained.get(car);
  // Standings include this race's points; ties go to whoever finished ahead today.
  const order = rankCars();
  const standings: StandingRow[] = order.map((car) => {
    const name = names.get(car) ?? '';
    return {
      name, color: car.color, player: car === player, gained: gained.get(car) ?? 0,
      points: (season!.points.get(name) ?? 0) + (gained.get(car) ?? 0),
    };
  }).sort((a, b) => b.points - a.points);
  const last = season.round === season.races - 1;
  const settled = finishOrder.length === cars.length;
  const champ = standings[0];
  const nextTrack = TRACKS[(season.openingTrack + season.round + 1) % tracks.length].name;
  return {
    title: last ? 'SEASON FINAL' : `RACE ${season.round + 1} OF ${season.races}`,
    subtitle, rows, standings,
    note: last && settled ? (champ.player ? 'YOU ARE THE CHAMPION!' : `${champ.name} WINS THE SEASON`) : undefined,
    buttons: last
      ? [{ act: 'newseason', label: 'NEW SEASON', primary: true }, { act: 'change', label: 'MAIN MENU' }]
      : [{ act: 'next', label: `NEXT: ${nextTrack}`, primary: true }, { act: 'change', label: 'QUIT SEASON' }],
  };
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
      time: t === undefined ? `LAP ${Math.min(car.race.lap + 1, raceLaps)}/${raceLaps}` : formatTime(t),
      gap: t === undefined ? 'RUNNING' : t === winner ? '' : `+${(t - winner).toFixed(3)}`,
      best: car.race.bestLap ? formatTime(car.race.bestLap) : '-',
      player: car === player,
    };
  });
}

/**
 * DRS. On entering a zone, a car earns DRS if it's within DRS_GAP seconds of the car directly
 * ahead (from lap 2). The wing stays open to the end of the zone, or until it brakes.
 */
function updateDrs(ranked: Car[], racing: boolean): void {
  ranked.forEach((car, place) => {
    const st = drs.get(car) ?? { zone: -1, earned: false };
    const zone = racing ? track.drsZoneAt(car.race.index) : -1;
    if (zone !== st.zone) {
      const ahead = ranked[place - 1];
      const gap = ahead ? car.race.gapBehind(ahead.race, track, time) : NaN;
      st.earned = zone >= 0 && car.race.lap >= DRS_FROM_LAP && !finishOrder.includes(car) && gap < DRS_GAP;
      st.zone = zone;
      if (st.earned && car === player) showToast('DRS OPEN', '#4dff9a');
    }
    if (car.craft.braking) st.earned = false;
    car.craft.drsOpen = st.earned && zone >= 0;
    drs.set(car, st);
  });
}

/** Time gap from the player to the cars just ahead and behind, for the HUD. */
function gaps(ranked: Car[]): Pick<RaceHud, 'ahead' | 'behind'> {
  const i = ranked.indexOf(player);
  const tag = (car: Car | undefined, gap: number) =>
    car && Number.isFinite(gap) ? { name: car.name, color: car.color, gap } : null;
  const ahead = ranked[i - 1], behind = ranked[i + 1];
  return {
    ahead: tag(ahead, ahead ? player.race.gapBehind(ahead.race, track, time) : NaN),
    behind: tag(behind, behind ? behind.race.gapBehind(player.race, track, time) : NaN),
  };
}

function raceHud(): RaceHud {
  const ranked = rankCars();
  const left = goTime - time;
  const countdown = mode === 'menu' ? null : left > 0 ? String(Math.ceil(left)) : left > -0.8 ? 'GO' : null;
  const launchHint = mode !== 'menu' && left > 0;
  const place = finishOrder.indexOf(player);
  const banner = place < 0 || mode === 'results' ? null : place === 0 ? 'YOU WIN!' : `FINISHED ${ordinal(place + 1)}`;
  return {
    position: ranked.indexOf(player) + 1, racers: cars.length, laps: raceLaps, countdown, banner,
    catchUp: player.craft.catchUp, launchHint,
    ...(mode === 'racing' || mode === 'paused' ? gaps(ranked) : { ahead: null, behind: null }),
    drsAvailable: player.race.lap >= DRS_FROM_LAP,
  };
}

/**
 * Turbo start, clutch-style: hold the brake through the countdown and let go right on GO for a
 * perfect launch. Letting go too early is a jump start and stalls; never holding it is a normal
 * start. The AI roll their own starts at GO.
 */
function judgeLaunches(racing: boolean): void {
  const released = !input.brake && prevBrake;
  prevBrake = input.brake;
  if (!launchJudged) {
    if (!racing && input.brake) launchArmed = true;
    if (released) releasedAt = time;
    if (racing) {
      const sinceGo = time - goTime;
      let result: 'perfect' | 'stall' | 'normal' | null = null;
      if (!launchArmed) result = 'normal';
      else if (releasedAt >= 0 && releasedAt < goTime - LAUNCH_EARLY) result = 'stall';
      else if (releasedAt >= goTime - LAUNCH_EARLY && releasedAt <= goTime + LAUNCH_LATE) result = 'perfect';
      else if (sinceGo > LAUNCH_LATE) result = 'normal';
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

/** Fireworks go off from the last stretch of the final lap until the results screen. */
const FIREWORK_STRETCH = 0.85;   // fraction of the final lap after which they start
const FIREWORK_RATE = 2.5;       // bursts per second
let fireworkClock = 0;

function celebrate(dt: number): void {
  const r = player.race;
  const finished = finishOrder.includes(player);
  // Distance raced, in laps (the grid counts as just before 0, not the end of a lap).
  const lastStretch = r.progress(track) / track.length > raceLaps - 1 + FIREWORK_STRETCH;
  if (!(lastStretch || (finished && mode === 'racing'))) return;
  fireworkClock += dt;
  if (fireworkClock < 1 / FIREWORK_RATE) return;
  fireworkClock = 0;
  // Somewhere on screen, but off the track so the bursts never hide the racing line.
  const viewW = innerWidth / cam.zoom, viewH = innerHeight / cam.zoom;
  for (let tries = 0; tries < 8; tries++) {
    const x = cam.x + (Math.random() - 0.5) * viewW * 0.85;
    const y = cam.y + (Math.random() - 0.5) * viewH * 0.85;
    if (track.nearest({ x, y }, r.index).dist < WALL_DIST + 90) continue;
    burst(x, y);
    sound.pop();
    return;
  }
}

/** One firework: a ring of sparks in one or two colors, with a white flash at the heart. */
function burst(x: number, y: number): void {
  const hue = Math.random() * 360, hue2 = Math.random() < 0.5 ? hue : (hue + 120) % 360;
  const n = 64;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + Math.random() * 0.1;
    const v = 520 + Math.random() * 320;
    particles.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: 1 + Math.random() * 0.5, max: 1.5, hue: k % 2 ? hue : hue2, size: 5 + Math.random() * 3,
    });
  }
  for (let k = 0; k < 8; k++) {
    particles.push({ x, y, vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 80, life: 0.4, max: 0.4, hue: 50, size: 30 });
  }
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
