'use strict';
/* 04-engine.js : Modèle de mapping, contexte source, moteur de transformation, contrôles, mapping automatique. */

/* ---------------- modèle de mapping ---------------- */
function newMap() { return { app: APP_ID, version: MAP_VERSION, settings: defaultSettings(), axes: [], tables: {} }; }
const newF = () => ({ kind: 'none', col: '', value: '', tpl: '', map: [], case: 'none', repFrom: '', repTo: '', repAt: 'start', padLen: 0, padChar: '0', padNum: true, prefix: '', suffix: '', dflt: '', filter: null });

function tm(t) { return (S.map.tables[t.name] ||= { source: null, headerRow: 1, mode: 'keep', keys: null, fields: {}, manual: [] }); }
function getF(t, f) { return tm(t).fields[f.key] || null; }
function isMapped(F) { return !!F && ((F.kind === 'col' && !!F.col) || (F.kind === 'const') || (F.kind === 'tpl' && !!F.tpl)); }
function fmtChips(F, f) {
  const c = []; if (!F) return c;
  if (F.map?.some(p => p[1] !== '')) c.push(['', `${F.map.filter(p => p[1] !== '').length} corresp.`]);
  if (F.repFrom) c.push(['', 'remplacement']);
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

/* ---------------- lignes ajoutées à la main ----------------
   Saisies dans la vue « Résultat » : T.manual liste, pour chaque ligne, la valeur BC de chaque champ (par clé de champ).
   Elles sont écrites avant les lignes de la source ; une ligne entièrement vide est ignorée. */
const manualAll = t => tm(t).manual || [];
/* lignes ajoutées non vides -> [[n° d'affichage, valeurs]] */
const manualRows = t => manualAll(t).map((m, i) => [i + 1, m]).filter(([, m]) => Object.values(m).some(v => String(v).trim() !== ''));
const manualLabel = n => `ajoutée ${n}`;
/* valeur saisie -> {v, e, w, d} : convertie au type du champ, valeur par défaut BC si vide */
function manualCell(f, raw) {
  const set = S.map.settings; const s = String(raw ?? '').trim();
  if (s === '') { const d = set.fillDefaults ? f.dflt : ''; return { v: d, d: d !== '', input: '', empty: true }; }
  const r = convertTo(f, s, set); return { v: r.v, e: r.e, w: r.w, input: s, d: false };
}
/* lignes écrites par la table, hors lignes déjà présentes dans le package : ajoutées à la main + source retenue */
const outCount = t => (tableCtx(t)?.rows.length || 0) + manualRows(t).length;

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

/* fusionne des correspondances (valeur source -> valeur BC) dans celles d'un champ alimenté par une colonne,
   pour les seules valeurs présentes dans la colonne ; overwrite : remplace une correspondance déjà saisie.
   -> {map, n : valeurs reprises, miss : valeurs absentes de la colonne} */
function mergeValueMap(t, F, pairs, overwrite) {
  const ctx = tableCtx(t);
  const vals = new Map((ctx && F?.kind === 'col' ? sourceValues(F, ctx) : []).map(([v]) => [v.toLowerCase(), v]));
  const map = (F?.map || []).map(p => [...p]); const at = new Map(map.map((p, i) => [p[0].trim().toLowerCase(), i]));
  let n = 0, miss = 0;
  for (const [a, b] of pairs) {
    const k = String(a).trim().toLowerCase(); const v = vals.get(k);
    if (v === undefined) { miss++; continue; }
    const i = at.get(k);
    if (i === undefined) { at.set(k, map.length); map.push([v, b]); n++; }
    else if (overwrite || map[i][1] === '') { map[i][1] = b; n++; }
  }
  return { map, n, miss };
}

/* ---------------- axes analytiques ----------------
   S.map.axes : table de référence [{dep, nom, agence, activite}]. Appliquer un axe à un champ remplit sa correspondance
   des valeurs : axe département (valeur source) -> axe agence ou activité (valeur BC), en remplaçant celles déjà saisies.
   Les codes sont comparés sans tenir compte de la casse ni des zéros de tête (033011 = 33011). */
const AXIS_COLS = [['dep', 'Axe département'], ['nom', 'Nom'], ['agence', 'Axe agence'], ['activite', 'Axe activité']];
const AXES = [['agence', 'Agence'], ['activite', 'Activité']];
const axisKey = s => String(s ?? '').trim().toLowerCase().replace(/^0+(?=\d)/, '');
/* -> {map, n : valeurs reprises, miss : valeurs de la colonne sans axe département dans la table} */
function axisMap(t, F, axis) {
  const ref = new Map();
  for (const r of S.map.axes || []) if (r.dep && r[axis]) ref.set(axisKey(r.dep), r[axis]);
  const ctx = tableCtx(t); const pairs = []; let miss = 0;
  for (const [v] of ctx && F?.kind === 'col' ? sourceValues(F, ctx) : []) {
    if (v === '') continue;
    const b = ref.get(axisKey(v)); if (b === undefined) miss++; else pairs.push([v, b]);
  }
  return { ...mergeValueMap(t, F, pairs, true), miss };
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
/* remplacement d'un texte par un autre, au début, à la fin ou partout (sensible à la casse) */
function replaceText(s, from, to, at) {
  if (!from) return s;
  if (at === 'start') return s.startsWith(from) ? to + s.slice(from.length) : s;
  if (at === 'end') return s.endsWith(from) ? s.slice(0, s.length - from.length) + to : s;
  return s.split(from).join(to);
}
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
  const repFrom = F.repFrom || '', repTo = F.repTo || '', repAt = F.repAt || 'start';
  return row => {
    let s = get(row).trim(); const input = s;
    if (vmap.size) { const k = s.toLowerCase(); if (vmap.has(k)) s = vmap.get(k); }
    if (repFrom) s = replaceText(s, repFrom, repTo, repAt);
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
  const note = (r, row) => {
    if (r.e) { out.err++; if (out.ex.length < 8) out.ex.push({ row, msg: r.e, lvl: 'err' }); }
    else if (r.w) { out.warn++; if (out.ex.length < 8) out.ex.push({ row, msg: r.w, lvl: 'warn' }); }
  };
  // lignes ajoutées à la main d'abord, comme dans le fichier ; l'exemple vient toujours de la source
  for (const [n, m] of manualRows(t)) note(manualCell(f, m[f.key]), manualLabel(n));
  if (!ctx || !ctx.rows.length) { out.sampleOut = S.map.settings.fillDefaults ? f.dflt : ''; out.sampleDef = true; return out; }
  if (F?.kind === 'col' && F.col && !ctx.byName.has(F.col)) {
    out.missing = `colonne « ${F.col} » introuvable dans la feuille source`;
    out.err += ctx.rows.length; out.ex.unshift({ row: '', msg: out.missing, lvl: 'err' }); return out;
  }
  const fn = compileField(t, f, F, ctx); const mapped = isMapped(F);
  let got = false;
  for (let i = 0; i < ctx.rows.length; i++) {
    const r = fn(ctx.rows[i]);
    note(r, ctx.rowNums[i]);
    if (!got && (r.input || i === ctx.rows.length - 1 || !mapped)) { got = true; out.sampleIn = r.input ?? ''; out.sampleOut = r.v; out.sampleDef = !!r.d; out.sampleBad = !!r.e; }
  }
  return out;
}
/* clé primaire : champs désignés par l'utilisateur (T.keys), le premier champ du package à défaut */
function keyFields(t) {
  const K = tm(t).keys; const fs = Array.isArray(K) ? t.fields.filter(f => K.includes(f.key)) : [];
  return fs.length ? fs : t.fields.slice(0, 1);
}
const isKeyField = (t, f) => keyFields(t).includes(f);
const keyLabel = t => keyFields(t).map(f => f.caption).join(' + ');
function checkKeys(t) {
  const T = tm(t); const ctx = tableCtx(t); const kf = keyFields(t); const man = manualRows(t);
  if ((!ctx && !man.length) || !kf.length) return null;
  const fns = ctx ? kf.map(f => compileField(t, f, getF(t, f), ctx)) : [];
  const SEP = '\u0001'; const show = v => v.split(SEP).map(x => x === '' ? '(vide)' : x).join(' | ');
  const seen = new Map(); let empty = 0, dup = 0; const ex = [];
  if (T.mode === 'append') for (const r of t.existing) seen.set(kf.map(f => r[f.i]).join(SEP), 'package');
  // lignes dans l'ordre du fichier : ajoutées à la main, puis source
  const rows = man.map(([n, m]) => [manualLabel(n), kf.map(f => manualCell(f, m[f.key]).v)]);
  if (ctx) ctx.rows.forEach((row, i) => rows.push([ctx.rowNums[i], fns.map(fn => fn(row).v)]));
  for (const [label, vs] of rows) {
    // une partie vide est admise dans une clé composée ; la clé entièrement vide ne l'est pas
    if (vs.every(v => v === '')) { empty++; if (ex.length < 6) ex.push(`ligne ${label} : clé vide`); continue; }
    const v = vs.join(SEP);
    if (seen.has(v)) { dup++; if (ex.length < 6) ex.push(`ligne ${label} : « ${show(v)} » déjà présent ${seen.get(v) === 'package' ? 'dans le package' : `(ligne ${seen.get(v)})`}`); }
    else seen.set(v, label);
  }
  return { empty, dup, ex };
}
function validateTable(t, onlyKey) {
  const V = (S.val[t.name] ||= { fields: {}, keys: null });
  const fs = onlyKey ? t.fields.filter(f => f.key === onlyKey) : t.fields;
  for (const f of fs) V.fields[f.key] = checkField(t, f);
  if (!onlyKey || keyFields(t).some(f => f.key === onlyKey)) V.keys = checkKeys(t);
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
function dataRowCount(sheetName, headerRow) { const ctx = getCtx({ source: sheetName, headerRow }); return ctx ? ctx.rows.length : 0; }
function setupFresh() {
  S.map = newMap(); let n = 0;
  for (const t of S.pkg.tables) {
    const T = tm(t); const src = matchSheet(t);
    if (src) {
      T.source = src; T.headerRow = 1;
      T.mode = dataRowCount(src, T.headerRow) > 0 ? 'replace' : 'keep';
      n += autoMapTable(t);
    }
  }
  return n;
}
