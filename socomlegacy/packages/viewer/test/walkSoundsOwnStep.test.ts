import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Grid } from '@s2u/scene';
import type { GameAudio, Vec3 } from '../src/audio';
import type { PlayEvent } from '../src/play';
import { WalkSounds, type WalkSignals } from '../src/walkSounds';

/**
 * B-86 (tier 1 row 6): the page's own footstep in first person and the scope. `FUN_005a39b0` plays a step placed at the
 * foot, except when the body's controller is the local player's and the body's view state (`+0x200`, the port's
 * `Zoom.state()`) is 1 or more: then it plays unplaced -- no position, the sound's own pan (research 81 s4). So the own
 * step goes to `onFootstep` with the foot in third person (state 0) and with no position in every other view state
 * (1-2 first person, 3 night vision, 4 binoculars, 5+ the weapon's zoom). A page that gives no view state keeps the foot.
 */
const FEET: Vec3 = [10, 0, 20];
const AT: Vec3 = [11, 0, 21];

function sounds(viewState?: () => number, stance: 'stand' | 'crouch' | 'prone' = 'stand'): { ws: WalkSounds; places: (Vec3 | null)[] } {
  const places: (Vec3 | null)[] = [];
  const audio = {
    onFootstep: (_m: number, position: Vec3 | null) => { places.push(position); return '.STEP'; },
  } as unknown as GameAudio;
  const signals: WalkSignals = {
    walking: () => true, feet: () => FEET, stance: () => stance, wish: () => ({ forward: 1, right: 0 }), grid: () => null as Grid | null,
    ...(viewState ? { viewState } : {}),
  };
  return { ws: new WalkSounds(audio, signals), places };
}

const step = (position?: Vec3): PlayEvent => ({ kind: 'footfall', foot: 'right', ...(position ? { position } : {}) }) as PlayEvent;

describe("B-86: the own step is unplaced while the view state (+0x200) is 1 or more (FUN_005a39b0)", () => {
  it('third person (state 0): placed at the step, else the feet', () => {
    const { ws, places } = sounds(() => 0);
    ws.playEvent(step(AT));
    ws.playEvent(step());
    expect(places).toEqual([AT, FEET]);
  });

  it.each([1, 2, 3, 4, 5, 6])("view state %i: no position (the sound's own pan)", (state) => {
    const { ws, places } = sounds(() => state);
    ws.playEvent(step(AT));
    ws.playEvent(step());
    expect(places).toEqual([null, null]);
  });

  it('a page with no view state signal keeps the foot', () => {
    const { ws, places } = sounds();
    ws.playEvent(step(AT));
    expect(places).toEqual([AT]);
  });

  it("the prone crawl (the right foot's call, the same function) takes the same branch", () => {
    const third = sounds(() => 0, 'prone'), first = sounds(() => 1, 'prone');
    third.ws.playEvent(step(AT)); first.ws.playEvent(step(AT));
    expect(third.places).toEqual([AT]);
    expect(first.places).toEqual([null]);
  });
});

describe('B-86: the wire from the pages to the walk (review F2)', () => {
  const read = (f: string): string => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
  it("mountSound passes viewState to WalkSounds; the others' steps keep their place", () => {
    const ms = read('matchSound.ts');
    expect(ms).toMatch(/\.\.\.\(p\.viewState \? \{ viewState: p\.viewState \} : \{\}\)/);
    expect(ms).toMatch(/audio\.onFootstep\(walkSounds\.materialAt\(feet\), step\.at,/);
  });
  it("both pages give the firearm's zoom state", () => {
    for (const f of ['matchMount.ts', 'main.ts']) expect(read(f)).toMatch(/viewState: \(\) => firearm\.zoom\.state\(\),/);
  });
});
