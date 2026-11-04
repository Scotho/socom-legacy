import { describe, expect, it } from 'vitest';
import {
  GAME_DETAILS_EQUIPMENT_WORDS, GAME_DETAILS_TYPE_WORDS, gameDetails, type GameListEntry, type MissionRecord,
} from '../../src';

/**
 * GAME DETAILS of a listed game (`FUN_002e1f20` D:L183973-184130; research 154 §7.1): the record's GameStats brought
 * up to 'D' (`gameStatsD`), the play list at 'D'[8..] (the record's +0x1a2, the accessor `0x2e24c0` the record's
 * vtable 0x4066b0 names), checked against the mission table (`FUN_002c9040`), then the map's name (`FUN_002c8ae0`),
 * the type word or MEDLEY (`FUN_002c8b80`), ROUND COUNT 'D'[1], ROUND TIME 'D'[2], FRIENDLY FIRE / RESPAWN from
 * RulesSet bits 0 and 1, the EQlimit line 'D'[5], and the rank bits 'D'[7]. Generated values only: the mission table
 * here is a test's, not the disc's.
 */
const MISSIONS: MissionRecord[] = [
  { number: 51, name: 'Map A', type: 5, multiplayer: true },
  { number: 2, name: 'Map B', type: 5, multiplayer: true },
  { number: 72, name: 'Map C', type: 1, multiplayer: true },
  { number: 9, name: 'Single', type: 1, multiplayer: false },
];

const stats = (o: { rounds?: number; minutes?: number; slots?: number; eq?: number; ranks?: number; list?: number[]; tag?: number } = {}): string => {
  const b = new Uint8Array(256);
  b[0] = o.tag ?? 0x44; b[1] = o.rounds ?? 0; b[2] = o.minutes ?? 0; b[4] = o.slots ?? 0; b[5] = o.eq ?? 0; b[7] = o.ranks ?? 0;
  (o.list ?? []).forEach((m, i) => { b[8 + i] = m; });
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
};
const game = (o: Partial<GameListEntry> = {}): GameListEntry => ({
  status: 0, mediusWorldId: 7, playerCount: 1, minPlayers: 2, maxPlayers: 24, gameLevel: 51, playerSkillLevel: 0, rulesSet: 0, genericField1: 1,
  genericField2: 65000, genericField3: 0, securityLevel: 0, worldStatus: 1, gameHostType: 0, gameName: 'g', gameStats: stats(), endOfList: false, ...o,
});

describe('GAME DETAILS (FUN_002e1f20)', () => {
  it('the settings: ROUND COUNT D[1], ROUND TIME D[2] (minutes), RulesSet bits 0 and 1, EQlimit D[5], the rank bits D[7]', () => {
    const d = gameDetails(game({ rulesSet: 3, gameStats: stats({ rounds: 11, minutes: 6, eq: 2, ranks: 0b0101, list: [51] }) }), MISSIONS);
    expect(d).toMatchObject({ rounds: 11, roundMinutes: 6, friendlyFire: true, respawn: true, equipment: 2, equipmentWord: 'SHOTGUNS ONLY', rankRestrictions: 0b0101, playList: [51] });
    expect(gameDetails(game({ rulesSet: 1 }), MISSIONS)).toMatchObject({ friendlyFire: true, respawn: false, equipment: 0, equipmentWord: null });
    expect(gameDetails(game({ rulesSet: 2 }), MISSIONS)).toMatchObject({ friendlyFire: false, respawn: true });
  });

  it('the caption as the original builds it, line by line (S:0x3f3b38 "\\n", S:0x3f3ba0 "%d")', () => {
    const d = gameDetails(game({ rulesSet: 3, gameStats: stats({ rounds: 11, minutes: 6, eq: 3, list: [51, 2] }) }), MISSIONS);
    expect(d.mission).toEqual({ available: true, mapName: 'Map A', typeWord: 'SUPPRESSION', text: 'Map A\nSUPPRESSION\nROUND COUNT:11\nROUND TIME:6\nFRIENDLY FIRE\nRESPAWN\nSNIPERS ONLY\n' });
    // no FF / RESPAWN line when their bit is clear, no EQlimit line for 0
    expect(gameDetails(game({ gameStats: stats({ rounds: 1, minutes: 2, list: [51] }) }), MISSIONS).mission!.text).toBe('Map A\nSUPPRESSION\nROUND COUNT:1\nROUND TIME:2\n');
    // an EQlimit past 3 draws its line's ending only (D:L184087-184099)
    expect(gameDetails(game({ gameStats: stats({ eq: 4, list: [51] }) }), MISSIONS).mission!.text).toBe('Map A\nSUPPRESSION\nROUND COUNT:0\nROUND TIME:0\n\n');
  });

  it('MEDLEY when any play-list map\'s type differs from the first one\'s (D:L184035-184048)', () => {
    expect(gameDetails(game({ gameStats: stats({ list: [51, 72] }) }), MISSIONS).mission!.typeWord).toBe('MEDLEY');
    expect(gameDetails(game({ gameStats: stats({ list: [51, 2] }) }), MISSIONS).mission!.typeWord).toBe('SUPPRESSION');
  });

  it('one type: the word is the record\'s GameLevel\'s type, not the play list\'s (D:L184050), and its name (D:L184030)', () => {
    const d = gameDetails(game({ gameLevel: 72, gameStats: stats({ list: [51, 2] }) }), MISSIONS);
    expect(d.mission).toMatchObject({ mapName: 'Map C', typeWord: 'BREACH' });
    // GameLevel 0: the record takes 'D'[8] (FUN_002e1d50 D:L183890-183891)
    expect(gameDetails(game({ gameLevel: 0, gameStats: stats({ list: [72] }) }), MISSIONS).mission).toMatchObject({ mapName: 'Map C', typeWord: 'BREACH' });
    // a GameLevel the table does not hold: "unknown" (S:0x3f2e10) and UNKNOWN (S:0x3f3b88)
    expect(gameDetails(game({ gameLevel: 99, gameStats: stats({ list: [51] }) }), MISSIONS).mission).toMatchObject({ mapName: 'unknown', typeWord: 'UNKNOWN' });
    expect(GAME_DETAILS_TYPE_WORDS).toEqual({ 1: 'BREACH', 2: 'DEMOLITION', 3: 'ESCORT', 4: 'EXTRACTION', 5: 'SUPPRESSION' });
    expect(GAME_DETAILS_EQUIPMENT_WORDS).toEqual({ 1: 'PISTOLS ONLY', 2: 'SHOTGUNS ONLY', 3: 'SNIPERS ONLY' });
  });

  it('UNAVAILABLE when a play-list byte is no multiplayer mission of the table (D:L184010-184021, S:0x3f3c20)', () => {
    expect(gameDetails(game({ gameStats: stats({ rounds: 5, list: [51, 200] }) }), MISSIONS).mission).toEqual({ available: false, mapName: null, typeWord: null, text: 'UNAVAILABLE' });
    expect(gameDetails(game({ gameStats: stats({ list: [9] }) }), MISSIONS).mission!.available).toBe(false);   // a single-player number
    // an empty play list passes the check (the loop ends on its first 0)
    expect(gameDetails(game({ gameStats: stats({ list: [] }) }), MISSIONS).mission).toMatchObject({ available: true, mapName: 'Map A', typeWord: 'SUPPRESSION' });
  });

  it('the play list ends at its first 0 and holds at most 32 bytes (D:L184010-184013)', () => {
    const long = Array.from({ length: 32 }, () => 51);
    expect(gameDetails(game({ gameStats: stats({ list: long }) }), MISSIONS).playList).toHaveLength(32);
    expect(gameDetails(game({ gameStats: stats({ list: [51, 0, 72] }) }), MISSIONS).playList).toEqual([51]);
  });

  it('an older record is brought up to D first (gameStatsD): C\'s rounds and minutes stay at bytes 1 and 2', () => {
    const c = new Uint8Array(256); c[0] = 0x43; c[1] = 4; c[2] = 9; c[7] = 51;      // C: no byte 7, the play list from byte 7
    const hex = [...c].map((x) => x.toString(16).padStart(2, '0')).join('');
    expect(gameDetails(game({ gameStats: hex }), MISSIONS)).toMatchObject({ rounds: 4, roundMinutes: 9, playList: [51] });
  });

  it('without the mission table (no disc): the settings only, the mission part null', () => {
    const d = gameDetails(game({ rulesSet: 1, gameStats: stats({ rounds: 3, minutes: 4, list: [51] }) }), null);
    expect(d).toMatchObject({ rounds: 3, roundMinutes: 4, friendlyFire: true, mission: null });
  });
});
