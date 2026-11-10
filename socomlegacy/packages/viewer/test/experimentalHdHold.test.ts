// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ui } from '../src/ui';

const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../setup/index.html'), 'utf8');

/**
 * HD-HOLD (the owner, 2026-11-01) held the test room's HD switch shown and disabled; v0.4.0 dropped the switch's markup
 * while the settings read still asked for it, and every test-room boot died on "Cannot read properties of null (reading
 * 'checked')". B206 ML-6 (plan 2026-11-06-mods-loader, ML.R11, R12; OT.R110) removes the switch and the texture-pack
 * group (chooser, Import, Remove) with their reads: the panel boots, its settings carry both pack keys off (ML.R14: the
 * keys stay), and the packs are chosen in Home > Experiments > Mods.
 */
describe('ML-6: the test room boots with no HD switch and no texture-pack group', () => {
  beforeEach(() => { document.body.innerHTML = html; document.body.className = 'test-room'; localStorage.clear(); });
  it('emits settings on Experimental with both pack keys off; none of the removed controls is in the panel', async () => {
    const { mountExperimentalGraphics } = await import('../src/experimentalGraphics');
    const ui = new Ui(); const previewLook = ui.onLook();
    const seen: { enabled: boolean; hdPack: boolean; localTexturePack: string | null }[] = [];
    mountExperimentalGraphics(document, (s) => seen.push({ enabled: s.enabled, hdPack: s.hdPack, localTexturePack: s.localTexturePack }), () => previewLook('modern'));
    expect(seen.at(-1)).toEqual({ enabled: false, hdPack: false, localTexturePack: null });
    document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();
    expect(seen.at(-1)).toEqual({ enabled: true, hdPack: false, localTexturePack: null });
    for (const id of ['exp-hdPack', 'exp-hd-pack-status', 'exp-hd-pack-held', 'exp-group-hdPack', 'exp-texturePack', 'exp-pack-import',
      'exp-pack-remove', 'exp-pack-file', 'exp-pack-import-status', 'exp-pack-status', 'exp-group-pack', 'exp-cat-textures'])
      expect(document.getElementById(id), id).toBeNull();
    const text = document.getElementById('experimental-settings')!.textContent!;
    expect(text).not.toMatch(/Held until after the GPU work|HD texture pack|Import pack|Textures & HD/);
  });
});
