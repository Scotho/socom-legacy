/**
 * The replay's timeline (web sprint 35 PT-20; spec 4.8: "Marks are shown on the timeline; segments are listed, with
 * their boundaries visible, under one session clock"; research 244 §4). REPLAY_ADAPTATION: a browser adaptation with no
 * original -- SOCOM II records no match and has no such bar -- `?devmode` on a development build only (the replay mode's
 * rule, `./mount`), changing no game value or behaviour (PT.R3).
 *
 * One session clock: the session's segments laid end to end in index order, each as wide as its ticks (its last tick
 * less its first; a segment of one tick is one wide), the boundaries between them drawn, each mark a tick at its
 * segment's offset plus its tick past the segment's first, the playhead at the tick playing; a click seeks to the
 * segment and tick under it. The segments and the marks are the session service's listing (`GET /segments`,
 * `packages/playtest/src/segmentsHttp.ts`); without it the bar shows the segment playing alone, with its own `mark`
 * records. The arithmetic is pure (`layoutTimeline`, `positionOf`, `seekAt`); the bar only draws it.
 *
 * A file that is no session segment (`replay=` an address other than `/segments/<n>.s2r`, which W35.R2 allows; the
 * sprint 35 close review): its index is unknown (`playing` null), so the bar shows the file alone, takes no listing,
 * and a click seeks within the file playing (`seek(null, tick)`) -- never a session segment's index, which would
 * reopen the page on another file.
 */

/**
 * A segment on the session's clock: its index and its first and last tick; RE-6 (W38.R1, additive; research 249 §2): its
 * map stem as the listing names it, when it names one -- the seek into another segment reopens the page on that map
 * (`./embed` `replaySeeker`), so a seek across a map change loads one map, not two.
 */
export interface TimelineSegment { index: number; start: number; end: number; map?: string }
/** A mark: an observation's segment and tick. */
export interface TimelineMark { segment: number; tick: number }
export interface TimelineListing { segments: TimelineSegment[]; marks: TimelineMark[] }
/**
 * A segment laid out: where it begins and ends on the bar as fractions 0..1, and in the session clock's ticks (`offset`
 * its first tick's place, `width` its ticks, one at least).
 */
export interface TimelineSpan extends TimelineSegment { from: number; to: number; offset: number; width: number }
/** The segments laid out, and the session clock's length in ticks. */
export interface TimelineLayout { spans: TimelineSpan[]; total: number }

const whole = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
/** RE-6: a map stem as the page's address takes one (`../shareUrl` `MAP_STEM`, restated): anything else is no map. */
const MAP_STEM = /^[A-Za-z0-9_]{1,16}$/;

/** The segments end to end in index order, each as wide as its ticks (one at least); a reversed span is left out. */
export function layoutTimeline(segments: readonly TimelineSegment[]): TimelineLayout {
  const kept = segments.filter((s) => s.end >= s.start).sort((a, b) => a.index - b.index);
  const widths = kept.map((s) => Math.max(s.end - s.start, 1));
  const total = widths.reduce((n, w) => n + w, 0);
  let at = 0;
  const spans = kept.map((s, i) => {
    const offset = at;
    at += widths[i]!;
    return { index: s.index, start: s.start, end: s.end, from: offset / total, to: i === kept.length - 1 ? 1 : at / total, offset, width: widths[i]! };
  });
  return { spans, total };
}

/** The boundaries between segments: each later segment's start on the bar. */
export function boundariesOf(layout: TimelineLayout): number[] {
  return layout.spans.slice(1).map((s) => s.from);
}

/** Segment `segment`'s tick `tick` on the bar (0..1), clamped to the segment; null for a segment not on it. */
export function positionOf(layout: TimelineLayout, segment: number, tick: number): number | null {
  const s = layout.spans.find((x) => x.index === segment);
  if (!s) return null;
  const t = Math.min(Math.max(tick, s.start), s.end);
  return (s.offset + (t - s.start)) / layout.total;
}

/** The segment and tick under `x` (0..1, clamped): a boundary is the later segment's start; null on an empty bar. */
export function seekAt(layout: TimelineLayout, x: number): TimelineMark | null {
  const spans = layout.spans;
  if (spans.length === 0) return null;
  const p = Math.min(Math.max(x, 0), 1);
  const s = spans.find((span, i) => p >= span.from && (p < span.to || i === spans.length - 1))!;
  const into = Math.min(Math.max(p * layout.total - s.offset, 0), s.width);       // ticks past the segment's place
  return { segment: s.index, tick: s.start + Math.round((into * (s.end - s.start)) / s.width) };
}

/**
 * The service's listing read (`GET /segments`): the segments with a first and last tick (an unreadable one, its ticks
 * null, is left off the bar), each with its map when the listing names a stem (RE-6), and the marks with whole ticks;
 * null for another shape.
 */
export function parseListing(json: unknown): TimelineListing | null {
  if (typeof json !== 'object' || json === null) return null;
  const { segments, marks } = json as { segments?: unknown; marks?: unknown };
  if (!Array.isArray(segments) || !Array.isArray(marks)) return null;
  const segs: TimelineSegment[] = [];
  for (const s of segments as Record<string, unknown>[]) {
    if (!s || !whole(s['index']) || !whole(s['start']) || !whole(s['end'])) continue;
    const map = typeof s['map'] === 'string' && MAP_STEM.test(s['map']) ? s['map'] : null;
    segs.push({ index: s['index'], ...(map !== null ? { map } : {}), start: s['start'], end: s['end'] });
  }
  const ms: TimelineMark[] = [];
  for (const m of marks as Record<string, unknown>[]) {
    if (m && whole(m['segment']) && whole(m['tick'])) ms.push({ segment: m['segment'], tick: m['tick'] });
  }
  return { segments: segs.sort((a, b) => a.index - b.index), marks: ms };
}

/** What the bar reads from the replay. */
export interface TimelineHost {
  /** The index of the segment playing (null: the file is no session segment -- the bar shows it alone). */
  playing: number | null;
  /** The tick playing, null before the segment opens. */
  tick(): number | null;
  /** The segment playing's own first and last tick, null before it opens (the bar's fallback without a listing). */
  span(): { start: number; end: number } | null;
  /** The segment playing's own marks (its `mark` records): the fallback without a listing. */
  marks(): TimelineMark[];
  /** The service's listing, or null when there is none to ask. */
  listing: Promise<TimelineListing | null> | null;
  /** The seek: segment `segment` at `tick`; `segment` null is the file playing (its index unknown). */
  seek(segment: number | null, tick: number): void;
}

const pct = (x: number): string => `${+(x * 100).toFixed(4)}%`;

/** Mounts the bar above the replay's own (`./controls`); `render` once a frame, `dispose` to take it away. */
export function mountTimeline(doc: Document, host: TimelineHost): { render(): void; dispose(): void } {
  const bar = doc.createElement('div');
  bar.dataset['replayTimeline'] = '';
  bar.setAttribute('role', 'slider');
  bar.setAttribute('aria-label', 'The session\'s replay timeline');
  bar.style.cssText = 'position:fixed;left:10px;right:10px;bottom:26px;height:12px;z-index:50;cursor:pointer;'
    + 'background:rgba(0,0,0,0.6);outline:1px solid rgba(232,232,232,0.4)';
  const head = doc.createElement('div');
  head.dataset['playhead'] = '';
  head.style.cssText = 'position:absolute;top:-2px;bottom:-2px;width:2px;margin-left:-1px;background:#e8e8e8;pointer-events:none';
  doc.body.appendChild(bar);
  const known = host.playing !== null;
  const playing = host.playing ?? 0;            // the file alone on the bar: its place, not a session index
  let listed: TimelineListing | null = null;
  let layout: TimelineLayout | null = null;
  let drawn = '';
  if (known) void host.listing?.then((l) => { if (l && l.segments.some((s) => s.index === playing)) { listed = l; layout = null; } }, () => {});

  const draw = (l: TimelineLayout, marks: readonly TimelineMark[]): void => {
    bar.replaceChildren();
    for (const b of boundariesOf(l)) {
      const e = doc.createElement('div');
      e.dataset['boundary'] = '';
      e.style.cssText = `position:absolute;top:0;bottom:0;left:${pct(b)};width:0;border-left:2px solid #000;pointer-events:none`;
      bar.appendChild(e);
    }
    for (const m of marks) {
      const x = positionOf(l, m.segment, m.tick);
      if (x === null) continue;
      const e = doc.createElement('div');
      e.dataset['mark'] = '';
      e.style.cssText = `position:absolute;top:0;bottom:0;left:${pct(x)};width:2px;margin-left:-1px;background:#c4a04a;pointer-events:none`;
      bar.appendChild(e);
    }
    bar.appendChild(head);
  };
  const onClick = (e: MouseEvent): void => {
    if (!layout) return;
    const r = bar.getBoundingClientRect();
    const at = seekAt(layout, r.width > 0 ? (e.clientX - r.left) / r.width : 0);
    if (at) host.seek(known ? at.segment : null, at.tick);
  };
  bar.addEventListener('click', onClick);

  return {
    render(): void {
      if (!layout) {
        const span = host.span();
        if (listed) {
          layout = layoutTimeline(listed.segments);
          draw(layout, listed.marks);
        } else if (span) {
          layout = layoutTimeline([{ index: playing, ...span }]);
          draw(layout, host.marks());
        }
      }
      const t = host.tick();
      const x = layout && t !== null ? positionOf(layout, playing, t) : null;
      const left = x === null ? '' : pct(x);
      if (left !== drawn) { head.style.left = left; head.style.display = left ? '' : 'none'; drawn = left; }
    },
    dispose(): void {
      bar.removeEventListener('click', onClick);
      bar.remove();
    },
  };
}
