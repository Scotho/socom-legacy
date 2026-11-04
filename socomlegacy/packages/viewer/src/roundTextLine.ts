import type { UsbKey } from '@s2u/ui';
import { MESSAGE_SCALE, TEXT_LINE_LAYOUT, type Hud } from './hud';
import { textWidth } from './hudFont';
import { messageLine } from './matchMessages';
import { devKeysHeld } from './devKeyHolds';
import { holdRoundLineKeys } from './roundLineKeys';
import { HID_BY_CODE } from './softKeyboardKeys';

/**
 * KEYBOARD-WHISPER (OT.R48, the owner 2026-10-12: "keyboard in round is acceptable"; web research 266 §3.9, its spec §7):
 * the online round's USB-keyboard text line, the original's own -- a player's text entry, not a testing keyboard path
 * (OT.R29's `./keyboardTesting` sites are untouched, and none is added: `test/build_keyboard.test.ts`).
 *
 * The round's frame, online (`DAT_0045a0c1`) with the `ComeFromLan` valve (S:0x3f6328, `FUN_003045b0(0x44fe10)`) at 0,
 * calls `FUN_002c6c70` (`FUN_001f7ff0` D:L56828-56830), which pops every pending USB key (`FUN_002dbd90`) and acts on each
 * against the HUD's text line 0x437540 (D:L167242-167320): a printing key appends (`FUN_002c9d90`), ENTER (0x28) runs
 * `FUN_002c9b80`, 0x29 (Escape) `FUN_002c9cc0`, 0x2a (Backspace) `FUN_002c9d00`. The line is shown on the living HUD
 * (`FUN_001f7a90` D:L56424), the dead's (`FUN_001f9f20` D:L57179) and a spectator's (`FUN_001f9160` D:L56879): its
 * vtable's +0x1c (0x364e30), the draw bit (research 266 §3.6). Its place, font and fade are the HUD's
 * (`./hud` `TEXT_LINE_LAYOUT`).
 *
 * The page's equivalent of "online, `ComeFromLan` 0" is the caller's `online()`: the front end's match (`./matchMount`),
 * launched from the online lobby, reads the session's `ComeFromLan` valve (0 on the online path, `worldOfSocomCommands`'
 * PERM table; the LAN game is parked, `createGameCommands` `HostLANGame`); `/testroom`'s offline match (its own
 * `LoopbackMatch`) is never online.
 */

/** `FUN_002c6c70`'s three commands' keys (D:L167307-167314). */
export const ROUND_LINE_KEY = { enter: 0x28, escape: 0x29, backspace: 0x2a } as const;

/** The digit row, plain (0x3f2b30) and shifted (0x3f2b20), HID 0x1e-0x27 (read off the ELF through `tools/elfImage.ts`). */
const DIGITS = '1234567890', DIGITS_SHIFT = '!@#$%^&*()';
/** HID 0x2d-0x38, plain (0x3f2b10) and shifted (0x3f2b00), read off the ELF: 0x32 (the non-US #) types `]` and `}`. */
const SYMBOLS = '-=[]\\];\'`,./', SYMBOLS_SHIFT = '_+{}|}:"~<>?';
/**
 * The keypad's 1-9, 0 and point, HID 0x59-0x63: `s_LeftStickVert_003f2d18[hid + 7]` (D:L167280), the bytes at 0x3f2d78 --
 * past the valve names the decompiler labels the table by -- read off the ELF.
 */
const KEYPAD = '1234567890.';
/** The keypad's operators (D:L167260-167276). */
const KEYPAD_OPS: Readonly<Record<number, string>> = { 0x57: '+', 0x56: '-', 0x55: '*', 0x54: '/' };

/** What one USB key does to the line. */
export type RoundKey = { kind: 'char'; char: string } | { kind: 'enter' } | { kind: 'escape' } | { kind: 'backspace' } | null;

/**
 * `FUN_002c6c70`'s map for one key (D:L167256-167318): letters 4-0x1d (`+0x5d`, upper by `+0x3d` when the shift, the
 * record's +4, differs from the caps lamp, its +0x14), the digit row and the symbols from their tables by the shift, the
 * keypad's digits and point and its four operators whatever the shift, space; then ENTER, 0x29, 0x2a. Any other key
 * (Tab, the arrows, the keypad's Enter 0x58, the function keys) does nothing. Unlike the soft keyboard's
 * (`@s2u/ui` `usbKeyAction`, `FUN_0038c630`), the keypad's digits type here.
 */
export function roundKey(k: UsbKey): RoundKey {
  const h = k.hid;
  if (h >= 0x04 && h <= 0x1d) return { kind: 'char', char: String.fromCharCode(k.shift !== k.capsLamp ? h + 0x3d : h + 0x5d) };
  if (h >= 0x1e && h <= 0x27) return { kind: 'char', char: (k.shift ? DIGITS_SHIFT : DIGITS)[h - 0x1e]! };
  if (h >= 0x2d && h <= 0x38) return { kind: 'char', char: (k.shift ? SYMBOLS_SHIFT : SYMBOLS)[h - 0x2d]! };
  if (h >= 0x59 && h <= 0x63) return { kind: 'char', char: KEYPAD[h - 0x59]! };
  if (KEYPAD_OPS[h]) return { kind: 'char', char: KEYPAD_OPS[h]! };
  if (h === 0x2c) return { kind: 'char', char: ' ' };
  if (h === ROUND_LINE_KEY.enter) return { kind: 'enter' };
  if (h === ROUND_LINE_KEY.escape) return { kind: 'escape' };
  if (h === ROUND_LINE_KEY.backspace) return { kind: 'backspace' };
  return null;
}

/**
 * The line's cap: `FUN_002c9960(0x437540, 0x80)` (D:L57430) stores 0x80 clamped to 5..100 (D:L168984-168997) at +0x140,
 * so 100; `FUN_002c9d90` appends while the line is shorter than the cap less 2 (D:L169187-169188): 98 characters at most.
 */
export const ROUND_TEXT_LINE_CAP = 100;

/** The command word `FUN_002c9b80` compares (S:0x3f2f10, read off the ELF), case-blind (`FUN_00198b80`). */
export const WHISPER_WORD = 'w';
/** The word's buffer before the copy (`DAT_003de7e8`, 8 bytes, read off the ELF: "xxxx" and four NULs). */
const WORD_FILL = 'xxxx\0\0\0\0';

/**
 * ENTER's parse (`FUN_002c9b80` D:L169081-169131, then `FUN_002c9990` D:L169000-169077): the line opens on `/`; the word
 * after it is copied into an 8-byte buffer (`DAT_003de7e8`'s "xxxx") until a space or 7 characters -- the end of the line
 * leaves the buffer's own bytes after it, so `/w` alone is "wxxx" -- and must be `w`, case-blind. The rest, from the
 * space, must be longer than one character and open on that space; after it, a name in double quotes (to the next
 * quote) or bare (to the next space, a name empty there -- two spaces -- found never, D:L169042-169053), then the message from the first
 * character that is not a space to the end. No name or no message: nothing. Null when no whisper is sent.
 */
export function parseRoundWhisper(line: string): { name: string; message: string } | null {
  if (!line.startsWith('/')) return null;
  let word = '', i = 1, ended = false;
  while (i < line.length && !ended) {
    const c = line[i]!;
    if (c === ' ' || word.length > 6) ended = true;
    else { word += c; i++; }
  }
  if (!ended) word += WORD_FILL.slice(word.length);                 // the loop ran out: the buffer's own bytes follow
  word = word.split('\0')[0]!;
  if (word.length === 0 || word.toLowerCase() !== WHISPER_WORD) return null;
  const rest = line.slice(i);
  if (rest.length <= 1 || rest[0] !== ' ') return null;
  const s = rest.slice(1);
  let name: string, j: number;
  if (s[0] === '"') {
    const close = s.indexOf('"', 1);
    if (close < 0) return null;
    name = s.slice(1, close);
    j = close + 1;
  } else {
    const space = s.indexOf(' ');
    if (space <= 0) return null;                                       // none, or an empty name (D:L169042-169053)
    name = s.slice(0, space);
    j = space + 1;
  }
  while (j < s.length && s[j] === ' ') j++;
  if (j >= s.length) return null;
  return { name, message: s.slice(j) };
}

/** One actor of the round as the page holds it (`ROUND_ACTOR_NAMES_READING`, `./roundChat`): a score row. */
export interface RoundActor { readonly id: number; readonly name: string; readonly team: string; readonly alive: boolean }
/** The sending seat: its id, and whether it watches as a spectator (no actor of the round: no score row). */
export interface RoundSender { readonly id: number; readonly spectator: boolean }

/**
 * `FUN_002c9810`'s target rule (D:L168944-168982): the name looked up among the round's actors (`FUN_0029e590` over
 * 0x4362e0, case-blind); none bears it, the whisper goes. An actor passes only when it is not the sender
 * (`FUN_002b3580`), shares a team flag with the sender (+200), has the +0xe1 bit 4 (the actor in play) as the sender has
 * it, and is a spectator exactly when the sender is (`FUN_002c2fd0`). The page's actors are the score's rows
 * (`ROUND_ACTOR_NAMES_READING`): a team for the flags, `alive` for the bit, and no spectator among them -- so a spectator
 * sender passes only a name no actor bears.
 */
export function whisperPasses(name: string, actors: readonly RoundActor[], sender: RoundSender | null): boolean {
  const n = name.toLowerCase();
  const target = actors.find((a) => a.name.toLowerCase() === n);
  if (!target) return true;
  const me = sender && !sender.spectator ? actors.find((a) => a.id === sender.id) : undefined;
  if (!me) return false;
  return target.id !== me.id && target.team === me.team && target.alive === me.alive;
}

/** `:: Player "%s" is unavailable` (S:0x3f2ef0, read off the ELF), formatted by `FUN_001988d0` (D:L168972). */
export const UNAVAILABLE_FORMAT = ':: Player "%s" is unavailable';
export function unavailableLine(name: string): string { return UNAVAILABLE_FORMAT.replace('%s', name); }
/** The refusal's colour and the echo's (`FUN_002b6530(0, 0x4366a0, ..., 2 / 0, 0, 0)`, D:L168973 and D:L168978; the scale 0 at 0x2c98e8 / 0x2c9920). */
export const UNAVAILABLE_COLOUR = 2;
export const WHISPER_ECHO_COLOUR = 0;

/**
 * ROUND_TEXT_LINE_DRAW_READING (research 266 §3.9, §6): what the page chooses in drawing the line, where the reading
 * stops. (1) The width `FUN_002c9d90` tests (the line's +0xe0, its text object's +0x3c) is taken as the page's
 * `hudFont` `textWidth` of the line at 0.8 -- the field's writer is not read. (2) The line is hidden with the whole HUD
 * where `FUN_001f71c0` hides it (its +0x18 at D:L56190, beside the main window's; the page's tactical map, `hudPass`,
 * keeps only the fader, its comment citing `FUN_001f71c0`), and by none of the scoreboard's, the round
 * screens' or a spectator view's hides -- whether the scoreboard's or the round screens' parts hide it is not read (the
 * round screen is drawn over it). (3) The text object's set text runs the text through the string table
 * (`FUN_003631f0` D:L260982-: `FUN_003a3700(0x49e9d0, text)`, a typed line equal to a string's key drawn as that
 * string); the page draws the line as typed. (4) The line is anchored on the centre line, as the message window is.
 * Settled by ONL-32's two-instance round with a USB keyboard: the line's frames against the page's. [reading]
 */
export const ROUND_TEXT_LINE_DRAW_READING = 'the width by hudFont at 0.8; hidden with the HUD by the tactical map only; drawn as typed; centre-anchored' as const;

/**
 * ROUND_TEXT_KEYS_READING (research 266 §3.9, §6; `./softKeyboardKeys` `PHYSICAL_TYPING_READING`'s form): the page's
 * physical keyboard as the USB keyboard `FUN_002dbd90` pops in an online round -- `KeyboardEvent.code` to the HID usage
 * (`HID_BY_CODE`: the US characters whatever the visitor's layout), the case Shift XOR CapsLock
 * (`getModifierState('CapsLock')` for the lamp), the browser's key repeat typed (the USB library's repeat not read), a
 * chord with Ctrl, Alt or Meta left to the browser. A key the line takes (`RoundTextLine.takes`) is the line's alone: it
 * goes no further than the window's capture phase, so the testing keys it shares (`./keyboardTesting`'s walk, fire, net
 * page, scoreboard and the page's hotkeys, on the window's bubble phase or the document) never move or fire while it
 * takes them -- in a release build always online (no key is a control there, OT.R29), in a development build only while
 * the line is open (`ROUND_TEXT_LINE_DEV_OPEN_ADAPTATION`). The voice's talk key (`./voice/headset`, V, on the window's
 * capture phase and attached before the line) asks `./roundLineKeys` first and leaves a key the line takes alone (the
 * review's finding 4). Every other key passes on, and the line's keyup too. [reading]
 */
export const ROUND_TEXT_KEYS_READING = 'USB keys in an online round: HID by code, US characters, Shift XOR CapsLock, repeat typed; the line takes its keys alone' as const;

export interface RoundTextLineDeps {
  /**
   * The HUD: the line shown and held (`setTextLine`, `textLineText` -- the HUD holds the line's text, as 0x437540 is
   * the HUD's, so its round start clears it, `Hud.startRound`), the refusal and the echo on the main window.
   */
  hud: Pick<Hud, 'postMessage' | 'setTextLine' | 'textLineText' | 'roundStarts'>;
  /** `FUN_002f4860(0x44f370, message, name)`: the lobby server's whisper (the front end's `BriefingRoomChat.mediusChat`). */
  whisper(message: string, name: string): void;
  /** The round's actors (`ROUND_ACTOR_NAMES_READING`). */
  actors(): readonly RoundActor[];
  /** The sending seat, null before the room has seated it. */
  sender(): RoundSender | null;
  /** The line's drawn width (`ROUND_TEXT_LINE_DRAW_READING`); absent, `hudFont`'s at the line's scale. */
  width?(text: string): number;
  /** Whether `ROUND_TEXT_LINE_DEV_OPEN_ADAPTATION` applies; absent, `import.meta.env.DEV` (a development build's only). */
  devOpen?: boolean;
}

/**
 * ROUND_TEXT_LINE_DEV_OPEN_ADAPTATION (a browser adaptation, a development build's only; research 266 §3.9, §6; the
 * Online seat's ruling at KEYBOARD-WHISPER's second review, for the owner's local playtests on the DEV keyboard layer,
 * OT.R29): with the keyboard testing layer (`./keyboardTesting`, every site under `import.meta.env.DEV`) the line is
 * closed until ENTER opens it, so WASD and the layer's other keys keep working through an online round. Open, it takes
 * every key `FUN_002c6c70` acts on, the voice's talk key V included (`./roundLineKeys`); ENTER runs `FUN_002c9b80` and
 * closes it, ESC runs `FUN_002c9cc0` and closes it, and every round's start (`Hud.startRound`, `FUN_002ca0b0`) closes
 * it, empty or not. Closed, every key but ENTER goes on to the testing layer -- and ENTER too when it is the browser's
 * repeat of a held ENTER (a menu's ENTER held past its close stays the menu's; ROUND-LINE-YIELDS, issue #260), or while
 * a menu holds the pad's keys (`ROUND_LINE_MENU_YIELD_ADAPTATION`). A release build -- no keyboard controls -- keeps the
 * original's line exactly: no open state, the keys taken whenever the round is online, a menu open or not. Not the
 * original's (the console's line has no open state; it needs none, its keyboard being no game control).
 */
export const ROUND_TEXT_LINE_DEV_OPEN_ADAPTATION = 'a development build: the line closed until a fresh ENTER, ENTER or ESC closing it; a release build the original' as const;

/**
 * ROUND_LINE_MENU_YIELD_ADAPTATION (a browser adaptation, a development build's only; ROUND-LINE-YIELDS, issue #260;
 * research 266 §3.9, §6): a dev-keyboard adaptation over OT.R29's shared keys. The original's line is live under the
 * menus, on its own device (`ROUND_LINE_UNDER_MENU_READING`: the USB keyboard the line's, the pad the menu's); the
 * page's development keyboard is both the line's and the pad's stand-in (the testing layer gives the ARMORY, WEAPON
 * EXCHANGE and the R2 inventory the keyboard's keys, ENTER among them), so while a menu holds the pad's keys a closed
 * DEV line takes no key and does not open -- ENTER goes on to the menu, and `./roundLineKeys` answers false. An open
 * line keeps its keys under a menu (the original's), and a release build -- no open state, no keyboard control -- is the
 * original's under every menu. Nothing of the original's line is changed by it.
 */
export const ROUND_LINE_MENU_YIELD_ADAPTATION = 'a development build: a closed line takes no key while a menu holds the pad\'s keys; an open line and a release build the original' as const;

/**
 * ROUND_LINE_UNDER_MENU_READING (ROUND-LINE-YIELDS, issue #260; research 266 §3.9, §6): whether the original's line is
 * live while a menu is open. Read: the round's frame ticks the R2 inventory (`CWeaponSel`, `FUN_00219c80`, D:L56657)
 * and WEAPON EXCHANGE (`FUN_00240600`, D:L56660) from the pad (`DAT_0044f108`), then calls `FUN_002c6c70`
 * (D:L56828-56830) with no test of the HUD mode (the controller's +0x221, read at D:L56538: 1 while either menu is
 * open, research 94, 188) nor of a menu or a life, and neither menu pops a USB key
 * (`FUN_002dbd90`'s other callers are the front end's screen update `FUN_00368650`, the soft keyboard's `FUN_0038c990`
 * and `FUN_00395540`) -- so the line is live under both. Not read: the ARMORY, the original's being the game lobby's
 * screen, where no round's frame runs (the page's seat ARMORY a stand-in, `ARMORY_SEAT_READING`), which the page
 * treats as the two HUD menus. Settled by ONL-32's two-instance round with a USB keyboard: ENTER and a letter typed with
 * WEAPON EXCHANGE and the R2 inventory open. [reading]
 */
export const ROUND_LINE_UNDER_MENU_READING = 'the line live under WEAPON EXCHANGE and the R2 inventory (no menu test before FUN_002c6c70); the seat ARMORY treated as they are' as const;

/** The HUD's text line 0x437540 and what its keys do. */
export class RoundTextLine {
  /** `ROUND_TEXT_LINE_DEV_OPEN_ADAPTATION` applies (fixed at the line's making). */
  private readonly gated: boolean;
  private opened = false;
  /** The HUD's round starts when the line was opened: a later round's start closes it (`Hud.roundStarts`). */
  private openedAt = 0;
  constructor(private readonly d: RoundTextLineDeps) { this.gated = d.devOpen ?? import.meta.env.DEV; }

  /** Whether the line takes its keys now: always in a release build; in a development build once ENTER opened it. */
  get open(): boolean {
    if (!this.gated) return true;
    if (this.opened && this.d.hud.roundStarts() !== this.openedAt) this.opened = false;   // a round's start closes it
    return this.opened;
  }

  /** Whether the line takes this key now (`roundKey`'s keys; a closed line ENTER alone, to open). */
  takes(k: UsbKey): boolean {
    const a = roundKey(k);
    return a !== null && (this.open || a.kind === 'enter');
  }

  /** The line's text: the HUD's (cleared by a round's start, `FUN_001fb420` D:L57631 -> `FUN_002ca0b0`). */
  get text(): string { return this.d.hud.textLineText(); }
  private get value(): string { return this.d.hud.textLineText(); }

  private set(text: string): void { this.d.hud.setTextLine(text); }

  /** One key popped (`FUN_002c6c70`'s loop body); a closed line opens on ENTER and takes nothing else. */
  key(k: UsbKey): void {
    const a = roundKey(k);
    if (a === null) return;
    if (!this.open) { if (a.kind === 'enter') { this.opened = true; this.openedAt = this.d.hud.roundStarts(); } return; }   // ROUND_TEXT_LINE_DEV_OPEN_ADAPTATION
    if (a.kind === 'char') this.append(a.char);
    else if (a.kind === 'escape') { this.set(''); this.opened = false; }      // FUN_002c9cc0: the text set to none
    else if (a.kind === 'backspace') { if (this.value.length > 0) this.set(this.value.slice(0, -1)); }   // FUN_002c9d00
    else { this.enter(); this.opened = false; }
  }

  /** `FUN_002c9d90` (D:L169171-169198): the character appended while the line is narrower than 578 and under 98. */
  private append(c: string): void {
    const width = this.d.width ? this.d.width(this.value) : textWidth(this.value, TEXT_LINE_LAYOUT.text.scale);
    if (width < TEXT_LINE_LAYOUT.widthLimit && this.value.length < ROUND_TEXT_LINE_CAP - 2) this.set(this.value + c);
  }

  /** `FUN_002c9b80`: a `/w` sent by `FUN_002c9810`'s rule; the line cleared, sent or not (D:L169128-169129). */
  private enter(): void {
    const w = parseRoundWhisper(this.value);
    if (w) {
      if (whisperPasses(w.name, this.d.actors(), this.d.sender())) {
        this.d.whisper(w.message, w.name);
        this.d.hud.postMessage([messageLine(w.message, WHISPER_ECHO_COLOUR, MESSAGE_SCALE)]);
      } else {
        this.d.hud.postMessage([messageLine(unavailableLine(w.name), UNAVAILABLE_COLOUR, MESSAGE_SCALE)]);
      }
    }
    this.set('');
  }
}

/**
 * ROUND_TEXT_LINE_FORM_CONTROL_ADAPTATION (a browser adaptation, every build; research 266 §3.9, §6; KEYBOARD-WHISPER's
 * second review): a key aimed at one of the page's own controls -- an input, a select, a textarea, a button, an editable
 * element (`/testroom`'s map bar and `#maps` among them) -- is left to that control, never the line's, and the line does
 * not open on it. The original's screen has no such controls, so nothing of its line is changed by this.
 */
export const ROUND_TEXT_LINE_FORM_CONTROL_ADAPTATION = 'a key aimed at an input, select, textarea, button or editable element of the page goes to that control' as const;

/** Whether a key's target is one of the page's own controls (`ROUND_TEXT_LINE_FORM_CONTROL_ADAPTATION`). */
export function pageControl(target: EventTarget | null): boolean {
  const el = target as { tagName?: unknown; isContentEditable?: unknown } | null;
  if (!el || typeof el.tagName !== 'string') return false;
  return ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(el.tagName.toUpperCase()) || el.isContentEditable === true;
}

/** Where the keys are heard: the page's window (the match's `MatchWindow` among them). */
export interface RoundKeyTarget {
  addEventListener(type: string, fn: EventListener, capture?: boolean): void;
  removeEventListener(type: string, fn: EventListener, capture?: boolean): void;
}

/**
 * The page's keys into the line (`ROUND_TEXT_KEYS_READING`), on the window's capture phase ahead of every other key
 * listener, while `online()` holds; a player's text entry in every build (OT.R48), as the soft keyboard's
 * (`./softKeyboardKeys`, research 301 §6) -- `test/keyboardGate.test.ts` lists it. `menu()`, whether a menu holds the
 * pad's keys (the page's ARMORY, WEAPON EXCHANGE, R2 inventory; absent, none ever does): a browser adaptation, a
 * dev-keyboard one over OT.R29's shared keys (`ROUND_LINE_MENU_YIELD_ADAPTATION`; the original's line is live under the
 * menus, on its own device) -- a closed development line then leaves ENTER to the menu, as it leaves a repeated ENTER
 * (`ROUND_TEXT_LINE_DEV_OPEN_ADAPTATION`). Answers the detach.
 */
export function attachRoundTextKeys(target: RoundKeyTarget, line: RoundTextLine, online: () => boolean, menu: () => boolean = () => false): () => void {
  /** The key as the line's USB key when the line takes it now, else null. */
  const taken = (e: KeyboardEvent): UsbKey | null => {
    // LATER 190: a development editor over the page holds the keys (`./devKeyHolds`): an open line yields to it until it closes.
    if (!online() || e.ctrlKey || e.altKey || e.metaKey || pageControl(e.target) || devKeysHeld()) return null;
    const hid = HID_BY_CODE[e.code];
    if (hid === undefined) return null;
    if (!line.open && (e.repeat || menu())) return null;            // a closed DEV line yields (ROUND_LINE_MENU_YIELD_ADAPTATION, issue #260)
    const k: UsbKey = { hid, shift: e.shiftKey === true, capsLamp: e.getModifierState?.('CapsLock') ?? false };
    return line.takes(k) ? k : null;
  };
  const down = (ev: Event): void => {
    const e = ev as KeyboardEvent;
    const k = taken(e);
    if (k === null) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    line.key(k);
  };
  const release = holdRoundLineKeys((e) => taken(e) !== null);     // a listener ahead of this one asks (`./roundLineKeys`)
  target.addEventListener('keydown', down, true);                    // OT.R48: the round's text line, every build
  return () => { target.removeEventListener('keydown', down, true); release(); };
}

/**
 * The line mounted on a match: its HUD, its keys on `win` (`menu`, whether a menu holds the pad's keys: the page's own
 * state, `attachRoundTextKeys`; absent, none ever does), and their release.
 */
export function mountRoundTextLine(d: RoundTextLineDeps & { win: RoundKeyTarget; online(): boolean; menu?(): boolean }): { line: RoundTextLine; dispose(): void } {
  const line = new RoundTextLine(d);
  const detach = attachRoundTextKeys(d.win, line, () => d.online(), () => d.menu?.() ?? false);
  return { line, dispose: () => { detach(); d.hud.setTextLine(''); } };
}
