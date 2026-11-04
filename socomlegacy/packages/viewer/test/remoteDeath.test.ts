import { describe, expect, it, vi } from 'vitest';
import { Group, PerspectiveCamera, Scene } from 'three';
import { RemotePlayers, type HeldRef, type SideKit } from '../src/remotePlayers';
import type { LoadedMap } from '../src/loadMap';
import type { PlayClips } from '../src/play';
import type { PlaySnapshot } from '../src/mover';
import { BodyFlag, bodyHoldBits, type BodyState } from '../src/net/protocol';
import type { PoseLayer } from '../src/animator';
import { DEFAULT_LIGHTING } from '../src/lighting';
import { parseRdr, rdrGet, Zar, type RdrNode } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import {
  BODY_FADE_S, CLASSIC_BODY_STAYS_READING, corpseShownS, deathClip, OWN_BODY_FADE_READING, REMOTE_BODY_FADE_READING,
} from '../src/net/deaths';
import type { Rules } from '../src/net/protocol';
import { PART } from '../src/net/damage';
import { oneShotSeconds } from '../src/locomotion';

/**
 * The others' death clip and the interpolation (ported from Chris's browser-beta-v5, chris/browser-beta-integration
 * d578f347: test/remoteDeath.test.ts, adapted to our typed bodies, kits and binoculars). The room's `kill` event is
 * reliable and carries no tick; the page draws the others `INTERP_DELAY_MS` behind (`./net/client`), so the event
 * arrives while the body is still drawn from older alive snapshots. Those must not clear the clip `died()` set: only a
 * dead-to-alive change (a respawn) does. The real `RemotePlayers` ordering runs; only the body's view and `Play` are
 * stand-ins (the snapshot each frame plays is recorded).
 */
const output = vi.hoisted(() => ({ snapshots: [] as PlaySnapshot[], layers: [] as PoseLayer[], source: null as unknown, held: [] as { visible: boolean }[] }));
vi.mock('../src/bodyView', () => ({ buildBody: () => ({ group: new Group(), dispose: () => {} }) }));
vi.mock('../src/play', () => ({ Play: class {
  // These stand-ins never start a victory; stopping its empty state is inert (Play.stopVictory).
  stopVictory() {}
  setBody() {} setFlyToggle() {} setClips() {} setWeaponInput() {} setItem() {} setMounts() {} setAnimSet() {}
  // NU-4 B1: the weapons the body hangs (`RemotePlayers.hang`), so a test reads what the corpse draws in its hands.
  setWeapon(o: { visible: boolean } | null) { if (o) output.held.push(o); }
  setSidearm(o: { visible: boolean } | null) { if (o) output.held.push(o); }
  addPoseLayer(l: PoseLayer) { output.layers.push(l); } motionSource() { return output.source; } onEvent() {}
  frame(_dt: number, walk: { snapshot(): PlaySnapshot }) { output.snapshots.push(walk.snapshot()); }
} }));

const clip = 'death_stand_chest01';
const state = (alive: boolean): BodyState => ({
  id: 2, feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0,
  flags: alive ? BodyFlag.Alive : 0, stance: 0, landing: 0, jumps: 0,
  ground: 0, groundForward: 0, groundRight: 0, groundCls: -1, stickSnaps: 0,
  action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1,
  overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0,
  trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0, travBlendWeight: 0, peek: 0, weapon: 255, slot: 0,
});

function rig(rules?: Rules, map: LoadedMap = { body: {} } as LoadedMap, kitOf: SideKit | null = null) {
  output.snapshots.length = 0;
  output.layers.length = 0;
  output.held.length = 0;
  output.source = null;
  const remote = new RemotePlayers(new Scene()), camera = new PerspectiveCamera();
  remote.setMap(map, DEFAULT_LIGHTING, kitOf);
  if (rules) remote.setRules(rules);                          // NU-4: the welcome's rules (`NetPage`)
  remote.setClips({ clips: [{ name: clip, frameCount: 60, parts: [] }], table: null } as unknown as PlayClips);
  const frame = (alive: boolean) => { remote.frame(1 / 60, [state(alive)], camera); return output.snapshots.at(-1)!; };
  return { remote, frame };
}

describe('the others\' death clip ahead of the interpolated snapshots (remotePlayers.frame)', () => {
  it('keeps the kill clip across older alive snapshots, plays it at the death, clears it at the respawn', () => {
    const { remote, frame } = rig();
    frame(true); remote.died(2, clip);
    for (let i = 0; i < 6; i++) expect(frame(true).traversal).toBeNull();
    const first = frame(false).traversal;
    expect(first?.clip).toBe(clip);
    expect(frame(false).traversal!.frame).toBeGreaterThan(first!.frame);
    expect(frame(true).traversal).toBeNull();
    remote.died(2, null); // a later blast death must not reuse the earlier bullet clip
    expect(frame(false).traversal).toBeNull();
  });

  it('a respawn clears the clip: a later dead frame with no fresh died() does not replay it', () => {
    // A reset racing the snapshot (the triage's note): the body goes dead again before any `kill` reaches the page.
    const { remote, frame } = rig();
    frame(true); remote.died(2, clip);
    expect(frame(false).traversal?.clip).toBe(clip);
    expect(frame(true).traversal).toBeNull();
    expect(frame(false).traversal).toBeNull();
  });

  it('keeps a kill that arrives before the body\'s first snapshot', () => {
    const { remote, frame } = rig();
    remote.died(2, clip); frame(true);
    expect(frame(false).traversal?.clip).toBe(clip);
  });

  it('a death still ends a flinch that is playing (stepFlinch)', () => {
    const { remote, frame } = rig();
    remote.setClips({ clips: [{ name: clip, frameCount: 60 }, { name: 'seal_flinch_rarm', frameCount: 25 }], table: null } as unknown as PlayClips);
    frame(true); remote.flinch(2, 'seal_flinch_rarm');
    expect(frame(true).traversal?.clip).toBe('seal_flinch_rarm');
    remote.died(2, clip);
    expect(frame(true).traversal).toBeNull();
    expect(frame(false).traversal?.clip).toBe(clip);
  });
});

describe("the others' throw or plant ends at the death (remotePlayers.frame, the hands layer)", () => {
  it("a body killed mid-plant drops its Put on wall at once: the death clip is not laid under the plant's parts", () => {
    const { remote } = rig();
    const plant = { name: 'seal_put_onwall', frameCount: 42, rate: 30, duration: 42 / 30, parts: [{ name: 'rhand', rotations: [], translations: [] }] };
    const entry = { looped: false, playback: 2.5, maxVelocity: -1, blendTime: null, transitionA: null, transitionB: null, noInterrupt: 1, callbacks: [] };
    output.source = { clips: new Map([[plant.name, plant]]), table: { get: (n: string) => (n === plant.name ? entry : undefined) } };
    const camera = new PerspectiveCamera();
    const body = (alive: boolean, hold: boolean): BodyState => ({ ...state(alive), flags: state(alive).flags | (hold ? bodyHoldBits('seal_put_onwall') : 0) });
    remote.frame(1 / 60, [body(true, true)], camera);
    remote.frame(1 / 60, [body(true, true)], camera);
    const hands = output.layers.at(-1)!;
    expect(hands.sample({} as never)?.weight).toBeGreaterThan(0);   // the plant is up on the remote's body
    remote.died(2, clip);
    remote.frame(1 / 60, [body(false, false)], camera);
    expect(hands.sample({} as never)).toBeNull();                    // dead: the plant's layer is off, not run out
  });
});

/**
 * PF-28 (ruling PF.R47; research 231 s4): a late joiner's corpses from the welcome's envelope -- the clip the room chose
 * at the age the room counted (`CORPSE_HYDRATE_READING`), drawn by the corpse rule from the death, not from the
 * joiner's first sight (NU-4, research 317 R317.1, R317.3: until its seat is alive; was: "faded at `BODY_FADE_S` from
 * the death") -- and a ghost (seated this round, never spawned) drawn as nothing until it is alive
 * (`GHOST_BODY_READING`). Whether a body is drawn: its `Play` runs only when it is shown, so the recorded snapshots grow
 * only then.
 */
describe('PF-28: a joiner\'s corpses and ghosts (remotePlayers.hydrateCorpse, markGhost)', () => {
  it('hydrateCorpse plays the death pose at the given age and keeps it drawn past BODY_FADE_S from the death until its seat is alive (NU-4); markGhost hides the body until it is alive', () => {
    const { remote, frame } = rig();
    // Told before the body's first snapshot (the welcome comes first): the pose at 0.5 s (+ the frame's own 1/60 s).
    remote.hydrateCorpse(2, clip, 0.5);
    const pose = frame(false).traversal!;
    expect(pose.clip).toBe(clip);
    expect(pose.frame).toBeCloseTo(((0.5 + 1 / 60) / oneShotSeconds(60 / 30, 60)) * 59, 6);  // no table: playback = frameCount / 30; D20's one-shot clock
    // NU-4 (research 317 R317.1, R317.3): 9.4 s old, still drawn 10 s on, whatever the rules -- until its seat is alive.
    // (Was, PF-28: drawn for the 0.6 s left of a `BODY_FADE_S` fade, 34-36 frames, then gone.)
    for (const rules of ['classic', 'respawn'] as const) {
      const old = rig(rules);
      const shown = (alive: boolean): boolean => { const n = output.snapshots.length; old.frame(alive); return output.snapshots.length > n; };
      old.remote.hydrateCorpse(2, clip, BODY_FADE_S - 0.6);
      let frames = 0;
      while (shown(false) && frames < 10 * 60) frames++;
      expect(frames, rules).toBe(10 * 60);
      expect(shown(true), rules).toBe(true);
      expect(output.snapshots.at(-1)!.traversal, rules).toBeNull();      // alive: the body its own, the corpse gone
    }
    // A ghost: never drawn while dead, drawn once alive; dead again later (a kill), drawn as any corpse.
    const g = rig();
    const seen = (alive: boolean): boolean => { const n = output.snapshots.length; g.frame(alive); return output.snapshots.length > n; };
    g.remote.markGhost(2);
    for (let i = 0; i < 30; i++) expect(seen(false)).toBe(false);
    expect(seen(true)).toBe(true);
    g.remote.died(2, clip);
    expect(seen(false)).toBe(true);
  });
});

/**
 * PAR-34 group 5 (research 252 s3; ACT.R8), re-stated by NU-4 (research 317 R317.3, §5 B2): the frame's real seconds
 * (`RemotePlayers.frame`'s `real`) are what a corpse's timed rule counts (`fadeAge` against `corpseShownS`), and another
 * seat's corpse has none: a respawn game's lies whole on the others' pages until its seat respawns
 * (`REMOTE_BODY_FADE_READING`). Was (PAR-34): "hidden `BODY_FADE_S` of real time after the death (within a frame), not
 * twice that" -- `BODY_FADE_S` (`FUN_005979a0` D:L454491) is the dying console's own fade (R317.2,
 * `OWN_BODY_FADE_READING`), not the others'. The death pose is a clip beside the body's other clips and keeps the clamped
 * step. A 5-fps frame: 0.2 s real, 0.1 s clamped.
 */
describe('PAR-34 group 5, NU-4: a respawn corpse at 5 fps is drawn past twice BODY_FADE_S of real time while its seat is dead (research 252 s3; 317 R317.3)', () => {
  it('drawn every frame through 2 x BODY_FADE_S of real time; its pose advances 0.1 s a frame; gone the frame its seat is alive', () => {
    const { remote } = rig('respawn');
    const camera = new PerspectiveCamera();
    remote.frame(0.1, [state(true)], camera, 0.2);
    remote.died(2, clip);
    let real = 0, gone: number | null = null;
    const poses: number[] = [];
    for (let i = 0; i < (2 * BODY_FADE_S) / 0.2 + 1 && gone === null; i++) {
      const n = output.snapshots.length;
      remote.frame(0.1, [state(false)], camera, 0.2);
      real += 0.2;
      if (output.snapshots.length === n) gone = real; else poses.push(output.snapshots.at(-1)!.traversal!.frame);
    }
    expect(gone).toBeNull();
    expect(real).toBeGreaterThan(2 * BODY_FADE_S);
    expect(poses[1]! - poses[0]!).toBeCloseTo((0.1 / oneShotSeconds(60 / 30, 60)) * 59, 6);  // no table: playback = frameCount / 30; D20's clock
    remote.frame(0.1, [state(true)], camera, 0.2);
    expect(output.snapshots.at(-1)!.traversal).toBeNull();                              // the respawn: the corpse gone
  });
});

/**
 * NU-4 B1, B2, B4 (research 317 R317.1, R317.3, R317.4, §1.7, §5): another seat's corpse is its player's actor, drawn
 * whole until its seat is alive again -- the round's reload in classic (`CLASSIC_BODY_STAYS_READING`: `FUN_005979a0`
 * D:L454484-454491 fades only with the respawn option; `CRemoteCtrl`'s death handler `FUN_005e6290` D:L497312-497328
 * starts none), the respawn press in a respawn game (`REMOTE_BODY_FADE_READING`: the alpha travels only on the press,
 * D:L451699-451723) -- with no timer of its own (`corpseShownS`). The port hid both 10 s after the death (PAR-34's
 * `BODY_FADE_S`). At a remote's death `FUN_00547af0` hides its item nodes (D:L413122-413134, under `IsRemote`): the
 * actor's +0x390 the rifle and +0x398 the pistol (`FUN_00553290`'s slots 1 and 2 at +0x388 + 8 x slot, D:L419059,
 * D:L419663-419664) and +0x3a8 the launcher (written by the set-up under `spinehi`, D:L419676), not +0x3a0 the grenade;
 * so the corpse draws no weapon (the page draws no launcher on a remote). Was (the review's F2): "slot 1 the rifle, 2
 * the pistol, 4". B4: a hostage's corpse (`FUN_005714b0`, no fade) the same (`DEAD_IN_FADE_READING`).
 */
describe('NU-4 B1-B4: a body lies as long as the original\'s (research 317)', () => {
  const camera = new PerspectiveCamera();
  /** Runs the body dead for `seconds` in 0.1 s frames; true if it was drawn on every one. */
  const deadFor = (remote: RemotePlayers, seconds: number): boolean => {
    let drawn = true;
    for (let t = 0; t < seconds - 1e-9; t += 0.1) {
      const n = output.snapshots.length;
      remote.frame(0.1, [state(false)], camera);
      drawn &&= output.snapshots.length > n;
    }
    return drawn;
  };

  it("the rule (corpseShownS): another seat's corpse until its seat is alive under both rules; the own body BODY_FADE_S in a respawn game, the whole round in classic; the classic waiting room takes the respawn rule", () => {
    expect(CLASSIC_BODY_STAYS_READING).toBe('the whole round');
    expect(REMOTE_BODY_FADE_READING).toBe('whole until the respawn');
    expect(OWN_BODY_FADE_READING).toBe('10 s respawn, none classic');
    expect(corpseShownS('classic', 'other')).toBe(Infinity);
    expect(corpseShownS('respawn', 'other')).toBe(Infinity);
    expect(corpseShownS('classic', 'own')).toBe(Infinity);
    expect(corpseShownS('respawn', 'own')).toBe(BODY_FADE_S);
    expect(corpseShownS('classic', 'own', true)).toBe(BODY_FADE_S);       // CLASSIC_WAITING_PLACEHOLDER: a respawn room
    expect(corpseShownS('classic', 'other', true)).toBe(Infinity);
    expect(BODY_FADE_S).toBe(10);                                          // R317.2: the dying console's own fade, unchanged
  });

  it('B1: a classic corpse is drawn at 11 s and at 60 s in its death clip, and is gone once its seat is alive', () => {
    const { remote } = rig('classic');
    remote.frame(0.1, [state(true)], camera);
    remote.died(2, clip);
    expect(deadFor(remote, 11)).toBe(true);
    expect(output.snapshots.at(-1)!.traversal?.clip).toBe(clip);
    expect(deadFor(remote, 49)).toBe(true);                               // 60 s dead
    expect(output.snapshots.at(-1)!.traversal?.clip).toBe(clip);
    remote.frame(0.1, [state(true)], camera);                             // the next round's spawn
    expect(output.snapshots.at(-1)!.traversal).toBeNull();
  });

  it('B1 (the review, F4): a corpse draws no held weapon -- the rifle and the pistol hidden at the death (FUN_00547af0 D:L413120-413134)', () => {
    const held = (): HeldRef => ({ object: new Group(), points: [] });
    const { remote } = rig('classic', { body: {} } as LoadedMap, () => ({ rifle: held(), pistol: held() }));
    remote.frame(0.1, [state(true)], camera);
    expect(output.held).toHaveLength(2);
    expect(output.held.map((o) => o.visible)).toEqual([true, true]);      // alive: as its play hangs them
    remote.died(2, clip);
    remote.frame(0.1, [state(false)], camera);
    expect(output.held.map((o) => o.visible)).toEqual([false, false]);    // at the death
    expect(deadFor(remote, 11)).toBe(true);
    expect(output.held.map((o) => o.visible)).toEqual([false, false]);    // 11 s on, still drawn, no weapon in its hands
  });

  it('B2: a respawn corpse is drawn at 15 s while its seat is dead, and gone the frame its seat is alive', () => {
    const { remote } = rig('respawn');
    remote.frame(0.1, [state(true)], camera);
    remote.died(2, clip);
    expect(deadFor(remote, 15)).toBe(true);
    expect(output.snapshots.at(-1)!.traversal?.clip).toBe(clip);
    remote.frame(0.1, [state(true)], camera);                             // the respawn press taken: the actor rebuilt
    expect(output.snapshots.at(-1)!.traversal).toBeNull();
  });

  it('B4: a dead escortee (a hostage) is drawn at 11 s (FUN_005714b0: no fade; DEAD_IN_FADE_READING)', () => {
    const map = { body: {}, types: { seal: [], terrorist: [], escortees: [{ character: 'mp_fem1' }] } } as unknown as LoadedMap;
    const { remote } = rig(undefined, map);
    remote.setEscortee(2, 0);
    remote.frame(0.1, [state(true)], camera);
    remote.died(2, clip);
    expect(deadFor(remote, 11)).toBe(true);
    expect(output.snapshots.at(-1)!.traversal?.clip).toBe(clip);
  });
});

// ---- PF-21: the death lists through the disc's anim sets (research 179 s11.2; research 217 s4) ----------------------

const READERC_ZAR = fixture('RUN/READERC.ZAR');

describe.skipIf(!READERC_ZAR)(`the death clips are damanim.rdr's names through animset.rdr${READERC_ZAR ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  /** An anim set's type names to their clip (`anim_name`, else the `modes`' default's first), its includes after it. */
  const animSet = (root: RdrNode, name: string): Map<string, string> => {
    const flat = (n: RdrNode): RdrNode[] => (Array.isArray(n) && n.length === 1 && Array.isArray(n[0]) ? flat(n[0]) : n as RdrNode[]);
    const sets = flat(root);
    const out = new Map<string, string>();
    const byName = (n: string): RdrNode | undefined => sets.find((s) => rdrGet(s, 'anim_set_name') === n);
    const add = (set: RdrNode | undefined): void => {
      for (const anim of (set ? rdrGet(set, 'anim_set_anims') : []) as RdrNode[]) {
        const type = rdrGet(anim, 'type_name');
        if (typeof type !== 'string' || out.has(type)) continue;
        const one = rdrGet(anim, 'anim_name');
        if (typeof one === 'string') out.set(type, one);
      }
    };
    const own = byName(name);
    add(own);
    const include = own ? rdrGet(own, 'include') : undefined;
    for (const inc of (Array.isArray(include) ? include : include === undefined ? [] : [include]) as string[]) add(byName(inc));
    return out;
  };

  it("damanim's STAND BODY list: Crawl death01 is death_stand_groin02 and Crawl death02 death_stand_groin01 (animset.rdr GLOBAL; 179 s11.2), positions 7 and 8", () => {
    const zar = Zar.parse(READERC_ZAR!);
    const damanim = parseRdr(zar.data(zar.find('damanim.rdr')!));
    const stand = rdrGet(rdrGet(damanim, 'BODY_DEATH_ANIMATIONS')!, 'STAND') as RdrNode[];
    const names = stand.map((e) => rdrGet(e, 'NAME') as string);
    expect(names[6]).toBe('Crawl death01');
    expect(names[7]).toBe('Crawl death02');
    const global = animSet(parseRdr(zar.data(zar.find('animset.rdr')!)), 'GLOBAL');
    expect(global.get('Crawl death01')).toBe('death_stand_groin02');
    expect(global.get('Crawl death02')).toBe('death_stand_groin01');
    // Each name through GLOBAL, else its own snake-cased clip ("Death stand chest03" -> death_stand_chest03).
    const want = names.map((n) => global.get(n) ?? n.toLowerCase().replace(/ /g, '_'));
    // The room's list, entry by entry: a body round's draw at each eighth (`deathClip`, `FUN_005a0950` rand() % count).
    const got = want.map((_, i) => deathClip('bullet', PART.BODY, 'stand', () => (i + 0.5) / want.length));
    expect(got).toEqual(want);
  });
});

describe('the death lists as transcribed (no disc; research 179 s11.2)', () => {
  it("the room's BODY stand draw: chest01, chest02, chest03, rarm01, larm01, larm02, then the crawls groin02 and groin01", () => {
    const got = Array.from({ length: 8 }, (_, i) => deathClip('bullet', PART.BODY, 'stand', () => (i + 0.5) / 8));
    expect(got).toEqual([
      'death_stand_chest01', 'death_stand_chest02', 'death_stand_chest03', 'death_stand_rarm01', 'death_stand_larm01',
      'death_stand_larm02', 'death_stand_groin02', 'death_stand_groin01',
    ]);
  });
});

describe('PF-28 integration fix: clear() forgets the joiner\'s pending corpses and ghosts (a new room)', () => {
  it('clear() drops the ghosts, pending deaths and their ages of ids never drawn, so a later body of that id is drawn fresh', () => {
    const { remote, frame } = rig();
    remote.markGhost(2);                                         // the joiner's envelope: id 2 a ghost, never drawn yet
    remote.hydrateCorpse(5, clip, 9);                            // and id 5 a corpse, its body not drawn yet
    remote.clear();                                              // a new room: those ids are another room's
    remote.died(2, clip);                                        // NU-11b H1: id 2's death heard in the new room first (else a ghost)
    const n = output.snapshots.length;
    frame(false);                                                 // id 2 dead in the new room: drawn (a corpse), not a ghost
    expect(output.snapshots.length).toBe(n + 1);
    const internals = remote as unknown as { ghosts: Set<number>; pendingAges: Map<number, number>; pendingDeaths: Map<number, string> };
    expect([internals.ghosts.size, internals.pendingAges.size, internals.pendingDeaths.size]).toEqual([0, 0, 0]);
  });
});
