import type { RdrNode } from '@s2u/archive';
import { findSaveKey, readSaveFile } from './cardFile';
import { decodeUiProgram, MSG_NAME, parseUiLayout, type UiCommand, type UiOp, type ZAnimAnimation } from '@s2u/scene';

/**
 * The dialog inventory and its flow graph (PLAT-06; web research 96), pure: what the dialogs of `RUN/UI/READERC.ZAR` /
 * `READERX.ZAR` and the zAnim sets of `RUN/UIZANIM.ZAR` / `EXTZANIM.ZAR` / `MPZANIM.ZAR` name, given as they are read
 * by the repository's readers (`@s2u/archive` `Zar`/`parseRdr`, `@s2u/scene` `parseAnimSets`/`decodeUiProgram`/
 * `parseUiLayout`). The disc is read by `./dump-dialogs.ts`; this module holds no bytes and touches no file, so its
 * rules are unit-tested on made-up dialogs (`test/dialogInventory.test.ts`).
 *
 * Names are matched case-insensitively, as the binding table's names are (`FUN_00198b80`, research 95 §1.2) and as the
 * disc needs: a layout's `SCRIPT_LIBRARY` names `uianim.rdr` for the set `UIanim.rdr`, and the set `dlgSetSop.rdr`
 * belongs to the member `dlgSetSOP.rdr` (research 96 §1).
 */

/** The archives the inventory reads, as the disc spells them. */
export const DIALOG_ARCHIVES = ['RUN/UI/READERC.ZAR', 'RUN/UI/READERX.ZAR'] as const;
export const SET_ARCHIVES = ['RUN/UIZANIM.ZAR', 'RUN/EXTZANIM.ZAR', 'RUN/MPZANIM.ZAR'] as const;
/** The name of an unused slot of `Anim_Sets`: EXTZANIM and MPZANIM fill their 95 slots with it (research 96 §1). */
export const EMPTY_SET_SLOT = 'Anim_Set';
/** The argument a script's command takes from the binding that started it (`UIanim.rdr` `switch_menu` et al.). */
export const INPUT_STRING = 'INPUT_STRING';

/**
 * The `SWITCHMENU` targets that are states, not dialogs: the strings the switch handler `FUN_00365a00`
 * (D:L262375-262460) compares its argument with (`strcmp`, `FUN_00198f18`) before it loads a dialog -- at 0x3f8c38,
 * 0x3f8c40, 0x3f8c50, 0x3f8c68, 0x3f8c78 (the dev-disc test reads them from the ELF).
 */
export const SWITCH_STATES = ['REBOOT', 'LOAD_SCREEN', 'POP_TO_MENU_STATE', 'MENU_SCREEN', 'SHUTDOWN'] as const;

export const lower = (s: string): string => s.toLowerCase();
/** `dlgMenu.rdr` and `dlgmenu` to `dlgmenu`: the key a dialog is matched by. */
export const dialogKey = (s: string): string => lower(s.trim()).replace(/\.rdr$/, '');
/** A name that is a dialog by its spelling: `dlg...`, with or without `.rdr`. */
export const looksLikeDialog = (s: string): boolean => /^dlg\w*(\.rdr)?$/i.test(s.trim());
export const isMovie = (s: string): boolean => /\.pss$/i.test(s.trim());

// ---------------------------------------------------------------------------------------------------------------------
// Members and sets.

/** READERC's members by kind: `dlg*`, `Common_*` (the briefing/AOP includes), the rest by name. */
export interface MemberTally { total: number; dialogs: number; common: number; other: string[] }

export function memberTally(names: readonly string[]): MemberTally {
  const dialogs = names.filter((n) => /^dlg/i.test(n)).length;
  const common = names.filter((n) => /^Common_/i.test(n)).length;
  return { total: names.length, dialogs, common, other: names.filter((n) => !/^dlg/i.test(n) && !/^Common_/i.test(n)) };
}

/** An archive's `Anim_Sets`: its slot count (`Anim_Set_Count`) and the named sets, in order. */
export interface SetSlots { slots: number; named: string[]; empty: number }

export function setSlots(sets: readonly { name: string; anims: readonly unknown[] }[]): SetSlots {
  const named = sets.filter((s) => s.name !== EMPTY_SET_SLOT).map((s) => s.name);
  const empty = sets.filter((s) => s.name === EMPTY_SET_SLOT);
  if (empty.some((s) => s.anims.length !== 0)) throw new Error(`an ${EMPTY_SET_SLOT} slot holds animations`);
  return { slots: sets.length, named, empty: empty.length };
}

// ---------------------------------------------------------------------------------------------------------------------
// One dialog's layout.

/**
 * A list read as a record, `("KEY" (values) "KEY" (values) ...)`: its pairs, each a string followed by a list. A loose
 * token between pairs is passed over, as `rdrGet`'s scan passes it -- `dlgCreateClan.rdr`'s `SCREENS` record carries
 * `:end objects` between `OBJECTS` and `ANIMATIONS` (research 96 §2.3). A list with no pair is not a record.
 */
const pairs = (n: RdrNode): [string, RdrNode[]][] => {
  const out: [string, RdrNode[]][] = [];
  if (!Array.isArray(n)) return out;
  for (let i = 0; i + 1 < n.length; i++) {
    const k = n[i], v = n[i + 1];
    if (typeof k === 'string' && Array.isArray(v)) { out.push([k, v]); i++; }
  }
  return out;
};
const isRecord = (n: RdrNode): boolean => pairs(n).length > 0;
const one = (n: RdrNode | undefined): string | null =>
  typeof n === 'string' ? n : Array.isArray(n) && n.length === 1 && typeof n[0] === 'string' ? n[0] : null;
const field = (rec: RdrNode[], key: string): RdrNode | undefined => pairs(rec).find(([k]) => k === key)?.[1];

/** A layout's binding: `EVENT` / `BUTTON` / `TRIGGER`, the animation it starts, its `ARGUMENT`, and whose it is. */
export interface Binding { owner: string; trigger: string; animation: string; argument: string | null }

/**
 * Every binding of a layout, wherever it stands: the screen's `ANIMATIONS` and each object's or control's (a record
 * with an `ANIMATION` key). The owner is the nearest enclosing record's `NAME`, or `SCREEN`.
 */
export function bindingsOf(root: RdrNode): Binding[] {
  const out: Binding[] = [];
  const walk = (n: RdrNode, owner: string, depth: number): void => {
    if (!Array.isArray(n) || depth > 64) return;
    let here = owner;
    if (isRecord(n)) {
      const name = one(field(n, 'NAME'));
      if (name !== null && field(n, 'TYPE') !== undefined) here = name;
      const animation = one(field(n, 'ANIMATION'));
      if (animation !== null) {
        const kind = ['EVENT', 'BUTTON', 'TRIGGER'].find((k) => field(n, k) !== undefined);
        const trigger = kind ? `${kind} ${one(field(n, kind)) ?? ''}`.trim() : '?';
        out.push({ owner: here, trigger, animation, argument: one(field(n, 'ARGUMENT')) });
      }
    }
    for (const c of n) walk(c, here, depth + 1);
  };
  walk(root, 'SCREEN', 0);
  return out;
}

/**
 * The layout's `SCREENS` record wrapped as `parseUiLayout` takes it. Fourteen dialogs (the twelve `dlg_Brief_*`,
 * `dlg_CharUnlock`, `dlg_WeapUnlock`) close their file with the loose tokens `:end of file` (and `:end of Def's`)
 * beside the record, which `rdrGet`'s one-element unwrap does not look past, so `parseUiLayout` of the parsed root
 * throws "dialog has no SCREENS" (research 96 §2.3). The record is found depth-first here instead; the readers are
 * left as they are (PLAT-05 owns `uiLayout.ts`).
 */
export function screenRoot(root: RdrNode): RdrNode {
  const find = (n: RdrNode, depth: number): RdrNode[] | null => {
    if (!Array.isArray(n) || depth > 8) return null;
    if (n[0] === 'SCREENS') return n;
    for (const c of n) { const hit = find(c, depth + 1); if (hit) return hit; }
    return null;
  };
  const screens = find(root, 0);
  if (!screens) throw new Error('dialog has no SCREENS');
  return [screens];
}

/** The layout's `SCRIPT_LIBRARY`: the sets its bindings resolve in. */
export function scriptLibrary(root: RdrNode): string[] {
  return parseUiLayout(screenRoot(root)).scripts;
}

/** Every string of the tree, with the key it stands under (the nearest record key above it). */
export function stringsOf(root: RdrNode): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  const walk = (n: RdrNode, key: string, depth: number): void => {
    if (depth > 64) return;
    if (typeof n === 'string') { out.push({ key, value: n }); return; }
    if (isRecord(n)) {
      for (let i = 0; i < n.length; i++) {
        const k = n[i]!, v = n[i + 1];
        if (typeof k === 'string' && Array.isArray(v)) { walk(v, k, depth + 1); i++; } else walk(k, key, depth + 1);
      }
      return;
    }
    for (const c of n) walk(c, key, depth + 1);
  };
  walk(root, '', 0);
  return out;
}

/**
 * One layout's counts (`parseUiLayout`): its objects, controls and models, the TYPE tally of its objects and
 * controls, and every `TYPE` value by where it stands (`typeSites`); `background` is the `BACKGROUND`'s type.
 */
export interface WidgetTally {
  objects: number; controls: number; models: number; types: Record<string, number>;
  sites: Record<string, Record<string, number>>; background: string | null;
}

export function widgetTally(root: RdrNode): WidgetTally {
  const layout = parseUiLayout(screenRoot(root));
  const types: Record<string, number> = {};
  for (const o of [...layout.objects, ...layout.controls]) types[o.type] = (types[o.type] ?? 0) + 1;
  const sites = typeSites(root);
  const bg = Object.keys(sites.background ?? {});
  return {
    objects: layout.objects.length, controls: layout.controls.length, models: layout.models.length, types: sortCounts(types),
    sites: Object.fromEntries(Object.entries(sites).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => [k, sortCounts(v)])),
    background: bg.length === 1 ? bg[0]! : null,
  };
}

/**
 * Every `TYPE` value of the tree by where it stands (research 96 §2.3): `widget` -- an object or control (a record
 * with `TYPE` under `OBJECTS` or `CONTROLS`); `subordinate` -- a widget inside another (a `RADIOSTRIP`'s
 * `SUBORDINATES`: the `CHECKBOX`es); `element` -- a `MAPCONTROL`'s `ELEMENTS` (no `NAME`); `background` -- the
 * screen's `BACKGROUND` (`IMAGE` or `MPEG`); `uivar` -- a `UIVAR`'s longevity (`PERMANENT`), not a widget at all;
 * `other:<KEY>` -- anything else, by the key the record stands under.
 */
export function typeSites(root: RdrNode): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  const SITES: Record<string, string> = {
    OBJECTS: 'widget', CONTROLS: 'widget', SUBORDINATES: 'subordinate', ELEMENTS: 'element', BACKGROUND: 'background', UIVAR: 'uivar',
  };
  const walk = (n: RdrNode, key: string, depth: number): void => {
    if (!Array.isArray(n) || depth > 64) return;
    if (isRecord(n)) {
      const type = one(field(n, 'TYPE'));
      if (type !== null) {
        const site = SITES[key] ?? `other:${key}`;
        const tally = (out[site] ??= {});
        tally[type] = (tally[type] ?? 0) + 1;
      }
      for (const [k, v] of pairs(n)) walk(v, k, depth + 1);
      return;
    }
    for (const c of n) walk(c, key, depth + 1);
  };
  walk(root, '', 0);
  return out;
}

/** Every value of every `TYPE` key in the tree -- the objects', the controls' and the `BACKGROUND`'s alike. */
export function everyTypeValue(root: RdrNode): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of stringsOf(root)) if (s.key === 'TYPE') out[s.value] = (out[s.value] ?? 0) + 1;
  return sortCounts(out);
}

/** Counts summed; the keys by count descending, then name. */
export function addCounts(into: Record<string, number>, more: Record<string, number>): Record<string, number> {
  for (const [k, v] of Object.entries(more)) into[k] = (into[k] ?? 0) + v;
  return into;
}
export function sortCounts(c: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(c).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));
}

// ---------------------------------------------------------------------------------------------------------------------
// One set's animations.

/** A bound function a script calls (`ui::UI_COMMAND` with no node), as a command or as an `IF`/`WHILE` token. */
export interface ScriptCommand { fn: string; arg: string }
/**
 * What an animation does that the graph needs: its bound functions, the animations it calls, and the `UIMnLOC` ids
 * its node commands show (a caption's id, a popup's text id; research 95 §1.2).
 */
export interface AnimFacts { name: string; commands: ScriptCommand[]; calls: string[]; locs: number[] }

export function animFacts(anim: ZAnimAnimation): AnimFacts {
  const commands: ScriptCommand[] = [];
  const calls: string[] = [];
  const locs = new Set<number>();
  const take = (c: UiCommand): void => {
    if (c.node === null && c.fn !== null) commands.push({ fn: c.fn, arg: c.arg });
    if (c.node !== null && c.loc > 0) locs.add(c.loc);
  };
  const visit = (op: UiOp): void => {
    if (op.op === 'ui') { take(op.command); if (op.popup && op.popup.text > 0) locs.add(op.popup.text); }
    else if (op.op === 'if' || op.op === 'elseif' || op.op === 'while') for (const t of op.tokens) { if (t.t === 'ui') take(t.command); }
    else if (op.op === 'call') calls.push(op.anim);
  };
  for (const seq of decodeUiProgram(anim).sequences) for (const op of seq.ops) visit(op);
  return { name: anim.name, commands, calls, locs: [...locs].sort((a, b) => a - b) };
}

// ---------------------------------------------------------------------------------------------------------------------
// The graph.

/** A dialog as the graph needs it. */
export interface DialogFacts { archive: string; name: string; scripts: string[]; bindings: Binding[]; strings: { key: string; value: string }[] }
/** A set as the graph needs it. */
export interface SetFacts { archive: string; name: string; anims: AnimFacts[] }

/**
 * An edge: `from` a dialog (its member name) names `to` -- a dialog (as spelled where it is named), a movie, or a
 * switch state. `via` says how: `binding <owner> <trigger> <animation> [<fn>]` (a layout binding whose animation, or
 * its argument, names it; the owner is the control, or `SCREEN`), `script <set>/<animation> <fn>` (the dialog's own
 * set names it outside any binding), or `layout <KEY>` (a string of the layout itself, a `BACKGROUND` movie among
 * them). `own` is false when the naming command was found in a library set (`uianim.rdr`, `UIMemCardAnim.rdr` ...)
 * rather than the dialog's own set or layout: such an edge is real but conditional on state the library tests
 * (`check_then_save_and_leave` returns to whichever screen called it), so the classification does not walk it.
 */
export interface Edge { from: string; to: string; kind: 'dialog' | 'movie' | 'state'; via: string; own: boolean }
/** A library set's own references (`UIanim.rdr`'s `ReturnToWorldOfSOCOM` ...), not given to any one dialog. */
export interface LibraryEdge { set: string; archive: string; animation: string; fn: string; to: string; kind: Edge['kind'] }

export interface FlowGraph {
  edges: Edge[];
  library: LibraryEdge[];
  /** Dialog names an edge points at that no archive holds. */
  dangling: string[];
  /** Members no edge, no library edge and no code string reaches. */
  unreferenced: string[];
}

const targetKind = (s: string): Edge['kind'] | null =>
  isMovie(s) ? 'movie' : (SWITCH_STATES as readonly string[]).includes(s) ? 'state' : looksLikeDialog(s) ? 'dialog' : null;

/**
 * The sets a dialog's bindings resolve in, in order: each `SCRIPT_LIBRARY` name, looked up first in the archive that
 * holds the dialog's own set, then UIZANIM, EXTZANIM, MPZANIM; the first archive holding the name wins.
 * SET_RESOLUTION_READING: the engine's choice of archive for a set two archives both hold (`UIanim.rdr` is in all
 * three, with 19, 38 and 57 animations) was not read; this order is the tool's (research 96 §8, §10).
 */
export function resolveSets(dialog: DialogFacts, sets: readonly SetFacts[]): SetFacts[] {
  const own = sets.find((s) => lower(s.name) === lower(dialog.name));
  const order = own ? [own.archive, ...SET_ARCHIVES.filter((a) => a !== own.archive)] : [...SET_ARCHIVES];
  const out: SetFacts[] = [];
  for (const lib of dialog.scripts) {
    for (const archive of order) {
      const hit = sets.find((s) => s.archive === archive && lower(s.name) === lower(lib));
      if (hit) { out.push(hit); break; }
    }
  }
  return out;
}

/**
 * An animation's bound functions with the set each was found in, its calls followed (the first definition among
 * `sets` wins; a name none defines is a no-op, as `FUN_0025d5c0` makes it, research 95 §1.4).
 */
function reach(name: string, sets: readonly SetFacts[], seen: Set<string> = new Set()): (ScriptCommand & { set: string })[] {
  if (seen.has(lower(name))) return [];
  seen.add(lower(name));
  for (const s of sets) {
    const a = s.anims.find((x) => x.name === name);
    if (a) return [...a.commands.map((c) => ({ ...c, set: s.name })), ...a.calls.flatMap((c) => reach(c, sets, seen))];
  }
  return [];
}

export function buildGraph(dialogs: readonly DialogFacts[], sets: readonly SetFacts[], codeNames: readonly string[] = []): FlowGraph {
  const edges: Edge[] = [];
  const seen = new Set<string>();
  const add = (e: Edge): void => {
    const k = `${e.from}|${e.to}|${e.via}`;
    if (!seen.has(k)) { seen.add(k); edges.push(e); }
  };
  const ownSets = new Set(dialogs.map((d) => lower(d.name)));
  for (const d of dialogs) {
    const visible = resolveSets(d, sets);
    const named = new Set<string>();
    for (const b of d.bindings) {
      const label = `binding ${b.owner} ${b.trigger} ${b.animation}`;
      let consumed = false;
      for (const c of reach(b.animation, visible)) {
        const input = c.arg === INPUT_STRING;
        const to = input ? b.argument : c.arg;
        if (input) consumed = true;
        const kind = to === null ? null : targetKind(to);
        // The argument is the layout's own wherever the command that takes it lives.
        if (to !== null && kind) { add({ from: d.name, to, kind, via: `${label} ${c.fn}`, own: input || lower(c.set) === lower(d.name) }); named.add(lower(to)); }
      }
      if (b.argument !== null && !consumed) {
        const kind = targetKind(b.argument);
        if (kind) { add({ from: d.name, to: b.argument, kind, via: label, own: true }); named.add(lower(b.argument)); }
      }
    }
    // The dialog's own set: what it names outside the bindings followed above.
    const own = visible.find((s) => lower(s.name) === lower(d.name));
    for (const a of own?.anims ?? []) {
      for (const c of a.commands) {
        const kind = targetKind(c.arg);
        if (kind && !named.has(lower(c.arg))) add({ from: d.name, to: c.arg, kind, via: `script ${own!.name}/${a.name} ${c.fn}`, own: true });
      }
    }
    // The layout's own strings: a movie background, a dialog named outside a binding.
    for (const s of d.strings) {
      if (s.key === 'SCRIPT_LIBRARY' || s.key === 'ARGUMENT') continue;
      const kind = targetKind(s.value);
      if (kind && !named.has(lower(s.value)) && dialogKey(s.value) !== dialogKey(d.name)) add({ from: d.name, to: s.value, kind, via: `layout ${s.key}`, own: true });
    }
  }
  const library: LibraryEdge[] = [];
  for (const s of sets) {
    if (ownSets.has(lower(s.name))) continue;
    for (const a of s.anims) {
      for (const c of a.commands) {
        const kind = targetKind(c.arg);
        if (kind) library.push({ set: s.name, archive: s.archive, animation: a.name, fn: c.fn, to: c.arg, kind });
      }
    }
  }
  const members = new Set(dialogs.map((d) => dialogKey(d.name)));
  const dangling = [...new Set([...edges, ...library].filter((e) => e.kind === 'dialog' && !members.has(dialogKey(e.to))).map((e) => e.to))].sort();
  const reached = new Set([...edges, ...library].filter((e) => e.kind === 'dialog').map((e) => dialogKey(e.to)));
  for (const c of codeNames) reached.add(dialogKey(c));
  const unreferenced = [...new Set(dialogs.map((d) => d.name))].filter((n) => /^dlg/i.test(n) && !reached.has(dialogKey(n))).sort();
  return { edges, library, dangling, unreferenced };
}

/**
 * The movies the graph names (dialog edges and library edges) that `discFiles` does not hold, matched without regard
 * to case (`run/movies/common/Tut_11.pss` against `RUN/MOVIES/COMMON/TUT_11.PSS`), as the graph spells them, sorted.
 */
export function missingMovies(graph: FlowGraph, discFiles: readonly string[]): string[] {
  const have = new Set(discFiles.map(lower));
  const named = [...graph.edges, ...graph.library].filter((e) => e.kind === 'movie').map((e) => e.to);
  return [...new Set(named.filter((m) => !have.has(lower(m))))].sort();
}

/** The dialog -> dialog pairs of the graph, deduplicated, `from -> to`, sorted (the dialogs as members spell them). */
export function dialogPairs(graph: FlowGraph, dialogs: readonly DialogFacts[]): string[] {
  const spell = new Map(dialogs.map((d) => [dialogKey(d.name), d.name]));
  const pairs = new Set<string>();
  for (const e of graph.edges) if (e.kind === 'dialog') pairs.add(`${e.from} -> ${spell.get(dialogKey(e.to)) ?? e.to}`);
  return [...pairs].sort();
}

// ---------------------------------------------------------------------------------------------------------------------
// The classification.


/**
 * The main menu's branches: the controls of `dlgMenu.rdr` whose CROSS binding starts one (research 96 §3), with the
 * class each gives, in the classification's order of precedence. LOAD GAME's CROSS opens the `SavedGames` list in
 * place (`MainMenuOnLoad`), whose own CROSS (`LoadGameOnListBox`) does the switching, so the list is part of that
 * branch.
 */
export const MENU_BRANCHES: readonly { controls: readonly string[]; cls: string }[] = [
  { controls: ['multiplayer_button', 'LAN_button'], cls: 'online' },
  { controls: ['new_game_button', 'load_game_button', 'SavedGames'], cls: 'campaign' },
  { controls: ['Extras_button'], cls: 'extras' },
  { controls: ['options_button'], cls: 'options' },
];

/** A binding edge's owner and trigger, read back from its `via` (`binding <owner> <KIND> <NAME> <animation> ...`). */
const viaOf = (via: string): { owner: string; trigger: string } | null => {
  const w = via.split(' ');
  return w[0] === 'binding' && w.length >= 5 ? { owner: w[1]!, trigger: `${w[2]} ${w[3]}` } : null;
};

/**
 * The class of a dialog the executable names as a string (or that only such a dialog reaches). Naming is not switching:
 * most of these names are file names the C side opens, but `dlgHype` and `dlgNetLogin` are only substring-tested
 * against the current dialog's name by the switch handler `FUN_00365a00` (D:L262431-262436; research 96 §3.5).
 */
export const CODE_CLASS = 'code';

/**
 * Each `dlg*` dialog's class, by one rule over the graph (research 96 §3):
 * 1. `boot`: reached from the start dialog by own edges (`Edge.own`) without passing the main menu; `main menu`: the
 *    main menu itself.
 * 2. Each branch of `MENU_BRANCHES` is walked breadth-first by own edges from the dialogs its controls' CROSS bindings
 *    switch to, never into the main menu or a boot dialog. A dialog the online branch reaches is `online` (the
 *    network screens are reached from the campaign's armory only through a TRIANGLE that returns to whichever screen
 *    called it); any other takes the branch that reaches it in the fewest switches, a tie going to the earlier branch.
 * 3. The classes then spread one switch at a time along every edge, library edges included, to dialogs steps 1-2 left
 *    (a briefing's map, the briefing room `uianim.rdr` switches to), a tie going to the earlier branch.
 * 4. `code`: a dialog left that the executable names (`codeNames`), and what only such dialogs reach (the same spread);
 *    `unplaced`: the rest.
 */
export function classify(
  graph: FlowGraph, dialogs: readonly DialogFacts[], start: string, menu: string, codeNames: readonly string[] = [],
  branches: readonly { controls: readonly string[]; cls: string }[] = MENU_BRANCHES,
): Map<string, string> {
  const known = new Set(dialogs.map((d) => dialogKey(d.name)));
  const adjacency = (ownOnly: boolean): Map<string, Set<string>> => {
    const next = new Map<string, Set<string>>();
    for (const e of graph.edges) {
      if (e.kind !== 'dialog' || (ownOnly && !e.own) || !known.has(dialogKey(e.to))) continue;
      const from = dialogKey(e.from);
      if (!next.has(from)) next.set(from, new Set());
      next.get(from)!.add(dialogKey(e.to));
    }
    return next;
  };
  const own = adjacency(true), all = adjacency(false);
  const menuKey = dialogKey(menu);
  const out = new Map<string, string>();

  // Step 1.
  const boot = new Set<string>([dialogKey(start)]);
  for (const queue = [dialogKey(start)]; queue.length;) {
    for (const t of own.get(queue.shift()!) ?? []) if (!boot.has(t) && t !== menuKey) { boot.add(t); queue.push(t); }
  }
  for (const k of boot) out.set(k, 'boot');
  out.set(menuKey, 'main menu');

  // Step 2.
  const depths = branches.map((b) => {
    const firsts = graph.edges.filter((e) => {
      const v = viaOf(e.via);
      return dialogKey(e.from) === menuKey && e.kind === 'dialog' && e.own && v !== null && v.trigger === 'BUTTON CROSS' && b.controls.includes(v.owner);
    }).map((e) => dialogKey(e.to)).filter((k) => known.has(k) && !out.has(k));
    const depth = new Map<string, number>(firsts.map((k) => [k, 1]));
    for (const queue = [...firsts]; queue.length;) {
      const k = queue.shift()!;
      for (const t of own.get(k) ?? []) {
        if (depth.has(t) || out.has(t)) continue;
        depth.set(t, depth.get(k)! + 1);
        queue.push(t);
      }
    }
    return depth;
  });
  const placed = new Map<string, { depth: number; branch: number }>();
  depths.forEach((depth, branch) => {
    for (const [k, d] of depth) {
      const cur = placed.get(k);
      if (!cur || (cur.branch !== 0 && (branch === 0 || d < cur.depth))) placed.set(k, { depth: d, branch });
    }
  });
  for (const [k, v] of placed) out.set(k, branches[v.branch]!.cls);

  // Steps 3 and 4: a class spreads along every edge, one switch at a time; a tie goes to the lower rank.
  const rank = (c: string): number => { const i = branches.findIndex((b) => b.cls === c); return i < 0 ? branches.length : i; };
  const spread = (from: string[]): void => {
    for (let frontier = from; frontier.length;) {
      const found = new Map<string, string>();
      for (const k of frontier) {
        for (const t of all.get(k) ?? []) {
          if (out.has(t)) continue;
          const c = out.get(k)!, cur = found.get(t);
          if (cur === undefined || rank(c) < rank(cur)) found.set(t, c);
        }
      }
      for (const [k, c] of found) out.set(k, c);
      frontier = [...found.keys()];
    }
  };
  spread([...placed.keys()]);
  const code = [...new Set(codeNames.map(dialogKey))].filter((k) => known.has(k) && !out.has(k));
  for (const k of code) out.set(k, CODE_CLASS);
  spread(code);

  const result = new Map<string, string>();
  for (const d of dialogs) {
    if (/^dlg/i.test(d.name) && !result.has(d.name)) result.set(d.name, out.get(dialogKey(d.name)) ?? 'unplaced');
  }
  return result;
}

// ---------------------------------------------------------------------------------------------------------------------
// The card's valves and the menu strings: names and counts only.

/**
 * The valve names of a card's `PersistentValves.rdr` (`CValveSaveManager`'s key; options row O15), in file order: a
 * list of `("NAME" (name) "VAL" (value))` records, the values (the player's settings) left out.
 */
export function valveNames(root: RdrNode): string[] {
  let list: RdrNode = root;
  while (Array.isArray(list) && list.length === 1 && Array.isArray(list[0]) && !isRecord(list)) list = list[0]!;
  if (!Array.isArray(list)) throw new Error('PersistentValves.rdr is not a list');
  return list.map((rec, i) => {
    const name = Array.isArray(rec) ? one(field(rec, 'NAME')) : null;
    if (name === null) throw new Error(`PersistentValves.rdr record ${i} has no NAME`);
    return name;
  });
}

/**
 * Each valve's `VAL` of a card's `PersistentValves.rdr`, by name in file order (OPT-02, web research 229 §2): what
 * `CValveSaveManager_UnSerialize` reads back (`FUN_00352960`, the `VAL` field D:L251440). A record whose `VAL` is not a
 * whole number throws.
 */
export function valveValues(root: RdrNode): Record<string, number> {
  let list: RdrNode = root;
  while (Array.isArray(list) && list.length === 1 && Array.isArray(list[0]) && !isRecord(list)) list = list[0]!;
  if (!Array.isArray(list)) throw new Error('PersistentValves.rdr is not a list');
  const names = valveNames(root);
  const out: Record<string, number> = {};
  list.forEach((rec, i) => {
    const name = names[i]!;
    const raw = Array.isArray(rec) ? one(field(rec, 'VAL')) : null;
    const value = raw === null ? NaN : Number(raw);
    if (!Number.isInteger(value)) throw new Error(`PersistentValves.rdr record ${i}: ${name} has no VAL`);
    out[name] = value;
  });
  return out;
}

/** Where `CValveSaveManager` keeps its module in a save file's key tree (`tools/cardFile.ts`; web research 102 §4). */
export const PERSISTENT_VALVES_KEY = 'CSaveModuleList/CValveSaveManager/PersistentValves.rdr';

/**
 * A card file's `PersistentValves.rdr` bytes, through the card file reader (`tools/cardFile.ts`, the dev instrument R7
 * kept of PLAT-27's codec: `unscramble`, the ZAR V2 reader; web research 102), or null when the save has no such key.
 * Replaces the spawned Python reference `tools_py/card_save.py` the first PLAT-06 read went through (research 96 §5).
 */
export function persistentValvesOf(card: Uint8Array): Uint8Array | null {
  return findSaveKey(readSaveFile(card), PERSISTENT_VALVES_KEY)?.data ?? null;
}

/** `UIMnLOC.rdr`'s strings counted: how many, the id range, and how many `MSG_ID`s spell their own id (`MSG_NAME`:
 * `_<id>_..._MSG`, a suffix past `_MSG` included). */
export interface LocSummary { entries: number; minId: number; maxId: number; msgSpellsId: number }

export function locSummary(entries: readonly { id: number; msg: string }[]): LocSummary {
  const ids = entries.map((e) => e.id);
  return {
    entries: entries.length, minId: Math.min(...ids), maxId: Math.max(...ids),
    msgSpellsId: entries.filter((e) => MSG_NAME.exec(e.msg)?.[1] === String(e.id)).length,
  };
}
