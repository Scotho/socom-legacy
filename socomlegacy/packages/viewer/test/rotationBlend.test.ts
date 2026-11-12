import { expect, it } from 'vitest';
import { mergeRotations, slerp } from '../src/animator';
type Quat = [number, number, number, number];
// Reference copied from pre-optimization 4accc1142; compare operation-order results exactly.
function reference(entries: { q: Quat | null; w: number; lateral: boolean }[]): Quat | null {
  const live = entries.map((e) => ({ ...e, on: true }));
  const pass = (pick: (e: { lateral: boolean }) => boolean): void => {
    for (let guard = 0; guard < 30; guard++) {
      const two = live.filter((e) => e.on && pick(e)).slice(0, 2);
      if (two.length < 2) return;
      const [a, b] = two as [typeof live[number], typeof live[number]];
      const total = a.w + b.w;
      const f = total > 0 ? Math.min(1, Math.max(0, b.w / total)) : 0;
      if (!a.q) a.q = b.q;
      else if (b.q && f > 0.001) a.q = f >= 0.999 ? b.q : slerp(a.q, b.q, f);
      a.w = total;
      b.on = false;
    }
  };
  pass((e) => e.lateral);
  pass((e) => !e.lateral);
  pass(() => true);
  return live.find((e) => e.on)?.q ?? null;
}

it('matches the old merge for missing, lateral, zero-weight and long blends without mutating inputs', () => {
  let state = 73;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let trial = 0; trial < 400; trial++) {
    const entries = Array.from({length: trial % 70}, () => {
      const q: Quat = [random()-.5,random()-.5,random()-.5,random()-.5];
      const len = Math.hypot(...q); for (let i=0;i<4;i++) q[i]! /= len;
      return {q: random()<.25 ? null : q, w: random()<.2 ? 0 : random(), lateral: random()<.5};
    });
    const before = structuredClone(entries);
    expect(mergeRotations(entries)).toEqual(reference(entries));
    expect(entries).toEqual(before);
  }
});
