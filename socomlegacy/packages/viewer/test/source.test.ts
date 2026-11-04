import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { DEV_PARAM, TRACER_HOLD_PARAM, devBadgeLabel, devMode, devSwitches, startSource, tracerHold } from '../src/source';
import { flyAccess } from '../src/flyAccess';

/**
 * Where the page reads the game from (owner, 2026-09-29): the visitor's own disc by default, the served tree only with the
 * developer's `?devmode`.
 */
const here = dirname(fileURLToPath(import.meta.url));
const main = readFileSync(resolve(here, '../src/main.ts'), 'utf-8');

describe('the asset source by the URL', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('names the developer parameter devmode', () => {
    expect(DEV_PARAM).toBe('devmode');
  });

  it('by default is none: the page waits on the visitor disc (the disc page)', () => {
    for (const q of ['', '?', '?map=MP2', '?mode=play', '?mode=play&fly', '?map=MP2&mode=play&mp', '?dev', '?devmodes', '?Devmode', '?x=devmode']) {
      expect(devMode(q), q).toBe(false);
      expect(startSource(q, '/maps'), q).toBeNull();
    }
  });

  it('with devmode (its presence is enough) is the served tree at the page maps directory', () => {
    for (const q of ['?devmode', 'devmode', '?devmode=1', '?map=MP2&devmode', '?mode=play&fly&devmode', '?devmode&map=MP6']) {
      expect(devMode(q), q).toBe(true);
      expect(startSource(q, '/map-viewer/maps'), q).toEqual({ kind: 'http', baseUrl: '/map-viewer/maps' });
    }
  });

  it('?devmode turns on served maps, the fly toggle and the dev tools together', () => {
    for (const q of ['?devmode', 'devmode', '?devmode=1', '?map=MP2&devmode', '?mode=play&fly&devmode']) {
      expect(devSwitches(q), q).toEqual({ any: true, served: true, flyToggle: true, tools: true });
      expect(devBadgeLabel(devSwitches(q)), q).toBe('DEV · maps · fly · tools');
      expect(startSource(q, '/maps'), q).toEqual({ kind: 'http', baseUrl: '/maps' });
      expect(flyAccess(q).toggle, q).toBe(true);
    }
  });

  it('each switch works on its own: served maps, fly in Play on the real disc, and the tools', () => {
    expect(devSwitches('?served')).toEqual({ any: true, served: true, flyToggle: false, tools: false });
    expect(startSource('?served', '/maps')).toEqual({ kind: 'http', baseUrl: '/maps' });
    expect(flyAccess('?served&fly')).toEqual({ toggle: false, startInFly: false, dropFly: true });
    expect(devBadgeLabel(devSwitches('?served'))).toBe('DEV · maps');

    expect(devSwitches('?flyok')).toEqual({ any: true, served: false, flyToggle: true, tools: false });
    expect(startSource('?flyok&mode=play', '/maps')).toBeNull();
    expect(flyAccess('?mode=play&fly&flyok')).toEqual({ toggle: true, startInFly: true, dropFly: false });
    expect(devBadgeLabel(devSwitches('?flyok'))).toBe('DEV · fly');

    expect(devSwitches('?devtools')).toEqual({ any: true, served: false, flyToggle: false, tools: true });
    expect(startSource('?devtools', '/maps')).toBeNull();
    expect(flyAccess('?devtools&fly').toggle).toBe(false);
    expect(devBadgeLabel(devSwitches('?devtools'))).toBe('DEV · tools');
    expect(devBadgeLabel(devSwitches('?served&devtools'))).toBe('DEV · maps · tools');
  });

  it("every dev switch is a development build's only: with import.meta.env.DEV false, served, flyok, devtools and the bare ?devmode are all off (OT.R94, H152 answered)", () => {
    vi.stubEnv('DEV', false);
    const off = { any: false, served: false, flyToggle: false, tools: false };
    for (const q of ['?served', '?flyok', '?devtools', '?served&flyok&devtools', '?mode=play&fly&flyok',
      '?devmode', 'devmode', '?devmode=1', '?devmode&served', '?mode=play&fly&devmode', '?devmode&devtools&tracerhold']) {
      expect(devSwitches(q), q).toEqual(off);
      expect(devMode(q), q).toBe(false);
      expect(devBadgeLabel(devSwitches(q)), q).toBeNull();
      expect(startSource(q, '/maps'), q).toBeNull();
      expect(flyAccess(q).toggle, q).toBe(false);
      expect(tracerHold(q), q).toBe(false);
    }
    // On a development build (the dev server, the e2e specs) the bare ?devmode still turns all three on.
    expect(devSwitches('?devmode', true)).toEqual({ any: true, served: true, flyToggle: true, tools: true });
    expect(devMode('?devmode', true)).toBe(true);
    expect(devMode('?devmode', false)).toBe(false);
    // An explicit build flag says the same as the environment's.
    expect(devSwitches('?devtools', false)).toEqual(off);
    expect(devSwitches('?devtools', true).tools).toBe(true);
  });

  it('with import.meta.env.DEV true each word turns on its own switch', () => {
    vi.stubEnv('DEV', true);
    expect(devSwitches('?served')).toEqual({ any: true, served: true, flyToggle: false, tools: false });
    expect(devSwitches('?flyok')).toEqual({ any: true, served: false, flyToggle: true, tools: false });
    expect(devSwitches('?devtools')).toEqual({ any: true, served: false, flyToggle: false, tools: true });
  });

  it('tracerhold keeps a streak only with devmode, or with devtools on a development build', () => {
    expect(TRACER_HOLD_PARAM).toBe('tracerhold');
    expect(tracerHold('?tracerhold')).toBe(false);
    expect(tracerHold('?devmode')).toBe(false);
    expect(tracerHold('?devmode&tracerhold')).toBe(true);
    expect(tracerHold('?mode=play&map=MP2&devmode&tracerhold')).toBe(true);
    expect(tracerHold('?devtools&tracerhold', false)).toBe(false);
    expect(tracerHold('?devtools&tracerhold', true)).toBe(true);
    expect(tracerHold('?devmode&tracerhold', false)).toBe(false);
  });

  it('the badge is absent unless a dev switch is on, and the test room shows it only then', () => {
    expect(devBadgeLabel(devSwitches(''))).toBeNull();
    expect(devBadgeLabel(devSwitches('?mode=play&fly'))).toBeNull();
    const html = readFileSync(resolve(here, '../setup/index.html'), 'utf-8');
    expect(html).toMatch(/id="dev-badge"[^>]*hidden/);
    expect(main).toContain('devBadgeLabel(DEV)');
    expect(main).toContain("getElementById('dev-badge')");
    expect(main).toContain('devBadge.hidden = false');
  });

  it('main.ts asks for the served index only through the devmode source, never the maps path on its own', () => {
    // The one fetch of the served index goes through `served(SERVED)`, and SERVED is `startSource`'s answer.
    expect(main).toMatch(/const SERVED: SourceRequest \| null = startSource\(SEARCH, MAPS\)/);
    expect(main).toMatch(/SERVED \? await served\(SERVED\) : false/);
    expect(main).not.toMatch(/fetch\(`\$\{MAPS\}/);
  });
});
