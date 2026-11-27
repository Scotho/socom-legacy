// @vitest-environment jsdom
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { ITEM, type Loadout } from '@s2u/scene';
import { FIXTURES_ABSENT } from '../../../archive/test/fixtures';
import { armoryFromDisc, type ArmoryData } from '../../src/armoryData';
import type { ArmoryExit } from '../../src/armoryState';
import type { ArmoryQuad } from '../../src/armoryLayout';
import { loadKitSource, simKitsFromBytes, type SimKits } from '../../src/loadout';
import { ARSENAL_PRESETS, EMPTY_ARSENAL, mapWithArsenal } from '../../src/forge/arsenalSetting';
import type { ForgeLobbyDeps } from '../../src/forge/lobby/deps';
import { mountForgeLobby } from '../../src/forge/lobby/lobby';
import { lobbyArmoryOver } from '../../src/forge/match';
import { armoryViewPaint, ForgeLobbyArmory, type ArmoryPaint } from '../../src/forge/lobby/lobbyArmory';
import { ARSENAL, fakeArmory, KITS, MAP, rosterData, SEAL1, setting, TERR1 } from './lobbyArmoryHarness';

/**
 * FORGE (FG-27; FG.R22, a browser adaptation with no original): the ARMORY inside the lobby window -- the extracted
 * `Armory` (`armory.ts`) over the map's disc data, drawn to a canvas in the window by an injected painter
 * (`ArmoryView.render`, as `matchArmory.ts` draws it); its change sent to the room only, never stored (FG.R21).
 */

const KIT: Loadout = [1, 2, 3, 4, 5] as unknown as Loadout;
const exit = (type: number): ArmoryExit => ({ type, kit: KIT, picks: [] });

function data(o: Partial<ArmoryData> = {}): ArmoryData {
  return {
    archive: 'MP2.ZAR', layout: {} as ArmoryData['layout'], scripts: [], strings: [], models: [], modelTextures: [],
    bitmaps: [['Panel.TIF', { width: 4, height: 2, data: new Uint8ClampedArray(32) }]], roster: {} as ArmoryData['roster'],
    world: { arsenal: {} as never, valves: new Map([['Enable_X', 1]]) }, ...o,
  } as ArmoryData;
}

function setup(o: { source?: boolean; paint?: ArmoryPaint | null; worldless?: boolean; deadZone?: () => number } = {}) {
  const sent: ArmoryExit[] = [], back: number[] = [];
  const f = fakeArmory();
  const a = new ForgeLobbyArmory({
    doc: document,
    source: () => (o.source === false ? null : { data: Promise.resolve(data(o.worldless ? { world: null } : {})), side: 'terrorist', send: (e) => { sent.push(e); } }),
    map: () => 'mp2',
    names: () => ({ game: 'FROSTFIRE BOX', room: '' }),
    closed: () => { back.push(1); },
    paint: o.paint ?? null,
    clock: () => 0,
    make: f.make,
    ...(o.deadZone ? { deadZone: o.deadZone } : {}),
  });
  document.body.append(a.canvas);
  return { a, f, sent, back };
}

afterEach(() => { document.body.innerHTML = ''; localStorage.clear(); });

describe('FORGE lobby: the ARMORY in the window', () => {
  it('opens over the map\'s data and world, for the seat\'s side, the map\'s stem its key', async () => {
    const { a, f } = setup();
    expect(await a.open()).toBe(true);
    expect(a.isOpen()).toBe(true);
    expect(f.log).toEqual(['data', 'world']);
    expect(f.st.world).toMatchObject({ side: 'terrorist', map: 'MP2', archive: 'MP2.ZAR' });
    expect(f.st.world!.valves.get('Enable_X')).toBe(1);
    expect(f.st.opened).toEqual([null]);
  });

  it('does not open without a source or without the data\'s world', async () => {
    expect(await setup({ source: false }).a.open()).toBe(false);
    const w = setup({ worldless: true });
    expect(await w.a.open()).toBe(false);
    expect(w.a.isOpen()).toBe(false);
  });

  it('a change goes to the room (the source\'s send) and is held for the next opening; nothing is written to the browser\'s storage', async () => {
    const { a, f, sent } = setup();
    await a.open();
    f.deps().change(exit(2), 'terrorist');
    expect(sent).toEqual([exit(2)]);
    // The screen's own store (Square's save) is the session's: the browser's storage is never written (FG.R21).
    f.deps().store!.set('s2u.armory.v1.MP2.terrorist', '{"charSet":6,"items":[1,2,3,4,5],"valid":true}');
    expect(f.deps().store!.get('s2u.armory.v1.MP2.terrorist')).toContain('charSet');
    expect(localStorage.length).toBe(0);
    f.shut();
    await a.open();
    expect(f.st.opened.at(-1)).toEqual({ type: 2, kit: KIT });
  });

  it('its close returns to the lobby view', async () => {
    const { a, f, back } = setup();
    await a.open();
    f.shut();
    expect(back).toEqual([1]);
    expect(a.isOpen()).toBe(false);
  });

  it('the pad\'s presses (edges of the sixteen standard buttons) go through armory.pad; Home (button 16) is never read', async () => {
    const { a, f } = setup();
    await a.open();
    const snap = (pressed: number[]) => ({ buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })), axes: [] });
    a.pad(snap([]));
    a.pad(snap([12, 0]));                                                  // Up and Cross pressed
    a.pad(snap([12, 0]));                                                  // held: no new press
    a.pad(snap([16]));                                                     // Home alone: nothing
    a.pad(snap([1]));
    expect(f.st.pads).toEqual([['Cross', 'Up'], ['Circle']]);
  });

  it("AM-2 (research 340 §2): the left stick's flick is the d-pad press, once; held from the opening it is none; a press this frame takes it", async () => {
    const { a, f } = setup();
    const snap = (pressed: number[], x = 0, y = 0) => ({ buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })), axes: [x, y, 0, 0] });
    await a.open();
    a.pad(snap([], 0, 0.9));                                               // the first read: held from the opening -- armed, nothing
    a.pad(snap([], 0, 0.9));
    expect(f.st.inputs).toEqual([]);
    a.pad(snap([], 0, 0));                                                 // back at rest: re-armed
    a.pad(snap([], 0, 0.9));                                               // W3C down: the game's DOWN
    a.pad(snap([], 0, 0.9));                                               // held: no repeat
    expect(f.st.inputs).toEqual(['down']);
    a.pad(snap([], 0, 0));
    a.pad(snap([15], -0.9, 0));                                            // Right pressed with a flick left: the press alone
    expect(f.st.inputs).toEqual(['down']);
    expect(f.st.pads.at(-1)).toEqual(['Right']);
  });

  // LATER 408: the stick as the pad leaves it (`../../menuInput` `menuStick`): the dead zone, the rescale, the circle.
  it("LATER 408: a drift inside the dead zone re-arms (the console's default zone: the forge has no CONTROLLER OPTIONS); a zone handed is read", async () => {
    const snap = (x: number, y: number) => ({ buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [x, y, 0, 0] });
    const walk = async (o: Parameters<typeof setup>[0]): Promise<(string | null)[]> => {
      const { a, f } = setup(o);
      await a.open();
      for (const [x, y] of [[0, 0], [0, 0.9], [0, 0.28], [0.9, 0]] as const) a.pad(snap(x, y));
      const got = [...f.st.inputs];
      a.close();
      return got;
    };
    expect(await walk({})).toEqual(['down', 'right']);                      // 0.28 inside 0.3: centred, re-armed
    expect(await walk({ deadZone: () => 0 })).toEqual(['down']);             // no zone: 0.28 x sqrt 2 holds it out
  });

  it('a pointer tap maps onto the 640 x 448 frame (frameOfClient) and goes to armory.tap', async () => {
    const { a, f } = setup();
    await a.open();
    a.canvas.width = 1280; a.canvas.height = 896;
    a.canvas.getBoundingClientRect = () => ({ left: 100, top: 50, width: 640, height: 448, right: 740, bottom: 498, x: 100, y: 50, toJSON: () => ({}) });
    const Ctor = (globalThis as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
    a.canvas.dispatchEvent(new Ctor('pointerdown', { clientX: 420, clientY: 274, bubbles: true, button: 0 }));
    expect(f.st.taps).toEqual([[320, 224]]);
  });

  it('each frame steps the screen and hands its quads, at the bitmaps\' sizes, to the painter', async () => {
    const drawn: unknown[] = [], fed: ArmoryData[] = [];
    const paint: ArmoryPaint = { data: (d) => { fed.push(d); }, draw: (quads, models, canvas) => { drawn.push([quads, models, canvas]); }, dispose: () => undefined };
    const { a, f } = setup({ paint });
    await a.open();
    expect(fed).toHaveLength(1);
    a.frame(1 / 60);
    expect(f.st.frames).toBe(1);
    expect(drawn).toHaveLength(1);
    expect(f.st.sizes.at(-1)).toMatchObject({ 'panel.tif': { width: 4, height: 2 } });
    f.shut();
    a.frame(1 / 60);
    expect(drawn).toHaveLength(1);                                         // closed: nothing drawn
  });

  it('the ArmoryView painter: asks the page\'s renderer at its first draw (again while it has none), draws the quads on it, reports its buffer', () => {
    const renders: unknown[] = [];
    let asked = 0, have = false;
    const renderer = {
      autoClear: true,
      render: (scene: unknown) => { renders.push(scene); },
      getDrawingBufferSize: (v: { set(x: number, y: number): unknown }) => { v.set(1280, 896); return v; },
    };
    const paint = armoryViewPaint(() => { asked++; return have ? renderer as never : null; });
    paint.data(data());
    const quad = { object: 'panel', texture: 'panel.tif', x: 0, y: 0, w: 4, h: 2, u0: 0, v0: 0, u1: 4, v1: 2, rgb: [128, 128, 128], alpha: 128 } as unknown as ArmoryQuad;
    const canvas = document.createElement('canvas');
    paint.draw([quad], [], canvas);
    expect([asked, renders.length]).toEqual([1, 0]);
    have = true;
    paint.draw([quad], [], canvas);
    paint.draw([quad], [], canvas);
    expect(asked).toBe(2);
    expect(renders.length).toBeGreaterThan(0);
    expect(paint.buffer!()).toEqual({ width: 1280, height: 896 });
    paint.dispose();
  });

  it('dispose closes the screen without returning, and an open still reading is dropped', async () => {
    const { a, back } = setup();
    const p = a.open();
    a.dispose();
    expect(await p).toBe(false);
    expect(back).toEqual([]);
  });
});

/*
 * FN-1a fix round 2 (simulation track; research 424 section 7): the lobby's window is the page, so it offers what the
 * lobby's room plays. R2-1: the window's world carries the lobby's EQlimit (`ArmoryWorld.eqLimit`, as the game lobby's
 * `../../src/lobbyArmory` passes `EQlimit`); the screen's own restriction code then runs (`Armory.refreshContext`:
 * `equipmentLimitKit`, `equipmentLimitValves`; research 362 section 2: no stored profile under a restriction, the mode's
 * rewrite on every entry). R2-2: the window's type kits are the laid-over map's (`lobbyArmoryOver`: each roster
 * character's kit the map's `kits[side][index]`), not the disc roster's. Expected at the RED commit: every case titled RED
 * fails (no `eqLimit` option, no `lobbyArmoryOver`); the CONTROLs pass before and after.
 */

/** A seat's window over `data` with the lobby's EQlimit (`eqLimit`; absent, the option is not given). */
function eqSetup(eqLimit?: number) {
  const f = fakeArmory();
  const a = new ForgeLobbyArmory({
    doc: document, source: () => ({ data: Promise.resolve(data()), side: 'seal', send: () => undefined }),
    map: () => 'mp2', names: () => ({ game: 'G', room: '' }), closed: () => undefined, paint: null, clock: () => 0, make: f.make,
    ...(eqLimit !== undefined ? { eqLimit: () => eqLimit } : {}),
  });
  return { a, f };
}

describe('FN-1a fix 2, R2-1: the lobby window ARMORY takes the lobby EQlimit', () => {
  it('RED: with the lobby EQlimit 1 the screen world holds eqLimit 1', async () => {
    const { a, f } = eqSetup(1);
    expect(await a.open()).toBe(true);
    expect(f.st.world!.eqLimit).toBe(1);
  });

  it('CONTROL: without the option, or at 0, the world opens unrestricted as before', async () => {
    for (const s of [eqSetup(), eqSetup(0)]) {
      expect(await s.a.open()).toBe(true);
      expect(s.f.st.world!.eqLimit ?? 0).toBe(0);
    }
  });

  it('RED: the lobby popup hands its eqLimit option to the window ARMORY (mountForgeLobby)', async () => {
    const f = fakeArmory();
    const deps: ForgeLobbyDeps = {
      doc: document, net: () => null, lobby: () => ({ type: 'gameLobby', seats: [{ id: 1, name: 'H', team: 'seal', ready: false, host: true, readyIn: 0 }], countdown: null, launched: false }),
      onLobby: () => () => undefined, onChat: () => () => undefined, me: () => ({ id: 1, host: true }),
      title: () => ({ name: 'G', map: 'MP2', players: 16 }), send: () => undefined, chat: () => undefined,
      armory: () => ({ data: Promise.resolve(data()), side: 'seal', send: () => undefined }), close: () => undefined,
    };
    const voice = { netDeps: () => ({ voiceFloor: () => undefined, voiceFrame: () => undefined }), pad: () => undefined, state: () => ({}), mute: () => undefined, muted: () => false, radio: () => undefined, dispose: () => undefined };
    const headset = { microphone: async () => null, noHeadset: () => undefined, throttled: () => undefined, frame: () => ({ padPresent: true, focused: true }), modulate: (b: Float32Array) => b, setVoiceMask: () => undefined, keys: () => new Set(), dispose: () => undefined };
    const host = document.createElement('div');
    document.body.append(host);
    const store = new Map<string, string>();
    const lobby = mountForgeLobby(host, deps, {
      store: { get: (k) => store.get(k) ?? null, set: (k, v) => { store.set(k, v); } }, viewport: () => ({ width: 1280, height: 720 }),
      voice: { mount: () => voice as never, headset: () => headset as never, seconds: () => 0, tuners: () => ({ headset: 1 }) },
      paint: null, makeArmory: f.make, now: () => 0, eqLimit: () => 3,
    });
    host.querySelector<HTMLButtonElement>('[data-act="armory"]')!.click();
    await new Promise((r) => { setTimeout(r, 0); });
    expect(f.st.world!.eqLimit).toBe(3);
    lobby.dispose();
  });
});

describe('FN-1a fix 2, R2-2: the lobby window type kits are the laid-over map kits (lobbyArmoryOver)', () => {
  it('RED: a side pick laid over the map (C4 in slot 5) is in that side roster characters, each by its type index', () => {
    const over = mapWithArsenal({ arsenal: KITS }, setting({ valves: { Enable_c4: 9 }, kits: { seal: [{ slot: 4, id: ITEM.C4 }], terrorist: [] } }));
    expect(over.refused).toEqual([]);
    const got = lobbyArmoryOver(rosterData(), over.map.arsenal);
    const seals = got.roster!.characters.filter((c) => c.side === 'seal');
    expect(seals.map((c) => [c.index, [...c.loadout]])).toEqual([[1, [54, 15, 126, 126, ITEM.C4]], [0, [54, 15, 121, 126, ITEM.C4]]]);
    for (const c of seals) expect(c.loadout).toEqual(over.map.arsenal!.map!.kits.seal[c.index]!.loadout);
    expect(got.roster!.characters.find((c) => c.side === 'terrorist')!.loadout).toEqual(TERR1);   // no Terrorist pick
    expect(got.world!.valves.get('Enable_c4')).toBe(9);                                            // the laid-over valves
  });

  it('RED: with no arsenal override the roster is the data roster itself, object for object', () => {
    const d = rosterData();
    const got = lobbyArmoryOver(d, mapWithArsenal({ arsenal: KITS }, EMPTY_ARSENAL).map.arsenal);
    expect(got.roster).toBe(d.roster);
    expect(got.world!.arsenal).toBe(ARSENAL);
    expect(lobbyArmoryOver(d, undefined)).toMatchObject({ roster: d.roster, world: null });             // no arsenal: no world, as before
  });

  it('RED: a map kit of another type than the roster names at that index is not taken (no mapping guessed)', () => {
    const d = rosterData();
    const other = { ...KITS, map: { ...MAP, kits: { ...MAP.kits, seal: [{ type: 'Other', character: 'x', loadout: TERR1 }, MAP.kits.seal[1]!] } } } as SimKits;
    const got = lobbyArmoryOver(d, other);
    expect(got.roster!.characters.find((c) => c.side === 'seal' && c.index === 0)!.loadout).toEqual(SEAL1);
  });
});

// ---- (b) on the fixture tree: with no override the data's roster already is the map's kits ---------------------------

const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../../test-fixtures');
const FIXTURE_MAPS = ['MP2', 'MP6', 'MP71', 'MP72'].filter((s) => existsSync(resolve(FIXTURES, `RUN/${s}.ZDB`)));
const FIXTURE_HELD = FIXTURE_MAPS.length > 0 && ['RUN/READERC.ZAR', 'RUN/ZWEAPON.ZAR', 'RUN/UI/READERC.ZAR'].every((p) => existsSync(resolve(FIXTURES, p)));

describe.skipIf(!FIXTURE_HELD)(`FN-1a fix 2 on the fixture tree: the roster and the map kits${FIXTURE_HELD ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('CONTROL (b): each roster character is the map kit of its side and index (type, character, loadout)', async () => {
    const source = new FsAssetSource(FIXTURES);
    const kitSource = (await loadKitSource(source))!;
    for (const stem of FIXTURE_MAPS) {
      const d = await armoryFromDisc(source, `RUN/${stem}.ZDB`, stem, { models: false, world: true });
      const own = simKitsFromBytes(kitSource, await source.read(`RUN/${stem}.ZDB`));
      expect(d.roster?.characters.length, stem).toBeGreaterThan(0);
      for (const c of d.roster!.characters) {
        const k = own.map!.kits[c.side][c.index]!;
        expect([k.type, k.character, [...k.loadout]], `${stem} ${c.column}`).toEqual([c.type, c.character, [...c.loadout]]);
      }
    }
  }, 120_000);

  it('RED: lobbyArmoryOver is the identity with no override, and takes each preset kit by index', async () => {
    const source = new FsAssetSource(FIXTURES);
    const kitSource = (await loadKitSource(source))!;
    for (const stem of FIXTURE_MAPS) {
      const d = await armoryFromDisc(source, `RUN/${stem}.ZDB`, stem, { models: false, world: true });
      const own = simKitsFromBytes(kitSource, await source.read(`RUN/${stem}.ZDB`));
      expect(lobbyArmoryOver(d, own).roster, stem).toBe(d.roster);
      for (const preset of ARSENAL_PRESETS) {
        const laid = mapWithArsenal({ arsenal: own }, preset.apply(EMPTY_ARSENAL, own.map!.valves)).map.arsenal!;
        const got = lobbyArmoryOver(d, laid);
        for (const c of got.roster!.characters) expect([...c.loadout], `${stem} ${preset.id} ${c.column}`).toEqual([...laid.map!.kits[c.side][c.index]!.loadout]);
      }
    }
  }, 120_000);
});
