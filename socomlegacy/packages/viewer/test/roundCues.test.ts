import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { decodeEffectProgram, mapLocArchive, parseAnimSets, readLocArchive, type EffectCondition, type EffectOp, type EffectProgram } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import {
  cueNames, evaluateCondition, hostageCueOf, HOSTAGE_CUES_READING, RESCUE_WIN_LINES_READING, roundCues, roundCuesFromArchive, withObjectiveTexts,
} from '../src/roundCues';

/**
 * The round's cues read off the map's own `objectives` script (research 124 §5): what the sequence `start` (and `start2`
 * in a respawn room) plays by `player_team` before its elimination loop, what each elimination branch plays by the
 * winner and the local team, and what `mission_timer2` plays at TIME EXPIRED. The programs here are synthetic, shaped
 * as `decodeEffectProgram` gives MP2's (research 124 §5 lists it command by command).
 */
const team = (operand: number): EffectOp => ({ op: 'if', conditions: [{ kind: 'valve', valve: 'player_team', operation: 2, operand }] });
const elseTeam = (operand: number): EffectOp => ({ op: 'elseif', conditions: [{ kind: 'valve', valve: 'player_team', operation: 2, operand }] });
const wait = (seconds: number): EffectOp => ({ op: 'wait', seconds, range: 0, frames: null });
const sound = (name: string, flags: number): EffectOp => ({ op: 'sound', sound: name, node: 0, volume: 1, flags, newPlay: false });
const message: EffectOp = { op: 'other', cmd: 55, name: 'MESSAGE' };
const elim = (op: 'if' | 'elseif', side: '00' | '08', operand: number): EffectOp => ({
  op, conditions: [
    { kind: 'valve', valve: `aiteam_${side}`, operation: 2, operand: 0 }, { kind: 'operator', operator: 2 },
    { kind: 'valve', valve: 'player_team', operation: 2, operand },
  ],
});
const branch = (ph: string, music: string, waitBetween: number | null, next: string): EffectOp[] => [
  { op: 'stopSequence', sequence: 'mission_timer' }, { op: 'valve', valve: 'mp_winner', operation: 11, operand: 0 }, message, message,
  sound(ph, 0x80), ...(waitBetween === null ? [] : [wait(waitBetween)]), sound(music, 0x880), { op: 'callSequence', sequence: next },
  { op: 'stopSequence', sequence: 'start' },
];
const intro: EffectOp[] = [
  wait(5),
  team(0), message, message, sound('MUS_MP_SEAL_INTRO_4', 0x880),
  elseTeam(8), message, message, sound('MUS_MP_TERR_INTRO_4', 0x880),
  elseTeam(16), sound('MUS_MP_SEAL_INTRO_4', 0x880),
  { op: 'endif' },
];
function program(waitBetween: number | null, withRespawn = true): EffectProgram {
  return {
    name: 'objectives', root: 0, flags: 0, nodes: [],
    sequences: [
      {
        name: 'start', activation: 1, ops: [
          ...intro, wait(10), { op: 'while', forever: false },
          elim('if', '08', 0), ...branch('^PH_0014', 'MUS_MP_SEAL_WIN_RUS', waitBetween, 'success'),
          elim('elseif', '08', 8), ...branch('^PH_0014', 'MUS_MP_SEAL_WIN_RUS', waitBetween, 'failure'),
          // Another objective's branch (MP6's hostages): not an elimination, left out.
          { op: 'elseif', conditions: [{ kind: 'valve', valve: 'rescuecount', operation: 2, operand: 2 }, { kind: 'valve', valve: 'player_team', operation: 2, operand: 8 }] },
          sound('^PH_9999', 0x80),
          elim('elseif', '00', 8), ...branch('^PH_0002', 'MUS_MP_TERR_WIN_RUS', waitBetween, 'success'),
          elim('elseif', '00', 0), ...branch('^PH_0002', 'MUS_MP_TERR_WIN_RUS', waitBetween, 'failure'),
          { op: 'endif' }, { op: 'endWhile' },
        ],
      },
      ...(withRespawn ? [
        { name: 'start2', activation: 2, ops: [...intro, { op: 'stopSequence', sequence: 'start2' } as EffectOp] },
        {
          name: 'mission_timer2', activation: 2, ops: [
            wait(5), { op: 'while', forever: false }, { op: 'endWhile' }, message, sound('MUS_MP_SEAL_WIN_RUS', 0x880), wait(15),
            { op: 'callSequence', sequence: 'success2' }, { op: 'stopSequence', sequence: 'mission_timer2' },
          ] as EffectOp[],
        },
      ] : []),
    ],
  };
}

describe('the round\'s cues out of the objectives script (research 124 §5)', () => {
  it('the intro by player_team, from the round\'s start: 0 SEAL, 8 Terrorist, 16 the spectator', () => {
    const c = roundCues(program(null), 'MP2');
    expect(c.intro[0]).toEqual([{ wait: 5 }, { sound: 'MUS_MP_SEAL_INTRO_4', slot: true }]);
    expect(c.intro[8]).toEqual([{ wait: 5 }, { sound: 'MUS_MP_TERR_INTRO_4', slot: true }]);
    expect(c.intro[16]).toEqual([{ wait: 5 }, { sound: 'MUS_MP_SEAL_INTRO_4', slot: true }]);
    expect(c.introRespawn?.[8]).toEqual(c.intro[8]);
  });

  it('the elimination branches by winner and local team: the line and the music, with the script\'s wait between', () => {
    const now = roundCues(program(null), 'MP2'), later = roundCues(program(2), 'MP51');
    expect(now.elimination.seal[0]).toEqual([{ sound: '^PH_0014', slot: false }, { sound: 'MUS_MP_SEAL_WIN_RUS', slot: true }]);
    expect(now.elimination.seal[8]).toEqual(now.elimination.seal[0]);       // both teams hear the same result
    expect(now.elimination.terrorist[0]).toEqual([{ sound: '^PH_0002', slot: false }, { sound: 'MUS_MP_TERR_WIN_RUS', slot: true }]);
    expect(now.elimination.seal[16]).toBeUndefined();                       // the script has no spectator branch here
    expect(later.elimination.terrorist[8]).toEqual([{ sound: '^PH_0002', slot: false }, { wait: 2 }, { sound: 'MUS_MP_TERR_WIN_RUS', slot: true }]);
    // HX-5: that branch is no elimination's, and is the rescue win's (`RoundCues.decided`, played on `eliminated.reason`).
    expect(Object.values(now.elimination).flatMap((by) => Object.values(by).flat())).not.toContainEqual({ sound: '^PH_9999', slot: false });
    expect(now.decided!.rescue[8]).toEqual([{ sound: '^PH_9999', slot: false }]);
  });

  it('TIME EXPIRED in a respawn room: mission_timer2\'s music after its clock loop, whoever leads; none without it', () => {
    expect(roundCues(program(null), 'MP2').timeExpired).toEqual([{ sound: 'MUS_MP_SEAL_WIN_RUS', slot: true }]);
    const classicOnly = roundCues(program(null, false), 'MP1');
    expect(classicOnly.timeExpired).toEqual([]);
    expect(classicOnly.introRespawn).toBeNull();
  });

  it('every name the cues play, once each', () => {
    expect(cueNames(roundCues(program(2), 'MP51')).sort()).toEqual([
      'MUS_MP_SEAL_INTRO_4', 'MUS_MP_SEAL_WIN_RUS', 'MUS_MP_TERR_INTRO_4', 'MUS_MP_TERR_WIN_RUS', '^PH_0002', '^PH_0014', '^PH_9999',   // HX-5: the decided branch's
    ]);
  });
});

/**
 * The IF/ELSEIF/WHILE condition as `FUN_0025e960` (D:L108288-108425; research 179 s9.9) evaluates its tokens: operands
 * left to right, the pending operator (2 AND, 3 OR) applied as each comes, no precedence; 1 NOT a prefix; 4 `(` recurses
 * to its 5 `)`; an operand straight after an operand ends the condition there.
 */
describe("the round script's conditions (FUN_0025e960)", () => {
  it('the condition evaluator (FUN_0025e960): left to right, no precedence, NOT a prefix, parentheses recurse, two adjacent operands stop it; A AND B is all-required', () => {
    const state: Record<string, boolean> = { a: true, b: false, c: true };
    const asked: string[] = [];
    const truth = (x: EffectCondition): boolean => { if (x.kind !== 'valve') return false; asked.push(x.valve); return state[x.valve]!; };
    const v = (name: string): EffectCondition => ({ kind: 'valve', valve: name, operation: 2, operand: 1 });
    const op = (o: 1 | 2 | 3 | 4 | 5): EffectCondition => ({ kind: 'operator', operator: o });
    const AND = op(2), OR = op(3), NOT = op(1), OPEN = op(4), CLOSE = op(5);
    const ev = (...t: EffectCondition[]): boolean => evaluateCondition(t, truth);
    // A AND B: every operand required.
    expect([ev(v('a'), AND, v('c')), ev(v('a'), AND, v('b')), ev(v('b'), AND, v('a'))]).toEqual([true, false, false]);
    // No precedence: A OR B AND B is (A OR B) AND B -- false, where AND first would give true.
    expect(ev(v('a'), OR, v('b'), AND, v('b'))).toBe(false);
    expect(ev(v('b'), AND, v('b'), OR, v('a'))).toBe(true);
    // NOT a prefix of the operand (or the group) after it.
    expect([ev(NOT, v('b')), ev(v('a'), AND, NOT, v('b')), ev(NOT, v('a'), OR, v('b'))]).toEqual([true, true, false]);
    // Parentheses recurse: A AND (B OR C) is true; NOT (B OR C) false; (A AND B) OR C true.
    expect([ev(v('a'), AND, OPEN, v('b'), OR, v('c'), CLOSE), ev(NOT, OPEN, v('b'), OR, v('c'), CLOSE), ev(OPEN, v('a'), AND, v('b'), CLOSE, OR, v('c'))])
      .toEqual([true, false, true]);
    // Two adjacent operands: the condition ends at the first; the second is never asked.
    asked.length = 0;
    expect([ev(v('a'), v('b')), ev(v('b'), v('a'))]).toEqual([true, false]);
    expect(asked).toEqual(['a', 'b']);
    // A non-valve operand (a zone test of another set) is what valueOf says: here false.
    expect(ev(v('a'), AND, { kind: 'other', cmd: 22 })).toBe(false);
  });
});

/**
 * The objective lines (research 192 s3.1, 179 s9.8; plan A1-04): `start`'s MESSAGE commands up to its first WHILE, by
 * `player_team`, each with the script's wait before it (since the line before, the round's start for the first).
 */
const MP72 = fixture('RUN/MP72.ZDB'), MP2 = fixture('RUN/MP2.ZDB');
const cuesOfBytes = (bytes: Uint8Array, map: string): ReturnType<typeof roundCues> => {
  const cues = roundCuesFromArchive(parseAnimSets(Zar.parse(zdbMember(bytes, parseZdb(bytes), 'MZANIM.ZAR'))), map);
  if (!cues) throw new Error(`${map}: no objectives`);
  return cues;
};
describe(`the objective lines off the fixtures' scripts${MP72 && MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it.skipIf(!MP72 || !MP2)("the objective lines of start by player_team at the script's waits: Crossroads 7200/7201 after WAIT 3 for both sides; Frostfire's raw names after WAIT 5", () => {
    const cr = cuesOfBytes(MP72!, 'MP72');
    const crLines = [{ text: null, locId: 7200, scale: 0.9, waitBefore: 3 }, { text: null, locId: 7201, scale: 0.7, waitBefore: 0 }];
    expect(cr.objective[0]).toEqual(crLines);
    expect(cr.objective[8]).toEqual(crLines);
    expect(cr.objective[16]).toBeUndefined();                        // the spectator's branch posts nothing
    // The ids read through the map's own mp72LOC (a member of MP72.ZDB): the text filled, the id kept.
    const strings = readLocArchive(zdbMember(MP72!, parseZdb(MP72!), mapLocArchive('MP72').archive.split('/').pop()!), 'MP72');
    const byId = new Map(strings.entries.map((e) => [e.id, e.text]));
    expect(withObjectiveTexts(cr, (id) => byId.get(id)).objective[8]!.map((l) => [l.text, l.locId])).toEqual([
      ['OBJECTIVE:', 7200], ['FIND THE BOMB AND DESTROY THE ENEMY BASE WITH IT', 7201],
    ]);
    const ff = cuesOfBytes(MP2!, 'MP2');
    expect(ff.objective[0]).toEqual([
      { text: 'OBJECTIVE:', locId: null, scale: 0.9, waitBefore: 5 }, { text: 'ELIMINATE THE TERRORISTS', locId: null, scale: 0.7, waitBefore: 0 },
    ]);
    expect(ff.objective[8]).toEqual([
      { text: 'OBJECTIVE:', locId: null, scale: 0.9, waitBefore: 5 }, { text: 'ELIMINATE THE SEALS', locId: null, scale: 0.7, waitBefore: 0 },
    ]);
    // The cues the round's sound reads are the evaluator's as they were the all-required reading's (research 179 s9.9).
    expect(ff.intro[0]).toEqual([{ wait: 5 }, { sound: 'MUS_MP_SEAL_INTRO_4', slot: true }]);
    expect(ff.elimination.seal[8]).toEqual([{ sound: '^PH_0014', slot: false }, { sound: 'MUS_MP_SEAL_WIN_RUS', slot: true }]);
  });
});

/** HX-5 (research 239 s5-s6): the hostage one-shots and the decided branches off Desert Glory's own script (the MP6 fixture). */
const MP6 = fixture('RUN/MP6.ZDB');
describe(`the hostage cues off Desert Glory's script (MP6 fixture)${MP6 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it.skipIf(!MP6)("hostageCues reads MP6's Lead, Rescue, HostKill and SealKill one-shots -- ^PH_0006 'A HOSTAGE IS BEING ESCORTED', ^PH_0013 'A HOSTAGE HAS BEEN RESCUED', ^PH_0008 the two Terrorist-kill lines with WAIT 2, ^PH_0007 the two SEAL-kill lines with WAIT 2 (HOSTAGE_CUES_READING; 190 C) -- the three copies alike; and start's rescue-win branch per team: WAIT 2, 'SEALS VICTORIOUS!' 0.9, ^PH_0014, WAIT 2, the music, with no first line (RESCUE_WIN_LINES_READING)", () => {
    expect(HOSTAGE_CUES_READING).toBe('Lead1, Rescue1, HostKill1, SealKill1: the first copy of each');
    expect(RESCUE_WIN_LINES_READING).toBe('WAIT 2, SEALS VICTORIOUS!, no first line');
    const archive = parseAnimSets(Zar.parse(zdbMember(MP6!, parseZdb(MP6!), 'MZANIM.ZAR')));
    const anim = archive.sets.flatMap((set) => set.anims).find((a) => a.name === 'objectives')!;
    const program = decodeEffectProgram(anim);
    const cues = roundCues(program, 'MP6');
    const line = (text: string, waitBefore = 0) => ({ text, locId: null, scale: 0.7, waitBefore });
    expect(cues.hostages).toEqual({
      lead: { sound: '^PH_0006', lines: [line('A HOSTAGE IS BEING ESCORTED')] },
      rescued: { sound: '^PH_0013', lines: [line('A HOSTAGE HAS BEEN RESCUED')] },
      killedByTerrorists: { sound: '^PH_0008', lines: [line('THE TERRORISTS HAVE KILLED A HOSTAGE'), line('THE SEALS HAVE BEEN CREDITED WITH RESCUING THAT HOSTAGE', 2)] },
      killedBySeals: { sound: '^PH_0007', lines: [line('THE SEALS HAVE KILLED A HOSTAGE'), line('ONE MINUTE HAS BEEN DEDUCTED FROM THE MISSION TIMER', 2)] },
    });
    // The three copies of each alike (their valve writes aside).
    for (const stem of ['Lead', 'Rescue', 'HostKill', 'SealKill']) {
      const first = hostageCueOf(program, `${stem}1`);
      expect(first).not.toBeNull();
      expect(hostageCueOf(program, `${stem}2`)).toEqual(first);
      expect(hostageCueOf(program, `${stem}3`)).toEqual(first);
    }
    // The rescue win, every player_team alike: WAIT 2 first, no "ALL ... ELIMINATED".
    const win = [
      { wait: 2 }, { message: 'SEALS VICTORIOUS!', locId: null, scale: 0.9 }, { sound: '^PH_0014', slot: false }, { wait: 2 },
      { sound: 'MUS_MP_SEAL_WIN_ALG', slot: true },
    ];
    for (const t of [0, 8, 16] as const) expect(cues.decided!.rescue[t]).toEqual(win);
    // The hostage-kill win: "TERRORISTS WIN!", ^PH_0002, WAIT 2, the music.
    const lose = [{ message: 'TERRORISTS WIN!', locId: null, scale: 0.9 }, { sound: '^PH_0002', slot: false }, { wait: 2 }, { sound: 'MUS_MP_TERR_WIN_ALG', slot: true }];
    for (const t of [0, 8, 16] as const) expect(cues.decided!.hostageKills[t]).toEqual(lose);
    // The eliminations are as they were: the rescue branch is not one of them.
    expect(cues.elimination.seal[0]).toEqual([{ sound: '^PH_0014', slot: false }, { wait: 2 }, { sound: 'MUS_MP_SEAL_WIN_ALG', slot: true }]);
    // The streams the sound worker reads now take the hostages'.
    expect(cueNames(cues)).toEqual(expect.arrayContaining(['^PH_0006', '^PH_0013', '^PH_0008', '^PH_0007', '^PH_0014', '^PH_0002']));
    // A map with none (Frostfire): neither member.
    const ff = cuesOfBytes(MP2!, 'MP2');
    expect('hostages' in ff).toBe(false);
    expect('decided' in ff).toBe(false);
  });
});

/** The disc's own scripts (SOCOM_DISC): research 124 §5's table, map by map -- names and waits, read at run time. */
const DISC = process.env.SOCOM_DISC;
const RUN = DISC ? resolve(DISC, 'RUN') : '';
const HAVE = !!DISC && existsSync(resolve(RUN, 'MP2.ZDB'));
const cuesOf = (map: string): ReturnType<typeof roundCues> => {
  const bytes = new Uint8Array(readFileSync(resolve(RUN, `${map}.ZDB`)));
  const cues = roundCuesFromArchive(parseAnimSets(Zar.parse(zdbMember(bytes, parseZdb(bytes), 'MZANIM.ZAR'))), map);
  if (!cues) throw new Error(`${map}: no objectives`);
  return cues;
};

describe.skipIf(!HAVE)('the round\'s cues on the dev disc (SOCOM_DISC; research 124 §5)', () => {
  it('Frostfire (MP2): the intro at 5 s, the line and the RUS music at once, TIME EXPIRED the SEALs\' RUS', () => {
    const c = cuesOf('MP2');
    expect(c.intro[0]).toEqual([{ wait: 5 }, { sound: 'MUS_MP_SEAL_INTRO_4', slot: true }]);
    expect(c.intro[8]).toEqual([{ wait: 5 }, { sound: 'MUS_MP_TERR_INTRO_4', slot: true }]);
    expect(c.intro[16]).toEqual([{ wait: 5 }, { sound: 'MUS_MP_SEAL_INTRO_4', slot: true }]);
    for (const t of [0, 8, 16] as const) {
      expect(c.elimination.seal[t]).toEqual([{ sound: '^PH_0014', slot: false }, { sound: 'MUS_MP_SEAL_WIN_RUS', slot: true }]);
      expect(c.elimination.terrorist[t]).toEqual([{ sound: '^PH_0002', slot: false }, { sound: 'MUS_MP_TERR_WIN_RUS', slot: true }]);
    }
    expect(c.timeExpired).toEqual([{ sound: 'MUS_MP_SEAL_WIN_RUS', slot: true }]);
  });

  it('Vigilance (MP51): the line, WAIT 2, the ALB music (research 91 §2.1)', () => {
    const c = cuesOf('MP51');
    expect(c.elimination.seal[0]).toEqual([{ sound: '^PH_0014', slot: false }, { wait: 2 }, { sound: 'MUS_MP_SEAL_WIN_ALB', slot: true }]);
    expect(c.timeExpired).toEqual([{ sound: 'MUS_MP_SEAL_WIN_ALB', slot: true }]);
  });

  it('every multiplayer map has an intro for each side and both elimination results; six have TIME EXPIRED music', () => {
    const maps = readdirSync(RUN).filter((f) => /^MP\d+\.ZDB$/.test(f)).map((f) => f.slice(0, -4));
    expect(maps.length).toBe(22);
    const timed: string[] = [];
    for (const m of maps) {
      const c = cuesOf(m);
      for (const t of [0, 8, 16] as const) expect(c.intro[t]?.some((s) => 'sound' in s), `${m} intro ${t}`).toBe(true);
      for (const t of [0, 8] as const) {
        expect(c.elimination.seal[t]?.length, `${m} seal ${t}`).toBeGreaterThan(0);
        expect(c.elimination.terrorist[t]?.length, `${m} terrorist ${t}`).toBeGreaterThan(0);
      }
      if (c.timeExpired.length) timed.push(m);
    }
    expect(timed.sort()).toEqual(['MP2', 'MP5', 'MP51', 'MP64', 'MP8', 'MP81']);
  });

  it('Vigilance posts 5100.. after WAIT 5; The Mixer two SEAL lines with WAIT 2 between (research 192 s3.1)', () => {
    const vg = cuesOf('MP51');
    expect(vg.objective[0]).toEqual([{ text: null, locId: 5100, scale: 0.9, waitBefore: 5 }, { text: null, locId: 5101, scale: 0.7, waitBefore: 0 }]);
    expect(vg.objective[8]).toEqual([{ text: null, locId: 5100, scale: 0.9, waitBefore: 5 }, { text: null, locId: 5102, scale: 0.7, waitBefore: 0 }]);
    const mixer = cuesOf('MP52');
    expect(mixer.objective[0]).toEqual([
      { text: 'OBJECTIVE:', locId: null, scale: 0.9, waitBefore: 5 },
      { text: 'PROTECT THE VIPS AND ESCORT THEM TO SAFETY.', locId: null, scale: 0.7, waitBefore: 0 },
      { text: 'MOVE AT LEAST TWO VIPS TO THE EXTRACTION ZONE FOR IMMEDIATE EXTRACTION.', locId: null, scale: 0.7, waitBefore: 2 },
    ]);
    expect(mixer.objective[8]).toEqual([
      { text: 'OBJECTIVE:', locId: null, scale: 0.9, waitBefore: 5 },
      { text: 'ELIMINATE THE THREE VIPS AND PREVENT THEIR EXTRACTION.', locId: null, scale: 0.7, waitBefore: 0 },
    ]);
  });

  it('where the disc departs from MP2: no result line on the Terrorists\' win of MP61, MP62, MP73; no SEAL win music on MP52, MP53, MP82', () => {
    for (const m of ['MP61', 'MP62', 'MP73']) expect(cuesOf(m).elimination.terrorist[8]?.every((s) => !('sound' in s) || !s.sound.startsWith('^PH'))).toBe(true);
    for (const m of ['MP52', 'MP53', 'MP82']) expect(cuesOf(m).elimination.seal[0]).toEqual([{ sound: '^PH_0014', slot: false }]);
    // The extraction maps' SEAL intro waits 2 s more inside its branch (MP6, MP10, MP11, MP71).
    expect(cuesOf('MP6').intro[0]).toEqual([{ wait: 5 }, { wait: 2 }, { sound: 'MUS_MP_SEAL_INTRO_5', slot: true }]);
  });
});

