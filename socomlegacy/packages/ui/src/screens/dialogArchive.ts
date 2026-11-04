import { parseRdr, type Zar } from '@s2u/archive';
import { loadDialog, type DialogDesign } from '../dialog';

/**
 * The dialogs a switch opens (`FUN_00367430` D:L263179-263243: `data/common/zrdr/dialog/<name>` through `FUN_0032f630`),
 * read from the disc's dialog archives -- `RUN/UI/READERC.ZAR` then `RUN/UI/READERX.ZAR` (research 96, 105) -- and
 * decoded once each by PLAT-05's loader (PLAT-10).
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/**
 * DIALOG_NAME_MATCH_READING: how a switch's name finds its dialog. `FUN_0032f630`'s archive lookup (its compare through
 * `FUN_0032c040`) was not read to the byte compare; the archives' own member names match first, then a case-insensitive
 * match (the zAnim runtime's and the command table's lookups both fold case: `NODE_NAME_MATCH_READING`,
 * `uiCommandFold`). [reading]
 */
export const DIALOG_NAME_MATCH_READING = 'exact, then case-insensitive' as const;

/** A dialog lookup over the archives, in order; null for a name none holds (`MENU_MISSING_DIALOG_READING`). */
export function dialogLookup(archives: readonly Zar[]): (name: string) => DialogDesign | null {
  const cache = new Map<string, DialogDesign | null>();
  return (name) => {
    if (cache.has(name)) return cache.get(name)!;
    let found: DialogDesign | null = null;
    const lower = name.toLowerCase();
    for (const exact of [true, false]) {
      for (const z of archives) {
        const key = z.root.children.find((k) => (exact ? k.name === name : k.name.toLowerCase() === lower));
        if (key) { found = loadDialog(parseRdr(z.data(key))); break; }
      }
      if (found) break;
    }
    cache.set(name, found);
    return found;
  };
}
