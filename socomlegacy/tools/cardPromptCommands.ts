/**
 * The card prompts of the online path, read from the card script set (OPT-05i, the online path's slice of OPT-05a;
 * web research 143).
 *
 *   SOCOM_DISC=C:/Projects/socom_pc/game/disc npx tsx tools/cardPromptCommands.ts          # the list, per animation
 *   SOCOM_DISC=... npx tsx tools/cardPromptCommands.ts --pin                                # rewrite the test's pin
 *
 * The three entries the online dialogs run into `UIMemCardAnim.rdr` (research 128 R128.3, §1, §4.4): the boot chain
 * `UIanim.rdr` `intro_onstart` that `dlgReturnFromNTGUI2`'s `do_onstart` runs before it switches to LOGIN (the slot
 * select of `A_30`), `dlgNetPlayerName.rdr` `memcard_operations` that CONNECT's `register_new_account` runs before
 * `dlgNetConnect` (the "save to the memory card?" prompt of `A_42` and its slot select), and `has_memcard_changed`,
 * which LOGIN's scripts call. From each, every animation a `CALL` reaches -- found in the caller's set first, then in
 * the one set of `RUN/UIZANIM.ZAR` that defines the name (each callee's name is defined once there: the tool throws
 * otherwise) -- is decoded with `decodeUiSet` (`@s2u/scene`) and listed: the bound functions it names (`namedBy`, ops
 * and conditions), the animations it calls, its popups' `UIMnLOC` ids, its ops as lines (`listProgram`: names, ids and
 * counts, no caption text, RS.R8) and every command the decoder does not know (`unknown`: an op or a condition token
 * outside `ZANIM_COMMAND_NAMES`, or a bound function no row of the UI command table answers). The pin is
 * `test/cardPromptCommands.pinned.json`; `test/cardPromptCommandsDisc.test.ts` re-derives it from the disc and
 * `test/cardPromptCommands.test.ts` holds `@s2u/ui`'s `CARD_PROMPT_COMMANDS` and `CARD_PROMPT_ANIMATIONS` to it in CI.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Zar } from '@s2u/archive';
import { decodeUiSet, parseAnimSets, ZANIM_COMMAND_NAMES, type UiOp, type UiProgram, type UiToken } from '@s2u/scene';
import { uiCommandKey, uiCommandRowByKey } from '@s2u/ui';
import { discRoot } from './dump-dialogs';
import { listProgram, namedBy } from './onlineDialogs';

/** The archive the front end's sets come from (research 139 §4: a dialog's `SCRIPT_LIBRARY` sets, loaded from it). */
export const CARD_PROMPT_ARCHIVE = 'RUN/UIZANIM.ZAR';

/** The entries, `<set>/<animation>`, and the online dialog that starts each (research 128). */
export const CARD_PROMPT_ENTRIES = [
  { key: 'UIanim.rdr/intro_onstart', from: 'dlgReturnFromNTGUI2.rdr do_onstart (A_30: the slot select)' },
  { key: 'dlgNetPlayerName.rdr/memcard_operations', from: 'dlgNetPlayerName.rdr register_new_account / leave_player_name_screen (A_42: the save prompt)' },
  { key: 'UIMemCardAnim.rdr/has_memcard_changed', from: 'dlgNetLogin.rdr (its scripts CALL it)' },
] as const;

export interface CardPromptPinAnimation {
  /** `<set>/<animation>`. */
  key: string;
  /** The bound functions it names, sorted and unique, as the scripts spell them. */
  commands: string[];
  /** The animations its `CALL`s reach, as `<set>/<animation>`, in first-call order. */
  calls: string[];
  /** The `UIMnLOC` ids its popups show, sorted. */
  popups: number[];
  /** Its ops as lines (`listProgram`). */
  ops: string[];
  /** What the decoder does not know, as lines; empty is the acceptance. */
  unknown: string[];
}

export interface CardPromptPin {
  entries: string[];
  /** Every animation reached, in the order the walk first meets it (entries first, depth first). */
  animations: CardPromptPinAnimation[];
  /** Every bound function over them, sorted and unique, as spelt. */
  names: string[];
}

interface DecodedSet { name: string; programs: Map<string, UiProgram>; names: Map<string, string[]> }

const isUnknownOpName = (name: string): boolean => /^(cmd \d+|set \d+ cmd \d+)$/.test(name);

/** The ops of an animation the decoder or the UI command table does not know. */
export function unknownOf(program: UiProgram): string[] {
  const out: string[] = [];
  const fn = (f: string | null, node: string | null): void => {
    if (node === null && f !== null && !uiCommandRowByKey(uiCommandKey(f))) out.push(`no row: ${f}`);
  };
  const tok = (t: UiToken): void => {
    if (t.t === 'other' && (t.set !== 0 || ZANIM_COMMAND_NAMES[t.cmd] === undefined)) out.push(`token set ${t.set} cmd ${t.cmd}`);
    if (t.t === 'ui') fn(t.command.fn, t.command.node);
  };
  const op = (o: UiOp): void => {
    if (o.op === 'other' && isUnknownOpName(o.name)) out.push(`op ${o.name}`);
    if (o.op === 'ui') fn(o.command.fn, o.command.node);
    if (o.op === 'if' || o.op === 'elseif' || o.op === 'while') o.tokens.forEach(tok);
  };
  for (const s of program.sequences) s.ops.forEach(op);
  return out;
}

const callsOf = (program: UiProgram): string[] => {
  const out: string[] = [];
  for (const s of program.sequences) for (const o of s.ops) if (o.op === 'call' && !out.includes(o.anim)) out.push(o.anim);
  return out;
};

/** The walk over decoded sets (made-up sets in the CI test, the disc's in the tool). */
export function cardPromptPin(sets: readonly DecodedSet[], entries: readonly string[] = CARD_PROMPT_ENTRIES.map((e) => e.key)): CardPromptPin {
  const bySet = new Map(sets.map((s) => [s.name, s]));
  const resolveCall = (callerSet: string, anim: string): string => {
    if (bySet.get(callerSet)?.programs.has(anim)) return `${callerSet}/${anim}`;
    const found = sets.filter((s) => s.programs.has(anim));
    if (found.length !== 1) throw new Error(`CALL ${anim} from ${callerSet}: defined in ${found.length} sets (${found.map((s) => s.name).join(', ')})`);
    return `${found[0]!.name}/${anim}`;
  };
  const animations: CardPromptPinAnimation[] = [];
  const seen = new Set<string>();
  const visit = (key: string): void => {
    if (seen.has(key)) return;
    seen.add(key);
    const slash = key.indexOf('/');
    const setName = key.slice(0, slash), anim = key.slice(slash + 1);
    const set = bySet.get(setName);
    const program = set?.programs.get(anim);
    if (!set || !program) throw new Error(`no animation ${key}`);
    const ops = program.sequences.flatMap((s) => s.ops);
    const named = namedBy(ops);
    const calls = callsOf(program).map((c) => resolveCall(setName, c));
    animations.push({
      key, commands: named.commands, calls, popups: named.popups,
      ops: listProgram(program, set.names.get(anim) ?? []), unknown: unknownOf(program),
    });
    for (const c of calls) visit(c);
  };
  for (const e of entries) visit(e);
  const names = new Set<string>();
  for (const a of animations) for (const n of a.commands) names.add(n);
  return { entries: [...entries], animations, names: [...names].sort() };
}

/** `RUN/UIZANIM.ZAR`'s named sets, each decoded with `decodeUiSet`. */
export function readCardPromptSets(disc: string): DecodedSet[] {
  const zar = Zar.parse(new Uint8Array(readFileSync(resolve(disc, CARD_PROMPT_ARCHIVE))));
  return parseAnimSets(zar).sets.filter((s) => s.name !== 'Anim_Set').map((s) => ({
    name: s.name, programs: decodeUiSet(s), names: new Map(s.anims.map((a) => [a.name, a.names])),
  }));
}

/** The pin off the disc tree. */
export function readCardPromptPin(disc: string): CardPromptPin {
  return cardPromptPin(readCardPromptSets(disc));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const disc = discRoot();
  if (!disc) throw new Error('set SOCOM_DISC (or SOCOM_PC_ROOT) to the disc tree holding RUN/UIZANIM.ZAR');
  const pin = readCardPromptPin(disc);
  if (process.argv.includes('--pin')) {
    const out = resolve(import.meta.dirname, 'test/cardPromptCommands.pinned.json');
    writeFileSync(out, `${JSON.stringify(pin, null, 1)}\n`);
    console.log(`wrote ${out}`);
  } else {
    for (const a of pin.animations) {
      console.log(`== ${a.key}: ${a.commands.join(' ') || '-'}${a.calls.length ? ` | calls ${a.calls.join(' ')}` : ''}${a.unknown.length ? ` | UNKNOWN ${a.unknown.join('; ')}` : ''}`);
    }
    console.log(`names (${pin.names.length}): ${pin.names.join(' ')}`);
  }
}
