import type { PadSource } from '../../gamepad';
import { PadBinding, type PadBindingOptions } from '../../padBinding';
import { PAD_SELECTION_KEY } from '../../setupPad';
import { readPreference } from '../../startupSettings';
import type { Adapters } from '../state';
import type { LivePad } from './pad';

/**
 * The console launcher's remap adapter (CX-14; CX.R13, OT.R60): the button mapping screen's binding machine,
 * `../../padBinding` `PadBinding` -- the machine lifted out of the setup page's Controller view (retired with CX-26; this
 * screen is its one driver now), over the same keys -- made when the screen is pushed and ended when it is left, one at a
 * time. A fresh machine each time
 * reads the profile as it is then (Options' Pad dead zone (this browser) may have changed it since). A browser adaptation with no
 * original (OT.R28): settings and wiring, nothing of the game's behaviour.
 */
export type RemapAdapter = NonNullable<Adapters['remap']>;

/** One machine at a time, from `make`; `opened` wires it to the page and answers its unwiring (run at `close`). */
export function remapAdapter(make: () => PadBinding, opened?: (b: PadBinding) => () => void): RemapAdapter {
  let cur: PadBinding | null = null;
  let undo: (() => void) | null = null;
  return {
    open(): PadBinding {
      if (cur) return cur;
      cur = make();
      undo = opened?.(cur) ?? null;
      return cur;
    },
    current: () => cur,
    close(): void {
      const b = cur;
      if (!b) return;
      cur = null;
      b.stop();
      undo?.(); undo = null;
      b.dispose();
    },
  };
}

/**
 * The live page's: the machine over the page's pads and clock; a lost window ends its listen and holds the pad until the
 * window is back (the setup page's view's rule); and every change it writes -- a binding, Restore defaults, the dead zone,
 * the crouch shortcut, the device, a taught layout -- has the console's own pad reading (`./pad` `livePad`, the menus' `GamePad`) read
 * the profile again, so the console's menus follow the new layout at once. That reading waits for every button to rest
 * (`GamePad`'s `waitForRest`), so the button just bound, still held, is no press of the menus'.
 */
export function liveRemap(win: Window, pad: Pick<LivePad, 'select'>, o: PadBindingOptions = {}): RemapAdapter {
  return remapAdapter(
    () => new PadBinding({ pads: (win.navigator as unknown as PadSource), now: () => win.performance.now(), ...o }),
    (b) => {
      const onBlur = (): void => { b.blur(); };
      const onFocus = (): void => { b.focus(); };
      win.addEventListener('blur', onBlur);
      win.addEventListener('focus', onFocus);
      const off = b.onChange((e) => {
        // LATER 380 (#491's review, 1): a pass's end too -- the taught layout is read at once, and a dead zone saved after it keeps it.
        if (e.kind === 'bound' || e.kind === 'restored' || e.kind === 'config' || e.kind === 'device' || e.kind === 'taught') pad.select(readPreference(PAD_SELECTION_KEY) || 'auto');
      });
      return () => { win.removeEventListener('blur', onBlur); win.removeEventListener('focus', onFocus); off(); };
    },
  );
}
