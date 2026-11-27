// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildGrid, GAME_FRAME_DT, type CollisionOwner, type Grid, type GridParams, type WeaponRecord, type WorldPoly } from '@s2u/scene';
import { Fire, type FireAim } from '../src/fire';

/**
 * PRESS PARITY, THE NOMINAL TRAINS (simulation track; reading, pending review): the real `Fire`, the 9mm Sub held in
 * automatic, offline, the raise not refused, driven by frame-exact press patterns at page rates 30, 60 and 144 Hz.
 *
 * The rule (transcribed; the plan PLAN-press-parity-core.md sections 1 and 4; review T4-port-holds-review.md P3):
 * - the fire button is read once a console update (the game frame, `GAME_FRAME_DT` = 525/15734 s) through the pad layer
 *   `FUN_002d9ff0` D:L179137-179168 (down 0 -> 1, 3 -> 1, 1 -> 2; up 1|2 -> 3, 3 -> 0), held only at 2 (`FUN_002c60c0`
 *   D:L166671-166686, into ctrl+0x118 by `FUN_00594cf0` D:L453542-453567);
 * - the kit after the controller (`FUN_005506a0` D:L417905-417907): held, the timer <= 0 and the count under automatic's
 *   10000 (`FUN_005c0940` D:L476283-476310) -- a round, the timer set to FireWait x 0.8 (`FUN_005c09f0`
 *   D:L476313-476341: 0.075 x 0.8 = 0.06), then run down by the frame and clamped (D:L476643-476647); a 0 or 3 read
 *   clears the count (`FUN_005c0ae0` D:L476380-476382, D:L476399-476400).
 * - Measured online (bugs/padlag-rows-read.md, reviewed): no round on a pad-1 read; the first round on the first state-2
 *   read; the next when the 0.06 s timer is spent -- on 33.4 ms updates, reads 2, 4, 6.
 *
 * So a press the kit reads down on D game frames fires on its reads 2, 4, 6 ...: (D, up) = (2,1) 1, (3,1) 1, (4,1) 2,
 * (5,1) 2, (6,1) 3 rounds -- 15, 15, 30, 30, 45 per 15 presses, the same at every page rate and press phase, and never a
 * round at `pull()` itself (the press acts at a game-frame read, not at the page frame).
 *
 * The harness (an adaptation of the test, not of the game): `pull()` / `release()` applied at a page frame's start, then
 * `update(pageDt)`. The kit's read k sits at k x GAME_FRAME_DT of the page's clock from `Fire`'s first update; a lead-in
 * update of phase x GAME_FRAME_DT puts the page frames off the reads. Each press and release lands on the page-frame
 * start inside its game frame nearest the phase -- so the kit reads the button down on exactly D frames at every page
 * rate (at 30 Hz a game frame holds one page start, its phase drifting about 0.1 frame over a train).
 *
 * These fail today: the port fires at `pull()` and counts its kit clock from the press (fire.ts `pull`, `update`).
 */

const G = GAME_FRAME_DT;
const GOLDEN = resolve(import.meta.dirname, '../../scene/test/golden/weapon-records.json');
/** The 9mm Sub, `zweapon.rdr` record 37 (FireWait 0.075, a magazine of 60, modes 1-3) as the scene golden pins it. */
const SUB9: WeaponRecord = Object.values(JSON.parse(readFileSync(GOLDEN, 'utf8')).records as Record<string, WeaponRecord>).find((r) => r.id === 37)!;

const quad = (points: number[]): WorldPoly =>
  ({ modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(points) });
function world(polys: WorldPoly[]): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

/** The held 9mm Sub in automatic: rounds a pull 10000 (`FUN_005c0940`), the wait x 0.8 (`FUN_005c09f0`); offline, no room. */
function armed(): Fire {
  const grid = world([quad([-50, 0, -30, 50, 0, -30, 50, 50, -30, -50, 50, -30])]);
  const eye: [number, number, number] = [0, 20, 0];
  const aim = (): FireAim => ({ eye, far: [0, 20, -1000] });
  const fire = new Fire({ grid: () => grid, aim }, SUB9, undefined, () => 0.5);
  fire.setGun({ trigger: () => {}, roundsPerPull: () => 10000, interval: (w) => w * 0.8, round: (d) => d });
  return fire;
}

const PRESSES = 15;
const REST = 10;                                          // game frames before the first press
const TAIL = 20;                                          // game frames after the last release

/** The page frame (index) whose start lies inside game frame j, nearest to phase `phase` of it. */
function pageIn(j: number, phase: number, lead: number, p: number): number {
  const lo = Math.ceil((j * G - lead) / p + 1e-9), hi = Math.floor(((j + 1) * G - lead) / p - 1e-9);
  let best = lo;
  for (let n = lo; n <= hi; n++) if (Math.abs(lead + n * p - (j + phase) * G) < Math.abs(lead + best * p - (j + phase) * G)) best = n;
  if (lo > hi) throw new Error(`no page start inside game frame ${j}`);
  return best;
}

/** One train: the rounds it fired, and the rounds `pull()` itself returned. */
function train(down: number, up: number, hz: number, phase: number): { rounds: number; atPull: number } {
  const fire = armed();
  const p = 1 / hz, lead = phase * G;
  const events = new Map<number, 'pull' | 'release'>();
  for (let i = 0; i < PRESSES; i++) {
    const j = REST + i * (down + up);
    events.set(pageIn(j, phase, lead, p), 'pull');
    events.set(pageIn(j + down, phase, lead, p), 'release');
  }
  const last = Math.ceil(((REST + PRESSES * (down + up) + TAIL) * G - lead) / p);
  let atPull = 0;
  fire.update(lead);                                      // the lead-in: the page's frames off the kit's reads
  for (let n = 0; n <= last; n++) {
    const e = events.get(n);
    if (e === 'pull') {
      const before = fire.state().shots;
      if (fire.pull() !== null || fire.state().shots !== before) atPull++;
    } else if (e === 'release') fire.release();
    fire.update(p);
  }
  return { rounds: fire.state().shots, atPull };
}

const TRAINS = [[2, 1, 15], [3, 1, 15], [4, 1, 30], [5, 1, 30], [6, 1, 45]] as const;
const RATES = [30, 60, 144] as const;
const PHASES = [0.2, 0.4, 0.6, 0.8] as const;

describe('press parity: the nominal trains on the real Fire (9mm Sub, automatic, offline)', () => {
  it('the record is the 9mm Sub\'s: FireWait 0.075 (x 0.8 = 0.06), a magazine of 60 (enough for 45 rounds)', () => {
    expect(SUB9).toMatchObject({ name: '9mm Sub', id: 37, fireWait: 0.075, magazine: 60 });
  });

  for (const [down, up, want] of TRAINS) {
    for (const hz of RATES) {
      it(`(down ${down}, up ${up}) game frames x 15 at ${hz} Hz: ${want} rounds at every phase, none at pull()`, () => {
        const got = PHASES.map((ph) => train(down, up, hz, ph));
        expect(got.map((g) => g.atPull)).toEqual(PHASES.map(() => 0));
        expect(got.map((g) => g.rounds)).toEqual(PHASES.map(() => want));
      });
    }
  }

  it('the counts are identical across page rates and phases (the press acts at a game-frame read, not the page frame)', () => {
    for (const [down, up] of TRAINS) {
      const all = RATES.flatMap((hz) => PHASES.map((ph) => train(down, up, hz, ph).rounds));
      expect(new Set(all).size).toBe(1);
    }
  });
});

/**
 * The browser box's MP51 red at 918086d2de (`e2e/gameplayAudioFollowup.spec.ts:111`, the seat's own `.GUN_EMPTY` never
 * asked over a 60 s hold): its state traced on the real `Fire` -- the magazines spent by a held automatic pull (rounds 0,
 * spare 0, so the dry branch's limit is 1, `FUN_005c0940` D:L476283-476310, and the pull's count is at or above it), then
 * the spec's let-go and re-press. The click is the dry branch's pressed path (`FUN_005c0fd0` D:L476591-476622): ctrl+0x118
 * in 1-2 and the count under the limit. The count is cleared only by a kit step that reads the button not held
 * (`FUN_005c0ae0` D:L476380-476382, D:L476399-476400; ctrl+0x118 0 or 3, `FUN_00594cf0` D:L453543-453565), and the button is
 * stepped only at a kit step (`FUN_002d9ff0` D:L179137-179168). So a let-go no kit step reads leaves the pad at 2 and the
 * count standing: the re-press is the same pull, and no click is asked however long it is held -- as on the console, where
 * a release inside one game frame's read is not seen. The spec's let-go is held only until one page frame has read it
 * (`r1`: `pad().input.fire` false), and the page's frame runs the trigger before the kit (`main.ts` `padFrame` then
 * `fireFrame`), so the let-go lasts at least that page frame's `update` -- which holds no kit step when the frame is
 * shorter than the clock's leftover (a 60 Hz frame: about every other one).
 */
describe('the MP51 trace: a spent kit, the trigger let go and pressed again', () => {
  function spent(): { fire: Fire; dry: () => number } {
    const fire = armed();
    fire.takeWeapon({ ...SUB9, magazine: 3, mags: 1 }, [3]);
    let dry = 0;
    fire.subscribe((e) => { if (e.type === 'dry') dry++; });
    fire.update(G / 2);                                   // the clock's phase: half a game frame to the next step
    fire.pull();
    for (let i = 0; i < 60; i++) fire.update(G);
    expect(fire.state().magazine.rounds).toBe(0);
    expect(fire.state().magazine.spare).toBe(0);
    return { fire, dry: () => dry };
  }

  it('a let-go read by a kit step: the re-press asks the click once, at its second read', () => {
    const { fire, dry } = spent();
    const before = dry();
    fire.release();
    fire.update(G);                                       // a step reads it: pad 2 -> 3, the count cleared
    fire.pull();
    fire.update(G);                                       // read 1 (pad 3 -> 1): not held
    expect(dry()).toBe(before);
    fire.update(G);                                       // read 2 (pad 1 -> 2): held, the count 0 < 1 -- the click
    expect(dry()).toBe(before + 1);
    for (let i = 0; i < 60; i++) fire.update(G);
    expect(dry()).toBe(before + 1);                       // once a pull: the count raised to the limit (D:L476630-476631)
  });

  // The blind spot, pinned (the main controller 581a5036's widening of the MP51 spec, condition (b)): a release shorter
  // than a game frame that no kit step reads does NOT clear the count. The original reads the pad once an update, and
  // relay-1's short-press rows show presses never seen at all (research 443 §1: 6 of 40 30-ms presses; the rows
  // `bugs/padlag-short-rows-read.md`, reviewed). Where the release falls against the steps is the port's own clock
  // (research 443 §2, "The step's phase"), not the console's.
  it('a let-go no kit step reads (the box\'s MP51 case): the pad stays 2, the count stands, no click on a 2 s hold', () => {
    const { fire, dry } = spent();
    const before = dry();
    fire.release();
    fire.update(G / 4);                                   // the let-go's page frame: no kit step in it
    fire.pull();
    for (let i = 0; i < 60; i++) fire.update(G);
    expect(dry()).toBe(before);
  });
});
