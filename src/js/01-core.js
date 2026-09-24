'use strict';
/* 01-core.js : État global, constantes et utilitaires généraux. */

/* =====================================================================
   Mapping Navision -> Business Central (packages de configuration)
   Fichier autonome : aucune connexion réseau, aucune installation.
   ===================================================================== */
const ZOPT = { createFolders: false };
const APP_ID = 'nav-bc-mapper', MAP_VERSION = 1, LS_KEY = 'navbc.mapping.v1';

const S = {
  raw: null,      // {fileName, sheets:[{name, rows}], d1904}
  pkg: null,      // {fileName, zip, tables:[...], sst:[], sstPath, orig:{}}
  map: null,      // modèle de mapping courant
  ui: { t: 0, f: null, filter: 'all', q: '', tab: 'map' },
  clip: null,     // format copié
  val: {},        // résultats de contrôle par table
};
const defaultSettings = () => ({ fillDefaults: true, truncate: true, skipEmpty: true, upperCode: true });

/* ---------------- utilitaires ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const xdec = s => s.indexOf('&') < 0 ? s : s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e] ?? m));
const xenc = s => String(s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attrv = (tag, name) => { const m = new RegExp('(?:^|\\s)' + name + '="([^"]*)"').exec(tag); return m ? xdec(m[1]) : null; };
const colLetter = n => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const colIndex = L => { let n = 0; for (const ch of L) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const pad2 = n => String(n).padStart(2, '0');
const stamp = () => { const d = new Date(); return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`; };
const baseName = f => f.replace(/\.[^.]+$/, '');
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const nf = n => n.toLocaleString('fr-FR');
const plural = (n, s, p) => `${nf(n)} ${n > 1 ? (p || s + 's') : s}`;

function toast(msg, opts = {}) {
  const el = document.createElement('div');
  el.className = 'toast' + (opts.err ? ' err' : '');
  el.innerHTML = `<span>${esc(msg)}</span>`;
  if (opts.action) {
    const b = document.createElement('button'); b.textContent = opts.action.label;
    b.onclick = () => { opts.action.run(); el.remove(); }; el.appendChild(b);
  }
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), opts.ms || (opts.action ? 9000 : 4200));
}
function busy(on, text) { $('#busy').classList.toggle('hidden', !on); if (text) $('#busyText').textContent = text; }
const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
