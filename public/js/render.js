// Canvas-Renderer: Strecke, Autos, Reifenspuren, Partikel, Minimap

import { CAR } from './car.js';

export class Renderer {
  constructor(canvas, minimap) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.minimap = minimap;
    this.mctx = minimap.getContext('2d');
    this.track = null;
    this.skids = [];
    this.particles = [];
    this.cam = { x: 0, y: 0, zoom: 1 };
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
    const path = new Path2D();
    path.moveTo(track.xs[0], track.ys[0]);
    for (let i = 1; i < track.N; i++) path.lineTo(track.xs[i], track.ys[i]);
    path.closePath();
    this.trackPath = path;
    const mk = (line) => {
      const p = new Path2D();
      p.moveTo(line[0][0], line[0][1]);
      for (let i = 1; i < line.length; i++) p.lineTo(line[i][0], line[i][1]);
      p.closePath();
      return p;
    };
    this.wallL = mk(track.wallL);
    this.wallR = mk(track.wallR);
    this.buildMinimap();
  }

  buildMinimap() {
    const t = this.track, m = this.minimap;
    const b = t.bounds;
    const pad = 10;
    const s = Math.min((m.width - pad * 2) / (b.maxX - b.minX - 1000), (m.height - pad * 2) / (b.maxY - b.minY - 1000));
    this.mm = {
      s,
      ox: pad - (b.minX + 500) * s + (m.width - pad * 2 - (b.maxX - b.minX - 1000) * s) / 2,
      oy: pad - (b.minY + 500) * s + (m.height - pad * 2 - (b.maxY - b.minY - 1000) * s) / 2,
    };
  }

  addSkid(car) {
    const cos = Math.cos(car.a), sin = Math.sin(car.a);
    const rx = -CAR.length * 0.32, w = CAR.width * 0.4;
    for (const side of [-1, 1]) {
      const x = car.x + cos * rx - sin * w * side;
      const y = car.y + sin * rx + cos * w * side;
      const key = car.id + '_' + side;
      const prev = car['_skid' + side];
      if (prev && Math.hypot(prev.x - x, prev.y - y) < 40) {
        this.skids.push({ x1: prev.x, y1: prev.y, x2: x, y2: y, key });
      }
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
    if (this.particles.length > 700) this.particles.splice(0, this.particles.length - 700);
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

  draw(cars, focus, dt) {
    const ctx = this.ctx, t = this.track;
    const W = this.canvas.width, H = this.canvas.height;
    if (!t) return;

    // Kamera folgt dem Fokus-Auto mit Vorausschau
    if (focus) {
      const lookX = focus.vx * 0.35, lookY = focus.vy * 0.35;
      const k = 1 - Math.exp(-6 * dt);
      this.cam.x += (focus.x + lookX - this.cam.x) * k;
      this.cam.y += (focus.y + lookY - this.cam.y) * k;
      const base = Math.min(W, H) / 900;
      const targetZoom = base * (1.15 - Math.min(0.35, focus.speed / 2400));
      this.cam.zoom += (targetZoom - this.cam.zoom) * (1 - Math.exp(-2 * dt));
    }
    const z = this.cam.zoom;
    const sx = (Math.random() - 0.5) * this.shake * 14, sy = (Math.random() - 0.5) * this.shake * 14;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = t.grass;
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(z, 0, 0, z, W / 2 - this.cam.x * z + sx, H / 2 - this.cam.y * z + sy);

    // Sichtbarer Bereich
    const vx0 = this.cam.x - W / 2 / z, vy0 = this.cam.y - H / 2 / z;
    const vx1 = this.cam.x + W / 2 / z, vy1 = this.cam.y + H / 2 / z;

    // Rasenstreifen
    ctx.fillStyle = t.grass2;
    const stripe = 160;
    for (let x = Math.floor(vx0 / stripe) * stripe; x < vx1; x += stripe * 2) ctx.fillRect(x, vy0, stripe, vy1 - vy0);

    // Auslaufzone (Kies)
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#c9b98f';
    ctx.lineWidth = t.wallDist * 2;
    ctx.stroke(this.trackPath);
    ctx.strokeStyle = 'rgba(0,0,0,0.05)';
    ctx.lineWidth = t.width + 120;
    ctx.stroke(this.trackPath);

    // Randsteine
    ctx.lineWidth = t.width + 22;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke(this.trackPath);
    ctx.setLineDash([28, 28]);
    ctx.strokeStyle = '#d62828';
    ctx.stroke(this.trackPath);
    ctx.setLineDash([]);

    // Asphalt
    ctx.lineWidth = t.width;
    ctx.strokeStyle = '#4a4d52';
    ctx.stroke(this.trackPath);
    ctx.lineWidth = t.width - 30;
    ctx.strokeStyle = '#505359';
    ctx.stroke(this.trackPath);

    // Mittellinie
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.setLineDash([40, 50]);
    ctx.stroke(this.trackPath);
    ctx.setLineDash([]);

    // Reifenspuren
    ctx.strokeStyle = 'rgba(20,20,20,0.35)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    for (const s of this.skids) {
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
    }
    ctx.stroke();

    // Start-/Ziellinie (Schachbrett)
    this.drawStartLine();

    // Reifenstapel an den Begrenzungen
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#222';
    ctx.stroke(this.wallL);
    ctx.stroke(this.wallR);
    ctx.setLineDash([14, 22]);
    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth = 8;
    ctx.stroke(this.wallL);
    ctx.stroke(this.wallR);
    ctx.setLineDash([]);

    // Partikel
    for (const p of this.particles) {
      const a = p.life / p.max;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.6 - a * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Autos
    for (const car of cars) this.drawCar(car);

    // Bäume (über den Autos, mit Schatten)
    for (const d of t.decor) {
      if (d.x + d.r < vx0 || d.x - d.r > vx1 || d.y + d.r < vy0 || d.y - d.r > vy1) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.arc(d.x + 10, d.y + 12, d.r, 0, Math.PI * 2);
      ctx.fill();
      if (d.kind === 'tree') {
        ctx.fillStyle = d.shade > 0.5 ? '#1f5d2a' : '#26703a';
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.arc(d.x - d.r * 0.3, d.y - d.r * 0.3, d.r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#6a9a3a';
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.arc(d.x + (k - 1) * d.r * 0.5, d.y + (k % 2) * 6, d.r * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Namen
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px system-ui, sans-serif';
    for (const car of cars) {
      if (car === focus) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      const w = ctx.measureText(car.name).width + 12;
      ctx.fillRect(car.x - w / 2, car.y - 52, w, 20);
      ctx.fillStyle = '#fff';
      ctx.fillText(car.name, car.x, car.y - 37);
    }

    this.drawMinimap(cars, focus);
  }

  drawStartLine() {
    const ctx = this.ctx, t = this.track;
    const i = 0;
    const nx = -t.ty[i], ny = t.tx[i];
    const cells = 10;
    const cw = t.width / cells;
    ctx.save();
    ctx.translate(t.xs[i], t.ys[i]);
    ctx.rotate(Math.atan2(ny, nx));
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < cells; c++) {
        ctx.fillStyle = (r + c) % 2 ? '#111' : '#fff';
        ctx.fillRect(-t.width / 2 + c * cw, -cw + r * cw, cw, cw);
      }
    }
    ctx.restore();
  }

  drawCar(car) {
    const ctx = this.ctx;
    const L = CAR.length, Wd = CAR.width;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.a);

    // Schatten
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, -L / 2 + 4, -Wd / 2 + 5, L, Wd, 7);
    ctx.fill();

    // Räder
    ctx.fillStyle = '#111';
    const wl = 11, ww = 5;
    for (const [x, y] of [[L * 0.28, -Wd / 2 - 1], [L * 0.28, Wd / 2 - ww + 1], [-L * 0.3, -Wd / 2 - 1], [-L * 0.3, Wd / 2 - ww + 1]]) {
      ctx.fillRect(x - wl / 2, y, wl, ww);
    }

    // Karosserie
    ctx.fillStyle = car.color;
    roundRect(ctx, -L / 2, -Wd / 2, L, Wd, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Rennstreifen
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(-L / 2 + 2, -2.5, L - 4, 5);

    // Cockpit / Scheiben
    ctx.fillStyle = '#1b2733';
    roundRect(ctx, -L * 0.12, -Wd * 0.36, L * 0.3, Wd * 0.72, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(140,200,255,0.5)';
    roundRect(ctx, L * 0.1, -Wd * 0.33, L * 0.07, Wd * 0.66, 2);
    ctx.fill();

    // Heckspoiler
    ctx.fillStyle = shade(car.color, -40);
    ctx.fillRect(-L / 2 - 3, -Wd / 2, 5, Wd);

    // Scheinwerfer
    ctx.fillStyle = '#fff6c2';
    ctx.fillRect(L / 2 - 3, -Wd / 2 + 2, 3, 5);
    ctx.fillRect(L / 2 - 3, Wd / 2 - 7, 3, 5);
    // Bremslichter
    ctx.fillStyle = car.braking ? '#ff2a2a' : '#7a1010';
    ctx.fillRect(-L / 2, -Wd / 2 + 2, 2, 5);
    ctx.fillRect(-L / 2, Wd / 2 - 7, 2, 5);

    ctx.restore();
  }

  drawMinimap(cars, focus) {
    const m = this.minimap, ctx = this.mctx, t = this.track, mm = this.mm;
    ctx.clearRect(0, 0, m.width, m.height);
    ctx.save();
    ctx.setTransform(mm.s, 0, 0, mm.s, mm.ox, mm.oy);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = t.width * 0.9;
    ctx.stroke(this.trackPath);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = t.width * 0.55;
    ctx.stroke(this.trackPath);
    ctx.restore();
    // Start
    ctx.fillStyle = '#fff';
    ctx.fillRect(t.xs[0] * mm.s + mm.ox - 3, t.ys[0] * mm.s + mm.oy - 3, 6, 6);
    for (const car of cars) {
      const x = car.x * mm.s + mm.ox, y = car.y * mm.s + mm.oy;
      ctx.fillStyle = car.color;
      ctx.strokeStyle = car === focus ? '#fff' : '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, car === focus ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
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

// Kleine Vorschau einer Strecke (für Lobby/Menü)
export function drawTrackPreview(canvas, track) {
  const ctx = canvas.getContext('2d');
  const b = track.bounds;
  const pad = 8;
  const w = b.maxX - b.minX - 1000, h = b.maxY - b.minY - 1000;
  const s = Math.min((canvas.width - pad * 2) / w, (canvas.height - pad * 2) / h);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = track.grass;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(pad + (canvas.width - pad * 2 - w * s) / 2 - (b.minX + 500) * s, pad + (canvas.height - pad * 2 - h * s) / 2 - (b.minY + 500) * s);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(track.xs[0], track.ys[0]);
  for (let i = 1; i < track.N; i++) ctx.lineTo(track.xs[i], track.ys[i]);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = track.width + 40;
  ctx.stroke();
  ctx.strokeStyle = '#4a4d52';
  ctx.lineWidth = track.width;
  ctx.stroke();
  ctx.restore();
}
