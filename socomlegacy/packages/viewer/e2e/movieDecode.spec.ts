import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { IsoAssetSource } from '../../archive/src/index';
import { MovieDecoder, demuxPssFile, mpeg2ImportStubs, wasmMpeg2Engine } from '../../fmv/src/index';
import { TEST_ROOM_PAST_SHEET } from './urls';

/**
 * PLAT-19b in a real browser (research 120 §8): the movie decoded in the page's worker (`src/movieWorker.ts`, started
 * by `src/movieTexture.ts`'s `startMovieWorker`) from the player's own disc image, read by range from a `File`, with
 * the wasm the dev server serves at `/fmv/libmpeg2.wasm` -- against the same core run here in Node on the same image.
 * Every picture's RGBA hash, its coding index and the count must be equal: the page's decode is the Node decode,
 * which `tools/test/fmvDecodeDisc.test.ts` holds to libavcodec's within research 98 §7.11's bound.
 *
 * Dev host only: skips without `SOCOM_ISO` and the built wasm (`packages/fmv/wasm/build.sh`). Heavy (a browser and
 * three whole movies): the host's lock rules apply. `MOVIES=SONY448` limits it to one.
 */
const ISO = process.env.SOCOM_ISO ?? '';
const WASM = fileURLToPath(new URL('../../fmv/wasm/out/libmpeg2.wasm', import.meta.url));
const ALL = ['RUN/MOVIES/COMMON/SONY448.PSS', 'RUN/MOVIES/INTRO_2.PSS', 'RUN/MOVIES/COMMON/MENULOOP.PSS'];
const MOVIES = process.env.MOVIES ? ALL.filter((m) => process.env.MOVIES!.split(',').some((k) => m.includes(k))) : ALL;

test.skip(!ISO || !existsSync(ISO) || !existsSync(WASM), 'SOCOM_ISO or the built wasm absent');

/** The image as a Blob by `readSync` per slice (an image above 4 GiB: `fs.openAsBlob` wraps its size on Windows). */
function fsBlob(path: string): Blob & { close(): void } {
  const fd = openSync(path, 'r');
  const size = fstatSync(fd).size;
  const slice = (start = 0, end = size): Blob => ({
    size: end - start,
    arrayBuffer: async () => {
      const out = new Uint8Array(end - start);
      let got = 0;
      while (got < out.length) {
        const n = readSync(fd, out, got, out.length - got, start + got);
        if (n === 0) break;
        got += n;
      }
      return out.buffer;
    },
  }) as unknown as Blob;
  return { size, slice, close: () => closeSync(fd) } as unknown as Blob & { close(): void };
}

/** The Node decode: every picture's RGBA sha-256 (16 hex digits) and coding index. */
async function nodeDecode(path: string): Promise<{ hashes: string[]; tags: (number | null)[] }> {
  const module = await WebAssembly.compile(readFileSync(WASM));
  const instance = await WebAssembly.instantiate(module, mpeg2ImportStubs(WebAssembly.Module.imports(module)));
  const engine = wasmMpeg2Engine(instance.exports);
  const blob = fsBlob(ISO);
  try {
    const d = new MovieDecoder(engine, { output: 'rgba' });
    d.open(demuxPssFile(new IsoAssetSource(blob), path));
    const hashes: string[] = [];
    const tags: (number | null)[] = [];
    for (;;) {
      const r = await d.next();
      if (r.kind === 'end') { expect(r.error).toBeNull(); return { hashes, tags }; }
      hashes.push(createHash('sha256').update(r.picture.data).digest('hex').slice(0, 16));
      tags.push(r.picture.codingIndex);
    }
  } finally {
    engine.close();
    blob.close();
  }
}

test('the page\'s worker decodes the disc\'s movies from the image as the Node core does, picture for picture', async ({ page }) => {
  test.setTimeout(1_800_000);
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(TEST_ROOM_PAST_SHEET);                                // the disc page: no served tree, no map, no match
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'movie-iso';
    document.body.append(input);
  });
  await page.locator('#movie-iso').setInputFiles(ISO);
  for (const path of MOVIES) {
    const ours = await page.evaluate(async (moviePath) => {
      const { startMovieWorker } = await import(/* @vite-ignore */ '/src/movieTexture.ts' as string) as typeof import('../src/movieTexture');
      const { worker, client, wasm } = startMovieWorker();
      const file = (document.getElementById('movie-iso') as HTMLInputElement).files![0]!;
      const stream = client.open(moviePath, { kind: 'iso', file }, wasm);
      const hashes: string[] = [];
      const tags: (number | null)[] = [];
      const t0 = performance.now();
      for (;;) {
        const r = await stream.next();
        if (r.kind === 'end') { worker.terminate(); return { end: r, hashes, tags, ms: performance.now() - t0 }; }
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', r.rgba));
        hashes.push([...digest.subarray(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join(''));
        tags.push(r.codingIndex);
        stream.release(r.rgba);
      }
    }, path);
    const ref = await nodeDecode(path);
    console.log(`${path}: the page ${ours.hashes.length} pictures in ${ours.ms.toFixed(0)} ms (${(ours.ms / Math.max(1, ours.hashes.length)).toFixed(2)} ms each, `
      + `worker decode, conversion, transfer and the page's hash), Node ${ref.hashes.length}; end ${JSON.stringify(ours.end)}`);
    expect(ours.end.error).toBeNull();
    expect(ours.tags).toEqual(ref.tags);
    expect(ours.hashes.length).toBe(ref.hashes.length);
    const differ = ours.hashes.findIndex((h, i) => h !== ref.hashes[i]);
    expect(differ, `first picture whose RGBA differs: ${differ}`).toBe(-1);
  }
  expect(problems).toEqual([]);
});
