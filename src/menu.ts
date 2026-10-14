// Start screen (car, track, laps and season setup), pause menu and race results: plain DOM
// overlays on top of the canvas.

export interface CarChoice { name: string; url: string; color: string }

/** A track card: outline is an SVG polygon's points in a 120 x 80 box. */
export interface TrackChoice { name: string; blurb: string; outline: string; color: string }

/** One line of the results table. points is only shown in a season. */
export interface ResultRow { name: string; color: string; time: string; gap: string; best: string; player: boolean; points?: number }

/** One line of the season standings. */
export interface StandingRow { name: string; color: string; points: number; gained: number; player: boolean }

/** Everything the results screen shows. Buttons carry the action they trigger. */
export interface ResultsView {
  title: string;
  subtitle: string;
  rows: ResultRow[];
  standings?: StandingRow[];
  /** Line under the standings, e.g. the champion. */
  note?: string;
  buttons: { act: string; label: string; primary?: boolean }[];
}

/** What the player set up on the start screen. races = 1 is a single race. */
export interface RaceSetup { car: number; track: number; laps: number; races: number }

export interface MenuHandlers {
  start(setup: RaceSetup): void;
  resume(): void;
  restart(): void;
  changeCar(): void;
  /** Any other button: the results screen's own actions (next race, new season...). */
  action(act: string): void;
}

export const LAP_CHOICES = [1, 3, 5, 10];
export const SEASON_CHOICES = [2, 3, 4, 6, 8];

const CSS = `
.hr-overlay {
  position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; overflow-y: auto;
  background: radial-gradient(ellipse at center, rgba(7,8,15,0.55), rgba(7,8,15,0.92));
  font-family: system-ui, sans-serif; color: #e8ecff; cursor: default; z-index: 10;
  backdrop-filter: blur(3px);
}
.hr-overlay.hidden { display: none; }
.hr-panel { text-align: center; padding: 16px; max-width: 980px; width: 100%; margin: auto; }
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
.hr-car img { height: 80px; display: block; margin: 0 auto 8px; }
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
.hr-tracks { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
@media (max-width: 760px) { .hr-tracks { grid-template-columns: repeat(2, 1fr); } }
.hr-track {
  background: rgba(20,24,48,0.85); border: 2px solid #252b52; border-radius: 14px; padding: 8px 10px 9px;
  cursor: pointer; color: inherit; font: inherit; text-align: left; transition: transform 120ms, border-color 120ms, box-shadow 120ms;
}
.hr-track:hover { transform: translateY(-3px); border-color: #4a5590; }
.hr-track.selected { border-color: var(--c); box-shadow: 0 0 22px -4px var(--c); transform: translateY(-3px); }
.hr-track svg { display: block; width: 100%; height: 46px; margin-bottom: 4px; }
.hr-track b { display: block; font-size: 13px; letter-spacing: 0.08em; }
.hr-track small { display: block; color: #8a93c0; font-size: 11px; margin-top: 2px; line-height: 1.25; }
.hr-options { display: flex; justify-content: center; gap: 28px; flex-wrap: wrap; margin-bottom: 22px; }
.hr-option { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.hr-option.hidden { visibility: hidden; }
.hr-option label { color: #8a93c0; font-weight: 600; letter-spacing: 0.2em; font-size: 12px; }
.hr-seg { display: flex; background: rgba(20,24,48,0.85); border: 2px solid #252b52; border-radius: 12px; padding: 3px; gap: 3px; }
.hr-seg button {
  border: 0; background: transparent; color: #8a93c0; font: 800 14px system-ui, sans-serif; letter-spacing: 0.08em;
  padding: 8px 14px; border-radius: 9px; cursor: pointer; min-width: 44px;
}
.hr-seg button:hover { color: #e8ecff; }
.hr-seg button.on { background: #4fe3ff; color: #07080f; }
.hr-results { width: 100%; max-width: 640px; margin: 0 auto 24px; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.hr-results th { color: #8a93c0; font-size: 12px; letter-spacing: 0.14em; font-weight: 700; text-align: left; padding: 0 12px 8px; }
.hr-results td { padding: 9px 12px; font-weight: 700; font-size: 16px; text-align: left; border-top: 1px solid #1d2346; }
.hr-results th.num, .hr-results td.num { text-align: right; }
.hr-results tr.me td { background: rgba(79,227,255,0.1); }
.hr-results td.pos { font-size: 20px; font-weight: 900; width: 40px; }
.hr-results .dim { color: #8a93c0; }
.hr-results .pts { color: #ffd23f; }
.hr-results-track { margin: -12px 0 20px; color: #8a93c0; font-weight: 700; letter-spacing: 0.2em; font-size: 13px; }
.hr-standings-head { margin: 4px 0 10px; font-size: 20px; font-weight: 900; letter-spacing: 0.14em; }
.hr-note { margin: -10px 0 20px; font-size: 22px; font-weight: 900; letter-spacing: 0.1em; color: #ffd23f; }
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
  laps = 3;
  /** 1 = single race; more = a season of that many races. */
  races = 1;
  private seasonRaces = 4;
  private resultsHtml = '';

  constructor(cars: CarChoice[], tracks: TrackChoice[], private on: MenuHandlers) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);

    this.start = overlay(`
      <div class="hr-panel">
        <h1 class="hr-title">THE APEX</h1>
        <p class="hr-sub">CHOOSE YOUR CAR</p>
        <div class="hr-cars"></div>
        <p class="hr-sub" data-track-head>CHOOSE YOUR TRACK</p>
        <div class="hr-tracks"></div>
        <div class="hr-options">
          <div class="hr-option"><label>MODE</label><div class="hr-seg" data-seg="mode">
            <button data-v="single">SINGLE RACE</button><button data-v="season">SEASON</button></div></div>
          <div class="hr-option"><label>LAPS</label><div class="hr-seg" data-seg="laps">
            ${LAP_CHOICES.map((n) => `<button data-v="${n}">${n}</button>`).join('')}</div></div>
          <div class="hr-option" data-opt="races"><label>RACES</label><div class="hr-seg" data-seg="races">
            ${SEASON_CHOICES.map((n) => `<button data-v="${n}">${n}</button>`).join('')}</div></div>
        </div>
        <div class="hr-btns"><button class="hr-btn" data-act="start">START RACE</button></div>
        <p class="hr-keys">Mouse: steer &nbsp;·&nbsp; Accelerates on its own &nbsp;·&nbsp; Left click: brake &nbsp;·&nbsp; Right click: boost &nbsp;·&nbsp; Esc: pause &nbsp;·&nbsp; M: mute</p>
      </div>`);
    const grid = this.start.querySelector('.hr-cars')!;
    cars.forEach((car, i) => {
      const b = document.createElement('button');
      b.className = 'hr-car';
      b.style.setProperty('--c', car.color);
      b.innerHTML = `<img src="${car.url}" alt=""><span style="color:${car.color}">${car.name}</span>`;
      b.addEventListener('click', () => this.select(i));
      b.addEventListener('dblclick', () => this.on.start(this.setup()));
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
      b.addEventListener('dblclick', () => this.on.start(this.setup()));
      trackGrid.append(b);
      this.trackCards.push(b);
    });
    this.selectTrack(0);

    this.start.querySelectorAll<HTMLElement>('.hr-seg').forEach((seg) => {
      seg.addEventListener('click', (e) => {
        const v = (e.target as HTMLElement).closest('button')?.getAttribute('data-v');
        if (!v) return;
        if (seg.dataset.seg === 'mode') this.races = v === 'season' ? this.seasonRaces : 1;
        if (seg.dataset.seg === 'laps') this.laps = Number(v);
        if (seg.dataset.seg === 'races') this.races = this.seasonRaces = Number(v);
        this.refreshOptions();
      });
    });
    this.refreshOptions();

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

    this.results = overlay(`<div class="hr-panel"></div>`);
    this.results.classList.add('hidden');

    for (const el of [this.start, this.pause, this.results]) {
      el.addEventListener('click', (e) => {
        const act = (e.target as HTMLElement).closest('[data-act]')?.getAttribute('data-act');
        if (!act) return;
        if (act === 'start') this.on.start(this.setup());
        else if (act === 'resume') this.on.resume();
        else if (act === 'restart') this.on.restart();
        else if (act === 'change') this.on.changeCar();
        else this.on.action(act);
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
      if (e.code === 'Enter') this.on.start(this.setup());
    });
  }

  setup(): RaceSetup { return { car: this.selected, track: this.selectedTrack, laps: this.laps, races: this.races }; }

  private refreshOptions(): void {
    const mark = (seg: string, v: string) => this.start.querySelectorAll(`[data-seg="${seg}"] button`)
      .forEach((b) => b.classList.toggle('on', b.getAttribute('data-v') === v));
    mark('mode', this.races > 1 ? 'season' : 'single');
    mark('laps', String(this.laps));
    mark('races', String(this.seasonRaces));
    this.start.querySelector('[data-opt="races"]')!.classList.toggle('hidden', this.races === 1);
    this.start.querySelector('[data-track-head]')!.textContent = this.races > 1 ? 'CHOOSE THE OPENING TRACK' : 'CHOOSE YOUR TRACK';
    this.start.querySelector('[data-act="start"]')!.textContent = this.races > 1 ? 'START SEASON' : 'START RACE';
  }

  selectTrack(i: number): void {
    this.selectedTrack = i;
    this.trackCards.forEach((c, k) => c.classList.toggle('selected', k === i));
  }

  /** In a season the pause menu's way out quits the season rather than just changing car. */
  setSeason(on: boolean): void {
    this.pause.querySelector('[data-act="change"]')!.textContent = on ? 'QUIT SEASON' : 'CHANGE CAR';
  }

  /** Show the results screen, or refresh it while the rest of the field is still finishing. */
  showResults(v: ResultsView): void {
    const season = v.rows.some((r) => r.points !== undefined);
    const raceRows = v.rows.map((r, i) => `
      <tr class="${r.player ? 'me' : ''}">
        <td class="pos">${i + 1}</td>
        <td style="color:${r.color}">${r.name}${r.player ? ' &nbsp;<span class="dim">YOU</span>' : ''}</td>
        <td class="num">${r.time}</td>
        <td class="num dim">${r.gap}</td>
        <td class="num">${r.best}</td>
        ${season ? `<td class="num pts">${r.points ? `+${r.points}` : ''}</td>` : ''}
      </tr>`).join('');
    const standings = v.standings ? `
      <p class="hr-standings-head">SEASON STANDINGS</p>
      <table class="hr-results">
        <thead><tr><th></th><th>CAR</th><th class="num">THIS RACE</th><th class="num">POINTS</th></tr></thead>
        <tbody>${v.standings.map((s, i) => `
          <tr class="${s.player ? 'me' : ''}">
            <td class="pos">${i + 1}</td>
            <td style="color:${s.color}">${s.name}${s.player ? ' &nbsp;<span class="dim">YOU</span>' : ''}</td>
            <td class="num pts">${s.gained ? `+${s.gained}` : ''}</td>
            <td class="num">${s.points}</td>
          </tr>`).join('')}</tbody>
      </table>` : '';
    const html = `
      <h2 class="hr-h2">${v.title}</h2>
      <p class="hr-results-track">${v.subtitle}</p>
      <table class="hr-results">
        <thead><tr><th></th><th>CAR</th><th class="num">TIME</th><th class="num">GAP</th><th class="num">BEST LAP</th>${season ? '<th class="num">PTS</th>' : ''}</tr></thead>
        <tbody>${raceRows}</tbody>
      </table>
      ${standings}
      ${v.note ? `<p class="hr-note">${v.note}</p>` : ''}
      <div class="hr-btns row">${v.buttons.map((b) =>
        `<button class="hr-btn ${b.primary ? '' : 'secondary'}" data-act="${b.act}">${b.label}</button>`).join('')}</div>`;
    // Rebuilt a few times a second while cars finish: only touch the DOM when something changed,
    // so a button press isn't lost to the element under the cursor being replaced.
    if (html !== this.resultsHtml) {
      this.resultsHtml = html;
      this.results.querySelector('.hr-panel')!.innerHTML = html;
    }
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
