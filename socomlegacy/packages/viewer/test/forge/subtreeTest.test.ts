import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { under } from '../../src/mapMeta';

/**
 * FP-1b (REVIEW-A 17; a browser adaptation, FG.R2): the Forge's copies find what lies beneath a node by the one subtree
 * test (`../../src/mapMeta` `under`: the node itself, a child after `/`, the realised prototype after `=`), never a copy of
 * it of their own -- three had drifted into `mapCensus`, `placedDoors` and `turrets`.
 */
const here = dirname(fileURLToPath(import.meta.url));
const source = (file: string): string => readFileSync(resolve(here, '../../src/forge', file), 'utf8');

describe('one subtree test for the Forge copies', () => {
  it('under: the root, a child after /, the prototype after =; never a sibling sharing a prefix', () => {
    expect(under('worldmodel/door', 'worldmodel/door')).toBe(true);
    expect(under('worldmodel/door/leaf', 'worldmodel/door')).toBe(true);
    expect(under('worldmodel/door=bdoor/leaf', 'worldmodel/door')).toBe(true);
    expect(under('worldmodel/door2', 'worldmodel/door')).toBe(false);
  });

  it.each(['mapCensus.ts', 'placedDoors.ts', 'turrets.ts', 'placedAccess.ts'])('%s imports mapMeta\'s under and defines no beneath of its own', (file) => {
    const text = source(file);
    expect(text).toMatch(/^import \{[^}]*\bunder\b[^}]*\} from '\.\.\/mapMeta';$/m);
    expect(text).not.toMatch(/\bconst beneath\b/);
  });
});
