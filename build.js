#!/usr/bin/env node
/*
 * Assemble src/index.html en un fichier HTML unique et autonome :
 * les feuilles de style et les scripts référencés sont insérés en ligne.
 * Aucune dépendance : Node.js 16+ suffit.
 *
 *   node build.js            -> dist/Mapping_NAV_BC.html
 *   node build.js --watch    -> reconstruit à chaque modification de src/ ou vendor/
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src', 'index.html');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT = path.join(OUT_DIR, 'Mapping_NAV_BC.html');

function read(rel, from) {
  const p = path.resolve(path.dirname(from), rel);
  if (!fs.existsSync(p)) throw new Error(`Fichier introuvable : ${path.relative(ROOT, p)}`);
  return fs.readFileSync(p, 'utf8');
}

function build() {
  const t0 = Date.now();
  let html = fs.readFileSync(SRC, 'utf8');
  let nCss = 0, nJs = 0;

  html = html.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/g, (m, href) => {
    nCss++;
    return `<style>\n${read(href, SRC).replace(/<\/style/gi, '<\\/style')}\n</style>`;
  });

  html = html.replace(/<script\s+src="([^"]+)"\s*><\/script>/g, (m, src) => {
    nJs++;
    // "</script" dans le code fermerait la balise : on l'échappe
    return `<script>\n${read(src, SRC).replace(/<\/script/gi, '<\\/script')}\n</script>`;
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, html, 'utf8');
  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  console.log(`[${new Date().toLocaleTimeString()}] ${path.relative(ROOT, OUT)} : ${nCss} CSS + ${nJs} scripts, ${kb} Ko (${Date.now() - t0} ms)`);
}

try { build(); } catch (e) { console.error('Échec :', e.message); process.exitCode = 1; }

if (process.argv.includes('--watch')) {
  let timer = null;
  const again = () => { clearTimeout(timer); timer = setTimeout(() => { try { build(); } catch (e) { console.error('Échec :', e.message); } }, 150); };
  for (const dir of ['src', 'vendor']) fs.watch(path.join(ROOT, dir), { recursive: true }, again);
  console.log('Surveillance de src/ et vendor/ (Ctrl+C pour arrêter)…');
}
