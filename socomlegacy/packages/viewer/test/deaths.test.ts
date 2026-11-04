import { describe, expect, it } from 'vitest';
import { deathClip, DEATH_CLIPS, FLINCH_CLIPS, flinchClip, HOSTAGE_BLAST_DEATH_READING, HOSTAGE_DEATH_LIST_READING, HOSTAGE_FLINCH_READING } from '../src/net/deaths';
import { PART } from '../src/net/damage';

/**
 * HX-2 (web sprint 31; research 238 §1): a hostage dies in the TEAMMATE lists. `FUN_005a0950` (D:L458898-458960) takes the
 * table at 0x44d050 (`FUN_005a44f0` loads it from `damanim.rdr`'s `TEAMMATE_HEAD_DEATH_ANIMATIONS` and
 * `TEAMMATE_BODY_DEATH_ANIMATIONS`) when the victim is not a local human and shares a `+200` bit with the local player
 * (D:L458919) -- the hostage's 0xC0020000 shares one with every side (189 #11, §5). Only the head and body rows are
 * loaded: a limb's count is 0, so the branch falls to `LAB_005a0b20` and `*DAT_0044cee4`, the BODY STAND list's first
 * (D:L458957-458959), whatever the stance.
 */
describe("a hostage's death and flinch clips (FUN_005a0950; damanim.rdr's TEAMMATE lists)", () => {
  it("a hostage's death clip is the TEAMMATE list's by stance -- death_buddy_stand01/02/03 for a head or body hit standing, crouch01, prone01; a limb hit BODY STAND's first in every stance (FUN_005a0950 D:L458919-458939, D:L458957-458959)", () => {
    expect(HOSTAGE_DEATH_LIST_READING).toBe('TEAMMATE');
    const at = (x: number) => () => x;
    for (const part of [PART.HEAD, PART.BODY]) {
      // rand() % 3 over the three standing clips, as the players' lists are drawn
      expect([0, 0.4, 0.9].map((r) => deathClip('bullet', part, 'stand', at(r), 'teammate')))
        .toEqual(['death_buddy_stand01', 'death_buddy_stand02', 'death_buddy_stand03']);
      expect(deathClip('bullet', part, 'crouch', at(0.7), 'teammate')).toBe('death_buddy_crouch01');
      expect(deathClip('bullet', part, 'prone', at(0.7), 'teammate')).toBe('death_buddy_prone01');
    }
    for (const part of [PART.RARM, PART.LARM, PART.RLEG, PART.LLEG]) {
      for (const stance of ['stand', 'crouch', 'prone'] as const) expect(deathClip('bullet', part, stance, at(0.5), 'teammate'), `${part} ${stance}`).toBe('death_stand_chest01');
    }
    // a fall none. A blast standing or crouched none: cause 4 picks no death clip (FUN_005a54d0 D:L461384-461390) and the
    // knock throws the body -- Fall, then Land (HOSTAGE_BLAST_DEATH_READING; the hostage's knock is LATER 354); prone
    // death_buddy_prone01 (the knock's dead-prone branch, D:L441003-441015). A player's blast is still none but prone.
    expect(deathClip('fall', PART.BODY, 'stand', at(0), 'teammate')).toBeNull();
    expect(HOSTAGE_BLAST_DEATH_READING).toBe("the knock's clips");
    expect([0, 0.4, 0.9].map((r) => deathClip('blast', PART.BODY, 'stand', at(r), 'teammate'))).toEqual([null, null, null]);
    expect(deathClip('blast', PART.BODY, 'crouch', at(0.7), 'teammate')).toBeNull();
    expect(deathClip('blast', PART.BODY, 'prone', at(0), 'teammate')).toBe('death_buddy_prone01');
    expect(deathClip('blast', PART.BODY, 'prone', at(0), 'teammate')).toBe('death_buddy_prone01');
    expect(deathClip('blast', PART.BODY, 'stand', at(0))).toBeNull();
    expect(deathClip('blast', PART.BODY, 'crouch', at(0))).toBeNull();
    expect(deathClip('blast', PART.BODY, 'prone', at(0))).toBe('death_prone_chest01');
    // the players' lists are untouched: the default family is theirs, byte for byte
    expect(deathClip('bullet', PART.HEAD, 'stand', at(0))).toBe('death_stand_head01');
    expect(deathClip('bullet', PART.RARM, 'crouch', at(0))).toBe('death_crouch_back01');
    expect(deathClip('bullet', PART.BODY, 'stand', at(0.99), 'player')).toBe('death_stand_groin01');
    // the page asks the pack for the five buddy clips with the players'
    for (const c of ['death_buddy_stand01', 'death_buddy_stand02', 'death_buddy_stand03', 'death_buddy_crouch01', 'death_buddy_prone01']) expect(DEATH_CLIPS).toContain(c);
    // the flinch: damanim.rdr has no TEAMMATE flinch rows, so the hostage flinches in the players' lists (189 §5)
    expect(HOSTAGE_FLINCH_READING).toBe('the players\' lists');
    expect(flinchClip(PART.RARM, 'stand', at(0))).toBe('seal_flinch_rarm');
    expect(FLINCH_CLIPS).toEqual(['seal_flinch_rarm', 'seal_crouch_rflinch', 'seal_prone_rflinch', 'seal_flinch_larm', 'seal_flinch_rleg', 'seal_flinch_lleg']);
  });
});
