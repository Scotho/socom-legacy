import { expect, it, vi } from 'vitest';
import { ThrowWire, type ThrowWireClient } from '../src/net/throwWire';
import { runThrowWireTrace, THROW_WIRE_TRACE } from './helpers/throwWireTrace';

vi.mock('../src/netPage', () => { throw new Error('Throw transport imported the production match page'); });
vi.mock('../src/fire', () => { throw new Error('Throw transport imported production firearm graphics'); });

function fixture() {
  let seq = 0;
  const send = vi.fn(), refund = vi.fn();
  const client: ThrowWireClient = { state: 'open', lastSeq: () => seq, send };
  const wire = new ThrowWire({ client: () => client, staleThrow: refund });
  return { wire, client, send, refund, seq: (value: number) => { seq = value; } };
}
it('matches the complete pre-extraction NetPage packet/refund trace', () => {
  const h = fixture();
  const start = runThrowWireTrace(h.wire, h.seq, value => h.wire.stale(value));
  expect({ start, messages: h.send.mock.calls.map(call => call[0]), refunds: h.refund.mock.calls }).toEqual(THROW_WIRE_TRACE);
});
it('does not send or journal a throw before the connection opens', () => {
  const h = fixture(); h.client.state = 'connecting';
  expect(h.wire.throwStartEvent('M67', 3)).toBeNull(); h.wire.throwEvent('M67', [0, 0, 0], [0, 1, 0]);
  h.client.state = 'open'; h.wire.stale(0);
  expect(h.send).not.toHaveBeenCalled(); expect(h.refund).not.toHaveBeenCalled();
});
it('keeps the existing bounded journal and clears it before another authoritative kit can be refunded', () => {
  const h = fixture();
  for (let seq = 0; seq < 129; seq++) { h.seq(seq); h.wire.throwEvent('M67', [0, 0, 0], [0, 1, 0], undefined, undefined, 3); }
  h.wire.stale(0); expect(h.refund).not.toHaveBeenCalled();
  h.wire.stale(1); expect(h.refund.mock.calls).toEqual([['M67', 3]]);
  h.wire.clearPending(); h.wire.stale(128); expect(h.refund).toHaveBeenCalledTimes(1);
  h.seq(129); h.wire.throwEvent('HE', [0, 0, 0], [0, 1, 0]); h.wire.stale(129);
  expect(h.refund.mock.calls).toEqual([['M67', 3], ['HE']]);
});
it('LATER 1456: the release request carries the last hurt serial the page heard, and only when known', () => {
  const h = fixture(); h.seq(5);
  h.wire.throwStartEvent('M67', 3, 7); h.wire.throwStartEvent('M67', undefined, 0); h.wire.throwStartEvent('M67', 3);
  expect(h.send.mock.calls.map(call => call[0])).toEqual([
    { type: 'throwStart', seq: 5, kind: 'M67', slot: 3, hurt: 7 },
    { type: 'throwStart', seq: 5, kind: 'M67', hurt: 0 },
    { type: 'throwStart', seq: 5, kind: 'M67', slot: 3 },
  ]);
});
