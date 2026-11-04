import type { RdrNode } from '@s2u/archive';

/**
 * OPT-14, CONTROLLER PRESETS (issue #87; web research 344): `controller.rdr`'s four `ControllerConfigs`, the record
 * the game makes of each, and the console's controller-config state the pad's map is read off (`./gamepad` `padInput`).
 *
 * - **The configs.** `FUN_002c5e70` (D:L166542-166598) opens `controller.rdr` in `data/common` once, at the game's start
 *   (D:L152666), parses each entry of its `ControllerConfigs` list with `FUN_002c67f0` (D:L167088-167237) and makes
 *   `Default` the active config (`FUN_002c5d60("Default")`, D:L166581). The four, in the file's order, are
 *   `CONTROLLER_CONFIGS_READING` (held to the disc by `tools/test/controllerPresetsDisc.test.ts`).
 * - **The record** (`controllerConfigRecord`): which stick each axis result reads, and each of the 13 digital results'
 *   button (research 344 §3).
 * - **The state** (`ControllerConfigs`): the loaded records, each its own mutable table; the active one
 *   (`DAT_004415a8`, written through `DAT_004415b0`); and the fire-rate flag `DAT_0044d500`. `select` is
 *   `SetControllerConfig`'s `FUN_002c5d60`; `store` is `UIStoreOptions`' (`FUN_0027b960`) two steps on it, in its order;
 *   `toggleFireModeSwap` the round's START menu row 9. `FUN_00592050` swaps FireMode's and TACMAP's buttons **in the active
 *   config's table** (research 344 §6, R344.8), so a config made active after a swap is not swapped.
 * - **The pages** (`PRESET_PAGE_CONFIG`, `storedControllerConfig`): CONTROLLER PRESETS' four pages and `UIStoreOptions`'
 *   table of `SelectedControllerConfig` agree (research 344 R344.4).
 *
 * `controllerConfigs` is the page's one state, as the console has one: the front end's `StoreOptions` and
 * `SetControllerConfig` write it (`./frontEnd`), `/testroom`'s card read stores into it (`./matchOptions`
 * `pageCardPlayOptions`), the START menu toggles it (`./startMenu`), and the pad's map reads it (`./gamepad`).
 */

/** The four configs' names, in `controller.rdr`'s order. */
export const CONTROLLER_CONFIG_NAMES = ['Default', 'Reverse', 'Goldeneye', 'Config4'] as const;
export type ControllerConfigName = (typeof CONTROLLER_CONFIG_NAMES)[number];

/** The digital results, in the order of the name table at 0x3f2be0 (research 85 §9; `FUN_002c67f0` D:L167143-167152). */
export const CONTROLLER_RESULTS = [
  'Action', 'AimMode', 'Fire', 'FireMode', 'Inventory', 'Jump', 'Reload', 'StrafeLeft', 'StrafeRight', 'SwapWeapon1',
  'SwapWeapon2', 'TeamCommand', 'TACMAP',
] as const;
export type ControllerResult = (typeof CONTROLLER_RESULTS)[number];

/** One mapping as `controller.rdr` writes it: the `Input`'s `Control`, its `AimMode` word when it has one ('' empty), the `Result`. */
export interface ControllerMapping { control: string; result: string; aimMode?: string }

const m = (control: string, result: string, aimMode?: string): ControllerMapping => (aimMode === undefined ? { control, result } : { control, result, aimMode });
/** The buttons every config but Goldeneye binds alike (`controller.rdr`'s Default, Reverse and Config4 rows). */
const SHARED_BUTTONS: readonly ControllerMapping[] = [
  m('L1', 'SwapWeapon1'), m('L2', 'SwapWeapon2'), m('R1', 'Fire'), m('R2', 'Inventory'), m('X', 'Action'), m('Square', 'Jump'),
  m('Circle', 'TeamCommand'), m('Select', 'TACMAP'),
];

/**
 * `RUN/READERC.ZAR :: controller.rdr`'s four `ControllerConfigs`, every mapping in the file's order (read with
 * `parseRdr`; research 344 §4). Decoded data, held to the disc by the dev-disc test. [reading]
 */
export const CONTROLLER_CONFIGS_READING: Readonly<Record<ControllerConfigName, readonly ControllerMapping[]>> = {
  Default: [
    m('LeftStickVert', 'MoveLong'), m('LeftStickHoriz', 'Strafe'), m('LeftStickTap', 'FireMode'), m('RightStickVert', 'Pitch'),
    m('RightStickHoriz', 'Rotate'), m('RightStickTap', 'Reload'), ...SHARED_BUTTONS,
  ],
  Reverse: [
    m('LeftStickVert', 'Pitch'), m('LeftStickHoriz', 'Rotate'), m('LeftStickTap', 'Reload'), m('RightStickVert', 'MoveLong'),
    m('RightStickHoriz', 'Strafe'), m('RightStickTap', 'FireMode'), ...SHARED_BUTTONS,
  ],
  Goldeneye: [
    m('LeftStickVert', 'MoveLong', 'Off'), m('LeftStickVert', 'Pitch', ''), m('LeftStickHoriz', 'Rotate'), m('LeftStickTap', 'FireMode'),
    m('RightStickVert', 'Pitch'), m('RightStickTap', 'Reload'), m('L1', 'AimMode'), m('L2', 'StrafeLeft'), m('R1', 'Inventory'),
    m('R2', 'StrafeRight'), m('X', 'Fire'), m('Square', 'TeamCommand'), m('Circle', 'Action'), m('Circle', 'Jump'), m('Select', 'TACMAP'),
  ],
  Config4: [
    m('LeftStickVert', 'MoveLong'), m('LeftStickHoriz', 'Rotate'), m('LeftStickTap', 'FireMode'), m('RightStickVert', 'Pitch'),
    m('RightStickHoriz', 'Strafe'), m('RightStickTap', 'Reload'), ...SHARED_BUTTONS,
  ],
};

/**
 * Goldeneye's digital strafes on the port's move pair's x (right positive): StrafeLeft a full push left, StrafeRight
 * right, by the results' names. `FUN_002c6110` gives StrafeLeft -1.0 and StrafeRight +1.0 (D:L166702-166713) while the
 * analogue strafe is the stick's x negated (`FUN_002c6520` D:L166959-166961); the pad block's x sign was not read
 * (research 344 §8). [reading]
 */
export const STRAFE_DIGITAL_SIGN_READING = { StrafeLeft: -1, StrafeRight: 1 } as const;

/** CONTROLLER PRESETS' pages: `PressPreset<n>`'s `SetControllerConfig(<name>)` (`dlgControllerPresets.rdr`; research 344 R344.4). */
export const PRESET_PAGE_CONFIG: Readonly<Record<1 | 2 | 3 | 4, ControllerConfigName>> = { 1: 'Default', 2: 'Reverse', 3: 'Config4', 4: 'Goldeneye' };

/** `UIStoreOptions`' table (`FUN_0027b960` D:L125232-125247): `SelectedControllerConfig` 4, 3, 2, 1 and any other value. */
export function storedControllerConfig(selected: number | undefined): ControllerConfigName {
  return selected === 4 ? 'Goldeneye' : selected === 3 ? 'Config4' : selected === 2 ? 'Reverse' : 'Default';
}

/** A stick as a record holds it: 0 none, 1 the left, 2 the right. */
export type StickSlot = 0 | 1 | 2;

/** The 0x20-byte record `FUN_002c67f0` makes of a config (research 344 §3). */
export interface ControllerConfigRecord {
  name: string;
  /** +0x0c: MoveLong's stick (its vertical). */
  moveLong: StickSlot;
  /** +0x0d: Strafe's stick (its horizontal); 0, the digital strafes. */
  strafe: StickSlot;
  /** +0x0e: Rotate's stick (its horizontal). */
  rotate: StickSlot;
  /** +0x10: the sticks Pitch sums (bit 1 the left's vertical, bit 2 the right's), AimMode not held. */
  pitch: number;
  /** +0x0f: the same while AimMode is held. */
  pitchAim: number;
  /** +0x11: MoveLong reads nothing while AimMode is held. */
  moveLongOffInAim: boolean;
  /** +0x12..: each result's control (`FUN_002c6670`'s names), null unmapped (0x10). */
  buttons: Record<ControllerResult, string | null>;
}

const stick = (control: string, vert: boolean): StickSlot => {
  if (control === (vert ? 'LeftStickVert' : 'LeftStickHoriz')) return 1;
  if (control === (vert ? 'RightStickVert' : 'RightStickHoriz')) return 2;
  return 0;
};
const same = (a: string | null | undefined, b: string): boolean => (a ?? '').toLowerCase() === b.toLowerCase();   // FUN_00198b80, case-blind

/** `FUN_002c67f0` (D:L167088-167237): a config's mappings into its record, in the mappings' order. */
export function controllerConfigRecord(name: string, mappings: readonly ControllerMapping[]): ControllerConfigRecord {
  const buttons = Object.fromEntries(CONTROLLER_RESULTS.map((r) => [r, null])) as Record<ControllerResult, string | null>;
  const r: ControllerConfigRecord = { name, moveLong: 0, strafe: 0, rotate: 0, pitch: 0, pitchAim: 0, moveLongOffInAim: false, buttons };
  for (const { control, result, aimMode } of mappings) {
    const digital = CONTROLLER_RESULTS.find((x) => same(result, x));
    if (digital) { buttons[digital] = control; continue; }                       // D:L167143-167152
    if (same(result, 'MoveLong')) {                                               // D:L167156-167171
      const s = stick(control, true);
      if (s) r.moveLong = s;
      if (aimMode !== undefined && same(aimMode, 'Off')) r.moveLongOffInAim = true;
    } else if (same(result, 'Pitch')) {                                           // D:L167174-167198
      const bit = stick(control, true);
      const off = aimMode !== undefined && same(aimMode, 'Off');
      if (aimMode === undefined || !off) r.pitchAim |= bit;
      if (aimMode === undefined || off) r.pitch |= bit;
    } else if (same(result, 'Rotate')) {                                          // D:L167201-167211
      const s = stick(control, false);
      if (s) r.rotate = s;
    } else if (same(result, 'Strafe')) {                                          // D:L167215-167225
      const s = stick(control, false);
      if (s) r.strafe = s;
    }
  }
  return r;
}

/** A node's first string (`["Default"]`), or '' for an empty value (`[]`), undefined when it is no value at all. */
function word(v: RdrNode | undefined): string | undefined {
  if (!Array.isArray(v)) return undefined;
  return typeof v[0] === 'string' ? v[0] : v.length === 0 ? '' : undefined;
}
/** A key/value list's value by key. */
const field = (list: readonly RdrNode[], key: string): RdrNode | undefined => { const i = list.indexOf(key); return i < 0 ? undefined : list[i + 1]; };

/** `controller.rdr` parsed (`parseRdr`) into its configs, as `FUN_002c5e70` walks them: each `Name` and its `Mappings`. */
export function controllerConfigsOf(root: RdrNode): { name: string; mappings: ControllerMapping[] }[] {
  const top = Array.isArray(root) && Array.isArray(root[0]) ? root[0] as RdrNode[] : [];
  const list = top[0] === 'ControllerConfigs' && Array.isArray(top[1]) ? top[1] as RdrNode[] : [];
  return list.flatMap((entry) => {
    if (!Array.isArray(entry)) return [];
    const name = word(field(entry, 'Name'));
    const maps = field(entry, 'Mappings');
    if (name === undefined || !Array.isArray(maps)) return [];
    const mappings = maps.flatMap((mp): ControllerMapping[] => {
      if (!Array.isArray(mp)) return [];
      const input = field(mp, 'Input'), result = word(field(mp, 'Result'));
      if (!Array.isArray(input) || !result) return [];
      const control = word(field(input, 'Control'));
      if (!control) return [];
      const aim = input.includes('AimMode') ? word(field(input, 'AimMode')) ?? '' : undefined;
      return [aim === undefined ? { control, result } : { control, result, aimMode: aim }];
    });
    return [{ name, mappings }];
  });
}

/**
 * The console's controller config: the loaded records, the active one, the fire-rate flag (research 344 §6). A new one
 * is the game's start (`FUN_002c5e70`): every config parsed, none swapped, Default active, `DAT_0044d500` 0 (.bss).
 */
export class ControllerConfigs {
  private records: ControllerConfigRecord[] = [];
  private current = 0;
  private flag = false;
  private changes = 0;

  constructor(private readonly configs: Readonly<Record<string, readonly ControllerMapping[]>> = CONTROLLER_CONFIGS_READING) { this.reset(); }

  /** The game's start again (`FUN_002c5e70`): for a test, or a page that boots its console again. */
  reset(): void {
    this.records = Object.entries(this.configs).map(([name, maps]) => controllerConfigRecord(name, maps));
    this.current = Math.max(0, this.records.findIndex((r) => same(r.name, 'Default')));
    this.flag = false;
    this.changes++;
  }

  /** The active config's name. */
  get active(): ControllerConfigName { return this.records[this.current]!.name as ControllerConfigName; }
  /** `DAT_0044d500`: FIRE RATE as last stored or toggled. */
  get fireModeSwap(): boolean { return this.flag; }
  /** Bumped at every change (the pad map's cache key). */
  get version(): number { return this.changes; }
  /** The active config's record, its table as it stands (a swap included). */
  record(): Readonly<ControllerConfigRecord> { return this.records[this.current]!; }

  /** `FUN_002c5d60` (D:L166503-166537): the first config of that name, case-blind, made active; none, nothing changes. */
  select(name: string | null | undefined): boolean {
    const i = name ? this.records.findIndex((r) => same(r.name, name)) : -1;
    if (i < 0) return false;
    this.current = i;
    this.changes++;
    return true;
  }

  /**
   * `UIStoreOptions`' two steps (`FUN_0027b960`), off the stored valves (`value`; one never stored reads 0, as
   * `FUN_00351ff0(name, 2)` makes it): FIRE RATE differing from the flag swaps the active config (D:L125173-125183), then
   * `SelectedControllerConfig`'s config is made active (D:L125232-125247).
   */
  store(value: (name: string) => number | undefined): void {
    const on = (value('FIREMODESWAP_CONTROLLER') ?? 0) !== 0;
    if (on !== this.flag) this.swap();
    this.flag = on;
    this.select(storedControllerConfig(value('SelectedControllerConfig')));
    this.changes++;
  }

  /** The round's START menu row 9 (`FUN_002041e0` D:L61823-61825): the flag flipped and the active config swapped. */
  toggleFireModeSwap(): void {
    this.flag = !this.flag;
    this.swap();
  }

  /** `FUN_00592050` (D:L451458-451469): FireMode's (3) and TACMAP's (12) buttons exchanged in the active config's table. */
  private swap(): void {
    const b = this.records[this.current]!.buttons;
    [b.FireMode, b.TACMAP] = [b.TACMAP, b.FireMode];
    this.changes++;
  }
}

/** The page's controller config (the console's one). */
export const controllerConfigs = new ControllerConfigs();
