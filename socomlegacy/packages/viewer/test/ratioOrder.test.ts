import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { deferredRatio, type RatioTarget } from '../src/matchViewport';

/**
 * B1-RATIO-ORDER (the owner's black-flicker report, 2026-11-21; product track: the dynamic resolution is the port's own
 * adaptation, no original): the resolution step decided at a frame's tail is put on the renderer at the next frame's
 * start, before its draw, because a drawing-buffer resize after the draw presented the frame empty. The match's frame is
 * held by `matchMount.test.ts`'s B1-RATIO-ORDER case (a fake renderer's draw/resize log); this file holds the wrapper
 * and the test room's frame (which has no harness: a source-order pin, the evidence kind said).
 */
function target(start = 1): RatioTarget & { set: number[] } {
  let r = start;
  const set: number[] = [];
  return { set, setPixelRatio: (v) => { set.push(v); r = v; }, pixelRatio: () => r };
}

describe('B1-RATIO-ORDER: deferredRatio', () => {
  it('a pick at the tail is held, read back by the picker, and put on only at apply', () => {
    const d = deferredRatio();
    const t = target(1);
    const w = d.wrap(t)!;
    w.setPixelRatio(0.9);
    expect(t.set).toEqual([]);                         // nothing resized at the tail
    expect(w.pixelRatio()).toBe(0.9);                  // the picker sees its own pick
    expect(t.pixelRatio()).toBe(1);
    d.apply(t);
    expect(t.set).toEqual([0.9]);
    d.apply(t);
    expect(t.set).toEqual([0.9]);                      // once
  });

  it('two picks in one tail (a panic\'s two steps): only the last is put on', () => {
    const d = deferredRatio();
    const t = target(1);
    const w = d.wrap(t)!;
    w.setPixelRatio(0.95);
    w.setPixelRatio(0.9);
    d.apply(t);
    expect(t.set).toEqual([0.9]);
  });

  it('no renderer: nothing held, nothing thrown; a held pick goes to whichever renderer the next frame has', () => {
    const d = deferredRatio();
    expect(d.wrap(null)).toBeNull();
    expect(() => d.apply(null)).not.toThrow();
    const a = target(1), b = target(1);
    d.wrap(a)!.setPixelRatio(0.8);
    d.apply(b);
    expect(a.set).toEqual([]);
    expect(b.set).toEqual([0.8]);
  });
});

describe('B1-RATIO-ORDER: the test room\'s frame (source order)', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/main.ts'), 'utf8');
  const start = src.indexOf('  const frame = (): void => {');
  const body = src.slice(start, src.indexOf('\n  };\n', start));
  it('applies the held step before the frame\'s first draw, and hands the step a deferring target', () => {
    expect(start).toBeGreaterThan(0);
    const apply = body.indexOf('ratioDefer.apply(created)');
    const firstDraw = body.indexOf('render(scene, fly.camera)');
    expect(apply).toBeGreaterThan(0);
    expect(firstDraw).toBeGreaterThan(apply);
    expect(body).toContain('adaptiveRatio.frame(frameTime.real(), performance.now(), ratioDefer.wrap(created),');
    expect(body).not.toMatch(/adaptiveRatio\.frame\(frameTime\.real\(\), performance\.now\(\), created,/);
  });
});

describe("B1-RATIO-ORDER: the Forge editor's frame (source order; the review's finding 2)", () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/forge/page.ts'), 'utf8');
  const start = src.indexOf('  const frame = (now: number): void => {');
  const body = src.slice(start, src.indexOf('\n  };\n', start));
  it("applies the held step before the editor's draws (after the match's early return), and hands the step a deferring target", () => {
    expect(start).toBeGreaterThan(0);
    const matchReturn = body.indexOf('if (match) {');
    const apply = body.indexOf('ratioDefer.apply(ratioTarget)');
    const draw = body.indexOf('created.render');
    expect(apply).toBeGreaterThan(matchReturn);
    expect(draw).toBeGreaterThan(apply);
    expect(body).toContain('adaptiveRatio.frame(realDt, now, ratioDefer.wrap(ratioTarget),');
  });
});
