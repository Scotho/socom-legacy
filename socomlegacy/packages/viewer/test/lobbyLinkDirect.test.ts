import { describe, expect, it } from 'vitest';
import type { InviteLink } from '@s2u/ui';
import {
  directUniverse, LOBBY_LINK_DIRECT_ADAPTATION, LOBBY_LINK_DIRECT_GRACE_FRAMES_ADAPTATION, LOBBY_LINK_DIRECT_HOLD_SECONDS_ADAPTATION, LOBBY_LINK_DIRECT_MARK_TTL_MS_ADAPTATION,
  LOBBY_LINK_DIRECT_JOIN_FRAMES_ADAPTATION, LOBBY_LINK_DIRECT_PRESSES, LOBBY_LINK_DIRECT_SETTLE_FRAMES_ADAPTATION, LOBBY_LINK_DIRECT_STALL_FRAMES_ADAPTATION,
  LobbyLinkDirect, lobbyLinkRoute, markLobbyLinkDirect, takeLobbyLinkDirect, type DirectPressView, type LobbyLinkFacts,
} from '../src/lobbyLinkDirect';
import type { SessionState } from '../src/modern/session';

/**
 * LOBBY-LINK-DIRECT (the owner, 2026-11-11 ~05:10Z: "players coming in with a link like .../online/lobby/<id> who already
 * have their disc installed, and who are already signed in, take them straight to the lobby"; product track, a browser
 * adaptation with no original; OT.R121, his choices ~05:40Z: the screens skipped, the agreement accepted for him). The
 * decision (`lobbyLinkRoute`), the launcher-to-front-end mark, and the hidden path: the original's login screens run
 * behind a cover, their presses made, revealed at the GAME LOBBY or where the player must act. Generated values only.
 */

const ID = 'TOwttYxGFFw';
const facts = (o: Partial<LobbyLinkFacts> = {}): LobbyLinkFacts => ({ lobbyId: ID, discWhole: true, session: 'signed-in', account: 'Bravo', ...o });
const lobby = (id = ID): InviteLink => ({ mediusWorldId: 0, game: '', universe: null, lobbyId: id });

describe('LOBBY_LINK_DIRECT_ADAPTATION: the decision (disc x sign-in x link)', () => {
  it('names itself as an adaptation', () => {
    expect(LOBBY_LINK_DIRECT_ADAPTATION).toMatch(/lobby link/);
    expect(LOBBY_LINK_DIRECT_ADAPTATION).toMatch(/original/);
  });

  // The table: the link (a lobby id or none), the disc (kept whole or not), the session's state.
  const states: SessionState[] = ['signed-out', 'signing-in', 'agreement', 'signed-in'];
  for (const lobbyId of [ID, null]) {
    for (const discWhole of [true, false]) {
      for (const session of states) {
        const want = lobbyId === null ? 'no-link' : !discWhole ? 'no-disc' : session !== 'signed-in' ? 'signed-out' : 'direct';
        it(`link ${lobbyId ? 'yes' : 'no'}, disc ${discWhole ? 'whole' : 'not whole'}, ${session}: ${want}`, () => {
          const r = lobbyLinkRoute(facts({ lobbyId, discWhole, session }));
          if (want === 'direct') expect(r).toEqual({ route: 'direct', lobbyId: ID, account: 'Bravo' });
          else expect(r).toEqual({ route: 'menus', why: want });
        });
      }
    }
  }

  it('signed in with no account name read: the menus (nothing to match the persona form against)', () => {
    expect(lobbyLinkRoute(facts({ account: null }))).toEqual({ route: 'menus', why: 'signed-out' });
    expect(lobbyLinkRoute(facts({ account: '' }))).toEqual({ route: 'menus', why: 'signed-out' });
  });

  it('a text that is not a lobby id is no link', () => {
    expect(lobbyLinkRoute(facts({ lobbyId: 'x' }))).toEqual({ route: 'menus', why: 'no-link' });
  });
});

describe('the mark: the launcher\'s START to the front end\'s mount (in memory, used once)', () => {
  it('direct, then the mount on the same lobby id: the account; used once', () => {
    markLobbyLinkDirect(lobbyLinkRoute(facts()), 1000);
    expect(takeLobbyLinkDirect(lobby(), 1500)).toEqual({ account: 'Bravo' });
    expect(takeLobbyLinkDirect(lobby(), 1600)).toBeNull();
  });

  it('a menus decision clears an earlier direct one (a second START re-decides)', () => {
    markLobbyLinkDirect(lobbyLinkRoute(facts()), 1000);
    markLobbyLinkDirect(lobbyLinkRoute(facts({ session: 'signed-out' })), 1100);
    expect(takeLobbyLinkDirect(lobby(), 1200)).toBeNull();
  });

  it('another lobby id, no link, a world-id invite or an expired mark: null, and the mark cleared', () => {
    markLobbyLinkDirect(lobbyLinkRoute(facts()), 0);
    expect(takeLobbyLinkDirect(lobby('AAAAAAAAAAAA'), 1)).toBeNull();
    expect(takeLobbyLinkDirect(lobby(), 2)).toBeNull();                       // cleared by the first read
    markLobbyLinkDirect(lobbyLinkRoute(facts()), 0);
    expect(takeLobbyLinkDirect(null, 1)).toBeNull();
    markLobbyLinkDirect(lobbyLinkRoute(facts()), 0);
    expect(takeLobbyLinkDirect({ mediusWorldId: 7, game: 'friday', universe: null }, 1)).toBeNull();
    markLobbyLinkDirect(lobbyLinkRoute(facts()), 0);
    expect(takeLobbyLinkDirect(lobby(), LOBBY_LINK_DIRECT_MARK_TTL_MS_ADAPTATION)).toBeNull();
  });
});

describe('OT.R121: the hidden path -- the presses made behind the cover, and the reveal', () => {
  const view = (dialog: string | null, o: Partial<DirectPressView> = {}): DirectPressView => ({
    dialog, popup: false, suspended: false, enabled: () => true, playerName: () => 'Bravo', ...o,
  });
  /** Frames on one view; the controls pressed, in order. */
  const run = (d: LobbyLinkDirect, v: DirectPressView, n = LOBBY_LINK_DIRECT_SETTLE_FRAMES_ADAPTATION + 5): string[] => {
    const out: string[] = [];
    for (let i = 0; i < n; i++) { const c = d.step(v); if (c) out.push(c); }
    return out;
  };

  it('the three presses are the original\'s own buttons on the original\'s own screens', () => {
    expect(LOBBY_LINK_DIRECT_PRESSES).toEqual([
      { dialog: 'dlgNetLogin.rdr', control: 'login_btn', named: false },
      { dialog: 'dlgNetPlayerName.rdr', control: 'connect_btn', named: true },
      { dialog: 'dlgUsagePolicy.rdr', control: 'YesAccept', named: false },
    ]);
  });

  it('covers from the start; the whole login path pressed through, once each, still covered; the GAME LOBBY reveals it', () => {
    const d = new LobbyLinkDirect('Bravo');
    expect([d.covering, d.revealed]).toEqual([true, null]);
    const at: number[] = [];
    for (let i = 0; i < 40; i++) if (d.step(view('dlgNetLogin.rdr'))) at.push(i);
    expect(at).toEqual([LOBBY_LINK_DIRECT_SETTLE_FRAMES_ADAPTATION - 1]);
    expect(run(d, view('dlgNetAuthenticate.rdr'))).toEqual([]);              // DNAS runs by itself
    expect(run(d, view('dlgNetServerSelect.rdr'))).toEqual([]);             // the universe is the session's own advance
    expect(run(d, view('dlgNetPlayerName.rdr'))).toEqual(['connect_btn']);
    expect(run(d, view('dlgNetConnect.rdr'))).toEqual([]);
    expect(run(d, view('dlgUsagePolicy.rdr'))).toEqual(['YesAccept']);
    expect(run(d, view('dlgWorldOfSOCOM.rdr'))).toEqual([]);                // the join is INVITE_JOIN_ADAPTATION's
    expect(run(d, view('dlgMPBriefingRoom.rdr'))).toEqual([]);
    expect(run(d, view(null))).toEqual([]);                                 // a switch under way
    expect(d.covering).toBe(true);
    expect(run(d, view('dlgGameLobby.rdr'))).toEqual([]);
    expect([d.covering, d.revealed]).toEqual([false, 'lobby']);
  });

  it('back on a screen already pressed (a refused login: the persona form again): revealed there, nothing pressed again', () => {
    const d = new LobbyLinkDirect('Bravo');
    run(d, view('dlgNetLogin.rdr')); run(d, view('dlgNetPlayerName.rdr')); run(d, view('dlgNetConnect.rdr'));
    expect(run(d, view('dlgNetPlayerName.rdr'), 200)).toEqual([]);
    expect(d.revealed).toBe('returned');
  });

  it('the persona form showing another name, or CONNECT not enabled (no saved password): revealed there after its settle and grace', () => {
    for (const o of [{ playerName: () => 'Charlie' }, { playerName: () => null }, { enabled: (c: string) => c !== 'connect_btn' }]) {
      const d = new LobbyLinkDirect('Bravo');
      run(d, view('dlgNetLogin.rdr'));
      const v = view('dlgNetPlayerName.rdr', o);
      expect(run(d, v, LOBBY_LINK_DIRECT_SETTLE_FRAMES_ADAPTATION + LOBBY_LINK_DIRECT_GRACE_FRAMES_ADAPTATION - 1)).toEqual([]);
      expect(d.covering).toBe(true);
      d.step(v);
      expect(d.revealed).toBe('persona');
    }
  });

  it('a screen off the path (TRIANGLE to the main menu, a network error, the memory card\'s dialogs): revealed at once', () => {
    for (const dialog of ['dlgMenu.rdr', 'dlgNetError.rdr', 'dlgNetAbort.rdr']) {
      const d = new LobbyLinkDirect('Bravo');
      run(d, view('dlgNetLogin.rdr'), 3);
      d.step(view(dialog));
      expect([dialog, d.revealed]).toEqual([dialog, 'off-path']);
    }
  });

  it('a screen that does not move on (a popup the player must answer, a button never enabled): revealed when it stalls', () => {
    const d = new LobbyLinkDirect('Bravo');
    expect(run(d, view('dlgNetLogin.rdr', { popup: true }), LOBBY_LINK_DIRECT_STALL_FRAMES_ADAPTATION - 1)).toEqual([]);
    expect(d.covering).toBe(true);
    d.step(view('dlgNetLogin.rdr', { popup: true }));
    expect(d.revealed).toBe('stalled');
    const e = new LobbyLinkDirect('Bravo');
    run(e, view('dlgNetServerSelect.rdr'), LOBBY_LINK_DIRECT_STALL_FRAMES_ADAPTATION);
    expect(e.revealed).toBe('stalled');
  });

  it('a switch that never ends counts toward the stall too; a new dialog starts the count again', () => {
    const d = new LobbyLinkDirect('Bravo');
    run(d, view('dlgNetLogin.rdr', { enabled: () => false }), LOBBY_LINK_DIRECT_STALL_FRAMES_ADAPTATION - 10);
    run(d, view(null), 5);
    run(d, view('dlgNetAuthenticate.rdr'), LOBBY_LINK_DIRECT_STALL_FRAMES_ADAPTATION - 1);
    expect(d.covering).toBe(true);
    run(d, view(null), 1);
    expect(d.revealed).toBe('stalled');
  });

  it('a join under way on SOCOM II ONLINE (the room\'s, the game\'s, its socket\'s welcome: up to 30 s) is not a stall; the count runs again after it', () => {
    const d = new LobbyLinkDirect('Bravo');
    run(d, view('dlgWorldOfSOCOM.rdr', { joining: true }), LOBBY_LINK_DIRECT_STALL_FRAMES_ADAPTATION * 3);
    expect(d.covering).toBe(true);
    run(d, view('dlgWorldOfSOCOM.rdr'), LOBBY_LINK_DIRECT_STALL_FRAMES_ADAPTATION);
    expect(d.revealed).toBe('stalled');
  });

  it('the join\'s own bound (the review\'s SHOULD): the disc\'s two waits -- monitor_timeout\'s 30 s, join_after_a_while\'s 33.3 s -- and a margin, at the menus\' rate', () => {
    const ticks = (30 + 33.333) * 2997 / 100;                               // UI_TICK_SECONDS is 100/2997 s
    expect(LOBBY_LINK_DIRECT_JOIN_FRAMES_ADAPTATION).toBeGreaterThan(ticks);
    expect(LOBBY_LINK_DIRECT_JOIN_FRAMES_ADAPTATION).toBe(2100);
    expect(LOBBY_LINK_DIRECT_ADAPTATION).toMatch(/join/);
  });

  it('a join that never answers (JoinGame lost, the state held at 0x0f): covered to the join\'s bound, then revealed as stalled -- never for good', () => {
    const d = new LobbyLinkDirect('Bravo');
    const joining = view('dlgWorldOfSOCOM.rdr', { joining: true });
    run(d, joining, LOBBY_LINK_DIRECT_JOIN_FRAMES_ADAPTATION - 1);
    expect(d.covering).toBe(true);
    d.step(joining);
    expect(d.revealed).toBe('stalled');
  });

  it('a join that answers at 40 s is still covered and lands in the lobby: the bound does not cut a slow, live join', () => {
    const d = new LobbyLinkDirect('Bravo');
    run(d, view('dlgWorldOfSOCOM.rdr', { joining: true }), 1200);              // 40 s at 30 Hz
    expect(d.covering).toBe(true);
    run(d, view(null, { joining: true }), 6);                                // the switch
    d.step(view('dlgGameLobby.rdr', { joining: true }));
    expect(d.revealed).toBe('lobby');
  });

  it('the join\'s frames add up across the switch\'s gaps and its own popups; frames not joining do not count toward it', () => {
    const d = new LobbyLinkDirect('Bravo');
    run(d, view('dlgWorldOfSOCOM.rdr'), 100);                                 // before the join: the screen\'s own stall count
    run(d, view('dlgWorldOfSOCOM.rdr', { joining: true, popup: true }), LOBBY_LINK_DIRECT_JOIN_FRAMES_ADAPTATION - 10);
    run(d, view(null, { joining: true }), 9);
    expect(d.covering).toBe(true);
    d.step(view(null, { joining: true }));
    expect(d.revealed).toBe('stalled');
  });

  it('reveal from outside (the join\'s refusal): the first reason kept, the presses ended', () => {
    const d = new LobbyLinkDirect('Bravo');
    d.reveal('refused');
    d.reveal('lobby');
    expect(d.revealed).toBe('refused');
    expect(run(d, view('dlgNetLogin.rdr'), 100)).toEqual([]);
  });

  it('a popup up or the input suspended holds the press, and its settle starts again after', () => {
    const d = new LobbyLinkDirect('Bravo');
    expect(run(d, view('dlgNetLogin.rdr', { popup: true }), 100)).toEqual([]);
    expect(run(d, view('dlgNetLogin.rdr', { suspended: true }), 100)).toEqual([]);
    expect(run(d, view('dlgNetLogin.rdr'), LOBBY_LINK_DIRECT_SETTLE_FRAMES_ADAPTATION - 1)).toEqual([]);
    expect(run(d, view('dlgNetLogin.rdr'), 1)).toEqual(['login_btn']);
  });

  it('a dialog name as the menus spell it (any case) is the same screen', () => {
    const d = new LobbyLinkDirect('Bravo');
    expect(run(d, view('DLGNETLOGIN.RDR'))).toEqual(['login_btn']);
  });

  it('the universe when the link settles none: the first one up, the rule the launcher\'s sign-in read its server by', () => {
    expect(directUniverse([{ name: 'A', up: false }, { name: 'B', up: true }, { name: 'C', up: true }])).toBe('B');
    expect(directUniverse([{ name: 'A', up: false }])).toBeNull();
  });

  it('the login holds (OT.R20) are zero behind the cover: nothing is drawn to hold', () => {
    expect(LOBBY_LINK_DIRECT_HOLD_SECONDS_ADAPTATION).toBe(0);
  });
});
