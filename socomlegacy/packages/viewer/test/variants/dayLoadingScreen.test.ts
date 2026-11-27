import { describe, expect, it, vi } from 'vitest';
import { LOADING_UIVARS } from '@s2u/ui/loading';
import type { LoadingScreen } from '../../src/loadingAssets';
import type { UiBitmap } from '../../src/uiCompositorView';
import type { DayPictures } from '../../src/variants/dayPictures';

/**
 * DAY-PIC-OVERRIDE (product track: a browser adaptation, display only): the lobby's loading screen
 * (`pageLobbyMatchScreen`) draws a Day game's own picture, told by the welcome's variant, and the night game's the
 * disc's. The disc read is stubbed, as `./loadingTitle.test.ts` stubs it.
 */
vi.mock('../../src/loadingAssets', () => ({
  loadingFromDisc: (_source: unknown, map: string) => Promise.resolve(screenFor(map)),
}));
const { pageLobbyMatchScreen } = await import('../../src/lobbyMatch');

const bmp = (tag: number, width = 2, height = 1): UiBitmap => ({ width, height, data: new Uint8ClampedArray(width * height * 4).fill(tag) });
const NIGHT5 = bmp(50), DAY5 = bmp(205);   // small: a failed identity check prints both bitmaps whole
function screenFor(map = 'RUN/MP5.ZDB'): LoadingScreen {
  const vars = new Map([[LOADING_UIVARS.title, 'ABANDONED'], [LOADING_UIVARS.picture, 'ld_mp5_prog.tif']]);
  return {
    map, layout: {}, libraries: [], spin: null, fade: null, fonts: [], strings: [], unheld: [], missing: [],
    bitmaps: [['ld_mp5_prog.tif', NIGHT5]],
    binding: { title: 'ABANDONED', description: ' ', picture: 'ld_mp5_prog.tif', library: 'ui/assetlib/ld/om05', stem: 'OM05', vars },
  } as unknown as LoadingScreen;
}
const pictures: DayPictures = {
  get: (f) => (f === 'abandoned-day-512x256.png' ? DAY5 : null),
  load: (f) => Promise.resolve(f === 'abandoned-day-512x256.png' ? DAY5 : null),
};

describe("the lobby's loading screen (DAY-PIC-OVERRIDE)", () => {
  it('a Day load shows the Day picture and the Day title; the night load the night picture', async () => {
    const shown: LoadingScreen[] = [];
    const panel = { cover: () => {}, show: (s: LoadingScreen) => { shown.push(s); }, hide: () => {} };
    const ports = pageLobbyMatchScreen(panel, {} as never, pictures);
    ports.screen.show('mp5', 'day');
    await vi.waitFor(() => expect(shown.length).toBe(1));
    expect(new Map(shown[0]!.bitmaps).get('ld_mp5_prog.tif')).toBe(DAY5);
    expect(shown[0]!.binding?.vars.get(LOADING_UIVARS.title)).toBe('ABANDONED (DAY)');
    ports.screen.show('mp5');
    await vi.waitFor(() => expect(shown.length).toBe(2));
    expect(new Map(shown[1]!.bitmaps).get('ld_mp5_prog.tif')).toBe(NIGHT5);
    ports.screen.show('mp5', 'night');
    await vi.waitFor(() => expect(shown.length).toBe(3));
    expect(new Map(shown[2]!.bitmaps).get('ld_mp5_prog.tif')).toBe(NIGHT5);
  });

  it('a Day load still waiting on its picture, then hidden, then a night load: the late Day picture paints nothing (F2)', async () => {
    const shown: LoadingScreen[] = [];
    const panel = { cover: () => {}, show: (s: LoadingScreen) => { shown.push(s); }, hide: () => {} };
    let arrive: (b: UiBitmap | null) => void = () => {};
    const cold: DayPictures = { get: () => null, load: () => new Promise((done) => { arrive = done; }) };
    const ports = pageLobbyMatchScreen(panel, {} as never, cold);
    ports.screen.show('mp5', 'day');
    await new Promise((r) => setTimeout(r, 20));                             // the disc read in, the picture's fetch still out
    ports.screen.hide();
    ports.screen.show('mp5', 'night');
    await vi.waitFor(() => expect(shown.length).toBe(1));
    arrive(DAY5);
    await new Promise((r) => setTimeout(r, 20));
    expect(shown.length).toBe(1);
    expect(new Map(shown[0]!.bitmaps).get('ld_mp5_prog.tif') === NIGHT5).toBe(true);
    expect(shown[0]!.binding?.vars.get(LOADING_UIVARS.title)).toBe('ABANDONED');
  });
});
