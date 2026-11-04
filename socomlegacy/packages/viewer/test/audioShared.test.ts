import { afterEach, describe, expect, it } from 'vitest';
import { roundStreamGains, type RenderedSound } from '@s2u/sound';
import { WebAudioOut } from '../src/audio';

/**
 * MATCH-SOUND (web research 222 §7): the front end's match plays on the front end's own `AudioContext` -- one context,
 * running since the menus' activation (the disc page's click), no second gesture -- through an output of its own on it
 * (`new WebAudioOut(shared)`): its own master, reverb bus and music slot, so the match's gain, reverb and round music
 * never touch the menus' (their HUDUI one-shots, their music slot). A fake context; no browser is run.
 */

interface FakeNode { kind: string; to: unknown[]; disconnected: number; gain?: { value: number }; started?: number | null; stopped?: number | null; buffer?: unknown; onended?: (() => void) | null }
class Ctx {
  static made: Ctx[] = [];
  state = 'running'; sampleRate = 48_000; currentTime = 0; destination = { kind: 'destination' };
  readonly nodes: FakeNode[] = [];
  readonly listeners: (() => void)[] = [];
  closed = 0;
  constructor() { Ctx.made.push(this); }
  private node(kind: string, extra: Partial<FakeNode> = {}): FakeNode & { connect(n: unknown): void; disconnect(): void } {
    const n = { kind, to: [] as unknown[], disconnected: 0, ...extra, connect(t: unknown) { n.to.push(t); }, disconnect() { n.disconnected++; n.to = []; } };
    this.nodes.push(n);
    return n;
  }
  createGain() {
    return this.node('gain', { gain: Object.assign({ value: 1 }, { setTargetAtTime(this: { value: number }, v: number) { this.value = v; }, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, setValueCurveAtTime() {} }) });
  }
  createChannelSplitter() { return this.node('split'); }
  createChannelMerger() { return this.node('merge'); }
  createBuffer(_c: number, n: number, rate: number) { return { numberOfChannels: 2, length: n, sampleRate: rate, copyToChannel() {} }; }
  createBufferSource() {
    const n = this.node('source', { started: null, stopped: null, buffer: null, onended: null });
    return Object.assign(n, { start(w = 0) { n.started = w; }, stop(w = 0) { n.stopped ??= w; } });
  }
  addEventListener(_t: string, fn: () => void) { this.listeners.push(fn); }
  removeEventListener(_t: string, fn: () => void) { const i = this.listeners.indexOf(fn); if (i >= 0) this.listeners.splice(i, 1); }
  resume(): Promise<void> { return Promise.resolve(); }
  close(): Promise<void> { this.closed++; return Promise.resolve(); }
}
const g = globalThis as unknown as { AudioContext?: unknown };
const was = g.AudioContext;
const tone = (n = 480): RenderedSound => {
  const left = new Float32Array(n).fill(0.1);
  return { left, right: left.slice(), sendLeft: null, sendRight: null, sampleRate: 48_000, voices: 2, samples: [], peak: 0.1 };
};
const sources = (c: Ctx): FakeNode[] => c.nodes.filter((n) => n.kind === 'source');
afterEach(() => { g.AudioContext = was; Ctx.made = []; });

describe('WebAudioOut on another output\'s context (MATCH-SOUND: one AudioContext for the menus and the match)', () => {
  it('makes no second context: the shared one, prepared by the first, running as it runs', () => {
    g.AudioContext = Ctx;
    const menus = new WebAudioOut(), match = new WebAudioOut(menus);
    match.prepare();
    expect(Ctx.made).toHaveLength(1);                                    // the menus' context, made for the match's prepare
    expect(menus.ready).toBe(true);
    expect(match.ready).toBe(true);
    expect(match.unlocked).toBe(true);                                   // running already: no gesture asked
    expect(match.state).toBe('running');
  });

  it('its own master on the context: the match\'s gain never moves the menus\'', () => {
    g.AudioContext = Ctx;
    const menus = new WebAudioOut();
    menus.prepare();
    const c = Ctx.made[0]!;
    const before = c.nodes.length;
    const match = new WebAudioOut(menus);
    match.prepare();
    const mine = c.nodes.slice(before).filter((n) => n.kind === 'gain' && n.to.includes(c.destination));
    expect(mine).toHaveLength(1);                                        // a master of its own, to the speakers
    const menusMaster = c.nodes.slice(0, before).find((n) => n.kind === 'gain' && n.to.includes(c.destination))!;
    const level = menusMaster.gain!.value;
    match.setGain(0.25);
    expect(mine[0]!.gain!.value).toBe(0.25);
    expect(menusMaster.gain!.value).toBe(level);
  });

  it('its own music slot: the match\'s round music and the menus\' slot stop each other never', () => {
    g.AudioContext = Ctx;
    const menus = new WebAudioOut(), match = new WebAudioOut(menus);
    menus.prepare(); match.prepare();
    const c = Ctx.made[0]!;
    const gains = roundStreamGains(1, 2);
    menus.playMusic(tone(), 0, gains);
    match.playMusic(tone(), 0, gains);
    const [a, b] = sources(c);
    match.stopMusic();
    expect(b!.stopped).not.toBeNull();
    expect(a!.stopped).toBeNull();                                       // the menus' slot sounds on
    match.playMusic(tone(), 0, gains);
    menus.stopMusic();
    expect(a!.stopped).not.toBeNull();
    expect(sources(c)[2]!.stopped).toBeNull();
  });

  it('dispose: its slot stopped and its nodes off the shared context, which stays open for the menus', () => {
    g.AudioContext = Ctx;
    const menus = new WebAudioOut(), match = new WebAudioOut(menus);
    match.prepare();
    const c = Ctx.made[0]!;
    match.playMusic(tone(), 0, roundStreamGains(1, 2));
    const mine = c.nodes.filter((n) => n.kind === 'gain' && n.to.includes(c.destination)).at(-1)!;
    const listening = c.listeners.length;
    match.dispose();
    expect(sources(c)[0]!.stopped).not.toBeNull();
    expect(mine.disconnected).toBeGreaterThan(0);
    expect(c.listeners.length).toBe(listening - 1);                      // its statechange listener gone
    expect(c.closed).toBe(0);
    expect(match.ready).toBe(false);
    expect(menus.unlocked).toBe(true);
  });
  it('dispose is terminal (FE-SWEEP): a disposed output prepared or played again builds nothing on the shared context and adds no listener', () => {
    g.AudioContext = Ctx;
    const menus = new WebAudioOut(), match = new WebAudioOut(menus);
    match.prepare();
    const c = Ctx.made[0]!;
    expect(c.listeners).toHaveLength(2);                                 // the menus' and the match's
    match.dispose();
    expect(c.listeners).toHaveLength(1);
    const nodes = c.nodes.length;
    match.prepare();
    match.unlock();
    match.play(tone());
    match.playMusic(tone(), 0, roundStreamGains(1, 1));
    match.playStream(tone(), roundStreamGains(1, 1));
    expect(match.loop(tone())).toBeNull();
    match.setReverb(null);
    expect(c.listeners).toHaveLength(1);                                 // no statechange listener left behind
    expect(c.nodes.length).toBe(nodes);                                  // no new master, no source on the menus' context
    expect(match.ready).toBe(false);
    expect(Ctx.made).toHaveLength(1);
    expect(menus.unlocked).toBe(true);
  });
});
