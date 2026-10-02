/**
 * All audio is synthesised at runtime — there is not a single sample file in
 * this project. Three buses: master -> {sfx, music}, plus per-car engine voices
 * (the player's is centred, rivals are positional).
 */

interface EngineVoice {
  gain: GainNode;
  filter: BiquadFilterNode;
  osc: OscillatorNode[];
  panner: PannerNode | null;
  rpm: number;
  gear: number;
}

const GEARS = [0, 11, 21, 32, 44, 60, 78];

function makeNoiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  return buf;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private voices: EngineVoice[] = [];
  private windGain: GainNode | null = null;
  private skidGain: GainNode | null = null;
  private boostGain: GainNode | null = null;
  private boostFilter: BiquadFilterNode | null = null;

  private muted = false;
  private masterVolume = 0.8;
  private musicVolume = 0.45;
  private started = false;

  // music scheduler
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private musicActive = false;
  private intensity = 0;

  // ---------------------------------------------------------------- lifecycle

  init(): boolean {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return true;
    }
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    let ctx: AudioContext;
    try {
      ctx = new AC();
    } catch {
      return false;
    }
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 24;
    comp.ratio.value = 7;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    comp.connect(ctx.destination);

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.masterVolume;
    master.connect(comp);
    this.master = master;

    const sfx = ctx.createGain();
    sfx.gain.value = 0.9;
    sfx.connect(master);
    this.sfxBus = sfx;

    const music = ctx.createGain();
    music.gain.value = this.musicVolume;
    music.connect(master);
    this.musicBus = music;

    this.noiseBuffer = makeNoiseBuffer(ctx);

    // --- wind
    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuffer;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.value = 500;
    windFilter.Q.value = 0.6;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    wind.connect(windFilter).connect(windGain).connect(sfx);
    wind.start();
    this.windGain = windGain;

    // --- skid
    const skid = ctx.createBufferSource();
    skid.buffer = this.noiseBuffer;
    skid.loop = true;
    skid.playbackRate.value = 1.6;
    const skidFilter = ctx.createBiquadFilter();
    skidFilter.type = "highpass";
    skidFilter.frequency.value = 1800;
    const skidGain = ctx.createGain();
    skidGain.gain.value = 0;
    skid.connect(skidFilter).connect(skidGain).connect(sfx);
    skid.start();
    this.skidGain = skidGain;

    // --- boost roar (continuous, gated by gain)
    const boost = ctx.createBufferSource();
    boost.buffer = this.noiseBuffer;
    boost.loop = true;
    boost.playbackRate.value = 0.9;
    const bFilter = ctx.createBiquadFilter();
    bFilter.type = "bandpass";
    bFilter.frequency.value = 900;
    bFilter.Q.value = 0.8;
    const bGain = ctx.createGain();
    bGain.gain.value = 0;
    boost.connect(bFilter).connect(bGain).connect(sfx);
    boost.start();
    this.boostGain = bGain;
    this.boostFilter = bFilter;

    this.started = true;
    return true;
  }

  get ready(): boolean {
    return this.started && !!this.ctx;
  }

  resume() {
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  suspend() {
    if (this.ctx && this.ctx.state === "running") void this.ctx.suspend();
  }

  setVolumes(master: number, music: number, muted: boolean) {
    this.masterVolume = master;
    this.musicVolume = music;
    this.muted = muted;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master?.gain.setTargetAtTime(muted ? 0 : master, t, 0.05);
    this.musicBus?.gain.setTargetAtTime(music, t, 0.08);
  }

  setMuted(m: boolean) {
    this.setVolumes(this.masterVolume, this.musicVolume, m);
  }

  // ---------------------------------------------------------------- engines

  /** (Re)build engine voices: index 0 is the player (centred, no panner). */
  configureEngines(count: number) {
    if (!this.ctx || !this.sfxBus) return;
    for (const v of this.voices) {
      for (const o of v.osc) {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
        o.disconnect();
      }
      v.gain.disconnect();
      v.filter.disconnect();
      v.panner?.disconnect();
    }
    this.voices = [];
    const ctx = this.ctx;
    for (let i = 0; i < count; i++) {
      const isPlayer = i === 0;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 600;
      filter.Q.value = isPlayer ? 1.2 : 0.8;
      gain.connect(filter);
      let panner: PannerNode | null = null;
      if (isPlayer) {
        filter.connect(this.sfxBus);
      } else {
        panner = ctx.createPanner();
        panner.panningModel = "equalpower";
        panner.distanceModel = "inverse";
        panner.refDistance = 8;
        panner.maxDistance = 180;
        panner.rolloffFactor = 1.4;
        filter.connect(panner).connect(this.sfxBus);
      }
      const osc: OscillatorNode[] = [];
      const specs: [OscillatorType, number, number][] = isPlayer
        ? [
            ["sawtooth", 1, 0.5],
            ["square", 0.5, 0.25],
            ["triangle", 2.01, 0.35],
          ]
        : [
            ["sawtooth", 1, 0.42],
            ["square", 0.5, 0.2],
          ];
      for (const [type, , amp] of specs) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = 60;
        const g = ctx.createGain();
        g.gain.value = amp;
        o.connect(g).connect(gain);
        o.start();
        osc.push(o);
      }
      this.voices.push({ gain, filter, osc, panner, rpm: 0, gear: 1 });
    }
  }

  /** Returns the current gear so the HUD can show it. */
  updateEngine(
    index: number,
    speed: number,
    throttle: number,
    dt: number,
    active: boolean,
    boosting = false,
  ): { gear: number; rpm: number } {
    const v = this.voices[index];
    if (!this.started || !this.ctx || !v) return { gear: 1, rpm: 0 };
    const t = this.ctx.currentTime;
    const sp = Math.abs(speed);
    let gear = 0;
    for (let i = 0; i < GEARS.length - 1; i++) if (sp >= GEARS[i]) gear = i;
    const lo = GEARS[gear];
    const hi = GEARS[gear + 1];
    const ratio = (sp - lo) / (hi - lo);
    const targetRpm = active ? 0.15 + ratio * 0.85 * (0.6 + 0.4 * throttle) + throttle * 0.12 : 0;
    v.rpm += (targetRpm - v.rpm) * Math.min(1, dt * 6);
    const rpm = v.rpm;
    const f = 42 + rpm * 150 + (boosting ? 22 : 0);
    v.osc[0].frequency.setTargetAtTime(f, t, 0.03);
    if (v.osc[1]) v.osc[1].frequency.setTargetAtTime(f * 0.5, t, 0.03);
    if (v.osc[2]) v.osc[2].frequency.setTargetAtTime(f * 2.01, t, 0.03);
    v.filter.frequency.setTargetAtTime(300 + rpm * 1400 + throttle * 400, t, 0.05);
    const isPlayer = index === 0;
    const base = isPlayer ? 0.05 : 0.035;
    const vol = active ? base + rpm * (isPlayer ? 0.08 : 0.06) + throttle * 0.05 : 0;
    v.gain.gain.setTargetAtTime(vol, t, 0.05);
    const prevGear = v.gear;
    v.gear = gear + 1;
    if (isPlayer && v.gear !== prevGear && active && sp > 4) {
      if (v.gear > prevGear) this.shiftBlip();
    }
    return { gear: v.gear, rpm };
  }

  setEnginePosition(index: number, x: number, y: number, z: number) {
    const v = this.voices[index];
    if (!v?.panner || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (v.panner.positionX) {
      v.panner.positionX.setTargetAtTime(x, t, 0.02);
      v.panner.positionY.setTargetAtTime(y, t, 0.02);
      v.panner.positionZ.setTargetAtTime(z, t, 0.02);
    } else {
      (v.panner as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(x, y, z);
    }
  }

  setListener(
    px: number,
    py: number,
    pz: number,
    fx: number,
    fy: number,
    fz: number,
    ux: number,
    uy: number,
    uz: number,
  ) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(px, t, 0.02);
      l.positionY.setTargetAtTime(py, t, 0.02);
      l.positionZ.setTargetAtTime(pz, t, 0.02);
      l.forwardX.setTargetAtTime(fx, t, 0.02);
      l.forwardY.setTargetAtTime(fy, t, 0.02);
      l.forwardZ.setTargetAtTime(fz, t, 0.02);
      l.upX.setTargetAtTime(ux, t, 0.05);
      l.upY.setTargetAtTime(uy, t, 0.05);
      l.upZ.setTargetAtTime(uz, t, 0.05);
    } else {
      const legacy = l as unknown as {
        setPosition(x: number, y: number, z: number): void;
        setOrientation(x: number, y: number, z: number, ux: number, uy: number, uz: number): void;
      };
      legacy.setPosition(px, py, pz);
      legacy.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  updateAmbience(speed: number, skid: number, boosting: boolean, active: boolean) {
    if (!this.started || !this.ctx) return;
    const t = this.ctx.currentTime;
    const sp = Math.abs(speed);
    const windV = active ? Math.min(1, (sp / 55) * (sp / 55)) * 0.25 : 0;
    this.windGain?.gain.setTargetAtTime(windV, t, 0.1);
    this.skidGain?.gain.setTargetAtTime(active ? Math.min(0.22, skid) : 0, t, 0.05);
    this.boostGain?.gain.setTargetAtTime(active && boosting ? 0.13 : 0, t, 0.08);
    if (this.boostFilter) {
      this.boostFilter.frequency.setTargetAtTime(700 + sp * 18, t, 0.1);
    }
  }

  silenceEngines() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const v of this.voices) v.gain.gain.setTargetAtTime(0, t, 0.08);
    this.windGain?.gain.setTargetAtTime(0, t, 0.1);
    this.skidGain?.gain.setTargetAtTime(0, t, 0.08);
    this.boostGain?.gain.setTargetAtTime(0, t, 0.08);
  }

  // ---------------------------------------------------------------- one-shots

  private beep(freq: number, dur: number, vol = 0.25, type: OscillatorType = "sine", when = 0) {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus);
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
  shiftBlip() {
    this.beep(320, 0.05, 0.05, "square");
  }
  lapChime() {
    this.beep(880, 0.15, 0.15, "sine");
    this.beep(1174, 0.25, 0.15, "sine", 0.11);
  }
  recordChime() {
    [784, 1046, 1318, 1568].forEach((n, i) => this.beep(n, 0.3, 0.16, "triangle", i * 0.08));
  }
  badChime() {
    this.beep(220, 0.18, 0.16, "sawtooth");
    this.beep(165, 0.3, 0.14, "sawtooth", 0.1);
  }
  boostPickup() {
    this.beep(520, 0.1, 0.1, "square");
    this.beep(780, 0.16, 0.1, "square", 0.06);
  }
  finishFanfare() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => this.beep(n, 0.35, 0.2, "triangle", i * 0.13));
    this.beep(1318, 0.9, 0.22, "triangle", 0.56);
  }

  noiseBurst(dur: number, vol: number, rate: number, filter: "lowpass" | "highpass", freq: number) {
    if (!this.ctx || !this.sfxBus || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = rate;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  impact(strength: number) {
    if (!this.ctx || !this.sfxBus) return;
    const s = Math.min(1, strength / 25);
    if (s < 0.08) return;
    this.noiseBurst(0.25, 0.5 * s, 0.7, "lowpass", 900);
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.2);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.4 * s, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(og).connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.25);
  }

  landing(strength: number) {
    const s = Math.min(1, strength / 18);
    if (s < 0.12) return;
    this.noiseBurst(0.22, 0.35 * s, 0.5, "lowpass", 420);
    this.beep(70, 0.18, 0.22 * s, "sine");
  }

  boostStart() {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(680, t + 0.34);
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 3;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(2200, t + 0.34);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    o.connect(f).connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.45);
    this.noiseBurst(0.3, 0.18, 1.4, "highpass", 1200);
  }

  // ---------------------------------------------------------------- music

  /** 0 = menu bed, 1 = full race intensity. */
  setMusicIntensity(v: number) {
    this.intensity = Math.max(0, Math.min(1, v));
  }

  startMusic() {
    if (!this.ctx || this.musicActive) return;
    this.musicActive = true;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 90);
  }

  stopMusic() {
    this.musicActive = false;
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private scheduleMusic() {
    const ctx = this.ctx;
    const bus = this.musicBus;
    if (!ctx || !bus || !this.musicActive) return;
    const bpm = 96 + this.intensity * 20;
    const stepDur = 60 / bpm / 2; // eighth notes
    while (this.nextNoteTime < ctx.currentTime + 0.35) {
      this.playStep(this.step, this.nextNoteTime, bus, ctx);
      this.nextNoteTime += stepDur;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(step: number, time: number, bus: GainNode, ctx: AudioContext) {
    // D natural minor-ish desert scale
    const root = 73.42; // D2
    const scale = [0, 2, 3, 5, 7, 8, 10];
    const bar = Math.floor(step / 8) % 8;
    const beat = step % 8;
    const chordRoots = [0, 0, 5, 5, 3, 3, 7, 5];
    const chord = chordRoots[bar];
    const intensity = this.intensity;

    // --- bass on 1 and the "and" of 3
    if (beat === 0 || beat === 5) {
      const f = root * Math.pow(2, chord / 12);
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(260 + intensity * 500, time);
      lp.Q.value = 4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(0.3, time + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.42);
      o.connect(lp).connect(g).connect(bus);
      o.start(time);
      o.stop(time + 0.5);
    }

    // --- pad swell at the top of each bar
    if (beat === 0 && bar % 2 === 0) {
      for (const semi of [0, 7, 12]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.detune.value = (Math.random() - 0.5) * 14;
        o.frequency.value = root * 2 * Math.pow(2, (chord + semi) / 12);
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 900 + intensity * 800;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, time);
        g.gain.linearRampToValueAtTime(0.045 + intensity * 0.02, time + 0.5);
        g.gain.linearRampToValueAtTime(0.0001, time + 2.4);
        o.connect(lp).connect(g).connect(bus);
        o.start(time);
        o.stop(time + 2.5);
      }
    }

    // --- plucked lead, denser as the race heats up
    const leadPattern = [1, 0, 1, 0, 0, 1, 0, 1];
    if (leadPattern[beat] && Math.random() < 0.45 + intensity * 0.45) {
      const degree = scale[(bar * 2 + beat) % scale.length];
      const oct = beat > 4 ? 4 : 3;
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = root * Math.pow(2, oct - 1) * Math.pow(2, (chord + degree) / 12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(0.075 + intensity * 0.03, time + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.26);
      o.connect(g).connect(bus);
      o.start(time);
      o.stop(time + 0.3);
    }

    // --- shaker / kick
    if (this.noiseBuffer && intensity > 0.08) {
      if (beat % 2 === 0) {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        src.playbackRate.value = 3.2;
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 5200;
        const g = ctx.createGain();
        const amp = (beat === 0 ? 0.05 : 0.026) * intensity;
        g.gain.setValueAtTime(amp, time);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.07);
        src.connect(hp).connect(g).connect(bus);
        src.start(time);
        src.stop(time + 0.1);
      }
      if (beat === 0 || beat === 6) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(110, time);
        o.frequency.exponentialRampToValueAtTime(45, time + 0.1);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.16 * intensity, time);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
        o.connect(g).connect(bus);
        o.start(time);
        o.stop(time + 0.2);
      }
    }
  }

  // ---------------------------------------------------------------- teardown

  dispose() {
    this.stopMusic();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.started = false;
      this.voices = [];
    }
  }
}
