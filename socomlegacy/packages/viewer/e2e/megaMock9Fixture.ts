import type { MatchPageData } from '../src/matchPage';

/**
 * MEGA-MOCK call 9's staged answer (a BROWSER ADAPTATION, product track): one plausible five-round Demolition match on
 * Frostfire (MP2), the staged names only (Viper, Echo, Kilo the SEALs; Cobra, Mako, Rook the Terrorists), in the shape of
 * central's `/api/stats/match/<id>` (`../src/matchPage.ts` `MatchPageData`). Each round carries the staged `startTick`
 * the EVENTS tab measures its clock from (central does not serve it yet). The players' totals and the awards are
 * counted from the staged events, so the page's sections agree with each other. Invented data; no real player's name.
 */

/**
 * The record's tick rate, `../src/matchPage.ts` `MATCH_PAGE_TICK_HZ_ADAPTATION` (60) written here: Playwright's loader
 * cannot load the page module (its JSON import), so the spec imports only its types; `test/matchEvents.test.ts` holds
 * the two equal.
 */
export const MEGA_MOCK_9_TICK_HZ = 60;
const HZ = MEGA_MOCK_9_TICK_HZ;
const STARTED = Date.UTC(2026, 10, 14, 1, 30);

type Ev = [sec: number, kind: string, actor: string | null, target: string | null, weapon: string | null, part: string | null, how?: string];
const ROUNDS: { winner: 0 | 1; reason: string; ms: number; events: Ev[] }[] = [
  { winner: 0, reason: 'elimination', ms: 152_000, events: [
    [38, 'kill', 'Viper', 'Cobra', 'M4A1', 'head'], [52, 'kill', 'Mako', 'Kilo', 'AK-47', 'torso'],
    [80, 'kill', 'Echo', 'Rook', 'M4A1', 'torso'], [151, 'kill', 'Viper', 'Mako', 'M4A1', 'head'],
  ] },
  { winner: 1, reason: 'detonated', ms: 255_000, events: [
    [44, 'kill', 'Rook', 'Echo', 'SR-25', 'head'], [70, 'planted', 'Cobra', null, null, null], [91, 'kill', 'Viper', 'Rook', 'M14', 'torso'],
    [118, 'kill', 'Mako', 'Viper', 'AK-47', 'torso'], [255, 'detonated', 'Cobra', null, null, null],
  ] },
  { winner: 0, reason: 'defused', ms: 232_000, events: [
    [29, 'kill', 'Kilo', 'Mako', 'M4A1', 'leg'], [65, 'kill', 'Cobra', 'Kilo', 'AK-47', 'head'], [107, 'planted', 'Rook', null, null, null],
    [122, 'kill', 'Echo', 'Rook', 'M16A2', 'head'], [232, 'defused', 'Viper', null, null, null],
  ] },
  { winner: 1, reason: 'elimination', ms: 190_000, events: [
    [33, 'kill', 'Cobra', 'Viper', 'AK-47', 'torso'], [51, 'kill', 'Rook', 'Echo', 'SR-25', 'torso'], [72, 'kill', 'Kilo', 'Mako', 'M4A1', 'head'],
    [90, 'kill', 'Rook', 'Rook', 'M67', 'torso'], [190, 'kill', 'Cobra', 'Kilo', 'AK-47', 'torso'],
  ] },
  { winner: 0, reason: 'elimination', ms: 171_000, events: [
    [47, 'kill', 'Echo', 'Cobra', 'M4A1', 'torso'], [75, 'kill', 'Viper', 'Kilo', 'M14', 'leg', 'teamkill'], [99, 'kill', 'Mako', 'Echo', 'AK-47', 'head'],
    [140, 'kill', 'Viper', 'Mako', 'M14', 'head'], [171, 'kill', 'Viper', 'Rook', 'M14', 'torso'],
  ] },
];

const SIDES: Record<string, 0 | 1> = { Viper: 0, Echo: 0, Kilo: 0, Cobra: 1, Mako: 1, Rook: 1 };
const SHOTS: Record<string, [hits: number, shots: number]> = { Viper: [64, 181], Echo: [41, 150], Kilo: [22, 97], Cobra: [47, 166], Mako: [38, 141], Rook: [29, 88] };

/** The staged answer. `id` is the match id the page is opened at. */
export function megaMock9Match(id: string): MatchPageData {
  const rounds: MatchPageData['rounds'] = [];
  const events: MatchPageData['events'] = [];
  let start = 10 * HZ;
  let seq = 0;
  ROUNDS.forEach((r, i) => {
    rounds.push({ round: i + 1, winner: r.winner, reason: r.reason, ms: r.ms, startTick: start });
    for (const [sec, kind, actor, target, weapon, part, how] of r.events) {
      events.push({ round: i + 1, seq: seq++, tick: start + sec * HZ, kind, actor, target, weapon, part, how: kind === 'kill' ? how ?? 'weapon' : null });
    }
    start += Math.round((r.ms / 1000 + 15) * HZ);
  });
  const names = Object.keys(SIDES);
  const real = (e: MatchPageData['events'][number]): boolean => e.kind === 'kill' && e.actor !== null && e.actor !== e.target && e.how !== 'teamkill';
  const players: MatchPageData['players'] = names.map((name) => {
    const side = SIDES[name]!;
    const kills = events.filter((e) => real(e) && e.actor === name).length;
    const headShots = events.filter((e) => real(e) && e.actor === name && e.part === 'head').length;
    const teamKills = events.filter((e) => e.how === 'teamkill' && e.actor === name).length;
    const suicides = events.filter((e) => e.kind === 'kill' && e.actor === name && e.target === name).length;
    const plants = events.filter((e) => e.kind === 'planted' && e.actor === name).length;
    const defuses = events.filter((e) => e.kind === 'defused' && e.actor === name).length;
    const roundsWon = rounds.filter((r) => r.winner === side).length;
    return {
      name, bot: false, side, joinedInProgress: false, playedMs: rounds.reduce((s, r) => s + r.ms, 0), kills,
      deaths: events.filter((e) => e.kind === 'kill' && e.target === name).length, suicides, teamKills, headShots,
      hits: SHOTS[name]![0], shots: SHOTS[name]![1], score: 10 * kills + 10 * (plants + defuses) - 10 * (teamKills + suicides),
      bombsPlanted: plants, bombsDefused: defuses, rescues: 0, roundsWon, roundsLost: rounds.length - roundsWon, assists: name === 'Echo' ? 2 : name === 'Mako' ? 1 : 0,
      damage: 100 * kills, medal: 0, tag: '',
    };
  });
  const top = (f: (p: MatchPageData['players'][number]) => number): { name: string; value: number } => {
    const p = players.slice().sort((x, y) => f(y) - f(x))[0]!;
    return { name: p.name, value: f(p) };
  };
  const firsts = new Map<string, number>();
  for (const r of rounds) {
    const first = events.find((e) => e.round === r.round && real(e));
    if (first) firsts.set(first.actor!, (firsts.get(first.actor!) ?? 0) + 1);
  }
  const [fbName, fbN] = [...firsts].sort((x, y) => y[1] - x[1])[0]!;
  return {
    match: {
      id, map: 'MP2', mapName: 'Frostfire', mode: 'DEMOLITION', settings: { roundSeconds: 300, maxRounds: 5, lobbyName: 'Saturday Scrim', respawn: false, password: false },
      startedAt: STARTED, endedAt: STARTED + 19 * 60_000, ended: 'complete', counted: true, reason: null, replay: null, replayPage: null,
      assistsTracked: true, live: false, region: 'us-east',
    },
    players, rounds, events,
    awards: {
      mvp: top((p) => p.score), topFragger: top((p) => p.kills),
      sharpshooter: { ...top((p) => (p.kills >= 3 ? Math.round((100 * p.headShots) / p.kills) : 0)) },
      mostAssists: top((p) => p.assists), firstBlood: { name: fbName, value: fbN }, bestRound: { name: 'Viper', value: 2, round: 5 },
    },
  };
}
