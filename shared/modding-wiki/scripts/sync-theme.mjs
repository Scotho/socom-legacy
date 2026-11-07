// Copies the S2U design system into the wiki before a dev run or a build (MW.R4): the tokens and the font faces
// (shared/ds/), the self-hosted fonts with their OFL texts (shared/fonts/), the project's SL mark
// (shared/brand/sl-icon.png). Every output is git-ignored and overwritten on each run; the design system stays the
// one source and is never edited here.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const wiki = join(dirname(fileURLToPath(import.meta.url)), '..');
const shared = join(wiki, '..');

const copies = [
  [join(shared, 'ds', 'tokens.css'), join(wiki, 'app', 's2u-tokens.css')],
  [join(shared, 'ds', 'fonts.css'), join(wiki, 'app', 's2u-fonts.css')],
  [join(shared, 'brand', 'sl-icon.png'), join(wiki, 'public', 'brand', 'sl-icon.png')],
];
for (const name of readdirSync(join(shared, 'fonts'))) {
  if (name.endsWith('.woff2') || name.startsWith('OFL-')) {
    copies.push([join(shared, 'fonts', name), join(wiki, 'public', 'fonts', name)]);
  }
}

for (const [from, to] of copies) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}
console.log(`sync-theme: ${copies.length} files from shared/ (ds, fonts, brand)`);
