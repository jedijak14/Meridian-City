import { settings } from './util';

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class GameAudio {
  ctx?: AudioContext;
  master!: GainNode;
  sfx!: GainNode;
  music!: GainNode;
  noiseBuf!: AudioBuffer;
  eng?: { o1: OscillatorNode; o2: OscillatorNode; g: GainNode; f: BiquadFilterNode };
  sir?: { o: OscillatorNode; g: GainNode };
  radioOn = false;
  private timer: any = null;
  private step = 0;
  private nextT = 0;
  private bpm = 104;

  init() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    try {
      const C: any = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new C();
    } catch {
      return;
    }
    const c = this.ctx!;
    this.master = c.createGain();
    this.master.gain.value = settings.volume;
    this.master.connect(c.destination);
    this.sfx = c.createGain();
    this.sfx.connect(this.master);
    this.music = c.createGain();
    this.music.gain.value = 0.35;
    this.music.connect(this.master);
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // engine
    const o1 = c.createOscillator();
    o1.type = 'sawtooth';
    const o2 = c.createOscillator();
    o2.type = 'square';
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 400;
    const g = c.createGain();
    g.gain.value = 0;
    o1.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(this.sfx);
    o1.start();
    o2.start();
    this.eng = { o1, o2, g, f };
    const so = c.createOscillator();
    so.type = 'triangle';
    const sg = c.createGain();
    sg.gain.value = 0;
    so.connect(sg);
    sg.connect(this.sfx);
    so.start();
    this.sir = { o: so, g: sg };
  }
  setVolume(v: number) {
    if (this.master) this.master.gain.value = v;
  }
  private noise(dur: number, f0: number, f1: number, gain: number, type: BiquadFilterType = 'lowpass', q = 1, vol = 1) {
    if (!this.ctx || vol < 0.02) return;
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, c.currentTime);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), c.currentTime + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain * vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0008, c.currentTime + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.sfx);
    s.start(c.currentTime, Math.random());
    s.stop(c.currentTime + dur + 0.05);
  }
  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, vol = 1) {
    if (!this.ctx || vol < 0.02) return;
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), c.currentTime + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain * vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0008, c.currentTime + dur);
    o.connect(g);
    g.connect(this.sfx);
    o.start();
    o.stop(c.currentTime + dur + 0.05);
  }
  gun(kind: string, vol = 1) {
    switch (kind) {
      case 'pistol':
        this.noise(0.14, 4500, 400, 0.5, 'lowpass', 1, vol);
        this.tone('square', 260, 60, 0.08, 0.2, vol);
        break;
      case 'magnum':
        this.noise(0.3, 3500, 200, 0.8, 'lowpass', 1, vol);
        this.tone('sawtooth', 180, 40, 0.18, 0.35, vol);
        break;
      case 'smg':
        this.noise(0.09, 6000, 600, 0.35, 'bandpass', 0.8, vol);
        this.tone('square', 320, 90, 0.05, 0.12, vol);
        break;
      case 'rifle':
        this.noise(0.18, 5000, 300, 0.55, 'lowpass', 1, vol);
        this.tone('sawtooth', 200, 50, 0.1, 0.25, vol);
        break;
      case 'shotgun':
        this.noise(0.35, 3000, 150, 0.9, 'lowpass', 1, vol);
        this.tone('sawtooth', 120, 30, 0.2, 0.4, vol);
        break;
      case 'sniper':
        this.noise(0.55, 5000, 100, 0.9, 'lowpass', 1, vol);
        this.tone('sawtooth', 300, 25, 0.35, 0.4, vol);
        break;
      case 'rocket':
        this.noise(0.6, 2000, 200, 0.6, 'bandpass', 0.6, vol);
        break;
      case 'flame':
        this.noise(0.12, 1200, 600, 0.25, 'bandpass', 0.5, vol);
        break;
      case 'melee':
        this.noise(0.12, 1800, 300, 0.25, 'bandpass', 1, vol);
        break;
      case 'empty':
        this.tone('square', 900, 700, 0.03, 0.1, vol);
        break;
      case 'reload':
        this.tone('square', 500, 300, 0.05, 0.1, vol);
        setTimeout(() => this.tone('square', 700, 400, 0.05, 0.1, vol), 220);
        break;
    }
  }
  explosion(vol = 1) {
    this.noise(1.6, 1800, 40, 1.4, 'lowpass', 1, vol);
    this.tone('sine', 90, 20, 1.0, 0.9, vol);
  }
  thud(vol = 1) {
    this.noise(0.18, 900, 80, 0.5, 'lowpass', 1, vol);
    this.tone('sine', 110, 40, 0.15, 0.35, vol);
  }
  crash(vol = 1) {
    this.noise(0.5, 3500, 200, 0.7, 'bandpass', 0.5, vol);
    this.tone('square', 90, 50, 0.2, 0.25, vol);
  }
  hit(vol = 1) {
    this.noise(0.08, 2500, 500, 0.3, 'bandpass', 1, vol);
  }
  ui() {
    this.tone('triangle', 660, 880, 0.08, 0.18);
  }
  success() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone('triangle', f, f, 0.25, 0.2), i * 110));
  }
  fail() {
    [330, 262, 196].forEach((f, i) => setTimeout(() => this.tone('sawtooth', f, f * 0.95, 0.35, 0.18), i * 170));
  }
  horn(vol = 1) {
    this.tone('square', 410, 405, 0.35, 0.12, vol);
    this.tone('square', 520, 515, 0.35, 0.1, vol);
  }
  engine(rpm: number, load: number, vol: number) {
    if (!this.eng || !this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 38 + rpm * 120;
    this.eng.o1.frequency.setTargetAtTime(f, t, 0.05);
    this.eng.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.eng.f.frequency.setTargetAtTime(250 + rpm * 900 + load * 500, t, 0.05);
    this.eng.g.gain.setTargetAtTime(vol * (0.05 + load * 0.08 + rpm * 0.04), t, 0.08);
  }
  siren(vol: number, time: number) {
    if (!this.sir || !this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 760 + Math.sin(time * 5.5) * 260;
    this.sir.o.frequency.setTargetAtTime(f, t, 0.03);
    this.sir.g.gain.setTargetAtTime(vol * 0.045, t, 0.1);
  }
  // ---- generative radio / menu music ----
  startMusic(bpm = 104) {
    if (!this.ctx || this.radioOn) return;
    this.radioOn = true;
    this.bpm = bpm;
    this.step = 0;
    this.nextT = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.sched(), 40);
  }
  stopMusic() {
    this.radioOn = false;
    clearInterval(this.timer);
  }
  private sched() {
    const c = this.ctx!;
    while (this.nextT < c.currentTime + 0.2) {
      this.playStep(this.step, this.nextT);
      this.nextT += 60 / this.bpm / 4;
      this.step++;
    }
  }
  private note(type: OscillatorType, m: number, t: number, dur: number, g: number, cutoff = 2000) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = mtof(m);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const e = c.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(g, t + 0.01);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    f.connect(e);
    e.connect(this.music);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  private playStep(s: number, t: number) {
    const c = this.ctx!;
    const bar = Math.floor(s / 16) % 4;
    const roots = [57, 53, 60, 55];
    const root = roots[bar];
    const minor = bar === 0 || bar === 1 ? [0, 3, 7] : [0, 4, 7];
    const i = s % 16;
    const beat = 60 / this.bpm;
    if (i % 2 === 0) this.note('sawtooth', root - 12 + (i % 8 === 6 ? 7 : 0), t, beat * 0.4, 0.22, 500);
    const arp = [0, 1, 2, 1, 2, 1, 0, 2][i % 8];
    this.note('square', root + 12 + minor[arp % 3] + (i >= 8 ? 12 : 0), t, beat * 0.22, 0.05, 2600);
    if (i === 0) minor.forEach((m) => this.note('triangle', root + m, t, beat * 3.6, 0.07, 1200));
    if (i % 4 === 0) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(g);
      g.connect(this.music);
      o.start(t);
      o.stop(t + 0.22);
    }
    if (i === 4 || i === 12 || (bar === 3 && i === 14)) this.nz(t, 0.14, 0.25, 1800);
    if (i % 2 === 1) this.nz(t, 0.04, 0.08, 7000);
  }
  private nz(t: number, dur: number, g: number, hp: number) {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const e = c.createGain();
    e.gain.setValueAtTime(g, t);
    e.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f);
    f.connect(e);
    e.connect(this.music);
    s.start(t, Math.random());
    s.stop(t + dur + 0.02);
  }
}
