/**
 * PAR-5 (PARITY-2; web research 222 §11, research 253 §4): the touch layer, WEAPON EXCHANGE's touch half and the phone's
 * tip as one part both pages mount -- `/testroom` (`./main`) on its page's body, the menu-launched match
 * (`./matchMount`) on the element it is mounted into. A **browser adaptation** with no original (the PS2 has no touch
 * screen): the controls of a real touch device -- the one START lets in without a controller (OT.R29: a coarse pointer,
 * or a touch seen; never a window's width) -- read into the pad's own lanes, so nothing downstream of the lanes changes.
 *
 * MP-1 (FI.R1, FI.R3; the owner, 2026-10-16: "polish the mobile overlay controls to use SONY buttons and disable them when
 * a mobile phone has a controller selected. don't say shoot show the actual buttons"): the touch layer is a pad. Walking,
 * its buttons are the standard pad's sixteen (`data-pad`, `./touch` `attachWalkTouch`), pressed on one virtual pad with
 * the two floating sticks (`pad`), and the lanes are read off that pad through the pad's map (`./gamepad` `padInput`: the
 * active controller config, OPT-14, research 344 §7; the two floating sticks stay move and look) -- so
 * a touch button means what the controller's button means, and no lane is named twice. FI.R4: the layer hides, and takes
 * no touch, while the pad the game reads resolves to a connected one (`readsPad`, `padConnected`), on whatever root holds it.
 *
 * Root-scoped: every element is found under the root it is handed (`./touch` `TouchScope`), the layer's classes are the
 * root's, and every listener goes at `dispose` -- so two roots never take each other's elements or pointers. Every line is
 * `main.ts`'s as it stood at d35dfe544 (research 222 §11.1 cites each), moved: the lanes and `holdTouch`, `releaseTouch`,
 * the sticks and buttons, WEAPON EXCHANGE's INV and its showing, the canvas's taps on the open menu, the prompt's device,
 * the phone's tip. A page with no layer in its markup (the menu match: `./pageEntry` takes `/testroom`'s out of the front
 * end's page) has it built under the root from `index.html`'s own markup (`TOUCH_LAYER_MARKUP`, pinned to it by
 * `test/matchTouch.test.ts`).
 */
import { TOUCH_LAYER_MARKUP } from './touchMarkup';
import { mountMobileFullscreen } from './mobileFullscreen';
import { LAYOUT_NOTICE_TEXT, layoutNoticeDue, layoutNoticeShown, mountMobileLayout } from './mobileLayout';
import type { Settings } from '@s2u/card';
import { noInput, PAD_FLAGS, padButtonLanes, padInput, type GamepadLike, type Input } from './gamepad';
import type { MatchExchange } from './matchExchange';
import { MobileTip, tipText, type TipStore } from './mobileTip';
import type { GamePad } from './setupPad';
import { attachTouchControls, attachWalkTouch, under, wantsTouchControls, type StanceTouch, type TouchTarget } from './touch';
import { frameOfPoint } from './weaponExchange';
import type { InputDevice } from './weaponSelect';

export { TOUCH_LAYER_MARKUP } from './touchMarkup';

/** How long the tip stays when it is not dismissed: `/testroom`'s `Ui`'s `TIP_MS` (`./ui`), held equal by the test. */
export const TOUCH_TIP_MS = 12000;

/** The classes the part may set on its root, every one taken off at `dispose` (`styles.css` reads them). */
const ROOT_CLASSES = ['touch', 'pad-on', 'is-walking', 'is-taunts-open', 'tip-on', 'is-exchange-open'] as const;

/**
 * FI.R4 ("A controller selected" is the pad the game reads): whether `GamePad`'s choice, after this frame's poll, resolved
 * to a connected pad -- the chosen pad when it is connected, else the automatic one (the first standard pad, else the
 * first): `./setupPad`, `./controllerInput` `ControllerInput.poll`'s `raw`. The pages tell the layer each frame
 * (`MatchTouch.padConnected`). A browser adaptation.
 */
export function readsPad(game: Pick<GamePad, 'input'>): boolean {
  return game.input.raw !== null;
}

/**
 * Whether a pad button holds the action lane in the pad's active map (`./gamepad` `padButtonLanes`: the controller
 * config CONTROLLER PRESETS chose, OPT-14, research 344 §7), as the lanes `sync` reads off the virtual pad do.
 */
const holdsAction = (index: number): boolean => padButtonLanes(index).includes('action');

/** What a page hands the part. */
export interface MatchTouchDeps {
  /** The touch C (`WalkMode.stanceTouch`): its press, release and cancel (`/testroom` gates the press under its ARMORY). */
  stance(event: StanceTouch): void;
  /** The fly layout's fire button, pressed true and let go false (`/testroom`'s `trigger`). */
  fire(down: boolean): void;
  /**
   * The old RELOAD button's deed (the `R` key's). Unread since MP-1: the touch R3 holds the reload lane on the virtual pad,
   * which the pages' lanes read as a controller's R3 (`./matchLanes`). Optional, so the pages' wiring may drop it.
   */
  reload?(): void;
  /** XR-06 (research 214 s4): the action lane taken by the system is a cancel, never a release (`cancelAction('touch')`). */
  cancelAction(): void;
  /** WEAPON EXCHANGE (`./matchExchange`): INV's press and its showing. */
  exchange: Pick<MatchExchange, 'menu' | 'refresh' | 'gate' | 'isOpen' | 'prompt'>;
  /** Another screen over the match (the ARMORY, the loading hold): INV hidden (`main.ts`'s `showWeaponsButton`). */
  covered(): boolean;
  /** Where a hybrid's first touch is heard (the page's window; the global by default). */
  win?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  /** No layer in the root's markup (the menu match): it is built there, a stacking context at this z (over its canvas). */
  build?: { zIndex: number };
}

/** The part a page holds. */
export interface MatchTouch {
  /**
   * The touch lanes, merged with the pad's each frame (`main.ts`'s `touchInput`): the virtual pad (`pad`) read through
   * the active map -- the sticks through the pad's pipeline, each pad button's lane -- with the fly camera's lift and rim boost.
   */
  readonly input: Input;
  /** MP-1 (FI.R3): the touch layer as one pad -- the sticks on the standard axes 0-3, the buttons by their standard index. */
  readonly pad: GamepadLike;
  /** Let go: the sticks, the touch C cancelled, every held lane released at the frame's end, as a lift is (`main.ts`'s `releaseTouch`). */
  release(): void;
  /**
   * FI.R4: whether the pad the game reads is a connected one (`readsPad`), told each frame. On the change to true the layer
   * hides (`pad-on` on the root, the layer inert, no press reaches it) and its sticks and the tip are let go; back to
   * false, it shows again. The same answer again does nothing.
   */
  padConnected(on: boolean): void;
  /** The frame's end: the lifts this frame read are let go for the next (`main.ts`'s `touchReleased`). */
  endFrame(): void;
  /**
   * INV shown while the dead's prompt is up or the menu open, and no other screen over the match (`main.ts`'s
   * `showWeaponsButton`); and PAR-5a: `is-exchange-open` on the root while the menu is open, so the stick zones yield its
   * rows' taps to the canvas (`styles.css`; research 222 §11.4).
   */
  weaponsFrame(): void;
  /** INV's state, for the hook: shown, or null with no INV under the root. */
  weaponsShown(): boolean | null;
  /** The menu match's walk and Chat menu on the root (`/testroom`'s are its `Ui`'s `is-walking` and its frame's `is-taunts-open`). */
  pageState(walking: boolean, chat: boolean): void;
  /** The tip under the root, with `text`, until its close (`dismiss`) or `TOUCH_TIP_MS` (`/testroom`'s is its `Ui.showTip`). */
  showTip(text: string, dismiss: () => void): void;
  /** Every listener off, the tip's time stopped, the root's classes taken off, a built layer taken out. */
  dispose(): void;
}

export function mountTouch(root: HTMLElement, d: MatchTouchDeps): MatchTouch {
  const abort = new AbortController();
  const { signal } = abort;
  let built: HTMLElement | null = null;
  if (d.build && !under(root, 'touch')) {
    built = root.ownerDocument.createElement('div');
    built.style.position = 'relative';                // placement only: a stacking context over the match's canvas
    built.style.zIndex = String(d.build.zIndex);
    built.innerHTML = TOUCH_LAYER_MARKUP;
    root.append(built);
  }
  // main.ts:1016-1027: the sticks' lane, held here rather than written into the camera so a pad's is merged with it.
  const input: Input = noInput();
  // MP-1 (FI.R3): the virtual pad's buttons, by the standard index; the sticks are its axes (`controls.axes`).
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  /** The fly camera's lift buttons and the rim's boost: the two touch lanes with no pad button (the fly camera's own). */
  const own = { jump: false, crouch: false, boost: false };
  /** The pad's buttons into the lanes through the pad's active map, as a controller's are, with the fly camera's own beside them. */
  const sync = (): void => {
    const lanes = padInput({ axes: [], buttons });
    for (const f of PAD_FLAGS) input[f] = lanes[f];
    if (own.jump) input.jump = true;
    if (own.crouch) input.crouch = true;
    if (own.boost) input.boost = true;
  };
  const lane: TouchTarget = {
    setStick: (x, y) => { input.moveX = x; input.moveY = y; },
    setLook: (x, y) => { input.lookX = x; input.lookY = y; },
    setLift: (v) => { own.jump = v > 0; own.crouch = v < 0; sync(); },
    setStickBoost: (on) => { own.boost = on; sync(); },
  };
  // main.ts:1030-1041: a release kept until the frame after the press was read, so a tap shorter than a frame is an edge.
  const letGo = new Set<number>();
  let liftLetGo = false;
  const hold = (index: number, down: boolean, how: 'up' | 'cancel' = 'up'): void => {
    const b = buttons[index];
    if (!b) return;
    if (down) { b.pressed = true; b.value = 1; letGo.delete(index); sync(); } else letGo.add(index);
    if (!down && how === 'cancel' && holdsAction(index)) d.cancelAction();
  };
  /** FI.R4: the game reads a connected pad -- the layer hidden, and no press reaches it. */
  let padOn = false;
  const blocked = (): boolean => padOn;
  // main.ts:1192, 1198-1203, 1228, in their order.
  /** Whether touch itself holds fire (B61 review F1): a blur or a layout refresh lets go only what touch holds. */
  let touchFire = false;
  const fire = (down: boolean): void => { touchFire = down; d.fire(down); };
  const controls = attachTouchControls(lane, d.stance, fire, { root, signal, blocked, ...(d.win ? { win: d.win } : {}) });
  const pad: GamepadLike = { get axes() { return controls.axes(); }, buttons };
  const weapons = under(root, 'tw-weapons') as HTMLButtonElement | null;
  weapons?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (padOn) return;
    d.exchange.refresh();
    d.exchange.menu.touchButton(d.exchange.gate());
  }, { signal });
  /** The walk pad's buttons' own resets (MP-1's review F1): a finger's hold and its `is-down` let go without a press. */
  const walkResets: (() => void)[] = [];
  attachWalkTouch(hold, { root, signal, blocked, resets: walkResets });
  const cancelTouch = (): void => {
    // A pad read by the game hides the layer (FI.R4): touch holds nothing, and the pad's own held R1 or C is never let go.
    if (padOn) return;
    if (buttons.some((b, i) => b.pressed && holdsAction(i))) d.cancelAction();   // the action's button in the active map (OPT-14)
    controls.release();
    d.stance('cancel');
    if (touchFire) fire(false);
    own.jump = false; own.crouch = false; own.boost = false; liftLetGo = false;
    for (const reset of walkResets) reset();
    buttons.forEach((b) => { b.pressed = false; b.value = 0; });
    letGo.clear(); sync();
  };
  const stopFullscreen = built ? mountMobileFullscreen(root) : () => {};
  const stopLayout = mountMobileLayout(root, cancelTouch);
  // The settings frame (or another app) taking focus must not leave a captured thumb firing behind it.
  (d.win ?? root.ownerDocument.defaultView)?.addEventListener('blur', cancelTouch, { signal });

  const q = (id: string): HTMLElement | null => under(root, id);
  let tipTimer: ReturnType<typeof setTimeout> | null = null;
  const hideTip = (): void => {
    if (tipTimer !== null) { clearTimeout(tipTimer); tipTimer = null; }
    const tip = q('mobile-tip');
    if (tip) tip.hidden = true;
    root.classList.remove('tip-on');
  };
  return {
    input,
    pad,
    release: () => {
      controls.release();
      d.stance('cancel');                              // a touch C held as the screen opened: no prone behind it
      Object.assign(input, { moveX: 0, moveY: 0, lookX: 0, lookY: 0 });
      own.boost = false;
      if (own.jump || own.crouch) liftLetGo = true;
      buttons.forEach((b, i) => { if (b.pressed) letGo.add(i); });
      for (const r of walkResets) r();               // the review's F1: no button keeps a finger the screen took
      sync();
    },
    padConnected: (on) => {
      if (on === padOn) return;
      padOn = on;
      root.classList.toggle('pad-on', on);
      q('touch')?.toggleAttribute('inert', on);       // no pointer reaches a hidden layer, its stylesheet or not
      if (on) { controls.release(); hideTip(); }       // main.ts:1047, and `Ui.setPadConnected`'s tip
      // FI.R4: hidden, the virtual pad holds nothing at once -- the pages join its buttons to the read pad's set
      // (`padButtonsDown(touch.pad)`), so a touch START held as a pad is read opens nothing under it. A held Cross goes
      // as a cancel, as a lost pad's does (XR-06), never as the release its lane would read.
      if (on) {
        buttons.forEach((b, i) => {
          if (!b.pressed) return;
          if (holdsAction(i)) d.cancelAction();
          b.pressed = false; b.value = 0; letGo.delete(i);
        });
        for (const r of walkResets) r();             // the review's F1: no button keeps the finger an inert layer hides
        own.jump = false; own.crouch = false; own.boost = false;   // F6: the fly camera's lift and boost let go with it
        sync();
      }
    },
    endFrame: () => {
      for (const i of letGo) { buttons[i]!.pressed = false; buttons[i]!.value = 0; }   // read this frame; let go for the next
      letGo.clear();
      if (liftLetGo) { own.jump = false; own.crouch = false; liftLetGo = false; }
      sync();
    },
    weaponsFrame: () => {
      // PAR-5a (PAR-5's review F1, research 222 §11.4): the open menu takes the pad's inputs, and the screen's taps too --
      // walking, the stick zones (fixed, z-index 4) lie over its rows and would start a stick where `exchangeTaps` waits.
      const open = d.exchange.isOpen();
      if (root.classList.contains('is-exchange-open') !== open) root.classList.toggle('is-exchange-open', open);
      if (!weapons) return;
      const show = !d.covered() && (open || d.exchange.prompt() !== null);
      if (weapons.hidden === show) weapons.hidden = !show;
    },
    weaponsShown: () => (weapons ? !weapons.hidden : null),
    pageState: (walking, chat) => {
      root.classList.toggle('is-walking', walking);
      root.classList.toggle('is-taunts-open', chat);
    },
    showTip: (text, dismiss) => {
      const tip = q('mobile-tip'), words = q('mobile-tip-text'), close = q('mobile-tip-close');
      if (!tip || !words || !close) return;
      words.textContent = text;
      tip.hidden = false;
      root.classList.add('tip-on');
      close.onclick = () => { hideTip(); dismiss(); };
      if (tipTimer !== null) clearTimeout(tipTimer);
      tipTimer = setTimeout(hideTip, TOUCH_TIP_MS);
    },
    dispose: () => {
      if (signal.aborted) return;
      abort.abort();
      stopLayout();
      stopFullscreen();
      hideTip();
      controls.release();
      const close = q('mobile-tip-close');
      if (close) close.onclick = null;
      q('touch')?.removeAttribute('inert');
      for (const c of ROOT_CLASSES) root.classList.remove(c);
      built?.remove();
      built = null;
    },
  };
}

/** What `exchangeTaps` reads WEAPON EXCHANGE through. */
export type ExchangeTapsMenu = Pick<MatchExchange, 'menu' | 'isOpen' | 'gate'>;

/**
 * WEAPON EXCHANGE's taps on the open menu (main.ts:1214-1220; research 253 §4): a press on the canvas read on the 640x448
 * frame as the menu's (`WeaponExchange.tap`), the event kept from the canvas's other listeners when the menu took it.
 * Attached at the place in a page's listener order `main.ts` had it (after the ARMORY's taps). `touchOnly` (the menu
 * match, a release's page): a touch's or a pen's alone -- a mouse is no release input (OT.R29, OT.R38).
 */
export function exchangeTaps(canvas: HTMLElement, exchange: ExchangeTapsMenu, o: { touchOnly?: boolean; signal?: AbortSignal } = {}): void {
  canvas.addEventListener('pointerdown', (e) => {
    if (!exchange.isOpen() || (o.touchOnly && e.pointerType !== 'touch' && e.pointerType !== 'pen')) return;
    const r = canvas.getBoundingClientRect();
    const [fx, fy] = frameOfPoint(e.clientX - r.left, e.clientY - r.top, { width: r.width, height: r.height });
    if (exchange.menu.tap(fx, fy, exchange.gate())) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, { capture: true, ...(o.signal ? { signal: o.signal } : {}) });
}

/**
 * The device WEAPON EXCHANGE's prompt draws its `%c` for (main.ts:371-373): a pad's glyph when one is connected, the
 * touch label on a touch screen (`WEAPON_SELECT_TOUCH_READING`), else the page's own -- `/testroom`'s key, the menu
 * match's pad (a release has no key: OT.R29).
 */
export function promptDeviceOf(pads: number, otherwise: InputDevice): InputDevice {
  return pads > 0 ? 'pad' : wantsTouchControls() ? 'touch' : otherwise;
}

/** What the phone's tip needs: its two stores, the pads' count, and the page's way of showing it. */
export interface TipDeps {
  local: TipStore;
  session: TipStore;
  pads(): number;
  show(text: string, dismiss: () => void): void;
  /** LATER 133: where the saved touch layout and its marks live (`./mobileLayout`); the page's settings by default. */
  layout?: Pick<Settings, 'get' | 'set'>;
}

/**
 * The phone's tip (main.ts:1236-1240; owner, 2026-09-29; `./mobileTip`'s rule): a controller and landscape recommended
 * on a touch device, once a visit and again on each turn to portrait, until dismissed for good. Hands back the turn's
 * listener's removal. LATER 133: a touch layout saved before the controls strip is told once, on the same line, in the
 * tip's place at that start (the tip is not marked seen, so it comes on the next visit).
 */
export function mountTip(d: TipDeps): () => void {
  const tip = new MobileTip(d.local, d.session);
  const portrait = ((): MediaQueryList | null => { try { return globalThis.matchMedia?.('(orientation: portrait)') ?? null; } catch { return null; } })();
  const offer = (show: boolean): void => { if (show) d.show(tipText(d.pads() > 0), () => tip.dismiss()); };
  if (wantsTouchControls() && layoutNoticeDue(d.layout)) {
    layoutNoticeShown(d.layout);
    d.show(LAYOUT_NOTICE_TEXT, () => {});
  } else offer(tip.start(wantsTouchControls(), portrait?.matches ?? false));
  const turned = (e: MediaQueryListEvent): void => { offer(tip.rotate(e.matches)); };
  portrait?.addEventListener?.('change', turned);
  return () => { portrait?.removeEventListener?.('change', turned); };
}
