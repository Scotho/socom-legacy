import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import {
  arsenalOf, DEFAULT_RIFLE, HELD_RIFLE, HELD_SIDEARM, type CollisionOwner, type GridParams, type KitTable, type Loadout,
  type MapArsenal, type SpawnSlot, type WeaponRecord, type WorldPoly,
} from '@s2u/scene';
import {
  Button, cameraLook, centreClaim, decodeSnapshot, encodeCommands, EYE_HEIGHT, faceToward, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ,
  ARMORY_SERVER_NAME_READING, SERVER_NAME_MAX, serverNameOf, type ClientEvent, type Command, type ServerEvent, type SimKits, type SimMap,
} from '../../viewer/src/sim';
import { KEPT_RECONNECT_READING, LOADOUT_BURST, LOADOUT_EVERY, RESPAWN_FADE_S, Room, type Conn } from '../src/room';
import { botLoadout } from '../src/bots/armory';

/**
 * Protocol 7 (web sprint 4, M9; W4.R6): the weapon select's `loadout` request. The room replays the page's picks from
 * the character type's own kit through the menu's rules (`@s2u/scene` `applyPicks`), keeps the result as the player's
 * next round's kit (classic: applied at the next round's spawn, R94.3) and answers with the kit it holds or the
 * refusal; the fire path reads the kit on the room's body, never the page's claim; a `spawn` carries the kit, a `shot`
 * the item, a `kill` the record's `DisplayName` (research 91 §10). A synthetic map and a hand-built arsenal (the
 * repository's convention: no disc).
 */

type V3 = [number, number, number];

function flatMap(): SimMap {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const ground = packGround(params, [floor], owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [] };
}

// ---- a hand-built arsenal: `zweapon.rdr`'s shape, as `scene/test/arsenal.test.ts` spells it ----------------------------

const rec = (...pairs: [string, RdrNode][]): RdrNode[] => pairs.flatMap(([k, v]) => [k, Array.isArray(v) ? v : [v]]);
const weapon = (name: string, id: number, display = name.toUpperCase()): RdrNode[] => rec(
  ['InternalName', name], ['DisplayName', display], ['ID', String(id)], ['NumMags', '3'], ['Ammo_Capacity', '30'],
  ['AMMO_TYPES', [rec(['NAME', '5.56 x 45mm'])]], ['ModelName', name.toLowerCase()], ['IconTextureName', `${name}_icon.tif`],
);
const zweapon: RdrNode = [
  'ZAMMO', [rec(['InternalName', '5.56 x 45mm'], ['ID', '8'])],
  'ZWEAPON', [
    weapon('M4A1', 54), weapon('M4A1 SD', 62), weapon('552', 57, '552 COMMANDO'), weapon('AK-47', 58), weapon('Mark 23', 15),
    weapon('M9', 5), weapon('M67', 121), weapon('AN-M8', 122), weapon('HE', 126), weapon('C4', 151), weapon('Double Ammo Load', 194, '2X AMMO'),
    weapon('Mark 23SD', 16), weapon('F57', 4), weapon('Spas 12', 81), weapon('JACKHAMMER', 83), weapon('Model 870', 84), weapon('Mark141', 123),
  ],
];
const rifle = (name: string, id: number): WeaponRecord => ({ ...DEFAULT_RIFLE, name, id });
const table: KitTable = {
  arsenal: arsenalOf(zweapon),
  records: new Map([[54, rifle('M4A1', 54)], [62, HELD_RIFLE], [57, rifle('552', 57)], [58, rifle('AK-47', 58)], [15, HELD_SIDEARM], [5, { ...HELD_SIDEARM, name: 'M9', id: 5 }],
    [4, { ...HELD_SIDEARM, name: 'F57', id: 4 }], [16, { ...HELD_SIDEARM, name: 'Mark 23SD', id: 16 }], [81, rifle('Spas 12', 81)], [83, rifle('JACKHAMMER', 83)], [84, rifle('Model 870', 84)]]),
  rounds: new Map(),
};
const kit = (...ids: number[]): Loadout => ids as unknown as Loadout;
/** The valves: the M4s and the Mark 23 the SEALs', the 552, the AK and the M9 the Terrorists', the throwables both; C4 locked in a SEAL's kit (16). */
const valves = new Map([
  ['Enable_m4Acarbine', 1], ['Enable_M4A1_SD', 1], ['Enablesig_commando', 8], ['Enable_ak47', 8], ['Enable_Mark23', 1],
  ['Enable_beretta_m9', 8], ['Enable_frag', 9], ['Enable_smoke', 9], ['Enable_HEgren', 9], ['Enable_c4', 16 | 1], ['Enable_2xammo', 9],
]);
const SEAL_KIT = kit(54, 15, 121, 151, 194);
const TERRORIST_KIT = kit(57, 5, 121, 126, 255);
const map: MapArsenal = {
  valves, selectable: { seal: [], terrorist: [] },
  kits: {
    seal: [{ type: 'Seal1', character: 'mp99_seal1', loadout: SEAL_KIT }],
    terrorist: [{ type: 'Terrorist1', character: 'mp99_terror1', loadout: TERRORIST_KIT }],
  },
};
const kits: SimKits = { table, map };

// ---- the room, driven as room.test.ts drives it -------------------------------------------------------------------

class Client implements Conn {
  readonly events: ServerEvent[] = [];
  readonly frames: Uint8Array[] = [];
  closed: { code: number; reason: string } | null = null;
  send(frame: Uint8Array | string): void {
    if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent);
    else this.frames.push(frame);
  }
  close(code: number, reason: string): void { this.closed = { code, reason }; }
  of<T extends ServerEvent['type']>(type: T): Extract<ServerEvent, { type: T }>[] {
    return this.events.filter((e) => e.type === type) as Extract<ServerEvent, { type: T }>[];
  }
}

/** A session token of a tab (`SESSION_TOKEN_PATTERN`: base64url, 22 to 64). */
const tok = (tab: number | string): string => `tab${tab}`.padEnd(22, '_');

function setup(opts: ConstructorParameters<typeof Room>[2] = {}, withKits: SimKits | null = kits) {
  let seed = 1;
  const room = new Room(flatMap(), null, { now: () => 0, random: () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }, rules: 'classic', launchCountdownS: 0, ...opts }, null, withKits);   // no launch countdown: room.test.ts `setup`
  const seqs = new Map<number, number>();
  /** A page's hello: its own session token (`tok(id)`: the same id is the same tab, a reconnect), name and address. */
  const join = (id: number, version = PROTOCOL_VERSION, types?: unknown, session = tok(id)): Client => {
    const c = new Client();
    room.hello(id, c, { type: 'hello', version, name: `P${id}`, map: 'MP99', session, ...(types !== undefined ? { types } : {}) } as Extract<ClientEvent, { type: 'hello' }>, `10.0.0.${id}`);
    return c;
  };
  const cmd = (id: number, over: Partial<Command> = {}): Command => {
    const seq = (seqs.get(id) ?? room.player(id)?.sim.seq ?? 0) + 1;
    seqs.set(id, seq);
    const p = room.player(id)!;
    return { seq, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0, ...over };
  };
  const send = (id: number, commands: Command[]): void => { room.binary(id, encodeCommands({ viewTick: room.tick, commands })); };
  /**
   * A `loadout` request, sent as the menu sends it: while the player is dead (`canOpen`), unless `alive` -- the body is
   * marked dead for the request alone, so the round's state is untouched.
   */
  const loadout = (id: number, picks: unknown, alive = false, char?: unknown): void => {
    const p = room.player(id) as { alive: boolean } | undefined;
    const was = p?.alive ?? false;
    if (p && !alive) p.alive = false;
    room.text(id, { type: 'loadout', picks, ...(char !== undefined ? { char } : {}) } as unknown as ClientEvent);
    if (p) p.alive = was;
  };
  return { room, join, cmd, send, loadout, forget: (id: number) => seqs.delete(id) };
}
type Setup = ReturnType<typeof setup>;

/**
 * A 2-second round (room.test.ts' convention) for a test that runs a sixteen-seat room to its round's end: the
 * create-game default's 6 minutes are 21,600 steps of sixteen bodies, 2-10 s of a test's time on a CI runner (it timed
 * out there twice, 2026-10-02), and no assertion reads the round's length -- only that it ended.
 */
const SHORT_ROUND = { roundSeconds: 2 };

/** The next round in a classic room: its clock run out (6 minutes), the round's end held, the next round's spawns. */
function nextRound(s: Setup): void {
  const start = s.room.round;
  for (let i = 0; i < 60 * 60 * 10 && s.room.round === start; i++) s.room.step();
}

/** A player that faces a point and fires as the page does (room.test.ts' `gunner`, trimmed). */
function gunner(s: Setup, id: number) {
  let look = { yaw: s.room.player(id)!.sim.walker.state.yaw, pitch: 0 };
  let point: V3 | null = null;
  const run = (n = 1, weapon: 0 | 1 = 0): void => { for (let i = 0; i < n; i++) { s.send(id, [s.cmd(id, { ...look, weapon })]); s.room.step(); } };
  const feet = (): V3 => { const st = s.room.player(id)!.sim.walker.state; return [st.x, st.y, st.z]; };
  const face = (at: V3): void => { look = faceToward({ feet: feet(), posture: s.room.player(id)!.sim.walker.posture }, at); point = at; s.room.player(id)!.sim.allowSnap(); run(2); };   // staged as the room would set it (LATER 14: no free turn after a spawn)
  const shoot = (weaponClaim = 0): void => {
    const seq = s.room.player(id)!.sim.seq;
    const f = s.room.player(id)!.cone.frame(seq)!;
    const from: V3 = [f.feet[0], f.feet[1] + EYE_HEIGHT, f.feet[2]];
    const { eye } = cameraLook(f);
    const t = point ? Math.hypot(point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]) : 200;
    const c = centreClaim(f, from, t);
    s.room.text(id, { type: 'fire', seq, from: c.from, dir: c.dir, eye: c.eye, aim: c.aim, weapon: weaponClaim, viewTick: s.room.tick });
  };
  return { run, face, shoot };
}

/** A SEAL (id 2) and a Terrorist (id 1) seated: the classic round launched. */
function match(opts: ConstructorParameters<typeof Room>[2] = {}) {
  const s = setup(opts);
  const t = s.join(1), seal = s.join(2);
  s.room.step();
  return { ...s, t, seal };
}

describe('protocol 7: the loadout request, replayed by the room from the type\'s kit (applyPicks, W4.R6)', () => {
  it('EQlimit 1 refuses a forged M4A1 pick in a pistol-only room (research 192 §3.10; 95 §3.5)', () => {
    const s = setup({ heldLaunch: true, eqLimit: 1 });
    s.join(1);
    const c = s.join(2);
    s.room.text(2, { type: 'loadout', picks: [{ slot: 0, id: 54 }], eqLimit: 0 } as unknown as ClientEvent);
    expect(c.of('loadout').at(-1)!.refused).toEqual({ reason: 'locked', at: 0 });
  });

  it.each([7, 8])('a protocol-%i page (7 of either branch; 8, before the character types) is refused at the hello', (version) => {
    const s = setup();
    const c = s.join(1, version);
    expect(c.of('refused')[0]!.reason).toBe(`protocol ${version}, this server speaks ${PROTOCOL_VERSION}`);
    expect(c.closed?.code).toBe(4000);
    expect(s.room.player(1)).toBeUndefined();
  });

  it('answers with the kit it computed and holds it for the next round; this round\'s body keeps its kit (R94.3)', () => {
    const s = match();
    expect(s.room.player(2)!.loadout).toEqual(SEAL_KIT);
    s.loadout(2, [{ slot: 0, id: 62 }, { slot: 2, id: 122 }]);
    const answer = s.seal.of('loadout').at(-1)!;
    expect(answer).toEqual({ type: 'loadout', kit: [62, 15, 122, 151, 194], refused: null, char: 0 });
    expect(s.room.player(2)!.loadout).toEqual(SEAL_KIT);                  // not before the next round's rebuild
    expect(s.room.player(2)!.records[0].name).toBe('M4A1');
    nextRound(s);
    expect(s.room.player(2)!.loadout).toEqual([62, 15, 122, 151, 194]);
    expect(s.room.player(2)!.records[0].name).toBe('M4A1 SD');
    // The spawn names the kit, to the page and to the others (their holsters and hands).
    expect(s.seal.of('spawn').filter((e) => e.id === 2).at(-1)!.kit).toEqual([62, 15, 122, 151, 194]);
    expect(s.t.of('spawn').filter((e) => e.id === 2).at(-1)!.kit).toEqual([62, 15, 122, 151, 194]);
    // And the round after keeps it: the pick is written to the type, not spent (FUN_0023e5e0 -> type +0x2f0).
    nextRound(s);
    expect(s.room.player(2)!.loadout).toEqual([62, 15, 122, 151, 194]);
  });

  it('is idempotent: the whole list each time lands on the same kit, repeated or extended', () => {
    const s = match();
    const picks = [{ slot: 0, id: 62 }];
    s.loadout(2, picks); s.loadout(2, picks);
    expect(s.seal.of('loadout').map((a) => a.kit)).toEqual([[62, 15, 121, 151, 194], [62, 15, 121, 151, 194]]);
    s.loadout(2, [...picks, { slot: 0, id: 54 }]);
    expect(s.seal.of('loadout').at(-1)!.kit).toEqual(SEAL_KIT);
    s.loadout(2, []);                                                    // no picks: the type's own kit
    expect(s.seal.of('loadout').at(-1)!.kit).toEqual(SEAL_KIT);
  });

  it.each([
    // [what, the picks, the refusal, at]
    ['the other side\'s weapon (the Terrorists\' AK-47 for a SEAL)', [{ slot: 0, id: 58 }], 'refused', 0],
    ['an unknown id', [{ slot: 2, id: 250 }], 'unknown', 0],
    ['a locked slot (C4 while Enable_c4 carries 16, FUN_0023e910)', [{ slot: 3, id: 121 }], 'locked', 0],
    ['a second primary (the M4A1 in an equipment slot)', [{ slot: 2, id: 54 }], 'refused', 0],
    ['a sidearm in the primary slot', [{ slot: 0, id: 15 }], 'refused', 0],
    ['a slot past 4', [{ slot: 5, id: 121 }], 'slot', 0],
    // R4B-06 (OT.R97; research 378): r0004's no-duplicate list adds C4 (r4 0x2d2280, 0x97 at 0x2d24b4); r0001's
    // FUN_0023c390 (D:L87443-87444) took this pick, a second C4 slot.
    ['a second C4 (the no-duplicate list of r0004, r4 0x2d2280)', [{ slot: 2, id: 151 }], 'refused', 0],
    ['a good pick, then a bad one: the whole request refused, at the second', [{ slot: 0, id: 62 }, { slot: 1, id: 5 }], 'refused', 1],
  ] as const)('refuses %s, and keeps the kit it held', (_what, picks, reason, at) => {
    const s = match();
    s.loadout(2, [{ slot: 2, id: 126 }]);                                // a kit held before
    s.loadout(2, picks);
    expect(s.seal.of('loadout').at(-1)).toEqual({ type: 'loadout', kit: [54, 15, 126, 151, 194], refused: { reason, at }, char: 0 });
    nextRound(s);
    expect(s.room.player(2)!.loadout).toEqual([54, 15, 126, 151, 194]);
  });

  it.each([
    ['not a list', { slot: 0, id: 62 }],
    ['a pick without an id', [{ slot: 0 }]],
    ['a fractional slot', [{ slot: 0.5, id: 62 }]],
    ['past MAX_LOADOUT_PICKS', Array.from({ length: 65 }, () => ({ slot: 0, id: 62 }))],
  ])('a malformed request (%s) is answered with the slot refusal, never thrown (BL-2)', (_what, picks) => {
    const s = match();
    expect(() => s.loadout(2, picks)).not.toThrow();
    expect(s.seal.of('loadout').at(-1)!.refused!.reason).toBe('slot');
  });

  it('a Terrorist\'s picks are the Terrorists\' own: the AK-47 taken, the M4A1 SD refused', () => {
    const s = match();
    s.loadout(1, [{ slot: 0, id: 58 }]);
    expect(s.t.of('loadout').at(-1)).toEqual({ type: 'loadout', kit: [58, 5, 121, 126, 255], refused: null, char: 0 });
    s.loadout(1, [{ slot: 0, id: 62 }]);
    expect(s.t.of('loadout').at(-1)!.refused).toEqual({ reason: 'refused', at: 0 });
  });

  it('a pick survives a reconnect: the rejoiner\'s page sends its list again and the new seat holds the same kit', () => {
    const s = match();
    const picks = [{ slot: 0, id: 62 }, { slot: 2, id: 122 }];
    s.loadout(2, picks);
    s.room.leave(2);
    const again = s.join(3);                                            // the rejoiner's new place, a SEAL again
    expect(s.room.player(3)!.team).toBe('seal');
    s.loadout(3, picks);                                                // `LoadoutSync` resends on the welcome
    expect(again.of('loadout').at(-1)!.kit).toEqual([62, 15, 122, 151, 194]);
    nextRound(s);
    expect(s.room.player(3)!.loadout).toEqual([62, 15, 122, 151, 194]);
  });

  it('a player who leaves with no picks clears what its tab kept: an older list never comes back (M10 review)', () => {
    const s = match();
    s.loadout(2, [{ slot: 0, id: 62 }, { slot: 2, id: 122 }]);
    s.room.leave(2);
    const back = s.join(2);                                             // the same tab (its token): the list restored
    s.loadout(2, []);                                                   // cleared while dead
    expect(back.of('loadout').at(-1)).toMatchObject({ refused: null });
    s.room.leave(2);
    s.join(2);
    nextRound(s);
    expect(s.room.player(2)!.loadout[0]).not.toBe(62);
  });

  it('a room without the arsenal refuses every pick as unknown and holds the baked kit', () => {
    const s = setup({}, null);
    const c = s.join(1);
    s.loadout(1, [{ slot: 0, id: 62 }]);
    expect(c.of('loadout').at(-1)!.refused).toEqual({ reason: 'unknown', at: 0 });
    s.loadout(1, []);
    expect(c.of('loadout').at(-1)!.refused).toBeNull();
  });

  it('the page\'s own room replays from the page\'s developer kit (soloKit), the type\'s record it stands in for', () => {
    const s = setup({ solo: true, soloKit: () => kit(62, 15, 121, 126, 255) });
    const c = s.join(1);
    expect(s.room.player(1)!.loadout).toEqual([62, 15, 121, 126, 255]);
    s.loadout(1, [{ slot: 3, id: 122 }]);
    expect(c.of('loadout').at(-1)!.kit).toEqual([62, 15, 121, 122, 255]);
  });

  it('the welcome lists each player\'s kit as its body carries it', () => {
    const s = match();
    const late = s.join(4);
    const seen = new Map(late.of('welcome')[0]!.players.map((p) => [p.id, p.kit]));
    expect(seen.get(1)).toEqual([...TERRORIST_KIT]);
    expect(seen.get(2)).toEqual([...SEAL_KIT]);
  });
});

describe('CREATE GAME equipment limits (research 362 §2)', () => {
  it('the initial pistol-only hand is secondary, and invalid shoulder requests cannot fire fallback weapons', () => {
    const fired = (eqLimit: number, weapon: 0 | 1 = 0): number | undefined => {
      const s = match({ eqLimit });
      s.room.player(1)!.sim.walker.place(0, 20, 0);
      s.room.player(2)!.sim.walker.place(100, 20, 0);
      const g = gunner(s, 1);
      for (let i = 0; i < 20; i++) s.room.step();
      g.face([100, 12, 0]);
      s.send(1, [s.cmd(1, { buttons: Button.Swap, weapon })]); s.room.step();
      g.run(80, weapon); g.shoot(weapon); g.run(1, weapon);
      return s.seal.of('shot').at(-1)?.weapon;
    };
    expect([fired(0), fired(1), fired(0, 1), fired(2, 1)]).toEqual([57, 4, 5, 83]);
  });

  it('the first spawn, late join and next round choose the native usable secondary in pistol-only', () => {
    const s = match({ eqLimit: 1, ...SHORT_ROUND });
    for (const id of [1, 2]) expect(s.room.player(id)!.sim.weapon).toBe(1);
    s.join(3);
    nextRound(s);
    for (const id of [1, 2, 3]) expect(s.room.player(id)!.sim.weapon).toBe(1);
  });

  it.each([
    [1, [254, 4, 123, 122, 254], 1],
    [2, [83, 254, 194, 122, 254], 0],
  ] as const)('EQlimit %i and its initial hand survive repeated supported respawns', (eqLimit, expected, weapon) => {
    const s = setup({ rules: 'respawn', eqLimit });
    const client = s.join(1);
    for (let life = 0; life < 2; life++) {
      const p = s.room.player(1)!;
      p.alive = false;
      (p as unknown as { diedAt: number }).diedAt = s.room.tick;   // the existing private death clock, controlled fixture setup
      for (let i = 0; i < RESPAWN_FADE_S * TICK_HZ; i++) s.room.step();
      s.send(1, [s.cmd(1, { buttons: Button.Action })]); s.room.step();
      expect(s.room.player(1)!.alive).toBe(true);
      expect(s.room.player(1)!.loadout).toEqual(expected);
      expect(s.room.player(1)!.sim.weapon).toBe(weapon);
      expect(client.of('spawn').at(-1)!.kit).toEqual(expected);
    }
  });

  it.each([
    [1, [254, 16, 123, 122, 151], [254, 4, 123, 122, 254]],
    [2, [81, 254, 194, 122, 151], [83, 254, 194, 122, 254]],
  ] as const)('EQlimit %i gives both sides their forced defaults, ignores stored kits, and tells every welcome', (eqLimit, sealKit, terrKit) => {
    const s = setup({ heldLaunch: true, eqLimit });
    const t = s.join(1), seal = s.join(2);
    for (const c of [t, seal]) expect(c.of('welcome')[0]!.eqLimit).toBe(eqLimit);
    expect(s.room.storedProfile(2, { valid: true, charSet: 1, items: [20, 4, 36, 37, 35] })).toBe(false);
    expect(s.room.launchStored(0, new Map([[2, { valid: true, charSet: 1, items: [20, 4, 36, 37, 35] }]]))).toBe(true);
    expect(s.room.player(2)!.loadout).toEqual(sealKit);
    expect(s.room.player(1)!.loadout).toEqual(terrKit);
    const late = s.join(3);
    expect(late.of('welcome')[0]!.eqLimit).toBe(eqLimit);
    expect(late.of('welcome')[0]!.ghost).toBe(true);
  });

  it('shotgun-only permits the original shotgun alternatives, refuses rifles and the locked secondary, and keeps a choice across reconnect/round reset', () => {
    const s = setup({ heldLaunch: true, eqLimit: 2, ...SHORT_ROUND });
    s.join(1); const seal = s.join(2);
    s.loadout(2, [{ slot: 0, id: 84 }]);
    expect(seal.of('loadout').at(-1)!.refused).toBeNull();
    s.loadout(2, [{ slot: 0, id: 54 }]);
    expect(seal.of('loadout').at(-1)!.refused).toEqual({ reason: 'refused', at: 0 });
    s.loadout(2, [{ slot: 1, id: 15 }]);
    expect(seal.of('loadout').at(-1)!.refused).toEqual({ reason: 'locked', at: 0 });
    s.room.leave(2);
    const again = s.join(3, PROTOCOL_VERSION, undefined, tok(2));
    expect(again.of('welcome')[0]!.eqLimit).toBe(2);
    expect(s.room.launch(0)).toBe(true);
    expect(s.room.player(3)!.loadout).toEqual([84, 254, 194, 122, 151]);
    nextRound(s);
    expect(s.room.player(3)!.loadout).toEqual([84, 254, 194, 122, 151]);
  });
});

describe('the loadout request\'s own guards: the menu\'s gate, the re-send, the budget', () => {
  it('refuses a living player\'s request (the menu opens only dead or a ghost, FUN_001f7ff0 L56648-56661), the kit kept', () => {
    const s = match();
    s.loadout(2, [{ slot: 2, id: 126 }]);                                  // dead: taken
    s.loadout(2, [{ slot: 0, id: 62 }], true);                             // alive: refused
    expect(s.seal.of('loadout').at(-1)).toEqual({ type: 'loadout', kit: [54, 15, 126, 151, 194], refused: { reason: 'alive', at: 0 }, char: 0 });
    s.loadout(2, [{ slot: 2, id: 126 }], true);                            // alive, the list it holds again: answered as held
    expect(s.seal.of('loadout').at(-1)).toEqual({ type: 'loadout', kit: [54, 15, 126, 151, 194], refused: null, char: 0 });
  });

  it('a reconnect seated alive (a respawn room seats at once) re-sends its accepted picks and they land; new ones do not', () => {
    const s = setup({ rules: 'respawn' });
    s.join(1); s.join(2);
    const picks = [{ slot: 0, id: 62 }, { slot: 2, id: 122 }];
    s.loadout(2, picks);
    s.room.leave(2);
    const again = s.join(2);                                              // the same tab (its token): its type's picks kept
    expect(s.room.player(2)!.alive).toBe(true);
    s.loadout(2, picks, true);
    expect(again.of('loadout').at(-1)).toEqual({ type: 'loadout', kit: [62, 15, 122, 151, 194], refused: null, char: 0 });
    s.loadout(2, [...picks, { slot: 2, id: 126 }], true);
    expect(again.of('loadout').at(-1)!.refused).toEqual({ reason: 'alive', at: 0 });
    const other = s.join(3);                                               // another address holds nothing of it
    s.loadout(3, picks, true);
    expect(other.of('loadout').at(-1)!.refused).toEqual({ reason: 'alive', at: 0 });
  });

  it('holds a player to LOADOUT_BURST requests, then one each LOADOUT_EVERY ticks; the rest answered `rate`, one to one', () => {
    const s = match();
    for (let i = 0; i < 30; i++) s.loadout(2, [{ slot: 0, id: 62 }]);
    const answers = s.seal.of('loadout') as { refused: { reason: string } | null }[];
    expect(answers).toHaveLength(30);                                    // every request answered: the page's pairing holds
    expect(answers.filter((a) => a.refused?.reason === 'rate')).toHaveLength(30 - LOADOUT_BURST);
    for (let i = 0; i < LOADOUT_EVERY; i++) s.room.step();
    s.loadout(2, [{ slot: 0, id: 62 }]); s.loadout(2, [{ slot: 0, id: 62 }]);
    const later = (s.seal.of('loadout') as { refused: { reason: string } | null }[]).slice(30);
    expect(later.map((a) => a.refused?.reason ?? null)).toEqual([null, 'rate']);
  });
});

/**
 * Protocol 9 (web sprint 5 S2; research 95 §6, W5.R2): each side's four ARMORY types, each its own kit (and body and
 * hit volumes: `room.test.ts`). The hello names the page's type per side, a `loadout` request the type its picks replay
 * from; the room checks both against the map's side (`armoryTypeAllowed`) and rebuilds the body as the type at the spawn.
 */
describe('protocol 9: the character types (web sprint 5 S2)', () => {
  const SEAL2_KIT = kit(62, 15, 121, 126, 194), SEAL3_KIT = kit(54, 15, 122, 126, 255), SEAL4_KIT = kit(62, 15, 121, 151, 194);
  const T2_KIT = kit(58, 5, 121, 126, 255);
  const typed: SimKits = {
    table, map: {
      ...map, kits: {
        seal: [
          { type: 'Seal1', character: 'mp99_seal1', loadout: SEAL_KIT }, { type: 'Seal2', character: 'mp99_seal2', loadout: SEAL2_KIT },
          { type: 'Seal3', character: 'mp99_seal3', loadout: SEAL3_KIT }, { type: 'Seal4', character: 'mp99_seal4', loadout: SEAL4_KIT },
        ],
        terrorist: [{ type: 'Terrorist1', character: 'mp99_terror1', loadout: TERRORIST_KIT }, { type: 'Terrorist2', character: 'mp99_terror2', loadout: T2_KIT }],
      },
    },
  };
  /** A Terrorist (1) and a SEAL (2) seated with the hello's types, the classic round launched. */
  const typedMatch = (t?: unknown, seal?: unknown) => {
    const s = setup({}, typed);
    const tc = s.join(1, PROTOCOL_VERSION, t), sc = s.join(2, PROTOCOL_VERSION, seal);
    s.room.step();
    return { ...s, t: tc, seal: sc };
  };

  it('without a type asked, SEAL 1 / TERRORIST 1 with their kits (R95.5); the spawn and the welcome name the type', () => {
    const s = typedMatch();
    expect([s.room.player(1)!.char, s.room.player(2)!.char]).toEqual([0, 0]);
    expect(s.room.player(2)!.loadout).toEqual(SEAL_KIT);
    expect(s.seal.of('spawn').filter((e) => e.id === 2).at(-1)).toMatchObject({ kit: [...SEAL_KIT], char: 0 });
    const late = s.join(3);
    expect(late.of('welcome')[0]!.players.map((p) => [p.id, p.char])).toEqual([[1, 0], [2, 0]]);
  });

  it('the hello\'s type for the side the room gives: its kit at the spawn, the others told (the fourth open online, R95.6)', () => {
    const s = typedMatch({ seal: 2, terrorist: 1 }, { seal: 3, terrorist: 0 });
    expect([s.room.player(1)!.team, s.room.player(1)!.char, s.room.player(2)!.char]).toEqual(['terrorist', 1, 3]);
    expect(s.room.player(1)!.loadout).toEqual(T2_KIT);
    expect(s.room.player(2)!.loadout).toEqual(SEAL4_KIT);
    expect(s.t.of('spawn').filter((e) => e.id === 2).at(-1)).toMatchObject({ kit: [...SEAL4_KIT], char: 3 });
    const late = s.join(3);
    expect(late.of('welcome')[0]!.players.map((p) => [p.id, p.char])).toEqual([[1, 1], [2, 3]]);
  });

  /**
   * OT.R91 (the owner, 2026-10-31): every campaign character unlocked online. Each campaign-AOP MP map's own
   * `InWhichAOP` (`scene/test/golden/map-arsenals.json`, pinned off each map's `mission.rdr`): the room seats the
   * fourth type on both sides, and the bots' armory pick (`botLoadout`, the same `armoryTypeAllowed`) may take it.
   */
  const pinned = (JSON.parse(readFileSync(resolve(import.meta.dirname, '../../scene/test/golden/map-arsenals.json'), 'utf8')) as {
    maps: Record<string, { valves: Record<string, number> }>;
  }).maps;
  const campaign = Object.entries(pinned).filter(([, m]) => (m.valves.InWhichAOP ?? 0) !== 0);
  it.each(campaign.map(([name, m]) => [name, m.valves.InWhichAOP!] as const))('OT.R91: %s (InWhichAOP %i) seats the fourth type on both sides; a bot may pick it', (_name, aop) => {
    const T3_KIT = kit(57, 5, 122, 126, 194), T4_KIT = kit(58, 5, 121, 122, 255);
    const four: SimKits = {
      table, map: {
        ...typed.map!, valves: new Map([...valves, ['InWhichAOP', aop]]),
        kits: {
          seal: typed.map!.kits.seal,
          terrorist: [...typed.map!.kits.terrorist, { type: 'Terrorist3', character: 'mp99_terror3', loadout: T3_KIT }, { type: 'Terrorist4', character: 'mp99_terror4', loadout: T4_KIT }],
        },
      },
    };
    const s = setup({}, four);
    s.join(1, PROTOCOL_VERSION, { seal: 0, terrorist: 3 });
    s.join(2, PROTOCOL_VERSION, { seal: 3, terrorist: 0 });
    s.room.step();
    expect([s.room.player(1)!.team, s.room.player(1)!.char, s.room.player(2)!.team, s.room.player(2)!.char]).toEqual(['terrorist', 3, 'seal', 3]);
    expect(s.room.player(1)!.loadout).toEqual(T4_KIT);
    expect(s.room.player(2)!.loadout).toEqual(SEAL4_KIT);
    for (const side of ['seal', 'terrorist'] as const) {
      expect(botLoadout(four, side, () => 0, 'support', 3)?.char, side).toBe(3);
      const picked = new Set([0, 0.3, 0.6, 0.999].map((r) => botLoadout(four, side, () => r, 'support')?.char));
      expect(picked.has(3), side).toBe(true);
    }
  });

  it.each([
    ['a type the side does not list (a third Terrorist)', { terrorist: 2 }],
    ['past the four columns', { terrorist: 4 }],
    ['not a whole index', { terrorist: 1.5 }],
    ['not a number', { terrorist: '1' }],
    ['not a record', 7],
  ])('a hello with %s seats the default type, never refused', (_what, types) => {
    const s = typedMatch(types);
    expect(s.room.player(1)).toMatchObject({ team: 'terrorist', char: 0, nextChar: 0 });
    expect(s.room.player(1)!.loadout).toEqual(TERRORIST_KIT);
  });

  /** The round-end interval (a classic round's clock run out, its `roundOver` sent): the ARMORY's, W5.R1. */
  const toInterval = (s: ReturnType<typeof typedMatch>): void => {
    const over = s.seal.of('roundOver').length;
    for (let i = 0; i < 60 * 60 * 10 && s.seal.of('roundOver').length === over; i++) s.room.step();
  };

  it('a loadout request\'s type: its kit the picks replay from, held for the next round; the answer names it', () => {
    const s = typedMatch();
    toInterval(s);                                                         // outside a round: the seat's ARMORY (W5.R1, INT.R3)
    s.loadout(2, [{ slot: 3, id: 121 }], false, 2);
    expect(s.seal.of('loadout').at(-1)).toEqual({ type: 'loadout', kit: [54, 15, 122, 121, 255], refused: null, char: 2 });
    expect([s.room.player(2)!.char, s.room.player(2)!.nextChar]).toEqual([0, 2]);   // not before the rebuild
    expect(s.room.player(2)!.loadout).toEqual(SEAL_KIT);
    nextRound(s);
    expect([s.room.player(2)!.char, s.room.player(2)!.loadout]).toEqual([2, [54, 15, 122, 121, 255]]);
    expect(s.t.of('spawn').filter((e) => e.id === 2).at(-1)).toMatchObject({ char: 2, kit: [54, 15, 122, 121, 255] });
    toInterval(s);
    s.loadout(2, [], false, 1);                                            // a type alone: its own kit
    expect(s.seal.of('loadout').at(-1)).toMatchObject({ kit: [...SEAL2_KIT], refused: null, char: 1 });
    s.loadout(2, [{ slot: 2, id: 122 }]);                                  // no type named: the one held
    expect(s.seal.of('loadout').at(-1)).toMatchObject({ kit: [62, 15, 122, 126, 194], char: 1 });
  });

  it.each([
    ['a third Terrorist', 1, 2], ['a fifth SEAL', 2, 4], ['a negative index', 2, -1], ['a string', 2, '1'], ['null', 2, null],
  ] as const)('refuses %s as `type`, keeping the type and kit held', (_what, id, char) => {
    const s = typedMatch();
    s.loadout(id, [], false, char);
    const c = id === 1 ? s.t : s.seal;
    expect(c.of('loadout').at(-1)).toMatchObject({ refused: { reason: 'type', at: 0 }, char: 0 });
    expect(s.room.player(id)!.nextChar).toBe(0);
  });

  it('in a round a dead player\'s new type is refused `round` (WEAPON EXCHANGE changes the kit, never the type: W5.R1)', () => {
    const s = typedMatch();
    s.loadout(2, [{ slot: 2, id: 122 }], false, 1);                        // dead, spawned this round: a new type
    expect(s.seal.of('loadout').at(-1)).toEqual({ type: 'loadout', kit: [...SEAL_KIT], refused: { reason: 'round', at: 0 }, char: 0 });
    expect(s.room.player(2)!.nextChar).toBe(0);                                    // the type held, its kit unchanged
    s.loadout(2, [{ slot: 2, id: 122 }], false, 0);                        // the kit alone, the type held: WEAPON EXCHANGE's
    expect(s.seal.of('loadout').at(-1)).toMatchObject({ kit: [54, 15, 122, 151, 194], refused: null, char: 0 });
    s.loadout(2, [{ slot: 2, id: 126 }], false);                           // no type named: the one held
    expect(s.seal.of('loadout').at(-1)!.refused).toBeNull();
    nextRound(s);
    expect([s.room.player(2)!.char, s.room.player(2)!.loadout]).toEqual([0, [54, 15, 126, 151, 194]]);
  });

  it('a ghost seated in a round has not spawned in it: its type is taken, for the next round\'s spawn (W5.R1)', () => {
    const s = typedMatch();
    const g = s.join(3);                                                    // a SEAL (the sides balanced), a ghost
    expect([s.room.player(3)!.team, s.room.player(3)!.alive]).toEqual(['seal', false]);
    s.loadout(3, [], false, 2);
    expect(g.of('loadout').at(-1)).toMatchObject({ refused: null, char: 2, kit: [...SEAL3_KIT] });
    nextRound(s);
    expect([s.room.player(3)!.char, s.room.player(3)!.loadout]).toEqual([2, SEAL3_KIT]);
    s.loadout(3, [], false, 1);                                            // spawned now: the next change waits
    expect(g.of('loadout').at(-1)!.refused).toEqual({ reason: 'round', at: 0 });
  });

  it('respawn rules: a player killed in the round cannot take a new type for its respawn (W5.R1, research 94 §B2)', () => {
    const s = setup({ rules: 'respawn' }, typed);
    s.join(1); const sc = s.join(2);
    s.room.step();
    const p = s.room.player(2)!;
    expect([p.alive, p.char]).toEqual([true, 0]);
    (s.room as unknown as { kill(v: unknown, k: null, w: null, how: string): void }).kill(p, null, null, 'fall');
    expect(p.alive).toBe(false);
    s.room.text(2, { type: 'loadout', picks: [], char: 1 } as unknown as ClientEvent);   // truly dead, not marked dead
    expect(sc.of('loadout').at(-1)).toMatchObject({ refused: { reason: 'round', at: 0 }, char: 0 });
    for (let i = 0; i < 12 * TICK_HZ && !s.room.player(2)!.alive; i++) { s.send(2, [s.cmd(2, { buttons: Button.Action })]); s.room.step(); }
    expect(s.room.player(2)!.alive).toBe(true);
    expect(s.room.player(2)!.char).toBe(0);
    expect(sc.of('spawn').filter((e) => e.id === 2).at(-1)).toMatchObject({ char: 0, kit: [...SEAL_KIT] });
  });

  it('in a round a living player\'s new type is refused (the in-round menu\'s gate); outside one it is the ARMORY\'s (W5.R1)', () => {
    const s = typedMatch();
    s.loadout(2, [], true, 1);
    expect(s.seal.of('loadout').at(-1)!.refused).toEqual({ reason: 'alive', at: 0 });
    s.loadout(2, [], true, 0);                                             // the type and list held: answered as held
    expect(s.seal.of('loadout').at(-1)!.refused).toBeNull();
    // A classic room waiting for its other side: the one player is up, and its request is taken for the round's spawn.
    const w = setup({}, typed);
    const only = w.join(2);                                                // the first seated is a Terrorist
    expect([w.room.player(2)!.team, w.room.player(2)!.alive]).toEqual(['terrorist', true]);
    w.loadout(2, [], true, 1);
    expect(only.of('loadout').at(-1)).toMatchObject({ refused: null, char: 1, kit: [...T2_KIT] });
    w.join(1);
    w.room.step();
    expect([w.room.player(2)!.char, w.room.player(2)!.loadout]).toEqual([1, T2_KIT]);
  });

  it('a reconnect of the same tab (its session token) is seated as the type it held, with its picks; between rounds a hello\'s type wins and drops them', () => {
    // Explicit test clock: reach the interval without respawn's original twenty-minute default (research 348).
    const s = setup({ rules: 'respawn', ...SHORT_ROUND }, typed);
    s.join(1); s.join(2, PROTOCOL_VERSION, { seal: 2 });                  // a respawn room seats in the round: the hello's type
    s.loadout(2, [{ slot: 3, id: 121 }]);                                  // the kit alone (WEAPON EXCHANGE's, dead)
    s.room.leave(2);
    s.join(2);
    expect([s.room.player(2)!.nextChar, s.room.player(2)!.char]).toEqual([2, 2]);
    expect(s.room.player(2)!.loadout).toEqual([54, 15, 122, 121, 255]);
    s.room.leave(2);
    s.join(2, PROTOCOL_VERSION, { seal: 1 });                              // spawned in this round: the type is held
    expect([s.room.player(2)!.char, s.room.player(2)!.loadout]).toEqual([2, [54, 15, 122, 121, 255]]);
    const phase = (): string => (s.room as unknown as { state: { phase: string } }).state.phase;
    for (let i = 0; i < 60 * 60 * 10 && phase() !== 'over'; i++) s.room.step();
    s.room.leave(2);
    s.join(2, PROTOCOL_VERSION, { seal: 1 });                              // between rounds: the hello's type wins
    expect(s.room.player(2)!.char).toBe(1);
    expect(s.room.player(2)!.loadout).toEqual(SEAL2_KIT);                   // the kept picks were type 3's
  });

  it('a spectator\'s types (its ARMORY while it waits) are its seat\'s: promoted, it is seated as the one for its side', () => {
    for (const leaver of [1, 2]) {                                         // a Terrorist's place, then a SEAL's
      const s = setup(SHORT_ROUND, typed);
      for (let id = 1; id <= 16; id++) s.join(id);
      s.room.step();
      const late = s.join(17);
      expect(late.of('welcome')[0]).toMatchObject({ role: 'spectator' });
      s.room.text(17, { type: 'loadout', picks: [], types: { seal: 3, terrorist: 1 } } as unknown as ClientEvent);
      expect(late.of('loadout')).toEqual([]);                                // a spectator's is not answered
      const side = s.room.player(leaver)!.team;
      s.room.leave(leaver);
      expect(late.of('promoted')).toHaveLength(1);
      expect(s.room.player(17)).toMatchObject({ team: side, nextChar: side === 'seal' ? 3 : 1 });
      nextRound(s);
      expect(s.room.player(17)!.char).toBe(side === 'seal' ? 3 : 1);
    }
    // A type the side does not offer seats the default (ARMORY_TYPE_FALLBACK_READING).
    const s = setup({}, typed);
    for (let id = 1; id <= 16; id++) s.join(id);
    const late = s.join(17);
    s.room.text(17, { type: 'loadout', picks: [], types: { terrorist: 3 } } as unknown as ClientEvent);
    s.room.leave(1);
    expect(late.of('promoted')).toHaveLength(1);
    expect(s.room.player(17)).toMatchObject({ team: 'terrorist', nextChar: 0 });
  });

  it('a spectator\'s types arriving after its promotion are its side\'s type, unanswered; its picks kept for the same type', () => {
    // The race: the page sent its ARMORY choice as a spectator, the room promoted it before the message came. The page
    // believes the room holds what it sent (`NetPage.resendPicks` compares with `sentTypes`), so the room takes it.
    const s = setup(SHORT_ROUND, typed);
    for (let id = 1; id <= 16; id++) s.join(id);
    s.room.step();                                                          // the classic round in play
    const late = s.join(17);
    s.room.leave(1);                                                        // a Terrorist's place: 17 seated, a ghost
    expect(s.room.player(17)).toMatchObject({ team: 'terrorist', nextChar: 0, alive: false });
    s.loadout(17, [{ slot: 2, id: 122 }]);                                  // its page's re-send lands first
    expect(late.of('loadout')).toHaveLength(1);
    const p = s.room.player(17)! as unknown as { nextChar: number; char: number; loadout: Loadout; picks: unknown; next: unknown };
    const held = { picks: p.picks, next: p.next };
    s.room.text(17, { type: 'loadout', picks: [], types: { seal: 3, terrorist: 0 } } as unknown as ClientEvent);
    expect(late.of('loadout')).toHaveLength(1);                            // not answered
    expect([p.nextChar, p.picks, p.next]).toEqual([0, held.picks, held.next]);   // the same type: its picks stand
    s.room.text(17, { type: 'loadout', picks: [], types: { seal: 3, terrorist: 1 } } as unknown as ClientEvent);
    expect(late.of('loadout')).toHaveLength(1);
    expect([p.nextChar, p.picks, p.next]).toEqual([1, [], null]);           // a new type: its own kit (the page's list too)
    s.room.text(17, { type: 'loadout', picks: [], types: { terrorist: 3 } } as unknown as ClientEvent);   // not offered
    s.room.text(17, { type: 'loadout', picks: [], types: { seal: 2 } } as unknown as ClientEvent);        // not its side
    expect([p.nextChar, late.of('loadout').length]).toEqual([1, 1]);
    nextRound(s);
    expect([p.char, p.loadout]).toEqual([1, T2_KIT]);
    // Spawned in this round now: the round gate holds for these as for a request (W5.R1), silently.
    s.room.text(17, { type: 'loadout', picks: [], types: { terrorist: 0 } } as unknown as ClientEvent);
    expect([p.nextChar, late.of('loadout').length]).toEqual([1, 1]);
  });

  it('a reconnect of a tab that spawned in this round keeps its type until the round ends (W5.R1, the round gate)', () => {
    // Explicit test clock: reach the interval without respawn's original twenty-minute default (research 348).
    const s = setup({ rules: 'respawn', ...SHORT_ROUND }, typed);
    s.join(1); const first = s.join(2);
    s.room.step();
    expect(s.room.player(2)).toMatchObject({ team: 'seal', char: 0, alive: true });
    (s.room as unknown as { kill(v: unknown, k: null, w: null, how: string): void }).kill(s.room.player(2)!, null, null, 'fall');
    expect(first.of('loadout')).toEqual([]);
    s.room.leave(2);
    const again = s.join(2, PROTOCOL_VERSION, { seal: 1 });                 // dead, back with another hello type
    expect([s.room.player(2)!.char, s.room.player(2)!.nextChar]).toEqual([0, 0]);
    expect(s.room.player(2)!.loadout).toEqual(SEAL_KIT);
    s.loadout(2, [], false, 1);                                             // nor through a request after the seat
    expect(again.of('loadout').at(-1)!.refused).toEqual({ reason: 'round', at: 0 });
    // The round over (its interval), the hello's type is the ARMORY's again.
    const phase = (): string => (s.room as unknown as { state: { phase: string } }).state.phase;
    for (let i = 0; i < 60 * 60 * 10 && phase() !== 'over'; i++) s.room.step();
    expect(phase()).toBe('over');
    s.room.leave(2);
    s.join(2, PROTOCOL_VERSION, { seal: 1 });
    expect(s.room.player(2)!.nextChar).toBe(1);
  });

  it('the welcome and the promotion name the seat\'s own type (`char`): a locked reconnect\'s is the held one (S2 round 3)', () => {
    const s = typedMatch();
    const ghost = s.join(3, PROTOCOL_VERSION, { seal: 2, terrorist: 1 });
    const side = s.room.player(3)!.team;
    expect(ghost.of('welcome')[0]).toMatchObject({ role: 'player', char: side === 'seal' ? 2 : 1 });
    // The reconnect under the round lock: the hello asks for SEAL 2, the room seats SEAL 1 -- and says so.
    const r = setup({ rules: 'respawn' }, typed);
    r.join(1); r.join(2);
    r.room.step();
    (r.room as unknown as { kill(v: unknown, k: null, w: null, how: string): void }).kill(r.room.player(2)!, null, null, 'fall');
    r.room.leave(2);
    const again = r.join(2, PROTOCOL_VERSION, { seal: 1 });
    expect(r.room.player(2)!.nextChar).toBe(0);
    expect(again.of('welcome')[0]).toMatchObject({ char: 0 });
    // A promotion names the type the seat took (the spectator's types, or the default when they came too late).
    const p = setup({}, typed);
    for (let id = 1; id <= 16; id++) p.join(id);
    const late = p.join(17);
    p.room.text(17, { type: 'loadout', picks: [], types: { seal: 3, terrorist: 1 } } as unknown as ClientEvent);
    p.room.leave(2);                                                        // a SEAL's place
    expect(late.of('promoted')[0]).toMatchObject({ team: 'seal', char: 3 });
  });

  it('the classic round-end interval race: a promoted spectator\'s late types are refused by the round, the promotion named the type', () => {
    // Promoted in the interval (a ghost: seated as its hello's default), its types reach the room after the next round
    // began and its body spawned in it: `lateTypes` drops them (the round gate, W5.R1), and a request for the type is
    // refused `round` -- the page learns the room's type from `promoted.char` and that refusal (research 95 §8).
    const s = setup(SHORT_ROUND, typed);
    for (let id = 1; id <= 16; id++) s.join(id);
    s.room.step();
    const late = s.join(17);
    const phase = (): string => (s.room as unknown as { state: { phase: string } }).state.phase;
    for (let i = 0; i < 60 * 60 * 10 && phase() !== 'over'; i++) s.room.step();
    expect(phase()).toBe('over');
    s.room.leave(1);                                                        // a Terrorist's place, in the interval
    expect(late.of('promoted')[0]).toMatchObject({ team: 'terrorist', ghost: true, char: 0 });
    const round = s.room.round;
    for (let i = 0; i < 60 * 60 && s.room.round === round; i++) s.room.step();
    expect([phase(), s.room.player(17)!.alive]).toEqual(['play', true]);
    s.room.text(17, { type: 'loadout', picks: [], types: { seal: 0, terrorist: 1 } } as unknown as ClientEvent);
    expect([s.room.player(17)!.nextChar, late.of('loadout')]).toEqual([0, []]);   // dropped, unanswered
    s.loadout(17, [], false, 1);                                            // the page's type-only request
    expect(late.of('loadout').at(-1)).toMatchObject({ refused: { reason: 'round', at: 0 }, char: 0 });
  });

  /**
   * A hello from a tab: its name ('' for an unnamed page: a new guest name each hello), its address (two windows on one
   * machine share one) and its session token (`session`: the tab's own, S2 round 4; undefined for an older page).
   */
  const helloAt = (s: Setup, id: number, name: string, address: string, types?: unknown, session?: unknown): Client => {
    const c = new Client();
    s.room.hello(id, c, {
      type: 'hello', version: PROTOCOL_VERSION, name, map: 'MP99', ...(types !== undefined ? { types } : {}), ...(session !== undefined ? { session } : {}),
    } as Extract<ClientEvent, { type: 'hello' }>, address);
    return c;
  };
  const killed = (s: Setup, id: number): void =>
    (s.room as unknown as { kill(v: unknown, k: null, w: null, how: string): void }).kill(s.room.player(id)!, null, null, 'fall');
  const LOCAL = '127.0.0.1';
  /** Six seated (the team rule: SEALs 2, 3, 5; Terrorists 1, 4, 6), the round begun; `tabs` seats 2 and 3 itself. */
  const sixUp = (tabs: (s: Setup) => void): Setup => {
    const s = setup({}, typed);
    s.join(1); tabs(s);
    for (let id = 4; id <= 6; id++) s.join(id);
    s.room.step();
    return s;
  };

  it('a reload with no name keeps the round\'s lock: the same token, a new socket, a new guest name (S2 round 4)', () => {
    const s = sixUp((t) => { helloAt(t, 2, '', LOCAL, { seal: 2 }, tok('A')); t.join(3); });
    const before = s.room.lobby.member(2)!.name;
    killed(s, 2);
    s.room.leave(2);                                                        // F5: the page's socket closes
    const again = helloAt(s, 7, '', LOCAL, { seal: 3 }, tok('A'));          // the reloaded page: its type's default choice
    expect(s.room.lobby.member(7)!.name).not.toBe(before);                  // a new guest name: not the record's key
    expect(s.room.player(7)).toMatchObject({ team: 'seal', alive: false, nextChar: 2 });
    expect(again.of('welcome')[0]).toMatchObject({ char: 2 });
    s.loadout(7, [], false, 3);
    expect(again.of('loadout').at(-1)!.refused).toEqual({ reason: 'round', at: 0 });
  });

  it('two tabs from one address, each its own token, keep only their own records', () => {
    const s = sixUp((t) => { helloAt(t, 2, '', LOCAL, { seal: 2 }, tok('A')); helloAt(t, 3, '', LOCAL, { seal: 1 }, tok('B')); });
    expect([s.room.player(2)!.team, s.room.player(3)!.team, s.room.player(2)!.char, s.room.player(3)!.char]).toEqual(['seal', 'seal', 2, 1]);
    s.loadout(3, [{ slot: 2, id: 122 }]);                                   // B's pick for its type (dead: WEAPON EXCHANGE's)
    killed(s, 2); killed(s, 3);
    s.room.leave(2); s.room.leave(3);
    const b = helloAt(s, 8, '', LOCAL, { seal: 3 }, tok('B'));
    expect(s.room.player(8)).toMatchObject({ team: 'seal', nextChar: 1, picks: [{ slot: 2, id: 122 }] });
    expect(b.of('welcome')[0]).toMatchObject({ char: 1 });
    const a = helloAt(s, 7, '', LOCAL, { seal: 3 }, tok('A'));
    expect(s.room.player(7)).toMatchObject({ team: 'seal', nextChar: 2, picks: [] });
    expect(a.of('welcome')[0]).toMatchObject({ char: 2 });
  });

  it('a rename neither takes nor erases another tab\'s record: the record is the token\'s, not the name\'s', () => {
    const s = sixUp((t) => { helloAt(t, 2, 'A', LOCAL, { seal: 2 }, tok('A')); helloAt(t, 3, 'B', LOCAL, { seal: 1 }, tok('B')); });
    killed(s, 2);
    s.room.leave(2);                                                        // A's tab closes: its record waits
    s.room.text(3, { type: 'name', name: 'A' });                            // B takes A's name ...
    expect(s.room.lobby.member(3)!.name).toBe('A');
    killed(s, 3);
    s.room.leave(3);                                                        // ... and leaves under it
    const b = helloAt(s, 8, 'A', LOCAL, { seal: 3 }, tok('B'));             // B back: its own record, not A's
    expect(s.room.player(8)).toMatchObject({ nextChar: 1 });
    expect(b.of('welcome')[0]).toMatchObject({ char: 1 });
    helloAt(s, 7, 'A', LOCAL, { seal: 3 }, tok('A'));                       // A's record stood through it all
    expect(s.room.player(7)).toMatchObject({ nextChar: 2 });
  });

  it('an unclean drop\'s reconnect while the old socket is live takes the seat over: its name, side and type, no "(2)", the old socket closed', () => {
    const s = sixUp((t) => { helloAt(t, 2, 'Craig', LOCAL, { seal: 2 }, tok('A')); t.join(3); });
    const first = (s.room as unknown as { conns: Map<number, Client> }).conns.get(2)!;
    s.loadout(2, [{ slot: 2, id: 122 }]);
    killed(s, 2);
    const seen = s.room.lobby.players().length;
    // The network blinked: the page's retry comes before the heartbeat dropped the dead socket.
    const again = helloAt(s, 7, 'Craig', LOCAL, { seal: 3 }, tok('A'));
    expect(first.closed).toEqual({ code: 4006, reason: 'replaced by a newer connection of this page' });
    expect(first.of('kicked')).toEqual([{ type: 'kicked', reason: 'replaced' }]);
    expect(again.of('welcome')[0]).toMatchObject({ role: 'player', team: 'seal', name: 'Craig', char: 2 });
    expect(s.room.lobby.players().map((m) => m.name).filter((n) => n.startsWith('Craig'))).toEqual(['Craig']);
    expect(s.room.lobby.players()).toHaveLength(seen);                      // one seat, not two
    expect(s.room.player(2)).toBeUndefined();
    expect(s.room.player(7)).toMatchObject({ team: 'seal', nextChar: 2, picks: [{ slot: 2, id: 122 }], alive: false });
    s.loadout(7, [], false, 3);
    expect(again.of('loadout').at(-1)!.refused).toEqual({ reason: 'round', at: 0 });
    // The old socket's close, late (the heartbeat's terminate): nothing of the new seat goes -- nor of a new joiner
    // since handed the old id.
    s.room.leave(2, first);
    expect(s.room.player(7)).toMatchObject({ team: 'seal', nextChar: 2 });
    const reused = helloAt(s, 2, 'Other', '192.0.2.2', undefined, tok('C'));
    s.room.leave(2, first);
    expect(s.room.lobby.member(2)?.name).toBe('Other');
    expect(reused.closed).toBeNull();
  });

  it('a takeover carries the scoreboard row: the same person, its kills, deaths and score kept (research 95 §8)', () => {
    const s = sixUp((t) => { helloAt(t, 2, 'Craig', LOCAL, { seal: 2 }, tok('A')); t.join(3); });
    Object.assign(s.room.player(2)!, { kills: 3, deaths: 1, score: 7, roundScore: 2 });
    helloAt(s, 7, 'Craig', LOCAL, { seal: 2 }, tok('A'));
    expect(s.room.player(7)).toMatchObject({ kills: 3, deaths: 1, score: 7, roundScore: 2 });
    // A new joiner is a new row, and a record kept across a leave is no row (a leave is a leave: research 91 §17).
    s.room.leave(7);
    helloAt(s, 8, 'Craig', LOCAL, { seal: 2 }, tok('A'));
    expect(s.room.player(8)).toMatchObject({ kills: 0, deaths: 0, score: 0 });
  });

  it('a takeover takes the new hello\'s name when it differs and is free, and keeps the seat\'s when another holds it', () => {
    const s = sixUp((t) => { helloAt(t, 2, 'Craig', LOCAL, { seal: 2 }, tok('A')); t.join(3); });
    const seen = s.room.lobby.players().length;
    const renamed = helloAt(s, 7, 'Smith', LOCAL, { seal: 2 }, tok('A'));
    expect(renamed.of('welcome')[0]).toMatchObject({ role: 'player', name: 'Smith' });
    expect(s.room.lobby.member(7)!.name).toBe('Smith');
    expect(s.room.lobby.players()).toHaveLength(seen);
    const kept = helloAt(s, 8, 'P3', LOCAL, { seal: 2 }, tok('A'));        // P3 is another page's
    expect(kept.of('welcome')[0]).toMatchObject({ name: 'Smith' });
    expect(s.room.lobby.member(8)!.name).toBe('Smith');
  });

  it('a takeover whose hello watches where the seat played (or plays where it watched) replaces the connection and joins afresh', () => {
    const s = sixUp((t) => { helloAt(t, 2, 'Craig', LOCAL, { seal: 2 }, tok('A')); t.join(3); });
    const first = (s.room as unknown as { conns: Map<number, Client> }).conns.get(2)!;
    const seen = s.room.lobby.players().length;
    const c = new Client();
    s.room.hello(7, c, { type: 'hello', version: PROTOCOL_VERSION, name: 'Craig', map: 'MP99', watch: true, session: tok('A') }, LOCAL);
    expect(first.closed).toEqual({ code: 4006, reason: 'replaced by a newer connection of this page' });
    expect(first.of('kicked')).toEqual([{ type: 'kicked', reason: 'replaced' }]);
    expect(c.of('welcome')[0]).toMatchObject({ role: 'spectator', team: null });
    expect(s.room.lobby.watching(7)).toBe(true);
    expect(s.room.lobby.players()).toHaveLength(seen - 1);                  // the seat is left, not kept
    expect(s.room.player(7)).toBeUndefined();
    // Back to playing from the same tab: the watcher replaced, a fresh join as a player.
    const d = helloAt(s, 8, 'Craig', LOCAL, { seal: 2 }, tok('A'));
    expect(c.closed).toEqual({ code: 4006, reason: 'replaced by a newer connection of this page' });
    expect(d.of('welcome')[0]).toMatchObject({ role: 'player' });
    expect(s.room.lobby.watching(8)).toBe(false);
    expect(s.room.lobby.players()).toHaveLength(seen);
  });

  it('a hello without a token (an older page) is a new joiner: no record, whatever its address and name', () => {
    const s = sixUp((t) => { helloAt(t, 2, 'A', LOCAL, { seal: 2 }, tok('A')); t.join(3); });
    killed(s, 2);
    s.room.leave(2);
    const c = helloAt(s, 7, 'A', LOCAL, { seal: 3, terrorist: 1 });
    expect(s.room.player(7)).toMatchObject({ team: 'seal', alive: false, nextChar: 3, picks: [] });
    expect(c.of('welcome')[0]).toMatchObject({ ghost: true, char: 3 });
    s.loadout(7, [], false, 1);
    expect(c.of('loadout').at(-1)).toMatchObject({ refused: null, char: 1 });
    // A's record stood through the tokenless seat.
    s.room.leave(7);
    helloAt(s, 8, 'Z', '192.0.2.8', { seal: 0 }, tok('A'));
    expect(s.room.player(8)).toMatchObject({ nextChar: 2 });
  });

  it('a malformed token is ignored: a new joiner, never a record\'s key nor a takeover', () => {
    for (const bad of ['short', 'x'.repeat(21), 'y'.repeat(65), `${'a'.repeat(21)}!`, `${'b'.repeat(21)}=`, 42, null, { t: tok('A') }]) {
      const s = sixUp((t) => { helloAt(t, 2, 'A', LOCAL, { seal: 2 }, bad); t.join(3); });
      const first = (s.room as unknown as { conns: Map<number, Client> }).conns.get(2)!;
      helloAt(s, 7, 'A', LOCAL, { seal: 3 }, bad);                          // the same bad token, the first still live
      expect(first.closed).toBeNull();
      expect(s.room.lobby.member(7)!.name).toBe('A(2)');
      killed(s, 2);
      s.room.leave(2);
      helloAt(s, 8, 'A', LOCAL, { seal: 3 }, bad);
      expect(s.room.player(8)).toMatchObject({ nextChar: 3 });
    }
  });

  it('a record holds only through the reconnect window (KEPT_RECONNECT_READING), and is taken once', () => {
    let now = 0;
    const s = setup({ now: () => now }, typed);
    s.join(1); helloAt(s, 2, 'A', LOCAL, { seal: 2 }, tok('A'));
    for (let id = 3; id <= 6; id++) s.join(id);
    s.room.step();
    killed(s, 2);
    s.room.leave(2);
    now = KEPT_RECONNECT_READING + 1;
    helloAt(s, 7, 'A', LOCAL, { seal: 3 }, tok('A'));
    expect(s.room.player(7)).toMatchObject({ alive: false, nextChar: 3 });
    now = 0;
    s.room.leave(7);
    helloAt(s, 8, 'A', LOCAL, { seal: 1 }, tok('A'));                       // within the window of 7's leave: 7's record
    expect(s.room.player(8)).toMatchObject({ nextChar: 1 });                 // (a ghost never spawned: nothing held)
  });

  it('without the map\'s kits only the default type is taken', () => {
    const s = setup({}, null);
    const t = s.join(1, PROTOCOL_VERSION, { terrorist: 1 });
    s.join(2); s.room.step();
    expect(s.room.player(1)!.char).toBe(0);
    s.loadout(1, [], false, 1);
    expect(t.of('loadout').at(-1)!.refused).toEqual({ reason: 'type', at: 0 });
    s.loadout(1, [], false, 0);
    expect(t.of('loadout').at(-1)!.refused).toBeNull();
  });
});

describe('the ARMORY\'s seat (web sprint 5, the S3 review: W5.R1 live, opened on a first, ghost, waiting or promoted seat)', () => {
  const typed: SimKits = {
    table, map: {
      ...map, kits: {
        seal: [{ type: 'Seal1', character: 'mp99_seal1', loadout: SEAL_KIT }, { type: 'Seal2', character: 'mp99_seal2', loadout: kit(62, 15, 121, 126, 194) }],
        terrorist: [{ type: 'Terrorist1', character: 'mp99_terror1', loadout: TERRORIST_KIT }, { type: 'Terrorist2', character: 'mp99_terror2', loadout: kit(58, 5, 122, 126, 255) }],
      },
    },
  };
  /** A page's hello that opens the ARMORY on its seats (`armory`), its own session token. */
  const hello = (s: Setup, id: number, extra: Record<string, unknown> = {}): Client => {
    const c = new Client();
    s.room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99', session: tok(`armory${id}`), armory: true, ...extra } as Extract<ClientEvent, { type: 'hello' }>, '192.0.2.1');
    return c;
  };
  const ready = (s: Setup, id: number): void => s.room.text(id, { type: 'ready' } as unknown as ClientEvent);

  it('a first seat in a respawn room: the welcome says the ARMORY opens, the spawn waits for it, its choices land live', () => {
    const s = setup({ rules: 'respawn' }, typed);
    const other = s.join(1);
    const c = hello(s, 2);
    expect(c.of('welcome')[0]).toMatchObject({ role: 'player', armory: true });
    expect(s.room.player(2)).toMatchObject({ alive: false });
    expect(c.of('spawn')).toEqual([]);
    s.room.step();
    // Each change as it happens (the type, then a pick): taken, not refused `alive` -- the seat has not spawned.
    s.loadout(2, [], true, 1);
    s.loadout(2, [{ slot: 2, id: 122 }], true, 1);
    expect(c.of('loadout').map((a) => a.refused)).toEqual([null, null]);
    for (let i = 0; i < 60; i++) s.room.step();
    expect(s.room.player(2)!.alive).toBe(false);                            // still in the ARMORY: no spawn
    ready(s, 2);
    expect(s.room.player(2)).toMatchObject({ alive: true, char: 1 });
    expect(c.of('spawn').filter((e) => e.id === 2).at(-1)).toMatchObject({ char: 1, kit: [62, 15, 122, 126, 194] });
    expect(other.of('spawn').filter((e) => e.id === 2)).toHaveLength(1);
    ready(s, 2);                                                            // a second one does nothing
    expect(c.of('spawn').filter((e) => e.id === 2)).toHaveLength(1);
  });

  it('a page that does not open the ARMORY (no `armory` in its hello) is spawned at once, and its welcome says nothing of it', () => {
    const s = setup({ rules: 'respawn' }, typed);
    s.join(1);
    const c = s.join(2);
    expect(c.of('welcome')[0]!.armory).toBeUndefined();
    expect(s.room.player(2)!.alive).toBe(true);
  });

  it('a classic ghost seat and a waiting seat open it; the waiting seat is spawned by the round\'s start with what it chose', () => {
    const s = setup({}, typed);
    const w = hello(s, 1);                                                  // alone: the waiting room
    expect(w.of('welcome')[0]).toMatchObject({ waiting: true, armory: true });
    expect(s.room.player(1)!.alive).toBe(false);
    s.loadout(1, [], true, 1);
    expect(w.of('loadout').at(-1)!.refused).toBeNull();
    s.join(2);
    s.room.step();                                                          // both sides: the round launched
    expect(s.room.player(1)).toMatchObject({ alive: true, char: 1 });       // the round's start spawned it
    const g = hello(s, 3);
    expect(g.of('welcome')[0]).toMatchObject({ ghost: true, armory: true });
    s.loadout(3, [], true, 1);
    expect(g.of('loadout').at(-1)!.refused).toBeNull();
    ready(s, 3);
    expect(s.room.player(3)!.alive).toBe(false);                            // a ghost until the next round
  });

  it('a takeover or a reconnect is no first seat: the ARMORY stays shut and a respawn room spawns it at once', () => {
    const s = setup({ rules: 'respawn' }, typed);
    s.join(1);
    hello(s, 2);
    ready(s, 2);
    expect(s.room.player(2)!.alive).toBe(true);
    const again = hello(s, 7, { session: tok('armory2') });                 // the same tab's newer connection
    expect(again.of('welcome')[0]!.armory).toBeUndefined();
    expect(s.room.player(7)!.alive).toBe(true);
  });

  it('the S3 repair: a takeover or a reconnect never opens it, in a waiting room, a ghost\'s seat or with no record kept', () => {
    // A classic waiting room: the lone player left its ARMORY and walks; its reload (a takeover) is not held.
    const s = setup({}, typed);
    hello(s, 1);
    ready(s, 1);
    expect(s.room.player(1)!.alive).toBe(true);
    const again = hello(s, 9, { session: tok('armory1') });
    expect(again.of('welcome')[0]).toMatchObject({ waiting: true });
    expect(again.of('welcome')[0]!.armory).toBeUndefined();
    expect(s.room.player(9)!.alive).toBe(true);
    // A classic ghost's takeover: a ghost still, the screen not forced open again.
    s.join(2);
    s.room.step();
    const g = hello(s, 3);
    expect(g.of('welcome')[0]).toMatchObject({ ghost: true, armory: true });
    const g2 = hello(s, 10, { session: tok('armory3') });
    expect(g2.of('welcome')[0]).toMatchObject({ ghost: true });
    expect(g2.of('welcome')[0]!.armory).toBeUndefined();
    // A respawn room's reconnect after a leave with the type and picks unchanged (no record of them): spawned at once.
    const r = setup({ rules: 'respawn' }, typed);
    r.join(1);
    hello(r, 2);
    ready(r, 2);
    r.room.leave(2);
    const back = hello(r, 8, { session: tok('armory2') });
    expect(back.of('welcome')[0]!.armory).toBeUndefined();
    expect(r.room.player(8)!.alive).toBe(true);
  });

  it('the S3 repair: a rejoin whose page still has its screen open (`armoryOpen`) keeps the seat held, record or none', () => {
    // A takeover while the ARMORY is open: the welcome says so, the spawn waits, the choices land.
    const s = setup({ rules: 'respawn' }, typed);
    s.join(1);
    hello(s, 2);
    const again = hello(s, 7, { session: tok('armory2'), armoryOpen: true });
    expect(again.of('welcome')[0]).toMatchObject({ armory: true });
    expect(s.room.player(7)!.alive).toBe(false);
    s.loadout(7, [], true, 1);
    expect(again.of('loadout').at(-1)!.refused).toBeNull();
    for (let i = 0; i < 60; i++) s.room.step();
    expect(s.room.player(7)!.alive).toBe(false);
    ready(s, 7);
    expect(s.room.player(7)).toMatchObject({ alive: true, char: 1 });
    // A drop and a reconnect whose record was kept (a type chosen): held too, on the kept type.
    const r = setup({ rules: 'respawn' }, typed);
    r.join(1);
    hello(r, 2);
    r.loadout(2, [], true, 1);
    r.room.leave(2);
    const back = hello(r, 8, { session: tok('armory2'), armoryOpen: true });
    expect(back.of('welcome')[0]).toMatchObject({ armory: true, char: 1 });
    expect(r.room.player(8)!.alive).toBe(false);
    r.loadout(8, [{ slot: 2, id: 122 }], true, 1);
    expect(back.of('loadout').at(-1)!.refused).toBeNull();
    ready(r, 8);
    expect(r.room.player(8)).toMatchObject({ alive: true, char: 1 });
    // A page that says its screen is open but not that it opens the ARMORY (no `armory`) is not held.
    const n = setup({ rules: 'respawn' }, typed);
    n.join(1);
    const c = new Client();
    n.room.hello(5, c, { type: 'hello', version: PROTOCOL_VERSION, name: 'P5', map: 'MP99', session: tok('plain5'), armoryOpen: true } as Extract<ClientEvent, { type: 'hello' }>, '192.0.2.5');
    expect(c.of('welcome')[0]!.armory).toBeUndefined();
    expect(n.room.player(5)!.alive).toBe(true);
  });

  it('the S3 repair: a seat held in its ARMORY is not idled out while it chooses; left alone it is', () => {
    let t = 0;
    const s = setup({ rules: 'respawn', now: () => t }, typed);
    s.join(1);
    hello(s, 2);
    hello(s, 3);
    for (let minute = 1; minute <= 6; minute++) {
      t = minute * 60_000;
      s.loadout(2, [], true, minute % 2);                                  // a choice each minute: activity
      s.room.step();
    }
    expect(s.room.player(2)).toMatchObject({ alive: false });                // still in its ARMORY, still seated
    expect(s.room.player(3)).toBeUndefined();                                 // 6 minutes without a choice: moved out
  });

  it('repair 2: a classic abandon keeps a held seat held (the waiting room\'s ARMORY); its `ready` spawns it once', () => {
    const s = setup({}, typed);
    const clients = new Map([[1, s.join(1)], [2, s.join(2)]]);             // one a side
    s.room.step();                                                          // the round in play
    const g = hello(s, 3);                                                  // a ghost, held in its ARMORY
    expect(g.of('welcome')[0]).toMatchObject({ ghost: true, armory: true });
    const mate = s.room.player(1)!.team === s.room.player(3)!.team ? 1 : 2;
    const one = clients.get(mate)!;
    const before = one.of('spawn').filter((e) => e.id === 3).length;
    s.room.leave(3 - mate);                                                 // the other side's lone player: abandoned
    expect(g.of('abandoned')).toHaveLength(1);
    expect(s.room.player(mate)!.alive).toBe(true);                          // the living stand fresh at a start slot
    expect(s.room.player(3)).toMatchObject({ alive: false, arming: true });  // the held seat stays held, not spawned
    for (let i = 0; i < 60; i++) s.room.step();                             // the waiting room does not spawn it either
    expect(s.room.player(3)!.alive).toBe(false);
    expect(one.of('spawn').filter((e) => e.id === 3)).toHaveLength(before);
    s.loadout(3, [], true, 1);                                              // the waiting room takes its choice
    expect(g.of('loadout').at(-1)!.refused).toBeNull();
    ready(s, 3);
    expect(s.room.player(3)).toMatchObject({ alive: true, char: 1, arming: false });
    expect(one.of('spawn').filter((e) => e.id === 3)).toHaveLength(before + 1);
    ready(s, 3);                                                            // again: nothing
    expect(one.of('spawn').filter((e) => e.id === 3)).toHaveLength(before + 1);
  });

  it('repair 2: a `ready` from a living seat is ignored, whatever its `arming` says (no second spawn)', () => {
    const s = setup({ rules: 'respawn' }, typed);
    const one = s.join(1);
    hello(s, 2);
    ready(s, 2);
    const p = s.room.player(2)! as unknown as { arming: boolean; alive: boolean };
    expect(p.alive).toBe(true);
    p.arming = true;                                                        // a stale hold on a living body
    ready(s, 2);
    expect(one.of('spawn').filter((e) => e.id === 2)).toHaveLength(1);
    expect(p.arming).toBe(false);
  });

  it('the controller\'s ruling (owner mandate, 2026-10-01): a waiting room\'s `ready` rebuilds the living body at once, where it stands', () => {
    // Alone in a classic room: the seat left its ARMORY and walks (the waiting body, SEAL 1 / TERRORIST 1's kit).
    const s = setup({}, typed);
    const c = hello(s, 1);
    ready(s, 1);
    const p = s.room.player(1)!;
    expect(p).toMatchObject({ alive: true, char: 0 });
    const first = c.of('spawn').filter((e) => e.id === 1).length;
    p.sim.walker.state.x += 37; p.sim.walker.state.z -= 21;                 // it walked off its start slot
    const [x, z] = [p.sim.walker.state.x, p.sim.walker.state.z];
    // The Inventory button re-opens it; each choice is taken live for the next spawn, the body untouched meanwhile.
    s.loadout(1, [{ slot: 2, id: 122 }], true, 1);
    expect(c.of('loadout').at(-1)!.refused).toBeNull();
    expect(s.room.player(1)).toMatchObject({ char: 0 });
    // Closing it (`ready`): the body is rebuilt now as the type and kit chosen, at the place it stands, and all told.
    ready(s, 1);
    const q = s.room.player(1)!;
    expect(q).toMatchObject({ alive: true, char: 1 });
    const want = q.team === 'seal' ? [62, 15, 122, 126, 194] : [58, 5, 122, 126, 255];   // the type-2 kit, its pick
    expect([...q.loadout]).toEqual(want);
    expect(q.sim.walker.state.x).toBeCloseTo(x, 3);
    expect(q.sim.walker.state.z).toBeCloseTo(z, 3);
    const spawns = c.of('spawn').filter((e) => e.id === 1);
    expect(spawns).toHaveLength(first + 1);
    expect(spawns.at(-1)).toMatchObject({ char: 1, kit: want });
    expect(spawns.at(-1)!.at[0]).toBeCloseTo(x, 3);
    // Unchanged choices rebuild nothing (no needless respawn on a bare open and close).
    ready(s, 1);
    expect(c.of('spawn').filter((e) => e.id === 1)).toHaveLength(first + 1);
    // In the launch countdown (both sides seated, no round yet) the same; once the round is in play a living player's
    // change is refused and its `ready` rebuilds nothing.
    const cd = setup({ launchCountdownS: 10 }, typed);
    const a = hello(cd, 1);
    ready(cd, 1);
    cd.join(2);
    cd.room.step();
    expect(a.of('countdown').at(-1)).toMatchObject({ seconds: 10 });       // counting down, no round yet
    expect(a.of('roundStart')).toHaveLength(0);
    const before = a.of('spawn').filter((e) => e.id === 1).length;
    cd.loadout(1, [], true, 1);
    expect(a.of('loadout').at(-1)!.refused).toBeNull();
    ready(cd, 1);
    expect(cd.room.player(1)).toMatchObject({ alive: true, char: 1 });
    expect(a.of('spawn').filter((e) => e.id === 1)).toHaveLength(before + 1);
    for (let i = 0; i < TICK_HZ * 11; i++) cd.room.step();                  // the countdown runs out: round 1
    expect(a.of('roundStart')).toHaveLength(1);
    const inRound = a.of('spawn').filter((e) => e.id === 1).length;
    cd.loadout(1, [], true, 0);
    expect(a.of('loadout').at(-1)!.refused).toMatchObject({ reason: 'alive' });
    ready(cd, 1);
    expect(a.of('spawn').filter((e) => e.id === 1)).toHaveLength(inRound);
    expect(cd.room.player(1)).toMatchObject({ char: 1 });
  });

  it('the welcome names the match server (ARMORY_SERVER_NAME_READING: configured, else LOCAL) for the title bar', () => {
    const local = setup({}, typed);
    expect(hello(local, 1).of('welcome')[0]).toMatchObject({ server: ARMORY_SERVER_NAME_READING });
    const named = setup({ serverName: '  US East (Ohio)  ' }, typed);
    expect(hello(named, 1).of('welcome')[0]).toMatchObject({ server: 'US East (Ohio)' });
    expect(serverNameOf('x'.repeat(80))).toHaveLength(SERVER_NAME_MAX);
    expect(serverNameOf('\u0000\u001f ')).toBe(ARMORY_SERVER_NAME_READING);
    expect(serverNameOf(undefined)).toBe(ARMORY_SERVER_NAME_READING);
  });

  it('a promotion opens it: the promoted seat\'s spawn waits in a respawn room', () => {
    const s = setup({ rules: 'respawn', }, typed);
    for (let id = 1; id <= 16; id++) s.join(id);
    const late = hello(s, 17);
    expect(late.of('welcome')[0]).toMatchObject({ role: 'spectator' });
    expect(late.of('welcome')[0]!.armory).toBeUndefined();
    s.room.leave(1);
    expect(late.of('promoted')[0]).toMatchObject({ armory: true });
    expect(s.room.player(17)!.alive).toBe(false);
    ready(s, 17);
    expect(s.room.player(17)!.alive).toBe(true);
  });
});

describe('protocol 7: the room\'s authority over the weapon in the hand (W4.R6)', () => {
  /** The Terrorist (1) at the origin facing the SEAL (2) 100 units east. */
  function duel() {
    const s = match();
    const pt = s.room.player(1)!, ps = s.room.player(2)!;
    pt.sim.walker.place(0, 20, 0); ps.sim.walker.place(100, 20, 0);
    const g = gunner(s, 1);
    for (let i = 0; i < 20; i++) s.room.step();
    g.face([100, 12, 0]);
    return { ...s, g, pt, ps };
  }

  it('a round is the room\'s kit\'s: the shot names the 552 by id whatever slot the page claims, the body carries its id', () => {
    const { seal, g, pt } = duel();
    g.shoot(1); g.run(1);                                                // the page claims the sidearm: the room's hand is the rifle
    expect(seal.of('shot').at(-1)).toMatchObject({ id: 1, weapon: 57 });
    expect(pt.mags[0].rounds()).toBe(29);
    expect(pt.mags[1].rounds()).toBe(pt.records[1].magazine);              // the sidearm untouched
    g.run(2);                                                            // a snapshot goes out every second tick
    const body = decodeSnapshot(seal.frames.at(-1)!).bodies.find((b) => b.id === 1)!;
    expect([body.weapon, body.slot]).toEqual([57, 0]);
  });

  it('a pick waiting for the next round fires nothing now: the 552 until the rebuild, then the AK-47', () => {
    const { seal, t, g, loadout } = duel();
    loadout(1, [{ slot: 0, id: 58 }]);
    expect(t.of('loadout').at(-1)!.refused).toBeNull();
    g.shoot(); g.run(1);
    expect(seal.of('shot').at(-1)!.weapon).toBe(57);
  });

  it('the kill line names the weapon by its DisplayName (research 91 §10: FUN_003d19a0 -> record +8)', () => {
    const { seal, g, ps } = duel();
    for (let k = 0; k < 12 && ps.alive; k++) { g.shoot(); g.run(9); }
    expect(ps.alive).toBe(false);
    expect(seal.of('kill')[0]).toMatchObject({ killer: 1, victim: 2, how: 'weapon', weapon: '552 COMMANDO' });
  });
});
