// @vitest-environment jsdom
import { buildGrid } from '@s2u/scene';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Group, Scene } from 'three';
import { Walker } from '../../src/mover';
import { installModOverrides, modOverrideBytes } from '../../src/mods/override';
import {
  RESTOCK_SECONDS, ZOMBIE_CROSSROADS, ZOMBIE_IN_MATCH, ZOMBIE_NEEDS_PACK, ZOMBIE_PACK_PATH, installZombies, meleeFacing, meleeReach, wavePace, waveSize,
} from '../../src/zombies/mode';
import { goodPackBytes } from './fixture';

const state = vi.hoisted(() => ({ blocked: false, distance: 10 }));
vi.mock('@s2u/scene', async (original) => ({ ...(await original<typeof import('@s2u/scene')>()), segmentHit: () => state.blocked ? { point: [0, 0, -5] } : null }));
vi.mock('../../src/zombies/assets', () => ({
  loadZombieAssets: async () => ({
    clips: [{ name: 'attack', duration: 0.85 }],
    sound: vi.fn(), cue: vi.fn(), stop: vi.fn(),
    create: () => ({ root: new Group(), animate: vi.fn(), dispose: vi.fn(), react: vi.fn() }),
  }),
}));
vi.mock('../../src/zombies/spawns', () => ({
  ZombieSpawnMap: class {
    origin = [0, 0, 0];
    points() { return []; }
    advance() {}
    stats() { return {}; }
    choose() { return { point: [0, 0, -40], path: [] }; }
  },
}));
vi.mock('../../src/zombies/navigation', () => ({
  collisionStep: () => () => null,
  EnemyNavigator: class {
    seed() {}
    wait() {}
    steer() { return null; }
    obstacleNeeded() { return false; }
    stats() { return { waypoints: 0, searching: false, expanded: 0, blocked: 0, fine: false, recoveries: 0 }; }
  },
}));
vi.mock('../../src/zombies/obstacle', () => ({ botTraversal: () => ({ busy: () => false }), planObstacle: () => null }));
vi.mock('../../src/mover', () => ({
  Walker: class {
    state = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, stickForward: 0, stickRight: 0 };
    airborne = false;
    place() { this.state.z = -state.distance; return true; }
    advance() {}
    tick() {}
    jump() { return false; }
  },
}));

const PACK = goodPackBytes();
let frame: FrameRequestCallback = () => {};
let now = 0;
let round: (event: { type: string; from: number[]; to: number[]; weapon?: { name?: string } }) => void = () => {};

beforeEach(() => {
  document.body.innerHTML = '<div id="panel-body"></div>';
  document.head.querySelectorAll('style').forEach((node) => node.remove());
  state.blocked = false;
  state.distance = 10;
  now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => { frame = f; return 1; });
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); installModOverrides(null); });

function advance(seconds: number): void { for (let i = 0; i < seconds * 60; i++) frame(now += 1000 / 60); }
function shoot(weapon?: string): void {
  round({ type: 'round', from: [0, 10, 0], to: [0, 10, -100], ...(weapon ? { weapon: { name: weapon } } : {}) });
}
function setup(options: Partial<Parameters<typeof installZombies>[0]> = {}) {
  const health = vi.fn(), lock = vi.fn(), death = vi.fn(), resetDeath = vi.fn(), time = vi.fn();
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const api = installZombies({
    scene: new Scene(),
    fire: { subscribe: (f: (event: { type: string; from: number[]; to: number[]; weapon?: { name?: string } }) => void) => { round = f; return () => {}; }, release: vi.fn() } as never,
    archive: () => 'MP72',
    ready: () => true,
    grid: () => buildGrid({ atomCount: 100, posts: 4, cellDim: 1000, cellsX: 4, cellsZ: 4, originX: -2000, originZ: -2000 }, [], [], []),
    feet: () => [0, 0, 0],
    clips: () => null,
    health, lock, death, resetDeath, time,
    devtools: true,
    packBytes: () => PACK,
    ...options,
  });
  return { api, health, lock, death, resetDeath, time, warn, error };
}

it('checks horizontal melee range and facing', () => {
  expect(meleeReach([0, 0, 0], [0, 0, 12])).toBe(true);
  expect(meleeReach([0, 0, 0], [0, 11, 0])).toBe(false);
  expect(meleeReach([0, 0, 0], [0, 0, 14])).toBe(false);
  expect(meleeFacing([0, 0, 0], [0, 0, -10], 0)).toBe(true);
  expect(meleeFacing([0, 0, 0], [0, 0, 10], 0)).toBe(false);
});

it('builds numbers, speed and spawn pressure with bounded late-round load', () => {
  expect([1, 2, 3].map(waveSize)).toEqual([4, 7, 10]);
  expect(wavePace(1).speed).toBe(.22);
  for (let w = 2; w <= 10; w++) {
    expect(wavePace(w).speed).toBeGreaterThan(wavePace(w - 1).speed);
    expect(waveSize(w)).toBeGreaterThan(waveSize(w - 1));
  }
  expect(wavePace(100)).toMatchObject({ speed: .85, liveLimit: 283, spawnInterval: .04 });
  expect(waveSize(100)).toBe(301);
});

it('refuses to start with no pack, a bad pack, or off Crossroads, and does not warn', async () => {
  const missing = setup({ packBytes: () => null });
  expect(await missing.api.start()).toBe(false);
  expect(document.querySelector('#zombies-status')!.textContent).toBe(ZOMBIE_NEEDS_PACK);
  expect(missing.api.stats().pack).toBe('missing');
  expect(missing.warn).not.toHaveBeenCalled();
  expect(missing.error).not.toHaveBeenCalled();

  const bad = setup({ packBytes: () => new Uint8Array(32) });
  expect(await bad.api.start()).toBe(false);
  expect(document.querySelectorAll('#zombies-status')[1]!.textContent).toBe('Zombies pack refused: not a zip');
  expect(bad.api.stats().pack).toBe('refused:not a zip');
  expect(bad.warn).not.toHaveBeenCalled();
  expect(bad.error).not.toHaveBeenCalled();

  const elsewhere = setup({ archive: () => 'MP01' });
  expect(await elsewhere.api.start()).toBe(false);
  expect(document.querySelectorAll('#zombies-status')[2]!.textContent).toBe(ZOMBIE_CROSSROADS);
});

it('reads the pack through the mod table and never calls fetch', async () => {
  installModOverrides(null);
  const absent = setup({ packBytes: undefined });
  expect(modOverrideBytes(ZOMBIE_PACK_PATH)).toBeNull();
  expect(await absent.api.start()).toBe(false);
  expect(absent.api.stats().pack).toBe('missing');
  installModOverrides([{ path: 'mods/zombies/pack.zip', bytes: new Uint8Array([9, 9, 9]) }]);
  const present = setup({ packBytes: undefined });
  expect(await present.api.start()).toBe(false);
  expect(present.api.stats().pack).toBe('refused:not a zip');
  installModOverrides([{ path: ZOMBIE_PACK_PATH, bytes: PACK }]);
  const loaded = setup({ packBytes: undefined });
  expect(await loaded.api.start()).toBe(true);
  expect(loaded.api.stats().pack).toBe('loaded');
  expect(fetch).not.toHaveBeenCalled();
});

it('starts on F6, resets on F7, and ignores F9', async () => {
  const { api } = setup();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F9' }));
  await Promise.resolve();
  expect(api.stats().phase).toBe('idle');
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F6', repeat: true }));
  await Promise.resolve();
  expect(api.stats().phase).toBe('idle');
  const field = document.createElement('input');
  document.body.append(field);
  field.dispatchEvent(new KeyboardEvent('keydown', { code: 'F6', bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(api.stats().phase).toBe('idle');
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F6' }));
  await vi.waitFor(() => expect(api.stats().phase).toBe('countdown'));
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F7' }));
  expect(api.stats().phase).toBe('idle');
  document.querySelector<HTMLButtonElement>('#zombies-start')!.click();
  await vi.waitFor(() => expect(api.stats().phase).toBe('countdown'));
  expect((window as unknown as { __zombies?: unknown }).__zombies).toBe(api);
  setup({ devtools: false });
  expect((window as unknown as { __zombies?: unknown }).__zombies).toBeUndefined();
});

it('committed swings only hit in front and leave a readable windup', async () => {
  const { api } = setup();
  await api.start();
  advance(3.55);
  expect(api.stats().health).toBe(100);
  advance(.4);
  expect(api.stats().health).toBe(75);
});

it('a headshot interrupts an approaching swing without endless stagger lock', async () => {
  const { api } = setup();
  await api.start();
  advance(3.6);
  expect(api.stats().zombies[0]!.attack).toBeGreaterThan(0);
  round({ type: 'round', from: [0, 18, 0], to: [0, 18, -100] });
  expect(api.stats().zombies[0]!.attack).toBe(0);
  advance(.35);
  expect(api.stats().health).toBe(100);
  advance(2);
  expect(api.stats().health).toBeLessThan(100);
});

it('crowd hits cannot erase all health in the same instant', async () => {
  const { api, health } = setup();
  await api.start();
  advance(3.1);
  expect(api.skipToWave(100)).toBe(true);
  advance(.7);
  health.mockClear();
  advance(.3);
  expect(health.mock.calls.length).toBeLessThanOrEqual(1);
  expect(api.stats().health).toBeGreaterThan(0);
});

it('rechecks walls at the strike time, allowing the player to escape a windup', async () => {
  const { api } = setup();
  await api.start();
  advance(3.05);
  advance(.6);
  state.blocked = true;
  advance(1);
  expect(api.stats().health).toBe(100);
  state.blocked = false;
  advance(2);
  expect(api.stats().health).toBeLessThan(100);
});

it('clips bullet hits at cover, kills after three hits, then advances the wave', async () => {
  state.distance = 40;
  const { api } = setup();
  await api.start();
  advance(3.05);
  advance(.1);
  round({ type: 'round', from: [0, 10, 0], to: [0, 10, -20] });
  expect(api.stats().zombies[0]?.hp).toBe(100);
  for (let i = 0; i < 4; i++) { shoot(); shoot(); shoot(); advance(1.3); }
  expect(api.stats().kills).toBe(4);
  expect(api.stats().wave).toBe(1);
  advance(RESTOCK_SECONDS);
  expect(api.stats().wave).toBe(2);
  expect(api.stats().pending + api.stats().zombies.filter((z) => z.hp > 0).length).toBe(waveSize(2));
});

it('penetrates in near-to-far order with reduced damage, limited to four living bodies', async () => {
  state.distance = 90;
  const { api } = setup();
  await api.start();
  advance(3.05);
  for (const distance of [30, 50, 70]) { state.distance = distance; advance(1.25); }
  expect(api.stats().zombies).toHaveLength(4);
  round({ type: 'round', from: [0, 10, 0], to: [0, 10, -150], weapon: { name: 'AK-47' } });
  expect(api.stats().zombies.map((z) => z.kind)).toEqual(['shambler', 'shambler', 'shambler', 'shambler']);
  const damage = [60 * .75 ** 3, 60, 60 * .75, 60 * .75 ** 2];
  expect(api.stats().zombies.map((z) => z.hp)).toEqual(damage.map((hit) => 100 - hit));
  expect(api.stats().combat.hits).toBe(4);
});

it('stops collateral hits at the wall-clipped endpoint and applies headshot damage per body', async () => {
  state.distance = 30;
  const { api } = setup();
  await api.start();
  advance(3.1);
  state.distance = 60;
  advance(1.2);
  round({ type: 'round', from: [0, 18, 0], to: [0, 18, -45], weapon: { name: 'AK-47' } });
  expect(api.stats().zombies.map((z) => z.hp)).toEqual([0, 100]);
  expect(api.stats().kills).toBe(1);
  round({ type: 'round', from: [0, 18, 0], to: [0, 18, -100], weapon: { name: 'AK-47' } });
  expect(api.stats().zombies.map((z) => z.hp)).toEqual([0, 0]);
  expect(api.stats().kills).toBe(2);
});

it('stops damage on defeat and clears all enemies on reset', async () => {
  const { api, health, lock, death } = setup();
  await api.start();
  advance(3.05);
  advance(9);
  expect(api.stats().health).toBe(0);
  expect(api.stats().active).toBe(false);
  expect(lock).toHaveBeenLastCalledWith(true);
  expect(death).toHaveBeenCalledTimes(1);
  expect(death).toHaveBeenCalledWith(expect.objectContaining({ wave: 1, kills: 0, survived: 0, seconds: expect.any(Number) }));
  advance(3);
  expect(death).toHaveBeenCalledTimes(1);
  api.reset();
  expect(api.stats().zombies).toHaveLength(0);
  expect(health).toHaveBeenLastCalledWith(1);
  expect(lock).toHaveBeenLastCalledWith(false);
});

it('does not activate a pending asset load after reset', async () => {
  const { api } = setup();
  const pending = api.start();
  api.reset();
  await pending;
  expect(api.stats().active).toBe(false);
  expect(api.stats().phase).toBe('idle');
});

it('awards a kill once and gives the AK-47 its heavier damage', async () => {
  state.distance = 40;
  const { api } = setup();
  await api.start();
  advance(3.05);
  advance(.1);
  const shot = { type: 'round', from: [0, 10, 0], to: [0, 10, -100], weapon: { name: 'AK-47' } };
  round(shot);
  expect(api.stats().zombies[0]?.hp).toBe(40);
  round(shot);
  expect(api.stats().kills).toBe(1);
  round(shot);
  expect(api.stats().kills).toBe(1);
});

it('keeps corpse attack cycles running without damage, spawns or duplicate deaths', async () => {
  const { api, health, death } = setup();
  await api.start();
  advance(3.05);
  advance(9);
  const before = api.stats();
  const damageCalls = health.mock.calls.length;
  let swings = 0;
  const phases = new Set<number>();
  for (let i = 0; i < 40; i++) {
    advance(.1);
    const z = api.stats().zombies[0]!;
    phases.add(z.attack);
    if (z.attack > 0) swings++;
  }
  expect(swings).toBeGreaterThan(5);
  expect(phases.size).toBeGreaterThan(5);
  expect(health.mock.calls.length).toBe(damageCalls);
  expect(death).toHaveBeenCalledTimes(1);
  expect(api.stats()).toMatchObject({ health: 0, active: false, wave: before.wave, pending: before.pending });
  expect(api.stats().zombies.length).toBe(before.zombies.length);
  api.reset();
  advance(3);
  expect(api.stats().zombies).toHaveLength(0);
});

it('holds spawns and damage until countdown ends and cancels cleanly on reset', async () => {
  const { api, lock } = setup();
  await api.start();
  expect(api.stats()).toMatchObject({ phase: 'countdown', active: false, wave: 0, health: 100 });
  expect(document.body.classList.contains('zombie-match')).toBe(true);
  advance(2);
  shoot();
  expect(api.stats().zombies).toHaveLength(0);
  expect(api.stats().kills).toBe(0);
  expect(lock).toHaveBeenLastCalledWith(true);
  expect(await api.start()).toBe(false);
  advance(1.1);
  expect(api.stats()).toMatchObject({ phase: 'playing', active: true, wave: 1 });
  expect(lock).toHaveBeenLastCalledWith(false);
  api.reset();
  await api.start();
  advance(1);
  api.reset();
  advance(5);
  expect(api.stats()).toMatchObject({ phase: 'idle', active: false, wave: 0 });
  expect(document.body.classList.contains('zombie-match')).toBe(false);
});

it('headshots do double damage, confirm hits, stagger once and clear combat feedback on reset', async () => {
  state.distance = 40;
  const { api } = setup();
  await api.start();
  advance(3.2);
  round({ type: 'round', from: [0, 18, 0], to: [0, 18, -100] });
  expect(api.stats().zombies[0]!.hp).toBe(32);
  expect(api.stats().zombies[0]!.stagger).toBeGreaterThan(0);
  expect(api.stats().combat).toMatchObject({ hits: 1, headshots: 1, hitKind: 'HEADSHOT' });
  round({ type: 'round', from: [0, 18, 0], to: [0, 18, -100] });
  expect(api.stats().kills).toBe(1);
  expect(api.stats().combat.headshots).toBe(2);
  shoot();
  expect(api.stats().kills).toBe(1);
  api.reset();
  expect(api.stats().combat).toMatchObject({ hits: 0, blood: 0, damage: [] });
});

it('keeps a restock break clear of enemies and does not restart it with the start key', async () => {
  state.distance = 40;
  const { api, lock } = setup();
  await api.start();
  advance(3.05);
  for (let i = 0; i < 3; i++) { shoot(); shoot(); shoot(); advance(1.25); }
  shoot(); shoot(); shoot();
  advance(.1);
  expect(api.stats()).toMatchObject({ phase: 'restock', wave: 1, pending: 0, active: true, survived: 1 });
  expect(api.stats().nextRoundIn).toBeGreaterThan(9);
  expect(lock).toHaveBeenLastCalledWith(false);
  expect(await api.start()).toBe(false);
  expect(document.querySelector('.z-banner')!.textContent).toContain('SURVIVED');
  expect(document.querySelector('.z-banner')!.textContent).not.toContain('BUY');
  advance(8);
  expect(api.stats().phase).toBe('restock');
  expect(api.stats().zombies.filter((z) => z.hp > 0)).toHaveLength(0);
  advance(2);
  expect(api.stats()).toMatchObject({ phase: 'playing', wave: 2, nextRoundIn: 0 });
  expect(api.stats().pending + api.stats().zombies.filter((z) => z.hp > 0).length).toBe(7);
  expect(api.stats().hud.cues).toEqual(['round-start', 'round-end', 'round-start']);
  api.reset();
  expect(api.stats().nextRoundIn).toBe(0);
});

it('validates a wave jump and clears a wave into the break', async () => {
  state.distance = 40;
  const { api } = setup();
  expect(api.skipToWave(20)).toBe(false);
  await api.start();
  advance(3.1);
  expect(api.skipToWave(2.5)).toBe(false);
  expect(api.skipToWave(20)).toBe(true);
  expect(api.stats()).toMatchObject({ wave: 20, pending: 61, kills: 0, phase: 'playing', intermission: 0 });
  advance(.1);
  expect(api.stats().zombies[0]!.hp).toBe(400);
  expect(api.stats().zombies[0]!.kind).toBe('shambler');
  api.clearWave();
  advance(.1);
  expect(api.stats().phase).toBe('restock');
  expect(api.skipToWave(2)).toBe(true);
  expect(api.stats()).toMatchObject({ wave: 2, intermission: 0, phase: 'playing' });
});

it('high waves populate hundreds with per-zombie navigation', async () => {
  state.distance = 400;
  const { api } = setup();
  await api.start();
  advance(3.1);
  api.skipToWave(100);
  advance(18);
  expect(api.summary().alive).toBe(283);
  expect(api.summary().pending).toBe(18);
  expect(api.summary().performance.navUpdates).toBe(283);
}, 20000);

// The online seat's takeover (OT.R69), the 2026-10-20 review's asks 1 and 2.
it('a reset with no zombies run leaves the page alone: F7 and a map load touch no walker lock, health, timer or death (ask 1)', async () => {
  const { api, lock, health, time, resetDeath } = setup();
  api.reset();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F7' }));
  expect([lock, health, time, resetDeath].map((f) => f.mock.calls.length)).toEqual([0, 0, 0, 0]);
  // a run hands them back once
  expect(await api.start()).toBe(true);
  advance(3.2);
  lock.mockClear(); health.mockClear(); time.mockClear(); resetDeath.mockClear();
  api.reset();
  expect(lock).toHaveBeenLastCalledWith(false);
  expect(health).toHaveBeenLastCalledWith(1);
  expect(time).toHaveBeenLastCalledWith(0);
  expect(resetDeath).toHaveBeenCalledTimes(1);
  lock.mockClear(); health.mockClear(); time.mockClear(); resetDeath.mockClear();
  api.reset();
  expect([lock, health, time, resetDeath].map((f) => f.mock.calls.length)).toEqual([0, 0, 0, 0]);
  // a refused pack set nothing either
  const refused = setup({ packBytes: () => new Uint8Array(32) });
  expect(await refused.api.start()).toBe(false);
  refused.api.reset();
  expect([refused.lock, refused.health, refused.time, refused.resetDeath].map((f) => f.mock.calls.length)).toEqual([0, 0, 0, 0]);
});

it('refuses a start while the page is in a match, and stands down if a match begins under it (ask 2)', async () => {
  let inMatch = true;
  const release = vi.fn();
  const { api, lock, health, time, resetDeath } = setup({ inMatch: () => inMatch, fire: { subscribe: () => () => {}, release } as never });
  expect(await api.start()).toBe(false);
  expect(document.querySelector('#zombies-status')!.textContent).toBe(ZOMBIE_IN_MATCH);
  expect(api.stats().phase).toBe('idle');
  expect(lock).not.toHaveBeenCalled();
  inMatch = false;
  expect(await api.start()).toBe(true);
  advance(1);
  lock.mockClear(); release.mockClear(); health.mockClear(); time.mockClear(); resetDeath.mockClear();
  inMatch = true;
  advance(.1);
  expect(api.stats().phase).toBe('idle');
  // #395 review F2: the new match owns the walker's lock (its NetClient locks it until a spawn), the HUD's health and the
  // timer -- the stand-down gives back only what is the run's own: its death overlay and the held fire
  expect([lock, health, time].map((f) => f.mock.calls.length)).toEqual([0, 0, 0]);
  expect(resetDeath).toHaveBeenCalledTimes(1);
  // the match does not begin with a trigger the run held (the gameplay seat's check)
  expect(release).toHaveBeenCalledTimes(1);
  lock.mockClear();
  advance(1);
  expect(lock).not.toHaveBeenCalled();
});

// #395 review F1, the merge controller's (b): OT.R70 refuses a start in a NETWORKED match; the test room's own offline
// loopback match is neither networked nor a normal match. So a start there stands the loopback down first (the two never
// share the page: no match HUD or death lock for the run to touch), and F7's reset makes the room again; a map load's
// reset does not (the load makes its own room), nor a stand-down for a networked match.
it('an offline loopback match: a start stands it down first, F7 makes it again; a map load and a networked stand-down do not', async () => {
  let on = true;
  const stop = vi.fn(() => { on = false; }), restore = vi.fn(() => { on = true; });
  let networked = false;
  const { api, lock } = setup({ inMatch: () => networked, offline: { active: () => on, stop, restore } });
  expect(await api.start()).toBe(true);
  expect(stop).toHaveBeenCalledTimes(1);
  expect(on).toBe(false);
  expect(lock).toHaveBeenLastCalledWith(true);                       // the run holds the page now, the loopback gone
  advance(1);
  api.reset();                                                       // F7
  expect(restore).toHaveBeenCalledTimes(1);
  expect(on).toBe(true);
  // a start, then a map load's reset: the loopback is not made again by the run (the load makes its own room)
  expect(await api.start()).toBe(true);
  expect(stop).toHaveBeenCalledTimes(2);
  api.reset({ restore: false });
  expect(restore).toHaveBeenCalledTimes(1);
  // a start, then a networked match begins under it: the run stands down and makes no loopback
  on = true;
  expect(await api.start()).toBe(true);
  expect(stop).toHaveBeenCalledTimes(3);
  networked = true;
  advance(.1);
  expect(api.stats().phase).toBe('idle');
  expect(restore).toHaveBeenCalledTimes(1);
  // and a start in a networked match is still refused, the loopback untouched
  expect(await api.start()).toBe(false);
  expect(stop).toHaveBeenCalledTimes(3);
});

it('a slow frame keeps simulated time in steps of at most 50 ms, and a hitch past a quarter second is dropped', async () => {
  const steps: number[] = [];
  vi.spyOn(Walker.prototype, 'advance').mockImplementation((dt: number) => { steps.push(dt); return 0; });
  const { api } = setup();
  await api.start();
  frame(now += 16);
  const primed = api.stats().countdown;
  frame(now += 1000 / 60);
  expect(api.stats().countdown).toBeCloseTo(primed - 1 / 60, 5);
  const beforeGap = api.stats().countdown;
  frame(now += 100);
  expect(api.stats().countdown).toBeCloseTo(beforeGap - 0.1, 5);
  const beforeHitch = api.stats().countdown;
  frame(now += 1000);
  expect(api.stats().countdown).toBeCloseTo(beforeHitch - 0.25, 5);
  expect(api.stats().phase).toBe('countdown');
  advance(3);
  expect(api.stats().phase).toBe('playing');
  expect(api.stats().zombies.length).toBeGreaterThan(0);
  steps.length = 0;
  const seconds = api.stats().seconds;
  frame(now += 200);
  expect(api.stats().seconds).toBeCloseTo(seconds + 0.2, 5);
  expect(steps.length).toBeGreaterThan(1);
  expect(Math.max(...steps)).toBeLessThanOrEqual(0.05 + 1e-9);
  steps.length = 0;
  const beforeDrop = api.stats().seconds;
  frame(now += 1000);
  expect(api.stats().seconds).toBeCloseTo(beforeDrop + 0.25, 5);
  expect(Math.max(...steps)).toBeLessThanOrEqual(0.05 + 1e-9);
  expect(steps.length).toBeLessThanOrEqual(api.stats().zombies.length * 5);
});

it('F6 before walk mode is ready says so and does not start later on its own', async () => {
  let ready = false;
  const { api, lock } = setup({ ready: () => ready });
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F6' }));
  expect(api.stats().phase).toBe('idle');
  expect(document.querySelector('#zombies-status')!.textContent).toBe('Zombies starts in walk mode. Press Play, then press F6.');
  expect(lock).not.toHaveBeenCalled();
  ready = true;
  await Promise.resolve();
  expect(api.stats().phase).toBe('idle');
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F6' }));
  await vi.waitFor(() => expect(api.stats().phase).toBe('countdown'));
});

it('schedules no frame with no pack and no round, and stops again when the round ends', async () => {
  let scheduled = 0;
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => { scheduled++; frame = f; return scheduled; });
  const missing = setup({ packBytes: () => null });
  expect(scheduled).toBe(0);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F6' }));
  await Promise.resolve();
  expect(scheduled).toBe(0);
  expect(missing.api.stats().phase).toBe('idle');
  const { api } = setup();
  expect(scheduled).toBe(0);
  await api.start();
  const running = scheduled;
  expect(running).toBeGreaterThan(0);
  frame(now += 16);
  expect(scheduled).toBe(running + 1);
  api.reset();
  frame(now += 16);
  expect(scheduled).toBe(running + 1);
});

// The re-read's R1 (the merge controller's): with the map-entry ARMORY open the offline room is not made yet -- leaving
// the ARMORY makes it (main.ts `soloAfterArmory`). A start under the ARMORY must stand that pending room down too, so
// leaving the ARMORY later makes no loopback beside the run. Modelled as main.ts wires it: `active` counts the pending
// room, `stop` clears it (leaveRoom) and closes the ARMORY.
it('a start under the map-entry ARMORY stands its pending room down: leaving the ARMORY then makes no loopback beside the run (R1)', async () => {
  let solo = false;
  let pending: (() => void) | null = () => { solo = true; };          // what leaving the ARMORY runs (soloAfterArmory)
  let armoryOpen = true;
  const leaveArmory = (): void => { armoryOpen = false; const go = pending; pending = null; go?.(); };
  const offline = {
    active: () => solo || pending !== null,
    stop: vi.fn(() => { solo = false; pending = null; armoryOpen = false; }),
    restore: vi.fn(() => { solo = true; }),
  };
  const { api } = setup({ inMatch: () => false, offline });
  expect(await api.start()).toBe(true);
  expect(offline.stop).toHaveBeenCalledTimes(1);
  expect(armoryOpen).toBe(false);
  leaveArmory();                                                     // too late to make anything: nothing pending
  expect(solo).toBe(false);
  advance(1);
  expect(api.stats().phase).not.toBe('idle');                        // the run goes on, alone on the page
  api.reset();                                                       // F7 makes the room again
  expect(offline.restore).toHaveBeenCalledTimes(1);
  expect(solo).toBe(true);
});
