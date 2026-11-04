import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KEYBOARD_SITES } from '../../src/keyboardTesting';
import { PAGE_LOADERS } from '../../src/pageEntry';

/**
 * FORGE (FG.R9, the owner 2026-10-13: "Ship in release, + controller"): the forge is in every build, and inside it the
 * game's release input rule holds -- OT.R29 (the keyboard a development build's) and OT.R38 (no captured mouse look).
 * `test/keyboardGate.test.ts` and `test/mouseGate.test.ts` scan the source root, not `src/forge/`; this is their scan
 * for the forge. A key or lock site is in a release only when no literal `import.meta.env.DEV` gates it on its own
 * line or the two before.
 */
const here = dirname(fileURLToPath(import.meta.url));
const FORGE = resolve(here, '../../src/forge');
// `lobby/` since FG-27 (FG.R22): the lobby popup's modules, scanned as the forge's own.
const sources = ['', 'lobby/'].flatMap((d) => readdirSync(resolve(FORGE, d)).filter((f) => f.endsWith('.ts')).map((f) => ({ file: `${d}${f}`, lines: readFileSync(resolve(FORGE, d, f), 'utf-8').split('\n') })));
const gated = (lines: string[], i: number): boolean => lines.slice(Math.max(0, i - 2), i + 1).some((l) => l.includes('import.meta.env.DEV'));
/**
 * OT.R68 (the owner, 2026-10-21: "kb/m support for everything while in the forge creation UI (not once of it's started
 * matches)"): the editor's key map and its captured mouse are every build's -- these lines alone, each live. The
 * matches the forge starts (`../../src/matchMount`) keep OT.R29 / OT.R38.
 */
const OT_R68: readonly [string, string][] = [
  ['page.ts', "globalThis.addEventListener('keydown', (e) => {"],                       // the editor's map (`keys.ts`)
  ['page.ts', "globalThis.addEventListener('keydown', onLeaseKey);"],                    // R3-A: the focus lease's exit (`keys.ts`)
  // FUI-22 (D1): the asset preview's own keys (Escape, the arrows' orbit) went with its panel -- a tooltip takes no keys,
  // so its line left this list with it (the list names live lines only); the page's Escape hides the tooltip (`keys.ts`).
  ['page.ts', 'const r = (el as { requestPointerLock?: () => unknown }).requestPointerLock?.();'],   // `lockMouse`
];
const listed = (file: string, l: string): boolean => OT_R68.some(([f, frag]) => f === file && l.includes(frag));
/** Native browser field accessibility (FDL-1), separate from OT.R68's editor input map.
 * Key release activates a Settings range endpoint when its thumb has not moved; no key reaches the game.
 */
const NATIVE_FIELD_KEYS: readonly [string, string][] = [['page.ts', "lightIn.addEventListener('keyup'"]];

describe('FORGE: the release gate', () => {
  it('is loaded in every build (no DEV gate on its loader)', () => {
    expect(Object.keys(PAGE_LOADERS)).toContain('forge');
  });

  it('attaches no key listener, pointer lock or mouse-look outside a DEV gate, and says its key site', () => {
    const bad: string[] = [];
    for (const { file, lines } of sources) {
      lines.forEach((l, i) => {
        if (listed(file, l)) return;
        if (/addEventListener\('key(down|up)'/.test(l) && !gated(lines, i) && !NATIVE_FIELD_KEYS.some(([f, frag]) => file === f && l.includes(frag))) bad.push(`${file}:${i + 1} key listener`);
        if (/requestLock\(|requestPointerLock|pointerlockchange|\.movementX/.test(l) && !gated(lines, i)) bad.push(`${file}:${i + 1} pointer lock`);
      });
    }
    expect(bad).toEqual([]);
    expect(KEYBOARD_SITES).toContain('s2u-kb-forge');
    expect(sources.some(({ lines }) => lines.some((l) => l.includes("keyboardSite('s2u-kb-forge')")))).toBe(true);
  });

  it('OT.R68: each listed line is live, once; the editor\'s map reads no key while a match runs (`keys.ts`)', () => {
    for (const [file, frag] of OT_R68) {
      const hits = sources.find((s) => s.file === file)!.lines.filter((l) => l.includes(frag));
      expect(hits, frag).toHaveLength(1);
    }
    const keys = readFileSync(resolve(FORGE, 'keys.ts'), 'utf-8');
    expect(keys).toContain('if (s.typing || s.match) return null;');
  });

  it('the native Settings range exemption names exactly one live field listener, not the editor key map', () => {
    for (const [file, frag] of NATIVE_FIELD_KEYS) {
      const hits = sources.find(s => s.file === file)!.lines.filter(l => l.includes(frag));
      expect(hits, frag).toHaveLength(1);
      expect(hits[0]).toContain('activateTime()');
      expect(hits[0]).not.toMatch(/globalThis|keyboardSite|forgeKeyAction/);
    }
  });

  it('asks nothing through a browser dialog (confirm, alert, prompt): its own cards answer a pad', () => {
    const bad = sources.flatMap(({ file, lines }) => lines.flatMap((l, i) => (/\b(confirm|alert|prompt)\(/.test(l) && /globalThis\.|window\./.test(l) ? [`${file}:${i + 1}`] : [])));
    expect(bad).toEqual([]);
  });
});
