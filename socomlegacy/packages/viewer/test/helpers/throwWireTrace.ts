import type { NetPage } from '../../src/netPage';

/** Fixed transport trace recorded against NetPage before extraction. These are
 * synthetic requests, not evidence of accepted throws in a live room. Keep the
 * same trace on the production page and the renderer-independent adapter. */
export function runThrowWireTrace(throws: Pick<NetPage, 'throwEvent' | 'throwStartEvent'>,
  seq: (value: number) => void, stale: (value: number) => void): number | null {
  seq(10);
  const start = throws.throwStartEvent('M67', 3);
  throws.throwEvent('M67', [1, 2, 3], [0, 1, 0], undefined, start ?? undefined, 3);
  seq(11);
  throws.throwEvent('C4', [1, 2, 3], [0, 0, -1], { target: 0, slot: 0,
    surface: { path: 'fixture/charge', point: [4, 5, 6] }, eye: [7, 8, 9] }, 0, 2, 0);
  seq(12);
  throws.throwEvent('LAW HEAT', [1, 2, 3], [200, 0, 0], undefined, undefined, undefined, 9);
  seq(13);
  throws.throwEvent('M67', [1, 2, 3], [0, 1, 0], { eye: [7, 8, 9] });
  throws.throwEvent('HE', [1, 2, 3], [0, 1, 0], undefined, undefined, 2);
  for (const value of [10, 10, 11, 11, 12, 13, 999]) stale(value);
  return start;
}

export const THROW_WIRE_TRACE = {
  start: 10,
  messages: [
    { type: 'throwStart', seq: 10, kind: 'M67', slot: 3 },
    { type: 'throw', seq: 10, kind: 'M67', from: [1, 2, 3], velocity: [0, 1, 0], start: 10, slot: 3 },
    { type: 'throw', seq: 11, kind: 'C4', from: [1, 2, 3], velocity: [0, 0, -1], target: 0,
      surface: { path: 'fixture/charge', point: [4, 5, 6] }, eye: [7, 8, 9], start: 0, slot: 0 },
    { type: 'throw', seq: 12, kind: 'LAW HEAT', from: [1, 2, 3], velocity: [200, 0, 0] },
    { type: 'throw', seq: 13, kind: 'M67', from: [1, 2, 3], velocity: [0, 1, 0] },
    { type: 'throw', seq: 13, kind: 'HE', from: [1, 2, 3], velocity: [0, 1, 0], slot: 2 },
  ],
  refunds: [['M67', 3], ['C4', 0, 0], ['LAW HEAT', undefined, 9], ['M67']],
};
