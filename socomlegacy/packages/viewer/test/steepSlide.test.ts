import { describe, expect, it } from 'vitest';
import type { Command } from '../src/net/protocol';
import {
  SLIDE_DISC_SURFACE_KIND, SLIDE_SPAN_MEASURE_READING, SLIDE_SPAN_MIN, slideEligible, slideSpanOf, slideStep, steepGroundFrame,
} from '../src/steepSlide';
import { SEAL_TUNING_DEFAULTS } from '../src/physics';
import { poly, scene, still } from './parity/world';

/** A floor rising along +x (physics.test.ts's `up`): downhill is −x. */
function up(degrees: number): [number, number, number] {
  const a = (degrees * Math.PI) / 180;
  return [-Math.sin(a), Math.cos(a), 0];
}

/** One plane, y = 0 at x = 0 and y = height at x = run, so the vertical span is `height`. */
function ramp(height: number, degrees: number, ditype = 3) {
  const run = height / Math.tan(degrees * Math.PI / 180);
  const q = scene([poly('slope', [0, 0, -20, run, height, -20, run, height, 20, 0, 0, 20], ditype)]);
  const x = run * 0.5, y = height * 0.5;
  expect(q.walker.place(x, y + 1, 0)).toBe(true);
  return q;
}

describe('steep-ground slide (research 201 §3, §27.3)', () => {
  const g = SEAL_TUNING_DEFAULTS.gravity, dt = 1 / 60, a60 = (60 * Math.PI) / 180;
  const n60 = up(60);

  it('from rest on 60°, thirty ticks reach g/4 and the clip', () => {
    let speed = 0, clip = false;
    for (let i = 0; i < 29; i++) ({ speed, clip } = slideStep(speed, n60, dt, 0, 0, g));
    expect(clip).toBe(false);
    ({ speed, clip } = slideStep(speed, n60, dt, 0, 0, g));
    expect(speed).toBeCloseTo(g / 4, 6);
    expect(clip).toBe(true);
  });

  it('projects the entry velocity once, then only accelerates, and displaces downhill', () => {
    const first = slideStep(0, n60, dt, -10, 0, g);
    const gain = (1 - Math.cos(a60)) * g * dt;
    // The fall line's horizontal part has length n_y, so the entry is n_y · (v_h · ĥ): 5 on 60°, not 10.
    expect(first.speed).toBeCloseTo(10 * Math.cos(a60) + gain, 6);
    expect(first.dx).toBeLessThan(0);
    expect(first.dz).toBeCloseTo(0, 8);
    const later = slideStep(first.speed, n60, dt, 80, 0, g);
    expect(later.speed).toBeCloseTo(first.speed + gain, 6);
  });

  it('kind 1 never slides; kind 0 slides on flat ground; a 3-tall face is prone-only; no extent slides', () => {
    const steep = Math.cos((51 * Math.PI) / 180);
    expect(slideEligible(steep, 40, false, 1)).toBe(false);
    expect(slideEligible(1, 0, false, 0)).toBe(true);
    expect(slideEligible(1, 40, false, SLIDE_DISC_SURFACE_KIND)).toBe(false);
    expect(slideEligible(steep, 3, false)).toBe(false);
    expect(slideEligible(steep, 3, true)).toBe(true);
    expect(slideEligible(steep, SLIDE_SPAN_MIN, false)).toBe(true);
    expect(slideEligible(steep, null, false)).toBe(true);
    expect(slideEligible(Math.cos((49 * Math.PI) / 180), 40, false)).toBe(false);
    expect(steepGroundFrame({
      normalY: steep, normal: up(51), span: 3, prone: false, speed: 0, dt, vx: 0, vz: 0,
    }).sliding).toBe(false);
  });

  it(`measures span by ${SLIDE_SPAN_MEASURE_READING}`, () => {
    const points = [0, 0, -1, 2, 3, -1, 2, 3, 1, 0, 0, 1];
    expect(slideSpanOf(points, 1, 0, 'vertices')).toBe(3);
    // A planar quad: the feet's column meets the high and low edges, so the span is the full height.
    expect(slideSpanOf(points, 1, 0, 'column')).toBe(3);
    expect(slideSpanOf(points, 10, 10, 'column')).toBeNull();
    expect(SLIDE_SPAN_MEASURE_READING).toBe('column');
  });

  it('a standing body on a 60° face at least 4 tall reaches the clip speed; the stick does not climb it', () => {
    const s = ramp(40, 60, 1);
    const start = s.walker.state.x;
    for (let i = 0; i < 30; i++) s.walker.tick(still);
    expect(s.walker.state.x).toBeLessThan(start);
    // The quad's unit normal is a hair off cos 60°, so tick 30 lands on g/4 within 1e-4 and the clip is the next compare.
    expect(s.walker.slideSpeed).toBeCloseTo(g / 4, 4);
    expect(s.walker.slideClip).toBe(s.walker.slideSpeed >= g / 4);
    if (!s.walker.slideClip) s.walker.tick(still);
    expect(s.walker.slideClip).toBe(true);
    expect(s.walker.action).toBeNull();
    const pushed = ramp(40, 60, 1);
    pushed.walker.state.yaw = -90;
    const at = pushed.walker.state.x;
    for (let i = 0; i < 15; i++) pushed.walker.tick({ forward: 1, right: 0, boost: false });
    expect(pushed.walker.state.x).toBeLessThan(at);
  });

  it('a 3-tall steep face holds a standing body and slides a prone one; 4 tall slides standing', () => {
    const stand = ramp(3, 60, 1);
    const at = stand.walker.state.x;
    for (let i = 0; i < 30; i++) stand.walker.tick(still);
    expect(stand.walker.state.x).toBeCloseTo(at, 6);
    expect(stand.walker.slideSpeed).toBe(0);
    const prone = ramp(3, 60, 1);
    prone.walker.stance = 'prone';
    const from = prone.walker.state.x;
    prone.walker.tick(still);
    expect(prone.walker.slideSpeed).toBeGreaterThan(0);
    expect(prone.walker.state.x).toBeLessThan(from);
    const tall = ramp(4, 60, 1);
    const foot = tall.walker.state.x;
    tall.walker.tick(still);
    expect(tall.walker.state.x).toBeLessThan(foot);
  });

  it('leaving onto gentler ground faster than land_fall_rate is a landing, and the swap is refused while sliding', () => {
    const degrees = 60, run = 6, height = run * Math.tan(degrees * Math.PI / 180);
    const s = scene([
      poly('flat', [-40, 0, -40, 2, 0, -40, 2, 0, 40, -40, 0, 40], 1),
      poly('slope', [0, 0, -20, run, height, -20, run, height, 20, 0, 0, 20], 1),
    ]);
    const x = run * 0.85, y = x * Math.tan(degrees * Math.PI / 180);
    expect(s.walker.place(x, y + 1, 0)).toBe(true);
    s.walker.tick(still);
    expect(s.walker.swapWeapon('pistol')).toBeNull();
    let landing = s.walker.landing;
    for (let i = 0; i < 80 && !landing; i++) {
      s.walker.tick(still);
      landing = s.walker.landing;
    }
    expect(landing).not.toBeNull();
    expect(landing!.speed).toBeGreaterThan(SEAL_TUNING_DEFAULTS.land_fall_rate);
    expect(landing!.speed).toBeLessThan(SEAL_TUNING_DEFAULTS.land_hard_fall_rate);
    expect(landing!.kind).toBe('hard');
    expect(landing!.clip).toBe('land');
    expect(s.walker.slideSpeed).toBe(0);
    expect(s.walker.state.x).toBeLessThan(x);
  });

  it('a wall across a 60° ramp stops the body and clears the slide speed', () => {
    const degrees = 60, height = 40;
    const run = height / Math.tan(degrees * Math.PI / 180);
    const wallX = 8;
    const s = scene([
      poly('slope', [0, 0, -20, run, height, -20, run, height, 20, 0, 0, 20], 1),
      poly('wall', [wallX, -10, -30, wallX, -10, 30, wallX, 80, 30, wallX, 80, -30], 2),
    ]);
    const x = run * 0.75, y = x * Math.tan(degrees * Math.PI / 180);
    expect(s.walker.place(x, y + 1, 0)).toBe(true);
    s.walker.state.yaw = -90;
    for (let i = 0; i < 180; i++) s.walker.tick(still);
    const stopped = s.walker.state.x;
    expect(stopped).toBeGreaterThan(wallX);
    expect(stopped).toBeLessThan(x);
    // FUN_005483d0 zeroes the speed when the resolved y is in [0, 0.01), so it does not keep climbing.
    expect(s.walker.slideSpeed).toBe(0);
    const yStopped = s.walker.state.y;
    for (let i = 0; i < 60; i++) s.walker.tick({ forward: 1, right: 0, boost: false });
    expect(s.walker.state.x).toBeCloseTo(stopped, 4);
    expect(s.walker.state.y).toBeCloseTo(yStopped, 4);
    expect(s.walker.swapWeapon('pistol')).not.toBeNull();
  });

  it('a grenade throw started mid-slide keeps moving downhill', () => {
    const s = ramp(40, 60, 1);
    for (let i = 0; i < 10; i++) s.walker.tick(still);
    const speed = s.walker.slideSpeed, x = s.walker.state.x;
    expect(speed).toBeGreaterThan(10);
    expect(s.walker.hold('seal_throwgrenade')).toBe(true);
    for (let i = 0; i < 20; i++) s.walker.tick(still);
    expect(s.walker.holding?.clip).toBe('seal_throwgrenade');
    expect(s.walker.state.x).toBeLessThan(x);
    expect(s.walker.slideSpeed).toBeGreaterThan(speed);
  });

  it('the slide exit lands without the 0.4 s jump lock, and a slow push still soft-lands', () => {
    const off = (stick: number) => {
      const degrees = 60, run = 6, height = run * Math.tan(degrees * Math.PI / 180);
      const s = scene([
        poly('flat', [-40, 0, -40, 2, 0, -40, 2, 0, 40, -40, 0, 40], 1),
        poly('slope', [0, 0, -20, run, height, -20, run, height, 20, 0, 0, 20], 1),
      ]);
      const x = run * 0.85, y = x * Math.tan(degrees * Math.PI / 180);
      expect(s.walker.place(x, y + 1, 0)).toBe(true);
      const input = { forward: stick, right: 0, boost: false };
      let landing = s.walker.landing;
      for (let i = 0; i < 80 && !landing; i++) {
        s.walker.tick(input);
        landing = s.walker.landing;
      }
      return { s, landing };
    };
    // Not idle (past 0.03) but under 20 u/s, so FUN_005af590's slow-velocity branch still plays Jump land.
    const slow = off(0.25);
    expect(slow.landing).not.toBeNull();
    expect(slow.landing!.clip).toBe('land');
    // A full stick plays no clip, and this exit does not write the airborne landing's jump lock.
    const pushed = off(1);
    expect(pushed.landing).not.toBeNull();
    expect(pushed.landing!.clip).toBeNull();
    pushed.s.walker.tick({ forward: 1, right: 0, boost: false });
    expect(pushed.s.walker.jump()).toBe(true);
  });

  it('the room sim and a direct tick take the same slide', () => {
    const page = ramp(40, 60, 1), room = ramp(40, 60, 1);
    const cmd = (seq: number): Command => ({ seq, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 });
    for (let i = 0; i < 20; i++) {
      page.walker.tick(still);
      room.sim.apply(cmd(i + 1));
    }
    expect(room.walker.state.x).toBeCloseTo(page.walker.state.x, 6);
    expect(room.walker.state.y).toBeCloseTo(page.walker.state.y, 6);
    expect(room.walker.state.z).toBeCloseTo(page.walker.state.z, 6);
    expect(room.walker.slideSpeed).toBeCloseTo(page.walker.slideSpeed, 6);
  });
});
