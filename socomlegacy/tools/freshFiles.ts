import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Writes for `tools/extract-maps.ts` that never rewrite a file in place (web sprint 5). The extracted trees
 * (`public/maps/`, `test-fixtures/`) are hard links shared between the repository's worktrees: a copy or a write that
 * opens an existing destination and truncates it changes that one inode, so every tree that links it sees the change
 * -- another worktree's `index.json` would name archives its own tree does not hold. So a destination that already
 * holds the same bytes is left alone (its link kept), and one that differs is unlinked first, so the write makes a new
 * file in this tree only.
 */

export type Fresh = 'kept' | 'written';

const CHUNK = 1 << 20;

/** Whether two files hold the same bytes: the sizes, then the contents a megabyte at a time. */
export function sameBytes(a: string, b: string): boolean {
  if (statSync(a).size !== statSync(b).size) return false;
  const fa = openSync(a, 'r'), fb = openSync(b, 'r');
  try {
    const ba = Buffer.alloc(CHUNK), bb = Buffer.alloc(CHUNK);
    for (;;) {
      const na = readSync(fa, ba, 0, CHUNK, null), nb = readSync(fb, bb, 0, CHUNK, null);
      if (na !== nb) return false;
      if (na === 0) return true;
      if (!ba.subarray(0, na).equals(bb.subarray(0, nb))) return false;
    }
  } finally {
    closeSync(fa);
    closeSync(fb);
  }
}

/** `from` copied to `to` as a new file, unless `to` already holds the same bytes; the directory is made as needed. */
export function copyFresh(from: string, to: string): Fresh {
  mkdirSync(dirname(to), { recursive: true });
  if (existsSync(to)) {
    if (sameBytes(from, to)) return 'kept';
    unlinkSync(to);
  }
  copyFileSync(from, to);
  return 'written';
}

/** `text` written to `path` as a new file, unless `path` already holds exactly it. */
export function writeFresh(path: string, text: string): Fresh {
  mkdirSync(dirname(path), { recursive: true });
  const bytes = Buffer.from(text, 'utf8');
  if (existsSync(path)) {
    const size = statSync(path).size;
    if (size === bytes.length) {
      const fd = openSync(path, 'r');
      const got = Buffer.alloc(size);
      try { readSync(fd, got, 0, size, 0); } finally { closeSync(fd); }
      if (got.equals(bytes)) return 'kept';
    }
    unlinkSync(path);
  }
  writeFileSync(path, bytes);
  return 'written';
}
