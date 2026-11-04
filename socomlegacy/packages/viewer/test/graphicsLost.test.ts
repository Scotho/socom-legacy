// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { graphicsLostText, showGraphicsLost, watchGraphicsLost } from '../src/graphicsLost';

afterEach(() => { document.body.innerHTML = ''; });

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
