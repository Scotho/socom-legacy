// WM-PACKS-CHIP (product track, a browser adaptation): the HUD must not import the pack's chip at runtime. The chip's
// module reaches `./startMenu` -> `./roundChat` -> `./matchMessages`, whose top level reads `MESSAGE_SCALE` from `./hud`;
// imported from hud.ts that runs while hud.ts is still evaluating, leaving the claymore refusal's scale undefined.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

describe('WM-PACKS-CHIP: no import cycle through the HUD', () => {
  it('importing ./hud first leaves matchMessages with the window\'s scale', async () => {
    vi.resetModules();
    const hud = await import('../src/hud');
    const messages = await import('../src/matchMessages');
    expect(hud.MESSAGE_SCALE).toBe(0.9);
    expect(messages.CLAYMORE_REFUSAL_SCALE_READING).toBe(hud.MESSAGE_SCALE);
  }, 60_000);   // a cold import of the HUD's module graph takes seconds
  it('hud.ts has no runtime import of ./packApplyChip (a type import is allowed)', () => {
    const text = readFileSync(resolve(src, 'hud.ts'), 'utf8');
    const runtime = text.split('\n').filter((l) => /^\s*import\s+(?!type\b)[^;]*from\s+['"]\.\/packApplyChip['"]/.test(l));
    expect(runtime).toEqual([]);
  });
});
