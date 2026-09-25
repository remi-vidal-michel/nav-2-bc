'use strict';
/* 05-persistence.js : Sauvegarde locale, import/export des modèles de mapping. */

/* ---------------- persistance ---------------- */
const autosave = debounce(() => { try { localStorage.setItem(LS_KEY, JSON.stringify({ savedAt: new Date().toISOString(), pkg: S.pkg?.fileName, raw: S.raw?.fileName, map: S.map })); } catch { } }, 400);
function exportMapping() {
  if (!S.map) return;
  const data = { ...S.map, app: APP_ID, version: MAP_VERSION, savedAt: new Date().toISOString(), packageFile: S.pkg?.fileName || null, sourceFile: S.raw?.fileName || null };
  const clean = JSON.parse(JSON.stringify(data));
  for (const tn in clean.tables) for (const k in clean.tables[tn].fields) { const F = clean.tables[tn].fields[k]; delete F.auto; if (!isMapped(F) && !F.dflt) delete clean.tables[tn].fields[k]; }
  download(new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' }), `mapping_NAV-BC_${stamp()}.json`);
  toast('Mapping exporté.');
}
function validateMapping(obj) {
  if (!obj || typeof obj !== 'object' || !obj.tables) throw new Error("Ce fichier ne contient pas de modèle de mapping.");
  const m = newMap(); m.settings = { ...defaultSettings(), ...(obj.settings || {}) };
  for (const [tn, T] of Object.entries(obj.tables)) {
    const fields = {};
    for (const [k, F] of Object.entries(T.fields || {})) {
      const filter = Array.isArray(F.filter) ? F.filter.map(String) : null;
      fields[k] = { ...newF(), ...F, filter, map: Array.isArray(F.map) ? F.map.filter(p => Array.isArray(p) && p.length === 2).map(p => [String(p[0]), String(p[1])]) : [] };
    }
    m.tables[tn] = { source: T.source ?? null, headerRow: +T.headerRow || 1, mode: ['replace', 'append', 'keep'].includes(T.mode) ? T.mode : 'keep', fields };
  }
  return m;
}
async function importMappingFile(file) {
  let obj; try { obj = JSON.parse(await file.text()); } catch { throw new Error("Le fichier de mapping n'est pas un JSON valide."); }
  const m = validateMapping(obj);
  if (S.pkg && S.raw) applyImportedMapping(m); else { S.pendingMap = m; $('#landingMapName').textContent = `Mapping prêt : ${file.name}`; toast('Mapping chargé. Il sera appliqué dès que les deux fichiers seront chargés.'); }
}
function applyImportedMapping(m, silent) {
  S.map = m; ctxCache.clear(); S.val = {};
  let unknownT = 0, unknownF = 0;
  for (const tn in m.tables) {
    const t = S.pkg.tables.find(x => x.name === tn); if (!t) { unknownT++; continue; }
    for (const k in m.tables[tn].fields) if (!t.fields.some(f => f.key === k)) unknownF++;
    const T = m.tables[tn]; if (T.source && !S.raw.sheets.some(s => s.name === T.source)) { T.source = null; T.mode = 'keep'; }
  }
  validateAll(); renderAll();
  const extra = [unknownT && plural(unknownT, 'table absente'), unknownF && plural(unknownF, 'champ absent')].filter(Boolean).join(', ');
  if (!silent || extra) toast('Mapping appliqué' + (extra ? ` (${extra} du package, ignorés)` : '') + '.');
  autosave();
}
