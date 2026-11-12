import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RenderedSound } from '@s2u/sound';
import { AUTOMATION_REFUSED_TALLY_SECONDS, WebAudioOut, type LoopHandle } from '../src/audio';
import { webAudioMusicOut } from '../src/menuMusic';

/**
 * FF-AUDIO-HOLD (v0.4.19; b0's day audit 2026-11-11, Firefox: "AudioParam.setValueAtTime: Can't add events during a
 * curve event"). A browser adaptation's tests: no game value is read here, only the Web Audio spec's automation rules.
 *
 * `SpecParam` models an AudioParam as Firefox runs it: no `cancelAndHoldAtTime`; `cancelScheduledValues(t)` removes the
 * events whose time is at or after `t` only, so a `setValueCurveAtTime` already running stays; and any event added at a
 * time inside a curve's span `[T, T + D)` -- or a curve whose span holds an event's time -- throws NotSupportedError
 * (the spec's rule for `setValueCurveAtTime`, which Firefox enforces). With `chrome` it also has `cancelAndHoldAtTime`.
 */
interface Ev { kind: 'set' | 'ramp' | 'target' | 'curve'; time: number; value: number; tc?: number; values?: Float32Array; duration?: number }

class SpecParam {
  events: Ev[] = [];
  calls: string[] = [];
  cancelAndHoldAtTime?: (t: number) => void;
  constructor(private readonly clock: { currentTime: number }, private intrinsic = 1, chrome = false) {
    if (chrome) {
      this.cancelAndHoldAtTime = (t: number): void => {
        this.calls.push(`cancelAndHold@${t}`);
        const v = this.at(t);
        this.events = this.events.filter((e) => e.time < t && !(e.kind === 'curve' && t < e.time + e.duration!));
        this.insert({ kind: 'set', time: t, value: v });
      };
    }
  }
  get value(): number { return this.at(this.clock.currentTime); }
  set value(v: number) { this.intrinsic = v; }
  private guard(t: number, method: string): void {
    for (const e of this.events) {
      if (e.kind === 'curve' && t >= e.time && t < e.time + e.duration!) {
        throw Object.assign(new Error(`AudioParam.${method}: Can't add events during a curve event`), { name: 'NotSupportedError' });
      }
    }
  }
  private insert(e: Ev): void { this.events.push(e); this.events.sort((a, b) => a.time - b.time); }
  setValueAtTime(value: number, time: number): void { this.calls.push(`set@${time}`); this.guard(time, 'setValueAtTime'); this.insert({ kind: 'set', time, value }); }
  linearRampToValueAtTime(value: number, time: number): void { this.calls.push(`ramp@${time}`); this.guard(time, 'linearRampToValueAtTime'); this.insert({ kind: 'ramp', time, value }); }
  setTargetAtTime(value: number, time: number, tc: number): void { this.calls.push(`target@${time}`); this.guard(time, 'setTargetAtTime'); this.insert({ kind: 'target', time, value, tc }); }
  setValueCurveAtTime(values: Float32Array, time: number, duration: number): void {
    this.calls.push(`curve@${time}`);
    this.guard(time, 'setValueCurveAtTime');
    for (const e of this.events) {
      if (e.time > time && e.time < time + duration) throw Object.assign(new Error('curve overlaps an event'), { name: 'NotSupportedError' });
    }
    this.insert({ kind: 'curve', time, value: values[0]!, values: Float32Array.from(values), duration });
  }
  cancelScheduledValues(t: number): void { this.calls.push(`cancel@${t}`); this.events = this.events.filter((e) => e.time < t); }
  /** The computed value at `t` (the spec's formulas for set, linear ramp, target and curve). */
  at(t: number): number {
    let v = this.intrinsic, from = 0;
    for (let i = 0; i < this.events.length; i++) {
      const e = this.events[i]!;
      if (e.time > t) {
        if (e.kind === 'ramp') v = v + (e.value - v) * ((t - from) / (e.time - from));
        return v;
      }
      const end = Math.min(t, this.events[i + 1]?.time ?? t);
      if (e.kind === 'set' || e.kind === 'ramp') v = e.value;
      else if (e.kind === 'target') v = e.value + (v - e.value) * Math.exp(-(end - e.time) / e.tc!);
      else {
        const vals = e.values!, n = vals.length;
        if (end >= e.time + e.duration!) v = vals[n - 1]!;
        else {
          const k = ((n - 1) * (end - e.time)) / e.duration!, k0 = Math.floor(k);
          v = vals[k0]! + (vals[Math.min(n - 1, k0 + 1)]! - vals[k0]!) * (k - k0);
        }
      }
      from = e.time;
    }
    return v;
  }
}

function fakeContext(chrome: boolean, broken?: (p: SpecParam) => void) {
  const params: SpecParam[] = [];
  const clock = { currentTime: 0 };
  const node = () => ({ connect() {}, disconnect() {} });
  class Ctx {
    state = 'running'; sampleRate = 48_000; destination = {};
    get currentTime() { return clock.currentTime; }
    createGain() {
      const gain = new SpecParam(clock, 1, chrome);
      broken?.(gain);
      params.push(gain);
      return { ...node(), gain };
    }
    createChannelSplitter() { return node(); }
    createChannelMerger() { return node(); }
    createBuffer(c: number, n: number, rate: number) { return { numberOfChannels: c, length: n, sampleRate: rate, copyToChannel() {} }; }
    createBufferSource() { return { ...node(), buffer: null, loop: false, start() {}, stop() {}, addEventListener() {} }; }
    resume(): Promise<void> { return Promise.resolve(); }
  }
  return { Ctx, params, clock };
}

const tone = (): RenderedSound => {
  const left = new Float32Array(3200).fill(0.25);
  return { left, right: left.slice(), sendLeft: null, sendRight: null, sampleRate: 32000, voices: 2, samples: [], peak: 0.25 };
};
const RELEASE = Float32Array.of(1, 0.5, 0);                      // a share of where the gain stands, 1 to 0

/** A looped bed on the fake context: its two channel gains (the first two made by `loop`). */
function bed(chrome: boolean, broken?: (p: SpecParam) => void) {
  const f = fakeContext(chrome, broken);
  const g = globalThis as unknown as { AudioContext?: unknown };
  g.AudioContext = f.Ctx;
  const out = new WebAudioOut(null, { releaseLoopSamples: false });
  out.prepare();
  const before = f.params.length;
  const handle = out.loop(tone()) as LoopHandle;
  expect(handle).not.toBeNull();
  return { ...f, out, handle, gains: f.params.slice(before, before + 2) };
}

const was = (globalThis as unknown as { AudioContext?: unknown }).AudioContext;
afterEach(() => { (globalThis as unknown as { AudioContext?: unknown }).AudioContext = was; vi.restoreAllMocks(); });

describe('a loop bed\'s automation on a param with no cancelAndHoldAtTime (Firefox; FF-AUDIO-HOLD)', () => {
  it('setGains while a release\'s curve runs adds no event inside the curve, and holds the curve\'s present value', () => {
    const b = bed(false);
    b.handle.setGains(0.8, 0.8, 0);
    b.clock.currentTime = 1;
    b.handle.release!(RELEASE, 2);                               // a curve over [1, 3)
    b.clock.currentTime = 1.5;                                   // a quarter in: 0.8 x 0.75
    for (const g of b.gains) {                                   // the precondition: the release's curve runs, at 0.6
      expect(g.events.filter((e) => e.kind === 'curve').map((e) => e.time)).toEqual([1]);
      expect(g.value).toBeCloseTo(0.6, 6);
    }
    expect(() => b.handle.setGains(0.4, 0.4, 0.3)).not.toThrow();
    for (const g of b.gains) {
      expect(g.events.some((e) => e.kind === 'curve')).toBe(false);        // the running curve is gone
      const held = g.events.find((e) => e.kind === 'set' && e.time === 1.5)!;
      expect(held.value).toBeCloseTo(0.6, 6);                              // where it stood, then the new target
      expect(g.events.at(-1)).toMatchObject({ kind: 'target', time: 1.5, value: 0.4 });
    }
  });

  it('a second release while the first release\'s curve runs starts its curve from the first\'s present value', () => {
    const b = bed(false);
    b.handle.setGains(1, 1, 0);
    b.clock.currentTime = 1;
    b.handle.release!(RELEASE, 2);
    b.clock.currentTime = 2;                                     // half way: 0.5
    expect(() => b.handle.release!(RELEASE, 2)).not.toThrow();
    for (const g of b.gains) {
      const curves = g.events.filter((e) => e.kind === 'curve');
      expect(curves).toHaveLength(1);
      expect(curves[0]!.time).toBe(2);
      expect(Array.from(curves[0]!.values!)).toEqual([0.5, 0.25, 0].map((x) => Math.fround(x)));
    }
  });

  it('a scheduling throw the fallback does not foresee costs that sound\'s automation only: warned at once, the rest tallied in one later line', () => {
    vi.useFakeTimers();
    try {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const b = bed(false, (p) => { p.setTargetAtTime = () => { throw new Error('refused'); }; });
      expect(() => b.handle.setGains(0.5, 0.5)).not.toThrow();           // two gains: two refusals
      expect(() => b.handle.setGains(0.6, 0.6)).not.toThrow();           // two more
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toMatch(/automation was dropped/);
      expect(b.out.automationRefused).toBe(4);
      vi.advanceTimersByTime(AUTOMATION_REFUSED_TALLY_SECONDS * 1000);
      expect(warn).toHaveBeenCalledTimes(2);
      expect(String(warn.mock.calls[1]![0])).toMatch(/3 more .*4 in all/);
      b.handle.setGains(0.7, 0.7);
      vi.advanceTimersByTime(10 * AUTOMATION_REFUSED_TALLY_SECONDS * 1000);
      expect(warn).toHaveBeenCalledTimes(2);                              // once per page: no third line
      expect(b.out.automationRefused).toBe(6);
    } finally { vi.useRealTimers(); }
  });

  it('a release\'s throw is caught the same way', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const b = bed(false, (p) => { p.setValueCurveAtTime = () => { throw new Error('refused'); }; });
    b.handle.setGains(1, 1, 0);
    b.clock.currentTime = 1;
    expect(() => b.handle.release!(RELEASE, 2)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('a loop bed with cancelAndHoldAtTime (Chromium): unchanged', () => {
  it('holds by cancelAndHoldAtTime at now and never cancels from an earlier time', () => {
    const b = bed(true);
    b.handle.setGains(0.8, 0.8, 0);
    b.clock.currentTime = 1;
    b.handle.release!(RELEASE, 2);
    b.clock.currentTime = 1.5;
    b.handle.setGains(0.4, 0.4, 0.3);
    for (const g of b.gains) {
      expect(g.calls).toEqual(['cancelAndHold@0', 'target@0', 'cancelAndHold@1', 'curve@1', 'cancelAndHold@1.5', 'target@1.5']);
    }
  });
});

describe('the menus\' music voice: a fade while a fade runs (FF-AUDIO-HOLD)', () => {
  it('replaces the running fade\'s curve rather than adding a curve inside it', () => {
    const f = fakeContext(false);
    const out = webAudioMusicOut(new f.Ctx() as unknown as AudioContext, {} as AudioNode);
    const voice = out.voice();
    const stage = f.params[0]!;                                  // the voice's stage, made first
    voice.fade(Float32Array.of(1, 0.5, 0), 1.5);
    f.clock.currentTime = 0.5;
    expect(() => voice.fade(Float32Array.of(1, 0.5, 0), 1.5)).not.toThrow();
    const curves = stage.events.filter((e) => e.kind === 'curve');
    expect(curves).toHaveLength(1);
    expect(curves[0]!.time).toBe(0.5);
  });
});
