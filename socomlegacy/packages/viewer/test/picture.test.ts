// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { Ui } from '../src/ui';
import { EXPERIMENTAL_DEFAULTS } from '../src/experimentalGraphics';
import * as picture from '../src/picture';
import { MATCH_CANVAS_CLASS, MATCH_EXPERIMENTAL_OFF, pagePicture, parsePicture, PICTURE_KEY, PICTURE_PS2_CLASS, pictureDefault, pictureKeeper, type VideoPicture } from '../src/picture';
import { PAGE_SETTING_KEYS } from '../src/pageStore';
import { CLASS_PICTURE_ADAPTATION } from '../src/autoQuality';
import type { DeviceClass } from '../src/deviceClass';
import { GRAPHICS_BACKEND_KEY } from '../src/graphicsBackend';
import { VIDEO_SETTINGS_KEY_V2, videoSettingsKeeperV2 } from '../src/videoSettings';
import { liveOptions, VIDEO_PRESET_ROW } from '../src/console/adapters/options';

// B206 ML-6 (plan 2026-11-06-mods-loader, ML.R11, R12; OT.R110): the HD (GoE SouL) picture is removed with HD-HOLD. A
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

/**
 * WM-5a (the weekend mega sprint; product track, a browser adaptation -- the second developer's physical report from his
 * console, not measured by us: the live page stable at 30 fps in the PS2 picture with the 30 fps cap): the picture's
 * default is the device class's alone -- the Xbox class's is PS2 -- where the player has saved no picture; it is never
 * written, and a saved picture is always the player's. The controller's rulings (seat 8f): choosing the Lite preset is
 * the player's own choice of the whole bundle, so it SAVES the PS2 picture where none is saved, and nothing about the
 * picture follows the preset after (B); a press saves (C); `clear()` empties the key and reads the default again (D).
 */
describe("WM-5a: the picture's default by class and preset; a saved picture kept", () => {
  const CLASSES: readonly DeviceClass[] = ['xbox', 'software', 'touch', 'lowMemory', 'standard', 'high'];
  const memory = (entries: [string, string][] = []) => {
    const store = new Map<string, string>(entries);
    return { store, read: (key: string) => store.get(key) ?? null, write: (key: string, v: string) => { store.set(key, v); } };
  };
  afterEach(() => { localStorage.clear(); });

  it('the class table: PS2 for the Xbox class, Modern for every other', () => {
    expect(Object.keys(CLASS_PICTURE_ADAPTATION).sort()).toEqual([...CLASSES].sort());
    for (const c of CLASSES) expect(CLASS_PICTURE_ADAPTATION[c], c).toBe(c === 'xbox' ? 'ps2' : 'modern');
    for (const c of CLASSES) expect(pictureDefault(() => c, () => null), c).toBe(CLASS_PICTURE_ADAPTATION[c]);
  });

  it('the Xbox class with no picture saved starts in PS2; nothing is written', () => {
    const { store, read, write } = memory();
    const k = pictureKeeper(read, write, () => 'xbox');
    expect(k.get()).toBe('ps2');
    expect(store.has(PICTURE_KEY)).toBe(false);
    expect(pictureKeeper(read, write, () => 'standard').get()).toBe('modern');
  });

  it("a saved picture is the player's: Modern saved on the Xbox class stays Modern", () => {
    const { store, read, write } = memory([[PICTURE_KEY, 'modern']]);
    const k = pictureKeeper(read, write, () => 'xbox');
    expect(k.get()).toBe('modern');
    expect(store.get(PICTURE_KEY)).toBe('modern');
    expect(pictureKeeper(memory([[PICTURE_KEY, 'experimental']]).read, () => {}, () => 'xbox').get()).toBe('modern');   // ML-6's removed picture is a choice saved: Modern
  });

  it("the page's keeper: an Xbox pick with nothing saved reads PS2, unwritten; a picture saved later wins at once", () => {
    localStorage.setItem(GRAPHICS_BACKEND_KEY, 'xbox');
    expect(pagePicture().get()).toBe('ps2');
    expect(localStorage.getItem(PICTURE_KEY)).toBeNull();
    pagePicture().set('modern');
    expect([pagePicture().get(), localStorage.getItem(PICTURE_KEY)]).toEqual(['modern', 'modern']);
    localStorage.removeItem(PICTURE_KEY);                                               // a cleared key: the default again, still unwritten
    expect(pagePicture().get()).toBe('ps2');
    expect(localStorage.getItem(PICTURE_KEY)).toBeNull();
  });

  // WM-R20-FOLDS item 2 (the controller's ruling, seat 8f, over ruling B; the saved-settings audit's R1): passing through
  // Lite is not a choice of picture. Lite (and a Custom made from it) draws the PS2 picture while it is the preset, but
  // writes no picture: another named preset chosen brings the class's default back, and a picture the player pressed
  // himself is never touched. These replace ruling B's pins ("Lite saves PS2 for good").
  it('the default: the class, or PS2 while Lite or a Custom made from Lite is the stored preset (item 2)', () => {
    const lite: [string, string] = [VIDEO_SETTINGS_KEY_V2, JSON.stringify({ preset: 'lite', overlay: 'fps' })];
    const fromLite: [string, string] = [VIDEO_SETTINGS_KEY_V2, JSON.stringify({ preset: 'custom', from: 'lite', overlay: 'fps' })];
    const custom: [string, string] = [VIDEO_SETTINGS_KEY_V2, JSON.stringify({ preset: 'custom', overlay: 'fps' })];
    const quality: [string, string] = [VIDEO_SETTINGS_KEY_V2, JSON.stringify({ preset: 'quality', from: 'lite', overlay: 'fps' })];
    for (const c of CLASSES) {
      expect(pictureDefault(() => c, memory([lite]).read), c).toBe('ps2');
      expect(pictureDefault(() => c, memory([fromLite]).read), c).toBe('ps2');
      expect(pictureDefault(() => c, memory([custom]).read), c).toBe(CLASS_PICTURE_ADAPTATION[c]);
      expect(pictureDefault(() => c, memory([quality]).read), c).toBe(CLASS_PICTURE_ADAPTATION[c]);   // 'from' counts under Custom only
    }
  });

  it('choosing Lite with no picture saved draws the PS2 picture and writes no picture (item 2)', () => {
    expect(localStorage.getItem(PICTURE_KEY)).toBeNull();
    videoSettingsKeeperV2().set({ preset: 'lite' });
    expect([localStorage.getItem(PICTURE_KEY), pagePicture().get()]).toEqual([null, 'ps2']);
  });

  it('Lite then one row changed (now Custom, made from Lite) keeps the PS2 picture, unwritten (item 2)', () => {
    const k = videoSettingsKeeperV2();
    k.set({ preset: 'lite' });
    k.set({ frameCap: 60 });
    expect(k.get().preset).toBe('custom');
    expect([localStorage.getItem(PICTURE_KEY), pagePicture().get()]).toEqual([null, 'ps2']);
    k.set({ shadows: 'low' });                                                          // a further row: still made from Lite
    expect(pagePicture().get()).toBe('ps2');
    k.set({ preset: 'balanced' });                                                      // another named preset: the class's again
    expect([localStorage.getItem(PICTURE_KEY), pagePicture().get()]).toEqual([null, 'modern']);
  });

  it('Lite then Quality: the picture only Lite drew is taken back -- MODERN on a standard device, nothing written (item 2)', () => {
    const k = videoSettingsKeeperV2();
    k.set({ preset: 'lite' });
    k.set({ preset: 'quality' });
    expect(k.get().preset).toBe('quality');
    expect([localStorage.getItem(PICTURE_KEY), pagePicture().get()]).toEqual([null, 'modern']);
  });

  it("the launcher's Preset row: Quality, Right onto Lite, Left back -- no picture key saved and the picture what it was (item 2, audit R1)", () => {
    const o = liveOptions(() => {}, { signedIn: () => false, pads: () => [], touch: () => false });
    try {
      videoSettingsKeeperV2().set({ preset: 'quality' });
      const before = pagePicture().get();
      o.step!(VIDEO_PRESET_ROW, 1);                                                    // LiveOptions declares step optional; liveOptions defines it
      expect(videoSettingsKeeperV2().get().preset).toBe('lite');
      expect(pagePicture().get()).toBe('ps2');
      o.step!(VIDEO_PRESET_ROW, -1);
      expect(videoSettingsKeeperV2().get().preset).toBe('quality');
      expect([localStorage.getItem(PICTURE_KEY), pagePicture().get()]).toEqual([null, before]);
    } finally { o.dispose(); }
  });

  it('a PS2 picture the player pressed, then Lite, then Quality: his PS2 is kept (item 2)', () => {
    pagePicture().choose('ps2');
    const k = videoSettingsKeeperV2();
    k.set({ preset: 'lite' });
    k.set({ preset: 'quality' });
    expect([localStorage.getItem(PICTURE_KEY), pagePicture().get()]).toEqual(['ps2', 'ps2']);
  });

  it('Lite then Restore defaults: the class default again, nothing written (item 2)', () => {
    const k = videoSettingsKeeperV2();
    k.set({ preset: 'lite' });
    k.restoreDefaults();
    expect([localStorage.getItem(PICTURE_KEY), pagePicture().get()]).toEqual([null, 'modern']);
  });

  it('the Xbox class: Lite then Quality still draws PS2 (its class default), nothing written (item 2)', () => {
    localStorage.setItem(GRAPHICS_BACKEND_KEY, 'xbox');
    const k = videoSettingsKeeperV2();
    k.set({ preset: 'lite' });
    expect(pagePicture().get()).toBe('ps2');
    k.set({ preset: 'quality' });
    expect([localStorage.getItem(PICTURE_KEY), pagePicture().get()]).toEqual([null, 'ps2']);
  });

  it('Lite with Modern saved keeps Modern (B)', () => {
    localStorage.setItem(PICTURE_KEY, 'modern');
    videoSettingsKeeperV2().set({ preset: 'lite' });
    expect([localStorage.getItem(PICTURE_KEY), pagePicture().get()]).toEqual(['modern', 'modern']);
  });

  it('a press is a choice: choose() saves the picture shown by default, unheard; set() of the same picture (the native strip echo) writes nothing (C)', () => {
    const { store, read, write } = memory();
    const heard: string[] = [];
    const k = pictureKeeper(read, write, () => 'xbox');
    k.observe((p) => heard.push(p));
    k.set('ps2');
    expect(store.has(PICTURE_KEY)).toBe(false);
    k.choose('ps2');
    expect([store.get(PICTURE_KEY), k.get(), heard]).toEqual(['ps2', 'ps2', []]);
    k.choose('modern');
    expect([store.get(PICTURE_KEY), k.get(), heard]).toEqual(['modern', 'modern', ['modern']]);
  });

  it('clear() empties the saved picture and reads the class default again, told once (D)', () => {
    const { store, read, write } = memory([[PICTURE_KEY, 'modern']]);
    const heard: string[] = [];
    const k = pictureKeeper(read, write, () => 'xbox');
    k.observe((p) => heard.push(p));
    k.clear();
    expect([store.get(PICTURE_KEY) ?? '', k.get(), heard]).toEqual(['', 'ps2', ['ps2']]);
    const std = memory([[PICTURE_KEY, 'ps2']]);
    const s = pictureKeeper(std.read, std.write, () => 'standard');
    s.clear();
    expect([std.store.get(PICTURE_KEY) ?? '', s.get()]).toEqual(['', 'modern']);
  });
});
