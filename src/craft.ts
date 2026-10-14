// Hovercraft physics. Pure game logic: no rendering or DOM access in here.

export interface Vec { x: number; y: number }

/** One gear: the speed it tops out at (px/s) and how hard it pulls (px/s²). */
export interface Gear { top: number; accel: number }

export const GEARS: Gear[] = [
  { top: 240, accel: 560 },
  { top: 400, accel: 430 },
  { top: 560, accel: 330 },
  { top: 720, accel: 250 },
  { top: 880, accel: 190 },
];

const TURN_RATE = 3.6;        // rad/s at low speed
const TURN_RATE_FAST = 2.4;   // rad/s at top speed
const GRIP = 2.0;             // how fast sideways velocity bleeds off (1/s); low = floaty
const BRAKE_GRIP = 1.2;       // grip while braking: looser, so a brake tap swings the tail
const BRAKE_TURN_BONUS = 1.35;
const DRAG = 0.12;            // forward air drag (1/s)
const BRAKE_DECEL = 700;      // px/s²
const PERFECT_SHIFT = 0.9;    // shifting above this fraction of the gear's top speed is "perfect"
const PERFECT_KICK = 60;      // px/s added on a perfect shift
const BOG_FRACTION = 0.55;    // below this fraction of the previous gear's top, the gear bogs
const DRIFT_START = 0.26;     // rad (~15°) of slip before drift charges boost
const DRIFT_END = 0.12;       // rad (~7°): slip below this ends the drift and pays out
const BOOST_RATE = 120;       // boost charged per second of drifting (px/s of speed)
const BOOST_MAX = 220;

export type ShiftResult = 'perfect' | 'early' | 'maxed' | null;

export class Craft {
  pos: Vec = { x: 0, y: 0 };
  vel: Vec = { x: 0, y: 0 };
  heading = -Math.PI / 2;     // pointing "up" the screen
  gear = 0;                   // index into GEARS
  boostCharge = 0;
  drifting = false;
  braking = false;
  /** 0..1 how hard the thrusters are working this frame (for effects). */
  thrust = 0;
  /** Seconds left on the boost flame effect. */
  boostFlash = 0;

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

  shiftUp(): ShiftResult {
    if (this.gear >= GEARS.length - 1) return 'maxed';
    const perfect = this.speed >= GEARS[this.gear].top * PERFECT_SHIFT;
    this.gear++;
    if (perfect) {
      this.addForwardSpeed(PERFECT_KICK);
      this.boostFlash = 0.35;
      return 'perfect';
    }
    return 'early';
  }

  /**
   * Advance one fixed step.
   * @param aimAngle world angle the player is steering toward
   * @param brake whether the brake key is held
   */
  step(dt: number, aimAngle: number, brake: boolean): void {
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

    // Thrust: always on in the current gear, fading out as it nears the gear's top speed.
    // A gear pulls weakly when the craft is far too slow for it (bogging).
    this.thrust = 0;
    if (!brake) {
      const headroom = clamp(1 - fwd / gear.top, 0, 1);
      let pull = Math.sqrt(headroom);
      if (this.gear > 0) {
        const floor = GEARS[this.gear - 1].top * BOG_FRACTION;
        if (fwd < floor) pull *= lerp(0.25, 1, clamp(fwd / floor, 0, 1));
      }
      this.thrust = pull;
      fwd += gear.accel * pull * dt;
      // Over the gear's top speed (e.g. after a boost) it slowly settles back.
      if (fwd > gear.top) fwd -= (fwd - gear.top) * 0.8 * dt;
    }

    fwd -= fwd * DRAG * dt;

    if (brake) {
      fwd = moveToward(fwd, 0, BRAKE_DECEL * dt);
      // Braking drops a gear once you're slow enough for the one below.
      if (this.gear > 0 && speed < GEARS[this.gear - 1].top * 0.85) this.gear--;
    }

    side *= Math.exp(-(brake ? BRAKE_GRIP : GRIP) * dt);

    this.vel.x = fx * fwd - fy * side;
    this.vel.y = fy * fwd + fx * side;

    // Drift boost: charge while sliding, pay out when the slide is caught.
    const slip = Math.abs(this.slip);
    if (!this.drifting && slip > DRIFT_START && speed > 200) this.drifting = true;
    if (this.drifting) {
      this.boostCharge = Math.min(BOOST_MAX, this.boostCharge + BOOST_RATE * dt * (slip / DRIFT_START));
      if (slip < DRIFT_END || speed < 120) {
        this.drifting = false;
        if (this.boostCharge > 40 && speed >= 120) {
          this.addForwardSpeed(this.boostCharge);
          this.boostFlash = 0.5;
        }
        this.boostCharge = 0;
      }
    }

    this.boostFlash = Math.max(0, this.boostFlash - dt);
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
  }

  /** Bounce off an axis-aligned wall. normal points away from the wall. */
  bounce(normal: Vec): void {
    const vn = this.vel.x * normal.x + this.vel.y * normal.y;
    if (vn >= 0) return;
    const restitution = 0.45;
    this.vel.x -= (1 + restitution) * vn * normal.x;
    this.vel.y -= (1 + restitution) * vn * normal.y;
    this.vel.x *= 0.8;
    this.vel.y *= 0.8;
    this.drifting = false;
    this.boostCharge = 0;
  }

  private addForwardSpeed(amount: number): void {
    const fx = Math.cos(this.heading), fy = Math.sin(this.heading);
    this.vel.x += fx * amount;
    this.vel.y += fy * amount;
  }
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
