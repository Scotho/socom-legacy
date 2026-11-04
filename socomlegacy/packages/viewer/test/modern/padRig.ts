import type { PadLike } from '../../src/gamepad';

/**
 * LU-4b's fake standard pad and its button numbers (the standard mapping). The rig that mounted the old launcher over
 * the setup page (`launcherPadRig`) went with that layout in CX-9b (CX.R8); what stays is the pad the shell's and the
 * walker's tests drive.
 */
export const PAD = { CROSS: 0, CIRCLE: 1, SQUARE: 2, TRIANGLE: 3, L1: 4, R1: 5, L2: 6, R2: 7, OPTIONS: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;

export function fakePad(): PadLike & { buttons: { pressed: boolean; value: number }[]; axes: number[] } {
  return { index: 0, id: 'Pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) } as PadLike & { buttons: { pressed: boolean; value: number }[]; axes: number[] };
}
