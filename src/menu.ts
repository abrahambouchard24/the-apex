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
  /** The Story window on the front menu. */
  story(): void;
  /** The Online window on the front menu. */
  online(): void;
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

/* Front menu: three windows, each a little scene. Hovering one grows it. */
.hr-front { display: flex; gap: 16px; width: min(1200px, calc(100% - 32px)); height: min(440px, 62vh); margin: 0 auto 18px; }
@media (max-width: 760px) { .hr-front { flex-direction: column; height: auto; } .hr-window { min-height: 180px; } }
.hr-window { position: relative; flex: 1; overflow: hidden; border-radius: 20px; border: 2px solid #252b52; cursor: pointer;
  background: #0b0e1e; transition: flex 260ms ease, transform 260ms ease, border-color 200ms, box-shadow 260ms; color: inherit; font: inherit; padding: 0; text-align: left; }
.hr-window:hover, .hr-window:focus-visible { flex: 1.35; transform: translateY(-6px) scale(1.02); border-color: var(--c); box-shadow: 0 18px 50px -14px var(--c); outline: none; }
.hr-window .scene { position: absolute; inset: 0; }
.hr-window .label { position: absolute; left: 22px; right: 22px; bottom: 20px; z-index: 2; }
.hr-window .label b { display: block; font: 900 italic clamp(26px, 3.4vw, 40px) system-ui, sans-serif; letter-spacing: 0.04em; color: #fff;
  text-shadow: 0 4px 18px rgba(0,0,0,0.7); }
.hr-window .label small { display: block; margin-top: 4px; color: #d4daf5; font-weight: 600; font-size: 13px; letter-spacing: 0.06em; text-shadow: 0 2px 8px rgba(0,0,0,0.8); }
.hr-window::after { content: ''; position: absolute; inset: 0; background: linear-gradient(transparent 45%, rgba(5,6,14,0.92)); z-index: 1; pointer-events: none; }

/* Story: dusk at the county speedway, two cars nose to nose under the floodlights. */
.sc-story { background: linear-gradient(180deg, #2a1240 0%, #a43a52 46%, #ff9a4a 62%, #1a1424 63%, #0d0b16 100%); }
.sc-story .sun { position: absolute; left: 50%; top: 44%; width: 150px; height: 150px; margin: -75px; border-radius: 50%;
  background: radial-gradient(circle, #ffd27a, #ff7a3d 60%, transparent 72%); filter: blur(1px); }
.sc-story .stand { position: absolute; left: -5%; right: -5%; top: 52%; height: 11%; background:
  radial-gradient(circle, rgba(255,214,140,0.9) 0 1.5px, transparent 2px) 0 4px / 11px 9px,
  radial-gradient(circle, rgba(79,227,255,0.8) 0 1.5px, transparent 2px) 5px 8px / 13px 9px,
  repeating-linear-gradient(90deg, #1b1528 0 14px, #251c36 14px 16px); }
/* An LED ribbon along the top of the stand, colour washing along it. */
.sc-story .stand::before { content: ''; position: absolute; left: 0; right: 0; top: -4px; height: 4px;
  background: linear-gradient(90deg, #ff3d6e, #ffd23f, #4fe3ff, #b86bff, #ff3d6e) 0 0 / 50% 100%;
  box-shadow: 0 0 12px rgba(255,160,120,0.7); animation: hr-wash 3s linear infinite; }
/* The deck the cars sit on: plates, a lit groove and a glowing energy rail with a pulse running along it. */
.sc-story .deck { position: absolute; left: 0; right: 0; top: 63%; bottom: 0;
  background: repeating-linear-gradient(90deg, rgba(0,0,0,0.35) 0 2px, transparent 2px 46px),
  linear-gradient(180deg, #2a2236, #17121f 70%); }
.sc-story .deck::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 3px; background: #ff9a4a;
  box-shadow: 0 0 14px 2px rgba(255,154,74,0.7); }
.sc-story .deck::after { content: ''; position: absolute; top: -1px; height: 5px; width: 60px; border-radius: 3px; background: #fff;
  box-shadow: 0 0 14px 4px rgba(255,220,170,0.9); animation: hr-pulse-run 1.8s linear infinite; }
@keyframes hr-wash { to { background-position: 100% 0; } }
@keyframes hr-pulse-run { from { left: -20%; } to { left: 110%; } }
.sc-story .flood { position: absolute; top: 18%; width: 4px; height: 38%; background: #3a3350; }
.sc-story .flood::before { content: ''; position: absolute; top: -8px; left: -14px; width: 32px; height: 12px; border-radius: 3px; background: #fff6d8;
  box-shadow: 0 0 30px 12px rgba(255,236,170,0.55); animation: hr-flicker 3.2s infinite; }
.sc-story .flood.a { left: 14%; } .sc-story .flood.b { right: 14%; } .sc-story .flood.b::before { animation-delay: 1.3s; }
.sc-story img { position: absolute; top: 52%; height: 72px; filter: drop-shadow(0 10px 8px rgba(0,0,0,0.6)); }
.sc-story .me { left: 22%; transform: rotate(90deg); }
.sc-story .him { right: 22%; transform: rotate(-90deg); }
.sc-story .vs { position: absolute; left: 50%; top: 56%; transform: translateX(-50%); font: 900 italic 30px system-ui; color: #ffd23f;
  text-shadow: 0 0 18px #ff7a3d; animation: hr-pulse 1.6s ease-in-out infinite; }
@keyframes hr-flicker { 0%, 100% { opacity: 1 } 47% { opacity: 1 } 48% { opacity: 0.45 } 50% { opacity: 1 } 73% { opacity: 0.8 } }
@keyframes hr-pulse { 50% { transform: translateX(-50%) scale(1.12); } }

/* Quick race: a red car flat out down a neon straight. */
.sc-quick { background: #0a0d1c; }
.sc-quick .road { position: absolute; left: -20%; right: -20%; top: 30%; height: 40%; transform: rotate(-8deg);
  background: linear-gradient(180deg, #181c2e, #262b44 30%, #2b3150 50%, #262b44 70%, #181c2e);
  box-shadow: 0 0 40px rgba(79,227,255,0.25); }
/* Deck plate seams and chevrons sliding past. */
.sc-quick .road::before { content: ''; position: absolute; inset: 0; animation: hr-scroll 0.45s linear infinite;
  background: repeating-linear-gradient(90deg, transparent 0 36px, rgba(0,0,0,0.35) 36px 38px); }
.sc-quick .chev { position: absolute; left: 0; right: 0; top: 50%; height: 26px; margin-top: -13px; opacity: 0.22; animation: hr-scroll 0.45s linear infinite;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='76' height='26'%3E%3Cpath d='M20 3 L34 13 L20 23' fill='none' stroke='%234fe3ff' stroke-width='4'/%3E%3C/svg%3E") repeat-x; }
/* Energy rails on both edges, with light pulses streaming along them. */
.sc-quick .rail { position: absolute; left: 0; right: 0; height: 3px; background: #4fe3ff; box-shadow: 0 0 10px 2px rgba(79,227,255,0.8); overflow: hidden; }
.sc-quick .rail.t { top: 6px; } .sc-quick .rail.b { bottom: 6px; }
.sc-quick .rail::after { content: ''; position: absolute; inset: 0; animation: hr-scroll-fast 0.35s linear infinite;
  background: repeating-linear-gradient(90deg, transparent 0 140px, #fff 140px 170px); }
/* Light-strip kerb along the top edge: lit and dark segments with a glow. */
.sc-quick .road::after { content: ''; position: absolute; left: 0; right: 0; top: -12px; height: 9px; animation: hr-scroll 0.45s linear infinite;
  background: repeating-linear-gradient(90deg, #ff2d75 0 38px, #0d0f1c 38px 76px); box-shadow: 0 0 12px rgba(255,45,117,0.6); }
@keyframes hr-scroll-fast { to { background-position: -340px 0; } }
.sc-quick img { position: absolute; left: 34%; top: 38%; height: 90px; transform: rotate(82deg); filter: drop-shadow(0 12px 10px rgba(0,0,0,0.6)); animation: hr-bob 1.1s ease-in-out infinite; }
.sc-quick .trail { position: absolute; left: -10%; width: 50%; top: 47%; height: 10px; border-radius: 6px; transform: rotate(-8deg);
  background: linear-gradient(90deg, transparent, rgba(79,227,255,0.85)); filter: blur(3px); }
@keyframes hr-scroll { to { background-position: -152px 0; } }
@keyframes hr-bob { 50% { transform: rotate(82deg) translateX(-5px); } }

/* Season: a trophy under spotlights, with the circuits behind it. */
.sc-season { background: radial-gradient(ellipse at 50% 35%, #2a2350, #0b0a18 70%); }
.sc-season svg.tracks { position: absolute; inset: 6% 4% 30% 4%; width: 92%; height: 64%; opacity: 0.35; }
.sc-season .cup { position: absolute; left: 50%; top: 18%; width: 120px; transform: translateX(-50%); filter: drop-shadow(0 0 26px rgba(255,210,63,0.6));
  animation: hr-float 3s ease-in-out infinite; }
.sc-season .beam { position: absolute; top: -10%; width: 120px; height: 90%; background: linear-gradient(rgba(255,240,190,0.25), transparent);
  clip-path: polygon(40% 0, 60% 0, 100% 100%, 0 100%); }
.sc-season .beam.a { left: 20%; transform: rotate(-14deg); } .sc-season .beam.b { right: 20%; transform: rotate(14deg); }
.sc-season .spark { position: absolute; width: 6px; height: 6px; border-radius: 1px; animation: hr-fall linear infinite; }
@keyframes hr-float { 50% { transform: translateX(-50%) translateY(-8px); } }
@keyframes hr-fall { from { transform: translateY(-20px) rotate(0); opacity: 1; } to { transform: translateY(420px) rotate(540deg); opacity: 0; } }
/* Online: two cars side by side, a signal pulsing between them. */
.sc-online { background: radial-gradient(ellipse at 50% 40%, #0f2a3a, #070a16 70%); }
.sc-online .grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(79,227,255,0.08) 1px, transparent 1px),
  linear-gradient(90deg, rgba(79,227,255,0.08) 1px, transparent 1px); background-size: 34px 34px; }
.sc-online img { position: absolute; top: 34%; height: 78px; transform: rotate(0deg); filter: drop-shadow(0 10px 8px rgba(0,0,0,0.6)); }
.sc-online .a { left: 18%; } .sc-online .b { right: 18%; }
.sc-online .wave { position: absolute; left: 50%; top: 44%; width: 30px; height: 30px; margin: -15px; border-radius: 50%;
  border: 3px solid #4fe3ff; animation: hr-wave 1.8s ease-out infinite; }
.sc-online .wave:nth-child(3) { animation-delay: 0.6s; } .sc-online .wave:nth-child(4) { animation-delay: 1.2s; }
@keyframes hr-wave { from { transform: scale(0.3); opacity: 1; } to { transform: scale(4); opacity: 0; } }
.hr-back { position: absolute; top: 18px; left: 22px; min-width: 0; padding: 10px 18px; font-size: 14px; }
`;

const TROPHY = `<svg class="cup" viewBox="0 0 120 130"><defs><linearGradient id="hrg" x1="0" x2="1"><stop offset="0" stop-color="#b8860b"/><stop offset=".45" stop-color="#ffe7a0"/><stop offset="1" stop-color="#c8961e"/></linearGradient></defs>
<path d="M30 10h60v20c0 26-14 42-30 44-16-2-30-18-30-44z" fill="url(#hrg)"/>
<path d="M30 18H12c0 18 8 28 20 30M90 18h18c0 18-8 28-20 30" fill="none" stroke="url(#hrg)" stroke-width="7"/>
<rect x="54" y="74" width="12" height="22" fill="url(#hrg)"/><rect x="34" y="96" width="52" height="10" rx="2" fill="url(#hrg)"/>
<rect x="26" y="106" width="68" height="16" rx="3" fill="#2a2350" stroke="url(#hrg)" stroke-width="3"/>
<text x="60" y="44" text-anchor="middle" font-family="system-ui" font-weight="900" font-size="18" fill="#7a5410">1</text></svg>`;

export class Menus {
  private front: HTMLDivElement;
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

    // Front menu: Story, Quick Race and Season, each a window onto its own little scene.
    const sparks = Array.from({ length: 18 }, (_, i) => `<i class="spark" style="left:${(i * 37) % 100}%;top:-10px;`
      + `background:${['#ffd23f', '#ff3d6e', '#4fe3ff', '#7dffb0'][i % 4]};animation-duration:${3 + (i % 5) * 0.7}s;animation-delay:${(i * 0.43) % 4}s"></i>`).join('');
    const outlines = tracks.map((t, i) => `<polygon points="${t.outline}" transform="translate(${(i % 4) * 130} ${Math.floor(i / 4) * 95})"
      fill="none" stroke="${t.color}" stroke-width="3" stroke-linejoin="round"/>`).join('');
    this.front = overlay(`
      <div class="hr-panel" style="max-width:1240px">
        <h1 class="hr-title">THE APEX</h1>
        <p class="hr-sub">HOVER RACING · ROOKIE SEASON</p>
        <div class="hr-front">
          <button class="hr-window" data-act="story" style="--c:#ff7a3d">
            <div class="scene sc-story"><div class="sun"></div><div class="stand"></div><div class="deck"></div><div class="flood a"></div><div class="flood b"></div>
              <img class="me" src="${cars[0]?.url ?? ''}" alt=""><span class="vs">VS</span><img class="him" src="${cars[3]?.url ?? ''}" alt=""></div>
            <div class="label"><b>STORY</b><small>From the county speedway to the top of the Apex Series. Your first season starts with one race against a legend.</small></div>
          </button>
          <button class="hr-window" data-act="quick" style="--c:#4fe3ff">
            <div class="scene sc-quick"><div class="road"><div class="chev"></div><div class="rail t"></div><div class="rail b"></div></div><div class="trail"></div><img src="${cars[0]?.url ?? ''}" alt=""></div>
            <div class="label"><b>QUICK RACE</b><small>One race. Pick your car, your track and your laps, and go.</small></div>
          </button>
          <button class="hr-window" data-act="online" style="--c:#7dffb0">
            <div class="scene sc-online"><div class="grid"></div><img class="a" src="${cars[0]?.url ?? ''}" alt=""><div class="wave"></div><div class="wave"></div><div class="wave"></div>
              <img class="b" src="${cars[1]?.url ?? ''}" alt=""></div>
            <div class="label"><b>ONLINE</b><small>Host a race, send the code, and race your friends live.</small></div>
          </button>
          <button class="hr-window" data-act="season" style="--c:#ffd23f">
            <div class="scene sc-season"><svg class="tracks" viewBox="0 0 520 190">${outlines}</svg>
              <div class="beam a"></div><div class="beam b"></div>${sparks}${TROPHY}</div>
            <div class="label"><b>SEASON</b><small>A championship across the circuits. Points for every finish, a title for the best.</small></div>
          </button>
        </div>
        <p class="hr-keys">Mouse: steer &nbsp;·&nbsp; Accelerates on its own &nbsp;·&nbsp; Left click: brake &nbsp;·&nbsp; Right click: boost &nbsp;·&nbsp; Esc: pause &nbsp;·&nbsp; M: mute</p>
      </div>`);

    this.start = overlay(`
      <button class="hr-btn secondary hr-back" data-act="front">◂ BACK</button>
      <div class="hr-panel">
        <h1 class="hr-title" data-setup-title>QUICK RACE</h1>
        <p class="hr-sub">CHOOSE YOUR CAR</p>
        <div class="hr-cars"></div>
        <p class="hr-sub" data-track-head>CHOOSE YOUR TRACK</p>
        <div class="hr-tracks"></div>
        <div class="hr-options">
          <div class="hr-option" style="display:none"><label>MODE</label><div class="hr-seg" data-seg="mode">
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

    this.start.classList.add('hidden');

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

    for (const el of [this.front, this.start, this.pause, this.results]) {
      el.addEventListener('click', (e) => {
        const act = (e.target as HTMLElement).closest('[data-act]')?.getAttribute('data-act');
        if (!act) return;
        if (act === 'story') this.on.story();
        else if (act === 'online') this.on.online();
        else if (act === 'quick') this.showSetup('single');
        else if (act === 'season') this.showSetup('season');
        else if (act === 'front') this.showFront();
        else if (act === 'start') this.on.start(this.setup());
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
    this.start.querySelector('[data-setup-title]')!.textContent = this.races > 1 ? 'SEASON' : 'QUICK RACE';
  }

  selectTrack(i: number): void {
    this.selectedTrack = i;
    this.trackCards.forEach((c, k) => c.classList.toggle('selected', k === i));
  }

  /** Online, the pause menu doesn't stop the race: guests can only leave; the host can restart or go back to the lobby. */
  setOnline(role: 'host' | 'guest' | null): void {
    const restart = this.pause.querySelector<HTMLElement>('[data-act="restart"]')!;
    restart.style.display = role === 'guest' ? 'none' : '';
    this.pause.querySelector('[data-act="change"]')!.textContent =
      role === 'host' ? 'BACK TO LOBBY' : role === 'guest' ? 'LEAVE RACE' : 'CHANGE CAR';
  }

  get pauseOpen(): boolean { return !this.pause.classList.contains('hidden'); }

  /** In a story race the pause menu's way out goes back to the chapter map. */
  setStory(on: boolean): void {
    if (on) this.pause.querySelector('[data-act="change"]')!.textContent = 'QUIT MISSION';
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

  /** The setup screen for a quick race or a season (the front menu chose which). */
  showSetup(mode: 'single' | 'season'): void {
    this.races = mode === 'season' ? this.seasonRaces : 1;
    this.refreshOptions();
    this.hide();
    this.start.classList.remove('hidden');
  }

  showStart(): void { this.hide(); this.start.classList.remove('hidden'); }
  showFront(): void { this.hide(); this.front.classList.remove('hidden'); }
  showPause(): void { this.hide(); this.pause.classList.remove('hidden'); }
  hide(): void { for (const el of [this.front, this.start, this.pause, this.results]) el.classList.add('hidden'); }
}

function overlay(html: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'hr-overlay';
  el.innerHTML = html;
  return el;
}
