import type { DiscIdentity } from '@s2u/archive';
import { copyDirName } from './discCopy';
import { DiscExtractError, asExtractError, chooseBackend, type ExtractEnv, type WorkerChannel } from './discExtract';
import { idbOf, storedExtraction } from './discExtractRecord';
import { EXTRACT_STREAM_BLOCK, idbExtractStore, type ExtractBackend, type ExtractStream } from './discExtractStore';
import { pageRecords } from './pageStore';

/**
 * **The extraction store's one streamed writer** (disc-share plan `docs/plans/2026-10-18-disc-share.md`, DSH-2, DSH.R4):
 * what the transfer (DSH-4, `./discShare*`) calls to save a received file into the extraction's store, where START reads
 * it as it reads a local extraction (`./discExtractRecord`, `./discStart`). Nothing of a file is held whole: the bytes go
 * in as they arrive, about one block (`./discExtractStore` `EXTRACT_STREAM_BLOCK`) held at most.
 *
 *     const f = await openStreamedFile(identity, 'RUN/SOUNDS/VAGSTORE.ZAR', size, { backend: record.backend });
 *     // ask the sender for the file from f.storedBytes on
 *     for each piece: await f.write(piece);       // in order, each awaited before the next
 *     const { bytes, sha256 } = await f.finish(); // checked against the manifest; then the record marks it done
 *     // on a drop: await f.abort() -- the stored blocks are kept, and the next open carries on from them
 *
 * `openStreamedFile(identity, path, size, env)` opens `path` (a read-set path, `RUN/MP2.ZDB`) of the disc `identity`
 * names, `size` bytes, in the store's directory `copyDirName(identity)`, on **OPFS** where the browser offers it and the
 * extraction's worker can open a sync access handle (`./discExtractProtocol` `openOpfsStream`: written at its offset,
 * never truncated on a resume), else the **chunked IndexedDB** (`./discExtractStore` `stream`: one record a block) --
 * `./discExtract` `chooseBackend`, the kept extraction's backend tried first. `env.backend` holds it to one: the
 * transfer passes its record's, so every file of one extraction is on one backend. It answers:
 * - `backend`, and `storedBytes`: the bytes of the file already stored -- 0 for a new file, the last stored block's end
 *   after a drop, the whole size for a file already stored whole. The sender is asked for the rest.
 * - `write(chunk)`: the next bytes, in order; awaited before the next (the pacing the transfer reads).
 * - `finish()`: what is held stored, the file closed; `{ bytes, sha256 }`, the SHA-256 the whole file's (the stored
 *   part re-read on a resume to rebuild it). Refused if the bytes are not `size`.
 * - `abort()`: the file closed, its stored blocks kept for the next open.
 * Its refusals are `DiscExtractError`s, in a player's words (`./discExtract` `asExtractError`). The record
 * (`./discExtractRecord`'s form, `DISC_EXTRACT_SLOT`) is the caller's to write, as `./discExtract` `extractDisc` writes
 * a local extraction's; this module writes files only.
 *
 * A **browser adaptation** (OT.R53, the product track) with no original: it changes nothing the game reads -- the
 * stored files are the bytes received, read back by the same readers by the same paths. Nothing here reads the network
 * or sends anything (DA.R3, DSH.R11: the transfer's own modules carry the bytes; this one only stores them).
 */

/** The streamed file `openStreamedFile` answers (the module's header). */
export interface StreamedFile {
  readonly backend: ExtractBackend;
  readonly storedBytes: number;
  write(chunk: Uint8Array): Promise<void>;
  finish(): Promise<{ bytes: number; sha256: string }>;
  abort(): Promise<void>;
}

/** What it runs over: the extraction's own (`./discExtract` `ExtractEnv`), and the block (`EXTRACT_STREAM_BLOCK`). */
export type StreamEnv = ExtractEnv & { readonly block?: number };

/** Opens `path` of the disc `identity` names as a streamed file of `size` bytes (the module's header). */
export async function openStreamedFile(identity: DiscIdentity, path: string, size: number, env: StreamEnv = {}): Promise<StreamedFile> {
  const dir = copyDirName(identity);
  const block = env.block ?? EXTRACT_STREAM_BLOCK;
  let kept: ExtractBackend | undefined;
  try { const r = await storedExtraction(env.records ?? pageRecords()); kept = r?.dir === dir ? r.backend : undefined; } catch { kept = undefined; }
  const chosen = await chooseBackend(env, kept);
  try {
    if (chosen.backend === 'opfs') return await opfsFile(chosen.channel!, dir, path, size, block);
    chosen.channel?.close();
    return wrap('indexeddb', await idbExtractStore(idbOf(env), dir).stream(path, size, { block }));
  } catch (e) {
    chosen.channel?.close();
    throw failure(e);
  }
}

const failure = (e: unknown): DiscExtractError => (e instanceof DiscExtractError ? e : asExtractError(e));

/**
 * A store's stream as a `StreamedFile`, its refusals in a player's words. A failed write ends it (`end`: the OPFS
 * worker terminated); after its end a write or a finish is refused and an abort is nothing.
 */
function wrap(backend: ExtractBackend, s: ExtractStream, close: () => void = () => undefined): StreamedFile {
  let ended = false;
  const end = (): void => { if (!ended) { ended = true; close(); } };
  const live = (): void => {
    if (ended) throw new DiscExtractError('failed', 'the file being saved was already closed; open it again to carry on');
  };
  return {
    backend,
    storedBytes: s.stored,
    async write(chunk) { live(); try { await s.write(chunk); } catch (e) { end(); throw failure(e); } },
    async finish() { live(); try { return await s.finish(); } catch (e) { throw failure(e); } finally { end(); } },
    async abort() { if (ended) return; try { await s.abort(); } catch (e) { throw failure(e); } finally { end(); } },
  };
}

/** The OPFS streamed file: its worker's `stream*` requests; the worker terminated when the file ends either way. */
async function opfsFile(channel: WorkerChannel, dir: string, path: string, size: number, block: number): Promise<StreamedFile> {
  const stored = await channel.streamOpen(dir, path, size, block);
  return wrap('opfs', {
    stored,
    write: (bytes) => channel.streamWrite(bytes),
    finish: () => channel.streamFinish(),
    abort: () => channel.streamAbort(),
  }, () => { channel.close(); });
}
