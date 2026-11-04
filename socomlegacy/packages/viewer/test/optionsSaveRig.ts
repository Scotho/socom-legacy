import { expect } from 'vitest';
import { CardSlots, Libmc, MC_CMD, type CardStorage } from '@s2u/card';
import {
  MenuCommands, UiCommandHost, UiVarManager, UniverseList, ValveStore, type DialogPartsHost, type FrontEndMachine, type ZAnimUiCommand,
} from '@s2u/ui';
import { connectPersona } from '../src/personaHost';
import { SAVE_DIR, type McStep } from '../../card/test/mcReplay';

/**
 * OPT-01's rig (web research 228 §3): the page on a fresh card -- its own rows (MENU-01a's `MenuCommands`, OPT-05i's
 * `CardCommands` with the persona module as its `CardConfigFile`, wired by `connectPersona` as the page wires them) over
 * PLAT-26's `Libmc` -- and `save_and_leave`'s YES branch on slot 1 dispatched in the script's order (`UIMemCardAnim.rdr`,
 * the pin `tools/test/cardPromptCommands.pinned.json`), each branch taken on the rows' own answers. The Sync pairs are
 * read off libmc's log sink with `PS2X_MC_TRACE`'s lines on (`[MC] Sync cmd=<n> result=<r>`, MemoryCard.cpp:1587): the
 * recorder issues the `sceMcSync` each `CMemCardIO` method issues after its command (`FUN_001b4390`, e.g. D:L295943),
 * which the page answers through each command's result instead. Shared by `optionsSave.test.ts` and the dev-host
 * `tools/test/optionsSaveDev.test.ts`.
 */

export class MemoryStorage implements CardStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, String(value)); }
}

const cmd = (fn: string, arg = 'NA'): ZAnimUiCommand =>
  ({ anim: 'a', sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x18) });

/** libmc's command methods, by the name `MC_CMD` keys each. */
export const COMMANDS = {
  getInfo: 'GetInfo', open: 'Open', close: 'Close', seek: 'Seek', read: 'Read', write: 'Write', mkdir: 'Mkdir',
  chdir: 'Chdir', getDir: 'GetDir', delete: 'Delete',
} as const;
export type Call = { cmd: string; args: (number | string)[] };
const SYNC = /^\[MC\] Sync cmd=(\d+) result=(-?\d+)$/;

/** The page on a fresh card in slot 1, as `connectPersona` wires it (the options dialog built). */
export function page() {
  const storage = new MemoryStorage();
  const slots = new CardSlots(() => storage, () => {}, { now: () => 5_000 });
  const lines: string[] = [];
  const libmc = new Libmc(slots, { log: (l) => lines.push(l), trace: true, now: () => 9_000 });
  const calls: Call[] = [];
  let recording = false;
  for (const [method, name] of Object.entries(COMMANDS)) {
    const target = libmc as unknown as Record<string, (...a: unknown[]) => unknown>;
    const real = target[method]!.bind(libmc);
    target[method] = (...args: unknown[]) => {
      const out = real(...args);
      if (recording) {
        // A Write's data (our JSON, R7) is not an argument of the step: the handle and the size are.
        calls.push({ cmd: name, args: (method === 'write' ? args.slice(0, 2) : args) as (number | string)[] });
        libmc.sync();
      }
      return out;
    };
  }
  const valves = new ValveStore();
  const events: number[] = [];
  const machine = { valves, shell: () => ({ currentName: 'dlgOptions_Menu.rdr', inputString: () => null, event: (k: number) => { events.push(k); return true; } }) } as unknown as FrontEndMachine;
  const host = new UiCommandHost();
  const uiVars = new UiVarManager();
  const menu = new MenuCommands({ valves: () => valves, uiVars, card: libmc, event: (k) => { events.push(k); } });
  menu.register(host);
  const p = connectPersona(host, { machine: () => machine, uiVars, libmc, menu, universes: new UniverseList({ uiVars }), parts: { current: null } as unknown as DialogPartsHost, log: () => {} });
  /** The rows dispatched, as the pin spells a call: `Name(arg)`. */
  const rows: string[] = [];
  const answer = (fn: string, arg = 'NA'): boolean => {
    rows.push(`${fn}(${arg})`);
    const o = host.dispatch(cmd(fn, arg));
    if (o.kind !== 'table') throw new Error(`${fn}: ${o.kind}`);
    return o.answer;
  };
  /** From here on: the commands, their Sync pairs and the FAILED lines (the session's start -- the persona load -- left out). */
  const start = (): void => { recording = true; calls.length = 0; lines.length = 0; events.length = 0; rows.length = 0; };
  const pairs = () => lines.flatMap((l) => { const m = SYNC.exec(l); return m ? [{ cmd: Number(m[1]), result: Number(m[2]) }] : []; });
  const failed = () => lines.filter((l) => l.startsWith('[mc] command'));
  const free = (): number => { const was = recording; recording = false; const f = libmc.getInfo(0, 0).free; recording = was; return f; };
  const slot1 = slots.slot(1);
  const files = (): Record<string, number> => {
    const r = slot1.list(SAVE_DIR);
    if (!r.ok) throw new Error(JSON.stringify(r.failure));
    return Object.fromEntries(r.value.map((e) => [e.name, e.size]));
  };
  const saveFile = (): { size: number; data: unknown } => {
    const r = slot1.readFile(`${SAVE_DIR}/${SAVE_DIR}`);
    if (!r.ok) throw new Error(JSON.stringify(r.failure));
    return r.value;
  };
  return { libmc, slots, slot1, lines, calls, rows, valves, events, uiVars, ...p, answer, start, pairs, failed, free, files, saveFile };
}
export type Page = ReturnType<typeof page>;

/**
 * `Ensure_MC_Dirs_Fast` (the pin's ops): `IF MC_Exists(..)` `MC_ChDir(..)`; `IF MC_Exists(BASCUS-97275SOCOMII)` the valve
 * `MemcardAlreadyHasData` 1 and `MC_ChDir` into it. Answers the valve.
 */
export function ensureFast(t: Page): boolean {
  if (t.answer('MC_Exists', '..')) t.answer('MC_ChDir', '..');
  if (!t.answer('MC_Exists', SAVE_DIR)) return false;
  t.answer('MC_ChDir', SAVE_DIR);
  return true;
}

/**
 * `Ensure_MC_Dirs` (the pin's ops): the same climb; the folder there -> `MC_ChDir` into it and the valve 1; else
 * `MC_MkDir`, `MC_ChDir`, `MC_CreateIconFiles`, `SaveConfig(BASCUS-97275SOCOMII)`. Answers the valve.
 */
export function ensureDirs(t: Page): boolean {
  if (t.answer('MC_Exists', '..')) t.answer('MC_ChDir', '..');
  if (t.answer('MC_Exists', SAVE_DIR)) { t.answer('MC_ChDir', SAVE_DIR); return true; }
  t.answer('MC_MkDir', SAVE_DIR);
  t.answer('MC_ChDir', SAVE_DIR);
  t.answer('MC_CreateIconFiles');
  expect(t.answer('SaveConfig', SAVE_DIR)).toBe(true);
  return false;
}

/**
 * `save_and_leave` after YES (#831) and slot 1 (#830), the pin's ops in order, on a present, formatted card with room:
 * every other branch is a parked card state (OT.R8; OPT-05b..g) and throws here. `AskToOverwrite` (#857) is answered
 * YES after `polls` of its loop's `IsMemCardInserted`. Answers whether the overwrite prompt was shown.
 */
export function saveAndLeave(t: Page, polls = 1): boolean {
  t.answer('MC_ChPort', '0');                                      // choose_memcard_slot_cancellable: slot 1
  if (!t.answer('IsMemCardInserted')) throw new Error('CannotSaveNoMemcard (OPT-05b)');
  const unformatted = !t.answer('IsMemCardFormatted');
  const inserted = t.answer('IsMemCardInserted');                  // every operand runs (FUN_0025e960 D:L108389)
  if (unformatted && inserted) throw new Error('AskToFormat (OPT-05c)');
  ensureFast(t);
  if (!t.answer('IsMemcardSaveOK')) throw new Error('memcard_error_code (OPT-05b, OPT-05c)');
  if (!t.answer('IsSpaceForSaveGameFile')) throw new Error('CannotSaveNoSpace (OPT-05d)');
  const has = ensureFast(t);                                       // MemcardAlreadyHasData = 0 first
  if (has) {                                                       // AskToOverwrite: WHILE AreYouSure == 0 ... WAIT 0.1
    for (let i = 0; i < polls; i++) if (!t.answer('IsMemCardInserted')) throw new Error('CannotSaveNoMemcard (OPT-05g)');
  }
  if (ensureDirs(t)) expect(t.answer('SaveConfig', SAVE_DIR)).toBe(true);
  return has;
}

/** The Sync pairs a list of steps expects, and its calls (the arguments the page passes). */
export const pairsOf = (steps: readonly McStep[]) => steps.map((s) => ({ cmd: MC_CMD[s.cmd], result: s.expect }));
export const callsOf = (steps: readonly McStep[]): Call[] => steps.map((s) => ({ cmd: s.cmd, args: [...s.args] }));

const D = SAVE_DIR;
/**
 * The rig's transcription of the four scripts it follows: every call each one's ops name, in their order, all branches
 * (`Name(arg)` for a row, `CALL name` for an animation). `saveAndLeave`, `ensureFast` and `ensureDirs` take a path
 * through these; `optionsSaveRig.test.ts` holds them to the pin (`tools/test/cardPromptCommands.pinned.json`) and the
 * rows the rig dispatches to their expansion, so a change of the pin fails a test.
 */
export const SCRIPT_CALLS: Readonly<Record<string, readonly string[]>> = {
  save_and_leave: [
    'StoreOptions(NA)', 'POPUPDIALOG(NA)', 'CALL choose_memcard_slot_cancellable', 'POPUPDIALOG(NA)', 'IsMemCardInserted(NA)',
    'IsMemCardFormatted(NA)', 'IsMemCardInserted(NA)', 'IsMemCardInserted(NA)', 'IsMemCardFormatted(NA)', 'CALL AskToFormat',
    'IsMemCardInserted(NA)', 'IsMemCardFormatted(NA)', 'CALL AreYouSureYouWantToFormat', 'IsMemCardInserted(NA)',
    'IsMemCardFormatted(NA)', 'CALL do_formatting', 'CALL AreYouSureYouDontWantToFormat', 'CALL Ensure_MC_Dirs_Fast',
    'IsMemcardSaveOK(NA)', 'IsSpaceForSaveGameFile(NA)', 'CALL Ensure_MC_Dirs_Fast', 'CALL AskToOverwrite',
    'IsMemCardInserted(NA)', 'CALL CannotSaveNoMemcard', 'POPUPDIALOG(NA)', 'CALL Ensure_MC_Dirs', `SaveConfig(${D})`,
    'CALL DisplayErrorSaving', 'KILLPOPUP(NA)', 'CALL CannotSaveNoSpace', 'CALL CannotSaveNotFormatted',
    'CALL CannotSaveNoMemcard', 'IsSpaceForSaveGameFile(NA)', 'CALL CannotSaveNoSpace', 'CALL CannotSaveNoMemcard',
    'SWITCHMENU(dlgAlbaniaCinematic.rdr)', 'SWITCHMENU(PREVIOUS_SCREEN)', 'CALL has_memcard_changed',
  ],
  choose_memcard_slot_cancellable: ['POPUPDIALOG(NA)', 'POPUPDIALOG(NA)', 'MC_ChPort(0)', 'MC_ChPort(1)'],
  Ensure_MC_Dirs: [
    'MC_Exists(..)', 'MC_ChDir(..)', `MC_Exists(${D})`, `MC_ChDir(${D})`, `MC_MkDir(${D})`, `MC_ChDir(${D})`,
    'MC_CreateIconFiles(NA)', `SaveConfig(${D})`,
  ],
  Ensure_MC_Dirs_Fast: ['MC_Exists(..)', 'MC_ChDir(..)', `MC_Exists(${D})`, `MC_ChDir(${D})`],
};
