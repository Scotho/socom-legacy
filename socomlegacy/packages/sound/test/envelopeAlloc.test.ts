import { describe, expect, it } from 'vitest';
import * as render from '../src/render';

/**
 * PAGE-ALLOC-A item 3 (LATER 867 (A); a CPU-side browser adaptation, product track while every sample is bit-identical):
 * the SPU ADSR's `Envelope.rate` returned a new `[step, cyc]` a step, a voice, a sample (29 MB in shadow's X2c profile).
 * The pin holds the reworked envelope to `EnvelopeBase` below -- the class as it stood at agent/v0419 3a8fa1ba85, verbatim
 * but for its name and the enum's -- sample by sample: the level, the phase, the cycles left and `tick`'s answer, over
 * every phase, both curves, both directions and a spread of ADSR words, a whole note each (held, keyed off, released).
 */

// ---- The oracle: `Envelope` at 3a8fa1ba85 ----
const enum PhaseBase { Attack, Decay, Sustain, Release, Off }
const idiv = (a: number, b: number): number => Math.trunc(a / b);
class EnvelopeBase {
  phase = PhaseBase.Attack;
  level = 0;
  private cycles = 0;
  constructor(private readonly adsr1: number, private readonly adsr2: number) {}
  keyOff(): void { if (this.phase !== PhaseBase.Off) this.phase = PhaseBase.Release; this.cycles = 0; }
  private rate(shift: number, stepValue: number, exponential: boolean, decrease: boolean): [number, number] {
    let cyc = 1 << Math.max(0, shift - 11);
    let step = stepValue * (1 << Math.max(0, 11 - shift));
    if (exponential && !decrease && this.level > 0x6000) cyc *= 4;
    if (exponential && decrease) step = idiv(step * this.level, 0x8000);
    return [step, cyc];
  }
  /** One sample; false once the voice is off. */
  tick(): boolean {
    if (this.phase === PhaseBase.Off) return false;
    if (this.cycles > 0) { this.cycles--; return true; }
    let step = 0, cyc = 1;
    const a1 = this.adsr1, a2 = this.adsr2;
    switch (this.phase) {
      case PhaseBase.Attack:
        [step, cyc] = this.rate((a1 >> 10) & 0x1f, 7 - ((a1 >> 8) & 3), (a1 & 0x8000) !== 0, false);
        this.level += step;
        if (this.level >= 0x7fff) { this.level = 0x7fff; this.phase = PhaseBase.Decay; }
        break;
      case PhaseBase.Decay: {
        [step, cyc] = this.rate((a1 >> 4) & 0x0f, -8, true, true);
        this.level += step;
        const sustain = ((a1 & 0x0f) + 1) * 0x800;
        if (this.level <= sustain) { this.level = Math.max(this.level, 0); this.phase = PhaseBase.Sustain; }
        break;
      }
      case PhaseBase.Sustain: {
        const decrease = (a2 & 0x4000) !== 0;
        const stepValue = decrease ? -(8 - ((a2 >> 6) & 3)) : 7 - ((a2 >> 6) & 3);
        [step, cyc] = this.rate((a2 >> 8) & 0x1f, stepValue, (a2 & 0x8000) !== 0, decrease);
        this.level = Math.min(0x7fff, Math.max(0, this.level + step));
        break;
      }
      case PhaseBase.Release:
        [step, cyc] = this.rate(a2 & 0x1f, -8, (a2 & 0x20) !== 0, true);
        this.level += step;
        if (this.level <= 0) { this.level = 0; this.phase = PhaseBase.Off; }
        break;
      default: break;
    }
    this.cycles = Math.max(0, cyc - 1);
    return this.phase !== PhaseBase.Off;
  }
}

interface EnvelopeLike { phase: number; level: number; keyOff(): void; tick(): boolean }
type EnvelopeCtor = new (adsr1: number, adsr2: number) => EnvelopeLike;
const Envelope = (render as unknown as { Envelope?: EnvelopeCtor }).Envelope;
const cycles = (e: EnvelopeLike): number => (e as unknown as { cycles: number }).cycles;

function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The ADSR words: each field's corners (attack/decay/sustain/release shifts 0, 11 and their tops; both curves and directions), then random words. */
function words(): [number, number][] {
  const out: [number, number][] = [];
  for (const exp of [0, 0x8000]) for (const ash of [0, 5, 11, 12, 20, 0x1f]) for (const ast of [0, 3]) {
    for (const dsh of [0, 6, 11, 15]) for (const sl of [0, 7, 15]) {
      out.push([exp | (ash << 10) | (ast << 8) | (dsh << 4) | sl, 0]);
    }
  }
  for (const sExp of [0, 0x8000]) for (const sDec of [0, 0x4000]) for (const ssh of [0, 8, 11, 13, 0x1f]) for (const sst of [0, 3]) {
    for (const rExp of [0, 0x20]) for (const rsh of [0, 4, 11, 13, 0x1f]) out.push([0x000f | (4 << 10), sExp | sDec | (ssh << 8) | (sst << 6) | rExp | rsh]);
  }
  const r = prng(0xad5);
  for (let i = 0; i < 400; i++) out.push([Math.floor(r() * 0x10000), Math.floor(r() * 0x10000)]);
  return out;
}

/** One note on both envelopes in lockstep: `held` samples, a key-off, then until off or `after` samples. The first
 * difference in `tick`'s answer, the level, the phase or the cycles left, or null; `count` gets the samples stepped. */
function note(got: EnvelopeLike, want: EnvelopeBase, held: number, after: number, count: { n: number }): string | null {
  const same = (at: string, a?: boolean, b?: boolean): string | null => {
    if (a !== b) return `${at}: tick ${a} != ${b}`;
    if (!Object.is(got.level, want.level)) return `${at}: level ${got.level} != ${want.level}`;
    if (!Object.is(got.phase, want.phase as number)) return `${at}: phase ${got.phase} != ${want.phase}`;
    if (!Object.is(cycles(got), cycles(want as unknown as EnvelopeLike))) return `${at}: cycles`;
    return null;
  };
  for (let n = 0; n < held; n++) { count.n++; const d = same(`held ${n}`, got.tick(), want.tick()); if (d) return d; }
  got.keyOff(); want.keyOff();
  const k = same('key-off'); if (k) return k;
  for (let n = 0; n < after; n++) {
    count.n++;
    const a = got.tick(), b = want.tick();
    const d = same(`release ${n}`, a, b); if (d) return d;
    if (!b) break;
  }
  return null;
}

describe('PAGE-ALLOC-A item 3: the SPU envelope steps without a tuple a sample', () => {
  it('the envelope is reachable for the pin (exported as `Envelope`)', () => {
    expect(typeof Envelope).toBe('function');
  });

  it('pin: a whole note per ADSR word (every phase, both curves, both directions), state identical sample by sample', () => {
    if (!Envelope) throw new Error('Envelope is not exported');
    const bad: string[] = [];
    const count = { n: 0 };
    const holds = [0, 1, 300, 4800, 24000];
    const list = words();
    list.forEach(([a1, a2], i) => {
      const d = note(new Envelope(a1, a2), new EnvelopeBase(a1, a2), holds[i % holds.length]!, 48000, count);
      if (d) bad.push(`${a1.toString(16)}/${a2.toString(16)} ${d}`);
    });
    const samples = count.n;
    expect(bad).toEqual([]);
    // eslint-disable-next-line no-console
    console.log(`  Tests (PAGE-ALLOC-A item 3) pin: ${list.length} notes, ${samples} samples compared`);
  });

  it('pin: toneRelease (the exported reader of the envelope) gives the curve the base envelope gives, float for float', () => {
    // `toneRelease` at 3a8fa1ba85 over `EnvelopeBase`, verbatim but for the names.
    const base = (adsr1: number, adsr2: number, heldSeconds: number): render.ReleaseCurve => {
      const env = new EnvelopeBase(adsr1, adsr2);
      for (let n = Math.round(heldSeconds * render.OUTPUT_RATE); n > 0 && env.tick(); n--) { /* held */ }
      const start = env.level, limit = Math.round(render.RELEASE_LIMIT_SECONDS_PLACEHOLDER * render.OUTPUT_RATE);
      if (start <= 0 || env.phase === PhaseBase.Off) return { seconds: 0, curve: Float32Array.of(0) };
      env.keyOff();
      const levels: number[] = [start];
      let n = 0;
      while (n < limit && env.tick()) { n++; levels.push(env.level); }
      if (n < limit) n++;
      const seconds = n / render.OUTPUT_RATE, points = Math.ceil(seconds * render.RELEASE_CURVE_HZ) + 1;
      const curve = new Float32Array(points);
      for (let i = 0; i < points - 1; i++) curve[i] = (levels[Math.min(levels.length - 1, Math.round((i * render.OUTPUT_RATE) / render.RELEASE_CURVE_HZ))] ?? 0) / start;
      return { seconds, curve };
    };
    let curves = 0;
    for (const [a1, a2] of words().filter((_, i) => i % 7 === 0)) {
      for (const held of [0.01, 0.5]) {
        const got = render.toneRelease(a1, a2, held), want = base(a1, a2, held);
        expect(Object.is(got.seconds, want.seconds), `${a1}/${a2} seconds`).toBe(true);
        expect(got.curve.length).toBe(want.curve.length);
        for (let i = 0; i < want.curve.length; i++) if (!Object.is(got.curve[i], want.curve[i])) expect.fail(`${a1}/${a2} curve[${i}]`);
        curves++;
      }
    }
    expect(curves).toBeGreaterThan(50);
  });

  it('allocation: a step returns no tuple (base: a new [step, cyc] each step)', () => {
    if (!Envelope) throw new Error('Envelope is not exported');
    const e = new Envelope(0x8f0f, 0x5fc8);
    const rate = (e as unknown as { rate: (s: number, v: number, x: boolean, d: boolean) => unknown }).rate;
    let tuples = 0;
    for (const shift of [0, 5, 11, 20]) for (const exp of [false, true]) for (const dec of [false, true]) {
      if (typeof rate.call(e, shift, dec ? -8 : 7, exp, dec) === 'object') tuples++;
    }
    // eslint-disable-next-line no-console
    console.log(`  Tests (PAGE-ALLOC-A item 3) tuples returned by 16 rate calls: ${tuples}`);
    expect(tuples).toBe(0);
  });
});
