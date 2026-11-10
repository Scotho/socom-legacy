// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ui } from '../src/ui';

const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../setup/index.html'), 'utf8');
describe('experimental graphics are an isolated test-room preview', () => {
  beforeEach(() => { document.body.innerHTML = html; document.body.className = 'test-room'; localStorage.clear(); });
  it('adds an Experimental choice after the ordinary picture modes, and controls after Advanced', async () => {
    const { mountExperimentalGraphics } = await import('../src/experimentalGraphics');
    const ui = new Ui(); const previewLook = ui.onLook();
    mountExperimentalGraphics(document, () => undefined, () => previewLook('modern'));
    expect(document.querySelector('#look button[data-experimental]')?.textContent).toContain('Experimental');
    expect(document.getElementById('advanced')?.nextElementSibling?.id).toBe('experimental-settings');
  });
  it('does not add experimental controls outside the test room', async () => {
    const { mountExperimentalGraphics } = await import('../src/experimentalGraphics');
    document.body.className = '';
    mountExperimentalGraphics(document, () => undefined, () => undefined);
    expect(document.getElementById('experimental-settings')).toBeNull();
  });
  it('switches effects off on Modern/PS2 and restores independent choices on return', async () => {
    const { mountExperimentalGraphics } = await import('../src/experimentalGraphics');
    const ui = new Ui(); const previewLook = ui.onLook();
    const seen: boolean[] = [];
    mountExperimentalGraphics(document, (s) => seen.push(s.enabled), () => previewLook('modern'));
    document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();
    expect(seen.at(-1)).toBe(true);
    expect(document.querySelector('[data-look="modern"]')?.getAttribute('aria-pressed')).toBe('false');
    document.querySelector<HTMLButtonElement>('[data-look="ps2"]')!.click();
    expect(seen.at(-1)).toBe(false);
    expect(ui.toggles().ps2look).toBe(true);
    document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();
    expect(ui.toggles().ps2look).toBe(false);
    const sharpen = document.getElementById('exp-sharpen') as HTMLInputElement;
    sharpen.click();
    document.querySelector<HTMLButtonElement>('[data-look="modern"]')!.click();
    document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();
    expect(sharpen.checked).toBe(false);
    expect(localStorage.getItem('s2u.viewer.look')).toBe('modern');
  });
  it.each([null, 'ps2', 'modern'])('keeps the remembered look %s and skips the preset callback when entering the experiment', async (saved) => {
    const { mountExperimentalGraphics } = await import('../src/experimentalGraphics');
    if (saved) localStorage.setItem('s2u.viewer.look', saved);
    const published: string[] = [];
    const ui = new Ui();
    const previewLook = ui.onLook(null, view => published.push(view));
    const before = [...published];
    mountExperimentalGraphics(document, () => undefined, () => previewLook('modern'));
    document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();
    expect(ui.toggles().ps2look).toBe(false);
    expect(ui.toggles().detail).toBe(true);
    expect(localStorage.getItem('s2u.viewer.look')).toBe(saved);
    expect(published).toEqual(before);
    (document.getElementById('exp-enabled') as HTMLInputElement).click();
    expect(localStorage.getItem('s2u.viewer.look')).toBe(saved);
    document.querySelector<HTMLButtonElement>('[data-look="ps2"]')!.click();
    expect(localStorage.getItem('s2u.viewer.look')).toBe('ps2');
    expect(published.at(-1)).toBe('ps2');
  });
  it.each([
    ['whiteBalance','warmth',0.5], ['toneBalance','shadows',0.5], ['bloomTint','bloomRed',1.5],
  ] as const)('keeps %s neutral/off, applies its slider, preserves A/B choice and resets',async(toggle,slider,value)=>{
    const {mountExperimentalGraphics}=await import('../src/experimentalGraphics');
    const ui=new Ui(), previewLook=ui.onLook();const seen:Record<string,unknown>[]=[];
    mountExperimentalGraphics(document,s=>seen.push({...s}),()=>previewLook('modern'));
    document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();
    expect(seen.at(-1)).toMatchObject({whiteBalance:false,warmth:0,tint:0,toneBalance:false,shadows:0,highlights:0,bloomTint:false,bloomRed:1,bloomGreen:1,bloomBlue:1});
    (document.getElementById('exp-'+toggle) as HTMLInputElement).click();
    const input=document.getElementById('exp-'+slider) as HTMLInputElement;
    input.value=String(value);input.dispatchEvent(new Event('input'));
    expect(seen.at(-1)).toMatchObject({[toggle]:true,[slider]:value});
    (document.getElementById('exp-enabled') as HTMLInputElement).click();
    expect(seen.at(-1)).toMatchObject({enabled:false,[toggle]:true,[slider]:value});
    document.getElementById('exp-reset')!.click();
    expect(seen.at(-1)).toMatchObject({[toggle]:false,[slider]:toggle==='bloomTint'?1:0,characterAmbient:0.8,detailStrength:0.55,detailRange:1.6});
  });
  it('keeps highlight roll-off off until selected and resets it without changing the saved picture defaults', async () => {
    const {mountExperimentalGraphics} = await import('../src/experimentalGraphics');
    const ui = new Ui(), previewLook = ui.onLook(); const seen: unknown[] = [];
    mountExperimentalGraphics(document, settings => seen.push(settings), () => previewLook('modern'));
    document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();
    expect(seen.at(-1)).toMatchObject({highlightRollOff:false,exposure:0.08,bloomStrength:0.2});
    const toggle = document.getElementById('exp-highlightRollOff') as HTMLInputElement;
    toggle.click(); expect(seen.at(-1)).toMatchObject({highlightRollOff:true});
    (document.getElementById('exp-enabled') as HTMLInputElement).click();
    expect(seen.at(-1)).toMatchObject({enabled:false,highlightRollOff:true});
    document.getElementById('exp-reset')!.click();
    expect(seen.at(-1)).toMatchObject({highlightRollOff:false,exposure:0.08,bloomStrength:0.2});
  });
  it("asset controls are on by the owner's defaults, and off restores the original shader values", async () => {
    const { mountExperimentalGraphics } = await import('../src/experimentalGraphics');
    const { experimentalAssets, updateExperimentalAssets } = await import('../src/experimentalAssets');
    const ui = new Ui(); const previewLook = ui.onLook();
    mountExperimentalGraphics(document, updateExperimentalAssets, () => previewLook('modern'));
    // before Experimental is chosen, the on-by-default features touch nothing: the base's values stand
    expect(experimentalAssets.mipBias.value).toBe(0);
    expect(experimentalAssets.detailStrength.value).toBe(1);
    expect(experimentalAssets.detailRangeSq).toBe(1);
    document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();
    // Craig's defaults: the mip bias on at -1 (2026-10-08); the detail adjustment on at strength 0.55 and distance 1.60 (2026-10-11, H135)
    expect(experimentalAssets.mipBias.value).toBe(-1);
    expect(experimentalAssets.detailStrength.value).toBe(0.55);
    expect(experimentalAssets.detailRangeSq).toBeCloseTo(1.6 ** 2, 12);
    const advancedDetail = document.getElementById('detail') as HTMLInputElement;
    advancedDetail.click();
    expect(document.getElementById('exp-detail-status')?.textContent).toContain('Advanced detail is off');
    advancedDetail.click();
    expect(document.getElementById('exp-detail-status')?.textContent).toContain('strength between 0 and 2');
    (document.getElementById('exp-textureFiltering') as HTMLInputElement).click();   // B206 ML-7: the mip bias is Texture filtering's
    (document.getElementById('exp-detailAdjust') as HTMLInputElement).click();
    expect(experimentalAssets.mipBias.value).toBe(0);
    expect(experimentalAssets.detailStrength.value).toBe(1);
    expect(experimentalAssets.detailRangeSq).toBe(1);
    (document.getElementById('exp-textureFiltering') as HTMLInputElement).click();
    (document.getElementById('exp-detailAdjust') as HTMLInputElement).click();
    expect(experimentalAssets.mipBias.value).toBe(-1);
    expect(experimentalAssets.detailStrength.value).toBe(0.55);
    expect(experimentalAssets.detailRangeSq).toBeCloseTo(1.6 ** 2, 12);
    (document.getElementById('exp-enabled') as HTMLInputElement).click();
    expect(experimentalAssets.mipBias.value).toBe(0);
    expect(experimentalAssets.detailStrength.value).toBe(1);
    expect(experimentalAssets.detailRangeSq).toBe(1);
    (document.getElementById('exp-enabled') as HTMLInputElement).click();
    expect(experimentalAssets.detailRangeSq).toBeCloseTo(1.6 ** 2, 12);
    document.querySelector<HTMLButtonElement>('[data-look="modern"]')!.click();
    expect(experimentalAssets.mipBias.value).toBe(0);
    expect(experimentalAssets.detailStrength.value).toBe(1);
    expect(experimentalAssets.detailRangeSq).toBe(1);
  });
  it("character lighting is on at the owner's gains and restores the original gains on a mode switch", async () => {
    const { mountExperimentalGraphics } = await import('../src/experimentalGraphics');
    const { experimentalAssets, updateExperimentalAssets } = await import('../src/experimentalAssets');
    const ui = new Ui(); const previewLook = ui.onLook();
    mountExperimentalGraphics(document, updateExperimentalAssets, () => previewLook('modern'));
    expect(experimentalAssets.characterAmbient.value).toBe(1);    // nothing before Experimental is chosen
    expect(experimentalAssets.characterDirectional.value).toBe(1);
    document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();
    // Craig's defaults (2026-10-08): on, ambient 0.8, directional 1.25
    expect(experimentalAssets.characterAmbient.value).toBe(0.8);
    expect(experimentalAssets.characterDirectional.value).toBe(1.25);
    const directional = document.getElementById('exp-characterDirectional') as HTMLInputElement;
    directional.value='1.5'; directional.dispatchEvent(new Event('input'));
    expect(experimentalAssets.characterAmbient.value).toBe(0.8);
    expect(experimentalAssets.characterDirectional.value).toBe(1.5);
    (document.getElementById('exp-characterLight') as HTMLInputElement).click();
    expect(experimentalAssets.characterAmbient.value).toBe(1);
    expect(experimentalAssets.characterDirectional.value).toBe(1);
    document.getElementById('exp-reset')!.click();
    expect((document.getElementById('exp-characterAmbient') as HTMLInputElement).value).toBe('0.8');
    expect((document.getElementById('exp-characterDirectional') as HTMLInputElement).value).toBe('1.25');
    expect((document.getElementById('exp-characterLight') as HTMLInputElement).checked).toBe(true);
    expect(experimentalAssets.characterAmbient.value).toBe(0.8);
    expect(experimentalAssets.characterDirectional.value).toBe(1.25);
    expect(experimentalAssets.mipBias.value).toBe(-1);
    document.querySelector<HTMLButtonElement>('[data-look="ps2"]')!.click();
    expect(experimentalAssets.characterAmbient.value).toBe(1);
    expect(experimentalAssets.characterDirectional.value).toBe(1);
  });
  it('A/B bypasses every effect without changing camera, map, or the chosen sliders', async () => {
    const { mountExperimentalGraphics } = await import('../src/experimentalGraphics');
    const ui = new Ui(); const previewLook = ui.onLook();
    const seen: { enabled: boolean; sharpness: number }[] = [];
    mountExperimentalGraphics(document, (s) => seen.push(s), () => previewLook('modern'));
    document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();
    const amount = document.getElementById('exp-sharpness') as HTMLInputElement;
    amount.value = '0.8'; amount.dispatchEvent(new Event('input'));
    (document.getElementById('exp-enabled') as HTMLInputElement).click();
    expect(seen.at(-1)).toMatchObject({ enabled: false, sharpness: 0.8 });
    (document.getElementById('exp-enabled') as HTMLInputElement).click();
    expect(seen.at(-1)).toMatchObject({ enabled: true, sharpness: 0.8 });
  });
  it('starts with Craig’s bloom settings and preserves them across the global bypass', async () => {
    const { mountExperimentalGraphics } = await import('../src/experimentalGraphics');
    const ui = new Ui(); const previewLook = ui.onLook();
    const seen: unknown[] = [];
    mountExperimentalGraphics(document, (s) => seen.push(s), () => previewLook('modern'));
    document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();
    expect(seen.at(-1)).toMatchObject({ enabled: true, bloom: true, bloomStrength: 0.2, bloomThreshold: 0.6, bloomRadius: 2.5 });
    (document.getElementById('exp-enabled') as HTMLInputElement).click();
    expect(seen.at(-1)).toMatchObject({ enabled: false, bloom: true, bloomStrength: 0.2 });
    (document.getElementById('exp-enabled') as HTMLInputElement).click();
    expect(seen.at(-1)).toMatchObject({ enabled: true, bloom: true, bloomStrength: 0.2 });
  });
  it('defaults to 1.5x, permits 6x requests, and independently bypasses supersampling', async () => {
    const { mountExperimentalGraphics } = await import('../src/experimentalGraphics');
    const ui = new Ui(); const previewLook = ui.onLook();
    const seen: unknown[] = [];
    mountExperimentalGraphics(document, (s) => seen.push(s), () => previewLook('modern'));
    document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();
    const resolution = document.getElementById('exp-renderScale') as HTMLInputElement;
    expect(resolution).not.toBeNull();
    expect(seen.at(-1)).toMatchObject({ renderScale: 1.5 });
    resolution.value = '6'; resolution.dispatchEvent(new Event('input'));
    expect(seen.at(-1)).toMatchObject({ renderScale: 6 });
    (document.getElementById('exp-resolution') as HTMLInputElement).click();
    expect(seen.at(-1)).toMatchObject({ renderScale: 1 });
    (document.getElementById('exp-resolution') as HTMLInputElement).click();
    expect(seen.at(-1)).toMatchObject({ renderScale: 6 });
    document.getElementById('exp-reset')!.click();
    expect(seen.at(-1)).toMatchObject({enabled:true, sharpen:true, sharpness:1, renderScale:1.5, bloom:true, bloomStrength:0.2, bloomThreshold:0.6, bloomRadius:2.5, grade:true, exposure:0.08, contrast:1, saturation:1.04});
  });
});
