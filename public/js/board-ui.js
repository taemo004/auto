// Bestenlisten-Bildschirm und Rundeninfo nach dem Rennen

import { TRACK_DEFS, TRACK_IDS } from './tracks.js';
import { CAR_TYPES, CAR_TYPE_IDS } from './car.js';
import { fetchBoard, personalBest, isGlobal, nameKey } from './leaderboard.js';
import { $, fmt, esc } from './util.js';

// myName(): aktueller Spielername, show(name): Bildschirm wechseln
export function initBoardUI({ myName, show }) {
  async function showRaceLapInfo(g) {
    const el = $('results-extra');
    const name = TRACK_DEFS[g.trackId].name;
    const pb = personalBest(g.trackId);
    let html = `Schnellste Runde im Rennen: <b>${fmt(g.bestLap || null)}</b><br>Deine Bestzeit auf ${esc(name)}: <b>${fmt(pb ? pb.t : null)}</b>`;
    el.innerHTML = html;
    if (!pb) return;
    const { global, entries } = await fetchBoard(g.trackId, 1000);
    const rank = entries.findIndex((e) => e.key === nameKey(myName())) + 1;
    html += `<br>${global ? 'Weltweit' : 'Auf diesem Gerät'}: <b>${rank ? `Platz ${rank}` : 'nicht in den Top 1000'}</b>`;
    el.innerHTML = html;
  }

  // ---------- Bestenliste ----------
  let boardTrack = TRACK_IDS[0];
  let boardLimit = 10;
  let boardCar = 'all';
  let boardReq = 0;
  function buildCarTabs() {
    const box = $('board-cars');
    box.innerHTML = '';
    for (const [id, label] of [['all', 'Alle Autos'], ...CAR_TYPE_IDS.map((k) => [k, CAR_TYPES[k].name])]) {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = id === boardCar ? 'sel' : '';
      b.onclick = () => {
        boardCar = id;
        buildCarTabs();
        loadBoard();
      };
      box.appendChild(b);
    }
  }
  function buildBoardTabs() {
    const box = $('board-tracks');
    box.innerHTML = '';
    for (const id of TRACK_IDS) {
      const b = document.createElement('button');
      b.textContent = TRACK_DEFS[id].name;
      b.className = id === boardTrack ? 'sel' : '';
      b.onclick = () => {
        boardTrack = id;
        buildBoardTabs();
        loadBoard();
      };
      box.appendChild(b);
    }
  }
  for (const b of document.querySelectorAll('#board-limit button')) {
    b.onclick = () => {
      boardLimit = +b.dataset.l;
      for (const x of document.querySelectorAll('#board-limit button')) x.classList.toggle('sel', x === b);
      loadBoard();
    };
  }
  async function loadBoard() {
    const req = ++boardReq;
    $('board-kind').textContent = isGlobal() ? 'Weltweit' : 'Nur dieses Gerät';
    $('board-list').innerHTML = '<li>Lade…</li>';
    const { global, entries: all, error } = await fetchBoard(boardTrack, 1000);
    if (req !== boardReq) return;
    const entries = boardCar === 'all' ? all : all.filter((e) => e.car === boardCar);
    const me = nameKey(myName());
    const myIdx = entries.findIndex((e) => e.key === me);
    const pb = personalBest(boardTrack);
    let meHtml = '';
    if (error) meHtml += 'Die weltweite Liste ist gerade nicht erreichbar – gezeigt werden deine lokalen Zeiten.<br>';
    if (myIdx >= 0) meHtml += `Du (${esc(myName())}): <b>Platz ${myIdx + 1}</b> mit <b>${fmt(entries[myIdx].t)}</b>`;
    else if (boardCar !== 'all') meHtml += `Mit dem ${esc(CAR_TYPES[boardCar].name)} hast du auf dieser Strecke noch keine Zeit in den Top 1000.`;
    else if (pb) meHtml += `Deine Bestzeit: <b>${fmt(pb.t)}</b> (nicht in den Top 1000)`;
    else meHtml += 'Du hast auf dieser Strecke noch keine Rundenzeit – fahr los!';
    if (!global) meHtml += '<br><small>Die weltweite Bestenliste ist noch nicht eingerichtet (siehe BESTENLISTE.md).</small>';
    $('board-me').innerHTML = meHtml;
    const shown = entries.slice(0, boardLimit);
    $('board-list').innerHTML = shown.length
      ? shown
          .map((e) => `<li class="${e.key === me ? 'me' : ''}"><span class="dot" style="background:${esc(e.c || '#999')}"></span>${esc(e.n)} <span class="car">${esc(CAR_TYPES[e.car]?.name || '')}</span><span class="time">${fmt(e.t)}</span></li>`)
          .join('')
      : '<li>Noch keine Zeiten.</li>';
    if (myIdx >= boardLimit) {
      $('board-list').innerHTML += `<li class="me" style="counter-set: r ${myIdx}"><span class="dot" style="background:${esc(entries[myIdx].c || '#999')}"></span>${esc(entries[myIdx].n)}<span class="time">${fmt(entries[myIdx].t)}</span></li>`;
    }
  }
  $('btn-board').onclick = () => {
    buildBoardTabs();
    buildCarTabs();
    show('board');
    loadBoard();
  };

  return { showRaceLapInfo };
}
