'use strict';
/* 06-generate.js : Génération du package (réécriture XML) et rapport d'anomalies. */

/* ---------------- génération du package ---------------- */
function buildTableRows(t) {
  const T = tm(t); const ctx = getCtx(T);
  const fns = t.fields.map(f => compileField(t, f, getF(t, f), ctx));
  const out = [];
  if (!ctx) return out;
  for (const row of ctx.rows) out.push(fns.map(fn => fn(row).v));
  return out;
}
function effectiveMode(t) { const T = tm(t); return (T.mode !== 'keep' && T.source && getCtx(T)) ? T.mode : 'keep'; }
async function generatePackage() {
  const P = S.pkg; const zip = P.zip;
  const sstArr = [], sstMap = new Map(); let count = 0;
  const sid = s => { s = s ?? ''; count++; let i = sstMap.get(s); if (i === undefined) { i = sstArr.length; sstArr.push(s); sstMap.set(s, i); } return i; };
  const remap = xml => xml.replace(/<c\b([^>]*?)>(\s*)<v>(\d+)<\/v>/g, (m, a, ws, n) => /(?:^|\s)t="s"/.test(a) ? `<c${a}>${ws}<v>${sid(P.sst[+n] ?? '')}</v>` : m);
  const report = [];
  for (const t of P.tables) {
    busy(true, `Génération : ${t.name}…`); await nextFrame();
    const xml = P.orig[t.path]; const mode = effectiveMode(t);
    if (mode === 'keep') { zip.file(t.path, remap(xml), ZOPT); report.push({ t, mode, rows: t.existing.length }); continue; }
    const gen = buildTableRows(t);
    const rows = mode === 'append' ? t.existing.concat(gen) : gen;
    const a = xml.indexOf('<sheetData'); const aEnd = xml.indexOf('>', a) + 1;
    const selfClosing = xml[aEnd - 2] === '/';
    const b = selfClosing ? aEnd : xml.indexOf('</sheetData>', aEnd);
    const bEnd = selfClosing ? aEnd : b + 12;
    const inner = selfClosing ? '' : xml.slice(aEnd, b);
    const hdrNum = t.hdr + 1;
    const keep = [];
    for (const m of inner.matchAll(/<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g)) { const r = +attrv(m[0].slice(0, m[0].indexOf('>')), 'r'); if (r && r <= hdrNum) keep.push(remap(m[0])); }
    const ncol = t.fields.length; const letters = t.fields.map(f => f.L);
    const st = t.dataStyle != null ? ` s="${t.dataStyle}"` : '';
    const span = `${t.c0 + 1}:${t.c0 + ncol}`;
    const data = rows.length ? rows : [t.fields.map(() => '')];
    const parts = [];
    for (let i = 0; i < data.length; i++) {
      const r = hdrNum + 1 + i; const vals = data[i];
      let s = `<row r="${r}" spans="${span}">`;
      for (let j = 0; j < ncol; j++) s += `<c r="${letters[j]}${r}"${st} t="s"><v>${sid(vals[j])}</v></c>`;
      parts.push(s + '</row>');
    }
    const lastRow = hdrNum + data.length; const lastL = letters[ncol - 1];
    let nx = xml.slice(0, a) + '<sheetData>' + keep.join('') + parts.join('') + '</sheetData>' + xml.slice(bEnd);
    nx = nx.replace(/<dimension\b[^>]*?ref="([A-Z]+\d+)(?::[A-Z]+\d+)?"\s*\/>/, (m, s0) => `<dimension ref="${s0}:${lastL}${lastRow}"/>`);
    zip.file(t.path, nx, ZOPT);
    if (t.tablePath && P.orig[t.tablePath]) {
      const ref = `${letters[0]}${hdrNum}:${lastL}${lastRow}`;
      const tx = P.orig[t.tablePath].replace(/(<table\b[^>]*?\sref=")[^"]*(")/, `$1${ref}$2`).replace(/(<autoFilter\b[^>]*?\sref=")[^"]*(")/, `$1${ref}$2`);
      zip.file(t.tablePath, tx, ZOPT);
    }
    report.push({ t, mode, rows: rows.length, gen: gen.length });
  }
  const sstXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + count + '" uniqueCount="' + sstArr.length + '">' +
    sstArr.map(s => `<si><t${/^\s|\s$|[\n\r\t]/.test(s) ? ' xml:space="preserve"' : ''}>${xenc(s)}</t></si>`).join('') + '</sst>';
  let sstPath = P.sstPath;
  if (!sstPath) {
    sstPath = 'xl/sharedStrings.xml';
    const ct = await readText(zip, '[Content_Types].xml');
    zip.file('[Content_Types].xml', ct.replace('</Types>', '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>'));
    const rp = relsPath(P.wb.wbPath); const rx = await readText(zip, rp);
    zip.file(rp, rx.replace('</Relationships>', '<Relationship Id="rIdNavBcSst" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>'));
    P.sstPath = sstPath;
  }
  zip.file(sstPath, sstXml, ZOPT);
  busy(true, 'Compression du fichier…'); await nextFrame();
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  return { blob, report };
}
function reportCSV() {
  const lines = [['Table', 'Ligne source', 'Champ BC', 'Valeur source', 'Valeur générée', 'Niveau', 'Message']];
  for (const t of S.pkg.tables) {
    if (effectiveMode(t) === 'keep') continue;
    const T = tm(t); const ctx = getCtx(T);
    for (const f of t.fields) {
      const fn = compileField(t, f, getF(t, f), ctx);
      ctx.rows.forEach((row, i) => { const r = fn(row); if (r.e || r.w) lines.push([t.name, ctx.rowNums[i], f.caption, r.input ?? '', r.v, r.e ? 'Erreur' : 'Alerte', r.e || r.w]); });
    }
    const K = S.val[t.name]?.keys; if (K) for (const e of K.ex) lines.push([t.name, '', t.fields[0].caption, '', '', 'Erreur', e]);
  }
  const csv = lines.map(l => l.map(v => { v = String(v ?? ''); return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(';')).join('\r\n');
  download(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), `anomalies_NAV-BC_${stamp()}.csv`);
}
