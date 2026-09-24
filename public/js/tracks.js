// Streckendefinitionen und Geometrie (Catmull-Rom-Spline, gleichmäßig abgetastet)

export const TRACK_DEFS = {
  speedway: {
    name: 'Speedway',
    desc: 'Schnelles Oval mit Schikane – Vollgas!',
    width: 200,
    grass: '#3f8f3a',
    grass2: '#46993f',
    points: [
      [0, 0], [900, 0], [1600, 0], [2100, 150], [2350, 550], [2250, 1000], [1850, 1250],
      [1350, 1200], [1100, 1400], [750, 1450], [0, 1450], [-500, 1250], [-700, 800], [-550, 250],
    ],
  },
  serpentine: {
    name: 'Serpentine',
    desc: 'Kurvige Bergstrecke – Drift ist Pflicht.',
    width: 180,
    grass: '#5a8f3a',
    grass2: '#629a41',
    points: [
      [0, 0], [800, -100], [1350, 150], [1350, 650], [900, 850], [750, 1250], [1150, 1550],
      [1800, 1400], [2300, 1700], [2200, 2250], [1600, 2450], [800, 2350], [250, 2050],
      [-250, 1550], [-100, 1000], [-550, 650], [-500, 150],
    ],
  },
  harbor: {
    name: 'Hafenkurs',
    desc: 'Technischer Stadtkurs mit engen Haarnadeln.',
    width: 190,
    grass: '#4d7f52',
    grass2: '#558a5a',
    points: [
      [0, 0], [700, 0], [1100, -350], [1700, -400], [2100, -50], [1850, 450], [1250, 500],
      [950, 850], [1300, 1150], [2000, 1150], [2400, 1550], [2050, 2000], [1200, 2050],
      [400, 2000], [-200, 1650], [-150, 1150], [-550, 800], [-450, 300],
    ],
  },
};

export const TRACK_IDS = Object.keys(TRACK_DEFS);

const SPACING = 10;

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
  ];
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildTrack(id) {
  const def = TRACK_DEFS[id] || TRACK_DEFS.speedway;
  const pts = def.points;
  const n = pts.length;

  // Dicht abtasten
  const dense = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let s = 0; s < 40; s++) dense.push(catmull(p0, p1, p2, p3, s / 40));
  }

  // Gleichmäßig neu abtasten
  const samples = [];
  let carry = 0;
  samples.push(dense[0]);
  for (let i = 0; i < dense.length; i++) {
    const a = dense[i];
    const b = dense[(i + 1) % dense.length];
    const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let d = SPACING - carry;
    while (d <= segLen) {
      const t = d / segLen;
      samples.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      d += SPACING;
    }
    carry = segLen - (d - SPACING);
  }
  // Letzten Punkt entfernen, falls er zu nah am Start liegt
  const last = samples[samples.length - 1];
  if (Math.hypot(last[0] - samples[0][0], last[1] - samples[0][1]) < SPACING * 0.5) samples.pop();

  const N = samples.length;
  const xs = new Float32Array(N), ys = new Float32Array(N);
  const tx = new Float32Array(N), ty = new Float32Array(N);
  const curv = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    xs[i] = samples[i][0];
    ys[i] = samples[i][1];
  }
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N;
    const dx = xs[b] - xs[a], dy = ys[b] - ys[a];
    const l = Math.hypot(dx, dy) || 1;
    tx[i] = dx / l;
    ty[i] = dy / l;
  }
  // Krümmung (Winkeländerung über ein Fenster), für die KI
  for (let i = 0; i < N; i++) {
    const a = (i - 8 + N) % N, b = (i + 8) % N;
    let d = Math.atan2(ty[b], tx[b]) - Math.atan2(ty[a], tx[a]);
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    curv[i] = d;
  }

  const width = def.width;
  const wallDist = width / 2 + 110;

  // Begrenzungslinien (links/rechts)
  const offsetLine = (dist) => {
    const line = [];
    for (let i = 0; i < N; i++) line.push([xs[i] - ty[i] * dist, ys[i] + tx[i] * dist]);
    return line;
  };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < N; i++) {
    minX = Math.min(minX, xs[i]); maxX = Math.max(maxX, xs[i]);
    minY = Math.min(minY, ys[i]); maxY = Math.max(maxY, ys[i]);
  }

  const track = {
    id,
    name: def.name,
    width,
    wallDist,
    grass: def.grass,
    grass2: def.grass2,
    N,
    spacing: SPACING,
    length: N * SPACING,
    xs, ys, tx, ty, curv,
    bounds: { minX: minX - 600, minY: minY - 600, maxX: maxX + 600, maxY: maxY + 600 },
    wallL: offsetLine(wallDist),
    wallR: offsetLine(-wallDist),
    decor: [],
  };

  // Dekoration: Bäume und Büsche abseits der Strecke
  const rnd = mulberry32(id.length * 9973 + N);
  const b = track.bounds;
  for (let k = 0; k < 420; k++) {
    const x = b.minX + rnd() * (b.maxX - b.minX);
    const y = b.minY + rnd() * (b.maxY - b.minY);
    const near = nearestFull(track, x, y);
    if (near.dist < wallDist + 60) continue;
    track.decor.push({ x, y, r: 22 + rnd() * 30, kind: rnd() < 0.75 ? 'tree' : 'bush', shade: rnd() });
  }
  return track;
}

export function nearestFull(track, x, y) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < track.N; i++) {
    const dx = track.xs[i] - x, dy = track.ys[i] - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = i; }
  }
  return { idx: best, dist: Math.sqrt(bestD) };
}

// Lokale Suche um den letzten bekannten Index herum
export function nearestLocal(track, x, y, hint, win = 40) {
  const N = track.N;
  let best = hint, bestD = Infinity;
  for (let k = -win; k <= win; k++) {
    const i = (hint + k + N) % N;
    const dx = track.xs[i] - x, dy = track.ys[i] - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = i; }
  }
  const dist = Math.sqrt(bestD);
  if (dist > track.wallDist * 1.6) return nearestFull(track, x, y);
  return { idx: best, dist };
}

// Startaufstellung: zwei Spalten hinter der Startlinie
export function gridPosition(track, slot) {
  const row = Math.floor(slot / 2);
  const col = slot % 2;
  const back = 6 + row * 7; // Samples hinter der Linie
  const i = (track.N - back) % track.N;
  const side = (col === 0 ? -1 : 1) * track.width * 0.22;
  return {
    x: track.xs[i] - track.ty[i] * side,
    y: track.ys[i] + track.tx[i] * side,
    a: Math.atan2(track.ty[i], track.tx[i]),
    idx: i,
  };
}
