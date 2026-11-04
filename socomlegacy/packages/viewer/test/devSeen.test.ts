import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Group, Scene, Vector2 } from 'three';
import { DEV_SEEN_MARKER, devSeen } from '../src/devSeen';
import { GrenadeThrower } from '../src/grenade';
import { Hud } from '../src/hud';
import type { BombWire } from '../src/net/objective';
import { RemotePlayers, type SeenRemoteBody, type SeenRemotes } from '../src/remotePlayers';
import { builtTitle, readBuiltDist, VIEWER_DIST } from './builtDist';

/**
 * RE-5 (web sprint 38; research 249 §7): the dev hook's `devSeen()` -- what a replay's seek is seen by in the browser
 * spec (`e2e/replayEngine.spec.ts`): the bomb's state as `BombPage` holds it (`BombPage.state()`), the world bomb's
 * drawn model, each drawn body's clip, death and gear, the ghosts, and the HUD's drawn quads (the geometry the HUD pass
 * filled on its last frame, not its model). A development build's only, as the keyboard is (OT.R29): `main.ts` hangs it
 * on the hook under a literal `import.meta.env.DEV`, which every `vite build` folds away, so a release holds neither
 * the read nor its marker (`build_keyboard.test.ts`'s approach, with its `builtDist` guard: a skip names why, never a
 * pass). A browser adaptation: a playtest instrument with no original.
 */
const here = dirname(fileURLToPath(import.meta.url));
const src = (f: string): string => readFileSync(resolve(here, '../src', f), 'utf-8');

const wire = (over: Partial<BombWire> = {}): BombWire => ({
  state: 1, pos: [10, 0, -20], carrier: null, planter: null, plantingTeam: null, defuser: null, detonateTick: null, pickupAfterTick: 0,
  ...over,
});

describe('RE-5: the dev hook\'s devSeen is a development build\'s only', () => {
  it('main.ts hangs it on the hook under a literal import.meta.env.DEV (what every vite build folds away)', () => {
    expect(src('main.ts')).toMatch(/\.\.\.\(import\.meta\.en[v]\.DEV \? \{ devSeen: \(\) => devSeen\(\{ bomb: acts\.bomb, grenade, remote, hud \}\) \} : \{\}\),/);
  });
  it('the hook declares it optional (absent in a release)', () => {
    expect(src('hook.ts')).toMatch(/\n {2}devSeen\?\(\): DevSeen;/);
  });
  it('in this (development) run the read exists and carries its marker', () => {
    expect(import.meta.env.DEV).toBe(true);
    const seen = devSeen({ bomb: { state: () => null }, grenade: new GrenadeThrower({ grid: () => null, snapshot: () => null, view: () => 'third' }), remote: new RemotePlayers(new Scene()), hud: new Hud() });
    expect(seen.marker).toBe(DEV_SEEN_MARKER);
    expect(DEV_SEEN_MARKER).toBe('s2u-dev-seen-reads');
  });
});

describe('RE-5: what devSeen reads', () => {
  const quiet = (): Pick<Parameters<typeof devSeen>[0], 'grenade' | 'remote' | 'hud'> => ({
    grenade: new GrenadeThrower({ grid: () => null, snapshot: () => null, view: () => 'third' }),
    remote: new RemotePlayers(new Scene()),
    hud: new Hud(),
  });

  it("the bomb: BombPage's own state, a copy", () => {
    const w = wire({ state: 2, carrier: 3 });
    const seen = devSeen({ bomb: { state: () => w }, ...quiet() });
    expect(seen.bomb).toEqual(w);
    expect(seen.bomb).not.toBe(w);
    expect(devSeen({ bomb: { state: () => null }, ...quiet() }).bomb).toBeNull();
  });

  it("the world bomb: the model GrenadeThrower.worldBomb drew -- none before its first placing, then where and whether shown", () => {
    const g = new GrenadeThrower({ grid: () => null, snapshot: () => null, view: () => 'third' });
    const read = () => devSeen({ bomb: { state: () => null }, ...quiet(), grenade: g }).worldBomb;
    expect(read()).toBeNull();
    const satchel = new Group();
    g.setMap({ Satchel: satchel }, null);
    g.worldBomb().place([1279.762, 47.334, 1446.111]);
    expect(read()).toEqual({ visible: true, pos: [1279.762, 47.334, 1446.111] });
    g.worldBomb().place(null);
    expect(read()).toEqual({ visible: false, pos: [1279.762, 47.334, 1446.111] });
  });

  it('the ghosts: the seats RemotePlayers draws as nothing (markGhost), none drawn as a body yet', () => {
    const remote = new RemotePlayers(new Scene());
    remote.markGhost(7);
    const seen = devSeen({ bomb: { state: () => null }, ...quiet(), remote });
    expect(seen.ghosts).toEqual([7]);
    expect(seen.bodies).toEqual([]);
  });

  // PAR-41: the bodies, the ghosts and the gear asked come through `RemotePlayers.seenForDev`, the world bomb through
  // `GrenadeThrower.worldBombForDev` -- public read-only accessors (their own tests: `remotePlayers.test.ts`,
  // `grenade.test.ts`), so a rename inside either class is a type error, not a broken read in the browser. A stand-in
  // with only those accessors is a whole source: the read takes nothing else of either.
  const body = (over: Partial<SeenRemoteBody> = {}): SeenRemoteBody => {
    const group = new Group(), satchel = new Group(), hidden = new Group(), bag = new Group();
    satchel.name = 'Satchel';
    bag.name = 'Bag';
    hidden.visible = false;                                       // a fitting under a hidden holder is not drawn
    hidden.add(bag);
    group.add(satchel, hidden);
    return {
      id: 3, escortee: null, alive: false, deadFor: 1.25, deathClip: 'seal_death_back',
      anim: { clip: 'seal_death_back', frame: 12.5 }, group, fittingNames: ['Satchel', 'Bag', 'Absent'], ...over,
    };
  };
  const remoteOf = (seen: SeenRemotes): { seenForDev: () => SeenRemotes; reads: () => number } => {
    let reads = 0;
    return { seenForDev: () => { reads++; return seen; }, reads: () => reads };
  };

  it('a drawn body: its id, escortee, visibility, life, clip and key, death clip and age, the gear asked and the gear drawn', () => {
    const remote = remoteOf({ bodies: [body()], ghosts: [7], gearShown: new Map([[3, ['Satchel']]]) });
    const seen = devSeen({ bomb: { state: () => null }, ...quiet(), remote });
    expect(remote.reads()).toBe(1);                               // one read through the accessor, nothing else
    expect(seen.bodies).toEqual([{
      id: 3, escortee: null, visible: true, alive: false, clip: 'seal_death_back', frame: 12.5, deathClip: 'seal_death_back', deadFor: 1.25,
      gear: ['Satchel'], gearDrawn: { Satchel: true, Bag: false },
    }]);
    expect(seen.ghosts).toEqual([7]);
  });

  it('a body before its first play (no clip), a hostage, one before a snapshot, and a hidden group', () => {
    const hidden = body({ id: 4, escortee: 1, alive: null, deathClip: null, deadFor: 0, anim: null });
    hidden.group.visible = false;
    const seen = devSeen({ bomb: { state: () => null }, ...quiet(), remote: remoteOf({ bodies: [hidden], ghosts: [], gearShown: new Map() }) });
    expect(seen.bodies).toEqual([{
      id: 4, escortee: 1, visible: false, alive: null, clip: null, frame: null, deathClip: null, deadFor: 0,
      gear: [], gearDrawn: { Satchel: false, Bag: false },
    }]);
  });

  it("the world bomb: GrenadeThrower.worldBombForDev's read, as it gives it", () => {
    const grenade = { worldBombForDev: (): { visible: boolean; pos: [number, number, number] } | null => ({ visible: false, pos: [1, 2, 3] }) };
    expect(devSeen({ bomb: { state: () => null }, ...quiet(), grenade }).worldBomb).toEqual({ visible: false, pos: [1, 2, 3] });
    expect(devSeen({ bomb: { state: () => null }, ...quiet(), grenade: { worldBombForDev: () => null } }).worldBomb).toBeNull();
  });

  it("the HUD's drawn quads: the ret_bomb mark on the compass while the HUD is drawn, nothing while it is not (a watcher's)", () => {
    const px = (): { width: number; height: number; data: Uint8ClampedArray } => ({ width: 16, height: 16, data: new Uint8ClampedArray(16 * 16 * 4).fill(255) });
    const hud = new Hud();
    hud.setBitmaps({ 'compass_lo.tif': px(), 'ret_bomb.tif': px(), 'newweapnbkrnd.tif': px(), 'firemode.tif': px(), 'm4carbine_icon.tif': px() });
    hud.feed({ magazine: { rounds: 30, capacity: 30, spare: 2, reloading: false }, yaw: 0, position: [0, 0] });
    hud.setExtraMarks([{ bitmap: 'ret_bomb.tif', x: 0, z: -50 }]);
    const frame = { autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(640, 448), render: () => {} };
    const read = () => devSeen({ bomb: { state: () => null }, ...quiet(), hud }).hud;
    hud.setVisible(true);
    hud.step(2);
    hud.render(frame);
    const on = read();
    expect(on.visible).toBe(true);
    expect(on.drawn['0:ret_bomb.tif']).toHaveLength(1);
    expect(on.drawn['0:compass_lo.tif']).toHaveLength(1);
    // Straight ahead (z -50 from the feet, the heading 0): the mark drawn above the compass's centre, on its axis.
    const [mark] = on.drawn['0:ret_bomb.tif']!, [ring] = on.drawn['0:compass_lo.tif']!;
    expect(mark!.x).toBeCloseTo(ring!.x, 3);
    expect(mark!.y).toBeLessThan(ring!.y);
    hud.setVisible(false);
    hud.render(frame);
    expect(read()).toMatchObject({ visible: false, drawn: {} });
  });

  it("RV-1: the message window's posts (`Hud.postMessage`): each post's lines' text and its age, drawn or not (a watcher's)", () => {
    const hud = new Hud();
    const read = () => devSeen({ bomb: { state: () => null }, ...quiet(), hud }).hud.posts;
    expect(read()).toEqual([]);
    // The HUD not drawn (a replay's watcher): the post is held all the same, at age 0 (its clock runs while on only).
    hud.postMessage('GAME STARTS IN 7 SECONDS');
    expect(read()).toEqual([{ text: 'GAME STARTS IN 7 SECONDS', age: 0 }]);
    hud.step(1);
    expect(read()).toEqual([{ text: 'GAME STARTS IN 7 SECONDS', age: 0 }]);
    // Drawn: its age is the HUD's own clock since the post; a two-line post reads as its lines, newline-joined.
    hud.setVisible(true);
    hud.step(2);
    hud.postMessage([{ text: 'ONE', scale: 1 }, { text: 'TWO', scale: 1 }]);
    hud.step(0.5);
    expect(read()).toEqual([{ text: 'GAME STARTS IN 7 SECONDS', age: 2.5 }, { text: 'ONE\nTWO', age: 0.5 }]);
    // A copy: the read hands out nothing of the HUD's own.
    read()[0]!.text = 'changed';
    expect(read()[0]!.text).toBe('GAME STARTS IN 7 SECONDS');
  });
});

const dist = readBuiltDist(VIEWER_DIST);
describe.skipIf(!dist.built)(builtTitle('the built viewer has no devSeen read (RE-5; OT.R29\'s rule for dev tools)', dist), () => {
  it("neither the read's marker nor its hook name in dist/viewer/assets/*.js", () => {
    expect(dist.js).not.toContain(DEV_SEEN_MARKER);
    expect(dist.js).not.toContain('devSeen');
  });
});
