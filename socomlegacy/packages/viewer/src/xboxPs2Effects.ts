import type { VideoPicture } from '@s2u/ui';
import type { DeviceClass } from './deviceClass';
import { MAX_DECALS } from './fire';

/**
 * Experimental browser adaptation, authorized by the user's 2026-11-15 request to tone down Xbox PS2 effects
 * for full bot lobbies, then to turn bullet holes off while preserving competitive cues
 * (docs/plans/2026-11-15-xbox-ps2-effects.md). Only persistent bullet marks are omitted.
 * Footprints, lighting, impact effects, smoke, flash blindness, muzzle sprites and sound keep their existing paths.
 */
interface CombatDrawing {
  fire: { setDecalLimit(limit: number): void };
}

/**
 * XBOX-INTEGRATE (the main controller's ruling, 2026-11-20, by the parity rule): the omission above changes what is drawn
 * and has no original, so it is recorded for the owner, not applied -- held here, the bullet marks drawn on every class and
 * picture until the owner's word (the controller has put the question to him). The wiring stays, so his answer is this line.
 */
export const XBOX_PS2_MARKS_OFF_HELD = true;

/** Applied before warm-up and when the picture changes. Writes no saved preferences. */
export function applyXboxPs2Effects(drawing: CombatDrawing, device: DeviceClass, picture: VideoPicture): void {
  const reduced = !XBOX_PS2_MARKS_OFF_HELD && device === 'xbox' && picture === 'ps2';
  drawing.fire.setDecalLimit(reduced ? 0 : MAX_DECALS);
}
