// Raumlogik – läuft im Browser des Raum-Erstellers (Host) und übernimmt die Rolle des Servers:
// Lobby, Einstellungen, Countdown, Zustands-Relay, Zieleinlauf und Ergebnisse.

import { TRACK_IDS } from './tracks.js';

const MAX_PLAYERS = 8;
const TICK_MS = 50; // 20 Hz Zustands-Broadcast
const COUNTDOWN_MS = 3000;
const FINISH_GRACE_MS = 30000; // Nach dem ersten Zieleinlauf haben die anderen noch 30 s
const QUICK_AUTOSTART_MS = 15000;
const COLORS = ['#e63946', '#3a86ff', '#ffbe0b', '#06d6a0', '#8338ec', '#fb5607', '#ff006e', '#f1f1f1'];

const CAR_TYPES = ['sport', 'drift', 'muscle'];
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function sanitizeName(name) {
  const clean = String(name || '').replace(/[<>]/g, '').trim().slice(0, 16);
  return clean || 'Fahrer';
}

function sanitizeColor(color) {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : COLORS[Math.floor(Math.random() * COLORS.length)];
}

export class RoomHost {
  constructor(code, isPublic) {
    this.code = code;
    this.isPublic = isPublic;
    this.nextId = 1;
    this.clients = new Map(); // id -> { id, send, name, color, inRoom, state }
    this.hostId = null;
    this.state = 'lobby'; // lobby | countdown | racing
    this.track = TRACK_IDS[Math.floor(Math.random() * TRACK_IDS.length)];
    this.laps = 3;
    this.racers = [];
    this.results = [];
    this.firstFinishAt = 0;
    this.goAt = 0;
    this.raceTimer = null;
    this.autoStartTimer = null;
    this.autoStartAt = 0;
    this.tick = setInterval(() => this.broadcastStates(), TICK_MS);
  }

  destroy() {
    clearInterval(this.tick);
    clearTimeout(this.raceTimer);
    clearTimeout(this.autoStartTimer);
  }

  get players() {
    return [...this.clients.values()].filter((c) => c.inRoom);
  }

  // Neue Verbindung; send(msg) liefert eine Nachricht an genau diesen Client
  addClient(send) {
    const c = { id: this.nextId++, send, name: 'Fahrer', color: COLORS[0], carType: 'sport', inRoom: false, state: null };
    this.clients.set(c.id, c);
    send({ t: 'welcome', id: c.id });
    return c.id;
  }

  removeClient(id) {
    const c = this.clients.get(id);
    if (!c) return;
    this.leave(c);
    this.clients.delete(id);
  }

  broadcast(msg) {
    for (const c of this.players) c.send(msg);
  }

  roomInfo() {
    return {
      t: 'room',
      code: this.code,
      isPublic: this.isPublic,
      hostId: this.hostId,
      state: this.state,
      track: this.track,
      laps: this.laps,
      autoStartAt: this.autoStartAt ? this.autoStartAt - Date.now() : 0,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        carType: p.carType,
        racing: this.racers.includes(p.id) && this.state !== 'lobby',
      })),
    };
  }

  updateAutoStart() {
    if (!this.isPublic || this.state !== 'lobby') return;
    const n = this.players.length;
    if (n >= 2 && !this.autoStartTimer) {
      this.autoStartAt = Date.now() + QUICK_AUTOSTART_MS;
      this.autoStartTimer = setTimeout(() => {
        this.autoStartTimer = null;
        this.autoStartAt = 0;
        if (this.state === 'lobby' && this.players.length >= 1) this.startCountdown();
      }, QUICK_AUTOSTART_MS);
    } else if (n < 2 && this.autoStartTimer) {
      clearTimeout(this.autoStartTimer);
      this.autoStartTimer = null;
      this.autoStartAt = 0;
    }
  }

  enter(c) {
    if (c.inRoom) return;
    if (this.players.length >= MAX_PLAYERS) {
      return c.send({ t: 'error', code: 'full', msg: 'Der Raum ist voll.' });
    }
    // Farbe eindeutig machen
    const used = new Set(this.players.map((p) => p.color));
    if (used.has(c.color)) c.color = COLORS.find((col) => !used.has(col)) || c.color;
    c.inRoom = true;
    c.state = null;
    if (!this.hostId) this.hostId = c.id;
    c.send({ t: 'joined', code: this.code, id: c.id, color: c.color });
    this.updateAutoStart();
    this.broadcast(this.roomInfo());
  }

  leave(c) {
    if (!c.inRoom) return;
    c.inRoom = false;
    if (this.hostId === c.id) this.hostId = this.players.length ? this.players[0].id : null;
    this.broadcast({ t: 'left', id: c.id });
    this.updateAutoStart();
    this.broadcast(this.roomInfo());
    if (this.state !== 'lobby') this.checkRaceEnd();
  }

  startCountdown() {
    if (this.state !== 'lobby') return;
    clearTimeout(this.autoStartTimer);
    this.autoStartTimer = null;
    this.autoStartAt = 0;
    this.state = 'countdown';
    this.racers = this.players.map((p) => p.id);
    this.results = [];
    this.firstFinishAt = 0;
    const grid = this.racers.map((id, i) => ({ id, slot: i }));
    for (const p of this.players) p.state = null;
    this.broadcast(this.roomInfo());
    this.broadcast({ t: 'start', track: this.track, laps: this.laps, grid, countdown: COUNTDOWN_MS });
    this.goAt = Date.now() + COUNTDOWN_MS;
    this.raceTimer = setTimeout(() => {
      this.state = 'racing';
      this.broadcast(this.roomInfo());
    }, COUNTDOWN_MS);
  }

  checkRaceEnd() {
    const active = this.racers.filter((id) => this.clients.get(id)?.inRoom);
    const finished = new Set(this.results.map((r) => r.id));
    if (active.length === 0 || active.every((id) => finished.has(id))) this.endRace();
  }

  endRace() {
    if (this.state === 'lobby') return;
    clearTimeout(this.raceTimer);
    const results = [...this.results];
    for (const id of this.racers) {
      if (!results.find((r) => r.id === id)) {
        const p = this.clients.get(id);
        if (p && p.inRoom) results.push({ id, name: p.name, color: p.color, time: null, progress: p.state ? p.state.pr : 0 });
      }
    }
    // Nicht-Angekommene nach Fortschritt sortieren
    const done = results.filter((r) => r.time !== null);
    const dnf = results.filter((r) => r.time === null).sort((a, b) => b.progress - a.progress);
    this.state = 'lobby';
    this.racers = [];
    this.broadcast({ t: 'results', results: [...done, ...dnf] });
    this.updateAutoStart();
    this.broadcast(this.roomInfo());
  }

  broadcastStates() {
    if (this.state === 'lobby') return;
    const states = [];
    for (const p of this.players) if (p.state) states.push([p.id, ...p.state.arr]);
    if (states.length) this.broadcast({ t: 's', s: states });
  }

  handle(id, msg) {
    const c = this.clients.get(id);
    if (!c || !msg || typeof msg.t !== 'string') return;
    const isHost = this.hostId === c.id;

    switch (msg.t) {
      case 'hello':
        c.name = sanitizeName(msg.name);
        c.color = sanitizeColor(msg.color);
        if (CAR_TYPES.includes(msg.carType)) c.carType = msg.carType;
        if (c.inRoom) this.broadcast(this.roomInfo());
        break;

      case 'enter':
        this.enter(c);
        break;

      case 'leave':
        this.leave(c);
        break;

      case 'settings':
        if (c.inRoom && isHost && this.state === 'lobby') {
          if (TRACK_IDS.includes(msg.track)) this.track = msg.track;
          const laps = Math.round(num(msg.laps));
          if (laps >= 1 && laps <= 10) this.laps = laps;
          this.broadcast(this.roomInfo());
        }
        break;

      case 'startRace':
        if (c.inRoom && isHost) this.startCountdown();
        break;

      case 'st':
        // Fahrzeugzustand: [x, y, winkel, vx, vy, fortschritt, flags, höhe]
        if (c.inRoom && this.state !== 'lobby' && this.racers.includes(c.id) && Array.isArray(msg.a)) {
          const arr = msg.a.slice(0, 8).map(num);
          c.state = { arr, pr: arr[5] };
        }
        break;

      case 'finish':
        if (c.inRoom && this.state === 'racing' && this.racers.includes(c.id)) {
          if (this.results.find((r) => r.id === c.id)) break;
          // Plausibilitätsprüfung: gemeldeter Fortschritt muss alle Runden umfassen
          if (!c.state || c.state.pr < this.laps + 0.9) break;
          // Zeit wird vom Host gemessen (nicht vom Fahrer übernommen)
          const time = Date.now() - this.goAt;
          this.results.push({ id: c.id, name: c.name, color: c.color, time });
          const pos = this.results.length;
          this.broadcast({ t: 'finished', id: c.id, name: c.name, time, pos });
          if (!this.firstFinishAt) {
            this.firstFinishAt = Date.now();
            clearTimeout(this.raceTimer);
            this.raceTimer = setTimeout(() => this.endRace(), FINISH_GRACE_MS);
            this.broadcast({ t: 'grace', ms: FINISH_GRACE_MS });
          }
          this.checkRaceEnd();
        }
        break;

      case 'chat':
        if (c.inRoom) {
          const text = String(msg.text || '').replace(/[<>]/g, '').trim().slice(0, 120);
          if (text) this.broadcast({ t: 'chat', name: c.name, color: c.color, text });
        }
        break;
    }
  }
}
