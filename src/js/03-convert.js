'use strict';
/* 03-convert.js : Lecture des valeurs source et conversion vers les types BC. */

/* ---------------- valeurs source ---------------- */
function serialToISO(n, d1904) {
  if (d1904) n += 1462;
  const ms = Math.round((n - 25569) * 864e5); const d = new Date(ms);
  const date = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  const frac = n - Math.floor(n);
  if (Math.abs(frac) < 1e-7) return date;
  const time = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
  return n < 1 ? time : `${date} ${time}`;
}
function numStr(n) { if (!isFinite(n)) return ''; if (Number.isInteger(n)) return String(n); return String(parseFloat(n.toPrecision(15))); }
function cellStr(c) {
  if (c == null) return '';
  switch (c.t) {
    case 's': return c.v;
    case 'n': return numStr(c.v);
    case 'b': return c.v ? 'true' : 'false';
    case 'd': return serialToISO(c.v, S.raw?.d1904);
  }
  return String(c.v ?? '');
}

/* ---------------- conversions vers les types BC ---------------- */
function parseNum(s) {
  let t = String(s).replace(/[\s\u00a0\u202f']/g, '').replace(/%$/, '');
  if (t === '') return NaN;
  const hasC = t.includes(','), hasD = t.includes('.');
  if (hasC && hasD) { if (t.lastIndexOf(',') > t.lastIndexOf('.')) t = t.replace(/\./g, '').replace(',', '.'); else t = t.replace(/,/g, ''); }
  else if (hasC) { t = (t.split(',').length === 2) ? t.replace(',', '.') : t.replace(/,/g, ''); }
  return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t) ? Number(t) : NaN;
}
function validYMD(y, m, d) { if (m < 1 || m > 12 || d < 1) return false; const dt = new Date(Date.UTC(y, m - 1, d)); return dt.getUTCDate() === d && dt.getUTCMonth() === m - 1; }
function parseDate(s) {
  s = s.trim(); let m, y, mo, d;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})(?:\s.*)?$/.exec(s))) { d = +m[1]; mo = +m[2]; y = +m[3]; if (m[3].length === 2) y += y < 50 ? 2000 : 1900; }
  else if (/^\d+(\.\d+)?$/.test(s) && +s > 0 && +s < 2958466 && s.length !== 8) { return { v: serialToISO(Math.floor(+s), false).slice(0, 10) }; }
  else if ((m = /^(\d{2})(\d{2})(\d{4})$/.exec(s))) { d = +m[1]; mo = +m[2]; y = +m[3]; }
  else return { e: 'date illisible' };
  if (!validYMD(y, mo, d)) return { e: 'date invalide' };
  if (y < 1754) return { v: '' }; // date vide Navision (01/01/1753)
  return { v: `${y}-${pad2(mo)}-${pad2(d)}` };
}
const TRUE_W = new Set(['true', 'oui', 'yes', 'vrai', '1', 'x', 'o', 'y', 'ja', 'si']);
const FALSE_W = new Set(['false', 'non', 'no', 'faux', '0', 'n', 'nein']);
function optionIndex(ty) {
  if (ty._idx) return ty._idx;
  const byNorm = new Map(); const byNum = new Map();
  for (const o of ty.options || []) { const k = norm(o.c); if (!byNorm.has(k)) byNorm.set(k, o.c); byNum.set(String(o.i), o.c); }
  return (ty._idx = { byNorm, byNum });
}
/* convertit une chaîne au format attendu par le champ BC -> {v, e?, w?} */
function convertTo(f, s, set) {
  const ty = f.type;
  let v = s, e = null, w = null;
  switch (ty.base) {
    case 'Code': v = set.upperCode ? s.toUpperCase() : s; break;
    case 'Date': { const r = parseDate(s); if (r.e) { e = `${r.e} « ${s} »`; v = ''; } else v = r.v; break; }
    case 'DateTime': {
      if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { v = s; break; }
      const [dp, tp] = s.split(/\s+/); const r = parseDate(dp || '');
      if (r.e) { e = `${r.e} « ${s} »`; v = ''; }
      else v = r.v ? `${r.v}T${(tp && /^\d{1,2}:\d{2}/.test(tp) ? tp.padStart(8, '0').slice(0, 8) : '00:00:00')}Z` : '';
      break;
    }
    case 'Decimal': { const n = parseNum(s); if (isNaN(n)) { e = `nombre illisible « ${s} »`; v = ''; } else v = numStr(n); break; }
    case 'Integer': case 'BigInteger': {
      const n = parseNum(s);
      if (isNaN(n)) { e = `entier illisible « ${s} »`; v = ''; }
      else if (!Number.isInteger(n)) { w = `arrondi de ${s}`; v = String(Math.round(n)); }
      else v = String(n);
      break;
    }
    case 'Boolean': { const k = norm(s); if (TRUE_W.has(k)) v = 'true'; else if (FALSE_W.has(k) || k === '') v = 'false'; else { e = `booléen illisible « ${s} »`; v = ''; } break; }
    case 'Option': {
      const ix = optionIndex(ty); const k = norm(s);
      if (ix.byNorm.has(k)) v = ix.byNorm.get(k);
      else if (ix.byNum.has(s.trim())) v = ix.byNum.get(s.trim());
      else { e = `option inconnue « ${s} »`; v = s; }
      break;
    }
  }
  if (ty.len && v.length > ty.len) {
    if (set.truncate) { w = `tronqué à ${ty.len} car. (${v.length})`; v = v.slice(0, ty.len); }
    else e = `trop long : ${v.length} car. pour ${ty.len} max`;
  }
  return { v, e, w };
}
