// Mouse + keyboard. The mouse drives a virtual cursor so steering keeps working under pointer lock.

const THROTTLE_KEYS = new Set(['KeyW', 'ArrowUp']);
const BRAKE_KEYS = new Set(['KeyD', 'KeyS', 'ArrowDown', 'Space']);

export class Input {
  /** Virtual cursor in canvas CSS pixels. */
  cursor = { x: 0, y: 0 };
  throttle = false;
  brake = false;
  locked = false;
  private resetQueued = false;
  private held = new Set<string>();

  constructor(private canvas: HTMLCanvasElement) {
    this.cursor.x = innerWidth / 2;
    this.cursor.y = innerHeight / 2 - 150;

    canvas.addEventListener('click', () => {
      if (!this.locked) canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.cursor.x = clampTo(this.cursor.x + e.movementX, 0, innerWidth);
        this.cursor.y = clampTo(this.cursor.y + e.movementY, 0, innerHeight);
      } else {
        this.cursor.x = e.clientX;
        this.cursor.y = e.clientY;
      }
    });
    addEventListener('keydown', (e) => {
      if (THROTTLE_KEYS.has(e.code) || BRAKE_KEYS.has(e.code)) {
        this.held.add(e.code);
        e.preventDefault();
      }
      if (e.code === 'KeyR') this.resetQueued = true;
      this.refresh();
    });
    addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      this.refresh();
    });
    addEventListener('blur', () => { this.held.clear(); this.refresh(); });
  }

  private refresh(): void {
    this.throttle = [...THROTTLE_KEYS].some((k) => this.held.has(k));
    this.brake = [...BRAKE_KEYS].some((k) => this.held.has(k));
  }

  takeReset(): boolean { const r = this.resetQueued; this.resetQueued = false; return r; }
}

function clampTo(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
