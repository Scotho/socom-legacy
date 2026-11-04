// test/clanTagRound.test.ts -- CLAN-TAG-ROUND (web sprint 18, the clans' half, checkpoint 6; research 275): the room's
// score rows' clan tag reaching the page -- the protocol's additive field (no version bump; an older reader ignores it),
// the SELECT board's "[tag]" rows through the page's `score` handling, and the round's speaker line from the same rows.
import { describe, expect, it } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { HudVoiceElement, speakerText, voiceHudFrame } from '../src/hudVoice';
import type { WebSocketLike } from '../src/net/client';
import { PROTOCOL_VERSION, type ScoreRow, type ServerEvent } from '../src/net/protocol';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { RemotePlayers } from '../src/remotePlayers';
import { layoutText } from '../src/hudFont';
import { NO_CLAN, SCORE_LAYOUT, scoreboardLayout, type ScoreRowInfo } from '../src/scoreboard';
import type { WalkMode } from '../src/walk';

const PS2 = { width: 640, height: 448 };
const SIZES: Record<string, { width: number; height: number }> = {
  'newweapnbkrnd.tif': { width: 128, height: 64 }, 'font_text_01.tif': { width: 512, height: 128 }, white: { width: 1, height: 1 },
};
type Quads = ReturnType<typeof scoreboardLayout>['quads'];
/** The text quads (not shadows) of `line` laid at the pen and baseline, as the layout draws them: the whole string, or none. */
const drawn = (quads: Quads, line: string, x: number, y: number, scale = 0.8): Quads => {
  const g = layoutText(line, x, y, scale).glyphs;
  const hit = g.map((h) => quads.find((q) => q.texture === 'font_text_01.tif' && q.rgba[0] !== 0
    && Math.abs(q.x - (h.x + h.w / 2)) < 1e-6 && Math.abs(q.y - (h.y + h.h / 2)) < 1e-6 && q.u0 === h.u0));
  return hit.every((q) => q) ? hit as Quads : [];
};
/** The text glyphs on a row's band between the panel's left (153) and `xMax`. */
const glyphsOn = (quads: Quads, base: number, xMax: number): Quads =>
  quads.filter((q) => q.texture === 'font_text_01.tif' && q.rgba[0] !== 0 && q.y > base - 14 && q.y < base + 4 && q.x > 153 && q.x < xMax);

/** A live page over a fake socket: the rows its HUD is handed at each `score` (`NetPage`'s own handling, unchanged). */
function page(): { server: (ev: ServerEvent) => void; rows: () => ScoreRowInfo[] | null } {
  let handed: ScoreRowInfo[] | null = null;
  const hud: NetPageDeps['hud'] = {
    postMessage: () => undefined, setTimer: () => undefined, setHealth: () => undefined,
    setScoreRows: (rows) => { handed = rows; }, setRoundScreen: () => undefined, startRound: () => undefined,
  };
  const remote = {
    setTeam: () => undefined, setType: () => undefined, setKit: () => undefined, forget: () => undefined, died: () => undefined,
    hydrateCorpse: () => undefined, markGhost: () => undefined, clear: () => undefined, frame: () => undefined,
    setEscortee: () => undefined, setOpacity: () => undefined, feet: () => null, playerType: () => 0,
  } as unknown as RemotePlayers;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined, setTrigger: () => undefined,
    setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true, mode: () => 'walk', setFlinchPose: () => undefined,
    feet: () => [0, 0, 0],
  } as unknown as WalkMode;
  let socket: WebSocketLike | null = null;
  const deps: NetPageDeps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined, respawned: () => undefined,
    newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    socket: () => { socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike; return socket; },
  };
  new NetPage(deps, 'ws://test/ws', 'MP72', 'Kilo', undefined, false, 'classic');
  socket!.onopen?.({} as Event);
  // The wire is JSON: the event goes as the room's text frame does.
  const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  server({
    type: 'welcome', id: 1, version: PROTOCOL_VERSION, map: 'MP72', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Kilo',
    players: [{ id: 2, name: 'Lima', team: 'seal' }], rules: 'classic', round: 1, rounds: 2, ghost: false, epoch: 0,
    env: { revision: 0, epoch: 0, states: [] },
  } as ServerEvent);
  return { server, rows: () => handed };
}

const KILO: ScoreRow = { id: 1, name: 'Kilo', team: 'seal', kills: 2, deaths: 0, score: 20, alive: true, ping: 40, clan: 'NSW' };
const LIMA: ScoreRow = { id: 2, name: 'Lima', team: 'seal', kills: 1, deaths: 1, score: 10, alive: true, ping: 50 };
const score = (rows: ScoreRow[]): ServerEvent => ({ type: 'score', rows, timeLeft: 100, spectators: [], wins: { seal: 0, terrorist: 0 } });

describe('the protocol: ScoreRow.clan is additive (COLLABORATION, "Protocol N") -- no version bump', () => {
  it('the version is 12 (SEP-POP; the tag rode 11 additively); a row with no tag is the older shape exactly; a tagged row read for the older fields gives the same values', () => {
    expect(PROTOCOL_VERSION).toBe(13);                           // PLANT-AIM's bump (the plant needs the page's pick; 12 SEP-POP's); this part unchanged
    expect(Object.keys(JSON.parse(JSON.stringify(LIMA)) as object).sort()).toEqual(['alive', 'deaths', 'id', 'kills', 'name', 'ping', 'score', 'team']);
    const older = ({ id, name, team, kills, deaths, score: s, alive, ping }: ScoreRow) => ({ id, name, team, kills, deaths, score: s, alive, ping });
    const { clan, ...rest } = JSON.parse(JSON.stringify(KILO)) as ScoreRow;
    expect(clan).toBe('NSW');
    expect(older(KILO)).toEqual(rest);
  });

  it('an older page\'s handling of the rows: the tag changes nothing else it hands the HUD', () => {
    const tagged = page(), bare = page();
    tagged.server(score([KILO, LIMA]));
    bare.server(score([{ ...KILO, clan: undefined } as ScoreRow, LIMA].map((r) => JSON.parse(JSON.stringify(r)) as ScoreRow)));
    const strip = (rows: ScoreRowInfo[] | null) => rows?.map(({ clan: _c, ...r }) => r);
    expect(strip(tagged.rows())).toEqual(strip(bare.rows()));
  });
});

describe('the page\'s board: a tagged row and an untagged row from the room\'s score (FUN_0022a290 D:L79042-79053; research 269 §5.2)', () => {
  const base = (i: number): number => SCORE_LAYOUT.teams[0]!.y + 38 + 16.8 * i;

  it('the page hands each row\'s tag to the board whole; the tagged row draws "[NSW]" at 163, the untagged the seed\'s space', () => {
    const p = page();
    p.server(score([KILO, LIMA]));
    const rows = p.rows()!;
    expect(rows.find((r) => r.id === 1)).toMatchObject({ clan: 'NSW', self: true });
    expect(rows.find((r) => r.id === 2)).not.toHaveProperty('clan');
    const { quads } = scoreboardLayout(PS2, { player: 'Kilo', game: 'CROSSROADS', type: 'DEMOLITION', rows }, SIZES);
    // Kilo scores 20, first; Lima 10, second (the board's sort by score).
    expect(drawn(quads, '[NSW]', 163, base(0))).toHaveLength(5);
    expect(drawn(quads, 'Kilo', 223, base(0)).length).toBeGreaterThan(0);
    expect(NO_CLAN).toBe(' ');
    expect(glyphsOn(quads, base(1), 223)).toHaveLength(0);       // no clan: nothing left of the name
    expect(drawn(quads, 'Lima', 223, base(1)).length).toBeGreaterThan(0);
  });

  it('the next score replaces the rows: a seat that leaves its tag behind is not drawn with it', () => {
    const p = page();
    p.server(score([KILO, LIMA]));
    p.server(score([{ ...LIMA }]));
    expect(p.rows()).toEqual([{ ...LIMA, self: false }]);
  });
});

describe('the round\'s speaker line from the same rows (FUN_00238ac0 D:L85680-85692, FUN_002c3ac0 D:L85681)', () => {
  const frame = (holder: number, rows: readonly ScoreRow[]) => voiceHudFrame(new HudVoiceElement(), 1, {
    voice: { channel: 1, holder, talking: false }, self: { id: 9, team: 'seal' }, rows, spectators: 0,
    nameOf: (id) => ({ 1: 'Kilo', 2: 'Lima', 7: 'Papa' } as Record<number, string>)[id] ?? null, at: () => null, own: null,
  }).view.name;

  it('a tagged talker: "[%s] %s" (S:0x3e6718); an untagged one: the name alone; a talker with no row (a spectator): the name alone', () => {
    expect(frame(1, [KILO, LIMA])).toBe('[NSW] Kilo');
    expect(frame(2, [KILO, LIMA])).toBe('Lima');
    expect(frame(7, [KILO, LIMA])).toBe('Papa');
    expect(speakerText('Kilo', 'NSW')).toBe('[NSW] Kilo');
  });
});

describe('AD-13 C30: the speaker line\'s tag from the room\'s told tags, a watcher\'s too (FUN_002c5450 D:L166281-166293; research 275 §5)', () => {
  /** The page a spectator's (self 8, team null, channel 10) unless `self` says otherwise; `told` the room's `seatClans` as the page's board holds it. */
  const frame = (holder: number, told: Record<number, string> | null, rows: readonly ScoreRow[] = [KILO, LIMA], self: { id: number; team: 'seal' | null } = { id: 8, team: null }) =>
    voiceHudFrame(new HudVoiceElement(), 1, {
      voice: { channel: self.team === null ? 10 : 1, holder, talking: false }, self, rows, spectators: 2,
      nameOf: (id) => ({ 1: 'Kilo', 2: 'Lima', 7: 'Papa', 9: 'Quinn' } as Record<number, string>)[id] ?? null, at: () => null, own: null,
      ...(told ? { clanOf: (id: number) => told[id] ?? '' } : {}),
    }).view.name;

  it('a tagged watcher talking: "[SEA] Papa" on another spectator\'s line; an untagged watcher and a seat no board names: the name alone', () => {
    expect(frame(7, { 7: 'SEA', 1: 'NSW' })).toBe('[SEA] Papa');
    expect(frame(9, { 7: 'SEA', 1: 'NSW' })).toBe('Quinn');           // untagged: the room told none
    expect(frame(9, {})).toBe('Quinn');                               // no holder of a tag at all (a guest's seat)
  });

  it('the rows\' tag still answers where the room told none (an older room: no seatClans); the told tag first where both are', () => {
    expect(frame(1, null, [KILO, LIMA], { id: 2, team: 'seal' })).toBe('[NSW] Kilo');
    expect(frame(1, {}, [KILO, LIMA], { id: 2, team: 'seal' })).toBe('[NSW] Kilo');
    expect(frame(1, { 1: 'NEW' }, [KILO, LIMA], { id: 2, team: 'seal' })).toBe('[NEW] Kilo');
    expect(frame(7, null)).toBe('Papa');                              // no board and no row: the name alone, as before AD-13
  });
});
