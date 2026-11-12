import type { PadLike, PadSource } from '../../gamepad';
import { GamePad } from '../../setupPad';
import { stanceBindsMissing } from '../../startupSettings';
import { readOverlayButton } from '../../overlayButtonSetting';   // the saved value alone: no overlay under console/ (MU2-10c)
import type { Adapters } from '../state';

/**
 * The console launcher's pad (slice 2, part b). A pad is read through the setup page's saved choices -- `../../setupPad`
 * `GamePad`: the chosen device (`s2u.startup.v1.pad.selection`, else the first standard pad), its bindings and its
 * stick dead zone under its own profile (`../../controllerInput`; 0.15 when none is saved, the adapter's own
 * `PAD_DEAD_ZONE`), read only once every button and stick has rested -- the reading the game's menus take. The launcher's
 * own menu reading then stays the design's (`../input` `padFrame`: a circular 0.24 dead zone, 400 then 100 ms repeat,
 * triggers above 0.6). "Connected" is the setup page's rule (`../../startup` `publishDevices`: the chosen pad has the
 * standard mapping); the header's lamp and Home's Controller item read it, and a change is said once. A browser
 * adaptation with no original (OT.R28).
 */
export type LivePad = Adapters['pad'] & {
  read(): PadLike[]; deadZone(): number; setDeadZone(v: number): void; select(key: string): void;
  /**
   * STM.R1: SEPARATE chosen on Options' row -- the chosen pad's unbound Prone takes Triangle's button
   * (`ControllerInput.cloneTriangleToProne`); SEP-SHOW: then a touchpad pad's unbound Crouch a free touchpad
   * (`ControllerInput.bindTouchpadCrouch`). Answers whether Crouch was bound so (the row's toast).
   */
  enterSeparate?(): boolean;
  /**
   * SEP-ROWS: the chosen pad's profile leaves a stance out of reach in SEPARATE (`../../startupSettings`
   * `stanceBindsMissing`); false with no pad read (its binds unknown). Read at each draw, so it follows Button mapping.
   */
  stanceBindsMissing?(): boolean;
};

export interface PadDeps {
  /** What is polled; absent, the page's `navigator`. */
  source?: PadSource;
}

export function livePad(notify: () => void, deps: PadDeps = {}): LivePad {
  const source: PadSource = deps.source ?? (globalThis.navigator as unknown as PadSource);
  let pad = new GamePad({ releaseCrouch: false });
  let connected = false;
  return {
    connected: () => connected,
    // The Gamepad API's own events say only that some pad came; the poll's standard-mapping read decides.
    setConnected() { /* the poll decides */ },
    read(): PadLike[] {
      const p = pad.poll(source);
      // A standard pad, or one of another layout taught (LATER 380: read through its layout, `pad.input.view`).
      const now = pad.input.view !== null;
      if (now !== connected) { connected = now; notify(); }
      return p ? [p] : [];
    },
    deadZone: () => pad.input.config.deadZone,
    // Saved under the chosen pad's own profile, as the setup page's slider saves it (`ControllerInput.save`).
    setDeadZone(v: number): void { pad.input.config.deadZone = Math.max(0, Math.min(0.4, v)); pad.input.save(); notify(); },
    select(key: string): void { pad = new GamePad({ wanted: key, releaseCrouch: false }); },
    enterSeparate(): boolean {
      const cloned = pad.input.cloneTriangleToProne();
      const pressure = pad.input.bindPressureCrouch();          // PS2P: a pressure pad's Crouch on Prone's Triangle (light)
      const crouch = pad.input.bindTouchpadCrouch(readOverlayButton());
      if (cloned || pressure || crouch) notify();
      return crouch;
    },
    stanceBindsMissing: () => connected && stanceBindsMissing(pad.input.config, pad.input.pressureCapable()),
  };
}
