// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** LATER 438 (product track; 4d8e4d41e): the test-room dock shows only while the page is the solo room. */
vi.mock('../src/agent/install', () => ({ mountPageAgent: vi.fn(() => ({ dispose: vi.fn() })), captureGameCanvas: vi.fn() }));
vi.mock('../src/agent/testroomTarget', () => ({ createTestroomPageTarget: vi.fn(() => ({})) }));
vi.mock('../src/agent/localPacks', () => ({ createLocalPackApi: vi.fn(() => ({ dispose: vi.fn() })) }));
import { mountTestroomAgent } from '../src/agent/testroomInstall';
import { publishSoloAgentApi } from '../src/testroom/agent/host';
import type { SoloTestroomTarget } from '../src/testroom/agent/target';

function soloApi(mode: 'testroom-solo' | 'blocked') {
  const listeners = new Set<() => void>();
  let current = mode;
  const api = {
    read: () => ({ mode: current, buildAllowed: true }),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); },
    refreshExternalState: () => undefined,
  } as unknown as SoloTestroomTarget;
  return { api, set(next: 'testroom-solo' | 'blocked') { current = next; for (const l of listeners) l(); }, listeners };
}
const dock = () => document.querySelector<HTMLDetailsElement>('.agent-testroom-dock')!;

afterEach(() => { publishSoloAgentApi(null); document.body.replaceChildren(); });
describe('LATER 438: the test-room dock is the solo room\'s', () => {
  it('shown in the solo room, hidden off it, and back when the solo room returns', () => {
    const solo = soloApi('testroom-solo');
    publishSoloAgentApi(solo.api);
    const mounted = mountTestroomAgent(document);
    expect(dock().hidden).toBe(false);
    solo.set('blocked');                                 // an online match or a replay on this page
    expect(dock().hidden).toBe(true);
    solo.set('testroom-solo');
    expect(dock().hidden).toBe(false);
    mounted.dispose();
    expect(document.querySelector('.agent-testroom-dock')).toBeNull();
    expect(solo.listeners.size).toBe(0);                 // the mode subscription is let go with the dock
  });

  it('hidden from the first frame when the page opens off the solo room, and with no solo API at all', () => {
    const mounted = mountTestroomAgent(document);
    expect(dock().hidden).toBe(true);                   // no API published yet
    const online = soloApi('blocked');
    publishSoloAgentApi(online.api);
    expect(dock().hidden).toBe(true);
    publishSoloAgentApi(null);
    expect(dock().hidden).toBe(true);
    mounted.dispose();
  });
});

describe("the owner, 2026-10-30: the dock sits at the bottom of the test room's settings panel", () => {
  it('appended last in #panel-body when the page has one, after what the panel already holds', () => {
    document.body.innerHTML = '<div id="panel"><div id="panel-body"><section id="map-section"></section></div></div>';
    const mounted = mountTestroomAgent(document);
    const body = document.getElementById('panel-body')!;
    expect(dock().parentElement).toBe(body);
    expect(body.lastElementChild).toBe(dock());
    mounted.dispose();
    expect(body.querySelector('.agent-testroom-dock')).toBeNull();
  });

  it("stays last when a section is appended to the panel after it (the model pack, a dev build's taunt editor)", async () => {
    document.body.innerHTML = '<div id="panel"><div id="panel-body"><section id="map-section"></section></div></div>';
    const mounted = mountTestroomAgent(document);
    const body = document.getElementById('panel-body')!;
    const late = document.createElement('section'); body.append(late);
    await Promise.resolve();                                         // the observer's microtask
    expect(body.lastElementChild).toBe(dock());
    expect(late.nextElementSibling).toBe(dock());
    mounted.dispose();
    body.append(document.createElement('section'));
    await Promise.resolve();
    expect(body.querySelector('.agent-testroom-dock')).toBeNull();   // let go at dispose: never re-added
  });

  it('on the body, as before, on a page without the settings panel', () => {
    const mounted = mountTestroomAgent(document);
    expect(dock().parentElement).toBe(document.body);
    mounted.dispose();
  });
});

/**
 * B190 (`e2e/settingsPanel.spec.ts`'s touch-target walk, red at 812x375, 667x375 and 390x844: "SUMMARY: 40", "SELECT:
 * 42"): in the settings panel the dock is one of the panel's sections, so on a touch screen its summary, its picker and
 * its buttons are 44 px tall like the panel's own controls (`../src/styles.css`'s `(pointer: coarse)` block), and its
 * summary wraps rather than overflows. A browser adaptation (product track); jsdom does no layout, so the sheet is read.
 */
describe('B190: the in-panel dock meets the settings panel\'s 44 px touch target', () => {
  const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/agent/panel.css'), 'utf8');
  const coarse = [...css.matchAll(/@media \(pointer: coarse\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]!).join('\n');
  const rule = (sel: string): string => {
    const at = coarse.indexOf(sel);
    expect(at, sel).toBeGreaterThanOrEqual(0);
    return coarse.slice(at, coarse.indexOf('}', at));
  };

  it('on a touch screen the summary, the select, the text fields and the buttons are at least 44 px tall', () => {
    for (const sel of ['.agent-testroom-dock--in-panel > summary', '.agent-testroom-dock--in-panel select', '.agent-testroom-dock--in-panel button', '.agent-testroom-dock--in-panel input[type="text"]', '.agent-testroom-dock--in-panel .agent-panel__file-button']) {
      expect(rule(sel), sel).toMatch(/min-height:\s*44px/);
    }
  });

  it('the summary wraps its words rather than overflowing the panel', () => {
    expect(css).toMatch(/\.agent-testroom-dock--in-panel > summary\s*\{[^}]*overflow-wrap:\s*anywhere/);
  });
});
