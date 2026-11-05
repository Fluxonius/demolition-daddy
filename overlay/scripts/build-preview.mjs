// Writes web/preview.html as one self-contained file (CSS and JS inlined), for sharing outside the repo.
// Usage: node scripts/build-preview.mjs <out.html>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
const out = process.argv[2];
if (!out) {
  console.error('Usage: node scripts/build-preview.mjs <out.html>');
  process.exit(1);
}
const read = (f) => fs.readFileSync(path.join(web, f), 'utf8');
const html = read('preview.html')
  .replace('<link rel="stylesheet" href="pixel.css">', () => `<style>\n${read('pixel.css')}</style>`)
  .replace('<script src="sprites.js"></script>', () => `<script>\n${read('sprites.js')}</script>`)
  .replace('<script src="pixel.js"></script>', () => `<script>\n${read('pixel.js')}</script>`)
  .replace('<script src="display.js"></script>', () => `<script>\n${read('display.js')}</script>`)
  .replace('<script src="states.js"></script>', () => `<script>\n${read('states.js')}</script>`);
fs.writeFileSync(out, html);
console.log(`Wrote ${out}`);
