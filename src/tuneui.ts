// The TUNE CAR screen: four trade-off sliders, presets, and stat bars that move as you tune.

import { PRESETS, SLIDERS, STEPS, Setup, setupMods, statBars } from './setup';

const CSS = `
.tn-card { width: min(900px, calc(100% - 32px)); margin: auto; padding: 24px; border-radius: 18px; background: rgba(14,17,36,0.95);
  border: 2px solid #252b52; text-align: left; }
.tn-card h2 { margin: 0 0 4px; font: 900 italic 36px system-ui, sans-serif; letter-spacing: 0.04em;
  background: linear-gradient(90deg, #ffd23f, #ff8a1f); -webkit-background-clip: text; background-clip: text; color: transparent; }
.tn-sub { color: #8a93c0; font-weight: 700; letter-spacing: 0.16em; font-size: 12px; margin-bottom: 18px; }
.tn-cols { display: grid; grid-template-columns: 0.9fr 1.3fr; gap: 26px; }
@media (max-width: 760px) { .tn-cols { grid-template-columns: 1fr; } }
.tn-car { display: block; height: 130px; margin: 0 auto 14px; filter: drop-shadow(0 10px 10px rgba(0,0,0,0.5)); }
.tn-stat { display: grid; grid-template-columns: 110px 1fr 56px; gap: 8px; align-items: center; margin-bottom: 7px; font-size: 11px; font-weight: 800; letter-spacing: 0.1em; color: #8a93c0; }
.tn-bar { height: 8px; border-radius: 4px; background: #1b2040; position: relative; overflow: hidden; }
.tn-bar i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 4px; background: #4fe3ff; transition: width 120ms; }
.tn-bar::after { content: ''; position: absolute; left: 50%; top: -2px; bottom: -2px; width: 2px; background: rgba(255,255,255,0.35); }
.tn-delta { text-align: right; font-variant-numeric: tabular-nums; }
.tn-up { color: #4dff9a; } .tn-down { color: #ff7a8a; }
.tn-slider { margin-bottom: 16px; }
.tn-slider b { display: block; font-size: 13px; letter-spacing: 0.14em; margin-bottom: 6px; }
.tn-ends { display: flex; justify-content: space-between; color: #8a93c0; font-size: 10px; font-weight: 800; letter-spacing: 0.1em; margin-top: 4px; }
.tn-slider input { width: 100%; accent-color: #ffd23f; cursor: pointer; }
.tn-presets { display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0 18px; }
.tn-presets button { padding: 7px 12px; border-radius: 9px; border: 2px solid #252b52; background: rgba(20,24,48,0.85); color: #c8d2ff;
  font: 800 11px system-ui, sans-serif; letter-spacing: 0.1em; cursor: pointer; }
.tn-presets button.on { border-color: #ffd23f; color: #fff; }
.tn-hand { display: flex; gap: 6px; margin: 0 0 4px; }
.tn-hand button { flex: 1; padding: 9px 10px; border-radius: 10px; border: 2px solid #252b52; background: rgba(20,24,48,0.85); color: #c8d2ff;
  font: 900 12px system-ui, sans-serif; letter-spacing: 0.12em; cursor: pointer; }
.tn-hand button.on { border-color: #4fe3ff; color: #fff; background: rgba(79,227,255,0.12); }
.tn-hand-tip { color: #8a93c0; font-size: 12px; line-height: 1.4; margin-bottom: 16px; min-height: 34px; }
.tn-tip { color: #8a93c0; font-size: 12px; line-height: 1.4; margin-top: 4px; }
`;

export class TuneUI {
  private el: HTMLDivElement;
  private setup!: Setup;
  private carUrl = '';
  private changed: (s: Setup) => void = () => {};
  private closed: () => void = () => {};

  constructor() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.el = document.createElement('div');
    this.el.className = 'hr-overlay hidden';
    this.el.style.zIndex = '15';   // above the screen it was opened from
    document.body.append(this.el);
  }

  get visible(): boolean { return !this.el.classList.contains('hidden'); }

  /** Open with the current setup; onChange fires on every tweak, onClose when DONE is pressed. */
  open(setup: Setup, carUrl: string, onChange: (s: Setup) => void, onClose: () => void): void {
    this.setup = { ...setup };
    this.carUrl = carUrl;
    this.changed = onChange;
    this.closed = onClose;
    this.render();
    this.el.classList.remove('hidden');
  }

  private render(): void {
    const sliders = SLIDERS.map((sl) => `<div class="tn-slider"><b>${sl.name}</b>
      <input type="range" min="${-STEPS}" max="${STEPS}" step="1" value="${this.setup[sl.id]}" data-slider="${sl.id}">
      <div class="tn-ends"><span>◂ ${sl.low}</span><span>${sl.high} ▸</span></div></div>`).join('');
    const presets = PRESETS.map((p, i) => `<button data-preset="${i}">${p.name}</button>`).join('');
    this.el.innerHTML = `
      <div class="tn-card">
        <h2>TUNE CAR</h2>
        <div class="tn-sub">EVERY GAIN COSTS SOMETHING · THE MIDDLE IS THE STANDARD CAR</div>
        <div class="tn-cols">
          <div><img class="tn-car" src="${this.carUrl}" alt=""><div data-stats></div>
            <div class="tn-tip">Fast, flowing tracks reward long gears and a low wing. Tight, twisty ones reward grip. Big radiators help if you hit walls.</div></div>
          <div><div class="tn-sub" style="margin-bottom:6px">HANDLING</div>
            <div class="tn-hand"><button data-assist="1">ASSISTED</button><button data-assist="0">PRO</button></div>
            <div class="tn-hand-tip" data-hand-tip></div>
            <div class="tn-sub" style="margin-bottom:6px">PRESETS</div><div class="tn-presets">${presets}</div>${sliders}
            <div class="hr-btns row" style="justify-content:flex-start;margin-top:8px">
              <button class="hr-btn" data-done>DONE</button><button class="hr-btn secondary" data-reset>RESET</button></div></div>
        </div>
      </div>`;
    // Dragging a slider only updates the numbers around it, so the drag isn't interrupted.
    this.el.querySelectorAll<HTMLInputElement>('[data-slider]').forEach((inp) => inp.addEventListener('input', () => {
      this.setup = { ...this.setup, [inp.dataset.slider!]: Number(inp.value) };
      this.changed(this.setup);
      this.refresh();
    }));
    // Presets and RESET only move the sliders; handling is the driver's own choice.
    const apply = (s: Setup) => {
      this.setup = { ...s, assist: this.setup.assist };
      this.el.querySelectorAll<HTMLInputElement>('[data-slider]').forEach((inp) => { inp.value = String(this.setup[inp.dataset.slider as keyof Setup]); });
      this.changed(this.setup);
      this.refresh();
    };
    this.el.querySelectorAll<HTMLElement>('[data-preset]').forEach((b) => b.addEventListener('click', () => apply(PRESETS[Number(b.dataset.preset)].setup)));
    this.el.querySelectorAll<HTMLElement>('[data-assist]').forEach((b) => b.addEventListener('click', () => {
      this.setup = { ...this.setup, assist: Number(b.dataset.assist) };
      this.changed(this.setup);
      this.refresh();
    }));
    this.el.querySelector('[data-reset]')!.addEventListener('click', () => apply(PRESETS[0].setup));
    this.el.querySelector('[data-done]')!.addEventListener('click', () => {
      this.el.classList.add('hidden');
      this.closed();
    });
    // Arrow keys on the sliders shouldn't drive the menus behind.
    this.el.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => e.stopPropagation()));
    this.refresh();
  }

  /** The stat bars and which preset (if any) the setup matches. */
  private refresh(): void {
    const stats = statBars(setupMods(this.setup)).map((b) => {
      const pct = Math.round(b.delta * 1000) / 10;
      const cls = pct > 0 ? 'tn-up' : pct < 0 ? 'tn-down' : '';
      return `<div class="tn-stat"><span>${b.name}</span><div class="tn-bar"><i style="width:${(b.value * 100).toFixed(1)}%"></i></div>
        <span class="tn-delta ${cls}">${pct > 0 ? '+' : ''}${pct ? pct + '%' : '—'}</span></div>`;
    }).join('');
    this.el.querySelector('[data-stats]')!.innerHTML = stats;
    this.el.querySelectorAll<HTMLElement>('[data-assist]').forEach((b) => b.classList.toggle('on', Number(b.dataset.assist) === this.setup.assist));
    this.el.querySelector('[data-hand-tip]')!.textContent = this.setup.assist
      ? 'Turning hard scrubs speed off for you, so the car holds the road. Forgiving, about 4% slower than a perfect PRO lap.'
      : 'Turning keeps your speed: carry too much into a corner and you slide wide. Brake before corners. Fastest, if you can drive it.';
    const same = (a: Setup) => SLIDERS.every((sl) => a[sl.id] === this.setup[sl.id]);
    this.el.querySelectorAll<HTMLElement>('[data-preset]').forEach((b) => b.classList.toggle('on', same(PRESETS[Number(b.dataset.preset)].setup)));
  }
}
