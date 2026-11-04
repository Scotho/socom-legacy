import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import type { UiVarManager } from '../uiVars';
import { VALVE_TYPE, type ValveStore } from '../valves';
import type { ZAnimUiCommand } from '../zanimRuntime';
import type { MissionRecord } from './createGameCommands';

/**
 * ONLINE FILTERS (`dlgOnlineFilters.rdr`, ONL-15, web sprint 22; web research 265 §2): the page ONLINE OPTIONS' INPUT
 * FILTERS opens, and the game-type half of the game list's filter it sets. `D:L<line>` = a line of
 * `socom2_game.elf.decomp.c`; `S:0x...` a string of the retail ELF. Transcribed, cited, never pasted.
 *
 * **The page is the disc's.** Its rows -- MAP TYPE, # OF PLAYERS, RESPONSE TIME, the FRIENDLY FIRE and PASSWORD strips,
 * RESET FILTERS, RETURN -- are scripts of its own set (`tools/dump-online-dialogs.ts --dialog dlgOnlineFilters.rdr`):
 * each CROSS writes its valve (`GameTypeMapIndex` / `GameTypeFilter`, `GamePlayerFilter`, `GameSpeedFilter`,
 * `FF_FILTER`, `GamePasswordFilter`; RESET also `LockedFilter`) and `OptionsMenuChanged` = 1, and `refresh_filter_screen`
 * draws the three descriptions (#655-#672). The page has no SAVE of its own: RETURN goes back to ONLINE OPTIONS
 * (`goto_menu(PREVIOUS_SCREEN)`), whose RETURN with `OptionsMenuChanged` 1 runs `save_and_leave` -- the card's path
 * (research 265 §1.4) -- and the five PERSIST valves are written there (research 229 §2). The one table row the page needs
 * that no module answered is `GetMissionInformation` (row 188, `FUN_00275ef0` D:L122200-122252), for a MAP TYPE that
 * names one map; `NumMultiMissions`, which ends the map cycle, is the mission table's count (`FUN_002c8c10`).
 *
 * **The game-type filter** (`FUN_002e31e0` D:L184549-184617, inside the list's own filter `FUN_002e3080`): the game's
 * play list (the 'D' record's bytes from 8, NUL-ended: the record's +0x1a2, which the vtable 0x4066b0's slot +8 --
 * ELF 0x2e24c0, `jr ra` / `addiu v0, a0, 0x1a2` -- answers) tested against GameTypeFilter: 0 passes every game; 252, 251,
 * 250, 249, 248 a play list of one game type (Suppression 5, Demolition 2, Extraction 4, Escort 3, Breach 1: the type of
 * each map by the mission table, `FUN_002c8b80` D:L168500-168519); any other value one map alone, that map.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The dialog. */
export const ONLINE_FILTERS = 'dlgOnlineFilters.rdr';

/** The row this module fills (PLAT-08's table: id, name, function), and the task the table names as its body's owner. */
export const ONLINE_FILTERS_COMMAND_ROWS = [
  { id: 188, name: 'GetMissionInformation', fn: 0x275ef0, task: 'ONL-15' },
] as const;
export type OnlineFiltersCommandName = (typeof ONLINE_FILTERS_COMMAND_ROWS)[number]['name'];

/**
 * The seven valves the page writes, and the values `OnResetBtnDwn` resets them to (the disc's script; `FUN_003042b0`
 * D:L204390-204395 starts the list's six globals at the same: 0, 0, 65000, 2, 2, 2). `GameTypeMapIndex` is the page's
 * cursor over the cycle; `GameTypeFilter` the value the list reads (PERM: each launch's `global_valves.rdr` seeds it 0,
 * and AUTOPLAY's `refresh_filter_screen` copies the index into it).
 */
export const ONLINE_FILTER_RESET = {
  GameTypeFilter: 0, GameTypeMapIndex: 0, GamePlayerFilter: 0, GameSpeedFilter: 65000, FF_FILTER: 2, LockedFilter: 2, GamePasswordFilter: 2,
} as const;

/** MAP TYPE's cycle (`increment_game_filter`): 0 -> 251 -> 250 -> 252 -> 249 -> 248 -> map 1 .. NumMultiMissions -> 0. */
export const MAP_TYPE_CYCLE = [0, 251, 250, 252, 249, 248] as const;

/**
 * The game-type values and the mission TYPE each admits (`FUN_002e31e0` D:L184578-184607; the TYPE words of
 * `MISSION_TYPES`; the page's captions #656-#660: Suppression, Demolition, Extraction, Escort, Breach ONLY).
 */
export const GAME_TYPE_FILTER_TYPES: Readonly<Record<number, number>> = { 0xfc: 5, 0xfb: 2, 0xfa: 4, 0xf9: 3, 0xf8: 1 };

/** The play list's bytes the record holds: the 'D' record's 8..0x27 (`FUN_002e33e0` reads at most 0x20 of them). */
const PLAY_LIST_MAX = 0x20;

/**
 * `FUN_002c8b80` (D:L168500-168519) over the mission table (0x441650): the TYPE of the first mission whose NUMBER is
 * `number` and whose multiplayer flag (+0xc) is 1; 0 for none.
 */
export function missionGameType(missions: readonly MissionRecord[], number: number): number {
  return missions.find((m) => m.number === number && m.multiplayer)?.type ?? 0;
}

/** A play list as the record holds it: the bytes up to the first 0 (at most `PLAY_LIST_MAX`). */
export function playListOf(d: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 8; i < 8 + PLAY_LIST_MAX && i < d.length && d[i] !== 0; i++) out.push(d[i]!);
  return out;
}

/**
 * `FUN_002e31e0` (D:L184549-184617): 0 passes every game. Otherwise every map of the play list must be of the first
 * map's type (D:L184565-184575); then 252..248 pass when that type is the one the value names (D:L184578-184607), and
 * any other value passes a play list of one map only, that map's number (D:L184608-184613). An empty play list passes
 * no non-zero filter (its first map, 0, is of no type and no map).
 */
export function gameTypePasses(filter: number, playList: readonly number[], missions: readonly MissionRecord[]): boolean {
  if (filter === 0) return true;
  const first = playList[0] ?? 0;
  const type = (n: number): number => missionGameType(missions, n);
  if (playList.some((n) => type(n) !== type(first))) return false;
  const wanted = GAME_TYPE_FILTER_TYPES[filter];
  if (wanted !== undefined) return type(first) === wanted;
  if (playList.some((n) => n !== first)) return false;
  return first === filter;
}

/**
 * `FUN_002c8c10` (D:L168522-168600): the mission table read, `NumMultiMissions` (S:0x3f2e20) set to the count of the
 * missions flagged multiplayer whose archive is present (`FUN_002c94f0`; `MISSION_ARCHIVE_PRESENT_READING`: every one
 * on the retail disc), written through its watchers (D:L168587-168598).
 */
export function numMultiMissions(missions: readonly MissionRecord[], present: (n: number) => boolean = () => true): number {
  return missions.filter((m) => m.multiplayer && present(m.number)).length;
}

/** The valve `increment_game_filter` ends MAP TYPE's map cycle at. */
export const NUM_MULTI_MISSIONS_VALVE = 'NumMultiMissions';

/** The boot's write of `NumMultiMissions` (`FUN_002c8c10`), for a page that reads the table later. */
export function seedNumMultiMissions(valves: ValveStore, missions: readonly MissionRecord[], present?: (n: number) => boolean): void {
  valves.acquire(NUM_MULTI_MISSIONS_VALVE, VALVE_TYPE.PERM);
  valves.set(NUM_MULTI_MISSIONS_VALVE, numMultiMissions(missions, present), VALVE_TYPE.PERM);
}

export interface OnlineFiltersCommandsOptions {
  /** The game's one `CUIVarManager` (0x437e80). */
  uiVars: UiVarManager;
  /** The valve registry (0x49e800). */
  valves: () => ValveStore;
  /** `missionlist.rdr`'s records, in the table's order (the page's disc); absent, none. */
  missions?: () => readonly MissionRecord[];
  /** `FUN_0026ed60`: a name of the command's running animation by index. */
  name: (cmd: ZAnimUiCommand, index: number) => string | null;
  log?: (name: OnlineFiltersCommandName, arg: string, answer: boolean) => void;
}

/** The command record's fields `FUN_00275ef0` reads: the flag byte +0x10 and the three names' indices +0x14, +0x18, +0x1c. */
function missionInformationFields(cmd: ZAnimUiCommand): { flag: number; text: number; number: number; index: number } | null {
  const b = cmd.bytes;
  if (b.length < 0x20) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { flag: v.getUint8(0x10), text: v.getInt32(0x14, true), number: v.getInt32(0x18, true), index: v.getInt32(0x1c, true) };
}

export class OnlineFiltersCommands {
  constructor(private readonly o: OnlineFiltersCommandsOptions) {}

  /**
   * `FUN_00275ef0` (D:L122200-122252): the three names (on the disc's commands `MissionNameUIVar`, `GameTypeFilter`,
   * `GameTypeMapIndex`) resolved; with all three, the missions whose multiplayer flag equals the record's byte +0x10 (1
   * on the disc) counted in the table's order, and at the index valve's value less one the mission's NAME set into the
   * text variable (added TEMPORARY, `FUN_003857c0(.., 0, 1)`) and its NUMBER into the number valve (through its
   * watchers). Answers 1 whether or not a mission was found.
   */
  GetMissionInformation: UiCommandHandler = (cmd) => {
    const f = missionInformationFields(cmd);
    const text = f ? this.o.name(cmd, f.text) : null, number = f ? this.o.name(cmd, f.number) : null, index = f ? this.o.name(cmd, f.index) : null;
    if (f && text && number && index) {
      const valves = this.o.valves();
      const at = valves.acquire(index, VALVE_TYPE.PERM).value - 1;
      const m = (this.o.missions?.() ?? []).filter((r) => (r.multiplayer ? 1 : 0) === f.flag)[at];
      if (m) {
        const vars = this.o.uiVars;
        vars.set(vars.add(text, null, 1), { type: 'string', value: m.name });
        valves.acquire(number, VALVE_TYPE.PERM);
        valves.set(number, m.number, VALVE_TYPE.PERM);
      }
    }
    this.o.log?.('GetMissionInformation', cmd.arg, true);
    return true;
  };

  entries(): Record<OnlineFiltersCommandName, UiCommandHandler> {
    return { GetMissionInformation: this.GetMissionInformation };
  }

  register(host: UiCommandHost): void {
    for (const [name, h] of Object.entries(this.entries())) host.setHandler(name, h);
  }
}
