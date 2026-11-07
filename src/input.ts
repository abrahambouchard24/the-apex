// Mouse + keyboard. The mouse drives a virtual cursor so steering keeps working under pointer lock.

const THROTTLE_KEYS = new Set(['KeyW', 'ArrowUp']);
// Mouse buttons count as held keys too: left click brakes, right click deploys ERS.
const BRAKE_KEYS = new Set(['KeyS', 'ArrowDown', 'Space', 'Mouse0']);
const LEFT_KEYS = new Set(['KeyA', 'ArrowLeft']);
const RIGHT_KEYS = new Set(['KeyD', 'ArrowRight']);
const DEPLOY_KEYS = new Set(['ShiftLeft', 'ShiftRight', 'KeyE', 'Mouse2']);

export class Input {
  /** Virtual cursor in canvas CSS pixels. */
  cursor = { x: 0, y: 0 };
  throttle = false;
  brake = false;
  /** Holding the ERS deploy key. */
  deploy = false;
  /** Steering keys: -1 left, +1 right, 0 none (or both). */
  steer = 0;
  /** Counts mouse movements (so keyboard steering can tell when the mouse is back in use). */
  mouseMoves = 0;
  locked = false;
  private resetQueued = false;
  private pauseQueued = false;
  private muteQueued = false;
  private viewQueued = false;
  /** Called when pointer lock is lost (e.g. the browser's own Esc handling). */
  onUnlock: (() => void) | null = null;
  private held = new Set<string>();

  constructor(private canvas: HTMLCanvasElement) {
    this.cursor.x = innerWidth / 2;
    this.cursor.y = innerHeight / 2 - 150;

    canvas.addEventListener('click', () => {
      if (!this.locked) this.lock();
    });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked) this.onUnlock?.();
    });
    addEventListener('mousemove', (e) => {
      this.mouseMoves++;
      if (this.locked) {
        this.cursor.x = clampTo(this.cursor.x + e.movementX, 0, innerWidth);
        this.cursor.y = clampTo(this.cursor.y + e.movementY, 0, innerHeight);
      } else {
        this.cursor.x = e.clientX;
        this.cursor.y = e.clientY;
      }
    });
    addEventListener('keydown', (e) => {
      if (THROTTLE_KEYS.has(e.code) || BRAKE_KEYS.has(e.code) || DEPLOY_KEYS.has(e.code) || LEFT_KEYS.has(e.code) || RIGHT_KEYS.has(e.code)) {
        this.held.add(e.code);
        e.preventDefault();
      }
      if (e.code === 'KeyR') this.resetQueued = true;
      if (e.code === 'KeyM' && !e.repeat) this.muteQueued = true;
      if (e.code === 'KeyV' && !e.repeat) this.viewQueued = true;
      if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) this.pauseQueued = true;
      this.refresh();
    });
    addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      this.refresh();
    });
    // Mouse buttons on the game canvas (under pointer lock every click lands here).
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 2) {
        this.held.add(`Mouse${e.button}`);
        this.refresh();
      }
    });
    addEventListener('mouseup', (e) => {
      this.held.delete(`Mouse${e.button}`);
      this.refresh();
    });
    // Right click is the boost, so no browser context menu over the game.
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('blur', () => { this.held.clear(); this.refresh(); });
  }

  private refresh(): void {
    this.throttle = [...THROTTLE_KEYS].some((k) => this.held.has(k));
    this.brake = [...BRAKE_KEYS].some((k) => this.held.has(k));
    this.deploy = [...DEPLOY_KEYS].some((k) => this.held.has(k));
    this.steer = ([...RIGHT_KEYS].some((k) => this.held.has(k)) ? 1 : 0) - ([...LEFT_KEYS].some((k) => this.held.has(k)) ? 1 : 0);
  }

  takeReset(): boolean { const r = this.resetQueued; this.resetQueued = false; return r; }
  takePause(): boolean { const p = this.pauseQueued; this.pauseQueued = false; return p; }
  takeMute(): boolean { const m = this.muteQueued; this.muteQueued = false; return m; }
  takeView(): boolean { const v = this.viewQueued; this.viewQueued = false; return v; }

  /** Lock the mouse to the game. Must be called from a click or key handler. */
  lock(): void {
    if (this.locked) return;
    // Some embedded browsers refuse pointer lock; the game still plays with a free cursor.
    const result = this.canvas.requestPointerLock?.() as unknown as Promise<void> | undefined;
    result?.catch?.(() => {});
  }

  unlock(): void {
    if (this.locked) document.exitPointerLock();
  }

  /** Drop held keys so nothing stays pressed across a pause. */
  release(): void { this.held.clear(); this.refresh(); }
}

function clampTo(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
