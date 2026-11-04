// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootPage, LAUNCH_PARAM, PAGE_LOADERS, readPageAddress, wantsLaunchSheet, type PageLoaders } from '../src/pageEntry';
import type { FrontEndMount } from '../src/frontEnd';
import type { LaunchSheetMount, LaunchSheetOptions } from '../src/launchSettings/sheet';
import { builtTitle, readBuiltDist, VIEWER_DIST } from './builtDist';

/**
 * PTT-9 (web sprint 37, W37.R6; research 243 §9), the routing, in `src/pageEntry.ts` only (no `main.ts` line, the merge
 * controller's word): on a development build the launch settings sheet stands before the test room when its address
 * has no parameter (or has `?launch`), and at the new `/playtest` segment; a link WITH parameters is the page it was,
 * byte for byte in behaviour -- the same `import('./main')` and nothing else, asserted on the entry's loaders. In a
 * release (and the demo) the sheet's loader is not there -- it is made under a literal `import.meta.env.DEV`, as the
 * keyboard's sites are (OT.R29, `test/build_keyboard.test.ts`) -- so `/testroom` with no parameter is the test room
 * and `/playtest` the front end, as today. LAUNCH_SETTINGS_ADAPTATION: a browser adaptation, nothing of the game.
 */

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, '../setup/index.html'), 'utf-8');
const body = (): string => html.slice(html.indexOf('<body'), html.indexOf('</body>')).replace(/^<body[^>]*>/, '').replace(/<script[\s\S]*?<\/script>/g, '');
function loadPage(): void {
  document.body.className = 'panel-collapsed';
  document.body.innerHTML = body();
}

/** The entry's loaders with a sheet: each call recorded, the sheet's options kept. */
function loaders(withSheet = true): { loaders: PageLoaders; calls: string[]; sheets: LaunchSheetOptions[] } {
  const calls: string[] = [];
  const sheets: LaunchSheetOptions[] = [];
  const mount = { canvas: document.createElement('canvas'), status: 'test', session: Promise.resolve(null), stop: () => {} } as FrontEndMount;
  return {
    calls, sheets,
    loaders: {
      main: async () => { calls.push('main'); },
      frontEnd: async () => { calls.push('frontEnd'); return { mountFrontEnd: () => mount }; },
      ...(withSheet ? {
        launchSettings: async () => {
          calls.push('launchSettings');
          return { mountLaunchSettings: (o: LaunchSheetOptions) => { sheets.push(o); return { root: document.createElement('div') } as unknown as LaunchSheetMount; } };
        },
      } : {}),
    },
  };
}

beforeEach(loadPage);
afterEach(() => { document.body.innerHTML = ''; });

describe('PTT-9: the sheet before the test room, in the page\'s router (W37.R6)', () => {
  it('/testroom with no parameter, or with ?launch: the sheet, and the viewer is never imported', async () => {
    for (const address of ['/testroom', '/testroom/', '/testroom?', '/testroom?launch', '/testroom?launch&map=MP2&devmode', '/testroom?launch=1']) {
      loadPage();
      const t = loaders();
      const r = await bootPage(address, document, t.loaders);
      expect(t.calls, address).toEqual(['launchSettings']);
      expect(r.entry, address).toBe('launch-settings');
      expect(t.sheets[0]!.mode, address).toBe('testroom');
      expect(t.sheets[0]!.search, address).toBe(new URL(address, 'http://page/').search);
      expect(t.sheets[0]!.base, address).toBe('/');
    }
  });

  it('THE CONDITION: a link with parameters is the page it was -- main imported, nothing else, the markup and the body as before', async () => {
    for (const address of ['/testroom?devmode&mode=play&map=MP2', '/testroom/?devmode&fly', '/testroom?devmode&menuflow', '/testroom?launch=off',
      '/testroom?map=MP2&launch=off', '/testroom?playtest=ws%3A%2F%2F127.0.0.1%3A5303%2Fsession&devmode', '/testroom?replay=x']) {
      loadPage();
      const t = loaders();
      const before = document.body.innerHTML;
      const r = await bootPage(address, document, t.loaders);
      expect(t.calls, address).toEqual(['main']);
      expect(t.sheets, address).toEqual([]);
      expect(r, address).toEqual({ entry: 'viewer' });
      expect(document.body.innerHTML, address).toBe(before);
      expect(document.body.className, address).toBe('panel-collapsed test-room');
    }
  });

  it('the rule itself: no parameter, or launch present and not off', () => {
    expect(LAUNCH_PARAM).toBe('launch');
    for (const s of ['', '?', '?&', '?launch', '?launch=', '?launch=1', '?map=MP2&launch']) expect(wantsLaunchSheet(s), s).toBe(true);
    for (const s of ['?devmode', '?launch=off', '?map=MP2&launch=off', '?=']) expect(wantsLaunchSheet(s), s).toBe(false);
  });

  it('/playtest: the sheet in playtest mode, with or without parameters; under the site\'s base too', async () => {
    for (const [address, base] of [['/playtest', '/'], ['/playtest?map=MP7&online', '/'], ['/socomlegacy/playtest', '/socomlegacy/']] as const) {
      loadPage();
      const t = loaders();
      const r = await bootPage(address, document, t.loaders, base);
      expect(t.calls, address).toEqual(['launchSettings']);
      expect(r.entry, address).toBe('launch-settings');
      expect(t.sheets[0]!.mode, address).toBe('playtest');
      expect(t.sheets[0]!.base, address).toBe(base);
    }
    expect(readPageAddress('/playtest', '/')).toEqual({ testRoom: false, playtest: true, search: '' });
    expect(readPageAddress('/playtestx', '/').playtest).toBe(false);
    expect(readPageAddress('//evil.com/playtest', '/').playtest).toBe(false);
    expect(readPageAddress('/playtest', '/socomlegacy/').playtest).toBe(false);
  });

  it('the release\'s shape (no sheet loader): /testroom with no parameter is the test room, /playtest the front end -- as today', async () => {
    const t = loaders(false);
    expect(await bootPage('/testroom', document, t.loaders)).toEqual({ entry: 'viewer' });
    loadPage();
    await bootPage('/playtest?devmode', document, t.loaders);
    expect(t.calls).toEqual(['main', 'frontEnd']);
  });

  it("the page's own loaders carry the sheet on a development build (vitest's DEV), and it mounts", async () => {
    expect(typeof PAGE_LOADERS.launchSettings).toBe('function');
    const mod = await PAGE_LOADERS.launchSettings!();
    loadPage();
    const m = mod.mountLaunchSettings({ doc: document, mode: 'testroom', search: '', base: '/', store: null, navigate: () => {}, fetch: null, clipboard: null, pads: () => [] });
    expect(document.getElementById('launch-settings')).toBe(m.root);
    m.stop();
  });
});

describe('PTT-9 is a development build\'s only, compiled out of release and the demo as the keyboard is (OT.R29)', () => {
  const entry = readFileSync(resolve(here, '../src/pageEntry.ts'), 'utf-8');
  const SRC = resolve(here, '../src');
  const tsFiles = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? tsFiles(p) : /\.ts$/.test(n) ? [p] : [];
  });

  it('the loader is made under a literal import.meta.env.DEV, a dynamic import; the sheet\'s branch of bootPage is gated the same way', () => {
    expect(entry).toMatch(/^if \(import\.meta\.en[v]\.DEV\) PAGE_LOADERS\.launchSettings = \(\) => import\('\.\/launchSettings\/sheet'\);$/m);
    expect(entry).toMatch(/if \(import\.meta\.en[v]\.DEV && loaders\.launchSettings && /);
  });

  it('nothing outside launchSettings/ imports it but by type or by that one dynamic import (no static path into a release)', () => {
    const offenders: string[] = [];
    for (const f of tsFiles(SRC)) {
      const rel = relative(SRC, f).replace(/\\/g, '/');
      if (rel.startsWith('launchSettings/')) continue;
      for (const m of readFileSync(f, 'utf-8').matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+'([^']*launchSettings[^']*)'/gm)) if (!m[1]) offenders.push(`${rel}: ${m[2]}`);
      for (const m of readFileSync(f, 'utf-8').matchAll(/import\('([^']*launchSettings[^']*)'\)/g)) if (rel !== 'pageEntry.ts') offenders.push(`${rel}: import(${m[1]})`);
    }
    expect(offenders).toEqual([]);
  });

  /**
   * The `goto(...)` calls of a spec's text that open the test room with no query: `TEST_ROOM`, a quoted `/testroom` (or
   * `/testroom/`, after an origin too), `` `${TEST_ROOM}` ``, or a name a spec set to one of those (`const u = TEST_ROOM;`).
   */
  function bareTestRoomGotos(text: string): string[] {
    const bareArg = (a: string): boolean => a === 'TEST_ROOM'
      || /^(['"`])(?:[^'"`?]*\/)?testroom\/?\1$/.test(a)
      || /^`(?:[^`?]*?)\$\{TEST_ROOM\}\/?`$/.test(a);
    const names = new Set<string>();
    for (const m of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*string\s*)?=\s*([^;\n]+?)\s*;/g)) if (bareArg(m[2]!.trim())) names.add(m[1]!);
    const out: string[] = [];
    for (const m of text.matchAll(/\bgoto\(\s*([^,()]+?)\s*[,)]/g)) {
      const a = m[1]!.trim();
      if (bareArg(a) || names.has(a)) out.push(m[0]);
    }
    return out;
  }

  it('the e2e guard has teeth: each bare form is caught, and a test room with a query is not', () => {
    for (const t of ["page.goto(TEST_ROOM);", "page.goto('/testroom');", 'page.goto("/testroom");', 'page.goto(`/testroom`);',
      "page.goto('/testroom/');", 'page.goto(`${TEST_ROOM}`);', 'page.goto(`${TEST_ROOM}/`);', 'page.goto(`${vite.origin}/testroom`);',
      "page.goto('http://127.0.0.1:5173/testroom', { waitUntil: 'load' });", 'const u = TEST_ROOM;\nawait page.goto(u);',
      "const room: string = '/testroom';\nawait page.goto(room);"]) {
      expect(bareTestRoomGotos(t), t).toHaveLength(1);
    }
    for (const t of ['page.goto(`${TEST_ROOM}?devmode`);', 'page.goto(TEST_ROOM_PAST_SHEET);', "page.goto('/testroom?launch=off');",
      'page.goto(`${TEST_ROOM}?devmode&map=${map}`);', 'page.goto(FRONT_END);', "const u = `${TEST_ROOM}?devmode`;\npage.goto(u);"]) {
      expect(bareTestRoomGotos(t), t).toEqual([]);
    }
  });

  it('no e2e spec opens a bare /testroom on the dev server, where the sheet now stands (they open TEST_ROOM_PAST_SHEET)', () => {
    const e2e = resolve(here, '../e2e');
    const bare: string[] = [];
    for (const f of readdirSync(e2e).filter((n) => n.endsWith('.ts'))) {
      for (const g of bareTestRoomGotos(readFileSync(join(e2e, f), 'utf-8'))) bare.push(`${f}: ${g}`);
    }
    expect(bare).toEqual([]);
    expect(readFileSync(join(e2e, 'urls.ts'), 'utf-8')).toMatch(/export const TEST_ROOM_PAST_SHEET = `\$\{TEST_ROOM\}\?launch=off`;/);
  });

  /**
   * A built page of THIS tree, when one is present (`./builtDist.ts`: the setup page's markers and this tree's HEAD,
   * clean; anything else skips with the two revisions in its name). The unit suite runs without a build; `npm run
   * build` makes this real.
   */
  const dist = readBuiltDist(VIEWER_DIST);
  const js = dist.js;
  describe.skipIf(!dist.built)(builtTitle('the built viewer carries none of it', dist), () => {
    it('no sheet, no table: neither the adaptation\'s label nor the sheet\'s title nor a row\'s meaning is in dist/viewer/assets/*.js', () => {
      expect(js).not.toContain('LAUNCH_SETTINGS_ADAPTATION');
      expect(js).not.toContain('launch-settings');
      expect(js).not.toContain('Launch without a session');   // the sheet's launch button (`src/launchSettings/sheet.ts`)
      expect(js).not.toContain('The spawn kit: up to five item ids');
    });
  });
});
