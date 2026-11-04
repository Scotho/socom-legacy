// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import type { Adapters } from '../../src/console/state';
import type { UiCue } from '../../src/console/sounds';
import { mountShell } from './shell';

/**
 * CX-51's batch review, F2: the cue reached the adapter from a press but not from most taps (the wrapper read
 * `pointerNow`'s stop-propagation answer as "something happened"). The wiring, end to end: a press or a tap plays its
 * cue once; an action a tap routes through `press` is not cued twice. A browser adaptation.
 */
let page: ConsolePage | null = null;
beforeEach(() => { mountShell(document); });
afterEach(() => { page?.dispose(); page = null; });

function boot(): { played: (UiCue | 'move')[]; ctl: ConsolePage['ctl'] } {
  const played: (UiCue | 'move')[] = [];
  const A: Adapters = { ...sampleAdapters(), cue: { selection: () => { played.push('move'); }, play: (c) => { played.push(c); } } };
  page = bootConsole(document, window, A, { keymap: true, mode: 'page' });
  return { played, ctl: page.ctl };
}

describe('CX-51: the cues reach the adapter, once', () => {
  it('a tap that opens a dialog plays open, once (the sample states panel)', () => {
    const { played, ctl } = boot();
    played.length = 0;
    expect(ctl.pointer('states', {} as DOMStringMap)).toBe(false);   // a tap that does not stop the event still acts
    expect(ctl.S.overlay).toBe('states');
    expect(played).toEqual(['open']);
  });

  it('a tap that opens a page plays confirm, once', () => {
    const { played, ctl } = boot();
    played.length = 0;
    ctl.pointer('search', {} as DOMStringMap);
    expect(ctl.S.overlay ?? ctl.S.screen).not.toBe('home');
    expect(played).toHaveLength(1);
    expect(['open', 'confirm']).toContain(played[0]);
  });

  it('a legend prompt tapped is a press: one cue, not two', () => {
    const { played, ctl } = boot();
    ctl.pointer('states', {} as DOMStringMap);
    played.length = 0;
    ctl.pointer('press', { b: 'circle' } as DOMStringMap);
    expect(ctl.S.overlay).toBeNull();
    expect(played).toEqual(['close']);
  });
});
