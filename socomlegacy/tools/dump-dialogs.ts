/**
 * The dialog inventory and flow graph off the disc (PLAT-06; web research 96 is written from its output).
 *
 *   SOCOM_DISC=C:/Projects/socom_pc/game/disc npx tsx tools/dump-dialogs.ts                 # the whole report
 *   SOCOM_DISC=... npx tsx tools/dump-dialogs.ts --json                                       # the same as JSON
 *   SOCOM_DISC=... npx tsx tools/dump-dialogs.ts --dialog dlgMenu.rdr [--readerx] [--tree]    # one dialog, its bindings
 *                                                                                             # resolved to commands
 *   SOCOM_DISC=... npx tsx tools/dump-dialogs.ts --msg-users 395 460                         # which dialogs name UIMnLOC
 *                                                                                             # ids 395..460 (ids only)
 *   SOCOM_DISC=... npx tsx tools/dump-dialogs.ts --set 'UIMemCardAnim\.rdr'                 # sets by name (a regex):
 *                                                                                             # animations and names
 *   SOCOM_PC_ROOT=... SOCOM_DISC=... npx tsx tools/dump-dialogs.ts --pin                     # rewrite the test's pin
 *
 * Reads `RUN/UI/READERC.ZAR`, `RUN/UI/READERX.ZAR`, `RUN/UIZANIM.ZAR`, `RUN/EXTZANIM.ZAR`, `RUN/MPZANIM.ZAR`, the
 * `RUN/MOVIES` listing and the ELF `socom2_game.elf` (the disc tree's root; `SOCOM_DISC`, else
 * `$SOCOM_PC_ROOT/game/disc`) with the repository's readers: `Zar`, `parseRdr` (`@s2u/archive`), `parseAnimSets`,
 * `decodeUiProgram`, `parseUiLayout` (`@s2u/scene`), `./elfImage`. Prints names and counts only (and, for `--dialog`,
 * the layout's own positions) -- no bytes: the disc is read-only ground truth outside this tree (W6.R8).
 * `test/dialogInventoryDisc.test.ts` holds what it prints.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseRdr, Zar, type RdrNode } from '@s2u/archive';
import { MSG_NAME, parseAnimSets, parseLocTable, parseUiLayout, UIMNLOC } from '@s2u/scene';
import {
  addCounts, animFacts, bindingsOf, buildGraph, classify, DIALOG_ARCHIVES, dialogPairs, everyTypeValue, locSummary, memberTally,
  missingMovies, persistentValvesOf, resolveSets, screenRoot, scriptLibrary, SET_ARCHIVES, setSlots, sortCounts, stringsOf, valveNames, valveValues, widgetTally,
  type DialogFacts, type LocSummary, type FlowGraph, type MemberTally, type SetFacts, type SetSlots, type WidgetTally,
} from './dialogInventory';
import { ElfImage, findStrings, readBindingTable } from './elfImage';

/** The UI binding table (web research 95 §1.2): `{id, name, fn, fn2}` rows matched by `FUN_00198b80`. */
export const BINDING_TABLE_VA = 0x3dd4d0;
/** The start dialog's name in the ELF (`dlgIntroScreen.rdr`), the screen boot opens on (research 96 §3). */
export const START_DIALOG_VA = 0x3e1870;
/** `FUN_00365a00`'s strcmp/strstr operands (D:L262375-262460), read from the ELF. */
export const SWITCH_HANDLER_STRINGS = [0x3f8c38, 0x3f8c40, 0x3f8c50, 0x3f8c68, 0x3f8c78, 0x3f8c88, 0x3f8c98] as const;
/** The main menu (research 96 §3). */
export const MENU_DIALOG = 'dlgMenu.rdr';

export interface Inventory {
  readerc: { members: string[]; tally: MemberTally };
  readerx: { members: string[] };
  sets: Record<string, SetSlots & { animations: Record<string, number>; names: Record<string, number> }>;
  widgets: {
    perDialog: Record<string, WidgetTally>;
    /** Every TYPE value by where it stands, over READERC's dlg* members (`typeSites`). */
    sites: Record<string, Record<string, number>>;
    /** `parseUiLayout`'s objects + controls by TYPE, over the same. */
    layoutTypes: Record<string, number>;
    /** Every TYPE key counted as it stands, READERC's dlg* members and its Common_* includes apart (the scratch's way). */
    everyType: { dialogs: Record<string, number>; common: Record<string, number> };
  };
  graph: FlowGraph;
  pairs: string[];
  classes: Record<string, string>;
  /** Movies the dialogs and their sets name that `RUN/MOVIES` does not hold. */
  missingMovies: string[];
  elf: {
    start: string;
    bindingRows: number; bindingNames: string[]; terminator: { index: number; id: number; fn: number; fn2: number };
    maxId: number; missingIds: number[]; withFn2: number;
    codeDialogs: { va: number; text: string }[];
    switchStrings: string[];
  } | null;
}

/** The disc tree's root: `SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`; null when neither holds `RUN/UI/READERC.ZAR`. */
export function discRoot(env: NodeJS.ProcessEnv = process.env): string | null {
  const candidates = [env.SOCOM_DISC, env.SOCOM_PC_ROOT ? resolve(env.SOCOM_PC_ROOT, 'game/disc') : undefined];
  for (const c of candidates) if (c && existsSync(resolve(c, DIALOG_ARCHIVES[0]))) return c;
  return null;
}

const readZar = (disc: string, p: string): Zar => Zar.parse(new Uint8Array(readFileSync(resolve(disc, p))));

function listFiles(dir: string, base: string = dir, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) listFiles(p, base, out);
    else out.push(relative(base, p).replace(/\\/g, '/'));
  }
  return out;
}

/** Every named set of the three zAnim archives as the graph takes them, and the archives' slot counts. */
export function readSets(disc: string): { sets: SetFacts[]; slots: Inventory['sets'] } {
  const sets: SetFacts[] = [];
  const slots: Inventory['sets'] = {};
  for (const archive of SET_ARCHIVES) {
    const a = parseAnimSets(readZar(disc, archive));
    const s = setSlots(a.sets);
    const animations: Record<string, number> = {}, names: Record<string, number> = {};
    for (const set of a.sets) {
      if (!s.named.includes(set.name)) continue;
      animations[set.name] = set.anims.length;
      names[set.name] = set.names.length;
      sets.push({ archive, name: set.name, anims: set.anims.map(animFacts) });
    }
    slots[archive] = { ...s, animations, names };
  }
  return { sets, slots };
}

export function readInventory(disc: string): Inventory {
  const dialogs: DialogFacts[] = [];
  const members: Record<string, string[]> = {};
  const perDialog: Record<string, WidgetTally> = {};
  const sites: Record<string, Record<string, number>> = {};
  const layoutTypes: Record<string, number> = {};
  const everyDialogs: Record<string, number> = {}, everyCommon: Record<string, number> = {};
  for (const archive of DIALOG_ARCHIVES) {
    const z = readZar(disc, archive);
    members[archive] = z.root.children.map((k) => k.name);
    for (const k of z.root.children) {
      const root = parseRdr(z.data(k));
      if (archive === DIALOG_ARCHIVES[0] && /^Common_/i.test(k.name)) addCounts(everyCommon, everyTypeValue(root));
      if (!/^dlg/i.test(k.name)) continue;
      dialogs.push({ archive, name: k.name, scripts: scriptLibrary(root), bindings: bindingsOf(root), strings: stringsOf(root) });
      if (archive !== DIALOG_ARCHIVES[0]) continue;
      // PLAT-05's tallies are READERC's dlg* members (01-platform.md, PLAT-05 (a)).
      const t = widgetTally(root);
      perDialog[k.name] = t;
      addCounts(layoutTypes, t.types);
      for (const [site, c] of Object.entries(t.sites)) addCounts(sites[site] ??= {}, c);
      addCounts(everyDialogs, everyTypeValue(root));
    }
  }
  const { sets, slots } = readSets(disc);

  const elfPath = resolve(disc, 'socom2_game.elf');
  let elf: Inventory['elf'] = null;
  let codeNames: string[] = [];
  let start = 'dlgIntroScreen.rdr';
  if (existsSync(elfPath)) {
    const image = new ElfImage(new Uint8Array(readFileSync(elfPath)));
    const table = readBindingTable(image, BINDING_TABLE_VA);
    const ids = new Set(table.rows.map((r) => r.id));
    const maxId = Math.max(...ids);
    const codeDialogs = findStrings(image, /^dlg\w*(\.rdr)?$/i);
    codeNames = codeDialogs.map((c) => c.text);
    start = image.cstr(START_DIALOG_VA);
    elf = {
      start,
      bindingRows: table.rows.length, bindingNames: table.rows.map((r) => r.name), terminator: table.terminator,
      maxId, missingIds: Array.from({ length: maxId }, (_, i) => i + 1).filter((i) => !ids.has(i)),
      withFn2: table.rows.filter((r) => r.fn2 !== 0).length,
      codeDialogs, switchStrings: SWITCH_HANDLER_STRINGS.map((va) => image.cstr(va)),
    };
  }
  const readerc = dialogs.filter((d) => d.archive === DIALOG_ARCHIVES[0]);
  const graph = buildGraph(readerc, sets, codeNames);
  const movies = existsSync(resolve(disc, 'RUN/MOVIES')) ? listFiles(resolve(disc, 'RUN/MOVIES')).map((f) => `RUN/MOVIES/${f}`) : [];
  return {
    readerc: { members: members[DIALOG_ARCHIVES[0]]!, tally: memberTally(members[DIALOG_ARCHIVES[0]]!) },
    readerx: { members: members[DIALOG_ARCHIVES[1]]! },
    sets: slots,
    widgets: {
      perDialog,
      sites: Object.fromEntries(Object.entries(sites).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => [k, sortCounts(v)])),
      layoutTypes: sortCounts(layoutTypes),
      everyType: { dialogs: sortCounts(everyDialogs), common: sortCounts(everyCommon) },
    },
    graph,
    pairs: dialogPairs(graph, readerc),
    classes: Object.fromEntries(classify(graph, readerc, start, MENU_DIALOG, codeNames)),
    missingMovies: missingMovies(graph, movies),
    elf,
  };
}

/** `RUN/LOCALE/STATES/UIMNLOC.ZAR`'s members and its string table counted (`parseLocTable`; menus row N3). */
export function readLoc(disc: string): { members: { name: string; size: number }[]; summary: LocSummary } {
  const z = readZar(disc, UIMNLOC.archive);
  const key = z.find(UIMNLOC.member);
  if (!key) throw new Error(`${UIMNLOC.archive} has no ${UIMNLOC.member}`);
  return { members: z.root.children.map((k) => ({ name: k.name, size: k.size })), summary: locSummary(parseLocTable(parseRdr(z.data(key)))) };
}

/**
 * The bytes of a card file's `PersistentValves.rdr`, read with the card file reader (`persistentValvesOf`:
 * `tools/cardFile.ts`, R7's dev instrument). Null when the file or the key is not there.
 */
export function cardValves(card: string): Uint8Array | null {
  return existsSync(card) ? persistentValvesOf(new Uint8Array(readFileSync(card))) : null;
}

/** The saved card options row O15 was read from, under `SOCOM_PC_ROOT`. */
export const VALVES_CARD = 'logs/parity/f0/mc0/BASCUS-97275SOCOMII/BASCUS-97275SOCOMII';

/**
 * What `test/dialogInventory.pinned.json` holds: the inventory as names and counts, every list in a stable order.
 * No bytes, no hashes, no caption text.
 */
export function pinnedView(inv: Inventory, loc: ReturnType<typeof readLoc>) {
  const sorted = (xs: Iterable<string>): string[] => [...new Set(xs)].sort();
  return {
    readercMembers: inv.readerc.members,
    readerxMembers: inv.readerx.members,
    sets: inv.sets,
    widgetSites: inv.widgets.sites,
    layoutTypes: inv.widgets.layoutTypes,
    everyType: inv.widgets.everyType,
    perDialog: Object.fromEntries(Object.entries(inv.widgets.perDialog).map(([d, w]) => [d, { objects: w.objects, controls: w.controls, models: w.models, sites: w.sites }])),
    pairs: inv.pairs,
    edges: sorted(inv.graph.edges.map((e) => `${e.from} -> ${e.to} [${e.via}]${e.own ? '' : ' (library)'}`)),
    libraryEdges: sorted(inv.graph.library.map((e) => `${e.archive} ${e.set}/${e.animation} ${e.fn} -> ${e.to}`)),
    dangling: inv.graph.dangling,
    unreferenced: inv.graph.unreferenced,
    missingMovies: inv.missingMovies,
    classes: inv.classes,
    elf: inv.elf && {
      ...inv.elf,
      codeDialogs: inv.elf.codeDialogs.map((c) => `${c.text}@0x${c.va.toString(16)}`),
    },
    loc,
  };
}

const show = (n: RdrNode): string => (typeof n === 'string' ? JSON.stringify(n) : `(${n.map(show).join(' ')})`);

/** One dialog: its layout's head, its objects, every binding with the commands its animation reaches. */
function reportDialog(disc: string, name: string, archive: string): void {
  const z = readZar(disc, archive);
  const key = z.root.children.find((k) => k.name.toLowerCase() === name.toLowerCase());
  if (!key) throw new Error(`${archive} has no ${name}`);
  const root = parseRdr(z.data(key));
  const layout = parseUiLayout(screenRoot(root));
  const t = widgetTally(root);
  console.log(`== ${archive} ${key.name}: ${t.objects} objects, ${t.controls} controls, ${t.models} models; background ${t.background}`);
  console.log(`libraries ${layout.libraries.join(', ')}; background file ${layout.background}; font ${layout.font}; scripts ${layout.scripts.join(', ')}`);
  console.log('TYPE by site:', JSON.stringify(t.sites));
  for (const o of [...layout.objects, ...layout.controls]) {
    console.log(`  ${o.type} ${o.name} (${o.x},${o.y})${o.parent ? ` childof ${o.parent}` : ''}${o.filename ? ` ${o.filename}` : ''}${o.caption ? ` caption ${JSON.stringify(o.caption)}` : ''}${o.uivar ? ` uivar ${o.uivar}` : ''}${o.size ? ` ${o.size.join('x')}` : ''}${o.scale !== null ? ` scale ${o.scale}` : ''}`);
  }
  for (const m of layout.models) console.log(`  MODEL ${m.name} ${m.model} az ${m.azimuth} elev ${m.elev} dist ${m.distance}`);
  const { sets } = readSets(disc);
  const dialog: DialogFacts = { archive, name: key.name, scripts: scriptLibrary(root), bindings: bindingsOf(root), strings: stringsOf(root) };
  const visible = resolveSets(dialog, sets);
  console.log('sets:', visible.map((s) => `${s.archive}:${s.name}(${s.anims.length})`).join(', '));
  const find = (anim: string): string => {
    for (const s of visible) {
      const a = s.anims.find((x) => x.name === anim);
      if (a) return `${s.name}: ${a.commands.map((c) => `${c.fn}(${c.arg})`).join(' ')}${a.calls.length ? ` calls ${a.calls.join(', ')}` : ''}${a.locs.length ? ` locs ${a.locs.join(',')}` : ''}`;
    }
    return '(no set defines it)';
  };
  for (const b of dialog.bindings) console.log(`  ${b.owner} ${b.trigger} -> ${b.animation}${b.argument ? `(${b.argument})` : ''}  ${find(b.animation)}`);
  const own = visible.find((s) => s.name.toLowerCase() === key.name.toLowerCase());
  for (const a of own?.anims ?? []) console.log(`  [${own!.name}] ${a.name}: ${a.commands.map((c) => `${c.fn}(${c.arg})`).join(' ')}${a.calls.length ? ` calls ${a.calls.join(', ')}` : ''}${a.locs.length ? ` locs ${a.locs.join(',')}` : ''}`);
  const msgs = [...new Set(stringsOf(root).map((s) => s.value).filter((v) => MSG_NAME.test(v)))];
  console.log('message ids named by the layout:', msgs.join(' '));
  if (process.argv.includes('--tree')) console.log(show(root));
}

/**
 * Which READERC dialogs name each `UIMnLOC` id from `from` to `to` -- by a layout's `_<id>_..._MSG` string or by a
 * node command of the dialog's own set (`AnimFacts.locs`) -- with each dialog's class. Ids only, no text.
 */
function reportMessageUsers(disc: string, from: number, to: number): void {
  const inv = readInventory(disc);
  const { sets } = readSets(disc);
  const z = readZar(disc, DIALOG_ARCHIVES[0]);
  const users = new Map<number, Set<string>>();
  for (const k of z.root.children) {
    if (!/^dlg/i.test(k.name)) continue;
    const named = new Set<number>();
    for (const s of stringsOf(parseRdr(z.data(k)))) { const m = MSG_NAME.exec(s.value); if (m) named.add(Number(m[1])); }
    const own = sets.find((s) => s.name.toLowerCase() === k.name.toLowerCase());
    for (const a of own?.anims ?? []) for (const l of a.locs) named.add(l);
    for (const id of named) { if (!users.has(id)) users.set(id, new Set()); users.get(id)!.add(k.name); }
  }
  const tally: Record<string, number> = {};
  for (let id = from; id <= to; id++) {
    const u = [...(users.get(id) ?? [])];
    const classes = [...new Set(u.map((d) => inv.classes[d] ?? '?'))].sort().join('+') || 'none';
    tally[classes] = (tally[classes] ?? 0) + 1;
    console.log(`${id}\t${classes}\t${u.join(', ')}`);
  }
  console.log(`${from}-${to} by the classes of the dialogs naming them:`, JSON.stringify(tally));
}

/**
 * The sets of the three zAnim archives whose name matches `pattern` whole (a regular expression, case ignored): each
 * one's animations, its name table (names only) and the bytes its keys hold, summed.
 */
function reportSet(disc: string, pattern: string): void {
  const re = new RegExp(`^(?:${pattern})$`, 'i');
  for (const archive of SET_ARCHIVES) {
    const zar = readZar(disc, archive);
    const keys = zar.find('Anim_Sets')?.children ?? [];
    for (const set of parseAnimSets(zar).sets.filter((s) => s.name !== 'Anim_Set' && re.test(s.name))) {
      let bytes = 0;
      const sum = (k: { size: number; children: readonly { size: number; children: readonly unknown[] }[] }): void => {
        bytes += k.size;
        for (const c of k.children) sum(c as typeof k);
      };
      const key = keys.find((k) => k.name === set.name);
      if (key) sum(key);
      console.log(`== ${archive} ${set.name}: ${set.anims.length} animations, ${set.names.length} names, ${bytes} bytes under its key`);
      console.log('animations:', set.anims.map((x) => x.name).join(' '));
      console.log('names:', set.names.join(' '));
    }
  }
}

function report(inv: Inventory): void {
  const t = inv.readerc.tally;
  console.log(`READERC: ${t.total} members: ${t.dialogs} dlg*, ${t.common} Common_*, other ${t.other.join(', ')}`);
  console.log(`READERX: ${inv.readerx.members.length} members: ${inv.readerx.members.join(', ')}`);
  for (const [a, s] of Object.entries(inv.sets)) console.log(`${a}: ${s.slots} slots, ${s.named.length} named, ${s.empty} empty: ${s.named.map((n) => `${n}(${s.animations[n]} anims, ${s.names[n]} names)`).join(', ')}`);
  console.log('TYPE by site (READERC dlg*):', JSON.stringify(inv.widgets.sites));
  console.log('parseUiLayout objects + controls:', JSON.stringify(inv.widgets.layoutTypes));
  console.log('every TYPE key, dlg*:', JSON.stringify(inv.widgets.everyType.dialogs), 'Common_*:', JSON.stringify(inv.widgets.everyType.common));
  for (const [d, w] of Object.entries(inv.widgets.perDialog)) console.log(`  ${d}: ${w.objects} objects, ${w.controls} controls, ${w.models} models, bg ${w.background}; ${JSON.stringify(w.sites)}`);
  console.log('edges:');
  for (const e of inv.graph.edges) console.log(`  ${e.from} -> ${e.to} (${e.kind}${e.own ? '' : ', library'}) [${e.via}]`);
  console.log('library edges:');
  for (const e of inv.graph.library) console.log(`  ${e.archive} ${e.set}/${e.animation} ${e.fn} -> ${e.to}`);
  console.log('dangling:', inv.graph.dangling.join(', '));
  console.log('unreferenced:', inv.graph.unreferenced.join(', '));
  console.log('missing movies:', inv.missingMovies.join(', '));
  console.log('classes:');
  for (const [d, c] of Object.entries(inv.classes)) console.log(`  ${c}\t${d}`);
  if (inv.elf) {
    const e = inv.elf;
    console.log(`start ${e.start}; binding table: ${e.bindingRows} named rows, terminator row ${e.terminator.index} ${JSON.stringify(e.terminator)}, ids 1..${e.maxId} missing ${e.missingIds.join(',')}, ${e.withFn2} with fn2`);
    console.log('code dialogs:', e.codeDialogs.map((c) => `${c.text}@0x${c.va.toString(16)}`).join(', '));
    console.log('switch handler strings:', e.switchStrings.join(', '));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const disc = discRoot();
  if (!disc) throw new Error('set SOCOM_DISC (or SOCOM_PC_ROOT) to the disc tree holding RUN/UI/READERC.ZAR');
  const at = process.argv.indexOf('--dialog');
  const msg = process.argv.indexOf('--msg-users');
  const sets = process.argv.indexOf('--set');
  if (sets > 0) reportSet(disc, process.argv[sets + 1] ?? '');
  else if (msg > 0) reportMessageUsers(disc, Number(process.argv[msg + 1]), Number(process.argv[msg + 2] ?? process.argv[msg + 1]));
  else if (at > 0) reportDialog(disc, process.argv[at + 1] ?? '', process.argv.includes('--readerx') ? DIALOG_ARCHIVES[1] : DIALOG_ARCHIVES[0]);
  else if (process.argv.includes('--pin')) {
    // The pin `test/dialogInventoryDisc.test.ts` holds the disc to; the card's valve names need SOCOM_PC_ROOT.
    const pcRoot = process.env.SOCOM_PC_ROOT;
    const bytes = pcRoot ? cardValves(resolve(pcRoot, VALVES_CARD)) : null;
    if (!bytes) throw new Error(`--pin needs SOCOM_PC_ROOT and ${VALVES_CARD}`);
    const valves = parseRdr(bytes);
    // OPT-02 (research 229 §2): the card's values beside its names.
    const view = { ...pinnedView(readInventory(disc), readLoc(disc)), persistentValves: valveNames(valves), persistentValveValues: valveValues(valves) };
    const out = resolve(import.meta.dirname, 'test/dialogInventory.pinned.json');
    writeFileSync(out, `${JSON.stringify(view, null, 1)}\n`);
    console.log(`wrote ${out}`);
  } else if (process.argv.includes('--json')) console.log(JSON.stringify(readInventory(disc), null, 1));
  else report(readInventory(disc));
}
