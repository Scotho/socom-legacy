import { parseRdr, readZarMembers, type AssetSource, type RdrNode } from '@s2u/archive';
import { OPTION_VALVES, VALVE_TYPE, ValveStore, type OptionGlobals, type ValveEntry } from '@s2u/ui';
import { lookStickOf, type StickConfig, type StickTunerVars } from './look';
import { migrateTeamNames } from './nameTags';

/**
 * The main menu's OPTIONS on the page (OPT-09..OPT-14, web research 302 §4; Chris's settings, 2026-10-07): the option
 * valves' defaults off the disc, their place in the card's save file, and the three option globals the match applies.
 *
 * - **The defaults.** `CValve_Open` (`FUN_00351d40`) reads `global_valves.rdr` (`RUN/READERC.ZAR`) into the registry at
 *   the game's start; the page's boot reads the whole table with its type words (`readGlobalValves`) and loads it into
 *   a new registry before any other valve is made and before the card's restore (`bootValves`; OPT-02b, W15.R6,
 *   research 229 §1). ~~The option valves' rows of it only (`OPTION_VALVES`, `readOptionValves`).~~ *(Struck
 *   2026-10-09, OPT-02b: the original loads every row.)* The option rows (`OPTION_VALVES`, 02-boot O15) are among them.
 * - **The card.** `CValveSaveManager_Serialize` writes every PERSIST valve into the save file `BASCUS-97275SOCOMII`
 *   beside `CUIVarManager` and `CAcctDB` (04 O15, R102.9); under R7 the module is our JSON in the file's data, by name
 *   (`valveModule`), and the boot's `LoadConfig` reads it back (`restoreValveModule`, `CValveSaveManager_UnSerialize`
 *   `FUN_00352960`: every entry, research 229 §1), then `load_initial_config`'s `StoreOptions` applies them. The
 *   volumes, the brightness and the stick tuners are UI variables, not valves: `InitSystemTuners` leaves them at
 *   longevity 2, and an OPTIONS page's slider raises its own to 3 (its `UIVAR` spec's `LONGEVITY PERSISTENT`:
 *   `FUN_003724f0` D:L269307 through `FUN_003857c0` D:L279438-279440), so `CUIVarManager_Serialize` saves those in the
 *   `CUIVarManager` module and the load reads them back (`@s2u/ui` `restoreUiVarModule`'s tuners; research 104
 *   R104.10 as revised, 302 §4). No browser key holds any of it.
 * - **The match.** `StoreOptions` leaves the pitch sign, the head bob and the fire-mode swap in the game's globals
 *   (`OptionGlobals`, `@s2u/ui`); the front end's match reads them each frame (`playOptionsOf`).
 */

/**
 * Every entry of `global_valves.rdr`, in the table's order, with its type word (OPT-02, web research 229 §2): what
 * `CValve_Open` (`FUN_00351d40`, the call D:L152619) hands `CValve_Parse` -- on the US disc 185 rows, 65 typed PERSIST.
 */
export async function readGlobalValves(source: AssetSource): Promise<ValveEntry[]> {
  return globalValvesOf(await readGlobalValvesRoot(source));
}

async function readGlobalValvesRoot(source: AssetSource): Promise<RdrNode> {
  const bytes = (await readZarMembers(source, 'RUN/READERC.ZAR', ['global_valves.rdr'])).get('global_valves.rdr');
  if (!bytes) throw new Error('RUN/READERC.ZAR :: global_valves.rdr missing');
  return parseRdr(bytes);
}

/**
 * The `valves` table's rows (`CValve_Parse`'s input: `name`, `value`, an optional `type` word); a row without a name or
 * a number is left out.
 */
export function globalValvesOf(root: RdrNode): ValveEntry[] {
  const top = Array.isArray(root) && Array.isArray(root[0]) ? root[0] as RdrNode[] : [];
  const rows = top[0] === 'valves' && Array.isArray(top[1]) ? top[1] as RdrNode[] : [];
  const out: ValveEntry[] = [];
  for (const e of rows) {
    if (!Array.isArray(e)) continue;
    const field = (k: string): string | undefined => {
      const i = e.indexOf(k), v = i < 0 ? undefined : e[i + 1];
      return Array.isArray(v) && typeof v[0] === 'string' ? v[0] : undefined;
    };
    const name = field('name'), value = Number(field('value'));
    if (name === undefined || !Number.isFinite(value)) continue;
    const type = field('type');
    out.push(type === undefined ? { name, value } : { name, value, type });
  }
  return out;
}

/** The `valves` table's option rows (`OPTION_VALVES`): the options screen's among the table's (research 302 §4). */
export function optionValvesOf(root: RdrNode): ValveEntry[] {
  return globalValvesOf(root).filter((e) => OPTION_VALVES.includes(e.name));
}

/** The save file's module of the persistent valves (`CSaveModuleList/CValveSaveManager`, 04 O15). */
export const VALVE_MODULE = 'CValveSaveManager';

/** A module's entries as the card holds them: a name and a 16-bit value each (a valve holds its low 16 bits). */
function moduleEntries(part: unknown): [string, number][] | null {
  if (part === undefined) return [];
  if (typeof part !== 'object' || part === null || Array.isArray(part)) return null;
  const out: [string, number][] = [];
  for (const [name, value] of Object.entries(part as Record<string, unknown>)) {
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 0xffff) return null;
    out.push([name, value as number]);
  }
  return out;
}

/**
 * The card's `CValveSaveManager` module read back (`CValveSaveManager_UnSerialize`, `FUN_00352960` D:L251422-251443):
 * every entry, in the module's order, `set` at PERSIST (`FUN_003520d0(NAME, VAL, 3)`, D:L251441) -- a name the
 * registry lacks is made, one it holds is promoted (web research 229 §1). ~~The option valves only: a card's data is
 * not trusted to fill the registry, and the module's other names stay in the file as read.~~ *(Struck 2026-10-09,
 * OPT-02: the original restores every entry; research 229 §1.)* A value absent from the module keeps the registry's
 * (an older save). A module of another shape restores nothing and answers false (the page's check of its own JSON).
 */
export function restoreValveModule(valves: ValveStore, part: unknown): boolean {
  const entries = moduleEntries(part);
  if (!entries) return false;
  // SS-2 (H422 answered (a); a browser adaptation): a card holding TEAMMATE NAMES 2 (LATER 671's former launcher-only
  // "Original") is read as 1, the look moved to this browser (`./nameTags` `migrateTeamNames`); nothing else is touched.
  valves.restorePersistent(migrateTeamNames(entries).map(([name, value]) => ({ name, value })));
  return true;
}

/**
 * The module the next save writes (`CValveSaveManager_Serialize`, `FUN_00352a90` D:L251470-251480: every PERSIST valve
 * of the registry, `NAME` and `VAL`, in registry order): the module as the card held it, every PERSIST valve over it.
 * Since the restore makes each held name a PERSIST valve, the held names add nothing the original would not write; they
 * are kept (W15.R3) for a store the card was not restored into (research 229 §1).
 */
export function valveModule(valves: ValveStore, held: unknown): Record<string, number> {
  const kept = Object.fromEntries(moduleEntries(held) ?? []);
  for (const v of valves.persistentValves()) kept[v.name] = v.value;
  return kept;
}

/**
 * A `valves` table's rows into the registry (`CValve_Parse` `FUN_00351a90`: each `set` with its type word -- `PERM` 1,
 * `TEMP` 2, `PERSIST` 3, D:L250843-250860 -- else the caller's type, which `CValve_Open`'s call passes as 1, PERM,
 * D:L152619): the option rows, or the whole table (`bootValves`).
 */
export function loadOptionValves(valves: ValveStore, entries: readonly ValveEntry[]): void {
  valves.loadValves(entries, VALVE_TYPE.PERM);
}

/**
 * The registry the page's session starts with (OPT-02b, W15.R6; web research 229 §1): `global_valves.rdr` whole, loaded
 * as `CValve_Open` loads it at the game's start (`FUN_00351d40`, the call D:L152619) before any screen makes a valve, so
 * the registry's order -- the order `CValveSaveManager_Serialize` writes (`FUN_00352a90` D:L251470-251480) -- is the
 * table's. On the US disc: 185 rows; the 65 typed PERSIST are PERSIST (3), the 120 untyped are PERM (1, the call's
 * fallback), and no row says PERM or TEMP (a TEMP word would make a TEMP valve, 2, which a relaunch drops: `@s2u/ui`'s
 * `FrontEndMachine` relaunch). `SecurePassword` is among the 65, PERSIST at 1: the card's UI-variable module still holds no
 * password (`@s2u/ui` `uiVarModule`'s list of the password class, the port's rule; research 229 §6, OT.R17).
 */
export function bootValves(entries: readonly ValveEntry[]): ValveStore {
  const valves = new ValveStore();
  loadOptionValves(valves, entries);
  return valves;
}

/** What the match applies of the option globals (`UIStoreOptions`, 04 O11), each the original's default until stored. */
export interface PlayOptions {
  /** `INVERT_PITCH_CONTROLLER` -> the pitch sign `DAT_003df198`. */
  invertPitch: boolean;
  /** `BOBBING_1ST_PERSON` -> `DAT_003df190`: first person's view bob. */
  headBob: boolean;
  /** `FIREMODESWAP_CONTROLLER` -> `DAT_0044d500` and `FUN_00592050`: FireMode and TACMAP (L3 and SELECT) swapped. */
  fireModeSwap: boolean;
  /** CONTROLLER OPTIONS (OT.R72): `stick_preset` and, under CUSTOM, the three sliders -> the look stick (`./look` `lookStickOf`). */
  stick: StickConfig;
  /**
   * CTL-2: `VIBRATION_CONTROLLER` -> `FUN_00592be0` (`DAT_00650698`, UIStoreOptions D:L125188-125193), the motors'
   * toggle; absent, on (the ELF's data).
   */
  vibration?: boolean;
}

/** The three as the globals hold them; a global never stored is the default (normal pitch, the bob on, no swap). */
export function playOptionsOf(globals: Pick<OptionGlobals, 'value'> | null | undefined, vars?: StickTunerVars | null): PlayOptions {
  const v = (name: string): number | undefined => globals?.value(name);
  return {
    invertPitch: (v('INVERT_PITCH_CONTROLLER') ?? 0) !== 0,
    headBob: (v('BOBBING_1ST_PERSON') ?? 1) !== 0,
    fireModeSwap: (v('FIREMODESWAP_CONTROLLER') ?? 0) === 1,
    stick: lookStickOf(v('stick_preset') ?? 0, vars),
    vibration: (v('VIBRATION_CONTROLLER') ?? 1) !== 0,
  };
}
