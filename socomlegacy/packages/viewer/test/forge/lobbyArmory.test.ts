// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { Loadout } from '@s2u/scene';
import type { ArmoryDeps, ArmoryWorld } from '../../src/armory';
import type { ArmoryData } from '../../src/armoryData';
import type { ArmoryExit } from '../../src/armoryState';
import type { PadButton } from '../../src/gamepad';
import type { ArmoryQuad } from '../../src/armoryLayout';
import { armoryViewPaint, ForgeLobbyArmory, type ArmoryLike, type ArmoryPaint } from '../../src/forge/lobby/lobbyArmory';

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

/** A stand-in for the extracted screen: what the window's part asks of it, recorded. */
function fakeArmory() {
  const log: string[] = [];
  let open = false;
  let deps: ArmoryDeps | null = null;
  const st = { world: null as ArmoryWorld | null, opened: [] as unknown[], pads: [] as string[][], inputs: [] as (string | null)[], taps: [] as [number, number][], sizes: [] as Record<string, unknown>[], frames: 0 };
  const make = (d: ArmoryDeps): ArmoryLike => {
    deps = d;
    return {
      setData: () => { log.push('data'); },
      setWorld: (w) => { st.world = w; log.push('world'); },
      open: (cur) => { st.opened.push(cur); open = true; return true; },
      isOpen: () => open,
      frame: () => { st.frames++; },
      pad: (p: ReadonlySet<PadButton>) => { st.pads.push([...p]); return open; },
      input: (i) => { st.inputs.push(i); return open; },
      taking: () => open,
      tap: (x, y) => { st.taps.push([x, y]); return open; },
      close: () => { if (open) { open = false; d.closed?.(); } },
      quads: (sizes) => { st.sizes.push(sizes); return []; },
      models: () => [],
    };
  };
  return { make, log, st, deps: () => deps!, shut: () => { open = false; deps!.closed?.(); } };
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
