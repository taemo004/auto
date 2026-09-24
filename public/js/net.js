// Peer-to-Peer-Multiplayer über WebRTC (PeerJS).
// Wer einen Raum erstellt, ist Host: In seinem Browser läuft die Raumlogik (room.js),
// alle anderen verbinden sich direkt mit ihm. Der öffentliche PeerJS-Server wird nur
// zum Vermitteln der Verbindung benutzt – die Spieldaten laufen direkt zwischen den Browsern.

import { RoomHost } from './room.js';

const PREFIX = 'turborivals-v1-';
const QUICK_SLOTS = 8;
const TIMEOUT_MS = 12000;
const CONNECT_TIMEOUT_MS = 7000;

// Optional eigener PeerJS-Server: ?peerhost=example.com&peerport=443&peerpath=/
function peerOptions() {
  const q = new URLSearchParams(location.search);
  const opts = { debug: 0 };
  if (q.get('peerhost')) {
    opts.host = q.get('peerhost');
    opts.port = +(q.get('peerport') || 443);
    opts.path = q.get('peerpath') || '/';
    opts.secure = opts.port === 443;
  }
  return opts;
}

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function netError(type, msg) {
  const e = new Error(msg || type);
  e.type = type;
  return e;
}

export class Net {
  constructor(getProfile) {
    this.getProfile = getProfile;
    this.handlers = {};
    this.id = null;
    this.peer = null;
    this.conn = null;
    this.host = null;
    this.pending = null; // laufender Beitrittsversuch { resolve, reject }
  }

  get isHost() {
    return !!this.host;
  }

  on(type, fn) {
    this.handlers[type] = fn;
  }

  emit(msg) {
    const h = this.handlers[msg.t];
    if (h) h(msg);
  }

  send(msg) {
    if (this.host) this.host.handle(this.id, msg);
    else if (this.conn && this.conn.open) this.conn.send(msg);
  }

  // Alles trennen (Raum verlassen). Als Host endet der Raum damit für alle.
  close() {
    this.closing = true;
    if (this.host) this.host.destroy();
    if (this.conn) this.conn.close();
    if (this.peer) this.peer.destroy();
    this.host = this.conn = this.peer = null;
    this.id = null;
    this.pending = null;
    this.closing = false;
  }

  // ---------- Öffentliche Aktionen ----------

  async create() {
    this.close();
    for (let i = 0; i < 5; i++) {
      try {
        return await this.startHost(makeCode(), false);
      } catch (e) {
        if (e.type !== 'unavailable-id') throw e;
      }
    }
    throw netError('failed', 'Konnte keinen Raum erstellen.');
  }

  async join(code) {
    this.close();
    // Schnelltest: Lässt sich die Raum-ID belegen, existiert der Raum nicht.
    if (await this.idIsFree(code)) throw netError('not-found', `Raum "${code}" wurde nicht gefunden.`);
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.joinAsClient(code);
      } catch (e) {
        this.close();
        if (e.type === 'peer-unavailable') throw netError('not-found', `Raum "${code}" wurde nicht gefunden.`);
        // Hängender Verbindungsaufbau: einmal neu versuchen
        if ((e.type === 'timeout' || e.type === 'closed') && attempt < 1) continue;
        throw e;
      }
    }
  }

  // Schnelles Spiel: öffentliche Räume QK01…QK08 der Reihe nach probieren.
  // Ist die Raum-ID noch frei, wird man selbst Gastgeber, sonst tritt man bei.
  async quick() {
    this.close();
    let retries = 0;
    for (let slot = 1; slot <= QUICK_SLOTS; slot++) {
      const code = 'QK' + String(slot).padStart(2, '0');
      try {
        await this.startHost(code, true);
        return;
      } catch (e) {
        this.close();
        if (e.type !== 'unavailable-id') throw e;
      }
      try {
        await this.joinAsClient(code);
        return;
      } catch (e) {
        this.close();
        // Gastgeber gerade weg oder Verbindung hängt → denselben Platz nochmal probieren
        const retry = e.type === 'peer-unavailable' || e.type === 'timeout' || e.type === 'closed';
        if (retry && retries++ < 3) slot--;
        else if (e.type !== 'full' && !retry) throw e;
      }
    }
    throw netError('full', 'Alle öffentlichen Räume sind voll. Erstelle einen eigenen Raum!');
  }

  async idIsFree(code) {
    try {
      const probe = await this.openPeer(PREFIX + code);
      probe.destroy();
      return true;
    } catch (e) {
      if (e.type === 'unavailable-id') return false;
      throw e;
    }
  }

  // ---------- Intern ----------

  openPeer(id) {
    return new Promise((resolve, reject) => {
      if (!window.Peer) return reject(netError('no-lib', 'PeerJS konnte nicht geladen werden.'));
      const peer = id ? new window.Peer(id, peerOptions()) : new window.Peer(peerOptions());
      const timer = setTimeout(() => {
        peer.destroy();
        reject(netError('timeout', 'Zeitüberschreitung beim Verbinden.'));
      }, TIMEOUT_MS);
      peer.once('open', () => {
        clearTimeout(timer);
        resolve(peer);
      });
      peer.on('error', (err) => {
        clearTimeout(timer);
        if (!peer.open) {
          peer.destroy();
          reject(err);
        } else if (this.pending) {
          // z. B. 'peer-unavailable' beim Verbindungsversuch
          this.pending.reject(err);
        }
      });
    });
  }

  async startHost(code, isPublic) {
    const peer = await this.openPeer(PREFIX + code);
    this.peer = peer;
    const host = new RoomHost(code, isPublic);
    this.host = host;

    // Bei Abbruch der Verbindung zum Vermittlungsserver neu anmelden, damit weiter Spieler beitreten können
    peer.on('disconnected', () => {
      if (this.peer === peer && !peer.destroyed) peer.reconnect();
    });

    peer.on('connection', (conn) => {
      conn.on('open', () => {
        const id = host.addClient((m) => conn.open && conn.send(m));
        conn.on('data', (m) => host.handle(id, m));
        conn.on('close', () => host.removeClient(id));
        conn.on('error', () => host.removeClient(id));
      });
    });

    // Eigener (lokaler) Spieler
    this.id = host.addClient((m) => queueMicrotask(() => this.onMessage(m)));
    const p = this.getProfile();
    host.handle(this.id, { t: 'hello', name: p.name, color: p.color });
    host.handle(this.id, { t: 'enter' });
  }

  async joinAsClient(code) {
    const peer = await this.openPeer(null);
    this.peer = peer;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(netError('timeout', 'Zeitüberschreitung beim Verbinden.')), CONNECT_TIMEOUT_MS);
      this.pending = {
        resolve: () => {
          clearTimeout(timer);
          this.pending = null;
          resolve();
        },
        reject: (e) => {
          clearTimeout(timer);
          this.pending = null;
          reject(e);
        },
      };
      const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      this.conn = conn;
      conn.on('data', (m) => this.onMessage(m));
      conn.on('close', () => {
        if (this.conn !== conn || this.closing) return;
        if (this.pending) this.pending.reject(netError('closed', 'Verbindung getrennt.'));
        else {
          this.close();
          this.emit({ t: 'disconnect' });
        }
      });
    });
  }

  onMessage(m) {
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'welcome') {
      this.id = m.id;
      if (!this.host) {
        const p = this.getProfile();
        this.send({ t: 'hello', name: p.name, color: p.color });
        this.send({ t: 'enter' });
      }
      return;
    }
    if (this.pending) {
      if (m.t === 'error') return this.pending.reject(netError(m.code || 'error', m.msg));
      if (m.t === 'joined') this.pending.resolve();
    }
    this.emit(m);
  }
}
