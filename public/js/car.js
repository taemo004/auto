// Fahrzeugphysik (Arcade mit Drift), Spezialelemente, Rundenlogik und KI-Fahrer

import { nearestLocal, SURFACES } from './tracks.js';

export const CAR_TYPES = {
  sport: {
    name: 'Sportwagen', desc: 'Ausgewogen – gut für den Einstieg',
    length: 46, width: 24, accel: 640, drag: 0.9, grip: 9, driftGrip: 2.2, turnRate: 2.9, mass: 1,
  },
  drift: {
    name: 'Drifter', desc: 'Wendig, rutscht gern – lädt Mini-Turbos schnell',
    length: 44, width: 23, accel: 630, drag: 0.9, grip: 7.2, driftGrip: 1.5, turnRate: 3.35, mass: 0.9,
  },
  muscle: {
    name: 'Muscle Car', desc: 'Höchste Endgeschwindigkeit, träge in Kurven',
    length: 50, width: 26, accel: 690, drag: 0.86, grip: 8.2, driftGrip: 2.6, turnRate: 2.5, mass: 1.25,
  },
};
export const CAR_TYPE_IDS = Object.keys(CAR_TYPES);

export const CAR = {
  radius: 19,
  nitroAccel: 520,
  boostAccel: 950,
  reverseAccel: 330,
  brake: 1100,
  grassDrag: 2.6,
  nitroDrain: 0.45, // pro Sekunde
  nitroRefill: 0.06,
  gravity: 1700,
};

export function createCar({ id, name, color, x, y, a, idx, isBot = false, skill = 1, carType = 'sport' }) {
  const type = CAR_TYPES[carType] ? carType : 'sport';
  return {
    id, name, color, isBot, skill,
    carType: type, spec: CAR_TYPES[type],
    x, y, a, vx: 0, vy: 0, z: 0, vz: 0,
    idx, lap: 0, nextCp: 4,
    progress: 0,
    finished: false, finishTime: 0,
    nitro: 1, usingNitro: false,
    boost: 0, oil: 0, oilDir: 1, driftCharge: 0,
    steer: 0,
    drifting: false, offroad: false, slip: 0, surface: 0,
    speed: 0,
    events: [],
    // KI
    lane: (Math.random() - 0.5) * 0.5,
    laneTimer: 0,
    stuckTimer: 0,
  };
}

const CHECKPOINTS = 4;
const NO_INPUT = { up: false, down: false, left: false, right: false, drift: false, nitro: false };

export function updateCar(car, input, dt, track, racing, now = 0) {
  const spec = car.spec;
  const cos = Math.cos(car.a), sin = Math.sin(car.a);
  let fwd = car.vx * cos + car.vy * sin;
  let lat = -car.vx * sin + car.vy * cos;

  const near = nearestLocal(track, car.x, car.y, car.idx);
  car.idx = near.idx;
  const latPos = (car.x - track.xs[car.idx]) * -track.ty[car.idx] + (car.y - track.ys[car.idx]) * track.tx[car.idx];
  car.latPos = latPos;
  car.offroad = Math.abs(latPos) > track.width / 2 + 4;
  car.surface = car.offroad ? -1 : track.surf[car.idx];
  const airborne = car.z > 0;

  const canDrive = racing && !car.finished && !(car.stall > 0);
  let inp = canDrive ? input : NO_INPUT;
  if (car.finished) inp = { ...NO_INPUT, down: car.speed > 40 }; // nach dem Ziel ausrollen

  // Lenkung – analog direkt, digital (Tasten) sanft einlenken
  if (inp.steer !== undefined) {
    car.steer = inp.steer;
  } else {
    const target = (inp.left ? -1 : 0) + (inp.right ? 1 : 0);
    const rate = Math.sign(target) !== Math.sign(car.steer) || Math.abs(target) < Math.abs(car.steer) ? 14 : 8;
    const d = target - car.steer;
    car.steer += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
  }

  // Untergrund
  const surf = car.offroad ? SURFACES.offroad : SURFACES[track.surfName[car.surface]];
  const speedFactor = Math.max(-1, Math.min(1, fwd / 220));
  const highSpeedDamp = 1 - Math.min(0.38, Math.abs(fwd) / 2200);
  const driftBoost = inp.drift ? 1.35 : 1;
  const oilFactor = car.oil > 0 ? 0.45 : 1;
  if (!airborne) car.a += car.steer * spec.turnRate * speedFactor * highSpeedDamp * driftBoost * oilFactor * dt;
  if (car.oil > 0) {
    car.a += car.oilDir * 1.8 * dt;
    car.oil -= dt;
  }
  if (car.stall > 0) car.stall -= dt;

  // Antrieb
  car.usingNitro = false;
  if (!airborne) {
    if (inp.up) {
      let acc = spec.accel * surf.accel;
      if (inp.nitro && car.nitro > 0.02) {
        acc += CAR.nitroAccel;
        car.nitro = Math.max(0, car.nitro - CAR.nitroDrain * dt);
        car.usingNitro = true;
      }
      fwd += acc * dt;
    }
    if (inp.down) {
      if (fwd > 15) fwd -= CAR.brake * surf.brake * dt;
      else fwd -= CAR.reverseAccel * dt;
    }
  }
  if (car.boost > 0) {
    if (inp.down) car.boost = 0; // Bremsen beendet den Boost
    else fwd += CAR.boostAccel * dt;
    car.boost -= dt;
  }
  if (!car.usingNitro) car.nitro = Math.min(1, car.nitro + CAR.nitroRefill * dt);

  // Luft-/Rollwiderstand
  if (!airborne) {
    const drag = car.offroad ? CAR.grassDrag : spec.drag * surf.drag * (car.boost > 0 ? 0.55 : 1);
    fwd *= Math.exp(-drag * dt);
    if (!inp.up && !inp.down) fwd *= Math.exp(-0.6 * dt);
  } else {
    fwd *= Math.exp(-0.15 * dt);
  }
  if (fwd < -260) fwd = -260;

  // Seitenhaftung – beim Driften, auf Eis und Öl weniger
  if (!airborne) {
    let grip = (inp.drift ? spec.driftGrip : spec.grip) * surf.grip;
    if (car.oil > 0) grip *= 0.12;
    lat *= Math.exp(-grip * dt);
  }
  car.drifting = !airborne && Math.abs(lat) > 90 && Math.abs(fwd) > 150;
  car.slip = lat;

  // Mini-Turbo: Drift halten und loslassen
  if (car.drifting && inp.drift && !car.offroad) {
    car.driftCharge += dt;
    car.nitro = Math.min(1, car.nitro + 0.06 * dt);
  } else if (!inp.drift && car.driftCharge > 0) {
    if (car.driftCharge > 0.8) {
      car.boost = Math.max(car.boost, Math.min(0.9, 0.25 + car.driftCharge * 0.3));
      car.events.push(car.driftCharge > 1.8 ? 'turbo2' : 'turbo');
    }
    car.driftCharge = 0;
  } else if (!car.drifting) {
    car.driftCharge = Math.max(0, car.driftCharge - dt * 2);
  }

  const c2 = Math.cos(car.a), s2 = Math.sin(car.a);
  car.vx = fwd * c2 - lat * s2;
  car.vy = fwd * s2 + lat * c2;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.speed = Math.hypot(car.vx, car.vy);

  // Sprung
  if (airborne) {
    car.vz -= CAR.gravity * dt;
    car.z += car.vz * dt;
    if (car.z <= 0) {
      car.z = 0;
      car.vz = 0;
      car.events.push('land');
    }
  }

  // Spezialelemente auf der Strecke
  if (!airborne) touchFeatures(car, track, latPos, fwd, now);

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

function touchFeatures(car, track, latPos, fwd, now) {
  const N = track.N;
  for (const f of track.near[car.idx] || []) {
    let di = car.idx - f.idx;
    if (di > N / 2) di -= N;
    if (di < -N / 2) di += N;
    const along = di * track.spacing;
    const across = latPos - f.lat;
    if (f.type === 'oil' || f.type === 'nitro') {
      if (along * along + across * across > (f.r + 12) * (f.r + 12)) continue;
    } else if (Math.abs(along) > f.halfLen || Math.abs(across) > f.halfW + 8) continue;

    if (f.type === 'boost') {
      if (car.boost < 0.5) car.events.push('boost');
      car.boost = Math.max(car.boost, 0.7);
    } else if (f.type === 'ramp') {
      if (fwd > 180) {
        car.vz = Math.min(650, fwd * 0.62);
        car.z = 0.01;
        car.events.push('jump');
      }
    } else if (f.type === 'oil') {
      if (car.oil <= 0 && car.speed > 120) {
        car.oil = 0.6;
        car.oilDir = Math.random() < 0.5 ? -1 : 1;
        car.events.push('oil');
      }
    } else if (f.type === 'nitro') {
      if (!f.takenUntil || now > f.takenUntil) {
        f.takenUntil = now + 8000;
        car.nitro = Math.min(1, car.nitro + 0.5);
        car.events.push('nitro');
      }
    }
  }
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
  if (a.z > 4 || b.z > 4) return 0;
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const minD = CAR.radius * 2;
  if (d >= minD || d === 0) return 0;
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
    const ma = a.spec.mass, mb = b.spec.mass;
    const ka = mb / (ma + mb), kb = ma / (ma + mb);
    a.x -= nx * overlap * ka;
    a.y -= ny * overlap * ka;
    b.x += nx * overlap * kb;
    b.y += ny * overlap * kb;
    if (vn > 0) {
      const j = vn * 1.8;
      a.vx -= j * nx * ka; a.vy -= j * ny * ka;
      b.vx += j * nx * kb; b.vy += j * ny * kb;
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

  // Maximale Krümmung auf dem Bremsweg, Untergrund berücksichtigen
  let maxC = 0, minGrip = 1;
  const range = Math.round(18 + car.speed / 14);
  for (let k = 4; k < range; k += 3) {
    const i = (car.idx + k) % N;
    maxC = Math.max(maxC, Math.abs(track.curv[i]));
    minGrip = Math.min(minGrip, SURFACES[track.surfName[track.surf[i]]].grip);
  }

  // Leichtes Gummiband, damit Rennen spannend bleiben
  let rubber = 1;
  if (leaderProgress !== undefined) {
    const gap = leaderProgress - car.progress;
    rubber = 1 + Math.max(-0.08, Math.min(0.1, gap * 0.25));
  }
  const vMax = (car.spec.accel / car.spec.drag) * car.skill * rubber;
  const cornerK = 0.62 / Math.pow(minGrip, 0.6);
  const target = Math.max(200, vMax * (1 - Math.min(0.72, maxC * cornerK)));

  const deadzone = 0.05;
  return {
    steer: Math.max(-1, Math.min(1, diff * 3)) * (Math.abs(diff) > deadzone ? 1 : 0),
    up: car.speed < target,
    down: car.speed > target + 70,
    drift: Math.abs(diff) > 0.55 && car.speed > 300,
    nitro: maxC < 0.25 && car.nitro > 0.4 && Math.random() < car.skill * 0.9,
    ...stuck(car, dt),
  };
}

function stuck(car, dt) {
  // Festgefahren? Kurz zurücksetzen
  if (car.speed < 30 && !car.finished) car.stuckTimer += dt;
  else car.stuckTimer = Math.max(0, car.stuckTimer - dt);
  if (car.stuckTimer > 1.2) {
    if (car.stuckTimer > 2.2) car.stuckTimer = 0;
    return { up: false, down: true, steer: -Math.sign(car.steer || 1) };
  }
  return {};
}
