import { parseRdr, readZarMembers, type AssetSource, type RdrNode } from '@s2u/archive';
import { UI_PARAMS_RDR, readSoftKeyboards, usbKeyHandled, type MenuInputSource, type SoftKeyboardParams, type UsbKey } from '@s2u/ui';
import { keyboardSite } from './keyboardTesting';

/**
 * The page's physical keyboard as the USB keyboard the game reads while a soft keyboard is up (PLAT-17; web research 119
 * §10; the owner's default 2 in the sprint 9 plan) -- a browser adaptation over the original's own path: the game pops
 * every pending USB key each frame a keyboard is up (`FUN_002dbd90`) and types it through the same insert as the
 * on-screen keys (`FUN_0038c630`), held to the field's caps and fit. The page also reads `UiParams.rdr` for the
 * keyboard (`readUiParams`) and connects both to the front end's keyboard (`connectSoftKeyboard`, `frontEnd.ts`'s line).
 */

/**
 * PHYSICAL_TYPING_READING (the owner's default 2; the owner may overturn to "on-screen keys only"): while a soft keyboard
 * is up, a key whose HID usage the game's USB table acts on (`usbKeyHandled`: letters, digits, the US punctuation, space,
 * Enter, Escape, Backspace, Tab, Left / Right, the keypad) is queued as that USB key -- `KeyboardEvent.code` names the
 * same physical key the HID usage does (`HID_BY_CODE`), so the characters are the US ones whatever the visitor's layout,
 * and the case is the game's Shift XOR CapsLock (`getModifierState('CapsLock')` standing for the lamp) -- and is kept from
 * PLAT-11's menu keys; every other key (Up / Down, PageUp / PageDown and the rest of `MENU_KEYS_READING`, chords with
 * Ctrl, Alt or Meta) stays the menus', so the on-screen keyboard is still driven by the arrows. A key's keyup always
 * reaches the menus. The browser's key repeat is queued for a key typed while the keyboard was up (the USB library's
 * repeat was not read) and dropped for a key held from before it opened. With no keyboard up nothing is queued for the
 * keyboard: the page's keys are the menus' pad -- but, where the menus' keys are not live (a release build), Enter /
 * Numpad Enter on a screen that binds `USBKBD_ENTER`, which `ENTER_OPENS_CHAT_ADAPTATION` queues for the dispatch's
 * step 6 instead (the lobby's chat opens on it as on R1).
 * [reading]
 */
export const PHYSICAL_TYPING_READING = 'USB keys while a soft keyboard is up: HID by code, US characters, Shift XOR CapsLock' as const;

/** `KeyboardEvent.code` -> the HID usage (USB HID Usage Tables, keyboard page 0x07; the UI Events code table). */
export const HID_BY_CODE: Readonly<Record<string, number>> = (() => {
  const m: Record<string, number> = {};
  for (let i = 0; i < 26; i++) m[`Key${String.fromCharCode(65 + i)}`] = 0x04 + i;
  for (let i = 1; i <= 9; i++) m[`Digit${i}`] = 0x1d + i;
  m.Digit0 = 0x27;
  const rest: [string, number][] = [
    ['Enter', 0x28], ['Escape', 0x29], ['Backspace', 0x2a], ['Tab', 0x2b], ['Space', 0x2c], ['Minus', 0x2d], ['Equal', 0x2e],
    ['BracketLeft', 0x2f], ['BracketRight', 0x30], ['Backslash', 0x31], ['IntlHash', 0x32], ['Semicolon', 0x33], ['Quote', 0x34],
    ['Backquote', 0x35], ['Comma', 0x36], ['Period', 0x37], ['Slash', 0x38],
    ['ArrowRight', 0x4f], ['ArrowLeft', 0x50], ['ArrowDown', 0x51], ['ArrowUp', 0x52],
    ['NumpadDivide', 0x54], ['NumpadMultiply', 0x55], ['NumpadSubtract', 0x56], ['NumpadAdd', 0x57], ['NumpadEnter', 0x58],
    ['NumpadDecimal', 0x63], ['Numpad0', 0x62],
  ];
  for (const [c, h] of rest) m[c] = h;
  for (let i = 1; i <= 9; i++) m[`Numpad${i}`] = 0x58 + i;
  return m;
})();

/**
 * ENTER_OPENS_CHAT_ADAPTATION (WM-ENTER-CHAT; product track, a browser adaptation over the original's own path). Bug
 * report R146 (a player, 2026-11-14): "hitting enter on keyboard should bring on the keyboard in lobby"; the owner, in
 * the bugs lane seat, 2026-11-15, verbatim: "enter opens keyboard in the lobby approved". With NO soft keyboard up, and
 * only while the screen showing has an EVENT binding of `USBKBD_ENTER` (0x2c; decided from the screen's bindings,
 * `SoftKeyboardFrontEnd.usbKbdEnterScreen` -- `dlgGameLobby` and `dlgMPBriefingRoom` on the disc, web research 119),
 * and only where the key is not a live menu key, a keydown of `Enter` / `NumpadEnter` (no Ctrl / Alt / Meta) is the
 * USB keyboard's Enter / Keypad Enter (HID 0x28 / 0x58): queued for the dispatch's step 6 (`menuKey`, `FUN_00368650`
 * D:L264243-264246, `@s2u/ui` `USB_ENTER_KEYS`), whose `FUN_00367810(G, 0x2c, 0)` fires the screen's own binding --
 * the chat keyboard opens as on R1, a late joiner gets the original's popup #360 -- and the key goes no further (its
 * browser repeat is taken and not queued).
 * A MENU KEY WINS: where the menus' keys are live (`MenuPageInput.takesKey`: a development build, OT.R29), Enter is
 * `MENU_KEYS_READING`'s CROSS on every screen, these two included, exactly as before -- it is not taken here, nothing
 * is queued, and a development build never opens the chat on Enter (`T` / R1 as before). So the adaptation overturns
 * nothing: it gives Enter a meaning only where it had none (a release build, where no menu key is attached). On every
 * other screen Enter is what it was (nothing in a release, CROSS in development); X and Space are untouched.
 * One slot, never the keyboard's queue (`next`): an Enter not popped within `ENTER_CHAT_STALE_MS`, or met at the pop by
 * another screen than the one it was pressed on (one that does not bind the event, or another that does) or by an
 * open keyboard, is dropped -- so a popup, a mute or a hosted frame that swallowed the dispatch (steps 1-4 return
 * before step 6; the front end's frame source answers null while muted or hosting) leaves no Enter to fire later, on
 * this screen or the next. A keyboard it opens never sees it: its held repeat is "held from before it opened"
 * (`PHYSICAL_TYPING_READING`).
 */
export const ENTER_OPENS_CHAT_ADAPTATION = 'no soft keyboard up, the screen binds USBKBD_ENTER, Enter is not a live menu key (a release build): Enter / Numpad Enter is the USB Enter step 6 pops (the owner, 2026-11-15: "enter opens keyboard in the lobby approved")' as const;

/**
 * How long a queued `ENTER_OPENS_CHAT_ADAPTATION` Enter waits for step 6's pop, in milliseconds of the page's clock
 * (`performance.now()`): the menus tick at 30 Hz (33 ms) when no switch is in flight, so a quarter second is several
 * ticks even on a slow frame, and far shorter than any screen change a player makes. Part of the adaptation (no
 * original: the USB library's queue was not read for a lifetime).
 */
export const ENTER_CHAT_STALE_MS = 250;

/** The keys `ENTER_OPENS_CHAT_ADAPTATION` reads, by `KeyboardEvent.code`. */
const ENTER_CODES: ReadonlySet<string> = new Set(['Enter', 'NumpadEnter']);

/** What the keys ask of the keyboard: whether one is up. */
export interface SoftKeyboardState { readonly isOpen: boolean }

/** The USB queue the page fills and the keyboard pops. */
export class SoftKeyboardKeys {
  private readonly queue: UsbKey[] = [];
  /** The keys queued since their keydown, so their browser repeat is typed too. */
  private readonly typed = new Set<string>();
  /** `ENTER_OPENS_CHAT_ADAPTATION`'s one slot: the Enter's HID usage, when it went down and the screen it went down on. */
  private enter: { hid: number; at: number; screen: object } | null = null;
  private state: SoftKeyboardState | null = null;
  private screen: () => object | null = () => null;

  /** `now`: the page's clock in milliseconds (`ENTER_CHAT_STALE_MS`). */
  constructor(private readonly now: () => number = () => performance.now()) {}

  /** `FUN_002dbd90`: the next pending key, or null. */
  next = (): UsbKey | null => this.queue.shift() ?? null;

  /**
   * `FUN_002dbd90` at the dispatch's step 6 (`ENTER_OPENS_CHAT_ADAPTATION`): the queued Enter's HID usage, once, or null
   * -- null and dropped when it is stale, a keyboard is up or the screen showing is not the binding screen it was
   * pressed on.
   */
  menuKey = (): number | null => {
    const e = this.enter;
    this.enter = null;
    if (!e || this.now() - e.at > ENTER_CHAT_STALE_MS || (this.state?.isOpen ?? false) || this.screen() !== e.screen) return null;
    return e.hid;
  };

  /**
   * The listener on `win`'s capture phase (before the document's, where PLAT-11's adapter listens): a keydown routed
   * by `PHYSICAL_TYPING_READING` is queued and goes no further; with no keyboard up, an Enter on a screen
   * `enterScreen` answers (the showing screen when it binds `USBKBD_ENTER`, else null) is
   * `ENTER_OPENS_CHAT_ADAPTATION`'s -- unless `menuKey` says the menus' own keys take that code (a menu key wins: it
   * passes untouched). Answers the detach.
   */
  attach(win: Window, state: SoftKeyboardState, textEntry = false, enterScreen: () => object | null = () => null,
    menuKey: (code: string) => boolean = () => false): () => void {
    this.state = state;
    this.screen = enterScreen;
    const down = (e: KeyboardEvent): void => {
      if (!state.isOpen) {
        this.queue.length = 0; this.typed.clear();
        if (!ENTER_CODES.has(e.code) || e.ctrlKey || e.altKey || e.metaKey || menuKey(e.code)) return;
        const screen = enterScreen();
        if (!screen) return;
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) this.enter = { hid: HID_BY_CODE[e.code]!, at: this.now(), screen };
        return;
      }
      this.enter = null;
      const hid = HID_BY_CODE[e.code];
      if (hid === undefined || !usbKeyHandled(hid) || e.ctrlKey || e.altKey || e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat && !this.typed.has(e.code)) return;
      this.typed.add(e.code);
      this.queue.push({ hid, shift: e.shiftKey, capsLamp: e.getModifierState?.('CapsLock') ?? false });
    };
    const up = (e: KeyboardEvent): void => { this.typed.delete(e.code); };
    if (import.meta.env.DEV || textEntry) {                          // Explicit text-entry support; never keyboard gameplay.
      if (import.meta.env.DEV) keyboardSite('s2u-kb-soft-keyboard');
      win.addEventListener('keydown', down, { capture: true });
      win.addEventListener('keyup', up, { capture: true });
    }
    return () => {
      win.removeEventListener('keydown', down, { capture: true });
      win.removeEventListener('keyup', up, { capture: true });
      this.queue.length = 0;
      this.typed.clear();
      this.enter = null;
    };
  }
}

/** `UiParams.rdr` out of `RUN/UI/READERC.ZAR` (`UI_PARAMS_RDR`). */
export async function readUiParams(source: AssetSource): Promise<RdrNode> {
  const bytes = (await readZarMembers(source, UI_PARAMS_RDR.archive, [UI_PARAMS_RDR.member])).get(UI_PARAMS_RDR.member);
  if (!bytes) throw new Error(`no ${UI_PARAMS_RDR.member} in ${UI_PARAMS_RDR.archive}`);
  return parseRdr(bytes);
}

/** What `connectSoftKeyboard` reaches: `@s2u/ui`'s `SoftKeyboardFrontEnd`. */
export interface SoftKeyboardTarget {
  readonly keyboard: SoftKeyboardState;
  load(params: SoftKeyboardParams): void;
  usbKey: (() => UsbKey | null) | null;
  /** `ENTER_OPENS_CHAT_ADAPTATION`: the screen showing when it has an EVENT binding of `USBKBD_ENTER`, else null; absent, never. */
  usbKbdEnterScreen?(): object | null;
}

/** The menus' page source as `connectSoftKeyboard` takes it: `takesKey` (PLAT-11's `MenuPageInput`) says which keys are the menus'. */
export type SoftKeyboardMenus = MenuInputSource & { takesKey?(code: string): boolean };

/**
 * The front end's keyboard connected to the page: its file read (`read`, by default `readUiParams` over the session's
 * source) and loaded, and the page's keys its USB queue. `loaded` answers whether the file loaded; until it does (or when
 * it does not) no layout is found and `GetTextInput` sets `skb_done` at once. `menus` (the menus' page source, PLAT-11's
 * `MenuPageInput`), when given, is handed the dispatch's step 6 pop (`ENTER_OPENS_CHAT_ADAPTATION`) until the detach,
 * and is asked which keys are its own (`takesKey`: a menu key wins).
 */
export function connectSoftKeyboard(target: SoftKeyboardTarget, win: Window, read: () => Promise<RdrNode>, textEntry = false, menus?: SoftKeyboardMenus | null): { loaded: Promise<boolean>; detach(): void } {
  const keys = new SoftKeyboardKeys();
  target.usbKey = keys.next;
  if (menus) menus.usbKey = keys.menuKey;
  const off = keys.attach(win, target.keyboard, textEntry, () => target.usbKbdEnterScreen?.() ?? null, (code) => menus?.takesKey?.(code) ?? false);
  const detach = (): void => { off(); if (menus && menus.usbKey === keys.menuKey) delete menus.usbKey; };
  const loaded = read().then((root) => { target.load(readSoftKeyboards(root)); return true; }, (e: unknown) => {
    console.warn('front end: no soft keyboard', e instanceof Error ? e.message : String(e));
    return false;
  });
  return { loaded, detach };
}
