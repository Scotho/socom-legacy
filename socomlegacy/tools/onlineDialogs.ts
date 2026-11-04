import type { RdrNode } from '@s2u/archive';
import { MSG_NAME, parseUiLayout, ZANIM_COMMAND_NAMES, type UiOp, type UiToken, type ZAnimAnimation } from '@s2u/scene';
import { uiCommandKey, uiCommandRowByKey } from '@s2u/ui';
import { buildGraph, screenRoot, stringsOf, type Binding, type DialogFacts, type SetFacts } from './dialogInventory';

/**
 * The online dialogs read from the disc (ONL-33, PLAT-06's online chapter; web research 128), pure: each online
 * dialog's layout -- its objects and controls in order, their captions and UI variables, every binding -- and the
 * scripts of its zAnim set listed op by op (`decodeUiProgram` of `@s2u/scene`), the library animations its bindings
 * reach, and what all of it names: bound functions (with their row's function in the UI command table at 0x3dd4d0,
 * research 107), valves, UI variables, sounds, `UIMnLOC` ids and the dialogs it switches to. The disc is read by
 * `./dump-online-dialogs.ts`; the result is pinned in `test/onlineDialogs.pinned.json` and re-derived from the disc by
 * `test/onlineDialogsDisc.test.ts`; this module touches no file, so its rules are unit-tested on made-up input
 * (`test/onlineDialogs.test.ts`).
 */

/**
 * The path from the main menu to the SOCOM II ONLINE menu, in the order the owner's target names it (2026-10-02,
 * OT plan): ONLINE -> `dlgMPswitch` -> `dlgNetLogin` -> `dlgNetAuthenticate` -> `dlgNetServerSelect` ->
 * `dlgNetPlayerName` -> `dlgNetConnect` -> `dlgUsagePolicy` -> `dlgWorldOfSOCOM`.
 */
export const ONLINE_PATH = [
  'dlgMPswitch.rdr', 'dlgNetLogin.rdr', 'dlgNetAuthenticate.rdr', 'dlgNetServerSelect.rdr', 'dlgNetPlayerName.rdr',
  'dlgNetConnect.rdr', 'dlgUsagePolicy.rdr', 'dlgWorldOfSOCOM.rdr',
] as const;

/** From the online menu to the match: the briefing rooms, CREATE GAME, the game lobby, the loading screen. */
export const MATCH_PATH = ['mp_rooms.rdr', 'dlgMPBriefingRoom.rdr', 'dlgCreateGame.rdr', 'dlgGameLobby.rdr', 'dlgLoad.rdr'] as const;

/** The rest of the segment's fact N1 (`05-online-front-end.md`): READERC's other online and shared dialogs. */
export const ONLINE_REST = [
  'dlgOnlineFilters.rdr', 'dlgOnlineOptions.rdr', 'dlgSetSOP.rdr', 'dlgSetTaunts.rdr', 'dlgFriendList.rdr',
  'dlgIgnoreList.rdr', 'dlgCreateClan.rdr', 'dlgManageRoster.rdr', 'dlgManageRosterLeader.rdr', 'dlgInvitedPlayers.rdr',
  'dlgRespondToInvites.rdr', 'dlgLadderLobby.rdr', 'dlgClanLadderLobby.rdr', 'dlgNetError.rdr', 'dlgNetAbort.rdr',
  'dlgNetAbandoned.rdr', 'dlgNetBanned.rdr', 'dlgDownloadPatch.rdr', 'dlgReturnFromNTGUI2.rdr', 'dlgAfterErrorReboot.rdr',
  'dlgAfterReboot.rdr',
] as const;

/** N1's `READERX.ZAR` members: the round and final screens (their sets are in `MPZANIM.ZAR`, N2). */
export const ONLINE_READERX = ['dlgMultiplayerRound.rdr', 'dlgMultiplayerFinal.rdr', 'dlgMultiplayerFinalReally.rdr'] as const;

/** Every dialog of the chapter, in the order the chapter takes them. */
export const ONLINE_DIALOGS: readonly string[] = [...ONLINE_PATH, ...MATCH_PATH, ...ONLINE_REST, ...ONLINE_READERX];

// ---------------------------------------------------------------------------------------------------------------------
// A script, listed.

const num = (x: number): string => String(Math.round(x * 1000) / 1000);
const nameAt = (names: readonly string[], i: number): string => names[i] ?? `#${i}`;
const u16 = (b: readonly number[], o: number): number => (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);
const s16 = (b: readonly number[], o: number): number => { const v = u16(b, o); return v >= 0x8000 ? v - 0x10000 : v; };
const i32 = (b: readonly number[], o: number): number => (u16(b, o) | (u16(b, o + 2) << 16)) | 0;

/**
 * A `POPUP` record (the 220 bytes past the command's +0x10, `UiCommand.extra`; `FUN_0036da20` D:L266787-267160,
 * research 118 §2) as the chapter needs it: the text (+2 an id, else the name at +0), whether TRIANGLE answers (+64),
 * whether it stays open on CROSS (+65), and with buttons (+66) the answer valve (+67) and each present button's label
 * (+22 an id, else the name at +20; a width of 0 at +12 is no button).
 */
export function popupLine(extra: readonly number[], names: readonly string[]): string {
  const text = s16(extra, 2);
  const parts = [`POPUP ${text !== 0 ? `#${text}` : nameOrText(nameAt(names, extra[0] ?? 0))}`];
  if (extra[66]) {
    const labels: string[] = [];
    for (const b of [68, 144]) {
      if (i32(extra, b + 12) === 0) continue;
      const id = s16(extra, b + 22);
      labels.push(id !== 0 ? `#${id}` : nameOrText(nameAt(names, extra[b + 20] ?? 0)));
    }
    parts.push(`buttons ${labels.join('/') || 'none'} -> ${nameAt(names, extra[67] ?? 0)}`);
  }
  if (extra[64]) parts.push('TRIANGLE');
  if (extra[65]) parts.push('keep');
  return parts.join(' ');
}

/**
 * A name as the pin keeps it: an identifier-like name (a valve, a UI variable, a dialog, a file, `mc0:`, `3.0`, `$1`) as it
 * stands; anything else -- a literal caption or popup text the script spells instead of a `UIMnLOC` id -- as
 * `<text N>`, its length only (research 96's rule: names, ids and counts, no caption text).
 */
export function nameOrText(s: string): string {
  return /^[A-Za-z0-9_.:\-/$]*$/.test(s) ? s : `<text ${s.length}>`;
}

const operand = (o: number | { valve: string }): string => (typeof o === 'number' ? String(o) : o.valve);
const command = (c: { node: string | null; op: number; fn: string | null; arg: string; loc: number }): string =>
  c.node === null ? `${c.fn}(${nameOrText(c.arg)})` : `${c.node}.op${c.op}(${c.loc > 0 ? `#${c.loc}` : nameOrText(c.arg)})`;

export function tokenText(t: UiToken): string {
  switch (t.t) {
    case 'valve': return `${t.valve} ${t.op} ${operand(t.operand)}`;
    case 'ui': return command(t.command);
    case 'not': return 'NOT';
    case 'and': return 'AND';
    case 'or': return 'OR';
    case 'open': return '(';
    case 'close': return ')';
    default: return t.set === 0 ? ZANIM_COMMAND_NAMES[t.cmd] ?? `cmd${t.cmd}` : `set${t.set}.cmd${t.cmd}`;
  }
}

/** One op as a line, without its indent. */
export function opText(op: UiOp, names: readonly string[]): string {
  switch (op.op) {
    case 'if': return `IF ${op.tokens.map(tokenText).join(' ')}`;
    case 'elseif': return `ELSEIF ${op.tokens.map(tokenText).join(' ')}`;
    case 'else': return 'ELSE';
    case 'endif': return 'ENDIF';
    case 'while': return op.forever ? 'WHILE forever' : `WHILE ${op.tokens.map(tokenText).join(' ')}`;
    case 'endWhile': return 'END_WHILE';
    case 'break': return 'BREAK';
    case 'loop': return `LOOP ${op.count ?? 'forever'}`;
    case 'wait': return `WAIT ${num(op.seconds)}`;
    case 'call': return `CALL ${op.anim}${op.block ? ' (blocking)' : ''}`;
    case 'stopAnimation': return `STOP ${op.anim}`;
    case 'callSequence': return `CALL_SEQUENCE ${op.sequence}`;
    case 'active': return `${op.on ? 'SHOW' : 'HIDE'} ${op.node}`;
    case 'move': return `MOVE ${op.node} ${num(op.seconds)}`;
    case 'opacity': return `OPACITY ${op.node} ${num(op.from)}->${num(op.to)} ${num(op.seconds)}`;
    case 'sound': return `SOUND ${op.sound}`;
    case 'valve': return `VALVE ${op.valve} ${op.operation} ${operand(op.operand)}`;
    case 'ui': return op.command.node === 'POPUP' && op.popup ? popupLine(op.command.extra, names) : command(op.command);
    default: return op.name;
  }
}

/** A sequence's ops as indented lines: two spaces per open `IF` / `WHILE`. */
export function listOps(ops: readonly UiOp[], names: readonly string[]): string[] {
  const out: string[] = [];
  let depth = 0;
  for (const op of ops) {
    if (op.op === 'else' || op.op === 'elseif' || op.op === 'endif' || op.op === 'endWhile') depth = Math.max(0, depth - 1);
    out.push(`${'  '.repeat(depth)}${opText(op, names)}`);
    if (op.op === 'if' || op.op === 'elseif' || op.op === 'else' || op.op === 'while') depth++;
  }
  return out;
}

/** A decoded animation's sequences listed: a `== <name> (<activation>)` head when there is more than one. */
export function listProgram(program: { sequences: readonly { name: string; activation: number; ops: readonly UiOp[] }[] }, names: readonly string[]): string[] {
  const seqs = program.sequences;
  if (seqs.length === 1) return listOps(seqs[0]!.ops, names);
  return seqs.flatMap((s) => [`== ${s.name} (${s.activation})`, ...listOps(s.ops, names).map((l) => `  ${l}`)]);
}

// ---------------------------------------------------------------------------------------------------------------------
// What a listing names.

/** The names a set of listings holds, by kind; each list sorted and unique. */
export interface Named { commands: string[]; valves: string[]; sounds: string[]; locs: number[]; popups: number[] }

/**
 * What the listed ops name: bound functions (`Fn(` with no node), valves (`VALVE` and condition tokens), sounds, the
 * `UIMnLOC` ids node commands and popups show. Read from the ops, not the lines.
 */
export function namedBy(ops: readonly UiOp[]): Named {
  const commands = new Set<string>(), valves = new Set<string>(), sounds = new Set<string>(), locs = new Set<number>(), popups = new Set<number>();
  const cmd = (c: { node: string | null; fn: string | null; loc: number; extra: number[] }): void => {
    if (c.node === null && c.fn) commands.add(c.fn);
    else if (c.node !== null && c.loc > 0) locs.add(c.loc);
  };
  const tok = (t: UiToken): void => {
    if (t.t === 'valve') { valves.add(t.valve); if (typeof t.operand !== 'number') valves.add(t.operand.valve); }
    if (t.t === 'ui') cmd(t.command);
  };
  for (const op of ops) {
    if (op.op === 'ui') {
      cmd(op.command);
      if (op.popup) { const id = s16(op.command.extra, 2); if (id > 0) popups.add(id); }
    } else if (op.op === 'if' || op.op === 'elseif' || op.op === 'while') op.tokens.forEach(tok);
    else if (op.op === 'valve') { valves.add(op.valve); if (typeof op.operand !== 'number') valves.add(op.operand.valve); }
    else if (op.op === 'sound') sounds.add(op.sound);
  }
  const s = (x: Set<string>): string[] => [...x].sort();
  const n = (x: Set<number>): number[] => [...x].sort((a, b) => a - b);
  return { commands: s(commands), valves: s(valves), sounds: s(sounds), locs: n(locs), popups: n(popups) };
}

/**
 * A bound function with its row in the UI command table (`UI_COMMAND_TABLE`, research 107): `Fn <Row> FUN_<addr>`,
 * keyed as the dispatcher keys it (`uiCommandKey`: `FUN_00198b80`'s ASCII fold, so `SWITCHMENU` is the row
 * `SwitchMenu`); `Fn (no row)` when the table has none (the dispatcher then answers 1, research 107 §3).
 */
export function commandCitation(fn: string): string {
  const row = uiCommandRowByKey(uiCommandKey(fn));
  return row ? `${fn}${row.name !== fn ? ` ${row.name}` : ''} FUN_${row.fn.toString(16).padStart(8, '0')}` : `${fn} (no row)`;
}

// ---------------------------------------------------------------------------------------------------------------------
// One dialog's chapter.

/** One object or control of the layout, in file order: objects, then controls. */
export interface ChapterWidget { name: string; type: string; parent?: string; caption?: string; uivar?: string; file?: string }

/** A binding with the set its animation was found in (null: no visible set defines it -- a no-op). */
export interface ChapterBinding extends Binding { set: string | null }

/** A set's animation as listed: lines per animation, by name, in set order. */
export type Listings = Record<string, string[]>;

export interface DialogChapter {
  archive: string;
  name: string;
  background: string | null;
  scripts: string[];
  widgets: ChapterWidget[];
  bindings: ChapterBinding[];
  /** The dialog's own set (the set named as the dialog), listed; null when it has none. */
  ownSet: string | null;
  animations: Listings;
  /** Library animations the bindings reach (and what those call), `<archive>:<set>/<animation>`, listed. */
  library: Listings;
  /** The dialogs, movies and states the graph's rule finds (`buildGraph`), `<owner> <trigger> <animation> -> <to>`. */
  edges: string[];
  /** Every bound function its own set and the reached library animations name, with its table row. */
  commands: string[];
  /** UI variables: the layout's `UIVAR`s, then the arguments of commands whose name says UI variable. */
  uivars: string[];
  valves: string[];
  sounds: string[];
  /** `UIMnLOC` ids: the layout's `_<id>_..._MSG` strings, node commands' ids and popups' text ids. */
  locs: number[];
}

/** A set as the chapter takes it: its animations decoded, by name, with their name tables. */
export interface ChapterSet { archive: string; name: string; anims: { anim: ZAnimAnimation; program: { sequences: { name: string; activation: number; ops: UiOp[] }[] } }[] }

const lower = (s: string): string => s.toLowerCase();

/** The first set among `visible` (in order) that defines `anim`. */
const defining = (anim: string, visible: readonly ChapterSet[]): ChapterSet | null =>
  visible.find((s) => s.anims.some((a) => a.anim.name === anim)) ?? null;

const callsOf = (ops: readonly UiOp[]): string[] => ops.flatMap((o) => (o.op === 'call' ? [o.anim] : []));

/**
 * The chapter of one dialog: `root` its parsed layout, `facts` its `DialogFacts` (as `dump-dialogs` makes them),
 * `visible` its sets in resolution order (`resolveSets`), `graphSets` the same as `SetFacts` for the edge rule.
 */
export function dialogChapter(root: RdrNode, facts: DialogFacts, visible: readonly ChapterSet[], graphSets: readonly SetFacts[]): DialogChapter {
  const layout = parseUiLayout(screenRoot(root));
  const widgets: ChapterWidget[] = [...layout.objects, ...layout.controls].map((o) => ({
    name: o.name, type: o.type,
    ...(o.parent && o.parent !== o.name ? { parent: o.parent } : {}),
    ...(o.caption !== null && o.caption.trim() !== '' ? { caption: MSG_NAME.test(o.caption) ? o.caption : nameOrText(o.caption) } : {}),
    ...(o.uivar ? { uivar: o.uivar } : {}),
    ...(o.filename ? { file: o.filename } : {}),
  }));
  const bindings: ChapterBinding[] = facts.bindings.map((b) => ({ ...b, set: defining(b.animation, visible)?.name ?? null }));
  const own = visible.find((s) => lower(s.name) === lower(facts.name)) ?? null;
  const animations: Listings = {};
  const ops: UiOp[] = [];
  for (const a of own?.anims ?? []) {
    animations[a.anim.name] = listProgram(a.program, a.anim.names);
    for (const s of a.program.sequences) ops.push(...s.ops);
  }
  // The library animations the bindings reach, and what they call, wherever each is first defined.
  const library: Listings = {};
  const seen = new Set<string>();
  const visit = (anim: string): void => {
    const set = defining(anim, visible);
    if (!set || seen.has(`${set.name}/${anim}`)) return;
    seen.add(`${set.name}/${anim}`);
    const a = set.anims.find((x) => x.anim.name === anim)!;
    const all = a.program.sequences.flatMap((s) => s.ops);
    if (set !== own) { library[`${set.archive}:${set.name}/${anim}`] = listProgram(a.program, a.anim.names); ops.push(...all); }
    for (const c of callsOf(all)) visit(c);
  };
  for (const b of bindings) visit(b.animation);
  for (const a of own?.anims ?? []) for (const s of a.program.sequences) for (const c of callsOf(s.ops)) visit(c);

  const graph = buildGraph([facts], graphSets);
  const edges = [...new Set(graph.edges.map((e) => `${e.via.replace(/^(binding|script|layout) /, '')} -> ${e.to}${e.own ? '' : ' (library)'}`))].sort();
  const named = namedBy(ops);
  const layoutLocs = stringsOf(root).flatMap((s) => { const m = MSG_NAME.exec(s.value); return m ? [Number(m[1])] : []; });
  const uivarArgs = new Set<string>();
  for (const op of ops) if (op.op === 'ui' && op.command.node === null && /uivar/i.test(op.command.fn ?? '')) uivarArgs.add(op.command.arg);
  const layoutVars = [...new Set(widgets.flatMap((w) => (w.uivar ? [w.uivar] : [])))];
  return {
    archive: facts.archive, name: facts.name, background: layout.background, scripts: facts.scripts,
    widgets, bindings, ownSet: own?.name ?? null, animations, library, edges,
    commands: named.commands.map(commandCitation),
    uivars: [...layoutVars, ...[...uivarArgs].filter((v) => !layoutVars.includes(v)).sort()],
    valves: named.valves, sounds: named.sounds,
    locs: [...new Set([...layoutLocs, ...named.locs, ...named.popups])].sort((a, b) => a - b),
  };
}

/** One room of `mp_rooms.rdr` and its games (a table, not a layout: it has no `SCREENS`). */
export interface MpRoom { name: string; limit: number; games: { name: string; friendlyFire: number; maxPlayers: number; missions: number[] }[] }

/**
 * `mp_rooms.rdr` read as the table it is: a list of `("ROOMNAME" (name) "LIMIT" (n) "GAMELIST" ((game) ...))` records,
 * each game `("GAMENAME" (name) "FRIENDLYFIRE" (0|1) "MAXPLAYERS" (n) "MISSION_SEQUENCE" (id ...))`. A record missing a
 * key, or a number that is not one, throws.
 */
export function mpRooms(root: RdrNode): MpRoom[] {
  let list: RdrNode = root;
  while (Array.isArray(list) && list.length === 1 && Array.isArray(list[0]) && typeof (list[0] as RdrNode[])[0] !== 'string') list = list[0]!;
  if (!Array.isArray(list)) throw new Error('mp_rooms.rdr is not a list');
  const get = (rec: RdrNode, key: string): RdrNode[] => {
    if (!Array.isArray(rec)) throw new Error(`mp_rooms.rdr: a record is not a list (${key})`);
    const i = rec.indexOf(key);
    const v = i >= 0 ? rec[i + 1] : undefined;
    if (!Array.isArray(v)) throw new Error(`mp_rooms.rdr: no ${key}`);
    return v;
  };
  const str = (rec: RdrNode, key: string): string => { const v = get(rec, key)[0]; if (typeof v !== 'string') throw new Error(`mp_rooms.rdr: ${key} is not a string`); return v; };
  const int = (s: RdrNode | undefined, key: string): number => { if (typeof s !== 'string' || !/^-?\d+$/.test(s)) throw new Error(`mp_rooms.rdr: ${key} ${String(s)} is not a number`); return Number(s); };
  return list.map((room) => ({
    name: str(room, 'ROOMNAME'), limit: int(get(room, 'LIMIT')[0], 'LIMIT'),
    games: get(room, 'GAMELIST').map((g) => ({
      name: str(g, 'GAMENAME'), friendlyFire: int(get(g, 'FRIENDLYFIRE')[0], 'FRIENDLYFIRE'),
      maxPlayers: int(get(g, 'MAXPLAYERS')[0], 'MAXPLAYERS'), missions: get(g, 'MISSION_SEQUENCE').map((m) => int(m, 'MISSION_SEQUENCE')),
    })),
  }));
}

/**
 * The chapter's flow edges as `from -> to` dialog pairs, one per binding edge whose target is a dialog: the pairs the
 * unit test holds for the path (`dlgNetLogin.rdr login_btn BUTTON CROSS proceed_net_login -> dlgNetAuthenticate.rdr`).
 */
export function chapterPairs(chapters: readonly DialogChapter[]): string[] {
  const out = new Set<string>();
  for (const c of chapters) for (const e of c.edges) { const m = / -> (dlg\S+?)(?: \(library\))?$/i.exec(e); if (m) out.add(`${c.name} -> ${m[1]}`); }
  return [...out].sort();
}
