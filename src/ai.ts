// AI drivers: look ahead along the centerline, steer for a point in front, brake for the
// tightest bend coming up. On top of that they race: commit to a side to overtake, cover the
// inside when someone is right behind into a corner, and now and then make a mistake.
// Pure logic, like craft.ts.

import { Craft, clamp } from './craft';
import { COOL_LANE, Fork, HALF_WIDTH, RaceState, Track, lateral } from './track';

export interface Controls { aim: number; throttle: boolean; brake: boolean; deploy: boolean }

/** What the AI can see of another car. */
export interface Rival { craft: Craft; race: RaceState }

type Mistake = { kind: 'late-brake' | 'run-wide'; left: number } | null;

const PASS_LOOK = 14;          // samples ahead (~260 px) to start setting up a pass
const PASS_COMMIT = 1.6;       // seconds to stick with a chosen passing side
const PASS_GAP = 62;           // px beside the other car's line when going round it
const DEFEND_LOOK = 8;         // samples behind (~150 px) that count as "someone's on my tail"
const MAX_OFFSET = HALF_WIDTH * 0.72;

export class Driver {
  craft = new Craft();
  race = new RaceState();
  cornerK = CORNER_K;
  insideBias = INSIDE_BIAS;
  /** How much of the slip angle the AI steers against (sign from testing; see CLAUDE.md). */
  slipCorrect = 0.5;
  /** Which side we're passing on (+1 = track-left, -1 = track-right), and for how long. */
  private passSide = 0;
  private passTimer = 0;
  private mistake: Mistake = null;
  private lastTime = 0;
  /** What the driver is doing right now, for debugging and tests. */
  state: 'racing' | 'passing' | 'defending' | 'cooling' | 'mistake' = 'racing';
  /** Sprints: the lane chosen for the split ahead (+1 / -1), or 0 when not in or near one. */
  private lane = 0;

  /** skill 1 = near the grip limit with no mistakes; lower = slower corners, more weave, more errors. */
  constructor(public skill = 0.92, private seed = 1) {}

  think(track: Track, time: number, others: Rival[] = []): Controls {
    const dt = clamp(time - this.lastTime, 0, 0.1);
    this.lastTime = time;
    const m = track.length;
    const c = this.craft;
    const i = this.race.index;
    const speed = c.speed;
    const myProgress = this.race.progress(track);

    // Sprints: a fork coming up (or under us) — pick a lane once, by what each offers.
    const forkAhead = track.forks.length ? track.forkAt(track.aheadBy(i, 500 + speed * 0.6)) ?? track.forkAt(i) : null;
    if (forkAhead) {
      if (this.lane === 0) this.lane = this.chooseLane(track, forkAhead);
    } else this.lane = 0;
    // Once the island has started, stay in the lane we're actually in (never cut across its nose).
    if (this.lane !== 0 && track.split(i)) {
      const mine = track.sideOf(i, lateral(track, c, i));
      if (track.inL[i] + track.inR[i] > 24 && mine !== this.lane) this.lane = mine;
    }
    const lane = this.lane;

    // The tightest bend in the braking zone (along our lane in a fork), and which side its inside is on.
    let maxCurve = 0, cornerCurve = 0;
    const zonePx = (12 + speed / 22) * 20;
    for (let j = i, d = 0, k = 0; d < zonePx && k < 300; k++) {
      const n = track.shift(j, 1);
      if (n === j) break;
      const a = lane ? track.lanePoint(j, lane) : track.pts[j], b = lane ? track.lanePoint(n, lane) : track.pts[n];
      d += Math.hypot(b.x - a.x, b.y - a.y);
      j = n;
      if (d < 80) continue;
      const cv = track.curveAt(j, lane);
      if (Math.abs(cv) > maxCurve) { maxCurve = Math.abs(cv); cornerCurve = cv; }
    }
    const insideSign = cornerCurve * this.insideBias > 0 ? 1 : -1;
    const cornerComing = maxCurve > 1 / 700;

    // Base line: aim further ahead the faster we go, nudged toward the inside of the bend,
    // with a slow weave so the AI doesn't drive a robotic perfect line.
    const lookPx = (10 + speed / 45) * 20;
    const aheadIndex = lane ? track.aheadBy(i, lookPx, lane) : track.aheadBy(i, lookPx);
    const ahead = track.pts[aheadIndex];
    let off = clamp(ahead.curve * this.insideBias, -1, 1) * HALF_WIDTH * 0.45;
    off += Math.sin(time * 0.7 + this.seed * 2.1) * HALF_WIDTH * 0.25 * (1.05 - this.skill);

    // Find the nearest car just ahead and just behind on track.
    let front: Rival | null = null, frontGap = Infinity, rearGap = Infinity;
    for (const o of others) {
      if (o.craft === c) continue;
      const gap = o.race.progress(track) - myProgress;
      if (gap > 0 && gap < PASS_LOOK && gap < frontGap) { front = o; frontGap = gap; }
      if (gap < 0 && -gap < DEFEND_LOOK) rearGap = Math.min(rearGap, -gap);
    }

    this.passTimer = Math.max(0, this.passTimer - dt);
    this.state = 'racing';

    if (front) {
      // Overtake: pick the side with more room (the inside of a coming corner if there's space)
      // and commit to it for a while, so we don't dither left-right behind them.
      const oLat = lateral(track, front.craft, front.race.index);
      if (this.passTimer === 0) {
        const roomLeft = HALF_WIDTH - oLat, roomRight = HALF_WIDTH + oLat;
        const insideRoom = insideSign > 0 ? roomLeft : roomRight;
        this.passSide = cornerComing && insideRoom > 90 ? insideSign : roomLeft >= roomRight ? 1 : -1;
        this.passTimer = PASS_COMMIT;
      }
      off = oLat + this.passSide * PASS_GAP;
      this.state = 'passing';
    } else if (rearGap < Infinity && cornerComing) {
      // Defend: someone's on our tail into a corner, so cover the inside line.
      off = insideSign * HALF_WIDTH * 0.55;
      this.state = 'defending';
    }

    // Running hot with the cooling lane coming up (or underneath us): move over onto it.
    const toLane = (COOL_LANE.from - i + m) % m;
    const onLaneStretch = i >= COOL_LANE.from && i <= COOL_LANE.to;
    const wantLane = c.heat > 0.45 && (onLaneStretch || toLane < 40);
    if (wantLane) this.state = 'cooling';

    // Mistakes: now and then brake too late or run wide for a moment.
    if (this.mistake) {
      this.mistake.left -= dt;
      if (this.mistake.left <= 0) this.mistake = null;
    } else if (cornerComing && speed > 300 && Math.random() < (1 - this.skill) * 0.25 * dt) {
      this.mistake = { kind: Math.random() < 0.5 ? 'late-brake' : 'run-wide', left: 1.1 };
    }
    if (this.mistake) {
      this.state = 'mistake';
      if (this.mistake.kind === 'run-wide') off = -insideSign * HALF_WIDTH * 0.7;
    }

    off = clamp(off, -MAX_OFFSET, MAX_OFFSET);
    // In a fork: drive our lane, cutting toward the inside of its bends.
    if (lane !== 0) {
      if (track.split(aheadIndex)) {
        const half = (track.outer(aheadIndex, lane) - track.inner(aheadIndex, lane)) / 2;
        off = track.laneOffset(aheadIndex, lane)
          + clamp(track.curveAt(aheadIndex, lane) * this.insideBias, -1, 1) * Math.max(0, half - 40) * 0.6;
        // Never closer than 40 px to either of the lane's walls.
        const a = lane * (track.inner(aheadIndex, lane) + 40), b = lane * (track.outer(aheadIndex, lane) - 40);
        off = clamp(off, Math.min(a, b), Math.max(a, b));
      } else {
        off = lane * Math.max(HALF_WIDTH * 0.3, Math.abs(off));
      }
    }
    // The lane hugs the wall, past the normal line limit: aim right along it.
    if (wantLane && this.state === 'cooling') off = COOL_LANE.side * (HALF_WIDTH - 16);
    // Steer for the chosen line at the look-ahead point.
    const tx = ahead.x + ahead.nx * off, ty = ahead.y + ahead.ny * off;
    // Steer so the car's actual travel (not just its nose) heads for the line: when sliding,
    // point further into the turn by the slip angle.
    const aim = Math.atan2(ty - c.pos.y, tx - c.pos.x) - c.slip * this.slipCorrect;

    // Corner speed from the tightest curvature ahead; a late-brake mistake carries too much in.
    const late = this.mistake?.kind === 'late-brake' ? 1.18 : 1;
    // More grip (wing, upgrades) lets the car carry more speed through a bend: about its square root.
    const gripGain = Math.sqrt(Math.max(0.5, 1 + c.mods.grip));
    const safe = Math.min(1000, (this.cornerK * this.skill * late * gripGain) / Math.sqrt(maxCurve + 1e-6));
    const brake = speed > safe * 1.04;
    const throttle = !brake && speed < safe;
    // ERS: spend energy on straights to attack or defend, or when the battery is nearly full.
    const straight = maxCurve < 1 / 1500;
    const deploy = throttle && straight && c.energy > 0.05
      && (front !== null || rearGap < Infinity || c.energy > 0.6);
    // Past the finish of a point-to-point sprint: ease to a stop before the end of the road.
    if (track.open && this.race.lap > 0) return { aim, throttle: false, brake: true, deploy: false };
    return { aim, throttle, brake, deploy };
  }

  /**
   * Pick a fork's lane: each is worth what it offers (a jump's boost, a charge when the battery is
   * low, cooling when hot) minus the time it costs over the quicker lane, with a little randomness.
   */
  private chooseLane(track: Track, f: Fork): number {
    const c = this.craft;
    const offer = (kind: string) => kind === 'jump' ? 0.5 + 0.3 * this.skill
      : kind === 'charge' ? 0.15 + (1 - c.energy) * 0.9
      : kind === 'cool' ? c.heat * 2.4 - 0.15
      : 0;
    const quick = Math.min(f.time[0], f.time[1]);
    const worth = (k: number) => offer(k === 0 ? f.left : f.right) - (f.time[k] - quick) * (0.7 + this.skill) + (Math.random() - 0.5) * 0.5;
    return worth(0) >= worth(1) ? 1 : -1;
  }

  /** Roll how this driver gets off the line at GO. */
  rollLaunch(): 'perfect' | 'stall' | 'normal' {
    const r = Math.random();
    if (r < 0.15 + 0.4 * (this.skill - 0.6)) return 'perfect';
    if (r > 1 - 0.25 * (1 - this.skill)) return 'stall';
    return 'normal';
  }
}

/** Tuned so a skill-1 driver takes corners near the grip limit (see lap simulation). */
export const CORNER_K = 56;
/** How hard the line cuts to the inside of bends (sign picks the side). */
export const INSIDE_BIAS = -500;
