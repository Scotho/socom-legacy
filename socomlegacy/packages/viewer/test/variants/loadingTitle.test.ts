import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { LOADING_UIVARS } from '@s2u/ui/loading';
import type { LoadingScreen } from '../../src/loadingAssets';
import { withVariantTitle } from '../../src/variants/loadingTitle';

/**
 * DAY-TITLE (product track: a browser adaptation, display only; DAY.R1): a Day game's loading screen names the variant
 * (`variantName`, `ABANDONED (DAY)`) in its title -- `binding.title` and the layout's `mission_title` UIVAR, which the
 * drawing reads (`../../src/loadingLayout`) -- never the night parent's; the picture stays the parent's (no Day picture
 * in git yet). The disc read is stubbed: the screen is hand-built with only the fields the title touches.
 */
vi.mock('../../src/loadingAssets', () => ({
  loadingFromDisc: (_source: unknown, map: string) => Promise.resolve(screenFor(map)),
}));
const { pageLobbyMatchScreen } = await import('../../src/lobbyMatch');

function screenFor(map = 'RUN/MP5.ZDB'): LoadingScreen {
  const vars = new Map([[LOADING_UIVARS.title, 'ABANDONED'], [LOADING_UIVARS.picture, 'ld_mp5_prog.tif']]);
  return {
    map, layout: {}, libraries: [], spin: null, fade: null, fonts: [], strings: [], bitmaps: [], unheld: [], missing: [],
    binding: { title: 'ABANDONED', description: ' ', picture: 'ld_mp5_prog.tif', library: 'ui/assetlib/ld/om05', stem: 'OM05', vars },
  } as unknown as LoadingScreen;
}

describe('withVariantTitle (DAY-TITLE)', () => {
  it("a told Day variant's title, in the binding and its UIVAR; the picture is the parent's", () => {
    const s = withVariantTitle(screenFor(), 'day');
    expect(s.binding?.title).toBe('ABANDONED (DAY)');
    expect(s.binding?.vars.get(LOADING_UIVARS.title)).toBe('ABANDONED (DAY)');
    expect(s.binding?.picture).toBe('ld_mp5_prog.tif');
    expect(s.binding?.vars.get(LOADING_UIVARS.picture)).toBe('ld_mp5_prog.tif');
  });

  it('no variant, a pair off the table or no binding: the screen as read', () => {
    const plain = screenFor();
    expect(withVariantTitle(plain, undefined)).toBe(plain);
    expect(withVariantTitle(screenFor('RUN/MP2.ZDB'), 'day').binding?.title).toBe('ABANDONED');
    const bare = { ...plain, binding: null };
    expect(withVariantTitle(bare, 'day')).toBe(bare);
  });

  it("never changes the screen it was given (the parent's, kept for a decoded game)", () => {
    const s = screenFor();
    withVariantTitle(s, 'day');
    expect(s.binding?.title).toBe('ABANDONED');
    expect(s.binding?.vars.get(LOADING_UIVARS.title)).toBe('ABANDONED');
  });

  it("the lobby's loading screen shows the welcome's variant title", async () => {
    const shown: LoadingScreen[] = [];
    const panel = { cover: () => {}, show: (s: LoadingScreen) => { shown.push(s); }, hide: () => {} };
    const ports = pageLobbyMatchScreen(panel, {} as never);
    ports.screen.show('mp5', 'day');
    await vi.waitFor(() => expect(shown.length).toBe(1));
    expect(shown[0]!.binding?.vars.get(LOADING_UIVARS.title)).toBe('ABANDONED (DAY)');
    ports.screen.show('mp5');
    await vi.waitFor(() => expect(shown.length).toBe(2));
    expect(shown[1]!.binding?.vars.get(LOADING_UIVARS.title)).toBe('ABANDONED');
  });

  it("LobbyMatch hands the welcome's variant to the screen", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/lobbyMatch.ts'), 'utf8');
    expect(src).toContain('this.o.screen.show(h.mission, h.welcome?.variant);');
  });
});
