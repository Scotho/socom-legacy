import { describe, expect, it } from 'vitest';
import type { EffectProgram } from '@s2u/scene';
import { BLAST_SKIP_GROUP_READING, blastSkipPath, type BlastSkipGroup, type SceneDestructible } from '../src/sceneHealth';

/**
 * B194's fallback (research 214 §2 "The plant's point", `BLAST_SKIP_GROUP_READING`; reading, pending review): the blast's
 * reach gate (`FUN_003c80e0` D:L319104-319108) skips the struck node and any node sharing the target's `+0x94` object.
 * Read so far, that object is bound on the target's own subtree (`FUN_002740e0` D:L121212-121213 -> `FUN_003158b0`
 * D:L215134-215166): 'target-subtree'. The chosen reading, 'healthy-group', widens the skip to the deepest node of the
 * destruction program that holds the target below its root -- `healthy` on every DEMOLITION base -- so a sibling solid in
 * that group (Night Stalker's `di_wood_post`) no longer refuses the target.
 */

const program: EffectProgram = { name: 'destroy_x_base', root: 1, flags: 0, nodes: [], sequences: [] };
function destructible(targetPath: string, root: string, nodes: (string | null)[]): SceneDestructible {
  return { id: 0, key: 'k', anim: 'destroy_x_base', instance: 0, targetPath, health: 2, armor: 0, shield: 21, program, root, nodes };
}
const ROOT = 'worldmodel/terrorist_base';
const HEALTHY = `${ROOT}/tent_terrorists=tent_terrorists/healthy`;
const BASEDI = `${HEALTHY}/basedi`;

describe('BLAST_SKIP_GROUP_READING: the reach gate skips the target\'s damage group', () => {
  it("names the reading 'healthy-group' of the two", () => {
    const both: readonly BlastSkipGroup[] = ['healthy-group', 'target-subtree'];
    expect(both).toContain(BLAST_SKIP_GROUP_READING);
    expect(BLAST_SKIP_GROUP_READING).toBe('healthy-group');
  });

  it('the deepest program node holding the target below the root: healthy, not the root, not basedi', () => {
    const d = destructible(BASEDI, ROOT, [null, ROOT, HEALTHY, BASEDI, `${ROOT}/tent_terrorists=tent_terrorists/whats_left`]);
    expect(blastSkipPath(d)).toBe(HEALTHY);
    expect(blastSkipPath(d, 'target-subtree')).toBe(BASEDI);
  });

  it('no program node between the target and the root: the target alone (the root never widens it)', () => {
    expect(blastSkipPath(destructible(BASEDI, ROOT, [null, ROOT, BASEDI]))).toBe(BASEDI);
    expect(blastSkipPath(destructible(ROOT, ROOT, [null, ROOT]))).toBe(ROOT);
    // A program node beside the target, not holding it, does not widen the skip.
    expect(blastSkipPath(destructible(BASEDI, ROOT, [null, ROOT, `${ROOT}/other`, BASEDI]))).toBe(BASEDI);
  });
});
