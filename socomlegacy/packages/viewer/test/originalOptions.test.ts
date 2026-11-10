import { describe, expect, it } from 'vitest';
import { RIGHT_STICK } from '../src/look';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { FsAssetSource } from '@s2u/archive/node';
import { CardSlots, PERSONA_FILE_PATH, PERSONA_SAVE_DIR, personaFileSize, type CardStorage } from '@s2u/card';
import { UI_VALVE_OPS } from '@s2u/scene';
import { findNode, OPTION_VALVES, OptionGlobals, RadioStripWidget, stickTunersOfPreset, ValveStore, VALVE_TYPE, VIDEO_ROWS, widgetPad, type PadButtonName, type VideoPicture } from '@s2u/ui';
import { FrontEndSession, readFrontEndDisc } from '../src/frontEnd';
import { videoSettingsKeeper } from '../src/videoSettings';
import { globalValvesOf, loadOptionValves, optionValvesOf, playOptionsOf, restoreValveModule, valveModule, VALVE_MODULE } from '../src/originalOptions';
import { OPTION_TOGGLES, PLAYTHROUGH_STATE, pinnedValves, tableDefaults } from './optionToggles';

/**
 * OPTIONS on the page (web research 302 §4; Chris's settings, 2026-10-07): the option valves' defaults off
 * `global_valves.rdr`, the card's `CValveSaveManager` module (the option valves restored, every PERSIST valve saved;
 * the tuners are UI variables, the `CUIVarManager` module's once a slider raised them: research 104 R104.10), the
 * globals the match applies; then the disc's own pages over a front-end session -- the
 * sliders, the strips, DEFAULT SETTINGS, the discard (`CopyUIVar`) and RETURN's `StoreOptions`.
 */

const DISC = process.env.SOCOM_DISC ?? '';
const HAVE_DISC = DISC !== '' && existsSync(join(DISC, 'RUN', 'UI', 'READERC.ZAR'));

describe('the option valves and the card (04 O15, O16; R7)', () => {
  it('reads the `valves` table\'s option rows with their type words, in the table\'s order', () => {
    const root = [['valves', [
      ['name', ['INVERT_PITCH_CONTROLLER'], 'value', ['0'], 'type', ['PERSIST']],
      ['name', ['PopupNewsOnce'], 'value', ['0']],
      ['name', ['BOBBING_1ST_PERSON'], 'value', ['1'], 'type', ['PERSIST']],
      ['name', ['HDD_ENABLE'], 'value', ['x']],
    ]]];
    expect(optionValvesOf(root)).toEqual([
      { name: 'INVERT_PITCH_CONTROLLER', value: 0, type: 'PERSIST' }, { name: 'BOBBING_1ST_PERSON', value: 1, type: 'PERSIST' },
    ]);
    const valves = new ValveStore();
    loadOptionValves(valves, optionValvesOf(root));
    expect(valves.find('BOBBING_1ST_PERSON')).toMatchObject({ value: 1, type: VALVE_TYPE.PERSIST });
  });

  it('reads every row of the `valves` table with its type word, in the table\'s order (CValve_Parse\'s input)', () => {
    const root = [['valves', [
      ['name', ['INVERT_PITCH_CONTROLLER'], 'value', ['0'], 'type', ['PERSIST']],
      ['name', ['PopupNewsOnce'], 'value', ['0']],
      ['name', ['SetSabre'], 'value', ['0'], 'type', ['PERSIST']],
      ['name', ['HDD_ENABLE'], 'value', ['x']],
    ]]];
    expect(globalValvesOf(root)).toEqual([
      { name: 'INVERT_PITCH_CONTROLLER', value: 0, type: 'PERSIST' }, { name: 'PopupNewsOnce', value: 0 }, { name: 'SetSabre', value: 0, type: 'PERSIST' },
    ]);
    expect(optionValvesOf(root)).toEqual([{ name: 'INVERT_PITCH_CONTROLLER', value: 0, type: 'PERSIST' }]);
    expect(globalValvesOf(['not', 'a table'])).toEqual([]);
  });

  it('restores every entry of the module at PERSIST, a name the registry lacks made (FUN_00352960 D:L251422-251443); a malformed module restores nothing', () => {
    const valves = new ValveStore();
    expect(restoreValveModule(valves, { INVERT_PITCH_CONTROLLER: 1, GameComplete: 1 })).toBe(true);
    expect(valves.find('INVERT_PITCH_CONTROLLER')).toMatchObject({ value: 1, type: VALVE_TYPE.PERSIST });
    expect(valves.find('GameComplete')).toMatchObject({ value: 1, type: VALVE_TYPE.PERSIST });
    expect(valves.all().map((v) => v.name)).toEqual(['INVERT_PITCH_CONTROLLER', 'GameComplete']);   // the module's order
    for (const bad of [{ INVERT_PITCH_CONTROLLER: 'yes' }, { INVERT_PITCH_CONTROLLER: 70_000 }, [1], 'x', null]) {
      const v = new ValveStore();
      expect(restoreValveModule(v, bad), JSON.stringify(bad)).toBe(false);
      expect(v.all()).toEqual([]);
    }
    expect(restoreValveModule(new ValveStore(), undefined)).toBe(true);   // no module: nothing to restore
  });

  it('saves every PERSIST valve over the module as read; a PERM valve and a module\'s unknown names as they were', () => {
    const valves = new ValveStore();
    valves.set('INVERT_PITCH_CONTROLLER', 1, VALVE_TYPE.PERSIST);
    valves.set('OptionsMenuChanged', 1, VALVE_TYPE.PERM);
    expect(valveModule(valves, { GameComplete: 1, INVERT_PITCH_CONTROLLER: 0 })).toEqual({ GameComplete: 1, INVERT_PITCH_CONTROLLER: 1 });
    expect(valveModule(valves, 'not a module')).toEqual({ INVERT_PITCH_CONTROLLER: 1 });
  });

  it('the match applies the three as StoreOptions left them; before any store, the defaults (normal pitch, the bob on, L3)', () => {
    expect(playOptionsOf(null)).toEqual({ invertPitch: false, headBob: true, fireModeSwap: false, stick: RIGHT_STICK, vibration: true });
    const g = new OptionGlobals(), v = new ValveStore();
    v.set('INVERT_PITCH_CONTROLLER', 1, VALVE_TYPE.PERSIST); v.set('BOBBING_1ST_PERSON', 0, VALVE_TYPE.PERSIST); v.set('FIREMODESWAP_CONTROLLER', 1, VALVE_TYPE.PERSIST);
    g.store(v);
    expect(playOptionsOf(g)).toEqual({ invertPitch: true, headBob: false, fireModeSwap: true, stick: RIGHT_STICK, vibration: true });
  });
});

class MemoryStorage implements CardStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, String(value)); }
}

/** The registry as `CValve_Open` leaves it for the 65 (`global_valves.rdr`'s PERSIST rows, research 229 §2), in their order. */
function registryAtDefaults(): ValveStore {
  const defaults = tableDefaults();
  const valves = new ValveStore();
  valves.loadValves(pinnedValves().names.map((name) => ({ name, value: defaults[name]!, type: 'PERSIST' })), VALVE_TYPE.PERM);
  return valves;
}

/** The save file written to slot 1 with `module` as its `CValveSaveManager`, read back by another page over the same storage. */
function throughTheSlot(module: Record<string, number>): unknown {
  const storage = new MemoryStorage();
  const slots = new CardSlots(() => storage, () => {}, { now: () => 5_000 });
  const slot = slots.slot(1);
  if (!slot.makeDir(PERSONA_SAVE_DIR.slice(1), slot.info().rev).ok) throw new Error('no folder');
  if (!slot.writeFile(PERSONA_FILE_PATH.slice(1), personaFileSize(0), { [VALVE_MODULE]: module }, slot.info().rev).ok) throw new Error('no write');
  const read = new CardSlots(() => storage, () => {}).slot(1).readFile(PERSONA_FILE_PATH.slice(1));
  if (!read.ok) throw new Error(JSON.stringify(read.failure));
  return (read.value.data as Record<string, unknown>)[VALVE_MODULE];
}

describe('OPT-02: the 65 persistent valves through the slot (R7; research 229 §1-§2)', () => {
  it('the pin holds the 65 names and the f0 card\'s value of each; two differ from the table\'s defaults (a playthrough\'s state)', () => {
    const { names, values } = pinnedValves();
    expect(names).toHaveLength(65);
    expect(Object.keys(values)).toEqual(names);
    const defaults = tableDefaults();
    expect(names.filter((n) => defaults[n] !== values[n])).toEqual(Object.keys(PLAYTHROUGH_STATE));
    for (const [n, s] of Object.entries(PLAYTHROUGH_STATE)) expect(values[n], n).toBe(s.f0);
  });

  it('at the table\'s defaults the module holds the 65 names in the registry\'s order, each with its default (FUN_00352a90 D:L251470-251480)', () => {
    const module = valveModule(registryAtDefaults(), undefined);
    expect(Object.keys(module)).toEqual(pinnedValves().names);
    expect(module).toEqual(tableDefaults());
  });

  it('every value survives a save to the slot and a restore back, the 65 at once', () => {
    const { names } = pinnedValves();
    const saving = registryAtDefaults();
    names.forEach((name, i) => saving.set(name, (tableDefaults()[name]! + i + 1) & 0xffff, VALVE_TYPE.PERSIST));
    const module = valveModule(saving, undefined);
    const read = throughTheSlot(module);
    expect(read).toEqual(module);
    const loading = registryAtDefaults();
    expect(restoreValveModule(loading, read)).toBe(true);
    for (const name of names) expect(loading.find(name), name).toMatchObject({ value: saving.find(name)!.value, type: VALVE_TYPE.PERSIST });
    expect(valveModule(loading, undefined)).toEqual(module);
  });

  it('a value absent from the file (an older save) keeps the registry\'s default; the next save writes the 65 again', () => {
    const defaults = tableDefaults();
    const older = { INVERT_PITCH_CONTROLLER: 1, BOBBING_1ST_PERSON: 0 };
    const loading = registryAtDefaults();
    expect(restoreValveModule(loading, throughTheSlot(older))).toBe(true);
    expect(loading.find('INVERT_PITCH_CONTROLLER')?.value).toBe(1);
    expect(loading.find('BOBBING_1ST_PERSON')?.value).toBe(0);
    for (const name of ['GameSpeedFilter', 'SetSabre', 'ScreenOriginX', 'SecurePassword']) expect(loading.find(name), name).toMatchObject({ value: defaults[name], type: VALVE_TYPE.PERSIST });
    expect(valveModule(loading, older)).toEqual({ ...defaults, ...older });
  });

  it('a name the table does not declare comes back PERSIST and is saved again, as the original\'s registry carries it', () => {
    const loading = registryAtDefaults();
    expect(restoreValveModule(loading, throughTheSlot({ ...tableDefaults(), FutureValve: 7 }))).toBe(true);
    expect(loading.find('FutureValve')).toMatchObject({ value: 7, type: VALVE_TYPE.PERSIST });
    expect(valveModule(loading, undefined).FutureValve).toBe(7);
  });
});

describe('OPT-02: each option\'s handler changes exactly its persistent valves (a reading; research 229 §3)', () => {
  const op = (word: string): number => (UI_VALVE_OPS as readonly string[]).indexOf(word);
  for (const t of OPTION_TOGGLES) {
    it(`${t.task} ${t.dialog} ${t.animation}: ${JSON.stringify(t.saved)}`, () => {
      const valves = registryAtDefaults();
      const before = valveModule(valves, undefined);
      // The script's parse makes each valve it names TEMP (FUN_00351ff0(name, 2), D:L251782); a declared one keeps its type.
      for (const [valve] of t.ops) valves.acquire(valve, VALVE_TYPE.TEMP);
      for (const [valve, word, operand] of t.ops) expect(valves.apply({ valve, op: op(word), operand }), `${valve} ${word} ${operand}`).toBe(true);
      const after = throughTheSlot(valveModule(valves, before)) as Record<string, number>;
      expect(Object.keys(after)).toEqual(Object.keys(before));
      expect(after).toEqual({ ...before, ...t.saved });
      const persistent = new Set(pinnedValves().names);
      expect(Object.keys(t.saved).sort()).toEqual([...new Set(t.ops.map(([v]) => v).filter((v) => persistent.has(v)))].sort());
    });
  }
});

describe.skipIf(!HAVE_DISC)('OPTIONS on the dev disc, over a front-end session (the disc\'s layouts and scripts)', () => {
  const session = async (start: string, picture?: { get(): VideoPicture; set(p: VideoPicture): void }) => {
    const disc = await readFrontEndDisc(new FsAssetSource(DISC));
    const s = new FrontEndSession({ disc, startDialog: start, loader: false, ...(picture ? { picture } : {}) });
    let now = 0;
    s.advance(now);
    const frames = (n = 30): void => { for (let i = 0; i < n; i++) s.advance(now += 1000 / 30); };
    const press = (key: PadButtonName, n = 30): void => {
      s.input.source = { read: () => ({ down: new Set([key]), stickX: 0, stickY: 0 }) }; frames(1);
      s.input.source = { read: () => ({ down: new Set(), stickX: 0, stickY: 0 }) }; frames(n);
    };
    const focus = (target: string): void => {
      for (let i = 0; i < 16 && s.input.ring()?.focused?.name !== target; i++) press('DOWN');
      expect(s.input.ring()?.focused?.name).toBe(target);
    };
    frames(90);
    return { s, frames, press, focus, disc };
  };

  it('reads global_valves.rdr whole, the 22 option valves among its rows (OPT-02b); the session starts with them, the tuners and the globals stored', async () => {
    const { s, disc } = await session('dlgOptions_Menu.rdr');
    const options = (disc.globalValves ?? []).filter((v) => OPTION_VALVES.includes(v.name));
    expect(options.map((v) => v.name).sort()).toEqual([...OPTION_VALVES].sort());
    for (const v of options) expect(s.opener.valves.find(v.name)?.value, v.name).toBe(v.value);
    expect(s.uiVars.find('MUSIC_VOLUME')).toMatchObject({ value: { type: 'real', value: Math.fround(0.74) }, longevity: 2 });
    expect(playOptionsOf(s.options)).toEqual({ invertPitch: false, headBob: true, fireModeSwap: false, stick: RIGHT_STICK, vibration: true });
    s.close();
  }, 60_000);

  it('runs original Defaults after changing every supported slider and strip', async () => {
    for (const [name, controls] of [
      ['dlgOptions_Audio.rdr', ['music_bar', 'sound_bar', 'dialog_bar']],
      ['dlgOptions_Video.rdr', ['headbobbing']],
      ['dlgControllerSelection.rdr', ['invert_pitch', 'firerate']],
    ] as const) {
      const { s, press, focus } = await session(name);
      for (const control of controls) { focus(control); press(name.includes('Audio') ? 'LEFT' : 'RIGHT'); }
      if (name.includes('Audio')) for (const key of ['MUSIC_VOLUME', 'SOUND_VOLUME', 'DIALOG_VOLUME']) expect((s.uiVars.find(key)?.value as { value: number }).value).toBeLessThan(key === 'MUSIC_VOLUME' ? 0.74 : 1);
      if (name.includes('Video')) expect(s.opener.valves.find('BOBBING_1ST_PERSON')?.value).toBe(0);
      if (name.includes('Controller')) for (const key of ['INVERT_PITCH_CONTROLLER', 'FIREMODESWAP_CONTROLLER']) expect(s.opener.valves.find(key)?.value).toBe(1);
      focus('Default'); press('CROSS');
      // do_audio_default sets the slider to #74: 74 / 100 in float32 toward zero (FUN_00372640), not the tuner's 0.74 literal.
      if (name.includes('Audio')) for (const [key, value] of [['MUSIC_VOLUME', 0.7399999499320984], ['SOUND_VOLUME', 1], ['DIALOG_VOLUME', 1]] as const) expect(s.uiVars.find(key)?.value).toEqual({ type: 'real', value });
      if (name.includes('Video')) expect(s.opener.valves.find('BOBBING_1ST_PERSON')?.value).toBe(1);
      if (name.includes('Controller')) for (const key of ['INVERT_PITCH_CONTROLLER', 'FIREMODESWAP_CONTROLLER']) expect(s.opener.valves.find(key)?.value).toBe(0);
      s.close();
    }
  }, 60_000);

  it('the audio discard (TRIANGLE, YES): CopyUIVar puts the volume back as it was', async () => {
    const { s, press } = await session('dlgOptions_Audio.rdr');
    const initial = s.uiVars.find('MUSIC_VOLUME')?.value;
    press('LEFT', 20);
    expect(s.uiVars.find('MUSIC_VOLUME')?.value).not.toEqual(initial);
    press('TRIANGLE', 20);
    expect(s.parts.current?.popup()?.node?.visible).toBe(true);
    press('RIGHT', 5); press('CROSS', 80);
    expect(s.machine.shell()?.currentName).toBe('dlgOptions_Menu.rdr');
    expect(s.uiVars.find('MUSIC_VOLUME')?.value).toEqual(initial);
    s.close();
  }, 60_000);

  // The parked rows (b), TEAMMATE NAMES: VIDEO's strip runs the disc's Enable_TeamNames / Disable_TeamNames, writing the
  // valve the match's HUD reads at its set-up (`DISPLAY_MP_TEAM_NAMES`, D:L77558; `matchMount.ts` `setTeammateNames`) --
  // the same valve ONLINE OPTIONS' strip writes (OPT-15).
  it('VIDEO\'s TEAMMATE NAMES (unparked): the strip moves DISPLAY_MP_TEAM_NAMES both ways', async () => {
    const { s, press, focus } = await session('dlgOptions_Video.rdr');
    const before = s.opener.valves.find('DISPLAY_MP_TEAM_NAMES')?.value ?? 1;
    focus('TeamMateNames'); press('RIGHT');
    const once = s.opener.valves.find('DISPLAY_MP_TEAM_NAMES')?.value;
    expect(once).not.toBe(before);
    press('RIGHT');
    expect(s.opener.valves.find('DISPLAY_MP_TEAM_NAMES')?.value).toBe(before);
    s.close();
  }, 60_000);

  // HELP WINDOWS, store-only (the merge controller's call: the valve is the card's): the strip moves HelpWindowsEnabled,
  // a persistent valve the card's module carries; nothing in the port reads it (the campaign's pop-up, D:L79390). CPS-4b
  // (CPS.R7 (c), an adaptation): hidden -- not drawn, off the focus ring -- but its strip kept, since the disc's set names
  // it: its boxes' own scripts still move the valve, so a card's value round-trips.
  it('VIDEO\'s HELP WINDOWS (store-only; CPS-4b: hidden, off the ring): its strip\'s disc scripts still move HelpWindowsEnabled', async () => {
    const { s, frames } = await session('dlgOptions_Video.rdr');
    const parts = s.parts.current!;
    expect(s.input.ring()?.controls.map((c) => c.name)).not.toContain('helpwindows');
    expect(findNode(parts.dialog.screen.root, 'helpwindows')?.visible).toBe(false);
    const strip = parts.widgets.get('helpwindows');
    expect(strip).toBeInstanceOf(RadioStripWidget);
    const before = s.opener.valves.find('HelpWindowsEnabled')?.value ?? 1;
    (strip as RadioStripWidget).input(widgetPad({ RIGHT: 'FALLING' }), parts.widgetHost);
    frames(30);
    const once = s.opener.valves.find('HelpWindowsEnabled')?.value;
    expect(once).not.toBe(before);
    (strip as RadioStripWidget).input(widgetPad({ RIGHT: 'FALLING' }), parts.widgetHost);
    frames(30);
    expect(s.opener.valves.find('HelpWindowsEnabled')?.value).toBe(before);
    s.close();
  }, 60_000);

  // CPS-4b (CPS.R7 (c), an adaptation): RENDER SCALE, SHADOWS and SHOW FPS after VIDEO MODE, on the ring in order, each
  // made at the page's video keeper's value and stepping it at once (no valve, no card). Node has no localStorage: a
  // memory one stands in for the page's for this test.
  it('VIDEO\'s RENDER SCALE, SHADOWS, SHOW FPS (CPS-4b): on the ring after VIDEO MODE; a step sets the page\'s video keeper', async () => {
    const g = globalThis as { localStorage?: unknown };
    const held = g.localStorage, store = new Map<string, string>();
    g.localStorage = {
      getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); }, clear: () => { store.clear(); }, key: (i: number) => [...store.keys()][i] ?? null,
      get length() { return store.size; },
    };
    try {
      const keeper = videoSettingsKeeper();
      keeper.set({ renderScale: 'balanced', shadows: true, showFps: false });
      expect(keeper.get()).toEqual({ renderScale: 'balanced', shadows: true, showFps: false });
      const { s, press, focus } = await session('dlgOptions_Video.rdr');
      const ring = s.input.ring()!.controls.map((c) => c.name), at = ring.indexOf('video_mode');
      expect(ring.slice(at, at + 5)).toEqual(['video_mode', VIDEO_ROWS.renderScale, VIDEO_ROWS.shadows, VIDEO_ROWS.showFps, 'headbobbing']);
      const valvesBefore = JSON.stringify(s.opener.valves.all());
      focus(VIDEO_ROWS.renderScale); press('RIGHT');
      expect(keeper.get().renderScale).toBe('quality');
      focus(VIDEO_ROWS.shadows); press('CROSS');
      expect(keeper.get().shadows).toBe(false);
      focus(VIDEO_ROWS.showFps); press('LEFT');
      expect(keeper.get().showFps).toBe(true);
      expect(JSON.stringify(s.opener.valves.all())).toBe(valvesBefore);                       // no valve moved
      s.close();
    } finally {
      g.localStorage = held;
    }
  }, 60_000);

  // SOUND MODE (the parked rows, b): AUDIO's strip runs the disc's enable_stereo / disable_stereo / enable_dolby, writing
  // STEREO_CONTROLLER 1 / 0 / 2; StoreOptions copies it to the globals the page's output reads (`./audio` setSoundMode).
  it('AUDIO\'s SOUND MODE (unparked): the strip walks STEREO_CONTROLLER through its three boxes; StoreOptions stores it', async () => {
    const { s, press, focus } = await session('dlgOptions_Audio.rdr');
    const seen = new Set<number>([s.opener.valves.find('STEREO_CONTROLLER')?.value ?? 1]);
    focus('mono_stereo');
    for (let i = 0; i < 3; i++) { press('RIGHT'); seen.add(s.opener.valves.find('STEREO_CONTROLLER')?.value ?? -1); }
    expect([...seen].sort()).toEqual([0, 1, 2]);
    const now = s.opener.valves.find('STEREO_CONTROLLER')?.value;
    s.host.dispatch({ anim: 'test', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn: 'StoreOptions', arg: 'NA', loc: 0, bytes: new Uint8Array(0x18) });
    expect(s.options.value('STEREO_CONTROLLER')).toBe(now);
    s.close();
  }, 60_000);

  // SCREEN POSITION (the parked rows, b): what the disc's own dlgScreenAdjust.rdr d-pad scripts do to the two valves, read by
  // running them -- each press one step, ScreenOriginX held to 0..250 and ScreenOriginY to 80..250, from 128 (the
  // registry's default, research 104). `SetScreenOrigin` (FUN_0027bf10, D:L125261-125278) then lays value - 128 on the
  // GS DISPLAY register's DX (x DAT_004a4500) and DY (D:L304788-304791).
  it('SCREEN POSITION: the disc\'s d-pad scripts step ScreenOriginX over 0..250 and ScreenOriginY over 80..250, by one, from 128', async () => {
    const { s, press } = await session('dlgScreenAdjust.rdr');
    const v = (n: string): number | undefined => s.opener.valves.find(n)?.value;
    expect([v('ScreenOriginX'), v('ScreenOriginY')]).toEqual([128, 128]);
    const walk = (dir: PadButtonName, valve: string, n: number): number[] => {
      const seq = [v(valve)!];
      for (let i = 0; i < n; i++) { press(dir, 3); seq.push(v(valve)!); }
      return seq;
    };
    const left = walk('LEFT', 'ScreenOriginX', 140);
    expect(left.slice(0, 4)).toEqual([128, 127, 126, 125]);
    expect(Math.min(...left)).toBe(0);
    expect(Math.max(...walk('RIGHT', 'ScreenOriginX', 270))).toBe(250);
    expect(Math.min(...walk('UP', 'ScreenOriginY', 200))).toBe(80);
    expect(Math.max(...walk('DOWN', 'ScreenOriginY', 200))).toBe(250);
    s.close();
  }, 120_000);

  // SCREEN POSITION's page, through the session (the parked rows, b): VIDEO's button opens it; each d-pad step hands the page
  // the origin (`SetScreenOrigin`); the disc's CROSS (`leave_screen_save`) keeps it and returns to VIDEO; its TRIANGLE
  // (`leave_screen_no_save`) asks, and YES puts the valves back and lays the origin again.
  for (const leave of ['CROSS', 'TRIANGLE'] as const) it(`SCREEN POSITION's page: the d-pad hands the page the origin; ${leave} leaves it`, async () => {
    const laid: [number, number][] = [];
    const disc = await readFrontEndDisc(new FsAssetSource(DISC));
    const s = new FrontEndSession({ disc, startDialog: 'dlgOptions_Video.rdr', loader: false, screenOrigin: (x, y) => { laid.push([x, y]); } });
    let now = 0;
    s.advance(now);
    const frames = (n = 30): void => { for (let i = 0; i < n; i++) s.advance(now += 1000 / 30); };
    const press = (key: PadButtonName, n = 30): void => {
      s.input.source = { read: () => ({ down: new Set([key]), stickX: 0, stickY: 0 }) }; frames(1);
      s.input.source = { read: () => ({ down: new Set(), stickX: 0, stickY: 0 }) }; frames(n);
    };
    frames(90);
    for (let i = 0; i < 16 && s.input.ring()?.focused?.name !== 'ScreenAdjustBtn'; i++) press('DOWN');
    press('CROSS', 150);
    expect(s.machine.shell()?.currentName).toBe('dlgScreenAdjust.rdr');
    expect(laid).toEqual([[0, 0]]);                                             // the boot's StoreOptions: the default origin
    press('RIGHT'); press('RIGHT'); press('DOWN');
    expect(laid).toEqual([[0, 0], [1, 0], [2, 0], [2, 1]]);
    if (leave === 'CROSS') {
      press('CROSS', 200);
      expect(s.machine.shell()?.currentName).toBe('dlgOptions_Video.rdr');
      expect([s.opener.valves.find('ScreenOriginX')?.value, s.opener.valves.find('ScreenOriginY')?.value]).toEqual([130, 129]);
      expect(laid.at(-1)).toEqual([2, 1]);
    } else {
      press('TRIANGLE', 20);
      expect(s.parts.current?.popup()?.node?.visible).toBe(true);
      press('RIGHT', 5); press('CROSS', 200);                                   // YES
      expect(s.machine.shell()?.currentName).toBe('dlgOptions_Video.rdr');
      expect([s.opener.valves.find('ScreenOriginX')?.value, s.opener.valves.find('ScreenOriginY')?.value]).toEqual([128, 128]);
      expect(laid.at(-1)).toEqual([0, 0]);
    }
    s.close();
  }, 120_000);

  // HEADSET VOLUME (the parked rows, b): AUDIO's slider moves the HEADSET_CONTROLLER tuner, which the voice chat's playback
  // reads each frame (`voicePlayback.ts` `headsetGain`, W20.R10; the original's FUN_0030fef0 at the headset's open).
  it('AUDIO\'s HEADSET VOLUME (unparked): the slider moves the HEADSET_CONTROLLER tuner down and up', async () => {
    const { s, press, focus } = await session('dlgOptions_Audio.rdr');
    const real = (): number | undefined => { const v = s.uiVars.find('HEADSET_CONTROLLER')?.value; return v?.type === 'real' ? v.value : undefined; };
    const before = real();
    expect(before).toBeDefined();
    focus('headset_bar'); press('LEFT');
    expect(real()!).toBeLessThan(before!);
    press('RIGHT');
    expect(real()).toBeCloseTo(before!, 6);                                // the slider's f32 step back
    s.close();
  }, 60_000);

  it('AIM ASSIST (store-only), VIBRATION (CTL-2) and PITCH move; StoreOptions applies them to the globals the match reads', async () => {
    const { s, press, focus } = await session('dlgControllerSelection.rdr');
    const aim = s.opener.valves.find('AutoAim')?.value ?? 1;
    focus('AutoAim'); press('RIGHT');                                           // the card's value moves; nothing in the port reads it
    expect(s.opener.valves.find('AutoAim')?.value).toBe(aim ? 0 : 1);
    press('LEFT');
    expect(s.opener.valves.find('AutoAim')?.value).toBe(aim);
    const vibration = s.opener.valves.find('VIBRATION_CONTROLLER')?.value ?? 1;
    focus('Vibration'); press('RIGHT');                                         // ON to OFF: disable_vibration's script
    expect(s.opener.valves.find('VIBRATION_CONTROLLER')?.value).toBe(vibration ? 0 : 1);
    focus('invert_pitch'); press('RIGHT');
    expect(s.opener.valves.find('INVERT_PITCH_CONTROLLER')?.value).toBe(1);
    expect(playOptionsOf(s.options).invertPitch).toBe(false);                 // a draft until StoreOptions
    s.host.dispatch({ anim: 'test', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn: 'StoreOptions', arg: 'NA', loc: 0, bytes: new Uint8Array(0x18) });
    expect(playOptionsOf(s.options).invertPitch).toBe(true);
    expect(s.options.value('VIBRATION_CONTROLLER')).toBe(vibration ? 0 : 1);   // the START menu's and the match's toggle
    s.close();
  }, 60_000);

  // OT.R72, CTL.R5 (the owner's bug: "the PRESETS checkboxes cannot change the selection"): parked (OT.R8), the strip took
  // no pad; built, the pad moves it, and the box's own script runs SetStickPreset (R2's question, read off the disc's
  // script by running it): the three sliders' vars are the preset's (`@s2u/ui` `stickTunersOfPreset`), and under CUSTOM
  // LOOK SPEED moves.
  it('CTL.R5: the PRESETS strip takes the pad; each preset box writes the three sliders (SetStickPreset); CUSTOM\'s LOOK SPEED moves', async () => {
    const { s, press, focus } = await session('dlgControllerSelection.rdr');
    const real = (name: string): number | undefined => { const v = s.uiVars.find(name)?.value; return v?.type === 'real' ? v.value : undefined; };
    const before = s.opener.valves.find('stick_preset')?.value ?? 0;
    focus('stick_presets');
    const seen = new Set<number>([before]);
    for (let k = 0; k < 4; k++) {
      press('RIGHT');
      const n = s.opener.valves.find('stick_preset')?.value ?? -1;
      seen.add(n);
      if (n >= 0 && n < 3) {
        const t = stickTunersOfPreset(n);
        expect([real('STICK_SENSITIVITY'), real('STICK_INERTIA'), real('STICK_DEADZONE')], `preset ${n}`).toEqual([t.sensitivity, t.inertia, t.deadZone]);
      }
    }
    expect(seen.size, 'the strip moved through its boxes').toBeGreaterThan(1);
    // To CUSTOM, then LOOK SPEED by the pad.
    for (let k = 0; k < 4 && s.opener.valves.find('stick_preset')?.value !== 3; k++) press('RIGHT');
    expect(s.opener.valves.find('stick_preset')?.value).toBe(3);
    const look = real('STICK_SENSITIVITY');
    focus('StickSensitivity'); press('LEFT');                  // down: the presets' walk may leave it at the top (SEAL's 1.0)
    expect(real('STICK_SENSITIVITY')).toBeLessThan(look!);
    s.close();
  }, 60_000);

  // The review's F2: a fresh card has no stick vars; the boot's StoreOptions (UIStoreOptions' inline apply) writes the
  // stored preset's (RECRUIT's), so CONTROLLER OPTIONS opens on them and CUSTOM's LOOK SPEED moves a look the play reads.
  it('CTL.R5 F2: the boot\'s store gives a fresh card the stored preset\'s three vars; CUSTOM\'s LOOK SPEED then reaches the look', async () => {
    const { s, press, focus } = await session('dlgControllerSelection.rdr');
    const real = (name: string): number | undefined => { const v = s.uiVars.find(name)?.value; return v?.type === 'real' ? v.value : undefined; };
    const t = stickTunersOfPreset(0);
    expect([real('STICK_SENSITIVITY'), real('STICK_INERTIA'), real('STICK_DEADZONE')]).toEqual([t.sensitivity, t.inertia, t.deadZone]);
    expect(s.opener.valves.find('stick_preset')?.value ?? 0).toBe(0);
    focus('stick_presets'); press('LEFT');                             // RECRUIT back to CUSTOM, wrapping: no preset box passed
    expect(s.opener.valves.find('stick_preset')?.value).toBe(3);
    focus('StickSensitivity'); press('LEFT');
    expect(real('STICK_SENSITIVITY')).toBeLessThan(t.sensitivity);
    expect(real('STICK_INERTIA')).toBe(t.inertia);
    expect(real('STICK_DEADZONE')).toBe(t.deadZone);
    s.close();
  }, 60_000);

  // MENU_TOUCH_READING's strip rule (the merge controller's ruling, 2026-10-23) on the disc's own boxes: each PRESETS box
  // has a body a click finds (its CHECKBOX spec's size), and a click on SEAL's chooses SEAL, then CUSTOM's CUSTOM.
  it('CTL.R5, the mouse: a click on a PRESETS box (the disc\'s boxes) chooses it -- SEAL, then CUSTOM', async () => {
    const { s, frames } = await session('dlgControllerSelection.rdr');
    const place = (name: string): [number, number] => {
      type N = { name: string; x: number; y: number; scale: number[]; parent: N | null; children: N[] };
      const find = (n: N): N | null => { if (n.name === name) return n; for (const k of n.children) { const f = find(k); if (f) return f; } return null; };
      const chain: N[] = [];
      for (let n = find(s.machine.shell()!.screen.root as unknown as N); n; n = n.parent) chain.unshift(n);
      let x = 0, y = 0, a = 1, d = 1;
      for (const n of chain) { x += a * n.x; y += d * n.y; a *= n.scale[0]!; d *= n.scale[1]!; }
      return [x + 8, y + 8];
    };
    expect(s.input.tap(...place('Seal'))).toBe('stick_presets');
    frames(30);
    expect(s.opener.valves.find('stick_preset')?.value).toBe(2);
    expect(s.input.ring()?.focused?.name).toBe('stick_presets');
    expect(s.input.tap(...place('Custom'))).toBe('stick_presets');
    frames(30);
    expect(s.opener.valves.find('stick_preset')?.value).toBe(3);
    // AIM ASSIST, built store-only: its boxes choose OFF, then ON (the parked boxes' case is VIDEO MODE's, below).
    for (const [box, want] of [['AAoff', 0], ['AAon', 1]] as const) {
      expect(s.input.tap(...place(box)), box).toBe('AutoAim');
      frames(30);
      expect(s.opener.valves.find('AutoAim')?.value, box).toBe(want);
    }
    // VIBRATION, built (CTL-2): its boxes choose OFF, then ON.
    for (const [box, want] of [['Viboff', 0], ['Vibon', 1]] as const) {
      expect(s.input.tap(...place(box)), box).toBe('Vibration');
      frames(30);
      expect(s.opener.valves.find('VIBRATION_CONTROLLER')?.value, box).toBe(want);
    }
    s.close();
  }, 60_000);

  // VIDEO MODE (OT.R79, LATER 378; an adaptation): the strip's three boxes on the disc's own specs choose the page's
  // picture -- a click on each box hands it over -- and the card's `video_mode` is never written.
  it('VIDEO MODE: MODERN / PS2 / EXPERIMENTAL choose the page\'s picture; the card\'s video_mode untouched', async () => {
    let picked: VideoPicture = 'modern';
    const chosen: VideoPicture[] = [];
    const { s, press, focus, frames } = await session('dlgOptions_Video.rdr', { get: () => picked, set: (p) => { picked = p; chosen.push(p); } });
    const place = (name: string): [number, number] => {
      type N = { name: string; x: number; y: number; scale: number[]; parent: N | null; children: N[] };
      const find = (n: N): N | null => { if (n.name === name) return n; for (const k of n.children) { const f = find(k); if (f) return f; } return null; };
      const chain: N[] = [];
      for (let n = find(s.machine.shell()!.screen.root as unknown as N); n; n = n.parent) chain.unshift(n);
      let x = 0, y = 0, a = 1, d = 1;
      for (const n of chain) { x += a * n.x; y += d * n.y; a *= n.scale[0]!; d *= n.scale[1]!; }
      return [x + 8, y + 8];
    };
    // The build checks the page's box (`selectVideoPicture`); its onCheck hands the same picture back, which the page's
    // keeper ignores (`./picture` `pictureKeeper`).
    expect(chosen.every((p) => p === 'modern'), chosen.join()).toBe(true);
    chosen.length = 0;
    const mode = s.opener.valves.find('video_mode')?.value;
    focus('video_mode');
    // B206 ML-6 (ML.R11, R12; OT.R110): the strip draws MODERN and PS2 only -- the HD (GoE Soul) box is removed.
    const drawn = (name: string): boolean => {
      type D = { name: string; children: D[] };
      const find = (n: D): boolean => n.name === name || n.children.some(find);
      return find(s.machine.shell()!.screen.root as unknown as D);
    };
    expect(drawn('PicturePS2')).toBe(true);
    expect(drawn('PictureExperimental')).toBe(false);
    const boxes = ([['PicturePS2', 'ps2'], ['PictureModern', 'modern']] as const);
    for (const [box, want] of boxes) {
      expect(s.input.tap(...place(box)), box).toBe('video_mode');
      frames(30);
      expect(picked, box).toBe(want);
      expect(s.opener.valves.find('video_mode')?.value, box).toBe(mode);
    }
    expect(chosen).toEqual(boxes.map(([, want]) => want));
    // The pad, as every strip: RIGHT the next box, LEFT back.
    press('RIGHT');
    expect(picked).toBe('ps2');
    press('LEFT');
    expect(picked).toBe('modern');
    expect(s.opener.valves.find('video_mode')?.value).toBe(mode);
    s.close();
  }, 60_000);

  it('opens every supported page with its focus and draw', async () => {
    for (const name of ['dlgOptions_Menu.rdr', 'dlgOptions_Audio.rdr', 'dlgOptions_Video.rdr', 'dlgControllerSelection.rdr']) {
      const { s } = await session(name);
      expect(s.machine.shell()?.currentName, name).toBe(name);
      expect(s.input.ring()?.focused?.enabled(), name).toBe(true);
      expect(s.last.length, name).toBeGreaterThan(0);
      s.close();
    }
  }, 60_000);
});
