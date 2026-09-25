// Raumlogik des Gastgebers: Beitreten, Start, Zieleinlauf, Ergebnisse, Host-Wechsel im Raum.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomHost } from '../public/js/room.js';

function client(host) {
  const inbox = [];
  const id = host.addClient((m) => inbox.push(m));
  const last = (t) => [...inbox].reverse().find((m) => m.t === t);
  return { id, inbox, last, send: (m) => host.handle(id, m) };
}

test('Lobby: beitreten, Einstellungen, Host-Rechte', () => {
  const host = new RoomHost('TEST', false);
  const a = client(host), b = client(host);
  a.send({ t: 'hello', name: 'Anna', color: '#e63946', carType: 'drift' });
  a.send({ t: 'enter' });
  b.send({ t: 'hello', name: '<Ben>', color: 'kaputt', carType: 'unsinn' });
  b.send({ t: 'enter' });
  const room = b.last('room');
  assert.equal(room.hostId, a.id);
  assert.deepEqual(room.players.map((p) => p.name), ['Anna', 'Ben']);
  assert.equal(room.players[0].carType, 'drift');
  assert.equal(room.players[1].carType, 'sport');
  assert.match(room.players[1].color, /^#[0-9a-f]{6}$/i);
  assert.notEqual(room.players[0].color, room.players[1].color);

  b.send({ t: 'settings', track: 'neon', laps: 5 }); // kein Host → ignoriert
  assert.notEqual(b.last('room').track, 'neon');
  a.send({ t: 'settings', track: 'neon', laps: 5 });
  assert.equal(b.last('room').track, 'neon');
  assert.equal(b.last('room').laps, 5);
  host.destroy();
});

test('Rennen: Start, Zielprüfung, Ergebnisse, Host-Wechsel', async () => {
  const host = new RoomHost('TEST', false);
  const a = client(host), b = client(host);
  for (const c of [a, b]) {
    c.send({ t: 'hello', name: 'P' + c.id, color: '#3a86ff' });
    c.send({ t: 'enter' });
  }
  host.laps = 1;
  b.send({ t: 'startRace' }); // kein Host
  assert.equal(host.state, 'lobby');
  a.send({ t: 'startRace' });
  assert.equal(host.state, 'countdown');
  assert.equal(b.last('start').grid.length, 2);
  host.state = 'racing';
  host.goAt = Date.now() - 20000;

  // Zieleinlauf ohne genug Fortschritt wird abgelehnt
  b.send({ t: 'st', a: [0, 0, 0, 0, 0, 0.5, 0] });
  b.send({ t: 'finish' });
  assert.equal(host.results.length, 0);
  b.send({ t: 'st', a: [0, 0, 0, 0, 0, 2.0, 0, 0] });
  b.send({ t: 'finish' });
  assert.equal(host.results.length, 1);
  assert.ok(host.results[0].time >= 19000 && host.results[0].time <= 21000, 'Zeit wird vom Host gemessen');
  assert.equal(a.last('finished').pos, 1);

  // Host verlässt den Raum während des Rennens → B wird Host, Rennen endet mit Ergebnis
  host.removeClient(a.id);
  assert.equal(host.hostId, b.id);
  const results = b.last('results');
  assert.ok(results, 'Ergebnisse gesendet');
  assert.equal(results.results[0].id, b.id);
  assert.equal(host.state, 'lobby');
  host.destroy();
});
