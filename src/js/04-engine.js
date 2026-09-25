'use strict';
/* 04-engine.js : Modèle de mapping, contexte source, moteur de transformation, contrôles, mapping automatique. */

/* ---------------- modèle de mapping ---------------- */
function newMap() { return { app: APP_ID, version: MAP_VERSION, settings: defaultSettings(), tables: {} }; }
const newF = () => ({ kind: 'none', col: '', value: '', tpl: '', map: [], case: 'none', padLen: 0, padChar: '0', padNum: true, prefix: '', suffix: '', dflt: '', filter: null });
function tm(t) { return (S.map.tables[t.name] ||= { source: null, headerRow: 1, mode: 'keep', fields: {} }); }
function getF(t, f) { return tm(t).fields[f.key] || null; }
function isMapped(F) { return !!F && ((F.kind === 'col' && !!F.col) || (F.kind === 'const') || (F.kind === 'tpl' && !!F.tpl)); }
function fmtChips(F, f) {
  const c = []; if (!F) return c;
  if (F.auto === 'fuzzy') c.push(['sug', 'à vérifier']);
  if (F.map?.some(p => p[1] !== '')) c.push(['', `${F.map.filter(p => p[1] !== '').length} corresp.`]);
  if (F.padLen > 0) c.push(['', `${F.padChar || '0'}→${F.padLen}`]);
  if (F.case && F.case !== 'none') c.push(['', { upper: 'MAJ', lower: 'min', title: 'Nom propre' }[F.case]]);
  if (F.prefix) c.push(['', 'préfixe']); if (F.suffix) c.push(['', 'suffixe']);
  if (F.dflt) c.push(['', 'si vide']);
  return c;
}

/* ---------------- contexte source ---------------- */
const ctxCache = new Map();
function getCtx(T) {
  if (!S.raw || !T.source) return null;
  const skip = S.map.settings.skipEmpty;
  const key = `${T.source}|${T.headerRow}|${skip}`;
  if (ctxCache.has(key)) return ctxCache.get(key);
  const sh = S.raw.sheets.find(s => s.name === T.source); if (!sh) return null;
  const h = Math.max(0, (T.headerRow || 1) - 1);
  const hdrRow = sh.rows[h] || [];
  let width = hdrRow.length; for (let r = h + 1; r < sh.rows.length; r++) if (sh.rows[r] && sh.rows[r].length > width) width = sh.rows[r].length;
  const rows = [], rowNums = [];
  for (let r = h + 1; r < sh.rows.length; r++) {
    const row = sh.rows[r];
    if (!row || (skip && !row.some(c => c != null && cellStr(c).trim() !== ''))) { if (!skip && row) { rows.push(row); rowNums.push(r + 1); } continue; }
    rows.push(row); rowNums.push(r + 1);
  }
  const cols = [], byName = new Map(), seen = {};
  for (let c = 0; c < width; c++) {
    let name = cellStr(hdrRow[c]).trim();
    if (!name) { if (!rows.some(r => r[c] != null && cellStr(r[c]) !== '')) continue; name = `Colonne ${colLetter(c)}`; }
    seen[name] = (seen[name] || 0) + 1; if (seen[name] > 1) name = `${name} (${seen[name]})`;
    const col = { name, idx: c, L: colLetter(c), sample: '', filled: 0, numeric: false };
    let digits = 0;
    for (const r of rows) { const v = r[c]; if (v != null && cellStr(v).trim() !== '') { col.filled++; if (!col.sample) col.sample = cellStr(v); if (/^\s*\d+\s*$/.test(cellStr(v))) digits++; } }
    col.numeric = col.filled > 0 && digits >= col.filled * 0.8;
    cols.push(col); byName.set(name, col);
  }
  const ctx = { sheet: sh, rows, rowNums, cols, byName, key };
  ctxCache.set(key, ctx); return ctx;
}
function distinctValues(ctx, colName, limit = 300) {
  const col = ctx.byName.get(colName); if (!col) return [];
  const cnt = new Map();
  for (const r of ctx.rows) { const s = cellStr(r[col.idx]).trim(); cnt.set(s, (cnt.get(s) || 0) + 1); }
  return [...cnt].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

/* ---------------- filtres de lignes ----------------
   Un champ alimenté par une colonne ou une combinaison peut restreindre les lignes source :
   F.filter liste les valeurs source conservées, comparées sans tenir compte de la casse
   (null : toutes les lignes ; liste vide : aucune). */
const canFilter = F => !!F && ((F.kind === 'col' && !!F.col) || (F.kind === 'tpl' && !!F.tpl));
const filterActive = F => canFilter(F) && Array.isArray(F.filter);
function filterLabel(values) {
  if (!values.length) return 'aucune';
  return values.slice(0, 2).map(v => v === '' ? '(vide)' : v).join(', ') + (values.length > 2 ? ` +${values.length - 2}` : '');
}
function filterSig(t) {
  const T = tm(t); const a = [];
  for (const f of t.fields) { const F = T.fields[f.key]; if (filterActive(F)) a.push([f.key, F.kind, F.col, F.tpl, F.filter]); }
  return a.length ? JSON.stringify(a) : '';
}
/* contexte source de la table, restreint aux lignes qui passent les filtres de ses champs */
function tableCtx(t) {
  const T = tm(t); const base = getCtx(T); if (!base) return null;
  const sig = filterSig(t); if (!sig) return base;
  const key = 'F|' + base.key; const hit = ctxCache.get(key);
  if (hit && hit.sig === sig) return hit.ctx;
  const tests = t.fields.map(f => T.fields[f.key]).filter(filterActive).map(F => [sourceGetter(F, base).get, new Set(F.filter.map(v => v.trim().toLowerCase()))]);
  const rows = [], rowNums = [];
  base.rows.forEach((row, i) => { if (tests.every(([get, keep]) => !get || keep.has(get(row).trim().toLowerCase()))) { rows.push(row); rowNums.push(base.rowNums[i]); } });
  const ctx = { ...base, rows, rowNums, total: base.rows.length };
  ctxCache.set(key, { sig, ctx }); return ctx;
}
/* valeurs source distinctes d'un champ avec leur nombre d'occurrences, par ordre alphabétique */
function sourceValues(F, ctx) {
  const { get } = sourceGetter(F, ctx); if (!get) return [];
  const cnt = new Map();
  for (const r of ctx.rows) { const s = get(r).trim(); cnt.set(s, (cnt.get(s) || 0) + 1); }
  return [...cnt].sort((a, b) => a[0].localeCompare(b[0], 'fr', { numeric: true }));
}

/* ---------------- moteur de transformation ---------------- */
/* lecture de la valeur source d'un champ (colonne, constante ou combinaison) -> {get, missing} */
function sourceGetter(F, ctx) {
  const kind = F ? F.kind : 'none';
  if (kind === 'col' && F.col) {
    const col = ctx?.byName.get(F.col);
    if (col) { const i = col.idx; return { get: row => cellStr(row[i]) }; }
    return { get: null, missing: `colonne « ${F.col} » introuvable dans la source` };
  }
  if (kind === 'const') { const k = F.value ?? ''; return { get: () => k }; }
  if (kind === 'tpl' && F.tpl) {
    const parts = []; let last = 0;
    for (const m of F.tpl.matchAll(/\{([^}]+)\}/g)) {
      parts.push(F.tpl.slice(last, m.index));
      const col = ctx?.byName.get(m[1]); parts.push(col ? col.idx : -1); last = m.index + m[0].length;
    }
    parts.push(F.tpl.slice(last));
    return { get: row => { let s = ''; for (const p of parts) s += typeof p === 'number' ? (p >= 0 ? cellStr(row[p]).trim() : '') : p; return s.replace(/\s{2,}/g, ' ').replace(/^[\s\-–,;/|]+|[\s\-–,;/|]+$/g, ''); } };
  }
  return { get: null };
}
function titleCase(s) { return s.toLowerCase().replace(/(^|[\s\-'’(\/])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()); }
function compileField(t, f, F, ctx) {
  const set = S.map.settings;
  const dflt = set.fillDefaults ? f.dflt : '';
  const { get, missing } = sourceGetter(F, ctx);
  if (!get) {
    const res = { v: dflt, d: dflt !== '', e: missing, empty: true };
    return () => res;
  }
  const vmap = new Map();
  for (const [a, b] of (F.map || [])) if (b !== '' && b != null) vmap.set(String(a).trim().toLowerCase(), b);
  const padLen = +F.padLen || 0, padChar = (F.padChar || '0')[0], padNum = F.padNum !== false;
  const kase = F.case || 'none', prefix = F.prefix || '', suffix = F.suffix || '', ifEmpty = F.dflt || '';
  return row => {
    let s = get(row).trim(); const input = s;
    if (vmap.size) { const k = s.toLowerCase(); if (vmap.has(k)) s = vmap.get(k); }
    if (s === '') {
      if (ifEmpty !== '') { const r = convertTo(f, ifEmpty, set); return { v: r.v, e: r.e, w: r.w, input, d: false }; }
      return { v: dflt, d: dflt !== '', input, empty: true };
    }
    if (kase === 'upper') s = s.toUpperCase(); else if (kase === 'lower') s = s.toLowerCase(); else if (kase === 'title') s = titleCase(s);
    if (padLen > 0 && s.length < padLen && (!padNum || /^\d+$/.test(s))) s = padChar.repeat(padLen - s.length) + s;
    if (prefix) s = prefix + s; if (suffix) s = s + suffix;
    const r = convertTo(f, s, set);
    return { v: r.v, e: r.e, w: r.w, input, d: false };
  };
}

/* contrôle d'un champ sur toutes les lignes */
function checkField(t, f) {
  const ctx = tableCtx(t); const F = getF(t, f);
  const out = { err: 0, warn: 0, ex: [], sampleIn: undefined, sampleOut: '', sampleDef: false, sampleBad: false, missing: null };
  if (!ctx || !ctx.rows.length) { out.sampleOut = S.map.settings.fillDefaults ? f.dflt : ''; out.sampleDef = true; return out; }
  if (F?.kind === 'col' && F.col && !ctx.byName.has(F.col)) {
    out.missing = `colonne « ${F.col} » introuvable dans la feuille source`;
    out.err = ctx.rows.length; out.ex = [{ row: '', msg: out.missing, lvl: 'err' }]; return out;
  }
  const fn = compileField(t, f, F, ctx); const mapped = isMapped(F);
  let got = false;
  for (let i = 0; i < ctx.rows.length; i++) {
    const r = fn(ctx.rows[i]);
    if (r.e) { out.err++; if (out.ex.length < 8) out.ex.push({ row: ctx.rowNums[i], msg: r.e, lvl: 'err' }); }
    else if (r.w) { out.warn++; if (out.ex.length < 8) out.ex.push({ row: ctx.rowNums[i], msg: r.w, lvl: 'warn' }); }
    if (!got && (r.input || i === ctx.rows.length - 1 || !mapped)) { got = true; out.sampleIn = r.input ?? ''; out.sampleOut = r.v; out.sampleDef = !!r.d; out.sampleBad = !!r.e; }
  }
  return out;
}
function checkKeys(t) {
  const T = tm(t); const ctx = tableCtx(t); const f = t.fields[0];
  if (!ctx || !f) return null;
  const fn = compileField(t, f, getF(t, f), ctx);
  const seen = new Map(); let empty = 0, dup = 0; const ex = [];
  if (T.mode === 'append') for (const r of t.existing) seen.set(r[0], 'package');
  for (let i = 0; i < ctx.rows.length; i++) {
    const v = fn(ctx.rows[i]).v;
    if (v === '') { empty++; if (ex.length < 6) ex.push(`ligne ${ctx.rowNums[i]} : clé vide`); continue; }
    if (seen.has(v)) { dup++; if (ex.length < 6) ex.push(`ligne ${ctx.rowNums[i]} : « ${v} » déjà présent ${seen.get(v) === 'package' ? 'dans le package' : `(ligne ${seen.get(v)})`}`); }
    else seen.set(v, ctx.rowNums[i]);
  }
  return { empty, dup, ex };
}
function validateTable(t, onlyKey) {
  const V = (S.val[t.name] ||= { fields: {}, keys: null });
  const fs = onlyKey ? t.fields.filter(f => f.key === onlyKey) : t.fields;
  for (const f of fs) V.fields[f.key] = checkField(t, f);
  if (!onlyKey || onlyKey === t.fields[0]?.key) V.keys = checkKeys(t);
  return V;
}
function tableIssues(t) {
  const V = S.val[t.name]; if (!V) return { err: 0, warn: 0 };
  const T = tm(t); if (T.mode === 'keep') return { err: 0, warn: 0 };
  let err = 0, warn = 0;
  for (const k in V.fields) { if (V.fields[k].err) err++; if (V.fields[k].warn) warn++; }
  if (V.keys && (V.keys.dup || V.keys.empty)) err++;
  return { err, warn };
}

/* ---------------- correspondance automatique ---------------- */
const STOP = new Set(['de', 'd', 'du', 'des', 'la', 'le', 'l', 'les', 'n', 'no', 'o', 'on', 'a', 'au', 'aux', 'et', 'en', 'par']);
const toks = s => norm(s).split(' ').filter(w => w && !STOP.has(w));
function bigrams(s) { const b = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.substr(i, 2); b.set(g, (b.get(g) || 0) + 1); } return b; }
function dice(a, b) {
  if (a === b) return 1; if (a.length < 2 || b.length < 2) return 0;
  const A = bigrams(a), B = bigrams(b); let inter = 0;
  for (const [g, n] of A) inter += Math.min(n, B.get(g) || 0);
  return 2 * inter / (a.length - 1 + b.length - 1);
}
function similarity(x, y) {
  if (norm(x) === norm(y)) return 2;
  const tx = toks(x), ty = toks(y); const sx = tx.join(' '), sy = ty.join(' ');
  if (!sx || !sy) return 0;
  const NEG = w => ['non', 'ne', 'pas', 'sans', 'hors', 'not', 'no'].includes(w);
  const negDiff = norm(x).split(' ').some(NEG) !== norm(y).split(' ').some(NEG);
  if (sx === sy) return negDiff ? 0.5 : 1.5;
  let s = dice(sx.replace(/ /g, ''), sy.replace(/ /g, ''));
  const [short, long] = tx.length <= ty.length ? [tx, ty] : [ty, tx];
  if (short.length >= 2 && short.every(w => long.includes(w))) s = Math.max(s, 0.8);
  return negDiff ? s * 0.5 : s;
}
function autoMapTable(t, overwrite = false) {
  const T = tm(t); const ctx = getCtx(T); if (!ctx) return 0;
  const used = new Set(); const targets = [];
  for (const f of t.fields) {
    const F = getF(t, f);
    if (isMapped(F) && !overwrite) { if (F.kind === 'col') used.add(F.col); continue; }
    targets.push(f);
  }
  const pairs = [];
  for (const f of targets) for (const col of ctx.cols) {
    const sc = similarity(f.caption, col.name);
    if (sc >= 0.78) pairs.push([sc, f, col]);
  }
  pairs.sort((a, b) => b[0] - a[0]);
  const done = new Set(); let n = 0;
  for (const [sc, f, col] of pairs) {
    if (done.has(f.key) || used.has(col.name)) continue;
    done.add(f.key); used.add(col.name); n++;
    const F = { ...newF(), kind: 'col', col: col.name, auto: sc >= 2 ? 'exact' : 'fuzzy' };
    if (f.padHint && col.numeric) F.padLen = f.padHint;
    T.fields[f.key] = F;
  }
  return n;
}
function matchSheet(t) {
  if (!S.raw) return null;
  const clean = s => toks(String(s).replace(/^\s*\d+\s*/, '')).map(w => w.replace(/s$/, '')).join(' ');
  const a = clean(t.name), b = clean(t.tableCaption);
  let best = null, bs = 0;
  for (const sh of S.raw.sheets) {
    const c = clean(sh.name);
    const sc = Math.max(c === a || c === b ? 2 : 0, dice(c, a), dice(c, b));
    if (sc > bs) { bs = sc; best = sh; }
  }
  return bs >= 0.75 ? best.name : null;
}
function guessHeaderRow(sheet) {
  let best = 1, bn = -1;
  for (let r = 0; r < Math.min(10, sheet.rows.length); r++) {
    const row = sheet.rows[r] || []; const n = row.filter(c => c && c.t === 's' && c.v.trim()).length;
    if (n > bn * 1.2) { bn = n; best = r + 1; }
  }
  return best;
}
function dataRowCount(sheetName, headerRow) { const ctx = getCtx({ source: sheetName, headerRow }); return ctx ? ctx.rows.length : 0; }
function setupFresh() {
  S.map = newMap(); let n = 0;
  for (const t of S.pkg.tables) {
    const T = tm(t); const src = matchSheet(t);
    if (src) {
      const sh = S.raw.sheets.find(s => s.name === src);
      T.source = src; T.headerRow = guessHeaderRow(sh);
      T.mode = dataRowCount(src, T.headerRow) > 0 ? 'replace' : 'keep';
      n += autoMapTable(t);
    }
  }
  return n;
}
