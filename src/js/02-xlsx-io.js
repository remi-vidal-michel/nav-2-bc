'use strict';
/* 02-xlsx-io.js : Lecture bas niveau des fichiers .xlsx/.csv et chargement du package BC. */

/* ---------------- lecture xlsx (bas niveau) ---------------- */
async function readText(zip, p) { const f = p && zip.file(p); return f ? f.async('string') : null; }
function resolvePath(base, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/'); parts.pop();
  for (const seg of target.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
  return parts.join('/');
}
function relsPath(p) { const i = p.lastIndexOf('/'); return p.slice(0, i + 1) + '_rels/' + p.slice(i + 1) + '.rels'; }
async function readRels(zip, partPath) {
  const xml = await readText(zip, relsPath(partPath)); const out = [];
  if (!xml) return out;
  for (const m of xml.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const a = m[1]; out.push({ id: attrv(a, 'Id'), type: attrv(a, 'Type') || '', target: resolvePath(partPath, attrv(a, 'Target') || ''), mode: attrv(a, 'TargetMode') });
  }
  return out;
}
async function readWorkbook(zip) {
  let wbPath = 'xl/workbook.xml';
  const root = await readText(zip, '_rels/.rels');
  if (root) { const m = /<Relationship\b[^>]*Type="[^"]*\/officeDocument"[^>]*>/.exec(root); if (m) { const t = attrv(m[0], 'Target'); if (t) wbPath = t.replace(/^\//, ''); } }
  const wb = await readText(zip, wbPath);
  if (!wb) throw new Error("Ce fichier n'est pas un classeur Excel .xlsx valide.");
  const rels = await readRels(zip, wbPath);
  const byId = Object.fromEntries(rels.map(r => [r.id, r]));
  const sheets = [];
  for (const m of wb.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const a = m[1]; const rid = attrv(a, 'r:id'); const rel = byId[rid];
    if (rel && /\/worksheet$/.test(rel.type)) sheets.push({ name: attrv(a, 'name'), path: rel.target });
  }
  const sstRel = rels.find(r => /\/sharedStrings$/.test(r.type));
  const stRel = rels.find(r => /\/styles$/.test(r.type));
  const d1904 = /<workbookPr\b[^>]*date1904="(1|true)"/.test(wb);
  return { wbPath, wbXml: wb, rels, sheets, sstPath: sstRel?.target || null, stylesPath: stRel?.target || null, d1904 };
}
function parseSST(xml) {
  const out = []; if (!xml) return out;
  for (const m of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)) {
    const inner = (m[1] || '').replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
    let s = ''; for (const t of inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) s += xdec(t[1]);
    out.push(s);
  }
  return out;
}
function dateStyleTester(stylesXml) {
  if (!stylesXml) return () => false;
  const custom = {};
  for (const m of stylesXml.matchAll(/<numFmt\b([^>]*?)\/?>/g)) custom[+attrv(m[1], 'numFmtId')] = attrv(m[1], 'formatCode') || '';
  const cx = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml);
  const ids = cx ? [...cx[1].matchAll(/<xf\b([^>]*?)\/?>/g)].map(m => +(attrv(m[1], 'numFmtId') || 0)) : [];
  const isDate = id => (id >= 14 && id <= 22) || (id >= 27 && id <= 36) || (id >= 45 && id <= 47) || (id >= 50 && id <= 58) ||
    (custom[id] != null && /[dmyhs]/i.test(custom[id].replace(/\[[^\]]*\]|"[^"]*"|\\./g, '')));
  const flags = ids.map(isDate);
  return s => !!flags[s];
}
/* Parcourt sheetData et renvoie un tableau de lignes (tableaux creux de cellules typées) */
function parseSheetData(xml, sst, isDateStyle) {
  const rows = [];
  const a = xml.indexOf('<sheetData'); if (a < 0) return rows;
  const b = xml.indexOf('</sheetData>', a); if (b < 0) return rows;
  const body = xml.slice(a, b);
  const re = /<row\b([^>]*?)(\/>|>)|<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m, r = -1, c = -1;
  while ((m = re.exec(body))) {
    if (m[1] !== undefined) { const rr = attrv(m[1], 'r'); r = rr ? +rr - 1 : r + 1; c = -1; continue; }
    const at = m[3]; const ref = attrv(at, 'r');
    if (ref) { const mm = /^([A-Z]+)(\d+)$/.exec(ref); if (mm) { c = colIndex(mm[1]); r = +mm[2] - 1; } else c++; } else c++;
    const inner = m[4]; if (inner == null) continue;
    const t = attrv(at, 't') || 'n'; let val = null;
    if (t === 'inlineStr') {
      let s = ''; for (const tt of inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) s += xdec(tt[1]); val = { t: 's', v: s };
    } else {
      const vm = /<v>([\s\S]*?)<\/v>/.exec(inner); if (!vm) continue;
      const rv = vm[1];
      if (t === 's') val = { t: 's', v: sst[+rv] ?? '' };
      else if (t === 'str' || t === 'e') val = { t: 's', v: xdec(rv) };
      else if (t === 'b') val = { t: 'b', v: rv === '1' || rv === 'true' };
      else if (t === 'd') val = { t: 's', v: xdec(rv).slice(0, 10) };
      else { const n = +rv; const st = attrv(at, 's'); val = (st && isDateStyle(+st) && isFinite(n)) ? { t: 'd', v: n } : { t: 'n', v: n }; }
    }
    (rows[r] ||= [])[c] = val;
  }
  return rows;
}
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const first = text.slice(0, text.search(/\r?\n/) >>> 0 || 2000);
  const cnt = ch => first.split(ch).length - 1;
  const d = [';', '\t', ',', '|'].sort((x, y) => cnt(y) - cnt(x))[0];
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; continue; }
    if (ch === '"' && f === '') q = true;
    else if (ch === d) { row.push(f); f = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += ch;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.map(r => r.map(v => v === '' ? null : { t: 's', v }));
}

/* ---------------- chargement des fichiers ---------------- */
async function loadRaw(file) {
  const name = file.name;
  if (/\.xls$/i.test(name)) throw new Error("Le format .xls n'est pas pris en charge : enregistrez le fichier au format .xlsx dans Excel.");
  const buf = await file.arrayBuffer();
  if (/\.(csv|txt)$/i.test(name)) {
    let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { text = new TextDecoder('windows-1252').decode(buf); }
    return { fileName: name, d1904: false, sheets: [{ name: baseName(name), rows: parseCSV(text) }] };
  }
  const zip = await JSZip.loadAsync(buf);
  const wb = await readWorkbook(zip);
  const sst = parseSST(await readText(zip, wb.sstPath));
  const isDate = dateStyleTester(await readText(zip, wb.stylesPath));
  const sheets = [];
  for (const sh of wb.sheets) { const xml = await readText(zip, sh.path); sheets.push({ name: sh.name, rows: xml ? parseSheetData(xml, sst, isDate) : [] }); }
  return { fileName: name, d1904: wb.d1904, sheets };
}

function parseFieldType(txt) {
  const lines = String(txt || '').replace(/\r/g, '').split('\n');
  const first = (lines[0] || '').trim();
  const m = /^([A-Za-z]+?)(\d*)$/.exec(first);
  const base = m ? m[1] : (first || 'Text');
  const len = m && m[2] ? +m[2] : 0;
  let options = null;
  if (base === 'Option') options = lines.slice(1).map(l => { const mm = /^(\d+):\s?(.*)$/.exec(l); return mm ? { i: +mm[1], c: mm[2] } : null; }).filter(Boolean);
  return { base, len, options, raw: first };
}
const MODE_TYPES = new Set(['Boolean', 'Option', 'Decimal', 'Integer', 'BigInteger', 'Media', 'MediaSet', 'DateFormula', 'Duration']);
function neutralDefault(ty) {
  if (ty.base === 'Boolean') return 'false';
  if (['Decimal', 'Integer', 'BigInteger', 'Duration'].includes(ty.base)) return '0';
  if (ty.base === 'Option') return ty.options?.[0]?.c ?? '';
  return '';
}

async function loadPackage(file) {
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const wb = await readWorkbook(zip);
  const sstXml = await readText(zip, wb.sstPath);
  const sst = parseSST(sstXml);
  const orig = {}; const tables = [];
  for (const sh of wb.sheets) {
    const xml = await readText(zip, sh.path); if (!xml) continue;
    orig[sh.path] = xml;
    const rels = await readRels(zip, sh.path);
    const tRel = rels.find(r => /\/table$/.test(r.type));
    const cRel = rels.find(r => /\/comments$/.test(r.type));
    const rows = parseSheetData(xml, sst, () => false);
    const cell = (r, c) => { const v = rows[r]?.[c]; return v == null ? '' : String(v.v); };
    let hdr = 2, c0 = 0, c1 = -1, tableXml = null, tablePath = null;
    if (tRel) {
      tablePath = tRel.target; tableXml = await readText(zip, tablePath); orig[tablePath] = tableXml;
      const ref = /<table\b[^>]*?\sref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/.exec(tableXml || '');
      if (ref) { c0 = colIndex(ref[1]); hdr = +ref[2] - 1; c1 = colIndex(ref[3]); }
    }
    if (c1 < 0) { const hr = rows[hdr] || []; c1 = hr.length - 1; }
    if (c1 < c0) continue; // feuille sans en-tête exploitable
    const comments = {};
    if (cRel) {
      const cx = await readText(zip, cRel.target) || '';
      for (const m of cx.matchAll(/<comment\b([^>]*)>([\s\S]*?)<\/comment>/g)) {
        const ref = attrv(m[1], 'ref'); let t = '';
        for (const tt of m[2].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) t += xdec(tt[1]);
        comments[ref] = t;
      }
    }
    const seen = {};
    const fields = [];
    for (let c = c0; c <= c1; c++) {
      const caption = cell(hdr, c).trim() || `Colonne ${colLetter(c)}`;
      seen[caption] = (seen[caption] || 0) + 1;
      const key = seen[caption] > 1 ? `${caption} (${seen[caption]})` : caption;
      const L = colLetter(c);
      fields.push({ i: c - c0, c, L, caption, key, type: parseFieldType(comments[L + (hdr + 1)]) });
    }
    const existing = [];
    for (let r = hdr + 1; r < rows.length; r++) {
      const row = rows[r]; if (!row) continue;
      const vals = fields.map(f => cell(r, f.c));
      if (vals.some(v => v !== '')) existing.push(vals);
    }
    for (const f of fields) {
      f.dflt = '';
      if (MODE_TYPES.has(f.type.base)) {
        const cnt = new Map(); for (const r of existing) cnt.set(r[f.i], (cnt.get(r[f.i]) || 0) + 1);
        let best = null, bn = 0; for (const [v, n] of cnt) if (n > bn) { best = v; bn = n; }
        f.dflt = (best != null && best !== '' && bn >= existing.length * 0.6) ? best : neutralDefault(f.type);
      }
      // gabarit numérique observé dans le package (ex : 0003976 -> 7 chiffres)
      const vals = existing.map(r => r[f.i]).filter(v => v !== '');
      if (vals.length >= 3 && (f.type.base === 'Code' || f.type.base === 'Text')) {
        const digits = vals.filter(v => /^\d+$/.test(v));
        if (digits.length >= vals.length * 0.6) {
          const lens = new Map(); digits.forEach(v => lens.set(v.length, (lens.get(v.length) || 0) + 1));
          const [L, n] = [...lens].sort((a, b) => b[1] - a[1])[0];
          if (L > 1 && n >= digits.length * 0.8 && digits.some(v => v[0] === '0')) f.padHint = L;
        }
      }
    }
    // style des cellules de données
    let dataStyle = null;
    const rowRe = new RegExp(`<row\\b[^>]*\\sr="${hdr + 2}"[^>]*>\\s*<c\\b([^>]*?)(?:/>|>)`);
    const dm = rowRe.exec(xml); if (dm) dataStyle = attrv(dm[1], 's');
    if (dataStyle == null) { const hm = new RegExp(`<row\\b[^>]*\\sr="${hdr + 1}"[^>]*>\\s*<c\\b([^>]*?)(?:/>|>)`).exec(xml); if (hm) dataStyle = attrv(hm[1], 's'); }
    tables.push({
      name: sh.name, path: sh.path, tablePath, hdr, c0,
      pkgCode: cell(0, 0), tableCaption: cell(0, 1), tableId: cell(0, 2),
      fields, existing, dataStyle,
    });
  }
  if (!tables.length) throw new Error("Aucune feuille de package BC n'a été reconnue dans ce fichier.");
  const isPackage = /tableType="xml"/.test(Object.values(orig).join('').slice(0, 5e6)) || !!zip.file('xl/xmlMaps.xml') || tables.some(t => /^\d+$/.test(t.tableId));
  return { fileName: file.name, zip, wb, sst, sstPath: wb.sstPath, orig, tables, isPackage };
}
