/**
 * The online dialogs off the disc (ONL-33, PLAT-06's online chapter; web research 128 is written from its output).
 *
 *   SOCOM_DISC=C:/Projects/socom_pc/game/disc npx tsx tools/dump-online-dialogs.ts                 # every chapter
 *   SOCOM_DISC=... npx tsx tools/dump-online-dialogs.ts --dialog dlgNetLogin.rdr                     # one chapter
 *   SOCOM_DISC=... npx tsx tools/dump-online-dialogs.ts --pin                                        # rewrite the pin
 *
 * Reads `RUN/UI/READERC.ZAR` / `READERX.ZAR` (the layouts) and the three zAnim archives (the sets) with the
 * repository's readers (`Zar`, `parseRdr`, `parseAnimSets`, `decodeUiProgram`, `parseUiLayout`) and `./dump-dialogs`'s
 * set reader; prints and pins names, ids, counts and the scripts' ops as decoded -- no bytes, no caption text (RS.R8,
 * W6.R8). `test/onlineDialogsDisc.test.ts` holds the pin to the disc; `test/onlineDialogs.test.ts` holds the path's
 * edges from the pin in CI.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseRdr, Zar } from '@s2u/archive';
import { decodeUiProgram, parseAnimSets } from '@s2u/scene';
import { bindingsOf, DIALOG_ARCHIVES, lower, resolveSets, scriptLibrary, SET_ARCHIVES, stringsOf, type DialogFacts } from './dialogInventory';
import { discRoot, readSets } from './dump-dialogs';
import { chapterPairs, dialogChapter, mpRooms, ONLINE_DIALOGS, ONLINE_READERX, type ChapterSet, type DialogChapter, type MpRoom } from './onlineDialogs';

/** The one member of the chapter that is a table, not a layout. */
export const MP_ROOMS = 'mp_rooms.rdr';

const readZar = (disc: string, p: string): Zar => Zar.parse(new Uint8Array(readFileSync(resolve(disc, p))));

/** Every named set of the three zAnim archives, decoded for listing. */
export function readChapterSets(disc: string): ChapterSet[] {
  const out: ChapterSet[] = [];
  for (const archive of SET_ARCHIVES) {
    for (const set of parseAnimSets(readZar(disc, archive)).sets) {
      if (set.name === 'Anim_Set') continue;
      out.push({ archive, name: set.name, anims: set.anims.map((anim) => ({ anim, program: decodeUiProgram(anim) })) });
    }
  }
  return out;
}

/** `mp_rooms.rdr` of READERC, read as its table (`mpRooms`). */
export function readMpRooms(disc: string): MpRoom[] {
  const z = readZar(disc, DIALOG_ARCHIVES[0]);
  const key = z.root.children.find((k) => k.name === MP_ROOMS);
  if (!key) throw new Error(`${DIALOG_ARCHIVES[0]} has no ${MP_ROOMS}`);
  return mpRooms(parseRdr(z.data(key)));
}

/** The chapters of `ONLINE_DIALOGS` (or `only`), in that order; `mp_rooms.rdr`, a table, is `readMpRooms`'s. */
export function readChapters(disc: string, only: readonly string[] = ONLINE_DIALOGS.filter((d) => d !== MP_ROOMS)): DialogChapter[] {
  const { sets: graphSets } = readSets(disc);
  const sets = readChapterSets(disc);
  const zars = Object.fromEntries(DIALOG_ARCHIVES.map((a) => [a, readZar(disc, a)]));
  return only.map((name) => {
    const archive = (ONLINE_READERX as readonly string[]).includes(name) ? DIALOG_ARCHIVES[1] : DIALOG_ARCHIVES[0];
    const z = zars[archive]!;
    const key = z.root.children.find((k) => lower(k.name) === lower(name));
    if (!key) throw new Error(`${archive} has no ${name}`);
    const root = parseRdr(z.data(key));
    const facts: DialogFacts = { archive, name: key.name, scripts: scriptLibrary(root), bindings: bindingsOf(root), strings: stringsOf(root) };
    const visibleFacts = resolveSets(facts, graphSets);
    const visible = visibleFacts.map((f) => sets.find((s) => s.archive === f.archive && s.name === f.name)!);
    return dialogChapter(root, facts, visible, graphSets);
  });
}

/**
 * What `test/onlineDialogs.pinned.json` holds: the dialogs in order, their dialog pairs, `mp_rooms.rdr`'s table, each
 * chapter with its library animations by key only, and the library listings once, by key (the same `UIanim.rdr` and
 * `UIMemCardAnim.rdr` animations serve most of the chapters).
 */
export function pinnedChapters(chapters: readonly DialogChapter[], rooms: readonly MpRoom[]) {
  const library: Record<string, string[]> = {};
  for (const c of chapters) for (const [k, v] of Object.entries(c.library)) library[k] = v;
  return {
    dialogs: chapters.map((c) => c.name), pairs: chapterPairs(chapters),
    mpRooms: rooms.map((r) => ({ name: r.name, limit: r.limit, games: r.games.map((g) => `${g.name} | ff ${g.friendlyFire} | max ${g.maxPlayers} | ${g.missions.join(' ')}`) })),
    chapters: chapters.map((c) => ({
      ...c,
      widgets: c.widgets.map(widgetLine),
      bindings: c.bindings.map((b) => `${b.owner} ${b.trigger} -> ${b.animation}${b.argument !== null ? `(${b.argument})` : ''} [${b.set ?? 'none'}]`),
      library: Object.keys(c.library),
    })),
    library: Object.fromEntries(Object.entries(library).sort((a, b) => (a[0] < b[0] ? -1 : 1))),
  };
}

/** A widget as one line: `TYPE name [childof P] [caption] [uivar V] [file F]`. */
export const widgetLine = (w: DialogChapter['widgets'][number]): string =>
  `${w.type} ${w.name}${w.parent ? ` childof ${w.parent}` : ''}${w.caption ? ` ${w.caption}` : ''}${w.uivar ? ` uivar ${w.uivar}` : ''}${w.file ? ` file ${w.file}` : ''}`;

function report(c: DialogChapter): void {
  console.log(`== ${c.archive} ${c.name}; background ${c.background}; scripts ${c.scripts.join(', ')}; own set ${c.ownSet}`);
  for (const w of c.widgets) console.log(`  ${widgetLine(w)}`);
  for (const b of c.bindings) console.log(`  bind ${b.owner} ${b.trigger} -> ${b.animation}${b.argument ? `(${b.argument})` : ''} [${b.set ?? 'none'}]`);
  for (const [a, lines] of Object.entries(c.animations)) { console.log(`  anim ${a}:`); for (const l of lines) console.log(`      ${l}`); }
  for (const [a, lines] of Object.entries(c.library)) { console.log(`  library ${a}:`); for (const l of lines) console.log(`      ${l}`); }
  console.log('  edges:', c.edges.join(' | '));
  console.log('  commands:', c.commands.join(', '));
  console.log('  uivars:', c.uivars.join(', '), '; valves:', c.valves.join(', '), '; sounds:', c.sounds.join(', '));
  console.log('  locs:', c.locs.join(','));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const disc = discRoot();
  if (!disc) throw new Error('set SOCOM_DISC (or SOCOM_PC_ROOT) to the disc tree holding RUN/UI/READERC.ZAR');
  const at = process.argv.indexOf('--dialog');
  if (process.argv.includes('--pin')) {
    const out = resolve(import.meta.dirname, 'test/onlineDialogs.pinned.json');
    writeFileSync(out, `${JSON.stringify(pinnedChapters(readChapters(disc), readMpRooms(disc)), null, 1)}\n`);
    console.log(`wrote ${out}`);
  } else if (process.argv.includes('--rooms')) console.log(JSON.stringify(readMpRooms(disc)));
  else for (const c of readChapters(disc, at > 0 ? [process.argv[at + 1] ?? ''] : undefined)) report(c);
}
