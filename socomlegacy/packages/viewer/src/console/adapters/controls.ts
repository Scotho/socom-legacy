import type { Adapters } from '../state';

/**
 * What START needs beyond the disc (the whole-branch review's finding 5): a supported input, as the old setup page's
 * START did (`../../startup` `supportedInput`, kept by CX-9b: a standard-layout pad chosen, else a touch screen, else
 * a keyboard or a mouse -- LR-31 dropped the last two, below). The words are the old setup page's: "Connect a controller to start." when none is there (its
 * `Startup.sync`'s blocked line; that page's layout went in CX-9b, CX.R8). Home's readout says which input counts.
 *
 * OT.R29 (the owner, 2026-10-04) made the keyboard a development build's stand-in for the pad, release and demo
 * excluded, so this gate counted a key only while `import.meta.env.DEV`. Amended 2026-10-20 by Craig: the launcher is
 * excluded: a keyboard or a mouse could press the launcher's START on every build. LR-31 (below) ended that: the keys
 * and clicks still press START, but only a controller or a touch screen makes it ready. The keymap and the game stay
 * a development build's. A browser adaptation with no original (OT.R28).
 *
 * LR-31 (LR.R25, the owner, 2026-10-27): Play is gated on a connected controller (or a touch screen), as it is on the
 * disc; a key or a click seen no longer counts in a release build -- the 2026-10-20 sentence above is replaced by it.
 */
export type LiveControls = NonNullable<Adapters['controls']>;

/** The keys that alone are not the keyboard being used: the old setup page's list (`Startup`'s keydown, gone in CX-9b). */
const MODIFIERS: readonly string[] = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph', 'Fn'];

/** Whether a key pressed counts as the keyboard seen (a modifier alone does not). */
export const keyCounts = (key: string): boolean => !MODIFIERS.includes(key);

export interface ControlsDeps {
  /** A touch screen (`../../touch` `touchDevice`: a coarse pointer and no hover). */
  touch: () => boolean;
  /** A keyboard already known, besides one `note` marked (the tests force it; the live page marks with `note`). */
  keyboard?: () => boolean;
}

export function liveControls(pad: Pick<Adapters['pad'], 'connected'>, deps: ControlsDeps): LiveControls {
  const marked = { keyboard: false, pointer: false };
  // LR-31 (LR.R25, the owner, 2026-10-27: "PLAY should gate playing the match if no controller is connected in the same
  // way it does for the disc"): a key or a click seen (`note`) no longer counts as the input -- LR-30 made the keyboard the
  // launcher's menu keys on every build, so a key is navigation, not a controller. What counts is a pad, a touch screen
  // (the phone's own controls), or the keyboard a caller forces (a development build's stand-in for the pad, OT.R29).
  const which = (): 'controller' | 'touch' | 'keyboard' | null =>
    (pad.connected() ? 'controller'
      : deps.touch() ? 'touch'
        : deps.keyboard?.() ? 'keyboard'
          : null);
  return {
    ready: () => which() !== null,
    line(): string {
      const w = which();
      return w === 'controller' ? 'Controller connected'
        : w === 'touch' ? 'Touch ready'
          : w === 'keyboard' ? 'Keyboard ready'
            : 'Controller needed';
    },
    reason: () => 'Connect a controller to start.',
    note(device: 'keyboard' | 'pointer'): boolean {
      if (device === 'keyboard') {
        if (marked.keyboard) return false;
        marked.keyboard = true;
        return true;
      }
      if (marked.pointer) return false;
      marked.pointer = true;
      return true;
    },
  };
}
