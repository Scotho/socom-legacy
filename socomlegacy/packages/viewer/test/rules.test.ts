import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Zar } from '@s2u/archive';
import { parseMissionList } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import {
  ELIMINATION_PERSPECTIVE_READING, eliminationLines, eliminationWatchS, eliminationWinner, GAME_TYPE_BY_NAME, gameTypeOf, halfRounds,
  isMatchOver, MAX_ROUNDS, modeRules, nextFollow, roundBanner, ROUND_WATCH_S,
} from '../src/net/rules';
import { offeredRules, parseRules, PROTOCOL_VERSION, RESPAWN_RULES_ENABLED } from '../src/net/protocol';
import { readRules, resolveRules, RULES_KEY, rulesChoice } from '../src/rules';
import { readShare, writeShare } from '../src/shareUrl';

/**
 * The match's rules (web sprint 3, classic mode): respawn (SUPPRESSION with RESPAWN on, W3.R11) and classic (respawn
 * off, the create-game default "Respawn is disabled."), each rule from the decompilation or the disc's scripts.
 */

describe('the round count and the match (FUN_002a6c50, FUN_001fb420, the maps\' game_over script)', () => {
  it('is 11 rounds (the create-game default) and first to (11 + 1) >> 1 = 6', () => {
    expect(MAX_ROUNDS).toBe(11);
    expect(halfRounds(11)).toBe(6);
    expect(halfRounds(9)).toBe(5);
  });

  it('the banner: STARTING ROUND %d OF %d, and PLAYING TIEBREAKER ROUND past mp_max_rounds', () => {
    expect(roundBanner(1, 11)).toBe('STARTING ROUND 1 OF 11');
    expect(roundBanner(11, 11)).toBe('STARTING ROUND 11 OF 11');
    expect(roundBanner(12, 11)).toBe('PLAYING TIEBREAKER ROUND');
  });

  it('respawn: the one round is the match (success2), a draw included', () => {
    expect(isMatchOver('respawn', 1, 11, { seal: 0, terrorist: 0 })).toBe(true);
  });

  it('classic: first to 6; after the last round level plays a tiebreaker, else it is over', () => {
    expect(isMatchOver('classic', 5, 11, { seal: 0, terrorist: 5 })).toBe(false);
    expect(isMatchOver('classic', 6, 11, { seal: 0, terrorist: 6 })).toBe(true);
    expect(isMatchOver('classic', 10, 11, { seal: 5, terrorist: 5 })).toBe(false);
    expect(isMatchOver('classic', 11, 11, { seal: 5, terrorist: 5 })).toBe(false);   // the tiebreaker
    expect(isMatchOver('classic', 11, 11, { seal: 4, terrorist: 5 })).toBe(true);    // draws on the way: 5-4 wins
    expect(isMatchOver('classic', 12, 11, { seal: 6, terrorist: 5 })).toBe(true);
  });
});

describe('the round\'s end by elimination (the maps\' objectives script, sequence start)', () => {
  it('no living Terrorists is tested first: the SEALs win it; then no living SEALs', () => {
    expect(eliminationWinner({ seal: 2, terrorist: 0 })).toBe('seal');
    expect(eliminationWinner({ seal: 0, terrorist: 1 })).toBe('terrorist');
    expect(eliminationWinner({ seal: 0, terrorist: 0 })).toBe('seal');
    expect(eliminationWinner({ seal: 1, terrorist: 1 })).toBeNull();
  });

  it('posts the game\'s two lines (mp51LOC 5103-5106) at 0.7 and 0.9', () => {
    // TAUNT-WRAP (research 87 §14.1): each carries its script scale as `post`, the scale the window measures it by.
    expect(eliminationLines('seal')).toEqual([{ text: 'ALL TERRORISTS ELIMINATED', scale: 0.7, post: 0.7 }, { text: 'SEALS VICTORIOUS!', scale: 0.9, post: 0.9 }]);
    expect(eliminationLines('terrorist')).toEqual([{ text: 'ALL SEALS ELIMINATED', scale: 0.7, post: 0.7 }, { text: 'TERRORISTS WIN!', scale: 0.9, post: 0.9 }]);
  });

});

/**
 * The game types and their rules (research 192 s1-s2, 179 s9.8): the type is `missionlist.rdr`'s TYPE as
 * `FUN_002c9540` (D:L168844-168906) reads it, and each type's `objectives` scripts wait and end the round alike.
 */
const READERC = fixture('RUN/READERC.ZAR');
describe(`the game types (FUN_002c9540, missionlist.rdr)${READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it.skipIf(!READERC)('the game type off missionlist.rdr (FUN_002c9540): BREACH 1, DEMOLITION 2, ESCORT 3, EXTRACTION 4, SUPPRESSION 5 -- the 22 maps as research 192 s1 lists them', () => {
    const list = parseMissionList(Zar.parse(READERC!));
    const by = (type: number): number[] => [...list.values()].filter((m) => m.type === type).map((m) => m.number).sort((a, b) => a - b);
    expect(list.size).toBe(22);
    expect(by(5)).toEqual([2, 5, 8, 51, 64, 81]);
    expect(by(2)).toEqual([1, 7, 9, 12, 72, 83]);
    expect(by(1)).toEqual([61, 62, 73]);
    expect(by(3)).toEqual([52, 53, 82]);
    expect(by(4)).toEqual([6, 10, 11, 71]);
    expect(list.get('MP72')).toEqual({ name: 'CROSSROADS', number: 72, type: 2 });
    expect(list.get('MP2')).toEqual({ name: 'FROSTFIRE', number: 2, type: 5 });
    expect(gameTypeOf('mp72', list)).toBe(2);
    expect(gameTypeOf('MP99', list)).toBe(0);                      // not on the list: FUN_002c9540's "anything else"
  });
});

describe('the mode rules by game type (research 192 s2.1, 179 s9.8)', () => {
  it('mode rules by type: the elimination watched from 13 s on DEMOLITION and 15 s elsewhere; the timer from 5 s on ESCORT and BREACH; the time-out a draw on SUP/DEM/EXT, the SEALs on ESCORT, the Terrorists on BREACH', () => {
    expect(GAME_TYPE_BY_NAME).toEqual({ BREACH: 1, DEMOLITION: 2, ESCORT: 3, EXTRACTION: 4, SUPPRESSION: 5 });
    expect(modeRules(5)).toEqual({ eliminationWatchS: { seal: 15, terrorist: 15 }, timerWatchS: 15, timeoutWinner: null, plantedStopsClock: false });
    expect(modeRules(2)).toEqual({ eliminationWatchS: { seal: 13, terrorist: 13 }, timerWatchS: 15, timeoutWinner: null, plantedStopsClock: true });
    expect(modeRules(1)).toEqual({ eliminationWatchS: { seal: 15, terrorist: 15 }, timerWatchS: 5, timeoutWinner: 'terrorist', plantedStopsClock: true });
    expect(modeRules(3)).toEqual({ eliminationWatchS: { seal: 17, terrorist: 15 }, timerWatchS: 5, timeoutWinner: 'seal', plantedStopsClock: false });
    expect(modeRules(4)).toEqual({ eliminationWatchS: { seal: 17, terrorist: 15 }, timerWatchS: 15, timeoutWinner: null, plantedStopsClock: false });
    expect(modeRules(0)).toEqual(modeRules(5));                    // an unknown type plays the classic rules the rooms always ran
    // SUPPRESSION's watch is the one the rooms always ran.
    expect(modeRules(5).eliminationWatchS.seal).toBe(ROUND_WATCH_S);
    // The room's watch is the host's script's (ELIMINATION_PERSPECTIVE_READING; the host a SEAL by default): 17 on ESC/EXT.
    expect(ELIMINATION_PERSPECTIVE_READING).toBe('host');
    expect([1, 2, 3, 4, 5].map((t) => eliminationWatchS(modeRules(t as 1 | 2 | 3 | 4 | 5)))).toEqual([15, 13, 17, 17, 15]);
  });
});

describe('the dead cycle through living teammates (FUN_001f97b0, research 91 section 12)', () => {
  it('steps to the next of the candidates in id order, wrapping; none: null', () => {
    expect(nextFollow(null, [7, 3, 5])).toBe(3);
    expect(nextFollow(3, [7, 3, 5])).toBe(5);
    expect(nextFollow(7, [7, 3, 5])).toBe(3);
    // DEAD-CYCLE (LATER 79; research 314 §5.6): the followed one died -- the walk steps from its slot (FUN_00547170
    // D:L412637, D:L412663), the next after 4, not the first (was 3).
    expect(nextFollow(4, [7, 3, 5])).toBe(5);
    expect(nextFollow(8, [7, 3, 5])).toBe(3);                  // past the last: wraps to slot 0 (D:L412664-412667)
    expect(nextFollow(3, [3])).toBeNull();                     // the start never re-taken (D:L412672): nothing bound
    expect(nextFollow(3, [])).toBeNull();
  });
});

describe('the rules on the wire and on the page', () => {
  it('protocol 4 carries the rules (5: the cone eye and aim; 6: the blast event and knock codes; 8: the orphan kill and `abandoned` with the loadout request and the item id of a body; 9: the character type; 10: the environment and the round epoch; 11: the slimmed snapshot and the facing); anything else is not rules', () => {
    expect(PROTOCOL_VERSION).toBe(15);                           // PROTO-15's bump (V19.R10: the mover's rules); 14 ER-2's, 13 PLANT-AIM's, 12 SEP-POP's; this part unchanged
    expect(parseRules('classic')).toBe('classic');
    expect(parseRules('respawn')).toBe('respawn');
    for (const v of [undefined, null, '', 'CLASSIC', 'deathmatch', 3]) expect(parseRules(v), String(v)).toBeNull();
  });

  // OT.R71 (2026-10-22): respawn is a match option again -- on live match creation and in the test room -- and the
  // 2026-09-29 ruling's switch is on. What nobody asked for is the original's default, respawn off (classic): the create
  // screen's first arrival and RESTORE DEFAULTS both set respawn 0 (research 163 R163.2, its section 2 table).
  it('respawn is offered (OT.R71): what is asked is played, and nothing asked is classic, the original\'s default (R163.2)', () => {
    expect(RESPAWN_RULES_ENABLED).toBe(true);
    expect(offeredRules('respawn')).toBe('respawn');
    expect(offeredRules('classic')).toBe('classic');
    expect(offeredRules(null)).toBe('classic');
    expect(offeredRules(undefined)).toBe('classic');
    expect(rulesChoice('respawn')).toBe('respawn');
    for (const v of [null, '', 'x', 'classic']) expect(rulesChoice(v), String(v)).toBe('classic');
  });

  it('the page: the link\'s rules= first, then the stored choice, classic by default', () => {
    expect(resolveRules('?map=MP2&rules=classic', 'respawn')).toEqual({ rules: 'classic', fromUrl: true });
    expect(resolveRules('?rules=respawn', 'classic')).toEqual({ rules: 'respawn', fromUrl: true });
    expect(resolveRules('?rules=RESPAWN', null)).toEqual({ rules: 'respawn', fromUrl: true });
    expect(resolveRules('?rules=bogus', 'respawn')).toEqual({ rules: 'respawn', fromUrl: false });
    expect(resolveRules('', null)).toEqual({ rules: 'classic', fromUrl: false });
    expect(resolveRules('?%E0%A4%A&rules=respawn', null)).toEqual({ rules: 'respawn', fromUrl: true });   // a bad escape elsewhere still names rules
  });

  it('with the switch forced off (a test\'s), classic whatever is stored or linked', () => {
    for (const v of [null, 'respawn', 'classic']) expect(rulesChoice(v, false), String(v)).toBe('classic');
    expect(resolveRules('?rules=respawn', 'respawn', false)).toEqual({ rules: 'classic', fromUrl: false });
    expect(offeredRules('respawn', false)).toBe('classic');
  });

  it('the address keeps rules=: no longer a retired parameter, passed through as the page writes its link', () => {
    expect(writeShare('?mode=play&map=MP2&rules=respawn&fly', { view: 'modern' })).toBe('?mode=play&map=MP2&view=modern&rules=respawn&fly');
    expect(writeShare('?rules=classic&map=MP2', {})).toBe('?map=MP2&rules=classic');   // owned keys first, then the rest as they were
  });

  describe('a choice remembered before the ruling', () => {
    let store: Map<string, string>;
    beforeEach(() => {
      store = new Map();
      (globalThis as { localStorage?: unknown }).localStorage = {
        getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); },
      };
    });
    afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });

    it('is read back under its key, and played (OT.R71)', () => {
      expect(readRules()).toBeNull();
      store.set(RULES_KEY, 'respawn');
      expect(readRules()).toBe('respawn');
      expect(resolveRules('', readRules()).rules).toBe('respawn');
      expect(resolveRules('', readRules(), false).rules).toBe('classic');
    });
  });
});
