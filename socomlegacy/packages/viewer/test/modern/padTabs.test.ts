// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { padLayers } from '../../src/modern/padLayers';
import { StartupNavigation } from '../../src/startupNavigation';
import { BASE, fakeFetch, fakeSession, signedInRoutes } from './lobbies/fixtures';
import { fakePad, PAD } from './padRig';

/**
 * dot's G3 (the modern-UI lane, MU-P1a round 2; MU.R18, MU.R27's one input dispatcher per layer): L1 / R1 on the page are
 * the registered tab reader's alone (`PAD_LAYER_ROUTES_ADAPTATION.page.tiles`: the launcher, or the overlay's tabs). The
 * walker's bumper move (`../../src/startupNavigation.ts`) used to run on the same press: from an interior Play online
 * listbox option it dispatched ArrowUp / ArrowDown first, so the lobby list (`src/modern/lobbies/view.ts` `wireList`)
 * moved its roving tab stop and its remembered row before the tile switched. With a tab reader registered the walker
 * leaves the bumpers alone; standalone (no reader: a bare setup page, a test host) its bumper fallback stays.
 */
beforeEach(() => {
  localStorage.clear();
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  HTMLElement.prototype.scrollIntoView = vi.fn();
  const f = fakeFetch(signedInRoutes());
  vi.stubGlobal('fetch', ((input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://page.test').pathname;
    const key = Object.keys(signedInRoutes()).find((k) => path.endsWith(k));
    return key ? f.fetch(`${BASE}${key}`, init) : Promise.resolve(new Response('{}', { status: 503 }));
  }) as typeof fetch);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

const settle = async (): Promise<void> => { for (let i = 0; i < 8; i++) await new Promise((res) => { setTimeout(res, 0); }); };

describe('G3: L1 / R1 are the tab reader\'s alone where one is registered', () => {
  it('standalone (no tab reader), the walker\'s bumpers still move to the previous / next control', () => {
    document.body.innerHTML = '<main id="m"><button id="a">A</button><button id="b">B</button><button id="c">C</button></main>';
    const nav = new StartupNavigation(document.getElementById('m')!, () => false);
    const pad = fakePad();
    let now = 0;
    const frame = (down: number[] = []): void => { pad.buttons.forEach((g, i) => { const b = g as { pressed: boolean; value: number }; b.pressed = down.includes(i); b.value = b.pressed ? 1 : 0; }); now += 500; nav.frame(pad, now, false); };
    document.getElementById('a')!.focus();
    frame(); frame(); frame([PAD.R1]); frame();
    expect(document.activeElement!.id).toBe('b');
    frame([PAD.L1]); frame();
    expect(document.activeElement!.id).toBe('a');
  });
});
