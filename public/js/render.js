// Canvas-Renderer: Strecke mit Thema, Spezialelemente, Deko, Autos, Effekte, Minimap

import { CAR_TYPES } from './car.js';
import { ROAD_COLORS, NEON_ROAD } from './tracks.js';

const TAU = Math.PI * 2;

export class Renderer {
  constructor(canvas, minimap) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.minimap = minimap;
    this.mctx = minimap.getContext('2d');
    this.track = null;
    this.skids = [];
    this.particles = [];
    this.cam = { x: 0, y: 0, zoom: 1, angle: 0 };
    this.rotate = false;
    this.shake = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
  }

  setTrack(track) {
    this.track = track;
    this.skids = [];
    this.particles = [];
    const t = track;
    const mk = (xs, ys, from, to, closed) => {
      const p = new Path2D();
      p.moveTo(xs(from), ys(from));
      for (let k = 1; k <= to; k++) p.lineTo(xs((from + k) % t.N), ys((from + k) % t.N));
      if (closed) p.closePath();
      return p;
    };
    this.trackPath = mk((i) => t.xs[i], (i) => t.ys[i], 0, t.N - 1, true);
    const line = (l) => mk((i) => l[i][0], (i) => l[i][1], 0, l.length - 1, true);
    this.wallL = line(t.wallL);
    this.wallR = line(t.wallR);

    // Fahrbahnabschnitte je Untergrund
    this.surfPaths = [];
    let start = 0;
    while (start < t.N && t.surf[start] === t.surf[(start - 1 + t.N) % t.N]) start++;
    if (start >= t.N) {
      this.surfPaths.push({ kind: t.surfName[t.surf[0]], path: this.trackPath });
    } else {
      let i = start;
      let done = 0;
      while (done < t.N) {
        const kind = t.surf[i];
        let len = 0;
        while (len < t.N && t.surf[(i + len) % t.N] === kind) len++;
        this.surfPaths.push({ kind: t.surfName[kind], path: mk((j) => t.xs[j], (j) => t.ys[j], i, Math.min(len + 1, t.N), false) });
        i = (i + len) % t.N;
        done += len;
      }
    }
    this.buildMinimap();
  }

  buildMinimap() {
    const t = this.track, m = this.minimap;
    const b = t.bounds;
    const pad = 10;
    const w = b.maxX - b.minX - 1000, h = b.maxY - b.minY - 1000;
    const s = Math.min((m.width - pad * 2) / w, (m.height - pad * 2) / h);
    this.mm = {
      s,
      ox: pad - (b.minX + 500) * s + (m.width - pad * 2 - w * s) / 2,
      oy: pad - (b.minY + 500) * s + (m.height - pad * 2 - h * s) / 2,
    };
  }

  addSkid(car) {
    const cos = Math.cos(car.a), sin = Math.sin(car.a);
    const rx = -car.spec.length * 0.32, w = car.spec.width * 0.4;
    for (const side of [-1, 1]) {
      const x = car.x + cos * rx - sin * w * side;
      const y = car.y + sin * rx + cos * w * side;
      const prev = car['_skid' + side];
      if (prev && Math.hypot(prev.x - x, prev.y - y) < 40) this.skids.push({ x1: prev.x, y1: prev.y, x2: x, y2: y });
      car['_skid' + side] = { x, y };
    }
    if (this.skids.length > 1600) this.skids.splice(0, this.skids.length - 1600);
  }

  clearSkid(car) {
    car._skid1 = null;
    car['_skid-1'] = null;
  }

  emit(x, y, vx, vy, color, life, size, count = 1) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x, y,
        vx: vx + (Math.random() - 0.5) * 60,
        vy: vy + (Math.random() - 0.5) * 60,
        life, max: life, color, size: size * (0.7 + Math.random() * 0.6),
      });
    }
    if (this.particles.length > 800) this.particles.splice(0, this.particles.length - 800);
  }

  burst(x, y, color, n = 16, speed = 260, life = 0.5, size = 5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = speed * (0.4 + Math.random() * 0.6);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color, size });
    }
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    this.shake *= Math.exp(-8 * dt);
  }

  // info: { now, countdown (ms bis Start, <=0 = läuft) }
  draw(cars, focus, dt, info = {}) {
    const ctx = this.ctx, t = this.track, th = t && t.theme;
    const W = this.canvas.width, H = this.canvas.height;
    if (!t) return;
    const now = info.now || performance.now();

    // Kamera
    const rot = this.rotate && focus;
    if (focus) {
      const look = rot ? 0.12 : 0.35;
      const k = 1 - Math.exp(-6 * dt);
      this.cam.x += (focus.x + focus.vx * look - this.cam.x) * k;
      this.cam.y += (focus.y + focus.vy * look - this.cam.y) * k;
      const base = (rot ? Math.max(Math.min(W, H), Math.min(W * 1.6, H) * 0.75) : Math.min(W, H)) / 900;
      const targetZoom = base * (1.15 - Math.min(0.35, focus.speed / 2400));
      this.cam.zoom += (targetZoom - this.cam.zoom) * (1 - Math.exp(-2 * dt));
      let da = focus.a - this.cam.angle;
      while (da > Math.PI) da -= TAU;
      while (da < -Math.PI) da += TAU;
      this.cam.angle += da * (1 - Math.exp(-5 * dt));
    }
    const z = this.cam.zoom;
    const sx = (Math.random() - 0.5) * this.shake * 14, sy = (Math.random() - 0.5) * this.shake * 14;
    const viewAngle = rot ? -this.cam.angle - Math.PI / 2 : 0;
    this.viewAngle = viewAngle;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = th.ground;
    ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2 + sx, (rot ? H * 0.64 : H / 2) + sy);
    ctx.rotate(viewAngle);
    ctx.scale(z, z);
    ctx.translate(-this.cam.x, -this.cam.y);

    // Sichtbarer Bereich (als Kreis um die Kamera)
    const R = Math.hypot(W, H) / z;
    const vx0 = this.cam.x - R, vy0 = this.cam.y - R, vx1 = this.cam.x + R, vy1 = this.cam.y + R;
    const visible = (x, y, r) => x + r > vx0 && x - r < vx1 && y + r > vy0 && y - r < vy1;

    // Bodenstreifen
    ctx.fillStyle = th.ground2;
    const stripe = 160;
    for (let x = Math.floor(vx0 / stripe) * stripe; x < vx1; x += stripe * 2) ctx.fillRect(x, vy0, stripe, vy1 - vy0);

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Auslaufzone
    ctx.strokeStyle = th.runoff;
    ctx.lineWidth = t.wallDist * 2;
    ctx.stroke(this.trackPath);
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = t.width + 120;
    ctx.stroke(this.trackPath);

    // Randsteine
    ctx.lineWidth = t.width + 22;
    ctx.strokeStyle = th.curbA;
    ctx.stroke(this.trackPath);
    ctx.setLineDash([28, 28]);
    ctx.strokeStyle = th.curbB;
    ctx.stroke(this.trackPath);
    ctx.setLineDash([]);
    if (th.night) {
      ctx.lineWidth = t.width + 40;
      ctx.strokeStyle = 'rgba(255,43,214,0.12)';
      ctx.stroke(this.trackPath);
    }

    // Fahrbahn je Untergrund
    ctx.lineCap = 'butt';
    for (const sp of this.surfPaths) {
      const [c1, c2] = th.night && sp.kind === 'asphalt' ? NEON_ROAD : ROAD_COLORS[sp.kind];
      ctx.lineWidth = t.width;
      ctx.strokeStyle = c1;
      ctx.stroke(sp.path);
      ctx.lineWidth = t.width - 30;
      ctx.strokeStyle = c2;
      ctx.stroke(sp.path);
      if (sp.kind === 'dirt' || sp.kind === 'snow') {
        // Fahrspuren
        ctx.lineWidth = 16;
        ctx.strokeStyle = sp.kind === 'dirt' ? 'rgba(90,60,30,0.25)' : 'rgba(150,170,190,0.3)';
        ctx.setLineDash([60, 20]);
        ctx.stroke(sp.path);
        ctx.setLineDash([]);
      }
      if (sp.kind === 'ice') {
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.setLineDash([12, 90]);
        ctx.stroke(sp.path);
        ctx.setLineDash([]);
      }
    }
    ctx.lineCap = 'round';

    // Mittellinie
    ctx.lineWidth = 4;
    ctx.strokeStyle = th.line;
    ctx.setLineDash([40, 50]);
    ctx.stroke(this.trackPath);
    ctx.setLineDash([]);

    // Reifenspuren
    ctx.strokeStyle = th.night ? 'rgba(0,0,0,0.45)' : 'rgba(20,20,20,0.3)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    for (const s of this.skids) {
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
    }
    ctx.stroke();

    this.drawStartLine();

    // Spezialelemente
    for (const f of t.features) if (visible(f.x, f.y, 150)) this.drawFeature(f, now);

    // Reifenstapel / Begrenzung
    ctx.lineCap = 'round';
    ctx.lineWidth = 14;
    ctx.strokeStyle = th.wall;
    ctx.stroke(this.wallL);
    ctx.stroke(this.wallR);
    ctx.setLineDash([14, 22]);
    ctx.strokeStyle = th.wall2;
    ctx.lineWidth = 8;
    ctx.stroke(this.wallL);
    ctx.stroke(this.wallR);
    ctx.setLineDash([]);

    // Tribünen
    for (const s of t.stands) if (visible(s.x, s.y, 200)) this.drawStand(s, now);

    // Partikel
    for (const p of this.particles) {
      const a = p.life / p.max;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.6 - a * 0.6), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Autos (am Boden zuerst, springende oben)
    const order = [...cars].sort((a, b) => (a.z || 0) - (b.z || 0));
    for (const car of order) this.drawCar(car, th);

    // Deko
    for (const d of t.decor) if (visible(d.x, d.y, d.r * 2)) this.drawDecor(d, th);

    // Laternen
    for (const l of t.lamps) {
      if (!visible(l.x, l.y, 40)) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.arc(l.x + 6, l.y + 6, 7, 0, TAU);
      ctx.fill();
      ctx.fillStyle = th.night ? '#e0e7ff' : '#fef3c7';
      ctx.beginPath();
      ctx.arc(l.x, l.y, 6, 0, TAU);
      ctx.fill();
    }

    this.drawGantry(info.countdown);

    // Nacht: Lichter
    if (th.night) this.drawNightLights(cars, visible);

    // Namen (immer lesbar, auch bei gedrehter Kamera)
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const car of cars) {
      if (car === focus) continue;
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(-viewAngle);
      const w = ctx.measureText(car.name).width + 12;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(-w / 2, -54 - (car.z || 0) * 0.1, w, 20);
      ctx.fillStyle = '#fff';
      ctx.fillText(car.name, 0, -39 - (car.z || 0) * 0.1);
      ctx.restore();
    }

    this.drawMinimap(cars, focus, now);
  }

  drawStartLine() {
    const ctx = this.ctx, t = this.track;
    const cells = 10;
    const cw = t.width / cells;
    ctx.save();
    ctx.translate(t.xs[0], t.ys[0]);
    ctx.rotate(Math.atan2(t.tx[0], -t.ty[0]));
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < cells; c++) {
        ctx.fillStyle = (r + c) % 2 ? '#111' : '#fff';
        ctx.fillRect(-t.width / 2 + c * cw, -cw + r * cw, cw, cw);
      }
    }
    ctx.restore();
  }

  // Startbrücke mit Startampel
  drawGantry(countdown) {
    const ctx = this.ctx, t = this.track;
    const i = 3;
    ctx.save();
    ctx.translate(t.xs[i], t.ys[i]);
    ctx.rotate(Math.atan2(t.ty[i], t.tx[i]) + Math.PI / 2);
    const w = t.wallDist * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-w / 2 + 14, -8 + 14, w, 22);
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(-w / 2, -8, w, 22);
    ctx.fillStyle = '#374151';
    ctx.fillRect(-w / 2 - 10, -14, 20, 34);
    ctx.fillRect(w / 2 - 10, -14, 20, 34);
    // 5 Lampen
    const lit = countdown > 0 ? Math.min(5, Math.floor((3000 - countdown) / 600) + 1) : 0;
    for (let k = 0; k < 5; k++) {
      let color = '#111827';
      if (countdown > 0 && k < lit) color = '#ef4444';
      else if (countdown <= 0 && countdown > -1500) color = '#22c55e';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc((k - 2) * 26, 3, 8, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawFeature(f, now) {
    const ctx = this.ctx, t = this.track;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.a);
    if (f.type === 'boost') {
      const neon = t.theme.night;
      ctx.fillStyle = neon ? 'rgba(0,229,255,0.25)' : 'rgba(255,190,11,0.3)';
      roundRect(ctx, -f.halfLen, -f.halfW, f.halfLen * 2, f.halfW * 2, 8);
      ctx.fill();
      ctx.strokeStyle = neon ? '#00e5ff' : '#ffbe0b';
      ctx.lineWidth = 3;
      ctx.stroke();
      const phase = (now / 400) % 1;
      for (let k = 0; k < 3; k++) {
        const x = -f.halfLen + 10 + ((k / 3 + phase) % 1) * (f.halfLen * 2 - 24);
        ctx.fillStyle = neon ? '#ff2bd6' : '#fb5607';
        ctx.beginPath();
        ctx.moveTo(x, -f.halfW + 8);
        ctx.lineTo(x + 14, 0);
        ctx.lineTo(x, f.halfW - 8);
        ctx.lineTo(x + 6, 0);
        ctx.closePath();
        ctx.fill();
      }
    } else if (f.type === 'ramp') {
      const g = ctx.createLinearGradient(-f.halfLen, 0, f.halfLen, 0);
      g.addColorStop(0, '#6b7280');
      g.addColorStop(1, '#d1d5db');
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-f.halfLen + 8, -f.halfW + 8, f.halfLen * 2, f.halfW * 2);
      ctx.fillStyle = g;
      ctx.fillRect(-f.halfLen, -f.halfW, f.halfLen * 2, f.halfW * 2);
      // Warnstreifen
      for (let y = -f.halfW; y < f.halfW; y += 20) {
        ctx.fillStyle = ((y + f.halfW) / 20) % 2 ? '#111' : '#facc15';
        ctx.fillRect(f.halfLen - 8, y, 8, 20);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(-8, k * 40 - 10);
        ctx.lineTo(8, k * 40);
        ctx.lineTo(-8, k * 40 + 10);
        ctx.fill();
      }
    } else if (f.type === 'oil') {
      ctx.fillStyle = 'rgba(10,10,15,0.85)';
      for (const [dx, dy, r] of [[0, 0, 1], [-14, 10, 0.6], [16, -8, 0.55], [8, 16, 0.5], [-10, -14, 0.45]]) {
        ctx.beginPath();
        ctx.ellipse(dx, dy, f.r * 0.62 * r, f.r * 0.5 * r, 0.4, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(140,120,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(-6, -6, 10, 5, 0.4, 0, TAU);
      ctx.fill();
    } else if (f.type === 'nitro') {
      if (!f.takenUntil || now > f.takenUntil) {
        const bob = Math.sin(now / 200) * 3;
        ctx.rotate(-f.a - this.viewAngle);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.arc(4, 6, f.r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#2563eb';
        ctx.beginPath();
        ctx.arc(0, bob, f.r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#93c5fd';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 18px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('N', 0, bob + 1);
        ctx.textBaseline = 'alphabetic';
      }
    }
    ctx.restore();
  }

  drawStand(s) {
    const ctx = this.ctx, th = this.track.theme;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.a);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-s.w / 2 + 10, -s.h / 2 + 12, s.w, s.h);
    ctx.fillStyle = '#9ca3af';
    ctx.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
    // Sitzreihen mit Publikum
    const rnd = seeded(s.seed);
    const colors = ['#ef4444', '#3b82f6', '#fbbf24', '#10b981', '#f472b6', '#fff', '#8b5cf6'];
    for (let r = 0; r < 4; r++) {
      const y = -s.h / 2 + 10 + r * 18 * (s.side > 0 ? 1 : 1);
      ctx.fillStyle = r % 2 ? '#6b7280' : '#737b87';
      ctx.fillRect(-s.w / 2 + 6, y - 6, s.w - 12, 14);
      for (let x = -s.w / 2 + 12; x < s.w / 2 - 8; x += 11) {
        if (rnd() < 0.2) continue;
        ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
        ctx.beginPath();
        ctx.arc(x, y + 1, 4, 0, TAU);
        ctx.fill();
      }
    }
    // Dach
    ctx.fillStyle = th.stands;
    const roofY = s.side > 0 ? s.h / 2 - 12 : -s.h / 2;
    ctx.fillRect(-s.w / 2 - 6, roofY, s.w + 12, 12);
    ctx.restore();
  }

  drawDecor(d, th) {
    const ctx = this.ctx;
    const shadow = (dx = 10, dy = 12, r = d.r) => {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.arc(d.x + dx, d.y + dy, r, 0, TAU);
      ctx.fill();
    };
    const circle = (x, y, r, c) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    };
    switch (d.kind) {
      case 'tree':
        shadow();
        circle(d.x, d.y, d.r, d.shade > 0.5 ? '#1f5d2a' : '#26703a');
        circle(d.x - d.r * 0.3, d.y - d.r * 0.3, d.r * 0.55, 'rgba(255,255,255,0.1)');
        break;
      case 'bush':
        for (let k = 0; k < 3; k++) circle(d.x + (k - 1) * d.r * 0.5, d.y + (k % 2) * 6, d.r * 0.5, '#6a9a3a');
        break;
      case 'flowers': {
        const rnd = seeded(d.seed);
        const cs = ['#f472b6', '#fde047', '#fff', '#c084fc'];
        for (let k = 0; k < 9; k++) circle(d.x + (rnd() - 0.5) * d.r * 2, d.y + (rnd() - 0.5) * d.r * 2, 4, cs[k % 4]);
        break;
      }
      case 'pine':
      case 'snowpine': {
        shadow(12, 14, d.r * 0.9);
        const snow = d.kind === 'snowpine';
        const layers = snow ? ['#1f4d3a', '#e8f0f7', '#2a5e47', '#ffffff'] : ['#173f26', '#1e5130', '#27653c', '#317a48'];
        for (let k = 0; k < 4; k++) star(ctx, d.x, d.y, d.r * (1 - k * 0.22), 8, d.a + k * 0.3, layers[k]);
        break;
      }
      case 'rock':
        shadow(8, 9, d.r * 0.7);
        poly(ctx, d.x, d.y, d.r * 0.75, 7, d.a, d.seed, th.night ? '#374151' : d.shade > 0.5 ? '#8b8f96' : '#9ca3af');
        poly(ctx, d.x - d.r * 0.15, d.y - d.r * 0.15, d.r * 0.4, 6, d.a, d.seed, 'rgba(255,255,255,0.18)');
        break;
      case 'cactus': {
        shadow(10, 10, d.r * 0.6);
        const c = '#3f8f4a';
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.a);
        ctx.fillStyle = c;
        roundRect(ctx, -d.r * 0.22, -d.r * 0.9, d.r * 0.44, d.r * 1.8, d.r * 0.22);
        ctx.fill();
        roundRect(ctx, -d.r * 0.8, -d.r * 0.2, d.r * 1.6, d.r * 0.36, d.r * 0.18);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(-d.r * 0.06, -d.r * 0.8, d.r * 0.12, d.r * 1.6);
        ctx.restore();
        break;
      }
      case 'skull':
        circle(d.x, d.y, d.r * 0.5, '#b08a5a');
        ctx.strokeStyle = '#8a6a40';
        ctx.lineWidth = 2;
        for (let k = 0; k < 5; k++) {
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.r * (0.15 + k * 0.08), d.a + k, d.a + k + 2.5);
          ctx.stroke();
        }
        break;
      case 'snowman':
        shadow(8, 10, d.r * 0.6);
        circle(d.x, d.y, d.r * 0.6, '#ffffff');
        circle(d.x - d.r * 0.1, d.y - d.r * 0.1, d.r * 0.42, '#f1f5f9');
        circle(d.x - d.r * 0.18, d.y - d.r * 0.18, d.r * 0.28, '#ffffff');
        circle(d.x - d.r * 0.05, d.y - d.r * 0.2, d.r * 0.08, '#f97316');
        break;
      case 'container': {
        const cs = ['#dc2626', '#2563eb', '#16a34a', '#f59e0b', '#0891b2', '#7c3aed'];
        const w = d.r * 2.2, h = d.r * 0.9;
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(Math.round(d.a / (Math.PI / 2)) * (Math.PI / 2));
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(-w / 2 + 10, -h / 2 + 12, w, h);
        const stack = d.seed > 0.5 ? 2 : 1;
        for (let k = 0; k < stack; k++) {
          ctx.fillStyle = cs[Math.floor((d.seed * 10 + k) % cs.length)];
          ctx.fillRect(-w / 2 - k * 4, -h / 2 - k * 4, w, h);
          ctx.strokeStyle = 'rgba(0,0,0,0.25)';
          ctx.lineWidth = 2;
          for (let x = -w / 2 + 8; x < w / 2; x += 10) {
            ctx.beginPath();
            ctx.moveTo(x - k * 4, -h / 2 - k * 4);
            ctx.lineTo(x - k * 4, h / 2 - k * 4);
            ctx.stroke();
          }
        }
        ctx.restore();
        break;
      }
      case 'crates':
        for (let k = 0; k < 3; k++) {
          ctx.fillStyle = k % 2 ? '#a16207' : '#854d0e';
          ctx.fillRect(d.x + (k - 1) * 22, d.y + (k % 2) * 14, 20, 20);
          ctx.strokeStyle = '#422006';
          ctx.strokeRect(d.x + (k - 1) * 22, d.y + (k % 2) * 14, 20, 20);
        }
        break;
      case 'building': {
        const w = d.r * 2, h = d.r * 1.6;
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(Math.round(d.a / (Math.PI / 2)) * (Math.PI / 2));
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(-w / 2 + 16, -h / 2 + 18, w, h);
        if (th.night) {
          ctx.fillStyle = d.shade > 0.5 ? '#1e1b3a' : '#231f45';
          ctx.fillRect(-w / 2, -h / 2, w, h);
          const neon = ['#ff2bd6', '#00e5ff', '#fde047', '#a78bfa'];
          ctx.strokeStyle = neon[Math.floor(d.seed * 4)];
          ctx.lineWidth = 3;
          ctx.strokeRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4);
          const rnd = seeded(d.seed);
          for (let y = -h / 2 + 12; y < h / 2 - 12; y += 16) {
            for (let x = -w / 2 + 12; x < w / 2 - 12; x += 16) {
              if (rnd() < 0.45) continue;
              ctx.fillStyle = rnd() < 0.7 ? 'rgba(253,224,71,0.8)' : 'rgba(0,229,255,0.7)';
              ctx.fillRect(x, y, 8, 8);
            }
          }
        } else {
          ctx.fillStyle = d.shade > 0.5 ? '#9ca3af' : '#a8a29e';
          ctx.fillRect(-w / 2, -h / 2, w, h);
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          for (let x = -w / 2; x < w / 2; x += 18) ctx.fillRect(x, -h / 2, 9, h);
          ctx.fillStyle = '#4b5563';
          ctx.fillRect(-w / 4, -h / 4, 18, 18);
        }
        ctx.restore();
        break;
      }
    }
  }

  drawNightLights(cars, visible) {
    const ctx = this.ctx, t = this.track;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const l of t.lamps) {
      if (!visible(l.x, l.y, 160)) continue;
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, 150);
      g.addColorStop(0, 'rgba(180,190,255,0.22)');
      g.addColorStop(1, 'rgba(180,190,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(l.x, l.y, 150, 0, TAU);
      ctx.fill();
    }
    for (const car of cars) {
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.a);
      const g = ctx.createRadialGradient(car.spec.length / 2, 0, 0, car.spec.length / 2, 0, 260);
      g.addColorStop(0, 'rgba(255,240,180,0.16)');
      g.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(car.spec.length / 2, -8);
      ctx.lineTo(car.spec.length / 2 + 260, -110);
      ctx.lineTo(car.spec.length / 2 + 260, 110);
      ctx.lineTo(car.spec.length / 2, 8);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  drawCar(car, th) {
    const ctx = this.ctx;
    const spec = car.spec;
    const L = spec.length, Wd = spec.width;
    const zScale = 1 + (car.z || 0) / 380;
    const zOff = (car.z || 0) * 0.18;

    // Schatten
    ctx.save();
    ctx.translate(car.x + 4 + zOff, car.y + 5 + zOff);
    ctx.rotate(car.a);
    ctx.fillStyle = `rgba(0,0,0,${car.z > 0 ? 0.22 : 0.35})`;
    roundRect(ctx, -L / 2, -Wd / 2, L, Wd, 7);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.a);
    ctx.scale(zScale, zScale);

    // Boost-Flamme
    if (car.boost > 0 || car.usingNitro) {
      ctx.fillStyle = car.boost > 0 ? '#fb923c' : '#22d3ee';
      ctx.beginPath();
      ctx.moveTo(-L / 2, -5);
      ctx.lineTo(-L / 2 - 16 - Math.random() * 10, 0);
      ctx.lineTo(-L / 2, 5);
      ctx.fill();
    }

    // Räder
    ctx.fillStyle = '#111';
    const wl = 11, ww = 5;
    for (const [x, y] of [[L * 0.28, -Wd / 2 - 1], [L * 0.28, Wd / 2 - ww + 1], [-L * 0.3, -Wd / 2 - 1], [-L * 0.3, Wd / 2 - ww + 1]]) {
      ctx.fillRect(x - wl / 2, y, wl, ww);
    }

    // Karosserie je Typ
    ctx.fillStyle = car.color;
    if (car.carType === 'drift') {
      roundRect(ctx, -L / 2, -Wd / 2, L, Wd, 10);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(-L / 2 - 4, -Wd / 2 - 2, 7, Wd + 4); // großer Heckflügel
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.moveTo(L * 0.1, -Wd / 2);
      ctx.lineTo(L * 0.35, -Wd / 2);
      ctx.lineTo(-L * 0.2, Wd / 2);
      ctx.lineTo(-L * 0.45, Wd / 2);
      ctx.fill();
    } else if (car.carType === 'muscle') {
      roundRect(ctx, -L / 2, -Wd / 2, L, Wd, 5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(-L / 2 + 2, -6, L - 4, 3);
      ctx.fillRect(-L / 2 + 2, 3, L - 4, 3);
      ctx.fillStyle = '#374151';
      ctx.fillRect(L * 0.18, -4, 8, 8); // Lufthutze
    } else {
      roundRect(ctx, -L / 2, -Wd / 2, L, Wd, 7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(-L / 2 + 2, -2.5, L - 4, 5);
      ctx.fillStyle = shade(car.color, -40);
      ctx.fillRect(-L / 2 - 3, -Wd / 2, 5, Wd);
    }

    // Cockpit / Scheiben
    ctx.fillStyle = '#1b2733';
    roundRect(ctx, -L * 0.14, -Wd * 0.36, L * 0.3, Wd * 0.72, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(140,200,255,0.5)';
    roundRect(ctx, L * 0.08, -Wd * 0.33, L * 0.07, Wd * 0.66, 2);
    ctx.fill();

    // Scheinwerfer / Bremslichter
    ctx.fillStyle = '#fff6c2';
    ctx.fillRect(L / 2 - 3, -Wd / 2 + 2, 3, 5);
    ctx.fillRect(L / 2 - 3, Wd / 2 - 7, 3, 5);
    ctx.fillStyle = car.braking ? '#ff2a2a' : '#7a1010';
    ctx.fillRect(-L / 2, -Wd / 2 + 2, 2, 5);
    ctx.fillRect(-L / 2, Wd / 2 - 7, 2, 5);

    // Mini-Turbo-Ladung
    if (car.driftCharge > 0.8) {
      ctx.fillStyle = car.driftCharge > 1.8 ? '#f97316' : '#38bdf8';
      for (const y of [-Wd / 2 - 3, Wd / 2 + 3]) {
        ctx.beginPath();
        ctx.arc(-L * 0.3, y, 3 + Math.random() * 2, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawMinimap(cars, focus, now) {
    const m = this.minimap, ctx = this.mctx, t = this.track, mm = this.mm;
    ctx.clearRect(0, 0, m.width, m.height);
    ctx.save();
    ctx.setTransform(mm.s, 0, 0, mm.s, mm.ox, mm.oy);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = t.width * 0.9;
    ctx.stroke(this.trackPath);
    for (const sp of this.surfPaths) {
      ctx.strokeStyle = sp.kind === 'asphalt' ? '#333' : ROAD_COLORS[sp.kind][0];
      ctx.lineWidth = t.width * 0.55;
      ctx.stroke(sp.path);
    }
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.fillRect(t.xs[0] * mm.s + mm.ox - 3, t.ys[0] * mm.s + mm.oy - 3, 6, 6);
    for (const car of cars) {
      const x = car.x * mm.s + mm.ox, y = car.y * mm.s + mm.oy;
      ctx.fillStyle = car.color;
      ctx.strokeStyle = car === focus ? '#fff' : '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, car === focus ? 6 : 4.5, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  }
}

function seeded(seed) {
  let a = Math.floor(seed * 4294967296) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function star(ctx, x, y, r, n, rot, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let k = 0; k < n * 2; k++) {
    const rr = k % 2 ? r * 0.62 : r;
    const a = rot + (k / (n * 2)) * TAU;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function poly(ctx, x, y, r, n, rot, seed, color) {
  const rnd = seeded(seed);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let k = 0; k < n; k++) {
    const a = rot + (k / n) * TAU;
    const rr = r * (0.75 + rnd() * 0.35);
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

// Kleine Vorschau eines Autos (Menü)
export function drawCarPreview(canvas, carType, color) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const car = { x: canvas.width / 2, y: canvas.height / 2, a: 0, z: 0, color, carType, spec: CAR_TYPES[carType] };
  ctx.save();
  ctx.scale(1.2, 1.2);
  ctx.translate(-canvas.width * 0.08, -canvas.height * 0.08);
  Renderer.prototype.drawCar.call({ ctx }, car);
  ctx.restore();
}

// Kleine Vorschau einer Strecke (für Lobby/Menü)
export function drawTrackPreview(canvas, track) {
  const ctx = canvas.getContext('2d');
  const b = track.bounds;
  const pad = 8;
  const w = b.maxX - b.minX - 1000, h = b.maxY - b.minY - 1000;
  const s = Math.min((canvas.width - pad * 2) / w, (canvas.height - pad * 2) / h);
  const th = track.theme;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = th.ground;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(pad + (canvas.width - pad * 2 - w * s) / 2 - (b.minX + 500) * s, pad + (canvas.height - pad * 2 - h * s) / 2 - (b.minY + 500) * s);
  ctx.scale(s, s);
  const path = new Path2D();
  path.moveTo(track.xs[0], track.ys[0]);
  for (let i = 1; i < track.N; i++) path.lineTo(track.xs[i], track.ys[i]);
  path.closePath();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = th.curbB;
  ctx.lineWidth = track.width + 60;
  ctx.stroke(path);
  const base = track.surfName[track.surf[Math.floor(track.N / 2)]];
  ctx.strokeStyle = th.night ? NEON_ROAD[0] : ROAD_COLORS[base][0];
  ctx.lineWidth = track.width;
  ctx.stroke(path);
  ctx.restore();
}
