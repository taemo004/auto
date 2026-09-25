// Kleine Helfer, die mehrere Module brauchen

export const $ = (id) => document.getElementById(id);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Millisekunden → m:ss.hh
export function fmt(ms) {
  if (ms == null) return '–';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const c = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
