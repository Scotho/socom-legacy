// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { buildGrid, CLAYMORE, GAME_FRAME_DT, type ThrowableRecord, type WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import type { GrenadeItem } from '../src/grenadeCore';
import type { FireEvent } from '../src/fire';
import { noInput, type Input } from '../src/gamepad';
import { Hud } from '../src/hud';
import { SWAP_HELD_EDGE_READING } from '../src/kit';
import { PlayerLoadout } from '../src/loadout';
import { mountFirearm, type MatchFirearm } from '../src/matchFirearm';
import { playerLanes, type LaneParts } from '../src/matchLanes';
import { mountThrowables, type MatchThrowDeps } from '../src/matchThrow';
import type { PlaySnapshot } from '../src/mover';
import { Play } from '../src/play';
import { RemotePlayers } from '../src/remotePlayers';
import { StanceButton } from '../src/stanceButton';
import { WalkMode } from '../src/walk';

/**
 * QUIZTIME (a player's report, live v0.4.31; the owner's reproduction narrows it to an EMPTY slot and widens it, "probably
 * same thing for the majority of equipment" -- so one table over every kind a kit slot holds, each EMPTY and, as the
 * control, with rounds): "with grenades out and the trigger held, you can't switch to your gun while
 * holding the trigger; in the original you can and start firing immediately". The whole page-level sequence, driven as the
 * pad drives it, against the three readings already transcribed (each reading, pending review where its own note says so):
 *
 * - PAR-19 D07 (`./grenadeCore` `GrenadeThrower.select`, `windUpSelectable`): the hand grenade's wind-up gives way to the
 *   rifle at the slot change -- the wind-up dropped, its power zeroed, nothing thrown (`FUN_005c4b10` D:L478905-478915,
 *   the throw's power through `FUN_00592d40` at D:L478915); the hands' `busy` is the throw only, not the wind-up
 *   (`FUN_005a8cb0`), and the wind-up's press leaves the controller's edge at 0 (`./kit` `SWAP_HELD_EDGE_READING`,
 *   D:L453633-453661), so L1 is taken.
 * - TRIGGER-SWAP and its fold (`./matchThrow`'s `trigger` / `heldPulls`, `./matchFirearm`'s `triggerOwed`, research 211
 *   §10): the slot change leaves the trigger `+0x118` and the kit's pull count `+0x818` (`FUN_005c4b10` D:L478779-478936),
 *   so the trigger the grenade took and is still held is the firearm's at the put-away, with no new press.
 * - SWAP-FIRE (`./fireCore` `pullRound`, LATER 180's `raiseRefused`; `FUN_005c0ae0` D:L476433-476438): the held trigger's
 *   round waits on the rifle's raise and leaves on the first kit step the raise reads 1.
 *
 * The original's carry is item-blind: `FUN_005c4b10` (D:L478779-478936) reads and writes no controller `+0x118` whatever
 * the slot holds -- at D:L478905-478915 it calls `FUN_005c50b0`, sets bit 0x10 and clears bit 0x40 of the controller's
 * `+0x170` (D:L478907, D:L478914), refreshes the kit's `+0x54` from `FUN_005be300` (D:L478908-478912) and calls
 * `FUN_00592d40` (D:L478915). No kind was read that differs there. What differs by kind is the edge BEFORE the switch, the
 * gate and not the carry: a hand grenade with a round remaps its press 2 -> 3 -> 0 (D:L453633-453661), and with R1 held
 * L1 was measured NOT taken from an empty MARK141 (`./kit` `SWAP_HELD_EDGE_READING`, research 326 §7.3, GR-1, r0004).
 *
 * EMPTY_THROWABLE_SWAP_OWNER (`./kit`; the owner's ruling of 2026-11-25, a deliberate DEPARTURE from that measured
 * original, MISSION OT.R162, pending; research 326 §10): a hand-thrown grenade (class 'y': the M67, the HE, the AN-M8, the
 * Mark141) up with its slot EMPTY and the trigger held swaps as the wind-up's does -- taken, the held trigger the rifle's,
 * which fires after its raise. The table, narrowed to the ruling: the four thrown kinds EMPTY swap and fire; the same four
 * with rounds swap and fire through the wind-up (the control, unchanged); the claymore and the PMN EMPTY are still REFUSED
 * under the held trigger (a placing's press is the firearm's edge, D:L453633-453634; outside the ruling).
 *
 * The rig is the page's assembly (`weaponRaise.test.ts`'s `assembledRig`, `sureShotReady.test.ts`'s aim and grid): the real
 * `mountThrowables` and `mountFirearm` with its hands, a real `Play`, and the input path a pad's press takes in
 * `./matchMount`'s frame -- the trigger through `MatchFirearm.triggerLane` (the reach is off with a grenade up), the R2
 * inventory's `frame`, then `./matchLanes` `playerLanes`, whose `swap1` (L1, the game's SwapWeapon1) is the page's
 * `shoulder('l1')` -> `takeSlot(inventory.binds().l1)` (slot 0, the primary, `DEFAULT_BINDS`) -> `selectFirearm('rifle')`
 * -> `pressShoulder`: the shoulder gate, the hands' `putAway` (the grenade away), the kit's take. Then the page's frame
 * order (`./matchMount` 1593-1615): `gunFrame`, `poseFrame`, `kitFrame`, `Play.frame`, `fireFrame`, the throwables' frame.
 * STAND-INS, named: the walk's snapshot a still SEAL, its mode 'walk', its swap gate open, its fire allowed, its aim and
 * grid `sureShotReady.test.ts`'s one-wall grid; the rifle's magazine filled (`Fire.takeWeapon`).
 */

afterEach(() => { vi.restoreAllMocks(); });

const DT = GAME_FRAME_DT;
const wall: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from([-50, 0, -30, 50, 0, -30, 50, 50, -30, -50, 50, -30]) };
const grid = buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 }, [], [], [wall],
  [{ modelName: wall.modelName, path: `${wall.path}0`, first: 0, count: 1 }]);

/** A still SEAL on the floor. */
function snapshot(): PlaySnapshot {
  return {
    feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand', landing: null,
    jumps: 0, ground: { state: 'idle', forward: 0, right: 0, cls: 0 }, action: null, turnRate: 0,
  } as PlaySnapshot;
}

/** The page's assembly and the pad's frame (`./matchMount`'s order). */
function page() {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  const scene = new Scene();
  const fly = new FlyCamera(c);
  const walk = new WalkMode(fly);
  const play = new Play();
  const loadouts = new PlayerLoadout();
  const camera = new PerspectiveCamera();
  const s = snapshot();
  vi.spyOn(walk, 'snapshot').mockImplementation(() => s);
  vi.spyOn(walk, 'mode').mockReturnValue('walk');
  vi.spyOn(walk, 'swapGate').mockReturnValue(true);
  vi.spyOn(walk, 'fireAllowed').mockReturnValue(true);
  vi.spyOn(walk, 'fireAim').mockReturnValue({ eye: [0, 20, 0], far: [0, 20, -1000] });
  vi.spyOn(walk, 'grid').mockReturnValue(grid);
  let firearm: MatchFirearm | null = null;
  const throws = mountThrowables({
    scene, walk, fly, play, loadouts, view: () => null, map: () => null, net: () => null, firearm: () => firearm!,
    audio: { onAnimCallback: () => null, onFire: () => null, play: () => {} } as unknown as MatchThrowDeps['audio'],
  });
  firearm = mountFirearm({
    scene, fly, walk, play, loadouts, remote: new RemotePlayers(scene), hud: new Hud(), view: () => null, map: () => null,
    body: () => null, net: () => null, blocked: () => false, refreshFog: () => {}, hands: throws.hands(),
  });
  const fa = firearm;
  const record = fa.fire.weaponRecord();
  fa.fire.takeWeapon(record, [record.magazine, record.magazine]);
  // `./matchMount`'s lanes: the shoulders through the R2 inventory's binds (matchMount.ts 1956).
  const lanes: LaneParts = {
    walk, firearm: fa, stanceButton: new StanceButton(),
    shoulder: (which) => { throws.takeSlot(throws.inventory.binds()[which]); },
  };
  const bodyWalk = { snapshot: () => s, view: () => 'third' as const };
  let padMerged: Input = noInput(), padGame: Input = noInput();
  /** One page frame (one game frame) with the pad reading `pad`: the weight of the rifle's raise after it. */
  const frame = (pad: Partial<Input>): number => {
    const input: Input = { ...noInput(), ...pad };
    fa.triggerLane(padMerged, input);                  // the reach is off with a grenade up (matchMount.ts 1538-1541)
    const game = throws.inventory.frame(padMerged, input, DT);
    playerLanes(lanes, padGame, game, DT, { walking: true, menu: false });
    padMerged = input;
    padGame = game;
    fa.gunFrame(DT, true);
    throws.poseFrame(DT);
    fa.kitFrame(DT, true);
    play.frame(DT, bodyWalk, camera);
    fa.fireFrame(DT, true);
    throws.frame(DT);
    return play.weaponStats().raise.weight;
  };
  return { throws, firearm: fa, play, frame, dispose: () => { throws.dispose(); } };
}

/**
 * PMN-STAND-IN (named; `chargeGoneR4P224.test.ts`'s `PMN_RECORD`): the PMN has no baked record (`THROWABLES` holds the
 * M67, the HE, the AN-M8, the Mark141 and the claymore), so this rig hands the page the same stand-in -- the claymore's
 * record under the PMN's name and id 158 (`ITEM.PMN`, `./equipment` `equipmentKind` 'placed'), capacity 4. Its other
 * values do not reach the sequence (nothing is placed). It is laid in a one-slot kit (`setKit`, as `grenade.test.ts`'s PMN
 * page does): with no kit the pouch holds none (`capacities`), and the take-up is refused.
 */
const PMN_RECORD: ThrowableRecord = { ...CLAYMORE, name: 'PMN Mine', id: 158, fuse: 8, removal: 10, explosionDamage: 6.5, explosionRadius: 40, proximity: 10, model: 'pmn', icon: 'pmn.tif', capacity: 4 };

/**
 * One run of the report's sequence on the page: `item` taken up (`empty`: its slot then emptied, the item still selected
 * -- B-01 D1, research 361 s2), the trigger pressed and held, L1 with the trigger still held, held on until the rifle's
 * raise ends and 10 game frames past it. Each round's frame (from the L1 frame), the raise's end, what was thrown or placed.
 */
function run(item: GrenadeItem, empty: boolean) {
  const p = page();
  let at = 0;
  const rounds: number[] = [];
  p.firearm.fire.subscribe((e: FireEvent) => { if (e.type === 'round') rounds.push(at); });
  const thrown: string[] = [];
  p.throws.grenade.on('throwStart', () => { thrown.push('throwStart'); });
  p.throws.grenade.on('throw', () => { thrown.push('throw'); });
  p.throws.grenade.on('place', () => { thrown.push('place'); });
  // The PMN enters a pouch only by a kit (`./grenadeCore` `capacities`: the legacy pouch holds the baked records alone).
  if (item === 'PMN Mine') { p.throws.grenade.setRecords([PMN_RECORD]); p.throws.grenade.setKit(['PMN Mine']); }
  // 1. the rifle kit; the item taken up (and, `empty`, its slot emptied), settled
  expect(p.throws.grenade.select(item), `${item} taken up`).toBe(true);
  if (empty) p.throws.grenade.setLeft({ [item]: 0 });
  for (let i = 0; i < 20; i++) p.frame({});
  expect(p.throws.grenade.equipped(), `${item} selected`).toBe(true);
  if (empty) expect(p.throws.grenade.stats().left, 'the slot empty').toBe(0);
  else expect(p.throws.grenade.stats().left, 'rounds in the slot').toBeGreaterThan(0);
  const left = p.throws.grenade.stats().leftByItem[item];
  // 2. the trigger pressed and held: a wind-up or a placing with rounds (neither with the slot empty), no round of the rifle
  for (let i = 0; i < 15; i++) p.frame({ fire: true });
  expect(rounds).toEqual([]);
  const gate = { edge: p.play.triggerEdge(), open: p.firearm.shoulderGate(0), phase: p.throws.grenade.phase() };
  // 3. L1 (swap1) pressed with the trigger still held
  p.frame({ fire: true, swap1: true });
  const putAway = !p.throws.grenade.equipped();
  // 4. held on, frame by frame, until the rifle's raise ends
  let raiseEnd = -1;
  for (at = 1; at <= 60 && raiseEnd < 0; at++) if (p.frame({ fire: true }) === 1) raiseEnd = at;
  for (const end = (raiseEnd < 0 ? at : raiseEnd) + 10; at <= end; at++) p.frame({ fire: true });
  const result = {
    gate, putAway, phase: p.throws.grenade.phase(), raiseEnd, rounds, thrown, live: p.throws.grenade.ownLive(), left,
    leftAfter: p.throws.grenade.stats().leftByItem[item],
  };
  p.dispose();
  return result;
}

/** 5. Every row's expectation: the swap taken, the rifle's first round through or right after its raise, nothing thrown or placed. */
function expectSwapFire(r: ReturnType<typeof run>, empty: boolean): void {
  // With a round the wind-up's press leaves the edge off held; EMPTY, the edge stays held and the gate passes on the owner's
  // exception (EMPTY_THROWABLE_SWAP_OWNER), not on the edge.
  if (!empty) expect(r.gate.edge, `the controller's edge off held at the L1 press (SWAP_HELD_EDGE_READING; the item's phase ${r.gate.phase})`).not.toBe(SWAP_HELD_EDGE_READING);
  expect(r.gate.open, "L1's gate passes with the trigger held").toBe(true);
  expect(r.putAway, 'the item put away by the shoulder press').toBe(true);
  // The put-away holsters the item (`./grenadeCore` `holster`: phase 'holstered'): no wind-up or throw phase left behind.
  expect(r.phase, 'the item holstered by the swap').toBe('holstered');
  expect(r.raiseEnd, "the rifle's raise ends within 60 game frames").toBeGreaterThan(0);
  expect(r.rounds.length, 'the held trigger fires the rifle, no new press').toBeGreaterThan(0);
  expect(r.rounds[0]!, 'no round before the raise reads 1 (LATER 180)').toBeGreaterThanOrEqual(r.raiseEnd);
  expect(r.rounds[0]!, "the first round within 3 game frames of the raise's end").toBeLessThanOrEqual(r.raiseEnd + 3);
  expect(r.thrown, 'nothing thrown or placed').toEqual([]);
  expect(r.live, 'nothing in flight or set down').toBe(false);
  expect(r.leftAfter, "the item's count unchanged").toBe(r.left);
}

/** The placings' controls: the held trigger's edge refuses L1 -- the item kept up, the rifle silent, nothing placed. */
function expectSwapRefused(r: ReturnType<typeof run>): void {
  expect(r.gate.edge, "the controller's edge held at the L1 press (SWAP_HELD_EDGE_READING)").toBe(SWAP_HELD_EDGE_READING);
  expect(r.gate.open, "L1's gate shut with the trigger held").toBe(false);
  expect(r.putAway, 'the item not put away: the swap not taken').toBe(false);
  expect(r.rounds, 'no round of the rifle').toEqual([]);
  expect(r.thrown, 'nothing thrown or placed').toEqual([]);
  expect(r.leftAfter, "the item's count unchanged").toBe(r.left);
}

/** The hand-thrown kinds (class 'y', `./weaponRaise` `handGrenade`): EMPTY_THROWABLE_SWAP_OWNER's scope. */
const THROWN: readonly { item: GrenadeItem; kind: string }[] = [
  { item: 'M67', kind: 'the M67 frag' },
  { item: 'HE', kind: 'the HE grenade' },
  { item: 'AN-M8', kind: 'the AN-M8 smoke' },
  { item: 'Mark141', kind: 'the Mark141 flash' },
];
const THROWN_ROWS = THROWN.flatMap(({ item, kind }) => [
  { item, kind, empty: true, slot: 'EMPTY (EMPTY_THROWABLE_SWAP_OWNER)' },
  { item, kind, empty: false, slot: 'with rounds (control: the wind-up, PAR-19 D07)' },
]);
/** The placings, outside the ruling: EMPTY, still refused under the held trigger. */
const PLACED_EMPTY: readonly { item: GrenadeItem; kind: string }[] = [
  { item: 'Claymore', kind: 'the claymore' },
  { item: 'PMN Mine', kind: 'the PMN (PMN-STAND-IN record)' },
];

describe('QUIZTIME (a player, live v0.4.31): the trigger held through a kit item into the rifle', () => {
  it.each(THROWN_ROWS)('QUIZTIME: $kind, slot $slot, up, trigger held, switch to the rifle -> the rifle fires after its raise, nothing thrown', ({ item, empty }) => {
    expectSwapFire(run(item, empty), empty);
  });

  it.each(PLACED_EMPTY)('QUIZTIME control: $kind, slot EMPTY, up, trigger held, L1 -> REFUSED (outside EMPTY_THROWABLE_SWAP_OWNER)', ({ item }) => {
    expectSwapRefused(run(item, true));
  });

  // The kinds a slot can hold that the page cannot take up empty (or at all) by a slot: skipped, each with its reason.
  it.skip('QUIZTIME: C4 -- SKIPPED: never a slot pick (`./equipment` `slotSelectable` refuses ITEM.C4, FUN_005bdc30); planted by the Action button', () => {});
  it.skip('QUIZTIME: the satchel -- SKIPPED: never a slot pick (`slotSelectable` refuses ITEM.SATCHEL, FUN_005bdc30; R94.13)', () => {});
  it.skip('QUIZTIME: the Detonator with no charge down -- SKIPPED: not takeable with no claymore down (`slotSelectable`, FUN_005bdc30 D:L474637-474641)', () => {});
  it.skip('QUIZTIME: the Detonator with a claymore down (control) -- SKIPPED: needs a claymore placed on ground this rig does not lay', () => {});
  it.skip('QUIZTIME: thermite / white phosphorus -- SKIPPED: no kit record (item 124 Enable_phos names none, @s2u/scene arsenal.ts; no thermite item)', () => {});
});
