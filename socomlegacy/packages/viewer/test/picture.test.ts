// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { Ui } from '../src/ui';
import { EXPERIMENTAL_DEFAULTS } from '../src/experimentalGraphics';
import * as picture from '../src/picture';
import { MATCH_CANVAS_CLASS, MATCH_EXPERIMENTAL_OFF, parsePicture, PICTURE_KEY, PICTURE_PS2_CLASS, pictureKeeper, type VideoPicture } from '../src/picture';
import { PAGE_SETTING_KEYS } from '../src/pageStore';

// B206 ML-6 (plan 2026-11-06-mods-loader, ML.R11, R12; OT.R110): the HD (GoE Soul) picture is removed with HD-HOLD. A
// stored 'experimental' (a browser that chose it before HD-HOLD) reads as MODERN, is never taken by the keeper, and is
// not written back; the match's experimental renderer is off under both pictures.
const HD_GONE = 'experimental' as unknown as VideoPicture;

/** OT.R79 (LATER 378): the front end's picture, this browser's -- MODERN by default (the merge controller's call B'). */
describe('the page\'s picture (OT.R79)', () => {
  it('a key of the page\'s own, beside the test room\'s look; anything unknown reads MODERN', () => {
    expect(PICTURE_KEY).toBe('s2u.viewer.picture');
    expect(PAGE_SETTING_KEYS).toContain(PICTURE_KEY);
    expect(PAGE_SETTING_KEYS).toContain('s2u.viewer.look');                             // the test room's, untouched (LATER 379)
    expect([parsePicture(null), parsePicture('ps2'), parsePicture('experimental'), parsePicture('480p')])
      .toEqual(['modern', 'ps2', 'modern', 'modern']);                                 // ML-6: a stored HD reads MODERN
    expect([MATCH_CANVAS_CLASS, PICTURE_PS2_CLASS]).toEqual(['s2u-match', 's2u-picture-ps2']);
  });

  it('the keeper: read once, a change stored and heard, the same picture again nothing', () => {
    const store = new Map<string, string>([[PICTURE_KEY, 'ps2']]), heard: string[] = [];
    const k = pictureKeeper((key) => store.get(key) ?? null, (key, v) => { store.set(key, v); });
    expect(k.get()).toBe('ps2');
    const stop = k.observe((p) => heard.push(p));
    k.set('ps2');
    k.set(HD_GONE);                                                                     // ML-6: no such picture, never taken
    expect([k.get(), store.get(PICTURE_KEY), heard]).toEqual(['ps2', 'ps2', []]);
    k.set('modern');
    expect([k.get(), store.get(PICTURE_KEY), heard]).toEqual(['modern', 'modern', ['modern']]);
    stop();
    k.set('ps2');
    expect(heard).toEqual(['modern']);
    expect(store.get(PICTURE_KEY)).toBe('ps2');
  });

  it('ML-6: a stored HD picture reads MODERN at the keeper\'s start, and is not written back', () => {
    const store = new Map<string, string>([[PICTURE_KEY, 'experimental']]);
    const k = pictureKeeper((key) => store.get(key) ?? null, (key, v) => { store.set(key, v); });
    expect(k.get()).toBe('modern');
    expect(store.get(PICTURE_KEY)).toBe('experimental');
  });

  it('ML-6 (ML.R11): the match\'s experimental renderer is off under both pictures; no picture turns it or the HD pack on', () => {
    expect(MATCH_EXPERIMENTAL_OFF).toEqual({ ...EXPERIMENTAL_DEFAULTS, enabled: false });
    expect(MATCH_EXPERIMENTAL_OFF.hdPack).toBe(false);
    expect('pictureExperimentalSettings' in picture).toBe(false);
  });
});

/**
 * RB-16 (PS-4, PS-7; the replay batch, OT.R114's "all of their settings being functional in there"; product track, a
 * browser adaptation -- the test room's own panel wiring, nothing of the game): the test room's look follows the page's
 * one picture (`pagePicture`, the key Home's Options > Display "Video" row and the front end's VIDEO MODE write), and its
 * shadows toggle and frame counter take the shared video keys (`./videoSettings`), through `Ui`'s seams.
 */
describe("RB-16: the test room's look, shadows and frame counter from the shared keys (`Ui`)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(resolve(here, '../setup/index.html'), 'utf-8');
  const load = (): void => { document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML; };
  const keeper = (start: VideoPicture) => {
    const store = new Map<string, string>([[PICTURE_KEY, start]]);
    return { store, k: pictureKeeper((key) => store.get(key) ?? null, (key, v) => { store.set(key, v); }) };
  };
  afterEach(() => { localStorage.clear(); });

  it("the look opens on the page's picture (the address still first), and a press of the look writes it", () => {
    load();
    localStorage.setItem('s2u.viewer.look', 'modern');                                // the old key no longer decides here
    const { store, k } = keeper('ps2');
    const ui = new Ui();
    ui.onLook(null, () => undefined, k);
    expect(ui.toggles().ps2look).toBe(true);
    document.querySelector<HTMLButtonElement>('[data-look="modern"]')!.click();
    expect([k.get(), store.get(PICTURE_KEY), ui.toggles().ps2look]).toEqual(['modern', 'modern', false]);
    load();
    const addressed = new Ui();
    addressed.onLook('ps2', () => undefined, k);                                       // a shared link's `view` wins, unstored
    expect([addressed.toggles().ps2look, k.get()]).toEqual([true, 'modern']);
  });

  it("a change of the page's picture elsewhere (Home's Video row over the test room) is followed and published", () => {
    load();
    const { k } = keeper('modern');
    const ui = new Ui();
    const published: string[] = [];
    ui.onLook(null, (v) => published.push(v), k);
    k.set('ps2');
    expect([ui.toggles().ps2look, published.at(-1)]).toEqual([true, 'ps2']);
    k.set('modern');
    expect([ui.toggles().ps2look, published.at(-1)]).toEqual([false, 'modern']);
  });

  it('without a picture keeper the look is the remembered `s2u.viewer.look` as before (the setup page, the experiment)', () => {
    load();
    localStorage.setItem('s2u.viewer.look', 'ps2');
    const ui = new Ui();
    ui.onLook(null);
    expect(ui.toggles().ps2look).toBe(true);
  });

  it('setToggle: a panel toggle set from outside, its change announced once; the same value again, nothing', () => {
    load();
    const ui = new Ui();
    const heard: [string, boolean][] = [];
    ui.onToggle((name, on) => heard.push([name, on]));
    ui.setToggle('shadows', false);
    ui.setToggle('shadows', false);
    expect([ui.toggles().shadows, heard]).toEqual([false, [['shadows', false]]]);
  });

  it('setFpsShown: the frame counter drawn or not', () => {
    load();
    const ui = new Ui();
    const fps = document.getElementById('fps')!;
    ui.setFpsShown(false);
    expect(fps.style.display).toBe('none');
    ui.setFpsShown(true);
    expect(fps.style.display).toBe('');
  });
});
