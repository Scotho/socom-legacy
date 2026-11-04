/**
 * The commands the main menu and the online entry dispatch, read from the two dialogs (MENU-01a; web research 138 §1).
 *
 *   SOCOM_DISC=C:/Projects/socom_pc/game/disc npx tsx tools/menuEntryCommands.ts            # the list, per animation
 *   SOCOM_DISC=... npx tsx tools/menuEntryCommands.ts --pin                                  # rewrite the test's pin
 *
 * `dlgMenu.rdr` and `dlgMPswitch.rdr` through ONL-33's chapter reader (`./dump-online-dialogs` `readChapters`): each
 * dialog's bindings, and for its own set's animations and every library animation its bindings reach, the bound
 * functions (no node) that animation names -- in its ops and in its `IF` / `WHILE` conditions (`namedBy`). Names and
 * counts only (RS.R8). `test/menuEntryCommandsDisc.test.ts` holds the pin to the disc; `test/menuEntryCommands.test.ts`
 * holds `@s2u/ui`'s `MENU_ENTRY_COMMANDS` -- which task answers each name -- to the pin in CI.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { discRoot } from './dump-dialogs';
import { readChapters, readChapterSets } from './dump-online-dialogs';
import { namedBy, type ChapterSet, type DialogChapter } from './onlineDialogs';

/** The main menu and the pass-through the ONLINE and LAN items switch to (research 128 R128.2). */
export const MENU_ENTRY_DIALOGS = ['dlgMenu.rdr', 'dlgMPswitch.rdr'] as const;

export interface MenuEntryDialogPin {
  name: string;
  /** `<owner> <trigger> -> <animation> [<set>]`, in layout order. */
  bindings: string[];
  /** The own set's animations, in set order: the bound functions each names, sorted and unique. */
  animations: Record<string, string[]>;
  /** The library animations the bindings reach (`<archive>:<set>/<animation>`), the same way. */
  library: Record<string, string[]>;
}

export interface MenuEntryPin {
  dialogs: MenuEntryDialogPin[];
  /** Every name over both dialogs, sorted and unique, as the scripts spell it. */
  names: string[];
}

const animOf = (sets: readonly ChapterSet[], archive: string | null, set: string, anim: string) =>
  sets.find((s) => (archive === null || s.archive === archive) && s.name === set)?.anims.find((a) => a.anim.name === anim) ?? null;

const commandsOf = (sets: readonly ChapterSet[], archive: string | null, set: string, anim: string): string[] => {
  const a = animOf(sets, archive, set, anim);
  if (!a) throw new Error(`no animation ${set}/${anim}`);
  return namedBy(a.program.sequences.flatMap((s) => s.ops)).commands;
};

/** One dialog's pin from its chapter and the decoded sets. */
export function menuEntryDialogPin(chapter: DialogChapter, sets: readonly ChapterSet[]): MenuEntryDialogPin {
  const animations: Record<string, string[]> = {};
  if (chapter.ownSet) for (const anim of Object.keys(chapter.animations)) animations[anim] = commandsOf(sets, null, chapter.ownSet, anim);
  const library: Record<string, string[]> = {};
  for (const key of Object.keys(chapter.library)) {
    const m = /^(.*?):([^/]+)\/(.+)$/.exec(key);
    if (!m) throw new Error(`library key ${key}`);
    library[key] = commandsOf(sets, m[1]!, m[2]!, m[3]!);
  }
  return {
    name: chapter.name,
    bindings: chapter.bindings.map((b) => `${b.owner} ${b.trigger} -> ${b.animation} [${b.set ?? 'none'}]`),
    animations, library,
  };
}

export function menuEntryPin(chapters: readonly DialogChapter[], sets: readonly ChapterSet[]): MenuEntryPin {
  const dialogs = chapters.map((c) => menuEntryDialogPin(c, sets));
  const names = new Set<string>();
  for (const d of dialogs) for (const list of [...Object.values(d.animations), ...Object.values(d.library)]) for (const n of list) names.add(n);
  return { dialogs, names: [...names].sort() };
}

/** The pin off the disc tree. */
export function readMenuEntryPin(disc: string): MenuEntryPin {
  return menuEntryPin(readChapters(disc, [...MENU_ENTRY_DIALOGS]), readChapterSets(disc));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const disc = discRoot();
  if (!disc) throw new Error('set SOCOM_DISC (or SOCOM_PC_ROOT) to the disc tree holding RUN/UI/READERC.ZAR');
  const pin = readMenuEntryPin(disc);
  if (process.argv.includes('--pin')) {
    const out = resolve(import.meta.dirname, 'test/menuEntryCommands.pinned.json');
    writeFileSync(out, `${JSON.stringify(pin, null, 1)}\n`);
    console.log(`wrote ${out}`);
  } else {
    for (const d of pin.dialogs) {
      console.log(`== ${d.name}`);
      for (const b of d.bindings) console.log(`  bind ${b}`);
      for (const [a, c] of Object.entries(d.animations)) console.log(`  anim ${a}: ${c.join(' ') || '-'}`);
      for (const [a, c] of Object.entries(d.library)) console.log(`  library ${a}: ${c.join(' ') || '-'}`);
    }
    console.log(`names (${pin.names.length}): ${pin.names.join(' ')}`);
  }
}
