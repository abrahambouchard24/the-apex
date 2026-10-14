// Start screen (car and track select), pause menu and race results: plain DOM overlays on top
// of the canvas.

export interface CarChoice { name: string; url: string; color: string }

/** A track card: outline is an SVG polygon's points in a 120 x 80 box. */
export interface TrackChoice { name: string; blurb: string; outline: string; color: string }

/** One line of the results table. */
export interface ResultRow { name: string; color: string; time: string; gap: string; best: string; player: boolean }

export interface MenuHandlers {
  start(carIndex: number, trackIndex: number): void;
  resume(): void;
  restart(): void;
  changeCar(): void;
}

const CSS = `
.hr-overlay {
  position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; overflow-y: auto;
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
.hr-sub { margin: 6px 0 14px; color: #8a93c0; font-weight: 600; letter-spacing: 0.2em; font-size: 13px; }
.hr-cars { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 22px; }
@media (max-width: 760px) { .hr-cars { grid-template-columns: repeat(3, 1fr); } }
.hr-car {
  background: rgba(20,24,48,0.85); border: 2px solid #252b52; border-radius: 14px; padding: 14px 8px 10px;
  cursor: pointer; color: inherit; font: inherit; transition: transform 120ms, border-color 120ms, box-shadow 120ms;
}
.hr-car:hover { transform: translateY(-3px); border-color: #4a5590; }
.hr-car.selected { border-color: var(--c); box-shadow: 0 0 22px -4px var(--c); transform: translateY(-3px); }
.hr-car img { height: 96px; display: block; margin: 0 auto 10px; }
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
.hr-tracks { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 22px; }
@media (max-width: 760px) { .hr-tracks { grid-template-columns: repeat(2, 1fr); } }
.hr-track {
  background: rgba(20,24,48,0.85); border: 2px solid #252b52; border-radius: 14px; padding: 10px 10px 12px;
  cursor: pointer; color: inherit; font: inherit; text-align: left; transition: transform 120ms, border-color 120ms, box-shadow 120ms;
}
.hr-track:hover { transform: translateY(-3px); border-color: #4a5590; }
.hr-track.selected { border-color: var(--c); box-shadow: 0 0 22px -4px var(--c); transform: translateY(-3px); }
.hr-track svg { display: block; width: 100%; height: 72px; margin-bottom: 6px; }
.hr-track b { display: block; font-size: 14px; letter-spacing: 0.08em; }
.hr-track small { display: block; color: #8a93c0; font-size: 12px; margin-top: 3px; line-height: 1.3; }
.hr-results { width: 100%; max-width: 640px; margin: 0 auto 24px; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.hr-results th { color: #8a93c0; font-size: 12px; letter-spacing: 0.14em; font-weight: 700; text-align: left; padding: 0 12px 8px; }
.hr-results td { padding: 10px 12px; font-weight: 700; font-size: 16px; text-align: left; border-top: 1px solid #1d2346; }
.hr-results th.num, .hr-results td.num { text-align: right; }
.hr-results tr.me td { background: rgba(79,227,255,0.1); }
.hr-results td.pos { font-size: 20px; font-weight: 900; width: 40px; }
.hr-results .dim { color: #8a93c0; }
.hr-results-track { margin: -12px 0 20px; color: #8a93c0; font-weight: 700; letter-spacing: 0.2em; font-size: 13px; }
.hr-btns.row { flex-direction: row; justify-content: center; flex-wrap: wrap; }
`;

export class Menus {
  private start: HTMLDivElement;
  private pause: HTMLDivElement;
  private results: HTMLDivElement;
  private cards: HTMLButtonElement[] = [];
  private trackCards: HTMLButtonElement[] = [];
  selected = 0;
  selectedTrack = 0;

  constructor(cars: CarChoice[], tracks: TrackChoice[], private on: MenuHandlers) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);

    this.start = overlay(`
      <div class="hr-panel">
        <h1 class="hr-title">THE APEX</h1>
        <p class="hr-sub">CHOOSE YOUR CAR</p>
        <div class="hr-cars"></div>
        <p class="hr-sub">CHOOSE YOUR TRACK</p>
        <div class="hr-tracks"></div>
        <div class="hr-btns"><button class="hr-btn" data-act="start">START RACE</button></div>
        <p class="hr-keys">Mouse: steer &nbsp;·&nbsp; W: accelerate &nbsp;·&nbsp; S / D / Space: brake &nbsp;·&nbsp; Esc: pause &nbsp;·&nbsp; M: mute</p>
      </div>`);
    const grid = this.start.querySelector('.hr-cars')!;
    cars.forEach((car, i) => {
      const b = document.createElement('button');
      b.className = 'hr-car';
      b.style.setProperty('--c', car.color);
      b.innerHTML = `<img src="${car.url}" alt=""><span style="color:${car.color}">${car.name}</span>`;
      b.addEventListener('click', () => this.select(i));
      b.addEventListener('dblclick', () => this.on.start(this.selected, this.selectedTrack));
      grid.append(b);
      this.cards.push(b);
    });
    this.select(0);

    const trackGrid = this.start.querySelector('.hr-tracks')!;
    tracks.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = 'hr-track';
      b.style.setProperty('--c', t.color);
      b.innerHTML = `<svg viewBox="0 0 120 80"><polygon points="${t.outline}" fill="none" stroke="${t.color}"
        stroke-width="3" stroke-linejoin="round"/></svg><b>${t.name}</b><small>${t.blurb}</small>`;
      b.addEventListener('click', () => this.selectTrack(i));
      b.addEventListener('dblclick', () => this.on.start(this.selected, this.selectedTrack));
      trackGrid.append(b);
      this.trackCards.push(b);
    });
    this.selectTrack(0);

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

    this.results = overlay(`
      <div class="hr-panel">
        <h2 class="hr-h2">RESULTS</h2>
        <p class="hr-results-track"></p>
        <table class="hr-results">
          <thead><tr><th></th><th>CAR</th><th class="num">TIME</th><th class="num">GAP</th><th class="num">BEST LAP</th></tr></thead>
          <tbody></tbody>
        </table>
        <div class="hr-btns row">
          <button class="hr-btn" data-act="restart">RACE AGAIN</button>
          <button class="hr-btn secondary" data-act="change">CHANGE CAR</button>
        </div>
      </div>`);
    this.results.classList.add('hidden');

    for (const el of [this.start, this.pause, this.results]) {
      el.addEventListener('click', (e) => {
        const act = (e.target as HTMLElement).closest('[data-act]')?.getAttribute('data-act');
        if (act === 'start') this.on.start(this.selected, this.selectedTrack);
        if (act === 'resume') this.on.resume();
        if (act === 'restart') this.on.restart();
        if (act === 'change') this.on.changeCar();
      });
      document.body.append(el);
    }

    // Keyboard on the start screen: left/right pick a car, up/down pick a track, Enter starts.
    addEventListener('keydown', (e) => {
      if (this.start.classList.contains('hidden')) return;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.select((this.selected + 1) % cars.length);
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.select((this.selected - 1 + cars.length) % cars.length);
      if (e.code === 'ArrowDown') this.selectTrack((this.selectedTrack + 1) % tracks.length);
      if (e.code === 'ArrowUp') this.selectTrack((this.selectedTrack - 1 + tracks.length) % tracks.length);
      if (e.code === 'Enter') this.on.start(this.selected, this.selectedTrack);
    });
  }

  selectTrack(i: number): void {
    this.selectedTrack = i;
    this.trackCards.forEach((c, k) => c.classList.toggle('selected', k === i));
  }

  /** Show the results table, or refresh it while the rest of the field is still finishing. */
  showResults(trackName: string, rows: ResultRow[]): void {
    this.results.querySelector('.hr-results-track')!.textContent = trackName;
    this.results.querySelector('tbody')!.innerHTML = rows.map((r, i) => `
      <tr class="${r.player ? 'me' : ''}">
        <td class="pos">${i + 1}</td>
        <td style="color:${r.color}">${r.name}${r.player ? ' &nbsp;<span class="dim">YOU</span>' : ''}</td>
        <td class="num">${r.time}</td>
        <td class="num dim">${r.gap}</td>
        <td class="num">${r.best}</td>
      </tr>`).join('');
    if (!this.results.classList.contains('hidden')) return;
    this.hide();
    this.results.classList.remove('hidden');
  }

  select(i: number): void {
    this.selected = i;
    this.cards.forEach((c, k) => c.classList.toggle('selected', k === i));
  }

  showStart(): void { this.hide(); this.start.classList.remove('hidden'); }
  showPause(): void { this.hide(); this.pause.classList.remove('hidden'); }
  hide(): void { for (const el of [this.start, this.pause, this.results]) el.classList.add('hidden'); }
}

function overlay(html: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'hr-overlay';
  el.innerHTML = html;
  return el;
}
