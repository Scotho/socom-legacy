import { describe, expect, it, vi } from 'vitest';
import type { ServerEvent } from '../src/net/protocol';
import { prototypeLobbyLifecycle } from '../src/xboxPrototype/lobbyLifecycle';

const lobby = (change: Partial<Extract<ServerEvent, { type: 'gameLobby' }>> = {}): Extract<ServerEvent, { type: 'gameLobby' }> => ({
  type: 'gameLobby', seats: [{ id: 2, name: 'Renderer test', team: 'terrorist', ready: false, host: false, readyIn: 0 }],
  launched: false, countdown: null, ...change,
});
function rig() {
  let now = 0;
  const send = vi.fn(), loaded = vi.fn(), fail = vi.fn();
  const state = prototypeLobbyLifecycle({ map: 'MP71', id: () => 2, send, loaded, fail, now: () => now });
  return { state, send, loaded, fail, advance: (ms: number) => { now += ms; } };
}

describe('experimental renderer existing-game lifecycle', () => {
  it.each(['frame-first', 'launch-first'])('acknowledges load exactly once after launch and rendering (%s)', order => {
    const r = rig();
    if (order === 'frame-first') r.state.rendered();
    else r.state.event(lobby({ launched: true }));
    expect(r.loaded).not.toHaveBeenCalled();
    if (order === 'frame-first') r.state.event(lobby({ launched: true }));
    else r.state.rendered();
    r.state.rendered(); r.state.event(lobby({ launched: true }));
    expect(r.loaded).toHaveBeenCalledTimes(1);
  });

  it('waits for rendering and the server ready gate and does not toggle READY twice before acknowledgment', () => {
    const r = rig();
    r.state.event(lobby({ seats: [{ ...lobby().seats[0]!, readyIn: 3 }] }));
    expect(r.state.ready()).toBe(false);
    r.state.rendered();
    expect(r.state.ready()).toBe(false);
    r.advance(3000);
    expect(r.state.ready()).toBe(true);
    expect(r.state.ready()).toBe(false);
    expect(r.send.mock.calls).toEqual([[{ type: 'lobbyReady' }]]);
    r.state.event(lobby({ seats: [{ ...lobby().seats[0]!, ready: true }] }));
    expect(r.state.report().ready).toBe(true);
    expect(r.state.ready()).toBe(true); // Explicit second press means NOT READY.
    expect(r.send).toHaveBeenCalledTimes(2);
  });

  it('refuses controls during countdown, after launch, and without a player seat', () => {
    const r = rig(); r.state.rendered();
    for (const e of [lobby({ seats: [] }), lobby({ countdown: 5 }), lobby({ launched: true })]) {
      r.state.event(e);
      expect(r.state.ready()).toBe(false);
      expect(r.state.switchTeams()).toBe(false);
    }
    expect(r.send).not.toHaveBeenCalled();
  });

  it('leaves team authority to the server and allows retry after refusal', () => {
    const r = rig(); r.state.rendered(); r.state.event(lobby());
    expect(r.state.switchTeams()).toBe(true);
    expect(r.state.switchTeams()).toBe(false);
    r.state.event(lobby({ refused: 'team full' }));
    expect(r.state.report().refused).toBe('team full');
    expect(r.state.report().team).toBe('terrorist');
    expect(r.state.switchTeams()).toBe(true);
  });

  it('does not re-enable a pending READY after an unrelated roster update', () => {
    const r = rig(); r.state.rendered(); r.state.event(lobby());
    expect(r.state.ready()).toBe(true);
    r.state.event(lobby({ seats: [...lobby().seats, { ...lobby().seats[0]!, id: 3, name: 'Another player' }] }));
    expect(r.state.report().canReady).toBe(false);
    expect(r.state.ready()).toBe(false);
    expect(r.send).toHaveBeenCalledTimes(1);
  });

  it('fails closed on a map rotation, which needs a fresh world', () => {
    const a = rig(); a.state.event(lobby({ nextMap: 'MP2' })); a.state.rendered();
    expect(a.fail).toHaveBeenCalledWith(expect.stringContaining('map change'));
    expect(a.loaded).not.toHaveBeenCalled();
  });

  it('a match that returns to its lobby on the same map keeps the world: READY works again and the next launch is acknowledged once more', () => {
    const r = rig(); r.state.rendered();
    r.state.event(lobby({ launched: true }));
    expect(r.loaded).toHaveBeenCalledTimes(1);
    r.state.event(lobby());                                   // the match ended; the game is back in its lobby
    expect(r.fail).not.toHaveBeenCalled();
    expect(r.state.report()).toMatchObject({ launched: false, loaded: false, error: '', canReady: true });
    expect(r.state.ready()).toBe(true);                       // the player readies up for the next match
    expect(r.send.mock.calls).toEqual([[{ type: 'lobbyReady' }]]);
    r.state.event(lobby({ seats: [{ ...lobby().seats[0]!, ready: true }] }));
    r.state.event(lobby({ launched: true, seats: [{ ...lobby().seats[0]!, ready: true }] }));
    r.state.rendered(); r.state.event(lobby({ launched: true }));
    expect(r.loaded).toHaveBeenCalledTimes(2);                // once a launch, never twice
  });

  it('a return to the lobby drops a READY or team request still pending from before the launch', () => {
    const r = rig(); r.state.rendered(); r.state.event(lobby());
    expect(r.state.switchTeams()).toBe(true);                 // pending
    r.state.event(lobby({ launched: true })); r.state.event(lobby());
    expect(r.state.report().canSwitch).toBe(true);
  });

  it('does not expose or retain caller-owned seat objects', () => {
    const r = rig(), e = lobby(); r.state.event(e);
    e.seats[0]!.name = 'changed';
    const report = r.state.report(); report.seats[0]!.name = 'changed again';
    expect(r.state.report().seats[0]!.name).toBe('Renderer test');
  });

  it('never acknowledges a rejected seat even if its launched event arrives before the next render frame', () => {
    const r = rig(); r.state.rendered();
    r.state.fail('The server map differs from the loaded experiment map');
    r.state.event(lobby({ launched: true }));
    r.state.rendered();
    expect(r.loaded).not.toHaveBeenCalled();
    expect(r.state.ready()).toBe(false);
  });

  it.each(['closed', 'refused'] as const)('disables a %s connection without treating connecting as a failure', state => {
    const r = rig(); r.state.event(lobby()); r.state.rendered();
    r.state.connection('connecting', null); r.state.connection('open', null);
    expect(r.fail).not.toHaveBeenCalled();
    r.state.connection(state, 4001);
    expect(r.state.report().canReady).toBe(false);
    expect(r.state.report().error).toContain(`Game connection ${state}`);
    r.state.event(lobby({ launched: true }));
    expect(r.loaded).not.toHaveBeenCalled();
  });
});
