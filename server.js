'use strict';

// Turbo Rivals – Spielserver
// Liefert den Client aus (public/) und verwaltet Räume, Lobby und Rennsynchronisation per WebSocket.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MAX_PLAYERS = 8;
const TICK_MS = 50; // 20 Hz Zustands-Broadcast
const COUNTDOWN_MS = 3000;
const FINISH_GRACE_MS = 30000; // Nach dem ersten Zieleinlauf haben die anderen noch 30 s
const QUICK_AUTOSTART_MS = 15000;
const TRACK_IDS = ['speedway', 'serpentine', 'harbor'];
const COLORS = ['#e63946', '#3a86ff', '#ffbe0b', '#06d6a0', '#8338ec', '#fb5607', '#ff006e', '#f1f1f1'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Nicht gefunden');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

let nextId = 1;
const rooms = new Map(); // code -> room

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg) {
  const data = JSON.stringify(msg);
  for (const p of room.players.values()) {
    if (p.ws.readyState === p.ws.OPEN) p.ws.send(data);
  }
}

function sanitizeName(name) {
  const clean = String(name || '').replace(/[<>]/g, '').trim().slice(0, 16);
  return clean || 'Fahrer';
}

function sanitizeColor(color) {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : COLORS[Math.floor(Math.random() * COLORS.length)];
}

function createRoom(isPublic) {
  const room = {
    code: makeCode(),
    isPublic,
    hostId: null,
    players: new Map(),
    state: 'lobby', // lobby | countdown | racing
    track: TRACK_IDS[Math.floor(Math.random() * TRACK_IDS.length)],
    laps: 3,
    racers: [],
    results: [],
    firstFinishAt: 0,
    goAt: 0,
    raceTimer: null,
    autoStartTimer: null,
    autoStartAt: 0,
  };
  rooms.set(room.code, room);
  return room;
}

function roomInfo(room) {
  return {
    t: 'room',
    code: room.code,
    isPublic: room.isPublic,
    hostId: room.hostId,
    state: room.state,
    track: room.track,
    laps: room.laps,
    autoStartAt: room.autoStartAt ? room.autoStartAt - Date.now() : 0,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      racing: room.racers.includes(p.id) && room.state !== 'lobby',
    })),
  };
}

function updateAutoStart(room) {
  if (!room.isPublic || room.state !== 'lobby') return;
  if (room.players.size >= 2 && !room.autoStartTimer) {
    room.autoStartAt = Date.now() + QUICK_AUTOSTART_MS;
    room.autoStartTimer = setTimeout(() => {
      room.autoStartTimer = null;
      room.autoStartAt = 0;
      if (room.state === 'lobby' && room.players.size >= 1) startCountdown(room);
    }, QUICK_AUTOSTART_MS);
  } else if (room.players.size < 2 && room.autoStartTimer) {
    clearTimeout(room.autoStartTimer);
    room.autoStartTimer = null;
    room.autoStartAt = 0;
  }
}

function joinRoom(player, room) {
  leaveRoom(player);
  if (room.players.size >= MAX_PLAYERS) {
    return send(player.ws, { t: 'error', msg: 'Der Raum ist voll.' });
  }
  // Farbe eindeutig machen
  const used = new Set([...room.players.values()].map((p) => p.color));
  if (used.has(player.color)) player.color = COLORS.find((c) => !used.has(c)) || player.color;
  room.players.set(player.id, player);
  player.room = room;
  player.state = null;
  if (!room.hostId) room.hostId = player.id;
  send(player.ws, { t: 'joined', code: room.code, id: player.id, color: player.color });
  updateAutoStart(room);
  broadcast(room, roomInfo(room));
}

function leaveRoom(player) {
  const room = player.room;
  if (!room) return;
  room.players.delete(player.id);
  player.room = null;
  if (room.players.size === 0) {
    clearTimeout(room.raceTimer);
    clearTimeout(room.autoStartTimer);
    rooms.delete(room.code);
    return;
  }
  if (room.hostId === player.id) room.hostId = room.players.keys().next().value;
  broadcast(room, { t: 'left', id: player.id });
  updateAutoStart(room);
  broadcast(room, roomInfo(room));
  if (room.state !== 'lobby') checkRaceEnd(room);
}

function startCountdown(room) {
  if (room.state !== 'lobby') return;
  clearTimeout(room.autoStartTimer);
  room.autoStartTimer = null;
  room.autoStartAt = 0;
  room.state = 'countdown';
  room.racers = [...room.players.keys()];
  room.results = [];
  room.firstFinishAt = 0;
  const grid = room.racers.map((id, i) => ({ id, slot: i }));
  for (const p of room.players.values()) p.state = null;
  broadcast(room, roomInfo(room));
  broadcast(room, { t: 'start', track: room.track, laps: room.laps, grid, countdown: COUNTDOWN_MS });
  room.goAt = Date.now() + COUNTDOWN_MS;
  room.raceTimer = setTimeout(() => {
    room.state = 'racing';
    broadcast(room, roomInfo(room));
  }, COUNTDOWN_MS);
}

function checkRaceEnd(room) {
  const active = room.racers.filter((id) => room.players.has(id));
  const finished = new Set(room.results.map((r) => r.id));
  const allDone = active.every((id) => finished.has(id));
  if (allDone || active.length === 0) endRace(room);
}

function endRace(room) {
  if (room.state === 'lobby') return;
  clearTimeout(room.raceTimer);
  const results = [...room.results];
  for (const id of room.racers) {
    if (!results.find((r) => r.id === id)) {
      const p = room.players.get(id);
      if (p) results.push({ id, name: p.name, color: p.color, time: null, progress: p.state ? p.state.pr : 0 });
    }
  }
  // Nicht-Angekommene nach Fortschritt sortieren
  const done = results.filter((r) => r.time !== null);
  const dnf = results.filter((r) => r.time === null).sort((a, b) => b.progress - a.progress);
  room.state = 'lobby';
  room.racers = [];
  broadcast(room, { t: 'results', results: [...done, ...dnf] });
  updateAutoStart(room);
  broadcast(room, roomInfo(room));
}

// Zustände aller Fahrer eines Raums regelmäßig verteilen
setInterval(() => {
  for (const room of rooms.values()) {
    if (room.state === 'lobby') continue;
    const states = [];
    for (const p of room.players.values()) {
      if (p.state) states.push([p.id, ...p.state.arr]);
    }
    if (states.length) broadcast(room, { t: 's', s: states });
  }
}, TICK_MS);

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

wss.on('connection', (ws) => {
  const player = {
    id: nextId++,
    ws,
    name: 'Fahrer',
    color: COLORS[0],
    room: null,
    state: null,
  };
  send(ws, { t: 'welcome', id: player.id });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== 'string') return;
    const room = player.room;

    switch (msg.t) {
      case 'hello':
        player.name = sanitizeName(msg.name);
        player.color = sanitizeColor(msg.color);
        break;

      case 'create': {
        const r = createRoom(false);
        if (TRACK_IDS.includes(msg.track)) r.track = msg.track;
        joinRoom(player, r);
        break;
      }

      case 'join': {
        const code = String(msg.code || '').toUpperCase().trim();
        const r = rooms.get(code);
        if (!r) send(ws, { t: 'error', msg: `Raum "${code}" wurde nicht gefunden.` });
        else joinRoom(player, r);
        break;
      }

      case 'quick': {
        let r = [...rooms.values()].find((x) => x.isPublic && x.state === 'lobby' && x.players.size < MAX_PLAYERS);
        if (!r) r = createRoom(true);
        joinRoom(player, r);
        break;
      }

      case 'leave':
        leaveRoom(player);
        break;

      case 'settings':
        if (room && room.hostId === player.id && room.state === 'lobby') {
          if (TRACK_IDS.includes(msg.track)) room.track = msg.track;
          const laps = Math.round(num(msg.laps));
          if (laps >= 1 && laps <= 10) room.laps = laps;
          broadcast(room, roomInfo(room));
        }
        break;

      case 'startRace':
        if (room && room.hostId === player.id) startCountdown(room);
        break;

      case 'st':
        // Fahrzeugzustand: [x, y, winkel, vx, vy, fortschritt, flags]
        if (room && room.state !== 'lobby' && room.racers.includes(player.id) && Array.isArray(msg.a)) {
          const arr = msg.a.slice(0, 7).map(num);
          player.state = { arr, pr: arr[5] };
        }
        break;

      case 'finish':
        if (room && room.state === 'racing' && room.racers.includes(player.id)) {
          if (room.results.find((r) => r.id === player.id)) break;
          // Plausibilitätsprüfung: gemeldeter Fortschritt muss alle Runden umfassen
          if (!player.state || player.state.pr < room.laps + 0.9) break;
          // Zeit wird serverseitig gemessen (nicht vom Client übernommen)
          const time = Date.now() - room.goAt;
          room.results.push({ id: player.id, name: player.name, color: player.color, time });
          const pos = room.results.length;
          broadcast(room, { t: 'finished', id: player.id, name: player.name, time, pos });
          if (!room.firstFinishAt) {
            room.firstFinishAt = Date.now();
            clearTimeout(room.raceTimer);
            room.raceTimer = setTimeout(() => endRace(room), FINISH_GRACE_MS);
            broadcast(room, { t: 'grace', ms: FINISH_GRACE_MS });
          }
          checkRaceEnd(room);
        }
        break;

      case 'chat':
        if (room) {
          const text = String(msg.text || '').replace(/[<>]/g, '').trim().slice(0, 120);
          if (text) broadcast(room, { t: 'chat', name: player.name, color: player.color, text });
        }
        break;

      case 'ping':
        send(ws, { t: 'pong', c: msg.c });
        break;
    }
  });

  ws.on('close', () => leaveRoom(player));
});

// Tote Verbindungen aufräumen
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws._dead) {
      ws.terminate();
      continue;
    }
    ws._dead = true;
    ws.ping();
  }
}, 30000);
wss.on('connection', (ws) => ws.on('pong', () => (ws._dead = false)));

server.listen(PORT, () => {
  console.log(`Turbo Rivals läuft auf http://localhost:${PORT}`);
});
