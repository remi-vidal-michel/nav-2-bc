'use strict';
/* 07-ui.js : Rendu de l'interface, inspecteur, sélecteur de colonne, événements, dialogues. */

/* ---------------- rendu ---------------- */
const ICON_CHEV = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 6l4 4 4-4"/></svg>';
const ICON_SEARCH = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>';
const ICON_KEY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/></svg>';
const ICON_FUNNEL = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M2 3h12l-4.5 5.5V13l-3 1.5v-6L2 3z"/></svg>';
function curT() { return S.pkg.tables[S.ui.t]; }
function typeLabel(ty) { return ty.base + (ty.len ? `[${ty.len}]` : ''); }
function renderAll() { renderTables(); renderCenter(); renderInspector(); renderChips(); }
function renderChips() {
  $('#chipRaw span').textContent = S.raw?.fileName || '-';
  $('#chipPkg span').textContent = S.pkg?.fileName || '-';
}
function renderTables() {
  const el = $('#tables');
  el.innerHTML = '<h3 class="phead">Tables du package BC</h3>' + S.pkg.tables.map((t, i) => {
    const T = tm(t); const mapped = t.fields.filter(f => isMapped(getF(t, f))).length;
    // badge : lignes source retenues par les filtres ; sa couleur donne l'état des contrôles
    const iss = tableIssues(t); const mode = effectiveMode(t);
    const n = mode === 'keep' ? 0 : tableCtx(t).rows.length;
    const state = iss.err ? ['err', `${plural(iss.err, 'champ')} en erreur`] : iss.warn ? ['warn', `${plural(iss.warn, 'champ')} en alerte`] : ['ok', 'aucune anomalie'];
    const badge = mode === 'keep' ? '<span class="pill mute">Inchangée</span>'
      : `<span class="pill ${state[0]}" title="${plural(n, 'ligne source retenue', 'lignes source retenues')} (${mode === 'append' ? 'ajout' : 'remplacement'}) : ${state[1]}">${nf(n)}</span>`;
    return `<button class="titem${i === S.ui.t ? ' sel' : ''}" data-t="${i}">
      <div class="tn"><span>${esc(t.name)}</span>${badge}</div>
      <div class="ts">${T.source ? 'Source : ' + esc(T.source) : 'Aucune feuille source'}</div>
      <div class="bar" title="${mapped} champs sur ${t.fields.length} alimentés"><i style="width:${(mapped / t.fields.length * 100).toFixed(1)}%"></i></div>
    </button>`;
  }).join('');
}
function renderCenter() {
  const t = curT(); const T = tm(t); const ctx = getCtx(T);
  const sheets = S.raw.sheets.map(s => `<option value="${esc(s.name)}"${s.name === T.source ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
  $('#center').innerHTML = `
  <div class="thead">
    <div class="trow">
      <h2>${esc(t.name)}</h2>
      <select id="selSource" aria-label="Feuille source Navision" title="Feuille source Navision"><option value="">Aucune feuille source</option>${sheets}</select>
      <select id="selMode" aria-label="Données du package" title="Sort des lignes déjà présentes dans le package" ${T.source ? '' : 'disabled'}>
        <option value="replace"${T.mode === 'replace' ? ' selected' : ''}>Remplacer par la source</option>
        <option value="append"${T.mode === 'append' ? ' selected' : ''}>Ajouter à l'existant</option>
        <option value="keep"${T.mode === 'keep' ? ' selected' : ''}>Laisser inchangées</option></select>
    </div>
    <div class="facts" id="facts">${factsHTML(t)}</div>
  </div>
  <div class="toolbar">
    <label class="search">${ICON_SEARCH}<input type="search" id="inSearch" placeholder="Rechercher" aria-label="${S.ui.tab === 'map' ? 'Rechercher un champ ou une colonne' : 'Rechercher un champ, une colonne ou une valeur'}" value="${esc(S.ui.q)}"></label>
    <div class="seg" role="tablist">
      <button role="tab" data-tab="map" aria-selected="${S.ui.tab === 'map'}">Correspondances</button>
      <button role="tab" data-tab="prev" aria-selected="${S.ui.tab === 'prev'}">Aperçu du résultat</button>
    </div>
    <div class="spacer"></div>
    <select id="selFilter" aria-label="Champs affichés" ${S.ui.tab === 'map' ? '' : 'hidden'}>
      ${[['all', 'Tous les champs'], ['mapped', 'Alimentés'], ['unmapped', 'Non alimentés'], ['issues', 'Anomalies']].map(([k, l]) => `<option value="${k}"${S.ui.filter === k ? ' selected' : ''}>${l}</option>`).join('')}
    </select>
  </div>
  <div class="gridwrap" id="gridwrap"></div>`;
  renderGrid();
}
/* sous le titre de la table : seulement les doublons ou valeurs vides de la clé primaire */
function factsHTML(t) {
  const K = S.val[t.name]?.keys;
  return K && effectiveMode(t) !== 'keep' && (K.dup || K.empty) ? `<span style="color:var(--err)"><b style="color:inherit">Clé ${esc(keyLabel(t))}</b> : ${[K.dup && plural(K.dup, 'doublon'), K.empty && plural(K.empty, 'valeur vide', 'valeurs vides')].filter(Boolean).join(', ')}</span>` : '';
}
/* résumé d'un filtre : les valeurs conservées, ou « sauf … » quand on en a écarté moins */
function filterSummary(t, F) {
  const ctx = getCtx(tm(t)); const keep = new Set(F.filter.map(v => v.toLowerCase()));
  const out = ctx ? sourceValues(F, ctx).map(([v]) => v).filter(v => !keep.has(v.toLowerCase())) : [];
  return out.length && out.length < F.filter.length ? 'sauf ' + filterLabel(out) : filterLabel(F.filter);
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
    ? `<span class="in" title="${esc(V.sampleIn)}">${esc(V.sampleIn || '-')}</span><span class="arrow">→</span><span class="out ${outCls}" title="${esc(V.sampleOut)}">${esc(V.sampleOut === '' ? '-' : V.sampleOut)}</span>`
    : `<span class="out def" title="Valeur écrite si le champ n'est pas alimenté">${S.map.settings.fillDefaults && f.dflt !== '' ? esc(f.dflt) : ''}</span>`;
  const fl = filterActive(F) ? filterSummary(t, F) : '';
  const flt = !canFilter(F) ? '' : fl
    ? `<button class="srcbtn fltbtn on" data-flt="${esc(f.key)}" title="Lignes conservées : ${esc(F.filter.map(v => v === '' ? '(vide)' : v).join(', '))}">${ICON_FUNNEL}<span>${esc(fl)}</span>${ICON_CHEV}</button>`
    : `<button class="srcbtn fltbtn" data-flt="${esc(f.key)}" title="Filtrer les lignes sur les valeurs de ce champ">${ICON_FUNNEL}<span></span>${ICON_CHEV}</button>`;
  const st = [V.err ? `<span class="pill err" title="Lignes en erreur">${nf(V.err)}</span>` : '', V.warn ? `<span class="pill warn" title="Lignes avec alerte">${nf(V.warn)}</span>` : ''].join('');
  return `<div class="grow frow${m ? ' mapped' : ''}${sel ? ' sel' : ''}" data-k="${esc(f.key)}" tabindex="${sel ? 0 : -1}">
    <div><span class="fcap" title="${esc(f.caption)}">${esc(f.caption)}</span><span class="ftype"><code>${f.L}</code> ${esc(typeLabel(f.type))}${isKeyField(t, f) ? `<span class="key" title="Clé primaire">${ICON_KEY}</span>` : ''}</span></div>
    <div><button class="srcbtn ${cls}" data-pick="${esc(f.key)}" title="${esc(srcTxt)}"><span>${esc(srcTxt)}</span>${ICON_CHEV}</button></div>
    <div class="chips">${chips}</div>
    <div class="flt">${flt}</div>
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
  wrap.innerHTML = `<div class="grid"><div class="grow ghead"><div>Champ Business Central</div><div>Colonne Navision</div><div>Format</div><div>Filtre</div><div>Exemple</div><div></div></div>` +
    (fs.length ? fs.map(f => fieldRowHTML(t, f)).join('') : `<div class="empty">Aucun champ ne correspond à ce filtre.</div>`) + '</div>';
}
function refreshRow(t, f) {
  const el = $(`.frow[data-k="${CSS.escape(f.key)}"]`); if (!el) return;
  const tmp = document.createElement('div'); tmp.innerHTML = fieldRowHTML(t, f); el.replaceWith(tmp.firstElementChild);
}
/* texte échappé, occurrences de q (en minuscules) surlignées */
function markText(s, q) {
  if (!q) return esc(s);
  const low = s.toLowerCase(); let out = '', i = 0, j;
  while ((j = low.indexOf(q, i)) >= 0) { out += esc(s.slice(i, j)) + '<mark>' + esc(s.slice(j, j + q.length)) + '</mark>'; i = j + q.length; }
  return out + esc(s.slice(i));
}
function renderPreview() {
  const t = curT(); const ctx = tableCtx(t); const wrap = $('#gridwrap');
  if (!ctx) { wrap.innerHTML = `<div class="empty">Choisissez une feuille source pour voir les lignes qui seront générées.</div>`; return; }
  const N = 200; const q = S.ui.q.trim().toLowerCase(); const nq = norm(S.ui.q);
  const fns = t.fields.map(f => compileField(t, f, getF(t, f), ctx));
  const text = r => String(r.e && r.v === '' ? (r.input ?? '') : r.v);
  // lignes : celles qui contiennent la recherche dans une valeur, sinon toutes
  const shown = []; let hits = 0;
  if (q) for (let i = 0; i < ctx.rows.length; i++) {
    const rs = fns.map(fn => fn(ctx.rows[i]));
    if (rs.some(r => text(r).toLowerCase().includes(q)) && ++hits <= N) shown.push([i, rs]);
  }
  if (!hits) for (let i = 0; i < Math.min(N, ctx.rows.length); i++) shown.push([i, fns.map(fn => fn(ctx.rows[i]))]);
  // colonnes : toutes affichées, celles dont le nom correspond sont surlignées
  const nameHit = c => !!nq && (norm(t.fields[c].caption).includes(nq) || norm(getF(t, t.fields[c])?.col || '').includes(nq));
  const cols = t.fields.map((f, c) => c);
  if (q && !hits && !cols.some(nameHit)) { wrap.innerHTML = `<div class="empty">Aucun champ ni aucune valeur ne correspond à « ${esc(S.ui.q.trim())} ».</div>`; return; }
  const vq = hits ? q : '';
  let h = `<table class="ptable"><thead><tr><th class="rn">Ligne</th>${cols.map(c => { const f = t.fields[c];
    return `<th data-k="${esc(f.key)}" class="${isMapped(getF(t, f)) ? '' : 'unm'}${nameHit(c) ? ' qhit' : ''}" title="${esc(f.caption)} : cliquer pour régler ce champ">${markText(f.caption, nameHit(c) ? q : '')}<small>${esc(typeLabel(f.type))}</small></th>`; }).join('')}</tr></thead><tbody>`;
  for (const [i, rs] of shown) {
    h += `<tr data-r="${ctx.rowNums[i]}"${ctx.rowNums[i] === S.ui.row ? ' class="rsel"' : ''}><td class="rn">${ctx.rowNums[i]}</td>`;
    for (const c of cols) { const r = rs[c]; const cl = r.e ? 'err' : r.w ? 'warn' : r.d ? 'def' : ''; h += `<td class="${cl}" title="${esc(r.e || r.w || r.v)}">${markText(text(r), vq)}</td>`; }
    h += '</tr>';
  }
  h += '</tbody></table>';
  if (hits) h += `<div class="empty">${plural(hits, 'ligne contient', 'lignes contiennent')} « ${esc(S.ui.q.trim())} »${hits > N ? `, ${N} premières affichées` : ''}.</div>`;
  else if (ctx.rows.length > N) h += `<div class="empty">Aperçu limité aux ${N} premières lignes sur ${nf(ctx.rows.length)}.</div>`;
  wrap.innerHTML = h;
  markPreviewCol(false);
}
/* met en évidence la colonne du champ sélectionné, et la fait défiler au centre si demandé */
function markPreviewCol(scroll) {
  const wrap = $('#gridwrap'); if (!wrap || S.ui.tab !== 'prev') return;
  $$('.ptable .hl', wrap).forEach(x => x.classList.remove('hl'));
  const th = S.ui.f && wrap.querySelector(`th[data-k="${CSS.escape(S.ui.f)}"]`); if (!th) return;
  const c = th.cellIndex; th.classList.add('hl');
  for (const tr of wrap.querySelectorAll('tbody tr')) tr.cells[c]?.classList.add('hl');
  if (scroll) { const w = wrap.getBoundingClientRect(), r = th.getBoundingClientRect(); wrap.scrollLeft += r.left - w.left - (w.width - r.width) / 2; }
}

/* ----- inspecteur ----- */
/* section repliable ; le résumé reste visible une fois repliée, l'extra seulement dépliée */
function secHTML(id, title, open, { hint = '', closedHint = '', extra = '', body = '' } = {}) {
  const o = S.ui.open[id] ?? open;
  return `<details class="sec" id="sec-${id}" data-sec="${id}" ${o ? 'open' : ''}><summary><h4>${title}</h4>${closedHint ? `<span class="hint when-closed">${closedHint}</span>` : ''}<span class="hint" id="hint-${id}">${hint}</span>${extra ? `<span class="when-open">${extra}</span>` : ''}</summary>${body}</details>`;
}
function renderInspector() {
  const el = $('#insp'); const t = curT();
  const f = t.fields.find(x => x.key === S.ui.f);
  if (!f) { el.innerHTML = inspectorHelp(t); return; }
  // les sections repliées le restent pour ce champ seulement : un autre champ s'ouvre tout déplié
  const at = t.name + '|' + f.key; if (S.ui.openAt !== at) { S.ui.open = {}; S.ui.openAt = at; }
  const T = tm(t); const ctx = getCtx(T); const F = getF(t, f) || newF(); const kind = F.kind;
  const ty = f.type;
  const optHTML = ty.options ? `<div class="optlist">${ty.options.map(o => `<code title="Valeur ${o.i}">${esc(o.c === '' ? '(vide)' : o.c)}</code>`).join('')}</div>` : '';
  const srcBlock = (() => {
    if (kind === 'col') return `<button class="srcbtn ${F.col ? '' : 'none'}" data-pick="${esc(f.key)}"><span>${esc(F.col || 'Choisir une colonne')}</span>${ICON_CHEV}</button>`;
    if (kind === 'const') {
      if (ty.base === 'Option') return `<select id="inConst" style="width:100%"><option value="">(vide)</option>${ty.options.map(o => `<option${o.c === F.value ? ' selected' : ''}>${esc(o.c)}</option>`).join('')}</select>`;
      if (ty.base === 'Boolean') return `<select id="inConst" style="width:100%"><option value="" disabled hidden${F.value === '' ? ' selected' : ''}>Choisir une valeur</option>${['true', 'false'].map(v => `<option${v === F.value ? ' selected' : ''}>${v}</option>`).join('')}</select>`;
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
    // Option, Boolean ou colonne d'au plus 10 valeurs : toutes les valeurs source sont listées ; ailleurs, seulement celles ajoutées à la main.
    // Seules comptent les lignes retenues par les filtres de la table.
    const dv = distinctValues(tableCtx(t), F.col, Infinity);
    const all = ['Option', 'Boolean'].includes(ty.base) || dv.length <= 10;
    const bool = ty.base === 'Boolean';
    const cnt = new Map(dv.map(([v, n]) => [v.toLowerCase(), n]));
    if (bool) { // Oui / Non proposés d'office ; une correspondance effacée reste mémorisée (vide) et n'est pas reproposée
      const known = new Set((F.map || []).map(([a]) => a.trim().toLowerCase()));
      const add = dv.filter(([v]) => !known.has(v.toLowerCase()) && BOOL_GUESS[norm(v)]).map(([v]) => [v, BOOL_GUESS[norm(v)]]);
      if (add.length) { F.map = [...(F.map || []), ...add]; refreshRow(t, f); autosave(); }
    }
    const existing = new Map((F.map || []).map(([a, b]) => [a.trim().toLowerCase(), b]));
    const rows = all
      ? dv.slice(0, 150).map(([v, n]) => [v, n, existing.get(v.toLowerCase()) ?? '']).concat((F.map || []).filter(([a]) => !cnt.has(a.trim().toLowerCase())).map(([a, b]) => [a, 0, b]))
      : (F.map || []).map(([a, b]) => [a, cnt.get(a.trim().toLowerCase()) || 0, b]);
    const nMapped = (F.map || []).filter(p => p[1] !== '').length;
    vmapHTML = secHTML('map', 'Correspondance des valeurs', true, {
      closedHint: nMapped ? plural(nMapped, 'valeur remplacée', 'valeurs remplacées') : '',
      extra: `<button class="btn small ghost" id="btnCopyMap" ${nMapped ? '' : 'disabled'}>Copier</button><button class="btn small ghost" id="btnPasteMap" ${S.clipMap ? '' : 'disabled'} title="Colle les correspondances des valeurs présentes dans cette colonne">Coller</button>`,
      body: `<datalist id="${listId}">${targets.map(v => `<option value="${esc(v)}">`).join('')}</datalist>
      ${rows.length ? `<table class="vmap">${rows.map(([v, n, b], i) => `<tr data-i="${i}"><td class="v" title="${esc(v)}">${esc(v === '' ? '(vide)' : v)}</td><td class="n">${n ? nf(n) : ''}</td><td class="a">→</td>
        <td><input type="text" list="${listId}" data-from="${esc(v)}"${all && !bool ? '' : ' data-keep'} value="${esc(b)}" placeholder="inchangée"></td><td class="r">${vmapDot(f, F, v, b)}</td>${all ? '' : `<td class="x"><button class="btn small ghost" data-vdel="${esc(v)}" title="Retirer" aria-label="Retirer">×</button></td>`}</tr>`).join('')}</table>` : ''}
      ${all ? '' : `<button class="btn small" id="btnVmapAdd" style="margin-top:${rows.length ? 8 : 0}px">+ Ajouter une valeur</button>`}`,
    });
  }
  const fmtSum = fmtChips(F, f).filter(([c, l]) => c !== 'sug' && !/corresp\./.test(l)).map(([, l]) => l).join(', ');
  const fmt = secHTML('fmt', 'Mise en forme', true, {
    closedHint: esc(fmtSum || 'aucune'),
    extra: `<button class="btn small ghost" id="btnCopyFmt">Copier</button><button class="btn small ghost" id="btnPasteFmt" ${S.clip ? '' : 'disabled'}>Coller</button>`,
    body: `
    <div class="row2">
      <label class="fld"><span>Remplacer</span><input type="text" id="inRepFrom" value="${esc(F.repFrom || '')}" placeholder="ex. S"></label>
      <label class="fld"><span>par</span><input type="text" id="inRepTo" value="${esc(F.repTo || '')}" placeholder="(rien)"></label>
    </div>
    <div class="row2">
      <label class="fld"><span>Où</span><select id="inRepAt">${[['start', 'Au début'], ['end', 'À la fin'], ['all', 'Partout']].map(([k, l]) => `<option value="${k}"${(F.repAt || 'start') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
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
    </div>`,
  });
  el.innerHTML = `<div class="insp-inner" data-k="${esc(f.key)}">
    <div class="phead insp-head"><h3>${esc(f.caption)} <span class="ftype">${esc(typeLabel(ty))}</span></h3>${keyToggleHTML(isKeyField(t, f))}</div>
    ${optHTML}
    <div class="sec"><h4>Source</h4>
      <div class="seg" id="segKind" style="margin-bottom:10px">${[['col', 'Colonne'], ['const', 'Constante'], ['tpl', 'Combinaison'], ['none', 'Aucune']].map(([k, l]) => `<button data-kind="${k}" aria-pressed="${kind === k}">${l}</button>`).join('')}</div>
      ${srcBlock}
      ${F.auto === 'fuzzy' ? `<div class="note warn" style="margin-top:8px">Association proposée par ressemblance de nom. <button class="btn small" id="btnConfirm">Confirmer</button></div>` : ''}
    </div>
    ${secHTML('iss', 'Anomalies', true, { body: '<div id="body-iss"></div>' })}
    ${vmapHTML}
    ${kind !== 'none' ? fmt : ''}
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
  const V = S.val[t.name]?.fields[f.key] || {};
  const si = $('#body-iss'); if (!si) return;
  const secIss = $('#sec-iss'); const hIss = $('#hint-iss');
  // la section n'apparaît que s'il y a des anomalies
  secIss.hidden = !(tableCtx(t) && (V.err || V.warn)); if (secIss.hidden) return;
  hIss.innerHTML = [V.err && `<span class="pill err">${plural(V.err, 'erreur')}</span>`, V.warn && `<span class="pill warn">${plural(V.warn, 'alerte')}</span>`].filter(Boolean).join(' ');
  si.innerHTML = `<ul class="issues">${V.ex.map(x => `<li><b style="color:var(--${x.lvl === 'err' ? 'err' : 'warn'})">${x.row ? 'Ligne ' + x.row : 'Champ'}</b> : ${esc(x.msg)}</li>`).join('')}</ul>`;
}
function inspectorHelp(t) {
  const T = tm(t); const V = S.val[t.name]; const K = V?.keys;
  const iss = t.fields.map(f => [f, V?.fields[f.key]]).filter(([, v]) => v && (v.err || v.warn));
  // sans champ sélectionné : seulement ce qui demande une action
  return `<div class="insp-inner">
    <div class="phead insp-head"><h3>${esc(t.name)}</h3></div>
    ${!T.source ? `<div class="sec"><div class="note">Associez une feuille de l'export Navision à cette table avec la liste à droite du nom de la table.</div></div>` : ''}
    ${K && (K.dup || K.empty) && effectiveMode(t) !== 'keep' ? `<div class="sec"><h4>Clé primaire (${esc(keyLabel(t))})</h4><ul class="issues">${K.ex.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
    ${iss.length ? `<div class="sec"><h4>Champs à revoir</h4><ul class="issues">${iss.map(([f, v]) => `<li><a href="#" data-goto="${esc(f.key)}">${esc(f.caption)}</a> : ${[v.err && plural(v.err, 'erreur'), v.warn && plural(v.warn, 'alerte')].filter(Boolean).join(', ')}</li>`).join('')}</ul></div>` : ''}
  </div>`;
}

/* ----- sélecteur de colonne (popover) ----- */
let popEl = null;
function closePicker() { if (popEl) { popEl.remove(); popEl = null; document.removeEventListener('mousedown', outsidePick, true); } }
function outsidePick(e) { if (popEl && !popEl.contains(e.target)) closePicker(); }
function openPop(anchor, html, W) {
  closePicker();
  popEl = document.createElement('div'); popEl.className = 'pop'; popEl.setAttribute('role', 'dialog'); popEl.style.width = W + 'px';
  popEl.innerHTML = html; document.body.appendChild(popEl);
  const r = anchor.getBoundingClientRect();
  popEl.style.left = Math.max(8, Math.min(r.left, innerWidth - W - 8)) + 'px';
  const below = innerHeight - r.bottom;
  if (below < 300 && r.top > below) { popEl.style.bottom = (innerHeight - r.top + 4) + 'px'; popEl.style.maxHeight = Math.min(430, r.top - 12) + 'px'; }
  else { popEl.style.top = (r.bottom + 4) + 'px'; popEl.style.maxHeight = Math.min(430, below - 12) + 'px'; }
  setTimeout(() => document.addEventListener('mousedown', outsidePick, true), 0);
  return popEl;
}
function openPicker(anchor, key) {
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
  openPop(anchor, `<input type="search" placeholder="Filtrer les ${ctx.cols.length} colonnes" aria-label="Filtrer les colonnes"><ul role="listbox"></ul>`, 380);
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
}

/* ----- filtre des lignes (popover à choix multiples, comme le filtre Excel : cocher les valeurs conservées) ----- */
function openFilter(anchor, key) {
  const t = curT(); const f = t.fields.find(x => x.key === key); const ctx = getCtx(tm(t)); const F = getF(t, f);
  if (!ctx || !canFilter(F)) return;
  const vals = sourceValues(F, ctx);
  for (const v of F.filter || []) if (!vals.some(([x]) => x.toLowerCase() === v.toLowerCase())) vals.push([v, 0]); // valeur retenue absente de la source
  const sel = new Set((F.filter || vals.map(([v]) => v)).map(v => v.toLowerCase())); // sans filtre, tout est coché
  openPop(anchor, `<div class="pophead"><input type="checkbox" id="fltAll" title="Sélectionner tout" aria-label="Sélectionner tout"><input type="search" placeholder="Rechercher…" aria-label="Rechercher une valeur"><button class="btn small ghost" data-clear title="Retirer le filtre">Effacer</button></div><ul role="listbox" aria-multiselectable="true"></ul>`, 320);
  const inp = popEl.querySelector('input[type=search]'); const ul = popEl.querySelector('ul'); const all = popEl.querySelector('#fltAll');
  let list = [], act = 0; const MAX = 500;
  const draw = () => {
    const q = norm(inp.value);
    list = vals.filter(([v]) => !q || norm(v).includes(q));
    act = Math.max(0, Math.min(act, list.length - 1));
    ul.innerHTML = list.slice(0, MAX).map(([v, n], i) => { const on = sel.has(v.toLowerCase());
      return `<li role="option" aria-selected="${on}" class="chk${i === act ? ' act' : ''}" data-i="${i}"><input type="checkbox" tabindex="-1" ${on ? 'checked' : ''}><span class="nm">${v === '' ? '<i>(vide)</i>' : esc(v)}</span><span class="cnt">${n ? nf(n) : ''}</span></li>`; }).join('')
      + (list.length > MAX ? `<li class="more">${nf(list.length - MAX)} autres valeurs : affinez la recherche.</li>` : '')
      + (list.length ? '' : '<li class="more">Aucune valeur.</li>');
    ul.querySelector('.act')?.scrollIntoView({ block: 'nearest' });
    // « sélectionner tout » porte sur les valeurs affichées (résultat de la recherche)
    const n = list.filter(([v]) => sel.has(v.toLowerCase())).length;
    all.checked = list.length > 0 && n === list.length; all.indeterminate = n > 0 && n < list.length;
  };
  const apply = () => { const values = vals.map(([v]) => v).filter(v => sel.has(v.toLowerCase())); setField(t, f, { filter: values.length === vals.length ? null : values }, false); };
  all.addEventListener('change', () => { for (const [v] of list) { if (all.checked) sel.add(v.toLowerCase()); else sel.delete(v.toLowerCase()); } draw(); apply(); inp.focus(); });
  const toggle = i => { const k = list[i][0].toLowerCase(); if (sel.has(k)) sel.delete(k); else sel.add(k); act = i; draw(); apply(); };
  inp.addEventListener('input', () => { act = 0; draw(); });
  inp.addEventListener('keydown', e => {
    const n = Math.min(list.length, MAX); if (!n && e.key !== 'Escape') return;
    if (e.key === 'ArrowDown') { act = (act + 1) % n; draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { act = (act - 1 + n) % n; draw(); e.preventDefault(); }
    else if (e.key === 'Enter') { toggle(act); e.preventDefault(); }
    else if (e.key === 'Escape') { closePicker(); $(`[data-flt="${CSS.escape(key)}"]`)?.focus(); }
  });
  ul.addEventListener('mousedown', e => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); toggle(+li.dataset.i); } });
  popEl.querySelector('[data-clear]').addEventListener('click', () => { for (const [v] of vals) sel.add(v.toLowerCase()); draw(); apply(); inp.focus(); });
  draw(); inp.focus();
}

/* ----- correspondance : ajout d'une valeur source à remplacer ----- */
function openVmapAdd(anchor) {
  const t = curT(); const f = t.fields.find(x => x.key === S.ui.f); const ctx = tableCtx(t); const F = getF(t, f);
  if (!ctx || F?.kind !== 'col' || !F.col) return;
  const taken = new Set((F.map || []).map(([a]) => a.trim().toLowerCase()));
  const vals = distinctValues(ctx, F.col, Infinity).filter(([v]) => !taken.has(v.toLowerCase())).sort((a, b) => a[0].localeCompare(b[0], 'fr', { numeric: true }));
  openPop(anchor, `<input type="search" placeholder="Rechercher parmi ${plural(vals.length, 'valeur', 'valeurs')}" aria-label="Rechercher une valeur"><ul role="listbox"></ul>`, 320);
  const inp = popEl.querySelector('input'); const ul = popEl.querySelector('ul');
  let list = [], act = 0; const MAX = 500;
  const draw = () => {
    const q = norm(inp.value);
    list = vals.filter(([v]) => !q || norm(v).includes(q));
    act = Math.max(0, Math.min(act, list.length - 1));
    ul.innerHTML = list.slice(0, MAX).map(([v, n], i) => `<li role="option" class="${i === act ? 'act' : ''}" data-i="${i}" style="grid-template-columns:1fr auto"><span class="nm">${v === '' ? '<i>(vide)</i>' : esc(v)}</span><span class="cnt">${nf(n)}</span></li>`).join('')
      + (list.length > MAX ? `<li class="more">${nf(list.length - MAX)} autres valeurs : affinez la recherche.</li>` : '')
      + (list.length ? '' : '<li class="more">Aucune valeur.</li>');
    ul.querySelector('.act')?.scrollIntoView({ block: 'nearest' });
  };
  const choose = i => {
    const v = list[i][0]; closePicker();
    setField(t, f, { map: [...(F.map || []), [v, '']] }, true);
    $(`#insp [data-from="${CSS.escape(v)}"]`)?.focus();
  };
  inp.addEventListener('input', () => { act = 0; draw(); });
  inp.addEventListener('keydown', e => {
    const n = Math.min(list.length, MAX); if (!n && e.key !== 'Escape') return;
    if (e.key === 'ArrowDown') { act = (act + 1) % n; draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { act = (act - 1 + n) % n; draw(); e.preventDefault(); }
    else if (e.key === 'Enter') { choose(act); e.preventDefault(); }
    else if (e.key === 'Escape') { closePicker(); anchor.focus(); }
  });
  ul.addEventListener('mousedown', e => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); choose(+li.dataset.i); } });
  draw(); inp.focus();
}

/* ----- mises à jour ----- */
function setField(t, f, patch, full) {
  const T = tm(t); const sig = filterSig(t);
  const F = { ...(T.fields[f.key] || newF()), ...patch };
  if (patch.auto === null) delete F.auto;
  if (patch.kind === 'none') F.filter = null;
  T.fields[f.key] = F;
  if (filterSig(t) === sig) return afterFieldChange(t, f, full);
  // les lignes retenues ont changé : tous les champs de la table sont à recontrôler
  validateTable(t); renderTables();
  if (S.ui.tab === 'prev') renderGrid(); else for (const x of t.fields) refreshRow(t, x);
  refreshFacts(t);
  // un changement de filtre modifie les valeurs proposées dans la correspondance
  if (full || 'filter' in patch) renderInspector(); else refreshInspectorLive();
  autosave();
}
function afterFieldChange(t, f, full) {
  validateTable(t, f.key);
  if (S.ui.tab === 'prev') renderGrid(); else refreshRow(t, f);
  renderTables();
  if (full) renderInspector(); else refreshInspectorLive();
  refreshFacts(t);
  autosave();
}
function refreshFacts(t) { const el = $('#facts'); if (el) el.innerHTML = factsHTML(t); }
/* ajoute ou retire un champ de la clé primaire, puis recontrôle l'unicité */
/* interrupteur « Clé » de l'en-tête du panneau de détail */
const keyToggleHTML = on => { const l = on ? 'Retirer ce champ de la clé primaire' : 'Ajouter ce champ à la clé primaire'; return `<button class="keytog" id="btnKey" aria-pressed="${on}" title="${l}" aria-label="${l}">${ICON_KEY}</button>`; };
function setKeyField(t, f, on) {
  const cur = keyFields(t);
  const next = on ? t.fields.filter(x => cur.includes(x) || x === f) : cur.filter(x => x !== f);
  if (!next.length) { toast('La clé primaire doit contenir au moins un champ.'); return; }
  const T = tm(t); const before = cur;
  T.keys = next.map(x => x.key);
  (S.val[t.name] ||= { fields: {}, keys: null }).keys = checkKeys(t);
  for (const x of new Set([...before, ...next])) refreshRow(t, x);
  renderTables(); refreshFacts(t); renderInspector(); autosave();
}
function selectField(key, focusRow = true) {
  if (S.ui.f !== key) $('#insp').scrollTop = 0;
  S.ui.f = key;
  $$('.frow').forEach(r => { const on = r.dataset.k === key; r.classList.toggle('sel', on); r.tabIndex = on ? 0 : -1; });
  renderInspector();
  markPreviewCol(false);
  const row = $(`.frow[data-k="${CSS.escape(key)}"]`);
  if (row) { row.scrollIntoView({ block: 'nearest' }); if (focusRow) row.focus({ preventScroll: true }); }
}
/* chaque table garde son affichage : mode, filtre, recherche, champ sélectionné et défilement */
const VIEW_KEYS = ['tab', 'filter', 'q', 'f', 'row'];
function switchTable(i) {
  if (i === S.ui.t) return;
  const w = $('#gridwrap');
  S.ui.views[curT().name] = { ...Object.fromEntries(VIEW_KEYS.map(k => [k, S.ui[k]])), top: w?.scrollTop || 0, left: w?.scrollLeft || 0 };
  S.ui.t = i;
  const v = S.ui.views[curT().name] || {};
  Object.assign(S.ui, { tab: 'map', filter: 'all', q: '', f: null, row: null }, Object.fromEntries(VIEW_KEYS.filter(k => k in v).map(k => [k, v[k]])));
  closePicker(); renderAll();
  const w2 = $('#gridwrap'); if (w2 && v.top != null) { w2.scrollTop = v.top; w2.scrollLeft = v.left; }
}
function validateAll() { S.val = {}; for (const t of S.pkg.tables) validateTable(t); }
function changeTableSource(t) { ctxCache.clear(); validateTable(t); renderTables(); renderCenter(); renderInspector(); autosave(); }

/* ----- îlots redimensionnables (largeurs propres au navigateur) ----- */
const LAYOUT_KEY = 'navbc.layout';
const PANES = { l: { min: 170, max: 480 }, r: { min: 280, max: 720 } };
function bindSashes() {
  const app = $('#app'); let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}'); } catch { }
  // largeur dépliée, lue sur la variable pour rester juste quand le panneau est replié
  const width = side => parseFloat(getComputedStyle(app).getPropertyValue('--w' + side));
  const set = (side, w) => { const p = PANES[side]; app.style.setProperty('--w' + side, Math.round(Math.max(p.min, Math.min(p.max, w))) + 'px'); };
  const folded = side => app.classList.contains('fold-' + side);
  const save = () => { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify({ l: width('l'), r: width('r'), fold: { l: folded('l'), r: folded('r') } })); } catch { } };
  const fold = (side, on) => {
    app.classList.toggle('fold-' + side, on);
    const b = $(`.ptoggle[data-fold="${side}"]`); const what = side === 'l' ? 'la liste des tables' : 'le panneau de détail';
    b.title = (on ? 'Afficher ' : 'Réduire ') + what; b.setAttribute('aria-expanded', String(!on));
  };
  for (const side in PANES) { if (saved[side]) set(side, saved[side]); if (saved.fold?.[side]) fold(side, true); }
  for (const b of $$('.ptoggle')) b.addEventListener('click', () => { closePicker(); fold(b.dataset.fold, !folded(b.dataset.fold)); save(); });
  for (const el of $$('.sash')) {
    const side = el.dataset.side; const dir = side === 'l' ? 1 : -1;
    el.addEventListener('pointerdown', e => {
      e.preventDefault(); closePicker(); el.setPointerCapture(e.pointerId);
      el.classList.add('drag'); document.body.classList.add('resizing');
      const x0 = e.clientX, w0 = width(side);
      const move = ev => set(side, w0 + dir * (ev.clientX - x0));
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', () => { el.removeEventListener('pointermove', move); el.classList.remove('drag'); document.body.classList.remove('resizing'); save(); }, { once: true });
    });
    el.addEventListener('dblclick', () => { app.style.removeProperty('--w' + side); save(); });
    el.addEventListener('keydown', e => {
      const k = { ArrowLeft: -1, ArrowRight: 1 }[e.key]; if (!k) return;
      set(side, width(side) + dir * k * 20); save(); e.preventDefault();
    });
  }
}

/* ---------------- événements ---------------- */
function bindApp() {
  bindSashes();
  $('#tables').addEventListener('click', e => {
    const b = e.target.closest('.titem'); if (!b) return;
    switchTable(+b.dataset.t);
  });
  const center = $('#center');
  center.addEventListener('change', e => {
    const t = curT(); const T = tm(t);
    if (e.target.id === 'selSource') {
      T.source = e.target.value || null;
      if (T.source) {
        T.headerRow = 1;
        T.mode = dataRowCount(T.source, T.headerRow) > 0 ? (T.mode === 'keep' ? 'replace' : T.mode) : 'keep';
        const has = t.fields.some(f => isMapped(getF(t, f)));
        ctxCache.clear();
        if (!has) { const n = autoMapTable(t); if (n) toast(`${plural(n, 'champ associé', 'champs associés')} automatiquement.`); }
      } else T.mode = 'keep';
      changeTableSource(t);
    } else if (e.target.id === 'selFilter') { S.ui.filter = e.target.value; renderGrid(); }
    else if (e.target.id === 'selMode') {
      T.mode = e.target.value; validateTable(t); renderTables(); renderCenter(); autosave();
      if (T.mode === 'replace' && t.existing.length) toast(`Les ${nf(t.existing.length)} lignes actuelles de « ${t.name} » seront remplacées.`);
    }
  });
  center.addEventListener('click', e => {
    const t = curT(); const T = tm(t);
    const tab = e.target.closest('[data-tab]'); if (tab) { S.ui.tab = tab.dataset.tab; renderCenter(); markPreviewCol(true); return; }
    const th = e.target.closest('.ptable th[data-k]'); if (th) { selectField(th.dataset.k, false); return; }
    const tr = e.target.closest('.ptable tbody tr'); // sélection de ligne, purement visuelle
    if (tr) { S.ui.row = +tr.dataset.r; $$('.ptable tr.rsel').forEach(x => x.classList.remove('rsel')); tr.classList.add('rsel'); return; }
    const pick = e.target.closest('[data-pick]'); if (pick) { selectField(pick.dataset.pick, false); openPicker(pick, pick.dataset.pick); e.stopPropagation(); return; }
    const fb = e.target.closest('[data-flt]');
    if (fb) { selectField(fb.dataset.flt, false); openFilter(fb, fb.dataset.flt); e.stopPropagation(); return; }
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
    if (e.target.closest('summary button')) e.preventDefault();
    else { const sum = e.target.closest('summary'); const d = sum?.parentElement; if (d?.dataset.sec) S.ui.open[d.dataset.sec] = !d.open; }
    const k = e.target.closest('[data-kind]');
    if (k) {
      const kind = k.dataset.kind;
      if (kind === 'col') { setField(t, f, { kind: 'col', auto: null }, true); const b = $('#insp [data-pick]'); if (b && !getF(t, f).col) openPicker(b, f.key); }
      else setField(t, f, { kind, auto: null }, true);
      return;
    }
    const pick = e.target.closest('[data-pick]'); if (pick) { openPicker(pick, pick.dataset.pick); e.stopPropagation(); return; }
    if (e.target.closest('#btnKey')) { setKeyField(t, f, !isKeyField(t, f)); return; }
    if (e.target.id === 'btnConfirm') { setField(t, f, { auto: null }, true); return; }
    if (e.target.id === 'btnVmapAdd') { openVmapAdd(e.target); e.stopPropagation(); return; }
    const vdel = e.target.closest('[data-vdel]');
    if (vdel) { const k = vdel.dataset.vdel.trim().toLowerCase(); const F = getF(t, f); setField(t, f, { map: (F.map || []).filter(([a]) => a.trim().toLowerCase() !== k) }, true); return; }
    if (e.target.id === 'btnPadHint') { setField(t, f, { padLen: f.padHint, padNum: true }, true); return; }
    if (e.target.id === 'btnCopyMap') {
      S.clipMap = (getF(t, f).map || []).filter(p => p[1] !== '').map(p => [...p]); renderInspector();
      toast(`${plural(S.clipMap.length, 'correspondance copiée', 'correspondances copiées')}. Sélectionnez un autre champ puis « Coller ».`); return;
    }
    // collage partiel : seules les valeurs présentes dans la colonne du champ sont reprises, en remplaçant celles déjà saisies
    if (e.target.id === 'btnPasteMap' && S.clipMap) {
      const F = getF(t, f); const r = mergeValueMap(t, F, S.clipMap, true);
      if (r.n) setField(t, f, { map: r.map }, true);
      const skip = r.miss ? `, ${plural(r.miss, 'valeur absente', 'valeurs absentes')} de la colonne « ${F.col} » ignorée${r.miss > 1 ? 's' : ''}` : '';
      toast(r.n ? `${plural(r.n, 'correspondance collée', 'correspondances collées')}${skip}.` : `Aucune des valeurs copiées n'est présente dans la colonne « ${F.col} ».`); return;
    }
    if (e.target.id === 'btnCopyFmt') { const F = getF(t, f) || newF(); S.clip = { case: F.case, repFrom: F.repFrom, repTo: F.repTo, repAt: F.repAt, padLen: F.padLen, padChar: F.padChar, padNum: F.padNum, prefix: F.prefix, suffix: F.suffix, dflt: F.dflt }; renderInspector(); toast('Format copié. Sélectionnez un autre champ puis « Coller ».'); return; }
    if (e.target.id === 'btnPasteFmt' && S.clip) { setField(t, f, { ...S.clip }, true); toast('Format appliqué.'); return; }
  });
  insp.addEventListener('input', e => {
    const [t, f] = cur(); if (!f) return; const id = e.target.id;
    const map = { inConst: 'value', inTpl: 'tpl', inPrefix: 'prefix', inSuffix: 'suffix', inDflt: 'dflt', inPadChar: 'padChar', inRepFrom: 'repFrom', inRepTo: 'repTo' };
    if (map[id]) return liveInput(t, f, { [map[id]]: e.target.value });
    if (id === 'inPadLen') return liveInput(t, f, { padLen: Math.max(0, Math.min(250, +e.target.value || 0)) });
    if (e.target.dataset.from !== undefined) {
      const from = e.target.dataset.from; const to = e.target.value;
      const F = getF(t, f) || newF();
      const m = (F.map || []).filter(([a]) => a.trim().toLowerCase() !== from.trim().toLowerCase());
      if (to !== '' || e.target.dataset.keep !== undefined) m.push([from, to]); // ligne ajoutée à la main : conservée même vide
      tm(t).fields[f.key] = { ...F, map: m };
      const dotCell = e.target.closest('tr').querySelector('.r'); dotCell.innerHTML = vmapDot(f, F, from, to);
      liveInput(t, f, {});
    }
  });
  insp.addEventListener('change', e => {
    const [t, f] = cur(); if (!f) return; const id = e.target.id;
    if (id === 'inCase') setField(t, f, { case: e.target.value }, false);
    else if (id === 'inRepAt') setField(t, f, { repAt: e.target.value }, false);
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
  let theme = getTheme();
  $('#dlgSetBody').innerHTML = `<h3>Options</h3>
    <h4>Apparence</h4><div class="sub">Propre à ce navigateur.</div>
    <div class="seg" id="segTheme">${[['light', 'Clair'], ['dark', 'Sombre'], ['auto', "Suivre l'appareil"]].map(([k, l]) => `<button data-th="${k}" aria-pressed="${theme === k}">${l}</button>`).join('')}</div>
    <h4>Génération</h4><div class="sub">Enregistrées avec le mapping.</div>
    ${opt('setDef', s.fillDefaults, 'Compléter les champs vides avec les valeurs par défaut BC', 'false, 0, première option… déduits des lignes déjà présentes dans le package. Évite les erreurs de validation à l\'import.')}
    ${opt('setTrunc', s.truncate, 'Tronquer les valeurs trop longues', 'Sinon, la valeur est signalée en erreur. La longueur maximale vient du type du champ (Code[20], Text[100]…).')}
    ${opt('setUpper', s.upperCode, 'Mettre en majuscules les champs de type Code', 'Business Central stocke toujours les codes en majuscules.')}
    ${opt('setSkip', s.skipEmpty, 'Ignorer les lignes entièrement vides de la source', 'Utile pour les exports avec lignes de séparation.')}
    <div class="actions"><button class="btn" id="setCancel">Annuler</button><button class="btn primary" id="setOk">Appliquer</button></div>`;
  const d = $('#dlgSettings'); d.showModal();
  $('#setCancel').onclick = () => d.close();
  $('#segTheme').onclick = e => { const b = e.target.closest('[data-th]'); if (!b) return; theme = b.dataset.th; $$('#segTheme button').forEach(x => x.setAttribute('aria-pressed', x === b)); };
  $('#setOk').onclick = () => {
    setTheme(theme);
    Object.assign(S.map.settings, { fillDefaults: $('#setDef').checked, truncate: $('#setTrunc').checked, upperCode: $('#setUpper').checked, skipEmpty: $('#setSkip').checked });
    d.close(); ctxCache.clear(); validateAll(); renderAll(); autosave(); toast('Options appliquées.');
  };
}
function openGenerate() {
  const rows = S.pkg.tables.map(t => {
    const T = tm(t); const mode = effectiveMode(t); const ctx = tableCtx(t); const iss = tableIssues(t);
    const n = mode === 'keep' ? t.existing.length : mode === 'append' ? t.existing.length + ctx.rows.length : ctx.rows.length;
    const mapped = t.fields.filter(f => isMapped(getF(t, f))).length;
    const modeTxt = mode === 'keep' ? 'Inchangée' : mode === 'append' ? 'Ajout' : 'Remplacement';
    return `<tr><td>${esc(t.name)}</td><td>${esc(T.source || '-')}</td><td>${modeTxt}</td><td class="num">${mode === 'keep' ? '-' : mapped + ' / ' + t.fields.length}</td><td class="num">${nf(n)}</td>
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
