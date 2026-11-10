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

/**
 * VS-2: Display's browser rows (`VIDEO_SCHEMA`'s launcher rows under Automatic, the page's picture, Name tags and -- HUD-ALIVE
 * C, OT.R117 -- the Range readout in the same Picture group with no heading of its own, Restore defaults, This device).
 */
const BROWSER_DISPLAY = ['video-preset', 'render-scale', 'video-ceiling', 'video-frame-cap', 'show-fps', 'shadows', 'detail-distance', 'video-antialias', 'graphics-backend', 'video-picture', 'name-tags', 'range-readout', 'video-restore', 'device-memory', 'device-detected', 'perf-line'];
/** VS-2: the spec §4.2's groups after the first, each heading its group's first row (the first group's row carries "This browser"). */
const DISPLAY_GROUPS: readonly (readonly [string, string])[] = [['render-scale', 'Display'], ['shadows', 'Detail'], ['graphics-backend', 'Renderer'], ['video-picture', 'Picture'], ['device-memory', 'This device']];
const CARD_CONTROLS = ['SelectedControllerConfig', 'VIBRATION_CONTROLLER', 'AutoAim', 'INVERT_PITCH_CONTROLLER', 'FIREMODESWAP_CONTROLLER', 'stick_preset', 'STICK_SENSITIVITY', 'STICK_INERTIA', 'STICK_DEADZONE'];
const ROWS = {
  // HD-4: Display's "Video" row (the page's picture) leads the browser's rows, under the same heading.
  // VS-2: the browser's rows from the video schema, in its order and groups (the Custom-only rows hidden under Automatic)
  display: ['BRIGHTNESS', 'BOBBING_1ST_PERSON', 'DISPLAY_MP_TEAM_NAMES', 'ScreenOriginX', 'ScreenOriginY', ...BROWSER_DISPLAY],   // SS-1 D4: Help windows not offered
  controller: ['stance-mode', 'pad-device', 'pad-dead', REMAP_ROW, ...CARD_CONTROLS],
  controllerOverlay: ['stance-mode', 'pad-device', 'pad-dead', REMAP_ROW, OVERLAY_BUTTON_ROW, ...CARD_CONTROLS],
  communication: ['EnableExternalWhispers', 'mic-on', 'mic-device'],
};

/** Each tab's owner heading: its words (the spec's) and the row it sits above; VS-2: Display's group headings after it (`more`). */
const CASES: readonly { tab: string; heading: string; first: string; rows: readonly string[]; o: { touch?: boolean; overlay?: boolean }; more: readonly (readonly [string, string])[] }[] = [
  { tab: 'display', heading: 'This browser', first: 'video-preset', rows: ROWS.display, o: {}, more: DISPLAY_GROUPS },
  { tab: 'controller', heading: 'Layout and aiming', first: 'SelectedControllerConfig', rows: ROWS.controller, o: {}, more: [] },
  { tab: 'controller', heading: 'Layout and aiming', first: 'SelectedControllerConfig', rows: ROWS.controllerOverlay, o: { overlay: true, touch: true }, more: [] },
  { tab: 'communication', heading: 'This browser', first: 'mic-on', rows: ROWS.communication, o: {}, more: [] },
];

describe('LATER 294 slice 3: headings on Display, Controller and Communication', () => {
  for (const c of CASES) {
    const name = `${c.tab}${'overlay' in c.o ? ' (with Overlay button and Mobile)' : ''}`;

    it(`${name}: the rows and their order are unchanged, and one row carries the "${c.heading}" heading`, () => {
      const { options } = boot(c.o);
      expect(ids(options, c.tab)).toEqual([...c.rows]);
      const headed = cat(options, c.tab).rows.filter((r) => r.section !== undefined).map((r) => [r.id, r.section]);
      expect(headed).toEqual([[c.first, c.heading], ...c.more.map(([id, h]) => [id, h])]);
    });

    it(`${name}: the heading is drawn once, just above ${c.first} (and each group heading above its row), and is not a row the grammar acts on`, () => {
      const { ctl, options } = boot(c.o);
      ctl.doAct(`opt:${c.tab}`);
      page!.render();
      const hs = headings();
      expect(hs.map((h) => h.textContent)).toEqual([c.heading, ...c.more.map(([, h]) => h)]);
      const h = hs[0]!;
      expect(h.dataset.act).toBeUndefined();
      expect((h.nextElementSibling as HTMLElement | null)?.dataset.id).toBe(c.first);
      // an info row (This device's readouts) carries no data-id: its index (`data-row`) names it
      const rowIds = ids(options, c.tab);
      const named = (el: Element | null): string | undefined => { const e = el as HTMLElement | null; return e?.dataset.id ?? (e?.dataset.row !== undefined ? rowIds[Number(e.dataset.row)] : undefined); };
      c.more.forEach(([id], i) => { expect(hs[i + 1]!.dataset.act).toBeUndefined(); expect(named(hs[i + 1]!.nextElementSibling)).toBe(id); });
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
    { tab: 'communication', groups: ['communication'], rows: ['mic-on', 'mic-device'], more: [] },
    { tab: 'display', groups: ['display', 'console'], rows: BROWSER_DISPLAY, more: DISPLAY_GROUPS },
  ];
  for (const c of EMPTY) {
    it(`${c.tab} with no ${c.groups.join(' or ')} card rows: the rows are the browser ones and none carries the owner heading (VS-2: Display's group headings stay)`, () => {
      for (const g of c.groups) empty.groups.add(g);
      const { ctl, options } = boot();
      expect(ids(options, c.tab)).toEqual([...c.rows]);
      expect(cat(options, c.tab).rows.filter((r) => r.section !== undefined).map((r) => [r.id, r.section])).toEqual(c.more.map(([id, h]) => [id, h]));
      ctl.doAct(`opt:${c.tab}`);
      page!.render();
      expect(headings().map((h) => h.textContent)).toEqual(c.more.map(([, h]) => h));
    });
  }
});
