// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIDEO_PICTURE_HD_OFFERED } from '@s2u/ui';
import { Ui } from '../src/ui';

const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../setup/index.html'), 'utf8');

/**
 * HD-HOLD (the owner, 2026-11-01): while the HD picture is held the test room's HD switch is shown disabled and reads
 * off -- and the panel still boots. v0.4.0 dropped the switch's markup while the settings read still asked for it,
 * so every test-room boot died on "Cannot read properties of null (reading 'checked')".
 */
describe('HD-HOLD: the test room boots with the HD switch held', () => {
  beforeEach(() => { document.body.innerHTML = html; document.body.className = 'test-room'; localStorage.clear(); });
  it('emits settings on Experimental with the HD pack off, and keeps its switch disabled', async () => {
    expect(VIDEO_PICTURE_HD_OFFERED).toBe(false);
    const { mountExperimentalGraphics } = await import('../src/experimentalGraphics');
    const ui = new Ui(); const previewLook = ui.onLook();
    const seen: { enabled: boolean; hdPack: boolean }[] = [];
    mountExperimentalGraphics(document, (s) => seen.push({ enabled: s.enabled, hdPack: s.hdPack }), () => previewLook('modern'));
    document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();
    expect(seen.at(-1)).toEqual({ enabled: true, hdPack: false });
    const box = document.getElementById('exp-hdPack') as HTMLInputElement;
    expect(box).not.toBeNull();
    expect(box.disabled).toBe(true);
    box.checked = true; box.dispatchEvent(new Event('change'));
    expect(seen.at(-1)?.hdPack).toBe(false);
    expect(document.getElementById('experimental-settings')!.textContent).toContain('Held until after the GPU work');
  });
});
