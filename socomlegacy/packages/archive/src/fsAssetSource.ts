import { readFileSync } from 'node:fs';
import { open, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { rangedChunks, type AssetSource, type StreamOptions } from './assetSource';
import { parseServedIndex, type ServedIndex } from './mapIndex';

/**
 * `<dir>/index.json`, whatever its age, as a `ServedIndex` (`parseServedIndex`): the one reader the node
 * tools use (`tools/probe-spawns.ts`), so a change of the index's shape is a change here only.
 */
export function readServedIndex(dir: string): ServedIndex {
  return parseServedIndex(JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')));
}

/** An `AssetSource` over a directory on disk. Node only: import it from `@s2u/archive/node`. */
export class FsAssetSource implements AssetSource {
  constructor(private readonly root: string) {}

  async list(): Promise<string[]> {
    const out: string[] = [];
    // Each directory is walked once by its real path: a junction back to an ancestor is not a cycle.
    const seen = new Set<string>();
    const rec = async (rel: string): Promise<void> => {
      const real = await realpath(join(this.root, rel));
      if (seen.has(real)) return;
      seen.add(real);
      for (const entry of await readdir(join(this.root, rel), { withFileTypes: true })) {
        const path = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) { await rec(path); continue; }
        if (!entry.isSymbolicLink()) { out.push(path); continue; }
        // A junction or a symlink says so rather than "directory" (web sprint 2 Task 0: the agent
        // worktrees junction `test-fixtures/RUN` in, and the walk used to list the link as a file).
        // A link whose target is gone (or loops on itself) has no bytes to read, so it is skipped.
        const target = await stat(join(this.root, path)).catch(() => null);
        if (target?.isDirectory()) await rec(path);
        else if (target) out.push(path);
      }
    };
    await rec('');
    return out.sort();
  }

  async read(path: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(join(this.root, path)));
  }

  /**
   * The file, or the extent `options` names, as ordered chunks (`AssetSource.stream`): one positioned read of the open
   * file per pull, so a movie on the dev tree is never in memory whole. The handle is closed however the stream ends.
   * Only `stream` is added, not `size`/`readRange`: a directory source that turned ranged would change how `listMaps`
   * and `readZarMembers` read it (`isRanged`).
   */
  async *stream(path: string, options: StreamOptions = {}): AsyncGenerator<Uint8Array> {
    options.signal?.throwIfAborted();
    const file = await open(join(this.root, path), 'r');
    try {
      const { size } = await file.stat();
      yield* rangedChunks(async (offset, length) => {
        const out = new Uint8Array(length);
        let got = 0;
        while (got < length) {
          const { bytesRead } = await file.read(out, got, length - got, offset + got);
          if (bytesRead === 0) throw new Error(`${path}: the file ended ${length - got} bytes short at ${offset + got}`);
          got += bytesRead;
        }
        return out;
      }, size, path, options);
    } finally {
      await file.close();
    }
  }
}
