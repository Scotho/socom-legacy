import { describe, expect, it } from 'vitest';
import { Hud } from '../src/hud';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import { FLINCH_CLIPS, flinchClip, flinchRefused, MP_LONG_FLINCHES } from '../src/net/deaths';
import { PART } from '../src/net/damage';
import type { ServerEvent } from '../src/net/protocol';
import { flinchPose, stepFlinch, RemotePlayers as RealRemotePlayers, type RemotePlayers } from '../src/remotePlayers';
import { BodyFlag, type BodyState } from '../src/net/protocol';
import { Scene } from 'three';
import type { PlayClips } from '../src/play';
import type { WalkMode } from '../src/walk';
import { GAME_FRAME_DT, HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { clipsFromPack, motionTableFromArchive } from '../src/motionTable';
import { oneShotSeconds } from '../src/locomotion';
import {
  FLINCH_CUT_COMMANDS, FLINCH_CUT_DELAY_READING, flinchCommands, flinchCovered, flinchCutAt, flinchCutIn, flinchCutWindow, flinchLanded, type FlinchCut,
} from '../src/net/flinchReload';
import type { FireEvent } from '../src/fire';

/**
 * The hit reaction seen by the others (the owner, 2026-10-02: "Other players do not see a hit animation on somebody.
 * just the player being hit."; research 91 section 21). A non-lethal round plays a flinch of `damanim.rdr`'s
 * `<PART>_FLINCH_ANIMATIONS` for the stance (`FUN_005a0270`, called by `FUN_005a54d0` L461394-461408), on the console
 * where the victim is local, which sends the motion to every other console (`FUN_005a2690` -> `FUN_00588ab0` ->
 * `FUN_002bbaf0`). The room picks it and tells every page (`flinch`); each plays it on the victim's body, the victim's
 * own page on its own (MATCH-FIX-2, `walk.setFlinchPose`).
 */

/** A draw that returns `values` in turn. */
const draws = (...values: number[]) => { let i = 0; return () => values[i++ % values.length]!; };

describe('the flinch clip (damanim.rdr through animset.rdr; FUN_005a0270 L458712-458827)', () => {
  it('the head and the right arm: the stand list\'s one clip, the crouch\'s and the prone\'s', () => {
    expect(flinchClip(PART.HEAD, 'stand', draws(0))).toBe('seal_flinch_rarm');
    expect(flinchClip(PART.RARM, 'stand', draws(0.9))).toBe('seal_flinch_rarm');
    expect(flinchClip(PART.HEAD, 'crouch', draws(0))).toBe('seal_crouch_rflinch');
    expect(flinchClip(PART.LLEG, 'prone', draws(0))).toBe('seal_prone_rflinch');
    expect(flinchClip(PART.RLEG, 'stand', draws(0))).toBe('seal_flinch_rleg');
    expect(flinchClip(PART.LLEG, 'stand', draws(0))).toBe('seal_flinch_lleg');
  });

  it('online the three long clips are drawn again among the rest (L458795-458825; the names L495301-495303)', () => {
    expect(MP_LONG_FLINCHES).toEqual(['guard_hit_stomach01', 'guard_hit_shoulder', 'guard_hit01']);
    // BODY, standing: rarm, larm, Hit stomach01, Hit01. A draw of a long one: the others after it, wrapped, one of them.
    expect(flinchClip(PART.BODY, 'stand', draws(0.1))).toBe('seal_flinch_rarm');
    expect(flinchClip(PART.BODY, 'stand', draws(0.3))).toBe('seal_flinch_larm');
    expect(flinchClip(PART.BODY, 'stand', draws(0.6, 0.1))).toBe('seal_flinch_rarm');   // [rarm, larm] in wrap order from 3
    expect(flinchClip(PART.BODY, 'stand', draws(0.6, 0.9))).toBe('seal_flinch_larm');
    expect(flinchClip(PART.BODY, 'stand', draws(0.9, 0.1))).toBe('seal_flinch_rarm');
    // LARM, standing: Flinch left arm, Hit shoulder -- the shoulder's only other is the left arm.
    expect(flinchClip(PART.LARM, 'stand', draws(0.9))).toBe('seal_flinch_larm');
    for (let r = 0; r < 1; r += 0.05) for (const part of Object.values(PART)) {
      expect(MP_LONG_FLINCHES).not.toContain(flinchClip(part, 'stand', draws(r, r)));
    }
  });

  it('every clip is one the page asks for', () => {
    for (const part of Object.values(PART)) for (const s of ['stand', 'crouch', 'prone'] as const) {
      expect(FLINCH_CLIPS).toContain(flinchClip(part, s, draws(0.5)));
    }
  });
});

describe('the flinch on a body: the clip over its play until it has run (the one-shot clock)', () => {
  const clips = {
    clips: [{ name: 'seal_flinch_rarm', frameCount: 25 }],
    table: [['seal_flinch_rarm', { playback: 0.8 }]],
  } as unknown as PlayClips;

  // PAR-58 (research 230 section 5.2 item 3): 25 keys at 0.8 reach the last at 0.8 x (24/25)^2 = 0.73728 s, key
  // t x 24 / 0.73728 before it; popped there (FUN_00582540's end, D:L442925; FUN_005870e0 D:L418203).
  it('its key on the one-shot clock; null once at its last key, and with no clip loaded', () => {
    expect(flinchPose('seal_flinch_rarm', 0, clips)).toMatchObject({ clip: 'seal_flinch_rarm', frame: 0, loop: false });
    expect(flinchPose('seal_flinch_rarm', 0.4, clips)!.frame).toBeCloseTo((0.4 * 24) / 0.73728, 6);
    expect(flinchPose('seal_flinch_rarm', 0.737, clips)).not.toBeNull();
    expect(flinchPose('seal_flinch_rarm', 0.73728, clips)).toBeNull();
    expect(flinchPose('seal_flinch_rarm', 0.1, null)).toBeNull();
  });
});

/**
 * PAR-58 (research 230 section 5.2 item 3; PTW.R3 with `roomReloadLock.test.ts`): the flinch runs on the death's
 * one-shot clock -- pushed through the same `FUN_00588bc0` (`FUN_005a2690` D:L460019 / D:L460042), its flags 0x4 and 0x2
 * none `FUN_0028c4f0` reads -- and pops at its last key, `T x ((n - 1) / n)^2`: `FUN_00582540`'s end test
 * (`FUN_0028c6e0` D:L134283-134302, the stop `(n - 1) / n`) and `FUN_005870e0` (D:L418203). On every flinch a networked
 * game plays, from the disc (`MOTION_P.ZAR`'s keys, `motion.rdr`'s playback), as `parity/rootMotion.test.ts` holds the deaths.
 */
const flinchPack = fixture('RUN/MOTION_P.ZAR'), flinchReader = fixture('RUN/READERC.ZAR');
describe.skipIf(!flinchPack || !flinchReader)(`PAR-58: the flinch's last key at the one-shot end${!flinchPack || !flinchReader ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  const table = flinchReader ? motionTableFromArchive(flinchReader) : null;
  const disc = flinchPack ? clipsFromPack(flinchPack, FLINCH_CLIPS) : [];
  const played: PlayClips = { clips: disc, table: table ? [...table] : null } as unknown as PlayClips;

  it('every flinch clip a networked game plays is on the disc, with its playback', () => {
    expect(disc.map((c) => c.name).sort()).toEqual([...FLINCH_CLIPS].sort());
    for (const c of disc) expect(table!.get(c.name)?.playback, c.name).toBeGreaterThan(0);
  });

  for (const name of FLINCH_CLIPS) {
    it(`${name}: its last key just before T x ((n - 1) / n)^2, popped there; mid-clip on the same clock`, () => {
      const c = disc.find((k) => k.name === name)!, T = table!.get(name)!.playback!, n = c.frameCount;
      const end = oneShotSeconds(T, n);
      expect(end).toBeLessThan(T);
      expect(flinchPose(name, end - 1e-9, played)!.frame).toBeCloseTo(n - 1, 6);
      expect(flinchPose(name, end, played)).toBeNull();
      expect(flinchPose(name, end / 2, played)!.frame).toBeCloseTo(((end / 2) * n * n) / (T * (n - 1)), 6);
    });
  }
});

describe('a body\'s frame plays its flinch (RemotePlayers.frame -> stepFlinch; FLINCH_GATE_READING)', () => {
  const clips = {
    clips: [{ name: 'seal_flinch_rarm', frameCount: 25 }, { name: 'ladder_climb', frameCount: 10 }],
    table: [['seal_flinch_rarm', { playback: 0.8 }]],
  } as unknown as PlayClips;
  type Snap = Parameters<typeof stepFlinch>[1];
  const ground = (over: Partial<Snap> = {}): Snap => ({ alive: true, traversal: null, action: null, ...over }) as Snap;
  const ladder = { clip: 'ladder_climb', frame: 3, loop: true, rootY: null };

  it('over the ground play: the clip\'s key at its clock, advanced by the frame', () => {
    const r = { flinch: { clip: 'seal_flinch_rarm', t: 0 } };
    const s = ground();
    stepFlinch(r, s, 0.4, clips);
    expect(r.flinch).toEqual({ clip: 'seal_flinch_rarm', t: 0.4 });
    expect(s.traversal).toMatchObject({ clip: 'seal_flinch_rarm', loop: false });
    expect(s.traversal!.frame).toBeCloseTo((0.4 * 24) / 0.73728, 6);              // the one-shot clock (PAR-58)
  });

  it('played through: the body back to its own play, the flinch gone', () => {
    const r = { flinch: { clip: 'seal_flinch_rarm', t: 0.7 } };
    const s = ground();
    stepFlinch(r, s, 0.2, clips);
    expect(r.flinch).toBeNull();
    expect(s.traversal).toBeNull();
  });

  // LATER 404 (#502; research 230 section 5.2.12, FLINCH_CUT_REMOTE_READING read): another console's copy of the flinch is
  // cut as the victim's own -- the victim's replicated stick (the snapshot's ground axes, `cutStick`) or turn past 0.1
  // (`reloadCut`, D:L418182-418185), from the second driver tick after the push (`FLINCH_CUT_COMMANDS`) and past the
  // clip's NoInterrupt -- so a body hit on the move stops playing the standing flinch over its sliding feet.
  it('LATER 404: a victim moving through the hit -- the flinch ends once the cut can run; a still one plays on', () => {
    const moving = { flinch: { clip: 'seal_flinch_rarm', t: 0 } };
    const sm = ground({ cutStick: { forward: 0.8, right: 0 }, turnRate: 0, airborne: false });
    stepFlinch(moving, sm, 0.02, clips);
    expect(moving.flinch).not.toBeNull();                                       // before the second driver tick
    const sm2 = ground({ cutStick: { forward: 0.8, right: 0 }, turnRate: 0, airborne: false });   // the next frame's snapshot
    stepFlinch(moving, sm2, 0.05, clips);
    expect([moving.flinch, sm2.traversal]).toEqual([null, null]);                // cut: the body's own play
    const still = { flinch: { clip: 'seal_flinch_rarm', t: 0 } };
    const ss = ground({ cutStick: { forward: 0.05, right: 0 }, turnRate: 0, airborne: false });
    stepFlinch(still, ss, 0.2, clips);
    expect(still.flinch).not.toBeNull();                                         // at 0.1 or under: no cut
    const turning = { flinch: { clip: 'seal_flinch_rarm', t: 0 } };
    const st = ground({ cutStick: { forward: 0, right: 0 }, turnRate: 2, airborne: false });
    stepFlinch(turning, st, 0.2, clips);
    expect(turning.flinch).toBeNull();                                           // the turn past 0.1 of turn_maxrate
  });

  it('LATER 404: a door clip on another body is cut by the replicated stick only past its NoInterrupt', () => {
    const door = { clips: [{ name: 'seal_open_door', frameCount: 30 }], table: [['seal_open_door', { playback: 1, noInterrupt: 0.5 }]] } as unknown as PlayClips;
    const r = { flinch: { clip: 'seal_open_door', t: 0, pushed: true as const } };
    const s = ground({ cutStick: { forward: 1, right: 0 }, turnRate: 0, airborne: false });
    stepFlinch(r, s, 0.3, door);
    expect(r.flinch).not.toBeNull();                                             // inside the NoInterrupt
    stepFlinch(r, s, 0.3, door);
    expect(r.flinch).toBeNull();
  });

  it("over a ladder clip or a knock fall: none drawn, the flinch dropped, the clip the body's own (flinchRefused)", () => {
    const a = { flinch: { clip: 'seal_flinch_rarm', t: 0 } }, sa = ground({ traversal: ladder });
    stepFlinch(a, sa, 0.1, clips);
    expect([a.flinch, sa.traversal]).toEqual([null, ladder]);
    const b = { flinch: { clip: 'seal_flinch_rarm', t: 0 } };
    const sb = ground({ action: { name: 'fallForward', serial: 1, t: 0, seconds: 0.5, reversed: false } as Snap['action'] });
    stepFlinch(b, sb, 0.1, clips);
    expect([b.flinch, sb.traversal]).toEqual([null, null]);
  });

  // PAR-84 (research 230 section 5.2.10): the launcher's raise and still lower on the mover (`rifleToLauncher`,
  // `pistolToLauncher`, either way) -- `FUN_005a2690` pushes none while `FUN_005a7980` answers (D:L460005-460010), and the
  // two types are in its list (D:L462484-462491): refused on the body's action as on the room's launcher clocks.
  it("PAR-84: refused over the launcher's raise and still lower as mover actions (FUN_005a2690 D:L460005-460010)", () => {
    for (const name of ['rifleToLauncher', 'pistolToLauncher']) {
      for (const reversed of [false, true]) {
        const s = ground({ action: { name, serial: 1, t: 0.1, seconds: 1.4, reversed } as Snap['action'] });
        expect(flinchRefused(s), `${name} ${reversed}`).toBe(true);
      }
    }
  });

  // PF-21 (research 179 s11.4, research 217 s4; ruling PF.R45): `FUN_005a2690` (D:L459887-460017) refuses a flinch while
  // `Fall forward` / `Fall backwards` play (`FUN_00588030`), in state 5 (the ladder), during a weapon switch
  // (`FUN_005a7980(actor, 1)`: the swaps 0x35-0x37, `Rifle -> Launcher`, `Pistol -> Launcher`, a pending `+0x1e4`), during
  // the three long hits and with the alive bit clear -- and not over a jump, a climb or a landing: it pops the stack to
  // its base kind and pushes itself. The port's `Land backwards` (the knock's landing) is the knock's fall.
  it("a flinch plays over a jump, a climb's step-up, a landing and a stance transition; not on a ladder, a hang, a knock fall or during a swap or a launcher raise (FUN_005a2690 D:L459887-460017)", () => {
    const act = (name: string, reversed = false): Snap['action'] => ({ name, serial: 1, t: 0.1, seconds: 0.6, reversed }) as Snap['action'];
    const trav = (clip: string): Snap['traversal'] => ({ clip, frame: 2, loop: false, rootY: null });
    const allowed: Snap[] = [
      ground(), ground({ action: act('jump') }), ground({ action: act('launch') }), ground({ action: act('fall') }),
      ground({ traversal: trav('seal_step_up') }), ground({ action: act('land') }), ground({ action: act('landHard') }),
      ground({ action: act('standToCrouch') }), ground({ action: act('crouchToProne', true) }), ground({ action: act('standToProne') }),
      ground({ action: act('getUpBackwards') }),
      // NU-1b B7 (research 313 sections 4 and 8.1, its review's F5): the two hang one-shots are taken and popped
      // (FUN_005a2690 D:L460011-460019: a one-shot top). Was: refused, by the clip's name.
      ground({ traversal: trav('seal_stand2hang') }), ground({ traversal: trav('seal_hang2climbup') }),
      // NU-1b review F3: the hang's jump down is a one-shot too (motion.rdr looped 0, the golden's): taken and popped.
      // Was: refused, with the hang's loop.
      ground({ traversal: trav('seal_hang_jumpdown') }), ground({ traversal: trav('seal_p_hang_jumpdown') }),
    ];
    const refused: Snap[] = [
      ground({ traversal: trav('seal_climbladder') }), ground({ traversal: trav('seal_stand2ladder') }), ground({ traversal: trav('seal_ladderslide') }),
      ground({ traversal: trav('seal_hang') }), ground({ traversal: trav('seal_p_hang') }),
      ground({ action: act('fallForward') }), ground({ action: act('fallBackwards') }), ground({ action: act('landBackwards') }),
      ground({ action: act('swapStand') }), ground({ action: act('swapCrouch') }), ground({ action: act('swapProne') }),
      ground({ overlay: { clip: 'seal_mv_rifle2pistol', serial: 1, t: 0.1, seconds: 1.257, reversed: false } } as Partial<Snap>),
      ground({ launcher: true } as Partial<Snap>),
      ground({ action: act('hit') }), ground({ action: act('hitStomach') }),
      ground({ alive: false }),
    ];
    for (const s of allowed) expect(flinchRefused(s), JSON.stringify(s)).toBe(false);
    for (const s of refused) expect(flinchRefused(s), JSON.stringify(s)).toBe(true);
    // On a body: drawn over the jump and the transition (whole-body; the transition's clock runs on under it) ...
    for (const s of [ground({ action: act('jump') }), ground({ action: act('standToCrouch') }), ground({ traversal: trav('seal_step_up') })]) {
      const r = { flinch: { clip: 'seal_flinch_rarm', t: 0 } };
      stepFlinch(r, s, 0.1, clips);
      expect(r.flinch, JSON.stringify(s)).not.toBeNull();
      expect(s.traversal?.clip).toBe('seal_flinch_rarm');
    }
    // ... and dropped during a swap.
    const r = { flinch: { clip: 'seal_flinch_rarm', t: 0 } }, sw = ground({ action: act('swapStand') });
    stepFlinch(r, sw, 0.1, clips);
    expect([r.flinch, sw.traversal]).toEqual([null, null]);
  });

  it('a dead body: the flinch reset, its death clip left as it is', () => {
    const death = { clip: 'seal_death', frame: 4, loop: false, rootY: null };
    const r = { flinch: { clip: 'seal_flinch_rarm', t: 0.1 } }, s = ground({ alive: false, traversal: death });
    stepFlinch(r, s, 0.1, clips);
    expect([r.flinch, s.traversal]).toEqual([null, death]);
  });

  it('no flinch: the snapshot untouched', () => {
    const r = { flinch: null }, s = ground();
    stepFlinch(r, s, 0.1, clips);
    expect(s.traversal).toBeNull();
  });

  // MATCH-FIX review 2, finding 3: the call site -- `RemotePlayers.frame` steps the flinch into the snapshot its body
  // plays (a frame that stops calling `stepFlinch` turns this red). The body's view and play are stand-ins.
  it('RemotePlayers.frame: the room\'s flinch drawn on the body, advanced by the frame, gone once played', () => {
    const rp = new RealRemotePlayers(new Scene());
    rp.setClips(clips);
    const drawn: (string | null)[] = [];
    const stub = {
      id: 2, team: 'seal', type: 0, weapon: null, sidearm: null, item: 'rifle', snap: null, kit: null, deadFor: 0, deathClip: null, flinch: null,
      points: { rifle: [], pistol: [] }, view: { group: { visible: true } }, binocs: { update: () => undefined },
      hands: { follow: () => undefined, step: () => [] },
      play: {
        setItem: () => undefined, setMounts: () => undefined, setClips: () => undefined,
        frame: (_dt: number, src: { snapshot: () => { traversal: { clip: string } | null } }) => { drawn.push(src.snapshot().traversal?.clip ?? null); },
      },
    };
    (rp as unknown as { remotes: Map<number, unknown> }).remotes.set(2, stub);
    const body = {
      id: 2, feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, flags: BodyFlag.Alive, stance: 0, landing: 0, jumps: 0, ground: 0,
      groundForward: 0, groundRight: 0, groundCls: -1, action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1, overlay: 0, overlayT: 0,
      overlaySeconds: 0, turnRate: 0, trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0, travBlendWeight: 0, peek: 0, weapon: 255, slot: 0,
    } as BodyState;
    rp.flinch(2, 'seal_flinch_rarm');
    rp.frame(0.4, [body], {} as never);
    expect(drawn).toEqual(['seal_flinch_rarm']);
    expect(stub.flinch).toEqual({ clip: 'seal_flinch_rarm', t: 0.4 });
    rp.frame(0.5, [body], {} as never);
    expect(drawn).toEqual(['seal_flinch_rarm', null]);
    expect(stub.flinch).toBeNull();
  });
});

describe('the page plays the room\'s flinch on the victim\'s body, its own included (MATCH-FIX-2)', () => {
  const clips = {
    clips: [{ name: 'seal_flinch_larm', frameCount: 25 }, { name: 'seal_open_door', frameCount: 14 }],
    table: [['seal_flinch_larm', { playback: 0.8 }], ['seal_open_door', { playback: 0.8 }]],
  } as unknown as PlayClips;
  function page() {
    let socket: WebSocketLike | null = null;
    /**
     * The walk's own flinch: the last pose source set, or null (`setFlinchPose`); the room's window it was handed for the
     * stick's cut (PAR-60) and the cut the walk answers (`cut`: the command it read off its own log, or null); the undos.
     */
    const own: { pose: (() => unknown) | null; sets: number; window: FlinchCut | null; cut: number | null; undone: number; opts: unknown[] } = {
      pose: null, sets: 0, window: null, cut: null, undone: 0, opts: [],
    };
    const walk = {
      setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
      setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
      setFlinchPose: (p: (() => unknown) | null, cut?: FlinchCut | null, opts?: unknown) => { own.pose = p; own.sets++; own.window = cut ?? null; own.opts.push(opts); return own.cut; },
      mode: () => 'walk',
    } as unknown as WalkMode;
    const flinches: [number, string][] = [], pushed: [number, string][] = [];
    const remote = {
      setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined,
      flinch: (id: number, clip: string) => { flinches.push([id, clip]); },
      pushMotion: (id: number, clip: string) => { pushed.push([id, clip]); },
    } as unknown as RemotePlayers;
    const deps: NetPageDeps = {
      walk, remote, hud: new Hud(), clips: () => clips, remoteGrenade: () => undefined, spectate: () => undefined,
      respawned: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
      undoReload: () => { own.undone++; },
      socket: () => {
        socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
        return socket;
      },
    };
    const net = new NetPage(deps, 'ws://test/ws', 'MP2', 'Tester', undefined, false, 'classic');
    socket!.onopen?.({} as Event);
    const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
    server({
      type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
      players: [{ id: 2, name: 'Other', team: 'terrorist' }], rules: 'classic', round: 1, rounds: 11, ghost: false,
    } as ServerEvent);
    return { server, flinches, pushed, own, net };
  }

  // DOORS (research 92 section 2): the door program's `ai::ANIMATE` pushes `Open door` on the actor who pressed through
  // `FUN_00588bc0(actor, type, stance, 0, 0)` (D:L487256-487260), whose 5th argument 0 lets it send the motion itself
  // (D:L446413-446414, a Push Blend to every console). The room tells every page (`motion`); the others' bodies play it
  // as a flinch's clip is played (`RemotePlayers.pushMotion`), the own page on its own body through the walk -- with no
  // reload refusal: the push sets no motion flag 0x4 (the flinch's `FUN_005a2690` does, D:L460021-460024), so the
  // walk's `flinching()` gate is not held (`reloadGate: false`).
  it('a motion pushed on another body (a door\'s Open door): its body plays the clip; the own body untouched', () => {
    const { server, pushed, own } = page();
    server({ type: 'motion', id: 2, clip: 'seal_open_door' } as ServerEvent);
    expect(pushed).toEqual([[2, 'seal_open_door']]);
    expect(own.sets).toBe(0);
  });

  it("a motion pushed on the page's own body: the walk plays it as a program's push, with the room's cut window (its NoInterrupt bound) and no reload gate", () => {
    const { server, pushed, own } = page();
    server({ type: 'motion', id: 1, clip: 'seal_open_door', from: 10, until: 52, cutFrom: 33 } as ServerEvent);
    expect(pushed).toEqual([]);
    expect(own.sets).toBe(1);
    expect(own.pose!()).toMatchObject({ clip: 'seal_open_door', loop: false });
    expect(own.window).toEqual({ start: 10, until: 52, cutFrom: 33 });
    expect(own.opts).toEqual([{ reloadGate: false, pushed: true, clip: 'seal_open_door' }]);   // the door-open body hold: the clip holds the body
  });

  it('another player hit: its body flinches in the room\'s clip, the page\'s own body untouched', () => {
    const { server, flinches, own } = page();
    server({ type: 'flinch', id: 2, clip: 'seal_flinch_larm' } as ServerEvent);
    expect(flinches).toEqual([[2, 'seal_flinch_larm']]);
    expect(own.sets).toBe(0);
  });

  // The game plays the flinch on the victim's own actor first (`FUN_005a54d0` L461401-461405 -> `FUN_005a2690`
  // L460019 `FUN_00588bc0`), then sends the same motion (L460025): the page's own body plays the room's clip, through
  // the walk as its death clip is (`setFlinchPose`), and never as another's body (no double play).
  it('the page\'s own player hit: its own body plays the room\'s clip, not as a remote body', () => {
    const { server, flinches, own } = page();
    server({ type: 'hurt', health: [8, 30, 30, 40, 30, 30], from: [0, 0, 0], part: PART.BODY });
    expect(own.sets).toBe(0);                                          // the hurt alone plays nothing
    server({ type: 'flinch', id: 1, clip: 'seal_flinch_larm' } as ServerEvent);
    expect(flinches).toEqual([]);
    expect(own.sets).toBe(1);
    expect(own.pose!()).toMatchObject({ clip: 'seal_flinch_larm', loop: false });
  });

  // LATER 512's review F6: the own flinch's pose carries its settable clock (`PhasedPose.at`), which the walk sets when it
  // hands the flinch back after a door push -- set later, the clip is drawn from there.
  it("LATER 512: the own flinch's pose has a settable clock (`at`), and setting it moves the drawn frame", () => {
    const { server, own } = page();
    server({ type: 'flinch', id: 1, clip: 'seal_flinch_larm' } as ServerEvent);
    const pose = own.pose as (() => { frame: number } | null) & { at?: (s: number) => void };
    expect(typeof pose.at).toBe('function');
    const early = pose()!.frame;
    pose.at!(0.4);
    expect(pose()!.frame).toBeGreaterThan(early);
  });

  // (The death taking a playing flinch off is the walk's: `setDeathPose` ends it, walk.test.)
  // PAR-60 (research 230 section 5.2.1): the event is told at the hit with the window as it then stands; the stick's cut
  // comes later, on the victim's own commands, and the room ends its window there (`Room.flinchCut`). The page hands the
  // window to its walk -- its start the latest push (`flinchCutWindow`: a merged window's end less the clip's commands)
  // -- which cuts it on its own commands' axes and answers the cut it has already run; the undo reads the window so cut.
  it('the page\'s undo reads the window as its own stick cut it: a reload sent at or past the walk\'s cut is kept, one before it undone (PAR-60)', () => {
    const run = (cut: number | null, window: { from: number; until: number } | null) => {
      const { server, own, net } = page();
      own.cut = cut;
      net.fireEvent({ type: 'reloadStart' } as FireEvent);                    // sent with the client's last seq: 0
      server({ type: 'flinch', id: 1, clip: 'seal_flinch_larm', ...(window ?? {}) } as ServerEvent);
      expect(own.sets).toBe(1);
      return own;
    };
    // `seal_flinch_larm`: 25 keys at 0.8, its one-shot end 0.73728 s: 45 commands (`flinchCommands`, the room's window).
    const uncut = run(null, { from: 0, until: 45 });
    expect(uncut.window).toEqual({ start: 0, until: 45 });
    expect(uncut.undone).toBe(1);                                             // inside the room's window: undone
    expect(run(0, { from: 0, until: 45 }).undone).toBe(0);                    // the room took it at its cut
    expect(run(1, { from: 0, until: 45 }).undone).toBe(1);                    // before the cut: dropped there too
    // A flinch over an open one: the window keeps the first start and ends with the second clip; the cut counts from
    // the second push (`FUN_0058a4d0` pops the first, `FUN_00588bc0` pushes the second at phase 0).
    expect(run(null, { from: -15, until: 30 }).window).toEqual({ start: -15, until: 30 });
    expect(run(null, { from: -20, until: 30 }).window).toEqual({ start: -15, until: 30 });
    // An older room's event (no window): nothing for the walk to cut, and nothing undone, as before.
    const old = run(null, null);
    expect(old.window).toBeNull();
    expect(old.undone).toBe(0);
    expect(flinchCommands(0.8, 25)).toBe(45);
  });

  it('the stick cut\'s helpers: one game frame past the push, whole commands up; past 0.1 only; the first logged command inside the window (FUN_00550ef0 D:L418180-418185; PAR-60)', () => {
    expect(FLINCH_CUT_DELAY_READING).toBe(GAME_FRAME_DT);
    expect(FLINCH_CUT_COMMANDS).toBe(3);                                      // 0.033367 s x 60 = 2.002, up
    const w = { start: 10, until: 40 };
    expect([12, 13, 39, 40].map((s) => flinchCutAt(w, s))).toEqual([false, true, true, false]);
    const log = [11, 12, 13, 14, 15, 16].map((seq) => ({ seq, push: seq !== 13 }));
    expect(flinchCutIn(w, log)).toBe(14);                                     // 11-12 too soon, 13 still
    expect(flinchCutIn({ start: 10, until: 14 }, log)).toBeNull();            // the window over first
    expect(flinchCutWindow({}, 'seal_flinch_larm', clips)).toBeNull();
    expect(flinchCutWindow({ from: 3, until: 48 }, 'seal_flinch_larm', clips)).toEqual({ start: 3, until: 48 });
    expect(flinchCutWindow({ from: 3, until: 60 }, 'seal_flinch_larm', clips)).toEqual({ start: 15, until: 60 });
    expect(flinchCutWindow({ from: 3, until: 60 }, 'seal_flinch_larm', null)).toEqual({ start: 3, until: 60 });   // no clips: the window's start
  });

  // PAR-65 (research 230 section 5.2.4): a flinch pushed in the air is covered by the fall from the next command and, at the
  // command its body is back on the floor, handed back whole by a landing with no clip (`FUN_00589aa0` D:L466900-466901
  // pops the fall) -- or popped: by that landing when it is the push's own first command (the fall not over it yet), by a
  // landing with a clip (`FUN_005af590` D:L466691-466693), by any other way down (a climb's start, R251.12).
  it('the landing\'s helper: handed back whole from a clipless landing past the push\'s first command; popped there otherwise (PAR-65)', () => {
    const w = { start: 10, until: 55 };
    expect(flinchLanded(w, 30, true)).toEqual({ start: 30, until: 75 });          // the whole clip from the landing
    expect(flinchLanded(w, 80, true)).toEqual({ start: 80, until: 125 });         // a flight outlasting the clip: still whole
    expect(flinchLanded(w, 10, true)).toEqual({ start: 10, until: 10 });          // the push's own first command: popped
    expect(flinchLanded(w, 30, false)).toEqual({ start: 10, until: 30 });         // a clip (or no landing): popped
    expect(flinchLanded(w, 80, false)).toEqual({ start: 10, until: 55 });         // the window already past in the air
    // The undo reads the walk's answer as the window's end: a reload the page sent after a clipless landing, past the
    // event's own end but inside the window handed back, is undone; one the room took after the window, kept.
    const run = (answer: number) => {
      const { server, own, net } = page();
      own.cut = answer;
      net.fireEvent({ type: 'reloadStart' } as FireEvent);                    // sent with the client's last seq: 0
      server({ type: 'flinch', id: 1, clip: 'seal_flinch_larm', from: -60, until: -15 } as ServerEvent);
      return own.undone;
    };
    expect(run(30)).toBe(1);                                                  // handed back at -15, past 0: undone
    expect(run(0)).toBe(0);                                                   // popped at 0, or cut there: kept
  });

  // PAR-71 (research 230 section 5.2.4, "PAR-71"): a flinch pushed on the floor and carried off a ledge. On the first
  // command its body runs in the air inside the window, `FUN_005af930` pushes `Jump fall` over it (D:L466956-466970)
  // before that driver tick's advance (D:L418169 before D:L418454), and only the top advances (`FUN_0057a330`
  // D:L438708): its phase stops there. The clipless landing's pop hands it back with the skip set again and its phase
  // untouched (`FUN_0028da00` D:L135104-135107); the driver's peek spends the skip (D:L418293) before that tick's advance
  // (D:L418454), so it plays the rest of its clip from the landing's command, and its cut counts from there.
  it('the landing\'s helper for a flinch covered past its push: the rest of its window from a clipless landing, its cut from there; covered only inside its window and in the air (PAR-71)', () => {
    const w = { start: 10, until: 55 };
    expect(flinchCovered(w, 30, true)).toBe(true);
    expect(flinchCovered(w, 30, false)).toBe(false);                          // on the floor: nothing covers it
    // PAR-71 review F1: on the end's own command the cover (D:L418169) comes before the end test (D:L418193), which the
    // changed top then skips (D:L418176): covered unpopped. One past it, the flinch is gone.
    expect(flinchCovered(w, 55, true)).toBe(true);
    expect(flinchCovered(w, 56, true)).toBe(false);                           // popped the command before: nothing to cover
    expect(flinchCovered(w, 9, true)).toBe(false);                            // before its push
    expect(flinchLanded(w, 40, true, 30)).toEqual({ start: 40, until: 65 });  // 25 commands left at the cover, from the landing
    expect(flinchLanded(w, 70, true, 53)).toEqual({ start: 70, until: 72 });  // a flight past the window's end: the 2 left
    expect(flinchLanded(w, 70, true, 55)).toEqual({ start: 70, until: 71 });  // covered on its end's command: the landing's, popped the next (F1)
    expect(flinchLanded(w, 40, true, 10)).toEqual(flinchLanded(w, 40, true)); // covered on the push's first command: whole (PAR-65)
    expect(flinchLanded(w, 10, true, 10)).toEqual({ start: 10, until: 10 }); // landed there: popped (PAR-65)
    expect(flinchLanded(w, 40, false, 30)).toEqual({ start: 10, until: 40 }); // a clip (or no landing): popped
    expect(flinchLanded(w, 70, false, 53)).toEqual({ start: 10, until: 55 });
    const back = flinchLanded(w, 40, true, 30);
    expect(flinchCutAt(back, 40 + FLINCH_CUT_COMMANDS - 1)).toBe(false);      // the landing's tick asks no cut; the next driver tick
    expect(flinchCutAt(back, 40 + FLINCH_CUT_COMMANDS)).toBe(true);           // is a game frame on
  });

  it('dead: the page\'s own flinch is not played', () => {
    const { server, own } = page();
    server({ type: 'kill', killer: 2, victim: 1, how: 'weapon', weapon: 'M4A1', clip: null } as unknown as ServerEvent);
    server({ type: 'flinch', id: 1, clip: 'seal_flinch_larm' } as ServerEvent);
    expect(own.sets).toBe(0);
  });
});
