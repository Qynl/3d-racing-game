export class AudioEngine {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private osc3: OscillatorNode | null = null;
  private windGain: GainNode | null = null;
  private skidGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private started = false;
  private rpmSmooth = 0;

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.7;
    master.connect(ctx.destination);
    this.master = master;

    // noise buffer
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    this.noiseBuffer = buf;

    // engine
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 600;
    filter.Q.value = 1.2;
    engineGain.connect(filter);
    filter.connect(master);
    this.engineGain = engineGain;
    this.engineFilter = filter;

    const o1 = ctx.createOscillator();
    o1.type = "sawtooth";
    o1.frequency.value = 60;
    const g1 = ctx.createGain();
    g1.gain.value = 0.5;
    o1.connect(g1).connect(engineGain);
    const o2 = ctx.createOscillator();
    o2.type = "square";
    o2.frequency.value = 30;
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    o2.connect(g2).connect(engineGain);
    const o3 = ctx.createOscillator();
    o3.type = "triangle";
    o3.frequency.value = 120;
    const g3 = ctx.createGain();
    g3.gain.value = 0.35;
    o3.connect(g3).connect(engineGain);
    o1.start();
    o2.start();
    o3.start();
    this.osc1 = o1;
    this.osc2 = o2;
    this.osc3 = o3;

    // wind
    const wind = ctx.createBufferSource();
    wind.buffer = buf;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.value = 500;
    windFilter.Q.value = 0.6;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    wind.connect(windFilter).connect(windGain).connect(master);
    wind.start();
    this.windGain = windGain;

    // skid
    const skid = ctx.createBufferSource();
    skid.buffer = buf;
    skid.loop = true;
    skid.playbackRate.value = 1.6;
    const skidFilter = ctx.createBiquadFilter();
    skidFilter.type = "highpass";
    skidFilter.frequency.value = 1800;
    const skidGain = ctx.createGain();
    skidGain.gain.value = 0;
    skid.connect(skidFilter).connect(skidGain).connect(master);
    skid.start();
    this.skidGain = skidGain;
    this.started = true;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
    }
  }

  /** speed in units/s, throttle 0..1 */
  updateEngine(speed: number, throttle: number, skid: number, dt: number, active: boolean) {
    if (!this.started || !this.ctx) return;
    const t = this.ctx.currentTime;
    const sp = Math.abs(speed);
    // simple gearbox
    const gears = [0, 11, 21, 32, 44, 60];
    let gear = 0;
    for (let i = 0; i < gears.length - 1; i++) if (sp >= gears[i]) gear = i;
    const lo = gears[gear];
    const hi = gears[gear + 1];
    const ratio = (sp - lo) / (hi - lo);
    const targetRpm = active ? 0.15 + ratio * 0.85 * (0.6 + 0.4 * throttle) + throttle * 0.12 : 0;
    this.rpmSmooth += (targetRpm - this.rpmSmooth) * Math.min(1, dt * 6);
    const rpm = this.rpmSmooth;
    const f = 42 + rpm * 150;
    this.osc1!.frequency.setTargetAtTime(f, t, 0.03);
    this.osc2!.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    this.osc3!.frequency.setTargetAtTime(f * 2.01, t, 0.03);
    this.engineFilter!.frequency.setTargetAtTime(300 + rpm * 1400 + throttle * 400, t, 0.05);
    const vol = active ? 0.05 + rpm * 0.08 + throttle * 0.05 : 0;
    this.engineGain!.gain.setTargetAtTime(vol, t, 0.05);
    const windV = active ? Math.min(1, (sp / 55) * (sp / 55)) * 0.25 : 0;
    this.windGain!.gain.setTargetAtTime(windV, t, 0.1);
    this.skidGain!.gain.setTargetAtTime(active ? Math.min(0.22, skid) : 0, t, 0.05);
  }

  beep(freq: number, dur: number, vol = 0.25, type: OscillatorType = "sine") {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  countdownTick() {
    this.beep(660, 0.18, 0.2, "triangle");
  }
  countdownGo() {
    this.beep(990, 0.6, 0.25, "triangle");
    this.beep(1320, 0.5, 0.12, "sine");
  }
  lapChime() {
    this.beep(880, 0.15, 0.15, "sine");
    setTimeout(() => this.beep(1174, 0.25, 0.15, "sine"), 110);
  }
  finishFanfare() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => setTimeout(() => this.beep(n, 0.35, 0.2, "triangle"), i * 130));
    setTimeout(() => this.beep(1318, 0.9, 0.22, "triangle"), 560);
  }
  impact(strength: number) {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const s = Math.min(1, strength / 25);
    if (s < 0.08) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.7;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5 * s, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.3);
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.2);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.4 * s, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(og).connect(this.master);
    o.start(t);
    o.stop(t + 0.25);
  }

  dispose() {
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
      this.started = false;
    }
  }
}
