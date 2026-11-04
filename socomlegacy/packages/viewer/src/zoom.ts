import { slotKindOf, type WeaponRecord } from '@s2u/scene';
import { scopeLevels } from './sights';

/**
 * The view state and its zoom (research 84 §7), ported from the SEAL body's `+0x200` byte and its three functions --
 * **with first person** (the owner's ruling of 2026-10-01, which supersedes the "no first person" ruling of 2026-09-29)
 * **and the binoculars** (the owner's yes of 2026-10-01: state 4 back as the original draws it).
 *
 * - **The states** (`FUN_005448a0`, which sets `+0x200` and the magnification `+0x204`): 0 the third-person view
 *   (1.0); 1 first person (1.01; 2 its twin on a THERMAL turret, `setMount`); 3 night vision (1.01); 4 the binoculars
 *   (9.0, with the `zoom_control` motion); 5 to 12 the weapon's scope, magnification `ZoomMode[state - 4]`
 *   (`FUN_003c5980` with `state - 4`, verified in the disassembly at 0x544adc). So the M4A1's one scope level is state
 *   5 at `ZoomMode1` 2.5x (the M4A1 SD's 3x); `ZoomMode0` (1.5 on all 86 records) is never a magnification -- it is
 *   only the look's divisor in state 4 (`FUN_005be660`).
 * - **Zoom in** (d-pad Up, `FUN_005445b0`, jump table 0x65c360: entries 0x544688, 0x544780, 0x544860, 0x544810 x2,
 *   0x544830 x7, 0x544860): 0 -> 1 (2 mounted on a THERMAL turret, 0x544688-0x544778); 2 and 12 stay (entry 0x544860). From 1, hand-decoded at 0x544780-0x54480c
 *   (the Ghidra C of this jump table is mangled): a vehicle (`body+0xeb8`), a rocket launcher (`FUN_003d1cb0` on the
 *   class, 0x91) or a launcher-round mode (`FUN_005bd7e0`) stays at 1; otherwise night maps go to 3 (`li s4,3`
 *   0x5447e4), else `lw +0x284` (NumZoomModes of the record in the hand), `sltiu 2`: two or more -> 5 (0x544804),
 *   fewer -> **4, the binoculars** (0x54480c). "Night" is `nightView`: the map flag unless a special-class flag
 *   covers the item in the hand (0x5445ec-0x54464c, then 0x5447b8: `bnez s3` skips the map flag). 3, 4 -> 5 with two or more modes, else **stay** (0x544810-0x54482c:
 *   `beqz s0` / `sltiu at,v0,2` / `bnez at` to the end with `s4` unchanged) -- so on a night map a weapon without a
 *   scope stops at the night vision and never reaches the binoculars; s >= 5 -> s + 1 while `s - 3 < NumZoomModes`. No
 *   wrap: the last level stays. State 4 is the BINOCULARS -- `ChangeReticule` type 7, the full-screen two-lens
 *   `ret_binocs` mask, the `*2binocular` motions, reCOM's `ZOOMSTATE_BINOCS` -- not a scope: every weapon of fewer than
 *   two modes reaches it, the pistol too (the disc's READERC `M62_BINOC` tutorial), and so does an item in the hand
 *   (a throwable, a charge, the Detonator): `FUN_005445b0` has no item gate and every item record on the disc has
 *   `NumZoomModes 1` (`ZWEAPON.ZAR`'s 86 records, read 2026-10-01: only the 13 scoped firearms and the unused
 *   `Binoculars` gear have more).
 * - **Zoom out** (d-pad Down, `FUN_00544400`, jump table 0x65c320): 1, 2 -> 0 (0x5444c0/c8); 3 -> 1 (0x5444d0); 4 -> 1,
 *   clearing the knock (0x5444d8: `jal FUN_005b9020`, `li s3,1`); 5 -> 1 (3 at night), clearing the knock; s > 5 -> s - 1.
 * - **What drops it**: a second round of a pull while scoped (`FUN_005c5340` 479398-479406: `+0x200 > 4` only, so not
 *   the binoculars, where no round leaves anyway); a weapon switch from the night vision (`FUN_005c4b10` 478813-478833:
 *   3 -> 1, and only 3, and only when the map is not a night mission -- the same `+0x5dc` flag, so on a night map the
 *   goggles stay on; the binoculars stay through a switch); a launcher-round mode selected while past first person
 *   (`FUN_00216770` 70387-70389: `+0x200 > 1` -> 1, the binoculars too); death (`FUN_00547af0` 413083/413095: 0, the
 *   camera at 1.0 at once -- `Zoom.reset` through `NetPage`'s `died`); a spawn, a living body's at a classic round's
 *   start too (`FUN_00599b60` -> the body's init `FUN_00553ea0` 419886-419889: 0 and 1.0, `Zoom.respawn`); the body's destructor (`FUN_005533e0` 419128: 0)
 *   and `FUN_00579720` 438329 (0; a two-body action, not identified). Into a vehicle from a view from the head: 1, or 2
 *   on a THERMAL turret (`FUN_005463c0` 412248-412254); out of a turret 2 -> 1 (`FUN_00545ee0` 412018) -- the page's
 *   turrets, `setMount` (LATER 97). Not a reload, not a stance change, not moving -- which is cut to 0.2 in the
 *   binoculars or a scope. The page's own drops (readings) go to first person: a scope left with a weapon or a hold
 *   that has none, and a raised launcher (`FUN_005445b0` keeps it at 1).
 * - **The fire** (`fireRefused`, `reloadRefused`): in state 4 the weapon's use is refused -- `FUN_005be9a0` (the round,
 *   the throw, the charge, the launcher sit under `if (+0x200 != 4)`, decomp 475303-475690) -- and so is the reload
 *   (`FUN_005c2a90` 477410: `+0x200 != 4` or no reload). The one branch outside the gate (475290-475302) is the item
 *   whose ID (the record's `+0x7c`, `cVar4`) is 0x0b, the Designator; it fires no round, and the page never holds the
 *   Designator as itself, so the refusal takes the view state only.
 * - **The night step** (`nightView`): `FUN_005445b0` 410733-410744 (0x5445ec-0x54464c), `FUN_00544400` 410638-410647
 *   and `FUN_005c4b10` 478822-478830 read two flag pairs before the map's `+0x5dc`: `DAT_00436674` on a primary
 *   (`FUN_003d1d10`) puts the night vision at `DAT_00436678`, `DAT_0043667c` on a pistol (`FUN_003d1ce0`) at
 *   `DAT_00436680`, whatever the map. All four are BSS (0x1e7000 segment, file size 0x221480, so zero at boot) and the
 *   ELF never writes them: no store by address, no pointer word to them, and the one base below them (0x436624, at
 *   0x56eec8, 0x60acd8, 0x60ade4) is read at +0x0c..+0x28 only (scanned 2026-10-01). So on the disc the gate is open and
 *   the step is the map flag; `NIGHT_OVERRIDE` holds them off.
 * - **The animation** (`FUN_001f1610` / `FUN_001f0750`): the magnification runs linearly to `+0x204` -- written only
 *   by the set, and not at all for a scope state past the record's count (411006): the old value stays -- at 3 x the
 *   target a second in (1.01 -> 2.5 in 0.2 s; 1.01 -> 9 in 0.3 s), and out at 3 x the old one. In or out is the
 *   state's way (52869-52873: `+0x201 < +0x200`), not the magnification's: the binoculars (9x) to a 3x scope run in.
 *   The camera takes its view-from-the-head preset as the run leaves 1.0 (`FUN_001f1610` 53283, 53297: `cam+0xe4` = 2),
 *   the eye `FUN_0029ae50` (research 84 §7, the audit).
 * - **The FOV**: the camera's projection scale is the magnification (`FUN_0029b2f0`: `cam+0x470/+0x474` = zoom x
 *   the aspect's 1.0), so tan(half FOV) divides by it.
 * - **The look** (`FUN_005966a0` 453807-453821): both sticks' look divided by `FUN_005be660` -- `ZoomMode[state - 4]`
 *   when that index exists, else 1 (first person and the night vision change nothing; the binoculars `ZoomMode0`, 1.5)
 *   -- and x 0.2 more in state 4 (`DAT_00650638`, read off the ELF: 0.2): 1 / 1.5 x 0.2 = 0.133 in the binoculars;
 *   the move stick x 0.2 in states 4 and up (first person: 1). The first-person bob runs in states 1-3 only (453829:
 *   `+0x200 - 1 < 2 || +0x200 == 3`), not in the binoculars nor a scope (`eyeBob`).
 * - **The HUD** (`FUN_001f6ce0` 56025-56066, `hudZoom`): `ZOOM: %2.1fx` with 9.0 in state 4 and `FUN_005be660` in 5-12
 *   -- the state's value, not the running magnification -- hidden at 1.01 and under.
 */

export type ZoomView = 'third' | 'first' | 'nightvision' | 'binoculars' | 'scope';

/**
 * LATER 97 (research 84 X10, X11, Z2, Z3): the turret the body holds (`body+0xeb8`, research 215 s7.1); null on foot.
 * `thermal` is its definition's `THERMAL` (the key at 0x3fc0d0 sets `+0xe2`, D:L301769-301771, copied to the placed
 * turret's `+0x298`, D:L300794; `@s2u/scene` `TurretDef.thermal`).
 */
export interface ZoomMount { thermal: boolean }

/**
 * What the view hands the world each frame (ruling PF.R49, research 232 §1-§2): `WorldView.frame(camera, dt, view)`.
 * **A stable shape** -- PF-30's detail pass reads the same `magnification` (research 232 §4):
 *
 * - `magnification`: the magnification on screen (`Zoom.magnification()`, the run's applied value, `DAT_003dc338`
 *   D:L52802). The world divides every LOD, detail and alpha-pass range squared by it (`LOD_SCALE_READING`,
 *   `FUN_00290aa0` D:L137045 / `FUN_0029b2f0` D:L142705).
 * - `farExtra`: the units the view state adds to the fog's far end and the far clip (`viewRangeExtra`,
 *   `FUN_001f1470` D:L53202-53255), 0 outside night vision, the binoculars and the scopes.
 */
export interface RenderView {
  magnification: number;
  farExtra: number;
}

/** The view with no zoom: nothing scaled, nothing extended (the frame's default until the page wires `renderView`). */
export const DEFAULT_RENDER_VIEW: Readonly<RenderView> = Object.freeze({ magnification: 1, farExtra: 0 });

/**
 * The view range's extension by view state (research 188 U3, 232 §2; V4 #31) [reading]: `FUN_001f0750` (D:L52842)
 * calls `FUN_001f1470(0, 0)` on every state change (D:L52939: restore), then `FUN_001f1470(200, 1)` in state 3, the
 * night vision (`DAT_003dc368`, 200.0 in `.data`, D:L53049); `FUN_001f1470(DAT_0043666c, 1)` in state 4, the
 * binoculars (D:L53075); `FUN_001f1470(DAT_00436670, 1)` in states 5-12, every scope (D:L53159). The two `.bss` floats
 * are `CMission`'s members `+0x18c` / `+0x190` (the object at 0x4364e0, constructed by `FUN_00400160` D:L328188-328189):
 * its constructor `FUN_002adbc0` writes 200.0 and 300.0 (D:L152890-152891). A mission script may override them with
 * the optional keys `SEEFARTHER_BINOCS` / `SEEFARTHER_WEAPZOOM` (`FUN_002aab20` D:L151383-151384); the number parser
 * `FUN_0032ea80` (D:L229942-229973) leaves the value unchanged when a key is absent -- not a reset to 200 / 300 -- and
 * neither key is on any of the 34 retail mission scripts (reconciliation C13, chunks 07 and 14). The night vision's
 * 200 is the `.data` constant, which no key reaches. The same extension moves the camera's MID (`+0xec`), the aim ray's
 * cap (`./fire` `cameraAimCap`, AD-1). Reading. Was: "The two are `.bss` whose writer is not found; read live they are
 * 200.0 and 300.0 in four RDRAM dumps (`rdram_viewrange.out`) -- hence a reading."
 */
export const VIEW_RANGE_EXTRA_READING = { nightvision: 200, binoculars: 200, scope: 300 } as const;

/** The units the view state adds to the fog's far and the far clip (`VIEW_RANGE_EXTRA_READING`): 0 in states 0-2. */
export function viewRangeExtra(state: number): number {
  if (state === 3) return VIEW_RANGE_EXTRA_READING.nightvision;
  if (state === BINOCULARS) return VIEW_RANGE_EXTRA_READING.binoculars;
  if (state >= 5 && state <= 12) return VIEW_RANGE_EXTRA_READING.scope;
  return 0;
}

/**
 * Whether a weapon has a scope to zoom into past first person: two or more `ZoomMode`s, so `scopeLevels` is not
 * empty -- the 13 scoped weapons (research 94 §C1.4). `FUN_005445b0` (hand-decoded 0x5447f0-0x54480c: `lw
 * v0,0x284(s0)`; `sltiu at,v0,2`) sends a weapon of fewer than two modes from first person to the BINOCULARS (state 4,
 * `ret_binocs`, 9x) instead -- the pistols, the unscoped rifles, SMGs, MGs, shotguns, the MGL and the M79.
 */
export function zoomsIn(weapon: Pick<WeaponRecord, 'zoomModes'>): boolean {
  return scopeLevels(weapon).length > 0;
}

/**
 * What is in the hand for the zoom: the firearm in one of its own fire modes; the firearm in a launcher-round mode
 * (`FUN_005bd7e0`, the M203 / GP-30 round); a raised LAW / RPG-7 (class 0x91, `FUN_003d1cb0`); an item (a throwable,
 * a charge, the Detonator). The game keeps the round and the launcher at state 1 (first person: no night vision, no
 * binoculars, no scope); an item goes on as a one-mode weapon does (`ITEM_ZOOM_MODES`), so only the firearm in its own
 * mode reaches a scope.
 */
export type ZoomHold = 'firearm' | 'round' | 'launcher' | 'item';

/**
 * `NumZoomModes` of every item record (the throwables, the charges, the Detonator, the rounds, the LAW and the RPG
 * launcher): 1 on all of them in `ZWEAPON.ZAR` (read 2026-10-01; 86 records, the 13 scoped firearms 2 or 3, the unused
 * `Binoculars` gear 2). `FUN_005445b0` reads it off the record in the hand (`FUN_005c3780`), so an item zooms from first
 * person into the binoculars and no further.
 */
export const ITEM_ZOOM_MODES = 1;

/** `FUN_005448a0`'s magnifications: third person, first person and the night vision, the binoculars. */
export const ZOOM_THIRD = 1.0;
export const ZOOM_FIRST = 1.01;
export const ZOOM_NIGHT = 1.01;
export const ZOOM_BINOCULARS = 9.0;
/** The binoculars' view state (`FUN_005b90f0`: `+0x200 == 4`). */
export const BINOCULARS = 4;
/** The zoom's speed: 3 x the target (or the old target, zooming out) a second. */
export const ZOOM_RATE = 3;
/**
 * `DAT_00650638` (`FUN_005966a0` 453813-453817; 0.2 in the ELF's bytes): the look's extra factor under `FUN_005b90f0`
 * (state 4). The move stick's own factor in the binoculars or a scope is the literal 0.2 (453818-453821); the value is
 * the same, so one constant.
 */
export const SCOPE_SLOW = 0.2;

/**
 * The special-class night flags (`DAT_00436674`/`DAT_00436678` the primaries, `DAT_0043667c`/`DAT_00436680` the
 * pistols): `null` when the enable byte is clear, else the night vision the second word forces. Never set by the ELF.
 */
export interface NightOverride { primary: boolean | null; secondary: boolean | null }
export const NIGHT_OVERRIDE: NightOverride = { primary: null, secondary: null };

/**
 * Whether the step past first person is the night vision for the item in the hand (`FUN_005445b0` 0x5445ec-0x54464c,
 * 0x5447b8-0x5447e4): the class flag when it covers the item (`FUN_003d1d10` a primary, `FUN_003d1ce0` a pistol, by
 * the ID's range), else the map's `NightMission` (`DAT_0045c380 + 0x5dc`).
 */
export function nightView(mapNight: boolean, itemId: number, o: NightOverride = NIGHT_OVERRIDE): boolean {
  const kind = slotKindOf(itemId);
  if (kind === 'primary' && o.primary !== null) return o.primary;
  if (kind === 'secondary' && o.secondary !== null) return o.secondary;
  return mapNight;
}

/** `FUN_005966a0` 453829: the first-person bob runs in view states 1, 2 and 3 (first person and the night vision). */
export function eyeBob(state: number): boolean {
  return state === 1 || state === 2 || state === 3;
}

/**
 * Whether the trigger's use is refused in a view state (`FUN_005be9a0` 475303-475305): with the binoculars up (state 4)
 * no round leaves, no grenade is thrown, no charge placed, no rocket launched -- every item but ID 0x0b (the Designator: `cVar4` is the record's `+0x7c`, its `ID`, stored by
 * `FUN_003cda30` L322435) sits under `if (*(char *)(body + 0x200) != 4)`. The page never holds the Designator as itself
 * (no firearm record: its slot fires the baked placeholder, `./loadout`), and its branch fires no round, so the view
 * state alone decides. Every other state fires.
 */
export function fireRefused(state: number): boolean {
  return state === BINOCULARS;
}

/** Whether a reload is refused (`FUN_005c2a90` 477410: the reload begins only `if (+0x200 != 4)`): the binoculars. */
export function reloadRefused(state: number): boolean {
  return state === BINOCULARS;
}

/**
 * The HUD's zoom readout for a view state (`FUN_001f6ce0` 56029-56048): 9.0 in the binoculars, `FUN_005be660` (the
 * record's `ZoomMode[state - 4]`, 1 past its count) in a scope, 0 otherwise; the HUD writes `ZOOM: %2.1fx` only over 1.01.
 */
export function hudZoom(state: number, zoomModes: readonly number[]): number {
  if (state === BINOCULARS) return ZOOM_BINOCULARS;
  if (state >= 5 && state <= 12) return state - 4 < zoomModes.length ? zoomModes[state - 4]! : 1;
  return 0;
}

export class Zoom {
  private s = 0;
  /** `+0x204`: the magnification the last set wrote (`target`). */
  private mag = ZOOM_THIRD;
  private applied = ZOOM_THIRD;
  private rate = 0;
  private hold_: ZoomHold = 'firearm';
  /** LATER 97: the turret held (`setMount`), or null. */
  private mount_: ZoomMount | null = null;

  constructor(private weapon: WeaponRecord, private night = false, private override: NightOverride = NIGHT_OVERRIDE) {}

  /**
   * A game tick ran (the page: `main.ts` after the walk's ticks): the view now is the one the next tick's switch is
   * weighed against, and the steps taken since are this tick's (`switchWeapon`).
   */
  markTick(): void {
    this.tickState = this.s;
    this.tickSteps = [];
  }
  private tickState: number | null = null;
  private tickSteps: ('in' | 'out' | 'cycle')[] = [];
  private replaying = false;

  /**
   * The kit's switch at its press (`FUN_005c4b10`: the new slot `+0x824` written at once, D:L478842, whose record the
   * zoom reads through `FUN_005c3780`): the record changes (`setWeapon`). `FUN_00594cf0` reads the shoulders
   * (D:L453288-453312) before the zoom (D:L453313-453323), so a step taken since the last tick (`markTick`) counts
   * against the new record -- and the new slot's hold (`hold`: its fire mode, `FUN_005445b0`'s state-1 gates): the view
   * goes back to the tick's, the record and the hold change, the steps run again. Returns the state, whether the steps
   * ran again, and the views passed through from the one the switch is reckoned from (the tick's when they ran again,
   * else the view now): what the page's accuracy reckons the view's effects by (`Accuracy.applyViewPath`).
   */
  switchWeapon(weapon: WeaponRecord, hold?: ZoomHold): { state: number; replayed: boolean; path: number[] } {
    const steps = this.tickSteps;
    const replayed = steps.length > 0 && this.tickState !== null;
    if (replayed) this.set(this.tickState!);
    const path = [this.s];
    this.setWeapon(weapon);
    if (hold !== undefined) this.setHold(hold);
    path.push(this.s);
    if (replayed) {
      this.replaying = true;
      try {
        for (const step of steps) {
          if (step === 'in') this.zoomIn(); else if (step === 'out') this.zoomOut(); else this.cycle();
          path.push(this.s);
        }
      } finally { this.replaying = false; }
    }
    return { state: this.s, replayed, path };
  }

  /**
   * The weapon now in the hand. `FUN_005c4b10` 478813-478833: a switch drops the night vision to first person, and
   * only it, and only off a night mission (on a night map the goggles stay); the binoculars stay. A scope left with a
   * weapon that has none drops to first person too [the page's reading: the game would read `ZoomMode[state - 4]` of
   * the new record].
   */
  setWeapon(weapon: WeaponRecord): void {
    this.weapon = weapon;
    if (this.s === 3 && !nightView(this.night, weapon.id, this.override)) this.set(1);
    if (this.s >= 5 && !this.scopes()) this.set(1);
  }

  /**
   * What is in the hand (`ZoomHold`). A launcher-round mode past first person drops to it (`FUN_00216770`
   * 70387-70389: `+0x200 > 1` -> 1, the binoculars too), and so does a raised launcher [reading: `FUN_005445b0` keeps it
   * at 1]; an item drops a scope to first person [reading] and keeps the night vision and the binoculars (`FUN_005c4b10`
   * drops neither).
   */
  setHold(hold: ZoomHold): void {
    this.hold_ = hold;
    if ((hold === 'round' || hold === 'launcher') && this.s > 1) this.set(1);
    else if (this.s >= 5 && !this.scopes()) this.set(1);
  }

  hold(): ZoomHold { return this.hold_; }

  /**
   * LATER 97: the turret held (`ZoomMount`) or null, told each frame; its edges set the view. At the mount
   * (`FUN_005463c0` D:L412247-412255) any view from the head (every state but 0) goes to 1, or to 2 on a THERMAL
   * turret, and third person stays 0. At the release (`FUN_00545ee0` D:L412018-412019) 2 goes to 1 and every other
   * view stays: no view from before the mount comes back. Returns the state before when an edge changed it, else null.
   */
  setMount(mount: ZoomMount | null): number | null {
    const was = this.mount_, before = this.s;
    this.mount_ = mount;
    if (!was && mount && before !== 0) this.set(mount.thermal ? 2 : 1);
    else if (was && !mount && before === 2) this.set(1);
    return this.s !== before ? before : null;
  }

  /** LATER 97: the turret held, or null (`setMount`). */
  mount(): ZoomMount | null { return this.mount_; }

  /** A scope is there to step into: a scoped weapon, held as a firearm in its own mode. */
  private scopes(): boolean { return this.hold_ === 'firearm' && zoomsIn(this.weapon); }

  /** `FUN_005445b0`'s state-1 gates: a raised launcher or a launcher-round mode stays at first person. */
  private staysFirst(): boolean { return this.hold_ === 'launcher' || this.hold_ === 'round'; }

  /** The night step for the record in the hand (`nightView`; an item's ID is no primary nor pistol: the map flag). */
  private nightStep(): boolean {
    return this.hold_ === 'firearm' ? nightView(this.night, this.weapon.id, this.override) : this.night;
  }

  /** Night maps: the step in past first person is the night vision (`DAT_0045c380 + 0x5dc`). */
  setNight(on: boolean): void { this.night = on; }

  /** The view state (`body+0x200`). */
  state(): number { return this.s; }

  view(): ZoomView {
    if (this.s === 0) return 'third';
    if (this.s === 1 || this.s === 2) return 'first';
    if (this.s === 3) return 'nightvision';
    if (this.s === BINOCULARS) return 'binoculars';
    return 'scope';
  }

  /** Any view from the head (first person, the night vision, the binoculars, the scope): the eye, the body hidden. */
  lens(): boolean { return this.s > 0; }

  /** First person proper (state 1, or 2 in a turret). */
  firstPerson(): boolean { return this.s === 1 || this.s === 2; }

  /** The binoculars (`FUN_005b90f0`). */
  binoculars(): boolean { return this.s === BINOCULARS; }

  /** A scope or the binoculars (`FUN_005b9990 || FUN_005b90f0`). */
  scoped(): boolean { return this.s >= BINOCULARS; }

  /** The zoom modes of the firearm's record. */
  private count(): number { return this.weapon.zoomModes.length; }

  /** `NumZoomModes` of the record in the hand, as `FUN_005445b0` reads it: the firearm's, or an item's (`ITEM_ZOOM_MODES`). */
  private handModes(): number { return this.hold_ === 'firearm' ? this.count() : ITEM_ZOOM_MODES; }

  /**
   * The magnification the state asked for when it was set (`+0x204`, the run's target: `FUN_001f0750` D:L52864). It is
   * written only by the set (`FUN_005448a0`), so a weapon switch under a scope keeps the old one, and a scope state past
   * the record's count does not write it at all (D:L411006): the magnification before stays.
   */
  target(): number { return this.mag; }

  /** The magnification on screen now (the linear run toward `target`). */
  magnification(): number { return this.applied; }

  /**
   * The frame's render view (`RenderView`): the magnification on screen and the state's view-range extra. The extra
   * follows the state at once (`FUN_001f0750` calls `FUN_001f1470` on the change, D:L52939), the magnification runs.
   */
  renderView(): RenderView { return { magnification: this.applied, farExtra: viewRangeExtra(this.s) }; }

  /** The HUD's `ZOOM:` value for the state (`hudZoom`, `FUN_001f6ce0`). */
  hudZoom(): number { return hudZoom(this.s, this.weapon.zoomModes); }

  /** d-pad Up (`FUN_005445b0`). Returns the new state. */
  zoomIn(): number {
    if (!this.replaying && this.tickState !== null) this.tickSteps.push('in');
    const s = this.s, n = this.handModes();
    let next = s;
    // 0 -> 1, or 2 mounted on a THERMAL turret (0x544688-0x544778: `lw +0xeb8`, `lbu +0x298`, `li s4,2`; research 84 Z2).
    if (s === 0) next = this.mount_?.thermal ? 2 : 1;
    // 2 (a THERMAL turret's first person) stays: the table's entry 2 is 0x544860, the set with the state unchanged.
    // Mounted, 1 stays too (0x544780-0x544784: `lw +0xeb8`, `bnez` to the set unchanged; research 84 Z3).
    else if (s === 1) next = this.mount_ || this.staysFirst() ? s : this.nightStep() ? 3 : n >= 2 ? 5 : BINOCULARS;
    else if (s === 3 || s === BINOCULARS) next = n >= 2 ? 5 : s;
    else if (s >= 5 && s <= 11 && s - 3 < n) next = s + 1;
    this.set(next);
    return this.s;
  }

  /** d-pad Down (`FUN_00544400`). Returns the new state. */
  zoomOut(): number {
    if (!this.replaying && this.tickState !== null) this.tickSteps.push('out');
    const s = this.s, n = this.count();
    let next = s;
    if (s === 1 || s === 2) next = 0;
    else if (s === 3 || s === BINOCULARS) next = 1;
    else if (s === 5) next = this.nightStep() ? 3 : 1;
    else if (s > 5 && s - 5 < n) next = s - 1;
    this.set(next);
    return this.s;
  }

  /**
   * The mouse's one button (the viewer's convenience, not the game's): zoom in, and from the last step back to the
   * third-person view -- third, first, the binoculars or the scope's levels, third. The pad keeps the game's two
   * directions.
   */
  cycle(): number {
    const before = this.s;
    const replaying = this.replaying;
    if (!replaying && this.tickState !== null) this.tickSteps.push('cycle');
    this.replaying = true;                                           // its own zoomIn is not a step of its own
    let after: number;
    try { after = this.zoomIn(); } finally { this.replaying = replaying; }
    if (after === before) this.set(0);
    return this.s;
  }

  /** Straight to a state (`FUN_005448a0`): the drops (1 on a second scoped round, 0 on death). */
  set(state: number): void {
    if (state === this.s) return;                                    // D:L410938
    const before = this.s, old = this.mag;
    this.s = state;
    // FUN_005448a0's table 0x65c3b0 (D:L410961-411019): 1.0; 1.01 for 1-3; 9.0; ZoomMode[state - 4] only when that
    // index is under the record's count (D:L411006), else +0x204 is left as it was.
    if (state === 0) this.mag = ZOOM_THIRD;
    else if (state <= 2) this.mag = ZOOM_FIRST;
    else if (state === 3) this.mag = ZOOM_NIGHT;
    else if (state === BINOCULARS) this.mag = ZOOM_BINOCULARS;
    else if (state - 4 < this.count()) this.mag = this.weapon.zoomModes[state - 4]!;
    // The run's way is the state's (FUN_001f0750 D:L52869-52873: +0x201 < +0x200 is in), not the magnification's: in,
    // FUN_001f1610 at 3 x the new target (D:L53275, D:L53289); out, at least 3 x the old target (D:L52895-52900).
    this.rate = state > before ? this.mag * ZOOM_RATE : Math.max(this.rate, old * ZOOM_RATE);
  }

  /**
   * The run toward the target, `dt` seconds: the stepper `FUN_001f0490` (D:L52783-52797). At or under the target it
   * steps up, over it down; a step that passes the target stops on it and **zeroes the rate** (D:L52788, D:L52795), so
   * the next zoom-out's max (D:L52895-52900) is taken against 0, not the last run's rate.
   */
  update(dt: number): void {
    const t = this.target();
    if (this.applied <= t) {
      const next = this.applied + this.rate * dt;
      if (next > t) { this.applied = t; this.rate = 0; } else this.applied = next;
    } else {
      const next = this.applied - this.rate * dt;
      if (next < t) { this.applied = t; this.rate = 0; } else this.applied = next;
    }
  }

  /** Straight to the target, no run (a new map, a test). */
  settle(): void { this.applied = this.target(); }

  /** The vertical FOV in degrees for a base FOV: tan(half) divided by the magnification on screen. */
  fov(baseDegrees: number): number {
    const half = (baseDegrees * Math.PI) / 360;
    return (360 / Math.PI) * Math.atan(Math.tan(half) / this.applied);
  }

  /**
   * The look's scale (`FUN_005966a0`): 1 / `ZoomMode[state - 4]` when that index exists, x 0.2 more in state 4 -- the
   * binoculars' 1 / `ZoomMode0` x 0.2 (0.133: `ZoomMode0` is 1.5 on all 86 records).
   */
  lookScale(): number {
    const i = this.s - 4;
    const z = i >= 0 && i < this.count() ? this.weapon.zoomModes[i]! : 1;
    return (z !== 0 ? 1 / z : 1) * (this.s === BINOCULARS ? SCOPE_SLOW : 1);
  }

  /** The move stick's scale: 0.2 in state 4 and up. */
  moveScale(): number { return this.s >= BINOCULARS ? SCOPE_SLOW : 1; }

  /**
   * Third person at once, no run: a new map, leaving the walk, and death (`FUN_00547af0` D:L413083-413095 sets 0, and
   * `FUN_0029b2f0(1.0)` at D:L413084 puts the camera's projection at 1.0 straight away).
   */
  reset(): void { this.tickState = null; this.tickSteps = []; this.s = 0; this.mag = ZOOM_THIRD; this.applied = ZOOM_THIRD; this.rate = 0; }

  /**
   * A spawn with `weapon` in the hand -- a respawn, and every living body at a classic round's start
   * (`FUN_00223680` L75913-75931 -> `FUN_00598b90` L455158 -> `FUN_00599b60`): the body's init (`FUN_00553ea0`
   * D:L419886-419889) writes `+0x200` 0, `+0x201` 0xff, `+0x202` 0 and `+0x204` 1.0 directly, not through
   * `FUN_005448a0`: third person, the new record in the hand. The run's applied and target magnification: at a round
   * start sourced too -- `FUN_00223680` reaches `FUN_001f1880` (D:L53345-53346: both 1.0) through `FUN_002a7d40`
   * (D:L75935) -> `FUN_001fb420` (D:L149758 -> D:L57659); at a respawn after a death (`FUN_00598b90(..., 1)`, D:L412726)
   * that path was not shown, so setting them to 1.0 there is the page's [reading] (the death already set the zoom to 0,
   * so nothing visible depends on it). That `+0x113` 3 and 5 in `FUN_00223680` mean "the next round" is a reading too:
   * inferred from its other branch being the final score's (the function sits in `CMPExitState`'s vtable, 0x405794).
   */
  respawn(weapon: WeaponRecord): void {
    this.weapon = weapon;
    this.reset();
  }
}
