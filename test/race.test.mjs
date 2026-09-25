// KI-Rennsimulation: Alle Autotypen müssen jede Strecke sauber zu Ende fahren.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack, gridPosition, TRACK_IDS } from '../public/js/tracks.js';
import { createCar, updateCar, collideCars, botInput, CAR_TYPE_IDS } from '../public/js/car.js';

// Fester Zufall, damit der Test reproduzierbar ist
function seeded(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function simulate(id, laps = 2) {
  Math.random = seeded(42);
  const t = buildTrack(id);
  const cars = [];
  for (let s = 0; s < 6; s++) {
    cars.push(createCar({ id: s, name: 'b' + s, color: '#fff', isBot: true, skill: 0.93, carType: CAR_TYPE_IDS[s % CAR_TYPE_IDS.length], ...gridPosition(t, s) }));
  }
  const dt = 1 / 120;
  let time = 0, walls = 0;
  const events = {};
  while (time < 400 && !cars.every((c) => c.finished)) {
    const lead = Math.max(...cars.map((c) => c.progress));
    for (const c of cars) {
      c.hitWall = 0;
      updateCar(c, botInput(c, t, dt, lead), dt, t, true, time * 1000);
      if (c.hitWall) walls++;
      for (const e of c.events) events[e] = (events[e] || 0) + 1;
      c.events.length = 0;
      if (c.lap > laps && !c.finished) {
        c.finished = true;
        c.finishTime = time;
      }
    }
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) collideCars(cars[i], cars[j]);
    time += dt;
  }
  return { cars, walls, events, time };
}

for (const id of TRACK_IDS) {
  test(`Rennen auf ${id}: alle KI-Autos kommen an`, () => {
    const { cars, walls, events, time } = simulate(id);
    for (const c of cars) assert.ok(c.finished, `${c.name} (${c.carType}) nicht im Ziel, Fortschritt ${c.progress.toFixed(2)}`);
    assert.ok(walls < 60, `zu viele Wandkontakte: ${walls}`);
    const times = cars.map((c) => c.finishTime);
    const spread = Math.max(...times) - Math.min(...times);
    assert.ok(spread < time * 0.25, `Feld zu weit auseinander: ${spread.toFixed(1)} s`);
    assert.ok(events.boost > 0, 'kein Boost-Feld ausgelöst');
  });
}

test('Ein Auto bleibt auf der Strecke, auch wenn es geradeaus fährt', () => {
  const t = buildTrack('serpentine');
  const car = createCar({ id: 'x', name: 'x', color: '#fff', ...gridPosition(t, 0) });
  const dt = 1 / 120;
  for (let i = 0; i < 120 * 30; i++) updateCar(car, { up: true }, dt, t, true, i * dt * 1000);
  const d = Math.hypot(t.xs[car.idx] - car.x, t.ys[car.idx] - car.y);
  assert.ok(d <= t.wallDist, 'Auto hat die Begrenzung durchbrochen');
  assert.ok(Number.isFinite(car.x) && Number.isFinite(car.a));
});
