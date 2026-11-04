// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRdr, parseZdb, Zar, zdbMember } from '@s2u/archive';
import { mapLocArchive, parseAnimSets, readLocArchive } from '@s2u/scene';
import { missionSoundBlocks, parseStreamEntries, streamFile, streamFor } from '../../sound/src/script';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import type { StreamPlay } from '../src/audio';
import type { Team } from '../src/net/protocol';
import { RoundAudio } from '../src/roundAudio';
import { readTacticalSoundGroups } from '../src/tacticalSounds';
import { cueNames, roundCuesFromArchive, withObjectiveTexts, type BombStep, type CueStep, type RoundCues } from '../src/roundCues';

/**
 * Parity pins for the round's cues, map by map (TA-SOUND; research 124 §5-§6): what each of the 22 multiplayer maps'
 * own `objectives` script plays -- the intro by `player_team` after its WAIT, the result line and the winner's music on an
 * elimination (with or without WAIT 2), and `mission_timer2`'s TIME EXPIRED cue. Two halves (TA.R3): **unit**, the pin
 * (golden/round-cues.json) checked against research 124 §5's table, written out below by hand from the note, and the
 * pin driving `RoundAudio` for every map, side and team, with no game data; **disc** (`SOCOM_DISC`'s `RUN/MP*.ZDB`), the
 * pin re-derived through `roundCuesFromArchive` and compared whole (skips without it). `S2U_UPDATE_GOLDEN=1` rewrites it.
 */

const GOLDEN = (name: string): string => fileURLToPath(new URL(`./golden/${name}`, import.meta.url));
const pin = <T>(name: string): T & { _source: string } => JSON.parse(readFileSync(GOLDEN(name), 'utf8')) as T & { _source: string };
/** A pin's JSON, one row a line: objects opened to two levels, arrays of rows one row a line, a row on one line. */
function formatPin(o: Record<string, unknown>): string {
  const pad = (n: number): string => '  '.repeat(n);
  const fmt = (v: unknown, depth: number): string => {
    if (Array.isArray(v) && v.length > 0 && depth < 3 && !v.every((x) => typeof x === 'number')) {
      return `[\n${v.map((x) => `${pad(depth + 1)}${JSON.stringify(x)}`).join(',\n')}\n${pad(depth)}]`;
    }
    if (v && typeof v === 'object' && !Array.isArray(v) && depth < 2) {
      return `{\n${Object.entries(v).map(([k, x]) => `${pad(depth + 1)}${JSON.stringify(k)}: ${fmt(x, depth + 1)}`).join(',\n')}\n${pad(depth)}}`;
    }
    return JSON.stringify(v);
  };
  return `${fmt(o, 0)}\n`;
}
function matchPin(name: string, source: string, derived: Record<string, unknown>): void {
  if (process.env.S2U_UPDATE_GOLDEN === '1') writeFileSync(GOLDEN(name), formatPin({ _source: source, ...derived }));
  const { _source, ...pinned } = pin<Record<string, unknown>>(name);
  expect(_source).toBe(source);
  expect(JSON.parse(JSON.stringify(pinned))).toEqual(JSON.parse(JSON.stringify(derived)));
}

const maps = (): Record<string, RoundCues> => pin<{ maps: Record<string, RoundCues> }>('round-cues.json').maps;

/**
 * Research 124 §5's table, as the note writes it: the intro's WAIT (and the SEALs' extra 2 s on the hostage and VIP maps),
 * the three intros (SEAL, Terrorist, spectator), the win music's country, whether WAIT 2 sits between the line and the
 * music, the line-less Terrorist win of the breach maps, the music-less SEAL win of the VIP maps, TIME EXPIRED.
 */
interface Row { wait: number; sealExtra: number; intro: [string, string, string]; country: string; waitBetween: boolean; terrLine: boolean; sealMusic: boolean; timeExpired: boolean }
const BOMB = (country: string): Row => ({ wait: 3, sealExtra: 0, intro: ['SEAL_INTRO_2', 'TERR_INTRO_2', 'TERR_INTRO_2'], country, waitBetween: true, terrLine: true, sealMusic: true, timeExpired: false });
const RESPAWN = (country: string, waitBetween: boolean): Row => ({ wait: 5, sealExtra: 0, intro: ['SEAL_INTRO_4', 'TERR_INTRO_4', 'SEAL_INTRO_4'], country, waitBetween, terrLine: true, sealMusic: true, timeExpired: true });
const HOSTAGES = (country: string): Row => ({ wait: 5, sealExtra: 2, intro: ['SEAL_INTRO_5', 'TERR_INTRO_5', 'SEAL_INTRO_4'], country, waitBetween: true, terrLine: true, sealMusic: true, timeExpired: false });
const VIP = (country: string): Row => ({ wait: 5, sealExtra: 2, intro: ['SEAL_INTRO_3', 'TERR_INTRO_3', 'SEAL_INTRO_3'], country, waitBetween: false, terrLine: true, sealMusic: false, timeExpired: false });
const BREACH = (country: string): Row => ({ wait: 5, sealExtra: 0, intro: ['SEAL_INTRO_1', 'TERR_INTRO_1', 'TERR_INTRO_1'], country, waitBetween: false, terrLine: false, sealMusic: true, timeExpired: false });
const NOTE_124: Record<string, Row> = {
  MP1: BOMB('RUS'), MP2: RESPAWN('RUS', false), MP5: RESPAWN('BRA', false), MP6: HOSTAGES('ALG'), MP7: BOMB('ALG'), MP8: RESPAWN('ALG', true),
  MP9: BOMB('BRA'), MP10: HOSTAGES('BRA'), MP11: HOSTAGES('BRA'), MP12: BOMB('BRA'), MP51: RESPAWN('ALB', true), MP52: VIP('ALB'),
  MP53: VIP('ALB'), MP61: BREACH('BRA'), MP62: BREACH('BRA'), MP64: RESPAWN('BRA', false), MP71: HOSTAGES('ALG'), MP72: BOMB('ALG'),
  MP73: BREACH('ALG'), MP81: RESPAWN('RUS', true), MP82: VIP('RUS'), MP83: BOMB('RUS'),
};
const TEAMS = [0, 8, 16] as const;
const mus = (n: string): CueStep => ({ sound: `MUS_MP_${n}`, slot: true });
const line = (n: string): CueStep => ({ sound: n, slot: false });

/** What research 124 §5 says the side's elimination plays. */
function noteElimination(r: Row, winner: 'seal' | 'terrorist'): CueStep[] {
  const between: CueStep[] = r.waitBetween ? [{ wait: 2 }] : [];
  if (winner === 'seal') return r.sealMusic ? [line('^PH_0014'), ...between, mus(`SEAL_WIN_${r.country}`)] : [line('^PH_0014')];
  return r.terrLine ? [line('^PH_0002'), ...between, mus(`TERR_WIN_${r.country}`)] : [mus(`TERR_WIN_${r.country}`)];
}

describe('the round\'s cues of the 22 maps, pinned (golden/round-cues.json; research 124 §5)', () => {
  it('holds the 22 multiplayer maps, each with an intro for every player_team and both sides\' elimination for every team', () => {
    const m = maps();
    expect(Object.keys(m).sort()).toEqual(Object.keys(NOTE_124).sort());
    for (const [map, c] of Object.entries(m)) {
      expect(c.map).toBe(map);
      for (const t of TEAMS) {
        expect(c.intro[t]?.some((s) => 'sound' in s), `${map} intro ${t}`).toBe(true);
        expect(c.elimination.seal[t]?.length, `${map} seal ${t}`).toBeGreaterThan(0);
        expect(c.elimination.terrorist[t]?.length, `${map} terrorist ${t}`).toBeGreaterThan(0);
      }
    }
  });

  it('the intros as the note lists them: WAIT 3 on the bomb maps, 5 elsewhere, the SEALs 2 s more on the hostage and VIP maps', () => {
    for (const [map, r] of Object.entries(NOTE_124)) {
      const c = maps()[map]!;
      TEAMS.forEach((t, i) => {
        const steps = c.intro[t]!;
        const wait = steps.reduce((n, s) => n + ('wait' in s ? s.wait : 0), 0);
        expect(steps.filter((s) => 'sound' in s), `${map} ${t}`).toEqual([mus(r.intro[i]!)]);
        expect(wait, `${map} ${t}`).toBe(r.wait + (t === 0 ? r.sealExtra : 0));
        expect('wait' in steps[0]! && steps[0].wait, `${map} ${t} first`).toBe(r.wait);
      });
    }
  });

  it('the elimination as the note lists it, the same for the three teams: the line, WAIT 2 on 13 maps, the winner\'s music', () => {
    let waits = 0;
    for (const [map, r] of Object.entries(NOTE_124)) {
      const c = maps()[map]!;
      for (const t of TEAMS) {
        expect(c.elimination.seal[t], `${map} seal ${t}`).toEqual(noteElimination(r, 'seal'));
        expect(c.elimination.terrorist[t], `${map} terrorist ${t}`).toEqual(noteElimination(r, 'terrorist'));
      }
      if (r.waitBetween) waits++;
    }
    expect(waits).toBe(13);
  });

  it('TIME EXPIRED on the six respawn maps: the SEALs\' win music whoever leads; none elsewhere; start2 only where respawn runs', () => {
    for (const [map, r] of Object.entries(NOTE_124)) {
      const c = maps()[map]!;
      expect(c.timeExpired, map).toEqual(r.timeExpired ? [mus(`SEAL_WIN_${r.country}`)] : []);
      expect(c.introRespawn !== null, map).toBe(r.timeExpired);
    }
  });

  it('every map\'s cues are the 20 names the stream table resolves (sound golden/round-streams.json)', () => {
    const streams = JSON.parse(readFileSync(fileURLToPath(new URL('../../sound/test/golden/round-streams.json', import.meta.url)), 'utf8')) as { cues: { name: string }[] };
    const known = new Set(streams.cues.map((c) => c.name));
    const used = new Set(Object.values(maps()).flatMap((c) => cueNames({ ...c, bomb: undefined, hostages: undefined, decided: undefined, escort: undefined })));   // the bomb's (XR-06), the hostages' (HX-5), the escort lines' (LATER 131): below
    for (const n of used) expect(known.has(n), n).toBe(true);
    expect(used.size).toBe(20);
  });
});

/** RoundAudio's plays, with the time each was asked for. */
function recorder(): { out: { music(n: string): StreamPlay; voice(n: string): StreamPlay; stopMusic(): void }; calls: string[]; now: { t: number } } {
  const now = { t: 0 }, calls: string[] = [];
  return {
    now, calls,
    out: {
      music: (n) => { calls.push(`${now.t} music ${n}`); return 'played'; },
      voice: (n) => { calls.push(`${now.t} voice ${n}`); return 'played'; },
      stopMusic: () => undefined,
    },
  };
}
const run = (a: RoundAudio, now: { t: number }, from: number, to: number): void => { for (let t = from; t <= to + 1e-9; t += 0.25) { now.t = t; a.frame(t); } };
/** The plays a cue's steps should give from `at`: each sound at the sum of the waits before it. */
function expected(steps: readonly CueStep[], at: number): string[] {
  let t = at;
  return steps.flatMap((s) => ('wait' in s ? ((t += s.wait), []) : [`${t} ${s.slot ? 'music' : 'voice'} ${s.sound}`]));
}

describe('RoundAudio driven by the pinned cues, every map (research 124 §6)', () => {
  const sides: (Team | null)[] = ['seal', 'terrorist', null];
  const code = (t: Team | null): 0 | 8 | 16 => (t === 'seal' ? 0 : t === 'terrorist' ? 8 : 16);

  it('the intro at its WAIT from roundStart for the local team, then each side\'s elimination as the map\'s branch plays it', () => {
    for (const [map, c] of Object.entries(maps())) {
      for (const team of sides) {
        for (const winner of ['seal', 'terrorist'] as const) {
          const { out, calls, now } = recorder(), a = new RoundAudio(out);
          a.setCues(c);
          a.roundStart(team, false, 0);
          run(a, now, 0, 12);
          expect(calls, `${map} ${team} intro`).toEqual(expected(c.intro[code(team)]!, 0));
          calls.length = 0;
          now.t = 20;
          a.eliminated(winner, team, 20);
          run(a, now, 20, 30);
          a.eliminated(winner === 'seal' ? 'terrorist' : 'seal', team, 31);     // once a round: the second is ignored
          a.roundOver(32);
          run(a, now, 31, 40);
          expect(calls, `${map} ${team} ${winner}`).toEqual(expected(c.elimination[winner][code(team)]!, 20));
        }
      }
    }
  });

  it('TIME EXPIRED: mission_timer2\'s cue on the six respawn maps, in a respawn room the intro from start2; nothing on the others', () => {
    for (const [map, c] of Object.entries(maps())) {
      const { out, calls, now } = recorder(), a = new RoundAudio(out);
      a.setCues(c);
      a.roundStart('terrorist', true, 0);
      run(a, now, 0, 12);
      expect(calls, `${map} intro`).toEqual(expected((c.introRespawn ?? c.intro)[8]!, 0));
      calls.length = 0;
      now.t = 300;
      a.timeExpired(300);
      run(a, now, 300, 310);
      expect(calls, map).toEqual(expected(c.timeExpired, 300));
    }
  });

  it('a draw or a points result plays nothing (classic\'s abort, the respawn room\'s success2)', () => {
    for (const c of Object.values(maps())) {
      const { out, calls, now } = recorder(), a = new RoundAudio(out);
      a.setCues(c);
      a.roundStart('seal', false, 0);
      run(a, now, 0, 12);
      calls.length = 0;
      a.roundOver(100);
      a.eliminated('seal', 'seal', 101);
      run(a, now, 100, 110);
      expect(calls, c.map).toEqual([]);
    }
  });
});

/**
 * XR-06 (research 214 s3, 213 s2.4, 171 s7): the bomb's cues off Crossroads' own `objectives` (the MP72 fixture) -- the five
 * sequences the bomb's states start, by the bomb's side (`bomb_owner` 1 the SEALs, 2 the Terrorists) and `player_team` --
 * their lines read through mp72LOC (a member of MP72.ZDB) and their streams through SOUNDRDR's table.
 */
const MP72 = fixture('RUN/MP72.ZDB'), SOUNDRDR = fixture('RUN/SOUNDRDR.ZAR');
describe(`the bomb's cues off Crossroads' script (MP72 fixture)${MP72 && SOUNDRDR ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it.skipIf(!MP72 || !SOUNDRDR)("Crossroads' bomb cues: bomb_pickup and bomb_drop post their mp72LOC lines and MUS_BOMB_PU, switch_timer MUS_BOMB_PLANTED, defuse and bomb_timer their announcer lines, each by player_team as the script branches (171 s7)", () => {
    const zdb = parseZdb(MP72!);
    const raw = roundCuesFromArchive(parseAnimSets(Zar.parse(zdbMember(MP72!, zdb, 'MZANIM.ZAR'))), 'MP72')!;
    // The pin (golden/round-cues.json) holds the same, its texts unread.
    expect(JSON.parse(JSON.stringify(maps()['MP72']!.bomb))).toEqual(JSON.parse(JSON.stringify(raw.bomb)));
    const strings = readLocArchive(zdbMember(MP72!, zdb, mapLocArchive('MP72').archive.split('/').pop()!), 'MP72');
    const byId = new Map(strings.entries.map((e) => [e.id, e.text]));
    const b = withObjectiveTexts(raw, (id) => byId.get(id)).bomb!;
    const say = (id: number, scale: number): BombStep => ({ message: byId.get(id)!, locId: id, scale });
    const mus = (n: string): BombStep => ({ sound: n, slot: true });
    const line = (n: string): BombStep => ({ sound: n, slot: false });
    const wait = (s: number): BombStep => ({ wait: s });
    expect(byId.get(7212)).toBe('THE BOMB HAS BEEN PICKED UP');
    for (const side of ['seal', 'terrorist'] as const) {
      for (const t of [0, 8, 16] as const) {
        // bomb_pickup @4344 (mp_bomb == 2), bomb_drop @4204 (== 1), switch_timer @3844 (== 3): every player_team the same.
        expect(b.pickup[side][t], `pickup ${side} ${t}`).toEqual([mus('MUS_BOMB_PU'), say(7207, 0.9), say(7212, 0.7)]);
        expect(b.drop[side][t], `drop ${side} ${t}`).toEqual([say(7207, 0.9), say(7211, 0.7)]);
        expect(b.planted[side][t], `planted ${side} ${t}`).toEqual([
          say(7207, 0.9), line('^PH_0005'), say(side === 'seal' ? 7208 : 7209, 0.7), say(7210, 0.7), wait(2), mus('MUS_BOMB_PLANTED'),
        ]);
      }
    }
    // defuse @1960 (mp_bomb == 4): bomb_owner the defuser's side; the line and the win music the same for each player_team.
    const defused = (win: number, ph: string, music: string): BombStep[] => [line('^PH_0003'), wait(3), say(7206, 0.7), say(win, 0.9), line(ph), mus(music)];
    for (const t of [0, 8, 16] as const) {
      expect(b.defused.seal[t], `defused seal ${t}`).toEqual(defused(7203, '^PH_0014', 'MUS_MP_SEAL_WIN_ALG'));
      expect(b.defused.terrorist[t], `defused terrorist ${t}`).toEqual(defused(7205, '^PH_0002', 'MUS_MP_TERR_WIN_ALG'));
    }
    // bomb_timer @4596 (mp_bomb == 5): bomb_owner the planter's side; ^PH_0004 once after 7213 in the SEAL bomb's SEAL-viewer
    // branch (4632), before and after it in the other five (213 s2.4).
    const blast = (win: number, ph: string, music: string, twice: boolean): BombStep[] => [
      wait(2), ...(twice ? [line('^PH_0004'), say(7213, 0.7), line('^PH_0004')] : [say(7213, 0.7), line('^PH_0004')]),
      wait(2), say(win, 0.9), line(ph), mus(music),
    ];
    expect(b.detonated.seal[0]).toEqual(blast(7203, '^PH_0014', 'MUS_MP_SEAL_WIN_ALG', false));
    expect(b.detonated.seal[8]).toEqual(blast(7203, '^PH_0014', 'MUS_MP_SEAL_WIN_ALG', true));
    expect(b.detonated.seal[16]).toEqual(blast(7203, '^PH_0014', 'MUS_MP_SEAL_WIN_ALG', true));
    for (const t of [0, 8, 16] as const) expect(b.detonated.terrorist[t]).toEqual(blast(7205, '^PH_0002', 'MUS_MP_TERR_WIN_ALG', true));
    // The names the sound worker reads now take the bomb's, each a stream of the blocks Crossroads loads.
    const names = cueNames(raw);
    for (const n of ['MUS_BOMB_PU', 'MUS_BOMB_PLANTED', '^PH_0003', '^PH_0004', '^PH_0005']) expect(names, n).toContain(n);
    const zar = Zar.parse(SOUNDRDR!);
    const key = zar.root.children.find((k) => k.name.toLowerCase() === 'sounds.rdr')!;
    const entries = parseStreamEntries(parseRdr(zar.data(key)));
    const file = (n: string): string | null => { const e = streamFor(entries, missionSoundBlocks('MP72'), n); return e && streamFile(e); };
    expect(['MUS_BOMB_PU', 'MUS_BOMB_PLANTED', '^PH_0003', '^PH_0004', '^PH_0005'].map(file))
      .toEqual(['MUMP0011.VPK', 'MUMP0012.VPK', 'PH_0003.VAG', 'PH_0004.VAG', 'PH_0005.VAG']);
    // RoundAudio plays them as the script runs: the plant's line at once, its music after WAIT 2, the lines posted as they come;
    // the detonation decides the round (its cues once, an elimination after it nothing).
    const { out, calls, now } = recorder(), a = new RoundAudio(out), posted: string[] = [];
    const post = (text: string, scale: number): void => { posted.push(`${now.t} ${text} ${scale}`); };
    a.setCues(withObjectiveTexts(raw, (id) => byId.get(id)));
    a.roundStart('terrorist', false, 0);
    calls.length = 0;
    now.t = 100;
    a.bomb('planted', 'seal', 'terrorist', 100, post);
    run(a, now, 100, 104);
    expect(calls).toEqual(['100 voice ^PH_0005', '102 music MUS_BOMB_PLANTED']);
    expect(posted).toEqual(['100 TACTICAL: 0.9', '100 THE SEALS HAVE PLANTED THE BOMB 0.7', '100 THE BOMB WILL DETONATE IN 30 SECONDS UNLESS DEFUSED 0.7']);
    calls.length = 0; posted.length = 0;
    now.t = 130;
    a.bomb('detonated', 'seal', 'terrorist', 130, post);
    a.eliminated('terrorist', 'terrorist', 131);
    a.bomb('detonated', 'seal', 'terrorist', 131, post);
    run(a, now, 130, 140);
    expect(calls).toEqual(['132 voice ^PH_0004', '132 voice ^PH_0004', '134 voice ^PH_0014', '134 music MUS_MP_SEAL_WIN_ALG']);
    expect(posted).toEqual(['132 DEMOLITION SUCCESSFUL 0.7', '134 SEALS VICTORIOUS! 0.9']);
    // LATER 145: a pickup in a round already decided plays its cue -- `bomb_pickup` is never stopped (the nine bomb maps).
    calls.length = 0; posted.length = 0;
    now.t = 141;
    a.bomb('pickup', 'seal', 'terrorist', 141, post);
    run(a, now, 141, 145);
    expect(calls).toEqual(['141 music MUS_BOMB_PU']);
    expect(posted).toEqual(['141 TACTICAL: 0.9', '141 THE BOMB HAS BEEN PICKED UP 0.7']);
  });
});

/**
 * HX-5 (research 239 s5): the hostage maps' one-shots and decided branches, pinned (round-cues.json's MP6, MP10, MP11,
 * MP71 `hostages` / `decided`), and their streams each a stream of the blocks Desert Glory loads.
 */
describe(`the hostage cues' streams (the pin; SOUNDRDR fixture)${SOUNDRDR ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it.skipIf(!SOUNDRDR)("the extraction maps' pinned hostage cues and rescue-win branch play ^PH_0006, ^PH_0013, ^PH_0008, ^PH_0007, ^PH_0014, ^PH_0002 and the win music, each a stream of MP6's blocks; no other map has them", () => {
    const withHostages = Object.entries(maps()).filter(([, c]) => c.hostages).map(([m]) => m).sort();
    expect(withHostages).toEqual(['MP10', 'MP11', 'MP52', 'MP53', 'MP6', 'MP71', 'MP82']);   // LATER 125: the escort maps' kill one-shots
    expect(Object.entries(maps()).filter(([, c]) => c.decided).map(([m]) => m).sort()).toEqual(['MP10', 'MP11', 'MP52', 'MP53', 'MP6', 'MP61', 'MP62', 'MP71', 'MP73', 'MP82']);   // LATER 125; LATER 130 the breach maps
    const names = cueNames({ ...maps()['MP6']!, bomb: undefined });
    const zar = Zar.parse(SOUNDRDR!);
    const key = zar.root.children.find((k) => k.name.toLowerCase() === 'sounds.rdr')!;
    const entries = parseStreamEntries(parseRdr(zar.data(key)));
    const file = (n: string): string | null => { const e = streamFor(entries, missionSoundBlocks('MP6'), n); return e && streamFile(e); };
    for (const n of ['^PH_0006', '^PH_0013', '^PH_0008', '^PH_0007', '^PH_0014', '^PH_0002', 'MUS_MP_SEAL_WIN_ALG', 'MUS_MP_TERR_WIN_ALG']) {
      expect(names, n).toContain(n);
      expect(file(n), n).not.toBeNull();
    }
  });
});

const DISC = process.env.SOCOM_DISC;
const RUN = DISC ? resolve(DISC, 'RUN') : '';
const HAVE = !!DISC && existsSync(resolve(RUN, 'MP2.ZDB'));

describe.skipIf(!HAVE)('the round\'s cues re-derived from the 22 maps\' MZANIM.ZAR (SOCOM_DISC)', () => {
  it('roundCuesFromArchive over every RUN/MP*.ZDB gives the pinned cues (round-cues.json)', () => {
    const names = readdirSync(RUN).filter((f) => /^MP\d+\.ZDB$/.test(f)).map((f) => f.slice(0, -4)).sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
    const derived: Record<string, RoundCues> = {};
    for (const map of names) {
      const bytes = new Uint8Array(readFileSync(resolve(RUN, `${map}.ZDB`)));
      const c = roundCuesFromArchive(parseAnimSets(Zar.parse(zdbMember(bytes, parseZdb(bytes), 'MZANIM.ZAR'))), map);
      if (!c) throw new Error(`${map}: no objectives`);
      derived[map] = c;
    }
    matchPin('round-cues.json', 'disc RUN/MP*.ZDB (22) MZANIM.ZAR, the animation objectives, through parseAnimSets and roundCuesFromArchive (decodeEffectProgram); 2026-10-02', { maps: derived });
  }, 120_000);
});

/**
 * LATER 125 (research 175 §4; the escort scripts re-read off the disc's MP52, MP53, MP82 2026-10-18): ESCORT's own
 * end-of-round lines, from the pin. `escort_success` runs on every SEAL win -- "THE TERRORISTS FAILED TO ELIMINATE THE
 * VIPS.", "SEALS VICTORIOUS!", WAIT 2, the SEAL win music; an extraction is EndRescue's "A VIP HAS BEEN EXTRACTED" first;
 * three VIP kills are `start`'s `killcount >= 3` branch; a SEAL elimination is `start`'s "ALL TERRORISTS ELIMINATED"
 * then `escort_success`'s. Every other map has no `decided.elimination`, so the page posts the elimination's lines.
 */
describe("LATER 125: the escort maps' end-of-round lines (the pin)", () => {
  const ESCORT = ['MP52', 'MP53', 'MP82'] as const;
  const music = (map: string): string => `MUS_MP_SEAL_WIN_${map === 'MP82' ? 'RUS' : 'ALB'}`;
  const sides: (Team | null)[] = ['seal', 'terrorist', null];
  const drive = (map: string, reason: 'rescue' | 'hostageKills' | 'elimination' | 'timeout', team: Team | null) => {
    const { out, calls, now } = recorder(), a = new RoundAudio(out), posted: string[] = [];
    a.setCues(maps()[map]!, 0);
    a.roundStart(team, false, 0);
    run(a, now, 0, 30);
    calls.length = 0;
    now.t = 100;
    const took = a.decidedBy(reason, team, 100, (text) => { posted.push(text); });
    run(a, now, 100, 112);
    return { took, calls, posted };
  };

  it('an extraction\'s decision posts hostages_rescued\'s and escort_success\'s lines -- never elimination\'s -- and plays the SEAL win music, on every escort map and console (LATER 131: EndRescue\'s own lines are the room\'s `escort` event\'s)', () => {
    for (const map of ESCORT) for (const team of sides) {
      const { took, calls, posted } = drive(map, 'rescue', team);
      expect(took, `${map} ${team}`).toBe(true);
      expect(posted, `${map} ${team}`).toEqual(['THE TERRORISTS FAILED TO ELIMINATE THE VIPS.', 'SEALS VICTORIOUS!']);
      expect(calls.some((c) => c.endsWith(`music ${music(map)}`)), `${map} ${team}`).toBe(true);
      expect(calls.some((c) => c.endsWith('voice ^*PT_0055')), `${map} ${team}`).toBe(true);
      expect(calls.some((c) => c.endsWith('voice ^*PT_0051') || c.includes('MUS_MP_VIP_RESC_')), `${map} ${team}`).toBe(false);
    }
  });

  it('three VIP kills post "THE VIPS HAVE BEEN ELIMINATED." then "TERRORISTS WIN!"', () => {
    for (const map of ESCORT) for (const team of sides) {
      const { took, posted } = drive(map, 'hostageKills', team);
      expect(took, `${map} ${team}`).toBe(true);
      expect(posted, `${map} ${team}`).toEqual(['THE VIPS HAVE BEEN ELIMINATED.', 'TERRORISTS WIN!']);
    }
  });

  it('a SEAL elimination posts "ALL TERRORISTS ELIMINATED", then the escort\'s two lines, ^PH_0014 and 2 s later the SEAL win music', () => {
    for (const map of ESCORT) for (const team of sides) {
      const { took, calls, posted } = drive(map, 'elimination', team);
      expect(took, `${map} ${team}`).toBe(true);
      expect(posted, `${map} ${team}`).toEqual(['ALL TERRORISTS ELIMINATED', 'THE TERRORISTS FAILED TO ELIMINATE THE VIPS.', 'SEALS VICTORIOUS!']);
      expect(calls, `${map} ${team}`).toEqual(['100 voice ^PH_0014', `102 music ${music(map)}`]);
    }
  });

  it('the guard (e3\'s): no other map has decided.elimination -- an EXTRACTION map (MP6) and a BREACH map (MP61) post elimination\'s lines as before', () => {
    expect(Object.entries(maps()).filter(([, c]) => c.decided?.elimination).map(([m]) => m).sort()).toEqual(['MP52', 'MP53', 'MP82']);
    for (const map of ['MP6', 'MP61']) for (const team of sides) expect(drive(map, 'elimination', team).took, `${map} ${team}`).toBe(false);
  });

  it('the escort maps\' kill one-shots: each copy\'s own music, by the killer side\'s count this round (review F1); no lead or rescued cue (escort\'s Rescue is its staging line)', () => {
    for (const map of ESCORT) {
      const h = maps()[map]!.hostages!;
      expect(h.lead, map).toBeUndefined();
      expect(h.rescued, map).toBeUndefined();
      expect(h.killedByTerrorists?.lines.map((l) => l.text), map).toEqual(['THE TERRORISTS HAVE KILLED A VIP']);
      expect(h.killedBySeals?.lines.map((l) => l.text), map).toEqual(['THE SEALS HAVE KILLED A VIP']);
      const { out, calls, now } = recorder(), a = new RoundAudio(out), posted: string[] = [];
      a.setCues(maps()[map]!, 0);
      a.roundStart('seal', false, 0);
      run(a, now, 0, 30);
      calls.length = 0;
      const kill = (kind: 'killedBySeals' | 'killedByTerrorists', t: number): void => { now.t = t; a.hostage(kind, t, (x) => { posted.push(x); }); run(a, now, t, t + 3); };
      kill('killedBySeals', 50);
      kill('killedByTerrorists', 60);           // the other side's count: its own copy 1
      kill('killedBySeals', 70);
      kill('killedByTerrorists', 80);
      expect(calls.filter((c) => c.includes('MUS_MP_VIP_KILL')), map).toEqual([
        '50 music MUS_MP_VIP_KILL_1', '60 music MUS_MP_VIP_KILL_1', '70 music MUS_MP_VIP_KILL_2', '80 music MUS_MP_VIP_KILL_2',
      ]);
      expect(calls.filter((c) => c.endsWith('voice ^PH_0042')), map).toEqual(['60 voice ^PH_0042', '80 voice ^PH_0042']);   // HostKill's alone
      expect(posted, map).toEqual(['THE SEALS HAVE KILLED A VIP', 'THE TERRORISTS HAVE KILLED A VIP', 'THE SEALS HAVE KILLED A VIP', 'THE TERRORISTS HAVE KILLED A VIP']);
      kill('killedBySeals', 90);
      expect(calls.at(-1), map).toBe('90 music MUS_MP_VIP_KILL_3');
      // A new round counts from 1 again.
      a.roundStart('seal', false, 100);
      run(a, now, 100, 130);
      calls.length = 0;
      kill('killedBySeals', 140);
      expect(calls.filter((c) => c.includes('MUS_MP_VIP_KILL')), map).toEqual(['140 music MUS_MP_VIP_KILL_1']);
    }
  });

  /**
   * LATER 127 (research 175 §4a): the time-out's SEAL win -- `mission_timer` sets `mp_winner = 0` (MP52 @7036, MP53 @7116,
   * MP82 @6448) and `escort_success` runs: its two lines, WAIT 2, the SEAL win music; no `start` line. Its kill one-shots
   * stop: Foxhunt's `mission_timer` stops all six (@7068-@7108), The Mixer's and Guidance's `escort_success` does.
   */
  it('LATER 127: the time-out posts escort_success\'s two lines and 2 s later the SEAL win music, on every escort map and console; the kill one-shots stop', () => {
    for (const map of ESCORT) for (const team of sides) {
      const { took, calls, posted } = drive(map, 'timeout', team);
      expect(took, `${map} ${team}`).toBe(true);
      expect(posted, `${map} ${team}`).toEqual(['THE TERRORISTS FAILED TO ELIMINATE THE VIPS.', 'SEALS VICTORIOUS!']);
      expect(calls, `${map} ${team}`).toEqual([`102 music ${music(map)}`]);
    }
    for (const map of ESCORT) for (const team of TEAMS) expect(maps()[map]!.decided?.stopsKills?.timeout?.[team], `${map} ${team}`).toBe(true);
  });

  it('review F2: the kill one-shots stop where the deciding path stops HostKill / SealKill -- read per map (escort_success on MP52 and MP82, not MP53; the SEALs eliminated on all three)', () => {
    const after = (map: string, decide: (a: RoundAudio) => void): string[] => {
      const { out, calls, now } = recorder(), a = new RoundAudio(out);
      a.setCues(maps()[map]!, 0);
      a.roundStart('seal', false, 0);
      run(a, now, 0, 30);
      now.t = 40; decide(a); run(a, now, 40, 60);
      calls.length = 0;
      now.t = 70; a.hostage('killedByTerrorists', 70, () => undefined); run(a, now, 70, 73);
      return calls;
    };
    for (const map of ['MP52', 'MP82']) {
      expect(after(map, (a) => { a.decidedBy('elimination', 'seal', 40, () => undefined); }), map).toEqual([]);
      expect(after(map, (a) => { a.decidedBy('rescue', 'seal', 40, () => undefined); }), map).toEqual([]);
    }
    // Foxhunt's escort_success stops none (its mission_timer does): a kill after its SEAL win still plays.
    expect(after('MP53', (a) => { a.decidedBy('elimination', 'seal', 40, () => undefined); })).toContain('70 music MUS_MP_VIP_KILL_1');
    for (const map of ESCORT) {
      expect(after(map, (a) => { a.eliminated('terrorist', 'seal', 40); }), map).toEqual([]);                       // start's SEALs-eliminated branch
      expect(after(map, (a) => { a.decidedBy('hostageKills', 'seal', 40, () => undefined); }), map).toContain('70 music MUS_MP_VIP_KILL_1');
    }
    // EXTRACTION's reading is unchanged: its one-shots play in a decided round.
    expect(after('MP6', (a) => { a.eliminated('terrorist', 'seal', 40); })).toContain('70 voice ^PH_0008');
  });

  /**
   * LATER 159 (the online seat's finding on LATER 155): a page joining an escort hold is marked decided at its welcome
   * (`markDecided`), usually BEFORE its map's cues arrive (`setCues`); whether the deciding path stopped the kill one-shots
   * is read when one fires, from the reason kept -- as `bomb` reads `timeoutPlantLive` -- not fixed at the mark, when the
   * cues were not there. Read loosely, so the RED runs before the method exists (absent: unmarked, the music plays).
   */
  it("LATER 159: a page marked decided before its cues arrive: the kill one-shots stop as the deciding path's do (marked before setCues, as after)", () => {
    type Marked = RoundAudio & { markDecided?(reason: string, team: Team | null): void };
    const joinedKill = (map: string, reason: string, cuesFirst: boolean): string[] => {
      const { out, calls, now } = recorder(), a = new RoundAudio(out) as Marked;
      now.t = 40;
      if (cuesFirst) a.setCues(maps()[map]!, 40);
      a.markDecided?.(reason, 'seal');
      if (!cuesFirst) a.setCues(maps()[map]!, 41);
      run(a, now, 40, 60);
      calls.length = 0;
      now.t = 70; a.hostage('killedByTerrorists', 70, () => undefined); run(a, now, 70, 73);
      return calls;
    };
    for (const cuesFirst of [false, true]) {
      for (const map of ESCORT) {
        expect(joinedKill(map, 'timeout', cuesFirst), `${map} timeout cuesFirst=${cuesFirst}`).toEqual([]);
        expect(joinedKill(map, 'terroristElimination', cuesFirst), `${map} terroristElimination cuesFirst=${cuesFirst}`).toEqual([]);
        expect(joinedKill(map, 'hostageKills', cuesFirst), `${map} hostageKills cuesFirst=${cuesFirst}`).toContain('70 music MUS_MP_VIP_KILL_1');
      }
      for (const map of ['MP52', 'MP82']) expect(joinedKill(map, 'elimination', cuesFirst), `${map} elimination cuesFirst=${cuesFirst}`).toEqual([]);
      expect(joinedKill('MP53', 'elimination', cuesFirst), `MP53 elimination cuesFirst=${cuesFirst}`).toContain('70 music MUS_MP_VIP_KILL_1');
    }
  });

  it.skipIf(!SOUNDRDR)('review F3: every stream the escort maps\' decided branches and kill one-shots name is a stream of that map\'s blocks (SOUNDRDR fixture)', () => {
    const zar = Zar.parse(SOUNDRDR!);
    const key = zar.root.children.find((k) => k.name.toLowerCase() === 'sounds.rdr')!;
    const root = parseRdr(zar.data(key));
    const entries = parseStreamEntries(root);
    for (const map of ESCORT) {
      const c = maps()[map]!;
      const names = cueNames({ ...c, intro: {}, introRespawn: null, elimination: { seal: {}, terrorist: {} }, timeExpired: [], bomb: undefined });
      for (const n of ['^*PT_0051', '^*PT_0055', '^PH_0042', 'MUS_MP_VIP_KILL_1', 'MUS_MP_VIP_KILL_2', 'MUS_MP_VIP_KILL_3', 'MUS_MP_VIP_RESC_1', 'MUS_MP_VIP_RESC_2', 'MUS_MP_VIP_RESC_3']) expect(names, `${map} ${n}`).toContain(n);   // LATER 131: each VIP's own
      // A `^*` name is an MP_COMMON group (research 304 §8): it resolves through its members, as `soundData` reads it.
      const stream = (n: string): string | null => { const e = streamFor(entries, missionSoundBlocks(map), n); return e && streamFile(e); };
      const groups = new Map(readTacticalSoundGroups(root, names, (n) => stream(n) !== null).map((g) => [g.name, g]));
      for (const n of names) {
        const members = groups.get(n)?.members.map((m) => m.name) ?? [n];
        expect(members.length, `${map} ${n}`).toBeGreaterThan(0);
        for (const m of members) expect(stream(m), `${map} ${n} -> ${m}`).not.toBeNull();
      }
    }
  });
});

/**
 * LATER 130 (the breach scripts read off the disc's MP61, MP62, MP73 `objectives`, 2026-10-19, through
 * `tools/probe-npc-maps.ts`): `breach_success` (MP61 @6504, MP62 and MP73 @5916) waits for `mp_winner == 8` and so runs on
 * **every** Terrorist win; `start`'s SEALs-eliminated branch (MP61 @1368-@1768) posts "ALL SEALS ELIMINATED" and the
 * Terrorist win music, then sets the valve -- so a Terrorist elimination is `start`'s line, then `breach_success`'s
 * `^*PT_0021`, its two lines, WAIT 2 and the music again. No other map has `decided.terroristElimination`.
 */
describe("LATER 130: the breach maps' Terrorist wins (the pin)", () => {
  const BREACH = ['MP61', 'MP62', 'MP73'] as const;
  const sides: (Team | null)[] = ['seal', 'terrorist', null];
  const drive = (map: string, team: Team | null) => {
    const { out, calls, now } = recorder(), a = new RoundAudio(out), posted: string[] = [];
    a.setCues(maps()[map]!, 0);
    a.roundStart(team, false, 0);
    run(a, now, 0, 30);
    calls.length = 0;
    now.t = 100;
    const took = a.decidedBy('terroristElimination', team, 100, (text) => { posted.push(text); });
    run(a, now, 100, 112);
    return { took, calls, posted };
  };

  it('a Terrorist elimination posts "ALL SEALS ELIMINATED", then the breach\'s two lines; the music at once, ^*PT_0021, the music again 2 s later', () => {
    for (const map of ['MP61', 'MP62']) for (const team of sides) {
      const { took, calls, posted } = drive(map, team);
      expect(took, `${map} ${team}`).toBe(true);
      expect(posted, `${map} ${team}`).toEqual(['ALL SEALS ELIMINATED', 'THE SEALS FAILED TO BREACH AND DESTROY THE ENEMY BASE.', 'TERRORISTS WIN!']);
      expect(calls, `${map} ${team}`).toEqual(['100 music MUS_MP_TERR_WIN_BRA', '100 voice ^*PT_0021', '102 music MUS_MP_TERR_WIN_BRA']);
    }
  });

  /**
   * LATER 138: the time-out's Terrorist win -- `mission_timer` sets `mp_winner = 8` (MP61 @6488, MP62 / MP73 @5900) and
   * `breach_success` runs: ^*PT_0021, its two lines, WAIT 2, the Terrorist win music; no `start` line.
   */
  it('LATER 138: the time-out posts breach_success\'s two lines, ^*PT_0021 at once and the music 2 s later, on every breach map and console', () => {
    for (const map of BREACH) for (const team of sides) {
      const { out, calls, now } = recorder(), a = new RoundAudio(out), posted: string[] = [];
      a.setCues(maps()[map]!, 0);
      a.roundStart(team, false, 0);
      run(a, now, 0, 30);
      calls.length = 0;
      now.t = 100;
      expect(a.decidedBy('timeout', team, 100, (text) => { posted.push(text); }), `${map} ${team}`).toBe(true);
      run(a, now, 100, 112);
      expect(posted, `${map} ${team}`).toEqual(['THE SEALS FAILED TO BREACH AND DESTROY THE ENEMY BASE.', 'TERRORISTS WIN!']);
      expect(calls, `${map} ${team}`).toEqual(['100 voice ^*PT_0021', `102 music MUS_MP_TERR_WIN_${map === 'MP73' ? 'ALG' : 'BRA'}`]);
    }
  });

  it('the guard (e3\'s condition 1): decided.timeout on the six escort and breach maps alone', () => {
    expect(Object.entries(maps()).filter(([, c]) => c.decided?.timeout).map(([m]) => m).sort()).toEqual(['MP52', 'MP53', 'MP61', 'MP62', 'MP73', 'MP82']);
  });

  it('MP73: the same steps, its first line by loc id 7305 (the map\'s strings fill it at run time) and its music ALG', () => {
    const steps: BombStep[] = [
      { message: null, locId: 7305, scale: 0.7 }, { sound: 'MUS_MP_TERR_WIN_ALG', slot: true }, { sound: '^*PT_0021', slot: false },
      { message: 'THE SEALS FAILED TO BREACH AND DESTROY THE ENEMY BASE.', locId: null, scale: 0.7 }, { message: 'TERRORISTS WIN!', locId: null, scale: 0.9 },
      { wait: 2 }, { sound: 'MUS_MP_TERR_WIN_ALG', slot: true },
    ];
    for (const t of TEAMS) expect(maps().MP73!.decided?.terroristElimination?.[t], `MP73 ${t}`).toEqual(steps);
  });

  it('the Terrorists\' defuse (MP61 @2632-@3228: its line, WAIT 3, the music, then the valve) is followed by breach_success\'s -- on the breach maps alone', () => {
    for (const map of ['MP61', 'MP62']) for (const team of sides) {
      const { out, calls, now } = recorder(), a = new RoundAudio(out), posted: string[] = [];
      a.setCues(maps()[map]!, 0);
      a.roundStart(team, false, 0);
      run(a, now, 0, 30);
      calls.length = 0;
      now.t = 100;
      a.bomb('defused', 'terrorist', team, 100, (text) => { posted.push(text); });
      run(a, now, 100, 112);
      expect(posted, `${map} ${team}`).toEqual(['BOMB DEFUSED', 'THE SEALS FAILED TO BREACH AND DESTROY THE ENEMY BASE.', 'TERRORISTS WIN!']);
      expect(calls, `${map} ${team}`).toEqual(['100 voice ^PH_0003', '103 music MUS_MP_TERR_WIN_BRA', '103 voice ^*PT_0021', '105 music MUS_MP_TERR_WIN_BRA']);
    }
    const breachLine = (s: BombStep): boolean => 'sound' in s && s.sound === '^*PT_0021';
    for (const [map, c] of Object.entries(maps())) {
      const has = Object.values(c.bomb?.defused.terrorist ?? {}).some((steps) => steps.some(breachLine));
      expect(has, map).toBe((BREACH as readonly string[]).includes(map));
      expect(Object.values(c.bomb?.defused.seal ?? {}).some((steps) => steps.some(breachLine)), map).toBe(false);
    }
  });

  it('the guard (e3\'s): only the breach maps have decided.terroristElimination -- ESCORT keeps its stopsKills.terroristElimination alone, and a Terrorist win on ESCORT (MP52) and EXTRACTION (MP6) posts elimination\'s lines', () => {
    expect(Object.entries(maps()).filter(([, c]) => c.decided?.terroristElimination).map(([m]) => m).sort()).toEqual([...BREACH]);
    expect(maps().MP52!.decided?.stopsKills?.terroristElimination).toBeDefined();
    for (const map of ['MP6', 'MP52']) for (const team of sides) expect(drive(map, team).took, `${map} ${team}`).toBe(false);
  });
});

/**
 * LATER 150 (`TIMEOUT_PLANT_LIVE_READING`; the disc's MP61, MP62, MP73 `objectives` read 2026-10-19 through
 * `tools/probe-npc-maps.ts`): the time-out's path -- `mission_timer` (MP61 @6488, MP62 @5900), then `breach_success` --
 * stops only the music and `start` on MP61 (@6564-@6612) and MP62 (@5976-@6000), never `switch_timer`; MP73's stops it
 * (@5976), as every elimination branch of `start` does on all three. So in MP61's and MP62's time-out hold a plant plays
 * `switch_timer`'s branch (@3304-@3564) and a defuse `defuse`'s own branch (MP61 @2632-@2828) -- `breach_success` ran
 * to its end at the time-out, its tail not again.
 */
describe("LATER 150: a plant and a defuse in the breach time-out's hold (the pin)", () => {
  const sides: (Team | null)[] = ['seal', 'terrorist', null];
  const breachLine = (s: BombStep): boolean => 'sound' in s && s.sound === '^*PT_0021';
  /** A round on `map` for `team`, decided at 100 by `decide`, then a plant at 110 and a defuse at 120: what each posts and plays. */
  const hold = (map: string, team: Team | null, decide: (a: RoundAudio) => void) => {
    const { out, calls, now } = recorder(), a = new RoundAudio(out), posted: string[] = [];
    a.setCues(maps()[map]!, 0);
    a.roundStart(team, false, 0);
    run(a, now, 0, 30);
    now.t = 100; decide(a); run(a, now, 100, 109);
    calls.length = 0;
    const plant: string[] = [];
    now.t = 110; a.bomb('planted', 'seal', team, 110, (text) => { plant.push(text); }); run(a, now, 110, 119);
    const plantCalls = calls.splice(0);
    now.t = 120; a.bomb('defused', 'terrorist', team, 120, (text) => { posted.push(text); }); run(a, now, 120, 135);
    return { plant, plantCalls, defuse: posted, defuseCalls: calls };
  };
  /** The plant's own cue in play, the reference. */
  const inPlay = (map: string, team: Team | null): string[] => {
    const { out, now } = recorder(), a = new RoundAudio(out), posted: string[] = [];
    a.setCues(maps()[map]!, 0);
    a.roundStart(team, false, 0);
    run(a, now, 0, 30);
    now.t = 40; a.bomb('planted', 'seal', team, 40, (text) => { posted.push(text); }); run(a, now, 40, 49);
    return posted;
  };
  const timeout = (team: Team | null) => (a: RoundAudio): void => { a.decidedBy('timeout', team, 100, () => undefined); };

  it('the guard: decided.timeoutPlantLive on MP61 and MP62 alone (derived from the scripts, never typed)', () => {
    expect(Object.entries(maps()).filter(([, c]) => c.decided?.timeoutPlantLive).map(([m]) => m).sort()).toEqual(['MP61', 'MP62']);
  });

  it("its defuse steps are the defuse branch's own -- the in-play defuse's without breach_success's tail", () => {
    for (const map of ['MP61', 'MP62']) {
      const c = maps()[map]!;
      for (const t of TEAMS) {
        const own = c.decided!.timeoutPlantLive!.defused.terrorist[t]!;
        expect(own.length, `${map} ${t}`).toBeGreaterThan(0);
        expect(own.some(breachLine), `${map} ${t}`).toBe(false);
        expect(c.bomb!.defused.terrorist[t]!.slice(0, own.length), `${map} ${t}`).toEqual(own);
      }
    }
  });

  it("MP61 / MP62: after the time-out a plant posts its lines as in play, and a defuse 'BOMB DEFUSED' alone (its line, WAIT 3, the music)", () => {
    for (const map of ['MP61', 'MP62']) for (const team of sides) {
      const r = hold(map, team, timeout(team));
      const ref = inPlay(map, team);
      expect(ref.length, `${map} ${team}`).toBeGreaterThan(0);
      expect(r.plant, `${map} ${team}`).toEqual(ref);
      expect(r.plantCalls.length, `${map} ${team} plant plays`).toBeGreaterThan(0);
      expect(r.defuse, `${map} ${team}`).toEqual(['BOMB DEFUSED']);
      expect(r.defuseCalls, `${map} ${team}`).toEqual(['120 voice ^PH_0003', '123 music MUS_MP_TERR_WIN_BRA']);
    }
  });

  it("the strings' fill (`withObjectiveTexts`, the page's whenever a map needs its strings -- MP73) keeps decided.timeout and decided.timeoutPlantLive; it dropped the time-out's lines on MP73 (LATER 138's, found here)", () => {
    for (const map of ['MP61', 'MP62', 'MP73']) {
      const c = maps()[map]!, filled = withObjectiveTexts(c, (id) => `loc ${id}`);
      expect(filled.decided?.timeout, map).toEqual(c.decided!.timeout);
      expect(filled.decided?.timeoutPlantLive, map).toEqual(c.decided!.timeoutPlantLive);
    }
    expect(maps().MP61!.decided?.timeoutPlantLive, 'the pin has it').toBeDefined();
  });

  it("MP73 (its breach_success stops switch_timer, @5976) and an elimination on MP61 / MP62: the plant and the defuse post nothing, as before", () => {
    for (const team of sides) {
      const r = hold('MP73', team, timeout(team));
      expect([r.plant, r.plantCalls, r.defuse, r.defuseCalls], `MP73 ${team}`).toEqual([[], [], [], []]);
    }
    for (const map of ['MP61', 'MP62']) for (const team of sides) {
      for (const decide of [(a: RoundAudio) => { a.eliminated('seal', team, 100); }, (a: RoundAudio) => { a.decidedBy('terroristElimination', team, 100, () => undefined); }]) {
        const r = hold(map, team, decide);
        expect([r.plant, r.plantCalls, r.defuse, r.defuseCalls], `${map} ${team}`).toEqual([[], [], [], []]);
      }
    }
  });

  /**
   * LATER 155 (reading, pending review): a page that joins (or reconnects: `reset` at its close) inside the hold sees no
   * decision -- the welcome's `decided` marks its round audio (`markDecided`), nothing played, so the hold's own rule
   * follows. Read loosely, so the RED runs before the method exists (absent: unmarked, today's page).
   */
  type Marked = RoundAudio & { markDecided?(reason: string, team: Team | null): void };
  const joined = (map: string, team: Team | null, reason: string | null) => {
    const { out, calls, now } = recorder(), a = new RoundAudio(out) as Marked;
    a.setCues(maps()[map]!, 0);
    now.t = 100; if (reason !== null) a.markDecided?.(reason, team); run(a, now, 100, 109);
    const atMark = calls.splice(0);
    const plant: string[] = [], defuse: string[] = [];
    now.t = 110; a.bomb('planted', 'seal', team, 110, (text) => { plant.push(text); }); run(a, now, 110, 119);
    const plantCalls = calls.splice(0);
    now.t = 120; a.bomb('defused', 'terrorist', team, 120, (text) => { defuse.push(text); }); run(a, now, 120, 135);
    return { atMark, plant, plantCalls, defuse, defuseCalls: calls };
  };

  it("LATER 155 (a)/(b): a page joining MP61's / MP62's time-out hold -- nothing at the mark; a plant posts its in-play lines; a defuse 'BOMB DEFUSED' alone, never a second 'TERRORISTS WIN!'", () => {
    for (const map of ['MP61', 'MP62']) for (const team of sides) {
      const r = joined(map, team, 'timeout');
      expect(r.atMark, `${map} ${team} at the mark`).toEqual([]);
      expect(r.plant, `${map} ${team} plant`).toEqual(inPlay(map, team));
      expect(r.defuse, `${map} ${team} defuse`).toEqual(['BOMB DEFUSED']);
      expect(r.defuseCalls, `${map} ${team} defuse plays`).toEqual(['120 voice ^PH_0003', '123 music MUS_MP_TERR_WIN_BRA']);
    }
  });

  it("LATER 155: joining MP73's time-out hold, or an elimination's or a bomb result's on MP61 / MP62: the plant and the defuse play nothing", () => {
    for (const team of sides) {
      const r = joined('MP73', team, 'timeout');
      expect([r.atMark, r.plant, r.plantCalls, r.defuse, r.defuseCalls], `MP73 ${team}`).toEqual([[], [], [], [], []]);
    }
    for (const map of ['MP61', 'MP62']) for (const team of sides) for (const reason of ['terroristElimination', 'elimination', 'other']) {
      const r = joined(map, team, reason);
      expect([r.atMark, r.plant, r.plantCalls, r.defuse, r.defuseCalls], `${map} ${team} ${reason}`).toEqual([[], [], [], [], []]);
    }
  });

  it("the reference (an older room's welcome, unmarked): a defuse in the hold plays bomb.defused with breach_success's tail -- LATER 155's (b)", () => {
    for (const map of ['MP61', 'MP62']) {
      const r = joined(map, 'terrorist', null);
      expect(r.defuseCalls.some((c) => c.endsWith('^*PT_0021')), map).toBe(true);
    }
  });
});

/**
 * LATER 131 (research 175 §4; MP52, MP53, MP82 `objectives` re-read 2026-10-20 through `tools/probe-npc-maps.ts`): ESCORT's
 * in-round lines, from the pin, played at the room's `escort` -- RescueN's "A VIP IS IN THE EXTRACTION ZONE" (MP52
 * @3836), EndRescueN's "A VIP HAS BEEN EXTRACTED", ^*PT_0051, WAIT 2, MUS_MP_VIP_RESC_N (@4536-@4596: N the VIP its
 * `VIP<N>_valve_alive` names), VIPcheck's branch by `player_team` (@6716-@6948). A decision keeps RescueN's and
 * EndRescueN's pending steps (no branch stops them) and VIPcheck's only on the time-out (neither `mission_timer` nor
 * `escort_success` stops VIPcheck; every branch of `start` does, MP52 @824 ... @2632).
 */
describe("LATER 131: ESCORT's in-round lines at the room's `escort` (the pin)", () => {
  const ESCORT = ['MP52', 'MP53', 'MP82'] as const;
  const sides: (Team | null)[] = ['seal', 'terrorist', null];
  const music = (map: string): string => `MUS_MP_SEAL_WIN_${map === 'MP82' ? 'RUS' : 'ALB'}`;
  const ABORTED: Record<0 | 8 | 16, string[]> = {
    0: ['MISSION COMPROMISED, TWO OF THE THREE VIPS HAVE BEEN KILLED.', 'THE EXTRACTION HAS BEEN ABORTED.', 'KEEP THE LAST VIP ALIVE.'],
    8: ['EXTRACTION ABORTED, TWO OF THE THREE VIPS HAVE BEEN KILLED.', 'ELIMINATE THE FINAL VIP.'],
    16: ['THE EXTRACTION HAS BEEN ABORTED.', 'KEEP THE LAST VIP ALIVE.'],
  };
  const code = (t: Team | null): 0 | 8 | 16 => (t === 'seal' ? 0 : t === 'terrorist' ? 8 : 16);
  const text = (steps: readonly BombStep[] | undefined): (string | null)[] => (steps ?? []).flatMap((s) => ('message' in s ? [s.message] : []));
  const start = (map: string, team: Team | null) => {
    const { out, calls, now } = recorder(), a = new RoundAudio(out), posted: string[] = [];
    a.setCues(maps()[map]!, 0);
    a.roundStart(team, false, 0);
    run(a, now, 0, 30);
    calls.length = 0;
    return { a, calls, now, posted, post: (x: string) => { posted.push(x); } };
  };

  it('the escort maps alone carry escort cues: each VIP\'s staging line and extraction (its own MUS_MP_VIP_RESC_N), VIPcheck\'s lines by team', () => {
    expect(Object.entries(maps()).filter(([, c]) => c.escort).map(([m]) => m).sort()).toEqual([...ESCORT]);
    for (const map of ESCORT) {
      const e = maps()[map]!.escort!;
      expect(Object.keys(e.staged).sort(), map).toEqual(['VIP1', 'VIP2', 'VIP3']);
      expect(Object.keys(e.extracted).sort(), map).toEqual(['VIP1', 'VIP2', 'VIP3']);
      for (const n of [1, 2, 3]) {
        expect(text(e.staged[`VIP${n}`]), `${map} VIP${n}`).toEqual(['A VIP IS IN THE EXTRACTION ZONE']);
        expect(e.extracted[`VIP${n}`], `${map} VIP${n}`).toEqual([
          { message: 'A VIP HAS BEEN EXTRACTED', locId: null, scale: 0.7 }, { sound: '^*PT_0051', slot: false }, { wait: 2 }, { sound: `MUS_MP_VIP_RESC_${n}`, slot: true },
        ]);
      }
      for (const t of TEAMS) expect(text(e.aborted[t]), `${map} ${t}`).toEqual(ABORTED[t]);
    }
  });

  it("an extraction plays its VIP's EndRescue at the room's moment, and the rescue's decision at its WAIT 2 keeps MUS_MP_VIP_RESC_N (e3's note 1)", () => {
    for (const map of ESCORT) for (const team of sides) {
      const { a, calls, now, posted, post } = start(map, team);
      now.t = 100;
      a.escort('extracted', 'VIP2', team, 100, post);
      run(a, now, 100, 101.75);
      now.t = 102;
      expect(a.decidedBy('rescue', team, 102, post), `${map} ${team}`).toBe(true);
      run(a, now, 102, 112);
      expect(posted, `${map} ${team}`).toEqual(['A VIP HAS BEEN EXTRACTED', 'THE TERRORISTS FAILED TO ELIMINATE THE VIPS.', 'SEALS VICTORIOUS!']);
      expect(calls.filter((c) => !c.includes('voice ^*PT_0055')), `${map} ${team}`).toEqual(['100 voice ^*PT_0051', '102 music MUS_MP_VIP_RESC_2', `104 music ${music(map)}`]);
      expect(calls.filter((c) => c.endsWith('voice ^*PT_0055')), `${map} ${team}`).toHaveLength(1);
    }
  });

  it("a staging line plays in any round, decided or not (RescueN runs beside start)", () => {
    for (const map of ESCORT) {
      const { a, now, posted, post } = start(map, 'seal');
      now.t = 50;
      a.escort('staged', 'VIP3', 'seal', 50, post);
      run(a, now, 50, 51);
      a.decidedBy('elimination', 'seal', 60, post);
      now.t = 70;
      a.escort('staged', 'VIP1', 'seal', 70, post);
      run(a, now, 60, 80);
      expect(posted.filter((x) => x === 'A VIP IS IN THE EXTRACTION ZONE'), map).toHaveLength(2);
    }
  });

  it("VIPcheck's lines for the local team; a decision by start's branches drops what is pending, the time-out keeps it (a4's pin)", () => {
    for (const map of ESCORT) {
      for (const team of sides) {
        const { a, now, posted, post } = start(map, team);
        now.t = 100;
        a.escort('aborted', null, team, 100, post);
        run(a, now, 100, 110);
        expect(posted, `${map} ${team}`).toEqual(ABORTED[code(team)]);
      }
      for (const reason of ['elimination', 'hostageKills', 'timeout'] as const) {
        const { a, now, posted, post } = start(map, 'seal');
        now.t = 100;
        a.escort('aborted', null, 'seal', 100, post);
        run(a, now, 100, 100.5);
        now.t = 101;
        a.decidedBy(reason, 'seal', 101, post);
        run(a, now, 101, 115);
        const vip = posted.filter((x) => ABORTED[0].includes(x));
        expect(vip, `${map} ${reason}`).toEqual(reason === 'timeout' ? ABORTED[0] : ABORTED[0].slice(0, 1));
      }
    }
  });

  it("an unknown VIP, a map without escort cues: nothing", () => {
    const { a, now, posted, post, calls } = start('MP52', 'seal');
    now.t = 40;
    a.escort('extracted', 'VIP9', 'seal', 40, post);
    run(a, now, 40, 45);
    const other = start('MP6', 'seal');
    other.now.t = 40;
    other.a.escort('staged', 'VIP1', 'seal', 40, other.post);
    run(other.a, other.now, 40, 45);
    expect([posted, calls, other.posted, other.calls]).toEqual([[], [], [], []]);
  });
});
