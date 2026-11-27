// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebAudioOut } from '../src/audio';
import {
  LOAD_IN_COVER_ADAPTATION, LOAD_IN_DISC, LOAD_IN_FOOT, LOAD_IN_HIDDEN_PATH, LOAD_IN_STAGES, LoadInHold, loadInAt,
  loadInLobbyLinkAt, loadInPanelHtml,
} from '../src/loadIn';
import { LOBBY_LINK_COVER_ID, showLobbyLinkCover } from '../src/lobbyLinkCover';
import { frontEndMusicOut } from '../src/menuMusic';

/**
 * WM-37 (the owner's "12 b approved on both", 2026-11-15; product track, a browser adaptation, `LOAD_IN_COVER_ADAPTATION`):
 * the direct link's load-in -- its four stages read off the hidden path's screen -- and the page's sound held silent
 * while the cover stands. The controller's condition: the hold must not change WHEN the game's own first sound plays once
 * the cover is gone. So it holds by LEVEL (the front end output's level held at 0, the context running: never suspended)
 * and restores the player's level at `hide`. Fakes only: a fake AudioContext whose graph is walked for the level a
 * source is heard at, and whose clock is set by hand.
 */
const here = dirname(fileURLToPath(import.meta.url));
afterEach(() => { document.getElementById(LOBBY_LINK_COVER_ID)?.remove(); vi.useRealTimers(); });

describe('the stages, off the hidden path\'s screen', () => {
  it('four stages in order: Disc, Load, Connect, Lobby; the adaptation named', () => {
    expect(LOAD_IN_COVER_ADAPTATION).toMatch(/lobby link/);
    expect(LOAD_IN_STAGES.map((s) => s.label)).toEqual(['Disc', 'Load', 'Connect', 'Lobby']);
    expect(LOAD_IN_DISC.stage).toBe('disc');
  });

  it('the hidden path is `lobbyLinkDirect.ts`\'s own, in its order', () => {
    const src = readFileSync(resolve(here, '../src/lobbyLinkDirect.ts'), 'utf8');
    const list = /const PATH = \[([\s\S]*?)\]\.map\(uiCommandFold\)/.exec(src)![1]!;
    expect([...list.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...LOAD_IN_HIDDEN_PATH]);
  });

  it('every screen of the path maps to its stage, in order, the bar only forward; the boot (and any off-path screen) is Load; the GAME LOBBY is Lobby at 1', () => {
    expect(loadInAt(null).stage).toBe('load');
    expect(loadInAt('dlgIntroScreen.rdr').stage).toBe('load');
    expect(loadInAt('dlgMPswitch.rdr').stage).toBe('load');
    const shares = [LOAD_IN_DISC.share, loadInAt(null).share];
    for (const d of LOAD_IN_HIDDEN_PATH.slice(1)) {
      expect(loadInAt(d).stage, d).toBe('connect');
      shares.push(loadInAt(d).share);
    }
    expect(loadInAt('dlgGameLobby.rdr')).toEqual({ stage: 'lobby', share: 1 });
    shares.push(1);
    for (let i = 1; i < shares.length; i++) expect(shares[i]!, `step ${i}`).toBeGreaterThan(shares[i - 1]!);
    expect(loadInAt('DLGNETCONNECT.RDR')).toEqual(loadInAt('dlgNetConnect.rdr'));                   // the shell's names folded as the path folds them
  });

  it('drawn by the shared panel: the stage\'s words, "n of 4", the steps, the foot', () => {
    const b = document.createElement('div');
    b.innerHTML = loadInPanelHtml(loadInAt('dlgNetConnect.rdr'));
    expect(b.querySelector('.dp')).not.toBeNull();
    expect(b.querySelector('.dp__kicker')!.textContent).toBe('Direct link · 3 of 4');
    expect(b.querySelector('[data-part="line"]')!.textContent).toBe(`${LOAD_IN_STAGES[2]!.line}…`);
    expect([...b.querySelectorAll('.dp__step')].map((e) => e.className)).toEqual(['dp__step is-done', 'dp__step is-done', 'dp__step is-now', 'dp__step is-next']);
    expect(b.querySelector('.dp__foot')!.textContent).toBe(LOAD_IN_FOOT);
  });

  it('a lobby link\'s address (under the base) is the direct link\'s; anything else is not', () => {
    expect(loadInLobbyLinkAt('/online/lobby/TOwttYxGFFw', '/')).toBe(true);
    expect(loadInLobbyLinkAt('/s2u/online/lobby/TOwttYxGFFw', '/s2u/')).toBe(true);
    for (const p of ['/', '/console', '/main/online', '/online/lobby/x']) expect(loadInLobbyLinkAt(p, '/'), p).toBe(false);
  });
});

// ---- a fake AudioContext: its graph walked for the level heard, its clock set by hand --------------------------------

class FNode {
  readonly outs = new Set<FNode>();
  constructor(readonly ctx: FContext) { ctx.nodes.push(this); }
  connect(n: FNode): FNode { this.outs.add(n); return n; }
  disconnect(n?: FNode): void {
    if (n === undefined) { this.outs.clear(); return; }
    if (!this.outs.has(n)) throw new DOMException('not connected', 'InvalidAccessError');
    this.outs.delete(n);
  }
}
class FParam {
  value = 1;
  setTargetAtTime(v: number): void { this.value = v; }
  setValueAtTime(v: number): void { this.value = v; }
  linearRampToValueAtTime(v: number): void { this.value = v; }
  setValueCurveAtTime(c: Float32Array): void { this.value = c[c.length - 1] ?? this.value; }
  cancelScheduledValues(): void {}
}
class FGain extends FNode { readonly gain = new FParam(); }
class FSource extends FNode {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  addEventListener(): void {}
  stop(): void {}
  start(when?: number): void { this.ctx.starts.push({ node: this, at: Math.max(when ?? 0, this.ctx.currentTime), askedAt: this.ctx.currentTime }); }
}
class FDestination extends FNode { channelCount = 2; maxChannelCount = 2; channelCountMode = 'explicit'; channelInterpretation = 'speakers'; }
class FContext {
  static made: FContext[] = [];
  state = 'running';
  sampleRate = 48000;
  currentTime = 0;
  readonly nodes: FNode[] = [];
  readonly destination = new FDestination(this);
  readonly starts: { node: FSource; at: number; askedAt: number }[] = [];
  readonly suspend = vi.fn(async () => { this.state = 'suspended'; });
  constructor() { FContext.made.push(this); }
  createGain(): FGain { return new FGain(this); }
  createConvolver(): FNode { return new FNode(this); }
  createChannelSplitter(): FNode { return new FNode(this); }
  createChannelMerger(): FNode { return new FNode(this); }
  createBufferSource(): FSource { return new FSource(this); }
  createBuffer(n: number): { numberOfChannels: number; copyToChannel(): void } { return { numberOfChannels: n, copyToChannel() {} }; }
  addEventListener(): void {}
  removeEventListener(): void {}
  resume(): Promise<void> { this.state = 'running'; return Promise.resolve(); }
  /** The nodes that feed the destination straight. */
  feeders(): FNode[] { return this.nodes.filter((n) => n.outs.has(this.destination)); }
  /** The level `from` is heard at: every path to the destination, the product of its gains, summed. */
  heard(from: FNode): number {
    const walk = (n: FNode, seen: Set<FNode>): number => {
      if (n === this.destination) return 1;
      if (seen.has(n)) return 0;
      const k = n instanceof FGain ? n.gain.value : 1;
      let sum = 0;
      for (const o of n.outs) sum += walk(o, new Set([...seen, n]));
      return k * sum;
    };
    return walk(from, new Set());
  }
}

const SOUND = { left: new Float32Array(480), right: new Float32Array(480), sampleRate: 48000, sendLeft: null, sendRight: null } as never;

/** The front end's output as `../src/frontEnd.ts` makes it (`new WebAudioOut(null, ...)`), prepared, on a fake context. */
function frontEndOut(): { out: WebAudioOut; ctx: FContext } {
  const old = globalThis.AudioContext;
  Object.assign(globalThis, { AudioContext: FContext });
  try {
    const out = new WebAudioOut(null, { releaseLoopSamples: false });
    out.prepare();
    return { out, ctx: FContext.made[FContext.made.length - 1]! };
  } finally { Object.assign(globalThis, { AudioContext: old }); }
}
/** A menu button sound (the output's `play`, as `GameAudio` plays a cue): its start and the level it is heard at. */
const button = (out: WebAudioOut, ctx: FContext): { at: number; level: number } => {
  out.play(SOUND);
  const s = ctx.starts[ctx.starts.length - 1]!;
  return { at: s.at, level: ctx.heard(s.node) };
};
/** A piece of the menu music (`./menuMusic` `frontEndMusicOut`, the front end's music on the same output). */
const music = (out: WebAudioOut, ctx: FContext): { at: number; level: number } => {
  frontEndMusicOut(out)()!.voice().play(new Float32Array(480), new Float32Array(480), 48000, ctx.currentTime);
  const s = ctx.starts[ctx.starts.length - 1]!;
  return { at: s.at, level: ctx.heard(s.node) };
};

describe('the silence: held by level, never by the clock (the controller\'s condition)', () => {
  it('1. under the cover a menu button sound and the menu music are inaudible; the context runs (never suspended); nothing queued plays at the reveal', () => {
    vi.useFakeTimers();
    const { out, ctx } = frontEndOut();
    const cover = showLobbyLinkCover(document);
    cover.stage('dlgNetLogin.rdr', out);
    expect(document.getElementById(LOBBY_LINK_COVER_ID)!.dataset['sound']).toBe('held');
    ctx.currentTime = 2;
    const b = button(out, ctx), m = music(out, ctx);
    expect([b.level, m.level]).toEqual([0, 0]);
    expect([b.at, m.at]).toEqual([2, 2]);                                      // played in its own time, silent: not queued
    expect(ctx.suspend).not.toHaveBeenCalled();
    expect(ctx.state).toBe('running');
    const before = ctx.starts.length;
    ctx.currentTime = 5;
    cover.hide();
    expect(ctx.starts.length, 'no sound started by the reveal (no burst)').toBe(before);
    expect(ctx.suspend).not.toHaveBeenCalled();
  });

  it('2. THE CONDITION: the first sound after hide starts at the same context time, at the same level, as with no cover at all', () => {
    vi.useFakeTimers();
    const plain = frontEndOut();
    plain.ctx.currentTime = 5;
    const want = { button: button(plain.out, plain.ctx), music: music(plain.out, plain.ctx) };

    const held = frontEndOut();
    const cover = showLobbyLinkCover(document);
    for (const [t, d] of [[0, null], [1, 'dlgNetLogin.rdr'], [3, 'dlgWorldOfSOCOM.rdr'], [4.9, 'dlgGameLobby.rdr']] as const) {
      held.ctx.currentTime = t;
      cover.stage(d, held.out);
    }
    held.ctx.currentTime = 5;
    cover.hide();
    expect({ button: button(held.out, held.ctx), music: music(held.out, held.ctx) }).toEqual(want);
    expect(want.button.level).toBeGreaterThan(0);
  });

  it('3. a volume change made while covered is the level after the reveal', () => {
    vi.useFakeTimers();
    const plain = frontEndOut();
    plain.out.setGain(0.3);
    const want = button(plain.out, plain.ctx).level;

    const held = frontEndOut();
    const cover = showLobbyLinkCover(document);
    cover.stage('dlgNetLogin.rdr', held.out);
    held.out.setGain(0.3);                                                   // the player's master, changed under the cover
    expect(button(held.out, held.ctx).level).toBe(0);
    cover.stage('dlgNetConnect.rdr', held.out);
    cover.hide();
    expect(button(held.out, held.ctx).level).toBeCloseTo(want, 12);
    expect(want).toBeGreaterThan(0);
  });

  it('4. no cover (an ordinary launch): nothing held -- levels and times as today; a cover gone leaves the graph as it found it', () => {
    vi.useFakeTimers();
    const plain = frontEndOut();
    plain.ctx.currentTime = 5;
    const today = button(plain.out, plain.ctx);
    expect(today.level).toBeGreaterThan(0);
    expect(plain.ctx.feeders()).toHaveLength(1);                             // the output's master, straight into the destination

    const held = frontEndOut();
    const master = held.ctx.feeders();
    const cover = showLobbyLinkCover(document);
    cover.stage('dlgNetLogin.rdr', held.out);
    expect(held.ctx.feeders()).not.toEqual(master);                          // held: the master no longer feeds it straight
    held.ctx.currentTime = 5;
    cover.hide();
    cover.hide();                                                            // a second hide does nothing
    expect(held.ctx.feeders()).toEqual(master);                              // the same master, straight in again; no node of the hold left
    expect(button(held.out, held.ctx)).toEqual(today);
  });

  it('the hold itself: idempotent, once released never again; an output with no context yet is held when it has one', () => {
    const hold = new LoadInHold();
    expect(hold.hold(null)).toBe(false);
    const { out, ctx } = frontEndOut();
    expect(hold.hold(out)).toBe(true);
    expect(hold.hold(out)).toBe(true);
    ctx.currentTime = 1;
    expect(button(out, ctx).level).toBe(0);
    hold.release();
    expect(button(out, ctx).level).toBeGreaterThan(0);
    expect(hold.hold(out)).toBe(false);
    expect(button(out, ctx).level).toBeGreaterThan(0);
  });
});
