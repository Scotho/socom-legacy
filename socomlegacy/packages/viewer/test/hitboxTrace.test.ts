import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { bodyOfTrace, hitboxTraceOn, PageHitboxTrace, rayMargin, rayMeet, traceBoxes } from '../src/hitboxTrace';
import { placedVolumes, rayBody, type BoneBox } from '../src/net/hitVolumes';

/**
 * HITBOX-TRACE, the page's half (`../src/hitboxTrace.ts`; a development instrument, product track): the box shape both
 * sides write (`traceBoxes`), its recast (`bodyOfTrace`), the line's meet and margin, the switch (`?devmode&hitboxtrace` on
 * a development build only) and the bounded ring. Unit tests, synthetic boxes.
 */

const unit = (tx: number, ty: number, tz: number): BoneBox => ({ part: 2, bone: 3, box: Float32Array.from([-1, -2, -0.5, 1, 2, 0.5]), w: Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, ty, tz, 1]) });

describe('HITBOX-TRACE page', () => {
  it('traceBoxes: a box placed at feet and turned by yaw -- its world bounds and top; yaw 90 swaps x and z extents', () => {
    const t = traceBoxes(placedVolumes([10, 5, 0], 0, [unit(0, 3, 0)]));
    expect(t.boxes[0]).toMatchObject({ bone: 3, part: 2, centre: [10, 8, 0], half: [1, 2, 0.5] });
    expect(t.topY).toBe(10);
    const r = traceBoxes(placedVolumes([0, 0, 0], 90, [unit(2, 0, 0)]));
    // actorToWorld: x' = x cos + z sin, z' = -x sin + z cos: the box's +x offset goes to -z
    expect(r.boxes[0]!.centre).toEqual([0, 0, -2]);
    expect(r.boxes[0]!.half).toEqual([0.5, 2, 1]);
  });

  it('bodyOfTrace: the recast meets where the original body does; rayMeet gives the height above the feet and the bone; rayMargin the miss distance', () => {
    const body = placedVolumes([0, 1, 0], 30, [unit(0, 4, 0)]);
    const back = bodyOfTrace(traceBoxes(body));
    for (const y of [2.5, 4, 5.9, 6.1]) {
      const a = rayBody([0, y, 20], [0, 0, -1], 100, body), b = rayBody([0, y, 20], [0, 0, -1], 100, back);
      expect(b === null, `y ${y}`).toBe(a === null);
      if (a && b) expect(b.t).toBeCloseTo(a.t, 3);
    }
    const m = rayMeet([0, 5, 20], [0, 0, -1], 100, body)!;
    expect(m.bone).toBe(3);
    expect(m.height).toBeCloseTo(4, 6);
    expect(rayMargin([0, 5, 20], [0, 0, -1], 100, body)).toBe(0);
    // over the top (y 1 + 4 + 2 = 7): 0.75 above it
    expect(rayMargin([0, 7.75, 20], [0, 0, -1], 100, placedVolumes([0, 1, 0], 0, [unit(0, 4, 0)]))).toBeCloseTo(0.75, 3);
  });

  it('the switch: only ?devmode with ?hitboxtrace, only on a development build', () => {
    expect(hitboxTraceOn('?devmode&hitboxtrace', true)).toBe(true);
    expect(hitboxTraceOn('?hitboxtrace', true)).toBe(false);
    expect(hitboxTraceOn('?devmode', true)).toBe(false);
    expect(hitboxTraceOn('?devmode&hitboxtrace', false)).toBe(false);
  });

  it('the ring is bounded: past its limit the oldest lines go; take returns oldest first and clears', () => {
    const t = new PageHitboxTrace(5);
    const body = placedVolumes([0, 0, 0], 0, [unit(0, 0, 0)]);
    for (let i = 0; i < 12; i++) t.frame(i, [{ id: 1, hostage: true, state: 23, posed: true, body }]);
    expect(t.count()).toBe(5);
    const lines = t.take();
    expect(lines.map((l) => l['viewTick'])).toEqual([7, 8, 9, 10, 11]);
    expect(t.count()).toBe(0);
    expect(t.take()).toEqual([]);
    // an offer line only when the offer or its why changes
    t.offer(1, { hostage: 1, cmd: 4 }, null, { eye: [0, 0, 10], dir: [0, 0, -1] }, body);
    t.offer(2, { hostage: 1, cmd: 4 }, null, { eye: [0, 0, 10], dir: [0, 0, -1] }, body);
    t.offer(3, null, 'no pick', null, null);
    const offers = t.take();
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({ event: 'offer', hostage: 1, meet: { bone: 3, height: 0 } });
  });

  it('off by default in the page: the recorder is made only under hitboxTraceOn, and its one call site is behind that null (a source pin on main.ts)', () => {
    const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
    expect(main).toContain('const HITBOX_TRACE = hitboxTraceOn(SEARCH) ? new PageHitboxTrace() : null;');
    const uses = main.split('\n').filter((l) => /traceHitboxFrame\(/.test(l) && !/^function /.test(l));
    expect(uses.length).toBe(1);
    for (const l of uses) expect(l).toMatch(/if \(HITBOX_TRACE &&/);
  });
});
