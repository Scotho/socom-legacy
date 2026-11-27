import { describe, expect, it, vi } from 'vitest';
import type { FireEvent, FireWeapon } from '../src/fire';
import { FirearmWire, type FirearmWireClient } from '../src/net/firearmWire';
import { TICK_HZ, type ClientEvent } from '../src/net/protocol';

const rifle: FireWeapon = { name: 'rifle', id: 1, fireAnim: null, sounds: { close: null, med: null, far: null, reload: null } };
const pistol: FireWeapon = { ...rifle, name: 'pistol', id: 2 };
const round = (shot = 1, extra: Partial<Extract<FireEvent, { type: 'round' }>> = {}): Extract<FireEvent, { type: 'round' }> => ({
  type: 'round', weapon: rifle, from: [1, 2, 3], to: [1, 2, -7], hit: false, rounds: 29, shot, ...extra,
});
function setup() {
  let seq = 50, now = 100, resumed = false;
  const sent: ClientEvent[] = [], times: number[] = [];
  const client: FirearmWireClient = {
    state: 'open', lastSeq: () => seq, awaitingResume: () => resumed,
    viewTick: at => { times.push(at!); return at!; }, shownTick: at => { times.push(at!); return at! - 2; },
    send: event => { sent.push(event); },
  };
  let current = client;
  const staleRound = vi.fn(), staleReload = vi.fn(), pressWindow = vi.fn();
  const wire = new FirearmWire({ client: () => current, sidearmId: () => pistol.id, staleRound, staleReload, pressWindow, now: () => now });
  return { wire, client, sent, times, staleRound, staleReload, pressWindow,
    seq(value: number) { seq = value; }, now(value: number) { now = value; }, resume(value: boolean) { resumed = value; },
    replace() { current = { ...client }; },
  };
}

describe('renderer-independent firearm claims (existing NetPage ordering)', () => {
  it('keeps a press at its firing clock until the first trigger command, even at low render rates', () => {
    const s = setup();
    expect(s.wire.roundSeq()).toBe(51);
    s.wire.fireEvent(round());
    s.wire.setTrigger(true);
    s.wire.flushPressRounds();
    expect(s.sent).toEqual([]);
    s.now(500); s.seq(53); s.wire.flushPressRounds();
    expect(s.sent).toEqual([{ type: 'fire', seq: 51, from: [1, 2, 3], dir: [0, 0, -1], weapon: 0,
      eye: [1, 2, 3], aim: [0, 0, -1], viewTick: 100, shownTick: 98 }]);
    expect(s.times).toEqual([100, 100]);
    s.wire.fireEvent(round(2, { seq: 52, weapon: pistol, eye: [0, 5, 0], aim: [0, 0.1, -0.9] }));
    expect(s.sent[1]).toMatchObject({ seq: 52, weapon: 1, eye: [0, 5, 0], aim: [0, 0.1, -0.9], viewTick: 500, shownTick: 498 });
  });

  it('keeps later game-tick claims behind a queued press and names them on their own command', () => {
    const s = setup();
    s.wire.fireEvent(round()); s.wire.setTrigger(true);
    expect(s.wire.roundSeq(52)).toBe(52);
    s.wire.fireEvent(round(2, { seq: 52 }));
    expect(s.sent).toEqual([]);
    s.seq(53); s.wire.flushPressRounds();
    expect(s.sent.map(event => 'seq' in event ? event.seq : null)).toEqual([51, 52]);
  });

  it('drops queued rounds on close, explicit teardown, or client replacement', () => {
    for (const stop of ['closed', 'clear', 'replacement'] as const) {
      const s = setup(); s.wire.fireEvent(round());
      if (stop === 'closed') s.client.state = 'closed';
      else if (stop === 'clear') s.wire.clearPending();
      else s.replace();
      s.seq(51); s.wire.flushPressRounds();
      expect(s.sent).toEqual([]);
    }
  });

  it('sends no claims while closed or waiting for an authoritative resume', () => {
    for (const state of ['closed', 'resume'] as const) {
      const s = setup(); s.wire.setTrigger(true);
      s.wire.fireEvent({ type: 'reloadStart', weapon: rifle, seconds: 1.6, reload: 9 });
      expect(s.wire.reloadSeq).toBe(50); s.sent.length = 0;
      if (state === 'closed') s.client.state = 'closed'; else s.resume(true);
      expect(s.wire.roundSeq(51)).toBeNull();
      s.wire.fireEvent(round());
      s.wire.fireEvent({ type: 'reloadPress', weapon: rifle, seconds: 0.01 });
      s.wire.fireEvent({ type: 'reloadStart', weapon: rifle, seconds: 1.6 });
      expect(s.sent).toEqual([]); expect(s.wire.reloadSeq).toBeNull();
    }
  });

  it('shares one clock read for both rewind values and omits a missing displayed tick', () => {
    const s = setup(); s.wire.setTrigger(true); s.client.shownTick = () => null;
    s.wire.fireEvent(round());
    expect(s.sent[0]).toMatchObject({ viewTick: 100 });
    expect(s.sent[0]).not.toHaveProperty('shownTick');
  });

  it('returns the existing reload press window and remembers only the actual reload sequence', () => {
    const s = setup();
    s.wire.fireEvent({ type: 'reloadPress', weapon: rifle, seconds: 0.5 });
    expect(s.sent).toEqual([{ type: 'reloadPress', seq: 50 }]);
    expect(s.pressWindow).toHaveBeenCalledWith(50 + Math.round(0.5 * TICK_HZ));
    expect(s.wire.reloadSeq).toBeNull();
    s.seq(80); s.wire.fireEvent({ type: 'reloadStart', weapon: rifle, seconds: 1.6, reload: 7 });
    expect(s.sent[1]).toEqual({ type: 'reload', seq: 80 }); expect(s.wire.reloadSeq).toBe(80);
    s.wire.stale('reload', 80); s.wire.stale('reload', 80);
    expect(s.staleReload.mock.calls).toEqual([[7]]); expect(s.wire.reloadSeq).toBeNull();
  });

  it('refunds one shell for multiple pellets, and only the named reload journal entry', () => {
    const s = setup(); s.wire.setTrigger(true);
    s.wire.fireEvent(round(7)); s.wire.fireEvent(round(8));
    s.wire.stale('fire', 50); s.wire.stale('fire', 50);
    expect(s.staleRound.mock.calls).toEqual([[7]]);
    s.wire.fireEvent({ type: 'reloadStart', weapon: rifle, seconds: 1.6, reload: 9 });
    s.seq(60); s.wire.fireEvent({ type: 'reloadStart', weapon: rifle, seconds: 1.6, reload: 10 });
    s.wire.stale('reload', 50);
    expect(s.staleReload.mock.calls).toEqual([[9]]); expect(s.wire.reloadSeq).toBe(60);
    s.wire.stale('fire', 60); expect(s.staleRound.mock.calls).toEqual([[7]]);
  });

  it('bounds rollback history to the existing 128 distinct commands', () => {
    const s = setup(); s.wire.setTrigger(true);
    for (let i = 0; i < 129; i++) { s.seq(i); s.wire.fireEvent(round(i)); }
    s.wire.stale('fire', 0); s.wire.stale('fire', 1); s.wire.stale('fire', 128);
    expect(s.staleRound.mock.calls).toEqual([[1], [128]]);
  });

  it('ignores presentation-only fire events and unknown stale replies', () => {
    const s = setup();
    s.wire.fireEvent({ type: 'dry', weapon: rifle });
    s.wire.fireEvent({ type: 'reloadEnd', weapon: rifle, completed: true, reason: 'complete' });
    s.wire.stale('fire', 7); s.wire.stale('reload', 7);
    expect(s.sent).toEqual([]); expect(s.staleRound).not.toHaveBeenCalled(); expect(s.staleReload).not.toHaveBeenCalled();
  });
});
