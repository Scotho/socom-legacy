import { describe, expect, it } from 'vitest';
import { DEFAULT_RIFLE, HELD_RIFLE, HELD_SIDEARM, type WeaponRecord, type WeaponStanceName } from '@s2u/scene';
import { Accuracy } from '../src/accuracy';
import { ShotCone, type AimMover } from '../src/net/shotCone';
import { Button, TICK_HZ, type Command } from '../src/net/protocol';
import { handReticleType } from '../src/reticle';
import { viewLens } from '../src/sights';
import { BINOCULARS, viewRangeExtra, Zoom, type RenderView, type ZoomView } from '../src/zoom';
import { POV_COMMAND_DT_ADAPTATION, PovLens, povViewState } from '../src/povLens';

/**
 * PV-7a (research 402 sections 2, 3 and 7; a browser adaptation, product track): the watched player's view state as a
 * watcher's page rebuilds it from the wire -- the zoom state (0-12), the item in hand, the map's night, the body's
 * look, motion and trigger, and the `shot` events -- against an owner-side reference: a real `Zoom` driven through an
 * owner's presses with `update` each 60 Hz frame, and the room's own `ShotCone` fed the same per-command inputs.
 */

const DT = 1 / TICK_HZ;
const BASE_FOV = 60;
const sniper: WeaponRecord = { ...DEFAULT_RIFLE, zoomModes: [1.5, 6, 12] };        // the M40A1's three levels
const oneMode: WeaponRecord = { ...DEFAULT_RIFLE, zoomModes: [1.5] };              // a rifle of NumZoomModes 1
const scope3: WeaponRecord = HELD_RIFLE;                                             // the M4A1 SD: [1.5, 3]

type Act = 'in' | 'out' | 'die' | { weapon: WeaponRecord } | { respawn: WeaponRecord } | { set: number };

interface Picture {
  state: number; alive: boolean; record: WeaponRecord;
  mag: number; fov: number; render: RenderView; hud: number; view: ZoomView;
}

/** The owner: a real `Zoom`, the presses at their commands, `update` once a 60 Hz frame (matchFirearm `gunFrame`). */
function owner(first: WeaponRecord, script: Record<number, Act[]>, commands: number, night = false): Picture[] {
  const z = new Zoom(first, night);
  let record = first, alive = true;
  const out: Picture[] = [];
  for (let c = 0; c < commands; c++) {
    for (const a of script[c] ?? []) {
      if (a === 'in') z.zoomIn();
      else if (a === 'out') z.zoomOut();
      else if (a === 'die') { z.reset(); alive = false; }
      else if ('weapon' in a) { record = a.weapon; z.setWeapon(a.weapon); }
      else if ('respawn' in a) { record = a.respawn; z.respawn(a.respawn); alive = true; }
      else z.set(a.set);
    }
    z.update(DT);
    out.push({ state: z.state(), alive, record, mag: z.magnification(), fov: z.fov(BASE_FOV), render: z.renderView(), hud: z.hudZoom(), view: z.view() });
  }
  return out;
}

const still = { yaw: 0, pitch: 0, velocity: [0, 0, 0] as [number, number, number], airborne: false, posture: 'stand' as WeaponStanceName, trigger: false, spawns: 0 };

/** The watcher: each command the newest snapshot's body (a snapshot every 2 commands carries its last command's state). */
function watcher(log: readonly Picture[], night = false): Picture[] {
  const w = new PovLens();
  const out: Picture[] = [];
  for (let c = 0; c < log.length; c++) {
    const s = log[c - (c % 2)]!;
    w.tick({ ...still, view: s.state, record: s.record, coneRecord: s.record, mapNight: night, alive: s.alive });
    const l = w.lens();
    out.push({ state: l.state, alive: s.alive, record: s.record, mag: w.magnification(), fov: w.fov(BASE_FOV), render: w.renderView(), hud: w.hudZoom(), view: l.view });
  }
  return out;
}

/**
 * The equivalence: at every command the watcher's discrete picture (the state, the far range, "ZOOM", the lens) is the
 * owner's at that command or one or two before (one snapshot), and its magnification and FOV lie between the owner's
 * over those commands; once the owner's run has settled, the two are equal.
 */
function expectFollows(o: readonly Picture[], w: readonly Picture[]): void {
  for (let c = 0; c < o.length; c++) {
    const back = [0, 1, 2].filter((d) => c - d >= 0).map((d) => o[c - d]!);
    const discrete = (p: Picture): string => JSON.stringify([p.state, p.render.farExtra, p.hud, p.view]);
    expect(back.map(discrete), `command ${c}`).toContain(discrete(w[c]!));
    const mags = back.map((p) => p.mag), fovs = back.map((p) => p.fov);
    expect(w[c]!.mag, `command ${c}`).toBeGreaterThanOrEqual(Math.min(...mags) - 1e-9);
    expect(w[c]!.mag, `command ${c}`).toBeLessThanOrEqual(Math.max(...mags) + 1e-9);
    expect(w[c]!.fov, `command ${c}`).toBeGreaterThanOrEqual(Math.min(...fovs) - 1e-9);
    expect(w[c]!.fov, `command ${c}`).toBeLessThanOrEqual(Math.max(...fovs) + 1e-9);
    expect(w[c]!.render.magnification).toBe(w[c]!.mag);
    // Settled: the owner unchanged over the last three commands -> the watcher is the owner, exactly.
    if (back.length === 3 && back.every((p) => p.mag === back[0]!.mag && discrete(p) === discrete(back[0]!))) {
      expect(w[c]!.mag, `settled at ${c}`).toBe(o[c]!.mag);
      expect(w[c]!.fov, `settled at ${c}`).toBe(o[c]!.fov);
      expect(discrete(w[c]!), `settled at ${c}`).toBe(discrete(o[c]!));
    }
  }
}

describe('PovLens follows the owner\'s Zoom from the wire\'s states', () => {
  it('0 -> 1 -> 5 on a scoped rifle, then out 5 -> 1 -> 0, on both clock phases', () => {
    for (const at of [10, 11]) {
      const o = owner(scope3, { [at]: ['in'], [at + 30]: ['in'], [at + 90]: ['out'], [at + 130]: ['out'] }, at + 180);
      expect(o.map((p) => p.state)).toContain(5);
      expectFollows(o, watcher(o));
    }
  });

  it('0 -> 1 -> 4 (the binoculars) for a one-mode weapon, and 4 -> 1 -> 0', () => {
    const o = owner(oneMode, { 5: ['in'], 30: ['in'], 90: ['out'], 120: ['out'] }, 160);
    expect(o[60]!.state).toBe(BINOCULARS);
    expectFollows(o, watcher(o));
  });

  it('1 -> 3 on a night map (the goggles), 3 -> 5 on a scoped rifle, 5 -> 3 -> 1 out', () => {
    const o = owner(scope3, { 4: ['in'], 30: ['in'], 60: ['in'], 120: ['out'], 150: ['out'], 180: ['out'] }, 220, true);
    expect(o[40]!.state).toBe(3);
    expect(o[90]!.state).toBe(5);
    const w = watcher(o, true);
    expectFollows(o, w);
    expect(w[40]!.view).toBe('nightvision');
  });

  it('a sniper to its last level, 1 -> 5 -> 6 (a further in stays: no wrap), and each step out 6 -> 5 -> 1 -> 0', () => {
    const o = owner(sniper, { 3: ['in'], 20: ['in'], 50: ['in'], 90: ['in'], 130: ['in'], 170: ['out'], 210: ['out'], 250: ['out'], 290: ['out'] }, 330);
    expect(Math.max(...o.map((p) => p.state))).toBe(6);
    expect(Math.max(...o.map((p) => p.mag))).toBe(12);
    expectFollows(o, watcher(o));
  });

  it('a zoom-in and a zoom-out on consecutive commands mid-run stay inside one snapshot of the owner', () => {
    const o = owner(sniper, { 3: ['in'], 20: ['in'], 30: ['in'], 31: ['out'], 70: ['out'], 71: ['out'] }, 120);
    expectFollows(o, watcher(o));
  });

  it('the thermal turret\'s twin, state 2, set directly: first person\'s 1.01, no far range, the thermal lens', () => {
    const o = owner(scope3, { 5: [{ set: 2 }], 60: [{ set: 1 }], 90: [{ set: 0 }] }, 120);
    const w = watcher(o);
    expectFollows(o, w);
    const p = new PovLens();
    p.tick({ ...still, view: 2, record: scope3, coneRecord: scope3, mapNight: false, alive: true });
    expect(p.lens()).toMatchObject({ state: 2, view: 'first', lens: viewLens(2, false, false) });
    expect(p.lens().lens).not.toBeNull();
  });

  it('the run\'s way is the state\'s: the binoculars (9x) to a 3x scope run IN (at 3 x 3 a second), not out', () => {
    const z = new Zoom(scope3);
    z.set(BINOCULARS); z.settle();
    const p = new PovLens();
    p.tick({ ...still, view: BINOCULARS, record: scope3, coneRecord: scope3, mapNight: false, alive: true });
    expect(p.magnification()).toBe(9);
    z.set(5); z.update(DT);
    p.tick({ ...still, view: 5, record: scope3, coneRecord: scope3, mapNight: false, alive: true });
    // The run's rate is 3 x the new target (9 a second), down from 9 to 3: the owner and the watcher take the same step.
    expect(z.magnification()).toBeCloseTo(9 - 9 * DT, 12);
    expect(p.magnification()).toBe(z.magnification());
    for (let i = 0; i < 60; i++) { z.update(DT); p.tick({ ...still, view: 5, record: scope3, coneRecord: scope3, mapNight: false, alive: true }); }
    expect(p.magnification()).toBe(3);
    expect(p.magnification()).toBe(z.magnification());
  });

  it('a weapon switch in a view: the watcher follows the owner\'s state and magnification', () => {
    // Scoped M4A1 SD (5, 3x) -> the sidearm (one mode): the owner's setWeapon drops the scope to 1.
    const a = owner(scope3, { 5: ['in'], 20: ['in'], 60: [{ weapon: HELD_SIDEARM }], 100: ['in'], 140: [{ weapon: sniper }], 180: ['in'] }, 220);
    expect(a[80]!.state).toBe(1);
    expect(a[120]!.state).toBe(BINOCULARS);
    expectFollows(a, watcher(a));
    // The goggles on a day map with a switch: off a night mission the switch drops 3 to 1 (only on a night-override
    // map do they reach 3 by day; here the night map keeps them, the binoculars stay through a switch).
    const b = owner(scope3, { 5: ['in'], 20: ['in'], 60: [{ weapon: HELD_SIDEARM }] }, 100, true);
    expect(b[80]!.state).toBe(3);
    expectFollows(b, watcher(b, true));
  });

  it('death: state 0 and 1.0 at once on both sides; respawn as Zoom.respawn', () => {
    const o = owner(sniper, { 3: ['in'], 20: ['in'], 50: ['in'], 61: ['die'], 100: [{ respawn: scope3 }], 120: ['in'], 150: ['in'] }, 200);
    const w = watcher(o);
    expectFollows(o, w);
    // At the first dead sample the watcher is at 1.0 -- no run out from 12.
    const deadAt = w.findIndex((p) => !p.alive);
    expect(o[deadAt - 1]!.mag).toBe(1);
    expect(w[deadAt]!.mag).toBe(1);
    expect(w[deadAt - 1]!.mag).toBeGreaterThan(1);
  });

  it('a state past 12, negative, NaN or not whole reads as 0', () => {
    for (const v of [13, 255, -1, NaN, 2.5, Infinity]) expect(povViewState(v)).toBe(0);
    for (let v = 0; v <= 12; v++) expect(povViewState(v)).toBe(v);
    const p = new PovLens();
    p.tick({ ...still, view: 200, record: sniper, coneRecord: sniper, mapNight: false, alive: true });
    expect([p.lens().state, p.magnification(), p.hudZoom()]).toEqual([0, 1, 0]);
  });

  it('renderView().farExtra is viewRangeExtra(state) for night vision, the binoculars and every scope level', () => {
    for (const [state, rec, night] of [[3, scope3, true], [BINOCULARS, oneMode, false], [5, sniper, false], [6, sniper, false], [7, sniper, false], [1, sniper, false], [0, sniper, false]] as const) {
      const p = new PovLens();
      p.tick({ ...still, view: state, record: rec, coneRecord: rec, mapNight: night, alive: true });
      expect(p.renderView().farExtra).toBe(viewRangeExtra(state));
    }
    expect(viewRangeExtra(3)).toBeGreaterThan(0);
  });

  it('the lens and the reticle\'s set, mode and tube come from the state and the weapon as the owner\'s page asks them', () => {
    const p = new PovLens();
    p.tick({ ...still, view: 5, record: sniper, coneRecord: sniper, mapNight: true, alive: true, thermal: true });
    expect(p.lens()).toEqual({ state: 5, view: 'scope', scopeLevel: 1, lens: viewLens(5, true, true) });
    const r = p.reticle();
    expect(r.mode).toBe('scope');
    expect(r.set).toBe(handReticleType(null, sniper.id, 5, 6));
    expect(r.size).toBeNull();                                      // scoped: no bloom
    expect(r.night).toBe(false);
    p.tick({ ...still, view: BINOCULARS, record: sniper, coneRecord: sniper, mapNight: true, alive: true });
    expect([p.reticle().mode, p.reticle().set, p.reticle().size]).toEqual(['binoculars', 7, null]);
    const q = new PovLens();
    q.tick({ ...still, view: 3, record: scope3, coneRecord: scope3, mapNight: true, alive: true });
    expect([q.reticle().mode, q.reticle().night, q.lens().lens]).toEqual(['reticle', true, 'goggles']);
    // The tube: set 0 laid in state 2 (a sidearm-class set on a THERMAL turret, matchFirearm's `setTube`).
    const t = new PovLens();
    t.tick({ ...still, view: 2, record: HELD_SIDEARM, coneRecord: HELD_SIDEARM, mapNight: false, alive: true });
    expect(t.reticle().tube).toBe(handReticleType(null, HELD_SIDEARM.id, 2, 1.01) === 0);
  });
});

describe('the bloom: the room\'s ShotCone model run on the watcher', () => {
  interface Step { view: number; yaw: number; pitch: number; velocity: [number, number, number]; airborne: boolean; posture: WeaponStanceName; trigger: boolean; shots: number }

  function script(): Step[] {
    const s: Step[] = [];
    for (let c = 0; c < 240; c++) {
      const moving = c >= 20 && c < 60;                      // a run
      const crouched = c >= 60 && c < 100;                   // a stance change
      const jumping = c >= 100 && c < 115;                   // a jump
      const firing = c >= 130 && c < 160;                    // a burst
      const scoped = c >= 180 && c < 210;                    // scoped: no bloom
      s.push({
        view: scoped ? 5 : c >= 170 && c < 220 ? 1 : 0,
        yaw: (c * (c >= 40 && c < 50 ? 2 : 0.2)) % 360, pitch: c >= 80 && c < 90 ? (c - 80) * 0.5 : 0,
        velocity: moving ? [30, 0, 0] : jumping ? [10, 20, 0] : [0, 0, 0], airborne: jumping,
        posture: crouched ? 'crouch' : 'stand', trigger: firing, shots: firing && c % 6 === 0 ? 1 : 0,
      });
    }
    return s;
  }

  it('a watcher fed the same per-command inputs and shots as a reference ShotCone draws its size at each command', () => {
    const ref = new ShotCone(scope3);
    const p = new PovLens();
    const z = new Zoom(scope3);
    let seq = 0, grew = false, moved = false;
    for (const st of script()) {
      seq++;
      z.set(st.view);
      const cmd: Command = {
        seq, forward: 0, right: 0, yaw: st.yaw, pitch: st.pitch, turn: 0, stance: 0, weapon: 0,
        buttons: (st.trigger ? Button.Trigger : 0) | (st.view >= 1 ? Button.Aim : 0) | (st.view >= 4 ? Button.Scope : 0) | (st.view === 4 ? Button.Binoculars : 0),
      };
      const m: AimMover = { feet: [0, 0, 0], velocity: st.velocity, airborne: st.airborne, posture: st.posture, moveRoot: null, peek: 0, weapon: 0, lookScale: z.lookScale() };
      ref.tick(cmd, m, seq);
      for (let i = 0; i < st.shots; i++) ref.round(seq);
      p.tick({ view: st.view, record: scope3, coneRecord: scope3, mapNight: false, alive: true, spawns: 0, yaw: st.yaw, pitch: st.pitch, velocity: st.velocity, airborne: st.airborne, posture: st.posture, trigger: st.trigger });
      for (let i = 0; i < st.shots; i++) p.shot();
      const r = p.reticle(), size = ref.state().size;
      if (st.view >= 4) expect(r.size).toBeNull();
      else {
        expect(r.size, `command ${seq}`).toBe(st.view === 0 ? size * 0.5 : size);
        expect(r.offset).toEqual(ref.state().offset);
      }
      if (st.shots && size > scope3.stances.stand.targetMin) grew = true;
      if (st.velocity[0] === 30 && size > scope3.stances.stand.targetMin) moved = true;
    }
    expect(grew).toBe(true);                                   // the test is not vacuous: the shots bloomed it
    expect(moved).toBe(true);                                  // and the run did
  });

  it('a weapon switch carries the kit to the new record, as the room\'s cone does (Accuracy.setWeapon)', () => {
    const ref = new ShotCone(scope3);
    const p = new PovLens();
    let seq = 0;
    for (let c = 0; c < 60; c++) {
      seq++;
      const rec = c < 30 ? scope3 : HELD_SIDEARM;
      ref.setWeapon(rec);
      ref.tick({ seq, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, stance: 0, weapon: 0, buttons: Button.Aim }, { feet: [0, 0, 0], velocity: [30, 0, 0], airborne: false, posture: 'stand', moveRoot: null, peek: 0, weapon: 0, lookScale: 1 }, seq);
      p.tick({ ...still, velocity: [30, 0, 0], view: 1, record: rec, coneRecord: rec, mapNight: false, alive: true });
      expect(p.reticle().size).toBe(ref.state().size);
    }
  });

  it('PV-7b: the third-person halving duplicated from Accuracy.reticle stays the live source\'s', () => {
    // PV-7b: `ShotCone` exposes no `reticle(zoomState)` (net/shotCone.ts:745 has `state()` only), so povLens.ts halves
    // the size in state 0 itself; this pins that against `Accuracy.reticle` (accuracy.ts:693-695).
    const a = new Accuracy(scope3);
    a.update(DT, { stance: 'stand', velocity: [30, 0, 0], airborne: false, yawRate: 0, pitchRate: 0, zoomState: 0 });
    expect(a.reticle(0).size).toBe(a.state().size * 0.5);
    for (let s = 1; s <= 3; s++) expect(a.reticle(s).size).toBe(a.state().size);
  });
});

describe('reset and the clock', () => {
  it('reset() returns to the rest state: third person, 1.0, no far range, the bloom at rest', () => {
    const p = new PovLens();
    for (let i = 0; i < 30; i++) p.tick({ ...still, velocity: [30, 0, 0], view: 6, record: sniper, coneRecord: sniper, mapNight: false, alive: true });
    p.shot();
    p.reset();
    expect([p.magnification(), p.hudZoom(), p.renderView(), p.lens().state, p.lens().view]).toEqual([1, 0, { magnification: 1, farExtra: 0 }, 0, 'third']);
    expect(p.fov(BASE_FOV)).toBeCloseTo(BASE_FOV, 12);
    expect(p.reticle().size).toBe(sniper.stances.stand.targetMin * 0.5);   // the room's cone at rest (ShotCone.reset)
    // The first sample after a reset is placed at once (the run's phase is unknown): a rebuild mid-scope is not a run.
    p.tick({ ...still, view: 6, record: sniper, coneRecord: sniper, mapNight: false, alive: true });
    expect(p.magnification()).toBe(12);
  });

  it('one tick is one command: the run advances by the command\'s time', () => {
    expect(POV_COMMAND_DT_ADAPTATION).toBe(1 / TICK_HZ);
  });

  it('a dead subject draws third person at rest whatever the wire says, and a respawn starts from rest', () => {
    const p = new PovLens();
    p.tick({ ...still, view: 5, record: scope3, coneRecord: scope3, mapNight: false, alive: true });
    p.tick({ ...still, view: 5, record: scope3, coneRecord: scope3, mapNight: false, alive: false });
    expect([p.lens().state, p.magnification(), p.reticle().size]).toEqual([0, 1, null]);
    p.tick({ ...still, view: 0, record: sniper, coneRecord: sniper, mapNight: false, alive: true });
    expect([p.lens().state, p.magnification(), p.reticle().size]).toEqual([0, 1, sniper.stances.stand.targetMin * 0.5]);
  });
});

// ---- PV-7a fix round (the review's F1-F3, F5) ----

describe('F1: the dropping scoped round (FUN_005c5340: a pull\'s second round scoped drops the view to 1)', () => {
  /** A scoped pull of two rounds on the M4A1 SD: round 1 at command 20 (the kick), round 2 at 26 (the drop: 1 from 27). */
  function runDrop(deliver: 'early' | 'late'): void {
    const ref = new ShotCone(scope3);
    const p = new PovLens();
    const z = new Zoom(scope3);
    const view = (c: number): number => (c < 10 ? 1 : c < 27 ? 5 : 1);
    const trigger = (c: number): boolean => (c >= 2 && c < 7) || (c >= 20 && c < 40);
    const rounds = new Set([2, 4, 6, 20, 26]);
    let pending: number | null = null;                         // the room decides a round once the command after ran
    let before: number | null = null;
    for (let c = 1; c < 60; c++) {
      z.set(view(c));
      const s = view(c);
      ref.tick({ seq: c, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, stance: 0, weapon: 0,
        buttons: (trigger(c) ? Button.Trigger : 0) | Button.Aim | (s >= 4 ? Button.Scope : 0) },
        { feet: [0, 0, 0], velocity: [0, 0, 0], airborne: false, posture: 'stand', moveRoot: null, peek: 0, weapon: 0, lookScale: z.lookScale() }, c);
      if (pending !== null) { ref.round(pending); pending = null; }
      p.tick({ ...still, view: s, record: scope3, coneRecord: scope3, mapNight: false, alive: true, trigger: trigger(c) });
      if (deliver === 'late' && rounds.has(c - 1)) p.shot();   // the event after the next command's body
      if (rounds.has(c)) { pending = c; if (deliver === 'early') p.shot(); }
      const r = p.reticle(), k = ref.state();
      // Unbloomed after the drop: the reticle only closes from the scoped command on (the dropping round blooms nothing).
      if (c >= 27 && c < 40) expect(r.size!, `${deliver} at ${c}: unbloomed after the drop`).toBeLessThanOrEqual(before!);
      if (c >= 27) expect(r.offset, `${deliver} at ${c}: the knock`).toEqual(k.offset);
      // The size is the room cone's: at once when the event comes with its command; when it comes a command later the
      // watcher blooms every round on the newest command, one command behind the room's own (the trace: 7.167 at 4
      // against the room's at 3), so equal once the bloom has closed.
      if (deliver === 'early' ? c >= 27 : c >= 45) expect(r.size, `${deliver} at ${c}`).toBe(k.size);
      before = r.size ?? k.size;                               // scoped: the room cone's size stands in
    }
  }
  it('the shot event before the state-1 command: the reticle after the drop is unbloomed, the knock the room cone\'s', () => runDrop('early'));
  it('the shot event after the state-1 command: the round is put on the last scoped command, unbloomed', () => runDrop('late'));
});

describe('F1 narrowed: only the drop state 1 moves a round back (matchFirearm: the drop sets 1)', () => {
  it('a scoped round, a hand zoom-out 5 -> 3 on a night map, a round in the same pull within 4 commands: on the newest command', () => {
    const ref = new ShotCone(scope3);
    const p = new PovLens();
    const z = new Zoom(scope3, true);
    const view = (c: number): number => (c < 5 ? 1 : c < 10 ? 3 : c < 24 ? 5 : 3);
    const trigger = (c: number): boolean => c >= 20 && c < 40;
    const rounds = new Set([20, 25]);
    let pending: number | null = null, before = 0;
    for (let c = 1; c < 50; c++) {
      const s = view(c);
      z.set(s);
      ref.tick({ seq: c, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, stance: 0, weapon: 0,
        buttons: (trigger(c) ? Button.Trigger : 0) | Button.Aim | (s >= 4 ? Button.Scope : 0) },
        { feet: [0, 0, 0], velocity: [0, 0, 0], airborne: false, posture: 'stand', moveRoot: null, peek: 0, weapon: 0, lookScale: z.lookScale() }, c);
      if (pending !== null) { ref.round(pending); pending = null; }
      p.tick({ ...still, view: s, record: scope3, coneRecord: scope3, mapNight: true, alive: true, trigger: trigger(c) });
      if (c === 24) before = p.reticle().size!;
      if (rounds.has(c)) { pending = c; p.shot(); }       // the event with its command (the newest is 25, state 3)
      if (c >= 26) expect(p.reticle().size, `at ${c}`).toBe(ref.state().size);
    }
    expect(ref.state().size).toBe(scope3.stances.stand.targetMin);   // closed again by the end
    expect(before).toBe(scope3.stances.stand.targetMin);
  });
});

describe('F2: a spawn without a death (a classic round\'s start: Zoom.respawn, the kit at rest)', () => {
  it('alive in state 6, the spawn count rises with the state 0 on the same command: 1.0 at once and the rest bloom', () => {
    const p = new PovLens();
    for (let i = 0; i < 40; i++) {
      p.tick({ ...still, velocity: [30, 0, 0], view: i < 20 ? 1 : 6, record: sniper, coneRecord: sniper, mapNight: false, alive: true, trigger: i > 5 && i < 12 });
      if (i === 8 || i === 10) p.shot();
    }
    expect(p.magnification()).toBe(12);
    p.tick({ ...still, view: 0, record: sniper, coneRecord: sniper, mapNight: false, alive: true, spawns: 1 });
    expect([p.lens().state, p.magnification()]).toEqual([0, 1]);
    expect(p.reticle().size).toBe(sniper.stances.stand.targetMin * 0.5);
  });
});

describe('F3: the zoom\'s record and the cone\'s record are two inputs', () => {
  // A turret record whose rows differ from the firearm's (a fixture: only the cone's record is under test).
  const row = { ...HELD_SIDEARM.stances.stand, targetMin: 3, targetMax: 40 };
  const turret: WeaponRecord = { ...HELD_SIDEARM, id: 205, zoomModes: [1], stances: { stand: row, crouch: row, prone: row } };
  it('an item up: the firearm\'s record in both -> the cone\'s size is the reference\'s', () => {
    const ref = new ShotCone(scope3);
    const p = new PovLens();
    for (let c = 1; c < 40; c++) {
      ref.tick({ seq: c, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, stance: 0, weapon: 0, buttons: 0 },
        { feet: [0, 0, 0], velocity: [30, 0, 0], airborne: false, posture: 'stand', moveRoot: null, peek: 0, weapon: 0, lookScale: 1 }, c);
      p.tick({ ...still, velocity: [30, 0, 0], view: 0, record: scope3, coneRecord: scope3, mapNight: false, alive: true, itemUp: true });
      expect(p.reticle().size).toBe(ref.state().size * 0.5);
    }
  });
  it('mounted: the turret\'s record in the cone only; the zoom keeps the firearm\'s', () => {
    const ref = new ShotCone(turret);
    const p = new PovLens();
    for (let c = 1; c < 40; c++) {
      ref.tick({ seq: c, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, stance: 0, weapon: 0, buttons: Button.Aim },
        { feet: [0, 0, 0], velocity: [30, 0, 0], airborne: false, posture: 'stand', moveRoot: null, peek: 0, weapon: 0, coneStance: 'stand', turret: 205, lookScale: 1 }, c);
      p.tick({ ...still, velocity: [30, 0, 0], view: 1, record: sniper, coneRecord: turret, mapNight: false, alive: true, coneStance: 'stand', turret: 205 });
      expect(p.reticle().size).toBe(ref.state().size);
    }
    expect(new ShotCone(turret).state().size).not.toBe(new ShotCone(sniper).state().size);   // not vacuous: the rows differ
    p.tick({ ...still, view: 5, record: sniper, coneRecord: turret, mapNight: false, alive: true, turret: 205 });
    expect(p.hudZoom()).toBe(6);                               // the firearm's ZoomMode[1], not the turret's
  });
});

describe('F5: the owner at 30, 60 and 144 frames a second, frames not aligned to commands', () => {
  type Press = { t: number; act: Act };
  interface Run { cmd: Picture[]; frames: { t: number; mag: number }[] }

  /** The owner's page: frames of 1/hz from a phase, the presses at their frames, `update` each frame. */
  function ownerFrames(first: WeaponRecord, presses: readonly Press[], commands: number, hz: number, phase: number): Run {
    const z = new Zoom(first);
    let record = first, alive = true, i = 0;
    const fdt = 1 / hz, frames: { t: number; mag: number }[] = [{ t: -1, mag: 1 }], cmd: Picture[] = [];
    let t = phase * fdt;
    for (let c = 0; c < commands; c++) {
      const tc = c * DT;
      while (t <= tc + 1e-12) {
        while (i < presses.length && presses[i]!.t <= t + 1e-12) {
          const a = presses[i++]!.act;
          if (a === 'in') z.zoomIn(); else if (a === 'out') z.zoomOut(); else if (a === 'die') { z.reset(); alive = false; }
          else if ('weapon' in a) { record = a.weapon; z.setWeapon(a.weapon); }
          else if ('respawn' in a) { record = a.respawn; z.respawn(a.respawn); alive = true; } else z.set(a.set);
        }
        z.update(fdt);
        frames.push({ t, mag: z.magnification() });
        t += fdt;
      }
      cmd.push({ state: z.state(), alive, record, mag: z.magnification(), fov: z.fov(BASE_FOV), render: z.renderView(), hud: z.hudZoom(), view: z.view() });
    }
    return { cmd, frames };
  }

  /**
   * The fewest commands k such that the watcher's magnification lies within the owner's over [(c - k) DT, (c + 1) DT]:
   * behind by k, or ahead by at most one command's step (the watcher steps a whole command at the state's first
   * command, where the owner has run only the frames since its press).
   */
  function lagOf(run: Run, c: number, mag: number): number {
    for (let k = 0; k <= 30; k++) {
      const lo = (c - k) * DT, hi = (c + 1) * DT;
      let held = run.frames[0]!.mag;
      const vals: number[] = [];
      for (const f of run.frames) { if (f.t <= lo + 1e-12) held = f.mag; else if (f.t <= hi + 1e-12) vals.push(f.mag); }
      vals.push(held);
      if (mag >= Math.min(...vals) - 1e-9 && mag <= Math.max(...vals) + 1e-9) return k;
    }
    return Infinity;
  }

  /** The fewest commands m such that the watcher's magnification lies within the owner's over [(c - m) DT, (c + m) DT]. */
  function spreadOf(run: Run, c: number, mag: number): number {
    for (let m = 0; m <= 30; m++) {
      const lo = (c - m) * DT, hi = (c + m) * DT;
      let held = run.frames[0]!.mag;
      const vals: number[] = [];
      for (const f of run.frames) { if (f.t <= lo + 1e-12) held = f.mag; else if (f.t <= hi + 1e-12) vals.push(f.mag); }
      vals.push(held);
      if (mag >= Math.min(...vals) - 1e-9 && mag <= Math.max(...vals) + 1e-9) return m;
    }
    return Infinity;
  }

  function measure(first: WeaponRecord, presses: readonly Press[], commands: number, hz: number, phase: number, two = false): number {
    const run = ownerFrames(first, presses, commands, hz, phase);
    const w = watcher(run.cmd);
    let worst = 0;
    for (let c = 0; c < commands; c++) {
      worst = Math.max(worst, two ? spreadOf(run, c, w[c]!.mag) : lagOf(run, c, w[c]!.mag));
      const back = [0, 1, 2].filter((d) => c - d >= 0).map((d) => run.cmd[c - d]!.state);
      expect(back, `${hz} Hz command ${c}`).toContain(w[c]!.state);
      // Settled: the owner unchanged over the last 6 commands -> the watcher is the owner, exactly.
      if (c >= 6 && run.cmd.slice(c - 6, c + 1).every((p) => p.mag === run.cmd[c]!.mag && p.state === run.cmd[c]!.state)) {
        expect(w[c]!.mag, `${hz} Hz settled at ${c}`).toBe(run.cmd[c]!.mag);
        expect(w[c]!.hud).toBe(run.cmd[c]!.hud);
        expect(w[c]!.render.farExtra).toBe(run.cmd[c]!.render.farExtra);
      }
    }
    return worst;
  }

  const table: [string, WeaponRecord, Press[]][] = [
    ['scope 0-1-5-1-0', scope3, [{ t: 0.1, act: 'in' }, { t: 0.6, act: 'in' }, { t: 1.6, act: 'out' }, { t: 2.3, act: 'out' }]],
    ['binoculars 0-1-4-1-0', oneMode, [{ t: 0.1, act: 'in' }, { t: 0.6, act: 'in' }, { t: 1.6, act: 'out' }, { t: 2.3, act: 'out' }]],
    ['sniper 0-1-5-6-5-1-0', sniper, [{ t: 0.1, act: 'in' }, { t: 0.5, act: 'in' }, { t: 0.9, act: 'in' }, { t: 1.6, act: 'out' }, { t: 2.2, act: 'out' }, { t: 2.8, act: 'out' }]],
    ['switch and death', scope3, [{ t: 0.1, act: 'in' }, { t: 0.5, act: 'in' }, { t: 1.2, act: { weapon: HELD_SIDEARM } }, { t: 1.7, act: 'in' }, { t: 2.3, act: 'die' }, { t: 2.8, act: { respawn: sniper } }]],
  ];

  it('the transition table: at most 3 commands behind (one snapshot plus one command) or one ahead, equal once settled', () => {
    const worst: Record<string, number> = {};
    for (const hz of [30, 60, 144]) for (const phase of [0, 0.37, 0.81]) for (const [name, rec, presses] of table) {
      const k = measure(rec, presses, 240, hz, phase);
      worst[`${hz}`] = Math.max(worst[`${hz}`] ?? 0, k);
      expect(k, `${name} at ${hz} Hz, phase ${phase}`).toBeLessThanOrEqual(3);
    }
    expect(worst).toEqual(TABLE_MEASURED);
  });

  it('the near-miss: 6 -> 5 -> 1 on a sniper, the second press within a frame of the first run\'s end', () => {
    // 12x -> 6x out runs at 3 x 12 a second (1/6 s); 5 -> 1 then runs at max(the running rate, 3 x 6): 36 if the first
    // run has not ended, 18 once it has (the stepper zeroes the rate on arrival, zoom.ts `update`).
    const worst: Record<string, number> = {};
    for (const hz of [30, 60, 144]) for (const phase of [0, 0.37, 0.81]) for (const off of [-2, -1, -0.5, 0, 0.5, 1, 2]) {
      const t1 = 1.0, t2 = t1 + 1 / 6 + off / hz;
      const k = measure(sniper, [{ t: 0.1, act: 'in' }, { t: 0.4, act: 'in' }, { t: 0.7, act: 'in' }, { t: t1, act: 'out' }, { t: t2, act: 'out' }], 120, hz, phase, true);
      worst[`${hz}`] = Math.max(worst[`${hz}`] ?? 0, k);
      expect(k, `${hz} Hz, phase ${phase}, offset ${off} frames`).toBeLessThanOrEqual(NEAR_MISS_BOUND);
    }
    expect(worst).toEqual(NEAR_MISS_MEASURED);
  });
});

/** The near-miss's bound in commands, as measured (the report's number). */
const NEAR_MISS_BOUND = 9;
/** The worst offsets measured, by owner frame rate (commands): the table's lag, the near-miss's two-sided spread. */
const TABLE_MEASURED: Record<string, number> = { '30': 2, '60': 1, '144': 2 };
const NEAR_MISS_MEASURED: Record<string, number> = { '30': 2, '60': 8, '144': 9 };
