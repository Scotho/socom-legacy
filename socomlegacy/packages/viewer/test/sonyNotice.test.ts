import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SONY_NOTICE_FILE, sonyNoticePlugin } from '../sonyNotice';

/**
 * LATER 380 (the owner's word, 2026-10-23: "the ps4 controller the socom2legacy-teaser had"): the button mapping screen's
 * drawing is Sony's DUALSHOCK 4 line art again (`src/console/render/padArt.ts`), so Sony's notice for it ships again, as
 * it did before the art went with CX-26 (the owner, 2026-10-18: "remove if we're not using it"): emitted into every build
 * as `licenses/sony-controller.txt` from the art's own `src/assets/sony/NOTICE.txt`. H313 asks the owner to confirm the
 * art in a public build. A browser adaptation's build, product track: nothing of the game changes.
 */
const viewer = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function emitted(noticePath: string): { fileName: string; source: string }[] {
  const out: { fileName: string; source: string }[] = [];
  const plugin = sonyNoticePlugin(noticePath) as unknown as { generateBundle(this: { emitFile(f: { fileName: string; source: Uint8Array | string }): void }): void };
  plugin.generateBundle.call({ emitFile: (f) => { out.push({ fileName: f.fileName, source: String(f.source) }); } });
  return out;
}

describe('the Sony notice plugin (LATER 380)', () => {
  it('emits the notice, and only the notice, at licenses/sony-controller.txt', () => {
    const root = mkdtempSync(join(tmpdir(), 'sony-notice-'));
    writeFileSync(join(root, 'NOTICE.txt'), 'notice');
    expect(SONY_NOTICE_FILE).toBe('licenses/sony-controller.txt');
    expect(emitted(join(root, 'NOTICE.txt'))).toEqual([{ fileName: 'licenses/sony-controller.txt', source: 'notice' }]);
  });

  it('the viewer\'s build runs it over the art\'s own notice, which names Sony\'s terms', () => {
    const config = readFileSync(join(viewer, 'vite.config.ts'), 'utf-8');
    expect(config).toMatch(/sonyNoticePlugin\(join\(here, 'src\/assets\/sony\/NOTICE\.txt'\)\)/);
    const notice = join(viewer, 'src/assets/sony/NOTICE.txt');
    expect(existsSync(notice)).toBe(true);
    expect(readFileSync(notice, 'utf-8')).toMatch(/Sony Interactive Entertainment Inc\.[\s\S]*not relicensed/);
  });
});
