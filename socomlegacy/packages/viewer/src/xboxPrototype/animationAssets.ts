import { PLAY_CLIPS } from '../animator';
import { BINOCULAR_CLIPS } from '../binocularPose';
import { DOOR_CLIPS } from '../doors';
import { DEATH_CLIPS, FLINCH_CLIPS } from '../net/deaths';
import { TURRET_CLIPS } from '../net/emplacement';
import { THROW_CLIPS } from '../throwPose';
import { TRAVERSAL_CLIPS } from '../traversal';
import { WEAPON_CLIPS } from '../weaponPose';

// The same nine controller-owned packs as matchMount's MATCH_CLIPS. These are decoded
// numeric motions, not render objects. Each requested name is loaded only once; both
// teams and every remote body share the resulting PlayData. Clip availability does not
// imply every corresponding match feature has been mounted in the prototype.
const matchClips: readonly string[] = [...new Set([
  ...PLAY_CLIPS, ...WEAPON_CLIPS, ...TRAVERSAL_CLIPS, ...THROW_CLIPS,
  ...DEATH_CLIPS, ...FLINCH_CLIPS, ...DOOR_CLIPS, ...BINOCULAR_CLIPS, ...TURRET_CLIPS,
])];

/** Asset adaptation: retain the fixed comparison's workload, load match motions for walking. */
export function prototypeAnimationClips(walking: boolean): readonly string[] {
  return walking ? matchClips : PLAY_CLIPS;
}
