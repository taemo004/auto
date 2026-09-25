// Prüft die Streckengeometrie: keine Abkürzungen, brauchbare Kurven, Spezialelemente auf der Strecke.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack, TRACK_IDS, TRACK_DEFS } from '../public/js/tracks.js';

for (const id of TRACK_IDS) {
  test(`Strecke ${id}: Geometrie`, () => {
    const t = buildTrack(id);
    assert.ok(t.N > 300, 'Strecke zu kurz');

    // Verschiedene Streckenteile dürfen sich nicht überlappen (sonst könnte man abkürzen)
    const need = 2 * t.wallDist + 40;
    let worst = Infinity;
    for (let i = 0; i < t.N; i += 2) {
      for (let j = i + 2; j < t.N; j += 2) {
        const along = Math.min(j - i, t.N - (j - i)) * t.spacing;
        if (along < t.wallDist * 3.2) continue;
        const d = Math.hypot(t.xs[i] - t.xs[j], t.ys[i] - t.ys[j]);
        if (d < worst) worst = d;
      }
    }
    assert.ok(worst >= need, `Streckenteile zu nah beieinander: ${worst.toFixed(0)} < ${need}`);

    // Keine unfahrbar engen Kurven
    let maxC = 0;
    for (const c of t.curv) maxC = Math.max(maxC, Math.abs(c));
    assert.ok(maxC < 1.6, `Kurve zu eng: ${maxC.toFixed(2)}`);

    // Spezialelemente liegen auf der Fahrbahn
    for (const f of t.features) {
      assert.ok(Math.abs(f.lat) + (f.r || f.halfW) <= t.width / 2 + 1, `${f.type} bei ${f.idx} ragt über den Rand`);
    }
    assert.ok(t.decor.length > 100, 'zu wenig Dekoration');
  });
}

test('Bestenlisten-Regeln kennen alle Strecken', async () => {
  const rules = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(new URL('../firebase-rules.json', import.meta.url), 'utf8')));
  const validate = rules.rules.laps.$track.$name['.validate'];
  for (const id of TRACK_IDS) assert.ok(validate.includes(id), `${id} fehlt in firebase-rules.json`);
  for (const id of TRACK_IDS) assert.ok(TRACK_DEFS[id].name, 'Strecke ohne Namen');
});
