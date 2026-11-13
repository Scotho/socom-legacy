import { onInstallClick } from '../pwa/install';
import type { ConsoleController } from './grammar';
import { createMenuRumble, menuVibrationEnabled } from './menuRumble';
import { FIELD_ID, NAME_ID, PASSWORD_ID, SEARCH_ID } from './render/overlay';
import { roundRunning, type Button } from './state';
import { isField, scrollsToward, WheelTabs, wheelTabsOpen, type ScrollBox } from './wheelTabs';

/**
 * The console launcher's inputs (the S2U Briefing design system's prototype: KEYMAP and its keydown handler, the
 * pointer handlers, `pollPads` with PADMAP; its "Controller UI" section 1). The page keeps an input mode -- the last
 * device used -- on `<html data-input>`: a pointerdown makes it `pointer` (hover then moves focus, a click does the
 * verb, no ring), a pad or a mapped key makes it `pad`. The pad is polled per animation frame, standard mapping, a
 * circular dead zone of 0.24 on the left stick, a held direction (since CX-20 also L1 / R1) repeating after 400 ms
 * every 100 ms, triggers counted above 0.6. A browser adaptation with no original (the project's launcher page, OT.R28).
 *
 * OT.R29 (the owner, 2026-10-04: keyboard input is a local testing aid, release and demo excluded): the keyboard map is
 * attached only under a literal `import.meta.env.DEV`, which every `vite build` folds away. Pointer, touch and pad are
 * the release inputs; the sign-in dialog's real password field types natively in every build (a field, not navigation).
 * OT.R62 (the owner, 2026-10-17) narrows that for one key and one act: Escape closes an open popup in every build.
 * OT.R29's launcher exception (the owner, 2026-10-20, in the merge controller's seat: "Yes, launcher exception";
 * MISSION): Enter, Space, the console's OPTIONS key (o) and the original menu START (`MENU_KEYS_READING`'s P) press
 * START on every build, including a release, and a click does too. In-game controls stay a development build's.
 */

/**
 * Keys that press the launcher's START when the development keymap is not attached. Enter and Space; `o`, the console's
 * OPTIONS button, which is this page's START; `p`, the original menus' START (`../../menuInput` `MENU_KEYS_READING`).
 */
export function launcherStartKey(e: Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'altKey' | 'isComposing' | 'repeat'>): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing || e.repeat) return false;
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'o' || e.key === 'O' || e.key === 'p' || e.key === 'P') return true;
  return e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space' || e.code === 'KeyO' || e.code === 'KeyP';
}

/** Enter or Space: the keys LR-30 turned from START into Cross. */
const menuCross = (e: Pick<KeyboardEvent, 'key' | 'code'>): boolean => e.key === 'Enter' || e.key === ' ' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space';

/** The prototype's keyboard map: arrows the D-pad, Enter / Space Cross, Escape / Backspace Circle, F Square, T Triangle, Q / E L1 / R1, Z / C L2 / R2, O the OPTIONS button. */
export const KEYMAP: Readonly<Record<string, Button>> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'cross', ' ': 'cross', Escape: 'circle', Backspace: 'circle',
  w: 'up', s: 'down', a: 'left', d: 'right',                      // LR-30 (LR.R24): WASD as the arrows
  f: 'square', t: 'triangle', q: 'l1', e: 'r1', z: 'l2', c: 'r2', o: 'options',
};

/**
 * LR-30 (LR.R24, the owner, 2026-10-27, "make wasd work and arrow keys for menu nav"; "yes keyboard menu nav can reach
 * release builds"): the launcher's menu keys, on every build -- WASD and the arrows the stick / d-pad, Enter and Space
 * Cross, Escape and Backspace the back button. (LR.R24 (a) says Triangle; the legend's back is Circle everywhere
 * (`render/legend.ts`) and Triangle opens the account menu on Profile screens, so Circle -- the dispatcher's reading,
 * flagged in the report.) A launcher adaptation, the console's menus only: the game's keys stay OT.R29's, and the
 * overlay over a game reads none of these. START stays `o` / `p` (`launcherStartKey`).
 */
export const MENU_KEYMAP: Readonly<Record<string, Button>> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right',
  Enter: 'cross', ' ': 'cross', Escape: 'circle', Backspace: 'circle',
};

/** The W3C standard mapping's indices (8 Share / View and 10-11 the sticks' clicks do nothing here). */
export const PADMAP: Readonly<Record<number, Button>> = {
  0: 'cross', 1: 'circle', 2: 'square', 3: 'triangle', 4: 'l1', 5: 'r1', 6: 'l2', 7: 'r2', 9: 'options', 12: 'up', 13: 'down', 14: 'left', 15: 'right',
};
/** The left stick's circular dead zone (XInput's 7849 / 32767, about 0.24; "Controller UI" 1). */
export const DEAD = 0.24;
export const REPEAT_DELAY = 400;
export const REPEAT_EVERY = 100;
/** A trigger (or any analogue button) counts as pressed above this. */
export const TRIGGER_PRESS = 0.6;

/**
 * The held presses that repeat: the directions, and since CX-20 the L1 / R1 shoulders (CX.R12, the owner, 2026-10-12:
 * "one should be able to hold L1/R1 to flip through"), at the same REPEAT_DELAY / REPEAT_EVERY -- the design's one
 * repeat, no figure of their own. The face buttons, L2 / R2 and OPTIONS press once however long they are held.
 */
export const REPEATS: readonly Button[] = ['up', 'down', 'left', 'right', 'l1', 'r1'];

/** What the poll reads of a pad (a `Gamepad`'s shape). */
export interface PadLike { index?: number; axes: readonly number[]; buttons: readonly ({ pressed: boolean; value: number } | number)[] }
/** The held buttons: when each went down and when it last repeated. */
/** A button held, from its press (`t`) and its last repeat (`last`); `spent`, held through a stand-down: no repeat
 * until it is let go (CX-14's batch A review F2). */
export type Held = Record<string, { t: number; last: number; spent?: boolean }>;

/** One frame's presses, in PADMAP order. The optional source map retains the physical pad for launcher feedback. */
export function padFrame(pads: readonly PadLike[], held: Held, now: number, sources?: Partial<Record<Button, PadLike>>): Button[] {
  const down: Partial<Record<Button, PadLike>> = {};
  for (const p of pads) {
    p.buttons.forEach((bt, i) => {
      const v = typeof bt === 'object' ? bt.value : bt;
      const pressed = typeof bt === 'object' && bt.pressed;
      const b = PADMAP[i];
      if (b && (pressed || v > TRIGGER_PRESS)) down[b] ??= p;
    });
    const x = p.axes[0] ?? 0;
    const y = p.axes[1] ?? 0;
    if (Math.hypot(x, y) > DEAD) {
      if (Math.abs(x) > Math.abs(y)) down[x < 0 ? 'left' : 'right'] ??= p;
      else down[y < 0 ? 'up' : 'down'] ??= p;
    }
  }
  const out: Button[] = [];
  for (const b of Object.values(PADMAP)) {
    if (down[b]) {
      if (sources) sources[b] = down[b];
      const h = held[b];
      if (!h) { held[b] = { t: now, last: now }; out.push(b); }
      else if (!h.spent && REPEATS.includes(b) && now - h.t > REPEAT_DELAY && now - h.last > REPEAT_EVERY) { h.last = now; out.push(b); }
    } else delete held[b];
  }
  return out;
}

/** The control at or above an event's target matching `sel`, or null (a text node's or the document's target has none). */
function actOf(t: EventTarget | null, sel: string): HTMLElement | null {
  return t && typeof (t as Element).closest === 'function' ? (t as Element).closest<HTMLElement>(sel) : null;
}

/** A key that types a character into the sign-in field: one printable character, no modifier; Space once typing has begun. */
function printable(e: KeyboardEvent, typing: boolean): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return false;
  return e.key !== ' ' || typing;
}

/** OVERLAY-CONSOLE: a frame scheduler for the pad poll (the overlay's toggle frame); the window's otherwise. */
export interface InputFrame { request(cb: (now: number) => void): number; cancel(id: number): void }

/**
 * Attaches the inputs; answers the detach. `keymap`: attach the keyboard map (a development build only, OT.R29); `frame`:
 * the pad poll's scheduler (OVERLAY-CONSOLE: the overlay's frame), absent the window's `requestAnimationFrame`.
 */
export function attachInput(doc: Document, win: Window, ctl: ConsoleController, opts: { keymap: boolean; frame?: InputFrame; settle?: boolean }): () => void {
  const S = ctl.S;
  const off: (() => void)[] = [];
  let attached = true;
  let focused = doc.hasFocus();
  // F2 of the #509 review (LR.R11): under the overlay, a running round owns the pad's motors -- no menu pulse then.
  const rumble = createMenuRumble(win.navigator, () => focused && !doc.hidden && !roundRunning(ctl.S) && menuVibrationEnabled(ctl.A.options));
  off.push(() => { attached = false; rumble.stop(); });
  const on = <K extends string>(t: EventTarget, type: K, fn: (e: Event) => void, capture = false) => {
    t.addEventListener(type, fn, capture);
    off.push(() => { t.removeEventListener(type, fn, capture); });
  };

  /* ---------- the keyboard map (development builds only) ---------- */
  const onKey = (ev: Event): void => keyPress(ev as KeyboardEvent, KEYMAP);
  const keyPress = (e: KeyboardEvent, map: Readonly<Record<string, Button>>): void => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (S.accountOpen || ((e.key === 'Enter' || e.key === ' ') && actOf(e.target, '[data-act="accountmenu"], .cx-cat'))) return;
    if (ctl.A.report?.isOpen()) return;                            // OVERLAY-CONSOLE: the Report's own keys
    const id = (e.target as Element | null)?.id;
    if (id === PASSWORD_ID || id === NAME_ID || id === SEARCH_ID || id === FIELD_ID) return;   // the real fields type natively
    if (S.overlay === 'search' && printable(e, S.q.typing)) return;  // to the Search field (`onFieldKey`)
    if (S.overlay === 'field' && printable(e, S.fd.typing)) return;  // CX-PERSONA: to the Profile's field
    if (S.overlay === 'field' && e.key === 'Backspace') { e.preventDefault(); S.fd.text = Array.from(S.fd.text).slice(0, -1).join(''); ctl.render(); return; }
    const si = S.si;
    if (S.overlay === 'signin' && !si.busy) {
      // A printable key goes to the real field (`onFieldKey`, every build); Backspace deletes, as the prototype's.
      if (printable(e, si.typing)) return;
      if (e.key === 'Backspace') { e.preventDefault(); si.text = si.text.slice(0, -1); ctl.render(); return; }
    }
    if (map === KEYMAP && (e.key === 'p' || e.key === 'P') && ctl.A.states) {
      if (S.overlay === 'states') S.overlay = null;
      else if (!S.overlay) { S.overlay = 'states'; S.states.row = 0; }
      S.input = 'pad';
      ctl.render();
      return;
    }
    const b = map[e.key] ?? map[e.key.toLowerCase()];
    if (!b) return;
    if (map === MENU_KEYMAP && e.repeat && !REPEATS.includes(b)) return;                    // a held key repeats only where the pad's does
    // LATER 291: Enter on the Discord link is the link's own activation (one new tab). Not a hotkey. Space stays Cross.
    const enterOnLink = b === 'cross' && (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter')
      && (e.target as Element | null)?.closest?.('a[href]');
    if (enterOnLink) return;
    // LR-27: Enter and Space on a focused device mark are the mark's own activation (its native click), not Cross on the
    // focused row. The disc mark with its menu open is the menu's: Cross there chooses the highlighted source. A browser adaptation.
    const onMark = b === 'cross' && (e.key === 'Enter' || e.key === ' ' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space')
      ? (e.target as Element | null)?.closest?.('.cx-legend .cx-mark') ?? null : null;
    if (onMark && !(S.src.open && onMark.getAttribute('data-mark') === 'disc')) return;
    e.preventDefault();
    S.input = 'pad';
    if (b === 'options' || map === MENU_KEYMAP) ctl.A.controls?.note?.('keyboard');   // START's press, or a menu key (LR-30): the keyboard seen
    ctl.keyGesture = true;
    try { ctl.press(b); } finally { ctl.keyGesture = false; }   // LR-25: a key is a user gesture (a chooser may open)
  };
  if (import.meta.env.DEV) {                                       // OT.R29: a development build's keyboard only
    if (opts.keymap) on(win, 'keydown', onKey);
  }

  /* ---------- LR-30: the launcher's menu keys, every build (the dev keymap above owns them where attached) ---------- */
  const onMenuKey = (ev: Event): void => {
    if (import.meta.env.DEV && opts.keymap) return;
    if (S.mode === 'overlay') return;                                // the overlay over a game: the game's keys
    if (ctl.capturing()) return;                                     // a button awaited: the capture is the pad's
    keyPress(ev as KeyboardEvent, MENU_KEYMAP);
  };
  on(win, 'keydown', onMenuKey);

  /* ---------- launcher START, every build (the keymap above stays a development build's) ---------- */
  // Enter, Space, o (this page's OPTIONS / START) and p (the original menus' START, MENU_KEYS_READING). With the
  // development keymap attached, that map owns the keys (Enter and Space are Cross, o is OPTIONS, p opens the states
  // panel) and this handler stands down. A popup, a listen and a text field are left to their own keys; so is a focused
  // button's Enter and Space (its own activation), and the overlay over a game page, which has no START (#400's fold).
  const onLauncherStart = (ev: Event): void => {
    if (import.meta.env.DEV && opts.keymap) return;
    if (S.mode === 'overlay') return;
    const e = ev as KeyboardEvent;
    if (!launcherStartKey(e)) return;
    if (menuCross(e)) return;                                        // LR-30: Enter and Space are Cross now (`onMenuKey`)
    const activates = e.key === 'Enter' || e.key === ' ' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space';
    if (activates && (e.target as Element | null)?.closest?.('button, a[href], [role="button"], select, summary')) return;
    if (ctl.capturing() || (ctl.A.report?.isOpen() ?? false) || ctl.popupOpen()) return;
    const id = (e.target as Element | null)?.id;
    if (id === PASSWORD_ID || id === NAME_ID || id === SEARCH_ID || id === FIELD_ID) return;
    const tag = (e.target as Element | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement | null)?.isContentEditable) return;
    e.preventDefault();
    ctl.A.controls?.note?.('keyboard');
    // Through the controller, as the pad's OPTIONS: its cue (CX-51 `cueFor`: confirm, or the refusal's error) follows.
    ctl.press('options');
  };
  on(win, 'keydown', onLauncherStart);

  /* ---------- OT.R62: Escape closes a popup, in every build ---------- */
  // MODAL-CLOSE (the owner, 2026-10-17: "esc in release builds: fine to add for players"): the one key a release build
  // reads, and only while a popup is open (`ConsoleController.popupOpen`): Circle's press there (`escape`), then stopped
  // at the document's capture -- neither the keymap above (a development build's second Circle), nor a dialog's own field
  // or the replay viewer, nor anything of the page hears it. A held key's repeats are taken and do nothing (one layer a
  // press); a modified Escape is not read. With nothing open Escape is not read at all. The launcher's START keys are
  // the other every-build keys (Craig, 2026-10-20: the launcher is excluded from OT.R29); the rest of the map stays OT.R29's.
  const onEscape = (ev: Event): void => {
    const e = ev as KeyboardEvent;
    if (e.key !== 'Escape' || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    if (!ctl.popupOpen()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat) {
      const account = S.accountOpen;
      ctl.escape();
      if (account) doc.querySelector<HTMLElement>('.cx-account-menu [data-act="accountmenu"]')?.focus({ preventScroll: true });
    }
  };
  doc.addEventListener('keydown', onEscape, true);
  off.push(() => { doc.removeEventListener('keydown', onEscape, true); });

  /* Browser account disclosure: native Tab/activation inside; global shortcuts never reach the underlying stage. */
  let dismissedAccountPointer = false;
  const accountToggle = (): HTMLElement | null => doc.querySelector<HTMLElement>('.cx-account-menu [data-act="accountmenu"]');
  const closeAccount = (restore: boolean, quiet = false): void => {
    ctl.closeAccountMenu(quiet);
    if (restore) accountToggle()?.focus({ preventScroll: true });
  };
  const onAccountKeys = (ev: Event): void => {
    const e = ev as KeyboardEvent;
    if (!S.accountOpen || e.key === 'Escape' || e.key === 'Tab') return;
    const inside = actOf(e.target, '.cx-account-menu');
    if (inside && (e.key === 'Enter' || e.key === ' ')) return; // native summary/button activation
    if (KEYMAP[e.key] || KEYMAP[e.key.toLowerCase()] || e.key.toLowerCase() === 'p') {
      e.preventDefault(); e.stopImmediatePropagation();
    }
  };
  on(doc, 'keydown', onAccountKeys, true);
  on(doc, 'focusin', (e) => {
    if (S.accountOpen && !actOf(e.target, '.cx-account-menu')) closeAccount(false);
  });
  // Browser adaptation: every category remains a native Tab stop, including in release builds. Selecting on focus
  // brings that icon to the carousel's center; leave pad mode so the render cannot transfer focus to an action row.
  on(doc, 'focusin', (e) => {
    const category = actOf(e.target, '.cx-cat[data-act="cat"]');
    if (!category || S.screen !== 'home' || ctl.popupOpen() || ctl.capturing()) return;
    S.input = 'pointer'; doc.documentElement.dataset.input = 'pointer';
    if (Number(category.dataset.i) !== S.cat) ctl.pointer('cat', category.dataset);
  });
  on(doc, 'pointerdown', (e) => {
    dismissedAccountPointer = false;
    if (!S.accountOpen || actOf(e.target, '.cx-account-menu')) return;
    // Keep dismissal through the pointer's focus event, which precedes its click in a browser.
    dismissedAccountPointer = true;
    e.preventDefault(); closeAccount(true);
  }, true);
  on(doc, 'click', (e) => {
    if (dismissedAccountPointer) {
      dismissedAccountPointer = false; e.preventDefault(); e.stopImmediatePropagation(); return;
    }
    if (!S.accountOpen || actOf(e.target, '.cx-account-menu')) return;
    // An outside click dismisses the disclosure; it cannot also start the game or choose a page.
    e.preventDefault(); e.stopImmediatePropagation(); closeAccount(true);
  }, true);

  /* ---------- the password field: typing on a keyboard (every build: a field, not navigation) ---------- */
  // The review's F4: in pad mode the render gives the focused on-screen key the document's focus, so a physical key
  // typed then would be lost (the keymap above is a development build's only). A printable key pressed in the sign-in
  // dialog moves the focus to the real password field before the character lands, and the dialog stays in field typing
  // (`si.typing`: the render keeps the field focused) until a pad press hands the focus back to the on-screen key.
  const fieldOf = (): HTMLInputElement | null => {
    if (S.overlay === 'search') return doc.getElementById(SEARCH_ID) as HTMLInputElement | null;
    if (S.overlay === 'field') return doc.getElementById(FIELD_ID) as HTMLInputElement | null;
    return doc.getElementById(S.si.target === 'name' ? NAME_ID : PASSWORD_ID) as HTMLInputElement | null
      ?? doc.getElementById(PASSWORD_ID) as HTMLInputElement | null;
  };
  const typing = (): boolean => (S.overlay === 'search' ? S.q.typing : S.overlay === 'field' ? S.fd.typing : S.si.typing);
  const onFieldKey = (ev: Event): void => {
    const e = ev as KeyboardEvent;
    const field = fieldOf();
    const dialog = S.overlay === 'search' || S.overlay === 'field' || (S.overlay === 'signin' && !S.si.busy);
    if (!field || !dialog || e.target === field || !printable(e, typing())) return;
    if (S.overlay === 'search') S.q.typing = true; else if (S.overlay === 'field') S.fd.typing = true; else S.si.typing = true;
    field.focus();                                                 // the character lands in the field, as typed
  };
  on(doc, 'keydown', onFieldKey, true);
  // CX-24 (the merge controller's MU2-9 spec run, 2026-10-13): Enter in the sign-in's real field sends, as the modern UI's
  // sign-in form did (retired with the modern shell, CX-25). The form holds two text fields and no submit button, so a browser's
  // implicit submission does nothing there, and the keyboard map above leaves the fields alone: this is the field's Enter,
  // in every build (the field types natively in every build, CX.R6). On Add new's name field it moves to the password,
  // as the keyboard's NEXT does, and the password field takes the focus.
  const onFieldEnter = (ev: Event): void => {
    const e = ev as KeyboardEvent;
    const id = (e.target as Element | null)?.id;
    if (e.key !== 'Enter' || e.isComposing || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    if (S.overlay !== 'signin' || (id !== PASSWORD_ID && id !== NAME_ID)) return;
    e.preventDefault();
    // A held Enter's repeats are not presses (the batch review's F1): the name's first Enter moves on to the password
    // field, and a repeat landing there must not send it, nor re-send after a refusal.
    if (S.si.busy || e.repeat) return;
    S.si.target = id === NAME_ID ? 'name' : 'password';
    ctl.siSubmit();
    ctl.render();
    if (id === NAME_ID && S.si.target === 'password') (doc.getElementById(PASSWORD_ID) as HTMLInputElement | null)?.focus();
  };
  on(doc, 'keydown', onFieldEnter);
  // LR-38 (3) (the owner, 2026-10-29: the sign-in "cuts off" on a phone): at the phone rule and on a short landscape screen
  // the dialogs' scrim is the visual viewport (`./console.css` reads --cx-vv-h and --cx-vv-top), so the soft keyboard and the
  // browser's bars never hide the dialog; a dialog's field that takes the focus -- and again as the keyboard comes up -- is
  // scrolled into the dialog's own view (its box, the field itself being visually hidden), never the page's behind it.
  const root = doc.documentElement;
  const vv = (win as Window & { visualViewport?: VisualViewport | null }).visualViewport ?? null;
  const dialogField = (): { dialog: HTMLElement; box: HTMLElement } | null => {
    const at = doc.activeElement as HTMLElement | null;
    if (!at || at.tagName !== 'INPUT') return null;
    const dialog = at.closest<HTMLElement>('#overlay .cx-dialog');
    return dialog ? { dialog, box: at.closest<HTMLElement>('.cx-field__box') ?? at } : null;
  };
  const fieldInView = (): void => {
    const f = dialogField();
    if (!f) return;
    const b = f.dialog.getBoundingClientRect();
    const r = f.box.getBoundingClientRect();
    if (r.bottom > b.bottom) f.dialog.scrollTop += r.bottom - b.bottom;
    else if (r.top < b.top) f.dialog.scrollTop -= b.top - r.top;
  };
  if (vv) {
    const fitViewport = (): void => {
      root.style.setProperty('--cx-vv-h', `${Math.round(vv.height)}px`);
      root.style.setProperty('--cx-vv-top', `${Math.round(vv.offsetTop)}px`);
      fieldInView();
    };
    on(vv, 'resize', fitViewport);
    on(vv, 'scroll', fitViewport);
    fitViewport();
    off.push(() => { root.style.removeProperty('--cx-vv-h'); root.style.removeProperty('--cx-vv-top'); });
  }
  on(doc, 'focusin', () => { fieldInView(); });
  on(doc, 'focusin', (e) => {
    const id = (e.target as Element | null)?.id;
    if (S.overlay === 'search' && id === SEARCH_ID) { S.q.typing = true; return; }
    if (S.overlay === 'field' && id === FIELD_ID) { S.fd.typing = true; return; }
    if (S.overlay !== 'signin' || (id !== PASSWORD_ID && id !== NAME_ID)) return;
    S.si.typing = true;
    S.si.target = id === NAME_ID ? 'name' : 'password';
  });

  /* ---------- the pointer ---------- */
  on(doc, 'pointerdown', () => {
    if (S.input !== 'pointer') { S.input = 'pointer'; doc.documentElement.dataset.input = 'pointer'; }
  }, true);
  // LR-38 (5) (the owner, 2026-10-29: "Sliders should work with tap"): a Settings slider's track takes the finger and the
  // mouse alike -- a press on it sets the value at that point, a move of the same pointer while it is down moves it (the
  // track captures the pointer, and `../console.css` gives it `touch-action: none`), the release or a cancel ends it; each
  // change is the grammar's `optSlide` (cued and saved as a pad step). The click that follows is the row's own (focus).
  // The owner (2026-10-29, relayed from f9: "mouse clicks shoudl too. cant click on th yellow line"): every pointer type
  // takes the same path, the yellow line (the fill) and the thumb being inside the track; a click that no press of this
  // path came before (a synthetic click, or one from an assistive tool) sets the value at its point too, when that point is
  // on the track -- a click that a press here began is that press's, set already (test/console/lr38SliderPointer.test.ts).
  let slide: { track: HTMLElement; id: number } | null = null;
  // LR2 review F3: `pressed` is "a primary press on a track began the click to come": a non-primary button never sets it,
  // and it ends with its press -- at once on a cancel (no click follows one), and on a release once the click that release
  // makes has had its turn (the next task) -- so a later synthetic or assistive click is not taken for an old press's.
  let pressed = false;
  let pressEnd: ReturnType<typeof setTimeout> | undefined;
  const SLIDER_TRACK = '[role="slider"][data-act="optrow"] .cx-r__track';
  const slideTo = (e: Event, track: HTMLElement): void => {
    const row = track.closest<HTMLElement>('[role="slider"][data-act="optrow"]');
    if (!row) return;
    const r = track.getBoundingClientRect();
    const x = (e as MouseEvent).clientX;
    ctl.optSlide(Number(row.dataset.i), r.width > 0 ? (x - r.left) / r.width : 0);
  };
  const pointerId = (e: Event): number => (e as PointerEvent).pointerId ?? 1;
  on(doc, 'pointerdown', (e) => {
    const track = actOf(e.target, SLIDER_TRACK);
    const primary = ((e as MouseEvent).button ?? 0) === 0;
    if (pressEnd !== undefined) { clearTimeout(pressEnd); pressEnd = undefined; }
    pressed = !!track && primary;
    if (!track || !primary) return;
    slide = { track, id: pointerId(e) };
    try { track.setPointerCapture?.(slide.id); } catch { /* a pointer the browser no longer has */ }
    slideTo(e, track);
  });
  on(doc, 'pointermove', (e) => { if (slide && pointerId(e) === slide.id) slideTo(e, slide.track); });
  const endSlide = (e: Event): void => {
    if (!slide || pointerId(e) !== slide.id) return;
    try { slide.track.releasePointerCapture?.(slide.id); } catch { /* already released */ }
    slide = null;
  };
  on(doc, 'pointerup', endSlide);
  on(doc, 'pointercancel', endSlide);
  on(doc, 'pointerup', () => {
    if (!pressed) return;
    if (pressEnd !== undefined) clearTimeout(pressEnd);
    pressEnd = setTimeout(() => { pressed = false; pressEnd = undefined; }, 0);
  });
  on(doc, 'pointercancel', () => { pressed = false; if (pressEnd !== undefined) { clearTimeout(pressEnd); pressEnd = undefined; } });
  on(doc, 'click', (e) => {
    const track = actOf(e.target, SLIDER_TRACK);
    const own = pressed;
    pressed = false;
    if (!track || own || ((e as MouseEvent).button ?? 0) !== 0) return;
    const r = track.getBoundingClientRect();
    const x = (e as MouseEvent).clientX;
    if (r.width > 0 && x >= r.left && x <= r.right) slideTo(e, track);
  });
  // PWA-6: prompt() only from a trusted click, in capture, before the bubble handler treats the button as Circle.
  on(doc, 'click', (e) => {
    const click = e as MouseEvent;
    onInstallClick({ isTrusted: click.isTrusted, target: click.target instanceof Element ? click.target : null });
  }, true);
  on(doc, 'click', (e) => {
    // A click on START is the mouse, on every build, the same as a controller for START. Noted before the verb, so that
    // click is the input that lets it through (a re-render here would drop the click). Any other click marks nothing
    // (the merge controller's call on #400, 2026-10-20): an invite address's auto-START waits for a START press.
    // LR-23 (LR.R22, "Start game, gone"): on Home, Play is the launch -- a click on it is that START press (its Cross is
    // START's act when ready), so a mouse-only player is not sent to the controller check by the click itself.
    const notedPointer = actOf(e.target, '[data-act="start"], .cx-item--play') ? (ctl.A.controls?.note?.('pointer') ?? false) : false;
    // CX-16 (the controller's answer in the CX-16/17 review): a click or tap outside the open disc source dropdown -- on
    // nothing, or on another control, which then does its own work -- closes it, as a menu closes; its icon (which
    // toggles it) and its own options are inside.
    if (S.src.open && !actOf(e.target, '.cx-srcmenu, .cx-srcbtn, .cx-mark[data-mark="disc"]')) ctl.closeSource();   // LR-37 (2): its close cue
    const el = actOf(e.target, '[data-act]');
    if (el?.dataset.act === 'accountmenu') {
      e.preventDefault(); ctl.toggleAccountMenu(); accountToggle()?.focus({ preventScroll: true }); return;
    }
    if (el?.dataset.act === 'profileitem' && S.accountOpen) closeAccount(true, true);   // LR-37 (2): the item's own act says its cue
    if (!el) { if (notedPointer) ctl.render(); return; }
    if (ctl.pointer(el.dataset.act ?? '', el.dataset, el.classList.contains('is-action'))) e.stopPropagation();
  });
  on(doc, 'mouseover', (e) => {
    if (S.input !== 'pointer') return;
    const el = actOf(e.target, '[data-act="item"],[data-act="discord"],[data-act="github"],[data-act="room"],[data-act="optrow"],[data-act="remaprow"],[data-act="loside"],[data-act="lorow"],[data-act="loedit"],[data-act="pfrow"],[data-act="pfedit"],[data-act="pfnew"],[data-act="pfrec"],[data-act="lbrow"],[data-act="lbgame"],[data-act="lbcustom"]');
    // LR-24 (the box's matrix-4 at 97f5822e3, consoleRows.spec: a visible Home row never took its click): above the phone
    // rule the page's Home list slides by the focused row (LR.R22, the mockup's `itemShift`), so a hover that moved the
    // focus slid the row from under the pointer, the next row took the hover, and the list chased it. The mockup's rows
    // take no hover (only its click selects): on that sliding list the hover moves no focus; a click focuses and opens
    // the row as before (`pointer`). Elsewhere CX-51's hover stands.
    // LR-28 (fact 3, the box's matrix-7 probe13 at 390x844 and 844x390 with a mouse): on the phones the hover moved the
    // focus too, the draw of the new focus moved the rows under the pointer, and the first click opened another row. The page's Home list takes no hover at any size, as the wide one (a tap's own mouseover included: its
    // click focuses and opens the row it lands on). LR-39 (LR.R32): the overlay's Home is the page's (`is-page`), so it takes
    // no hover either (it kept CX-51's under LR.R18).
    if (el && (el.dataset.act === 'item' || el.dataset.act === 'discord' || el.dataset.act === 'github') && el.closest('.cx-home.is-page')) return;
    if (el) ctl.hover(el.dataset.act ?? '', Number(el.dataset.i));
  });

  /* ---------- LATER 335: the wheel between Home's tabs (every build: the pointer's, not a game control) ---------- */
  // Craig's ask (2026-10-22), a browser adaptation: one notch is one L1 / R1 press (`./wheelTabs`), entered here as the
  // keymap enters one, so the grammar's shoulders do the rest -- the wrap, the move cue, the announcement (CX-20, CX.R12);
  // the input mode stays the pointer's (not `padPress`). Only Home's crossbar with nothing open over it (`wheelTabsOpen`,
  // the console's own state); a gesture that begins over a list that can still scroll that way, or over a field, is the
  // page's to its end; a modified wheel (Ctrl's zoom) is never read. Not passive: only a wheel that is ours is prevented.
  // The wheel is no held press: `REPEATS` never hears it.
  const wheel = new WheelTabs();
  const style = (el: ScrollBox): { overflowX: string; overflowY: string } => win.getComputedStyle(el as unknown as Element);
  const onWheel = (ev: Event): void => {
    const e = ev as WheelEvent;
    if (!wheelTabsOpen(S, ctl)) { wheel.reset(); return; }
    const r = wheel.step({
      dx: e.deltaX, dy: e.deltaY, mode: e.deltaMode, t: e.timeStamp,
      modified: e.ctrlKey || e.metaKey || e.altKey || e.shiftKey,
      native: (axis, sign) => isField(e.target) || scrollsToward(e.target as unknown as ScrollBox | null, axis, sign, style),
    });
    // The gesture's idle gap runs from when this event is handled, in the events' own clock (a new event's `timeStamp`;
    // `./wheelTabs` `handled`): on a slow page a spin's next notch is made only after this one is delivered and drawn.
    // The page's own gesture too (a 'pass' over a list that can scroll; the fresh review's F1), so a slow spin over a list
    // stays the list's to its end; never a modified wheel's, which `step` does not read.
    const handled = (): void => { wheel.handled(doc.createEvent('Event').timeStamp); };
    if (r === 'pass') { if (!(e.ctrlKey || e.metaKey || e.altKey || e.shiftKey)) handled(); return; }
    e.preventDefault();
    if (r !== 'swallow') ctl.press(r === 'next' ? 'r1' : 'l1');
    handled();
  };
  doc.addEventListener('wheel', onWheel, { passive: false });
  off.push(() => { doc.removeEventListener('wheel', onWheel); });

  /* ---------- the password field (every build: a field, not navigation) ---------- */
  on(doc, 'input', (e) => {
    const t = e.target as HTMLInputElement | null;
    if (t?.id === SEARCH_ID && S.overlay === 'search') { S.q.text = t.value.slice(0, 64); ctl.render(); return; }
    if (t?.id === FIELD_ID && S.overlay === 'field') { S.fd.text = t.value; ctl.fClip(); S.fd.error = ''; ctl.render(); return; }
    if ((t?.id !== PASSWORD_ID && t?.id !== NAME_ID) || S.overlay !== 'signin' || S.si.busy) return;
    if (t.id === NAME_ID) S.si.name = t.value; else S.si.text = t.value;
    ctl.siClip();
    S.si.error = '';
    ctl.render();
  });
  on(doc, 'submit', (e) => {
    const f = e.target as HTMLElement | null;
    if (f?.dataset.form === 'search') { e.preventDefault(); if (S.overlay === 'search') { ctl.applySearch(); ctl.render(); } return; }
    if (f?.dataset.form === 'field') { e.preventDefault(); if (S.overlay === 'field') { ctl.fDone(); ctl.render(); } return; }
    if (f?.dataset.form !== 'signin') return;
    e.preventDefault();
    if (S.overlay === 'signin' && !S.si.busy) { ctl.siSubmit(); ctl.render(); }
  });

  /* ---------- the gamepad ---------- */
  const held: Held = {};
  let settling = opts.settle === true;
  let padsOK = true;
  let raf = 0;
  const poll = (now: number): void => {
    rumble.sync(now);
    // CX-14: the button mapping screen's binding machine reads the pads first (`../padBinding`, through the grammar's
    // `remapFrame`). While it listens for a binding the walker stands down: it still reads the pad, so a button held
    // through the listen is no fresh press after it, but its presses are dropped -- in the frame the binding is taken or
    // the question asked too (`standDown`, read before the machine's frame) -- so the press meant for the binding neither
    // moves the focus nor acts.
    const standDown = ctl.capturing();
    ctl.remapFrame(now);
    if (padsOK) {
      let pads: readonly PadLike[] = [];
      const read = ctl.A.pad.read;
      try {
        if (read) pads = read();                                   // the live pad: the setup page's saved choices
        else {
          const nav = win.navigator as Navigator & { getGamepads?: () => (Gamepad | null)[] };
          pads = nav.getGamepads ? Array.from(nav.getGamepads()).filter((p): p is Gamepad => !!p) : [];
        }
      } catch { padsOK = false; }
      if (!read && pads.length && !ctl.A.pad.connected()) { ctl.A.pad.setConnected(true); ctl.render(); }
      const report = ctl.A.report?.isOpen() ?? false;              // OVERLAY-CONSOLE: the Report's open: no press of the console's
      const sources: Partial<Record<Button, PadLike>> = {};
      const presses = padFrame(pads, held, now, sources);
      // B61 F3: attached again after a page dialog that read the pad itself (the touch layout editor's Circle), the
      // buttons held at the first frame are no press until let go (`settle`), as a stand-down's are.
      if (settling) { settling = false; for (const h of Object.values(held)) h.spent = true; }
      else for (const b of presses) {
        if (standDown || report || ctl.capturing()) break;       // a press that began a listen ends this frame's
        rumble.pulse(sources[b]?.index, now);
        ctl.padPress(b);
        if (!attached) return;                                   // a hand-over owns no later press, pulse or frame
        rumble.sync(now);                                        // a menu action may itself turn vibration off
      }
      // A button held through a stand-down frame (a listen, the binding taken, the question asked) gives no repeat
      // until it is let go: the conflicting button held on would otherwise walk the Confirm off Cancel (the batch A
      // review's F2). Only a fresh press counts.
      if (standDown || ctl.capturing()) for (const h of Object.values(held)) h.spent = true;
    }
    raf = frame ? frame.request(poll) : win.requestAnimationFrame(poll);
  };
  const frame = opts.frame ?? null;
  if (frame) {
    raf = frame.request(poll);
    off.push(() => { frame.cancel(raf); });
  } else if (typeof win.requestAnimationFrame === 'function') {
    raf = win.requestAnimationFrame(poll);
    off.push(() => { win.cancelAnimationFrame(raf); });
  }
  // A pad of another layout (LATER 380): one not yet taught opens the button mapping screen to be taught; one taught is
  // a controller like any other (`ConsoleController.padOfOtherLayout`).
  on(win, 'gamepadconnected', (e) => {
    if (((e as GamepadEvent).gamepad?.mapping ?? 'standard') !== 'standard') { ctl.padOfOtherLayout(); return; }
    ctl.A.pad.setConnected(true);
    ctl.toast('Controller connected');
    ctl.render();
  });
  on(win, 'gamepaddisconnected', () => { rumble.stop(); ctl.toast('Controller disconnected'); ctl.render(); });
  // A visible but unfocused window may keep polling held buttons. Resume feedback only after its focus returns.
  on(win, 'blur', () => { focused = false; rumble.stop(); });
  on(win, 'focus', () => { focused = true; });
  on(doc, 'visibilitychange', () => { if (doc.hidden) rumble.stop(); });

  return () => { for (const f of off.splice(0)) f(); };
}
