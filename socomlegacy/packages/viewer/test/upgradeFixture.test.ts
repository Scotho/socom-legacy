// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { liveOptions, CONSOLE_KEYS } from '../src/console/adapters/options';
import { SKIP_MENU_KEY, skipMenuOn } from '../src/console/skipMenu';
import { AGREEMENT_ACCEPTED_KEY } from '../src/console/adapters/session';
import { parseController, controllerStanceMode, STANCE_MODE_KEY, SETUP_KEY, VIEWER_LOOK_KEY, resolveVisuals } from '../src/startupSettings';
import { PAD_SELECTION_KEY } from '../src/setupPad';
import { OVERLAY_BUTTON_KEY, readOverlayButton } from '../src/overlayButtonSetting';
import { PAD_EXTRAS_PREFIX, parsePadExtras } from '../src/padExtras';
import { MIC_DEVICE_KEY, MIC_ENABLED_KEY, gameMicrophoneOn } from '../src/gameMicrophone';
import { pageDeviceClass, resetPageRendererProbeForTest } from '../src/deviceClass';
import { GRAPHICS_BACKEND_KEY, readGraphicsBackend } from '../src/graphicsBackend';
import { GRAPHICS_DEMOTED_KEY, readGraphicsDemoted } from '../src/graphicsDemotion';
import { DETAIL_DISTANCE_KEY, readDetailDistance } from '../src/detailDistance';
import { FPS_SHOWN_KEY } from '../src/matchFps';
import { NAME_TAGS_KEY, readNameTags } from '../src/nameTags';
import { RANGE_READOUT_KEY, readRangeReadout } from '../src/rangeReadout';
import { GLOW_SCALE_KEY, readGlowScale } from '../src/glowScale';
import { MOBILE_LAYOUT_KEY, MOBILE_LAYOUT_NOTICE_KEY, MOBILE_LAYOUT_STRIP_KEY, readMobileLayout, layoutNoticeDue } from '../src/mobileLayout';
import { TIP_DISMISSED_KEY, TIP_SEEN_KEY } from '../src/mobileTip';
import { PLAY_KEY, readPlayChoice } from '../src/features';
import { ONLINE_KEY, onlineChoice } from '../src/online';
import { RULES_KEY, rulesChoice } from '../src/rules';
import { CONTROLS_TAB_KEY } from '../src/controlsList';
import { LAST_MAP_KEY, readLastMap, pageSettings, FORGE_LAYOUT_KEY, FORGE_VIEW_KEY, FORGE_PANELS_KEY, FORGE_DOCK_LAYOUT_KEY } from '../src/pageStore';
import { REPLAY_CAMERA_KEY, readCameraChoice } from '../src/modern/replays/cameraChoice';
import { UI_GPU_KILL_STORAGE_KEY } from '../src/uiGpuSwitch';
import { MODS_PRESENT_KEY } from '../src/mods/store';
import { MODELS_ENABLED_KEY, PACKS_ENABLED_KEY } from '../src/packs/modsState';
import { FAVOURITES_KEY, readFavourites } from '../src/forge/favourites';
import { parseProfile } from '../src/armory';
import { lastPairedAgentClient } from '../src/agent/setup';
import { rememberedAgents } from '../src/agent/remembered';
import { pagePicture, PICTURE_KEY } from '../src/picture';
import { pageShape, SHAPE_KEY } from '../src/shape';
import { autoResolved, CLASS_PICTURE_ADAPTATION } from '../src/autoQuality';
import type { DeviceClass } from '../src/deviceClass';
import { readVideoSettings, readVideoSettingsV2, VIDEO_SETTINGS_KEY, VIDEO_SETTINGS_KEY_V2, videoRowsKeeperV2, videoSettingsKeeperV2 } from '../src/videoSettings';

/**
 * WM-R20-FOLDS item 4 (the weekend mega sprint's UI lane; the saved-settings audit of 2026-11-15, "Tests worth adding" 1;
 * the owner, binding: "ensure we are careful with existing setting values not getting reset"). Product track: a guard,
 * no behaviour of its own. One whole v0.4.22-shaped storage -- the keys of the audit's table, each at a value off its
 * default, in the shape v0.4.22 writes (the keys not seeded are named below, each with its reason) (`git show v0.4.22:<path>`; the readers named below are
 * byte-identical to v0.4.22 but for `picture.ts`, `videoSettings.ts`, `autoQuality.ts`, `matchFps.ts` (a comment) and
 * `console/adapters/options.ts`) -- is loaded through the page's readers, then the launcher's Options opened (every
 * category's every row read) and the native VIDEO OPTIONS' rows read; each value must mean what it meant at v0.4.22, and
 * not one byte of localStorage or sessionStorage may change -- and (the review's F2) no `setItem`, `removeItem` or
 * `clear` may be called on either at all, so a write of the same bytes, or a remove then a re-set, is caught too. Run as
 * a standard device and as an Xbox-class one.
 *
 * Left out, said: the IndexedDB stores (`s2u.page`, `s2u-forge`, `s2u.testRoomMods`, `s2u.texturePacks`,
 * `s2u.hdTexturePack`, `s2u.packs.v1`) are not seeded -- jsdom has none; instead the load is held to open no IndexedDB at
 * all. The memory card (`s2u.card.v1.slot*`, the card package, identical to v0.4.22 and pinned by its own migrate test),
 * the bare `s2u.startup.v1` prefix (no v0.4.22 writer stores a value under it alone), the launch presets
 * (`s2u.launch.v1.*`, a development build's) and the Forge's layout, view, panels, dock, saves and agent keys (read inside
 * `forge/page.ts` and the dock shell, which a unit test cannot boot; the favourites go through `readFavourites`) are
 * held for their bytes only. The test room's `Ui` keys (volume, muted, mouse look, panel open) are held for their bytes;
 * the look goes through `resolveVisuals`.
 *
 * The review's F3, key by key: read through a reader -- the ARMORY profile (`s2u.armory.v1.<MAP>.<side>`, `armory.ts`
 * `parseProfile`), `forge.agent.pairedClients` (`agent/setup.ts` `lastPairedAgentClient`), `forge.agent.remembered`
 * (`agent/remembered.ts` `rememberedAgents`). Seeded and held for their bytes only, the reader not bootable here --
 * `s2u.mp.name` (read in `main.ts`, the test room's page), `s2u.session:<origin>` (sessionStorage, read by the match's
 * connection, `net/session.ts`, behind its own injection), `s2u-forge-assets-browser` (inside `forge/page.ts`),
 * `s2u-forge-lobby-window` (the lobby window's class, `forge/lobby/window.ts`, which needs its mounted DOM), and the
 * Forge's set-aside and recovered keys (`s2u-forge-saves-aside`, `s2u-forge-layout-aside`, the four `*-recovered-v3`;
 * read by `forge/savesStore.ts` beside its IndexedDB store).
 */

const STANDARD_GPU = 'ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00003EA0) Direct3D11 vs_5_0 ps_5_0, D3D11)';
const XBOX_GPU = 'ANGLE (AMD, AMD Custom GPU 0405 Direct3D11 vs_5_0 ps_5_0, D3D11)';
const XBOX_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox One) Edg/130.0.2849.56';

/** One pad, its profile key as `./controllerInput` `profileKey` makes it: `[id, mapping, buttons, axes]`. */
const PAD_ID = 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)';
const PAD_PROFILE_KEY = `${SETUP_KEY}.pad.${JSON.stringify([PAD_ID, 'standard', 17, 4])}`;
/** Cross and Circle swapped, the dead zone 0.25, Crouch on L2 (6), Prone on R2 (7): `ControllerConfig` v1 as v0.4.22 saves it. */
const SWAPPED = [1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const PROFILE = { version: 1, bindings: SWAPPED, deadZone: 0.25, crouch: 6, prone: 7 };
const EXTRAS = { version: 1, doubles: [{ button: 4, action: 'reload' }], combos: [{ modifier: 5, button: 3, action: 'prone' }] };
const LAYOUT = { version: 1, landscape: { 'tw-cross': { x: 0.81, y: 0.72 }, 'stick-rest': { x: 0.2, y: 0.7 } }, portrait: { 'tw-start': { x: 0.5, y: 0.1 } } };

/** Every row of the v2 JSON off its default, the overlay's mode the full readout (v0.4.22's `serialize`). */
const ROWS_OFF_DEFAULT = { renderScalePct: 85, ceiling: 1080, frameCap: 120, shadows: 'high', antialias: false, filtering: 'anisotropic', power: 'high-performance', colourFilter: 'protanopia' } as const;

type Fixture = Record<string, string>;

/** F3: an ARMORY profile as v0.4.22 saves it (`armory.ts` `profileKey`, `parseProfile`), and two agents' keys. */
const ARMORY_SLOT_NAME = 's2u.armory.v1.MP7.seal';
const ARMORY = { charSet: 2, items: [54, 15, 121, 151, 194], valid: true };
const REMEMBERED = [{ clientName: 'Codex', grants: ['inspect', 'edit'], rememberedAt: 1_762_000_000_000 }];

/** The localStorage of a v0.4.22 player who changed everything; `video` picks the video variant. */
function v0422(o: { video: 'custom' | 'named' | 'v1only'; picture: 'ps2' | 'experimental' | null; backend: 'webgl2' | 'xbox' }): Fixture {
  const f: Fixture = {
    [GRAPHICS_BACKEND_KEY]: o.backend,
    [GRAPHICS_DEMOTED_KEY]: 'WebGPU device lost (2026-11-01T10:00:00.000Z): unknown',
    [DETAIL_DISTANCE_KEY]: '3.5',
    [FPS_SHOWN_KEY]: '1',
    's2u.viewer.videoAuto': JSON.stringify({ deviceClass: 'standard', renderer: STANDARD_GPU, preset: 'quality' }),
    [VIEWER_LOOK_KEY]: 'ps2',
    's2u.viewer.volume': '0.25', 's2u.viewer.muted': '1', 's2u.viewer.mouseLook': JSON.stringify({ sensitivity: 1.6, invert: true }),
    's2u.viewer.panelOpen': '0', [CONTROLS_TAB_KEY]: 'pad',
    [PLAY_KEY]: '1', [ONLINE_KEY]: 'shared', [RULES_KEY]: 'respawn', [LAST_MAP_KEY]: 'MP7',
    [NAME_TAGS_KEY]: 'original', [RANGE_READOUT_KEY]: 'on', 's2u.viewer.glowScale': 'half',
    [MOBILE_LAYOUT_KEY]: JSON.stringify(LAYOUT), [MOBILE_LAYOUT_STRIP_KEY]: '1', [MOBILE_LAYOUT_NOTICE_KEY]: '1', [TIP_DISMISSED_KEY]: '1',
    [STANCE_MODE_KEY]: 'separate', [PAD_SELECTION_KEY]: `0:${PAD_ID}`, [OVERLAY_BUTTON_KEY]: '8',
    [PAD_PROFILE_KEY]: JSON.stringify(PROFILE), [`${PAD_EXTRAS_PREFIX}${JSON.stringify([PAD_ID, 'standard', 17, 4])}`]: JSON.stringify(EXTRAS),
    [MIC_DEVICE_KEY]: 'mic-device-7', [MIC_ENABLED_KEY]: 'off',
    [UI_GPU_KILL_STORAGE_KEY]: 'off', [REPLAY_CAMERA_KEY]: 'free',
    [CONSOLE_KEYS.uiscale]: '2', [CONSOLE_KEYS.scan]: '1', [CONSOLE_KEYS.drift]: '0', [CONSOLE_KEYS.theme]: '3', [CONSOLE_KEYS.backdrop]: '1',
    [CONSOLE_KEYS.clock]: '1', [CONSOLE_KEYS.sounds]: '0', [CONSOLE_KEYS.soundVolume]: '4', [SKIP_MENU_KEY]: '1',
    [AGREEMENT_ACCEPTED_KEY]: JSON.stringify({ 'operator#1': '9a1b2c3d' }),
    [MODS_PRESENT_KEY]: '1', [PACKS_ENABLED_KEY]: '1', [MODELS_ENABLED_KEY]: '1',
    [FAVOURITES_KEY]: JSON.stringify(['MP7.ZAR:crate_a']),
    [FORGE_LAYOUT_KEY]: JSON.stringify({ map: 'MP7', props: [] }), [FORGE_VIEW_KEY]: JSON.stringify({ grid: true }),
    [FORGE_PANELS_KEY]: JSON.stringify({ inspector: true }), [FORGE_DOCK_LAYOUT_KEY]: JSON.stringify({ version: 1 }),
    'forge.inspector.transform.open': '0', 'forge.agent.gateway': 'wss://gateway.invalid/ws',
    // F3: the keys the first version left unseeded (see the header for each one's reader or reason)
    'forge.agent.pairedClients': 'codex,claude', 'forge.agent.remembered': JSON.stringify(REMEMBERED),
    [ARMORY_SLOT_NAME]: JSON.stringify(ARMORY), 's2u.mp.name': 'OPERATOR7',
    's2u-forge-assets-browser': JSON.stringify({ mode: 'grid', size: 96 }), 's2u-forge-lobby-window': JSON.stringify({ x: 40, y: 60, w: 520, h: 400 }),
    's2u-forge-saves-aside': '{"unreadable":true}', 's2u-forge-layout-aside': '{"unreadable":true}',
    's2u-forge-saves-recovered-v3': '[]', 's2u-forge-saves-aside-recovered-v3': '[]', 's2u-forge-layout-recovered-v3': '{}', 's2u-forge-layout-aside-recovered-v3': '{}',
  };
  if (o.picture !== null) f[PICTURE_KEY] = o.picture;
  if (o.video === 'custom') f[VIDEO_SETTINGS_KEY_V2] = JSON.stringify({ preset: 'custom', ...ROWS_OFF_DEFAULT, overlay: 'full' });
  if (o.video === 'named') f[VIDEO_SETTINGS_KEY_V2] = JSON.stringify({ preset: 'quality', ...ROWS_OFF_DEFAULT, overlay: 'full' });
  // v0.4.22 keeps the v1 value as v2's projection at every write; the v1-only variant is a browser from before VS-1.
  f[VIDEO_SETTINGS_KEY] = o.video === 'v1only' ? JSON.stringify({ renderScale: 'quality', shadows: false }) : JSON.stringify({ renderScale: 'performance', shadows: true });
  return f;
}
const SESSION: Fixture = { [TIP_SEEN_KEY]: '1', 's2u.operatorSay.closed': '[3,9]', 'forge.agent.resume': 'ticket-1', 's2u.session:wss://play.invalid': 'AAAAAAAAAAAAAAAAAAAAAA' };

const snapshot = (s: Storage): Fixture => Object.fromEntries(Array.from({ length: s.length }, (_, i) => s.key(i)!).map((k) => [k, s.getItem(k)!]));

/** The device: a user agent and the renderer string the page's WebGL probe reads. */
function device(kind: 'standard' | 'xbox'): void {
  const agent = kind === 'xbox' ? XBOX_AGENT : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
  Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => agent });
  const gl = { getExtension: () => null, getParameter: () => (kind === 'xbox' ? XBOX_GPU : STANDARD_GPU), RENDERER: 0x1f01 };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => gl) as never);
  resetPageRendererProbeForTest();
}

const idbOpened: string[] = [];
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); idbOpened.length = 0;
  // jsdom has no IndexedDB: a recorder stands in, so a reader that opened one is seen (and none may).
  (globalThis as { indexedDB?: unknown }).indexedDB = { open: (name: string) => { idbOpened.push(name); throw new Error('no IndexedDB in this test'); }, deleteDatabase: (name: string) => { idbOpened.push(`delete ${name}`); throw new Error('no IndexedDB in this test'); } };
});
afterEach(() => {
  delete (navigator as unknown as Record<string, unknown>).userAgent;
  delete (globalThis as { indexedDB?: unknown }).indexedDB;
  vi.restoreAllMocks(); resetPageRendererProbeForTest();
  localStorage.clear(); sessionStorage.clear();
});

/** Seeds the fixture, runs `read` (the load, then Options opened), and holds every byte of both storages. */
function load(fixture: Fixture, read: () => void): void {
  for (const [k, v] of Object.entries(fixture)) localStorage.setItem(k, v);
  for (const [k, v] of Object.entries(SESSION)) sessionStorage.setItem(k, v);
  const before = { local: snapshot(localStorage), session: snapshot(sessionStorage) };
  // F2: any write at all through either storage, not only one that changes a value.
  const writes = (['setItem', 'removeItem', 'clear'] as const).map((m) => vi.spyOn(Storage.prototype, m));
  read();
  // Opening the launcher's Options: every category's every row read; then the native VIDEO OPTIONS' three rows.
  const o = liveOptions(() => {}, { signedIn: () => false, pads: () => [], touch: () => false });
  try {
    for (const c of o.categories()) for (const r of c.rows) o.value(r.id);
    o.panel?.('theme');
  } finally { o.dispose(); }
  videoRowsKeeperV2().get();
  read();                                                                            // a later load reads the same
  const called = writes.map((w) => w.mock.calls.map((c) => `${w.getMockName()} ${String(c[0])}`)).flat();
  for (const w of writes) w.mockRestore();
  expect(called).toEqual([]);
  expect(snapshot(localStorage)).toEqual(before.local);
  expect(snapshot(sessionStorage)).toEqual(before.session);
  expect(idbOpened).toEqual([]);
}

/** The readers whose code is v0.4.22's own: each value as v0.4.22 meant it. */
function unchangedReaders(): void {
  expect(readDetailDistance()).toBe(3.5);
  expect(readNameTags()).toBe('original');
  expect(readRangeReadout()).toBe('on');
  expect(readGlowScale()).toBe('half');
  expect(readPlayChoice()).toBe('1');
  expect(onlineChoice(pageSettings.get(ONLINE_KEY))).toBe('shared');
  expect(rulesChoice(pageSettings.get(RULES_KEY), true)).toBe('respawn');
  expect(readLastMap()).toBe('MP7');
  expect(resolveVisuals(null, pageSettings.get(VIEWER_LOOK_KEY)).view).toBe('ps2');
  expect(readMobileLayout()).toEqual(LAYOUT);
  expect(layoutNoticeDue()).toBe(false);
  expect(controllerStanceMode()).toBe('separate');
  expect(readOverlayButton()).toBe(8);
  expect(parseController(pageSettings.get(PAD_PROFILE_KEY))).toEqual(PROFILE);
  expect(parsePadExtras(pageSettings.get(`${PAD_EXTRAS_PREFIX}${JSON.stringify([PAD_ID, 'standard', 17, 4])}`), { overlayButton: 8, heldBinds: [6, 7] }))
    .toEqual({ extras: { doubles: EXTRAS.doubles, combos: EXTRAS.combos }, dropped: [] });
  expect(gameMicrophoneOn()).toBe(false);
  expect(readCameraChoice()).toBe('free');
  expect(skipMenuOn()).toBe(true);
  expect(readFavourites()).toEqual(new Set(['MP7.ZAR:crate_a']));
  expect(parseProfile(pageSettings.get(ARMORY_SLOT_NAME))).toEqual(ARMORY);                // F3
  expect(lastPairedAgentClient()).toBe('codex');
  expect(rememberedAgents()).toEqual(REMEMBERED);
}

/** The launcher's own rows (Appearance, sounds, size) read back the indexes stored. */
function consoleRows(): void {
  const o = liveOptions(() => {}, { signedIn: () => false, pads: () => [], touch: () => false });
  try {
    expect(['uiscale', 'scan', 'drift', 'theme', 'backdrop', 'clock', 'sounds', 'soundVolume'].map((id) => o.value(id))).toEqual([2, 1, 0, 3, 1, 1, 0, 4]);
  } finally { o.dispose(); }
}

/** The video settings as v0.4.22's `readStored` reads every off-default row of a stored Custom or named preset. */
const storedRows = (preset: 'custom' | 'quality', graphics: 'webgl2' | 'auto') =>
  ({ preset, ...ROWS_OFF_DEFAULT, detailDistance: 3.5, graphics, overlay: 'full' });

describe('WM-R20-FOLDS item 4: a whole v0.4.22 storage loads with every value meaning what it meant, and nothing written', () => {
  it('standard device, a saved Custom with every row off its default, PS2 saved, WebGL2 saved', () => {
    device('standard');
    load(v0422({ video: 'custom', picture: 'ps2', backend: 'webgl2' }), () => {
      expect(pageDeviceClass()).toBe('standard');
      expect(readVideoSettingsV2()).toEqual(storedRows('custom', 'webgl2'));
      expect(videoSettingsKeeperV2().resolved()).toEqual(storedRows('custom', 'webgl2'));
      expect(readVideoSettings()).toEqual({ renderScale: 'performance', shadows: true, showFps: true });   // 85 % at 1080p: v1's Performance tier
      expect(pagePicture().get()).toBe('ps2');
      // VIDEO-SHAPE (a browser adaptation): v0.4.22 kept no shape -- it reads fill (the saved PS2 still draws its 4:3
      // frame, `effectiveShape`), and nothing is written (WM.R20; `load` holds every byte).
      expect(pageShape().get()).toBe('fill');
      expect(localStorage.getItem(SHAPE_KEY)).toBeNull();
      expect(readGraphicsBackend('')).toBe('webgl2');
      expect(readGraphicsDemoted()).toBe('WebGPU device lost (2026-11-01T10:00:00.000Z): unknown');
      unchangedReaders();
      consoleRows();
    });
  });

  it('standard device, a saved named preset (Quality) holding every row off its default, the removed HD picture saved', () => {
    device('standard');
    load(v0422({ video: 'named', picture: 'experimental', backend: 'webgl2' }), () => {
      expect(readVideoSettingsV2()).toEqual(storedRows('quality', 'webgl2'));
      expect(pagePicture().get()).toBe('modern');                                     // v0.4.22: 'experimental' is not in VIDEO_PICTURES, reads MODERN
      unchangedReaders();
    });
  });

  it('standard device, only the v1 value (a browser from before VS-1): Quality with the shadows off migrates as v0.4.22 did, unwritten', () => {
    device('standard');
    load(v0422({ video: 'v1only', picture: null, backend: 'webgl2' }), () => {
      expect(readVideoSettingsV2()).toEqual({ preset: 'custom', renderScalePct: 100, ceiling: 0, frameCap: 0, shadows: 'off', antialias: true, filtering: 'original', power: 'default', colourFilter: 'off', detailDistance: 3.5, graphics: 'webgl2', overlay: 'fps' });
      expect(readVideoSettings()).toEqual({ renderScale: 'quality', shadows: false, showFps: true });
      expect(pagePicture().get()).toBe('modern');                                     // no picture saved, a standard device: MODERN as at v0.4.22
      expect(pageShape().get()).toBe('fill');                                         // VIDEO-SHAPE: no shape saved reads fill, unwritten
      expect(localStorage.getItem(SHAPE_KEY)).toBeNull();
      unchangedReaders();
    });
  });

  it("the saved Xbox renderer pick on a standard device: the Xbox class; the saved Custom's every row kept; a saved PS2 kept", () => {
    device('standard');
    load(v0422({ video: 'custom', picture: 'ps2', backend: 'xbox' }), () => {
      expect(pageDeviceClass()).toBe('xbox');
      expect(readGraphicsBackend('')).toBe('xbox');
      expect(readGraphicsDemoted()).toBeNull();                                        // v0.4.22: a reason is read only while WebGL2 is saved
      expect(readVideoSettingsV2()).toEqual(storedRows('custom', 'auto'));             // 'xbox' reads as the Automatic renderer row (graphicsOf)
      expect(pagePicture().get()).toBe('ps2');
      unchangedReaders();
    });
  });

  it('Xbox device, a saved Custom and the removed HD picture saved: every row kept, the saved picture wins (MODERN)', () => {
    device('xbox');
    load(v0422({ video: 'custom', picture: 'experimental', backend: 'webgl2' }), () => {
      expect(pageDeviceClass()).toBe('xbox');
      expect(readVideoSettingsV2()).toEqual(storedRows('custom', 'webgl2'));
      expect(videoSettingsKeeperV2().resolved().frameCap).toBe(120);                  // the saved cap, never the class's 30
      expect(pagePicture().get()).toBe('modern');
      unchangedReaders();
      consoleRows();
    });
  });

  it('Xbox device, a saved named preset and NO picture saved: the rows kept; the picture is the Xbox class default (PS2, the WM-5a default, audit R2), never written', () => {
    device('xbox');
    load(v0422({ video: 'named', picture: null, backend: 'webgl2' }), () => {
      expect(readVideoSettingsV2()).toEqual(storedRows('quality', 'webgl2'));
      expect(pagePicture().get()).toBe('ps2');                                         // v0.4.22 drew MODERN here: the deliberate default change (R2), unsaved
      expect(localStorage.getItem(PICTURE_KEY)).toBeNull();
      unchangedReaders();
    });
  });
});

/**
 * WM-R20-FOLDS fold (d) (the controller accepted the field): the one field this round adds to `s2u.viewer.video2`,
 * `from: 'lite'` on a Custom made from Lite, read by a v0.4.22 build (a rollback, audit R8). v0.4.22's parse is
 * transcribed here, not imported (nothing of the old tag is in the tree): `git show v0.4.22:socomlegacy/packages/viewer/src/
 * videoSettings.ts` -- `readStored` :268-278 (the v2 branch), its lists :171-179, `VALID` :238-243, `JSON_ROWS` :247,
 * `parseObject` :262. It reads `preset` (a word outside its five reads Automatic), `overlay === 'full'` for the mode and,
 * under any preset but Automatic, each JSON row by name through `VALID` -- it never enumerates the object, so a field it
 * does not name is never read.
 */
const V0422_PRESETS = ['auto', 'performance', 'balanced', 'quality', 'custom'];
const V0422_VALID: Record<string, (v: unknown) => boolean> = {
  renderScalePct: (v) => [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100].includes(v as number),
  ceiling: (v) => [720, 1080, 1440, 0].includes(v as number),
  frameCap: (v) => [0, 30, 60, 120].includes(v as number),
  shadows: (v) => ['off', 'low', 'medium', 'high'].includes(v as string),
  antialias: (v) => typeof v === 'boolean',
  filtering: (v) => ['original', 'anisotropic'].includes(v as string),
  power: (v) => ['default', 'high-performance', 'low-power'].includes(v as string),
  colourFilter: (v) => ['off', 'protanopia', 'deuteranopia', 'tritanopia'].includes(v as string),
};
/** v0.4.22's v2 branch: the preset, the overlay's mode, and the JSON rows it takes (the base rows it lays beneath are left out). */
function v0422Parse(raw: string): { preset: string; mode: 'fps' | 'full'; taken: Record<string, unknown> } {
  const v2 = JSON.parse(raw) as Record<string, unknown>;
  const preset = V0422_PRESETS.includes(v2.preset as string) ? v2.preset as string : 'auto';
  const taken: Record<string, unknown> = {};
  if (preset !== 'auto') for (const k of Object.keys(V0422_VALID)) if (V0422_VALID[k]!(v2[k])) taken[k] = v2[k];
  return { preset, mode: v2.overlay === 'full' ? 'full' : 'fps', taken };
}

describe("WM-R20-FOLDS fold (d): a video2 carrying from: 'lite' reads every other field unchanged, on this build and on v0.4.22's parse", () => {
  it("a Custom made from Lite, as this build writes it: v0.4.22's parse ignores from and reads Custom with every row; this build reads the same rows", () => {
    device('standard');
    const k = videoSettingsKeeperV2();
    k.set({ preset: 'lite' });
    k.set({ ...ROWS_OFF_DEFAULT, overlay: 'full' });
    const raw = localStorage.getItem(VIDEO_SETTINGS_KEY_V2)!;
    const stored = JSON.parse(raw) as Record<string, unknown>;
    expect(stored).toMatchObject({ preset: 'custom', from: 'lite' });
    const { from: _from, ...without } = stored;
    const old = v0422Parse(raw);
    expect(old).toEqual(v0422Parse(JSON.stringify(without)));                          // the field changes nothing v0.4.22 reads
    expect(old).toEqual({ preset: 'custom', mode: 'full', taken: { ...ROWS_OFF_DEFAULT } });
    const now = readVideoSettingsV2();                                                 // this build: the same preset and rows
    expect(now.preset).toBe(old.preset);
    for (const [key, value] of Object.entries(old.taken)) expect(now[key as keyof typeof now], key).toBe(value);
    localStorage.setItem(VIDEO_SETTINGS_KEY_V2, JSON.stringify(without));               // and without the field, this build reads them alike
    expect(readVideoSettingsV2()).toEqual(now);
  });

  it("v0.4.22's parse and this build's agree on every field of the fixture's two v0.4.22 values (from absent)", () => {
    device('standard');
    for (const video of ['custom', 'named'] as const) {
      const raw = v0422({ video, picture: null, backend: 'webgl2' })[VIDEO_SETTINGS_KEY_V2]!;
      localStorage.setItem(VIDEO_SETTINGS_KEY_V2, raw);
      const old = v0422Parse(raw), now = readVideoSettingsV2();
      expect(now.preset, video).toBe(old.preset);
      for (const [key, value] of Object.entries(old.taken)) expect(now[key as keyof typeof now], `${video} ${key}`).toBe(value);
    }
  });
});

/**
 * The coordinator's addition (2) to the fixture's named gap: what a v0.4.22 Automatic player drew on each device class,
 * transcribed (not imported) from the tag -- `git show v0.4.22:socomlegacy/packages/viewer/src/autoQuality.ts`
 * `CLASS_START_ADAPTATION` :25-37 (xbox :30, software :31, touch :33, lowMemory :34, standard :35, high :36), over
 * `videoSettings.ts` `COMMON_ROWS` :218-221 and `PRESET_VALUES` :226-230, `deviceClass.ts` `XBOX_GRAPHICS_ADAPTATION`
 * :131 ('webgl2'), `detailDistance.ts` `DETAIL_DISTANCE_MODERN_DEFAULT` :28 (2). v0.4.22's `autoResolved` (:92-95) is
 * this build's word for word: the probe's saved preset on its class and renderer, else the class's start. With no
 * picture saved, v0.4.22 drew MODERN on every class (`picture.ts` `parsePicture`, absent -> `VIDEO_PICTURE_DEFAULT`).
 * The intended changes since are NAMED here, not hidden: the Xbox class's frame cap 60 -> 30 and its PS2 picture (WM-5a,
 * audit R2), the touch class's shadows medium -> off (WM-5a, audit R3). Anything else different fails.
 */
const V0422_COMMON = { frameCap: 0, overlay: 'off', antialias: true, filtering: 'original', graphics: 'auto', power: 'default', colourFilter: 'off', detailDistance: 2 };
const V0422_PRESET = {
  performance: { ...V0422_COMMON, renderScalePct: 75, ceiling: 1080, shadows: 'off' },
  balanced: { ...V0422_COMMON, renderScalePct: 100, ceiling: 1440, shadows: 'medium' },
  quality: { ...V0422_COMMON, renderScalePct: 100, ceiling: 0, shadows: 'medium' },
};
const V0422_CLASS_START: Record<DeviceClass, Record<string, unknown>> = {
  xbox: { ...V0422_PRESET.performance, graphics: 'webgl2', antialias: false, ceiling: 720, renderScalePct: 75, shadows: 'off', frameCap: 60 },
  software: { ...V0422_PRESET.performance, shadows: 'off', ceiling: 720 },
  touch: { ...V0422_PRESET.balanced, shadows: 'medium' },
  lowMemory: { ...V0422_PRESET.performance },
  standard: { ...V0422_PRESET.balanced },
  high: { ...V0422_PRESET.quality },
};
/** The intended differences since v0.4.22, row by row, per class: { row: [v0.4.22, now] }. */
const INTENDED: Record<DeviceClass, Record<string, [unknown, unknown]>> = {
  xbox: { frameCap: [60, 30] }, touch: { shadows: ['medium', 'off'] }, software: {}, lowMemory: {}, standard: {}, high: {},
};

describe("the fixture's class gap: a v0.4.22 Automatic player's rows on each device class, the intended changes named", () => {
  const CLASSES = Object.keys(V0422_CLASS_START) as DeviceClass[];

  it("every class: this build's Automatic rows (no probe saved) are v0.4.22's but for the named changes", () => {
    for (const c of CLASSES) {
      const now = autoResolved(c, () => null, null) as unknown as Record<string, unknown>;
      expect(Object.keys(now).sort(), c).toEqual(Object.keys(V0422_CLASS_START[c]).sort());
      const differs = Object.fromEntries(Object.keys(now).filter((k) => now[k] !== V0422_CLASS_START[c][k]).map((k) => [k, [V0422_CLASS_START[c][k], now[k]]]));
      expect(differs, c).toEqual(INTENDED[c]);
    }
  });

  it('the picture with none saved: MODERN on every class at v0.4.22; now PS2 on the Xbox class alone (the named change)', () => {
    for (const c of CLASSES) expect([c, CLASS_PICTURE_ADAPTATION[c]]).toEqual([c, c === 'xbox' ? 'ps2' : 'modern']);
  });

  it("a probe's saved preset (standard and high, the classes probed) reads its preset's values, as at v0.4.22", () => {
    for (const c of ['standard', 'high'] as const) {
      const read = (k: string): string | null => (k === 's2u.viewer.videoAuto' ? JSON.stringify({ deviceClass: c, renderer: STANDARD_GPU, preset: 'performance' }) : null);
      expect(autoResolved(c, read, STANDARD_GPU), c).toEqual(V0422_PRESET.performance);
      expect(autoResolved(c, read, 'another renderer'), `${c}: another renderer, the start again`).toEqual(V0422_CLASS_START[c]);
    }
  });

  it('through the page: a v0.4.22 Automatic value on a standard and an Xbox device reads those rows, unwritten', () => {
    for (const kind of ['standard', 'xbox'] as const) {
      device(kind);
      localStorage.clear();
      localStorage.setItem(VIDEO_SETTINGS_KEY_V2, JSON.stringify({ preset: 'auto', overlay: 'fps' }));
      const before = snapshot(localStorage);
      const { preset, ...rows } = readVideoSettingsV2();
      expect(preset, kind).toBe('auto');
      const want = { ...V0422_CLASS_START[kind] } as Record<string, unknown>;
      for (const [k, [, now]] of Object.entries(INTENDED[kind])) want[k] = now;
      expect(rows, kind).toEqual(want);
      expect(snapshot(localStorage), kind).toEqual(before);
      vi.restoreAllMocks(); resetPageRendererProbeForTest();
    }
  });
});
