import { FIO, MC_CMD, MC_RESULT, type Libmc } from '../src/index';

/**
 * The op-sequence replay harness (PLAT-26; research 228 §3): a list of libmc steps -- the command, its arguments, the
 * result the step expects -- replayed against a `Libmc` over a file table the test builds, compared step by step with
 * what the step leaves for Sync (`[MC] Sync cmd=<n> result=<r>`, the line `PS2X_MC_TRACE` prints, MemoryCard.cpp:1587),
 * and the first divergence reported.
 *
 * Its shape is the proven level's: PLAT-36's post-fix trace (H26) gives the same `cmd` / `result` pairs, in order. This
 * sprint (W15.R2) it is fed only with sequences transcribed from the decompilation's save chain, never with the pre-fix
 * `s8_save_yes` results.
 */

/** A command's name, as `MC_CMD` keys it (`kMcCmd*`, MemoryCard.cpp:14-29). */
export type McCommandName = keyof typeof MC_CMD;

export interface McStep {
  readonly cmd: McCommandName;
  /** The command's arguments after `mc`: as `Libmc`'s method of that name takes them. */
  readonly args: readonly (number | string)[];
  /** The result Sync answers: a code, a count, a handle or a position. */
  readonly expect: number;
  /** Where the step is read (`FUN_<addr>`, `D:L<line>`), for the report. */
  readonly at?: string;
}

export interface McDivergence {
  /** The step's index in the list (0-based). */
  readonly index: number;
  readonly step: McStep;
  /** What Sync answered after the step: its command and result, or -1 when nothing was left. */
  readonly got: { readonly cmd: number; readonly result: number } | { readonly ret: -1 };
}

export interface McReplay {
  /** The steps replayed before the first divergence (all of them when none). */
  readonly replayed: number;
  readonly divergence: McDivergence | null;
}

type Call = (mc: Libmc, a: readonly (number | string)[]) => unknown;

const n = (a: readonly (number | string)[], i: number): number => a[i] as number;
const s = (a: readonly (number | string)[], i: number): string => a[i] as string;

/** Each command's `Libmc` call. The result is read back from Sync, never from the call's own value. */
const CALLS: Readonly<Record<McCommandName, Call>> = {
  GetInfo: (mc, a) => mc.getInfo(n(a, 0), n(a, 1)),
  Open: (mc, a) => mc.open(n(a, 0), n(a, 1), s(a, 2), n(a, 3)),
  Close: (mc, a) => mc.close(n(a, 0)),
  Seek: (mc, a) => mc.seek(n(a, 0), n(a, 1), n(a, 2)),
  Read: (mc, a) => mc.read(n(a, 0), n(a, 1)),
  Write: (mc, a) => mc.write(n(a, 0), n(a, 1)),
  Flush: (mc, a) => mc.flush(n(a, 0)),
  Mkdir: (mc, a) => mc.mkdir(n(a, 0), n(a, 1), s(a, 2)),
  Chdir: (mc, a) => mc.chdir(n(a, 0), n(a, 1), s(a, 2)),
  GetDir: (mc, a) => mc.getDir(n(a, 0), n(a, 1), s(a, 2), n(a, 3)),
  SetFileInfo: (mc, a) => mc.setFileInfo(n(a, 0), n(a, 1), s(a, 2)),
  Delete: (mc, a) => mc.delete(n(a, 0), n(a, 1), s(a, 2)),
  Format: (mc, a) => mc.format(n(a, 0), n(a, 1)),
  Unformat: (mc, a) => mc.unformat(n(a, 0), n(a, 1)),
  GetEntSpace: (mc, a) => mc.getEntSpace(n(a, 0), n(a, 1), s(a, 2)),
  Rename: (mc, a) => mc.rename(n(a, 0), n(a, 1), s(a, 2), s(a, 3)),
};

/** Replays `steps` in order; stops at the first whose Sync pair differs from `{ MC_CMD[cmd], expect }`. */
export function replayMcOps(mc: Libmc, steps: readonly McStep[]): McReplay {
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index]!;
    CALLS[step.cmd](mc, step.args);
    const got = mc.sync();
    if (got.ret !== 1 || got.cmd !== MC_CMD[step.cmd] || got.result !== step.expect) {
      return {
        replayed: index,
        divergence: { index, step, got: got.ret === 1 ? { cmd: got.cmd, result: got.result } : { ret: -1 } },
      };
    }
  }
  return { replayed: steps.length, divergence: null };
}

// ---- the options save as read (research 228 §3; W15.R2: a reading, never the pre-fix trace's results) ----

/** The save folder, and the save file in it (the card script's argument, `UIMemCardAnim.rdr` `Ensure_MC_Dirs`). */
export const SAVE_DIR = 'BASCUS-97275SOCOMII';

const { Succeed, NoEntry } = MC_RESULT;
/** 0x202: `CMemCardIO`'s mode 0x1a (2 -> O_WRONLY, 8 -> O_CREAT), D:L295395-295404; the fillers' Open (D:L296063). */
const W = FIO.O_WRONLY | FIO.O_CREAT;

/**
 * A file saved through `CSaveManager::Save` (`FUN_0033dff0`): the open with mode 0x1a deletes first (its result
 * synced and unread: NoEntry on a card without the file, Succeed on one that holds it), then Open, one Write, Close.
 */
export function savedFile(name: string, fd: number, bytes: number, at: string, deleted: number = NoEntry): McStep[] {
  return [
    { cmd: 'Delete', args: [0, 0, name], expect: deleted, at: `${at}; FUN_003a05a0 D:L295407 (0x10 and 0x08: delete first)` },
    { cmd: 'Open', args: [0, 0, name, W], expect: fd, at: 'FUN_003a05a0 D:L295412 (from D:L239225, mode 0x1a)' },
    { cmd: 'Write', args: [fd, bytes], expect: bytes, at: 'D:L239236 -> FUN_003a0160 D:L295243' },
    { cmd: 'Close', args: [fd], expect: Succeed, at: 'D:L239237 -> FUN_003a04d0 D:L295361' },
  ];
}

/**
 * A filler of `kb` KB (`FUN_003a1980`, D:L296036-296077) on a card without it: GetDir finds none (D:L296050-296060);
 * Open 0x202, Seek to the last KB, Write it, Close. (A card that has it: the GetDir alone.)
 */
export function filler(name: string, fd: number, kb: number, at: string): McStep[] {
  return [
    { cmd: 'GetDir', args: [0, 0, name, 1], expect: 0, at: `${at}; FUN_003a1980 D:L296050` },
    { cmd: 'Open', args: [0, 0, name, W], expect: fd, at: 'D:L296063' },
    { cmd: 'Seek', args: [fd, (kb - 1) * 0x400, FIO.SEEK_SET], expect: (kb - 1) * 0x400, at: 'D:L296069' },
    { cmd: 'Write', args: [fd, 0x400], expect: 0x400, at: 'D:L296071' },
    { cmd: 'Close', args: [fd], expect: Succeed, at: 'D:L296073' },
  ];
}

/**
 * The options save on a fresh card in slot 1, as the decompilation reads it (research 228 §3, 114 steps): the card
 * probe `IsMemcardSaveOK`, then `Ensure_MC_Dirs` on a card without the folder (its script: the `..` climb, the folder
 * looked for, Mkdir, ChDir), the icons (`MC_CreateIconFiles`, `FUN_003a0a10`) and `SaveConfig` (`FUN_0027b000`,
 * D:L124762-124786). The sizes are the f0 card's (research 139, research 143 R143.5); the results are the stub's as
 * `Libmc` ports it, never the pre-fix trace's.
 */
export function optionsSaveOnAFreshCard(): McStep[] {
  const steps: McStep[] = [
    { cmd: 'GetInfo', args: [0, 0], expect: Succeed, at: 'IsMemcardSaveOK -> FUN_003a1cf0 D:L296146' },
    { cmd: 'GetDir', args: [0, 0, '..', 1], expect: 1, at: "Ensure_MC_Dirs: MC_Exists '..' -> FUN_003a0950 D:L295511 (the root: '.' alone, maxent 1)" },
    { cmd: 'Chdir', args: [0, 0, '..'], expect: Succeed, at: "MC_ChDir '..' -> FUN_003a07d0 D:L295456" },
    { cmd: 'GetDir', args: [0, 0, SAVE_DIR, 1], expect: 0, at: `MC_Exists ${SAVE_DIR} -> FUN_003a0950 D:L295511` },
    // The script's argument as the pin holds it (`MC_MkDir(BASCUS-97275SOCOMII)`): relative, at the root. OPT-01: it read `/BASCUS-97275SOCOMII`.
    { cmd: 'Mkdir', args: [0, 0, SAVE_DIR], expect: Succeed, at: 'MC_MkDir -> FUN_0027b2c0 D:L124877-124887 (the string unchanged) -> FUN_003a0890 D:L295483' },
    { cmd: 'Chdir', args: [0, 0, SAVE_DIR], expect: Succeed, at: `MC_ChDir ${SAVE_DIR} -> FUN_003a07d0 D:L295456` },
    // MC_CreateIconFiles (FUN_003a0a10, D:L295525-295655)
    { cmd: 'Open', args: [0, 0, 'icon.sys', 0x202], expect: 1, at: 'D:L295574' },
    { cmd: 'Write', args: [1, 0x3c4], expect: 0x3c4, at: 'D:L295585' },
    { cmd: 'Close', args: [1], expect: Succeed, at: 'D:L295591' },
    { cmd: 'Open', args: [0, 0, 'LIST.ICO', 0x203], expect: 2, at: 'D:L295605' },
  ];
  // LIST.ICO copied a KB at a time while the read gives a whole KB (D:L295617-295628): 50,234 B, 49 x 1,024 + 58.
  for (let i = 0; i < 49; i++) steps.push({ cmd: 'Write', args: [2, 1024], expect: 1024, at: 'D:L295618' });
  steps.push({ cmd: 'Write', args: [2, 58], expect: 58, at: 'D:L295618' });
  steps.push({ cmd: 'Close', args: [2], expect: Succeed, at: 'D:L295634' });
  // SaveConfig (FUN_0027b000)
  steps.push({ cmd: 'Delete', args: [0, 0, 'SCRATCHPAD.DAT'], expect: NoEntry, at: 'D:L124772 -> FUN_003a1c60 D:L296116' });
  steps.push(...savedFile(SAVE_DIR, 3, 4_784, 'D:L124773 -> FUN_003a17e0 -> FUN_0033dff0'));
  for (let i = 0; i < 7; i++) {
    steps.push({ cmd: 'GetDir', args: [0, 0, `SaveGame${i}`, 1], expect: 0, at: 'D:L124777 -> FUN_003a0950 D:L295511' });
    steps.push(...savedFile(`SaveGame${i}`, 4 + i, 1_952, 'D:L124780 -> FUN_003a1ea0 D:L296202'));
  }
  // FUN_003a1880 (D:L124784; D:L295995-296026)
  steps.push({ cmd: 'GetDir', args: [0, 0, '*.zdb', 1], expect: 0, at: 'D:L296008' });
  steps.push(...filler('PATCHFILE.DAT', 11, 2000, 'D:L296019'));
  // FUN_003a1060 (D:L296021; D:L295714-295774): '..' for one entry, then './*' for 0x14
  steps.push({ cmd: 'GetDir', args: [0, 0, '..', 1], expect: 1, at: 'D:L295732' });
  steps.push({ cmd: 'GetDir', args: [0, 0, './*', 0x14], expect: 13, at: "D:L295745 ('.', '..' and the eleven files)" });
  // 2999 - (2,070 KB + (13 >> 1) + 1) = 922 KB (D:L296022-296023; research 143 R143.5)
  steps.push(...filler('SCRATCHPAD.DAT', 12, 922, 'D:L296023'));
  return steps;
}

/** How many of `optionsSaveOnAFreshCard`'s steps are the card probe (`IsMemcardSaveOK`): the rest is `Ensure_MC_Dirs`. */
export const OPTIONS_SAVE_PROBE_STEPS = 1;

const SL = 'save_and_leave (UIMemCardAnim.rdr; the pin tools/test/cardPromptCommands.pinned.json)';

/**
 * `save_and_leave`'s checks once the slot is chosen (`choose_memcard_slot_cancellable`'s `MC_ChPort(0)` for slot 1
 * issues nothing, D:L124858-124874): `IF IsMemCardInserted`, then `IF NOT ( IsMemCardFormatted ) AND IsMemCardInserted`
 * -- the condition evaluator runs every operand, nothing short-circuits (`FUN_0025e960`: the operand's command at
 * D:L108389 before the AND at D:L108404) -- each GetInfo once on a well card (`FUN_003a1650` D:L295936-295951,
 * `FUN_003a1580` D:L295886-295918: a well answer ends the two tries).
 */
function cardChecks(): McStep[] {
  return [
    { cmd: 'GetInfo', args: [0, 0], expect: Succeed, at: `${SL}: IF IsMemCardInserted -> FUN_003a1650 D:L295937` },
    { cmd: 'GetInfo', args: [0, 0], expect: Succeed, at: `${SL}: NOT IsMemCardFormatted -> FUN_003a1580 D:L295886-295918` },
    { cmd: 'GetInfo', args: [0, 0], expect: Succeed, at: `${SL}: AND IsMemCardInserted (every operand runs, FUN_0025e960 D:L108389)` },
  ];
}

/**
 * `Ensure_MC_Dirs_Fast` (the pin's ops): `IF MC_Exists(..)` `MC_ChDir(..)`; `IF MC_Exists(BASCUS-97275SOCOMII)` the
 * valve `MemcardAlreadyHasData` 1 and `MC_ChDir` into it. `Ensure_MC_Dirs`' head issues the same commands when the
 * folder is there. `found`: the card holds the folder.
 */
function climbAndLook(found: boolean, at: string): McStep[] {
  const steps: McStep[] = [
    { cmd: 'GetDir', args: [0, 0, '..', 1], expect: 1, at: `${at}: MC_Exists '..' -> FUN_003a0950 D:L295511 (the root's first entry)` },
    { cmd: 'Chdir', args: [0, 0, '..'], expect: Succeed, at: `${at}: MC_ChDir '..' -> FUN_003a07d0 D:L295456` },
    { cmd: 'GetDir', args: [0, 0, SAVE_DIR, 1], expect: found ? 1 : 0, at: `${at}: MC_Exists ${SAVE_DIR} -> FUN_003a0950 D:L295511` },
  ];
  if (found) steps.push({ cmd: 'Chdir', args: [0, 0, SAVE_DIR], expect: Succeed, at: `${at}: MC_ChDir ${SAVE_DIR} -> FUN_003a07d0 D:L295456` });
  return steps;
}

/** `IsSpaceForSaveGameFile` on a card with 3001 KB or more free: GetInfo alone (`FUN_0027b3d0` D:L124930-124944 -> `FUN_003a1210` D:L295777-295807). */
const SPACE: McStep = { cmd: 'GetInfo', args: [0, 0], expect: Succeed, at: `${SL}: IsSpaceForSaveGameFile -> FUN_003a1210 (3001 KB or more free: no folder count)` };

/**
 * The page's flow (OPT-01): "change an option, RETURN, YES", slot 1, on a fresh card -- RETURN's
 * `check_then_save_and_leave` calls `save_and_leave` (research 301 §6, research 302 §4), whose YES branch issues, from
 * the slot's choice to the end of the save: the checks, `Ensure_MC_Dirs_Fast`, `IsMemcardSaveOK`,
 * `IsSpaceForSaveGameFile`, `Ensure_MC_Dirs_Fast` again and
 * `Ensure_MC_Dirs` -- which on a card without the folder makes it and runs the icons and `SaveConfig`; the valve
 * `MemcardAlreadyHasData` stays 0, so the script's own `SaveConfig` after it does not run. 124 steps:
 * `optionsSaveOnAFreshCard`'s 114 with ten before and between them (research 228 §3, the page's flow). The change poll
 * (`has_memcard_changed`, stopped at the start and called at the end) is left out: its GetInfo is the clock's.
 */
export function optionsSaveAndLeaveOnAFreshCard(): McStep[] {
  const read = optionsSaveOnAFreshCard();
  return [
    ...cardChecks(),
    ...climbAndLook(false, `${SL}: Ensure_MC_Dirs_Fast`),
    ...read.slice(0, OPTIONS_SAVE_PROBE_STEPS),
    SPACE,
    ...climbAndLook(false, `${SL}: Ensure_MC_Dirs_Fast`),
    ...read.slice(OPTIONS_SAVE_PROBE_STEPS),
  ];
}

/**
 * The second save (OPT-01; research 228 §3, the second list): the same flow on the card the first left, in the same
 * session -- `firstFd` is the next handle libmc gives (13 after the first save's twelve: handles count up for the
 * session, research 134 §2). The folder is found, so both `Ensure_MC_Dirs_Fast` and `Ensure_MC_Dirs` climb and enter
 * it; `AskToOverwrite` (#857) waits for the player while its loop asks `IsMemCardInserted` every 0.1 s -- `polls`
 * times, the player's time (one: YES within the first wait); then `MemcardAlreadyHasData` 1 runs the script's
 * `SaveConfig(BASCUS-97275SOCOMII)`: the scratch deleted (Succeed now), the save file deleted (Succeed) and written,
 * the seven dummies found by GetDir and kept (D:L124777-124778), `*.zdb` none, `PATCHFILE.DAT` found and kept
 * (D:L296050-296060), the folder counted again (2,070 KB over 13 entries) and the scratch made again at 922 KB.
 */
export function optionsSaveAndLeaveOnASavedCard(firstFd = 13, polls = 1): McStep[] {
  const steps: McStep[] = [
    ...cardChecks(),
    ...climbAndLook(true, `${SL}: Ensure_MC_Dirs_Fast`),
    ...optionsSaveOnAFreshCard().slice(0, OPTIONS_SAVE_PROBE_STEPS),
    SPACE,
    ...climbAndLook(true, `${SL}: Ensure_MC_Dirs_Fast`),
  ];
  for (let i = 0; i < polls; i++) {
    steps.push({ cmd: 'GetInfo', args: [0, 0], expect: Succeed, at: `${SL}: AskToOverwrite's wait, IF NOT IsMemCardInserted -> FUN_003a1650 D:L295937` });
  }
  steps.push(...climbAndLook(true, `${SL}: Ensure_MC_Dirs`));
  steps.push({ cmd: 'Delete', args: [0, 0, 'SCRATCHPAD.DAT'], expect: Succeed, at: `${SL}: SaveConfig D:L124772 -> FUN_003a1c60 D:L296116` });
  steps.push(...savedFile(SAVE_DIR, firstFd, 4_784, 'D:L124773 -> FUN_003a17e0 -> FUN_0033dff0', Succeed));
  for (let i = 0; i < 7; i++) {
    steps.push({ cmd: 'GetDir', args: [0, 0, `SaveGame${i}`, 1], expect: 1, at: 'D:L124777 -> FUN_003a0950 D:L295511 (found: not saved, D:L124778)' });
  }
  steps.push({ cmd: 'GetDir', args: [0, 0, '*.zdb', 1], expect: 0, at: 'D:L296008' });
  steps.push({ cmd: 'GetDir', args: [0, 0, 'PATCHFILE.DAT', 1], expect: 1, at: 'D:L296019; FUN_003a1980 D:L296050 (found: nothing written, D:L296060)' });
  steps.push({ cmd: 'GetDir', args: [0, 0, '..', 1], expect: 1, at: 'D:L295732' });
  steps.push({ cmd: 'GetDir', args: [0, 0, './*', 0x14], expect: 13, at: "D:L295745 ('.', '..' and the eleven files: the scratch deleted)" });
  steps.push(...filler('SCRATCHPAD.DAT', firstFd + 1, 922, 'D:L296023'));
  return steps;
}
