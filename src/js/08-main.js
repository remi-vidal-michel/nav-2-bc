'use strict';
/* 08-main.js : Chargement des fichiers et démarrage de l'application. */

/* ---------------- entrée des fichiers ---------------- */
async function handleFile(file, hint) {
  if (!file) return;
  if (/\.json$/i.test(file.name)) { try { await importMappingFile(file); } catch (e) { toast(e.message, { err: true }); } return; }
  busy(true, `Lecture de ${file.name}…`); await nextFrame();
  try {
    let kind = hint;
    if (!kind) {
      if (/\.(csv|txt)$/i.test(file.name)) kind = 'raw';
      else { const zip = await JSZip.loadAsync(await file.arrayBuffer()); kind = (zip.file('xl/xmlMaps.xml') || Object.keys(zip.files).some(p => /^xl\/tables\/tableSingleCells/.test(p))) ? 'pkg' : 'raw'; }
    }
    if (kind === 'pkg') {
      const P = await loadPackage(file);
      if (!P.isPackage) toast("Ce fichier ne ressemble pas à un package BC exporté : vérifiez la ligne 1 (code package, table) et la ligne 3 (champs).", { err: true, ms: 8000 });
      S.pkg = P; $('#pkgName').textContent = file.name; $('#dropPkg').classList.add('done');
    } else {
      S.raw = await loadRaw(file); ctxCache.clear(); $('#rawName').textContent = file.name; $('#dropRaw').classList.add('done');
    }
    busy(false);
    if (S.raw && S.pkg) startWorkspace(kind);
  } catch (e) { busy(false); console.error(e); toast(e.message || 'Lecture impossible.', { err: true, ms: 8000 }); }
}
let started = false;
function startWorkspace(changed) {
  ctxCache.clear(); S.val = {};
  if (!started) {
    started = true;
    $('#landing').classList.add('hidden'); $('#app').classList.remove('hidden');
    bindApp();
    if (S.pendingMap) { const m = S.pendingMap; S.pendingMap = null; S.ui.t = 0; applyImportedMapping(m); return; }
    let saved = null; try { saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { }
    const n = setupFresh();
    if (saved?.map?.tables && Object.keys(saved.map.tables).some(k => S.pkg.tables.some(t => t.name === k))) {
      const fresh = S.map;
      try {
        applyImportedMapping(validateMapping(saved.map), true);
        const when = saved.savedAt ? new Date(saved.savedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '';
        toast(`Mapping de la session précédente restauré${when ? ' (' + when + ')' : ''}.`, { action: { label: 'Repartir de zéro', run: () => { S.map = fresh; validateAll(); renderAll(); autosave(); } } });
        return;
      } catch { S.map = fresh; }
    }
    validateAll(); renderAll(); autosave();
    toast(n ? `${plural(n, 'champ associé', 'champs associés')} automatiquement par leur nom. Vérifiez ceux marqués « à vérifier ».` : 'Associez les feuilles source aux tables du package pour commencer.', { ms: 7000 });
    return;
  }
  // remplacement d'un fichier en cours de session : on garde le mapping
  if (S.ui.t >= S.pkg.tables.length) S.ui.t = 0;
  for (const t of S.pkg.tables) { const T = tm(t); if (T.source && !S.raw.sheets.some(s => s.name === T.source)) { T.source = matchSheet(t); if (!T.source) T.mode = 'keep'; } }
  validateAll(); renderAll(); autosave();
  toast(changed === 'pkg' ? 'Package remplacé, mapping conservé.' : 'Export Navision remplacé, mapping conservé.');
}
function bindLanding() {
  const zones = [['#dropRaw', '#fileRaw', 'raw'], ['#dropPkg', '#filePkg', 'pkg']];
  for (const [z, inp, kind] of zones) {
    const el = $(z);
    el.addEventListener('click', () => $(inp).click());
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $(inp).click(); } });
    el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('over'); });
    el.addEventListener('dragleave', () => el.classList.remove('over'));
    el.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); el.classList.remove('over'); handleFile(e.dataTransfer.files[0], kind); });
    $(inp).addEventListener('change', e => { handleFile(e.target.files[0], kind); e.target.value = ''; });
  }
  $('#fileMap').addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (f) try { await importMappingFile(f); } catch (err) { toast(err.message, { err: true }); } });
  $('#landingImport').onclick = () => $('#fileMap').click();
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', async e => {
    e.preventDefault(); const files = [...e.dataTransfer.files];
    for (const f of files) await handleFile(f, null);
  });
}
bindLanding();
