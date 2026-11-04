import type { Side, Loadout } from '@s2u/scene';
import {
  MenuStick, NO_PAD, STICK, VALVE_TYPE, type ArmoryProfileCommands, type PadSlotName, type PadSnapshot, type UiDrawItem, type UiModelGeometry, type ValveStore,
} from '@s2u/ui';
import { Armory, type ArmoryCue } from './armory';
import type { ArmoryData } from './armoryData';
import { ARMORY_WHITE, WHITE_TEXEL } from './armoryLayout';
import { armorySend, type ArmorySend } from './armorySend';
import { armoryDrawList, armoryTextures } from './armoryRaster';
import { charSetOf, uiOf, type ArmoryExit, type ArmoryInput, type ArmorySound } from './armoryState';
import type { UiTextures } from './uiCompositorView';

/**
 * The game lobby's ARMORY as the shared screen (the owner's playtest of 2026-10-06: "the armory is not working
 * correctly within the lobby. no images, the one that is currently before the testroom is much closer visually -- adopt
 * what you can from it ... and make them a shared component that both use in the ways they need").
 *
 * **Why the lobby's drew no images.** It was `dlg_equipment_mp.rdr` on the generic dialog runtime, which has none of
 * the screen's data: its bitmaps are in the map archive's `WSMP` / `WSLC` banks and the character portraits in the map's
 * `EMnn` bank (`./frontEndAssets` `FRONT_END_BANKS_NOT_LOADED`: "elsewhere ... by armoryData.ts"), its `UIVAR`s (the
 * portraits, the panes' item names) are answered by no front-end row, and its selection rows (`Choose*`,
 * `ChangeCharacterType`, `UpdateSelItemValves`) are the table's stand-ins (research 167 §7, PLAT-34) -- so the columns drew
 * empty and the models stayed off. The test room's screen (`./armory`) has all of it from `./armoryData`.
 *
 * **What this module does.** When the front end's machine has built `dlg_equipment_mp.rdr` (the lobby's weaponselect
 * CROSS: `goto_eq_mp_set_return_valve`, research 167 §1), the shared `Armory` takes the screen -- its draw list (through
 * `./armoryRaster`, on the menus' rasteriser) replaces the dialog's, the pad's presses are its, the dialog's own sounds
 * are muted (the session's) -- over the mission's data (`armoryFromDisc` with the world, read in the lobby before the
 * ARMORY is chosen). The disc's dialog stays built underneath and keeps its lobby work: `UiBackToLobby` (the launch
 * count's pull-out, research 95 R95.7, 167 R167.3), `force_new_db`, the network and disk errors. The shared screen:
 * - **its world**: the map's arsenal and `mission.rdr` valves (`ENABLE_VALVE_DEFAULTS_READING`, as the test room's),
 *   the side `player_team` (0 the SEALs, 8 the terrorists; a spectator's ARMORY stays the dialog's), `EQlimit` the game's;
 * - **its choices** go to the lobby's valves as the disc's rows leave them -- `MpCharSet`, `primsel` .. `equip3sel` (the
 *   UI indices, `FUN_003d3230`) -- and are held for its next opening in the session (the test room's page holds its
 *   own the same way); it opens on them and on the account's record (CUSTOM);
 * - **its stores** are the account's records (SVC-24): Square `CharacterProfile` 1 then 3 (`StoringLoadout` ->
 *   `SaveCharacterProfile`), Circle 7 then 3 (`returnto_Defaults`), the record read back as its stored profile;
 * - **its ways out**: DONE (`OnEquipDoneBtnPress`) and Triangle on character select (`returnto_lobby`) switch to
 *   `dlgGameLobby.rdr` as the disc's scripts do; the dialog leaving (the pull-out's `SWITCHMENU`, an error's) closes it;
 * - **the pull-out**: the dialog's `UiBackToLobby` popup (#47, once the clock it waits on has ticked) is the shared
 *   screen's popup 47 (`Armory.pullOut`), which then takes every press and does nothing with it (a shown popup takes
 *   everything, `FUN_00368650`, research 182 §2.4) until the dialog's `SWITCHMENU` 5 s later; any other popup of the
 *   dialog (an error) hands the screen back to the dialog until it is left.
 * - **its sounds** are its scripts' and steps' (`ARMORY_SCRIPT_SOUNDS`), on the menus' cues; its opening `.DINK` is the
 *   lobby's script's (`goto_eq_mp_set_return_valve`), which already played it, so it is not played again.
 *
 * - **its choices reach the room** (ARMORY-SAVE, the owner: "match the original"; research 167 §7): each change goes to
 *   the seat as its `loadout` request (the `loadout` port: the game socket's, `GameSocketHost.loadout`), through the
 *   live send's debounce (`./armorySend`), flushed when the screen closes or the pull-out shows -- on the console the
 *   ARMORY's choice is the console's own kit (`OnMp{Seal,Terr}BtnPress` sets `IDFromBriefing` 1, research 95 §3.2) and
 *   the match plays it; STORE LOADOUT alone keeps it on the account. The room keeps it over the stored record at the
 *   launch (`Room` `lobbyChoice`).
 * - **what it holds for the session** (the type and kit chosen, by mission and side) is the console's `IDFromBriefing`:
 *   forgotten when the seat's side changes (`switch_teams_anim` re-arms from the record, P:L7596-7615) and when the
 *   front end leaves the game lobby and its ARMORY (the match's load drops the TEMP valve, research 309 §2.3; the
 *   BRIEFING ROOM's start zeroes it, P:L4293). While it holds one, a stored record only captions its column "CUSTOM"
 *   at the opening (`UiEquipSwitch`, `openArmory`'s `chosen`).
 * - **the stick** (AM-2, research 340 §2): the screen is a dialog of the menu framework in the original, so the left
 *   stick's flick reaches it as it reaches every dialog -- one d-pad press as an axis passes 0.6, re-armed within 0.2,
 *   no repeat (`ArmoryStick`).
 *
 * Not done here: the screen's labels are the pad's glyphs (the menus' device), never the keyboard's.
 */

/** The dialog the shared screen takes over. */
export const LOBBY_ARMORY_DIALOG = 'dlg_equipment_mp.rdr' as const;

/**
 * LOBBY_CHOICE_ABANDON_READING (ARMORY-SAVE, research 167 §6): the session's choice -- the console's `IDFromBriefing`,
 * a TEMP valve -- is gone with the match's load in every case, an abandoned match's too: the map's load drops the TEMP
 * valves (`FUN_002abd40` D:L151842 -> `FUN_00351cb0`, research 309 §2.3), so the lobby an abandoned match falls back to
 * re-arms from the record as after GAME COMPLETE. Here the page forgets it when the front end leaves the lobby and its
 * ARMORY (the match's load screen) and the room at the match's load (`Room.firstRound`). Settled by a capture of a
 * lobby choice across an abandoned match. [reading]
 */
export const LOBBY_CHOICE_ABANDON_READING = 'the choice gone with the match load, an abandoned match too' as const;
/** The game lobby, where the mission's data is read ahead. */
export const LOBBY_DIALOG = 'dlgGameLobby.rdr' as const;

/** The lobby's valves the disc's `Choose*` / `ChangeCharacterType` rows leave a choice in (research 167 R167.4), in the record's order. */
const CHOICE_VALVES = ['MpCharSet', 'primsel', 'secsel', 'equip1sel', 'equip2sel', 'equip3sel'] as const;

/** The pad's slots the screen reads (its controls' `BUTTON` bindings). */
const PAD_INPUT: Partial<Record<PadSlotName, ArmoryInput>> = {
  UP: 'up', DOWN: 'down', LEFT: 'left', RIGHT: 'right', CROSS: 'cross', CIRCLE: 'circle', SQUARE: 'square', TRIANGLE: 'triangle',
};

/** `FUN_0036a060`'s answer (`STICK`) to the d-pad press it stands for at a BUTTON control (`FUN_00377040` D:L271900-271915). */
const STICK_INPUT: Readonly<Record<number, ArmoryInput>> = { [STICK.UP]: 'up', [STICK.DOWN]: 'down', [STICK.LEFT]: 'left', [STICK.RIGHT]: 'right' };

/**
 * ARMORY_STICK_ARMING_READING (research 340 §2.3): the stick's arming (`DAT_003e0368`, one global of the menu framework)
 * runs at the top of every dispatch (`FUN_00368650` D:L263829-263849), and the dispatch runs only on a frame that is not
 * suspended (`FUN_003654c0` D:L262264-262269, R116.9). While the shared screen is open its own suspension stands for
 * the dispatch's (`Armory.taking`); before it opens -- the lobby's frames -- the arming runs at every read, where the
 * original's runs at the lobby's unsuspended dispatches only (the session's own stick, `MenuInput.stick`, is the
 * lobby's, and this one is not shared with it). So a stick held from the lobby into the screen is no flick, as a button
 * held from it is no press. [reading]
 */
export const ARMORY_STICK_ARMING_READING = 'armed at every read before the screen; at each unsuspended read while it is open' as const;

/**
 * ARMORY_STICK_SAME_FRAME_READING (research 340 §2.3): a frame with a button pressed hands the screen no flick. The
 * original's focused BUTTON control fires the first of its bindings, in the file's order, that matches the frame's
 * button bytes or the flick (`FUN_00377040` D:L271888-271930), one a frame. A flick the same way as the d-pad press is
 * the one binding either way; a flick another way with a button pressed is the binding that comes first in the file in
 * the original (`EquipWeaponBtn` binds SQUARE, UP, DOWN, LEFT, CIRCLE, RIGHT, TRIANGLE in that order) and the press here.
 * And CROSS (the review's F3): the control takes it through its vtable +0x74 before the binding loop (D:L271883-271885),
 * so CROSS with a flick does both in the original; here the CROSS, and no flick. [reading]
 */
export const ARMORY_STICK_SAME_FRAME_READING = 'a frame with a press takes no flick' as const;

/**
 * The left stick on the ARMORY (AM-2, research 340 §2): `dlg_equipment_mp.rdr` is a dialog of the menu framework, run
 * by its dispatch `FUN_00368650` (D:L263804-264248) like every front-end dialog. Its d-pad bindings are its BUTTON
 * controls' (`EquipMpSealBtn` / `EquipMpTerrBtn` and `EquipWeaponBtn` UP, DOWN, LEFT and RIGHT; `EquipMPDoneBtn` UP and
 * DOWN), and none carries a `STATE` -- every one is FALLING, the press (the disc's layout, research 340 §2.2). A focused BUTTON
 * control fires a FALLING UP / DOWN / LEFT / RIGHT binding on the stick's flick as on the press (`FUN_00377040`
 * D:L271900-271915, `FUN_0036a060` D:L264743-264799; research 116 R116.10). So a flick is that d-pad press here: one
 * step as an axis passes 0.6 from an armed stick, re-armed once both axes are back within 0.2, never a held repeat; the
 * diagonals settle as `MenuStick.direction` does (research 116 §7). The stick is in the game's signs (x positive left,
 * y positive up: `PadSnapshot`, `./menuInput` `MENU_STICK_READING`).
 */
export class ArmoryStick {
  private readonly stick = new MenuStick();

  /**
   * One read: armed when the dispatch would run (`dispatching`, `ARMORY_STICK_ARMING_READING`); the d-pad input the flick
   * stands for, or null.
   */
  read(x: number, y: number, dispatching: boolean): ArmoryInput | null {
    if (!dispatching) return null;
    this.stick.arm(x, y);
    return STICK_INPUT[this.stick.direction()] ?? null;
  }
}

export interface LobbyArmoryPorts {
  /** The mission's data with its world (`armoryFromDisc(source, missionMapPath(m), M, { models: false, world: true })`); null when it will not read. */
  load(mission: string): Promise<ArmoryData | null>;
  /** The UI models' geometry and textures, as the menus read them (`./menuArt`). */
  model(name: string): UiModelGeometry | null;
  modelTextures: UiTextures;
  /** The front end's valves (the lobby's `player_team`, `EQlimit`, the choice valves). */
  valves(): ValveStore;
  /** A UI variable's string (`GAMENAMEVAR`, `MEDIUS_LOBBY_NAME`), or null. */
  uiVar(name: string): string | null;
  /** The account's records (`@s2u/ui`'s `ArmoryProfileCommands`, the lobby's). */
  profile: Pick<ArmoryProfileCommands, 'record' | 'mode'>;
  /** The game's mission (`GameLobbyCommands.missionName`), '' with none. */
  mission(): string;
  /** A sound of the screen, on the menus' cues: a script's `SOUND` with its own volume, pan and pitch (`cue`). */
  sound(name: ArmorySound, cue?: ArmoryCue): void;
  /** DONE or Triangle: `SWITCHMENU(dlgGameLobby.rdr)` on the front end's queue. */
  back(): void;
  /**
   * ARMORY-SAVE: a choice to the room as the seat's next type and kit (`char` the column within the side, `picks` the
   * steps that reach its kit): the game socket's `loadout` request. Absent, the choice stays on the page.
   */
  loadout?(side: Side, choice: { char: number; picks: readonly { slot: number; id: number }[] }): void;
}

type Phase = 'idle' | 'open' | 'left' | 'yielded';

export class LobbyArmory {
  readonly armory: Armory;
  /** The textures the draw list names (`./armoryRaster`). */
  readonly textures: UiTextures;
  private phase: Phase = 'idle';
  private time = 0;
  private data: { mission: string; got: ArmoryData | null; done: boolean } | null = null;
  private bitmaps = new Map<string, { width: number; height: number; data: Uint8ClampedArray }>();
  private sizes: Record<string, { width: number; height: number }> = {};
  private prev: ReadonlySet<PadSlotName> | null = null;
  /** The left stick's flick (`ArmoryStick`), armed across the lobby's reads and the screen's. */
  private readonly stick = new ArmoryStick();
  /** The type and kit chosen in this session, by `MISSION:side` (what `Armory.open` takes as the page's). */
  private readonly held = new Map<string, { type: number; kit: Loadout }>();
  private pulled = false;
  private opening = false;
  private leaving = false;
  /** The screen's last frame, kept up after DONE or Triangle until the dialog is left (`left`). */
  private shown: UiDrawItem[] = [];
  /** ARMORY-SAVE: the changes on their way to the room (`loadout`), the last one in the debounce taken. */
  private readonly send: ArmorySend<{ exit: ArmoryExit; side: Side }>;
  /** The seat's side the session's choices were held for: another side forgets them (SWITCH TEAMS). */
  private heldSide: Side | null = null;

  constructor(private readonly o: LobbyArmoryPorts) {
    this.armory = new Armory({
      clock: () => this.time,
      change: (exit, side) => { this.choose(exit, side); },
      closed: () => { this.closed(); },
      sound: (name, cue) => { if (!(this.opening && name === '.DINK')) o.sound(name, cue); },
      store: {
        // The account's record of the game's mission and the seat's side (the key the screen asks by is the test room's).
        get: () => { const p = o.profile.record(); return p ? JSON.stringify(p) : null; },
        set: (_key, value) => { this.store(value); },
      },
      names: () => ({ game: o.uiVar('GAMENAMEVAR') ?? '', room: o.uiVar('MEDIUS_LOBBY_NAME') ?? '' }),
      device: () => 'pad',
      modelParts: (m) => o.model(m)?.parts.map((p) => p.node) ?? null,
    });
    this.textures = armoryTextures(this.bitmaps, o.modelTextures);
    this.send = armorySend((c) => { o.loadout?.(c.side, { char: c.exit.type, picks: c.exit.picks }); });
  }

  /** A lobby valve's value, read without making or promoting it (`find`, not `acquire`); null when it is not held. */
  private valve(name: string): number | null { return this.o.valves().find(name)?.value ?? null; }
  private setValve(name: string, value: number): void {
    const v = this.o.valves();
    v.acquire(name, VALVE_TYPE.PERM);
    if (v.find(name)?.value !== value) v.set(name, value, VALVE_TYPE.PERM);
  }

  private side(): Side | null {
    const team = this.valve('player_team');
    return team === 0 ? 'seal' : team === 8 ? 'terrorist' : null;
  }

  /** The mission's data read once (a new mission, read again). */
  private want(mission: string): void {
    if (mission === '' || this.data?.mission === mission) return;
    const entry: { mission: string; got: ArmoryData | null; done: boolean } = { mission, got: null, done: false };
    this.data = entry;
    this.o.load(mission).then((d) => { entry.got = d; }, () => { entry.got = null; }).finally(() => { entry.done = true; });
  }

  /** The data for the game's mission, when in and whole (a layout, a roster, a world). */
  private ready(): ArmoryData | null {
    const d = this.data, mission = this.o.mission();
    if (!d || d.mission !== mission || !d.done || !d.got?.layout || !d.got.roster || !d.got.world) return null;
    return d.got;
  }

  /**
   * Whether the shared screen has `dialog` now or takes it on this frame: open, or the ARMORY built with its data in for
   * a seat of a side. The session mutes the dialog's own sounds while it does.
   */
  owns(dialog: string | null): boolean {
    if (this.phase === 'open' || (this.phase === 'left' && dialog === LOBBY_ARMORY_DIALOG)) return true;
    return this.phase === 'idle' && dialog === LOBBY_ARMORY_DIALOG && this.ready() !== null && this.side() !== null;
  }

  /**
   * Whether the shared screen is up (it draws, it takes the pad): open, or closed by DONE or Triangle with the dialog
   * not yet left -- its last frame stays up and the pad reaches nothing (the dialog underneath never shows, the
   * generic runtime's without the images, for the frames before `SWITCHMENU` builds the lobby).
   */
  hosting(): boolean { return this.phase === 'open' || this.phase === 'left'; }

  /**
   * One front-end frame, after the machine's: `dialog` the shell's current dialog, `popupShown` whether its popup shows.
   * Reads the mission's data in the lobby; opens over the ARMORY's dialog; closes when the dialog is left; the pull-out.
   */
  frame(dt: number, dialog: string | null, popupShown: boolean): void {
    this.time += dt;
    // ARMORY-SAVE: the session's choices are the console's IDFromBriefing -- gone with the game lobby (a dialog that is
    // neither it nor its ARMORY: the match's load screen, the BRIEFING ROOM) and with a change of side.
    const side = this.side();
    if ((dialog !== null && dialog !== LOBBY_DIALOG && dialog !== LOBBY_ARMORY_DIALOG) || (side !== null && this.heldSide !== null && side !== this.heldSide)) {
      this.send.flush();
      this.held.clear();
    }
    if (side !== null) this.heldSide = side;
    if (dialog === LOBBY_DIALOG || dialog === LOBBY_ARMORY_DIALOG) this.want(this.o.mission());
    if (dialog !== LOBBY_ARMORY_DIALOG) {
      if (this.phase === 'open') { this.leaving = true; this.armory.close(); this.leaving = false; }
      this.phase = 'idle';
      this.shown = [];
      return;
    }
    if (this.phase === 'idle' && this.owns(dialog)) this.open();
    if (this.phase !== 'open') return;
    if (popupShown && !this.pulled) {
      // `UiBackToLobby` shows popup 47 once the clock it copied into ArmoryClock has ticked; any other popup is an error's.
      const clock = this.valve('ArmoryClock');
      if (clock !== null && clock !== this.valve('mp_x_sec_clock')) { this.pulled = true; this.armory.pullOut(); this.send.flush(); }
      else { this.leaving = true; this.armory.close(); this.leaving = false; this.phase = 'yielded'; return; }
    }
    this.armory.frame(dt);
  }

  private open(): void {
    const data = this.ready(), side = this.side();
    if (!data || !side || !data.world) return;
    const mission = this.o.mission().toUpperCase();
    for (const [n, rgba] of data.bitmaps) this.bitmaps.set(n.toLowerCase(), rgba);
    this.sizes = { [ARMORY_WHITE]: { width: WHITE_TEXEL.width, height: WHITE_TEXEL.height } };
    for (const [n, rgba] of this.bitmaps) this.sizes[n] = { width: rgba.width, height: rgba.height };
    this.armory.setData(data);
    this.armory.setWorld({ arsenal: data.world.arsenal, valves: data.world.valves, side, map: mission, archive: data.archive, eqLimit: this.valve('EQlimit') ?? 0 });
    this.pulled = false;
    this.opening = true;
    const held = this.held.get(`${mission}:${side}`) ?? null;
    const opened = this.armory.open(held, { chosen: held !== null });   // ARMORY-SAVE: a choice since the lobby's entry stands
    this.opening = false;
    this.phase = opened ? 'open' : 'yielded';
  }

  /**
   * A change made (live): held for the screen's next opening on this mission and side (the type and kit the session
   * holds, as the original's characters keep a choice in memory for the session), and the lobby's valves as the disc's
   * rows leave them.
   */
  private choose(exit: ArmoryExit, side: Side): void {
    this.held.set(`${this.o.mission().toUpperCase()}:${side}`, { type: exit.type, kit: exit.kit });
    this.send.push({ exit, side });                                          // ARMORY-SAVE: to the room, as the seat's own
    const values = [charSetOf(side, exit.type), ...exit.kit.map((id) => uiOf(id))];
    CHOICE_VALVES.forEach((n, i) => { this.setValve(n, values[i]!); });
  }

  /** The screen's store: a record (Square: modes 1 and 3) or its valid byte cleared (Circle: 7 and 3). */
  private store(value: string): void {
    let p: { charSet?: unknown; items?: unknown; valid?: unknown };
    try { p = JSON.parse(value) as typeof p; } catch { return; }
    if (p.valid === false) { this.o.profile.mode(7); this.o.profile.mode(3); return; }
    if (typeof p.charSet === 'number' && Array.isArray(p.items)) {
      [p.charSet, ...(p.items as number[])].forEach((v, i) => { if (CHOICE_VALVES[i]) this.setValve(CHOICE_VALVES[i]!, v); });
    }
    this.o.profile.mode(1);
    this.o.profile.mode(3);
  }

  private closed(): void {
    this.send.flush();                                                       // ARMORY-SAVE: the screen left: the last change now
    if (this.phase !== 'open') return;
    this.phase = 'left';
    if (!this.leaving) this.o.back();
  }

  /**
   * The pad read for this frame, every frame (the session hands it each read, so a button held into the screen from
   * the lobby -- the CROSS that chose the ARMORY -- is no press): a slot down now and not at the read before is one step,
   * while the screen is up; none while popup 47 shows. The left stick's flick is the d-pad press it stands for
   * (`ArmoryStick`): armed at every read but a suspended one of the open screen (`ARMORY_STICK_ARMING_READING`), handed
   * on in a frame with no press (`ARMORY_STICK_SAME_FRAME_READING`).
   */
  pad(snap: PadSnapshot = NO_PAD): void {
    const was = this.prev;
    this.prev = new Set(snap.down);
    const flick = this.stick.read(snap.stickX, snap.stickY, this.phase !== 'open' || this.armory.taking());
    if (this.phase !== 'open' || was === null || this.pulled) return;
    let pressed = false;
    for (const b of snap.down) {
      const input = PAD_INPUT[b];
      if (input && !was.has(b)) { pressed = true; this.armory.input(input); }
    }
    if (flick && !pressed) this.armory.input(flick);
  }

  /** A tap at a frame point (640 x 448): the presses under it (`armoryTap`); none while popup 47 shows. */
  tap(x: number, y: number): boolean {
    if (this.phase !== 'open' || this.pulled) return false;
    return this.armory.tap(x, y);
  }

  /** The screen's frame as the front end's draw list (`./armoryRaster`); its last one while it is `left`. */
  drawList(): UiDrawItem[] {
    if (this.phase === 'left') return this.shown;
    if (this.phase !== 'open') return [];
    return (this.shown = armoryDrawList(this.armory.quads(this.sizes), this.armory.models(), this.sizes, (n) => this.o.model(n)));
  }
}
