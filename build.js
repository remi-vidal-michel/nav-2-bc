// Assemble src/index.html en un fichier HTML unique : node build.js -> dist/nav-2-bc.html
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'src');
const out = path.join(__dirname, 'dist', 'nav-2-bc.html');
const read = rel => fs.readFileSync(path.join(src, rel), 'utf8');

const html = read('index.html')
  .replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => `<style>\n${read(href)}\n</style>`)
  .replace(/<script src="([^"]+)"><\/script>/g, (_, s) => `<script>\n${read(s).replace(/<\/script/gi, '<\/script')}\n</script>`);

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`${path.relative(__dirname, out)} (${Math.round(html.length / 1024)} Ko)`);
