// @vitest-environment jsdom
import { STANCE_MODE_ABOUT, STANCE_MODE_KEY } from '../../../src/startupSettings';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardSlots } from '@s2u/card';
import type { ValveEntry } from '@s2u/ui';
import { bootConsole, type ConsolePage } from '../../../src/console/app';
import { liveOptions, type LiveOptions, AMBIENCE_VOLUME_ROW, CONSOLE_KEYS, DETAIL_DISTANCE_ROW, DEVICE_DETECTED_ROW, DEVICE_MEMORY_ROW, DEVICE_NOT_RIGHT_ROW, CLAN_TAGS_ROW, LIGHTWEIGHT_MATCH_ROW, NAME_TAGS_ROW, JOIN_LEAVE_LINE_ROW, PERF_LINE_COPIED_MS_ADAPTATION, PERF_LINE_ROW, RANGE_READOUT_ROW, RENDER_SCALE_ROW, SHADOWS_ROW, SHOW_FPS_ROW, VIDEO_PICTURE_ROW, VIDEO_PRESET_ROW, VIDEO_RESTORE_ROW, VIDEO_ROW_IDS, VIDEO_SHAPE_ROW } from '../../../src/console/adapters/options';
import { MODS_LINK_ROW, TEXTURE_PACK_ROW, TEXTURES_SECTION } from '../../../src/console/texturePackSetting';
import { NAME_TAGS_KEY } from '../../../src/nameTags';
import { CLAN_TAGS_KEY } from '../../../src/clanTagOption';
import { AMBIENCE_VOLUME_KEY } from '../../../src/ambienceVolume';
import { RANGE_READOUT_KEY } from '../../../src/rangeReadout';
import { JOIN_LEAVE_LINE_KEY } from '../../../src/joinLeaveLine';
import { FPS_SHOWN_KEY } from '../../../src/matchFps';
import { PRESET_VALUES, VIDEO_SCHEMA, videoSettingsKeeperV2, type VideoSettingsV2 } from '../../../src/videoSettings';
import { DETAIL_DISTANCE_KEY } from '../../../src/detailDistance';
import { GRAPHICS_BACKEND_APPLY_NOTE, GRAPHICS_BACKEND_KEY } from '../../../src/graphicsBackend';
import { PICTURE_KEY, pagePicture, type VideoPicture } from '../../../src/picture';
import { pageShape, SHAPE_KEY } from '../../../src/shape';
import { VIDEO_PICTURE_CAPTIONS } from '@s2u/ui';
import { GRAPHICS_DEMOTED_KEY } from '../../../src/graphicsDemotion';
import { LIGHTWEIGHT_MATCH_KEY } from '../../../src/lightweightMatchOptIn';
import { IOS_STORAGE_NOTE, setInstallPromptForTest, type InstallSurface } from '../../../src/pwa/install';
import { sampleAdapters } from '../../../src/console/sampleAdapters';
import { optCategories, type Adapters, type ConsoleState } from '../../../src/console/state';
import type { DiscAssets } from '../../../src/modern/discAssets';
import type { LauncherSnapshot, LauncherState } from '../../../src/modern/launcherState';
import { cardOptionStore, TUNER_SAVE_SETTLE_MS_ADAPTATION } from '../../../src/modern/settings/store';
import { observeOptionCommits } from '../../../src/nativeOptionsContext';
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
/** VS-2: every boot's adapter (a test may boot twice), disposed after its test -- its video keeper's observer would otherwise draw every later test's page. */
const booted: { dispose(): void }[] = [];
beforeEach(() => { localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; for (const b of booted.splice(0)) b.dispose(); localStorage.clear(); });
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
  booted.push(options);
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
    expect(options.categories().find((c) => c.id === 'audio')!.rows.map((r) => r.label)).toEqual(['Music volume', 'Sound volume', 'Dialog volume', 'Headset volume', 'Sound mode', 'Ambience volume']);   // LATER 1177(b): the browser's ambience volume last
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
    expect(rollers().map(([l]) => l)).toEqual(['External whispers', 'Use microphone in game', 'Microphone', 'Streamer mode']);   // STREAMER-P1: the master row last
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
    expect(rollers().find(([l]) => l === 'Pad dead zone (this browser)')![1]).toBe('Connect a controller');   // SS-1 D2: named apart from the card's Dead zone
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


describe('Display: Graphics (VS-2: the schema\'s renderer row, through the video keeper; VS.R4)', () => {
  const rowOf = (options: ReturnType<typeof boot>['options']) => options.categories().find(c => c.id === 'display')!.rows.find(r => r.id === 'graphics-backend')!;
  it('Automatic / WebGL2 / WebGPU, Automatic by default; a choice saves through the keeper, which an observer (a prepared match) hears', () => {
    const { options } = boot();
    const row = rowOf(options);
    expect(row).toMatchObject({ label: 'Renderer', values: ['Automatic', 'WebGL2', 'WebGPU'], def: 0 });   // VIDEO-SHAPE C1: the plain name
    expect(row.about).toBe(VIDEO_SCHEMA.find((r) => r.key === 'graphics')!.effect);
    expect(row.locked).toBeUndefined();
    expect(row.note).toContain(GRAPHICS_BACKEND_APPLY_NOTE);
    expect(row.note).not.toMatch(/Reload/);
    const heard: VideoSettingsV2[] = [];
    const stop = videoSettingsKeeperV2().observe((v) => heard.push(v));
    options.set('graphics-backend', 2);
    expect([localStorage.getItem(GRAPHICS_BACKEND_KEY), options.value('graphics-backend'), heard.map((v) => v.graphics)]).toEqual(['webgpu', 2, ['webgpu']]);
    options.set('graphics-backend', 1);
    expect([localStorage.getItem(GRAPHICS_BACKEND_KEY), options.value('graphics-backend')]).toEqual(['webgl2', 1]);
    options.reset('graphics-backend');
    expect([localStorage.getItem(GRAPHICS_BACKEND_KEY), options.value('graphics-backend')]).toEqual(['auto', 0]);
    options.set('graphics-backend', 99);
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('auto');
    expect(heard.map((v) => v.graphics)).toEqual(['webgpu', 'webgl2', 'auto']);
    stop();
  });
  it('never through saveGraphicsBackend: no observer would hear it (VS-6\'s dependency); no reload text anywhere in the adapter', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(import.meta.dirname, '../../../src/console/adapters/options.ts'), 'utf8');
    expect(src).not.toMatch(/saveGraphicsBackend\(/);
    expect(src).not.toMatch(/Reload the page/);
  });
  it('a saved Xbox pick reads Automatic and is never cleared by the row\'s reset; "Not right?" under Detected clears it (VS-7 F5)', async () => {
    const { options } = boot();
    expect(options.categories().find(c => c.id === 'display')!.rows.map((r) => r.id)).not.toContain(DEVICE_NOT_RIGHT_ROW);
    localStorage.setItem(GRAPHICS_BACKEND_KEY, 'xbox');
    options.reset('graphics-backend');
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('xbox');
    const ids = options.categories().find(c => c.id === 'display')!.rows.map((r) => r.id);
    expect(ids.indexOf(DEVICE_NOT_RIGHT_ROW)).toBe(ids.indexOf(DEVICE_DETECTED_ROW) + 1);
    expect(await options.action(DEVICE_NOT_RIGHT_ROW)).toMatch(/Automatic/);
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('auto');
    expect(options.categories().find(c => c.id === 'display')!.rows.map((r) => r.id)).not.toContain(DEVICE_NOT_RIGHT_ROW);
  });
  // WG-7 (W5; WEBGPU-DEFAULT, MEGA.R8): after a WebGPU error demoted Automatic, the WebGL2 value says why (the VS-2 row's
  // own words); a choice made here, even the value held, clears it.
  it('a demoted Automatic shows as WebGL2 (set after a WebGPU error) until the player chooses again', () => {
    localStorage.setItem(GRAPHICS_BACKEND_KEY, 'webgl2');
    localStorage.setItem(GRAPHICS_DEMOTED_KEY, 'WebGPU device lost at 03:30:43Z');
    const { options } = boot();
    const row = (): { values?: readonly string[] } => options.categories().find(c => c.id === 'display')!.rows.find(r => r.id === 'graphics-backend')!;
    expect(row().values).toEqual(['Automatic', 'WebGL2 (set after a WebGPU error)', 'WebGPU']);
    expect(options.value('graphics-backend')).toBe(1);
    options.set('graphics-backend', 1);
    expect(localStorage.getItem(GRAPHICS_DEMOTED_KEY)).toBeNull();
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('webgl2');
    expect(row().values).toEqual(['Automatic', 'WebGL2', 'WebGPU']);
  });
  // Review F1 (2026-11-09): a named preset or Restore defaults moves the saved Graphics mode off WebGL2 through the
  // keeper; the reason goes with it, so a later WebGL2 pick of the player's own reads plain "WebGL2".
  it('a preset or Restore defaults after a demotion forgets the reason: a later WebGL2 pick reads plain WebGL2 (review F1)', async () => {
    const row = (o: ReturnType<typeof boot>['options']): { values?: readonly string[] } => o.categories().find(c => c.id === 'display')!.rows.find(r => r.id === 'graphics-backend')!;
    for (const leave of ['preset', 'restore'] as const) {
      localStorage.clear();
      localStorage.setItem(GRAPHICS_BACKEND_KEY, 'webgl2');
      localStorage.setItem(GRAPHICS_DEMOTED_KEY, 'WebGPU device lost at 03:30:43Z');
      const { options } = boot();
      if (leave === 'preset') options.set(VIDEO_PRESET_ROW, 2);
      else await options.action(VIDEO_RESTORE_ROW);
      expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).not.toBe('webgl2');
      expect(localStorage.getItem(GRAPHICS_DEMOTED_KEY)).toBeNull();
      options.set('graphics-backend', 1);
      expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('webgl2');
      expect(row(options).values).toEqual(['Automatic', 'WebGL2', 'WebGPU']);
    }
  });
  it('shows and locks an address override rather than pretending the saved choice is active', () => {
    history.replaceState(null, '', '/?renderer=webgl2');
    try {
      const { options } = boot();
      const row = rowOf(options);
      expect(row.locked).toBe('Selected by address: WebGL2');
      expect(options.value('graphics-backend')).toBe(1);
      options.reset('graphics-backend');
      expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBeNull();
    } finally { history.replaceState(null, '', '/'); }
  });
  it('names a ?renderer=webgpu address as WebGPU (WEBGPU-DEFAULT)', () => {
    history.replaceState(null, '', '/?renderer=webgpu');
    try {
      const { options } = boot();
      expect(rowOf(options).locked).toBe('Selected by address: WebGPU');
      expect(options.value('graphics-backend')).toBe(2);
    } finally { history.replaceState(null, '', '/'); }
  });
});

// HD-4 item 4 (the owner, 2026-11-01: "make sure home gets the video too"; OT.R79, HD.R8; a browser adaptation): Home's
// Display offers the page's picture -- the one VIDEO MODE's strip sets -- through the page's one keeper (`./picture`).
// B206 ML-6 (plan 2026-11-06-mods-loader, ML.R11, R12; OT.R110): the HD (GoE SouL) value is removed with the picture and
// HD-HOLD -- the row offers Modern and PS2, and the HD pack is chosen in Home > Experiments > Mods.
describe('Display: Sharpness, the picture (OT.R79, a browser adaptation)', () => {
  const videoRow = (options: ReturnType<typeof boot>['options']) => options.categories().find((c) => c.id === 'display')!.rows.find((r) => r.id === VIDEO_PICTURE_ROW)!;
  it('offers Modern and PS2 (ML-6: no HD value), Modern by default; the about names no HD picture', () => {
    const { options } = boot();
    const row = videoRow(options);
    expect(row).toMatchObject({ label: 'Sharpness', def: 0 });                      // VIDEO-SHAPE: the row's name; its storage the picture's
    expect(row.values).toEqual(['Modern', 'PS2 pixels']);
    expect(VIDEO_PICTURE_CAPTIONS).toEqual(['MODERN', 'PS2']);
    expect(JSON.stringify(row)).not.toMatch(/GoE SouL/);
    expect(options.value(VIDEO_PICTURE_ROW)).toBe(0);
  });
  it('a choice here is the page\'s picture: stored, heard by the keeper the VIDEO strip and a match read', () => {
    const { options } = boot();
    options.set(VIDEO_PICTURE_ROW, 0);
    const heard: string[] = [];
    const stop = pagePicture().observe((p) => heard.push(p));
    options.set(VIDEO_PICTURE_ROW, 1);
    expect([localStorage.getItem(PICTURE_KEY), pagePicture().get(), heard]).toEqual(['ps2', 'ps2', ['ps2']]);
    options.set(VIDEO_PICTURE_ROW, 2);                                              // ML-6: no third value; nothing changes
    expect([localStorage.getItem(PICTURE_KEY), pagePicture().get(), heard]).toEqual(['ps2', 'ps2', ['ps2']]);
    options.set(VIDEO_PICTURE_ROW, 0);
    expect([localStorage.getItem(PICTURE_KEY), pagePicture().get()]).toEqual(['modern', 'modern']);
    stop();
  });
  it('the VIDEO strip\'s choice (the keeper\'s set) reads back here, and PS2 still locks Detail distance', () => {
    const { options } = boot();
    pagePicture().set('modern');
    pagePicture().set('experimental' as unknown as VideoPicture);                  // ML-6: no such picture, the row stays Modern
    expect(options.value(VIDEO_PICTURE_ROW)).toBe(0);
    pagePicture().set('ps2');
    expect(options.value(VIDEO_PICTURE_ROW)).toBe(1);
    const detail = options.categories().find((c) => c.id === 'display')!.rows.find((r) => r.id === DETAIL_DISTANCE_ROW)!;
    expect(detail.locked).toBe('PS2 picture: original');
    options.set(VIDEO_PICTURE_ROW, 0);
    expect(options.categories().find((c) => c.id === 'display')!.rows.find((r) => r.id === DETAIL_DISTANCE_ROW)!.locked).toBeUndefined();
  });
  it('review F2: where no match follows the picture (the overlay over the forge, the launch sheet) the row is not offered', async () => {
    const off = liveOptions(() => {}, { signedIn: () => false, pads: () => [], videoPicture: false });
    expect(off.categories().find((c) => c.id === 'display')!.rows.map((r) => r.id)).not.toContain(VIDEO_PICTURE_ROW);
    off.dispose();
    const { videoPictureFollows, OVERLAY_PAGE_KINDS } = await import('../../../src/modern/overlay/page');
    expect(OVERLAY_PAGE_KINDS.filter(videoPictureFollows)).toEqual(['console', 'front-end', 'disc', 'viewer']);   // RB-16: the test room follows it too
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

// VIDEO-SHAPE phase A (player report Q-01; the owner's accepted model, 2026-11-21; product track, a browser adaptation):
// Display's Shape row, right after Sharpness -- Fill the window / 4:3 / 4:3 stretched, through the page's one shape keeper
// (`../../../src/shape` `pageShape`, the match follows it live); locked at 4:3 under PS2 pixels; the ceiling row's values
// say the size drawn for the shape and this window.
describe('Display: Shape (VIDEO-SHAPE, a browser adaptation)', () => {
  const display = (options: ReturnType<typeof boot>['options']) => options.categories().find((c) => c.id === 'display')!.rows;
  const shapeRow = (options: ReturnType<typeof boot>['options']) => display(options).find((r) => r.id === VIDEO_SHAPE_ROW)!;
  beforeEach(() => { localStorage.clear(); pageShape().get(); });
  afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); pageShape().get(); });

  it('right after Sharpness: Fill the window by default, its three words and its about; nothing written by drawing it', () => {
    const { options } = boot();
    const ids = display(options).map((r) => r.id);
    expect(ids.indexOf(VIDEO_SHAPE_ROW)).toBe(ids.indexOf(VIDEO_PICTURE_ROW) + 1);
    const row = shapeRow(options);
    expect(row).toMatchObject({ label: 'Shape', def: 0, values: ['Fill the window', '4:3', '4:3 stretched'] });
    expect(row.locked).toBeUndefined();
    expect(row.about).toBe('4:3 frames the world as PS2 pixels does, with bars at the sides; 4:3 stretched fills a widescreen, as a 4:3 console on a widescreen television. Both show the same amount of the world.');
    expect(row.note).toBe('Saved to this browser. Applies now, in a match too.');
    expect(options.value(VIDEO_SHAPE_ROW)).toBe(0);
    expect(localStorage.getItem(SHAPE_KEY)).toBeNull();
  });

  it("a press writes the page's shape and is heard; the reset empties the key and reads Fill again", () => {
    const { options } = boot();
    const heard: string[] = [];
    const stop = pageShape().observe((s) => heard.push(s));
    options.set(VIDEO_SHAPE_ROW, 0);                                                    // a press on the shape shown: saved
    expect(localStorage.getItem(SHAPE_KEY)).toBe('fill');
    options.set(VIDEO_SHAPE_ROW, 1);
    expect([localStorage.getItem(SHAPE_KEY), pageShape().get(), options.value(VIDEO_SHAPE_ROW)]).toEqual(['4:3', '4:3', 1]);
    options.set(VIDEO_SHAPE_ROW, 2);
    expect([localStorage.getItem(SHAPE_KEY), pageShape().get(), options.value(VIDEO_SHAPE_ROW)]).toEqual(['4:3-stretched', '4:3-stretched', 2]);
    options.set(VIDEO_SHAPE_ROW, 3);                                                    // no fourth value: nothing changes
    expect(localStorage.getItem(SHAPE_KEY)).toBe('4:3-stretched');
    options.reset(VIDEO_SHAPE_ROW);
    expect([localStorage.getItem(SHAPE_KEY), pageShape().get(), options.value(VIDEO_SHAPE_ROW)]).toEqual(['', 'fill', 0]);
    expect(heard).toEqual(['4:3', '4:3-stretched', 'fill']);
    stop();
  });

  it('under PS2 pixels: shown at 4:3 and locked with the reason; a press or a reset writes nothing; back to Modern, the saved shape', () => {
    const { options } = boot();
    options.set(VIDEO_SHAPE_ROW, 2);
    options.set(VIDEO_PICTURE_ROW, 1);                                                  // PS2 pixels
    expect(shapeRow(options).locked).toBe('PS2 pixels draws the 4:3 frame');
    expect(options.value(VIDEO_SHAPE_ROW)).toBe(1);
    options.set(VIDEO_SHAPE_ROW, 0);
    options.reset(VIDEO_SHAPE_ROW);
    expect(localStorage.getItem(SHAPE_KEY)).toBe('4:3-stretched');
    options.set(VIDEO_PICTURE_ROW, 0);
    expect(shapeRow(options).locked).toBeUndefined();
    expect(options.value(VIDEO_SHAPE_ROW)).toBe(2);
  });

  it('the ceiling row\'s values say the size drawn for the shape and this window ("1440p (1920 x 1440)")', () => {
    const { options } = boot();
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(2560);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(1440);
    const before = window.devicePixelRatio;
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
    try {
      const ceiling = () => display(options).find((r) => r.id === 'video-ceiling')!.values;
      expect(ceiling()).toEqual(['720p (1280 x 720)', '1080p (1920 x 1080)', '1440p (2560 x 1440)', 'Native (2560 x 1440)', 'Device (2560 x 1440)']);
      options.set(VIDEO_SHAPE_ROW, 1);
      expect(ceiling()).toEqual(['720p (960 x 720)', '1080p (1440 x 1080)', '1440p (1920 x 1440)', 'Native (1920 x 1440)', 'Device (1920 x 1440)']);
      options.set(VIDEO_SHAPE_ROW, 2);
      expect(ceiling()).toEqual(['720p (960 x 720)', '1080p (1440 x 1080)', '1440p (1920 x 1440)', 'Native (1920 x 1440)', 'Device (1920 x 1440)']);
    } finally { Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: before }); }
  });
});

// VS-2 (the video settings plan, product track; every row a browser adaptation with no original): Display's "This browser"
// rows drawn from `VIDEO_SCHEMA` (`../../../src/videoSettings`) through the page's v2 keeper, under the spec §4.2's groups.
describe('Display: the video rows from VIDEO_SCHEMA (VS-2, a browser adaptation)', () => {
  afterEach(() => { vi.useRealTimers(); });
  const display = (options: ReturnType<typeof boot>['options']) => options.categories().find((c) => c.id === 'display')!.rows;
  const rowOf = (options: ReturnType<typeof boot>['options'], id: string) => display(options).find((r) => r.id === id);
  const BROWSER = [VIDEO_PRESET_ROW, RENDER_SCALE_ROW, 'video-ceiling', 'video-frame-cap', SHOW_FPS_ROW, SHADOWS_ROW, DETAIL_DISTANCE_ROW, 'video-antialias', 'graphics-backend', VIDEO_PICTURE_ROW, VIDEO_SHAPE_ROW, CLAN_TAGS_ROW, NAME_TAGS_ROW, RANGE_READOUT_ROW, JOIN_LEAVE_LINE_ROW, 'video-colour-filter', VIDEO_RESTORE_ROW, DEVICE_MEMORY_ROW, DEVICE_DETECTED_ROW, PERF_LINE_ROW, TEXTURE_PACK_ROW, MODS_LINK_ROW];   // WM-R20-FOLDS (b): the colour filter under every preset
  const CUSTOM = [VIDEO_PRESET_ROW, RENDER_SCALE_ROW, 'video-ceiling', 'video-frame-cap', SHOW_FPS_ROW, SHADOWS_ROW, DETAIL_DISTANCE_ROW, 'video-antialias', 'video-filtering', 'graphics-backend', 'video-power', VIDEO_PICTURE_ROW, VIDEO_SHAPE_ROW, CLAN_TAGS_ROW, NAME_TAGS_ROW, RANGE_READOUT_ROW, JOIN_LEAVE_LINE_ROW, 'video-colour-filter', VIDEO_RESTORE_ROW, DEVICE_MEMORY_ROW, DEVICE_DETECTED_ROW, PERF_LINE_ROW, TEXTURE_PACK_ROW, MODS_LINK_ROW];
  const tail = (options: ReturnType<typeof boot>['options']) => { const ids = display(options).map((r) => r.id); return ids.slice(ids.indexOf(VIDEO_PRESET_ROW)); };

  it('the rows in the schema\'s order under the groups Quality, Display, Detail, Renderer, Picture, This device; the Custom-only rows under Custom only', () => {
    const { options } = boot();
    expect(tail(options)).toEqual(BROWSER);
    expect(display(options).filter((r) => r.section !== undefined).map((r) => [r.id, r.section])).toEqual([
      [VIDEO_PRESET_ROW, 'This browser'], [RENDER_SCALE_ROW, 'Display'], [SHADOWS_ROW, 'Detail'], ['graphics-backend', 'Renderer'], [VIDEO_PICTURE_ROW, 'Picture'], [DEVICE_MEMORY_ROW, 'This device'],
      [TEXTURE_PACK_ROW, TEXTURES_SECTION],   // WM-PACKS-SETTING (a browser adaptation): the Textures rows last
    ]);
    videoSettingsKeeperV2().set({ preset: 'custom' });
    expect(tail(options)).toEqual(CUSTOM);
    for (const r of VIDEO_SCHEMA) expect(rowOf(options, VIDEO_ROW_IDS[r.key])!.about, String(r.key)).toBe(r.effect);
  });

  it("WM-R20-FOLDS (a), (b): the Colour filter row is drawn under every preset; a filter chosen there survives another preset chosen, and Restore defaults (\"Every row above back to Automatic\") clears it", async () => {
    const { options } = boot();
    const FILTER = 'video-colour-filter';
    options.set(VIDEO_PRESET_ROW, 3);                                                   // Quality
    expect(rowOf(options, FILTER)).toBeDefined();
    options.set(FILTER, 2);                                                             // Deuteranopia
    expect(videoSettingsKeeperV2().get()).toMatchObject({ preset: 'quality', colourFilter: 'deuteranopia' });
    for (const i of [0, 1, 2, 4]) {                                                     // Automatic, Performance, Balanced, Lite
      options.set(VIDEO_PRESET_ROW, i);
      expect(rowOf(options, FILTER), String(i)).toBeDefined();
      expect([videoSettingsKeeperV2().get().colourFilter, options.value(FILTER)], String(i)).toEqual(['deuteranopia', 2]);
    }
    expect(rowOf(options, VIDEO_RESTORE_ROW)).toMatchObject({ hint: 'Every row above back to Automatic' });
    expect(await options.action(VIDEO_RESTORE_ROW)).toMatch(/Automatic/);
    expect([videoSettingsKeeperV2().get().colourFilter, options.value(FILTER)]).toEqual(['off', 0]);
  });

  it('Preset: Automatic by default, Custom offered only when the rows differ; choosing a preset writes its values; a deviation flips it to Custom', () => {
    const { options } = boot();
    expect(rowOf(options, VIDEO_PRESET_ROW)).toMatchObject({ label: 'Preset', values: ['Automatic', 'Performance', 'Balanced', 'Quality', 'Lite'], def: 0 });
    expect(options.value(VIDEO_PRESET_ROW)).toBe(0);
    options.set(VIDEO_PRESET_ROW, 1);
    const v = videoSettingsKeeperV2().get();
    expect(v).toMatchObject({ preset: 'performance', ...PRESET_VALUES.performance, overlay: 'off' });
    expect(options.value(SHADOWS_ROW)).toBe(0);                                         // Performance: shadows Off (VS.R3)
    options.set(SHADOWS_ROW, 2);
    expect(videoSettingsKeeperV2().get().preset).toBe('custom');
    expect(rowOf(options, VIDEO_PRESET_ROW)!.values).toEqual(['Automatic', 'Performance', 'Balanced', 'Quality', 'Lite', 'Custom']);
    expect(options.value(VIDEO_PRESET_ROW)).toBe(5);
    options.set(VIDEO_PRESET_ROW, 3);
    expect(videoSettingsKeeperV2().get()).toMatchObject({ preset: 'quality', ...PRESET_VALUES.quality });
    expect(rowOf(options, VIDEO_PRESET_ROW)!.values).toHaveLength(5);
    options.set(VIDEO_PRESET_ROW, 4);                                                   // WM-5a: Lite, a preset like the others
    expect(videoSettingsKeeperV2().get()).toMatchObject({ preset: 'lite', frameCap: 30, shadows: 'off' });
    options.reset(VIDEO_PRESET_ROW);
    expect(videoSettingsKeeperV2().get().preset).toBe('auto');
  });

  it('Render scale: a 50-100 % slider by 5; its steps staged and written through the keeper once, 400 ms after the last (#726\'s pattern); locked under PS2', () => {
    vi.useFakeTimers();
    const { ctl, options } = boot();
    expect(rowOf(options, RENDER_SCALE_ROW)).toMatchObject({ label: 'Resolution scale', values: ['50%', '55%', '60%', '65%', '70%', '75%', '80%', '85%', '90%', '95%', '100%'], def: 10 });
    open(ctl, 'display');
    expect(document.querySelector(`#stage [data-id="${RENDER_SCALE_ROW}"]`)?.className ?? '').toMatch(/slider/);
    const heard: VideoSettingsV2[] = [];
    const stop = videoSettingsKeeperV2().observe((v) => heard.push(v));
    options.step!(RENDER_SCALE_ROW, -1);
    options.step!(RENDER_SCALE_ROW, -1);
    expect([options.value(RENDER_SCALE_ROW), videoSettingsKeeperV2().get().renderScalePct, heard.length]).toEqual([8, 100, 0]);
    vi.advanceTimersByTime(TUNER_SAVE_SETTLE_MS_ADAPTATION - 1);
    expect(heard.length).toBe(0);
    vi.advanceTimersByTime(1);
    expect([videoSettingsKeeperV2().get().renderScalePct, videoSettingsKeeperV2().get().preset, heard.length]).toEqual([90, 'custom', 1]);
    options.step!(RENDER_SCALE_ROW, 1);
    options.set(SHADOWS_ROW, 0);                                                         // another row's change writes the staged step first
    expect(videoSettingsKeeperV2().get().renderScalePct).toBe(95);
    stop();
    localStorage.setItem(PICTURE_KEY, 'ps2');
    expect(rowOf(options, RENDER_SCALE_ROW)!.locked).toBe('PS2 pixels: 640 x 448');
  });

  it('dispose writes a staged render scale step, and draws nothing into the console being torn down (review F1)', () => {
    vi.useFakeTimers();
    const { options } = boot();
    options.step!(RENDER_SCALE_ROW, -1);
    const render = vi.spyOn(page!, 'render');
    options.dispose();
    expect(videoSettingsKeeperV2().get().renderScalePct).toBe(95);
    expect(render).not.toHaveBeenCalled();
    vi.advanceTimersByTime(TUNER_SAVE_SETTLE_MS_ADAPTATION * 2);
    expect(render).not.toHaveBeenCalled();
  });

  it('one redraw per change: a row\'s own write draws once (not again through the keeper\'s observer); an outside write draws once (review F3)', () => {
    const notify = vi.fn();
    const options = liveOptions(notify, { signedIn: () => false, pads: () => [], touch: () => false });
    try {
      options.set(SHADOWS_ROW, 0);
      expect(notify).toHaveBeenCalledTimes(1);
      videoSettingsKeeperV2().set({ frameCap: 30 });                                   // the native rows, a match, another keeper
      expect(notify).toHaveBeenCalledTimes(2);
    } finally { options.dispose(); }
  });

  it('the launcher-only rows (Detected, "Not right?", Restore defaults) are drawn on the launcher and left out of the overlay; Device memory is on both (review F2)', () => {
    localStorage.setItem(GRAPHICS_BACKEND_KEY, 'xbox');                                 // "Not right?" shown
    history.replaceState(null, '', '/');
    const { options } = boot();
    const a = { options } as unknown as Adapters;
    const ids = (s: ConsoleState) => optCategories(s, a).find((c) => c.id === 'display')!.rows.map((r) => r.id);
    const launcherIds = ids({ mode: 'console' } as unknown as ConsoleState);
    const overlayIds = ids({ mode: 'overlay', page: { roundRunning: () => false, gameHolds: () => false, gamePage: () => true } } as unknown as ConsoleState);
    for (const id of [DEVICE_DETECTED_ROW, DEVICE_NOT_RIGHT_ROW, VIDEO_RESTORE_ROW]) {
      expect(launcherIds, id).toContain(id);
      expect(overlayIds, id).not.toContain(id);
    }
    expect(overlayIds).toContain(DEVICE_MEMORY_ROW);
    expect(overlayIds.filter((id) => !launcherIds.includes(id))).toEqual([]);
    expect(launcherIds.filter((id) => !overlayIds.includes(id))).toEqual([VIDEO_RESTORE_ROW, DEVICE_DETECTED_ROW, DEVICE_NOT_RIGHT_ROW]);
  });

  it('Shadows Off / Low / Medium / High; Performance overlay Off / FPS / full -- the START menu\'s SHOW FPS key; Antialias a toggle, applied at the next match', () => {
    const { options } = boot();
    expect(rowOf(options, SHADOWS_ROW)).toMatchObject({ label: 'Shadows', values: ['Off', 'Low', 'Medium', 'High'], def: 2 });
    expect(rowOf(options, SHOW_FPS_ROW)).toMatchObject({ label: 'Performance overlay', values: ['Off', 'FPS', 'FPS + frame time + ping'], def: 0 });
    options.set(SHOW_FPS_ROW, 1);
    expect([localStorage.getItem(FPS_SHOWN_KEY), videoSettingsKeeperV2().get().overlay, videoSettingsKeeperV2().get().preset]).toEqual(['1', 'fps', 'auto']);   // preset-free
    localStorage.setItem(FPS_SHOWN_KEY, '0');                                       // the START menu's row, in a match
    expect(options.value(SHOW_FPS_ROW)).toBe(0);
    const aa = rowOf(options, 'video-antialias')!;
    expect(aa).toMatchObject({ label: 'Antialias', values: ['Off', 'On'], def: 1 });
    expect(aa.note).toContain(GRAPHICS_BACKEND_APPLY_NOTE);
    expect(rowOf(options, SHADOWS_ROW)!.note).not.toContain(GRAPHICS_BACKEND_APPLY_NOTE);
  });

  it('Detail distance goes through the keeper: a v2 observer hears the step (VS-1 F1)', () => {
    const { options } = boot();
    const heard: number[] = [];
    const stop = videoSettingsKeeperV2().observe((v) => heard.push(v.detailDistance));
    options.step!(DETAIL_DISTANCE_ROW, 1);
    expect([heard, localStorage.getItem(DETAIL_DISTANCE_KEY)]).toEqual([[2.1], '2.1']);
    stop();
  });

  it('Restore defaults, one action row after the groups: Automatic, every row its values, the readout off', async () => {
    const { options } = boot();
    options.set(VIDEO_PRESET_ROW, 3);
    options.set(SHOW_FPS_ROW, 2);
    options.set('video-frame-cap', 2);
    expect(rowOf(options, VIDEO_RESTORE_ROW)).toMatchObject({ label: 'Restore defaults', action: 'Restore' });
    expect(await options.action(VIDEO_RESTORE_ROW)).toMatch(/Automatic/);
    expect(videoSettingsKeeperV2().get()).toMatchObject({ preset: 'auto', overlay: 'off', frameCap: 0 });
  });

  it("VIDEO-SHAPE (the controller's taste call C1, VIDEO-SETTINGS.md \"Plain names\"): Max resolution, Resolution scale, Renderer, Graphics chip -- words only, the ids and keys unchanged", () => {
    const { options } = boot();
    videoSettingsKeeperV2().set({ preset: 'custom' });                                 // Custom: every row drawn, Graphics chip included
    const label = (id: string) => rowOf(options, id)!.label;
    expect([label('video-ceiling'), label(RENDER_SCALE_ROW), label('graphics-backend'), label('video-power')]).toEqual(['Max resolution', 'Resolution scale', 'Renderer', 'Graphics chip']);
    expect(VIDEO_ROW_IDS).toMatchObject({ ceiling: 'video-ceiling', renderScalePct: RENDER_SCALE_ROW, graphics: 'graphics-backend', power: 'video-power' });
    expect(rowOf(options, VIDEO_RESTORE_ROW)!.note).toMatch(/Antialias, Renderer and Graphics chip: /);
    const words = display(options).map((r) => r.label);
    for (const old of ['Resolution ceiling', 'Render scale', 'Graphics', 'Power preference']) expect(words, old).not.toContain(old);
  });

  it('This device: Device memory as an estimate (the Xbox class: the browser\'s 1 GB); Detected names the class and what Automatic chose', () => {
    history.replaceState(null, '', '/');                                             // an address override left by an earlier test's page
    const nav = navigator as unknown as Record<string, unknown>;
    const perf = performance as unknown as Record<string, unknown>;
    Object.defineProperty(nav, 'deviceMemory', { value: 8, configurable: true });
    Object.defineProperty(perf, 'memory', { value: { usedJSHeapSize: 120 * 2 ** 20, jsHeapSizeLimit: 4096 * 2 ** 20 }, configurable: true });
    try {
      const { options } = boot();
      const mem = rowOf(options, DEVICE_MEMORY_ROW)!;
      expect(mem.info?.value).toBe('8 GB · about 120 MB of 4096 MB');
      expect(`${mem.label} ${mem.about}`).toMatch(/estimate/i);
      expect(rowOf(options, DEVICE_DETECTED_ROW)!.info?.value).toBe('Standard · Automatic chose: Balanced · WebGPU');                 // VS-10 F9a: and the backend Automatic chose (the spec §4); WebGPU since MEGA.R8
      localStorage.setItem(GRAPHICS_BACKEND_KEY, 'xbox');                            // the "Request Game Files (XBOX)" pick: the Xbox class
      expect(rowOf(options, DEVICE_MEMORY_ROW)!.info?.value).toBe('1 GB (the browser\'s budget)');
      expect(rowOf(options, DEVICE_DETECTED_ROW)!.info?.value).toMatch(/^Xbox · Automatic chose: .+ · WebGL2$/);
    } finally { delete nav['deviceMemory']; delete perf['memory']; }
  });
});

// SS-2 (H422 answered (a), the owner, Craig, 2026-11-07; product track, a browser adaptation): the card's Teammate names is
// the original's Off / On (DISPLAY_MP_TEAM_NAMES 0 / 1); the tags' look -- the original's or the port's adapted ones
// (LATER 671, OT.R101) -- is this browser's `s2u.viewer.nameTags`, Display's "This browser" row Name tags.
describe('Display: Teammate names Off / On on the card, Name tags Original / Modern in this browser (SS-2)', () => {
  const rowOf = (options: ReturnType<typeof boot>['options'], id: string) => options.categories().find((c) => c.id === 'display')!.rows.find((r) => r.id === id)!;
  it('Teammate names: the original\'s two values only, Off / On', () => {
    const { options } = boot();
    const row = rowOf(options, 'DISPLAY_MP_TEAM_NAMES');
    expect(row).toMatchObject({ label: 'Teammate names', values: ['Off', 'On'] });
    expect(row.about).not.toMatch(/original drew|fading/i);
  });
  it('Name tags: Original / Modern, Modern by default (what On drew in v0.4.12); the row round-trips the browser key', () => {
    const { options } = boot();
    const row = rowOf(options, NAME_TAGS_ROW);
    expect(row).toMatchObject({ label: 'Name tags', values: ['Original', 'Modern'], def: 1 });
    expect(row.locked).toBeUndefined();
    expect(row.about).toMatch(/Teammate names/);
    expect(row.note).toMatch(/this browser/i);
    expect(options.value(NAME_TAGS_ROW)).toBe(1);
    options.set(NAME_TAGS_ROW, 0);
    expect([options.value(NAME_TAGS_ROW), localStorage.getItem(NAME_TAGS_KEY)]).toEqual([0, 'original']);
    options.reset(NAME_TAGS_ROW);
    expect([options.value(NAME_TAGS_ROW), localStorage.getItem(NAME_TAGS_KEY)]).toEqual([1, 'modern']);
  });
  // PSR-5 (R4P.R11, a browser adaptation): clan tags in the in-play name labels, Shown / Hidden, Shown by default.
  it('Clan tags in names: Shown / Hidden, Shown by default; sits before Name tags in This browser; the row round-trips the browser key', () => {
    const { options } = boot();
    const row = rowOf(options, CLAN_TAGS_ROW);
    expect(row).toMatchObject({ label: 'Clan tags in names', values: ['Shown', 'Hidden'], def: 0 });
    expect(row.locked).toBeUndefined();
    expect(row.about).toMatch(/browser/i);
    expect(row.about).toMatch(/scoreboard/i);
    expect(row.note).toMatch(/this browser/i);
    const ids = options.categories().find((c) => c.id === 'display')!.rows.map((r) => r.id);
    expect(ids.indexOf(CLAN_TAGS_ROW)).toBe(ids.indexOf(NAME_TAGS_ROW) - 1);
    expect(options.value(CLAN_TAGS_ROW)).toBe(0);
    options.set(CLAN_TAGS_ROW, 1);
    expect([options.value(CLAN_TAGS_ROW), localStorage.getItem(CLAN_TAGS_KEY)]).toEqual([1, 'hidden']);
    options.reset(CLAN_TAGS_ROW);
    expect([options.value(CLAN_TAGS_ROW), localStorage.getItem(CLAN_TAGS_KEY)]).toEqual([0, 'shown']);
  });
  it("LATER 1177(b): Ambience volume, 50-100% in tens (the owner's floor), 100% by default (the original mix); the row round-trips the browser key", () => {
    const { options } = boot();
    const row = options.categories().find((c) => c.id === 'audio')!.rows.find((r) => r.id === AMBIENCE_VOLUME_ROW)!;   // Audio's, not Display's
    expect(row).toMatchObject({ label: 'Ambience volume', section: 'This browser', def: 5 });
    expect(row.values).toEqual(['50%', '60%', '70%', '80%', '90%', '100%']);
    expect(row.about).toMatch(/browser addition/);
    expect(row.note).toMatch(/this browser/i);
    expect(options.value(AMBIENCE_VOLUME_ROW)).toBe(5);
    options.set(AMBIENCE_VOLUME_ROW, 0);
    expect([options.value(AMBIENCE_VOLUME_ROW), localStorage.getItem(AMBIENCE_VOLUME_KEY)]).toEqual([0, '50']);
    localStorage.setItem(AMBIENCE_VOLUME_KEY, '20');   // v0.4.26's 20%: shown at the floor
    expect(options.value(AMBIENCE_VOLUME_ROW)).toBe(0);
    options.reset(AMBIENCE_VOLUME_ROW);
    expect([options.value(AMBIENCE_VOLUME_ROW), localStorage.getItem(AMBIENCE_VOLUME_KEY)]).toEqual([5, '100']);
  });
});

// HUD-ALIVE C (OT.R117; product track, a browser adaptation): Display's "This browser" row Range readout, Off / On, Off by
// default (the owner, Craig, 2026-11-09) -- the range finder's metres in the info box's spot, in the consoles' count's place.
describe('Display: Range readout Off / On in this browser, Off by default (HUD-ALIVE C)', () => {
  const rowOf = (options: ReturnType<typeof boot>['options'], id: string) => options.categories().find((c) => c.id === 'display')!.rows.find((r) => r.id === id)!;
  it('Off / On, Off by default; the row round-trips the browser key; it sits after Name tags', () => {
    const { options } = boot();
    const row = rowOf(options, RANGE_READOUT_ROW);
    expect(row).toMatchObject({ label: 'Range readout', values: ['Off', 'On'], def: 0 });
    expect(row.locked).toBeUndefined();
    expect(row.about).toMatch(/metres/);
    expect(row.note).toMatch(/this browser/i);
    const ids = options.categories().find((c) => c.id === 'display')!.rows.map((r) => r.id);
    expect(ids.indexOf(RANGE_READOUT_ROW)).toBe(ids.indexOf(NAME_TAGS_ROW) + 1);
    expect(options.value(RANGE_READOUT_ROW)).toBe(0);
    options.set(RANGE_READOUT_ROW, 1);
    expect([options.value(RANGE_READOUT_ROW), localStorage.getItem(RANGE_READOUT_KEY)]).toEqual([1, 'on']);
    options.reset(RANGE_READOUT_ROW);
    expect([options.value(RANGE_READOUT_ROW), localStorage.getItem(RANGE_READOUT_KEY)]).toEqual([0, 'off']);
  });
});

// PRS-888 (JOIN-LEAVE-LINE; product track, a browser adaptation): Display's "This browser" row Join/leave lines, Off / On,
// ON by default -- the owner's ruling (tracker D7, 2026-11-24 08:13Z: "Yes, on by default"); the original posts no such
// line (`../../../src/joinLeaveLine`), so Off is the game's own behaviour, one press away.
describe('Display: Join/leave lines Off / On in this browser, On by default (PRS-888, the owner, D7)', () => {
  const rowOf = (options: ReturnType<typeof boot>['options'], id: string) => options.categories().find((c) => c.id === 'display')!.rows.find((r) => r.id === id)!;
  it('Off / On, On by default; the row round-trips the browser key; it sits after Range readout', () => {
    const { options } = boot();
    const row = rowOf(options, JOIN_LEAVE_LINE_ROW);
    expect(row).toMatchObject({ label: 'Join/leave lines', values: ['Off', 'On'], def: 1 });
    expect(row.locked).toBeUndefined();
    expect(row.about).toMatch(/joins|leaves/);
    expect(row.note).toMatch(/this browser/i);
    const ids = options.categories().find((c) => c.id === 'display')!.rows.map((r) => r.id);
    expect(ids.indexOf(JOIN_LEAVE_LINE_ROW)).toBe(ids.indexOf(RANGE_READOUT_ROW) + 1);
    expect(options.value(JOIN_LEAVE_LINE_ROW)).toBe(1);
    options.set(JOIN_LEAVE_LINE_ROW, 0);
    expect([options.value(JOIN_LEAVE_LINE_ROW), localStorage.getItem(JOIN_LEAVE_LINE_KEY)]).toEqual([0, 'off']);
    options.reset(JOIN_LEAVE_LINE_ROW);
    expect([options.value(JOIN_LEAVE_LINE_ROW), localStorage.getItem(JOIN_LEAVE_LINE_KEY)]).toEqual([1, 'on']);
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

  it('is an action row, last under "This browser" (before the Textures rows of WM-PACKS-SETTING): Copy', () => {
    const { options } = make(null);
    const ids = options.categories().find((c) => c.id === 'display')!.rows.map((r) => r.id);
    expect(ids.slice(-3)).toEqual([PERF_LINE_ROW, TEXTURE_PACK_ROW, MODS_LINK_ROW]);
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

/**
 * SS-1's D5 (a browser adaptation, product track): a tuner row's steps are heard live at once and written to the card
 * once the row settles (`TUNER_SAVE_SETTLE_MS_ADAPTATION` after the last step) -- one card write per settle, not one per
 * 2 % press. A reset writes at once; closing the Options writes what is staged.
 */
describe('SS-1 D5: a tuner row writes the card once per settle, and is heard live at every step', () => {
  const counted = () => {
    const m = new Map<string, string>();
    const writes = { n: 0 };
    const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { writes.n++; m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); } };
    return { slots: new CardSlots(() => storage as unknown as Storage, () => undefined, { now: () => 5_000 }), writes };
  };
  // `step` is optional in the console's `Adapters['options']` (absent, the grammar sets the neighbouring index);
  // `liveOptions` always gives it, so the test asserts it there once and steps through a typed handle.
  const stepper = (options: LiveOptions): NonNullable<LiveOptions['step']> => {
    expect(options.step).toBeDefined();
    return (id, d) => options.step!(id, d);
  };

  it('ten presses of Music volume: ten live commits, the card written once, after the row settles', () => {
    vi.useFakeTimers();
    try {
      const { slots, writes } = counted();
      const store = cardOptionStore(slots);
      store.setTuner('SOUND_VOLUME', 0.5);                     // the save file made
      let n = writes.n;
      store.setTuner('SOUND_VOLUME', 0.52);
      const oneWrite = writes.n - n;                           // what one card write costs the storage
      expect(oneWrite).toBeGreaterThan(0);
      const heard: number[] = [];
      const off = observeOptionCommits(slots, (c) => { if (c.name === 'MUSIC_VOLUME') heard.push(c.value); });
      const options = liveOptions(() => {}, { store, launcher: launcher(false), signedIn: () => false, pads: () => [] });
      const step = stepper(options);
      n = writes.n;
      for (let i = 0; i < 10; i++) step('MUSIC_VOLUME', 1);
      expect(heard).toHaveLength(10);                          // the live publish kept, every step
      expect(heard.at(-1)).toBe(Math.fround(0.94));
      expect(options.value('MUSIC_VOLUME')).toBe(94);          // the row reads the staged value
      expect(writes.n - n).toBe(0);                            // nothing on the card yet
      vi.advanceTimersByTime(TUNER_SAVE_SETTLE_MS_ADAPTATION - 1);
      expect(writes.n - n).toBe(0);
      vi.advanceTimersByTime(1);
      expect(writes.n - n).toBe(oneWrite);                     // one write for the ten
      expect(cardOptionStore(slots).tuner('MUSIC_VOLUME')).toBe(Math.fround(0.94));
      vi.advanceTimersByTime(TUNER_SAVE_SETTLE_MS_ADAPTATION * 5);
      expect(writes.n - n).toBe(oneWrite);
      off();
      options.dispose();
    } finally { vi.useRealTimers(); }
  });

  it('a step on another row writes the first row at once; a reset writes at once; closing writes what is staged', () => {
    vi.useFakeTimers();
    try {
      const { slots, writes } = counted();
      const store = cardOptionStore(slots);
      const options = liveOptions(() => {}, { store, launcher: launcher(false), signedIn: () => false, pads: () => [] });
      const step = stepper(options);
      step('MUSIC_VOLUME', 1);
      step('SOUND_VOLUME', -1);                        // Music's settle cut short: its value on the card now
      expect(cardOptionStore(slots).tuner('MUSIC_VOLUME')).toBe(Math.fround(0.76));
      expect(cardOptionStore(slots).tuner('SOUND_VOLUME')).toBeUndefined();
      options.reset('SOUND_VOLUME');                           // the staged 98 % superseded by the default, written at once
      expect(cardOptionStore(slots).tuner('SOUND_VOLUME')).toBe(1);
      vi.advanceTimersByTime(TUNER_SAVE_SETTLE_MS_ADAPTATION);
      expect(cardOptionStore(slots).tuner('SOUND_VOLUME')).toBe(1);
      step('DIALOG_VOLUME', -1);
      const n = writes.n;
      options.dispose();                                       // closing: the staged value written
      expect(writes.n).toBeGreaterThan(n);
      expect(cardOptionStore(slots).tuner('DIALOG_VOLUME')).toBe(Math.fround(0.98));
    } finally { vi.useRealTimers(); }
  });
});

// REVIEW-1 F2: a page closing with a step staged loses nothing -- pagehide writes it (no dispose runs on a tab's close).
describe('SS-1 D5, F2: pagehide writes the staged tuner', () => {
  it('a staged step and a pagehide: one card write, the value on the card, nothing more at the settle', () => {
    vi.useFakeTimers();
    try {
      const m = new Map<string, string>();
      const writes = { n: 0 };
      const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { writes.n++; m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); } };
      const slots = new CardSlots(() => storage as unknown as Storage, () => undefined, { now: () => 5_000 });
      const store = cardOptionStore(slots);
      store.setTuner('SOUND_VOLUME', 0.5);
      let n = writes.n;
      store.setTuner('SOUND_VOLUME', 0.52);
      const oneWrite = writes.n - n;
      expect(store.stageTuner!('MUSIC_VOLUME', Math.fround(0.8))).toBe(true);
      n = writes.n;
      window.dispatchEvent(new Event('pagehide'));
      expect(writes.n - n).toBe(oneWrite);
      expect(cardOptionStore(slots).tuner('MUSIC_VOLUME')).toBe(Math.fround(0.8));
      vi.advanceTimersByTime(TUNER_SAVE_SETTLE_MS_ADAPTATION * 2);
      expect(writes.n - n).toBe(oneWrite);
    } finally { vi.useRealTimers(); }
  });
});

/**
 * WM-5a (the weekend mega sprint; product track, a browser adaptation; the controller's rulings C and D, seat 8f): a press
 * on Home's Video row is the player's choice and is saved even when it is the picture shown by default; the row's reset
 * clears the saved picture, so the device class's default reads again -- it never writes the default into the key.
 */
describe("WM-5a: Home's Video row -- a press saves, a reset clears", () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { localStorage.clear(); });
  const key = (): string => localStorage.getItem(PICTURE_KEY) ?? '';

  it('a press on the picture already shown by default saves it (C)', () => {
    const { options } = boot();
    expect(key()).toBe('');
    options.set(VIDEO_PICTURE_ROW, 0);                                                   // Modern, the standard class's default
    expect(key()).toBe('modern');
  });

  it('the reset on an Xbox-class page with Modern saved leaves the key empty and reads PS2 (D)', () => {
    const { options } = boot();
    localStorage.setItem(GRAPHICS_BACKEND_KEY, 'xbox');                                       // the Xbox pick: the Xbox class
    localStorage.setItem(PICTURE_KEY, 'modern');
    options.reset(VIDEO_PICTURE_ROW);
    expect(key()).toBe('');
    expect(pagePicture().get()).toBe('ps2');
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('xbox');
  });

  it('the reset on a standard-class page with PS2 saved leaves the key empty and reads Modern (D)', () => {
    const { options } = boot();
    localStorage.setItem(PICTURE_KEY, 'ps2');
    options.reset(VIDEO_PICTURE_ROW);
    expect(key()).toBe('');
    expect(pagePicture().get()).toBe('modern');
  });
});

/**
 * LW-DEFAULT (a browser adaptation, no original; product track): Display's "Match engine" row -- built only on the Xbox
 * class or with the Xbox pick (the mount's own test), absent elsewhere; its press writes '1' or '0' to the engine's key
 * and nothing else, its reset empties the key (the class's default is never written).
 */
describe("LW-DEFAULT: Display's Match engine row, the Xbox class's only", () => {
  beforeEach(() => { localStorage.clear(); history.replaceState(null, '', '/'); });
  afterEach(() => { localStorage.clear(); history.replaceState(null, '', '/'); });
  const ids = (options: ReturnType<typeof boot>['options']) => options.categories().find((c) => c.id === 'display')!.rows.map((r) => r.id);
  const rowOf = (options: ReturnType<typeof boot>['options']) => options.categories().find((c) => c.id === 'display')!.rows.find((r) => r.id === LIGHTWEIGHT_MATCH_ROW);
  const others = () => Object.keys(localStorage).filter((k) => k !== LIGHTWEIGHT_MATCH_KEY).sort().map((k) => [k, localStorage.getItem(k)]);

  it('absent on a non-Xbox class: not drawn, and a set or reset by its id writes nothing', () => {
    const { options } = boot();
    expect(ids(options)).not.toContain(LIGHTWEIGHT_MATCH_ROW);
    options.set(LIGHTWEIGHT_MATCH_ROW, 0);
    options.reset(LIGHTWEIGHT_MATCH_ROW);
    expect(localStorage.getItem(LIGHTWEIGHT_MATCH_KEY)).toBeNull();
  });

  it('present on the Xbox class, after the Sharpness and Shape rows; Standard by default (the default is off), its words', () => {
    const { options } = boot();
    localStorage.setItem(GRAPHICS_BACKEND_KEY, 'xbox');
    const at = ids(options);
    expect(at.indexOf(VIDEO_SHAPE_ROW)).toBe(at.indexOf(VIDEO_PICTURE_ROW) + 1);           // VIDEO-SHAPE: Shape right after Sharpness
    expect(at.indexOf(LIGHTWEIGHT_MATCH_ROW)).toBe(at.indexOf(VIDEO_SHAPE_ROW) + 1);
    expect(rowOf(options)).toMatchObject({ label: 'Match engine', values: ['Lightweight (Xbox)', 'Standard'], def: 1 });
    expect(rowOf(options)!.locked).toBeUndefined();
    expect(rowOf(options)!.note).toBe('Saved to this browser. Applies from the next match.');
    expect(options.value(LIGHTWEIGHT_MATCH_ROW)).toBe(1);
  });

  it("set writes only its key ('1' / '0'); reset empties it; get follows the key", () => {
    const { options } = boot();
    localStorage.setItem(GRAPHICS_BACKEND_KEY, 'xbox');
    const before = others();
    options.set(LIGHTWEIGHT_MATCH_ROW, 0);
    expect([localStorage.getItem(LIGHTWEIGHT_MATCH_KEY), options.value(LIGHTWEIGHT_MATCH_ROW)]).toEqual(['1', 0]);
    options.set(LIGHTWEIGHT_MATCH_ROW, 1);
    expect([localStorage.getItem(LIGHTWEIGHT_MATCH_KEY), options.value(LIGHTWEIGHT_MATCH_ROW)]).toEqual(['0', 1]);
    options.reset(LIGHTWEIGHT_MATCH_ROW);
    expect([localStorage.getItem(LIGHTWEIGHT_MATCH_KEY), options.value(LIGHTWEIGHT_MATCH_ROW)]).toEqual(['', 1]);
    expect(others()).toEqual(before);
    localStorage.setItem(LIGHTWEIGHT_MATCH_KEY, '1');                                   // another writer: the row reads it
    expect(options.value(LIGHTWEIGHT_MATCH_ROW)).toBe(0);
  });

  it('an address flag is not the saved choice: the row shows the key, and the flag is never written', () => {
    localStorage.setItem(GRAPHICS_BACKEND_KEY, 'xbox');
    history.replaceState(null, '', '/?lightweightmatch=1');
    const { options } = boot();
    expect(options.value(LIGHTWEIGHT_MATCH_ROW)).toBe(1);
    expect(localStorage.getItem(LIGHTWEIGHT_MATCH_KEY)).toBeNull();
  });
});

describe('B-26 T1: the pad dead zone row says it is a drift guard and where stick feel lives', () => {
  it('the row names the Stick preset under Options > Controller > Layout and aiming, once', async () => {
    const { options } = boot();
    const row = options.categories().find((c) => c.id === 'controller')!.rows.find((r) => r.id === 'pad-dead')!;
    expect(row.about).toMatch(/drift guard/i);
    expect(row.about).toMatch(/Stick preset \(Recruit \/ Sailor \/ Seal \/ Custom\)/);
    expect(row.about).toMatch(/Options > Controller > Layout and aiming/);
    expect(row.about!.match(/Stick preset/g)).toHaveLength(1);
    const { PAD_DEAD_ZONE_ABOUT } = await import('../../../src/console/render/remap');
    expect(PAD_DEAD_ZONE_ABOUT).toMatch(/Stick preset/);   // the remap screen's row reads the same words
  });
});

describe('B-73: the Vibration row says when the pad has no motor', () => {
  const vib = (noMotor: boolean | undefined) => {
    const options = liveOptions(() => {}, { signedIn: () => false, pads: () => [], ...(noMotor === undefined ? {} : { noVibrationMotor: () => noMotor }) });
    booted.push(options);
    return options.categories().find((c) => c.id === 'controller')!.rows.find((r) => r.id === 'VIBRATION_CONTROLLER')!;
  };
  it('a connected pad with no actuator: the note says so; with one, or no pad, it does not', () => {
    expect(vib(true).note).toContain('This browser cannot drive your controller’s vibration.');
    expect(vib(false).note).not.toMatch(/vibration\./);
    expect(vib(undefined).note).not.toMatch(/vibration\./);
  });
});
