// Sound: everything is synthesized with Web Audio, so there are no sound files to load.
// The browser only allows audio after a click or key press, so nothing plays until unlock().

const MASTER_VOLUME = 0.5;

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private engineGain!: GainNode;
  private engineFilter!: BiquadFilterNode;
  private engineOscs: OscillatorNode[] = [];
  private scrapeGain!: GainNode;
  private noise!: AudioBuffer;
  muted = false;

  /** Create or resume the audio context. Call from a click or key handler. */
  unlock(): void {
    if (!this.ctx) this.build();
    void this.ctx!.resume();
  }

  /** Silence everything (menus and pause). */
  pause(): void { void this.ctx?.suspend(); }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : MASTER_VOLUME, this.ctx.currentTime, 0.02);
    return this.muted;
  }

  /**
   * Engine hum for the player's craft, set every step. Pitch climbs through each gear's rev band
   * and drops back on an upshift; the filter opens and the volume rises with thrust.
   */
  engine(gear: number, rev: number, thrust: number, speedFrac: number): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const freq = 52 + gear * 9 + rev * 80;
    this.engineOscs[0].frequency.setTargetAtTime(freq, t, 0.03);
    this.engineOscs[1].frequency.setTargetAtTime(freq * 0.5, t, 0.03);
    this.engineOscs[2].frequency.setTargetAtTime(freq * 2.01, t, 0.03);
    this.engineFilter.frequency.setTargetAtTime(350 + thrust * 1500 + rev * 700, t, 0.05);
    this.engineGain.gain.setTargetAtTime(0.05 + thrust * 0.07 + speedFrac * 0.04, t, 0.05);
  }

  /** Grinding against a wall: 0 = clear, 1 = pressed hard into it. Set every step. */
  scrape(level: number): void {
    if (!this.ctx) return;
    this.scrapeGain.gain.setTargetAtTime(Math.min(1, level) * 0.22, this.ctx.currentTime, level > 0 ? 0.02 : 0.08);
  }

  /** Air rushing as the gearbox shifts up. */
  whoosh(): void {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = this.noiseSource();
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.2;
    band.frequency.setValueAtTime(500, t);
    band.frequency.exponentialRampToValueAtTime(2800, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.28, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    src.connect(band).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.45);
  }

  /** A heavy hit on a wall or another car; impact is the closing speed in px/s. */
  thud(impact: number): void {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.min(0.5, impact / 600), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.32);
  }

  /** Countdown light: a short beep for 3-2-1, a long higher one for GO. */
  beep(go: boolean): void {
    this.tone(go ? 1320 : 660, go ? 0.55 : 0.16, 0.16);
  }

  /** Two rising notes on a completed lap; three for a best lap. */
  chime(best: boolean): void {
    const notes = best ? [784, 988, 1319] : [784, 1047];
    notes.forEach((f, i) => this.tone(f, 0.18, 0.1, i * 0.09));
  }

  private tone(freq: number, length: number, volume: number, delay = 0): void {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.01);
    g.gain.setValueAtTime(volume, t + length - 0.04);
    g.gain.linearRampToValueAtTime(0, t + length);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + length + 0.02);
  }

  private live(): AudioContext | null {
    return this.ctx && this.ctx.state === 'running' ? this.ctx : null;
  }

  private noiseSource(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    return src;
  }

  private build(): void {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
    this.master.connect(ctx.destination);

    // One second of white noise, reused by the scrape loop and the whooshes.
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Engine: a saw, a sub-octave square and a faint upper harmonic through a low-pass.
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.Q.value = 4;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter.connect(this.engineGain).connect(this.master);
    const parts: [OscillatorType, number][] = [['sawtooth', 0.6], ['square', 0.35], ['sawtooth', 0.12]];
    this.engineOscs = parts.map(([type, level]) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = 52;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(this.engineFilter);
      osc.start();
      return osc;
    });

    // Wall scrape: looping noise through a bright band-pass, silent until scrape() raises it.
    const scrapeBand = ctx.createBiquadFilter();
    scrapeBand.type = 'bandpass';
    scrapeBand.frequency.value = 2600;
    scrapeBand.Q.value = 0.9;
    this.scrapeGain = ctx.createGain();
    this.scrapeGain.gain.value = 0;
    const scrapeSrc = this.noiseSource();
    scrapeSrc.connect(scrapeBand).connect(this.scrapeGain).connect(this.master);
    scrapeSrc.start();
  }
}
