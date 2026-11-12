import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AssetSource } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import type { Rgba } from '@s2u/gs';
import type { DialogDesign } from '@s2u/ui';
import * as assets from '../src/frontEndAssets';
import * as menuArt from '../src/menuArt';
import { FIXTURES_ABSENT } from '../../archive/test/fixtures';

// GM-32 (plan 2026-11-01-gpu-menus, row GM-32; product track, a browser adaptation, `MENU_ART_PREFETCH_ADAPTATION`): the
// menus' art -- which the page's lookup asks BEFORE the banks (`frontEnd.ts`: `art?.(name) ?? banks?.(name)`) -- decoded
// ahead of the dialogs that draw it, off the main thread, so OPTIONS' first frame finds `multplay_back.tif` and
// `font_titlebar_01.tif` decoded (the T4 profile at 82ef1260f: planFrame -> textures (menuArt) -> decode ->
// decodeNamedTextures -> decodeTexture, 48.4 ms in the cold switch's 88.5 ms stretch). The lookup never waits on it: a
// name asked first is decoded synchronously as before and keeps its object; an answer whose decode said anything is
// left to the lookup, so `missing` is the same. Unit tests on the committed fixtures (UIMP as a dialog library, the UI
// models' UI_TXR); the decoder is the worker's own answer run in this thread (`answerUiTextureDecode`), so the bytes are
// the worker's. New exports read through the module objects, so a missing one fails its own test (the RED's counts).

const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');
const FILES = ['RUN/UI/UIMP_TXR.ZED', 'RUN/UI/UIMP_PAL.ZED', 'RUN/UI/UI_TXR.ZED', 'RUN/UI/UI_PAL.ZED', 'RUN/UI/UI_GEO.ZED', 'RUN/UI/UI_MDL.ZED'];
const PRESENT = FILES.every((p) => existsSync(resolve(FIXTURES, p)));
const SKIP = PRESENT ? '' : ` (${FIXTURES_ABSENT})`;

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE_DISC = DISC !== '' && ['RUN/UI/READERC.ZAR', 'RUN/UI/UI2D_TXR.ZED', 'RUN/UI/UI_GEO.ZED', 'RUN/COMMON/FONT_TXR.ZED'].every((f) => existsSync(join(DISC, f)));

const fixtureSource = (reads: string[] = []): AssetSource => ({
  list: async () => [],
  read: async (p) => { reads.push(p); if (!FILES.includes(p)) throw new Error(`no ${p}`); return new Uint8Array(readFileSync(resolve(FIXTURES, p))); },
});
const design: DialogDesign = {
  libraries: [{ name: 'ui/assetlib/uimp' }], usesMemcard: false, font: 'font_text_01', fontLib: false, background: null,
  bindings: [], controls: [], objects: [], scripts: [], models: [], dropped: [],
} as unknown as DialogDesign;

type Decoder = assets.UiTextureDecoder;
type Answer = Awaited<ReturnType<Decoder>>[number];
type Art = menuArt.MenuArt & { prefetch(o: { decoder: Decoder; seedKey?: (image: Rgba, h: string) => void; maxBytes?: number }): assets.UiTexturePrefetch };

/** The worker's answer, in this thread (the files copied, as a worker's structured clone copies them). */
async function inThread(): Promise<{ decoder: Decoder; jobs: { names: string[]; diagnostics: boolean | undefined }[] }> {
  const w = await import('../src/frontEndTextureBank');
  const jobs: { names: string[]; diagnostics: boolean | undefined }[] = [];
  const decoder: Decoder = async (job) => {
    jobs.push({ names: job.names.slice(), diagnostics: job.diagnostics });
    const { reply } = w.answerUiTextureDecode({ id: 0, ...job, txr: job.txr.slice(), pal: job.pal.slice() });
    if (!reply.ok) throw new Error(reply.error);
    return reply.decoded;
  };
  return { decoder, jobs };
}
const art = async (src: AssetSource = fixtureSource()): Promise<Art> => (await menuArt.readMenuArt(src, [design])) as Art;
const sameBitmap = (a: unknown, b: unknown): boolean => {
  const x = a as (Rgba & { blend?: string }) | null, y = b as (Rgba & { blend?: string }) | null;
  return !!x && !!y && x.width === y.width && x.height === y.height && x.blend === y.blend && Buffer.from(x.data).equals(Buffer.from(y.data))
    && JSON.stringify(Object.keys(x)) === JSON.stringify(Object.keys(y));
};

describe('GM-32: the menus\' art prefetched off the main thread (the lookup asks it before the banks)', () => {
  it('states its byte cap (an adaptation, no original): 16 MiB, above the art the page reads', () => {
    expect((menuArt as Record<string, unknown>).MENU_ART_PREFETCH_ADAPTATION).toEqual({ maxBytes: 16 * 1024 * 1024 });
  });

  it.skipIf(!PRESENT)(`decodes every library's names (diagnostics asked); a later ask is that object, the lookup's own bytes and blend${SKIP}`, async () => {
    const a = await art();
    expect(a.libraries).toEqual(['UIMP', 'UI']);
    const missingBefore = a.missing.slice();
    const { decoder, jobs } = await inThread();
    const got = new Map<string, Answer>();
    const seeds: [Rgba, string][] = [];
    expect(typeof a.prefetch).toBe('function');
    const pf = a.prefetch({ decoder: async (j) => { const r = await decoder(j); for (const g of r) got.set(g.name, g); return r; }, seedKey: (im, h) => { seeds.push([im, h]); } });
    expect(await pf.finished).toBeNull();
    expect(jobs.length).toBe(2);                                              // one job a library, in the libraries' order
    expect(jobs.every((j) => j.diagnostics === true)).toBe(true);
    const names = jobs.flatMap((j) => j.names);
    expect(names.length).toBeGreaterThan(10);
    expect(pf.decoded).toBe(names.length);
    expect(pf.capped).toBe(false);
    expect(pf.raced).toBe(0);
    const plain = await art();
    for (const n of names) {
      const hit = a.textures(n.toUpperCase());                                // any case: the lookup's key is lower-cased
      expect(hit, n).not.toBeNull();
      expect(hit!.data, `${n}: the worker's pixels, no decode on the ask`).toBe(got.get(n)!.rgba!.data);
      expect(a.textures(n), `${n}: the same object after`).toBe(hit);
      expect(sameBitmap(hit, plain.textures(n)), `${n}: the lookup's bytes, blend and shape`).toBe(true);
    }
    // Every seed is the very bitmap the lookup hands out, with the worker's hash of its bytes.
    expect(seeds.length).toBe(names.length);
    for (const [im] of seeds) expect(names.some((n) => a.textures(n) === im)).toBe(true);
    expect(a.missing).toEqual(missingBefore);                                // nothing said by a prefetched decode
    expect(a.missing).toEqual(plain.missing);
  });

  it.skipIf(!PRESENT)(`a name asked before its answer is decoded synchronously, as today, and keeps its object when the answer comes${SKIP}`, async () => {
    const a = await art();
    const { decoder } = await inThread();
    let first = '';
    let asked: unknown = null;
    const pf = a.prefetch({
      decoder: async (j) => {
        const r = await decoder(j);
        if (!first) { first = j.names[0]!; asked = a.textures(first); }     // the lookup asks while the answer is out
        return r;
      },
    });
    expect(await pf.finished).toBeNull();
    expect(asked).not.toBeNull();
    expect(a.textures(first)).toBe(asked);                                    // the synchronous decode's object stays
    expect(pf.raced).toBe(1);
  });

  it.skipIf(!PRESENT)(`an answer whose decode said anything (or nothing decoded) is left to the lookup, which decodes and says it as before${SKIP}`, async () => {
    const a = await art();
    const { decoder } = await inThread();
    let said = '', empty = '';
    const fake = new Map<string, Rgba>();
    const pf = a.prefetch({
      decoder: async (j) => {
        const r = await decoder(j);
        return r.map((g, i) => {
          if (i === 0 && !said) { said = g.name; fake.set(g.name, g.rgba!); return { ...g, diagnostics: [`${g.name}: a planted line`] }; }
          if (i === 1 && !empty) { empty = g.name; return { ...g, rgba: null }; }
          return g;
        });
      },
    });
    expect(await pf.finished).toBeNull();
    const plain = await art();
    for (const n of [said, empty]) {
      const got = a.textures(n);
      expect(got, n).not.toBeNull();
      expect(got!.data).not.toBe(fake.get(n)?.data);                        // not the worker's answer: the lookup decoded it
      expect(sameBitmap(got, plain.textures(n))).toBe(true);
    }
    expect(pf.decoded).toBeGreaterThan(0);
  });

  it.skipIf(!PRESENT)(`a decoder that does not answer diagnostics (an older worker) is not trusted: nothing is kept${SKIP}`, async () => {
    const a = await art();
    const { decoder } = await inThread();
    const pf = a.prefetch({ decoder: async (j) => (await decoder(j)).map(({ diagnostics: _d, ...g }) => g) });
    expect(await pf.finished).toBeNull();
    expect(pf.decoded).toBe(0);
  });

  it.skipIf(!PRESENT)(`the byte cap: past it nothing more is asked (capped), and the lookup decodes the rest as today${SKIP}`, async () => {
    const a = await art();
    const { decoder, jobs } = await inThread();
    const pf = a.prefetch({ decoder, maxBytes: 64 * 64 * 4 });
    expect(await pf.finished).toBeNull();
    expect(pf.capped).toBe(true);
    expect(pf.bytes).toBeLessThanOrEqual(64 * 64 * 4);
    expect(jobs.length).toBeLessThanOrEqual(1);
  });

  it.skipIf(!PRESENT)(`stop(): nothing the decoder answers after it is kept, and no further library is asked${SKIP}`, async () => {
    const a = await art();
    const { decoder, jobs } = await inThread();
    let stop = (): void => {};
    const pf = a.prefetch({ decoder: async (j) => { const r = await decoder(j); stop(); return r; } });
    stop = () => pf.stop();
    expect(await pf.finished).toBeNull();
    expect(pf.decoded).toBe(0);
    expect(jobs.length).toBe(1);
  });

  it('an art made by hand has no prefetch; readMenuArt\'s art on a source with nothing prefetches nothing and ends', async () => {
    const nothing: AssetSource = { list: async () => [], read: async (p) => { throw new Error(`no ${p}`); } };
    const a = (await menuArt.readMenuArt(nothing, [design])) as Art;
    const asked: string[][] = [];
    const pf = a.prefetch({ decoder: async (j) => { asked.push(j.names); return []; } });
    expect(await pf.finished).toBeNull();
    expect(asked).toEqual([]);
  });
});

describe('GM-32: chainUiTexturePrefetch -- the art, then the banks, as one prefetch on one decoder', () => {
  const part = (log: string[], name: string, o: { decoded?: number; reason?: string | null; hold?: Promise<void> } = {}) => {
    let stopped = false;
    return {
      stopped: () => stopped,
      prefetch: () => {
        log.push(`start ${name}`);
        const finished = (async () => { await (o.hold ?? Promise.resolve()); log.push(`end ${name}`); return o.reason ?? null; })();
        return { decoded: o.decoded ?? 1, bytes: 10, raced: 0, capped: false, finished, stop: () => { stopped = true; log.push(`stop ${name}`); } };
      },
    };
  };
  type Chain = (...parts: unknown[]) => { prefetch(o: { decoder: Decoder }): assets.UiTexturePrefetch };
  const chain = (...p: unknown[]): ReturnType<Chain> => ((assets as Record<string, unknown>).chainUiTexturePrefetch as Chain)(...p);
  const noDecoder: Decoder = async () => [];

  it('runs each in turn (an absent one skipped); the counts are their sums', async () => {
    const log: string[] = [];
    const c = chain(part(log, 'art', { decoded: 3 }), undefined, null, { libraries: [] }, part(log, 'banks', { decoded: 4 })).prefetch({ decoder: noDecoder });
    expect(await c.finished).toBeNull();
    expect(log).toEqual(['start art', 'end art', 'start banks', 'end banks']);
    expect(c.decoded).toBe(7);
    expect(c.bytes).toBe(20);
  });

  it('a failure ends the chain with its reason; a stop ends the running one and starts no other', async () => {
    const log: string[] = [];
    const failed = chain(part(log, 'art', { reason: 'worker failed' }), part(log, 'banks')).prefetch({ decoder: noDecoder });
    expect(await failed.finished).toBe('worker failed');
    expect(log).toEqual(['start art', 'end art']);
    const log2: string[] = [];
    let go = (): void => {};
    const hold = new Promise<void>((ok) => { go = ok; });
    const a = part(log2, 'art', { hold }), b = part(log2, 'banks');
    const c = chain(a, b).prefetch({ decoder: noDecoder });
    c.stop();
    go();
    expect(await c.finished).toBeNull();
    expect(a.stopped()).toBe(true);
    expect(log2).toEqual(['start art', 'stop art', 'end art']);
  });
});

describe.skipIf(!HAVE_DISC)(`the art the page reads, on the disc${HAVE_DISC ? '' : ' (no SOCOM_DISC / SOCOM_PC_ROOT)'}`, () => {
  it('dlgMenu\'s art (UI2D, UIBF, FONT, UI) fits the cap; OPTIONS\' first-frame names from it are prefetched, the lookup\'s bytes', async () => {
    const src = new FsAssetSource(DISC);
    const { readFrontEndDisc } = await import('../src/frontEnd');
    const base = await readFrontEndDisc(src);
    const withArt = await menuArt.withMenuArt(src, base, ['dlgMenu.rdr']);
    const a = withArt.art as Art;
    expect(a.libraries).toEqual(['UI2D', 'UIBF', 'FONT', 'UI']);
    const { decoder, jobs } = await inThread();
    const answers = new Map<string, Answer>();
    const pf = a.prefetch({ decoder: async (j) => { const r = await decoder(j); for (const g of r) answers.set(g.name, g); return r; } });
    expect(await pf.finished).toBeNull();
    expect(pf.capped).toBe(false);
    const asked = jobs.reduce((n, j) => n + j.names.length, 0);
    // eslint-disable-next-line no-console
    console.log(`GM-32 dev-disc: dlgMenu's art prefetched ${pf.decoded} of ${asked} bitmaps asked, ${pf.bytes} bytes decoded`);
    expect(pf.decoded).toBe(asked);                                          // no decode of the art says anything on the disc
    expect(pf.bytes).toBeLessThanOrEqual(menuArt.MENU_ART_PREFETCH_ADAPTATION.maxBytes);
    const plain = (await menuArt.withMenuArt(src, base, ['dlgMenu.rdr'])).art!;
    for (const n of ['multplay_back.tif', 'font_titlebar_01.tif', 'brown_back.tif', 'op_checkbox.tif', 'font_special_01.tif', 'menu_options_on.tif']) {
      const hit = a.textures(n);
      expect(hit?.data, `${n}: the prefetch's pixels (no decode at the ask)`).toBe(answers.get(n)?.rgba?.data);
      expect(sameBitmap(hit, plain.textures(n)), n).toBe(true);
    }
    expect(a.missing).toEqual(plain.missing);
  }, 120_000);
});
