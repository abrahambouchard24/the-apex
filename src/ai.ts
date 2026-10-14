// AI drivers: look ahead along the centerline, steer for a point in front, brake for the
// tightest bend coming up. Pure logic, like craft.ts.

import { Craft, clamp } from './craft';
import { HALF_WIDTH, RaceState, Track } from './track';

export interface Controls { aim: number; throttle: boolean; brake: boolean }

export class Driver {
  craft = new Craft();
  race = new RaceState();
  cornerK = CORNER_K;
  insideBias = INSIDE_BIAS;
  /** Seconds of reaction lag-free driving; lower skill = earlier, softer braking and a wobblier line. */
  constructor(public skill = 0.92, private seed = 1) {}

  think(track: Track, time: number, others: Craft[] = []): Controls {
    const m = track.length;
    const c = this.craft;
    const i = this.race.index;
    const speed = c.speed;

    // Aim at a point further ahead the faster we go, nudged toward the inside of the bend.
    const look = 10 + Math.round(speed / 45);
    const ahead = track.pts[(i + look) % m];
    const inside = clamp(ahead.curve * this.insideBias, -1, 1) * HALF_WIDTH * 0.45;
    // A slow weave so the AI doesn't drive a robotic perfect line.
    const wobble = Math.sin(time * 0.7 + this.seed * 2.1) * HALF_WIDTH * 0.25 * (1.05 - this.skill);
    // Traffic: if someone is just ahead in our path, pull out to the side they're not on.
    let dodge = 0;
    const hx = Math.cos(c.heading), hy = Math.sin(c.heading);
    for (const o of others) {
      if (o === c) continue;
      const ox = o.pos.x - c.pos.x, oy = o.pos.y - c.pos.y;
      const along = ox * hx + oy * hy, across = -ox * hy + oy * hx;
      if (along > 0 && along < 160 && Math.abs(across) < 50 && o.speed < speed + 30) {
        // across > 0 means they're to our right; the track normal points left.
        dodge += (across > 0 ? 1 : -1) * HALF_WIDTH * 0.45;
      }
    }
    const off = clamp(inside + wobble + dodge, -HALF_WIDTH * 0.7, HALF_WIDTH * 0.7);
    const tx = ahead.x + ahead.nx * off, ty = ahead.y + ahead.ny * off;
    const aim = Math.atan2(ty - c.pos.y, tx - c.pos.x);

    // Corner speed from the tightest curvature in the braking zone ahead.
    let maxCurve = 0;
    const zone = 12 + Math.round(speed / 22);
    for (let k = 4; k < zone; k++) maxCurve = Math.max(maxCurve, Math.abs(track.pts[(i + k) % m].curve));
    const safe = Math.min(1000, (this.cornerK * this.skill) / Math.sqrt(maxCurve + 1e-6));
    const brake = speed > safe * 1.04;
    const throttle = !brake && speed < safe;
    return { aim, throttle, brake };
  }
}

/** Tuned so a skill-1 driver takes corners near the grip limit (see lap simulation). */
export const CORNER_K = 40;
/** How hard the line cuts to the inside of bends (sign picks the side). */
export const INSIDE_BIAS = -500;
