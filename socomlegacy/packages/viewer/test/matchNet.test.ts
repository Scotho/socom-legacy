import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { FRONT_END_CAPABILITIES, TESTROOM_CAPABILITIES, type MatchCapabilities } from '../src/matchCore';
import { matchNetDeps, PART_DEPS, PART_HOOKS, type MatchNetHooks, type MatchNetParts } from '../src/matchNet';
import { buildGrid, type Grid, type WorldPoly } from '@s2u/scene';
import { type SpectatorPose } from '../src/spectatorView';
import { PlayerCamera } from '../src/playerCamera';
import { STANCE } from '../src/mover';
import type { NetPageDeps } from '../src/netPage';

/**
 * ONE-WIRE (web research 222): the `NetPage` deps both pages' matches build -- written once (`./matchNet`), each page's
 * own additions given beside them, and the capabilities switch deciding which parts' hooks a page may hand the room.
 */

function parts(caps: MatchCapabilities = TESTROOM_CAPABILITIES) {
  const calls: string[] = [];
  const rec = (name: string) => (...a: unknown[]) => { calls.push(`${name}(${a.map((x) => JSON.stringify(x) ?? 'undefined').join(',')})`); };
  const records = [{ id: 1, name: 'M4A1' }, { id: 2, name: 'MK23' }];
  const p: MatchNetParts = {
    caps,
    walk: {} as NetPageDeps['walk'], remote: {} as NetPageDeps['remote'], hud: {} as NetPageDeps['hud'],
    fly: { setPose: rec('setPose') },
    loadouts: {
      picks: () => [], type: (s: string) => (s === 'seal' ? 3 : 4), seated: () => null, setType: () => true, unseated: rec('unseated'),
      roomAnswer: rec('roomAnswer'), setEquipmentLimit: rec('equipmentLimit'),
    },
    firearm: {
      records: () => records as never, roundEffects: rec('roundEffects'), roundImpact: rec('roundImpact'), died: rec('died'),
      spawnKit: rec('spawnKit'), fire: {
        undoReload: () => { rec('undoReload')(); return true; }, restoreReload: (id) => { rec('restoreReload')(id); return true; },
        refundRound: (shot) => { rec('refundRound')(shot); return true; },
      },
    },
    clips: () => null,
    map: () => ({ scenicViews: [{ x: 1 }], arsenal: null } as never),
    side: () => 'terrorist',
    followTeam: rec('followTeam'),
    menuOpen: () => true,
  };
  return { p, calls, records };
}
const throwables = { remoteGrenade: () => {}, ownProjectiles: () => true, staleThrow: () => {}, tagOwnProjectile: () => {}, detonateProjectile: () => {}, whiteOut: () => {} };
/** PF-34 (research 234 s6): the world drops' deps -- the drops on the page, the live kit after a pickup. */
const worldDrops = { drops: { place: () => {}, remove: () => {}, replaceAll: () => {} }, kitChanged: () => {} };
/** Every part-owned dep `/testroom` hands (its switch has every part on): each owed. */
/** The sound part's (MATCH-SOUND: both pages mount it). */
const soundPart = { reloadSound: () => {}, deathVoice: () => {}, hurtVoice: () => {}, ring: () => {}, roundAudio: {} as never, objective: () => null, escorteeVoice: () => {} } satisfies Partial<NetPageDeps>;
/** HX-4a (research 239 s7.1): the hostages' part -- a hostage's state told to the orders' page (`./hostagePage`). */
const hostagesPart = { hostageState: () => {} } satisfies Partial<NetPageDeps>;
/** TAUNTS' (research 301: both pages mount it, `./matchTaunts`). */
/** The Chat menu's two parts: TAUNTS (`./matchTaunts`) and TACTICAL ORDERS and MESSAGES (`./matchChat`). */
const tauntsPart = { taunt: () => {}, communication: () => {} } satisfies Partial<NetPageDeps>;
/** PAR-1 (research 253): WEAPON EXCHANGE's own addition (`PART_HOOKS.exchange`), owed from both pages since wave 4. */
const everyHook = { answered: () => {} } satisfies MatchNetHooks;
/** SVC-20b-page (web sprint 20): the voice client's -- its channel's floor entry, the room's voice frames (`./voice/voiceClient`). */
const voicePart = { voiceFloor: () => {}, voiceFrame: () => {} } satisfies Partial<NetPageDeps>;
/** PAR-2: the seat ARMORY's (`./matchArmory` `netDeps`) -- owed by both pages since the front end's switch turned it on. */
const armoryDeps = { armory: true, armoryOpen: () => false, joined: () => {}, newRound: () => {}, abandoned: () => {} } satisfies Partial<NetPageDeps>;
const everyPart = {
  ...throwables,
  ...soundPart,
  ...tauntsPart,
  ...voicePart,
  ...worldDrops,
  ...hostagesPart,
  armory: true, armoryOpen: () => false, joined: () => {}, newRound: () => {}, abandoned: () => {},
  client: null,                                    // PT-18 (W35.R5): the replay part's; /testroom's own NetClient outside the mode
} satisfies Partial<NetPageDeps>;

describe('matchNetDeps: the deps both pages hand NetPage', () => {
  it('the shared hooks: the live kit, the spectator\'s views, the menus, the firearm\'s, the respawn and the side\'s body', () => {
    const { p, calls, records } = parts();
    const d = matchNetDeps(p, { ...everyHook }, { ...everyPart });
    expect(d.weapons()).toBe(records);
    expect(d.scenicViews?.()).toEqual([{ x: 1 }]);
    expect(d.menuOpen?.()).toBe(true);
    expect(d.types?.()).toEqual({ seal: 3, terrorist: 4 });
    d.equipmentLimit?.(2);
    d.spectate(null);
    d.spectate({ x: 0, y: 0, z: 0, yaw: 1, pitch: 2 });
    d.undoReload?.();
    d.died?.();
    d.respawned([5, 6], 2);
    d.teamChanged?.('seal');
    d.loadoutAnswer?.([1], null, null, 3);
    expect(calls).toEqual([
      'equipmentLimit(2)', 'setPose({"x":0,"y":0,"z":0,"yaw":1,"pitch":2})', 'undoReload()', 'died()', 'spawnKit("terrorist",[5,6],2)', 'followTeam()',
      'followTeam("seal")', 'roomAnswer("terrorist",[1],null,null,3)',
    ]);
    expect(d.roundEffects).toBe(p.firearm.roundEffects);
    expect(d.roundImpact).toBe(p.firearm.roundImpact);
  });
  it("j5t3o2iU: the page's own body hurt and alive runs the firearm's hurt rumble (FUN_00597b00); a firearm without one, nothing", () => {
    const { p, calls } = parts();
    const d = matchNetDeps({ ...p, firearm: { ...p.firearm, hurt: () => { calls.push('hurt()'); } } }, { ...everyHook }, { ...everyPart });
    d.ownHurt?.();
    expect(calls).toEqual(['hurt()']);
    expect(() => matchNetDeps(p, { ...everyHook }, { ...everyPart }).ownHurt?.()).not.toThrow();
  });
  it("MAP-10b: a shot's item by id is the kit table's firearm, else its emplaced weapon (a turret's round: PKM TURRET 205), else none", () => {
    const { p } = parts();
    const kit = { id: 1, name: 'M4A1' }, pkm = { id: 205, name: 'PKM TURRET' };
    p.map = () => ({ scenicViews: [], arsenal: { table: { records: new Map([[1, kit]]), turretRecords: new Map([[205, pkm]]) } } } as never);
    const d = matchNetDeps(p, { ...everyHook }, { ...everyPart });
    expect([d.recordOf?.(1), d.recordOf?.(205), d.recordOf?.(207)]).toEqual([kit, pkm, null]);
  });
  it("SPECTATOR-VIEW review B1: the scenic pitch's sign is the camera's INVERT PITCH (`LookOptions.invertPitch`, DAT_003df198), read each time; a stand-in camera with no look options, 1", () => {
    const { p } = parts();
    let invertPitch = false;
    const d = matchNetDeps({ ...p, fly: { ...p.fly, lookOptions: () => ({ invertPitch }) as never } }, { ...everyHook }, { ...everyPart });
    expect(d.spectatePitchSign?.()).toBe(1);
    invertPitch = true;
    expect(d.spectatePitchSign?.()).toBe(-1);
    expect(matchNetDeps(p, { ...everyHook }, { ...everyPart }).spectatePitchSign?.()).toBe(1);
  });
  it('LOW-2 rounds 2-3 (research 223 s6): a stale round given back by its shot, a stale reload restored by its id -- one place for both pages', () => {
    const { p, calls } = parts();
    const d = matchNetDeps(p, { ...everyHook }, { ...everyPart });
    d.staleRound?.(11);
    d.staleRound?.(12);
    d.staleReload?.(7);
    expect(calls).toEqual(['refundRound(11)', 'refundRound(12)', 'restoreReload(7)']);
    expect(d.staleThrow).toBe(throwables.staleThrow);                       // the throwables' own (/testroom: the grenade's)
  });

  it('a page\'s own additions ride on them: after the death, after the respawn, the room\'s answer shown', () => {
    const { p, calls } = parts();
    const shown: unknown[] = [];
    const d = matchNetDeps(p, {
      died: () => calls.push('cancel'), respawned: () => calls.push('refill'), answered: (l) => shown.push(l),
    }, { ...everyPart });
    d.died?.();
    d.respawned(null, null);
    d.loadoutAnswer?.([1, 2, 3, 4, 5], null, null);
    expect(calls.slice(0, 4)).toEqual(['died()', 'cancel', 'spawnKit("terrorist",null,null)', 'followTeam()']);
    expect(calls[4]).toBe('refill');
    expect(shown).toHaveLength(1);
  });
  it('the page\'s other deps are its own; one that shadows a shared hook is refused (each hook lands once)', () => {
    const { p } = parts();
    const reload = vi.fn();
    expect(matchNetDeps(p, { ...everyHook }, { ...everyPart, reloadSound: reload }).reloadSound).toBe(reload);
    expect(() => matchNetDeps(p, { ...everyHook }, { ...everyPart, died: () => {} })).toThrow(/died/);
  });
});

describe('the capabilities decide the parts\' hooks (the front end\'s asymmetries, pinned)', () => {
  it('each part\'s deps listed once (a new hook of a part is one line there: PF-36\'s throwables, PF-34\'s world drops)', () => {
    expect(PART_DEPS.throwables).toEqual(expect.arrayContaining(['remoteGrenade', 'ownProjectiles', 'staleThrow']));
    expect(PART_DEPS.worldDrops).toEqual(expect.arrayContaining(['drops', 'kitChanged']));
    const all = Object.values(PART_DEPS).flat();
    expect(new Set(all).size).toBe(all.length);                                         // no dep owned twice
  });
  it('/testroom: the throwables\' hooks are owed and handed on', () => {
    const { p } = parts();
    const d = matchNetDeps(p, { ...everyHook }, { ...everyPart });
    expect(d.remoteGrenade).toBe(throwables.remoteGrenade);
    expect(d.ownProjectiles).toBe(throwables.ownProjectiles);
    expect(() => matchNetDeps(p, { ...everyHook }, {})).toThrow(/remoteGrenade/);
  });
  it('a part on owes every one of its deps: each left out is refused (the review: not only the required remoteGrenade)', () => {
    const { p } = parts();
    for (const keys of Object.values(PART_DEPS)) {
      for (const k of keys) {
        const rest: Partial<NetPageDeps> = { ...everyPart };
        delete rest[k];
        expect(() => matchNetDeps(p, { ...everyHook }, rest), k).toThrow(new RegExp(`${k} is owed`));
      }
    }
  });
  it('the ARMORY owns its glue too: the round start\'s and the abandon\'s hooks (note 222 §4, 12)', () => {
    expect(PART_DEPS.armory).toEqual(expect.arrayContaining(['newRound', 'abandoned']));
    expect(PART_DEPS.sound).toEqual(expect.arrayContaining(['roundAudio']));
  });
  it('the front end: the throwables mounted (MATCH-THROW) -- each of their hooks owed, and handed on', () => {
    const { p } = parts(FRONT_END_CAPABILITIES);
    for (const k of PART_DEPS.throwables) {
      const rest: Partial<NetPageDeps> = { ...soundPart, ...throwables, ...tauntsPart, ...voicePart, ...hostagesPart, ...worldDrops, ...armoryDeps };
      delete rest[k];
      expect(() => matchNetDeps(p, { ...everyHook }, rest), k).toThrow(new RegExp(`${k} is owed: the throwables`));
    }
    const d = matchNetDeps(p, { ...everyHook }, { ...soundPart, ...throwables, ...tauntsPart, ...voicePart, ...hostagesPart, ...worldDrops, ...armoryDeps });
    expect(d.remoteGrenade).toBe(throwables.remoteGrenade);
    expect(d.ownProjectiles).toBe(throwables.ownProjectiles);
    expect(d.staleThrow).toBe(throwables.staleThrow);
  });
  it("sprint 30 wave 4: PF-36's tagOwnProjectile and detonateProjectile are the throwables' (owed by both pages since MATCH-THROW), PF-34's drops and kitChanged the world drops' -- owed by /testroom and, since PAR-4, by the front end", () => {
    expect(PART_DEPS.throwables).toEqual(['remoteGrenade', 'ownProjectiles', 'staleThrow', 'tagOwnProjectile', 'detonateProjectile', 'whiteOut']);   // P2: the room's white-out
    expect(PART_DEPS.worldDrops).toEqual(['drops', 'kitChanged']);
    for (const caps of [TESTROOM_CAPABILITIES, FRONT_END_CAPABILITIES]) {
      const d = matchNetDeps(parts(caps).p, { ...everyHook }, caps === TESTROOM_CAPABILITIES ? { ...everyPart } : { ...soundPart, ...throwables, ...tauntsPart, ...voicePart, ...hostagesPart, ...worldDrops, ...armoryDeps });
      expect(d.tagOwnProjectile).toBe(throwables.tagOwnProjectile);
      expect(d.detonateProjectile).toBe(throwables.detonateProjectile);
    }
    const front = parts(FRONT_END_CAPABILITIES).p;
    for (const k of PART_DEPS.worldDrops) {
      const rest: Partial<NetPageDeps> = { ...soundPart, ...throwables, ...tauntsPart, ...voicePart, ...hostagesPart, ...worldDrops, ...armoryDeps };
      delete rest[k];
      expect(() => matchNetDeps(front, { ...everyHook }, rest), k).toThrow(new RegExp(`${k} is owed: the worldDrops`));
    }
    expect(matchNetDeps(front, { ...everyHook }, { ...soundPart, ...throwables, ...tauntsPart, ...voicePart, ...hostagesPart, ...worldDrops, ...armoryDeps }).kitChanged).toBe(worldDrops.kitChanged);
  });
  // ACT-5 (ACT.R5; research 250 s6): HX.R8's "sprint 32+ row" -- the front end's switch has the hostages on, so its
  // `hostageState` is owed as /testroom's is (the lobby cannot launch Desert Glory yet: ACT.R6).
  it("the hostages part: hostageState is owed from both pages since ACT-5 (the front end's switch on); escorteeVoice is the sound part's", () => {
    expect(PART_DEPS.hostages).toEqual(['hostageState']);
    expect(PART_DEPS.voice).toEqual(['voiceFloor', 'voiceFrame']);   // SVC-20b-page: the voice client's, owed from both pages
    expect(PART_DEPS.sound).toEqual(['reloadSound', 'deathVoice', 'hurtVoice', 'ring', 'roundAudio', 'objective', 'escorteeVoice']);
    const testroom = parts().p, front = parts(FRONT_END_CAPABILITIES).p;
    for (const [p, rest] of [[testroom, everyPart], [front, { ...soundPart, ...throwables, ...tauntsPart, ...voicePart, ...hostagesPart, ...worldDrops, ...armoryDeps }]] as const) {
      expect(matchNetDeps(p, { ...everyHook }, { ...rest }).hostageState).toBe(hostagesPart.hostageState);
      const noState: Partial<NetPageDeps> = { ...rest };
      delete noState.hostageState;
      expect(() => matchNetDeps(p, { ...everyHook }, noState)).toThrow(/hostageState is owed: the hostages is mounted/);
    }
    for (const [p, rest] of [[testroom, everyPart], [front, { ...soundPart, ...throwables, ...tauntsPart, ...voicePart, ...hostagesPart, ...worldDrops, ...armoryDeps }]] as const) {
      expect(matchNetDeps(p, { ...everyHook }, { ...rest }).escorteeVoice).toBe(soundPart.escorteeVoice);   // the YES: both pages, from the sound part
      const noYes: Partial<NetPageDeps> = { ...rest };
      delete noYes.escorteeVoice;
      expect(() => matchNetDeps(p, { ...everyHook }, noYes)).toThrow(/escorteeVoice is owed: the sound is mounted/);
    }
  });
  it("PAR-1 (research 253): WEAPON EXCHANGE's answered under PART_HOOKS.exchange -- owed from both pages (the front end's switch on since wave 4), refused from a page with the part off", () => {
    expect(PART_HOOKS.exchange).toEqual(['answered']);
    for (const [p, rest] of [[parts().p, everyPart], [parts(FRONT_END_CAPABILITIES).p, { ...soundPart, ...throwables, ...tauntsPart, ...voicePart, ...hostagesPart, ...worldDrops, ...armoryDeps }]] as const) {
      expect(() => matchNetDeps(p, {}, { ...rest })).toThrow(/answered is owed: the exchange is mounted/);
      const shown: unknown[] = [];
      matchNetDeps(p, { answered: (l) => { shown.push(l); } }, { ...rest }).loadoutAnswer?.([1, 2, 3, 4, 5], null, null);
      expect(shown).toHaveLength(1);
    }
    const off = { ...parts().p, caps: { ...TESTROOM_CAPABILITIES, exchange: false } };
    expect(() => matchNetDeps(off, { ...everyHook }, { ...everyPart })).toThrow(/answered is the exchange's, which this page does not mount/);
  });
  it('PAR-2: the front end mounts the seat ARMORY -- each of its deps owed, and handed on', () => {
    const { p } = parts(FRONT_END_CAPABILITIES);
    const front = { ...soundPart, ...throwables, ...tauntsPart, ...voicePart, ...hostagesPart, ...worldDrops };   // less the ARMORY's
    for (const k of PART_DEPS.armory) {
      const rest: Partial<NetPageDeps> = { ...front, ...armoryDeps };
      delete rest[k];
      expect(() => matchNetDeps(p, { ...everyHook }, rest), k).toThrow(new RegExp(`${k} is owed: the armory is mounted`));
    }
    expect(matchNetDeps(p, { ...everyHook }, { ...front, ...armoryDeps, game: { id: 1 } as never }).game).toEqual({ id: 1 });
    const off = { ...p, caps: { ...FRONT_END_CAPABILITIES, armory: false } };
    expect(() => matchNetDeps(off, { ...everyHook }, { ...front, ...armoryDeps })).toThrow(/armory is the armory's, which this page does not mount/);
  });
  it('the review of MATCH-THROW: a page with the ARMORY off gets the parts\' round clear as newRound and abandoned; with it on, the clear first, then the ARMORY\'s own (PAR-2)', () => {
    const cleared: string[] = [];
    const front = { ...soundPart, ...throwables, ...tauntsPart, ...voicePart, ...hostagesPart, ...worldDrops };   // less the ARMORY's
    const offP = { ...parts(FRONT_END_CAPABILITIES).p, caps: { ...FRONT_END_CAPABILITIES, armory: false } };
    const off = matchNetDeps({ ...offP, roundClear: () => { cleared.push('clear'); } }, { ...everyHook }, front);
    off.newRound?.();
    off.abandoned?.();
    expect(cleared).toEqual(['clear', 'clear']);
    // The front end since PAR-2: its parts' clear, then the ARMORY's round ends (`./matchArmory`: drop and close; send).
    cleared.length = 0;
    const on = matchNetDeps({ ...parts(FRONT_END_CAPABILITIES).p, roundClear: () => { cleared.push('clear'); } }, { ...everyHook }, {
      ...front, ...armoryDeps, newRound: () => { cleared.push('armory newRound'); }, abandoned: () => { cleared.push('armory abandoned'); },
    });
    on.newRound?.();
    on.abandoned?.();
    expect(cleared).toEqual(['clear', 'armory newRound', 'clear', 'armory abandoned']);
    // /testroom hands no clear: its ARMORY's glue carries it (`clearDecals`, `clearAir`).
    const glue = { newRound: vi.fn(), abandoned: vi.fn() };
    const testroom = matchNetDeps(parts().p, { ...everyHook }, { ...everyPart, ...glue });
    testroom.newRound?.();
    expect(glue.newRound).toHaveBeenCalledTimes(1);
  });
  it('MATCH-SOUND: the front end mounts the sound -- each of its hooks owed, and handed on', () => {
    const { p } = parts(FRONT_END_CAPABILITIES);
    for (const k of PART_DEPS.sound) {
      const rest: Partial<NetPageDeps> = { ...soundPart, ...throwables, ...tauntsPart, ...voicePart, ...hostagesPart, ...worldDrops, ...armoryDeps };
      delete rest[k];
      expect(() => matchNetDeps(p, { ...everyHook }, rest), k).toThrow(new RegExp(`${k} is owed`));
    }
    expect(matchNetDeps(p, { ...everyHook }, { ...soundPart, ...throwables, ...tauntsPart, ...voicePart, ...hostagesPart, ...worldDrops, ...armoryDeps }).objective).toBe(soundPart.objective);
  });
});

describe('the typecheck: a page\'s switch decides its owed and refused deps', () => {
  it('a missing owed dep and a refused one fail the typecheck on the pages\' own switches (the lines below are compiled, not run)', () => {
    const { p } = parts();
    const typed = <C extends MatchCapabilities>(caps: C) => ({ ...p, caps });
    if (Math.random() > 2) {
      // @ts-expect-error -- /testroom's switch: ownProjectiles (and the rest) owed
      matchNetDeps(typed(TESTROOM_CAPABILITIES), { ...everyHook }, { remoteGrenade: () => {} });
      // @ts-expect-error -- the front end's switch (MATCH-THROW): the throwables owed -- one alone is not enough
      matchNetDeps(typed(FRONT_END_CAPABILITIES), { ...everyHook }, { ...soundPart, ...hostagesPart, remoteGrenade: () => {} });
      // @ts-expect-error -- the front end's switch (MATCH-THROW): PF-28's ownProjectiles and LOW-2's staleThrow owed with the rest
      matchNetDeps(typed(FRONT_END_CAPABILITIES), { ...everyHook }, { ...soundPart, ...hostagesPart, remoteGrenade: () => {}, tagOwnProjectile: () => {}, detonateProjectile: () => {} });
      // @ts-expect-error -- the front end's switch (MATCH-THROW): PF-36's charge hooks owed with the throwables
      matchNetDeps(typed(FRONT_END_CAPABILITIES), { ...everyHook }, { ...soundPart, ...hostagesPart, remoteGrenade: () => {}, ownProjectiles: () => false, staleThrow: () => {} });
      // @ts-expect-error -- the front end's switch (PAR-4): PF-34's drops owed with kitChanged
      matchNetDeps(typed(FRONT_END_CAPABILITIES), { ...everyHook }, { ...soundPart, ...throwables, ...tauntsPart, ...voicePart, ...hostagesPart, kitChanged: () => {} });
      // @ts-expect-error -- the front end's switch (PAR-4): PF-34's kitChanged owed with the drops
      matchNetDeps(typed(FRONT_END_CAPABILITIES), { ...everyHook }, { ...soundPart, ...throwables, ...tauntsPart, ...voicePart, ...hostagesPart, drops: worldDrops.drops });
      // @ts-expect-error -- /testroom's switch: PF-34's drops and kitChanged owed
      matchNetDeps(typed(TESTROOM_CAPABILITIES), { ...everyHook }, { ...throwables, reloadSound: everyPart.reloadSound, deathVoice: everyPart.deathVoice, hurtVoice: everyPart.hurtVoice, ring: everyPart.ring, roundAudio: everyPart.roundAudio, objective: everyPart.objective, armory: true, armoryOpen: everyPart.armoryOpen, joined: everyPart.joined, newRound: everyPart.newRound, abandoned: everyPart.abandoned });
      // @ts-expect-error -- the front end's switch: HX-4a's hostageState owed since ACT-5 (the hostages part on, ACT.R5)
      matchNetDeps(typed(FRONT_END_CAPABILITIES), { ...everyHook }, { ...soundPart, ...throwables });
      // @ts-expect-error -- /testroom's switch: HX-4a's hostageState owed (the hostages part)
      matchNetDeps(typed(TESTROOM_CAPABILITIES), { ...everyHook }, { ...throwables, ...soundPart, ...worldDrops, armory: true, armoryOpen: everyPart.armoryOpen, joined: everyPart.joined, newRound: everyPart.newRound, abandoned: everyPart.abandoned });
      // @ts-expect-error -- the front end's switch: HX-4a's escorteeVoice owed (the sound part's)
      matchNetDeps(typed(FRONT_END_CAPABILITIES), { ...everyHook }, { ...throwables, ...hostagesPart, reloadSound: everyPart.reloadSound, deathVoice: everyPart.deathVoice, hurtVoice: everyPart.hurtVoice, ring: everyPart.ring, roundAudio: everyPart.roundAudio, objective: everyPart.objective });
      // @ts-expect-error -- /testroom's switch (PAR-1): WEAPON EXCHANGE's answered owed
      matchNetDeps(typed(TESTROOM_CAPABILITIES), {}, { ...everyPart });
      matchNetDeps(typed(TESTROOM_CAPABILITIES), { ...everyHook }, { ...everyPart });
      // @ts-expect-error -- the front end's switch (PAR-1, wave 4): WEAPON EXCHANGE's answered owed
      matchNetDeps(typed(FRONT_END_CAPABILITIES), {}, { ...soundPart, ...throwables, ...tauntsPart, ...voicePart, ...hostagesPart, ...worldDrops, ...armoryDeps });
      // @ts-expect-error -- a switch with WEAPON EXCHANGE off (PAR-1, research 253 s3.5): its answered refused (PART_HOOKS' refused half)
      matchNetDeps(typed(Object.freeze({ ...TESTROOM_CAPABILITIES, exchange: false as const })), { ...everyHook }, { ...everyPart });
      // @ts-expect-error -- the front end's switch: TAUNTS' hook owed (research 301)
      matchNetDeps(typed(FRONT_END_CAPABILITIES), { ...everyHook }, { ...soundPart, ...throwables });
      // @ts-expect-error -- the front end's switch: the sound's hooks owed (MATCH-SOUND)
      matchNetDeps(typed(FRONT_END_CAPABILITIES), { ...everyHook }, { ...throwables, ...hostagesPart });
      // @ts-expect-error -- the front end's switch: the throwables' hooks owed (MATCH-THROW)
      matchNetDeps(typed(FRONT_END_CAPABILITIES), { ...everyHook }, { ...soundPart, ...hostagesPart });
      // @ts-expect-error -- the front end's switch (PAR-2): the seat ARMORY's deps owed
      matchNetDeps(typed(FRONT_END_CAPABILITIES), { ...everyHook }, { ...soundPart, ...throwables, ...tauntsPart, ...voicePart, ...hostagesPart, ...worldDrops });
      matchNetDeps(typed(TESTROOM_CAPABILITIES), { ...everyHook }, { ...everyPart });
      matchNetDeps(typed(FRONT_END_CAPABILITIES), { ...everyHook }, { ...soundPart, ...throwables, ...tauntsPart, ...voicePart, ...hostagesPart, ...worldDrops, ...armoryDeps });
    }
    expect(true).toBe(true);
  });
});

describe('one deps builder: both pages build NetPage\'s deps with it', () => {
  const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');
  it('main.ts and matchMount.ts call matchNetDeps; neither writes the shared hooks itself', () => {
    for (const f of ['main.ts', 'matchMount.ts']) {
      expect(src(f), f).toMatch(/matchNetDeps\(/);
      for (const hook of ['scenicViews', 'spectate', 'undoReload', 'teamChanged', 'loadoutAnswer', 'weapons', 'recordOf']) {
        expect(src(f), `${f}: ${hook}`).not.toMatch(new RegExp(`\\b${hook}: \\(`));
      }
    }
  });
  it('each page on its switch, each handing the throwables\' hooks from the one part (./matchThrow, MATCH-THROW): no page writes them', () => {
    expect(src('main.ts')).toMatch(/caps: TESTROOM_CAPABILITIES,/);
    expect(src('matchMount.ts')).toMatch(/caps: FRONT_END_CAPABILITIES,/);
    for (const f of ['main.ts', 'matchMount.ts']) {
      expect(src(f), f).toMatch(/\.\.\.throws\.netDeps\(\),/);
      expect(src(f), f).not.toMatch(/remoteGrenade: \(|ownProjectiles: \(|staleThrow: \(/);
    }
    // LATER 503: a rocket's shot to the launcher first, the throwables' slot to the pouch. P4: a carrier's round's shot
    // to the firearm (`Fire.refundRound`), by the round's class.
    expect(src('matchThrow.ts')).toMatch(/staleThrow: \(kind, slot, shot\) => \{\s+if \(shot !== undefined\) \{\s+const id = loadouts\.tables\(\)\?\.arsenal\.byName\.get\(kind\)\?\.id;\s+if \(id !== undefined && itemClass\(id\) === 'launcherRound'\) firearm\(\)\.fire\.refundRound\(shot\);\s+else rocket\.refund\(shot\);\s+return;\s+\}\s+slot === undefined \? grenade\.giveBack\(kind\) : grenade\.giveBack\(kind, slot\);\s+\},/);
  });
  it("sprint 30 wave 4: PF-36's two charge hooks from the throwables part (both pages); PF-34's drops and kit from both pages since PAR-4 (the front end's switch has the world drops on)", () => {
    expect(src('matchThrow.ts')).toMatch(/tagOwnProjectile: \(kind, from, pid\) => grenade\.tagOwn\(kind, from, pid\),/);
    expect(src('matchThrow.ts')).toMatch(/detonateProjectile: \(pid\) => grenade\.detonateRemote\(pid\),/);
    for (const f of ['main.ts', 'matchMount.ts']) {
      expect(src(f), f).toMatch(/^\s+drops,\s/m);
      expect(src(f), f).toMatch(/kitChanged: \(l, s, r, f, k\) => \{ firearm\.takeKit\(l, s, r, f, k\); \},/);   // OT.R59: a resume's pouch (`k`) too
    }
    expect(src('matchMount.ts')).not.toMatch(/tagOwnProjectile|detonateProjectile/);
  });
  it("ACT-5: HX-4a's hostageState from both pages, each after the sound part's hooks (the front end's switch on since ACT-5); escorteeVoice from the sound part (both pages)", () => {
    for (const f of ['main.ts', 'matchMount.ts']) {
      expect(src(f), f).toMatch(/\.\.\.sound\.netDeps\(\),[^\n]*\n\s+hostageState: \(ev\) => hostages\.state\(ev\),/);
    }
    expect(src('matchSound.ts')).toMatch(/escorteeVoice: \(_id, cue, at\) => \{ if \(cue === 'yes' && at && !screens\(\)\) audio\.play\(HOSTAGE_YES_CUE_READING\.sound, at, 'voice'\); \},/);
    for (const f of ['main.ts', 'matchMount.ts']) expect(src(f), f).not.toMatch(/escorteeVoice: \(/);
  });
});


describe('WALL-CAM: both pages share the spectator obstruction rig', () => {
  const wall: WorldPoly = { modelName: 'worldmodel', path: 'wall', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-200, 0, 0, 200, 0, 0, 200, 80, 0, -200, 80, 0]) };
  const grid = (): Grid => buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 8, cellsZ: 8, originX: -400, originZ: -400 }, [], [], [wall], [{ modelName: 'worldmodel', path: 'wall', first: 0, count: 1 }]);
  it.each([TESTROOM_CAPABILITIES, FRONT_END_CAPABILITIES])('uses live hull, stance, pitch and peek, resetting on target and map changes', (caps) => {
    const { p } = parts(caps); let hull = grid(); let pose: SpectatorPose | null = null;
    const map = p.map(); p.map = () => map;
    p.walk = { gridOfGround: () => hull } as never;
    p.fly = { setPose: (v: SpectatorPose) => { pose = v; }, aspect: () => 16 / 9 } as never;
    const rest = { ...everyPart } as Partial<NetPageDeps>; if (!caps.replay) delete rest.client;
    const d = matchNetDeps(p, { ...everyHook }, rest as never);
    const b = { id: 1, feet: [0, 0, -3.5], yaw: 0, flags: 64, pitch: -9, stance: 1, peek: 0 };
    const follow = (d as unknown as { spectateFollow: (body: typeof b, dt: number) => void }).spectateFollow;
    expect(follow).toBeTypeOf('function'); follow(b, 1 / 60);
    expect(pose!.z).toBeLessThan(0);
    const expected = new PlayerCamera(hull); expected.nearAspect = 16 / 9;
    expected.tick(b.feet, b.yaw, b.pitch, STANCE.crouch.rootY, 1 / 60);
    expect(pose!.y).toBeCloseTo(expected.view(1).eye[1], 8);
    const moved = { ...b, feet: [0, 0, 100] };
    follow(moved, 1 / 60); expected.tick(moved.feet, moved.yaw, moved.pitch, STANCE.crouch.rootY, 1 / 60);
    expect(pose!.z).toBeCloseTo(expected.view(1).eye[2], 8); // Same id keeps the obstruction hold.
    const open = { ...b, id: 2, feet: [0, 0, 100], pitch: -45, stance: 2, peek: 1 };
    follow(open, 1 / 60);
    const fresh = new PlayerCamera(hull); fresh.nearAspect = 16 / 9; fresh.peek = 1;
    fresh.tick(open.feet, open.yaw, open.pitch, STANCE.prone.rootY, 1 / 60);
    expect(pose!.z).toBeCloseTo(fresh.view(1).eye[2], 8);
    hull = grid(); follow(open, 1 / 60);
    expect(pose!.z).toBeCloseTo(fresh.view(1).eye[2], 8); // Same id on a new grid starts a new rig.
    p.remote = { cameraRoot: () => 15 } as never;
    follow(open, 1 / 60); fresh.tick(open.feet, open.yaw, open.pitch, 15, 1 / 60, true);
    expect(pose!.y).toBeCloseTo(fresh.view(1).eye[1], 8);
    d.spectate(null); follow(open, 1 / 60);
    const reset = new PlayerCamera(hull); reset.peek = 1; reset.nearAspect = 16 / 9;
    reset.tick(open.feet, open.yaw, open.pitch, 15, 1 / 60, true);
    expect(pose!.z).toBeCloseTo(reset.view(1).eye[2], 8);
  });
});
