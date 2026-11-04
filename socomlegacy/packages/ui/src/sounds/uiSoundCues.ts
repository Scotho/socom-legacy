import {
  KEYBOARD_SOUND_KEYS, UI_POPUP_SOUND, uiSoundVolumeWord, uiSoundWords,
  type KeyboardSoundKey, type UiSoundNames, type UiSoundPlayArgs, type UiSoundResolution, type UiSoundTable, type UiSoundWords,
} from '@s2u/sound';
import type { ZAnimSoundCommand, ZAnimUiCommand } from '../zanimRuntime';

/**
 * The menus' sounds as the front end's code plays them (PLAT-23; web research 122 §§1, 3, 4, 6): the zAnim `SOUND`
 * command (PLAT-07's `ZAnimHost.sound`), the cues the widgets and the screen manager play by `uisounds.rdr`'s names
 * (SELECTION, TELETYPE, BACK), `PopUpDialog`'s `.METAL`, the soft keyboard's six, and the three sound rows of the global
 * command table (`StopAllSounds`, `FadeAllSounds`, `VagStreaming`). Each resolves through `@s2u/sound`'s
 * `UiSoundTable` and hands the output what the original hands 989snd; the viewer fills the output
 * (`packages/viewer/src/uiSoundHost.ts`). `D:L<line>` is a line of `socom2_game.elf.decomp.c`.
 *
 * Who calls which cue (research 122 §6) is the caller's: the screen manager (PLAT-10) `back()` at `SwitchMenu
 * PREVIOUS_SCREEN` and `popup()` when `PopUpDialog` shows a `POPUP`, `selection()` at `ActivateButton` and the default
 * focus move; the widgets (PLAT-15) `selection()` and `teletype()`; the keyboard (PLAT-17) `keyboard(slot)`. A button's
 * CROSS, a cancel and an error play nothing of the code's own: those are the scripts' `SOUND` commands.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The `SOUND` command's flags (`FUN_002659c0` D:L112317-112510; research 81 §6's layout). */
export const SOUND_FLAG = {
  /** The name is not looked up: +7 names a node instead (D:L112350-112355), so nothing plays. */
  NODE_BY_INDEX: 0x1,
  /** Placed at the node of byte +0x10, when it resolves (D:L112446-112450). */
  NODE: 0x2,
  /** Placed at the offset f32 x3 at +0x14 (D:L112423-112426). */
  OFFSET: 0x4,
  /** Placed at the animation's attachment (D:L112427-112445). */
  ATTACH: 0x8,
  /** The volume f32 at +8, else 1.0 (D:L112414-112416). */
  VOLUME: 0x10,
  /** The pan u16 at +0xc, else -1 (D:L112417-112419). */
  PAN: 0x20,
  /** The pitch modifier s16 at +0xe, else 0 (D:L112420-112422). */
  PITCH: 0x40,
  /** A new play; without it the command retunes the voice already playing (D:L112365-112411). */
  NEW_PLAY: 0x80,
  /** Fades or stops the voice (D:L112489-112508). */
  STOP: 0x100,
  /** Marks the name slot's +2 (D:L112360-112362; `STOP_ON_EXIT_FLAG_READING`). */
  STOP_ON_EXIT: 0x200,
  /** The priority slot `FUN_00348dc0` at priority 1 / 3 (D:L112478-112486). */
  PRIORITY_1: 0x400,
  PRIORITY_3: 0x800,
} as const;

/**
 * STOP_ON_EXIT_FLAG_READING: flag 0x200 sets the name slot's +2 (D:L112360-112362; READERX's uncompiled `dlgExitState`
 * spells the key `STOP_ON_EXIT`), and the record's +4 takes the float at the command's +0x12 offset when that offset is
 * positive (D:L112356-112358, `uiSoundFadeSeconds`). When the slot's animation instance stops (`FUN_0026ff20` ->
 * `FUN_0026fd20` D:L118432-118480, from D:L118572) a held sound with +2 set is faded over +4 seconds and detached when
 * +4 > 0, else stopped and freed; one with +2 clear is detached to play out; every +2 is cleared (research 186 §3.1,
 * research 233 §3; `UiSoundCues.stopInstance`). Was `'no effect'` (research 122 §7). [reading]
 */
export const STOP_ON_EXIT_FLAG_READING = 'stop or fade(+4)';

/**
 * UI_SOUND_PLACE_READING: whether a menu's flag-0x2 `SOUND` (117 of the 399) plays placed -- the node of byte +0x10 found
 * through `FUN_0026f4e0` (D:L118170-118179), which was not followed into the UI objects. Every HUDUI play the recomp
 * logged has pan -1 (research 122 §9), so the node does not resolve in the menus and the play is unplaced. [reading]
 */
export const UI_SOUND_PLACE_READING = false;

/**
 * The flags no menu `SOUND` command of the disc carries (its 399 carry 0x0, 0x80, 0x82, 0x90 and 0x280: research 122
 * §7): the stop or fade of a handle voice (0x100) and the priority slot (0x400, 0x800). A command with one is reported
 * `unmodelled` and plays nothing here.
 */
export const UI_SOUND_FLAGS_UNMODELLED = SOUND_FLAG.STOP | SOUND_FLAG.PRIORITY_1 | SOUND_FLAG.PRIORITY_3;

/** A `SOUND` command's fields (`FUN_002659c0` D:L112412-112422): +4 flags, +8 volume, +0xc pan, +0xe pitch, +0x10 node. */
export interface UiSoundCommandFields { flags: number; volume: number; pan: number; pitchMod: number; node: number }

/** Reads a `SOUND` command's bytes (header included, as `ZAnimSoundCommand.bytes` holds them). A byte past the end reads 0. */
export function decodeUiSoundCommand(cmd: Pick<ZAnimSoundCommand, 'bytes'>): UiSoundCommandFields {
  const b = cmd.bytes, v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const ok = (o: number, n: number): boolean => o + n <= b.length;
  const flags = ok(4, 2) ? v.getUint16(4, true) : 0;
  return {
    flags,
    volume: (flags & SOUND_FLAG.VOLUME) !== 0 && ok(8, 4) ? v.getFloat32(8, true) : 1,
    pan: (flags & SOUND_FLAG.PAN) !== 0 && ok(0xc, 2) ? v.getUint16(0xc, true) : -1,
    pitchMod: (flags & SOUND_FLAG.PITCH) !== 0 && ok(0xe, 2) ? v.getInt16(0xe, true) : 0,
    node: ok(0x10, 1) ? b[0x10]! : 0,
  };
}

/**
 * STREAM_NAME_SLOT_READING: the record a `SOUND` command keeps its play's handle in is `FUN_0026e7c0(DAT_00414be8,
 * byte +6)` (D:L112350-112352), and a new play stops the handle that record still holds first (D:L112451-112455;
 * research 122 §13). `DAT_00414be8` is the running animation instance, and each instance holds its own copy of its
 * definition's records (`FUN_0026d940` D:L117228-117242: 0x10 bytes each, handles and +2 zeroed; research 186 §3.1), so
 * the console keys a slot by the animation instance and the name -- the key here (`streamNameSlot`; no animation on the
 * disc allows a second copy, so the animation's name names its instance). `dlgMissionSelection.rdr`'s `CallMusic` and
 * `CallMusicOld` are two animations, so two instances and two slots: research 152 §7's exception does not hold
 * (research 233 §3.3). [reading]
 */
export const STREAM_NAME_SLOT_READING = 'animation and name';

/** The name slot of a `SOUND` command's play (`STREAM_NAME_SLOT_READING`). */
export function streamNameSlot(anim: string, sound: string): string {
  return `${anim}\u0000${sound}`;
}

/**
 * The fade a `SOUND` command gives its name slot's +4 (D:L112356-112358): the f32 at the offset the command's s16 at
 * +0x12 names, when that offset is positive (and inside the command); null when it gives none (the record keeps its +4).
 */
export function uiSoundFadeSeconds(cmd: Pick<ZAnimSoundCommand, 'bytes'>): number | null {
  const b = cmd.bytes, v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 0x14) return null;
  const at = v.getInt16(0x12, true);
  return at > 0 && at + 4 <= b.length ? v.getFloat32(at, true) : null;
}

/** Who asked for a play. */
export type UiSoundSource = 'zanim' | 'selection' | 'teletype' | 'back' | 'popup' | 'keyboard';

/** What reaches the output: a bank one-shot (989snd's words), a stream, or the headset queue (`HEADSET_ROUTE_READING`). */
export type UiSoundPlay =
  | { kind: 'bank'; source: UiSoundSource; resolution: Extract<UiSoundResolution, { kind: 'bank' }>; words: UiSoundWords }
  /**
   * A stream (`FUN_00342240`): the volume word, the caller's pan (-1: the stream's own), and the name slot a `SOUND`
   * command plays in (`streamNameSlot`; null for a code cue), whose previous voice the original stops first.
   */
  | { kind: 'stream'; source: UiSoundSource; resolution: Extract<UiSoundResolution, { kind: 'stream' }>; vol: number; pan: number; slot: string | null }
  | { kind: 'headset'; source: UiSoundSource; resolution: Extract<UiSoundResolution, { kind: 'headset' }>; vol: number };

/** What the viewer gives the cues: a play, and the three commands' effects. */
export interface UiSoundOutput {
  play(p: UiSoundPlay): void;
  /** `SL_STOPALLSOUNDS` (24): every voice, the one-shots too (`FUN_00346c00` -> `FUN_00340270`). */
  stopAll(): void;
  /**
   * `FUN_00346c30` (D:L244212-244239): every voice of the handle list 0x48df98 (the non-one-shot plays) to volume 0 over
   * 360 ticks (1.5 s) by `SL_AUTOVOL_A` (34); the one-shots are not in the list and play on.
   */
  fadeAll(): void;
  /** `VagStreaming`: `ON` starts the stream system (`FUN_003450f0`), `OFF` stops it (`FUN_00344f80`). */
  streaming(on: boolean): void;
  /** `FUN_0026fd20`'s StopSound (`FUN_00347610` + `FUN_00347810`): the voice a name slot holds stopped (PF-32). Optional. */
  stop?(slot: string): void;
  /** `FUN_0026fd20`'s FadeOut (`FUN_00346dd0(+4)` + `FUN_00346d30`): the slot's voice faded over `seconds`, then stopped (PF-32). Optional. */
  fade?(slot: string, seconds: number): void;
  /**
   * `FUN_0026fd20` on an unmarked slot: the handle let go (zeroed, D:L118470) and the voice left to play out -- the slot
   * holds it no more, so the next play in the slot stops nothing (PF-32). Optional.
   */
  release?(slot: string): void;
}

/** What a cue or a command did. */
export type UiSoundOutcome =
  | { kind: 'played'; play: UiSoundPlay }
  /** No object, the system off, or the bank refused (`UiSoundResolution`'s `silent`). */
  | { kind: 'silent'; resolution: UiSoundResolution }
  /** A `GROUPS` group: no member chosen (`UI_GROUP_PICK_READING`). */
  | { kind: 'group'; resolution: Extract<UiSoundResolution, { kind: 'group' }> }
  /** No 0x80: a retune of a voice already playing; a one-shot has none, so nothing sounds. */
  | { kind: 'retune' }
  /** Flag 0x1: no name was looked up. */
  | { kind: 'no-name' }
  /** Placed (0x4, 0x8, or 0x2 with a node): not the menus' (`UI_SOUND_PLACE_READING`); not played here. */
  | { kind: 'placed' }
  /** A flag the disc's menu commands never carry (0x100, 0x400, 0x800), or an `HQ` / `VQ` entry (`FUN_003428f0`): not played. */
  | { kind: 'unmodelled'; flags: number };

export interface UiSoundCuesOptions {
  /** `SOUND` flag 0x2: whether the node of byte +0x10 resolves (default `UI_SOUND_PLACE_READING`: never in the menus). */
  nodePlaces?: (cmd: ZAnimSoundCommand) => boolean;
  /** The context's input string, which `VagStreaming INPUT_STRING` takes (`FUN_00272480(ctx + 0x18, 0)`). */
  inputString?: () => string | null;
  /** Every outcome, as it happens (a trace for PLAT-36's comparison). */
  log?: (o: UiSoundOutcome, source: UiSoundSource | 'command') => void;
}

/** The three sound rows of the table at 0x3dd4d0 (`readBindingTable`; research 122 §4): row, id, function. */
export const UI_SOUND_COMMAND_ROWS = [
  { row: 126, id: 127, name: 'StopAllSounds', fn: 0x277930 },
  { row: 127, id: 128, name: 'FadeAllSounds', fn: 0x277910 },
  { row: 134, id: 135, name: 'VagStreaming', fn: 0x27a5e0 },
] as const;
export type UiSoundCommandName = (typeof UI_SOUND_COMMAND_ROWS)[number]['name'];

/** A command entry: the tick's answer (all three answer 1). */
export type UiSoundCommandEntry = (cmd: ZAnimUiCommand) => boolean;

/** The unplaced play at 1.0 the code's cues make: `+0xc` `FUN_00343550` (D:L242272-242285): volume 1, pan -1, pitch 0. */
const CUE: UiSoundPlayArgs = { volume: 1, pan: -1, pitchMod: 0 };
/** `+0x1c` `FUN_00342aa0` (D:L242023-242035) with 1: the same, the one-shot bit forced for the call. */
const FORCED: UiSoundPlayArgs = { ...CUE, forceOneShot: true };

/** The menus' cues over a table and an output. */
export class UiSoundCues {
  /** `DAT_00408564`: SELECTION's object, resolved once (D:L54879-54880) and again at the IOP reset (`refresh`). */
  private selectionFound = false;
  /** `DAT_004a10e8`..`DAT_004a1110`: the keyboard's six, by slot (`FUN_00397bc0`). */
  private keyboardFound: boolean[] = [];
  /** `DAT_0048dda0`: the stream flag `VagStreaming` sets. */
  streamingOn = false;
  /**
   * The name slots' records (`FUN_0026d940`'s per-instance copies, research 233 §3): by `streamNameSlot`, the animation,
   * the 0x200 mark (+2), the fade (+4), and whether a stream's handle is held (+0xc).
   */
  private readonly records = new Map<string, { anim: string; mark: boolean; fade: number; held: boolean }>();

  constructor(private readonly table: UiSoundTable, private readonly names: UiSoundNames,
              private readonly keyboardNames: readonly string[], private readonly out: UiSoundOutput,
              private readonly opts: UiSoundCuesOptions = {}) {
    this.refresh();
  }

  /** The resolutions the code keeps (SELECTION's, the keyboard's): the menu init's, again at the IOP reset (`FUN_001f53d0`). */
  refresh(): void {
    this.selectionFound = this.table.lookup(this.names.selection) !== null;
    this.keyboardFound = KEYBOARD_SOUND_KEYS.map((_, i) => this.table.lookup(this.keyboardNames[i] ?? '') !== null);
  }

  /** A play of `name` with the caller's arguments: `FUN_00343140` past the lookup; `slot` a `SOUND` command's name slot. */
  play(name: string, args: UiSoundPlayArgs, source: UiSoundSource, slot: string | null = null): UiSoundOutcome {
    const r = this.table.resolve(name);
    let o: UiSoundOutcome;
    switch (r.kind) {
      case 'bank': o = { kind: 'played', play: { kind: 'bank', source, resolution: r, words: uiSoundWords(r, args) } }; break;
      case 'stream':
        o = { kind: 'played', play: { kind: 'stream', source, resolution: r, vol: uiSoundVolumeWord(args.volume, r.object.volume), pan: args.pan, slot } };
        break;
      case 'headset':
        o = { kind: 'played', play: { kind: 'headset', source, resolution: r, vol: uiSoundVolumeWord(args.volume, r.object.volume) } };
        break;
      case 'group': o = { kind: 'group', resolution: r }; break;
      default: o = { kind: 'silent', resolution: r };
    }
    return this.done(o, source);
  }

  private done(o: UiSoundOutcome, source: UiSoundSource): UiSoundOutcome {
    if (o.kind === 'played') this.out.play(o.play);
    this.opts.log?.(o, source);
    return o;
  }

  /**
   * `ZAnimHost.sound`: the `SOUND` command (`FUN_002659c0`), as the menus' commands use it. Not modelled: before a new
   * play the original stops and frees the voice its name slot still holds (D:L112451-112455) and keeps the new handle
   * (D:L112462, D:L112474). A one-shot holds none, so the bank plays are exact; a stream's play carries its slot
   * (`streamNameSlot`), and the page's streamer stops that slot's previous voice first (MENU-MUSIC, research 152 §2).
   */
  sound = (cmd: ZAnimSoundCommand): UiSoundOutcome => {
    const f = decodeUiSoundCommand(cmd);
    const flags = cmd.flags;
    if (flags & SOUND_FLAG.NODE_BY_INDEX) return this.done({ kind: 'no-name' }, 'zanim');                      // D:L112350-112355
    // The name slot's record (D:L112350-112362): +4 the command's fade when it gives one, +2 marked by 0x200.
    const slot = streamNameSlot(cmd.anim, cmd.sound);
    let rec = this.records.get(slot);
    if (!rec) this.records.set(slot, rec = { anim: cmd.anim, mark: false, fade: 0, held: false });
    const fade = uiSoundFadeSeconds(cmd);
    if (fade !== null) rec.fade = fade;
    if (flags & SOUND_FLAG.STOP_ON_EXIT) rec.mark = true;
    if (flags & UI_SOUND_FLAGS_UNMODELLED) return this.done({ kind: 'unmodelled', flags }, 'zanim');
    if (!(flags & SOUND_FLAG.NEW_PLAY)) return this.done({ kind: 'retune' }, 'zanim');                           // D:L112365-112411
    const placed = (flags & (SOUND_FLAG.OFFSET | SOUND_FLAG.ATTACH)) !== 0
      || ((flags & SOUND_FLAG.NODE) !== 0 && (this.opts.nodePlaces?.(cmd) ?? UI_SOUND_PLACE_READING));
    const o = this.table.lookup(cmd.sound);
    if (placed) return this.done(                                                                                // D:L112460: vtable +0x14
      o ? { kind: 'placed' } : { kind: 'silent', resolution: this.table.resolve(cmd.sound) }, 'zanim');
    if (o?.kind === 'sound' && (o.hq || o.vq)) return this.done({ kind: 'unmodelled', flags }, 'zanim');        // D:L112466-112470
    const out = this.play(cmd.sound, { volume: f.volume, pan: f.pan, pitchMod: f.pitchMod }, 'zanim', slot);   // D:L112473: vtable +0x18
    if (out.kind === 'played' && out.play.kind === 'stream') rec.held = true;                                    // D:L112474: the handle kept
    return out;
  };

  /**
   * An animation instance's end (`ZAnimHost.instanceStop`; `FUN_0026ff20` -> `FUN_0026fd20` D:L118432-118480, from
   * D:L118572): each of its slots that holds a voice -- marked 0x200, faded over its +4 (`fade`) when +4 > 0, else
   * stopped (`stop`); unmarked, detached to play out (`release`) -- the handle let go, and every mark cleared
   * (`STOP_ON_EXIT_FLAG_READING`). A one-shot holds no handle, so only streams are stopped here.
   */
  stopInstance(anim: string): void {
    for (const [slot, rec] of this.records) {
      if (rec.anim !== anim) continue;
      if (rec.held && rec.mark) {
        if (rec.fade > 0) this.out.fade?.(slot, rec.fade);
        else this.out.stop?.(slot);
      } else if (rec.held) this.out.release?.(slot);                       // detached, plays out (D:L118453-118460, D:L118470)
      rec.held = false;
      rec.mark = false;
    }
  }

  /** `FUN_0036a2c0` (D:L264855-264862): SELECTION, forced one-shot, unplaced, at 1.0. */
  selection(): UiSoundOutcome {
    if (!this.selectionFound) return this.done({ kind: 'silent', resolution: this.table.resolve(this.names.selection) }, 'selection');
    return this.play(this.names.selection, FORCED, 'selection');
  }

  /** `FUN_0036a300` (D:L264867-264874): TELETYPE, re-resolved from its name (`FUN_00369880`), forced one-shot. */
  teletype(): UiSoundOutcome {
    return this.play(this.names.teletype, FORCED, 'teletype');
  }

  /** `SwitchMenu PREVIOUS_SCREEN` (`FUN_0027e720` D:L126591-126599): BACK by its name, `+0xc` (not forced). */
  back(): UiSoundOutcome {
    return this.play(this.names.back, CUE, 'back');
  }

  /** `PopUpDialog` with a `POPUP` shown (`FUN_0027eff0` D:L126897-126900): the literal `.METAL`, forced one-shot. */
  popup(): UiSoundOutcome {
    return this.play(UI_POPUP_SOUND, FORCED, 'popup');
  }

  /** `FUN_00395de0(slot)` (D:L289054-289088): the keyboard's sound of that slot, forced one-shot; none past slot 5. */
  keyboard(slot: number | KeyboardSoundKey): UiSoundOutcome {
    const i = typeof slot === 'number' ? slot : KEYBOARD_SOUND_KEYS.indexOf(slot);
    const name = this.keyboardNames[i] ?? '';
    if (!this.keyboardFound[i]) return this.done({ kind: 'silent', resolution: this.table.resolve(name) }, 'keyboard');
    return this.play(name, FORCED, 'keyboard');
  }

  /** `StopAllSounds` (`FUN_00277930` D:L123045-123052 -> `FUN_00346c00` D:L244200-244207): answers 1. */
  StopAllSounds = (): boolean => {
    if (!this.table.off) this.out.stopAll();
    return true;
  };

  /** `FadeAllSounds` (`FUN_00277910` D:L123035-123042 -> `FUN_00346c30` D:L244212-244239): answers 1. */
  FadeAllSounds = (): boolean => {
    if (!this.table.off) this.out.fadeAll();
    return true;
  };

  /**
   * `VagStreaming` (`FUN_0027a5e0` D:L124465-124490): the argument (`names[+8]`), `INPUT_STRING` replaced by the
   * context's input string; `ON` sets the stream flag and starts the system, `OFF` stops it and clears the flag
   * (`strcmp`, case-sensitive); anything else does nothing. Answers 1.
   */
  VagStreaming = (cmd: ZAnimUiCommand): boolean => {
    let arg: string | null = cmd.arg;
    if (arg === 'INPUT_STRING') arg = this.opts.inputString?.() ?? null;
    if (arg === 'ON') { this.streamingOn = true; this.out.streaming(true); }
    else if (arg === 'OFF') { this.out.streaming(false); this.streamingOn = false; }
    return true;
  };

  /** The entries by their table name, for PLAT-08's host (`UiCommandHost`'s `handlers` / `setHandler`). */
  entries(): Record<UiSoundCommandName, UiSoundCommandEntry> {
    return { StopAllSounds: this.StopAllSounds, FadeAllSounds: this.FadeAllSounds, VagStreaming: this.VagStreaming };
  }
}
