// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LAYOUT_NOTICE_TEXT, MOBILE_LAYOUT_KEY, MOBILE_LAYOUT_NOTICE_KEY, MOBILE_LAYOUT_STRIP_KEY, layoutNoticeDue, layoutNoticeShown,
  saveMobileLayout,
} from '../src/mobileLayout';
import { mountTip } from '../src/matchTouch';
import type { TipStore } from '../src/mobileTip';

/**
 * LATER 133 (product track; Benny's review F4, MSFIT.R2): a touch layout saved before the controls strip keeps its places
 * (MSFIT.R2: saved placements are not discarded), and can sit over the strip or the smaller picture. The page tells the
 * player once, on the phone tip's line (no new UI), pointing to Options > Mobile > Touch layout > Reset. A layout is
 * "before the strip" when it has a saved position and no strip mark -- the mark every save writes from this row on; a
 * layout saved since the strip landed (B79) but before this row has none either, and is told once too (accepted).
 */
type Store = { data: Map<string, string>; get(key: string): string | null; set(key: string, value: string): { readonly ok: true } };
const store = (init: Record<string, string> = {}): Store => {
  const data = new Map(Object.entries(init));
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => { data.set(k, v); return { ok: true as const }; } };
};
const OLD = JSON.stringify({ version: 1, landscape: { 'tw-r1': { x: 1, y: 1 } }, portrait: {} });
const EMPTY = JSON.stringify({ version: 1, landscape: {}, portrait: {} });
const mem = (): TipStore => { const data = new Map<string, string>(); return { get: (k) => data.get(k) ?? null, set: (k, v) => { data.set(k, v); } }; };
const touchScreen = (): void => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)', addEventListener: () => {}, removeEventListener: () => {} }));
};

afterEach(() => { vi.unstubAllGlobals(); });

describe('LATER 133: a touch layout saved before the controls strip, told once', () => {
  it('the line, short enough for a 360-wide phone', () => {
    expect(LAYOUT_NOTICE_TEXT).toBe('Your saved touch layout predates the controls strip. Options > Mobile > Touch layout: Reset, then Save, restores the defaults.');
  });

  it('due: a saved position, no strip mark, not yet told', () => {
    expect(layoutNoticeDue(store({ [MOBILE_LAYOUT_KEY]: OLD }))).toBe(true);
  });

  it('not due: the strip mark, no saved position, nothing saved, or already told', () => {
    expect(layoutNoticeDue(store({ [MOBILE_LAYOUT_KEY]: OLD, [MOBILE_LAYOUT_STRIP_KEY]: '1' }))).toBe(false);
    expect(layoutNoticeDue(store({ [MOBILE_LAYOUT_KEY]: EMPTY }))).toBe(false);
    expect(layoutNoticeDue(store())).toBe(false);
    expect(layoutNoticeDue(store({ [MOBILE_LAYOUT_KEY]: OLD, [MOBILE_LAYOUT_NOTICE_KEY]: '1' }))).toBe(false);
  });

  it('a storage that throws reads as nothing to tell', () => {
    expect(layoutNoticeDue({ get: () => { throw new Error('blocked'); } })).toBe(false);
  });

  it('every save writes the strip mark, the reset\'s included; told writes its own mark', () => {
    const s = store({ [MOBILE_LAYOUT_KEY]: OLD });
    expect(saveMobileLayout({ version: 1, landscape: {}, portrait: {} }, s)).toBe(true);
    expect(s.data.get(MOBILE_LAYOUT_STRIP_KEY)).toBe('1');
    const t = store();
    layoutNoticeShown(t);
    expect(t.data.get(MOBILE_LAYOUT_NOTICE_KEY)).toBe('1');
  });

  it('mountTip: on a touch screen the line is shown once, in the phone tip\'s place that start; then the tip as before', () => {
    touchScreen();
    const layout = store({ [MOBILE_LAYOUT_KEY]: OLD });
    const session = mem(), shown: string[] = [];
    const show = (text: string): void => { shown.push(text); };
    mountTip({ local: mem(), session, pads: () => 0, show, layout })();
    expect(shown).toEqual([LAYOUT_NOTICE_TEXT]);
    expect(layout.data.get(MOBILE_LAYOUT_NOTICE_KEY)).toBe('1');
    mountTip({ local: mem(), session, pads: () => 0, show, layout })();
    expect(shown).toEqual([LAYOUT_NOTICE_TEXT, 'Best with a controller: connect one to your phone, and hold it sideways (landscape).']);
  });

  it('mountTip: not on a touch screen, and not with the strip mark', () => {
    const shown: string[] = [];
    mountTip({ local: mem(), session: mem(), pads: () => 0, show: (t) => { shown.push(t); }, layout: store({ [MOBILE_LAYOUT_KEY]: OLD }) })();
    expect(shown).toEqual([]);
    touchScreen();
    mountTip({ local: mem(), session: mem(), pads: () => 0, show: (t) => { shown.push(t); }, layout: store({ [MOBILE_LAYOUT_KEY]: OLD, [MOBILE_LAYOUT_STRIP_KEY]: '1' }) })();
    expect(shown).toEqual(['Best with a controller: connect one to your phone, and hold it sideways (landscape).']);
  });
});
