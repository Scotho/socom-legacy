// @vitest-environment jsdom
// test/replayTimeline.test.ts -- PT-20: the replay's timeline, one session clock over the segments with their boundaries
// and the marks (spec 4.8; research 244 §4). REPLAY_ADAPTATION: no original.
import { describe, expect, it, vi } from 'vitest';
import { boundariesOf, layoutTimeline, mountTimeline, parseListing, positionOf, seekAt, type TimelineListing } from '../src/replay/timeline';

/** Two segments: 0 plays ticks 0..500, 1 plays ticks 100..400 -- 500 and 300 ticks, 800 on the session's clock. */
const TWO = [{ index: 0, start: 0, end: 500 }, { index: 1, start: 100, end: 400 }];

describe('the timeline\'s arithmetic (pure)', () => {
  const layout = layoutTimeline(TWO);

  it('lays the segments end to end in index order, each as wide as its ticks; the boundary between them', () => {
    expect(layout.spans.map((s) => [s.index, s.from, s.to])).toEqual([[0, 0, 0.625], [1, 0.625, 1]]);
    expect(boundariesOf(layout)).toEqual([0.625]);
    expect(layoutTimeline([...TWO].reverse()).spans.map((s) => s.index)).toEqual([0, 1]);   // the index orders, not the list
  });
  it('a tick to a position: the segment\'s offset plus the tick past its start, clamped to the segment', () => {
    expect(positionOf(layout, 0, 0)).toBe(0);
    expect(positionOf(layout, 0, 250)).toBe(0.3125);
    expect(positionOf(layout, 1, 100)).toBe(0.625);
    expect(positionOf(layout, 1, 250)).toBe(0.8125);
    expect(positionOf(layout, 1, 400)).toBe(1);
    expect(positionOf(layout, 1, 50)).toBe(0.625);                      // before the segment's first tick
    expect(positionOf(layout, 1, 9999)).toBe(1);                        // after its last
    expect(positionOf(layout, 7, 0)).toBeNull();                        // a segment not on the timeline
  });
  it('the marks as ticks: each mark\'s position, on its own segment', () => {
    expect([{ segment: 0, tick: 120 }, { segment: 1, tick: 300 }].map((m) => positionOf(layout, m.segment, m.tick))).toEqual([0.15, 0.875]);
  });
  it('a position to a seek: the segment under it and its tick, a boundary the later segment\'s start', () => {
    expect(seekAt(layout, 0.3125)).toEqual({ segment: 0, tick: 250 });
    expect(seekAt(layout, 0.625)).toEqual({ segment: 1, tick: 100 });
    expect(seekAt(layout, 0.8125)).toEqual({ segment: 1, tick: 250 });
    expect(seekAt(layout, 1)).toEqual({ segment: 1, tick: 400 });
    expect(seekAt(layout, -0.5)).toEqual({ segment: 0, tick: 0 });
    expect(seekAt(layout, 7)).toEqual({ segment: 1, tick: 400 });
    expect(seekAt(layout, 0.15)).toEqual({ segment: 0, tick: 120 });   // a mark's position seeks to the mark
    expect(seekAt(layoutTimeline([]), 0.5)).toBeNull();
  });
  it('a segment of one tick still has a width; a reversed span is refused', () => {
    const one = layoutTimeline([{ index: 0, start: 0, end: 9 }, { index: 1, start: 7, end: 7 }]);
    expect(one.spans.map((s) => [s.from, s.to])).toEqual([[0, 0.9], [0.9, 1]]);
    expect(seekAt(one, 0.95)).toEqual({ segment: 1, tick: 7 });
    expect(layoutTimeline([{ index: 0, start: 9, end: 3 }]).spans).toEqual([]);
  });
});

describe('the service\'s listing (GET /segments) read', () => {
  it('keeps the segments with ticks and the marks with a whole tick; refuses another shape', () => {
    const got = parseListing({
      segments: [{ index: 1, map: 'MP2', closed: false, start: 100, end: 400 }, { index: 0, map: 'MP2', closed: true, start: 0, end: 500 }, { index: 2, map: 'MP5', closed: true, start: null, end: null }],
      marks: [{ segment: 0, tick: 120 }, { segment: 1, tick: -1 }, { segment: 1, tick: 2.5 }, { segment: 'x', tick: 3 }],
    });
    expect(got).toEqual({ segments: [{ index: 0, map: 'MP2', start: 0, end: 500 }, { index: 1, map: 'MP2', start: 100, end: 400 }], marks: [{ segment: 0, tick: 120 }] });
    for (const bad of [null, 'x', {}, { segments: 'x', marks: [] }, { segments: [], marks: {} }]) expect(parseListing(bad)).toBeNull();
  });
  it('RE-6 (W38.R1, research 249 §2): each segment keeps the map the listing names; a segment without one (or not a stem) has none', () => {
    const got = parseListing({
      segments: [{ index: 0, map: 'MP72', start: 0, end: 900 }, { index: 1, map: 'MP2', start: 0, end: 700 }, { index: 2, start: 0, end: 5 },
        { index: 3, map: '', start: 0, end: 5 }, { index: 4, map: 'MP2&x=1', start: 0, end: 5 }, { index: 5, map: 7, start: 0, end: 5 }],
      marks: [],
    });
    expect(got!.segments).toEqual([
      { index: 0, map: 'MP72', start: 0, end: 900 }, { index: 1, map: 'MP2', start: 0, end: 700 }, { index: 2, start: 0, end: 5 },
      { index: 3, start: 0, end: 5 }, { index: 4, start: 0, end: 5 }, { index: 5, start: 0, end: 5 },
    ]);
  });
});

describe('the timeline on the page', () => {
  const flush = async (): Promise<void> => { for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0)); };
  const bar = (): HTMLElement => document.querySelector('[data-replay-timeline]') as HTMLElement;

  it('draws the boundaries and the marks from the listing, the playhead at the playing tick, and a click seeks there', async () => {
    let listed: (l: TimelineListing | null) => void = () => {};
    const seek = vi.fn();
    const t = mountTimeline(document, {
      playing: 0, tick: () => 250, span: () => ({ start: 0, end: 500 }), marks: () => [],
      listing: new Promise((r) => { listed = r; }), seek,
    });
    t.render();
    expect(bar().querySelectorAll('[data-boundary]')).toHaveLength(0);   // before the listing: the playing segment alone
    expect((bar().querySelector('[data-playhead]') as HTMLElement).style.left).toBe('50%');
    listed({ segments: TWO, marks: [{ segment: 0, tick: 120 }, { segment: 1, tick: 300 }] });
    await flush();
    t.render();
    expect([...bar().querySelectorAll<HTMLElement>('[data-boundary]')].map((b) => b.style.left)).toEqual(['62.5%']);
    expect([...bar().querySelectorAll<HTMLElement>('[data-mark]')].map((m) => m.style.left)).toEqual(['15%', '87.5%']);
    expect((bar().querySelector('[data-playhead]') as HTMLElement).style.left).toBe('31.25%');
    bar().getBoundingClientRect = () => ({ left: 100, width: 800, top: 0, height: 10, right: 900, bottom: 10, x: 100, y: 0, toJSON: () => ({}) });
    bar().dispatchEvent(new MouseEvent('click', { clientX: 100 + 650, bubbles: true }));
    expect(seek).toHaveBeenCalledWith(1, 250);
    t.dispose();
    expect(bar()).toBeNull();
  });
  it('playing no session segment (playing null): the file alone, any listing ignored, and a click seeks in the file (segment null)', async () => {
    const seek = vi.fn();
    const t = mountTimeline(document, {
      playing: null, tick: () => 0, span: () => ({ start: 0, end: 500 }), marks: () => [],
      listing: Promise.resolve({ segments: TWO, marks: [] }), seek,
    });
    await flush();
    t.render();
    expect(bar().querySelectorAll('[data-boundary]')).toHaveLength(0);
    bar().getBoundingClientRect = () => ({ left: 100, width: 800, top: 0, height: 10, right: 900, bottom: 10, x: 100, y: 0, toJSON: () => ({}) });
    bar().dispatchEvent(new MouseEvent('click', { clientX: 100 + 400, bubbles: true }));
    expect(seek).toHaveBeenCalledWith(null, 250);
    t.dispose();
  });
  it('with no listing, the playing segment alone and its own marks', async () => {
    const t = mountTimeline(document, {
      playing: 3, tick: () => 0, span: () => ({ start: 0, end: 200 }), marks: () => [{ segment: 3, tick: 50 }], listing: null, seek: () => {},
    });
    t.render();
    expect([...bar().querySelectorAll<HTMLElement>('[data-mark]')].map((m) => m.style.left)).toEqual(['25%']);
    t.dispose();
  });
});
