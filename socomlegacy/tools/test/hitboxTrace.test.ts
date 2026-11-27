import { describe, expect, it } from 'vitest';
import { formatSummary, joinTraces, readTrace } from '../hitboxTrace';
import { placedVolumes, type BoneBox } from '../../packages/viewer/src/net/hitVolumes';
import { traceBoxes } from '../../packages/viewer/src/hitboxTrace';

/**
 * HITBOX-TRACE's join (`../hitboxTrace.ts`; a development instrument, product track) on a small synthetic pair: one
 * hostage body of one unit box, the page's drawn 1.0 u above the room's at the same tick. The join reports the 1.0 u
 * centre and top-edge gaps, the posed flag differing, and for a refused order whose line passes through the page's
 * box above the room's: the page's meet, the room's miss and the line's margin from the room's box.
 */

const box = (y: number): BoneBox => ({ part: 1, bone: 7, box: Float32Array.from([-1, -1, -1, 1, 1, 1]), w: Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, y, 0, 1]) });

describe('HITBOX-TRACE join', () => {
  it('a known 1.0 u gap is reported as 1.0; a refused order through the page\'s box above the room\'s: page meets, room misses, margin 0.5', () => {
    const roomBody = traceBoxes(placedVolumes([100, 0, 100], 0, [box(10)]));
    const pageBody = traceBoxes(placedVolumes([100, 0, 100], 0, [box(11)]));
    expect(roomBody.boxes[0]!.centre).toEqual([100, 10, 100]);
    expect(roomBody.topY).toBe(11);
    const room = [
      { side: 'room', tick: 40, id: 240, kind: 'hostage', state: 23, posed: true, ...roomBody },
      { side: 'room', tick: 41, id: 240, kind: 'hostage', state: 23, posed: true, ...roomBody },
      // a level line at y 11.5 along -z, through the page's box (y 10..12) and over the room's (y 9..11)
      { side: 'room', event: 'order', tick: 50, viewTick: 40.2, at: 40.2, issuer: 2, hostage: 240, eye: [100, 11.5, 130], dir: [0, 0, -1], picked: null, why: 'not aimed', bodies: [{ id: 240, posed: true, ...roomBody }] },
    ];
    const page = [
      { side: 'page', viewTick: 40.2, id: 240, kind: 'hostage', state: 23, posed: false, ...pageBody },
      { side: 'page', viewTick: 40.9, id: 240, kind: 'hostage', state: 23, posed: true, ...pageBody },
      { side: 'page', event: 'offer', viewTick: 40.2, hostage: 240, cmd: 4, why: null, eye: [100, 11.5, 130], dir: [0, 0, -1], body: pageBody },
    ];
    const s = joinTraces(readTrace(room.map((l) => JSON.stringify(l)).join('\n')), readTrace(JSON.stringify(page)));
    expect(s.unmatchedPage).toBe(0);
    expect(s.groups).toHaveLength(1);
    const g = s.groups[0]!;
    expect(g.key).toBe('hostage 23');
    expect(g.frames).toBe(2);
    expect(g.centre.worst).toBeCloseTo(1.0, 6);
    expect(g.centre.mean).toBeCloseTo(1.0, 6);
    expect(g.top.worst).toBeCloseTo(1.0, 6);
    expect(g.top.signedMean).toBeCloseTo(1.0, 6);
    expect(g.posedDiffers).toBe(1);
    expect(s.orders).toHaveLength(1);
    const o = s.orders[0]!;
    expect(o.why).toBe('not aimed');
    expect(o.room).toBeNull();
    expect(o.page).toMatchObject({ bone: 7 });
    expect(o.page!.height).toBeCloseTo(11.5, 6);
    expect(o.marginRoom).toBeCloseTo(0.5, 3);
    expect(o.marginPage).toBe(0);
    expect(s.pageEvents).toHaveLength(1);
    expect(s.pageEvents[0]!.room).toBeNull();
    expect(s.pageEvents[0]!.marginRoom).toBeCloseTo(0.5, 3);
    const text = formatSummary(s);
    expect(text).toContain('hostage 23 | 2 | 1.000 / 1.000 | 1.000 / 1.000 (1.000) | 1');
    expect(text).toContain('REFUSED orders (1)');
  });
});
