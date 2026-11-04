import { parseRdr, readZarMembers, type AssetSource, type RdrNode } from '@s2u/archive';
import { UI_PARAMS_RDR, readSoftKeyboards, usbKeyHandled, type SoftKeyboardParams, type UsbKey } from '@s2u/ui';
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
 * repeat was not read) and dropped for a key held from before it opened. With no keyboard up nothing is queued: the
 * page's keys are the menus' pad, and `USBKBD_ENTER` (the dispatch's step 6) is not raised by them -- the lobby's chat
 * opens on R1 (`T`), its other binding. [reading]
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

/** What the keys ask of the keyboard: whether one is up. */
export interface SoftKeyboardState { readonly isOpen: boolean }

/** The USB queue the page fills and the keyboard pops. */
export class SoftKeyboardKeys {
  private readonly queue: UsbKey[] = [];
  /** The keys queued since their keydown, so their browser repeat is typed too. */
  private readonly typed = new Set<string>();

  /** `FUN_002dbd90`: the next pending key, or null. */
  next = (): UsbKey | null => this.queue.shift() ?? null;

  /**
   * The listener on `win`'s capture phase (before the document's, where PLAT-11's adapter listens): a keydown routed
   * by `PHYSICAL_TYPING_READING` is queued and goes no further. Answers the detach.
   */
  attach(win: Window, state: SoftKeyboardState, textEntry = false): () => void {
    const down = (e: KeyboardEvent): void => {
      if (!state.isOpen) { this.queue.length = 0; this.typed.clear(); return; }
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
}

/**
 * The front end's keyboard connected to the page: its file read (`read`, by default `readUiParams` over the session's
 * source) and loaded, and the page's keys its USB queue. `loaded` answers whether the file loaded; until it does (or when
 * it does not) no layout is found and `GetTextInput` sets `skb_done` at once.
 */
export function connectSoftKeyboard(target: SoftKeyboardTarget, win: Window, read: () => Promise<RdrNode>, textEntry = false): { loaded: Promise<boolean>; detach(): void } {
  const keys = new SoftKeyboardKeys();
  target.usbKey = keys.next;
  const detach = keys.attach(win, target.keyboard, textEntry);
  const loaded = read().then((root) => { target.load(readSoftKeyboards(root)); return true; }, (e: unknown) => {
    console.warn('front end: no soft keyboard', e instanceof Error ? e.message : String(e));
    return false;
  });
  return { loaded, detach };
}
