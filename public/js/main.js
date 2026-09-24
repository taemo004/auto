// Turbo Rivals – Client-Hauptlogik

import { TRACK_DEFS, TRACK_IDS, buildTrack, gridPosition } from './tracks.js';
import { createCar, updateCar, collideCars, botInput } from './car.js';
import { Renderer, drawTrackPreview } from './render.js';
import { Net } from './net.js';
import { Sound } from './audio.js';

const $ = (id) => document.getElementById(id);
const COLORS = ['#e63946', '#3a86ff', '#ffbe0b', '#06d6a0', '#8338ec', '#fb5607', '#ff006e', '#f1f1f1'];
const BOT_NAMES = ['Blitz', 'Turbo Tina', 'Max Speed', 'Drift König', 'Rakete', 'Schumi Jr.', 'Vollgas Vera', 'Nitro Nick'];
const STEP = 1 / 120;
const SEND_MS = 50;
const INTERP_MS = 110;

const net = new Net();
const sound = new Sound();
const renderer = new Renderer($('game'), $('minimap'));
const trackCache = {};
const getTrack = (id) => (trackCache[id] ||= buildTrack(id));

// ---------- Profil ----------
const profile = {
  name: localStorage.getItem('tr_name') || '',
  color: localStorage.getItem('tr_color') || COLORS[Math.floor(Math.random() * 4)],
};
$('in-name').value = profile.name;
$('in-name').addEventListener('input', () => {
  profile.name = $('in-name').value.trim();
  localStorage.setItem('tr_name', profile.name);
});
function renderColors() {
  const box = $('colors');
  box.innerHTML = '';
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.style.background = c;
    b.className = c === profile.color ? 'sel' : '';
    b.title = 'Farbe wählen';
    b.onclick = () => {
      profile.color = c;
      localStorage.setItem('tr_color', c);
      renderColors();
    };
    box.appendChild(b);
  }
}
renderColors();
const myName = () => profile.name || 'Fahrer';

// ---------- Screens ----------
const SCREENS = ['menu', 'offline', 'lobby', 'results'];
function show(name) {
  for (const s of SCREENS) $('screen-' + s).classList.toggle('hidden', s !== name);
}
function setMsg(text) {
  $('menu-msg').textContent = text || '';
}

// ---------- Eingabe ----------
const keys = { up: false, down: false, left: false, right: false, drift: false, nitro: false };
const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'drift',
  ShiftLeft: 'nitro', ShiftRight: 'nitro', KeyN: 'nitro',
};
const inTextField = () => ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);

window.addEventListener('keydown', (e) => {
  if (inTextField()) return;
  const k = KEYMAP[e.code];
  if (k && game && game.mode !== 'demo') {
    keys[k] = true;
    e.preventDefault();
  }
  if (!game || game.mode === 'demo') return;
  if (e.code === 'Escape') quitRace();
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyR') respawn();
});
window.addEventListener('keyup', (e) => {
  const k = KEYMAP[e.code];
  if (k) keys[k] = false;
});
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
});

// Touch-Buttons
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
for (const btn of document.querySelectorAll('#touch button')) {
  const k = btn.dataset.k;
  const on = (e) => {
    e.preventDefault();
    keys[k] = true;
    btn.classList.add('active');
    sound.resume();
  };
  const off = (e) => {
    e.preventDefault();
    keys[k] = false;
    btn.classList.remove('active');
  };
  btn.addEventListener('pointerdown', on);
  btn.addEventListener('pointerup', off);
  btn.addEventListener('pointercancel', off);
  btn.addEventListener('pointerleave', off);
}

document.addEventListener('pointerdown', () => sound.resume(), { once: false });

function toggleMute() {
  const m = sound.toggleMute();
  $('btn-mute').textContent = m ? '🔇' : '🔊';
}
$('btn-mute').textContent = sound.muted ? '🔇' : '🔊';
$('btn-mute').onclick = toggleMute;
$('btn-quit').onclick = () => quitRace();

// ---------- Spielzustand ----------
let game = null;
let lobby = null; // letzter Raumzustand vom Server

function newGame({ mode, trackId, laps, grid, countdown }) {
  const track = getTrack(trackId);
  renderer.setTrack(track);
  const g = {
    mode,
    track,
    laps,
    cars: [],
    remotes: new Map(),
    player: null,
    startAt: performance.now() + countdown,
    results: [],
    over: false,
    lastSend: 0,
    lastCount: null,
    lapStart: 0,
    bestLap: 0,
    endTimer: null,
  };
  for (const slot of grid) {
    const pos = gridPosition(track, slot.slot);
    const car = createCar({ ...slot, ...pos });
    if (slot.remote) {
      g.remotes.set(slot.id, { car, snaps: [] });
    } else {
      g.cars.push(car);
      if (slot.isPlayer) g.player = car;
    }
  }
  renderer.cam.x = (g.player || g.cars[0]).x;
  renderer.cam.y = (g.player || g.cars[0]).y;
  for (const k in keys) keys[k] = false;
  game = g;
  return g;
}

function allCars() {
  const list = [...game.cars];
  for (const r of game.remotes.values()) list.push(r.car);
  return list;
}

function standings() {
  return allCars().sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress;
  });
}

// Demo-Rennen im Hintergrund des Menüs
function startDemo() {
  const trackId = TRACK_IDS[Math.floor(Math.random() * TRACK_IDS.length)];
  const grid = [];
  for (let i = 0; i < 6; i++) {
    grid.push({ id: 'b' + i, slot: i, name: BOT_NAMES[i], color: COLORS[i], isBot: true, skill: 0.88 + Math.random() * 0.1 });
  }
  newGame({ mode: 'demo', trackId, laps: 999, grid, countdown: 0 });
  $('hud').classList.add('hidden');
  $('touch').classList.add('hidden');
}

function startOffline(trackId, laps, bots, diff) {
  sound.resume();
  const grid = [];
  const total = bots + 1;
  const playerSlot = total - 1; // Spieler startet hinten
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  const colors = COLORS.filter((c) => c !== profile.color);
  let b = 0;
  for (let s = 0; s < total; s++) {
    if (s === playerSlot) {
      grid.push({ id: 'me', slot: s, name: myName(), color: profile.color, isPlayer: true });
    } else {
      grid.push({
        id: 'b' + b, slot: s, name: names[b], color: colors[b % colors.length], isBot: true,
        skill: diff * (0.94 + Math.random() * 0.06),
      });
      b++;
    }
  }
  newGame({ mode: 'offline', trackId, laps, grid, countdown: 3000 });
  game.setup = { trackId, laps, bots, diff };
  enterRaceUI();
}

function enterRaceUI() {
  show(null);
  $('hud').classList.remove('hidden');
  $('touch').classList.toggle('hidden', !isTouch);
  $('lap-best').textContent = '';
  $('toast').classList.remove('show');
  $('countdown').textContent = '';
}

function quitRace() {
  if (!game || game.mode === 'demo') return;
  if (game.mode === 'online') {
    net.send({ t: 'leave' });
    lobby = null;
  }
  clearTimeout(game.endTimer);
  startDemo();
  show('menu');
}

function respawn() {
  const car = game && game.player;
  if (!car || car.finished || performance.now() < game.startAt) return;
  const t = game.track;
  const i = car.idx;
  car.x = t.xs[i];
  car.y = t.ys[i];
  car.a = Math.atan2(t.ty[i], t.tx[i]);
  car.vx = car.vy = 0;
  renderer.clearSkid(car);
}

// ---------- Hauptschleife ----------
let last = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;
  if (!game) return;

  acc += dt;
  while (acc >= STEP) {
    step(STEP, now);
    acc -= STEP;
  }
  updateRemotes(now);
  renderer.updateParticles(dt);

  const focus = game.player || standings()[0];
  const cars = allCars().sort((a, b) => (a === focus) - (b === focus));
  renderer.draw(cars, focus, dt);

  if (game.mode !== 'demo') {
    updateHud(now);
    sound.update(game.player, true);
    if (game.mode === 'online' && game.player && now - game.lastSend > SEND_MS) {
      game.lastSend = now;
      sendState(game.player);
    }
  } else {
    sound.update(null, false);
  }
}

function step(dt, now) {
  const g = game;
  const racing = now >= g.startAt;
  let leader = 0;
  for (const c of g.cars) leader = Math.max(leader, c.progress);
  for (const r of g.remotes.values()) leader = Math.max(leader, r.car.progress);

  for (const car of g.cars) {
    const input = car === g.player ? keys : botInput(car, g.track, dt, g.mode === 'demo' ? undefined : leader);
    car.braking = input.down && car.speed > 20;
    car.hitWall = 0;
    updateCar(car, input, dt, g.track, racing);
    if (car.hitWall && car === g.player) {
      sound.crash(car.hitWall);
      renderer.shake = Math.max(renderer.shake, car.hitWall);
    }
    effects(car, input, dt);

    if (car.justCrossed) {
      car.justCrossed = false;
      onLap(car, now);
    }
  }

  // Kollisionen
  for (let i = 0; i < g.cars.length; i++) {
    for (let j = i + 1; j < g.cars.length; j++) {
      const hit = collideCars(g.cars[i], g.cars[j]);
      if (hit && (g.cars[i] === g.player || g.cars[j] === g.player)) {
        sound.crash(hit);
        renderer.shake = Math.max(renderer.shake, hit * 0.6);
      }
    }
    for (const r of g.remotes.values()) {
      const hit = collideCars(g.cars[i], r.car, true);
      if (hit && g.cars[i] === g.player) {
        sound.crash(hit);
        renderer.shake = Math.max(renderer.shake, hit * 0.6);
      }
    }
  }
}

function effects(car, input, dt) {
  if ((car.drifting || (car.braking && car.speed > 320)) && !car.offroad) renderer.addSkid(car);
  else renderer.clearSkid(car);

  const cos = Math.cos(car.a), sin = Math.sin(car.a);
  const bx = car.x - cos * 26, by = car.y - sin * 26;
  if (car.usingNitro && Math.random() < dt * 60) {
    renderer.emit(bx, by, car.vx * 0.3 - cos * 200, car.vy * 0.3 - sin * 200, Math.random() < 0.5 ? '#00f5d4' : '#3a86ff', 0.35, 7);
  }
  if (car.offroad && car.speed > 120 && Math.random() < dt * 30) {
    renderer.emit(bx, by, car.vx * 0.1, car.vy * 0.1, 'rgba(160,130,80,0.6)', 0.7, 10);
  }
  if (car.drifting && Math.random() < dt * 25) {
    renderer.emit(bx, by, 0, 0, 'rgba(220,220,220,0.5)', 0.8, 11);
  }
}

function onLap(car, now) {
  const g = game;
  if (car === g.player && car.lap > 1) {
    const lapTime = now - g.lapStart;
    if (!g.bestLap || lapTime < g.bestLap) g.bestLap = lapTime;
    $('lap-best').textContent = `Letzte Runde ${fmt(lapTime)} · Beste ${fmt(g.bestLap)}`;
    if (car.lap === g.laps) toast('Letzte Runde!');
    else if (car.lap <= g.laps) toast(`Runde ${car.lap}/${g.laps}`);
  }
  if (car === g.player) g.lapStart = now;

  if (car.lap > g.laps && !car.finished) {
    car.finished = true;
    car.finishTime = now - g.startAt;
    if (car === g.player) {
      sound.beep(880, 0.4, 'triangle', 0.3);
      if (g.mode === 'online') {
        sendState(car);
        net.send({ t: 'finish' });
      } else {
        const pos = standings().indexOf(car) + 1;
        toast(`🏁 Ziel! Platz ${pos}`, 4000);
        scheduleOfflineEnd();
      }
    }
  }
}

function scheduleOfflineEnd() {
  const g = game;
  const deadline = performance.now() + 20000;
  const check = () => {
    if (game !== g) return;
    if (g.cars.every((c) => c.finished) || performance.now() > deadline) {
      showResults(standings().map((c) => ({ id: c.id, name: c.name, color: c.color, time: c.finished ? c.finishTime : null })), 'me');
    } else g.endTimer = setTimeout(check, 250);
  };
  g.endTimer = setTimeout(check, 1500);
}

let toastTimer = null;
function toast(text, ms = 1800) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

function fmt(ms) {
  if (ms == null) return '–';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const c = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

function updateHud(now) {
  const g = game, car = g.player;
  if (!car) return;
  const list = standings();
  $('hud-pos').textContent = `${list.indexOf(car) + 1}/${list.length}`;
  $('hud-lap').textContent = `${Math.max(1, Math.min(car.lap, g.laps))}/${g.laps}`;
  const t = car.finished ? car.finishTime : Math.max(0, now - g.startAt);
  $('hud-time').textContent = fmt(t);
  $('hud-kmh').textContent = Math.round(car.speed * 0.34);
  $('hud-nitro').style.width = `${car.nitro * 100}%`;
  $('hud-nitro').style.opacity = car.usingNitro ? 1 : 0.8;

  const board = list
    .map((c, i) => {
      const cls = c === car ? 'me' : '';
      const fin = c.finished ? `<span class="fin">🏁</span>` : '';
      return `<div class="${cls}"><b>${i + 1}.</b><span class="dot" style="background:${c.color}"></span>${esc(c.name)}${fin}</div>`;
    })
    .join('');
  if (board !== g._board) {
    $('hud-board').innerHTML = board;
    g._board = board;
  }

  // Countdown
  const left = g.startAt - now;
  const cd = $('countdown');
  let text = '';
  if (left > 0) text = String(Math.ceil(left / 1000));
  else if (left > -900) text = 'GO!';
  if (text !== g.lastCount) {
    g.lastCount = text;
    cd.textContent = text;
    cd.classList.toggle('go', text === 'GO!');
    if (text === 'GO!') {
      sound.beep(1046, 0.5, 'square', 0.25);
      g.lapStart = g.startAt;
    } else if (text) sound.beep(523, 0.2, 'square', 0.2);
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ---------- Online: Zustandsabgleich ----------
function sendState(car) {
  const flags = (car.usingNitro ? 1 : 0) | (car.braking ? 2 : 0) | (car.drifting ? 4 : 0) | (car.finished ? 8 : 0);
  net.send({
    t: 'st',
    a: [
      Math.round(car.x * 10) / 10, Math.round(car.y * 10) / 10, Math.round(car.a * 1000) / 1000,
      Math.round(car.vx), Math.round(car.vy), Math.round(car.progress * 10000) / 10000, flags,
    ],
  });
}

function updateRemotes(now) {
  const renderTime = now - INTERP_MS;
  for (const r of game.remotes.values()) {
    const snaps = r.snaps;
    if (!snaps.length) continue;
    while (snaps.length > 2 && snaps[1].t <= renderTime) snaps.shift();
    const car = r.car;
    let s;
    const a = snaps[0], b = snaps[1];
    if (b && a.t <= renderTime) {
      const k = Math.min(1, (renderTime - a.t) / (b.t - a.t || 1));
      let da = b.a - a.a;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      s = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, a: a.a + da * k, src: b };
    } else {
      // Extrapolieren (max. 200 ms)
      const e = Math.min(0.2, Math.max(0, (renderTime - a.t) / 1000));
      s = { x: a.x + a.vx * e, y: a.y + a.vy * e, a: a.a, src: a };
    }
    car.x = s.x;
    car.y = s.y;
    car.a = s.a;
    car.vx = s.src.vx;
    car.vy = s.src.vy;
    car.speed = Math.hypot(car.vx, car.vy);
    car.progress = s.src.pr;
    car.usingNitro = !!(s.src.f & 1);
    car.braking = !!(s.src.f & 2);
    car.drifting = !!(s.src.f & 4);
    effects(car, {}, 1 / 60);
  }
}

// ---------- Online: Nachrichten ----------
net.on('joined', (m) => {
  profile.color = m.color;
  $('chat-log').innerHTML = '';
  history.replaceState(null, '', `?room=${m.code}`);
  show('lobby');
});

net.on('room', (m) => {
  lobby = m;
  renderLobby();
});

net.on('error', (m) => {
  setMsg(m.msg);
  show('menu');
});

net.on('start', (m) => {
  const grid = m.grid.map((g) => {
    const p = lobby.players.find((x) => x.id === g.id) || { name: 'Fahrer', color: '#999' };
    const isMe = g.id === net.id;
    return { id: g.id, slot: g.slot, name: p.name, color: p.color, isPlayer: isMe, remote: !isMe };
  });
  if (!grid.some((g) => g.isPlayer)) return;
  sound.resume();
  newGame({ mode: 'online', trackId: m.track, laps: m.laps, grid, countdown: m.countdown });
  enterRaceUI();
});

net.on('s', (m) => {
  if (!game || game.mode !== 'online') return;
  const now = performance.now();
  for (const [id, x, y, a, vx, vy, pr, f] of m.s) {
    const r = game.remotes.get(id);
    if (!r) continue;
    r.snaps.push({ t: now, x, y, a, vx, vy, pr, f });
    if (r.snaps.length > 30) r.snaps.shift();
  }
});

net.on('finished', (m) => {
  if (!game || game.mode !== 'online') return;
  if (m.id === net.id) {
    toast(`🏁 Ziel! Platz ${m.pos}`, 4000);
  } else {
    const r = game.remotes.get(m.id);
    if (r) {
      r.car.finished = true;
      r.car.finishTime = m.time;
    }
    toast(`${m.name} ist im Ziel (${m.pos}.)`);
  }
});

net.on('grace', (m) => {
  if (game && game.mode === 'online' && game.player && !game.player.finished) {
    toast(`Noch ${Math.round(m.ms / 1000)} s bis Rennende!`, 2500);
  }
});

net.on('left', (m) => {
  if (game && game.mode === 'online') game.remotes.delete(m.id);
});

net.on('results', (m) => {
  if (!game || game.mode !== 'online') return;
  showResults(m.results, net.id);
});

net.on('chat', (m) => addChat(`<b style="color:${m.color}">${esc(m.name)}:</b> ${esc(m.text)}`));

net.on('disconnect', () => {
  lobby = null;
  if (game && game.mode === 'online') startDemo();
  show('menu');
  setMsg('Verbindung zum Server verloren.');
});

// ---------- Ergebnisse ----------
function showResults(results, myId) {
  const g = game;
  const list = $('results-list');
  list.innerHTML = results
    .map((r) => `<li class="${r.id === myId ? 'me' : ''}"><span class="dot" style="background:${r.color}"></span>${esc(r.name)}<span class="time">${r.time != null ? fmt(r.time) : 'nicht im Ziel'}</span></li>`)
    .join('');
  const wasOnline = g.mode === 'online';
  const setup = g.setup;
  startDemo();
  show('results');
  $('btn-results-ok').onclick = () => {
    if (wasOnline && lobby) {
      show('lobby');
      renderLobby();
    } else if (!wasOnline && setup) {
      show('offline');
    } else show('menu');
  };
}

// ---------- Lobby ----------
function addChat(html) {
  const log = $('chat-log');
  const d = document.createElement('div');
  d.innerHTML = html;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
}

$('chat-in').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const text = $('chat-in').value.trim();
    if (text) net.send({ t: 'chat', text });
    $('chat-in').value = '';
  }
});

function buildTrackPicker(container, onPick) {
  container.innerHTML = '';
  const cards = {};
  for (const id of TRACK_IDS) {
    const b = document.createElement('button');
    b.className = 'track-card';
    const cv = document.createElement('canvas');
    cv.width = 160;
    cv.height = 110;
    drawTrackPreview(cv, getTrack(id));
    const lbl = document.createElement('div');
    lbl.textContent = TRACK_DEFS[id].name;
    b.title = TRACK_DEFS[id].desc;
    b.append(cv, lbl);
    b.onclick = () => onPick(id);
    container.appendChild(b);
    cards[id] = b;
  }
  return {
    select(id) {
      for (const k in cards) cards[k].classList.toggle('sel', k === id);
    },
    setEnabled(on) {
      for (const k in cards) cards[k].disabled = !on;
    },
  };
}

const lobbyPicker = buildTrackPicker($('lobby-tracks'), (id) => {
  if (lobby && lobby.hostId === net.id) net.send({ t: 'settings', track: id, laps: lobby.laps });
});
$('lobby-laps').addEventListener('change', () => {
  if (lobby) net.send({ t: 'settings', track: lobby.track, laps: +$('lobby-laps').value });
});

let lobbyTick = null;
function renderLobby() {
  if (!lobby) return;
  const m = lobby;
  const isHost = m.hostId === net.id;
  $('lobby-code').textContent = m.code;
  $('lobby-kind').textContent = m.isPublic ? 'Öffentlich' : 'Privat';
  $('lobby-count').textContent = `(${m.players.length}/8)`;
  $('lobby-players').innerHTML = m.players
    .map((p) => {
      const tags = [p.id === m.hostId ? 'Host' : '', p.racing ? 'fährt' : ''].filter(Boolean).join(' · ');
      return `<li class="${p.id === net.id ? 'me' : ''}"><span class="dot" style="background:${p.color}"></span>${esc(p.name)}${p.id === net.id ? ' (du)' : ''}<span class="tag">${tags}</span></li>`;
    })
    .join('');
  lobbyPicker.select(m.track);
  lobbyPicker.setEnabled(isHost && m.state === 'lobby');
  $('lobby-laps').value = String(m.laps);
  $('lobby-laps').disabled = !isHost || m.state !== 'lobby';
  $('btn-start').disabled = !isHost || m.state !== 'lobby';
  $('btn-start').classList.toggle('hidden', !isHost);

  const autoAt = m.autoStartAt ? performance.now() + m.autoStartAt : 0;
  clearInterval(lobbyTick);
  const status = () => {
    let s;
    if (m.state !== 'lobby') s = 'Ein Rennen läuft gerade – du fährst beim nächsten Mal mit.';
    else if (autoAt) s = `Automatischer Start in ${Math.max(0, Math.ceil((autoAt - performance.now()) / 1000))} s`;
    else if (isHost) s = m.players.length < 2 ? 'Teile den Code mit Freunden oder starte allein.' : 'Alle da? Dann los!';
    else s = 'Warte, bis der Host das Rennen startet…';
    $('lobby-status').textContent = s;
  };
  status();
  if (autoAt) lobbyTick = setInterval(status, 250);
}

$('btn-start').onclick = () => net.send({ t: 'startRace' });
$('btn-lobby-leave').onclick = () => {
  net.send({ t: 'leave' });
  lobby = null;
  history.replaceState(null, '', location.pathname);
  show('menu');
};
$('btn-copy').onclick = async () => {
  const url = `${location.origin}${location.pathname}?room=${lobby ? lobby.code : ''}`;
  try {
    await navigator.clipboard.writeText(url);
    $('btn-copy').textContent = 'Kopiert!';
  } catch {
    prompt('Link zum Teilen:', url);
  }
  setTimeout(() => ($('btn-copy').textContent = 'Link kopieren'), 1500);
};

// ---------- Menü ----------
async function online(action) {
  sound.resume();
  setMsg('Verbinde…');
  try {
    await net.connect();
  } catch {
    setMsg('Server nicht erreichbar. Einzelspieler funktioniert trotzdem!');
    return;
  }
  setMsg('');
  net.send({ t: 'hello', name: myName(), color: profile.color });
  net.send(action);
}

$('btn-quick').onclick = () => online({ t: 'quick' });
$('btn-create').onclick = () => online({ t: 'create' });
$('btn-join').onclick = () => {
  $('join-row').classList.toggle('hidden');
  $('in-code').focus();
};
const joinGo = () => {
  const code = $('in-code').value.trim().toUpperCase();
  if (code.length !== 4) return setMsg('Der Raumcode hat 4 Zeichen.');
  online({ t: 'join', code });
};
$('btn-join-go').onclick = joinGo;
$('in-code').addEventListener('keydown', (e) => e.key === 'Enter' && joinGo());

// Einzelspieler
let offTrack = TRACK_IDS[0];
const offPicker = buildTrackPicker($('offline-tracks'), (id) => {
  offTrack = id;
  offPicker.select(id);
});
offPicker.select(offTrack);
$('btn-offline').onclick = () => show('offline');
$('btn-off-start').onclick = () => startOffline(offTrack, +$('off-laps').value, +$('off-bots').value, +$('off-diff').value);
for (const b of document.querySelectorAll('.back')) b.onclick = () => show('menu');

// Einladungslink ?room=CODE
const invite = new URLSearchParams(location.search).get('room');
if (invite) {
  $('join-row').classList.remove('hidden');
  $('in-code').value = invite.toUpperCase().slice(0, 4);
  setMsg(`Du wurdest in Raum ${invite.toUpperCase()} eingeladen – Name wählen und auf „Los" klicken.`);
}

startDemo();
show('menu');
requestAnimationFrame(frame);
