// Mouse + keyboard. The mouse drives a virtual cursor so steering keeps working under pointer lock.

const SHIFT_KEYS = new Set(['KeyW', 'ArrowUp', 'ShiftLeft', 'ShiftRight']);
const BRAKE_KEYS = new Set(['KeyS', 'ArrowDown', 'Space']);

export class Input {
  /** Virtual cursor in canvas CSS pixels. */
  cursor = { x: 0, y: 0 };
  brake = false;
  locked = false;
  private shiftQueued = 0;
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
      if (SHIFT_KEYS.has(e.code) && !e.repeat) this.shiftQueued++;
      if (BRAKE_KEYS.has(e.code)) this.held.add(e.code);
      if (e.code === 'KeyR') this.resetQueued = true;
      if (SHIFT_KEYS.has(e.code) || BRAKE_KEYS.has(e.code)) e.preventDefault();
      this.brake = this.held.size > 0;
    });
    addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      this.brake = this.held.size > 0;
    });
    addEventListener('blur', () => { this.held.clear(); this.brake = false; });
  }

  /** Number of shift-up presses since the last call. */
  takeShifts(): number { const n = this.shiftQueued; this.shiftQueued = 0; return n; }
  takeReset(): boolean { const r = this.resetQueued; this.resetQueued = false; return r; }
}

function clampTo(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
