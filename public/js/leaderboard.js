// Bestenliste der schnellsten Runden je Strecke.
// Weltweit über die Firebase Realtime Database (REST, ohne SDK), sonst lokal im Browser.

import { FIREBASE_DB_URL } from './config.js';

const LOCAL_KEY = 'tr_laps_v1';
const PB_KEY = 'tr_pb_v1';
export const MIN_LAP_MS = 5000;
const DB = FIREBASE_DB_URL.replace(/\/+$/, '');

export const isGlobal = () => !!DB;

// Ein Eintrag pro Name (Groß-/Kleinschreibung egal)
export const nameKey = (name) =>
  String(name).trim().toLowerCase().replace(/[.#$[\]/%\s]+/g, '_').slice(0, 32) || 'fahrer';

function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
}
function save(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

// Persönliche Bestzeit (dieses Gerät) für eine Strecke
export function personalBest(trackId) {
  return load(PB_KEY)[trackId] || null;
}

// Rundenzeit melden. Liefert { newPB }.
export async function submitLap(trackId, name, color, carType, t) {
  t = Math.round(t);
  if (!(t >= MIN_LAP_MS)) return { newPB: false };
  const entry = { n: String(name).slice(0, 16), t, c: color, car: carType, d: Date.now() };

  // Lokale Liste
  const local = load(LOCAL_KEY);
  const list = (local[trackId] ||= {});
  const key = nameKey(name);
  if (!list[key] || list[key].t > t) list[key] = entry;
  save(LOCAL_KEY, local);

  const pbs = load(PB_KEY);
  const newPB = !pbs[trackId] || pbs[trackId].t > t;
  if (newPB) {
    pbs[trackId] = { t, car: carType };
    save(PB_KEY, pbs);
  }

  if (DB) {
    // Die Datenbankregeln lassen nur Verbesserungen zu – eine Ablehnung ist also normal.
    try {
      await fetch(`${DB}/laps/${trackId}/${encodeURIComponent(key)}.json`, {
        method: 'PUT',
        body: JSON.stringify({ ...entry, d: { '.sv': 'timestamp' } }),
      });
    } catch {}
  }
  return { newPB };
}

// Bestenliste laden: { global, entries: [{ n, t, c, car, d }], error }
export async function fetchBoard(trackId, limit = 100) {
  if (DB) {
    try {
      const res = await fetch(`${DB}/laps/${trackId}.json?orderBy=%22t%22&limitToFirst=${limit}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = (await res.json()) || {};
      const entries = Object.entries(data)
        .map(([k, v]) => ({ ...v, key: k }))
        .filter((e) => typeof e.t === 'number')
        .sort((a, b) => a.t - b.t);
      return { global: true, entries };
    } catch (e) {
      return { global: true, entries: localEntries(trackId, limit), error: true };
    }
  }
  return { global: false, entries: localEntries(trackId, limit) };
}

function localEntries(trackId, limit) {
  const list = load(LOCAL_KEY)[trackId] || {};
  return Object.entries(list)
    .map(([k, v]) => ({ ...v, key: k }))
    .sort((a, b) => a.t - b.t)
    .slice(0, limit);
}
