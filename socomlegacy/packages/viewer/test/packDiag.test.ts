import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DIAG_MESSAGE_MAX, MatchDiag, feedPackDiag, packUploadDiag, type DiagKind } from '../src/matchDiag';
import { HdServedPack, lazyHdPackDecoders } from '../src/hdTexturePackServed';
import { HdTextureRegistry } from '../src/hdTexturePack';
import type { SourcesSnapshot } from '../src/inputSources';

/**
 * B-48 (b) (SCOPE-F H1(b); product track, an instrument): the next field report of a frozen round start names its suspect
 * itself -- `contextdiag` carries the HD pack's state, its decoder's mode (a worker, or the main thread: suspect 2) and
 * `ApplyFrames.uploadStats` (the uploads and those over the frame budget: suspect 1), as `hp`.
 */
const NO_SOURCES: SourcesSnapshot = { menu: { pad: 0, key: 0, ptr: 0 }, match: { pad: 0, key: 0, ptr: 0 }, last: null, connected: 0, disconnected: 0 };
function rig() {
  const sent: [DiagKind, Record<string, unknown>, string][] = [];
  const d = new MatchDiag({
    marks: () => ({ ua: false, sraKmd: false, cls: false }), backend: () => 'webgpu', sources: () => NO_SOURCES, page: () => ({}),
    send: (kind, message) => { sent.push([kind, JSON.parse(message) as Record<string, unknown>, message]); },
  });
  return { d, sent };
}
let off: (() => void) | null = null;
afterEach(() => { off?.(); off = null; });

describe('lazyHdPackDecoders.decoderMode: where the pack decodes, once its decoder is made', () => {
  it('null before the first payload; then the decoder\'s own mode and failure', async () => {
    const decoder = { mode: 'main' as const, failure: 'Worker refused', png: async () => ({}) as never, dds: async () => ({}) as never, ktx2: async () => ({}) as never, alpha: async () => undefined as never };
    const d = lazyHdPackDecoders(async () => decoder);
    expect(d.decoderMode?.()).toBeNull();
    await d.dds!(new Uint8Array(0), { width: 1, height: 1 });
    expect(d.decoderMode?.()).toEqual({ mode: 'main', failure: 'Worker refused' });
  });
});

describe('HdServedPack.diag: the pack\'s state for the report', () => {
  it('off: the state alone, no decoder yet', () => {
    const p = new HdServedPack(async () => new Response('', { status: 404 }), () => undefined, new HdTextureRegistry());
    expect(p.diag()).toEqual({ s: 'off', dm: null, df: null, a: 0, n: 0 });
  });
  it('the decoder failure goes as a fixed code, never the raw error text (a URL or a path stays on the page)', () => {
    const make = (failure: string | null) => new HdServedPack(async () => new Response('', { status: 404 }), () => undefined, new HdTextureRegistry(), null,
      { decoderMode: () => ({ mode: 'main', failure }) });
    expect(make('the decode worker did not start: SecurityError at https://example.test/assets/w.js').diag().df).toBe('nostart');
    expect(make('the decode worker failed: C:/Users/someone/app/w.js:1 boom').diag().df).toBe('failed');
    expect(make('something else entirely /home/someone').diag().df).toBe('other');
    expect(make(null).diag().df).toBeNull();
  });
});

describe('contextdiag carries hp from the page\'s pack feed; none without one', () => {
  it('with a feed: hp in the message, under the cap', () => {
    off = feedPackDiag(() => ({ s: 'on', dm: 'main', df: 'Worker refused', a: 373, n: 374, u: 900, o: 41, lm: 812.4, lb: 33554432 }));
    const { d, sent } = rig();
    d.lost('webgpu-lost', 1000);
    const [kind, msg, raw] = sent.at(-1)!;
    expect(kind).toBe('contextdiag');
    expect(msg.hp).toEqual({ s: 'on', dm: 'main', df: 'Worker refused', a: 373, n: 374, u: 900, o: 41, lm: 812.4, lb: 33554432 });
    expect(raw.length).toBeLessThanOrEqual(DIAG_MESSAGE_MAX);
  });
  it('no feed, or one that throws: no hp', () => {
    const { d, sent } = rig();
    d.lost('webgpu-lost', 1000);
    expect(sent.at(-1)![1].hp).toBeUndefined();
    off = feedPackDiag(() => { throw new Error('gone'); });
    d.lost('webgpu-lost', 2000);
    expect(sent.at(-1)![1].hp).toBeUndefined();
  });
  it('the feed\'s strings are capped (a failure text cannot fill the report)', () => {
    off = feedPackDiag(() => ({ s: 'refused', dm: null, df: 'x'.repeat(500), a: 0, n: 0 }));
    const { d, sent } = rig();
    d.lost('webgpu-lost', 1000);
    expect(String((sent.at(-1)![1].hp as { df: string }).df).length).toBeLessThanOrEqual(40);
  });
});

describe("the mount's feed: the served pack's diag and the frames' upload stats, released with the match", () => {
  it('packUploadDiag names the four stats in the report keys', () => {
    expect(packUploadDiag({ uploads: 900, overBudget: 41, largestMs: 812.4, largestBytes: 33554432 })).toEqual({ u: 900, o: 41, lm: 812.4, lb: 33554432 });
  });
  it('matchMount sets the feed beside the chip feed and lets it go at the teardown', () => {
    const mm = readFileSync(new URL('../src/matchMount.ts', import.meta.url), 'utf8');
    expect(mm).toMatch(/const offPackDiag = feedPackDiag\(\(\) => \(hdPack \? \{ \.\.\.hdPack\.diag\(\), \.\.\.packUploadDiag\(packFrames\.uploadStats\) \} : null\)\);/);
    expect(mm).toMatch(/offPackChip\(\); offPackDiag\(\);/);
  });
});
