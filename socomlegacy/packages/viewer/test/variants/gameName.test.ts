import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MAP_VARIANTS, variantName } from '@s2u/archive';
import { FONT_TEXT_01, textWidth } from '../../src/hudFont';
import { SCORE_LAYOUT } from '../../src/scoreboard';
import { variantGameName } from '../../src/variants/gameName';

/**
 * DAY-NAME (product track: a browser adaptation, display only -- `hudState` `setGame`'s name is `model.game.name`, the
 * scoreboard's GAME DETAILS line 2, `scoreboard` `scoreboardLayout`): a Day game's line names the variant
 * (`variantName`, `ABANDONED (DAY)`), never the night parent's name. The mode lookup (`rankOf`) keeps the parent's name.
 * The line is drawn in `font_text_01` (`FONT_TEXT_01`), which holds `(` (40) and `)` (41); every accepted variant's name
 * fits the line's 118 at scale 0.8 (`SCORE_LAYOUT.left.lines`, the 640x448 board), so `cutLine` never cuts it.
 */
const src = resolve(dirname(fileURLToPath(import.meta.url)), '../../src');
const accepted = MAP_VARIANTS.filter((v) => v.accepted);

describe('variantGameName (DAY-NAME)', () => {
  it("names a told Day variant, and the map's own name without one", () => {
    expect(variantGameName('ABANDONED', 'MP5', 'day')).toBe('ABANDONED (DAY)');
    expect(variantGameName('ABANDONED', 'MP5', undefined)).toBe('ABANDONED');
    expect(variantGameName('ABANDONED', 'MP5', null)).toBe('ABANDONED');
  });

  it("falls back to the map's name for a pair off the table", () => {
    expect(variantGameName('FROSTFIRE', 'MP2', 'day')).toBe('FROSTFIRE');
  });

  it("every accepted variant's name is in the line's font and fits the line", () => {
    const codes = new Set(FONT_TEXT_01.glyphs.map((g) => g[0]));
    const { scale, width } = SCORE_LAYOUT.left.lines;
    for (const v of accepted) {
      const name = variantName(v.stem, v.variant)!;
      for (const ch of name) expect(codes.has(ch.codePointAt(0)!), `${name}: ${ch}`).toBe(true);
      expect(textWidth(name, scale), name).toBeLessThanOrEqual(width);
    }
  });

  it("the match's and the test room's game lines name the variant; the mode lookup keeps the parent's name", () => {
    const match = readFileSync(resolve(src, 'matchMount.ts'), 'utf8');
    expect(match).toContain("hud.setGame(variantGameName(m.name, m.archive, o.handOff?.welcome?.variant), o.gameMode ?? rankOf(m.name)?.mode ?? '');");
    const room = readFileSync(resolve(src, 'main.ts'), 'utf8');
    expect(room).toContain("hud.setGame(variantGameName(map.name, map.archive, variantOf(map)?.split(' ')[1]), rankOf(map.name)?.mode ?? '');");
  });
});
