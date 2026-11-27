// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Zar } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { parseAnimSets } from '@s2u/scene';
import { dialogLookup, OPTIONS_MENU, RadioStripWidget, VIDEO_PICTURE_DIALOG, videoPictureLookup, type ZAnimUiCommand } from '@s2u/ui';
import { CONSOLE_KEYS, liveOptions, VIDEO_PICTURE_ROW, VIDEO_ROW_IDS } from '../src/console/adapters/options';
import { GRAPHICS_BACKEND_KEY } from '../src/graphicsBackend';
import { FrontEndSession, type FrontEndDisc } from '../src/frontEnd';
import { NativeOptionsHost } from '../src/nativeOptionsHost';
import { pagePicture, PICTURE_KEY, PS2_PROFILE_PRIOR_KEY, setPs2ProfileClassForTest } from '../src/picture';
import { STANCE_MODE_KEY } from '../src/startupSettings';
import { readVideoSettingsV2, videoSettingsKeeperV2, type VideoSettingsV2 } from '../src/videoSettings';

/** The disc's committed front-end fixtures; the public export does not carry socomlegacy/test-fixtures, and there the tests that need them skip, said. */
const READERC = fixture('RUN/UI/READERC.ZAR'), UIZANIM = fixture('RUN/UIZANIM.ZAR');
const HAVE = READERC !== null && UIZANIM !== null;
const ABSENT = HAVE ? '' : ` (${FIXTURES_ABSENT})`;

// Browser adaptation: the user's requested PS2 graphics shortcut, not an original-game graphics preset.
describe('the PS2 selection applies the requested browser graphics profile', () => {
  const cleanups: (() => void)[] = [];
  const settings = () => videoSettingsKeeperV2();
  const profile = { preset: 'custom', frameCap: 30, graphics: 'webgl2', shadows: 'off', antialias: false } as const;
  const options = () => {
    const o = liveOptions(() => {}, { signedIn: () => false, pads: () => [], touch: () => false });
    cleanups.push(() => o.dispose());
    return o;
  };
  beforeEach(() => {
    localStorage.clear();
    setPs2ProfileClassForTest(() => 'xbox');                    // XBOX-INTEGRATE: the shortcut is the Xbox class's only
    pagePicture().get();
    settings().set({ preset: 'custom', renderScalePct: 85, ceiling: 1080, frameCap: 120, overlay: 'full',
      graphics: 'webgpu', shadows: 'high', antialias: true, detailDistance: 3,
      filtering: 'anisotropic', power: 'low-power', colourFilter: 'tritanopia' });
  });
  afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); localStorage.clear(); setPs2ProfileClassForTest(null); });

  it('Video > PS2 commits the graphics fields once, persists them, and keeps all unrelated choices', () => {
    localStorage.setItem(CONSOLE_KEYS.theme, '2');
    localStorage.setItem(CONSOLE_KEYS.soundVolume, '0.4');
    localStorage.setItem(STANCE_MODE_KEY, 'separate');
    const kept = [CONSOLE_KEYS.theme, CONSOLE_KEYS.soundVolume, STANCE_MODE_KEY]
      .map((key) => [key, localStorage.getItem(key)] as const);
    const o = options(), v = settings(), before = v.get();
    const heard: VideoSettingsV2[] = [], pictures: [string, VideoSettingsV2][] = [];
    cleanups.push(v.observe((next) => heard.push(next)));
    cleanups.push(pagePicture().observe((p) => pictures.push([p, v.get()])));
    o.set(VIDEO_PICTURE_ROW, 1);
    const expected = { ...before, ...profile };
    expect(v.get()).toEqual(expected);
    expect(heard).toEqual([expected]);
    expect(pictures).toEqual([['ps2', expected]]);
    expect(localStorage.getItem(PICTURE_KEY)).toBe('ps2');
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('webgl2');
    expect(readVideoSettingsV2((key) => localStorage.getItem(key))).toEqual(expected);
    for (const [key, value] of kept) expect(localStorage.getItem(key), key).toBe(value);
    const rows = o.categories().find((c) => c.id === 'display')!.rows;
    expect(rows.find((r) => r.id === VIDEO_ROW_IDS.renderScalePct)?.locked).toBe('PS2 pixels: 640 x 448');
    expect(rows.find((r) => r.id === VIDEO_PICTURE_ROW)?.note).toMatch(/next match/i);
  });

  it('reselecting PS2 restores edited graphics without another picture resize notification', () => {
    const o = options(), v = settings();
    o.set(VIDEO_PICTURE_ROW, 1);
    const heard: VideoSettingsV2[] = [], pictures: string[] = [];
    cleanups.push(v.observe((next) => heard.push(next)));
    cleanups.push(pagePicture().observe((p) => pictures.push(p)));
    o.set(VIDEO_PICTURE_ROW, 1);
    expect(heard).toEqual([]);
    expect(pictures).toEqual([]);
    // The existing individual controls remain usable after choosing the profile.
    o.set(VIDEO_ROW_IDS.frameCap, 2); // Off, 30, 60, 120
    o.set(VIDEO_ROW_IDS.shadows, 2); // Off, Low, Medium, High
    expect(v.get()).toMatchObject({ frameCap: 60, shadows: 'medium' });
    heard.length = 0;
    o.set(VIDEO_PICTURE_ROW, 1);
    expect(v.get()).toMatchObject(profile);
    expect(heard).toHaveLength(1);
    expect(pictures).toEqual([]);
  });

  it('the shared VIDEO strip selection applies the same saved profile', () => {
    const before = settings().get();
    pagePicture().set('ps2');
    expect(settings().get()).toEqual({ ...before, ...profile });
    expect(options().value(VIDEO_PICTURE_ROW)).toBe(1);
  });

  it.skipIf(!HAVE).each(['front-end', 'overlay'] as const)(`opening native VIDEO in the %s keeps manual choices until an actual selection${ABSENT}`, (surface) => {
    // Existing tracked fixture layouts/scripts exercise the real initial checkbox onCheck and OptionsCommands gate.
    const disc: FrontEndDisc = {
      dialog: videoPictureLookup(dialogLookup([Zar.parse(READERC!)])),
      sets: parseAnimSets(Zar.parse(UIZANIM!)).sets,
      faces: [], captions: null, loader: {}, missing: [],
    };
    const own = settings().get();                               // XBOX-INTEGRATE: the player's rows before the shortcut
    pagePicture().set('ps2');
    settings().set({ frameCap: 60, shadows: 'medium', antialias: true });
    const before = settings().get();
    const session = new FrontEndSession({ disc, loader: false, picture: pagePicture(),
      startDialog: surface === 'front-end' ? VIDEO_PICTURE_DIALOG : OPTIONS_MENU });
    const overlay = surface === 'overlay' ? new NativeOptionsHost({ disc, textures: () => null }, session.nativeOptions) : null;
    cleanups.push(() => { overlay?.close(); session.close(); });
    let now = 0;
    const frame = () => { now += 1000 / 30; if (overlay) overlay.frame(now); else session.advance(now); };
    frame();
    if (overlay) {
      const switchVideo: ZAnimUiCommand = { anim: 'test', sequence: 'NA', nodeIndex: 0, node: null,
        opcodeByte: 0, fn: 'SwitchMenu', arg: VIDEO_PICTURE_DIALOG, loc: 0, bytes: new Uint8Array(0x18) };
      overlay.host.dispatch(switchVideo);
    }
    for (let i = 0; i < 90; i++) frame();
    const parts = (overlay?.parts ?? session.parts).current!;
    const strip = parts.widgets.get('video_mode');
    expect(strip).toBeInstanceOf(RadioStripWidget);
    expect((strip as RadioStripWidget).selection).toBe(1);
    expect(settings().get()).toEqual(before);
    // An actual native selection still applies the profile, through the same checkbox/gate route.
    expect((strip as RadioStripWidget).choose(0, parts.widgetHost)).toBe(true);
    for (let i = 0; i < 3; i++) frame();
    expect(pagePicture().get()).toBe('modern');
    expect(settings().get()).toEqual(own);                      // XBOX-INTEGRATE ruling: Modern gives the player's rows back
    expect((strip as RadioStripWidget).choose(1, parts.widgetHost)).toBe(true);
    for (let i = 0; i < 3; i++) frame();
    expect(pagePicture().get()).toBe('ps2');
    expect(settings().get()).toEqual({ ...own, ...profile });
  });

  it('passively reading a saved PS2 picture does not overwrite later individual graphics choices', () => {
    const before = settings().get();
    localStorage.setItem(PICTURE_KEY, 'ps2');
    expect(pagePicture().get()).toBe('ps2');
    expect(options().value(VIDEO_PICTURE_ROW)).toBe(1);
    expect(settings().get()).toEqual(before);
    expect(readVideoSettingsV2((key) => localStorage.getItem(key))).toEqual(before);
  });

  // XBOX-INTEGRATE (the main controller's ruling, 2026-11-20): was "keeps the individual graphics values" -- Modern now
  // gives back the player's own rows from before the shortcut, edits made under PS2 included.
  it('returning to Modern gives the player’s own graphics rows back and releases the fixed-size lock', () => {
    const o = options();
    const own = settings().get();
    o.set(VIDEO_PICTURE_ROW, 1);
    settings().set({ frameCap: 60, shadows: 'low', antialias: true, graphics: 'auto' });
    o.set(VIDEO_PICTURE_ROW, 0);
    expect(pagePicture().get()).toBe('modern');
    expect(settings().get()).toEqual(own);
    expect(o.categories().find((c) => c.id === 'display')!.rows
      .find((r) => r.id === VIDEO_ROW_IDS.renderScalePct)?.locked).toBeUndefined();
  });
});

/**
 * XBOX-INTEGRATE (the main controller's ruling, 2026-11-20, on #810's shortcut): the PS2 shortcut is the Xbox class's only,
 * and leaving PS2 gives the player's own rows back. A browser adaptation.
 */
describe('XBOX-INTEGRATE: the PS2 shortcut gated to the Xbox class, its rows given back on Modern', () => {
  const own = { preset: 'custom', renderScalePct: 85, ceiling: 1080, frameCap: 120, overlay: 'full',
    graphics: 'webgpu', shadows: 'high', antialias: true, detailDistance: 3,
    filtering: 'anisotropic', power: 'low-power', colourFilter: 'tritanopia' } as const;
  beforeEach(() => { localStorage.clear(); pagePicture().get(); videoSettingsKeeperV2().set(own); });
  afterEach(() => { localStorage.clear(); setPs2ProfileClassForTest(null); });

  for (const cls of ['standard', 'high', 'touch', 'lowMemory', 'software'] as const) {
    it(`on the ${cls} class a PS2 press is the picture alone: no frame cap, renderer, shadows or anti-aliasing written`, () => {
      setPs2ProfileClassForTest(() => cls);
      const before = videoSettingsKeeperV2().get();
      pagePicture().set('ps2');
      expect(localStorage.getItem(PICTURE_KEY)).toBe('ps2');
      expect(videoSettingsKeeperV2().get()).toEqual(before);
      expect(localStorage.getItem(PS2_PROFILE_PRIOR_KEY)).toBeNull();
      pagePicture().choose('ps2');
      expect(videoSettingsKeeperV2().get()).toEqual(before);
    });
  }

  it('on the Xbox class: PS2 applies the shortcut; Modern gives the player’s own rows back and empties the keep', () => {
    setPs2ProfileClassForTest(() => 'xbox');
    const before = videoSettingsKeeperV2().get();
    pagePicture().set('ps2');
    expect(videoSettingsKeeperV2().get()).toMatchObject({ frameCap: 30, graphics: 'webgl2', shadows: 'off', antialias: false });
    pagePicture().set('ps2');                                   // a second press keeps the first keep
    pagePicture().set('modern');
    expect(videoSettingsKeeperV2().get()).toEqual(before);
    expect(localStorage.getItem(PS2_PROFILE_PRIOR_KEY) ?? '').toBe('');
  });

  it('on the Xbox class: Home’s choose and a reset to a non-PS2 default give the rows back too', () => {
    setPs2ProfileClassForTest(() => 'xbox');
    const before = videoSettingsKeeperV2().get();
    pagePicture().choose('ps2');
    expect(videoSettingsKeeperV2().get().frameCap).toBe(30);
    setPs2ProfileClassForTest(() => 'standard');                // the class read afresh: leaving PS2 still gives back
    pagePicture().clear();
    expect(videoSettingsKeeperV2().get()).toEqual(before);
  });

  // XBOX-INTEGRATE's gate (a528ca0978, options.test WM-5a D): on the Xbox class the reset's default IS PS2, and the reset
  // applied the shortcut -- writing WebGL2 over the Xbox pick, so the page left the class and read Modern.
  it('on the Xbox class a reset is never a PS2 press: no shortcut, no keep, the rows as they were', () => {
    setPs2ProfileClassForTest(() => 'xbox');
    localStorage.setItem(GRAPHICS_BACKEND_KEY, 'xbox');                 // the Xbox pick: the page's class, its default PS2
    localStorage.setItem(PICTURE_KEY, 'modern');
    const before = videoSettingsKeeperV2().get();
    pagePicture().clear();
    expect(videoSettingsKeeperV2().get()).toEqual(before);
    expect(localStorage.getItem(PS2_PROFILE_PRIOR_KEY) ?? '').toBe('');
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('xbox');
    expect(pagePicture().get()).toBe('ps2');
  });

  it('the Xbox pick (graphics backend xbox) is kept through a PS2 press and the Modern that leaves it', () => {
    setPs2ProfileClassForTest(() => 'xbox');
    localStorage.setItem(GRAPHICS_BACKEND_KEY, 'xbox');
    pagePicture().set('ps2');
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('xbox');
    expect(videoSettingsKeeperV2().get()).toMatchObject({ frameCap: 30, shadows: 'off', antialias: false });
    pagePicture().set('modern');
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('xbox');
    expect(videoSettingsKeeperV2().get()).toMatchObject({ frameCap: 120, shadows: 'high', antialias: true });
  });

  // The gate-fix review's F1: from Automatic (the usual state of a page that has just saved the pick) the rows read the
  // class's own renderer, and the Custom the press makes carried it into the renderer's key.
  it('from Automatic with the Xbox pick: PS2 keeps the pick, and Modern gives Automatic back with the pick', () => {
    setPs2ProfileClassForTest(() => 'xbox');
    videoSettingsKeeperV2().restoreDefaults();
    localStorage.setItem(GRAPHICS_BACKEND_KEY, 'xbox');
    expect(videoSettingsKeeperV2().get().preset).toBe('auto');
    pagePicture().set('ps2');
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('xbox');
    expect(videoSettingsKeeperV2().get()).toMatchObject({ preset: 'custom', frameCap: 30, shadows: 'off', antialias: false });
    pagePicture().set('modern');
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('xbox');
    expect(videoSettingsKeeperV2().get().preset).toBe('auto');
    expect(localStorage.getItem(PS2_PROFILE_PRIOR_KEY) ?? '').toBe('');
  });

  // The review's F2: a keep made before the pick holds a renderer; the Modern after the pick is saved does not write it over.
  it('a pick saved between the PS2 press and the Modern is kept', () => {
    setPs2ProfileClassForTest(() => 'xbox');
    pagePicture().set('ps2');
    localStorage.setItem(GRAPHICS_BACKEND_KEY, 'xbox');
    pagePicture().set('modern');
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('xbox');
    expect(videoSettingsKeeperV2().get()).toMatchObject({ frameCap: 120, shadows: 'high', antialias: true });
  });
});
