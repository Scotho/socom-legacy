// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { Hud } from '../src/hud';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import type { Rules, ScoreRow, ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';

/**
 * WM-DATA-WIN (the owner's "B, every win", relayed by the controller -- WM.R24; PRODUCT TRACK: the DAMAGE REPORT PANEL,
 * WM-13, a browser adaptation with no original): in a classic room the room sends each player his round report the moment
 * a side wins (every entry into its `decided` phase: `roomDamageReportAtWin.test.ts`), and the page opens its damage
 * window (`NetPage.damageWindow`) on that report's ARRIVAL while the round is not over (no round's result yet) -- so the
 * page needs no list of win events: the set lives in the room alone. The window stays open through the map's hold and
 * the `ENGINE_READ_S` after `roundOver`, closing when ROUND COMPLETE is up (`screensElapsed` >= 0). A round with no early
 * report -- a time-out draw, an older room's -- keeps today's window, the read alone. A life report (`life: true`, a
 * respawn room's) opens no round window. The report shown is the latest the room sent: the decision's, then
 * `roundOver`'s. A spectator has none; the open hold goes at the next `roundStart`, at `abandoned`, at a (re)join's
 * welcome and at the page's close. The original's lines, music and hold are not touched. The harness is
 * `netPageDamageWindow.test.ts`'s, with an optional round-audio stand-in whose `decided` takes the event (the
 * 'eliminated' case's early `break`).
 */
function page(rules: Rules = 'classic', o: { decided?: boolean } = {}) {
  let socket: WebSocketLike | null = null, dead = false;
  const hud = new Hud();
  hud.setVisible(true);
  const walk = {
    setNetTap: () => {}, setLocked: () => {}, respawn: () => true, nudge: () => {},
    setTrigger: () => {}, setDead: (on: boolean) => { dead = on; },
    setDeathPose: (pose: unknown) => { if (pose !== null) dead = true; },
    setDeathKiller: () => {}, mode: () => 'walk', isDead: () => dead, queueRespawnAction: () => true,
  } as unknown as WalkMode;
  const remote = { setTeam: () => {}, forget: () => {}, died: () => {}, clear: () => {}, frame: () => {} } as unknown as RemotePlayers;
  // The map's cues took the decision (`decided` true): the 'eliminated' case breaks before its posted lines.
  const roundAudio = o.decided === undefined ? undefined : {
    roundStart: () => {}, eliminated: () => {}, timeExpired: () => {}, roundOver: () => {}, reset: () => {}, frame: () => {},
    decided: () => o.decided!, markDecided: () => {},
  } as unknown as NetPageDeps['roundAudio'];
  const net = new NetPage({
    walk, remote, hud, clips: () => null, remoteGrenade: () => {}, spectate: () => {}, respawned: () => {},
    ownCorpseExpired: () => false, roundEffects: () => {}, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    ...(roundAudio ? { roundAudio } : {}),
    socket: () => {
      socket = { binaryType: '', readyState: 1, send: () => {}, close: () => {} } as unknown as WebSocketLike;
      return socket;
    },
  }, 'ws://test/ws', 'MP2', 'Tester', undefined, false, rules);
  socket!.onopen?.({} as Event);
  const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  const welcome = (): void => server({
    type: 'welcome', id: 1, version: 4, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
    players: [], rules, round: 1, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
  });
  welcome();
  const row = (id: number, name: string, team: 'seal' | 'terrorist'): ScoreRow => ({ id, name, team, kills: 0, deaths: 0, score: 0, alive: true, ping: 0 });
  server({ type: 'score', rows: [row(1, 'Tester', 'seal'), row(2, 'Bravo', 'terrorist'), row(3, 'Charlie', 'terrorist')], timeLeft: null, spectators: [], wins: { seal: 0, terrorist: 0 } });
  const at = (ms: number): void => {
    vi.mocked(performance.now).mockReturnValue(ms);
    if (net.client.state === 'open') server({ type: 'pong', t: ms, tick: 0 } as ServerEvent);
    net.frame(0, {} as never, false);
  };
  return { net, server, at, welcome };
}
type Page = ReturnType<typeof page>;

const roundOver = (round = 1): ServerEvent => ({
  type: 'roundOver', round, winner: 'seal', wins: { seal: round, terrorist: 0 }, matchOver: false,
  screens: [{ screen: 'roundComplete', seconds: 5 }],
});
const roundStart = (round: number): ServerEvent =>
  ({ type: 'roundStart', round, seconds: 360, wins: { seal: round - 1, terrorist: 0 }, rounds: 11, epoch: round, startTick: 0 } as ServerEvent);
/** The decision's report (the round so far) and roundOver's (the same round, a later ledger: told apart by `dealt`). */
const atDecision: ServerEvent = { type: 'damageReport', round: 1, taken: [{ from: 2, hits: 2, health: 0.4 }], dealt: [{ to: 3, hits: 1, health: 0.25 }] };
const atOver: ServerEvent = { type: 'damageReport', round: 1, taken: [{ from: 2, hits: 2, health: 0.4 }], dealt: [{ to: 3, hits: 2, health: 0.5 }] };
const DECISION_VIEW = { round: 1, life: false, taken: [{ id: 2, name: 'Bravo', hits: 2, health: 0.4 }], dealt: [{ id: 3, name: 'Charlie', hits: 1, health: 0.25 }] };
const OVER_VIEW = { round: 1, life: false, taken: [{ id: 2, name: 'Bravo', hits: 2, health: 0.4 }], dealt: [{ id: 3, name: 'Charlie', hits: 2, health: 0.5 }] };

/** The decision at 1 s, its report with it (`decideWith`); the map's hold to 24 s; roundOver at 24 s and its report: the read to 27 s. */
const DECIDE_MS = 1000, OVER_MS = 24000, COMPLETE_MS = OVER_MS + 3000;
function decideWith(p: Page, ev: ServerEvent | null, report: ServerEvent | null = atDecision): void {
  p.at(DECIDE_MS);
  if (ev) p.server(ev);
  if (report) p.server(report);
}
function over(p: Page): void {
  p.at(OVER_MS);
  p.server(roundOver());
  p.server(atOver);
}

beforeEach(() => { vi.spyOn(performance, 'now').mockReturnValue(0); });
afterEach(() => { vi.restoreAllMocks(); });

/** The room's decision events, each followed by the decision's report (the room's every-win send). */
const DECISIONS: [string, ServerEvent | null][] = [
  ['an elimination (no reason)', { type: 'eliminated', winner: 'seal' }],
  ["an elimination (reason 'elimination')", { type: 'eliminated', winner: 'seal', reason: 'elimination' } as ServerEvent],
  ["EXTRACTION's 'rescue'", { type: 'eliminated', winner: 'seal', reason: 'rescue' } as ServerEvent],
  ["EXTRACTION's 'hostageKills'", { type: 'eliminated', winner: 'terrorist', reason: 'hostageKills' } as ServerEvent],
  ['a time-out win (timedOut)', { type: 'timedOut', winner: 'seal' } as ServerEvent],
  ["a bomb's result (no event of the room's at the decision)", null],
];
const ELIMINATION = DECISIONS[0]![1];

describe("WM-DATA-WIN: a win opens the damage window on the decision's report, until ROUND COMPLETE", () => {
  for (const [label, ev] of DECISIONS) {
    for (const decided of ev ? [false, true] : [false]) {
      it(`${label}${decided ? ", the map's cues took it" : ''}: open through the hold with the decision's report`, () => {
        const p = page('classic', decided ? { decided: true } : {});
        try {
          p.at(500);
          expect(p.net.damageWindow()).toBeNull();                        // a live round
          decideWith(p, ev);
          p.at(DECIDE_MS + 1);
          expect(p.net.damageWindow()).toEqual({ kind: 'round', report: DECISION_VIEW });
          p.at(OVER_MS - 1);                                               // the map's hold, no round screen
          expect(p.net.screenUp()).toBe(false);
          expect(p.net.damageWindow()).toEqual({ kind: 'round', report: DECISION_VIEW });
        } finally { p.net.close(); }
      });
    }
    it(`${label}: through the read with roundOver's report, closed at ROUND COMPLETE`, () => {
      const p = page();
      try {
        decideWith(p, ev);
        over(p);
        p.at(OVER_MS + 1);
        expect(p.net.damageWindow()).toEqual({ kind: 'round', report: OVER_VIEW });   // the latest report replaces the decision's
        p.at(COMPLETE_MS - 1);
        expect(p.net.damageWindow()).toEqual({ kind: 'round', report: OVER_VIEW });
        p.at(COMPLETE_MS + 1);
        expect(p.net.screenUp()).toBe(true);
        expect(p.net.damageWindow()).toBeNull();
        p.at(COMPLETE_MS + 4000);                                          // the screen held: still closed
        expect(p.net.damageWindow()).toBeNull();
      } finally { p.net.close(); }
    });
  }

  it("a decision event alone opens nothing: the page keys on the report (an older room's hold: today's read alone)", () => {
    const p = page();
    try {
      decideWith(p, ELIMINATION, null);
      p.at(DECIDE_MS + 1);
      expect(p.net.damageWindow()).toBeNull();
      p.at(OVER_MS - 1);
      expect(p.net.damageWindow()).toBeNull();
      over(p);
      p.at(OVER_MS + 1);
      expect(p.net.damageWindow()).toEqual({ kind: 'round', report: OVER_VIEW });
      p.at(COMPLETE_MS + 1);
      expect(p.net.damageWindow()).toBeNull();
    } finally { p.net.close(); }
  });

  it('a spectator has no window at the decision, in the hold or in the read', () => {
    const p = page();
    try {
      (p.net.client as { role: string }).role = 'spectator';
      decideWith(p, ELIMINATION);
      p.at(DECIDE_MS + 1);
      expect(p.net.damageWindow()).toBeNull();
      over(p);
      p.at(OVER_MS + 1);
      expect(p.net.damageWindow()).toBeNull();
    } finally { p.net.close(); }
  });
});

describe("WM-DATA-WIN: a round with no early report keeps today's window, the read alone", () => {
  it('a time-out draw (roundOver with no winner, its one report after it): the 3 s read only', () => {
    const p = page();
    try {
      p.at(OVER_MS);
      p.server({ ...roundOver(), winner: null } as ServerEvent);
      p.server(atOver);
      p.at(OVER_MS + 1);
      expect(p.net.damageWindow()).toEqual({ kind: 'round', report: OVER_VIEW });
      p.at(COMPLETE_MS + 1);
      expect(p.net.damageWindow()).toBeNull();
    } finally { p.net.close(); }
  });

  it('a round report that arrives once ROUND COMPLETE is up does not reopen the window', () => {
    const p = page();
    try {
      p.at(OVER_MS);
      p.server(roundOver());
      p.at(COMPLETE_MS + 1);
      p.server(atOver);
      p.at(COMPLETE_MS + 2);
      expect(p.net.damageWindow()).toBeNull();
    } finally { p.net.close(); }
  });

  it("a respawn room's life report opens no round window (a living page's: closed; the respawn wait is the life's)", () => {
    const p = page('respawn');
    try {
      p.at(DECIDE_MS);
      p.server({ type: 'damageReport', round: 1, life: true, taken: [{ from: 3, hits: 4, health: 1 }], dealt: [] } as ServerEvent);
      p.at(DECIDE_MS + 1);
      expect(p.net.damageWindow()).toBeNull();
    } finally { p.net.close(); }
  });
});

describe("WM-DATA-WIN: the open hold is the round's alone", () => {
  it('gone at the next roundStart: the next round live, and a decision event there with no report opens nothing', () => {
    const p = page();
    try {
      decideWith(p, ELIMINATION);
      over(p);
      p.at(COMPLETE_MS + 2000);
      p.server(roundStart(2));
      p.at(COMPLETE_MS + 2001);
      expect(p.net.damageWindow()).toBeNull();                            // round 2 live
      p.at(60000);
      p.server({ type: 'timedOut', winner: 'seal' } as ServerEvent);      // an older room's: no report
      p.at(60001);
      expect(p.net.damageWindow()).toBeNull();
    } finally { p.net.close(); }
  });

  it('gone at a roundStart that comes in the hold (no roundOver seen)', () => {
    const p = page();
    try {
      decideWith(p, ELIMINATION);
      p.at(DECIDE_MS + 1);
      expect(p.net.damageWindow()?.kind).toBe('round');
      p.server(roundStart(2));
      p.at(DECIDE_MS + 2);
      expect(p.net.damageWindow()).toBeNull();
    } finally { p.net.close(); }
  });

  it('gone at abandoned', () => {
    const p = page();
    try {
      decideWith(p, ELIMINATION);
      p.at(DECIDE_MS + 1);
      expect(p.net.damageWindow()?.kind).toBe('round');
      p.server({ type: 'abandoned' } as ServerEvent);
      p.at(DECIDE_MS + 2);
      expect(p.net.damageWindow()).toBeNull();
    } finally { p.net.close(); }
  });

  it("gone at a (re)join's welcome (its screens are the welcome's alone)", () => {
    const p = page();
    try {
      decideWith(p, ELIMINATION);
      p.at(DECIDE_MS + 1);
      expect(p.net.damageWindow()?.kind).toBe('round');
      p.welcome();
      p.at(DECIDE_MS + 2);
      expect(p.net.damageWindow()).toBeNull();
    } finally { p.net.close(); }
  });

  it("gone at the page's close", () => {
    const p = page();
    decideWith(p, ELIMINATION);
    p.at(DECIDE_MS + 1);
    expect(p.net.damageWindow()?.kind).toBe('round');
    p.net.close();
    expect(p.net.damageWindow()).toBeNull();
  });
});
