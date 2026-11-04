// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveOptions, OVERLAY_BUTTON_ROW } from '../../src/console/adapters/options';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { REMAP_ROW, type Adapters, type OptCat } from '../../src/console/state';
import type { LauncherState } from '../../src/modern/launcherState';
import { mountShell } from './shell';

/**
 * LATER 294, slice 3 of `docs/specs/2026-10-28-settings-organisation.md` (product track, a browser adaptation): headings
 * on the three tabs that mix card rows and browser rows, in the spec's own words -- layout B's "a heading In the game and
 * the eight card rows" on Controller, and "Display and Communication get a This browser heading before their launcher
 * rows" (layout A's "Detail distance on Display under a This browser heading"). A heading is the row `section` field
 * Theme & background already uses: drawn above its row, never a stop of the pad or the pointer. No row moves, none is
 * renamed, no id changes.
 */
/** The edge cases below empty a card group (`CONTROLS` filtered by `group`); every other test sees the real list. */
const empty = vi.hoisted(() => ({ groups: new Set<string>() }));
vi.mock('../../src/modern/settings/model', async (orig) => {
  const m = await orig<typeof import('../../src/modern/settings/model')>();
  return { ...m, get CONTROLS() { return m.CONTROLS.filter((c) => !empty.groups.has(c.group)); } };
});

let page: ConsolePage | null = null;
beforeEach(() => { localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; localStorage.clear(); empty.groups.clear(); });

const launcher = (): LauncherState => ({ disc: () => 'empty', isoInserted: () => false, filename: () => null, assets: () => null, onChange: () => () => {} });

function boot(o: { touch?: boolean; overlay?: boolean } = {}) {
  let button = 16;
  const pad = { connected: () => true, deadZone: () => 0.15, setDeadZone() {}, select() {}, read: () => [], setConnected() {} };
  const options = liveOptions(() => { page?.render(); }, {
    launcher: launcher(), signedIn: () => false, pads: () => [], touch: () => o.touch ?? false, pad: pad as never,
    ...(o.overlay ? { overlayButton: { home: 16, read: () => button, save: (b: number) => { button = b; }, name: (b: number) => `B${b}` } } : {}),
  });
  const sample = sampleAdapters();
  page = bootConsole(document, window, { ...sample, data: 'live', states: undefined, options, session: { ...sample.session, signedIn: () => false } } as Adapters, { keymap: true });
  return { ctl: page.ctl, options };
}

const cat = (options: { categories(): readonly OptCat[] }, id: string) => options.categories().find((c) => c.id === id)!;
const ids = (options: { categories(): readonly OptCat[] }, id: string) => cat(options, id).rows.map((r) => r.id);
const headings = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('#stage [data-key="options"] .cx-rows [role="heading"]')];

const CARD_CONTROLS = ['VIBRATION_CONTROLLER', 'AutoAim', 'INVERT_PITCH_CONTROLLER', 'FIREMODESWAP_CONTROLLER', 'stick_preset', 'STICK_SENSITIVITY', 'STICK_INERTIA', 'STICK_DEADZONE'];
const ROWS = {
  // HD-4: Display's "Video" row (the page's picture) leads the browser's rows, under the same heading.
  display: ['BRIGHTNESS', 'BOBBING_1ST_PERSON', 'DISPLAY_MP_TEAM_NAMES', 'HelpWindowsEnabled', 'ScreenOriginX', 'ScreenOriginY', 'video-picture', 'render-scale', 'detail-distance', 'shadows', 'show-fps', 'graphics-backend', 'perf-line'],   // CPS-4a: Render scale, Shadows, Show FPS; CPS-5: Copy performance line
  controller: ['stance-mode', 'pad-device', 'pad-dead', REMAP_ROW, ...CARD_CONTROLS],
  controllerOverlay: ['stance-mode', 'pad-device', 'pad-dead', REMAP_ROW, OVERLAY_BUTTON_ROW, ...CARD_CONTROLS],
  communication: ['EnableExternalWhispers', 'mic-on', 'mic-device'],
};

/** Each tab's one heading: its words (the spec's) and the row it sits above. */
const CASES = [
  { tab: 'display', heading: 'This browser', first: 'video-picture', rows: ROWS.display, o: {} },
  { tab: 'controller', heading: 'In the game', first: 'VIBRATION_CONTROLLER', rows: ROWS.controller, o: {} },
  { tab: 'controller', heading: 'In the game', first: 'VIBRATION_CONTROLLER', rows: ROWS.controllerOverlay, o: { overlay: true, touch: true } },
  { tab: 'communication', heading: 'This browser', first: 'mic-on', rows: ROWS.communication, o: {} },
] as const;

describe('LATER 294 slice 3: headings on Display, Controller and Communication', () => {
  for (const c of CASES) {
    const name = `${c.tab}${'overlay' in c.o ? ' (with Overlay button and Mobile)' : ''}`;

    it(`${name}: the rows and their order are unchanged, and one row carries the "${c.heading}" heading`, () => {
      const { options } = boot(c.o);
      expect(ids(options, c.tab)).toEqual([...c.rows]);
      const headed = cat(options, c.tab).rows.filter((r) => r.section !== undefined).map((r) => [r.id, r.section]);
      expect(headed).toEqual([[c.first, c.heading]]);
    });

    it(`${name}: the heading is drawn once, just above ${c.first}, and is not a row the grammar acts on`, () => {
      const { ctl } = boot(c.o);
      ctl.doAct(`opt:${c.tab}`);
      page!.render();
      const hs = headings();
      expect(hs.map((h) => h.textContent)).toEqual([c.heading]);
      const h = hs[0]!;
      expect(h.dataset.act).toBeUndefined();
      expect((h.nextElementSibling as HTMLElement | null)?.dataset.id).toBe(c.first);
    });

    it(`${name}: Down from the row above the heading lands on ${c.first}, Up goes back, and a click on the heading moves nothing`, () => {
      const { ctl, options } = boot(c.o);
      ctl.doAct(`opt:${c.tab}`);
      const rows = ids(options, c.tab);
      const at = rows.indexOf(c.first);
      ctl.S.opt.zone = 'rows';
      ctl.S.opt.row = at - 1;
      page!.render();
      ctl.press('down');
      expect(rows[ctl.S.opt.row]).toBe(c.first);
      ctl.press('up');
      expect(ctl.S.opt.row).toBe(at - 1);
      page!.render();
      headings()[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(ctl.S.opt.row).toBe(at - 1);
      expect(ctl.S.opt.zone).toBe('rows');
    });
  }

  it('Audio and the launcher-only tabs carry no new heading; Appearance\'s Theme panel keeps its own two', () => {
    const { options } = boot({ touch: true });
    for (const id of ['audio', 'appearance', 'app', 'account', 'mobile']) {
      expect(cat(options, id).rows.filter((r) => r.section !== undefined)).toEqual([]);
    }
    expect(options.panel?.('theme')?.rows.filter((r) => r.section !== undefined).map((r) => r.section)).toEqual(['Theme', 'Background picture']);
  });
});

describe('LATER 294 slice 3: no heading above the rows that lead a tab, when a tab has no card rows', () => {
  const EMPTY = [
    { tab: 'communication', groups: ['communication'], rows: ['mic-on', 'mic-device'] },
    { tab: 'display', groups: ['display', 'console'], rows: ['video-picture', 'render-scale', 'detail-distance', 'shadows', 'show-fps', 'graphics-backend', 'perf-line'] },
    { tab: 'controller', groups: ['controls'], rows: ['stance-mode', 'pad-device', 'pad-dead', REMAP_ROW] },
  ] as const;
  for (const c of EMPTY) {
    it(`${c.tab} with no ${c.groups.join(' or ')} card rows: the rows are the browser ones and none carries a heading`, () => {
      for (const g of c.groups) empty.groups.add(g);
      const { ctl, options } = boot();
      expect(ids(options, c.tab)).toEqual([...c.rows]);
      expect(cat(options, c.tab).rows.filter((r) => r.section !== undefined).map((r) => [r.id, r.section])).toEqual([]);
      ctl.doAct(`opt:${c.tab}`);
      page!.render();
      expect(headings()).toEqual([]);
    });
  }
});
