// Einfacher synthetischer Motorsound + Effekte über die WebAudio-API

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('tr_muted') === '1';
  }

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(c.destination);

    this.engine = c.createOscillator();
    this.engine.type = 'sawtooth';
    this.engine2 = c.createOscillator();
    this.engine2.type = 'square';
    this.filter = c.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 600;
    this.engineGain = c.createGain();
    this.engineGain.gain.value = 0;
    this.engine.connect(this.filter);
    this.engine2.connect(this.filter);
    this.filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engine.start();
    this.engine2.start();

    // Rauschen für Reifenquietschen
    const len = c.sampleRate;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = c.createBufferSource();
    this.noise.buffer = buf;
    this.noise.loop = true;
    this.skidFilter = c.createBiquadFilter();
    this.skidFilter.type = 'bandpass';
    this.skidFilter.frequency.value = 1800;
    this.skidFilter.Q.value = 3;
    this.skidGain = c.createGain();
    this.skidGain.gain.value = 0;
    this.noise.connect(this.skidFilter);
    this.skidFilter.connect(this.skidGain);
    this.skidGain.connect(this.master);
    this.noise.start();
    this.noiseBuf = buf;
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('tr_muted', this.muted ? '1' : '0');
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  update(car, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const sp = car ? car.speed : 0;
    // Simulierte Gänge
    const gearTop = [0, 180, 330, 470, 600, 2000];
    let g = 1;
    while (g < gearTop.length - 1 && sp > gearTop[g]) g++;
    const lo = gearTop[g - 1], hi = gearTop[g] === 2000 ? 900 : gearTop[g];
    const rpm = Math.min(1, (sp - lo) / (hi - lo));
    const f = 55 + rpm * 110 + g * 8 + (car && car.usingNitro ? 25 : 0);
    this.engine.frequency.setTargetAtTime(f, t, 0.05);
    this.engine2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.filter.frequency.setTargetAtTime(400 + rpm * 900 + (car && car.usingNitro ? 600 : 0), t, 0.05);
    this.engineGain.gain.setTargetAtTime(active ? 0.13 + rpm * 0.07 : 0, t, 0.1);
    const skid = active && car && car.drifting ? Math.min(0.25, Math.abs(car.slip) / 800) : 0;
    this.skidGain.gain.setTargetAtTime(skid, t, 0.05);
  }

  beep(freq, dur = 0.15, type = 'square', vol = 0.25) {
    if (!this.ctx) return;
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g);
    g.connect(this.master);
    o.start();
    o.stop(c.currentTime + dur);
  }

  crash(strength) {
    if (!this.ctx || strength < 0.1) return;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    const g = c.createGain();
    g.gain.setValueAtTime(0.5 * strength, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start();
    src.stop(c.currentTime + 0.3);
  }
}
