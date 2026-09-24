// Streckendefinitionen, Themen, Untergründe und Geometrie (Catmull-Rom-Spline, gleichmäßig abgetastet)

// Fahreigenschaften der Untergründe (Faktoren relativ zu Asphalt)
export const SURFACES = {
  asphalt: { grip: 1, drag: 1, accel: 1, brake: 1 },
  dirt: { grip: 0.6, drag: 1.1, accel: 0.93, brake: 0.75 },
  snow: { grip: 0.55, drag: 1.05, accel: 0.86, brake: 0.7 },
  ice: { grip: 0.3, drag: 0.92, accel: 0.65, brake: 0.45 },
  offroad: { grip: 0.6, drag: 1, accel: 0.8, brake: 0.8 },
};
const SURF_NAMES = ['asphalt', 'dirt', 'snow', 'ice'];

export const THEMES = {
  meadow: {
    ground: '#3f8f3a', ground2: '#46993f', runoff: '#c9b98f', curbA: '#ffffff', curbB: '#d62828',
    wall: '#222', wall2: '#e8e8e8', line: 'rgba(255,255,255,0.45)',
    decor: { tree: 6, bush: 2, flowers: 1 }, stands: '#2b6cb0',
  },
  mountain: {
    ground: '#4d7a37', ground2: '#54833d', runoff: '#9c8f76', curbA: '#ffffff', curbB: '#1f7a3a',
    wall: '#333', wall2: '#f2c94c', line: 'rgba(255,255,255,0.4)',
    decor: { pine: 7, rock: 3, tree: 1 }, stands: '#2f855a',
  },
  harbor: {
    ground: '#7d858e', ground2: '#78808a', runoff: '#666d75', curbA: '#ffffff', curbB: '#1e40af',
    wall: '#1f2937', wall2: '#facc15', line: 'rgba(255,255,255,0.5)',
    decor: { container: 6, building: 2, crates: 2 }, stands: '#1e40af', lamps: true, water: true,
  },
  desert: {
    ground: '#e0c285', ground2: '#dcbd7f', runoff: '#cfa96b', curbA: '#ffffff', curbB: '#e07a1f',
    wall: '#5c3d1e', wall2: '#f5e6c8', line: 'rgba(255,255,255,0)',
    decor: { cactus: 5, rock: 4, skull: 1 }, stands: '#c05621',
  },
  snow: {
    ground: '#eef3f8', ground2: '#e5edf5', runoff: '#d3e0ec', curbA: '#ffffff', curbB: '#2563eb',
    wall: '#1e3a8a', wall2: '#ffffff', line: 'rgba(255,255,255,0.6)',
    decor: { snowpine: 7, snowman: 1, rock: 1 }, stands: '#1e3a8a',
  },
  neon: {
    ground: '#131525', ground2: '#161a2d', runoff: '#1f2338', curbA: '#ff2bd6', curbB: '#00e5ff',
    wall: '#05060c', wall2: '#ff2bd6', line: 'rgba(0,229,255,0.55)',
    decor: { building: 8 }, stands: '#7c3aed', lamps: true, night: true,
  },
};

// Untergrund-Farben der Fahrbahn
export const ROAD_COLORS = {
  asphalt: ['#4a4d52', '#505359'],
  dirt: ['#a27850', '#ad845b'],
  snow: ['#dfe7ef', '#e8eef5'],
  ice: ['#9cc3e4', '#b0d2ee'],
};
export const NEON_ROAD = ['#262a3b', '#2b3043'];

// Spezialelemente: [typ, position (0–1 entlang der Strecke), spur (-0.5 … 0.5 der Breite)]
export const TRACK_DEFS = {
  speedway: {
    name: 'Speedway', desc: 'Schnelles Oval mit Schikane und Boost-Feldern.', theme: 'meadow',
    width: 200, surface: 'asphalt',
    points: [
      [0, 0], [900, 0], [1600, 0], [2100, 150], [2350, 550], [2250, 1000], [1850, 1250],
      [1350, 1200], [1100, 1400], [750, 1450], [0, 1450], [-500, 1250], [-700, 800], [-550, 250],
    ],
    features: [
      ['boost', 0.06, -0.2], ['boost', 0.06, 0.2], ['nitro', 0.2, 0], ['boost', 0.62, 0],
      ['nitro', 0.7, -0.25], ['nitro', 0.7, 0.25], ['oil', 0.46, 0.18],
    ],
  },
  serpentine: {
    name: 'Serpentine', desc: 'Kurvige Bergstrecke mit Schotterpassage und Sprung.', theme: 'mountain',
    width: 180, surface: 'asphalt',
    points: [
      [0, 0], [800, -100], [1350, 150], [1350, 650], [900, 850], [750, 1250], [1150, 1550],
      [1800, 1400], [2300, 1700], [2200, 2250], [1600, 2450], [800, 2350], [250, 2050],
      [-250, 1550], [-100, 1000], [-550, 650], [-500, 150],
    ],
    zones: [['dirt', 0.36, 0.5]],
    features: [['ramp', 0.07, 0], ['nitro', 0.3, 0.2], ['boost', 0.61, 0], ['oil', 0.8, -0.2], ['nitro', 0.9, 0]],
  },
  harbor: {
    name: 'Hafenkurs', desc: 'Technischer Stadtkurs zwischen Containern.', theme: 'harbor',
    width: 190, surface: 'asphalt',
    points: [
      [0, 0], [700, 0], [1100, -350], [1700, -400], [2100, -50], [1850, 450], [1250, 500],
      [950, 850], [1300, 1150], [2000, 1150], [2400, 1550], [2050, 2000], [1200, 2050],
      [400, 2000], [-200, 1650], [-150, 1150], [-550, 800], [-450, 300],
    ],
    features: [
      ['boost', 0.04, 0], ['oil', 0.25, -0.15], ['oil', 0.27, 0.2], ['nitro', 0.42, 0],
      ['boost', 0.55, 0.15], ['ramp', 0.72, 0], ['nitro', 0.88, -0.2],
    ],
  },
  desert: {
    name: 'Wüstenrallye', desc: 'Schotter, Sprünge und Kakteen – driften erwünscht!', theme: 'desert',
    width: 210, surface: 'dirt',
    points: [
      [0, 0], [1000, 0], [1700, -200], [2300, 100], [2500, 700], [2100, 1200], [1500, 1100],
      [1000, 1400], [1200, 1900], [800, 2300], [0, 2200], [-500, 1700], [-300, 1100],
      [-700, 600], [-500, 100],
    ],
    zones: [['asphalt', 0.97, 0.03]],
    features: [
      ['ramp', 0.08, 0], ['nitro', 0.16, 0], ['ramp', 0.3, 0], ['boost', 0.45, 0],
      ['oil', 0.55, 0.2], ['ramp', 0.66, 0], ['nitro', 0.78, 0.2], ['boost', 0.9, -0.1],
    ],
  },
  glacier: {
    name: 'Gletscherring', desc: 'Spiegelglattes Eis – früh bremsen, sanft lenken.', theme: 'snow',
    width: 220, surface: 'snow',
    points: [
      [0, 0], [1200, 0], [1900, 300], [2000, 900], [1500, 1300], [900, 1100], [400, 1400],
      [500, 2000], [1200, 2300], [2000, 2200], [2600, 2500], [2500, 3100], [1600, 3300],
      [400, 3200], [-400, 2700], [-600, 1800], [-500, 800], [-400, 250],
    ],
    zones: [['ice', 0.12, 0.26], ['ice', 0.52, 0.64], ['ice', 0.8, 0.88], ['asphalt', 0.985, 0.03]],
    features: [['boost', 0.05, 0], ['nitro', 0.3, 0.2], ['ramp', 0.44, 0], ['nitro', 0.7, -0.2], ['boost', 0.93, 0]],
  },
  neon: {
    name: 'Neon City', desc: 'Nachtrennen durch die Stadt mit vielen Boost-Feldern.', theme: 'neon',
    width: 190, surface: 'asphalt',
    points: [
      [0, 0], [1400, 0], [1600, 200], [1600, 800], [1800, 1000], [2400, 1000], [2600, 1200],
      [2600, 1900], [2400, 2100], [1200, 2100], [1000, 1900], [1000, 1400], [800, 1200],
      [200, 1200], [0, 1000], [-200, 800], [-200, 200],
    ],
    features: [
      ['boost', 0.08, -0.2], ['boost', 0.13, 0.2], ['nitro', 0.25, 0], ['boost', 0.36, 0],
      ['ramp', 0.47, 0], ['oil', 0.56, 0.2], ['boost', 0.64, -0.15], ['nitro', 0.75, 0.2], ['boost', 0.9, 0],
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

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function buildTrack(id) {
  const def = TRACK_DEFS[id] || TRACK_DEFS.speedway;
  const theme = THEMES[def.theme];
  const pts = def.points;
  const n = pts.length;

  // Dicht abtasten
  const dense = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let s = 0; s < 40; s++) dense.push(catmull(p0, p1, p2, p3, s / 40));
  }

  // Gleichmäßig neu abtasten
  const samples = [dense[0]];
  let carry = 0;
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

  // Untergrund je Abtastpunkt
  const surf = new Uint8Array(N).fill(SURF_NAMES.indexOf(def.surface));
  for (const [kind, from, to] of def.zones || []) {
    const a = Math.round(from * N), b = Math.round(to * N);
    const len = (b - a + N) % N;
    for (let k = 0; k <= len; k++) surf[(a + k) % N] = SURF_NAMES.indexOf(kind);
  }

  const width = def.width;
  const wallDist = width / 2 + 110;

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
    theme,
    themeId: def.theme,
    width,
    wallDist,
    N,
    spacing: SPACING,
    length: N * SPACING,
    xs, ys, tx, ty, curv, surf,
    surfName: SURF_NAMES,
    bounds: { minX: minX - 600, minY: minY - 600, maxX: maxX + 600, maxY: maxY + 600 },
    wallL: offsetLine(wallDist),
    wallR: offsetLine(-wallDist),
    features: [],
    near: [],
    decor: [],
    lamps: [],
    stands: [],
  };

  // Spezialelemente
  for (const [type, at, lane = 0] of def.features || []) {
    const idx = Math.round(at * N) % N;
    const f = { type, idx, lat: lane * width, x: 0, y: 0, a: Math.atan2(ty[idx], tx[idx]) };
    if (type === 'boost') Object.assign(f, { halfLen: 40, halfW: 34 });
    if (type === 'ramp') Object.assign(f, { halfLen: 24, halfW: width / 2 });
    if (type === 'oil') f.r = 38;
    if (type === 'nitro') f.r = 18;
    f.x = xs[idx] - ty[idx] * f.lat;
    f.y = ys[idx] + tx[idx] * f.lat;
    track.features.push(f);
    for (let k = -8; k <= 8; k++) {
      const i = (idx + k + N) % N;
      (track.near[i] ||= []).push(f);
    }
  }

  const rnd = mulberry32(hashStr(id));
  const b = track.bounds;

  // Tribünen an der Start-/Zielgeraden
  for (const side of [1, -1]) {
    for (let k = -1; k <= 1; k++) {
      const i = (k * 30 + N) % N;
      const off = side * (wallDist + 70);
      track.stands.push({
        x: xs[i] - ty[i] * off, y: ys[i] + tx[i] * off,
        a: Math.atan2(ty[i], tx[i]), w: 260, h: 90, side, seed: rnd(),
      });
    }
  }

  // Laternen entlang der Strecke
  if (theme.lamps) {
    for (let i = 0; i < N; i += 45) {
      const side = (i / 45) % 2 ? 1 : -1;
      const off = side * (wallDist + 18);
      track.lamps.push({ x: xs[i] - ty[i] * off, y: ys[i] + tx[i] * off });
    }
  }

  // Dekoration je nach Thema
  const kinds = Object.entries(theme.decor);
  const total = kinds.reduce((s, [, w]) => s + w, 0);
  const pick = () => {
    let r = rnd() * total;
    for (const [k, w] of kinds) if ((r -= w) < 0) return k;
    return kinds[0][0];
  };
  const big = { building: 1, container: 1 };
  for (let k = 0; k < 520; k++) {
    const x = b.minX + rnd() * (b.maxX - b.minX);
    const y = b.minY + rnd() * (b.maxY - b.minY);
    const kind = pick();
    const size = big[kind] ? 70 + rnd() * 70 : 22 + rnd() * 30;
    const near = nearestFull(track, x, y);
    if (near.dist < wallDist + 40 + (big[kind] ? size * 1.2 : size)) continue;
    if (track.stands.some((s) => Math.hypot(s.x - x, s.y - y) < 220)) continue;
    track.decor.push({ x, y, r: size, kind, shade: rnd(), a: rnd() * Math.PI, seed: rnd() });
  }
  // Große Objekte zuerst zeichnen
  track.decor.sort((p, q) => (big[q.kind] ? 1 : 0) - (big[p.kind] ? 1 : 0));
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
