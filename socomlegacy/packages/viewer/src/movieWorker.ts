import { demuxPssFile, mpeg2ImportStubs, serveMovies, wasmMpeg2Engine, type MoviePort } from '@s2u/fmv';
import { sourceCache, type SourceRequest } from './discSource';

/**
 * The movie decode thread (PLAT-19b; research 120 §3). It hosts `@s2u/fmv`'s decoder core over libmpeg2's wasm and
 * answers the page's `MovieClient` (`movieTexture.ts`'s `startMovieWorker`): the movie is read by range from the
 * player's own disc, image or folder, through `streamFile` (PLAT-03) and demuxed by PLAT-18's `demuxPssFile`, 16 KB at
 * a time; each picture is converted by the IPU's integers and moved to the page in the transfer list.
 *
 * The browser objects enter the package here, as parameters (W9.R6): this scope as the port, `fetch` and
 * `WebAssembly` for the engine, the disc's `File`s for the source, `performance.now` for the budget's clock (PLAT-19c).
 */

const port = self as unknown as MoviePort;

/**
 * This thread's sources (`./discSource` `sourceCache`, as `worker.ts` keeps its own): the disc last asked for -- an
 * image or a picked folder (DA-3), both read by range -- so its directories are walked once; the served tree per URL;
 * and (DX-3) the disc's read set kept in this browser, `{ kind: 'stored' }`, opened here from its identity alone
 * (`./discStored`: OPFS or IndexedDB, read in this worker), a cut movie read from the request's disc when it carries one.
 */
const sourceFor = sourceCache();

serveMovies<SourceRequest>(port, {
  async engine(url) {
    const response = await fetch(url);
    const bytes = response.ok ? new Uint8Array(await response.arrayBuffer()) : new Uint8Array(0);
    // A missing file may come back as the page's HTML (a dev server's fallback): only the wasm magic is the decoder.
    if (bytes[0] !== 0 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d) {
      throw new Error(`${url}: no movie decoder here (HTTP ${response.status}); it is built on the dev host by packages/fmv/wasm/build.sh`);
    }
    const module = await WebAssembly.compile(bytes);
    const instance = await WebAssembly.instantiate(module, mpeg2ImportStubs(WebAssembly.Module.imports(module)));
    return wasmMpeg2Engine(instance.exports);
  },
  packets: (source, path, signal) => demuxPssFile(sourceFor(source), path, { signal }),
}, { now: () => performance.now() });   // PLAT-19c: each picture carries its decode cost (research 120 §11)
