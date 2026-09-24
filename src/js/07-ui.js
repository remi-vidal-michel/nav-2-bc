'use strict';
/* 07-ui.js : Rendu de l'interface, inspecteur, sélecteur de colonne, événements, dialogues. */

/* ---------------- rendu ---------------- */
const ICON_CHEV = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 6l4 4 4-4"/></svg>';
function curT() { return S.pkg.tables[S.ui.t]; }
function typeLabel(ty) { return ty.base + (ty.len ? ' ' + ty.len : ''); }
function renderAll() { renderTables(); renderCenter(); renderInspector(); renderChips(); }
function renderChips() {
  $('#chipRaw span').textContent = S.raw?.fileName || '—';
  $('#chipPkg span').textContent = S.pkg?.fileName || '—';
}
function renderTables() {
  const el = $('#tables');
  el.innerHTML = '<h3>Tables du package</h3>' + S.pkg.tables.map((t, i) => {
    const T = tm(t); const mapped = t.fields.filter(f => isMapped(getF(t, f))).length;
    const iss = tableIssues(t); const mode = effectiveMode(t);
    const modeTxt = mode === 'keep' ? 'Inchangée' : mode === 'append' ? 'Ajout' : 'Remplacement';
    const badge = mode === 'keep' ? `<span class="pill mute">${modeTxt}</span>` : iss.err ? `<span class="pill err">${iss.err}</span>` : iss.warn ? `<span class="pill warn">${iss.warn}</span>` : `<span class="pill ok">${modeTxt}</span>`;
    return `<button class="titem${i === S.ui.t ? ' sel' : ''}" data-t="${i}">
      <div class="tn"><span>${esc(t.name)}</span>${badge}</div>
      <div class="ts">${T.source ? 'Source : ' + esc(T.source) : 'Aucune feuille source'}</div>
      <div class="bar" title="${mapped} champs sur ${t.fields.length} alimentés"><i style="width:${(mapped / t.fields.length * 100).toFixed(1)}%"></i></div>
    </button>`;
  }).join('');
}
function renderCenter() {
  const t = curT(); const T = tm(t); const ctx = getCtx(T);
  const mapped = t.fields.filter(f => isMapped(getF(t, f))).length;
  const sheets = S.raw.sheets.map(s => `<option value="${esc(s.name)}"${s.name === T.source ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
  const K = S.val[t.name]?.keys;
  const mode = effectiveMode(t);
  const keyNote = K && mode !== 'keep' && (K.dup || K.empty) ? `<span style="color:var(--err)"><b style="color:inherit">Clé ${esc(t.fields[0].caption)}</b> : ${[K.dup && plural(K.dup, 'doublon'), K.empty && plural(K.empty, 'valeur vide', 'valeurs vides')].filter(Boolean).join(', ')}</span>` : '';
  $('#center').innerHTML = `
  <div class="thead">
    <h2>${esc(t.name)} <small>Table ${esc(t.tableId)} ${t.tableCaption ? '(' + esc(t.tableCaption) + ')' : ''}, package ${esc(t.pkgCode)}</small></h2>
    <div class="controls">
      <label class="ctl"><span>Feuille source Navision</span><select id="selSource"><option value="">Aucune</option>${sheets}</select></label>
      <label class="ctl"><span>Ligne d'en-tête</span><input type="number" id="inHdr" min="1" max="50" value="${T.headerRow}" ${T.source ? '' : 'disabled'}></label>
      <label class="ctl"><span>Données du package</span><select id="selMode" ${T.source ? '' : 'disabled'}>
        <option value="replace"${T.mode === 'replace' ? ' selected' : ''}>Remplacer par la source</option>
        <option value="append"${T.mode === 'append' ? ' selected' : ''}>Ajouter à l'existant</option>
        <option value="keep"${T.mode === 'keep' ? ' selected' : ''}>Laisser inchangées</option></select></label>
      <button class="btn" id="btnAuto" ${ctx ? '' : 'disabled'} title="Associe les colonnes dont le nom correspond">Mapper automatiquement</button>
      <button class="btn ghost" id="btnClear" title="Retirer toutes les correspondances de cette table">Tout effacer</button>
    </div>
    <div class="facts">
      <span><b>${ctx ? nf(ctx.rows.length) : 0}</b> lignes source</span>
      <span><b>${nf(t.existing.length)}</b> lignes déjà dans le package</span>
      <span><b>${mapped}</b> / ${t.fields.length} champs alimentés</span>
      ${mode === 'keep' && T.source ? '<span>Cette table sera recopiée telle quelle.</span>' : ''}
      ${keyNote}
    </div>
  </div>
  <div class="toolbar">
    <div class="tabs" role="tablist">
      <button role="tab" data-tab="map" aria-selected="${S.ui.tab === 'map'}">Correspondances</button>
      <button role="tab" data-tab="prev" aria-selected="${S.ui.tab === 'prev'}">Aperçu du résultat</button>
    </div>
    <div class="spacer"></div>
    <div class="seg" id="segFilter" ${S.ui.tab === 'map' ? '' : 'hidden'}>
      ${[['all', 'Tous'], ['mapped', 'Alimentés'], ['unmapped', 'Non alimentés'], ['issues', 'Anomalies']].map(([k, l]) => `<button data-filter="${k}" aria-pressed="${S.ui.filter === k}">${l}</button>`).join('')}
    </div>
    <input type="search" id="inSearch" placeholder="Rechercher un champ ou une colonne" value="${esc(S.ui.q)}" ${S.ui.tab === 'map' ? '' : 'hidden'}>
  </div>
  <div class="gridwrap" id="gridwrap"></div>`;
  renderGrid();
}
function fieldRowHTML(t, f) {
  const F = getF(t, f); const V = S.val[t.name]?.fields[f.key] || {};
  const m = isMapped(F); const sel = S.ui.f === f.key;
  let srcTxt = 'Non alimenté', cls = 'none';
  if (F?.kind === 'col' && F.col) { srcTxt = F.col; cls = V.missing ? 'missing' : ''; }
  else if (F?.kind === 'const') { srcTxt = `Constante : ${F.value === '' ? '(vide)' : F.value}`; cls = ''; }
  else if (F?.kind === 'tpl' && F.tpl) { srcTxt = `Modèle : ${F.tpl}`; cls = ''; }
  const chips = fmtChips(F, f).map(([c, l]) => `<span class="chip ${c}">${esc(l)}</span>`).join('');
  const outCls = V.sampleBad ? 'bad' : V.sampleDef ? 'def' : '';
  const prev = m && V.sampleIn !== undefined
    ? `<span class="in" title="${esc(V.sampleIn)}">${esc(V.sampleIn || '∅')}</span><span class="arrow">→</span><span class="out ${outCls}" title="${esc(V.sampleOut)}">${esc(V.sampleOut === '' ? '∅' : V.sampleOut)}</span>`
    : `<span class="out def" title="Valeur écrite si le champ n'est pas alimenté">${S.map.settings.fillDefaults && f.dflt !== '' ? esc(f.dflt) : ''}</span>`;
  const st = [V.err ? `<span class="pill err" title="Lignes en erreur">${nf(V.err)}</span>` : '', V.warn ? `<span class="pill warn" title="Lignes avec alerte">${nf(V.warn)}</span>` : ''].join('');
  return `<div class="grow frow${m ? ' mapped' : ''}${sel ? ' sel' : ''}" data-k="${esc(f.key)}" tabindex="${sel ? 0 : -1}">
    <div><span class="fcap" title="${esc(f.caption)}">${esc(f.caption)}</span><span class="ftype"><code>${f.L}</code> ${esc(typeLabel(f.type))}${f.i === 0 ? '<span class="key">clé</span>' : ''}</span></div>
    <div><button class="srcbtn ${cls}" data-pick="${esc(f.key)}" title="${esc(srcTxt)}"><span>${esc(srcTxt)}</span>${ICON_CHEV}</button></div>
    <div class="chips">${chips}</div>
    <div class="prev">${prev}</div>
    <div class="stat">${st}</div>
  </div>`;
}
function visibleFields(t) {
  const q = norm(S.ui.q);
  return t.fields.filter(f => {
    const F = getF(t, f); const V = S.val[t.name]?.fields[f.key];
    if (S.ui.filter === 'mapped' && !isMapped(F)) return false;
    if (S.ui.filter === 'unmapped' && isMapped(F)) return false;
    if (S.ui.filter === 'issues' && !(V && (V.err || V.warn))) return false;
    if (q && !norm(f.caption).includes(q) && !norm(F?.col || '').includes(q)) return false;
    return true;
  });
}
function renderGrid() {
  const t = curT(); const wrap = $('#gridwrap'); if (!wrap) return;
  if (S.ui.tab === 'prev') return renderPreview();
  const fs = visibleFields(t);
  wrap.innerHTML = `<div class="grid"><div class="grow ghead"><div>Champ Business Central</div><div>Colonne Navision</div><div>Format</div><div>Exemple (source → package)</div><div></div></div>` +
    (fs.length ? fs.map(f => fieldRowHTML(t, f)).join('') : `<div class="empty">Aucun champ ne correspond à ce filtre.</div>`) + '</div>';
}
function refreshRow(t, f) {
  const el = $(`.frow[data-k="${CSS.escape(f.key)}"]`); if (!el) return;
  const tmp = document.createElement('div'); tmp.innerHTML = fieldRowHTML(t, f); el.replaceWith(tmp.firstElementChild);
}
function renderPreview() {
  const t = curT(); const T = tm(t); const ctx = getCtx(T); const wrap = $('#gridwrap');
  if (!ctx) { wrap.innerHTML = `<div class="empty">Choisissez une feuille source pour voir les lignes qui seront générées.</div>`; return; }
  const N = Math.min(200, ctx.rows.length);
  const fns = t.fields.map(f => compileField(t, f, getF(t, f), ctx));
  let h = `<table class="ptable"><thead><tr><th>Ligne</th>${t.fields.map(f => `<th class="${isMapped(getF(t, f)) ? '' : 'unm'}" title="${esc(f.caption)}">${esc(f.caption)}<small>${esc(typeLabel(f.type))}</small></th>`).join('')}</tr></thead><tbody>`;
  for (let i = 0; i < N; i++) {
    h += `<tr><td class="rn">${ctx.rowNums[i]}</td>`;
    for (const fn of fns) { const r = fn(ctx.rows[i]); const c = r.e ? 'err' : r.w ? 'warn' : r.d ? 'def' : ''; h += `<td class="${c}" title="${esc(r.e || r.w || r.v)}">${esc(r.e && r.v === '' ? r.input : r.v)}</td>`; }
    h += '</tr>';
  }
  h += '</tbody></table>';
  if (ctx.rows.length > N) h += `<div class="empty">Aperçu limité aux ${N} premières lignes sur ${nf(ctx.rows.length)}.</div>`;
  wrap.innerHTML = h;
}

/* ----- inspecteur ----- */
function renderInspector() {
  const el = $('#insp'); const t = curT();
  const f = t.fields.find(x => x.key === S.ui.f);
  if (!f) { el.innerHTML = inspectorHelp(t); return; }
  const T = tm(t); const ctx = getCtx(T); const F = getF(t, f) || newF(); const kind = F.kind;
  const ty = f.type;
  const optHTML = ty.options ? `<div class="optlist">${ty.options.map(o => `<code title="Valeur ${o.i}">${esc(o.c === '' ? '(vide)' : o.c)}</code>`).join('')}</div>` : '';
  const srcBlock = (() => {
    if (kind === 'col') return `<button class="srcbtn ${F.col ? '' : 'none'}" data-pick="${esc(f.key)}"><span>${esc(F.col || 'Choisir une colonne')}</span>${ICON_CHEV}</button>`;
    if (kind === 'const') {
      if (ty.base === 'Option') return `<select id="inConst"><option value="">(vide)</option>${ty.options.map(o => `<option${o.c === F.value ? ' selected' : ''}>${esc(o.c)}</option>`).join('')}</select>`;
      if (ty.base === 'Boolean') return `<select id="inConst">${['true', 'false'].map(v => `<option${v === F.value ? ' selected' : ''}>${v}</option>`).join('')}</select>`;
      return `<input type="text" id="inConst" style="width:100%" value="${esc(F.value)}" placeholder="Valeur écrite sur toutes les lignes">`;
    }
    if (kind === 'tpl') return `<input type="text" id="inTpl" style="width:100%" value="${esc(F.tpl)}" placeholder="{Nom} {Prénom}">
      <div class="fld" style="margin-top:6px"><select id="selTplCol"><option value="">Insérer une colonne…</option>${(ctx?.cols || []).map(c => `<option>${esc(c.name)}</option>`).join('')}</select></div>`;
    return `<div class="note">Ce champ n'est pas alimenté. ${S.map.settings.fillDefaults && f.dflt !== '' ? `La valeur par défaut <code>${esc(f.dflt)}</code> sera écrite.` : 'Il restera vide.'}</div>`;
  })();
  const listId = 'dl_' + Math.random().toString(36).slice(2);
  const targets = ty.base === 'Option' ? ty.options.map(o => o.c) : ty.base === 'Boolean' ? ['true', 'false'] : [];
  let vmapHTML = '';
  if (kind === 'col' && F.col && ctx?.byName.has(F.col)) {
    const dv = distinctValues(ctx, F.col, 150);
    const existing = new Map((F.map || []).map(([a, b]) => [a.trim().toLowerCase(), b]));
    const shown = new Set(dv.map(([v]) => v.toLowerCase()));
    const extra = (F.map || []).filter(([a]) => !shown.has(a.trim().toLowerCase()));
    const rows = dv.map(([v, n]) => [v, n, existing.get(v.toLowerCase()) ?? '']).concat(extra.map(([a, b]) => [a, 0, b]));
    const many = dv.length >= 150;
    const useful = ['Option', 'Boolean'].includes(ty.base) || dv.length <= 60;
    const nMapped = (F.map || []).filter(p => p[1] !== '').length;
    const open = useful || nMapped > 0;
    vmapHTML = `<details class="sec" id="secMap" ${open ? 'open' : ''}><summary><h4 style="display:inline">Correspondance des valeurs</h4> <span class="hint">${plural(dv.length, 'valeur distincte', 'valeurs distinctes')}${many ? ' (150 premières)' : ''}${nMapped ? ', ' + nMapped + ' remplacée' + (nMapped > 1 ? 's' : '') : ''}</span></summary>
      ${useful ? '' : '<div class="note" style="margin:8px 0">Colonne très variée : la correspondance sert surtout aux champs Option ou aux codes à renommer.</div>'}
      <datalist id="${listId}">${targets.map(v => `<option value="${esc(v)}">`).join('')}</datalist>
      <table class="vmap">${rows.map(([v, n, b], i) => `<tr data-i="${i}"><td class="v" title="${esc(v)}">${esc(v === '' ? '(vide)' : v)}</td><td class="n">${n ? nf(n) : ''}</td><td class="a">→</td>
        <td><input type="text" list="${listId}" data-from="${esc(v)}" value="${esc(b)}" placeholder="inchangée"></td><td class="r">${vmapDot(f, F, v, b)}</td></tr>`).join('')}</table></details>`;
  }
  const fmt = `<div class="sec"><h4>Mise en forme <span><button class="btn small ghost" id="btnCopyFmt">Copier</button><button class="btn small ghost" id="btnPasteFmt" ${S.clip ? '' : 'disabled'}>Coller</button></span></h4>
    <div class="row2">
      <label class="fld"><span>Compléter à (caractères)</span><input type="number" id="inPadLen" min="0" max="250" value="${F.padLen || 0}"></label>
      <label class="fld"><span>avec le caractère</span><input type="text" id="inPadChar" maxlength="1" value="${esc(F.padChar || '0')}"></label>
    </div>
    <label class="chk" style="margin:-2px 0 10px;font-size:13px"><input type="checkbox" id="inPadNum" ${F.padNum !== false ? 'checked' : ''}> Seulement pour les valeurs numériques</label>
    ${f.padHint && !(F.padLen > 0) ? `<div class="note" style="margin-bottom:10px">Les codes déjà présents dans le package font ${f.padHint} chiffres. <button class="btn small" id="btnPadHint">Compléter à ${f.padHint}</button></div>` : ''}
    <div class="row2">
      <label class="fld"><span>Préfixe</span><input type="text" id="inPrefix" value="${esc(F.prefix)}"></label>
      <label class="fld"><span>Suffixe</span><input type="text" id="inSuffix" value="${esc(F.suffix)}"></label>
    </div>
    <div class="row2">
      <label class="fld"><span>Casse</span><select id="inCase">${[['none', 'Inchangée'], ['upper', 'MAJUSCULES'], ['lower', 'minuscules'], ['title', 'Nom Propre']].map(([k, l]) => `<option value="${k}"${F.case === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="fld"><span>Valeur si vide</span><input type="text" id="inDflt" value="${esc(F.dflt)}" placeholder="${S.map.settings.fillDefaults && f.dflt !== '' ? esc(f.dflt) + ' (défaut BC)' : ''}"></label>
    </div></div>`;
  el.innerHTML = `<div class="insp-inner" data-k="${esc(f.key)}">
    <h3>${esc(f.caption)}</h3>
    <div class="sub">Colonne ${f.L} du package, type ${esc(typeLabel(ty))}${f.i === 0 ? ', clé primaire' : ''}${f.dflt !== '' ? `, défaut BC <code>${esc(f.dflt)}</code>` : ''}</div>
    ${optHTML}
    <div class="sec"><h4>Source</h4>
      <div class="seg" id="segKind" style="margin-bottom:10px">${[['col', 'Colonne'], ['const', 'Constante'], ['tpl', 'Combinaison'], ['none', 'Aucune']].map(([k, l]) => `<button data-kind="${k}" aria-pressed="${kind === k}">${l}</button>`).join('')}</div>
      ${srcBlock}
      ${F.auto === 'fuzzy' ? `<div class="note warn" style="margin-top:8px">Association proposée par ressemblance de nom. <button class="btn small" id="btnConfirm">Confirmer</button></div>` : ''}
    </div>
    ${vmapHTML}
    ${kind !== 'none' ? fmt : ''}
    <div class="sec" id="secPrev"></div>
    <div class="sec" id="secIssues"></div>
  </div>`;
  refreshInspectorLive();
}
function vmapDot(f, F, from, to) {
  if (to === '' || to == null) {
    if (f.type.base === 'Option') { const ix = optionIndex(f.type); const ok = from === '' || ix.byNorm.has(norm(from)) || ix.byNum.has(from); return `<span class="dot ${ok ? 'ok' : 'err'}" title="${ok ? 'Reconnue' : 'Option inconnue : saisissez une correspondance'}"></span>`; }
    if (f.type.base === 'Boolean') { const k = norm(from); const ok = k === '' || TRUE_W.has(k) || FALSE_W.has(k); return `<span class="dot ${ok ? 'ok' : 'err'}"></span>`; }
    return '<span class="dot mute"></span>';
  }
  const r = convertTo(f, to, S.map.settings);
  return `<span class="dot ${r.e ? 'err' : 'ok'}" title="${esc(r.e || 'Valeur acceptée : ' + r.v)}"></span>`;
}
function refreshInspectorLive() {
  const t = curT(); const f = t.fields.find(x => x.key === S.ui.f); if (!f) return;
  const T = tm(t); const ctx = getCtx(T); const F = getF(t, f);
  const V = S.val[t.name]?.fields[f.key] || {};
  const sp = $('#secPrev'); const si = $('#secIssues'); if (!sp) return;
  if (!ctx) { sp.innerHTML = `<h4>Aperçu</h4><div class="note">Choisissez d'abord une feuille source pour cette table.</div>`; si.innerHTML = ''; return; }
  const fn = compileField(t, f, F, ctx);
  const picks = []; for (let i = 0; i < ctx.rows.length && picks.length < 8; i++) { const r = fn(ctx.rows[i]); if (r.input || picks.length < 3 || !isMapped(F)) picks.push([ctx.rowNums[i], r]); }
  sp.innerHTML = `<h4>Aperçu <span class="hint">ligne, source, résultat</span></h4><table class="samples">${picks.map(([n, r]) =>
    `<tr><td class="rn">${n}</td><td class="in" title="${esc(r.input ?? '')}">${esc(r.input === undefined ? '' : (r.input || '∅'))}</td><td class="${r.e ? 'bad' : r.d ? 'def' : ''}" title="${esc(r.e || r.w || r.v)}">${esc(r.v === '' ? '∅' : r.v)}${r.w ? ' ⚠' : ''}</td></tr>`).join('')}</table>`;
  if (V.err || V.warn) {
    si.innerHTML = `<h4>Anomalies <span class="hint">${[V.err && plural(V.err, 'erreur'), V.warn && plural(V.warn, 'alerte')].filter(Boolean).join(', ')}</span></h4>
      <ul class="issues">${V.ex.map(x => `<li><b style="color:var(--${x.lvl === 'err' ? 'err' : 'warn'})">${x.row ? 'Ligne ' + x.row : 'Champ'}</b> : ${esc(x.msg)}</li>`).join('')}</ul>`;
  } else si.innerHTML = isMapped(F) ? `<h4>Anomalies</h4><div class="note">Aucune anomalie sur les ${nf(ctx.rows.length)} lignes.</div>` : '';
}
function inspectorHelp(t) {
  const T = tm(t); const V = S.val[t.name]; const K = V?.keys;
  const iss = t.fields.map(f => [f, V?.fields[f.key]]).filter(([, v]) => v && (v.err || v.warn));
  return `<div class="insp-inner">
    <h3>${esc(t.name)}</h3>
    <div class="sub">Sélectionnez un champ pour régler sa source et sa mise en forme.</div>
    ${!T.source ? `<div class="sec"><div class="note">Associez une feuille de l'export Navision à cette table avec le sélecteur « Feuille source ».</div></div>` : ''}
    ${K && (K.dup || K.empty) && effectiveMode(t) !== 'keep' ? `<div class="sec"><h4>Clé primaire</h4><ul class="issues">${K.ex.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
    ${iss.length ? `<div class="sec"><h4>Champs à revoir</h4><ul class="issues">${iss.map(([f, v]) => `<li><a href="#" data-goto="${esc(f.key)}">${esc(f.caption)}</a> : ${[v.err && plural(v.err, 'erreur'), v.warn && plural(v.warn, 'alerte')].filter(Boolean).join(', ')}</li>`).join('')}</ul></div>` : ''}
    <div class="sec"><h4>Raccourcis</h4><div class="note"><span class="kbd">↑</span> <span class="kbd">↓</span> changer de champ, <span class="kbd">Entrée</span> choisir la colonne, <span class="kbd">Suppr</span> retirer la source, <span class="kbd">Ctrl</span>+<span class="kbd">S</span> exporter le mapping.</div></div>
    <div class="sec"><h4>Comment les valeurs sont converties</h4><div class="note">Dates au format AAAA-MM-JJ, nombres avec un point décimal, booléens en true/false (Oui/Non reconnus), options selon leur libellé BC, codes en majuscules. Les longueurs maximales viennent des commentaires du package.</div></div>
  </div>`;
}

/* ----- sélecteur de colonne (popover) ----- */
let popEl = null;
function closePicker() { if (popEl) { popEl.remove(); popEl = null; document.removeEventListener('mousedown', outsidePick, true); } }
function outsidePick(e) { if (popEl && !popEl.contains(e.target)) closePicker(); }
function openPicker(anchor, key) {
  closePicker();
  const t = curT(); const f = t.fields.find(x => x.key === key); const T = tm(t); const ctx = getCtx(T);
  if (!ctx) { toast("Choisissez d'abord une feuille source pour cette table."); return; }
  const F = getF(t, f);
  const used = new Set(Object.entries(T.fields).filter(([k, x]) => k !== key && x.kind === 'col').map(([, x]) => x.col));
  const items = [
    { k: 'none', label: 'Ne pas alimenter', spec: true },
    { k: 'const', label: 'Valeur constante…', spec: true },
    { k: 'tpl', label: 'Combiner plusieurs colonnes…', spec: true },
    { k: 'sep' },
    ...ctx.cols.map(c => ({ k: 'col', col: c })),
  ];
  popEl = document.createElement('div'); popEl.className = 'pop'; popEl.setAttribute('role', 'dialog');
  popEl.innerHTML = `<input type="search" placeholder="Filtrer les ${ctx.cols.length} colonnes" aria-label="Filtrer les colonnes"><ul role="listbox"></ul>`;
  document.body.appendChild(popEl);
  const r = anchor.getBoundingClientRect(); const W = 380;
  popEl.style.left = Math.max(8, Math.min(r.left, innerWidth - W - 8)) + 'px';
  const below = innerHeight - r.bottom;
  if (below < 300 && r.top > below) { popEl.style.bottom = (innerHeight - r.top + 4) + 'px'; popEl.style.maxHeight = Math.min(430, r.top - 12) + 'px'; }
  else { popEl.style.top = (r.bottom + 4) + 'px'; popEl.style.maxHeight = Math.min(430, below - 12) + 'px'; }
  const inp = popEl.querySelector('input'); const ul = popEl.querySelector('ul');
  let list = [], act = 0;
  const q0 = norm(f.caption);
  const draw = () => {
    const q = norm(inp.value);
    list = items.filter(it => it.k === 'sep' ? !q : it.k !== 'col' ? !q : (!q || norm(it.col.name).includes(q) || it.col.L.toLowerCase() === q));
    if (!q) { // colonnes proches du nom du champ en premier
      const cols = list.filter(i => i.k === 'col'); const scored = cols.map(i => [similarity(f.caption, i.col.name), i]).filter(([s]) => s >= 0.55).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, i]) => i);
      if (scored.length) list = [...list.filter(i => i.k !== 'col'), ...scored.map(i => ({ ...i, top: true })), { k: 'sep' }, ...cols];
    }
    const selectable = list.filter(i => i.k !== 'sep');
    act = Math.max(0, Math.min(act, selectable.length - 1));
    let si = -1;
    ul.innerHTML = list.map(it => {
      if (it.k === 'sep') return '<li class="sep" aria-hidden="true"></li>';
      si++;
      if (it.k !== 'col') return `<li role="option" class="spec${si === act ? ' act' : ''}" data-si="${si}"><span></span><span class="nm">${esc(it.label)}</span><span></span></li>`;
      const c = it.col; const cur = F?.kind === 'col' && F.col === c.name;
      return `<li role="option" class="${si === act ? 'act' : ''}${cur ? ' cur' : ''}${used.has(c.name) ? ' used' : ''}" data-si="${si}" title="${esc(c.name)} : ${c.filled} valeurs"><span class="l">${c.L}</span><span class="nm">${esc(c.name)}</span><span class="smp">${esc(c.sample)}</span></li>`;
    }).join('');
    ul.querySelector('.act')?.scrollIntoView({ block: 'nearest' });
    popEl._sel = selectable;
  };
  const choose = it => {
    closePicker();
    if (it.k === 'col') setField(t, f, { kind: 'col', col: it.col.name, auto: null, ...(f.padHint && it.col.numeric && !(F?.padLen > 0) ? { padLen: f.padHint } : {}) }, true);
    else setField(t, f, { kind: it.k, auto: null }, true);
    selectField(f.key, it.k === 'col' || it.k === 'none');
    if (it.k === 'const') setTimeout(() => $('#inConst')?.focus(), 0);
    if (it.k === 'tpl') setTimeout(() => $('#inTpl')?.focus(), 0);
  };
  inp.addEventListener('input', () => { act = 0; draw(); });
  inp.addEventListener('keydown', e => {
    const n = popEl._sel.length;
    if (e.key === 'ArrowDown') { act = (act + 1) % n; draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { act = (act - 1 + n) % n; draw(); e.preventDefault(); }
    else if (e.key === 'Enter') { if (popEl._sel[act]) choose(popEl._sel[act]); e.preventDefault(); }
    else if (e.key === 'Escape') { closePicker(); anchor.focus(); }
  });
  ul.addEventListener('mousedown', e => { const li = e.target.closest('li[data-si]'); if (li) { e.preventDefault(); choose(popEl._sel[+li.dataset.si]); } });
  // positionner sur la colonne courante
  draw();
  if (F?.kind === 'col') { const idx = popEl._sel.findIndex(i => i.k === 'col' && i.col.name === F.col && !i.top); if (idx >= 0) { act = idx; draw(); } }
  inp.focus();
  setTimeout(() => document.addEventListener('mousedown', outsidePick, true), 0);
}

/* ----- mises à jour ----- */
function setField(t, f, patch, full) {
  const T = tm(t);
  const F = { ...(T.fields[f.key] || newF()), ...patch };
  if (patch.auto === null) delete F.auto;
  T.fields[f.key] = F;
  afterFieldChange(t, f, full);
}
function afterFieldChange(t, f, full) {
  validateTable(t, f.key);
  refreshRow(t, f);
  renderTables();
  if (full) renderInspector(); else refreshInspectorLive();
  if (f.i === 0) updateFacts();
  autosave();
}
const updateFacts = debounce(() => { const sc = $('#gridwrap')?.scrollTop; renderCenter(); if ($('#gridwrap')) $('#gridwrap').scrollTop = sc; }, 300);
function selectField(key, focusRow = true) {
  if (S.ui.f !== key) $('#insp').scrollTop = 0;
  S.ui.f = key;
  $$('.frow').forEach(r => { const on = r.dataset.k === key; r.classList.toggle('sel', on); r.tabIndex = on ? 0 : -1; });
  renderInspector();
  const row = $(`.frow[data-k="${CSS.escape(key)}"]`);
  if (row) { row.scrollIntoView({ block: 'nearest' }); if (focusRow) row.focus({ preventScroll: true }); }
}
function validateAll() { S.val = {}; for (const t of S.pkg.tables) validateTable(t); }
function changeTableSource(t) { ctxCache.clear(); validateTable(t); renderTables(); renderCenter(); renderInspector(); autosave(); }

/* ---------------- événements ---------------- */
function bindApp() {
  $('#tables').addEventListener('click', e => {
    const b = e.target.closest('.titem'); if (!b) return;
    S.ui.t = +b.dataset.t; S.ui.f = null; S.ui.q = ''; closePicker(); renderAll();
  });
  const center = $('#center');
  center.addEventListener('change', e => {
    const t = curT(); const T = tm(t);
    if (e.target.id === 'selSource') {
      T.source = e.target.value || null;
      if (T.source) {
        T.headerRow = guessHeaderRow(S.raw.sheets.find(s => s.name === T.source));
        T.mode = dataRowCount(T.source, T.headerRow) > 0 ? (T.mode === 'keep' ? 'replace' : T.mode) : 'keep';
        const has = t.fields.some(f => isMapped(getF(t, f)));
        ctxCache.clear();
        if (!has) { const n = autoMapTable(t); if (n) toast(`${plural(n, 'champ associé', 'champs associés')} automatiquement.`); }
      } else T.mode = 'keep';
      changeTableSource(t);
    } else if (e.target.id === 'inHdr') { T.headerRow = Math.max(1, +e.target.value || 1); changeTableSource(t); }
    else if (e.target.id === 'selMode') {
      T.mode = e.target.value; validateTable(t); renderTables(); renderCenter(); autosave();
      if (T.mode === 'replace' && t.existing.length) toast(`Les ${nf(t.existing.length)} lignes actuelles de « ${t.name} » seront remplacées.`);
    }
  });
  center.addEventListener('click', e => {
    const t = curT(); const T = tm(t);
    const tab = e.target.closest('[data-tab]'); if (tab) { S.ui.tab = tab.dataset.tab; renderCenter(); return; }
    const flt = e.target.closest('[data-filter]'); if (flt) { S.ui.filter = flt.dataset.filter; $$('#segFilter button').forEach(b => b.setAttribute('aria-pressed', b === flt)); renderGrid(); return; }
    if (e.target.closest('#btnAuto')) {
      const n = autoMapTable(t); validateTable(t); renderAll(); autosave();
      toast(n ? `${plural(n, 'nouveau champ associé', 'nouveaux champs associés')}. Les associations « à vérifier » sont signalées.` : 'Aucune nouvelle correspondance trouvée par le nom.');
      return;
    }
    if (e.target.closest('#btnClear')) {
      const backup = JSON.stringify(T.fields); T.fields = {}; validateTable(t); renderAll(); autosave();
      toast('Correspondances de la table effacées.', { action: { label: 'Annuler', run: () => { T.fields = JSON.parse(backup); validateTable(t); renderAll(); autosave(); } } });
      return;
    }
    const pick = e.target.closest('[data-pick]'); if (pick) { selectField(pick.dataset.pick, false); openPicker(pick, pick.dataset.pick); e.stopPropagation(); return; }
    const row = e.target.closest('.frow'); if (row) selectField(row.dataset.k);
  });
  center.addEventListener('input', debounce(e => { if (e.target.id === 'inSearch') { S.ui.q = e.target.value; renderGrid(); } }, 120));
  center.addEventListener('keydown', e => {
    const row = e.target.closest('.frow'); if (!row) return;
    const rows = $$('.frow'); const i = rows.indexOf(row);
    if (e.key === 'ArrowDown' && i < rows.length - 1) { selectField(rows[i + 1].dataset.k); e.preventDefault(); }
    else if (e.key === 'ArrowUp' && i > 0) { selectField(rows[i - 1].dataset.k); e.preventDefault(); }
    else if (e.key === 'Enter' || e.key === 'F2') { const b = row.querySelector('[data-pick]'); openPicker(b, row.dataset.k); e.preventDefault(); }
    else if (e.key === 'Delete') { const t = curT(); const f = t.fields.find(x => x.key === row.dataset.k); setField(t, f, { kind: 'none', auto: null }, true); e.preventDefault(); }
  });

  const insp = $('#insp');
  const cur = () => { const t = curT(); return [t, t.fields.find(x => x.key === S.ui.f)]; };
  const liveInput = debounce((t, f, patch) => setField(t, f, patch, false), 180);
  insp.addEventListener('click', e => {
    const go = e.target.closest('[data-goto]'); if (go) { e.preventDefault(); selectField(go.dataset.goto); return; }
    const [t, f] = cur(); if (!f) return;
    const k = e.target.closest('[data-kind]');
    if (k) {
      const kind = k.dataset.kind;
      if (kind === 'col') { setField(t, f, { kind: 'col', auto: null }, true); const b = $('#insp [data-pick]'); if (b && !getF(t, f).col) openPicker(b, f.key); }
      else { setField(t, f, { kind, auto: null, ...(kind === 'const' && f.type.base === 'Boolean' && !getF(t, f)?.value ? { value: 'true' } : {}) }, true); }
      return;
    }
    const pick = e.target.closest('[data-pick]'); if (pick) { openPicker(pick, pick.dataset.pick); e.stopPropagation(); return; }
    if (e.target.id === 'btnConfirm') { setField(t, f, { auto: null }, true); return; }
    if (e.target.id === 'btnPadHint') { setField(t, f, { padLen: f.padHint, padNum: true }, true); return; }
    if (e.target.id === 'btnCopyFmt') { const F = getF(t, f) || newF(); S.clip = { case: F.case, padLen: F.padLen, padChar: F.padChar, padNum: F.padNum, prefix: F.prefix, suffix: F.suffix, dflt: F.dflt }; renderInspector(); toast('Format copié. Sélectionnez un autre champ puis « Coller ».'); return; }
    if (e.target.id === 'btnPasteFmt' && S.clip) { setField(t, f, { ...S.clip }, true); toast('Format appliqué.'); return; }
  });
  insp.addEventListener('input', e => {
    const [t, f] = cur(); if (!f) return; const id = e.target.id;
    const map = { inConst: 'value', inTpl: 'tpl', inPrefix: 'prefix', inSuffix: 'suffix', inDflt: 'dflt', inPadChar: 'padChar' };
    if (map[id]) return liveInput(t, f, { [map[id]]: e.target.value });
    if (id === 'inPadLen') return liveInput(t, f, { padLen: Math.max(0, Math.min(250, +e.target.value || 0)) });
    if (e.target.dataset.from !== undefined) {
      const from = e.target.dataset.from; const to = e.target.value;
      const F = getF(t, f) || newF();
      const m = (F.map || []).filter(([a]) => a.trim().toLowerCase() !== from.trim().toLowerCase());
      if (to !== '') m.push([from, to]);
      tm(t).fields[f.key] = { ...F, map: m };
      const dotCell = e.target.closest('tr').querySelector('.r'); dotCell.innerHTML = vmapDot(f, F, from, to);
      liveInput(t, f, {});
    }
  });
  insp.addEventListener('change', e => {
    const [t, f] = cur(); if (!f) return; const id = e.target.id;
    if (id === 'inCase') setField(t, f, { case: e.target.value }, false);
    else if (id === 'inPadNum') setField(t, f, { padNum: e.target.checked }, false);
    else if (id === 'inConst' && e.target.tagName === 'SELECT') setField(t, f, { value: e.target.value }, false);
    else if (id === 'selTplCol' && e.target.value) {
      const inp = $('#inTpl'); const ins = `{${e.target.value}}`; const p = inp.selectionStart ?? inp.value.length;
      inp.value = inp.value.slice(0, p) + (inp.value && p && inp.value[p - 1] !== ' ' ? ' ' : '') + ins + inp.value.slice(p);
      e.target.value = ''; setField(t, f, { tpl: inp.value }, false); inp.focus();
    }
  });

  $('#btnExportMap').onclick = exportMapping;
  $('#btnImportMap').onclick = () => $('#fileMap').click();
  $('#chipRaw').onclick = () => $('#fileRaw').click();
  $('#chipPkg').onclick = () => $('#filePkg').click();
  $('#btnSettings').onclick = openSettings;
  $('#btnGenerate').onclick = openGenerate;
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && S.map && !$('#app').classList.contains('hidden')) { e.preventDefault(); exportMapping(); }
    if (e.key === 'Escape' && popEl) closePicker();
  });
  window.addEventListener('resize', closePicker);
  center.addEventListener('scroll', closePicker, true);
}

/* ----- dialogues ----- */
function openSettings() {
  const s = S.map.settings;
  const opt = (id, on, title, sub) => `<label class="chk"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span>${title}<small>${sub}</small></span></label>`;
  $('#dlgSetBody').innerHTML = `<h3>Options de génération</h3><div class="sub">Elles sont enregistrées avec le mapping.</div>
    ${opt('setDef', s.fillDefaults, 'Compléter les champs vides avec les valeurs par défaut BC', 'false, 0, première option… déduits des lignes déjà présentes dans le package. Évite les erreurs de validation à l\'import.')}
    ${opt('setTrunc', s.truncate, 'Tronquer les valeurs trop longues', 'Sinon, la valeur est signalée en erreur. La longueur maximale vient du type du champ (Code20, Text100…).')}
    ${opt('setUpper', s.upperCode, 'Mettre en majuscules les champs de type Code', 'Business Central stocke toujours les codes en majuscules.')}
    ${opt('setSkip', s.skipEmpty, 'Ignorer les lignes entièrement vides de la source', 'Utile pour les exports avec lignes de séparation.')}
    <div class="actions"><button class="btn" id="setCancel">Annuler</button><button class="btn primary" id="setOk">Appliquer</button></div>`;
  const d = $('#dlgSettings'); d.showModal();
  $('#setCancel').onclick = () => d.close();
  $('#setOk').onclick = () => {
    Object.assign(S.map.settings, { fillDefaults: $('#setDef').checked, truncate: $('#setTrunc').checked, upperCode: $('#setUpper').checked, skipEmpty: $('#setSkip').checked });
    d.close(); ctxCache.clear(); validateAll(); renderAll(); autosave(); toast('Options appliquées.');
  };
}
function openGenerate() {
  const rows = S.pkg.tables.map(t => {
    const T = tm(t); const mode = effectiveMode(t); const ctx = getCtx(T); const iss = tableIssues(t);
    const n = mode === 'keep' ? t.existing.length : mode === 'append' ? t.existing.length + ctx.rows.length : ctx.rows.length;
    const mapped = t.fields.filter(f => isMapped(getF(t, f))).length;
    const modeTxt = mode === 'keep' ? 'Inchangée' : mode === 'append' ? 'Ajout' : 'Remplacement';
    return `<tr><td>${esc(t.name)}</td><td>${esc(T.source || '—')}</td><td>${modeTxt}</td><td class="num">${mode === 'keep' ? '—' : mapped + ' / ' + t.fields.length}</td><td class="num">${nf(n)}</td>
      <td>${mode === 'keep' ? '' : iss.err ? `<span class="pill err">${plural(iss.err, 'champ')} en erreur</span>` : iss.warn ? `<span class="pill warn">${plural(iss.warn, 'champ')} en alerte</span>` : '<span class="pill ok">OK</span>'}</td></tr>`;
  }).join('');
  const anyErr = S.pkg.tables.some(t => tableIssues(t).err);
  const anyIssue = S.pkg.tables.some(t => { const i = tableIssues(t); return i.err || i.warn; });
  $('#dlgGenBody').innerHTML = `<h3>Générer le package</h3>
    <div class="sub">Le fichier produit reprend la structure de « ${esc(S.pkg.fileName)} » (mappage XML, en-têtes, commentaires) avec les nouvelles lignes.</div>
    <table class="sumtable"><thead><tr><th>Table</th><th>Source</th><th>Données</th><th class="num">Champs</th><th class="num">Lignes finales</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    ${anyErr ? `<div class="note err" style="margin-top:14px">Des erreurs subsistent : les valeurs concernées seront laissées vides dans le package (ou gardées telles quelles pour les options). Téléchargez le rapport pour les corriger.</div>` : ''}
    <div class="actions">
      ${anyIssue ? '<button class="btn" id="genReport">Télécharger le rapport des anomalies</button>' : ''}
      <span style="flex:1"></span>
      <button class="btn" id="genCancel">Annuler</button>
      <button class="btn primary" id="genGo">Générer et télécharger</button>
    </div>`;
  const d = $('#dlgGen'); d.showModal();
  $('#genCancel').onclick = () => d.close();
  if ($('#genReport')) $('#genReport').onclick = reportCSV;
  $('#genGo').onclick = async () => {
    d.close(); busy(true, 'Génération du package…'); await nextFrame();
    try {
      const { blob } = await generatePackage();
      const name = `${baseName(S.pkg.fileName)}_rempli_${stamp()}.xlsx`;
      download(blob, name); busy(false);
      toast(`Package généré : ${name}`);
    } catch (err) { busy(false); console.error(err); toast('La génération a échoué : ' + err.message, { err: true, ms: 9000 }); }
  };
}
