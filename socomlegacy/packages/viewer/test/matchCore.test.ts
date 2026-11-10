import { describe, expect, it } from 'vitest';
import { Box3, Group, Scene, Vector3 } from 'three';
import { BAKED_LOADOUT } from '../src/loadout';
import { noInput } from '../src/gamepad';
import { ELF_DEFAULT_FOGCOL, fogForExtent, type FogSettings } from '../src/fog';
import { DEFAULT_LIGHTING } from '../src/lighting';
import type { LoadedMap } from '../src/loadMap';
import type { WorldView } from '../src/world';
import {
  feedCamera, FRONT_END_CAPABILITIES, heldRefOf, liftFog, mapFog, matchSide, sideLoadoutOf, standOf, TESTROOM_CAPABILITIES,
  type MatchCapabilities,
} from '../src/matchCore';

/**
 * ONE-WIRE (web research 222): the parts both pages' matches share -- `/testroom`'s (`./main`) and the front end's
 * (`./matchMount`) -- each written once in `./matchCore`, where each page used to carry its own copy.
 */

const map = (extra: Partial<LoadedMap> = {}): LoadedMap => ({ name: 'nowhere', camera: null, weapons: {}, arsenal: null, ...extra } as unknown as LoadedMap);
const viewWith = (held: Record<string, Group>, box = new Box3(new Vector3(-10, 0, -20), new Vector3(10, 4, 20))): WorldView =>
  ({ held: (m: string) => held[m] ?? null, box } as unknown as WorldView);

describe('the match capabilities: one switch for what each page mounts', () => {
  it('/testroom mounts every part', () => {
    for (const [name, on] of Object.entries(TESTROOM_CAPABILITIES)) expect(on, name).toBe(true);
  });
  it('the front end mounts the firearm, the sound (MATCH-SOUND), the throwables, the launcher and the R2 inventory (MATCH-THROW), the doors, the action part and the traversal (ACT-1), the world drops (PAR-4), the seat ARMORY (PAR-2), the touch layer (PAR-5): no tactical map ... (pinned: a change here is deliberate)', () => {
    const pinned: MatchCapabilities = {
      voice: true,  // SVC-20b-page (web sprint 20, constraint 1): the voice client on both pages (research 226 §3)
      firearm: true, throwables: true, launcher: true, inventory: true,
      armory: true,                                       // PAR-2 (OT.R43): the seat ARMORY (`./matchArmory`)
      worldDrops: true,                                   // PAR-4 (research 234 s5-s6; H120): the world drops and the Cross pickup (`./drops`)
      exchange: true,                                     // PAR-1 (research 253): WEAPON EXCHANGE and the dead's prompt (`./matchExchange`)
      doors: true, actions: true, traversal: true,       // ACT-1 (ruling ACT.R1): three flags, one mount -- the part picks among the pages
      sound: true, tacMap: false, shadow: true,           // PAR-6 (research 255 s1): the character shadow
      touch: true,                                        // PAR-5 (research 222 s11): the touch layer (`./matchTouch`)
      hostages: true, taunts: true,                       // ACT-5 (ACT.R5; research 239 s7.1, 250 s6): HX.R8's row -- on both pages (unreachable from the lobby: ACT.R6)
      chat: true,   // TACTICAL ORDERS and MESSAGES: research 302 (Chris's settings, 2026-10-07)
      replay: false,  // PT-18 (W35.R5; spec 4.8; research 244 §1): the replay mode /testroom's only
    };
    expect(FRONT_END_CAPABILITIES).toEqual(pinned);
    expect(Object.keys(TESTROOM_CAPABILITIES).sort()).toEqual(Object.keys(pinned).sort());
  });
});

describe('matchSide: the net client\'s team, else the lobby client\'s (ONL-18c F1), else a SEAL', () => {
  it('in that order', () => {
    expect(matchSide({ client: { team: 'terrorist' } }, { team: 'seal' })).toBe('terrorist');
    expect(matchSide({ client: { team: null } }, { team: 'terrorist' })).toBe('terrorist');
    expect(matchSide(null, { team: 'terrorist' })).toBe('terrorist');
    expect(matchSide(null)).toBe('seal');
    expect(matchSide(null, { team: null })).toBe('seal');
  });
});

describe('heldRefOf and sideLoadoutOf: the kit on the map shown', () => {
  it('a model built off the world with the map\'s points; none without a model, a world or the model', () => {
    const rifle = new Group(), points = [{ name: 'firepoint', at: [1, 2, 3] }];
    const m = map({ weapons: { m4: { points } } } as unknown as Partial<LoadedMap>);
    expect(heldRefOf(viewWith({ m4: rifle }), m, 'm4')).toEqual({ object: rifle, points });
    expect(heldRefOf(viewWith({ m4: rifle }), map(), 'm4')).toEqual({ object: rifle, points: [] });
    expect(heldRefOf(viewWith({ m4: rifle }), m, null)).toBeNull();
    expect(heldRefOf(null, m, 'm4')).toBeNull();
    expect(heldRefOf(viewWith({}), m, 'm4')).toBeNull();
  });
  it('a map with no arsenal: the baked loadout', () => {
    expect(sideLoadoutOf(map(), 'terrorist', 1)).toBe(BAKED_LOADOUT);
    expect(sideLoadoutOf(null, 'seal')).toBe(BAKED_LOADOUT);
  });
});

describe('mapFog and liftFog: the map\'s fog, and the fog on the scene and behind it', () => {
  it('the camera\'s fog copied, the altitude band with it; no camera: untouched, false', () => {
    const fog: FogSettings = { enabled: true, ...fogForExtent(1200), color: [...ELF_DEFAULT_FOGCOL], altitude: null };
    const before = { ...fog };
    expect(mapFog(fog, map())).toBe(false);
    expect(fog).toEqual(before);
    const camera = { fogEnabled: false, fogNear: 5, fogFar: 50, fogColor: [1, 2, 3], fogAltitude: true, fogTop: 9, fogBottom: 3 };
    expect(mapFog(fog, map({ camera } as unknown as Partial<LoadedMap>))).toBe(true);
    expect(fog).toEqual({ ...before, enabled: false, near: 5, far: 50, color: [1, 2, 3], altitude: { top: 9, bottom: 3 } });
  });
  it('the lens times the colour, times the brighten, capped; the clear colour the default fog\'s while fog is off', () => {
    const scene = new Scene(), clears: number[][] = [];
    const fog: FogSettings = { enabled: false, ...fogForExtent(1200), color: [100, 200, 50], altitude: null };
    liftFog(scene, fog, DEFAULT_LIGHTING, [2, 1, 1, 1], (rgb) => clears.push(rgb));
    const gain = clears[0]![1]! / ELF_DEFAULT_FOGCOL[1]!;
    expect(clears[0]).toEqual([Math.min(255, ELF_DEFAULT_FOGCOL[0]! * 2 * gain), ELF_DEFAULT_FOGCOL[1]! * gain, ELF_DEFAULT_FOGCOL[2]! * gain]);
    liftFog(scene, { ...fog, enabled: true }, DEFAULT_LIGHTING, null, (rgb) => clears.push(rgb));
    expect(clears[1]).toEqual([100 * gain, Math.min(255, 200 * gain), 50 * gain]);
  });
});

describe('standOf: where the camera opens and the walk stands on a map', () => {
  it('a map with no measured spawns: off its own extent, looking at the middle; no feet for the walk', () => {
    const s = standOf(map(), viewWith({}));
    expect(s.spawn).toBeUndefined();
    expect(s.feet).toBeNull();
    expect(s.to).toEqual([0, 2, 0]);
    expect(s.from).toEqual([0, 2 + 40 * 0.4, 40 * 0.6]);
  });

  // PRE-SPAWN-SIDE (PRE_SPAWN_STAND_SIDE_READING, research 222 s12): the seat's own start, A for side 0 (the SEALs) and B for
  // side 1 (the Terrorists) -- research 75 s0, "A is side 0 and B side 1 on all 22 maps". Frostfire's measured rows
  // (`spawns.ts`: the actor's feet, KNOWN s1): A [796, 100, 614], B [536, 143, 1254].
  it('a Terrorist seat stands at start B, looking at A; a SEAL seat, and a page with no side given, at A looking at B', () => {
    const frost = map({ name: 'Frostfire' });
    const t = standOf(frost, viewWith({}), 'terrorist');
    expect(t.feet).toEqual([536, 143, 1254]);
    expect(t.from).toEqual([536, 143 + 20, 1254]);
    expect(t.to).toEqual([796, 100, 614]);
    for (const s of [standOf(frost, viewWith({}), 'seal'), standOf(frost, viewWith({}))]) {
      expect(s.feet).toEqual([796, 100, 614]);
      expect(s.to).toEqual([536, 143, 1254]);
    }
  });

  it('the worker\'s stands: A\'s for a SEAL, B\'s (`standB`) for a Terrorist, their probed floor under the feet', () => {
    const frost = map({ name: 'Frostfire', stand: { position: [796, 121, 614], floor: 101 }, standB: { position: [536, 160, 1254], floor: 140 } });
    expect(standOf(frost, viewWith({}), 'terrorist')).toMatchObject({ from: [536, 160, 1254], feet: [536, 140, 1254] });
    expect(standOf(frost, viewWith({}), 'seal')).toMatchObject({ from: [796, 121, 614], feet: [796, 101, 614] });
  });
});

describe('feedCamera: the merged input into the camera\'s lanes', () => {
  const fly = () => {
    const calls: Record<string, unknown[]> = {};
    const rec = (k: string) => (...a: unknown[]) => { calls[k] = a; };
    return { calls, cam: { setStick: rec('stick'), setLift: rec('lift'), setStickBoost: rec('boost'), setLook: rec('look') } };
  };
  it('Triangle sinks the fly camera unless the page is a spectator (PF-31, NetPage.spectatorCamera); asked only when held', () => {
    const f = fly();
    let asked = 0;
    const input = { ...noInput(), moveX: 0.5, moveY: -1, lookX: 0.25, lookY: 0.75, boost: true, stance: true };
    feedCamera(f.cam, input, () => { asked++; return true; });
    expect(f.calls).toEqual({ stick: [0.5, -1], lift: [0], boost: [true], look: [0.25, 0.75] });
    feedCamera(f.cam, input, () => { asked++; return false; });
    expect(f.calls['lift']).toEqual([-1]);
    feedCamera(f.cam, { ...input, stance: false, jump: true }, () => { asked++; return false; });
    expect(f.calls['lift']).toEqual([1]);
    expect(asked).toBe(2);
  });
});
