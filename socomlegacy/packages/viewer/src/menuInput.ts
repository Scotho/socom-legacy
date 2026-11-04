import { NO_PAD, type MenuInput, type MenuInputSource, type PadSlotName, type PadSnapshot } from '@s2u/ui';
import { GamePad } from './setupPad';
import { PAD_BUTTON, PAD_PRESS, type GamepadLike, type PadButton } from './gamepad';
import { keyboardSite } from './keyboardTesting';
import { mountMenuTouch } from './menuTouch';
import { LEFT_DEAD_ZONE, moveStick } from './moveStick';

/**
 * The page's keyboard, pad and touch as the PS2 pad the menus read (PLAT-11; web research 116 §11-§12; the owner's
 * default 1 in the sprint 9 plan): a browser adaptation with no original -- the PS2 had no PC keyboard in its menus
 * and no pointer -- that feeds `@s2u/ui`'s `MenuInput` (`MenuInputSource`) and never changes what the menus do with a
 * button.
 *
 * - **The keys** are `MENU_KEYS_READING`: the ARMORY's map (`ARMORY_MENU_KEYS_READING`, `./armory`, cited as a
 *   precedent, W9.R7) for every menu, and one key each for the buttons it leaves out.
 * - **The pad** is the W3C standard mapping by position (`./gamepad`'s `PAD_BUTTON`) to the game's slots, and its left
 *   stick through the pad's own dead zone, rescale and circle, both axes negated into the game's signs
 *   (`MENU_STICK_READING`, `menuStick`).
 * - **A tap or a click** on the front end's canvas is `MenuInput.tap` at the frame point (`MENU_TOUCH_READING`).
 * - **While the front end has the screen** (from the moment its canvas is up, `attachMenuInput`) the keys and the
 *   pointer stop here: a key (Esc and the browser's chords aside; a keyup always lets its key go first) is taken on the
 *   document's capture phase and goes no further than the document -- the document's other capture listeners still run
 *   (the front end's own audio unlock, `GameAudio.unlockOn`, registered once the sound files are read), no target,
 *   bubble or window bubble listener of the map viewer does -- and the canvas's pointer events
 *   go no further than the canvas (the capture-phase unlock has seen them). A window capture-phase listener registered
 *   before it still runs: `main.ts`'s WEAPON EXCHANGE and ARMORY keys act in Play, and Play restored from the page's
 *   storage is on under the front end (`I` opens WEAPON EXCHANGE; an open ARMORY takes every key) -- `main.ts` is a hot
 *   file, its gate is owed to the controller. So is the map viewer's own pad poll, which is not reached from here
 *   (research 116 §16).
 */

/**
 * MENU_KEYS_READING (research 116 §12; the owner's default 1, the owner may overturn): W / S / A / D and the arrows the
 * d-pad; Enter, Numpad Enter, X and Space CROSS; Backspace TRIANGLE; R CIRCLE; V SQUARE (the ARMORY's) -- and START
 * `P`, SELECT `O`, TRIGGER_L1 `PageUp`, TRIGGER_L2 `PageDown` (the disc's L1 / L2 bindings scroll up / down), TRIGGER_R1
 * `T` (its bindings open the chat), TRIGGER_R2 `Y`. Esc is left to the page (it releases the mouse). `BUTTON_EXECUTE`
 * needs no key (it is START, R116.2); L3 and R3 none (no binding word names them). [reading]
 */
export const MENU_KEYS_READING: Readonly<Record<string, PadSlotName>> = {
  KeyW: 'UP', ArrowUp: 'UP', KeyS: 'DOWN', ArrowDown: 'DOWN', KeyA: 'LEFT', ArrowLeft: 'LEFT', KeyD: 'RIGHT', ArrowRight: 'RIGHT',
  Enter: 'CROSS', NumpadEnter: 'CROSS', KeyX: 'CROSS', Space: 'CROSS', Backspace: 'TRIANGLE', KeyR: 'CIRCLE', KeyV: 'SQUARE',
  KeyP: 'START', KeyO: 'SELECT', PageUp: 'TRIGGER_L1', PageDown: 'TRIGGER_L2', KeyT: 'TRIGGER_R1', KeyY: 'TRIGGER_R2',
};

/**
 * MENU_KEY_LATCH_READING: the menus read the pad once a frame (`FUN_002da930`), and a key can go down and up between
 * two reads; such a key is read down once, so a quick tap is a press. A browser adaptation (a PS2 pad's button is
 * sampled, not latched). [reading]
 */
export const MENU_KEY_LATCH_READING = 'down and up between two reads: read down once' as const;

/**
 * MENU_STICK_READING (research 116 §11; LATER 350, reading, pending review): the W3C left stick (axes 0 / 1: x right, y
 * down) as the menus read the pad's stick 0 -- `FUN_002da930`'s steps on it, the move stick's (`./moveStick`): each axis
 * zeroed inside the dead zone (`+0x288`, 0.3; CONTROLLER OPTIONS' DEAD ZONE writes it for both sticks, research 204 §8),
 * rescaled past it (`+0x2a0`) and put through the circle (`FUN_002da200`, D:L179566-179634); the curve (D:L179636-179689),
 * the smoothing (D:L179744-179799) and the swap (D:L179800-179807) are off for stick 0 (research 184 §1.1), and the menus
 * read the result, `+0x220` / `+0x224` (D:L263848-263849, written D:L179810-179811) -- then negated into the game's
 * signs (x positive left, y positive up); the menus' 0.2 / 0.6 hysteresis applies to that. The menu touch layer's virtual
 * stick is a pad's stick here (`MenuPageInput.read`): through the same steps. Was: the raw W3C value.
 */
export const MENU_STICK_READING = 'W3C left stick through the pad dead zone, rescale and circle, both axes negated' as const;

/** `MENU_STICK_READING` on one W3C pair (x right, y down): the pad's processed stick 0 in the game's signs. */
export function menuStick(x: number, y: number, zone: number = LEFT_DEAD_ZONE): [number, number] {
  const [sx, sy] = moveStick(x, y, zone);
  return [-sx + 0, -sy + 0];
}

/** The standard mapping's buttons, by position, to the game's slots. */
export const MENU_PAD_SLOTS: Readonly<Record<PadButton, PadSlotName>> = {
  Cross: 'CROSS', Circle: 'CIRCLE', Square: 'SQUARE', Triangle: 'TRIANGLE', L1: 'TRIGGER_L1', R1: 'TRIGGER_R1',
  L2: 'TRIGGER_L2', R2: 'TRIGGER_R2', Select: 'SELECT', Start: 'START', L3: 'L3', R3: 'R3',
  Up: 'UP', Down: 'DOWN', Left: 'LEFT', Right: 'RIGHT',
};

/** A pad's slots down and its stick in the game's signs (`MENU_STICK_READING`), through the dead zone `zone`. */
export function padSnapshot(pad: GamepadLike | null | undefined, zone: number = LEFT_DEAD_ZONE): PadSnapshot {
  if (!pad) return NO_PAD;
  const down = new Set<PadSlotName>();
  for (const [name, index] of Object.entries(PAD_BUTTON) as [PadButton, number][]) {
    const b = pad.buttons[index];
    if (b && (b.pressed || b.value >= PAD_PRESS)) down.add(MENU_PAD_SLOTS[name]);
  }
  const axis = (i: number): number => { const v = pad.axes[i]; return typeof v === 'number' && Number.isFinite(v) ? v : 0; };
  const [stickX, stickY] = menuStick(axis(0), axis(1), zone);
  return { down, stickX, stickY };
}

/** Where a client point falls on the 640 x 448 frame drawn `object-fit: contain` in `rect`; null off the frame. */
export function framePoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): { x: number; y: number } | null {
  const s = Math.min(rect.width / 640, rect.height / 448);
  if (!(s > 0)) return null;
  const x = (clientX - rect.left - (rect.width - 640 * s) / 2) / s;
  const y = (clientY - rect.top - (rect.height - 448 * s) / 2) / s;
  return x >= 0 && x < 640 && y >= 0 && y < 448 ? { x, y } : null;
}

/** The pointer events the canvas keeps from the page beneath it. */
const POINTER_EVENTS = ['pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'click', 'dblclick', 'wheel', 'contextmenu', 'touchstart', 'touchend', 'touchmove'] as const;

/** The page's source for one front end: keys, the first physical pad, the menu touch pad and canvas taps. */
export class MenuPageInput implements MenuInputSource {
  private readonly held = new Set<string>();
  private readonly latched = new Set<string>();

  constructor(private readonly pads: () => readonly (GamepadLike | null)[] = () => [],
    private readonly touch: () => GamepadLike | null = () => null,
    /** The pad's dead zone now (`+0x288`: CONTROLLER OPTIONS' DEAD ZONE, `MENU_STICK_READING`). */
    private readonly deadZone: () => number = () => LEFT_DEAD_ZONE) {}

  /** `MenuInputSource.read`: held/latched keys and touch buttons merged with the first physical pad. */
  read(): PadSnapshot {
    const zone = this.deadZone();
    const pad = padSnapshot(this.pads().find((p) => p) ?? null, zone);
    const down = new Set<PadSlotName>(pad.down);
    const touch = padSnapshot(this.touch(), zone);
    for (const button of touch.down) down.add(button);
    for (const code of [...this.held, ...this.latched]) { const b = MENU_KEYS_READING[code]; if (b) down.add(b); }
    this.latched.clear();
    return { down, stickX: touch.stickX || pad.stickX, stickY: touch.stickY || pad.stickY };
  }

  /** A key down (the code of `KeyboardEvent.code`). */
  keyDown(code: string): void { this.held.add(code); this.latched.add(code); }
  keyUp(code: string): void { this.held.delete(code); }
  /** Every key let go and no tap kept (the window lost the focus: no keyup will come; or the menus begin reading). */
  release(): void { this.held.clear(); this.latched.clear(); }

  /**
   * The listeners while the front end has the screen: the keys on the canvas's document, capture phase (Esc and Ctrl /
   * Alt / Meta chords pass), the taps on `canvas` to `input.tap`; nothing of either reaches the map viewer beneath.
   * `win`'s blur lets every key go. Answers the detach.
   */
  attach(input: Pick<MenuInput, 'tap'>, canvas: HTMLCanvasElement, win: Window): () => void {
    const key = (e: KeyboardEvent): void => {
      if (e.type === 'keyup') this.keyUp(e.code);                   // always: a key let go under a chord is let go
      if (e.code === 'Escape' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.type === 'keydown' && !e.repeat) this.keyDown(e.code);
      if (MENU_KEYS_READING[e.code]) e.preventDefault();
      e.stopPropagation();                                          // the document's other capture listeners still run
    };
    const blur = (): void => this.release();
    const pointer = (e: Event): void => {
      e.stopPropagation();
      if (e.type === 'pointerdown') {
        const p = e as PointerEvent;
        const at = framePoint(p.clientX, p.clientY, canvas.getBoundingClientRect());
        if (at) input.tap(at.x, at.y);
        e.preventDefault();
      }
    };
    const doc = canvas.ownerDocument;
    if (import.meta.env.DEV) {                                       // OT.R29: the keys are a development build's only
      keyboardSite('s2u-kb-menus');
      doc.addEventListener('keydown', key, { capture: true });
      doc.addEventListener('keyup', key, { capture: true });
    }
    win.addEventListener('blur', blur);
    for (const t of POINTER_EVENTS) canvas.addEventListener(t, pointer, { passive: false });
    const detach = (): void => {
      doc.removeEventListener('keydown', key, { capture: true });
      doc.removeEventListener('keyup', key, { capture: true });
      win.removeEventListener('blur', blur);
      for (const t of POINTER_EVENTS) canvas.removeEventListener(t, pointer);
      this.release();
    };
    return detach;
  }
}

/** The page's adapter on a front end's canvas: `connect` the session's input when there is one; `detach` at the stop. */
export interface MenuPageAttachment {
  readonly page: MenuPageInput;
  /** The session's input: its source the page (the keys before it forgotten), the taps its. */
  connect(input: MenuInput): void;
  detach(): void;
}

/**
 * The page's adapter on `canvas` from the moment the canvas has the screen -- while the disc is read, and when no
 * session ever comes (no served tree, no 2D canvas) -- so nothing of the keys or the pointer reaches the map viewer
 * beneath (PLAT-10's review); a tap before `connect` is lost.
 */
export function attachMenuInput(canvas: HTMLCanvasElement, win: Window, deadZone?: () => number): MenuPageAttachment {
  const nav = win.navigator as Navigator | undefined;
  // The setup page's controller settings (the device, the bindings, the dead zone; `./setupPad`), the owner's
  // 2026-10-04 word: "make sure the game retains controller and mic settings as the setup implies".
  const pad = new GamePad({ releaseCrouch: false });   // the crouch shortcut is the match's; L2 stays the menus'
  const touch = mountMenuTouch(canvas, win);
  const poll = (): (GamepadLike | null)[] => {
    const p = nav ? pad.poll(nav) : null;
    touch.padConnected(pad.input.raw !== null);
    return p ? [p] : [];
  };
  poll();
  const page = new MenuPageInput(poll, () => touch.read(), deadZone);
  let input: MenuInput | null = null;
  const detach = page.attach({ tap: (x, y) => input?.tap(x, y) ?? null }, canvas, win);
  return {
    page,
    connect: (i) => { page.release(); touch.release(); input = i; i.source = page; },
    detach: () => { detach(); touch.dispose(); },
  };
}
