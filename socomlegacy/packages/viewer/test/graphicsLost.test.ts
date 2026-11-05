// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  graphicsErrorText, graphicsLostText, graphicsRecord, graphicsText, resetGraphicsRecordForTest, showGraphicsLost,
  watchGraphicsErrors, watchGraphicsLost,
} from '../src/graphicsLost';

afterEach(() => { document.body.innerHTML = ''; resetGraphicsRecordForTest(); });

describe('graphicsLost (browser adaptation: the lost-graphics notice)', () => {
  it('names the API, the browser\'s message, the reason and the UTC time', () => {
    const at = new Date(Date.UTC(2026, 10, 1, 3, 30, 43));
    expect(graphicsLostText({ api: 'WebGL', message: 'Unknown reason', reason: null }, at))
      .toBe('Graphics stopped at 03:30:43Z (WebGL: Unknown reason). Reload the page to continue.');
    expect(graphicsLostText({ api: 'WebGPU', message: 'D3D12 device removed', reason: 'unknown' }, at))
      .toBe('Graphics stopped at 03:30:43Z (WebGPU: D3D12 device removed; reason unknown). Reload the page to continue.');
  });

  it('shows one notice on the page, replacing an earlier one', () => {
    showGraphicsLost(document, { api: 'WebGL', message: 'first' });
    const el = showGraphicsLost(document, { api: 'WebGL', message: 'second' });
    const all = document.querySelectorAll('[data-graphics-lost]');
    expect(all.length).toBe(1);
    expect(all[0]).toBe(el);
    expect(el.textContent).toContain('WebGL: second');
    expect(el.getAttribute('role')).toBe('alert');
    expect(el.classList.contains('s2u-notice')).toBe(true);                // the design system's panel: no colour or type inline
    expect(el.style.background).toBe('');
  });

  it('chains the renderer\'s own device-lost handler and then shows the notice', () => {
    const seen: string[] = [];
    const renderer = { onDeviceLost: (info: { message: string }) => { seen.push(info.message); } };
    watchGraphicsLost(renderer, document);
    renderer.onDeviceLost({ api: 'WebGL', message: 'context lost', reason: null } as never);
    expect(seen).toEqual(['context lost']);
    expect(document.querySelector('[data-graphics-lost]')?.textContent).toContain('WebGL: context lost');
  });

  it('leaves a renderer without onDeviceLost alone: the adaptation never stops a renderer being made', () => {
    const bare = {} as { onDeviceLost: (info: never) => void };
    expect(() => watchGraphicsLost(bare, document)).not.toThrow();
    expect(bare.onDeviceLost).toBeUndefined();
  });
});

/**
 * The graphics-errors instrument (product track, a browser adaptation; the tag-trails hunt of 2026-11-05): a WebGPU
 * validation error the device reports as uncaptured drops the pass's whole command buffer with no word on the page (the
 * world black or frozen while the overlays stack), and only a console nobody opens says why. three's `WebGPURenderer`
 * routes the device's `uncapturederror` to its `onError` (the console line); this keeps the first one and a count, puts
 * them on the page, and the performance line carries them so a player's report names the failing draw.
 */
describe('graphicsErrors (browser adaptation: the uncaptured GPU errors kept, shown and reported)', () => {
  const at = new Date(Date.UTC(2026, 10, 5, 2, 10, 5));

  it('names the API, the type, the message, the UTC time and the count', () => {
    expect(graphicsErrorText({ api: 'WebGPU', type: 'ValidationError', message: 'Destroyed texture [Texture "colorBuffer"] used in a submit.' }, 1, at))
      .toBe('Graphics error at 02:10:05Z (WebGPU ValidationError: Destroyed texture [Texture "colorBuffer"] used in a submit.), 1 so far. Reload the page if the picture is wrong.');
    expect(graphicsErrorText({ api: 'WebGPU', message: 'x' }, 12, at)).toContain('(WebGPU GPUError: x), 12 so far.');
  });

  it('chains the renderer\'s own error handler, keeps the first error and counts every one, and shows one notice', () => {
    const seen: string[] = [];
    const renderer = { onError: (info: { message: string }) => { seen.push(info.message); } };
    watchGraphicsErrors(renderer, document, () => at);
    renderer.onError({ api: 'WebGPU', type: 'ValidationError', message: 'first' } as never);
    renderer.onError({ api: 'WebGPU', type: 'ValidationError', message: 'second' } as never);
    renderer.onError({ api: 'WebGPU', type: 'OutOfMemoryError', message: 'third' } as never);
    expect(seen).toEqual(['first', 'second', 'third']);                      // three's console line still written
    const r = graphicsRecord();
    expect(r.count).toBe(3);
    expect(r.first).toEqual({ api: 'WebGPU', type: 'ValidationError', message: 'first', at: '2026-11-05T02:10:05.000Z' });
    const all = document.querySelectorAll('[data-graphics-error]');
    expect(all.length).toBe(1);
    expect(all[0]?.textContent).toContain('WebGPU ValidationError: first), 3 so far');
    expect(all[0]?.getAttribute('role')).toBe('status');
    expect(all[0]?.classList.contains('s2u-notice')).toBe(true);
    expect(document.querySelector('[data-graphics-lost]')).toBeNull();      // the lost notice is its own
  });

  it('leaves a renderer without onError alone', () => {
    const bare = {} as { onError: (info: never) => void };
    expect(() => watchGraphicsErrors(bare, document)).not.toThrow();
    expect(bare.onError).toBeUndefined();
    expect(graphicsRecord()).toEqual({ first: null, count: 0, lost: null });
  });

  it('a lost device is recorded beside the errors, with its time', () => {
    const renderer = { onDeviceLost: (_info: unknown) => undefined };
    watchGraphicsLost(renderer, document, () => at);
    renderer.onDeviceLost({ api: 'WebGPU', message: 'D3D12 device removed', reason: 'unknown' } as never);
    expect(graphicsRecord().lost).toEqual({ api: 'WebGPU', message: 'D3D12 device removed', reason: 'unknown', at: '2026-11-05T02:10:05.000Z' });
  });

  it('graphicsText: "ok" with nothing recorded; else the first error, the count and the lost, on one line, the message capped', () => {
    expect(graphicsText({ first: null, count: 0, lost: null })).toBe('ok');
    expect(graphicsText({ first: { api: 'WebGPU', type: 'ValidationError', message: 'a |\nb', at: '2026-11-05T02:10:05.000Z' }, count: 12, lost: null }))
      .toBe('WebGPU ValidationError x12 "a / b" first 02:10:05Z');
    expect(graphicsText({ first: null, count: 0, lost: { api: 'WebGPU', message: 'gone', reason: null, at: '2026-11-05T02:11:00.000Z' } }))
      .toBe('lost 02:11:00Z WebGPU: gone');
    const long = graphicsText({ first: { api: 'WebGPU', type: 'ValidationError', message: 'm'.repeat(400), at: '2026-11-05T02:10:05.000Z' }, count: 1, lost: { api: 'WebGPU', message: 'gone', reason: 'unknown', at: '2026-11-05T02:11:00.000Z' } });
    expect(long).toBe(`WebGPU ValidationError x1 "${'m'.repeat(200)}..." first 02:10:05Z; lost 02:11:00Z WebGPU: gone (unknown)`);
  });
});
