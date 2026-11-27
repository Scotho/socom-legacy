import { afterEach, describe, expect, it, vi } from 'vitest';
import { roundStreamGains, type RenderedSound, type ReverbImpulse, type MixOutputAllocator } from '@s2u/sound';
import { WebAudioOut } from '../src/audio';

// Browser resource ownership: completed voices release their private graph while the shared mix/reverb survives.
class Node {
  readonly outputs = new Set<Node>();
  readonly connections: { to: Node; output: number; input: number }[] = [];
  splitterChannels = 0;
  buffer: ReturnType<Context['createBuffer']> | null = null;
  onended: (() => void) | null = null;
  readonly endedListeners: (() => void)[] = [];
  starts = 0; stops = 0;
  failStart = false;
  detachOnStart = false;
  readonly gain = { value: 1, setTargetAtTime() {}, cancelScheduledValues() {}, setValueAtTime() {},
    linearRampToValueAtTime() {}, setValueCurveAtTime() {}, cancelAndHoldAtTime() {} };
  connect(to: Node, output = 0, input = 0): void { this.outputs.add(to); this.connections.push({ to, output, input }); }
  disconnect(): void { this.outputs.clear(); this.connections.length = 0; }
  addEventListener(_type: string, listener: () => void): void { this.endedListeners.push(listener); }
  start(): void {
    this.starts++; if (this.failStart) throw new Error('Start refused');
    if (this.detachOnStart) for (const channel of this.buffer!.channels) structuredClone(channel.buffer, { transfer: [channel.buffer] });
  }
  stop(): void { this.stops++; } // Deliberately no ended delivery: a suspended/closing context need not dispatch now.
  end(): void { this.onended?.(); for (const listener of this.endedListeners.splice(0)) listener(); }
}
class Context {
  static current: Context;
  readonly nodes: Node[] = [];
  readonly sources: Node[] = [];
  readonly destination = new Node();
  state = 'running'; sampleRate = 48000; currentTime = 0; closed = false;
  failNextStart = false;
  detachOnStart = false; copies = 0;
  constructor() { Context.current = this; }
  node(): Node { const n = new Node(); this.nodes.push(n); return n; }
  createGain(): Node { return this.node(); }
  createChannelSplitter(channels = 6): Node { const n = this.node(); n.splitterChannels = channels; return n; }
  createChannelMerger(): Node { return this.node(); }
  createConvolver(): Node { return this.node(); }
  createBufferSource(): Node { const n = this.node(); n.failStart = this.failNextStart; n.detachOnStart = this.detachOnStart; this.failNextStart = false; this.sources.push(n); return n; }
  createBuffer(numberOfChannels: number, length: number, sampleRate: number) {
    const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
    const ctx = this;
    return { numberOfChannels, length, sampleRate, channels,
      copyToChannel(data: Float32Array, channel: number) { ctx.copies++; channels[channel]!.set(data); },
      getChannelData(channel: number) { return channels[channel]!; } };
  }
  addEventListener(): void {}
  removeEventListener(): void {}
  close(): Promise<void> { this.closed = true; return Promise.resolve(); }
}
const tone = (send: boolean): RenderedSound => ({ left: Float32Array.of(0.1, -0.2), right: Float32Array.of(0.3, -0.4),
  sendLeft: send ? Float32Array.of(0.01, -0.02) : null, sendRight: send ? Float32Array.of(0.03, -0.04) : null,
  sampleRate: 48000, voices: 2, samples: [], peak: 0.4 });
const impulse: ReverbImpulse = { ll: Float32Array.of(1, 0.5), lr: Float32Array.of(0, 0.1),
  rl: Float32Array.of(0, 0.1), rr: Float32Array.of(1, 0.5), sampleRate: 48000 };
afterEach(() => vi.unstubAllGlobals());
function prepared(completedBufferBytes = 0, directMix = false, shareLoopSend = false, releaseLoopSamples = false, shareShotSend = false, recycleDirect = false) {
  vi.stubGlobal('AudioContext', Context);
  const out = new WebAudioOut(null, { releaseLoopSamples, completedBufferBytes, directMix, shareLoopSend, shareShotSend, recycleDirect }); out.prepare(); out.setReverb(impulse);
  // Warm the persistent group bus before measuring private voice resources.
  out.play(tone(false)); Context.current.sources.at(-1)!.end();
  return { out, ctx: Context.current };
}
const connected = (ctx: Context): number => ctx.nodes.filter(n => n.outputs.size > 0).length;

describe('audio voice resource ownership', () => {
  it.each(['left', 'right', 'sendLeft', 'sendRight'] as const)('falls back for an allocator channel replaced in place: %s', key => {
    for (const shared of [false, true]) {
      const { out, ctx } = prepared(0, true, false, false, shared);
      const external = Float32Array.of(0.25, -0.5); let original: Float32Array | null | undefined;
      out.playGenerated(output => {
        const c = output!(2, true, 48000, shared)!; original = c[key]; c[key] = external;
        return { ...tone(true), ...c };
      }, 0, true);
      const source = ctx.sources.at(-1)!, index = { left: 0, right: 1, sendLeft: 2, sendRight: 3 }[key];
      expect(source.buffer!.numberOfChannels).toBe(4);
      expect(source.buffer!.channels[index]).toEqual(external);
      expect(source.buffer!.channels[index]).not.toBe(original);
      source.end(); expect(external).toEqual(Float32Array.of(0.25, -0.5)); out.dispose();
    }
  });
  it('preserves retained generator views without an explicit transient-output ownership promise', () => {
    const { out, ctx } = prepared(1024, true, false, false, false, true);
    let retained: Float32Array | undefined;
    out.playGenerated(output => { const c = output!(2, true, 48000)!; c.left.fill(0.25); retained = c.left; return { ...tone(true), ...c }; });
    const source = ctx.sources.at(-1)!, buffer = source.buffer; source.end();
    out.playGenerated(output => { const c = output!(2, true, 48000)!; c.left.fill(0.75); return { ...tone(true), ...c }; });
    expect(ctx.sources.at(-1)!.buffer).not.toBe(buffer); expect(retained).toEqual(Float32Array.of(0.25, 0.25)); out.dispose();
  });
  it.each([false, true])('reuses naturally completed direct buffers with shared send %s, keeping overlaps exclusive', shared => {
    const { out, ctx } = prepared(1024, true, false, false, shared, true), baseline = connected(ctx);
    const render = (value: number) => (output?: MixOutputAllocator): RenderedSound => {
      const c = output!(2, true, 48000, shared)!;
      for (const a of new Set([c.left, c.right, c.sendLeft!, c.sendRight!])) a.fill(value);
      return { ...tone(true), ...c };
    };
    out.playGenerated(render(0.25), 0, true); const a = ctx.sources.at(-1)!, buffer = a.buffer!;
    out.playGenerated(render(0.5), 0, true); const b = ctx.sources.at(-1)!;
    expect(b.buffer).not.toBe(buffer); a.end();
    expect(out.playGenerated(render(-0.25), 0, true)).toEqual({ seconds: 2 / 48000, voices: 2 });
    expect(ctx.sources.at(-1)!.buffer).toBe(buffer);
    expect(buffer.channels.every(c => c.every(v => v === -0.25))).toBe(true);
    expect(b.buffer!.channels.every(c => c.every(v => v === 0.5))).toBe(true);
    out.stopTransient(); expect(connected(ctx)).toBe(baseline); out.dispose();
  });
  it('direct reuse excludes stopped, failed and abandoned allocations and never rerenders', () => {
    const { out, ctx } = prepared(1024, true, false, false, false, true), baseline = connected(ctx);
    const render = vi.fn((output?: MixOutputAllocator) => ({ ...tone(true), ...output!(2, true, 48000)! }));
    out.playGenerated(render, 0, true); const first = ctx.sources.at(-1)!, stopped = first.buffer;
    const late = first.onended!; out.stopTransient(); late();
    out.playGenerated(render, 0, true); const natural = ctx.sources.at(-1)!, completed = natural.buffer;
    expect(completed).not.toBe(stopped); natural.end();
    ctx.failNextStart = true; expect(() => out.playGenerated(render, 0, true)).toThrow('Start refused');
    out.playGenerated(render, 0, true); expect(ctx.sources.at(-1)!.buffer).not.toBe(completed);
    expect(render).toHaveBeenCalledTimes(4); out.stopTransient();
    const rejected = vi.fn((output?: MixOutputAllocator) => { output!(2, true, 48000); throw new Error('Render refused'); });
    expect(() => out.playGenerated(rejected, 0, true)).toThrow('Render refused'); expect(rejected).toHaveBeenCalledOnce();
    expect(connected(ctx)).toBe(baseline); out.dispose();
  });
  it('direct reuse requires exact shape and respects the completed byte cap', () => {
    for (const budget of [0, 8, 32]) {
      const { out, ctx } = prepared(budget, true, false, false, false, true);
      const render = (frames = 2, rate = 48000, send = true) => (output?: MixOutputAllocator): RenderedSound =>
        ({ ...tone(send), ...output!(frames, send, rate)!, sampleRate: rate });
      out.playGenerated(render(), 0, true); const a = ctx.sources.at(-1)!, buffer = a.buffer; a.end();
      for (const sound of [render(1), render(2, 24000), render(2, 48000, false)]) {
        out.playGenerated(sound, 0, true); expect(ctx.sources.at(-1)!.buffer).not.toBe(buffer);
      }
      out.playGenerated(render(), 0, true); expect(ctx.sources.at(-1)!.buffer === buffer).toBe(budget === 32);
      out.dispose();
    }
  });
  it('direct allocator returns fresh zeroes even when a generator writes only part of a reused buffer', () => {
    const { out, ctx } = prepared(1024, true, false, false, false, true);
    out.playGenerated(output => {
      const c = output!(2, true, 48000)!; for (const a of [c.left, c.right, c.sendLeft!, c.sendRight!]) a.fill(0.75);
      return { ...tone(true), ...c };
    }, 0, true);
    const first = ctx.sources.at(-1)!, buffer = first.buffer; first.end();
    out.playGenerated(output => { const c = output!(2, true, 48000)!; c.left[0] = 0.25; return { ...tone(true), ...c }; }, 0, true);
    expect(ctx.sources.at(-1)!.buffer).toBe(buffer);
    expect(buffer!.channels.map(c => Array.from(c))).toEqual([[0.25, 0], [0, 0], [0, 0], [0, 0]]); out.dispose();
  });
  it('does not recycle allocated direct channels when the generator returns replacement storage', () => {
    const { out, ctx } = prepared(1024, true, false, false, false, true);
    const replacement = tone(true); let abandoned: Float32Array | undefined;
    const render = vi.fn((output?: MixOutputAllocator) => { abandoned = output!(2, true, 48000)!.left; return replacement; });
    out.playGenerated(render, 0, true); expect(render).toHaveBeenCalledOnce(); ctx.sources.at(-1)!.end();
    out.playGenerated(output => { const c = output!(2, true, 48000)!; expect(c.left).not.toBe(abandoned); return { ...tone(true), ...c }; }, 0, true);
    expect(replacement.left).toEqual(tone(true).left); out.dispose();
  });
  it('uses two physical channels for proven identical generated sends and releases both routes', () => {
    const { out, ctx } = prepared(0, true, false, false, true), baseline = connected(ctx), copies = ctx.copies;
    const summary = out.playGenerated(output => {
      const channels = output!(2, true, 48000, true)!;
      expect(channels.sendLeft).toBe(channels.left); expect(channels.sendRight).toBe(channels.right);
      channels.left.set([0.25, -0.5]); channels.right.set([0.5, -0.25]);
      return { ...tone(true), ...channels };
    });
    // LATER 1218 (merged, XBOX-INTEGRATE): the one-shot's gain node (its stop ramp) sits between the source and the split.
    const source = ctx.sources.at(-1)!, gain = [...source.outputs][0]!, split = [...gain.outputs][0]!;
    expect(source.buffer!.numberOfChannels).toBe(2); expect(split.splitterChannels).toBe(2);
    expect(split.connections.map(c => c.output)).toEqual([0, 1, 0, 1]);
    expect(source.buffer!.channels.map(c => Array.from(c))).toEqual([[0.25, -0.5], [0.5, -0.25]]);
    expect(summary).toEqual({ seconds: 2 / 48000, voices: 2 }); expect(ctx.copies).toBe(copies);
    source.end(); expect(source.buffer).toBeNull(); expect(connected(ctx)).toBe(baseline); out.dispose();
  });
  it('keeps generated sends separate without the explicit proof or when sharing is disabled', () => {
    for (const [enabled, hint] of [[false, true], [true, false], [true, undefined]] as const) {
      const { out, ctx } = prepared(0, true, false, false, enabled);
      out.playGenerated(output => ({ ...tone(true), ...output!(2, true, 48000, hint)! }));
      expect(ctx.sources.at(-1)!.buffer!.numberOfChannels).toBe(4); out.dispose();
    }
  });
  it('preserves shared generated duration on detachment and cleans failed starts', () => {
    const { out, ctx } = prepared(1024, true, false, false, true), baseline = connected(ctx);
    const render = vi.fn((output?: MixOutputAllocator) => ({ ...tone(true), ...output!(2, true, 48000, true)! }));
    ctx.detachOnStart = true;
    expect(out.playGenerated(render)).toEqual({ seconds: 2 / 48000, voices: 2 });
    out.stopTransient(); expect(connected(ctx)).toBe(baseline); ctx.detachOnStart = false;
    ctx.failNextStart = true; expect(() => out.playGenerated(render)).toThrow('Start refused');
    expect(render).toHaveBeenCalledTimes(2); expect(ctx.sources.at(-1)!.buffer).toBeNull();
    expect(connected(ctx)).toBe(baseline); out.dispose();
  });
  it('stores identical loop send/dry pairs once while preserving four warm steps and both routes', () => {
    const { out, ctx } = prepared(0, false, true), sound = tone(true), copies = ctx.copies, baseline = connected(ctx);
    sound.sendLeft = sound.left.slice(); sound.sendRight = sound.right.slice();
    expect([out.warm(sound), out.warm(sound), out.warm(sound), out.warm(sound)]).toEqual([false, false, false, true]);
    expect(ctx.copies - copies).toBe(2);
    const loop = out.loop(sound)!, source = ctx.sources.at(-1)!, split = [...source.outputs][0]!;
    expect(source.buffer!.numberOfChannels).toBe(2); expect(split.splitterChannels).toBe(2);
    expect(split.connections.map(c => c.output)).toEqual([0, 1, 0, 1]);
    loop.stop(); expect(connected(ctx)).toBe(baseline); out.dispose();
  });
  it('keeps different sends and disabled sharing as four-channel loop buffers', () => {
    for (const enabled of [false, true]) {
      const { out, ctx } = prepared(0, false, enabled), sound = tone(true);
      if (!enabled) { sound.sendLeft = sound.left.slice(); sound.sendRight = sound.right.slice(); }
      out.loop(sound); expect(ctx.sources.at(-1)!.buffer!.numberOfChannels).toBe(4); out.dispose();
    }
  });
  it.each([2, 3])('expands safely if the send changes at warm step %s', (step) => {
    const { out, ctx } = prepared(0, false, true), sound = tone(true);
    sound.sendLeft = sound.left.slice(); sound.sendRight = sound.right.slice();
    const dryLeft = sound.left.slice(), dryRight = sound.right.slice();
    for (let i = 0; i < step; i++) expect(out.warm(sound)).toBe(false);
    const changed = step === 2 ? sound.sendLeft : sound.sendRight; changed[0] = 0.75;
    // The stored dry channels must keep the values copied on the earlier calls.
    sound.left.fill(0.9); sound.right.fill(0.8);
    out.loop(sound); const buffer = ctx.sources.at(-1)!.buffer!;
    expect(buffer.numberOfChannels).toBe(4); expect(buffer.channels[0]).toEqual(dryLeft); expect(buffer.channels[1]).toEqual(dryRight);
    expect(buffer.channels[step]).toEqual(changed); if (step === 3) expect(buffer.channels[2]).toEqual(dryLeft);
    out.dispose();
  });
  it('shares a released loop across outputs with and without reverb, including a partial warm-up', () => {
    const { out: owner, ctx } = prepared(0, false, false), sound = tone(true);
    sound.sendLeft = sound.left.slice(); sound.sendRight = sound.right.slice();
    expect(owner.warm(sound)).toBe(false);
    const wet = new WebAudioOut(owner, { releaseLoopSamples: true, shareLoopSend: true }); wet.prepare(); wet.setReverb(impulse);
    wet.loop(sound); const shared = ctx.sources.at(-1)!.buffer!;
    expect(shared.numberOfChannels).toBe(2); expect(sound.left.length).toBe(0); expect(sound.sendLeft).toBeNull();
    owner.loop(sound); const adopted = ctx.sources.at(-1)!;
    expect(adopted.buffer).toBe(shared); expect([...adopted.outputs][0]!.connections.map(c => c.output)).toEqual([0, 1, 0, 1]);
    const dry = new WebAudioOut(owner, { releaseLoopSamples: true }); dry.prepare(); dry.loop(sound);
    expect(ctx.sources.at(-1)!.buffer).toBe(shared); expect([...ctx.sources.at(-1)!.outputs][0]!.connections.map(c => c.output)).toEqual([0, 1]);
    dry.dispose(); wet.dispose(); owner.dispose(); expect(connected(ctx)).toBe(0);
  });
  it('plays the supplied native mix channels directly with identical routing and no channel copy', () => {
    const { out, ctx } = prepared(0, true), copies = ctx.copies, sound = tone(true), baseline = connected(ctx);
    const render = vi.fn((output?: MixOutputAllocator) => {
      const channels = output!(2, true, 48000)!;
      for (const key of ['left', 'right', 'sendLeft', 'sendRight'] as const) channels[key]!.set(sound[key]!);
      return { ...sound, ...channels };
    });
    const summary = out.playGenerated(render, 0), source = ctx.sources.at(-1)!;
    expect(render).toHaveBeenCalledOnce(); expect(ctx.copies).toBe(copies);
    expect(source.buffer!.channels[0]).toBe(render.mock.results[0]!.value.left);
    expect(source.buffer!.channels.map(c => Array.from(c))).toEqual([sound.left, sound.right, sound.sendLeft!, sound.sendRight!].map(c => Array.from(c)));
    expect(summary).toEqual({ seconds: 2 / 48000, voices: 2 }); source.end();
    expect(connected(ctx)).toBe(baseline); out.dispose();
  });
  it('records duration before playback may detach the supplied channel views', () => {
    const { out, ctx } = prepared(0, true); ctx.detachOnStart = true;
    const summary = out.playGenerated(output => ({ ...tone(false), ...output!(2, false, 48000)! }));
    expect(summary).toEqual({ seconds: 2 / 48000, voices: 2 }); out.dispose();
  });
  it('renders once and uses ordinary playback when direct mixing is disabled or the provider is not used', () => {
    for (const enabled of [false, true]) {
      const { out, ctx } = prepared(0, enabled), copies = ctx.copies, render = vi.fn(() => tone(true));
      out.playGenerated(render); expect(render).toHaveBeenCalledOnce(); expect(ctx.copies - copies).toBe(4); out.dispose();
    }
  });
  it('does not replay rendering after failure or recycle direct buffers through the pool', () => {
    const { out, ctx } = prepared(1024, true), baseline = connected(ctx);
    const render = vi.fn((output?: MixOutputAllocator) => ({ ...tone(true), ...output!(2, true, 48000)! }));
    out.playGenerated(render); const first = ctx.sources.at(-1)!, buffer = first.buffer; first.end();
    out.play(tone(true)); expect(ctx.sources.at(-1)!.buffer).not.toBe(buffer); out.stopTransient();
    ctx.failNextStart = true; expect(() => out.playGenerated(render)).toThrow('Start refused');
    expect(render).toHaveBeenCalledTimes(2); expect(connected(ctx)).toBe(baseline); out.dispose();
  });
  it('preserves custom playback overrides, including when the direct option is enabled', () => {
    const { out, ctx } = prepared(0, true), original = out.play.bind(out), calls: number[] = [];
    out.play = (sound, group) => { calls.push(sound.left.length); return original(sound, group); };
    const render = vi.fn(() => tone(true)), copies = ctx.copies;
    out.playGenerated(render); expect(calls).toEqual([2]); expect(ctx.copies - copies).toBe(4);
    expect(render).toHaveBeenCalledExactlyOnceWith(); out.dispose();
  });
  it('declines direct storage without a convolver, and renders once without a context', () => {
    const { out, ctx } = prepared(0, true); out.setReverb(null); const copies = ctx.copies;
    const render = vi.fn((output?: MixOutputAllocator) => { expect(output!(2, true, 48000)).toBeUndefined(); return tone(true); });
    out.playGenerated(render); expect(render).toHaveBeenCalledOnce(); expect(ctx.copies - copies).toBe(2);
    out.dispose(); const disposed = vi.fn(() => tone(false)); out.playGenerated(disposed);
    expect(disposed).toHaveBeenCalledExactlyOnceWith();
  });
  it('does not rerender on allocation failure and keeps nested generation ownership separate', () => {
    const { out, ctx } = prepared(0, true), render = vi.fn((output?: MixOutputAllocator) => ({ ...tone(false), ...output!(2, false, 48000)! }));
    const original = ctx.createBuffer.bind(ctx); ctx.createBuffer = () => { throw new Error('Allocation refused'); };
    expect(() => out.playGenerated(render)).toThrow('Allocation refused'); expect(render).toHaveBeenCalledOnce(); ctx.createBuffer = original;
    let outer: Float32Array | undefined, inner: Float32Array | undefined;
    out.playGenerated(output => {
      const channels = output!(2, false, 48000)!; outer = channels.left; channels.left.fill(0.25);
      out.playGenerated(inside => { const c = inside!(2, false, 48000)!; inner = c.left; c.left.fill(0.5); return { ...tone(false), ...c }; });
      return { ...tone(false), ...channels };
    });
    expect(ctx.sources.at(-1)!.buffer!.channels[0]).toBe(outer); expect(ctx.sources.at(-2)!.buffer!.channels[0]).toBe(inner);
    expect(outer).toEqual(Float32Array.of(0.25, 0.25)); expect(inner).toEqual(Float32Array.of(0.5, 0.5)); out.dispose();
  });
  it('short or empty channels retain the fresh-buffer zero tail after an earlier voice', () => {
    for (const channel of ['right', 'sendLeft', 'sendRight'] as const) {
      const { out, ctx } = prepared(1024), sound = tone(true);
      out.play(sound); ctx.sources.at(-1)!.end();
      out.play({ ...sound, [channel]: new Float32Array(0) });
      const index = { right: 1, sendLeft: 2, sendRight: 3 }[channel];
      expect(ctx.sources.at(-1)!.buffer!.channels[index]).toEqual(new Float32Array(2));
      out.dispose();
    }
  });

  it('failed start discards its acquired buffer and leaves the persistent graph alone', () => {
    const { out, ctx } = prepared(1024), baseline = connected(ctx);
    out.play(tone(true)); const first = ctx.sources.at(-1)!, buffer = first.buffer; first.end();
    ctx.failNextStart = true; expect(() => out.play(tone(true))).toThrow('Start refused');
    expect(connected(ctx)).toBe(baseline); expect(ctx.sources.at(-1)!.buffer).toBeNull();
    out.play(tone(true)); expect(ctx.sources.at(-1)!.buffer).not.toBe(buffer); out.dispose();
  });

  it('retains at most 64 idle buffers without limiting overlapping playback', () => {
    const { out, ctx } = prepared(8192), sound = tone(true), nodes: Node[] = [];
    for (let i = 0; i < 70; i++) { out.play(sound); nodes.push(ctx.sources.at(-1)!); }
    const buffers = nodes.map(n => n.buffer); for (const n of nodes) n.end();
    const used = new Set();
    for (let i = 0; i < 64; i++) { out.play(sound); used.add(ctx.sources.at(-1)!.buffer); }
    expect(used.size).toBe(64); expect(used.has(buffers[5])).toBe(false); expect(used.has(buffers[6])).toBe(true);
    out.dispose();
  });

  it('pooling excludes loop/stream buffers and late completion after disposal', () => {
    const { out, ctx } = prepared(1024), sound = tone(false);
    out.play(sound); // Drain prepared()'s warm one-shot without completing it.
    out.loop(sound); const loop = ctx.sources.at(-1)!, loopBuffer = loop.buffer;
    out.playStream(sound, roundStreamGains(2, 2)); const stream = ctx.sources.at(-1)!, streamBuffer = stream.buffer;
    loop.end(); stream.end();
    for (let i = 0; i < 3; i++) {
      out.play(sound); expect(ctx.sources.at(-1)!.buffer).not.toBe(loopBuffer); expect(ctx.sources.at(-1)!.buffer).not.toBe(streamBuffer);
    }
    const late = ctx.sources.at(-1)!.onended!; out.dispose(); late();
    const count = ctx.sources.length; out.play(sound);
    expect(ctx.sources.length).toBe(count); expect(connected(ctx)).toBe(0);
  });

  it('reuses only naturally completed one-shot storage and replaces every dry/send sample', () => {
    const { out, ctx } = prepared(1024), sound = tone(true);
    out.play(sound); const first = ctx.sources.at(-1)!, buffer = first.buffer!;
    out.play(sound); const overlapping = ctx.sources.at(-1)!;
    expect(overlapping.buffer).not.toBe(buffer);
    first.end();
    const next = { ...sound, left: Float32Array.of(-0.7, 0.8), sendRight: Float32Array.of(0, 0) };
    out.play(next); const reused = ctx.sources.at(-1)!;
    expect(reused.buffer).toBe(buffer);
    expect(reused.buffer!.channels.map(c => Array.from(c))).toEqual([next.left, next.right, next.sendLeft!, next.sendRight!].map(c => Array.from(c)));
    expect(overlapping.buffer!.channels[0]).toEqual(sound.left);
    expect(reused.starts).toBe(1); out.dispose();
  });

  it('never recycles an explicitly stopped voice, even if ended arrives later', () => {
    const { out, ctx } = prepared(1024);
    const handle = out.play(tone(true))!, first = ctx.sources.at(-1)!, buffer = first.buffer;
    handle.stop(); first.end(); out.play(tone(true));
    expect(ctx.sources.at(-1)!.buffer).not.toBe(buffer); out.dispose();
  });

  it('matches rate, channel count and exact frame count before reusing storage', () => {
    const { out, ctx } = prepared(1024), sound = tone(true);
    out.play(sound); const first = ctx.sources.at(-1)!, buffer = first.buffer; first.end();
    for (const other of [tone(false), { ...sound, sampleRate: 24000 },
      { ...sound, left: Float32Array.of(1), right: Float32Array.of(2), sendLeft: Float32Array.of(3), sendRight: Float32Array.of(4) }]) {
      out.play(other); expect(ctx.sources.at(-1)!.buffer).not.toBe(buffer);
    }
    out.play(sound); expect(ctx.sources.at(-1)!.buffer).toBe(buffer); out.dispose();
  });

  it('bounds idle sample storage and evicts the oldest completed buffer', () => {
    const { out, ctx } = prepared(32), sound = tone(true); // One four-channel, two-frame buffer.
    out.play(sound); const a = ctx.sources.at(-1)!; out.play(sound); const b = ctx.sources.at(-1)!;
    const old = a.buffer, newest = b.buffer; a.end(); b.end();
    out.play(sound); expect(ctx.sources.at(-1)!.buffer).toBe(newest);
    out.play(sound); expect(ctx.sources.at(-1)!.buffer).not.toBe(old); out.dispose();
  });

  it('does not retain an oversized completed buffer or enable reuse by default', () => {
    for (const bytes of [0, 8]) {
      const { out, ctx } = prepared(bytes); out.play(tone(true));
      const first = ctx.sources.at(-1)!, buffer = first.buffer; first.end();
      out.play(tone(true)); expect(ctx.sources.at(-1)!.buffer).not.toBe(buffer); out.dispose();
    }
  });

  it('200 completed reverb shots return to the shared graph, retaining all four sample channels while sounding', () => {
    const { out, ctx } = prepared(), baseline = connected(ctx), sound = tone(true);
    for (let i = 0; i < 200; i++) {
      out.play(sound);
      const source = ctx.sources.at(-1)!;
      expect(source.starts).toBe(1);
      expect(source.buffer!.channels.map(c => Array.from(c))).toEqual([sound.left, sound.right, sound.sendLeft!, sound.sendRight!].map(c => Array.from(c)));
      source.end();
    }
    expect(connected(ctx)).toBe(baseline);
    expect(ctx.sources.every(s => s.buffer === null)).toBe(true);
    out.dispose(); expect(connected(ctx)).toBe(0);
  });

  it('explicit shot stop and round reset release routes even without an ended event', () => {
    const { out, ctx } = prepared(), baseline = connected(ctx);
    const stopped = out.play(tone(true));
    const source = ctx.sources.at(-1)!;
    stopped!.stop(); stopped!.stop(); source.end();
    for (let i = 0; i < 20; i++) out.play(tone(true));
    out.stopTransient();
    expect(connected(ctx)).toBe(baseline);
    expect(ctx.sources.every(s => s.buffer === null)).toBe(true);
    out.dispose();
  });

  it('stopping a loop releases only that voice, retaining its shared buffer for another emitter', () => {
    const { out, ctx } = prepared(), baseline = connected(ctx), sound = tone(true);
    const first = out.loop(sound)!, source = ctx.sources.at(-1)!, shared = source.buffer;
    first.setGains(0.5, 0.75); first.stop(); first.stop();
    expect(connected(ctx)).toBe(baseline);
    expect(source.buffer).toBeNull();
    const second = out.loop(sound)!, next = ctx.sources.at(-1)!;
    expect(next.buffer).toBe(shared); expect(next.starts).toBe(1);
    second.stop(); expect(connected(ctx)).toBe(baseline);
    out.dispose();
  });

  it('stopping streams releases their matrix without waiting for asynchronous ended delivery', () => {
    const { out, ctx } = prepared();
    out.setGroupGain(2, 1);
    out.playStream(tone(false), roundStreamGains(2, 2)); ctx.sources.at(-1)!.end();
    const baseline = connected(ctx);
    for (let i = 0; i < 20; i++) out.playStream(tone(false), roundStreamGains(2, 2));
    out.stopTransient(); expect(connected(ctx)).toBe(baseline);
    expect(ctx.sources.every(s => s.buffer === null)).toBe(true);
    out.dispose();
  });

  it('disposing a shared output releases its active loop but leaves the owner context and mix alive', () => {
    const { out: owner, ctx } = prepared(), baseline = connected(ctx);
    const child = new WebAudioOut(owner, { releaseLoopSamples: false }); child.prepare(); child.setReverb(impulse);
    child.loop(tone(true)); child.dispose();
    expect(connected(ctx)).toBe(baseline); expect(ctx.closed).toBe(false);
    owner.dispose(); expect(connected(ctx)).toBe(0);
  });
});
