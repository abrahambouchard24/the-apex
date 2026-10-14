// Music: two loops synthesized live with Web Audio, scheduled a little ahead on a 16th-note grid.
//   menu: chill house, 118 BPM in A minor (soft kick, offbeat hats, warm pads, Rhodes-ish stabs)
//   race: deep / nu-disco house, 122 BPM in F# minor (pumping pads, octave bass, filtered arp)
// Everything goes through a shared reverb and delay, and a low-pass that muffles it on pause.

export type SongName = 'menu' | 'race';

interface Song {
  bpm: number;
  /** One chord per bar, cycled: pad voicing (MIDI) and bass root (MIDI). */
  chords: { pad: number[]; bass: number }[];
  kick: number[];          // 16th steps in the bar
  clap: number[];
  openHat: number[];
  closedHat: number[];
  shaker: boolean;
  bass: [step: number, octave: number, length: number][];
  stabs: [step: number, length: number][];
  arp: boolean;
  padCutoff: number;       // Hz, the pad's low-pass
  duck: number;            // how far pads/bass dip under each kick (0..1)
  kickLevel: number;
}

export const SONGS: Record<SongName, Song> = {
  menu: {
    bpm: 118,
    chords: [
      { pad: [57, 60, 64, 67, 71], bass: 45 },  // Am9
      { pad: [53, 57, 60, 64, 67], bass: 41 },  // Fmaj9
      { pad: [55, 59, 62, 64, 67], bass: 48 },  // C6/9
      { pad: [55, 59, 62, 64, 69], bass: 43 },  // G6/9
    ],
    kick: [0, 4, 8, 12],
    clap: [4, 12],
    openHat: [2, 6, 10, 14],
    closedHat: [],
    shaker: false,
    bass: [[2, 0, 1.5], [6, 0, 1.5], [10, 0, 1.5], [13, 1, 0.8], [14, 0, 1.5]],
    stabs: [[0, 2], [3, 1], [10, 1.5]],
    arp: false,
    padCutoff: 1400,
    duck: 0.55,
    kickLevel: 0.55,
  },
  race: {
    bpm: 122,
    chords: [
      { pad: [57, 61, 64, 68], bass: 42 },      // F#m9
      { pad: [54, 57, 61, 64], bass: 38 },      // Dmaj9
      { pad: [57, 61, 62, 66], bass: 35 },      // Bm9
      { pad: [56, 59, 61, 64], bass: 37 },      // C#m7
    ],
    kick: [0, 4, 8, 12],
    clap: [4, 12],
    openHat: [],
    closedHat: [2, 6, 10, 14],
    shaker: true,
    bass: [[0, 0, 1], [2, 1, 1], [4, 0, 1], [6, 1, 1], [8, 0, 1], [10, 1, 1], [12, 0, 1], [14, 1, 1]],
    stabs: [],
    arp: true,
    padCutoff: 900,
    duck: 0.75,
    kickLevel: 0.8,
  },
};

const LOOKAHEAD = 0.15;    // s of audio scheduled ahead of the clock
const TICK_MS = 25;
const MUSIC_LEVEL = 0.32;  // music under the sound effects

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  private out: GainNode;         // fades between songs
  private muffle: BiquadFilterNode;
  private padBus: GainNode;      // ducked by the kick (sidechain pump)
  private reverb: ConvolverNode;
  private delay: DelayNode;
  private noise: AudioBuffer;
  private song: SongName | null = null;
  private step = 0;              // 16th steps since the song started
  private nextTime = 0;
  private timer: number | null = null;

  constructor(private ctx: AudioContext, destination: AudioNode, noise: AudioBuffer) {
    this.noise = noise;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.out.connect(this.muffle).connect(destination);

    this.padBus = ctx.createGain();
    this.padBus.connect(this.out);

    // Reverb: a convolver fed a 2.6 s decaying stereo noise burst.
    this.reverb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    this.reverb.buffer = ir;
    const revGain = ctx.createGain();
    revGain.gain.value = 0.35;
    this.reverb.connect(revGain).connect(this.out);

    // Delay: dotted-eighth echoes with feedback, darkened a little each repeat.
    this.delay = ctx.createDelay(2);
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const dark = ctx.createBiquadFilter();
    dark.type = 'lowpass';
    dark.frequency.value = 2500;
    this.delay.connect(dark).connect(fb).connect(this.delay);
    const delayOut = ctx.createGain();
    delayOut.gain.value = 0.3;
    dark.connect(delayOut).connect(this.out);
  }

  /** Switch songs (or stop with null), crossfading through a short dip. */
  play(name: SongName | null): void {
    if (name === this.song) return;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0, t, 0.25);
    const start = () => {
      this.song = name;
      if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
      if (!name) return;
      const s = SONGS[name];
      this.delay.delayTime.value = (60 / s.bpm) * 0.75;  // dotted eighth
      this.step = 0;
      this.nextTime = this.ctx.currentTime + 0.05;
      const now = this.ctx.currentTime;
      this.out.gain.cancelScheduledValues(now);
      this.out.gain.setValueAtTime(0, now);
      this.out.gain.linearRampToValueAtTime(MUSIC_LEVEL, now + 2);
      this.timer = window.setInterval(() => this.schedule(), TICK_MS);
    };
    if (this.song) window.setTimeout(start, 700); else start();
  }

  /** Pause menu: muffle the music as if heard through a door. */
  setMuffled(on: boolean): void {
    this.muffle.frequency.setTargetAtTime(on ? 550 : 20000, this.ctx.currentTime, 0.15);
  }

  private schedule(): void {
    if (!this.song) return;
    const s = SONGS[this.song];
    const stepLen = 60 / s.bpm / 4;
    // After a long stall (a hidden tab), skip ahead rather than playing a burst of old notes.
    if (this.nextTime < this.ctx.currentTime - 0.2) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      this.playStep(s, this.step, this.nextTime, stepLen);
      this.step++;
      this.nextTime += stepLen;
    }
  }

  private playStep(s: Song, step: number, t: number, stepLen: number): void {
    const inBar = step % 16;
    const bar = Math.floor(step / 16);
    const chord = s.chords[bar % s.chords.length];
    const phrase = bar % 16;                         // 16-bar arrangement cycle
    const intro = bar < 2;                           // first two bars: no drums yet
    const breakdown = phrase % 8 === 7 && inBar >= 8; // last half-bar of every 8: drop the kick
    const swing = inBar % 2 === 1 ? stepLen * 0.08 : 0;

    if (inBar === 0) this.pad(t, chord.pad, stepLen * 16, s.padCutoff);
    if (!intro && !breakdown && s.kick.includes(inBar)) this.kick(t, s);
    if (!intro && s.clap.includes(inBar)) this.clap(t);
    if (!intro && s.openHat.includes(inBar)) this.hat(t + swing, true);
    if (!intro && s.closedHat.includes(inBar)) this.hat(t + swing, false);
    if (!intro && s.shaker) this.shaker(t + swing, inBar % 4 === 2 ? 1 : 0.55);
    for (const [st, oct, len] of s.bass) {
      if (st === inBar && !(intro && s.arp)) this.bass(t, chord.bass + oct * 12, len * stepLen);
    }
    for (const [st, len] of s.stabs) if (st === inBar) this.keys(t + swing, chord.pad, len * stepLen);
    if (s.arp && phrase >= 4) {
      // 16th arpeggio through the chord, two octaves up; the filter breathes over 8 bars.
      const order = [0, 1, 2, 3, 2, 1, 3, 2];
      const note = chord.pad[order[inBar % 8] % chord.pad.length] + 12 + (inBar >= 8 ? 12 : 0) * (phrase % 2);
      const sweep = 0.5 - 0.5 * Math.cos(((step % 128) / 128) * Math.PI * 2);
      this.arp(t + swing, note, 500 + sweep * 2600);
    }
    if (phrase % 8 === 7 && inBar === 0) this.riser(t, stepLen * 16);
  }

  // --- instruments ----------------------------------------------------------------------------

  private kick(t: number, s: Song): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    const g = ctx.createGain();
    g.gain.setValueAtTime(s.kickLevel, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    osc.connect(g).connect(this.out);
    osc.start(t);
    osc.stop(t + 0.4);
    // Sidechain pump: pads and bass duck under the kick and swell back.
    this.padBus.gain.setValueAtTime(1 - s.duck, t);
    this.padBus.gain.linearRampToValueAtTime(1, t + 0.24);
  }

  private clap(t: number): void {
    const ctx = this.ctx;
    const src = this.noiseAt(t, 0.25);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1500;
    band.Q.value = 0.8;
    const g = ctx.createGain();
    // Three quick slaps, then a short tail.
    g.gain.setValueAtTime(0, t);
    for (const k of [0, 0.012, 0.024]) {
      g.gain.setValueAtTime(0.22, t + k);
      g.gain.exponentialRampToValueAtTime(0.04, t + k + 0.01);
    }
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    src.connect(band).connect(g);
    g.connect(this.out);
    g.connect(this.reverb);
  }

  private hat(t: number, open: boolean): void {
    const ctx = this.ctx;
    const len = open ? 0.18 : 0.045;
    const src = this.noiseAt(t, len + 0.02);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = open ? 7000 : 8500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(open ? 0.09 : 0.07, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(hp).connect(g).connect(this.out);
  }

  private shaker(t: number, accent: number): void {
    const ctx = this.ctx;
    const src = this.noiseAt(t, 0.07);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 6500;
    band.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05 * accent, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    src.connect(band).connect(g).connect(this.out);
  }

  private bass(t: number, midi: number, len: number): void {
    const ctx = this.ctx;
    const f = midiHz(midi);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    lp.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.32, t + 0.01);
    g.gain.setTargetAtTime(0.2, t + 0.03, 0.08);
    g.gain.setTargetAtTime(0.0001, t + len * 0.9, 0.03);
    for (const [type, mult, level] of [['sine', 1, 1], ['triangle', 2, 0.35]] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = f * mult;
      const og = ctx.createGain();
      og.gain.value = level;
      osc.connect(og).connect(lp);
      osc.start(t);
      osc.stop(t + len + 0.2);
    }
    lp.connect(g).connect(this.padBus);
  }

  private pad(t: number, notes: number[], len: number, cutoff: number): void {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.7;
    // The filter opens a touch through the bar, then settles.
    lp.frequency.setValueAtTime(cutoff * 0.7, t);
    lp.frequency.linearRampToValueAtTime(cutoff * 1.25, t + len * 0.5);
    lp.frequency.linearRampToValueAtTime(cutoff, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.45);
    g.gain.setValueAtTime(0.05, t + len - 0.1);
    g.gain.linearRampToValueAtTime(0.0001, t + len + 0.6);
    for (const n of notes) {
      for (const detune of [-9, 8]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = midiHz(n);
        osc.detune.value = detune;
        osc.connect(lp);
        osc.start(t);
        osc.stop(t + len + 0.7);
      }
    }
    lp.connect(g);
    g.connect(this.padBus);
    g.connect(this.reverb);
  }

  /** Electric-piano-ish stab: sine with a bell-like overtone and a quick decay. */
  private keys(t: number, notes: number[], len: number): void {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.012, t + Math.max(0.25, len));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.25, len) + 0.4);
    for (const n of notes.slice(0, 4)) {
      for (const [mult, level] of [[1, 1], [3.01, 0.12]]) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = midiHz(n + 12) * mult;
        const og = ctx.createGain();
        og.gain.value = level;
        osc.connect(og).connect(g);
        osc.start(t);
        osc.stop(t + len + 0.7);
      }
    }
    g.connect(this.out);
    g.connect(this.delay);
    g.connect(this.reverb);
  }

  private arp(t: number, midi: number, cutoff: number): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = midiHz(midi);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 7;
    lp.frequency.setValueAtTime(cutoff, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff * 0.35), t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(lp).connect(g);
    g.connect(this.out);
    g.connect(this.delay);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  /** A filtered noise swell over a bar, leading into the next phrase. */
  private riser(t: number, len: number): void {
    const ctx = this.ctx;
    const src = this.noiseAt(t, len);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 2;
    band.frequency.setValueAtTime(400, t);
    band.frequency.exponentialRampToValueAtTime(6000, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + len);
    g.gain.linearRampToValueAtTime(0, t + len + 0.05);
    src.connect(band).connect(g);
    g.connect(this.out);
    g.connect(this.reverb);
  }

  private noiseAt(t: number, len: number): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.start(t, Math.random() * 0.5);
    src.stop(t + len);
    return src;
  }
}
