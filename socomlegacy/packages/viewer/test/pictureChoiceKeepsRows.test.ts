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
import { pagePicture, PICTURE_KEY } from '../src/picture';
import { STANCE_MODE_KEY } from '../src/startupSettings';
import { readVideoSettingsV2, VIDEO_SETTINGS_KEY_V2, videoSettingsKeeperV2 } from '../src/videoSettings';

/**
 * WM-5a (the weekend mega sprint; product track, a browser adaptation; the controller's ruling of seat 8f): choosing a
 * picture -- the PS2 picture or Modern, on Home's Video row, on the native VIDEO screen, or read at start-up -- writes NO
 * video-settings row: a player on a strong PC who picks the PS2 picture for its look keeps his preset, his frame cap, his
 * renderer, his shadows and his antialiasing. Only the picture's own key is written, and only by a choice.
 *
 * Cases ported from the second developer's `ps2GraphicsProfile.test.ts` at c443823002 (origin/agent/xbox-resize-release-test),
 * rewritten for the class-start shape: his native VIDEO screen case (the front end's and the in-match overlay's, the
 * real initial checkbox echo through `OptionsCommands`' gate), his passive-read case, and the "unrelated settings are
 * kept" part of his first case. His feature -- selecting PS2 writes a graphics profile -- is not this branch's.
 */
/** The disc's committed front-end fixtures; the public export does not carry socomlegacy/test-fixtures, and there the tests that need them skip, said. */
const READERC = fixture('RUN/UI/READERC.ZAR'), UIZANIM = fixture('RUN/UIZANIM.ZAR');
const HAVE = READERC !== null && UIZANIM !== null;
const ABSENT = HAVE ? '' : ` (${FIXTURES_ABSENT})`;

describe('WM-5a: choosing a picture keeps every video-settings row', () => {
  const cleanups: (() => void)[] = [];
  const settings = () => videoSettingsKeeperV2();
  const options = () => {
    const o = liveOptions(() => {}, { signedIn: () => false, pads: () => [], touch: () => false });
    cleanups.push(() => o.dispose());
    return o;
  };
  /** The video settings as stored, and the renderer's key: what a picture choice must never move. */
  const rows = () => ({ v: settings().get(), stored: localStorage.getItem(VIDEO_SETTINGS_KEY_V2), renderer: localStorage.getItem(GRAPHICS_BACKEND_KEY) });
  beforeEach(() => {
    localStorage.clear();
    pagePicture().get();
    settings().set({ preset: 'custom', renderScalePct: 85, ceiling: 1080, frameCap: 120, overlay: 'full',
      graphics: 'webgpu', shadows: 'high', antialias: true, detailDistance: 3,
      filtering: 'anisotropic', power: 'low-power', colourFilter: 'tritanopia' });
  });
  afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); localStorage.clear(); });

  it('Home Video row: PS2 chosen keeps every video row and the unrelated settings; only the picture key is written', () => {
    localStorage.setItem(CONSOLE_KEYS.theme, '2');
    localStorage.setItem(CONSOLE_KEYS.soundVolume, '0.4');
    localStorage.setItem(STANCE_MODE_KEY, 'separate');
    const kept = [CONSOLE_KEYS.theme, CONSOLE_KEYS.soundVolume, STANCE_MODE_KEY].map((key) => [key, localStorage.getItem(key)] as const);
    const o = options();
    const before = rows();
    o.set(VIDEO_PICTURE_ROW, 1);
    expect(localStorage.getItem(PICTURE_KEY)).toBe('ps2');
    expect(pagePicture().get()).toBe('ps2');
    expect(rows()).toEqual(before);
    expect(readVideoSettingsV2((key) => localStorage.getItem(key))).toEqual(before.v);
    for (const [key, value] of kept) expect(localStorage.getItem(key), key).toBe(value);
    const display = o.categories().find((c) => c.id === 'display')!.rows;
    expect(display.find((r) => r.id === VIDEO_ROW_IDS.renderScalePct)?.locked).toBe('PS2 pixels: 640 x 448');   // the picture locks the scale; its value is kept
    o.set(VIDEO_PICTURE_ROW, 0);
    expect(localStorage.getItem(PICTURE_KEY)).toBe('modern');
    expect(rows()).toEqual(before);
  });

  it.skipIf(!HAVE).each(['front-end', 'overlay'] as const)(`the native VIDEO screen in the %s: opening it and choosing a picture there write no video row${ABSENT}`, (surface) => {
    // The tracked fixture layouts and scripts exercise the real initial checkbox echo and the OptionsCommands gate.
    const disc: FrontEndDisc = {
      dialog: videoPictureLookup(dialogLookup([Zar.parse(READERC!)])),
      sets: parseAnimSets(Zar.parse(UIZANIM!)).sets,
      faces: [], captions: null, loader: {}, missing: [],
    };
    localStorage.setItem(PICTURE_KEY, 'ps2');
    const before = rows();
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
    expect(rows()).toEqual(before);
    expect(localStorage.getItem(PICTURE_KEY)).toBe('ps2');
    expect((strip as RadioStripWidget).choose(0, parts.widgetHost)).toBe(true);
    for (let i = 0; i < 3; i++) frame();
    expect([pagePicture().get(), localStorage.getItem(PICTURE_KEY)]).toEqual(['modern', 'modern']);
    expect(rows()).toEqual(before);
    expect((strip as RadioStripWidget).choose(1, parts.widgetHost)).toBe(true);
    for (let i = 0; i < 3; i++) frame();
    expect([pagePicture().get(), localStorage.getItem(PICTURE_KEY)]).toEqual(['ps2', 'ps2']);
    expect(rows()).toEqual(before);                                                       // no graphics profile follows the PS2 picture
  });

  it('reading a saved PS2 picture at start-up writes nothing', () => {
    localStorage.setItem(PICTURE_KEY, 'ps2');
    const before = rows();
    expect(pagePicture().get()).toBe('ps2');
    expect(options().value(VIDEO_PICTURE_ROW)).toBe(1);
    expect(rows()).toEqual(before);
    expect(localStorage.getItem(PICTURE_KEY)).toBe('ps2');
  });
});
