// Start screen (car select) and pause menu: plain DOM overlays on top of the canvas.

export interface CarChoice { name: string; url: string; color: string }

export interface MenuHandlers {
  start(carIndex: number): void;
  resume(): void;
  restart(): void;
  changeCar(): void;
}

const CSS = `
.hr-overlay {
  position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(ellipse at center, rgba(7,8,15,0.55), rgba(7,8,15,0.92));
  font-family: system-ui, sans-serif; color: #e8ecff; cursor: default; z-index: 10;
  backdrop-filter: blur(3px);
}
.hr-overlay.hidden { display: none; }
.hr-panel { text-align: center; padding: 16px; max-width: 980px; width: 100%; }
.hr-title {
  margin: 0; font-size: clamp(40px, 8vw, 76px); font-weight: 900; font-style: italic; letter-spacing: 0.04em;
  background: linear-gradient(90deg, #4fe3ff, #ff4fd8); -webkit-background-clip: text; background-clip: text; color: transparent;
}
.hr-sub { margin: 6px 0 22px; color: #8a93c0; font-weight: 600; letter-spacing: 0.2em; font-size: 13px; }
.hr-cars { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 22px; }
@media (max-width: 760px) { .hr-cars { grid-template-columns: repeat(3, 1fr); } }
.hr-car {
  background: rgba(20,24,48,0.85); border: 2px solid #252b52; border-radius: 14px; padding: 14px 8px 10px;
  cursor: pointer; color: inherit; font: inherit; transition: transform 120ms, border-color 120ms, box-shadow 120ms;
}
.hr-car:hover { transform: translateY(-3px); border-color: #4a5590; }
.hr-car.selected { border-color: var(--c); box-shadow: 0 0 22px -4px var(--c); transform: translateY(-3px); }
.hr-car img { height: 120px; display: block; margin: 0 auto 10px; }
.hr-car span { font-weight: 800; font-size: 14px; letter-spacing: 0.08em; }
.hr-btns { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.hr-btn {
  min-width: 240px; padding: 14px 28px; border-radius: 12px; border: 0; cursor: pointer;
  font: 800 18px system-ui, sans-serif; letter-spacing: 0.12em; color: #07080f;
  background: linear-gradient(90deg, #4fe3ff, #7dffd8);
}
.hr-btn:hover { filter: brightness(1.12); }
.hr-btn.secondary { background: #1d2346; color: #e8ecff; }
.hr-keys { margin-top: 18px; color: #8a93c0; font-size: 13px; }
.hr-h2 { margin: 0 0 22px; font-size: 44px; font-weight: 900; letter-spacing: 0.1em; }
`;

export class Menus {
  private start: HTMLDivElement;
  private pause: HTMLDivElement;
  private cards: HTMLButtonElement[] = [];
  selected = 0;

  constructor(cars: CarChoice[], private on: MenuHandlers) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);

    this.start = overlay(`
      <div class="hr-panel">
        <h1 class="hr-title">THE APEX</h1>
        <p class="hr-sub">CHOOSE YOUR CAR</p>
        <div class="hr-cars"></div>
        <div class="hr-btns"><button class="hr-btn" data-act="start">START RACE</button></div>
        <p class="hr-keys">Mouse: steer &nbsp;·&nbsp; W: accelerate &nbsp;·&nbsp; S / D / Space: brake &nbsp;·&nbsp; Esc: pause</p>
      </div>`);
    const grid = this.start.querySelector('.hr-cars')!;
    cars.forEach((car, i) => {
      const b = document.createElement('button');
      b.className = 'hr-car';
      b.style.setProperty('--c', car.color);
      b.innerHTML = `<img src="${car.url}" alt=""><span style="color:${car.color}">${car.name}</span>`;
      b.addEventListener('click', () => this.select(i));
      b.addEventListener('dblclick', () => this.on.start(this.selected));
      grid.append(b);
      this.cards.push(b);
    });
    this.select(0);

    this.pause = overlay(`
      <div class="hr-panel">
        <h2 class="hr-h2">PAUSED</h2>
        <div class="hr-btns">
          <button class="hr-btn" data-act="resume">RESUME</button>
          <button class="hr-btn secondary" data-act="restart">RESTART RACE</button>
          <button class="hr-btn secondary" data-act="change">CHANGE CAR</button>
        </div>
      </div>`);
    this.pause.classList.add('hidden');

    for (const el of [this.start, this.pause]) {
      el.addEventListener('click', (e) => {
        const act = (e.target as HTMLElement).closest('[data-act]')?.getAttribute('data-act');
        if (act === 'start') this.on.start(this.selected);
        if (act === 'resume') this.on.resume();
        if (act === 'restart') this.on.restart();
        if (act === 'change') this.on.changeCar();
      });
      document.body.append(el);
    }

    // Keyboard on the start screen: arrows pick a car, Enter starts.
    addEventListener('keydown', (e) => {
      if (this.start.classList.contains('hidden')) return;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.select((this.selected + 1) % cars.length);
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.select((this.selected - 1 + cars.length) % cars.length);
      if (e.code === 'Enter') this.on.start(this.selected);
    });
  }

  select(i: number): void {
    this.selected = i;
    this.cards.forEach((c, k) => c.classList.toggle('selected', k === i));
  }

  showStart(): void { this.start.classList.remove('hidden'); this.pause.classList.add('hidden'); }
  showPause(): void { this.pause.classList.remove('hidden'); this.start.classList.add('hidden'); }
  hide(): void { this.start.classList.add('hidden'); this.pause.classList.add('hidden'); }
}

function overlay(html: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'hr-overlay';
  el.innerHTML = html;
  return el;
}
