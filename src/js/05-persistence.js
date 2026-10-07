'use strict';
/* 05-persistence.js : Sauvegarde locale, import/export des modèles de mapping. */

/* ---------------- persistance ---------------- */
/* sauvegarde locale : un mapping par nom de fichier export Navision, les LS_MAX plus récents -> {[nom]: {savedAt, pkg, map}} */
const LS_MAX = 20;
function savedMaps() {
  try {
    const all = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (all && typeof all === 'object') return all;
    const old = JSON.parse(localStorage.getItem(LS_OLD) || 'null'); // ancienne sauvegarde unique
    return old?.raw && old.map ? { [old.raw]: { savedAt: old.savedAt, pkg: old.pkg, map: old.map } } : {};
  } catch { return {}; }
}
const autosave = debounce(() => {
  if (!S.raw || !S.map) return;
  try {
    const all = savedMaps(); all[S.raw.fileName] = { savedAt: new Date().toISOString(), pkg: S.pkg?.fileName, map: S.map };
    const keep = Object.entries(all).sort((a, b) => String(b[1]?.savedAt || '').localeCompare(String(a[1]?.savedAt || ''))).slice(0, LS_MAX);
    localStorage.setItem(LS_KEY, JSON.stringify(Object.fromEntries(keep))); localStorage.removeItem(LS_OLD);
  } catch { }
}, 400);
function exportMapping() {
  if (!S.map) return;
  const data = { ...S.map, app: APP_ID, version: MAP_VERSION, savedAt: new Date().toISOString(), packageFile: S.pkg?.fileName || null, sourceFile: S.raw?.fileName || null };
  const clean = JSON.parse(JSON.stringify(data));
  for (const tn in clean.tables) for (const k in clean.tables[tn].fields) { const F = clean.tables[tn].fields[k]; delete F.auto; if (!isMapped(F) && !F.dflt) delete clean.tables[tn].fields[k]; }
  download(new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' }), S.raw ? `${baseName(S.raw.fileName).trim().replace(/\s+/g, '_')}_mapping.json` : `mapping_NAV-BC_${stamp()}.json`);
  toast('Mapping exporté.');
}
function validateMapping(obj) {
  if (!obj || typeof obj !== 'object' || !obj.tables) throw new Error("Ce fichier ne contient pas de modèle de mapping.");
  const m = newMap(); m.settings = { ...defaultSettings(), ...(obj.settings || {}) };
  m.axes = (Array.isArray(obj.axes) ? obj.axes : []).filter(r => r && typeof r === 'object').map(r => Object.fromEntries(AXIS_COLS.map(([k]) => [k, String(r[k] ?? '').trim()]))).filter(r => r.dep);
  // anciennes correspondances partagées (correspondance globale, modèles de correspondance) : reprises à l'application
  // du mapping dans les correspondances de chaque champ, pour les valeurs présentes dans sa colonne
  const legacy = { global: [], fields: {} };
  const pair = (a, b) => String(b ?? '').trim() ? [[String(a ?? '').trim(), String(b).trim()]] : [];
  if (Array.isArray(obj.globalMap)) legacy.global = obj.globalMap.filter(p => Array.isArray(p) && p.length === 2).flatMap(p => pair(p[0], p[1]));
  const models = new Map((Array.isArray(obj.models) ? obj.models : []).filter(M => M && Array.isArray(M.cols) && Array.isArray(M.rows)).map(M => [M.id, M]));
  for (const [tn, T] of Object.entries(obj.tables)) {
    const fields = {};
    for (const [k, { model, ...F }] of Object.entries(T.fields || {})) {
      const filter = Array.isArray(F.filter) ? F.filter.map(String) : null;
      const M = model && models.get(model.id); const c = M ? M.cols.indexOf(model.col) : -1;
      if (c >= 0 && c !== +M.key) (legacy.fields[tn] ||= {})[k] = M.rows.filter(Array.isArray).flatMap(r => pair(r[+M.key], r[c]));
      fields[k] = { ...newF(), ...F, filter, map: Array.isArray(F.map) ? F.map.filter(p => Array.isArray(p) && p.length === 2).map(p => [String(p[0]), String(p[1])]) : [] };
    }
    const manual = (Array.isArray(T.manual) ? T.manual : []).filter(r => r && typeof r === 'object' && !Array.isArray(r)).map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '')])));
    m.tables[tn] = { source: T.source ?? null, headerRow: 1, mode: ['replace', 'append', 'keep'].includes(T.mode) ? T.mode : 'keep', keys: Array.isArray(T.keys) && T.keys.length ? T.keys.map(String) : null, fields, manual };
  }
  if (legacy.global.length || Object.keys(legacy.fields).length) m.legacy = legacy;
  return m;
}
/* reprise des anciennes correspondances partagées ; une correspondance déjà saisie sur le champ reste prioritaire */
function applyLegacyMaps(L) {
  for (const t of S.pkg.tables) for (const f of t.fields) {
    const T = tm(t); const F = T.fields[f.key]; if (F?.kind !== 'col') continue;
    const pairs = [...(L.fields[t.name]?.[f.key] || []), ...L.global]; if (!pairs.length) continue;
    const r = mergeValueMap(t, F, pairs, false); if (r.n) T.fields[f.key] = { ...F, map: r.map };
  }
}
async function importMappingFile(file) {
  let obj; try { obj = JSON.parse(await file.text()); } catch { throw new Error("Le fichier de mapping n'est pas un JSON valide."); }
  const m = validateMapping(obj);
  if (S.pkg && S.raw) applyImportedMapping(m); else { S.pendingMap = m; toast('Mapping chargé. Il sera appliqué dès que les deux fichiers seront chargés.'); }
}
function applyImportedMapping(m, silent) {
  S.map = m; ctxCache.clear(); S.val = {};
  let unknownT = 0, unknownF = 0;
  for (const tn in m.tables) {
    const t = S.pkg.tables.find(x => x.name === tn); if (!t) { unknownT++; continue; }
    for (const k in m.tables[tn].fields) if (!t.fields.some(f => f.key === k)) unknownF++;
    const T = m.tables[tn]; if (T.source && !S.raw.sheets.some(s => s.name === T.source)) { T.source = null; if (!T.manual.length) T.mode = 'keep'; }
  }
  if (m.legacy) { applyLegacyMaps(m.legacy); delete m.legacy; }
  validateAll(); renderAll();
  const extra = [unknownT && plural(unknownT, 'table absente'), unknownF && plural(unknownF, 'champ absent')].filter(Boolean).join(', ');
  if (!silent || extra) toast('Mapping appliqué' + (extra ? ` (${extra} du package, ignorés)` : '') + '.');
  autosave();
}
