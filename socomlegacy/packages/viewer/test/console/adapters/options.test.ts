// @vitest-environment jsdom
import { STANCE_MODE_ABOUT, STANCE_MODE_KEY } from '../../../src/startupSettings';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardSlots } from '@s2u/card';
import type { ValveEntry } from '@s2u/ui';
import { bootConsole, type ConsolePage } from '../../../src/console/app';
import { liveOptions, CONSOLE_KEYS, DETAIL_DISTANCE_ROW, PERF_LINE_COPIED_MS_ADAPTATION, PERF_LINE_ROW, RENDER_SCALE_ROW, SHADOWS_ROW, SHOW_FPS_ROW, VIDEO_PICTURE_ROW } from '../../../src/console/adapters/options';
import { FPS_SHOWN_KEY } from '../../../src/matchFps';
import { VIDEO_SETTINGS_KEY, videoSettingsKeeper, type VideoSettings } from '../../../src/videoSettings';
import { DETAIL_DISTANCE_KEY } from '../../../src/detailDistance';
import { GRAPHICS_BACKEND_KEY } from '../../../src/graphicsBackend';
import { PICTURE_KEY, pagePicture, pictureExperimentalSettings } from '../../../src/picture';
import { VIDEO_PICTURE_CAPTIONS, VIDEO_PICTURE_HD_OFFERED } from '@s2u/ui';
import { IOS_STORAGE_NOTE, setInstallPromptForTest, type InstallSurface } from '../../../src/pwa/install';
import { sampleAdapters } from '../../../src/console/sampleAdapters';
import type { Adapters } from '../../../src/console/state';
import type { DiscAssets } from '../../../src/modern/discAssets';
import type { LauncherSnapshot, LauncherState } from '../../../src/modern/launcherState';
import { cardOptionStore } from '../../../src/modern/settings/store';
import { mountShell } from '../shell';
import { optRows } from '../optRows';

/**
 * The console launcher's options adapter (slice 2, part i, CX-5): the real set only -- the memory card's option valves
 * and system tuners as the modern settings read and write them (`../../src/modern/settings/model` `CONTROLS`, through
 * `settings/store` `cardOptionStore` and its card-save boundary), what the card lacks locked "Needs disc" until the
 * disc's table gives its default; the browser's (the controller, its stick dead zone, the button mapping, the
 * microphone); the launcher's own (Interface size, Scanline overlay, Backdrop motion, under `s2u.console.v1.*`); Remember
 * me (PERSONA-PERSIST (a), OT.R61: chosen on the sign-in, ticked by default). None of the prototype's proposals the emulator and server do not support (CX.R5).
 * A memory card over an in-memory storage. A browser adaptation with no original (OT.R28).
 */
let page: ConsolePage | null = null;
beforeEach(() => { localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; localStorage.clear(); });
const flush = async (): Promise<void> => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); };

const memory = (): CardSlots => {
  const m = new Map<string, string>();
  const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); } };
  return new CardSlots(() => storage as unknown as Storage, () => undefined, { now: () => 5_000 });
};
const TABLE: ValveEntry[] = [
  { name: 'BOBBING_1ST_PERSON', value: 1, type: 'PERSIST' }, { name: 'DISPLAY_MP_TEAM_NAMES', value: 1, type: 'PERSIST' },
  { name: 'HelpWindowsEnabled', value: 1, type: 'PERSIST' }, { name: 'VIBRATION_CONTROLLER', value: 1, type: 'PERSIST' },
  { name: 'stick_preset', value: 1, type: 'PERSIST' }, { name: 'ScreenOriginX', value: 100, type: 'PERSIST' },
];
function launcher(ready: boolean): LauncherState & { set(d: LauncherSnapshot['disc']): void } {
  let disc: LauncherSnapshot['disc'] = ready ? 'ready' : 'empty';
  const subs = new Set<(s: LauncherSnapshot) => void>();
  const assets: DiscAssets = { readValveDefaults: async () => TABLE, readItemNames: async () => new Map() };
  return {
    disc: () => disc, isoInserted: () => disc === 'ready', filename: () => null, assets: () => (disc === 'ready' ? assets : null),
    onChange: (cb) => { subs.add(cb); return () => { subs.delete(cb); }; },
    set(d) { disc = d; for (const cb of [...subs]) cb({ disc: d, isoInserted: d === 'ready', filename: null }); },
  };
}

function boot(o: { ready?: boolean; slots?: CardSlots; touch?: boolean; install?: InstallSurface } = {}) {
  const slots = o.slots ?? memory();
  const store = cardOptionStore(slots);
  const l = launcher(!!o.ready);
  const touch = o.touch ?? true;
  const options = liveOptions(() => { page?.render(); }, { store, launcher: l, signedIn: () => false, pads: () => [], touch: () => touch, ...(o.install ? { install: () => o.install! } : {}) });
  const sample = sampleAdapters();
  page = bootConsole(document, window, { ...sample, data: 'live', states: undefined, options, session: { ...sample.session, signedIn: () => false } } as Adapters, { keymap: true });
  return { ctl: page.ctl, store, options, launcher: l, slots };
}
const open = (ctl: ConsolePage['ctl'], cat: string): void => { ctl.doAct(`opt:${cat}`); page!.render(); };
// LR-5: the rows in LR-1's row kinds, read as the rollers were: [label, the word where the value was] (`../optRows`).
const rollers = (): [string, string][] => optRows();
const aside = (): string => document.querySelector('#stage .cx-aside__note')!.textContent!;

describe('B61 F3, part 2: Options > Mobile shows only where touch exists', () => {
  const realMatch = window.matchMedia;
  afterEach(() => { window.matchMedia = realMatch; delete (navigator as unknown as Record<string, unknown>)['maxTouchPoints']; });
  const media = (coarse: boolean): void => {
    window.matchMedia = ((q: string) => ({ matches: q === '(pointer: coarse)' && coarse, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  };
  const touchPoints = (n: number): void => { Object.defineProperty(navigator, 'maxTouchPoints', { value: n, configurable: true }); };
  const ids = (): string[] => liveOptions(() => {}, { signedIn: () => false, pads: () => [] }).categories().map((c) => c.id);

  it('no touch (a fine pointer, no touch points; or no matchMedia at all): no Mobile category, no Touch layout row', () => {
    media(false); touchPoints(0);
    expect(ids()).toEqual(['display', 'app', 'appearance', 'audio', 'controller', 'communication', 'account']);   // LR-5: Appearance
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    expect(ids()).not.toContain('mobile');
  });

  it("touch -- matchMedia('(pointer: coarse)'), or navigator.maxTouchPoints > 0 -- shows it", () => {
    media(true); touchPoints(0);
    expect(ids()).toContain('mobile');
    media(false); touchPoints(5);
    expect(ids()).toContain('mobile');
  });

  it('the screen draws the Mobile tab only with touch', () => {
    const { ctl } = boot({ touch: false });
    ctl.doAct('opt:display');
    page!.render();
    expect([...document.querySelectorAll('#stage [data-act="optcat"]')].map((e) => e.textContent!.trim())).not.toContain('Mobile');
  });
});

describe('the options adapter: the real set', () => {
  it('mobile options alongside the existing categories, without unsupported proposals', () => {
    const { options } = boot();
    expect(options.categories().map((c) => c.label)).toEqual(['Display', 'App', 'Appearance', 'Audio', 'Controller', 'Mobile', 'Communication', 'Account']);
    expect(options.categories().find((c) => c.id === 'mobile')?.rows).toEqual([
      expect.objectContaining({ id: 'mobile-layout', label: 'Touch layout', action: 'Edit layout' }),
    ]);
    const labels = options.categories().flatMap((c) => c.rows.map((r) => r.label));
    for (const gone of ['Internal resolution', 'Aspect ratio', 'Frame rate', 'Picture smoothing', 'Show ping in rooms', 'Connection test', 'Master volume']) {
      expect(labels).not.toContain(gone);
    }
    expect(options.categories().find((c) => c.id === 'audio')!.rows.map((r) => r.label)).toEqual(['Music volume', 'Sound volume', 'Dialog volume', 'Headset volume', 'Sound mode']);
    // CX-52's two rows (B114), moved to Appearance by LR-5 with their keys (`../appearance.test.ts`).
    expect(options.categories().find((c) => c.id === 'appearance')!.rows.map((r) => r.label).slice(-4)).toEqual(['Launcher sounds', 'Launcher sound volume', 'Interface size', 'Scanline overlay']);   // LR-13: the two from App after them
  });

  it('a tuner the card lacks shows the code\'s default; a step of 2% writes it to the card', () => {
    const { ctl, store } = boot();
    open(ctl, 'audio');
    expect(rollers()[0]).toEqual(['Music volume', '74%']);
    expect(aside()).toBe('Saved to your memory card (slot 1).');
    ctl.press('right');
    expect(store.tuner('MUSIC_VOLUME')).toBeCloseTo(0.76, 5);
    expect(rollers()[0]).toEqual(['Music volume', '76%']);
    ctl.press('square');
    expect(store.tuner('MUSIC_VOLUME')).toBeCloseTo(0.74, 5);
    expect(ctl.S.toast).toBe('Music volume reset to 74%');
  });

  it('a valve the card lacks waits on the disc: Needs disc; with the disc\'s table its default, and a change saves', async () => {
    const out = boot({ ready: false });
    open(out.ctl, 'display');
    const headBob = (): [string, string] => rollers().find(([l]) => l === 'Head bob')!;
    expect(headBob()).toEqual(['Head bob', 'Needs disc']);
    out.ctl.S.opt.row = 1;
    out.ctl.press('right');
    expect(out.store.valve('BOBBING_1ST_PERSON')).toBeUndefined();
    page!.dispose();
    mountShell(document);
    const inn = boot({ ready: true, slots: out.slots });
    await flush();
    open(inn.ctl, 'display');
    expect(headBob()).toEqual(['Head bob', 'On']);
    inn.ctl.S.opt.row = 1;
    inn.ctl.press('left');
    expect(inn.store.valve('BOBBING_1ST_PERSON')).toBe(0);
    inn.launcher.set('empty');                            // what the card now holds stays editable without the disc
    page!.render();
    expect(headBob()).toEqual(['Head bob', 'Off']);
  });

  it('the stick tuners work with the Custom preset only; a preset chosen writes its three sliders (SetStickPreset), which Custom then keeps', async () => {
    const { ctl, store } = boot({ ready: true });
    await flush();
    open(ctl, 'controller');
    expect(rollers().find(([l]) => l === 'Look speed')![1]).toBe('Custom preset');
    const preset = rollers().findIndex(([l]) => l === 'Stick preset');
    ctl.S.opt.row = preset;
    ctl.press('right');                                     // Soldier (the table's 1) to Seal: its sliders written
    expect(rollers()[preset]).toEqual(['Stick preset', 'Seal']);
    expect([store.tuner('STICK_SENSITIVITY'), store.tuner('STICK_INERTIA')]).toEqual([1, 0.75]);
    expect(store.tuner('STICK_DEADZONE')).toBeCloseTo(0.3, 6);
    ctl.press('right');
    expect(rollers()[preset]).toEqual(['Stick preset', 'Custom']);
    const at = (label: string): string => rollers().find(([l]) => l === label)![1];
    expect([at('Look speed'), at('Acceleration'), at('Dead zone')]).toEqual(['100%', '75%', '30%']);   // Seal's, kept
  });

  it('Custom with no sliders ever stored shows the boot\'s preset (RECRUIT\'s round trip), not a blank', async () => {
    const slots = memory();
    const { ctl, store } = boot({ ready: true, slots });
    await flush();
    store.setValve('stick_preset', 3);
    open(ctl, 'controller');
    const at = (label: string): string => rollers().find(([l]) => l === label)![1];
    expect([at('Look speed'), at('Acceleration'), at('Dead zone')]).toEqual(['50%', '25%', '58%']);
  });

  it('the launcher\'s own: Interface size refits at once, the scanlines and the drift draw on the backdrop; this browser keeps them', () => {
    const { ctl } = boot();
    const at = (label: string): number => rollers().findIndex(([l]) => l === label);
    open(ctl, 'appearance');                                // LR-13 (LR.R16 (5)): the two rows moved from App
    ctl.S.opt.row = at('Interface size');
    ctl.press('right');
    expect(localStorage.getItem(CONSOLE_KEYS.uiscale)).toBe('1');
    expect(document.documentElement.style.fontSize).not.toBe('');
    expect(aside()).toContain('Saved to this browser.');
    ctl.S.opt.row = at('Scanline overlay');
    ctl.press('left');
    expect(document.getElementById('backdrop')!.classList.contains('is-scan')).toBe(false);
    ctl.press('right');
    expect(document.getElementById('backdrop')!.classList.contains('is-scan')).toBe(true);
  });

  // LATER 197 (the merge controller's call, 2026-10-21): never set, the two read Off. LR-37 (the owner, 2026-10-29: "Turn
  // Backdrop motion on by default.") overturns it for Backdrop motion: never set it reads On, its default is On, a reset
  // keeps On, and the backdrop drifts. Scanline overlay stays Off.
  it('LR-37: never set, Backdrop motion reads On (default On, a reset keeps On, the backdrop drifts); Scanline overlay Off', () => {
    const { options } = boot();
    const rows = options.categories().flatMap((c) => c.rows);
    for (const [id, want] of [['scan', 0], ['drift', 1]] as const) {
      expect(localStorage.getItem(CONSOLE_KEYS[id]), id).toBeNull();
      expect(options.value(id), id).toBe(want);
      expect(rows.find((r) => r.id === id)!.def, id).toBe(want);
      options.reset(id);
      expect(options.value(id), `${id} after a reset`).toBe(want);
    }
    expect(document.getElementById('backdrop')!.classList.contains('is-scan')).toBe(false);
    expect(document.getElementById('backdrop')!.classList.contains('is-drift')).toBe(true);
  });

  // CX-14 (CX.R13, OT.R60): Button mapping is the console's own pushed screen (`../../../src/console/render/remap`), so
  // the row's words no longer send the player to the overlay ("until CX-14"); its action opens the screen (the grammar's,
  // `../remap.test.ts`) and the adapter's own action says nothing. Never the setup page (the CX-9b review, medium 1).
  it('the browser\'s: Use microphone in game writes the setup page\'s key; Button mapping is the console\'s own screen', async () => {
    const { ctl, options } = boot();
    open(ctl, 'communication');
    expect(rollers().map(([l]) => l)).toEqual(['External whispers', 'Use microphone in game', 'Microphone']);
    ctl.S.opt.row = 1;
    ctl.press('left');
    expect(localStorage.getItem('s2u.startup.v1.mic.enabled')).toBe('off');
    open(ctl, 'controller');
    const mapping = rollers().findIndex(([l]) => l === 'Button mapping');
    expect(rollers()[mapping]![1]).toBe('Choose what each button does');   // LR-20 (P12): the line, not the verb again
    const row = options.categories().flatMap((c) => c.rows).find((r) => r.id === 'remap')!;
    expect(row.note).toBe('Saved to this browser, for this controller.');
    expect(JSON.stringify(options.categories())).not.toMatch(/CX-14|In the overlay|setup page/i);
    await expect(options.action('remap')).resolves.toBeNull();
    ctl.S.opt.row = mapping;
    ctl.press('cross');
    await flush();
    expect(ctl.S.toast).toBe('');                        // no remap adapter in this boot: the row's action is the adapter's, silent
    expect(rollers().find(([l]) => l === 'Stick dead zone')![1]).toBe('Connect a controller');
  });

  // STM-1 (STM.R1, the owner, 2026-10-30, reversing OBF-11): the Stance mode row is offered again, COMBINED / SEPARATE,
  // its tooltip (the side panel's `about`) one line per mode; a Separate saved under OBF-11 reads as SEPARATE.
  it('Controller: the Stance mode row again (STM.R1), COMBINED / SEPARATE; a saved Separate reads as SEPARATE', () => {
    localStorage.setItem(STANCE_MODE_KEY, 'separate');
    const { ctl, options } = boot();
    open(ctl, 'controller');
    expect(rollers().map(([l]) => l)).toContain('Stance mode');
    expect(options.value('stance-mode')).toBe(1);
    const row = options.categories().find((c) => c.id === 'controller')!.rows.find((r) => r.id === 'stance-mode')!;
    expect(row.values).toEqual(['COMBINED', 'SEPARATE']);
    expect(row.about).toBe(STANCE_MODE_ABOUT);
    options.set('stance-mode', 0);
    expect(localStorage.getItem(STANCE_MODE_KEY)).toBe('pop');
  });

  it('Account: Remember me is chosen on the sign-in (OT.R61); Sign out needs a sign-in; (DX-3) Delete the kept disc, nothing kept', () => {
    const { ctl } = boot();
    open(ctl, 'account');
    expect(rollers()).toEqual([['Remember me on this browser', 'Chosen on the sign-in'], ['Sign out', 'Sign in to change']]);
    ctl.press('right');
    expect(rollers()[0]![1]).toBe('Chosen on the sign-in');
  });

  it('a card that cannot be read locks the card\'s rows in its words', () => {
    const slots = memory();
    const store = cardOptionStore(slots);
    vi.spyOn(store, 'usable').mockReturnValue(false);
    const options = liveOptions(() => {}, { store, launcher: launcher(true), signedIn: () => false, pads: () => [] });
    expect(options.categories().find((c) => c.id === 'audio')!.rows[0]!.locked).toBe('Card cannot be read');
  });
});

/**
 * CX-23 (MU2-6's review F1): a tuner is shown as the card holds it and stepped from what it holds, as the modern settings
 * do (`../../../src/modern/settings/index.ts` `sliderControl`) and the original's widget does (research 302 §4: the
 * slider's two-percent track step, `CSliderBar`, `FUN_00371d00`): the held value moves by SLIDER_STEP_PERCENT, never
 * snapped to the 2 % grid first. The card's tuners are float32 reals (`@s2u/ui` `SYSTEM_TUNERS`; `SetValue n` stores
 * n / 100 as a float32, research 302 §4), so a step writes `Math.fround(percent / 100)`, the value the modern settings
 * write. A browser adaptation with no original (OT.R28).
 */
describe('CX-23: a tuner off the 2 % grid', () => {
  const HEADSET = 3;                                                    // Audio: Music, Sound, Dialog, Headset, Sound mode
  const headset = (): string => rollers()[HEADSET]![1];

  it('the headset\'s 0.75 (the code\'s default) reads 75 %', () => {
    const { ctl, store } = boot();
    open(ctl, 'audio');
    expect(store.tuner('HEADSET_CONTROLLER')).toBeUndefined();
    expect(headset()).toBe('75%');
  });

  it('Right writes 0.77 and Left 0.73, as the card stores them; the row reads each', () => {
    const { ctl, store } = boot();
    open(ctl, 'audio');
    ctl.S.opt.row = HEADSET;
    ctl.press('right');
    expect(store.tuner('HEADSET_CONTROLLER')).toBe(Math.fround(0.77));
    expect(store.tuner('HEADSET_CONTROLLER')).not.toBe(0.7700000000000001);
    expect(headset()).toBe('77%');
    ctl.press('square');                                              // the default back: 0.75 exactly
    expect(store.tuner('HEADSET_CONTROLLER')).toBe(0.75);
    expect(headset()).toBe('75%');
    ctl.press('left');
    expect(store.tuner('HEADSET_CONTROLLER')).toBe(Math.fround(0.73));
    expect(headset()).toBe('73%');
  });

  it('a value the card holds off the grid is shown and stepped from where it is', () => {
    const { ctl, store } = boot();
    store.setTuner('SOUND_VOLUME', Math.fround(0.43));
    open(ctl, 'audio');
    expect(rollers()[1]).toEqual(['Sound volume', '43%']);
    ctl.S.opt.row = 1;
    ctl.press('right');
    expect(store.tuner('SOUND_VOLUME')).toBe(Math.fround(0.45));
    expect(rollers()[1]).toEqual(['Sound volume', '45%']);
  });

  it('an on-grid value steps as before: 74 % to 76 % and back, the default reset exactly', () => {
    const { ctl, store } = boot();
    open(ctl, 'audio');
    expect(rollers()[0]).toEqual(['Music volume', '74%']);
    ctl.press('right');
    expect(store.tuner('MUSIC_VOLUME')).toBe(Math.fround(0.76));
    expect(rollers()[0]).toEqual(['Music volume', '76%']);
    ctl.press('left');
    ctl.press('left');
    expect(rollers()[0]).toEqual(['Music volume', '72%']);
    ctl.press('square');
    expect(store.tuner('MUSIC_VOLUME')).toBe(Math.fround(0.74));     // the code's default, as `SYSTEM_TUNERS` holds it
    expect(ctl.S.toast).toBe('Music volume reset to 74%');
  });

  it('the bounds hold: clamped at 1 and at 0', () => {
    const { ctl, store } = boot();
    store.setTuner('HEADSET_CONTROLLER', Math.fround(0.99));
    open(ctl, 'audio');
    ctl.S.opt.row = HEADSET;
    page!.render();
    expect(headset()).toBe('99%');
    ctl.press('right');
    expect(store.tuner('HEADSET_CONTROLLER')).toBe(1);
    expect(headset()).toBe('100%');
    ctl.press('right');
    expect(store.tuner('HEADSET_CONTROLLER')).toBe(1);
    store.setTuner('HEADSET_CONTROLLER', Math.fround(0.01));
    page!.render();
    expect(headset()).toBe('1%');
    ctl.press('left');
    expect(store.tuner('HEADSET_CONTROLLER')).toBe(0);
    expect(headset()).toBe('0%');
    ctl.press('left');
    expect(store.tuner('HEADSET_CONTROLLER')).toBe(0);
  });
});

describe('PWA-6: Options > App > Install app opens a dialog; a pad press does not install', () => {
  afterEach(() => { setInstallPromptForTest(null, false); });

  it('the sample App category mirrors the install entry without installing', () => {
    const ids = sampleAdapters().options.categories().flatMap((c) => c.rows.map((r) => r.id));
    expect(ids).toContain('install-app');
  });

  it('Cross on the row opens the dialog and does not call prompt(); Circle closes; the iOS note is on the dialog', () => {
    const prompt = vi.fn();
    setInstallPromptForTest(prompt, true);
    const { ctl, options } = boot({ install: 'chromium' });
    expect(options.categories().flatMap((c) => c.rows).some((r) => r.id === 'install-app')).toBe(true);
    open(ctl, 'app'); ctl.press('cross');
    expect(ctl.S.overlay).toBe('install');
    expect(prompt).not.toHaveBeenCalled();
    const dialog = document.querySelector('[data-key="install"]')!;
    expect(dialog.querySelector('[data-pwa-ios-note]')!.textContent).toBe(IOS_STORAGE_NOTE);
    const button = dialog.querySelector('[data-pwa-install]')!;
    expect(button.tagName).toBe('BUTTON');
    expect(button.hasAttribute('data-pwa-install')).toBe(true);
    expect(button.textContent).toContain('Install');
    ctl.press('cross');
    expect(prompt).not.toHaveBeenCalled();
    expect(ctl.S.overlay).toBe('install');
    ctl.press('circle');
    expect(ctl.S.overlay).toBeNull();
  });
});

// PF.R60 (the owner: "please make this a slider, and for modern mode, double the default. ps2 mode keeps the
// original."): Display's Detail distance, the page's one setting (`../../../src/detailDistance`), shared with the Forge.
describe('Display: Detail distance (PF.R60, a browser adaptation)', () => {
  it('reads 2.0× by default, steps by 0.1 into the one page key, resets to 2.0×, and clamps at 1.0× and 4.0×', () => {
    const { ctl, options } = boot();
    const row = options.categories().find((c) => c.id === 'display')!.rows.find((r) => r.id === DETAIL_DISTANCE_ROW)!;
    expect(row).toMatchObject({ label: 'Detail distance', def: 10 });
    expect(row.values).toHaveLength(31);
    expect(row.locked).toBeUndefined();
    open(ctl, 'display');
    expect(rollers().find(([l]) => l === 'Detail distance')).toEqual(['Detail distance', '2.0×']);
    options.step!(DETAIL_DISTANCE_ROW, 1);
    expect([options.value(DETAIL_DISTANCE_ROW), localStorage.getItem(DETAIL_DISTANCE_KEY)]).toEqual([11, '2.1']);
    options.reset(DETAIL_DISTANCE_ROW);
    expect(localStorage.getItem(DETAIL_DISTANCE_KEY)).toBe('2');
    options.set(DETAIL_DISTANCE_ROW, 30);
    options.step!(DETAIL_DISTANCE_ROW, 1);
    expect(localStorage.getItem(DETAIL_DISTANCE_KEY)).toBe('4');
    options.set(DETAIL_DISTANCE_ROW, 0);
    options.step!(DETAIL_DISTANCE_ROW, -1);
    expect(localStorage.getItem(DETAIL_DISTANCE_KEY)).toBe('1');
  });

  it('under the PS2 picture the row is locked at the original and a step writes nothing', () => {
    localStorage.setItem(PICTURE_KEY, 'ps2');
    localStorage.setItem(DETAIL_DISTANCE_KEY, '3');
    const { options } = boot();
    const row = options.categories().find((c) => c.id === 'display')!.rows.find((r) => r.id === DETAIL_DISTANCE_ROW)!;
    expect(row.locked).toBe('PS2 picture: original');
    options.step!(DETAIL_DISTANCE_ROW, 1);
    expect(localStorage.getItem(DETAIL_DISTANCE_KEY)).toBe('3');
  });
});


describe('Display: graphics compatibility (browser adaptation)', () => {
  it('offers a saved compatibility setting without a disc and resets to automatic', () => {
    const { options } = boot();
    const row = options.categories().find(c => c.id === 'display')!.rows.find(r => r.id === 'graphics-backend')!;
    // WEBGL2-DEFAULT (the owner's word, 2026-11-05; a browser adaptation): Automatic is WebGL2; WebGPU is its own value.
    expect(row).toMatchObject({ label: 'Graphics mode', values: ['Automatic', 'Compatibility', 'Xbox', 'WebGPU'], def: 0 });
    expect(row.about).toBe('Automatic uses WebGL2 for now, the same as Compatibility. WebGPU asks for WebGPU where the browser offers it; if the game loads to a black screen, use Automatic or Compatibility. Xbox also turns off edge smoothing for better performance.');
    expect(row.locked).toBeUndefined();
    expect(row.note).toContain('Reload');
    options.set('graphics-backend', 1);
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('webgl2');
    expect(options.value('graphics-backend')).toBe(1);
    options.set('graphics-backend', 2);
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('xbox');
    expect(options.value('graphics-backend')).toBe(2);
    options.set('graphics-backend', 3);
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('webgpu');
    expect(options.value('graphics-backend')).toBe(3);
    options.reset('graphics-backend');
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('auto');
    options.set('graphics-backend', 99);
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('auto');
  });
  it('shows and locks an address override rather than pretending the saved choice is active', () => {
    history.replaceState(null, '', '/?renderer=webgl2');
    try {
      const { options } = boot();
      const row = options.categories().find(c => c.id === 'display')!.rows.find(r => r.id === 'graphics-backend')!;
      expect(row.locked).toBe('Selected by address: Compatibility');
      expect(options.value('graphics-backend')).toBe(1);
      options.reset('graphics-backend');
      expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBeNull();
    } finally { history.replaceState(null, '', '/'); }
  });
  it('names a ?renderer=webgpu address as WebGPU (WEBGL2-DEFAULT)', () => {
    history.replaceState(null, '', '/?renderer=webgpu');
    try {
      const { options } = boot();
      const row = options.categories().find(c => c.id === 'display')!.rows.find(r => r.id === 'graphics-backend')!;
      expect(row.locked).toBe('Selected by address: WebGPU');
      expect(options.value('graphics-backend')).toBe(3);
    } finally { history.replaceState(null, '', '/'); }
  });
});

// HD-4 item 4 (the owner, 2026-11-01: "make sure home gets the video too"; OT.R79, HD.R8; a browser adaptation): Home's
// Display offers the page's picture -- the one VIDEO MODE's strip sets -- through the page's one keeper (`./picture`).
// HD-HOLD (the owner, 2026-11-01: "Hide/disable the HD pack ... leave it in the build just don't allow people to turn it
// on"): while VIDEO_PICTURE_HD_OFFERED is false the row offers Modern and PS2 only and the keeper never takes the HD
// picture. Flipping the constant back makes these pins expect the third value again.
describe('Display: Video (OT.R79 / HD.R8, a browser adaptation)', () => {
  const HD = VIDEO_PICTURE_HD_OFFERED;
  const videoRow = (options: ReturnType<typeof boot>['options']) => options.categories().find((c) => c.id === 'display')!.rows.find((r) => r.id === VIDEO_PICTURE_ROW)!;
  it('offers Modern, PS2 and the strip\'s own HD caption (HD-HOLD: Modern and PS2 only), Modern by default', () => {
    const { options } = boot();
    const row = videoRow(options);
    expect(row).toMatchObject({ label: 'Video', def: 0 });
    expect(row.values).toEqual(HD ? ['Modern', 'PS2', VIDEO_PICTURE_CAPTIONS[2]] : ['Modern', 'PS2']);
    expect(VIDEO_PICTURE_CAPTIONS[2]).toBe('HD (GoE Soul)');                       // the caption stays in the build
    expect(options.value(VIDEO_PICTURE_ROW)).toBe(0);
  });
  it('a choice here is the page\'s picture: stored, heard by the keeper the VIDEO strip and a match read', () => {
    const { options } = boot();
    options.set(VIDEO_PICTURE_ROW, 0);
    const heard: string[] = [];
    const stop = pagePicture().observe((p) => heard.push(p));
    options.set(VIDEO_PICTURE_ROW, 1);
    expect([localStorage.getItem(PICTURE_KEY), pagePicture().get(), heard]).toEqual(['ps2', 'ps2', ['ps2']]);
    options.set(VIDEO_PICTURE_ROW, 2);                                              // HD-HOLD: asked anyway, the keeper refuses it
    const third = HD ? 'experimental' : 'ps2';
    expect([localStorage.getItem(PICTURE_KEY), pagePicture().get(), heard]).toEqual([third, third, HD ? ['ps2', 'experimental'] : ['ps2']]);
    // A Home-started match reads this keeper (`./frontEnd` hands it to `./matchMount`): HD (GoE Soul)'s settings, the pack
    // on; under HD-HOLD the picture stays PS2, the experimental renderer and the pack off.
    expect(pictureExperimentalSettings(pagePicture().get())).toMatchObject(HD ? { enabled: true, hdPack: true } : { enabled: false, hdPack: false });
    options.set(VIDEO_PICTURE_ROW, 0);
    expect([localStorage.getItem(PICTURE_KEY), pagePicture().get()]).toEqual(['modern', 'modern']);
    stop();
  });
  it('the VIDEO strip\'s choice (the keeper\'s set) reads back here, and PS2 still locks Detail distance', () => {
    const { options } = boot();
    pagePicture().set('modern');
    pagePicture().set('experimental');                                             // HD-HOLD: refused, the row stays Modern
    expect(options.value(VIDEO_PICTURE_ROW)).toBe(HD ? 2 : 0);
    pagePicture().set('ps2');
    expect(options.value(VIDEO_PICTURE_ROW)).toBe(1);
    const detail = options.categories().find((c) => c.id === 'display')!.rows.find((r) => r.id === DETAIL_DISTANCE_ROW)!;
    expect(detail.locked).toBe('PS2 picture: original');
    options.set(VIDEO_PICTURE_ROW, 0);
    expect(options.categories().find((c) => c.id === 'display')!.rows.find((r) => r.id === DETAIL_DISTANCE_ROW)!.locked).toBeUndefined();
  });
  it('review F2: where no front-end match follows the picture (the overlay over the test room, the forge) the row is not offered', async () => {
    const off = liveOptions(() => {}, { signedIn: () => false, pads: () => [], videoPicture: false });
    expect(off.categories().find((c) => c.id === 'display')!.rows.map((r) => r.id)).not.toContain(VIDEO_PICTURE_ROW);
    off.dispose();
    const { videoPictureFollows, OVERLAY_PAGE_KINDS } = await import('../../../src/modern/overlay/page');
    expect(OVERLAY_PAGE_KINDS.filter(videoPictureFollows)).toEqual(['console', 'front-end', 'disc']);
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const read = (f: string): string => readFileSync(resolve(import.meta.dirname, '../../../src', f), 'utf8');
    expect(read('modern/overlay/index.ts')).toMatch(/videoPicture: videoPictureFollows\(opts\.pageKind \?\? 'viewer'\)/);
    expect(read('console/adapters/index.ts')).toMatch(/videoPicture: deps\.videoPicture \?\? false/);
  });
  it('the front end keeps no picture of its own: its mount takes the page\'s keeper and hands it to the match', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(import.meta.dirname, '../../../src/frontEnd.ts'), 'utf8');
    expect(src).toMatch(/const picture = pagePicture\(\);/);
    expect(src).not.toMatch(/pictureKeeper\(\)/);
    expect(src).toMatch(/l\.mount\(doc\.body, \{[^\n]*\bpicture, /);
  });
});

// CPS-4a (CPS.R7, a browser adaptation; the owner, Craig, 2026-11-02: "Start building out new video settings with sensible
// defaults in the client itself"): Display's Render scale, Shadows and Show FPS, through the page's one video keeper
// (`../../../src/videoSettings`); Show FPS is the START menu's own key.
describe('Display: Render scale, Shadows and Show FPS (CPS.R7, a browser adaptation)', () => {
  const rowOf = (options: ReturnType<typeof boot>['options'], id: string) => options.categories().find((c) => c.id === 'display')!.rows.find((r) => r.id === id)!;
  it('the three rows sit with the browser\'s Display rows, in order, after Video', () => {
    const { options } = boot();
    const ids = options.categories().find((c) => c.id === 'display')!.rows.map((r) => r.id);
    expect(ids.slice(ids.indexOf(VIDEO_PICTURE_ROW))).toEqual([VIDEO_PICTURE_ROW, RENDER_SCALE_ROW, DETAIL_DISTANCE_ROW, SHADOWS_ROW, SHOW_FPS_ROW, 'graphics-backend', PERF_LINE_ROW]);   // CPS-5: the Copy row last
  });
  it('Render scale: Performance / Balanced / Quality, Balanced by default; Left and Right step it, Square resets to Balanced', () => {
    const { ctl, options } = boot();
    const row = rowOf(options, RENDER_SCALE_ROW);
    expect(row).toMatchObject({ label: 'Render scale', values: ['Performance', 'Balanced', 'Quality'], def: 1 });
    expect(row.locked).toBeUndefined();
    expect(options.value(RENDER_SCALE_ROW)).toBe(1);
    open(ctl, 'display');
    expect(rollers().find(([l]) => l === 'Render scale')).toEqual(['Render scale', 'Balanced']);
    const heard: VideoSettings[] = [];
    const stop = videoSettingsKeeper().observe((v) => heard.push(v));
    options.step!(RENDER_SCALE_ROW, 1);
    expect([options.value(RENDER_SCALE_ROW), JSON.parse(localStorage.getItem(VIDEO_SETTINGS_KEY)!).renderScale, videoSettingsKeeper().get().renderScale]).toEqual([2, 'quality', 'quality']);
    options.set(RENDER_SCALE_ROW, 0);
    expect(videoSettingsKeeper().get().renderScale).toBe('performance');
    options.reset(RENDER_SCALE_ROW);
    expect([options.value(RENDER_SCALE_ROW), videoSettingsKeeper().get().renderScale]).toEqual([1, 'balanced']);
    expect(heard.map((v) => v.renderScale)).toEqual(['quality', 'performance', 'balanced']);   // a match running hears each
    options.set(RENDER_SCALE_ROW, 9);
    expect(videoSettingsKeeper().get().renderScale).toBe('balanced');
    stop();
  });
  it('Render scale is locked under the PS2 picture: its 640 x 448 frame is drawn whatever is chosen', () => {
    localStorage.setItem(PICTURE_KEY, 'ps2');
    const { options } = boot();
    expect(rowOf(options, RENDER_SCALE_ROW).locked).toBe('PS2 picture: 640 x 448');
  });
  it('Shadows: Off / On, On by default; the toggle round-trips through the keeper\'s one key', () => {
    const { options } = boot();
    expect(rowOf(options, SHADOWS_ROW)).toMatchObject({ label: 'Shadows', values: ['Off', 'On'], def: 1 });
    expect(options.value(SHADOWS_ROW)).toBe(1);
    options.set(SHADOWS_ROW, 0);
    expect([options.value(SHADOWS_ROW), JSON.parse(localStorage.getItem(VIDEO_SETTINGS_KEY)!).shadows, videoSettingsKeeper().get().shadows]).toEqual([0, false, false]);
    options.reset(SHADOWS_ROW);
    expect(videoSettingsKeeper().get().shadows).toBe(true);
  });
  it('Show FPS: Off / On, Off by default -- the START menu\'s SHOW FPS key, both ways', () => {
    const { options } = boot();
    expect(rowOf(options, SHOW_FPS_ROW)).toMatchObject({ label: 'Show FPS', values: ['Off', 'On'], def: 0 });
    expect(options.value(SHOW_FPS_ROW)).toBe(0);
    options.set(SHOW_FPS_ROW, 1);
    expect([localStorage.getItem(FPS_SHOWN_KEY), videoSettingsKeeper().get().showFps]).toEqual(['1', true]);
    localStorage.setItem(FPS_SHOWN_KEY, '0');                                       // the START menu's row, in a match
    expect(options.value(SHOW_FPS_ROW)).toBe(0);
    expect(localStorage.getItem(VIDEO_SETTINGS_KEY)).toBeNull();                    // the readout's key only
  });
});

// CPS-5 (product track, a browser adaptation with no original): Display's "Copy performance line" -- the page's one line
// (`../../../src/perfLine` `pagePerfLine`) written to the clipboard on Cross or a click; where the clipboard refuses, the
// line itself in the row's aside, to select by hand. The overlay over a match draws the same rows.
describe('Display: Copy performance line (CPS-5, a browser adaptation)', () => {
  const LINE = 's2u perf v0.4.2 | Chrome 142 Windows | R | webgpu | dpr 1 | buffer 1x1 of 1x1 css | 60 Hz | balanced, shadows on | no match | no frames, long tasks ?';
  const make = (clipboard: { writeText(t: string): Promise<void> } | null, notify = vi.fn()) => ({
    notify,
    options: liveOptions(notify, { signedIn: () => false, pads: () => [], touch: () => false, perfLine: () => LINE, clipboard: () => clipboard }),
  });
  const row = (options: ReturnType<typeof make>['options']) => options.categories().find((c) => c.id === 'display')!.rows.find((r) => r.id === PERF_LINE_ROW)!;
  afterEach(() => { vi.useRealTimers(); });

  it('is an action row, last under "This browser": Copy', () => {
    const { options } = make(null);
    const ids = options.categories().find((c) => c.id === 'display')!.rows.map((r) => r.id);
    expect(ids.at(-1)).toBe(PERF_LINE_ROW);
    expect(row(options)).toMatchObject({ label: 'Copy performance line', action: 'Copy' });
    expect(row(options).values).toBeUndefined();
    expect(row(options).about).toMatch(/frame times/);
  });

  it('Cross writes the line to the clipboard and the row says Copied for two seconds', async () => {
    vi.useFakeTimers();
    const written: string[] = [];
    const { options, notify } = make({ writeText: async (t) => { written.push(t); } });
    expect(await options.action(PERF_LINE_ROW)).toBe('Performance line copied');
    expect(written).toEqual([LINE]);
    expect(row(options).action).toBe('Copied');
    expect(PERF_LINE_COPIED_MS_ADAPTATION).toBe(2000);
    vi.advanceTimersByTime(1999);
    expect(row(options).action).toBe('Copied');
    const before = notify.mock.calls.length;
    vi.advanceTimersByTime(1);
    expect(row(options).action).toBe('Copy');
    expect(notify.mock.calls.length).toBe(before + 1);              // drawn again when the word goes back
  });

  it("a clipboard that refuses, or none: the line itself in the row's aside, to select", async () => {
    for (const clip of [{ writeText: () => Promise.reject(new Error('NotAllowedError')) }, null]) {
      const { options } = make(clip);
      expect(await options.action(PERF_LINE_ROW)).toBe("The browser refused the clipboard: the line is in this row's note");
      expect(row(options).action).toBe('Copy');
      expect(row(options).about).toBe(LINE);
      expect(row(options).note).toMatch(/Select the line/);
    }
  });

  it('dispose stops the two-second timer', async () => {
    vi.useFakeTimers();
    const { options, notify } = make({ writeText: async () => {} });
    await options.action(PERF_LINE_ROW);
    options.dispose();
    const before = notify.mock.calls.length;
    vi.advanceTimersByTime(5000);
    expect(notify.mock.calls.length).toBe(before);
  });
});
