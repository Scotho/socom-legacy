import { describe, expect, it } from 'vitest';
import { HostageSteering, routeProjection, passedRoutePoint, steeringDirection } from '../src/hostageSteering';

describe('original AI route steering (research 334)', () => {
  it('direct recovery uses independent forward/side PD commands with mode4 slew and no target-facing turn', () => {
    const s = new HostageSteering();
    const out = s.directStep(1 / 30, { yaw: 0, dx: 10, dz: -10, throttle: 1, radius: 3 });
    expect(out.forward).toBeCloseTo(.44999998807907104 / 30);
    expect(out.side).toBeCloseTo(.3499999940395355 / 30);
    expect(out.yaw).toBe(0);
    expect(out.arrived).toBe(false);
    expect(s.directStep(1 / 30, { yaw: 0, dx: 0, dz: -3, throttle: 1, radius: 3 }).arrived).toBe(true);
  });
  it('slews the turn instead of snapping the body to a perpendicular route', () => {
    const out = new HostageSteering().step(1 / 30, { yaw: 0, dx: 100, dz: 0, throttle: 1, final: false, link: false });
    expect(out.yaw).toBeCloseTo(-(8 / 30) * 2 / 30 * 180 / Math.PI, 5);
    expect(out.forward).toBeCloseTo(0.03, 6);
  });
  it('gates forward travel at a nearby point behind the body', () => {
    const out = new HostageSteering().step(1 / 30, { yaw: 0, dx: 0, dz: 20, throttle: 1, final: false, link: false });
    expect(out.forward).toBe(0);
    expect(out.yaw).not.toBe(0);
  });
  it('brakes at the final point while links request .35 before the command slew', () => {
    const s = new HostageSteering();
    for (let i = 0; i < 60; i++) s.step(1 / 30, { yaw: 0, dx: 0, dz: -100, throttle: 1, final: false, link: false });
    expect(s.step(1 / 30, { yaw: 0, dx: 0, dz: -1, throttle: 1, final: true, link: false }).forward).toBeLessThan(0);
    const link = new HostageSteering();
    for (let i = 0; i < 120; i++) link.step(1 / 30, { yaw: 0, dx: 0, dz: -100, throttle: 1, final: false, link: true });
    expect(link.forward).toBeCloseTo(.35, 6);
  });
  it('only projects strictly inside the segment and detects passed points with the source gates', () => {
    expect(routeProjection([0, 0], [10, 0], [5, 3])).toEqual({ point: [5, 0], distance: 3 });
    expect(routeProjection([0, 0], [10, 0], [10, 3])).toBeNull();
    expect(passedRoutePoint(1, -0.1, 2, false)).toBe(false);
    expect(passedRoutePoint(1, -0.1, 2, true)).toBe(true);
    expect(passedRoutePoint(0, -0.1, 1, true)).toBe(false);
  });
  it('adds capped local lateral correction beyond 5.5 units and decays the previous perturbation', () => {
    const s = new HostageSteering();
    expect(s.lateral(1 / 30, 0, [6, 0])).toBe(5);
    expect(s.lateral(1 / 30, 0, [6, 0])).toBe(9);
    expect(s.lateral(1 / 30, 0, [5.5, 0])).toBeCloseTo(7.2);
    expect(new HostageSteering().lateral(1 / 30, 0, [-6, 0])).toBe(-5);
  });
});

it('transforms both controller commands for the hull obstacle direction', () => {
  expect(steeringDirection(0, 0, 1)[0]).toBe(1);
  expect(steeringDirection(0, 0, 1)[1]).toBeCloseTo(0);
  const [x, z] = steeringDirection(90, 1, 1);
  expect(x).toBeCloseTo(-1); expect(z).toBeCloseTo(-1);
});

it('hang clears side/turn and supplies the original quarter-forward only when forward is zero', () => {
  const s = new HostageSteering(); s.side=.4; s.turn=2; s.hang();
  expect([s.forward,s.side,s.turn]).toEqual([.25,0,0]);
  s.forward=-.2; s.hang(); expect(s.forward).toBe(-.2);
});
it('hang permits forward acceleration despite a nearby target behind the actor', () => {
  const s = new HostageSteering();
  const out = s.step(1/30,{yaw:0,dx:0,dz:10,throttle:1,final:false,link:false,hanging:true});
  expect(out.forward).toBeGreaterThan(0); expect(out.yaw).toBe(0);
});
