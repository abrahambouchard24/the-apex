// The Garage: equip skins earned from achievements, see every achievement and your online record.
// Also the "achievement unlocked" pop-up shown during play.

import { ACHIEVEMENTS, Achievement, Progress, SKINS, progressOf, skinUnlocked } from './achievements';

const CSS = `
.gr-card { width: min(980px, calc(100% - 32px)); margin: auto; padding: 22px 24px; border-radius: 18px; background: rgba(14,17,36,0.96);
  border: 2px solid #252b52; text-align: left; }
.gr-card h2 { margin: 0 0 4px; font: 900 italic 38px system-ui, sans-serif; letter-spacing: 0.04em;
  background: linear-gradient(90deg, #ffd23f, #ff7a3d); -webkit-background-clip: text; background-clip: text; color: transparent; }
.gr-sub { color: #8a93c0; font-weight: 700; letter-spacing: 0.18em; font-size: 12px; margin: 14px 0 8px; }
.gr-skins { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 10px; }
.gr-skin { padding: 10px; border-radius: 12px; border: 2px solid #252b52; background: rgba(20,24,48,0.85); color: #e8ecff; cursor: pointer;
  font: inherit; text-align: left; transition: transform 120ms, border-color 120ms; }
.gr-skin:hover:not(:disabled) { transform: translateY(-2px); border-color: #4a5590; }
.gr-skin.on { border-color: #ffd23f; box-shadow: 0 0 18px -6px #ffd23f; }
.gr-skin:disabled { cursor: default; opacity: 0.55; }
.gr-sw { display: flex; height: 26px; border-radius: 7px; overflow: hidden; margin-bottom: 8px; }
.gr-sw i { flex: 1; }
.gr-skin b { display: block; font-size: 12px; letter-spacing: 0.08em; }
.gr-skin small { display: block; color: #8a93c0; font-size: 11px; margin-top: 3px; line-height: 1.3; }
.gr-ach { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px; }
.gr-a { display: flex; gap: 10px; align-items: center; padding: 9px 11px; border-radius: 10px; background: rgba(20,24,48,0.85); border: 1px solid #252b52; }
.gr-a .ic { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-weight: 900; background: #1d2346; color: #5a6290; flex: none; }
.gr-a.got .ic { background: #ffd23f; color: #07080f; }
.gr-a b { display: block; font-size: 12px; letter-spacing: 0.08em; }
.gr-a small { color: #8a93c0; font-size: 11px; }
.gr-a .bar { height: 3px; background: #252b52; border-radius: 2px; margin-top: 4px; }
.gr-a .bar i { display: block; height: 100%; background: #4fe3ff; border-radius: 2px; }
.gr-rec { display: flex; gap: 22px; flex-wrap: wrap; }
.gr-rec div b { display: block; font: 900 26px system-ui, sans-serif; }
.gr-rec div small { color: #8a93c0; font-weight: 700; letter-spacing: 0.14em; font-size: 11px; }
.gr-pop { position: fixed; right: 22px; top: 22px; z-index: 40; width: 300px; padding: 12px 14px; border-radius: 14px; background: rgba(12,15,32,0.96);
  border: 2px solid #ffd23f; box-shadow: 0 10px 40px -10px rgba(255,210,63,0.6); font-family: system-ui, sans-serif; color: #e8ecff;
  pointer-events: none; transition: opacity 400ms, transform 400ms; }
.gr-pop.out { opacity: 0; transform: translateY(-12px); }
.gr-pop small { display: block; color: #ffd23f; font-weight: 900; letter-spacing: 0.18em; font-size: 11px; }
.gr-pop b { display: block; font-size: 18px; letter-spacing: 0.06em; margin: 2px 0; }
.gr-pop span { color: #c8d2ff; font-size: 13px; }
`;

export class GarageUI {
  private el: HTMLDivElement;

  constructor() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.el = document.createElement('div');
    this.el.className = 'hr-overlay hidden';
    this.el.style.zIndex = '30';
    this.el.style.background = 'rgba(7,8,15,0.96)';
    document.body.append(this.el);
  }

  get isOpen(): boolean { return !this.el.classList.contains('hidden'); }

  open(p: Progress, equip: (skin: string) => void, onClose: () => void): void {
    const render = () => {
      const skins = SKINS.map((s) => {
        const owned = skinUnlocked(p, s.id);
        const how = ACHIEVEMENTS.find((a) => a.skin === s.id);
        const sw = s.colors ? [s.colors.body, s.colors.trim, s.colors.accent, s.colors.glow] : ['#ff3d6e', '#3ff0ff', '#2fd16b', '#ff8a1f'];
        return `<button class="gr-skin ${p.equipped === s.id ? 'on' : ''}" data-skin="${s.id}" ${owned ? '' : 'disabled'}>
          <div class="gr-sw">${sw.map((c) => `<i style="background:${c}"></i>`).join('')}</div>
          <b>${s.name}</b><small>${owned ? (p.equipped === s.id ? 'EQUIPPED' : s.colors ? 'CLICK TO EQUIP' : 'Each car in its own colours') : `🔒 ${how ? how.name : ''}`}</small></button>`;
      }).join('');
      const got = ACHIEVEMENTS.filter((a) => p.unlocked.includes(a.id)).length;
      const achs = ACHIEVEMENTS.map((a) => {
        const done = p.unlocked.includes(a.id);
        const prog = a.goal && !done ? `<div class="bar"><i style="width:${Math.min(100, (progressOf(p, a) / a.goal) * 100)}%"></i></div>` : '';
        return `<div class="gr-a ${done ? 'got' : ''}"><div class="ic">${done ? '✓' : '•'}</div>
          <div style="flex:1"><b>${a.name}</b><small>${a.desc}${a.goal && !done ? ` (${progressOf(p, a)} / ${a.goal})` : ''}</small>${prog}</div></div>`;
      }).join('');
      const o = p.online;
      this.el.innerHTML = `
        <div class="gr-card">
          <h2>GARAGE</h2>
          <div class="gr-sub">SKINS · EARN THEM WITH ACHIEVEMENTS</div>
          <div class="gr-skins">${skins}</div>
          <div class="gr-sub">ACHIEVEMENTS · ${got} / ${ACHIEVEMENTS.length}</div>
          <div class="gr-ach">${achs}</div>
          <div class="gr-sub">YOUR ONLINE RECORD</div>
          <div class="gr-rec">
            <div><b>${o.races}</b><small>RACES</small></div><div><b>${o.wins}</b><small>WINS</small></div>
            <div><b>${o.podiums}</b><small>PODIUMS</small></div><div><b>${o.best ? ordinal(o.best) : '-'}</b><small>BEST FINISH</small></div>
          </div>
          <div class="hr-btns row" style="margin-top:20px"><button class="hr-btn" data-done>DONE</button></div>
        </div>`;
      this.el.querySelectorAll<HTMLButtonElement>('[data-skin]').forEach((b) => b.addEventListener('click', () => {
        equip(b.dataset.skin!);
        render();
      }));
      this.el.querySelector('[data-done]')!.addEventListener('click', () => { this.el.classList.add('hidden'); onClose(); });
    };
    render();
    this.el.classList.remove('hidden');
  }

  close(): void { this.el.classList.add('hidden'); }

  /** A pop-up in the corner: achievement unlocked, and the skin it gives. */
  notify(a: Achievement): void {
    const skin = SKINS.find((s) => s.id === a.skin);
    const pop = document.createElement('div');
    pop.className = 'gr-pop out';
    pop.innerHTML = `<small>ACHIEVEMENT UNLOCKED</small><b>${a.name}</b><span>${a.desc}${skin ? ` · new skin: <b style="display:inline;font-size:13px;color:${skin.colors?.body ?? '#fff'}">${skin.name}</b>` : ''}</span>`;
    // Stack under any pop-ups already showing.
    const showing = document.querySelectorAll('.gr-pop').length;
    pop.style.top = `${22 + showing * 96}px`;
    document.body.append(pop);
    setTimeout(() => pop.classList.remove('out'), 20);
    setTimeout(() => { pop.classList.add('out'); setTimeout(() => pop.remove(), 450); }, 4500);
  }
}

function ordinal(n: number): string { return ['1ST', '2ND', '3RD'][n - 1] ?? `${n}TH`; }
