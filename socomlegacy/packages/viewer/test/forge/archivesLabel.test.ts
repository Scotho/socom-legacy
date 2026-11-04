import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { labelOf } from '../../src/forge/archives';

const here = dirname(fileURLToPath(import.meta.url));

/** DX-4's browser run (2026-10-16): the palette's status line showed a campaign mission's raw message key. */
describe("the forge's archive names: the listing's label, never a raw loc key", () => {
  const entries = [{ stem: 'MP2', label: 'FROSTFIRE' }, { stem: 'M51', label: 'SEEDING CHAOS' }];

  it("labelOf: the listing's label, else the fallback", () => {
    expect(labelOf(entries, 'M51', '_60883_SeedingChaos_MSG')).toBe('SEEDING CHAOS');
    expect(labelOf(entries, 'MP2', 'Frostfire')).toBe('FROSTFIRE');
    expect(labelOf(entries, 'M99', 'the map')).toBe('the map');
  });

  it("the palette's status line names the archive by labelOf, not the loaded map's own name", () => {
    const page = readFileSync(resolve(here, '../../src/forge/page.ts'), 'utf-8');
    expect(page).toMatch(/say\(`\$\{labelOf\(entries, stem, map\.name\)\} \(\$\{stem\}\): \$\{entriesOfPalette\.length\} props`\)/);
    expect(page).not.toMatch(/say\(`\$\{map\.name\} \(\$\{stem\}\)/);
  });
});
