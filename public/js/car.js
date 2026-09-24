// Fahrzeugphysik (Arcade mit Drift), Rundenlogik und KI-Fahrer

import { nearestLocal } from './tracks.js';

export const CAR = {
  length: 46,
  width: 24,
  radius: 19,
  accel: 640,
  nitroAccel: 520,
  reverseAccel: 330,
  brake: 1100,
  drag: 0.9, // v_max ≈ accel / drag
  grassDrag: 2.6,
  grip: 9,
  driftGrip: 2.2,
  turnRate: 2.9,
  nitroDrain: 0.45, // pro Sekunde
  nitroRefill: 0.07,
};

export function createCar({ id, name, color, x, y, a, idx, isBot = false, skill = 1 }) {
  return {
    id, name, color, isBot, skill,
    x, y, a, vx: 0, vy: 0,
    idx, lap: 0, nextCp: 4,
    progress: idx / 1e6, // wird nach erstem Update korrekt gesetzt
    finished: false, finishTime: 0,
    nitro: 1, usingNitro: false,
    drifting: false, offroad: false, slip: 0,
    speed: 0,
    // KI
    lane: (Math.random() - 0.5) * 0.5,
    laneTimer: 0,
    stuckTimer: 0,
  };
}

const CHECKPOINTS = 4;

export function updateCar(car, input, dt, track, racing) {
  const cos = Math.cos(car.a), sin = Math.sin(car.a);
  let fwd = car.vx * cos + car.vy * sin;
  let lat = -car.vx * sin + car.vy * cos;

  const near = nearestLocal(track, car.x, car.y, car.idx);
  car.idx = near.idx;
  car.offroad = near.dist > track.width / 2 + 4;

  const canDrive = racing && !car.finished;
  const inp = canDrive ? input : { up: false, down: false, left: false, right: false, drift: false, nitro: false };
  if (car.finished) inp.down = car.speed > 40; // nach dem Ziel ausrollen

  // Lenkung – abhängig von Geschwindigkeit
  const steer = (inp.left ? -1 : 0) + (inp.right ? 1 : 0);
  const speedFactor = Math.max(-1, Math.min(1, fwd / 220));
  const highSpeedDamp = 1 - Math.min(0.35, Math.abs(fwd) / 2400);
  const driftBoost = inp.drift ? 1.35 : 1;
  car.a += steer * CAR.turnRate * speedFactor * highSpeedDamp * driftBoost * dt;

  // Antrieb
  car.usingNitro = false;
  if (inp.up) {
    let acc = CAR.accel;
    if (inp.nitro && car.nitro > 0.02) {
      acc += CAR.nitroAccel;
      car.nitro = Math.max(0, car.nitro - CAR.nitroDrain * dt);
      car.usingNitro = true;
    }
    fwd += acc * dt;
  }
  if (inp.down) {
    if (fwd > 15) fwd -= CAR.brake * dt;
    else fwd -= CAR.reverseAccel * dt;
  }
  if (!car.usingNitro) car.nitro = Math.min(1, car.nitro + CAR.nitroRefill * dt);

  // Luftwiderstand / Rollwiderstand
  const drag = car.offroad ? CAR.grassDrag : CAR.drag;
  fwd *= Math.exp(-drag * dt);
  if (!inp.up && !inp.down) fwd *= Math.exp(-0.6 * dt);
  if (fwd < -260) fwd = -260;

  // Seitenhaftung – beim Driften weniger
  const grip = inp.drift ? CAR.driftGrip : car.offroad ? CAR.grip * 0.6 : CAR.grip;
  lat *= Math.exp(-grip * dt);
  car.drifting = Math.abs(lat) > 90 && Math.abs(fwd) > 150;
  car.slip = lat;
  // Drift-Belohnung: etwas Nitro zurück
  if (car.drifting && inp.drift && !car.offroad) car.nitro = Math.min(1, car.nitro + 0.12 * dt);

  const c2 = Math.cos(car.a), s2 = Math.sin(car.a);
  car.vx = fwd * c2 - lat * s2;
  car.vy = fwd * s2 + lat * c2;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.speed = Math.hypot(car.vx, car.vy);

  // Streckenbegrenzung
  const nearAfter = nearestLocal(track, car.x, car.y, car.idx);
  const limit = track.wallDist - CAR.radius;
  if (nearAfter.dist > limit) {
    const i = nearAfter.idx;
    const nx = (car.x - track.xs[i]) / nearAfter.dist;
    const ny = (car.y - track.ys[i]) / nearAfter.dist;
    car.x = track.xs[i] + nx * limit;
    car.y = track.ys[i] + ny * limit;
    const vn = car.vx * nx + car.vy * ny;
    if (vn > 0) {
      car.vx -= vn * nx * 1.4;
      car.vy -= vn * ny * 1.4;
      car.vx *= 0.8;
      car.vy *= 0.8;
      car.hitWall = Math.min(1, vn / 400);
    }
  }

  updateLap(car, track);
}

function updateLap(car, track) {
  const frac = car.idx / track.N;
  if (car.nextCp < CHECKPOINTS) {
    const cpFrac = car.nextCp / CHECKPOINTS;
    if (frac >= cpFrac && frac < cpFrac + 0.12) car.nextCp++;
  } else if (frac < 0.1) {
    car.lap++;
    car.nextCp = 1;
    car.justCrossed = true;
  }
  const wrap = car.nextCp === 1 && frac > 0.5 ? 1 : 0;
  car.progress = car.lap + frac - wrap;
}

// Kollision zwischen zwei Autos (beide lokal simuliert, oder b kinematisch)
export function collideCars(a, b, bKinematic = false) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const minD = CAR.radius * 2;
  if (d >= minD || d === 0) return false;
  const nx = dx / d, ny = dy / d;
  const overlap = minD - d;
  const rvx = a.vx - b.vx, rvy = a.vy - b.vy;
  const vn = rvx * nx + rvy * ny;
  if (bKinematic) {
    a.x -= nx * overlap;
    a.y -= ny * overlap;
    if (vn > 0) {
      a.vx -= vn * nx * 1.1;
      a.vy -= vn * ny * 1.1;
    }
  } else {
    a.x -= nx * overlap / 2;
    a.y -= ny * overlap / 2;
    b.x += nx * overlap / 2;
    b.y += ny * overlap / 2;
    if (vn > 0) {
      const j = vn * 0.9;
      a.vx -= j * nx; a.vy -= j * ny;
      b.vx += j * nx; b.vy += j * ny;
    }
  }
  return vn > 60 ? Math.min(1, vn / 500) : 0;
}

// KI: folgt der Ideallinie mit Vorausschau und bremst vor Kurven
export function botInput(car, track, dt, leaderProgress) {
  const N = track.N;
  car.laneTimer -= dt;
  if (car.laneTimer <= 0) {
    car.laneTimer = 2 + Math.random() * 3;
    car.lane = Math.max(-0.35, Math.min(0.35, car.lane + (Math.random() - 0.5) * 0.3));
  }

  const look = Math.round(10 + car.speed / 30);
  const ti = (car.idx + look) % N;
  // Ideallinie: in Kurven zur Innenseite
  const curvAhead = track.curv[(car.idx + look + 10) % N];
  const inside = Math.max(-0.35, Math.min(0.35, -curvAhead * 0.6));
  const off = (car.lane + inside) * track.width;
  const tx = track.xs[ti] - track.ty[ti] * off;
  const ty = track.ys[ti] + track.tx[ti] * off;

  let diff = Math.atan2(ty - car.y, tx - car.x) - car.a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;

  // Maximale Krümmung auf dem Bremsweg
  let maxC = 0;
  const range = Math.round(18 + car.speed / 14);
  for (let k = 4; k < range; k += 3) maxC = Math.max(maxC, Math.abs(track.curv[(car.idx + k) % N]));

  // Leichtes Gummiband, damit Rennen spannend bleiben
  let rubber = 1;
  if (leaderProgress !== undefined) {
    const gap = leaderProgress - car.progress;
    rubber = 1 + Math.max(-0.08, Math.min(0.1, gap * 0.25));
  }
  const vMax = 700 * car.skill * rubber;
  const target = Math.max(230, vMax * (1 - Math.min(0.68, maxC * 0.62)));

  const input = {
    left: diff < -0.05,
    right: diff > 0.05,
    up: car.speed < target,
    down: car.speed > target + 70,
    drift: Math.abs(diff) > 0.55 && car.speed > 300,
    nitro: maxC < 0.25 && car.nitro > 0.4 && Math.random() < car.skill * 0.9,
  };

  // Festgefahren? Kurz zurücksetzen
  if (car.speed < 30 && !car.finished) car.stuckTimer += dt;
  else car.stuckTimer = Math.max(0, car.stuckTimer - dt);
  if (car.stuckTimer > 1.2) {
    input.up = false;
    input.down = true;
    input.left = !input.left;
    input.right = !input.right;
    if (car.stuckTimer > 2.2) car.stuckTimer = 0;
  }
  return input;
}
