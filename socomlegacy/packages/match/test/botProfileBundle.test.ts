import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { describe, expect, it } from 'vitest';

/**
 * BOP-1's profiler is bundled into the page (the match's sim runs there too), so its minified text must pass the
 * artifact leak check the release build runs (`python -m workflow.release.leakcheck artifact socomlegacy/dist/viewer`).
 * On 2026-10-28 every host's build of 49506d1e4 failed there: the process's environment read through optional
 * chaining minified to a shape the `key-file-name` rule reads as a dotenv file's name. The rule's dotenv shape is
 * `KEYNAME_TEXT_RE`'s (`workflow/release/leakrules.py`), copied here -- assembled, so this file's own text passes.
 */
const DOTENV_NAME = new RegExp(String.raw`(?<![\w$-])\.` + 'e' + 'nv' + String.raw`(?:\.[\w-]+)?(?![\w-])`, 'i');

describe("BOP-1 the profiler's minified text", () => {
  it('names no dotenv file to the leak check', () => {
    const source = readFileSync(new URL('../src/bots/botProfile.ts', import.meta.url), 'utf8');
    const { code } = transformSync(source, { loader: 'ts', minify: true, target: 'es2022' });
    expect(DOTENV_NAME.exec(code)?.[0] ?? null).toBeNull();
  });
});
