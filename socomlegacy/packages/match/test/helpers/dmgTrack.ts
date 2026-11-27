import { MP_HEALTH } from '../../../viewer/src/net/damage';
import { damagePoints } from '../../../viewer/src/net/damagePoints';

/**
 * Intake item 2, option (C): one victim's six parts from full, so a test that changes a body's health by hand can say
 * the DMG points the room books for each change -- the same `damagePoints` on the same arrays, so the figures compare
 * exactly. `hit(part, raw)` takes `raw` off `part` and returns that change's points (an unbooked change -- his own, a
 * teammate's -- is still applied, so the next one starts where the room's body does).
 */
export function dmgTrack(): { hit(part: number, raw: number): number } {
  const hp = [...MP_HEALTH];
  return {
    hit(part, raw) {
      const before = [...hp];
      hp[part]! -= raw;
      return damagePoints(before, hp);
    },
  };
}
