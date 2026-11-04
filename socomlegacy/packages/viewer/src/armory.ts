import {
  CAMPAIGN_UNLOCKS_EARNED_RULING, campaignUnlockValves, fourthArmoryTypeOpen, locTable, menuValves, slotLocked, type Arsenal, type FontFace, type Loadout, type LocTable, type Side, type UiCommand, type UiLayout, type UiOp, type UiText,
} from '@s2u/scene';
import type { ArmoryData } from './armoryData';
import { equipmentLimitKit, equipmentLimitValves } from './equipmentLimit';
import {
  armoryModels, armoryNodes, armoryQuads, armoryTree, boundsOf, captionText, decodePopup, faceWidth, modelPartStates, placeOf, type ArmoryQuad, type PopupRecord, type ShownModel,
} from './armoryLayout';
import { startTeletype, stepTeletype, teletypeDone, teletypeLines, teletypeSpec, type Teletype } from './armoryText';
import {
  activeColumn, armoryValves, charSetOf, closeArmory, columnCount, DONE_ROW, nextRow, openArmory, popupOf, pullOut, reachable, SELECTION_SOUND, stepArmory,
  takesInput, tickArmory, type ArmoryContext, type ArmoryEvents, type ArmoryExit, type ArmoryInput, type ArmoryProfile,
  type ArmorySound, type ArmoryState,
} from './armoryState';
export type { ArmoryExit } from './armoryState';
import type { PadButton } from './gamepad';
import type { TipStore } from './mobileTip';
import { ARMORY_SERVER_NAME_READING } from './net/protocol';
import { UiRunner, type UiHost } from './uiScript';

/**
 * The pre-round ARMORY in the page (web sprint 5, S3; socomlegacy/docs/research/95; W5.R1-R4): the pure state
 * (`./armoryState`) stepped by the pad, the keys, the mouse and the touch screen; the dialog's scripts played for its
 * looks (`./uiScript` over `./armoryLayout`'s objects); the save kept in this browser; the choice handed to the page
 * through web sprint 5 S2's seam when the screen is left.
 *
 * - **When it opens** (W5.R1; the page's `./main` decides): on a seat the room opens it on -- a first seat, a ghost's, a
 *   waiting room's, a promotion's (`ARMORY_SEAT_READING`, `../../match/src/room`) -- and in the offline local match
 *   before its room is made, once a map; the round's start closes it. Nothing in the match opens it again (the owner's
 *   ruling of 2026-10-02, INT.R3: the game's ARMORY is the lobby's, research 95 §4.1; the in-game swap and WEAPON
 *   EXCHANGE take the Inventory button), so a seat is the only place the character type changes until the lobby.
 * - **While it is open** the game's input is the menu's: every key but Esc, every pad button (`input`); the page holds
 *   its own lanes (the camera, the walk, the peek, the map, the scoreboard, the sticks) off it.
 * - **Live** (the S3 review's ruling): each change of the committed type or its kit goes to `change` as it is made --
 *   `setCharacterType` and the side's picks, which the room validates (protocol 9); leaving (DONE, Triangle on
 *   character select, the round's start) simply closes.
 * - **The save** (W5.R4 as amended, R95.4): one record per map and side, the type inside it, in `localStorage` behind a
 *   guard -- a storage that throws or holds nothing reads as no profile, and a write that throws is dropped.
 * - **Sounds** are named (`ArmorySound`) and handed to `sound`, which the page plays from `HUDUI.bnk` (the UI bank,
 *   research 95 §3.9; `UI_BANK_PLACEHOLDER`): every `SOUND` the scripts run (`ARMORY_SCRIPT_SOUNDS`), the three
 *   implicit cues (`ARMORY_IMPLICIT_CUES`), the steps' .DINK and .SLIDE where their script is not run
 *   (`ARMORY_STATE_SOUNDS`, `./armoryState`), the typed description's .TYPE (`./armoryText`).
 * - **The preview** (S3 part 2): the models the scripts show and their spin (`models`, drawn by `./armoryView`); the
 *   stat bars, the fire mode, the name and the tips are the scripts' captions and scales over the layout
 *   (`./armoryLayout`); the WEAPON DATA description is typed out here, a run per caption (`./armoryText`).
 * - **The padlocks** are `TurnOnPadlocks1`'s as the disc has it, the SEAL 3 / SEAL 4 swap kept by ruling
 *   (`ARMORY_PADLOCK_SEAL34_SWAP_READING`); `UiCharLocked` is answered from the state (`DoAllSelCharsHaveLockedEquip*`).
 * - **No countdown of its own**: the ARMORY draws no launch count (R95.7: the pull-out's popup 47 is the source's,
 *   `pullOut`). `OnlyModes` captions the created game's `EQlimit` 1-4; unrestricted rooms leave the native line blank
 *   (research 362).
 */

/**
 * ARMORY_SCRIPT_SOUNDS (research 182 §2.21, research 122 R122.6/R122.13; was ARMORY_SCRIPT_SOUNDS_READING, .NEG alone):
 * the original plays every `SOUND` command its scripts run -- `dlg_equipment_mp.rdr`'s 14 .DINK, `ShowAndSpin.rdr`'s
 * 2 .SLIDE and 43 .NEG -- so every one reaches the page; the steps voice only the sounds of the scripts the page does
 * not run (`ARMORY_STATE_SOUNDS`), so nothing sounds twice.
 */
export const ARMORY_SCRIPT_SOUNDS = 'every SOUND' as const;

/**
 * ARMORY_IMPLICIT_CUES (research 182 §3, research 122 R122.6-R122.7, R122.13): the three cues no `SOUND` carries --
 * `ActivateButton` plays SELECTION when the named control is found (`FUN_00366b60` D:L262964-263016), `PopUpDialog` plays
 * `.METAL` (`FUN_0027eff0` D:L126897-126900; the confirm 1245 and the pull-out 47 alike), and the popup's LEFT, RIGHT and
 * CROSS play SELECTION (`./armoryState`, `FUN_00370990`).
 */
export const ARMORY_IMPLICIT_CUES = ['ActivateButton', 'PopUpDialog', 'the popup\'s keys'] as const;

/**
 * ARMORY_MENU_KEYS_READING: the PC keys inside the ARMORY -- W/S/A/D or the arrows the d-pad, Enter, X or Space Cross,
 * Backspace Triangle, R Circle ("restore the defaults"), V Square ("save"); Esc is left alone (it releases the mouse).
 * The instruction lines draw these keys in place of the pad glyphs on a keyboard (`ARMORY_KEY_LABELS`); a pad and a
 * touch screen keep the game's glyphs (a touch player taps the line's glyphs: `ARMORY_TOUCH_READING`). For the owner.
 */
export const ARMORY_MENU_KEYS_READING: Readonly<Record<string, ArmoryInput>> = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Enter: 'cross', NumpadEnter: 'cross', KeyX: 'cross', Space: 'cross', Backspace: 'triangle', KeyR: 'circle', KeyV: 'square',
};
/** The labels a keyboard player reads in place of the pad glyphs (0xA6 cross, 0xAC triangle, 0xB4 square, 0xB7 circle). */
export const ARMORY_KEY_LABELS: Readonly<Record<number, string>> = { 0xa6: '[ENTER]', 0xac: '[BKSP]', 0xb4: '[V]', 0xb7: '[R]' };
/** The pad's buttons the screen reads (the controls' `BUTTON` bindings; Start and Select are no binding of it). */
export const ARMORY_PAD: Readonly<Partial<Record<PadButton, ArmoryInput>>> = {
  Up: 'up', Down: 'down', Left: 'left', Right: 'right', Cross: 'cross', Circle: 'circle', Square: 'square', Triangle: 'triangle',
};

/** The screen's ONSTART animations the page runs (the layout's `ANIMATIONS`), less the one whose work is the page's. */
export const HOST_ONSTART: ReadonlySet<string> = new Set([
  // `UiBackToLobby` polls the launch clock, which the page answers with `pullOut` (S7, `ARMORY_CLOCK_READING`).
  // `net_monitor` (UIanim.rdr) runs: its lights hang from the dialog's root (`ABSENT_PARENT_READING`).
  'UiBackToLobby',
]);

/**
 * ARMORY_GAME_NAME_READING (research 95 §8): the title bar's `GAMENAMEVAR`, the game's name as its host made it (Create
 * Game, UIMnLOC 227 "GAME NAME"). The viewer has no Create Game: online the room's name (the map's, which names the
 * room); the offline match has none, and no UIMnLOC string names one, so it is blank -- no words invented.
 */
export const ARMORY_GAME_NAME_READING = 'the room (the map) online; blank offline' as const;

/**
 * The title bar's two names (the controller's ruling under the owner's mandate, 2026-10-01; research 95 §2.2): online the
 * match server's name (`MEDIUS_LOBBY_NAME`, the `roomname` line: ARMORY_SERVER_NAME_READING, the welcome's `server`, the
 * default before one) over the room's (`GAMENAMEVAR`, `gamename_val`: ARMORY_GAME_NAME_READING); offline both blank --
 * no server, and no UIMnLOC string names an offline game.
 */
export function armoryNames(o: { online: boolean; server: string | null; room: string }): { game: string; room: string } {
  if (!o.online) return { game: '', room: '' };
  return { game: o.room, room: o.server ?? ARMORY_SERVER_NAME_READING };
}

/** The saved loadout's key (W5.R4 as amended; `ARMORY_PROFILE_KEY_READING`): the map and the side, the type in the record. */
export function profileKey(map: string, side: Side): string {
  return `s2u.armory.v1.${map.toUpperCase()}.${side}`;
}

/** A stored record read back, or null (nothing, unparsable, or not a record). */
export function parseProfile(raw: string | null): ArmoryProfile | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<ArmoryProfile>;
    if (!Number.isInteger(p.charSet) || !Array.isArray(p.items) || p.items.length !== 5 || !p.items.every((i) => Number.isInteger(i))) return null;
    return { charSet: p.charSet!, items: p.items as ArmoryProfile['items'], valid: p.valid === true };
  } catch { return null; }
}

/**
 * ARMORY_PANE_TEXT (research 182 §2.14, verified by V4 #6; was ARMORY_PANE_TEXT_READING, 'DisplayName'): the panes'
 * `Char<n>{Primary,Secondary}WeaponDescr`/`Equip<k>Descr` UIVARs are each item's `Description` (`FUN_002af190`
 * D:L153580-153640 via `FUN_003d2820` / `FUN_003d2ac0`): FRAG, not M67; empty, `FULL_SLOT` and LAW HEAT blank.
 */
export const ARMORY_PANE_TEXT = 'Description' as const;

export interface ArmoryWorld {
  arsenal: Arsenal;
  valves: ReadonlyMap<string, number>;
  side: Side;
  /** The map's stem (`MP2`): the save's key. */
  map: string;
  /** The map archive shown (`LoadedMap.archive`): the screen opens only on data read for it (`ArmoryData.archive`). */
  archive: string;
  /**
   * `EQlimit`, the game's weapon restriction (research 182: the joined game's record byte +0x19f online; `GameLobbyCommands`
   * sets the valve from the game's 'D'[5]); absent, 0 -- the test room's, which has no Create Game.
   */
  eqLimit?: number;
}

/** A script `SOUND`'s own play arguments (`FUN_002659c0` D:L112412-112422): its volume, pan and pitch, else 1.0, -1, 0. */
export interface ArmoryCue { volume: number; pan: number; pitchMod: number }

/** The play arguments of a script's `SOUND` command (`@s2u/ui` `decodeUiSoundCommand`'s defaults where a flag is off). */
export function armoryCueOf(op: Extract<UiOp, { op: 'sound' }>): ArmoryCue {
  return { volume: op.volume ?? 1, pan: op.pan ?? -1, pitchMod: op.pitchMod ?? 0 };
}

export interface ArmoryDeps {
  clock(): number;
  /** The committed type or its kit changed (live): the type and its picks, for the next spawn (S2's seam). */
  change(exit: ArmoryExit, side: Side): void;
  /** The screen has closed (whatever the way). */
  closed?(): void;
  /**
   * A sound the screen plays (S3 part 2 wires the UI bank); a script's `SOUND` comes with its own volume, pan and pitch
   * (the command's, `ArmoryCue`), the code's cues without (the play's 1.0, -1, 0).
   */
  sound?(name: ArmorySound, cue?: ArmoryCue): void;
  /** The browser's store (`./mobileTip` `storeOf(localStorage)`): guarded. */
  store?: TipStore & { remove?(key: string): void };
  /** The game's and the room's names (`GAMENAMEVAR`, `MEDIUS_LOBBY_NAME`). */
  names?(): { game: string; room: string };
  /** Which device's labels the lines draw. */
  device?(): 'pad' | 'keyboard' | 'touch';
  /**
   * A preview model's node names (`ARMORY_MODEL_PART_REF`), or null for a model not held: the game lobby's page answers
   * from the front end's decode (`./menuArt`); absent, the data's own decoded models (the test room's worker's).
   */
  modelParts?(model: string): readonly string[] | null;
  /**
   * The campaign's unlocks earned (the eight `Set<Name>` card valves 1, `@s2u/scene` `campaignUnlockValves`): absent,
   * the owner's ruling OT.R91 (`CAMPAIGN_UNLOCKS_EARNED_RULING`); false, the original's fresh card (the tests' seam).
   */
  campaignUnlocks?: boolean;
}

const DESCR = /^Char([1-8])(PrimaryWeapon|SecondaryWeapon|Equip1|Equip2|Equip3)Descr$/;
const DESCR_SLOT: Readonly<Record<string, number>> = { PrimaryWeapon: 0, SecondaryWeapon: 1, Equip1: 2, Equip2: 3, Equip3: 4 };

export class Armory {
  private data: ArmoryData | null = null;
  private loc: LocTable = locTable([]);
  private world: ArmoryWorld | null = null;
  private ctx: ArmoryContext | null = null;
  private st: ArmoryState | null = null;
  private runner: UiRunner | null = null;
  private popups = new Map<number, PopupRecord>();
  /** The bitmaps' sizes the last frame was drawn with (the taps read what was drawn). */
  private sizes: Record<string, { width: number; height: number }> = {};
  /** Each TELETYPE's run (lower-case name), and the caption it types: a new caption starts a new run. */
  private typing = new Map<string, { caption: UiText | null; run: Teletype }>();

  constructor(private readonly deps: ArmoryDeps) {}

  /**
   * The screen's disc data (the worker's `armory` answer), or none: without a layout the screen never opens. New data
   * closes an open screen (it was drawn from the old).
   */
  setData(data: ArmoryData | null): void {
    if (this.isOpen() && data !== this.data) this.close();
    this.data = data;
    this.loc = locTable(data?.strings ?? []);
    this.popups.clear();
    for (const set of data?.scripts ?? []) {
      for (const p of set.programs) for (const q of p.sequences) for (const op of q.ops) {
        if (op.op === 'ui' && op.popup) { const r = decodePopup(op.command.extra); if (r && !this.popups.has(r.textId)) this.popups.set(r.textId, r); }
      }
    }
    this.refreshContext();
  }

  /** The match's world (the arsenal, the valves, the side, the map), or none; a change closes the screen, applying nothing. */
  setWorld(world: ArmoryWorld | null): void {
    const same = world && this.world && world.arsenal === this.world.arsenal && world.valves === this.world.valves && world.side === this.world.side && world.map === this.world.map && world.archive === this.world.archive && (world.eqLimit ?? 0) === (this.world.eqLimit ?? 0);
    if (same) return;
    this.world = world;
    if (this.isOpen()) this.close();
    this.refreshContext();
  }

  private refreshContext(): void {
    const w = this.world, roster = this.data?.roster;
    // The data must be the map's own: a map shown since the data was asked for has other portraits, types and kits.
    if (!w || !this.data?.layout || !roster || this.data.archive !== w.archive) { this.ctx = null; return; }
    const limit = w.eqLimit ?? 0;
    const kits = roster.characters.filter((c) => c.side === w.side).sort((a, b) => a.index - b.index).map((c) => equipmentLimitKit(c.loadout, w.valves, w.side, limit));
    this.ctx = kits.length ? { arsenal: w.arsenal, valves: equipmentLimitValves(w.valves, limit), side: w.side, kits, fourthOpen: fourthArmoryTypeOpen(w.valves, this.unlocks()), eqLimit: limit, comeFromLan: false } : null;
  }

  /** OT.R91: whether the campaign's unlocks read earned (`ArmoryDeps.campaignUnlocks`, else the ruling). */
  private unlocks(): boolean { return this.deps.campaignUnlocks ?? CAMPAIGN_UNLOCKS_EARNED_RULING; }

  /** Whether the screen can open: the layout and the roster read for the map shown, the match's world. */
  ready(): boolean { return this.ctx !== null; }
  isOpen(): boolean { return this.st !== null && this.st.screen !== 'closed'; }
  state(): ArmoryState | null { return this.st; }
  context(): ArmoryContext | null { return this.ctx; }
  /** The script player (S3 part 2 reads the models' nodes, the bars' scales, the typed text from it). */
  scripts(): UiRunner | null { return this.runner; }

  /** The stored profile for the world's map and side, read through the guard. */
  storedProfile(): ArmoryProfile | null {
    const w = this.world;
    return w && this.deps.store ? parseProfile(this.deps.store.get(profileKey(w.map, w.side))) : null;
  }

  /**
   * Opens the screen (S0) over the type and kit the page holds for the side's next spawn. False when it cannot (no data,
   * no world) or is open already. `opts.chosen` (the game lobby's page, ARMORY-SAVE): `current` was committed since the
   * lobby's entry, so a stored record only captions its column (`openArmory`).
   */
  open(current: { type: number; kit: Loadout } | null, opts: { chosen?: boolean } = {}): boolean {
    const ctx = this.ctx, layout = this.data?.layout;
    if (!ctx || !layout || this.isOpen()) return false;
    const t = this.deps.clock();
    const onstart = layout.animations.filter((a) => a.event === 'ONSTART' && !HOST_ONSTART.has(a.animation)).map((a) => a.animation);
    this.runner = this.makeRunner(layout, ctx);
    const { state, events } = openArmory(ctx, t, current, this.storedProfile(), onstart, opts);
    this.st = state;
    this.apply(events);
    return true;
  }

  private makeRunner(layout: UiLayout, ctx: ArmoryContext): UiRunner {
    const host: UiHost = {
      command: (cmd, r) => this.command(cmd, r),
      sound: (name, op) => this.deps.sound?.(name as ArmorySound, armoryCueOf(op)),   // ARMORY_SCRIPT_SOUNDS: every SOUND the scripts run, its own volume, pan, pitch
    };
    const runner = new UiRunner((this.data?.scripts ?? []).flatMap((s) => s.programs), armoryNodes(layout), host);
    for (const [k, v] of ctx.valves) runner.setValve(k, v);   // the map's `Enable_*` (ENABLE_VALVE_DEFAULTS_READING)
    // The card's `Set<Name>` PERSIST valves (research 182 §2.26): 1 by OT.R91, so `UnlockMPChar` takes its own unlocked branch.
    for (const [k, v] of campaignUnlockValves(this.unlocks())) runner.setValve(k, v);
    return runner;
  }

  /** The bound functions the scripts call: the looks' own here, the logic's answered from the state. */
  private command(cmd: UiCommand, runner: UiRunner): boolean {
    const s = this.st, ctx = this.ctx, layout = this.data?.layout;
    switch (cmd.fn) {
      // `ActivateButton` runs the control's ONACTIVATE binding (the character select's `OnMp*BtnAct`) and, the control
      // found, plays SELECTION (ARMORY_IMPLICIT_CUES; `FUN_00366b60`).
      case 'ActivateButton': {
        const control = layout?.controls.find((c) => c.name.toLowerCase() === cmd.arg.toLowerCase());
        if (control) this.deps.sound?.(SELECTION_SOUND);
        const on = control?.bindings.find((b) => b.event === 'ONACTIVATE');
        if (on) runner.start(on.animation);
        return true;
      }
      // `PopUpDialog` (spelled `POPUPDIALOG` on the disc): the node shown and `.METAL` (ARMORY_IMPLICIT_CUES; `FUN_0027eff0`).
      case 'PopUpDialog': case 'POPUPDIALOG': this.deps.sound?.('.METAL'); return true;
      // Mode 2 "exists": a stored profile (`UiEquipSwitch` captions its column "CUSTOM").
      case 'CharacterProfile': return cmd.extra[0] === 2 ? (s?.custom ?? null) !== null : true;
      case 'DoAllSelCharsHaveLockedEquip1':
      case 'DoAllSelCharsHaveLockedEquip2':
      case 'DoAllSelCharsHaveLockedEquip3': {
        // `FUN_002815d0`: `UiCharLocked` = the characters whose equipment slot k is locked (1..8 SEAL 1 .. TERRORIST 4).
        if (!s || !ctx) return false;
        const k = Number(cmd.fn.slice(-1)) + 1;
        let bits = 0;
        s.kits.forEach((kit, c) => { if (lockedSlot(ctx, kit, k)) bits |= 1 << (charSetOf(ctx.side, c) - 1); });
        runner.setValve('UiCharLocked', bits);
        return (bits & (1 << (charSetOf(ctx.side, activeColumn(s)) - 1))) !== 0;
      }
      default: return true;                                 // Choose*, ChangeCharacterType, SuspendMenuInput ...: the state's
    }
  }

  /** A `UIVAR`'s value: the portraits, the panes' item names, the names in the title bar. */
  uivar(name: string): string | null {
    const roster = this.data?.roster, s = this.st, ctx = this.ctx;
    const col = /^(Seal|Terr)([1-4])$/.exec(name);
    if (col) return roster?.characters.find((c) => c.column === name)?.portrait?.toLowerCase() ?? null;
    const d = DESCR.exec(name);
    if (d && ctx) {
      const set = Number(d[1]), side: Side = set <= 4 ? 'seal' : 'terrorist', c = (set - 1) % 4;
      const kit = side === ctx.side && s ? s.kits[c] : roster?.characters.find((x) => x.side === side && x.index === c)?.loadout;
      const id = kit?.[DESCR_SLOT[d[2]!]!];
      // The item's `Description` (`FUN_002af190` L153580-153640 via `FUN_003d2820`), not its `DisplayName`: FRAG, not M67.
      return id === undefined ? '' : ctx.arsenal.items.get(id)?.description ?? '';
    }
    if (name === 'mission_title') return roster?.missionTitle ?? null;
    const names = this.deps.names?.();
    if (name === 'GAMENAMEVAR') return names?.game ?? null;
    if (name === 'MEDIUS_LOBBY_NAME') return names?.room ?? null;
    return null;
  }

  private apply(e: ArmoryEvents): void {
    const r = this.runner;
    if (r) {
      for (const [k, v] of Object.entries(e.valves)) r.setValve(k, v);
      for (const a of e.run) r.start(a);
    }
    for (const snd of e.sounds) this.deps.sound?.(snd);
    const w = this.world, store = this.deps.store;
    if (e.change && w) this.deps.change(e.change, w.side);
    if (e.store && w && store) {
      const key = profileKey(w.map, w.side);
      // Mode 7 clears the record's valid byte (research 95 §4.4): the record stays, marked invalid.
      if (e.store === 'clear') { const old = parseProfile(store.get(key)); if (old) store.set(key, JSON.stringify({ ...old, valid: false })); }
      else store.set(key, JSON.stringify(e.store));
    }
    if (e.closed) this.finish();
  }

  private finish(): void {
    this.runner?.stopAll();
    this.runner = null;
    this.typing.clear();
    if (this.st) this.st = { ...this.st, screen: 'closed' };
    this.deps.closed?.();
  }

  /** Closes the screen (the round's start, a new match): every change was applied as it was made (live). */
  close(): void {
    if (!this.isOpen() || !this.st) return;
    const out = closeArmory(this.st, this.deps.clock());
    this.st = out.state;
    this.apply(out.events);
  }

  /** S7: the launch count's first tick (`ARMORY_CLOCK_READING`: the viewer's next round 5 s away): popup 47, a notice. */
  pullOut(): void {
    if (!this.st || !this.isOpen()) return;
    const was = this.st;
    this.st = pullOut(this.st, this.deps.clock());
    if (this.st !== was) this.deps.sound?.('.METAL');           // popup 47's PopUpDialog (ARMORY_IMPLICIT_CUES)
  }

  /** One input; true when the screen took it (open, it takes every input: the game's are the menu's). */
  input(input: ArmoryInput | null): boolean {
    if (!this.isOpen()) return false;
    if (!input || !this.ctx || !this.st) return true;
    const { state, events } = stepArmory(this.ctx, this.st, input, this.deps.clock());
    this.st = state;
    this.apply(events);
    return true;
  }

  /** A key's `code`: open, every key but Esc is the screen's (`ARMORY_MENU_KEYS_READING`). */
  key(code: string): boolean {
    if (!this.isOpen() || code === 'Escape') return false;
    return this.input(Object.hasOwn(ARMORY_MENU_KEYS_READING, code) ? ARMORY_MENU_KEYS_READING[code]! : null);
  }

  /** The pad's buttons pressed this frame (one step a press). */
  pad(pressed: ReadonlySet<PadButton>): boolean {
    if (!this.isOpen()) return false;
    for (const b of pressed) this.input(ARMORY_PAD[b] ?? null);
    return true;
  }

  /** A tap or click at a frame point (640x448): the presses that reach what is under it (`armoryTap`). */
  tap(fx: number, fy: number): boolean {
    const layout = this.data?.layout, r = this.runner;
    if (!this.isOpen() || !this.ctx || !this.st || !layout || !r) return false;
    const tree = armoryTree(layout);
    const place = (name: string): { x: number; y: number; visible: boolean } | null => {
      const o = tree.byName.get(name.toLowerCase());
      return o ? placeOf(o, tree, (x) => (r.has(x) ? r.node(x) : undefined)) : null;
    };
    const quads = this.quads(this.sizes);
    const presses = armoryTap(this.ctx, this.st, layout, quads, fx, fy, { place, lineSplit: this.lineSplit() });
    if (!presses.length && lockedColumnAt(this.ctx, this.st, quads, fx, fy)) this.deps.sound?.('.NEG');
    for (const i of presses) this.input(i);
    return true;
  }

  /**
   * Where the instruction line's second glyph starts on the frame (the circle, 0xB7, or its key's label): the line's
   * halves are the two presses it names (`armoryTap`). Null without the line or the glyph.
   */
  lineSplit(): number | null {
    const layout = this.data?.layout, r = this.runner;
    if (!layout || !r) return null;
    const tree = armoryTree(layout), o = tree.byName.get('instructiontext');
    const face = o ? this.faceOf(o.font) : undefined;
    if (!o || !face || !r.has(o.name)) return null;
    const n = r.node(o.name), raw = n.caption ? this.text(n.caption) : '';
    const at = raw.indexOf('\u00b7');
    if (at < 0) return null;
    const label = this.labels(), scale = o.scale ?? 1;
    const shown = (text: string): string => [...text].map((ch) => label?.(ch.codePointAt(0)!) ?? ch).join('');
    const p = placeOf(o, tree, (x) => (r.has(x) ? r.node(x) : undefined));
    const width = faceWidth(face, shown(raw), scale), pen = o.hcentered ? p.x - width / 2 : p.x;
    return pen + faceWidth(face, shown(raw.slice(0, at)), scale);
  }

  /** The pad glyphs' replacements on this device: a keyboard's keys; a pad and a touch screen keep the glyphs (A13). */
  private labels(): ((code: number) => string | null) | null {
    return (this.deps.device?.() ?? 'pad') === 'keyboard' ? (c: number) => ARMORY_KEY_LABELS[c] ?? null : null;
  }

  /** One frame: the scripts stepped, the typed description, the clock's transitions. */
  frame(dt: number): void {
    if (!this.isOpen() || !this.ctx || !this.st) return;
    this.runner?.step(dt);
    this.type(dt);
    const out = tickArmory(this.ctx, this.st, this.deps.clock());
    if (out) { this.st = out.state; this.apply(out.events); }
  }

  /** A face of the screen's fonts (an object's `FONT`, else the screen's). */
  private faceOf(name: string | null): FontFace | undefined {
    const fonts = this.data?.fonts ?? [], want = (name ?? this.data?.layout?.font ?? 'font_text_01').toLowerCase();
    return fonts.find((f) => f.name.toLowerCase() === want) ?? fonts.find((f) => f.name === 'font_text_01');
  }

  /**
   * The TELETYPEs typed on (`WepDescription`; `./armoryText`): a caption the scripts set anew starts a run from its
   * first character; a shown one's appends play the tick (`TELETYPE_TICK_SOUND_READING`, one a frame).
   */
  private type(dt: number): void {
    const layout = this.data?.layout, r = this.runner;
    if (!layout || !r) return;
    const tree = armoryTree(layout);                        // built once a layout
    for (const o of tree.order) {
      if (o.type !== 'TELETYPE') continue;
      const face = this.faceOf(o.font), n = r.has(o.name) ? r.node(o.name) : undefined;
      if (!face) continue;
      const key = o.name.toLowerCase(), caption = n?.caption ?? null;
      let entry = this.typing.get(key);
      if (!entry || entry.caption !== caption) {
        entry = { caption, run: startTeletype(caption ? this.text(caption) : this.text(o.caption)) };
        this.typing.set(key, entry);
      }
      const scale = o.scale ?? 1;
      const { tick } = stepTeletype(entry.run, teletypeSpec(o), dt, (ch) => faceWidth(face, ch, scale));
      if (tick && placeOf(o, tree, (x) => (r.has(x) ? r.node(x) : undefined)).visible) this.deps.sound?.('.TYPE');
    }
  }

  /** The screen's quads on the 640x448 frame (`./armoryLayout`); none while closed. */
  quads(sizes: Record<string, { width: number; height: number }>): ArmoryQuad[] {
    const layout = this.data?.layout, r = this.runner, s = this.st;
    this.sizes = sizes;
    if (!layout || !r || !s || !this.isOpen()) return [];
    const pop = popupOf(s), record = pop ? this.popups.get(pop.text) ?? null : null;
    const label = this.labels();
    return armoryQuads({
      layout, node: (n) => (r.has(n) ? r.node(n) : undefined), sizes, fonts: this.data?.fonts ?? [], loc: this.loc,
      uivar: (n) => this.uivar(n),
      popup: pop && record ? { record, buttons: pop.buttons.map((b) => ({ focused: b.focused })) } : null,
      ...(label ? { glyphLabel: label } : {}),
      teletype: (n) => this.typing.get(n.toLowerCase())?.run ?? null,
    });
  }

  /**
   * The preview models the scripts show now, with their spin and the parts their scripts switched off
   * (`ARMORY_MODEL_PART_REF`; `./armoryView` and `./armoryRaster` draw them); none while closed.
   */
  models(): ShownModel[] {
    const layout = this.data?.layout, r = this.runner;
    if (!layout || !r || !this.isOpen()) return [];
    const own = this.deps.modelParts?.bind(this.deps);
    const decoded = this.data?.models ?? [];
    const partsOf = own ?? ((m: string): readonly string[] | null => decoded.find((d) => d.model === m)?.decoded.parts.map((p) => p.node) ?? null);
    return armoryModels(layout, (n) => (r.has(n) ? r.node(n) : undefined), modelPartStates(layout, r.nodes(), partsOf));
  }

  /**
   * The weapon view as the scripts have set it (the hook's and the tests'): the models shown, the four bars' x-scales
   * (VOLUME, ACCURACY, RANGE, FIRE RATE; `eq_wep_comp_bar` .. `bar4`) when their group shows, the name, the fire mode,
   * the description as typed so far and whether it is done, the tips.
   */
  preview(): { models: string[]; bars: number[] | null; name: string; fireMode: string; description: string; typed: boolean; tips: string } | null {
    const layout = this.data?.layout, r = this.runner;
    if (!layout || !r || !this.isOpen()) return null;
    const node = (n: string) => (r.has(n) ? r.node(n) : undefined);
    const tree = armoryTree(layout);
    const shows = (n: string): boolean => { const o = tree.byName.get(n.toLowerCase()); return !!o && placeOf(o, tree, node).visible; };
    const caption = (n: string): string => { const c = node(n)?.caption; return c ? this.text(c) : ''; };
    const bars = ['eq_wep_comp_bar', 'eq_wep_comp_bar2', 'eq_wep_comp_bar3', 'eq_wep_comp_bar4'];
    const desc = tree.order.find((o) => o.type === 'TELETYPE');
    const run = desc ? this.typing.get(desc.name.toLowerCase())?.run : undefined;
    const face = desc ? this.faceOf(desc.font) : undefined;
    const typed = run && desc && face ? teletypeLines(run, teletypeSpec(desc), (ch) => faceWidth(face, ch, desc.scale ?? 1)).lines.join(' ') : '';
    return {
      models: armoryModels(layout, node).map((m) => m.entry.name),
      bars: shows('eq_wep_comp_dummy') ? bars.map((b) => node(b)?.scale[0] ?? 1) : null,
      name: caption('weapmodeltext'), fireMode: caption('FireMode1'),
      description: typed, typed: run ? teletypeDone(run) : true, tips: caption('WepInstText'),
    };
  }

  /** A caption's text through the screen's strings (for the tests and the hook). */
  text(c: Parameters<typeof captionText>[0]): string { return captionText(c, this.loc); }
  /** Whether input is taken now (not suspended). */
  taking(): boolean { return !!this.st && takesInput(this.st, this.deps.clock()); }
  /** The valves as the state has them (the hook's). */
  valves(): Record<string, number> | null { return this.ctx && this.st ? armoryValves(this.ctx, this.st) : null; }
}

/** Whether a kit's slot `slot` (0-4) is locked for the side (`slotLocked` under the menu's valves). */
function lockedSlot(ctx: ArmoryContext, kit: Loadout, slot: number): boolean {
  return slotLocked(menuValves(ctx.valves, kit[0]!), ctx.side, kit, slot);
}

const inside = (x: number, y: number, r: { x: number; y: number; w: number; h: number }): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** The row panes' names per row (1-6), for a column root's prefix (`Seal1`, `Merc3`). */
const PANES = ['Primarypane', 'Secondarypane', 'Equippane1', 'Equippane2', 'Equippane3', 'Donepane'] as const;

export interface ArmoryTapFrame {
  /** A node's frame place as the scripts left it (`placeOf`), or null for none. */
  place?(name: string): { x: number; y: number; visible: boolean } | null;
  /** The instruction line's split: where its second glyph starts (`Armory.lineSplit`). */
  lineSplit?: number | null;
}

/**
 * ARMORY_TOUCH_READING: the taps and clicks, read on the frame as the pad presses that reach what is under them. On
 * character select a column (`eq_<X>_win`) is the cursor's -- stepped to it -- and a second tap on it commits (Cross);
 * the footer's "BACK" (`TriFieldText`) is Triangle. On the rows: the arrows (`arrow_lft`/`arrow_rt` Left/Right,
 * `arrow_top`/`arrow_dwn` Up/Down); a pane is its row, stepped to (the DONE pane stepped to and Cross), where the
 * scripts have put it (`place`); the instruction line is its two glyphs' presses, split at the second (`lineSplit`, the
 * circle): on a weapon row Square left and Circle right, on DONE Cross left (its "Accept loadout" glyph) and Circle
 * right; "BACK" Triangle. The popup's buttons answer (stepped to, then Cross). A touch screen shows the game's glyphs
 * (`ARMORY_MENU_KEYS_READING`). For the owner.
 */
/**
 * ARMORY_LOCKED_TAP_READING (research 95 §8): on the character select a tap on a locked column (the 4th on a campaign
 * map without its unlock, `fourthArmoryTypeOpen`; none under OT.R91) is refused with the game's refusal sound, .NEG (`HUDUI.bnk` 4, the scripts' refused
 * Choose). The pad never reaches it -- `ActivateMPCharStack` steps over it while `DisableFourthChar` is 1 -- so a touch
 * screen's tap is the page's own, and its sound is chosen, not read.
 */
export const ARMORY_LOCKED_TAP_READING = '.NEG' as const;

/** Whether a frame point lies on a column the select screen cannot reach (`ARMORY_LOCKED_TAP_READING`). */
export function lockedColumnAt(ctx: ArmoryContext, s: ArmoryState, quads: readonly ArmoryQuad[], fx: number, fy: number): boolean {
  if (s.screen !== 'select') return false;
  const prefix = ctx.side === 'seal' ? 'Seal' : 'Merc';
  for (let c = 0; c < 4; c++) {
    const box = boundsOf(quads, `eq_${prefix}${c + 1}_win`);
    if (box && inside(fx, fy, box) && c < columnCount(ctx) && !reachable(ctx, c)) return true;
  }
  return false;
}

export function armoryTap(ctx: ArmoryContext, s: ArmoryState, layout: UiLayout, quads: readonly ArmoryQuad[], fx: number, fy: number, frame: ArmoryTapFrame = {}): ArmoryInput[] {
  const tree = armoryTree(layout);
  const drawn = (object: string): { x: number; y: number; w: number; h: number } | null => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of quads) if (q.object === object) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x + q.w); y1 = Math.max(y1, q.y + q.h); }
    return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  const prefix = (c: number): string => `${ctx.side === 'seal' ? 'Seal' : 'Merc'}${c + 1}`;
  const back = drawn('TriFieldText');
  if (s.screen === 'confirm') {
    const pop = quads.filter((q) => q.object.startsWith('POPUP_BUTTON_'));
    for (const name of new Set(pop.map((q) => q.object))) {
      const r = drawn(name)!;
      if (!inside(fx, fy, r)) continue;
      const want = name.endsWith('_1') ? 'yes' : 'no';
      return want === s.focus ? ['cross'] : ['left', 'cross'];
    }
    return [];
  }
  if (s.screen === 'select') {
    if (back && inside(fx, fy, back)) return ['triangle'];
    for (let c = 0; c < 4; c++) {
      const q = drawn(`eq_${prefix(c)}_win`);
      if (!q || !inside(fx, fy, q)) continue;
      if (!reachable(ctx, c)) return [];                     // a locked column takes no press (ARMORY_LOCKED_TAP_READING)
      if (c === s.column) return ['cross'];
      const steps: ArmoryInput[] = [];
      for (let k = 0, at = s.column; k < 4 && at !== c; k++) { at = (at + 1) % 4; steps.push('right'); }
      return steps;
    }
    return [];
  }
  if (s.screen === 'row' || s.screen === 'done') {
    if (back && inside(fx, fy, back)) return ['triangle'];
    for (const [name, input] of [['arrow_lft', 'left'], ['arrow_rt', 'right'], ['arrow_top', 'up'], ['arrow_dwn', 'down']] as const) {
      const r = drawn(name);
      if (r && inside(fx, fy, r)) return [input];
    }
    const col = activeColumn(s), kit = s.kits[col]!;
    const dummy = frame.place?.(`${prefix(col)}PaneDummy`) ?? null;
    if (dummy?.visible) {
      // Each pane where the scripts have put it (the commit's slide raises them into the loadout window), read off the
      // nodes, never a fixed origin.
      for (let r = 1; r <= 6; r++) {
        const name = `${prefix(col)}${PANES[r - 1]}`, o = tree.byName.get(name.toLowerCase()), at = frame.place?.(name) ?? null;
        if (!o || !o.size || !at || !inside(fx, fy, { x: at.x, y: at.y, w: o.size[0], h: o.size[1] })) continue;
        const steps: ArmoryInput[] = [];
        for (let k = 0, row = s.row; k < 6 && row !== r; k++) { row = nextRow(kit, row, 1); steps.push('down'); }
        if (r === DONE_ROW) steps.push('cross');
        return steps;
      }
    }
    const line = drawn('InstructionText');
    if (line && inside(fx, fy, line)) {
      // The line's two glyphs: Square | Circle on a weapon row, Cross | Circle on DONE (the literal "Accept loadout").
      const circle = frame.lineSplit ?? quads.find((q) => q.object === 'InstructionText' && q.rgb[0] === 150 && q.x > line.x + line.w / 3)?.x;
      const left: ArmoryInput = s.screen === 'done' ? 'cross' : 'square';
      return [fx < (circle ?? line.x + line.w / 2) ? left : 'circle'];
    }
    return [];
  }
  return [];
}
