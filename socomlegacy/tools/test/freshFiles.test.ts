import { linkSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyFresh, sameBytes, writeFresh } from '../freshFiles';

/**
 * The extractor's writes never rewrite a shared hard link in place (web sprint 5): the extracted trees are linked between
 * the worktrees, and a truncating copy would change every tree's file at once.
 */
describe('copyFresh and writeFresh', () => {
  let dir = '';
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'fresh-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('keeps a destination that already holds the same bytes, and its link', () => {
    const other = join(dir, 'other.bin'), mine = join(dir, 'mine.bin'), src = join(dir, 'src.bin');
    writeFileSync(other, 'same bytes');
    linkSync(other, mine);
    writeFileSync(src, 'same bytes');
    expect(copyFresh(src, mine)).toBe('kept');
    expect(statSync(mine).nlink).toBe(2);
    expect(writeFresh(mine, 'same bytes')).toBe('kept');
    expect(statSync(other).nlink).toBe(2);
  });

  it('writes a changed file as a new one: the other tree\'s link keeps its old bytes', () => {
    const other = join(dir, 'other.json'), mine = join(dir, 'mine.json'), src = join(dir, 'src.bin');
    writeFileSync(other, '{"common":[]}');
    linkSync(other, mine);
    expect(writeFresh(mine, '{"common":["RUN/UIZANIM.ZAR"]}')).toBe('written');
    expect(readFileSync(other, 'utf8')).toBe('{"common":[]}');
    expect(readFileSync(mine, 'utf8')).toBe('{"common":["RUN/UIZANIM.ZAR"]}');
    expect(statSync(other).nlink).toBe(1);

    const otherBin = join(dir, 'o.bin'), mineBin = join(dir, 'm.bin');
    writeFileSync(otherBin, 'old');
    linkSync(otherBin, mineBin);
    writeFileSync(src, 'new!');
    expect(copyFresh(src, mineBin)).toBe('written');
    expect(readFileSync(otherBin, 'utf8')).toBe('old');
    expect(readFileSync(mineBin, 'utf8')).toBe('new!');
  });

  it('makes a missing destination and its directory', () => {
    const src = join(dir, 'src.bin');
    writeFileSync(src, 'x');
    expect(copyFresh(src, join(dir, 'a', 'b', 'c.bin'))).toBe('written');
    expect(writeFresh(join(dir, 'd', 'e.json'), '{}')).toBe('written');
    expect(readFileSync(join(dir, 'a', 'b', 'c.bin'), 'utf8')).toBe('x');
  });

  it('compares by size and then by content', () => {
    const a = join(dir, 'a'), b = join(dir, 'b'), c = join(dir, 'c');
    writeFileSync(a, 'abcd');
    writeFileSync(b, 'abce');
    writeFileSync(c, 'abc');
    expect(sameBytes(a, a)).toBe(true);
    expect(sameBytes(a, b)).toBe(false);
    expect(sameBytes(a, c)).toBe(false);
  });
});
