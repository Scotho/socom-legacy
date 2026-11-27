// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { Scene } from 'three';
import { GrenadeCore, type GrenadeSource } from '../src/grenadeCore';
import { mountFirearm, type FirearmHands } from '../src/matchFirearm';
import { FlyCamera } from '../src/camera';
import { WalkMode, type PlaySnapshot } from '../src/walk';
import { Play } from '../src/play';
import { RemotePlayers } from '../src/remotePlayers';
import { Hud } from '../src/hud';
import { PlayerLoadout } from '../src/loadout';
import { ZOOM_GATE_THROW_TYPES, ZOOM_THROW_CLIP_REFUSED_READING } from '../src/zoom';

/**
 * R4P-111 (research 84 §7, "The d-pad under a throw's clip"; ZOOM_THROW_CLIP_REFUSED_READING): the zoom step is refused
 * while the top play's type is one of the gate's throw and toss types. r0004 (the specification): the controller's zoom
 * block at 0x59b278 runs Down (0x548e10) and Up (0x548fc0) only when the gate 0x5aeac0 answers, and the gate asks the list
 * 0x5ad9f0(actor, 0) at 0x5aeb8c -- eleven types (`ZOOM_GATE_THROW_TYPES`); r0001's `FUN_005a8da0` compares nine inline
 * (D:L463214-463227; `FUN_00594cf0` D:L453313). The type the gate reads (the play's +0x2c) is the HAND's variant:
 * `FUN_00588bc0` maps the asked type to its base, then to the hand's (+0xf79) variant, and pushes that (D:L446087-446088,
 * push D:L446292; r0004 0x58e27c / 0x58e28c / 0x58ea9c). The review's F1 read from that that the sidearm's standing
 * hard throw puts `Pistol throw grenade` (in neither list) on top and steps; the capture ZOOMF1-PC2 (IQ-116; r0004, M51,
 * Shadow PC 2, MARK 23SD drawn then MARK141, a primary in the kit, standing, third person; capture, unscored) contradicts
 * it: 4 of 4 throws (3 hard, 1 light) played clip 49, the rifle's `Throw grenade`, on top of the pistol-drawn stance
 * (83), and Up at +200 / +600 ms was refused in all 4 (the control after steps). ZOOMF1B-PC2 (20 throws, no `Pistol
 * throw grenade` in any state) and the reading of the hand pass (LATER 1442: the pistol type only where the anim-set
 * record has byte +5 bit 1, the two peek tosses alone) settle it: the port plays the rifle's `Throw grenade` there too.
 * *Was: the port played `Pistol throw grenade` and the gate read it as `Throw grenade` (`zoomGateType`, removed).* The earlier capture
 * WFEEL-C7-PC2 (r0004, Shadow PC 2; memory reads per frame; capture, unscored): 44 of 44 d-pad Ups at +200 and +600 ms
 * after the R1 release leave `+0x200` and `+0x204` unchanged -- the standing throw (clip 49, the rifle in the hand), the
 * rifle peek tosses (239 / 238), the pistol peek tosses (top 241 / 240; the body's +0x534, the base type, 239 / 238)
 * and the M67 crouched throw (243) -- and 20 of 20 control Ups at +2400 ms step 0xff00 -> 0x1 at once.
 */

const snap = (over: Partial<PlaySnapshot> = {}): PlaySnapshot => ({
  feet: [100, 50, 200], yaw: 90, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand',
  landing: null, jumps: 0, ...over,
} as PlaySnapshot);

function core(body: Partial<PlaySnapshot> = {}, extra: Partial<GrenadeSource> = {}): GrenadeCore {
  const g = new GrenadeCore({ grid: () => null, snapshot: () => snap(body), view: () => 'third', ...extra });
  g.setKit(['M67', 'M67', 'HE']);
  return g;
}
/** Runs the core `seconds` in 1/60 s frames. */
const run = (g: GrenadeCore, seconds: number): void => { for (let t = 0; t < seconds - 1e-9; t += 1 / 60) g.update(1 / 60); };

describe('R4P-111: GrenadeCore.throwClipActive -- a throw or toss type on top, from the release request to the clip\'s end', () => {
  const cases: [string, Partial<PlaySnapshot>, boolean][] = [
    ['the standing throw (capture clip 49)', {}, false],
    ['the crouched throw (capture clip 243)', { stance: 'crouch', crouched: true }, false],
    ['the rifle peek toss right (capture clip 238)', { peek: 1, leanClip: true }, false],
    ['the rifle peek toss left (capture clip 239)', { peek: -1, leanClip: true }, false],
    ['the pistol peek toss right (capture clip 240)', { peek: 1, leanClip: true }, true],
    ['the pistol peek toss left (capture clip 241)', { peek: -1, leanClip: true }, true],
  ];
  it.each(cases)('%s: active at +200 and +600 ms after the release, over by +2400 ms', (_name, body, pistol) => {
    const g = core(body, { pistol: () => pistol });
    const played: string[] = [];
    g.on('throwStart', (e) => { played.push(e.anim.type); });
    expect(g.throwClipActive(), 'not in the wind-up\'s ready hand').toBe(false);
    expect(g.throwNow(1, false)).toBeNull();                         // the R1 release: the release request, the clip pushed
    expect(g.phase()).toBe('throwing');
    expect(ZOOM_GATE_THROW_TYPES.has(played[0]!), played[0]).toBe(true);
    run(g, 0.2);
    expect(g.throwClipActive(), '+200 ms').toBe(true);
    run(g, 0.4);
    expect(g.throwClipActive(), '+600 ms').toBe(true);
    run(g, 1.8);
    expect(g.throwClipActive(), '+2400 ms: the clip done').toBe(false);
  });

  it('the wind-up (R1 held, no throw type pushed yet) is not a throw clip; the same hand let go is one (the control)', () => {
    const g = core();
    g.select('M67');
    g.pull();
    run(g, 0.3);
    expect(g.phase()).toBe('holding');
    expect(g.throwClipActive(), 'the wind-up').toBe(false);
    g.release();
    run(g, 0.1);
    expect(g.phase()).toBe('throwing');
    expect(g.throwClipActive(), 'the same throw released: the control').toBe(true);
  });

  it('a placing (`Place claymore`, in neither list) is not a throw clip; the same core\'s throw after it is one (the control)', () => {
    const g = new GrenadeCore({ grid: () => null, snapshot: () => snap(), view: () => 'third' });
    g.setKit(['Claymore', 'M67', null]);
    g.select('Claymore');
    g.pull();
    run(g, 0.5);
    expect(g.phase()).toBe('throwing');
    expect(g.throwClipActive(), 'the placing').toBe(false);
    run(g, 3);
    expect(g.select('M67')).toBe(true);
    run(g, 1);
    expect(g.throwNow(1, false)).toBeNull();
    run(g, 0.2);
    expect(g.throwClipActive(), 'a throw from the same core: the control').toBe(true);
  });
});

describe("R4P-111 F1 against ZOOMF1-PC2 / ZOOMF1B-PC2: the sidearm's standing throw puts the rifle's `Throw grenade` (49) on top -- refused", () => {
  it('names the eleven (r0004 0x5ad9f0 with 0): no `Pistol throw grenade`, no placing', () => {
    expect([...ZOOM_GATE_THROW_TYPES].sort()).toEqual([
      'Crouch throw grenade', 'Peek left toss', 'Peek right toss', 'Pistol peek left toss', 'Pistol peek right toss',
      'Pistol prone toss grenade', 'Pistol toss grenade', 'Prone throw grenade', 'Prone toss grenade', 'Throw grenade',
      'Toss grenade',
    ]);
  });

  const hard: [string, Partial<PlaySnapshot>][] = [
    ['standing, hard (power >= 0.6; ZOOMF1-PC2, 3 of 3)', {}],
    ['crouched and moving (the standing type; ZOOMF1B-PC2: 49 with the stick forward)', { stance: 'crouch', crouched: true, vx: 20 }],
  ];
  it.each(hard)("the sidearm's throw %s: the rifle's `Throw grenade` (LATER 1442), the zoom REFUSED", (_name, body) => {
    const rifle = core(body, { pistol: () => false });
    expect(rifle.throwNow(1, false)).toBeNull();
    run(rifle, 0.2);
    expect(rifle.throwClipActive(), 'the rifle in the hand: `Throw grenade` (the control)').toBe(true);

    const g = core(body, { pistol: () => true });
    const played: string[] = [];
    g.on('throwStart', (e) => { played.push(e.anim.type); });
    expect(g.throwNow(1, false)).toBeNull();
    expect(played).toEqual(['Throw grenade']);
    expect(g.phase()).toBe('throwing');
    run(g, 0.2);
    expect(g.throwClipActive(), '+200 ms').toBe(true);
    run(g, 0.4);
    expect(g.throwClipActive(), '+600 ms').toBe(true);
    run(g, 1.8);
    expect(g.throwClipActive(), '+2400 ms: the clip done').toBe(false);
  });

  // The v0.4.31 release review's F2 asked whether the sidearm's crouched and prone throws step the zoom. On the port they
  // play the RIFLE's types: the hand pass swaps only a type whose anim-set record has byte +5 bit 1, which neither has
  // (LATER 1442; `@s2u/scene` `PISTOL_HAND_SWAP_CLIPS`) -- both in the eleven, so refused. Crouched: ZOOMF1B-PC2 (r0004; capture, unscored) -- the original puts `Crouch throw grenade` (243) on top
  // and refuses. Prone: not captured; the same anim-set lookup (a reading).
  const posed: [string, Partial<PlaySnapshot>, string][] = [
    ['crouched (ZOOMF1B-PC2: clip 243, refused)', { stance: 'crouch', crouched: true }, 'Crouch throw grenade'],
    ['prone (a reading, uncaptured)', { stance: 'prone' } as Partial<PlaySnapshot>, 'Prone throw grenade'],
  ];
  it.each(posed)("the sidearm's %s hard throw plays the rifle's type: the zoom REFUSED", (_name, body, type) => {
    const g = core(body, { pistol: () => true });
    const played: string[] = [];
    g.on('throwStart', (e) => { played.push(e.anim.type); });
    expect(g.throwNow(1, false)).toBeNull();
    expect(played).toEqual([type]);
    run(g, 0.2);
    expect(g.throwClipActive(), '+200 ms').toBe(true);
    run(g, 0.4);
    expect(g.throwClipActive(), '+600 ms').toBe(true);
    run(g, 1.8);
    expect(g.throwClipActive(), '+2400 ms: the clip done').toBe(false);
  });

  // The sidearm's standing toss keeps the rifle's `Toss grenade` (LATER 1442: the bit is not set for it); the gate's list
  // still names `Pistol toss grenade` (r0004 0x5ad9f0's words), a type the hand pass never pushes for a throw.
  it("the sidearm's standing toss (the rifle's `Toss grenade`, in both lists) stays refused", () => {
    const g = core({}, { pistol: () => true });
    const played: string[] = [];
    g.on('throwStart', (e) => { played.push(e.anim.type); });
    expect(g.throwNow(0.1, false)).toBeNull();
    expect(played).toEqual(['Toss grenade']);
    run(g, 0.2);
    expect(g.throwClipActive(), '+200 ms').toBe(true);
  });

  it("d-pad Up at +200 and +600 ms after the sidearm's standing hard throw is REFUSED (ZOOMF1-PC2); after the clip it steps", () => {
    const throwG = core({}, { pistol: () => true });
    const f = firearmRig({ get on() { return throwG.throwClipActive(); } });
    expect(throwG.throwNow(1, false)).toBeNull();
    run(throwG, 0.2);
    expect(f.stepZoom('in'), '+200 ms: refused').toBe(0);
    run(throwG, 0.4);
    expect(f.stepZoom('in'), '+600 ms: refused').toBe(0);
    run(throwG, 1.8);
    expect(f.stepZoom('in'), 'the control Up after the clip').toBe(1);

    const tossG = core({ peek: 1, leanClip: true }, { pistol: () => true });
    const f2 = firearmRig({ get on() { return tossG.throwClipActive(); } });
    expect(tossG.throwNow(1, false)).toBeNull();
    run(tossG, 0.2);
    expect(f2.stepZoom('in'), 'the pistol peek toss: Up refused').toBe(0);
  });
});

function firearmRig(throwClip: { on: boolean } | null) {
  const fly = new FlyCamera(document.createElement('canvas'));
  const walk = new WalkMode(fly);
  const hands: FirearmHands | undefined = throwClip ? {
    launcherUp: () => false, launcherRoundIcon: () => null, itemUp: () => false, busy: () => false, takeable: () => true,
    putAway: () => {}, spawned: () => {}, trigger: () => false, launched: () => {}, icon: () => null, magazine: () => null,
    mounted: () => false, throwClip: () => throwClip.on,
  } : undefined;
  const firearm = mountFirearm({
    scene: new Scene(), fly, walk, play: new Play(), remote: new RemotePlayers(new Scene()), hud: new Hud(), loadouts: new PlayerLoadout(),
    view: () => null, map: () => null, body: () => null, net: () => null, blocked: () => false, refreshFog: () => {},
    ...(hands ? { hands } : {}),
  });
  vi.spyOn(walk, 'mode').mockReturnValue('walk');
  return firearm;
}

describe('R4P-111: matchFirearm.stepZoom refused under a throw clip (FUN_005a8da0, D:L463214-463227; WFEEL-C7-PC2)', () => {
  it('names the rule', () => {
    expect(ZOOM_THROW_CLIP_REFUSED_READING).toBe('every step refused while a throw or toss type is the top action');
  });

  it('d-pad Up inside the clip: the state and the magnification unchanged; after the clip, Up steps 0 -> 1 at once', () => {
    const clip = { on: true };
    const f = firearmRig(clip);
    const mag = f.zoom.target();
    expect(f.stepZoom('in'), '+200 ms').toBe(0);
    expect(f.stepZoom('in'), '+600 ms').toBe(0);
    expect([f.zoom.state(), f.zoom.target()]).toEqual([0, mag]);
    clip.on = false;
    expect(f.stepZoom('in'), 'the control Up after the clip').toBe(1);
    expect(f.zoom.target()).toBeCloseTo(1.01, 12);
  });

  it('d-pad Down (FUN_00544400, D:L453316, behind the same gate) and the cycle are refused too', () => {
    const clip = { on: false };
    const f = firearmRig(clip);
    expect(f.stepZoom('in')).toBe(1);
    clip.on = true;
    expect(f.stepZoom('out')).toBe(1);
    expect(f.stepZoom('cycle')).toBe(1);
    clip.on = false;
    expect(f.stepZoom('out')).toBe(0);
  });

  it('a firearm with no throw clip (no hands, or hands without the hook) zooms as before', () => {
    expect(firearmRig(null).stepZoom('in')).toBe(1);
    expect(firearmRig({ on: false }).stepZoom('in')).toBe(1);
  });
});
