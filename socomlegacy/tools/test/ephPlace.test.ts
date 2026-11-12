import { describe, expect, it } from 'vitest';
import { RAISE_ADDRESSES } from '../eph/raise';
import { bearingYaw, identifiedCount, outOfReach, parsePlaceArgs, parsePlacement, parseScout, placeOnLine } from '../eph/place';

/**
 * The enemy-raise O-runs' placement (CAPTURE-JOB.md "Tonight's subset"; product track, an instrument): the player put
 * on the line from a still enemy post through its own start, `factor` x the perception reach from the post, facing the
 * post. Pure geometry; the yaw is the EPH yaw the rig's walker turns to, `atan2(-dx, -dz)` in degrees, 0..360
 * (the 2026-11-01 rig's M51 walker, `goto`'s bearing; M51-ROUTE.md section 0 as it cites).
 */
describe('the O-runs placement', () => {
  it('puts the spot factor x reach from the target, on the far side along the target -> start line', () => {
    const p = placeOnLine({ x: 0, z: 0 }, { x: 0, z: 100 }, 200, 1.5);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.z).toBeCloseTo(300, 6);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(300, 6);
  });

  it('faces the target from the spot (EPH yaw: atan2(-dx, -dz), degrees in 0..360)', () => {
    // the target due -z of the spot: dx 0, dz -300 -> atan2(0, 300) = 0
    expect(bearingYaw({ x: 0, z: 300 }, { x: 0, z: 0 })).toBeCloseTo(0, 6);
    // the target due +z: atan2(-0, -300) -> 180
    expect(bearingYaw({ x: 0, z: -300 }, { x: 0, z: 0 })).toBeCloseTo(180, 6);
    // the target due +x of the spot: atan2(-300, 0) = -90 -> 270
    expect(bearingYaw({ x: -300, z: 0 }, { x: 0, z: 0 })).toBeCloseTo(270, 6);
    expect(bearingYaw({ x: 300, z: 0 }, { x: 0, z: 0 })).toBeCloseTo(90, 6);
  });

  it('places M51 slot 5 against the still post the idle rows read (target 0x1b52370), 1.5 x reach out, facing it', () => {
    const target = { x: 835.9, z: 1574.8 };
    const start = { x: 938.2, z: 858.2 };   // slot 5's start as place-1 read it
    const p = placeOnLine(target, start, 807.5, 1.5);
    expect(Math.hypot(p.x - target.x, p.z - target.z)).toBeCloseTo(1211.25, 3);
    // the spot lies beyond the start, on the same side of the post
    expect(Math.hypot(p.x - target.x, p.z - target.z)).toBeGreaterThan(Math.hypot(start.x - target.x, start.z - target.z));
    // facing the post from the spot: the post lies +z of the spot, so the yaw is near 180, slot 5's own facing (the rig walker: "the state faces yaw 180")
    const yaw = bearingYaw(p, target);
    const back = (Math.atan2(-(target.x - p.x), -(target.z - p.z)) * 180) / Math.PI;
    expect(yaw).toBeCloseTo(((back % 360) + 360) % 360, 6);
    expect(Math.abs(yaw - 180)).toBeLessThan(15);
  });

  it('refuses a start on the target (no line)', () => {
    expect(() => placeOnLine({ x: 1, z: 1 }, { x: 1, z: 1 }, 100, 1.5)).toThrow(/no line/);
  });

  it('reads the placement data file and refuses a missing field', () => {
    const ok = parsePlacement(JSON.stringify({ map: 'M51', build: 'r0004', fromState: 5, saveSlot: 9, target: { id: '0x1b52370', x: 835.9, y: -128.2, z: 1574.8 }, reach: 807.5, factors: [1.5, 1.8, 2.1] }));
    expect(ok.factors).toEqual([1.5, 1.8, 2.1]);
    expect(() => parsePlacement(JSON.stringify({ map: 'M51' }))).toThrow(/target/);
  });

  it('counts a second out of reach only when every eligible row reads the count 0', () => {
    expect(outOfReach([0, 0, 0, 0])).toBe(true);
    expect(outOfReach([0, 1, 0])).toBe(false);
    expect(outOfReach([])).toBe(false);
  });

  it('reads --scout offsets and refuses a malformed one', () => {
    expect(parseScout('-20,0;20,-15.5')).toEqual([{ dx: -20, dz: 0 }, { dx: 20, dz: -15.5 }]);
    expect(() => parseScout('20')).toThrow(/dx,dz/);
    expect(() => parseScout('1,2,3')).toThrow(/dx,dz/);
    expect(() => parseScout('a,2')).toThrow(/dx,dz/);
  });

  it('reads its switches: --placement and --out required, --scout checked, --hold in (0, 80] (default 7)', () => {
    expect(parsePlaceArgs(['--placement', 'p.json', '--out', 'o'])).toEqual({ file: 'p.json', out: 'o', scout: null, holdS: 7 });
    expect(parsePlaceArgs(['--placement', 'p.json', '--out', 'o', '--scout', '-20,0;20,-15', '--hold', '30'])).toEqual({ file: 'p.json', out: 'o', scout: '-20,0;20,-15', holdS: 30 });
    expect(() => parsePlaceArgs(['--placement', 'p.json'])).toThrow(/usage: place\.ts .*--scout .*--hold/);
    expect(() => parsePlaceArgs(['--placement', 'p.json', '--out', 'o', '--scout', '20'])).toThrow(/dx,dz/);
    expect(() => parsePlaceArgs(['--placement', 'p.json', '--out', 'o', '--hold', '0'])).toThrow(/--hold/);
    expect(() => parsePlaceArgs(['--placement', 'p.json', '--out', 'o', '--hold', '81'])).toThrow(/--hold/);
  });

  it("refuses --teleport outright (the batch review F1: the rig's seven-copy write and a destination ground height are owed)", () => {
    expect(() => parsePlaceArgs(['--placement', 'p.json', '--out', 'o', '--teleport'])).toThrow(/--teleport.*not supported.*seven-copy write.*ground height.*walk instead/);
    expect(() => parsePlaceArgs(['--teleport'])).toThrow(/not supported/);   // refused before the usage, nothing booted
  });

  it('reads the identified-enemy count only while the gate byte is set: -1 at gate 0 (a stale count) or a null pointer', async () => {
    const R = RAISE_ADDRESSES.r0004;
    const BODY = 0x01c00000, CTRL = 0x01c10000;
    const words = new Map<number, number>([[R.localBody, BODY], [BODY + R.bodyCtrl, CTRL], [CTRL + R.ctrlCount, 0]]);
    let gate = 1;
    const reads: number[] = [];
    const g = {
      read32: async (a: number): Promise<number> => { reads.push(a); return words.get(a) ?? 0; },
      read8: async (a: number): Promise<number> => { reads.push(a); return a === R.gate ? gate : 0; },
    };
    expect(await identifiedCount(g, R)).toBe(0);
    words.set(CTRL + R.ctrlCount, 2);
    expect(await identifiedCount(g, R)).toBe(2);
    // a paused or results-screen frame: the gate 0 and the count left at 0 -- never a second out of reach
    words.set(CTRL + R.ctrlCount, 0);
    gate = 0;
    expect(await identifiedCount(g, R)).toBe(-1);
    expect(reads).toContain(0x0040a378);
    expect(outOfReach([0, 0, await identifiedCount(g, R), 0])).toBe(false);
    gate = 1;
    words.set(BODY + R.bodyCtrl, 0);
    expect(await identifiedCount(g, R)).toBe(-1);
    words.set(R.localBody, 0);
    expect(await identifiedCount(g, R)).toBe(-1);
  });
});
