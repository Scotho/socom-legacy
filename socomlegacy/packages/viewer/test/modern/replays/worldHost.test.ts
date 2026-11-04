// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { openedDiscImage, openedDiscRequest, openFrontEndImage } from '../../../src/discPrompt';
import { buildIso } from '../../../../archive/test/isoImage';
import { enterReplayWorld, installReplayWorld, REPLAY_WORLD_KEY, replayWorldDeps, replayWorldHost, type ReplayWorldHost } from '../../../src/modern/replays/worldHost';
import type { NetOptions, NetWalk } from '../../../src/net/client';

/**
 * MU-11's seam, the test room's side (`src/modern/replays/worldHost.ts`, `src/main.ts`): the test room is the replay
 * viewer's world only when its address asks for it (`replayview`) AND the frame element it sits in -- the shell's page,
 * same origin, the only one that can reach it -- carries the host. Without either, nothing of the test room changes;
 * its developer mode (`?devmode&replay=`, PT-18) is the same text as before.
 */

const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../src', f), 'utf-8');

const fakeHost = (): ReplayWorldHost => ({ disc: () => null, client: vi.fn() as never, attached: vi.fn(), failed: vi.fn() });

describe('the test room finds its host (replayWorldHost)', () => {
  it('only with replayview in the address and a frame element that carries the host', () => {
    const frame = document.createElement('iframe');
    const host = fakeHost();
    expect(replayWorldHost({ frameElement: frame }, '?replayview&map=MP2')).toBeNull();          // no host hung on it
    installReplayWorld(frame, host);
    expect((frame as unknown as Record<symbol, unknown>)[REPLAY_WORLD_KEY]).toBe(host);
    expect(replayWorldHost({ frameElement: frame }, '?replayview&map=MP2')).toBe(host);
    expect(replayWorldHost({ frameElement: frame }, '?map=MP2')).toBeNull();                      // not asked
    expect(replayWorldHost({ frameElement: null }, '?replayview&map=MP2')).toBeNull();            // a top page, or a cross-origin parent
    expect(replayWorldHost(undefined, '?replayview')).toBeNull();
    expect(REPLAY_WORLD_KEY).toBe(Symbol.for('s2u.replay-world'));                                // one key across the two pages' realms
  });

  it('a malformed host is no host', () => {
    const frame = document.createElement('iframe');
    (frame as unknown as Record<symbol, unknown>)[REPLAY_WORLD_KEY] = { client: 'x' };
    expect(replayWorldHost({ frameElement: frame }, '?replayview')).toBeNull();
  });

  it('RV2-03: ready is optional -- a host without it is still well-formed, one with it is handed as it is, one whose ready is no function is no host', () => {
    const frame = document.createElement('iframe');
    const without = fakeHost();
    expect('ready' in without).toBe(false);
    installReplayWorld(frame, without);
    expect(replayWorldHost({ frameElement: frame }, '?replayview')).toBe(without);
    const ready = vi.fn();
    const withReady: ReplayWorldHost = { ...fakeHost(), ready };
    installReplayWorld(frame, withReady);
    replayWorldHost({ frameElement: frame }, '?replayview')!.ready?.();
    expect(ready).toHaveBeenCalledTimes(1);
    (frame as unknown as Record<symbol, unknown>)[REPLAY_WORLD_KEY] = { ...fakeHost(), ready: 'soon' };
    expect(replayWorldHost({ frameElement: frame }, '?replayview')).toBeNull();
  });
});

describe("RV-7c-2: the world's deps hand the host the page's hooks (replayWorldDeps)", () => {
  const o = { url: 'replay:', map: 'MP2', name: 'W', watch: true } as NetOptions, walk = {} as NetWalk;
  it("the page's throwables and hull go with each client the page asks the host for", () => {
    const host = fakeHost();
    const page = { throwable: () => null, hull: () => null };
    replayWorldDeps(host, page).client(o, walk);
    expect(host.client).toHaveBeenCalledWith(o, walk, page);
  });
  it('without them, the host is asked as before (the modern page unchanged)', () => {
    const host = fakeHost();
    replayWorldDeps(host).client(o, walk);
    expect(host.client).toHaveBeenCalledWith(o, walk, undefined);
  });
});

describe('the test room entered as the world (enterReplayWorld)', () => {
  it('hides the page\'s own chrome and opens the handed disc image when nothing is served', () => {
    document.body.innerHTML = '<nav id="site-links"></nav>';
    const disc = { kind: 'iso' as const, file: new File([new Uint8Array(1)], 'SOCOM2.iso') };
    const openDisc = vi.fn();
    enterReplayWorld(document, { ...fakeHost(), disc: () => disc }, openDisc, false);
    expect(document.body.classList.contains('chrome-hidden')).toBe(true);
    expect(document.getElementById('site-links')!.style.display).toBe('none');
    expect(openDisc).toHaveBeenCalledWith(disc);
  });
  it('a folder the setup page opened is handed as its request, as an image is (DA-4, DA-3 review F2)', () => {
    document.body.innerHTML = '';
    const folder = { kind: 'dir' as const, entries: [{ path: 'SOCOM2/SYSTEM.CNF', file: new File([], 'SYSTEM.CNF') }] };
    const openDisc = vi.fn();
    enterReplayWorld(document, { ...fakeHost(), disc: () => folder }, openDisc, false);
    expect(openDisc).toHaveBeenCalledWith(folder);
  });
  it('LATER 322: the kept copy the launcher started from is handed as its stored request, as an image is', () => {
    document.body.innerHTML = '';
    const kept = { kind: 'stored' as const, identity: { boot: 'SCUS_972.75', ver: '1.02', vmode: 'NTSC' } };
    const openDisc = vi.fn();
    enterReplayWorld(document, { ...fakeHost(), disc: () => kept }, openDisc, false);
    expect(openDisc).toHaveBeenCalledWith(kept);
  });
  it('a served tree, or no image handed: no disc opened (the test room\'s own disc page asks)', () => {
    document.body.innerHTML = '';
    const openDisc = vi.fn();
    enterReplayWorld(document, { ...fakeHost(), disc: () => ({ kind: 'iso', file: new File([], 'a.iso') }) }, openDisc, true);
    enterReplayWorld(document, fakeHost(), openDisc, false);
    expect(openDisc).not.toHaveBeenCalled();
  });
});

describe('main.ts: the seam is additive', () => {
  const main = src('main.ts');
  it('the host is read once, the test room\'s replay capability\'s, and the world branch returns before the developer\'s replay mode', () => {
    expect(main).toMatch(/const REPLAY_WORLD = TESTROOM_CAPABILITIES\.replay \? replayWorldHost\(globalThis\.window, SEARCH\) : null;/);
    expect(main).toMatch(/if \(REPLAY_WORLD\) enterReplayWorld\(document, REPLAY_WORLD, openDisc, SERVED !== null\);/);
    expect(main).toMatch(/if \(REPLAY_WORLD\) \{[\s\S]{0,900}?new NetPage\(\{ \.\.\.deps, \.\.\.replayWorldDeps\(REPLAY_WORLD, \{ throwable: \(k\) => throws\.throwable\(k\), hull: replayHull \}\)[\s\S]{0,400}?REPLAY_WORLD\.attached\(\{ spectator: net\.spectator \}\);[\s\S]{0,200}?return;\n\s+\}\n[\s\S]{0,400}?const replayOn = /);
  });
  it('the developer\'s replay mode (PT-18) is as it was: its line, its branch, its import', () => {
    expect(main).toMatch(/const replayOn = TESTROOM_CAPABILITIES\.replay && import\.meta.env\.DEV && DEV\.tools && new URLSearchParams\(SEARCH\)\.has\('replay'\);\n\s+if \(replayOn\) \{\n\s+void import\('\.\/replay\/mount'\)\.then\(\(\{ replayClient \}\) => \{\n\s+if \(loaded !== map \|\| net\) return;[^\n]*\n\s+net = new NetPage\(\{ \.\.\.deps, client: replayClient\(SEARCH[^\n]*?\), world: \(\) => \(pageWorld\?\.ground === map\.ground \? pageWorld : null\) \}, 'replay:', stem, playerName\(\), undefined, true, RULES\);\n\s+showOnline\(\);\n\s+\}\)(?:\.catch\([^\n]*\))?;\n\s+\} else if \(NET\.url && !campaignLoad\) \{/);   // the import's rejection handler (WebKit pageerror; test/importRejections.test.ts) is allowed; replayClient's later arguments (LATER 32's throwable, #135) too
    expect(main.match(/client: /g)?.length).toBe(2);       // PT-18's pin (test/replayMode.test.ts) still holds
  });
  it('RV2-03 (RV2.R2): the world is told ready at the loading screen\'s hide, once in the page, after the hide; the live page\'s line is as it was but for that guarded call', () => {
    // W38.R3's pattern for the live path: the branch's statements are the base commit's (323daa95d) in their order, the
    // one addition a call through `REPLAY_WORLD?.` -- null on every page the viewer did not frame, so nothing runs.
    expect(main).toMatch(/^\s+if \(step === 'released' \|\| step === 'failed'\) \{ loadingScreen\.watch\.ready\(wantedMap\); loadingScreen\.panel\.hide\(\); showOnline\(\); REPLAY_WORLD\?\.ready\?\.\(\); \}$/m);
    expect(main.match(/REPLAY_WORLD\?\.ready\?\.\(\)/g)?.length).toBe(1);
    expect(main.match(/\.ready\?\.\(\)/g)?.length).toBe(1);
  });
  it('RV2-03 (RV2.R2): the developer\'s replay mode is handed the page\'s loading hold as its held hook, and only it', () => {
    expect(main).toMatch(/client: replayClient\(SEARCH, undefined, \{ throwable: \(k\) => throws\.throwable\(k\), hull: replayHull, held: \(\) => loadingJoin\.blocked \}\)/);
    expect(main.match(/held: \(\) => loadingJoin\.blocked/g)?.length).toBe(1);
  });
});

describe('main.ts: framed as the world, the test room keeps to itself (MU-11 review 1, 3)', () => {
  const main = src('main.ts');
  it('no reCOM play: playOn is false under the host, the visitor\'s choice otherwise', () => {
    expect(main).toMatch(/^let playOn = REPLAY_WORLD \? false : \(SHARE\.play \?\? readPlayChoice\(\) === '1'\);(\s*\/\/[^\n]*)?$/m);
  });
  it('no storage written for the map: rememberMap returns first under the host', () => {
    expect(main).toMatch(/function rememberMap\(path: string\): void \{\n\s+if \(REPLAY_WORLD\) return;[^\n]*\n\s+const archive = /);
  });
  it('no players poller: no /rooms request of its own under the host', () => {
    expect(main).toMatch(/^const rooms = REPLAY_WORLD \? null : playersPoller\(MULTIPLAYER, NET\.choice, ROOMS_OVERRIDE,/m);
  });
  it('its failures are told to the viewer: the worker stopping, a decode error, a disc that opens no map, an empty picker, no renderer', () => {
    expect(main).toMatch(/wireWorkerFailure\(worker, ui, \(\) => \{ REPLAY_WORLD\?\.failed\(/);
    expect(main).toMatch(/const failure = `failed while \$\{message\.doing\}: \$\{message\.message\}`;\n\s+REPLAY_WORLD\?\.failed\(failure\);/);
    expect(main).toMatch(/ui\.setDiscState\(line, 'error'\);\n\s+REPLAY_WORLD\?\.failed\(line\);/);
    expect(main).toMatch(/const empty = emptyPickerStatus\([^\n]*\n\s+REPLAY_WORLD\?\.failed\(empty\);/);
    expect(main).toMatch(/boot\(\)\.catch\(\(e: unknown\) => \{[\s\S]{0,400}?REPLAY_WORLD\?\.failed\(/);
  });
});

describe('the release build hosts the world (MU-11 review 2)', () => {
  it('with DEV off: /testroom is still the test room, its replay capability on, and the host found -- none of it a development build\'s', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('PROD', true);
    vi.resetModules();
    try {
      expect(import.meta.env.DEV).toBe(false);
      const { readPageAddress, bootPage } = await import('../../../src/pageEntry');
      const { TESTROOM_CAPABILITIES } = await import('../../../src/matchCore');
      const { replayWorldHost: find, installReplayWorld: install } = await import('../../../src/modern/replays/worldHost');
      expect(readPageAddress('/socomlegacy/testroom?replayview&map=MP2', '/socomlegacy/')).toEqual({ testRoom: true, search: '?replayview&map=MP2', playtest: false });
      const main = vi.fn(async () => ({}));
      const entry = await bootPage('/socomlegacy/testroom?replayview&map=MP2', document, { main, frontEnd: async () => { throw new Error('not the front end'); } }, '/socomlegacy/');
      expect(entry).toEqual({ entry: 'viewer' });
      expect(main).toHaveBeenCalledTimes(1);
      expect(TESTROOM_CAPABILITIES.replay).toBe(true);
      const frame = document.createElement('iframe');
      const host = fakeHost();
      install(frame, host);
      expect(find({ frameElement: frame }, '?replayview&map=MP2')).toBe(host);
      // main.ts reads the host with no build gate (the developer's replay mode keeps its own `import.meta.env.DEV`).
      expect(src('main.ts')).toMatch(/^const REPLAY_WORLD = TESTROOM_CAPABILITIES\.replay \? replayWorldHost\(globalThis\.window, SEARCH\) : null;$/m);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
      document.body.className = '';
    }
  });
});

describe('the opened disc image (discPrompt openedDiscImage)', () => {
  /** A generated image with the one file `openFrontEndImage` asks after (four zero bytes: nothing of the disc). */
  const image = (name: string): File => new File([buildIso([{ path: 'RUN/UI/READERC.ZAR', bytes: new Uint8Array(4) }])], name);
  it('is the last image that opened; a newer one being read, or refused, clears it', async () => {
    const a = image('a.iso'), b = image('b.iso');
    await openFrontEndImage(a);
    expect(openedDiscImage()).toBe(a);
    const pb = openFrontEndImage(b);
    expect(openedDiscImage()).toBeNull();                   // b being read: not ready, nothing handed
    await pb;
    expect(openedDiscImage()).toBe(b);
    await expect(openFrontEndImage(new File([new Uint8Array(40 * 2048)], 'c.iso'))).rejects.toThrow(/not an ISO9660 image/);
    expect(openedDiscImage()).toBeNull();
  });
  it('openedDiscRequest is the same disc as a request (DA-4, DA-3 review F2): the image as { kind: iso }, none while one is read', async () => {
    const a = image('a.iso');
    const pa = openFrontEndImage(a);
    expect(openedDiscRequest()).toBeNull();
    await pa;
    expect(openedDiscRequest()).toEqual({ kind: 'iso', file: a });
    expect((openedDiscRequest() as { file: File }).file).toBe(a);
  });
});
