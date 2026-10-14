// Hovercraft physics. Pure game logic: no rendering or DOM access in here.

export interface Vec { x: number; y: number }

/** One gear: the speed it tops out at (px/s) and how hard it pulls (px/s²). */
export interface Gear { top: number; accel: number }

export const GEARS: Gear[] = [
  { top: 240, accel: 290 },
  { top: 400, accel: 220 },
  { top: 560, accel: 170 },
  { top: 720, accel: 130 },
  { top: 880, accel: 100 },
];

const TURN_RATE = 3.6;        // rad/s at low speed
const TURN_RATE_FAST = 2.4;   // rad/s at top speed
const GRIP = 2.0;             // how fast sideways velocity bleeds off (1/s); low = floaty
const BRAKE_GRIP = 1.2;       // grip while braking: looser, so a brake tap swings the tail
const BRAKE_TURN_BONUS = 1.35;
const DRAG = 0.12;            // forward air drag (1/s)
const SCRAPE_FRICTION = 2.2;  // speed lost per second while grinding along a wall (1/s)
const SCRAPE_BOUNCE = 0.12;   // how much of the into-the-wall speed comes back out
const BRAKE_DECEL = 700;      // px/s²
const BOG_FRACTION = 0.55;    // the rev band of a gear starts at this fraction of the previous gear's top
const UPSHIFT_AT = 0.96;      // auto upshift once forward speed reaches this fraction of the gear's top
const DOWNSHIFT_AT = 0.8;     // auto downshift once speed falls below this fraction of the lower gear's top
const SHIFT_COOLDOWN = 0.6;   // seconds between automatic shifts, so it never hunts between gears
const SHIFT_TIME = 0.4;       // seconds of cut thrust while an upshift engages
const DRIFT_START = 0.26;     // rad (~15°) of slip that counts as drifting (for effects)

export class Craft {
  pos: Vec = { x: 0, y: 0 };
  vel: Vec = { x: 0, y: 0 };
  heading = -Math.PI / 2;     // pointing "up" the screen
  gear = 0;                   // index into GEARS
  drifting = false;
  braking = false;
  /** 0..1 how hard the thrusters are working this frame (for effects). */
  thrust = 0;
  /** +1 / -1 on the step a gear change happened, else 0 (for HUD flashes). */
  shifted = 0;
  private shiftTimer = 0;
  /** Seconds left on the current upshift; thrust is cut while it engages. */
  shiftPause = 0;

  get speed(): number { return Math.hypot(this.vel.x, this.vel.y); }

  /** Angle between where the craft points and where it is going, in radians (signed). */
  get slip(): number {
    if (this.speed < 30) return 0;
    const move = Math.atan2(this.vel.y, this.vel.x);
    return wrapAngle(move - this.heading);
  }

  /** How far through the current gear's speed band the craft is, 0..1 (drives the rev bar). */
  get rev(): number {
    const lo = this.gear === 0 ? 0 : GEARS[this.gear - 1].top * BOG_FRACTION;
    const hi = GEARS[this.gear].top;
    return clamp((this.speed - lo) / (hi - lo), 0, 1);
  }

  /**
   * Advance one fixed step.
   * @param aimAngle world angle the player is steering toward
   * @param throttle whether the accelerate key is held
   * @param brake whether the brake key is held
   */
  step(dt: number, aimAngle: number, throttle: boolean, brake: boolean): void {
    this.braking = brake;
    const speed = this.speed;
    const gear = GEARS[this.gear];

    // Steering: turn toward the aim at a capped rate that tightens a little with speed.
    const speedFrac = clamp(speed / GEARS[GEARS.length - 1].top, 0, 1);
    let turnRate = lerp(TURN_RATE, TURN_RATE_FAST, speedFrac);
    if (brake) turnRate *= BRAKE_TURN_BONUS;
    const diff = wrapAngle(aimAngle - this.heading);
    const maxTurn = turnRate * dt;
    this.heading = wrapAngle(this.heading + clamp(diff, -maxTurn, maxTurn));

    // Split velocity into the craft's forward and sideways axes.
    const fx = Math.cos(this.heading), fy = Math.sin(this.heading);
    let fwd = this.vel.x * fx + this.vel.y * fy;
    let side = this.vel.x * -fy + this.vel.y * fx;

    // Thrust while the throttle is held. Lower gears pull at full strength right up to the
    // shift point; only the top gear fades out as it nears top speed.
    this.thrust = 0;
    const accelerating = throttle && !brake;
    if (accelerating) {
      const top = this.gear === GEARS.length - 1;
      const pull = top ? Math.sqrt(clamp(1 - fwd / gear.top, 0, 1)) : fwd < gear.top ? 1 : 0;
      const engaging = this.shiftPause > 0 ? 0.1 : 1;
      this.thrust = pull * engaging;
      fwd += engaging * gear.accel * pull * dt;
    }
    // Above the top gear's speed (e.g. after a downhill bump) it slowly settles back.
    const vmax = GEARS[GEARS.length - 1].top;
    if (fwd > vmax) fwd -= (fwd - vmax) * 0.8 * dt;

    // Air drag only while coasting; under throttle the gear curves already set the pace.
    if (!accelerating) fwd -= fwd * DRAG * dt;
    if (brake) fwd = moveToward(fwd, 0, BRAKE_DECEL * dt);

    this.autoShift(dt, fwd, throttle && !brake);

    side *= Math.exp(-(brake ? BRAKE_GRIP : GRIP) * dt);

    this.vel.x = fx * fwd - fy * side;
    this.vel.y = fy * fwd + fx * side;

    this.drifting = Math.abs(this.slip) > DRIFT_START && speed > 200;

    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
  }

  /**
   * Grind along a wall. normal points away from the wall, into the track. The speed going into
   * the wall is soaked up (a head-on hit hurts), and sliding along it costs a little friction.
   * Returns the into-the-wall speed of this contact.
   */
  scrape(normal: Vec, dt: number): number {
    const vn = this.vel.x * normal.x + this.vel.y * normal.y;
    if (vn < 0) {
      this.vel.x -= (1 + SCRAPE_BOUNCE) * vn * normal.x;
      this.vel.y -= (1 + SCRAPE_BOUNCE) * vn * normal.y;
    }
    const keep = Math.exp(-SCRAPE_FRICTION * dt);
    this.vel.x *= keep;
    this.vel.y *= keep;
    return Math.max(0, -vn);
  }

  /** Automatic gearbox: up when the gear is nearly maxed under throttle, down when too slow for it. */
  private autoShift(dt: number, fwd: number, throttle: boolean): void {
    this.shifted = 0;
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    this.shiftPause = Math.max(0, this.shiftPause - dt);
    if (this.shiftTimer > 0) return;
    const speed = Math.max(fwd, 0);
    if (throttle && this.gear < GEARS.length - 1 && speed >= GEARS[this.gear].top * UPSHIFT_AT) {
      this.gear++;
      this.shifted = 1;
    } else if (this.gear > 0 && speed < GEARS[this.gear - 1].top * DOWNSHIFT_AT) {
      this.gear--;
      this.shifted = -1;
    }
    if (this.shifted) this.shiftTimer = SHIFT_COOLDOWN;
    if (this.shifted === 1) this.shiftPause = SHIFT_TIME;
  }

}

/** Bump two craft apart (circles). Returns the closing speed of the hit, 0 if none. */
export function collideCrafts(a: Craft, b: Craft, radius = 22): number {
  const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y;
  const d = Math.hypot(dx, dy), min = radius * 2;
  if (d >= min || d === 0) return 0;
  const nx = dx / d, ny = dy / d, push = (min - d) / 2;
  a.pos.x -= nx * push; a.pos.y -= ny * push;
  b.pos.x += nx * push; b.pos.y += ny * push;
  const closing = (b.vel.x - a.vel.x) * nx + (b.vel.y - a.vel.y) * ny;
  if (closing >= 0) return 0;
  const j = (-(1 + 0.5) * closing) / 2;
  a.vel.x -= j * nx; a.vel.y -= j * ny;
  b.vel.x += j * nx; b.vel.y += j * ny;
  return -closing;
}

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
export function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
export function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function moveToward(v: number, target: number, step: number): number {
  return v > target ? Math.max(target, v - step) : Math.min(target, v + step);
}
