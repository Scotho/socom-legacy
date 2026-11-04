// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { MapInfo } from '@s2u/archive';
import { labelFor } from '../src/mapOrder';
import { readShare } from '../src/shareUrl';
import { MAP_BAR_FIELD_ID, MAP_BAR_ID, mapBarHref, mapBarSearch, NOT_SERVED_SUFFIX, reloadOnMap } from '../src/testroomMapBar';
import { Ui } from '../src/ui';
import { LOCAL_SERVER, resolveOnline } from '../src/online';
import { ServedMapsRead } from '../src/servedMaps';
import { mountRoundTextLine } from '../src/roundTextLine';
import { Hud } from '../src/hud';

/**
 * TR-1 (the test room's maps plan, TR.R2; the owner's playtest, 2026-10-12: "Please make /testroom have a dropdown for
 * map selection."): a map dropdown on the test room's bar (`#site-links`), listing the served tree's maps (the page's
 * `mapList`) by the panel picker's label, the room's map selected; choosing one reloads the room with `?map=<archive>`,
 * every other parameter kept by `../src/shareUrl.ts`'s rule (`&fly` bare, `devmode`, `server=`). Hidden in the replay's
 * world (MU-11) and where the page has no served tree. The panel's `#maps` stays as it was. A test instrument's
 * adaptation (keyboard and mouse are the test room's own; OT.R29 does not bind it): nothing of the game.
 */
const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, '../setup/index.html'), 'utf-8');
const main = readFileSync(resolve(here, '../src/main.ts'), 'utf-8');
const css = readFileSync(resolve(here, '../src/styles.css'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
/**
 * The declarations of `selector`'s rules in styles.css, each with the `@media` condition it sits under ('' for the top
 * level): the sheet walked brace by brace.
 */
function rulesFor(selector: string): { media: string; decls: string }[] {
  const out: { media: string; decls: string }[] = [];
  const stack: string[] = [];
  let head = '';
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]!;
    if (ch === '{') {
      const h = head.trim();
      if (h.startsWith('@media')) { stack.push(h.slice('@media'.length).trim()); head = ''; continue; }
      const end = css.indexOf('}', i);
      if (h.split(',').map((s) => s.trim()).includes(selector)) out.push({ media: stack.at(-1) ?? '', decls: css.slice(i + 1, end) });
      i = end; head = ''; continue;
    }
    if (ch === '}') { stack.pop(); head = ''; continue; }
    head += ch;
  }
  return out;
}
const declared = (selector: string, media = ''): string => rulesFor(selector).filter((r) => r.media === media).map((r) => r.decls).join(';');
const doc = new DOMParser().parseFromString(html, 'text/html');
const load = (): void => { document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML; };

const MAPS: MapInfo[] = [
  { archive: 'MP2', path: 'RUN/MP2.ZDB', name: 'FROSTFIRE' },
  { archive: 'MP6', path: 'RUN/MP6.ZDB', name: 'BLIZZARD' },
  { archive: 'MP10', path: 'RUN/MP10.ZDB', name: 'NIGHT STALKER' },
];
const bar = (): HTMLSelectElement => document.getElementById(MAP_BAR_ID) as HTMLSelectElement;
const field = (): HTMLElement => document.getElementById(MAP_BAR_FIELD_ID)!;
const panelMaps = (): HTMLSelectElement => document.getElementById('maps') as HTMLSelectElement;

describe('TR-1: the bar holds the dropdown', () => {
  it('a select on #site-links, before the end group, which keeps its three tabs (Settings, Controls, GitHub)', () => {
    const select = doc.getElementById(MAP_BAR_ID)!;
    expect(select.tagName).toBe('SELECT');
    expect(select.closest('#site-links')).not.toBeNull();
    expect(select.closest('#panel')).toBeNull();
    const end = doc.querySelector('#site-links .s2u-bar__end')!;
    expect([...end.children].map((e) => e.id)).toEqual(['panel-toggle', 'controls-toggle', 'source']);
    const wrapper = doc.getElementById(MAP_BAR_FIELD_ID)!;
    expect(wrapper.parentElement!.id).toBe('site-links');
    expect(wrapper.nextElementSibling).toBe(end);                     // beside the panel and controls toggles
  });

  it('in the system\'s field (compact, as the panel\'s picker), hidden until a served map list is in', () => {
    const select = doc.getElementById(MAP_BAR_ID)!;
    expect(select.parentElement!.classList.contains('s2u-field')).toBe(true);
    const wrapper = doc.getElementById(MAP_BAR_FIELD_ID)!;
    expect(wrapper.getAttribute('data-density')).toBe('compact');
    expect(wrapper.hasAttribute('hidden')).toBe(true);
    expect(wrapper.className).toBe('');                                 // no display rule of its own: `hidden` holds
  });

  it('labelled a test instrument\'s adaptation, in its name and its tooltip', () => {
    const select = doc.getElementById(MAP_BAR_ID)!;
    expect(select.getAttribute('aria-label')).toMatch(/map/i);
    expect(select.getAttribute('aria-label')).toMatch(/test room/i);
    expect(select.getAttribute('title')).toMatch(/reloads the test room/i);
    expect(select.getAttribute('title')).toMatch(/test instrument/i);
  });

  it('one height with the tabs (30px, no block padding), a capped width, and shrinks before the bar overflows', () => {
    const select = declared('#map-bar');
    expect(select).toMatch(/height:\s*30px/);                           // the tabs' (`.s2u-bar__end .s2u-tab`)
    expect(select).toMatch(/padding-block:\s*0/);                       // not the field's 6px over and under
    expect(select).toMatch(/max-width:\s*16rem/);
    const field = declared('#map-bar-field');
    expect(field).toMatch(/min-width:\s*0/);                            // a flex item that may shrink below its options' width
    expect(field).toMatch(/flex:\s*0 1 auto/);
    expect(declared('#map-bar', '(max-width: 480px), (pointer: coarse)')).toMatch(/max-width:\s*10rem/);
  });

  it('the panel\'s picker is unchanged: still #maps in its labelled field', () => {
    const maps = doc.getElementById('maps')!;
    expect(maps.closest('#panel')).not.toBeNull();
    expect(maps.parentElement!.classList.contains('s2u-field')).toBe(true);
    expect(doc.querySelector('label[for="maps"]')!.textContent).toBe('Map');
  });
});

describe('TR-1: the reload address, by shareUrl\'s rule', () => {
  it('writes map=<archive> and keeps every other parameter, the developer\'s bare ones bare', () => {
    expect(mapBarSearch('', 'MP6')).toBe('?map=MP6');
    expect(mapBarSearch('?devmode&fly', 'MP6')).toBe('?map=MP6&devmode&fly');
    expect(mapBarSearch('?mode=explore&map=MP2&view=modern&online=off&devmode&fly', 'MP10'))
      .toBe('?mode=explore&map=MP10&view=modern&online=off&devmode&fly');
    expect(mapBarSearch('?devmode&map=mp2', 'MP6')).toBe('?map=MP6&devmode');
  });

  it('keeps devmode and server= (and mp) as they were: a LOCAL session\'s link reloads on its server', () => {
    const q = '?mode=play&map=MP2&online=local&devmode&server=ws://127.0.0.1:8787/ws&mp';
    const next = mapBarSearch(q, 'MP6');
    expect(next).toBe('?mode=play&map=MP6&online=local&devmode&server=ws://127.0.0.1:8787/ws&mp');
    expect(readShare(next).map).toBe('MP6');
    expect(new URLSearchParams(next).get('server')).toBe('ws://127.0.0.1:8787/ws');
  });

  // OT.R71: rules= is read again, so it stays (was: taken out with redotcom as a retired parameter).
  it('takes the retired parameter out, as every address the page writes does; rules= is kept (OT.R71)', () => {
    expect(mapBarSearch('?redotcom&rules=respawn&devmode', 'MP6')).toBe('?map=MP6&rules=respawn&devmode');
  });

  it('the whole href: the path and the hash kept', () => {
    expect(mapBarHref({ pathname: '/testroom', search: '?devmode&fly&map=MP2', hash: '' }, 'MP6')).toBe('/testroom?map=MP6&devmode&fly');
    expect(mapBarHref({ pathname: '/socomlegacy/testroom', search: '', hash: '#x' }, 'MP10')).toBe('/socomlegacy/testroom?map=MP10#x');
  });
});

describe('TR-1: filled from the map list, the room\'s map selected', () => {
  let ui: Ui;
  let chosen: ReturnType<typeof vi.fn<(archive: string) => void>>;
  let allowed: boolean;
  beforeEach(() => {
    load();
    ui = new Ui();
    allowed = true;
    chosen = vi.fn<(archive: string) => void>();
    ui.onBarMap(() => allowed, chosen);
  });

  it('lists the maps by the panel picker\'s label, valued by archive, the room\'s map selected, and shows', () => {
    ui.setMaps(MAPS, 'RUN/MP6.ZDB');
    const options = [...bar().options];
    expect(options.map((o) => o.value)).toEqual(['MP2', 'MP6', 'MP10']);
    expect(options.map((o) => o.textContent)).toEqual(MAPS.map(labelFor));
    expect(bar().value).toBe('MP6');
    expect(field().hidden).toBe(false);
  });

  it('follows the room\'s map: a map shown (the panel\'s pick, or the boot\'s) is the bar\'s selection', () => {
    ui.setMaps(MAPS, 'RUN/MP2.ZDB');
    ui.select('RUN/MP10.ZDB');
    expect(bar().value).toBe('MP10');
    expect(panelMaps().value).toBe('RUN/MP10.ZDB');
  });

  it('choosing a map hands its archive on (the page reloads on it); the panel\'s picker is not moved', () => {
    ui.setMaps(MAPS, 'RUN/MP2.ZDB');
    const panelChange = vi.fn();
    ui.onMapChange(panelChange);
    bar().value = 'MP10';
    bar().dispatchEvent(new Event('change'));
    expect(chosen).toHaveBeenCalledTimes(1);
    expect(chosen).toHaveBeenCalledWith('MP10');
    expect(panelChange).not.toHaveBeenCalled();                        // no load in place: the reload is the bar's
    expect(panelMaps().value).toBe('RUN/MP2.ZDB');
  });

  it('the panel\'s picker is unchanged: valued by path, the same labels, the player counts after them', () => {
    ui.setMaps(MAPS, 'RUN/MP6.ZDB');
    expect([...panelMaps().options].map((o) => o.value)).toEqual(MAPS.map((m) => m.path));
    expect([...panelMaps().options].map((o) => o.textContent)).toEqual(MAPS.map(labelFor));
    expect(panelMaps().value).toBe('RUN/MP6.ZDB');
  });

  it('hidden with an empty list', () => {
    ui.setMaps(MAPS, 'RUN/MP2.ZDB');
    ui.setMaps([], null);
    expect(field().hidden).toBe(true);
    expect(bar().options.length).toBe(0);
  });

  it('hidden where the page may not reload onto it (the replay\'s world, a disc that is not the served tree)', () => {
    allowed = false;
    ui.setMaps(MAPS, 'RUN/MP2.ZDB');
    expect(field().hidden).toBe(true);
    bar().value = 'MP6';
    bar().dispatchEvent(new Event('change'));
    expect(chosen).not.toHaveBeenCalled();
  });

  const ROOM_KEYS = [{ key: 'ArrowDown' }, { key: 'ArrowUp' }, { key: 'ArrowLeft' }, { key: 'ArrowRight' }, { key: 'Home' },
    { key: 'End' }, { key: 'PageDown' }, { key: 'f' }, { key: 'B' }, { key: 'n' }, { key: 'd' }, { key: 'c' }, { key: 'w' }, { key: '2' }];
  /** A key on the focused bar: its keydown (never prevented), then -- as a closed select does, in the same task -- a change to `to`. */
  const keyed = (init: KeyboardEventInit, to: string | null): KeyboardEvent => {
    const down = new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true });
    bar().dispatchEvent(down);
    if (to !== null) { bar().value = to; bar().dispatchEvent(new Event('change', { bubbles: true })); }
    return down;
  };

  it('a closed select\'s keyed change (the room\'s keys) is undone: the room\'s map back, the focus given back, no reload', () => {
    ui.setMaps(MAPS, 'RUN/MP2.ZDB');
    ui.select('RUN/MP6.ZDB');                                           // the room's map, as `follow` last set it
    for (const init of ROOM_KEYS) {
      bar().focus();
      expect(document.activeElement).toBe(bar());
      const down = keyed(init, 'MP10');
      expect(down.defaultPrevented, init.key).toBe(false);               // never swallowed: an open list keeps its keys
      expect(bar().value, init.key).toBe('MP6');
      expect(document.activeElement, init.key).not.toBe(bar());          // the next key is the room's
    }
    expect(chosen).not.toHaveBeenCalled();
  });

  it('a letter\'s keypress in a task of its own (its first-letter search moves the select) is marked too: undone, nothing chosen', async () => {
    ui.setMaps(MAPS, 'RUN/MP2.ZDB');
    for (const key of ['n', 'B', 'f']) {
      bar().focus();
      keyed({ key }, null);
      await new Promise((r) => setTimeout(r, 0));                      // the keydown's mark cleared before the keypress
      const press = new KeyboardEvent('keypress', { key, bubbles: true, cancelable: true });
      bar().dispatchEvent(press);
      expect(press.defaultPrevented, key).toBe(false);
      bar().value = key === 'B' ? 'MP6' : 'MP10';                       // the search's move, in the keypress's task
      bar().dispatchEvent(new Event('change', { bubbles: true }));
      expect(bar().value, key).toBe('MP2');
      expect(document.activeElement, key).not.toBe(bar());
    }
    expect(chosen).not.toHaveBeenCalled();
  });

  it('a keypress with a modifier, or of Enter or Space, marks nothing: its change chooses', () => {
    ui.setMaps(MAPS, 'RUN/MP2.ZDB');
    for (const [init, to] of [[{ key: 'Enter' }, 'MP6'], [{ key: ' ' }, 'MP10'], [{ key: 'f', altKey: true }, 'MP2']] as const) {
      bar().focus();
      bar().dispatchEvent(new KeyboardEvent('keypress', { ...init, bubbles: true, cancelable: true }));
      bar().value = to;
      bar().dispatchEvent(new Event('change', { bubbles: true }));
      expect(chosen, JSON.stringify(init)).toHaveBeenLastCalledWith(to);
    }
  });

  it('a key with no change leaves the focus where it is (an open list\'s navigation)', () => {
    ui.setMaps(MAPS, 'RUN/MP2.ZDB');
    bar().focus();
    for (const init of ROOM_KEYS) expect(keyed(init, null).defaultPrevented, init.key).toBe(false);
    expect(document.activeElement).toBe(bar());
  });

  it('a change after the key\'s task (an open list\'s committed choice) chooses', async () => {
    ui.setMaps(MAPS, 'RUN/MP2.ZDB');
    bar().focus();
    keyed({ key: 'ArrowDown' }, null);
    await new Promise((r) => setTimeout(r, 0));
    bar().value = 'MP6';
    bar().dispatchEvent(new Event('change', { bubbles: true }));
    expect(chosen).toHaveBeenCalledWith('MP6');
  });

  it('a change after the key\'s keyup (the key let go before the commit) chooses', () => {
    ui.setMaps(MAPS, 'RUN/MP2.ZDB');
    bar().focus();
    keyed({ key: 'f' }, null);
    bar().dispatchEvent(new KeyboardEvent('keyup', { key: 'f', bubbles: true }));
    bar().value = 'MP10';
    bar().dispatchEvent(new Event('change', { bubbles: true }));
    expect(chosen).toHaveBeenCalledWith('MP10');
  });

  it('KEYBOARD-WHISPER: with the online round text line mounted (an online net), the bar keeps every key -- by code too -- and the line types none', () => {
    vi.stubEnv('DEV', false);                                             // the release line: it takes its keys whenever online
    const line = mountRoundTextLine({ hud: new Hud(), win: window, online: () => true, whisper: () => undefined, actors: () => [], sender: () => null });
    try {
      ui.setMaps(MAPS, 'RUN/MP2.ZDB');
      ui.select('RUN/MP6.ZDB');
      for (const [key, code] of [['ArrowDown', 'ArrowDown'], ['f', 'KeyF'], ['w', 'KeyW'], ['2', 'Digit2'], [' ', 'Space'], ['Enter', 'Enter']] as const) {
        bar().focus();
        const down = keyed({ key, code }, null);
        expect(down.defaultPrevented, key).toBe(false);
      }
      expect(line.line.text).toBe('');
      bar().focus();
      keyed({ key: 'w', code: 'KeyW' }, 'MP10');                         // the room's key still undone as before
      expect(bar().value).toBe('MP6');
    } finally { line.dispose(); vi.unstubAllEnvs(); }
  });

  it('the keys that open the list or commit it pass: Alt+Down, Alt+Up, Enter, Space, F4, Tab, Escape, a Ctrl chord', () => {
    ui.setMaps(MAPS, 'RUN/MP2.ZDB');
    const passing = [{ key: 'ArrowDown', altKey: true }, { key: 'ArrowUp', altKey: true }, { key: 'Enter' }, { key: ' ' },
      { key: 'F4' }, { key: 'Tab' }, { key: 'Escape' }, { key: 'c', ctrlKey: true }];
    for (const init of passing) {
      bar().focus();
      expect(keyed(init, null).defaultPrevented, JSON.stringify(init)).toBe(false);
      expect(document.activeElement, JSON.stringify(init)).toBe(bar());
    }
    // Enter (or Space) committing a choice in the same task as its keydown: a choice, not a stray key.
    for (const [init, to] of [[{ key: 'Enter' }, 'MP6'], [{ key: ' ' }, 'MP10'], [{ key: 'ArrowDown', altKey: true }, 'MP2']] as const) {
      bar().focus();
      keyed(init, to);
      expect(chosen, JSON.stringify(init)).toHaveBeenLastCalledWith(to);
    }
  });

  it('hidden when nothing wired it: a page that never asks for the bar never shows it', () => {
    load();
    const bare = new Ui();
    bare.setMaps(MAPS, 'RUN/MP2.ZDB');
    expect(field().hidden).toBe(true);
  });

  it('a page without the bar\'s markup still runs (the panel alone)', () => {
    load();
    document.getElementById(MAP_BAR_FIELD_ID)!.remove();
    const bare = new Ui();
    bare.onBarMap(() => true, chosen);
    expect(() => { bare.setMaps(MAPS, 'RUN/MP2.ZDB'); bare.select('RUN/MP6.ZDB'); }).not.toThrow();
    expect(panelMaps().value).toBe('RUN/MP6.ZDB');
  });
});

describe('TR-1: the choice reloads the room; main.ts wires the bar beside the panel\'s picker', () => {
  it('the default choice replaces the page with the reload address: a new page load, no history entry (updateAddress\'s rule)', () => {
    const assign = vi.fn();
    const replace = vi.fn();
    vi.stubGlobal('location', { pathname: '/testroom', search: '?mode=play&map=MP2&devmode&server=ws://127.0.0.1:8787/ws', hash: '', assign, replace });
    try {
      reloadOnMap('MP10');
    } finally {
      vi.unstubAllGlobals();
    }
    expect(replace).toHaveBeenCalledWith('/testroom?mode=play&map=MP10&devmode&server=ws://127.0.0.1:8787/ws');
    expect(assign).not.toHaveBeenCalled();                    // Back never brings a cached page whose bar shows the new map
  });

  it('shown only on the served tree, outside the replay\'s world; the choice left to the default reload', () => {
    const at = main.indexOf('ui.onBarMap(');
    expect(at).toBeGreaterThan(main.indexOf('ui.onMapChange('));
    const hook = main.slice(at, main.indexOf(';\n', at) + 1);
    expect(hook).toBe('ui.onBarMap(() => !REPLAY_WORLD && SERVED !== null && source === SERVED);');
  });
});

/**
 * TR-2 (TR.R3; research 307): with the room's online choice set and the server's `GET /maps` answered (`../src/servedMaps`),
 * the bar marks each map the server does not play -- never hides one -- by a suffix on its label (its accessible name),
 * the test instrument's words. No answer (`null`: an older server, a 404, Online off) marks nothing: TR-1's bar as it was.
 */
describe('TR-2: the bar marks the maps the online server does not play', () => {
  let ui: Ui;
  let chosen: ReturnType<typeof vi.fn<(archive: string) => void>>;
  const texts = (): string[] => [...bar().options].map((o) => o.textContent ?? '');
  beforeEach(() => {
    load();
    ui = new Ui();
    chosen = vi.fn<(archive: string) => void>();
    ui.onBarMap(() => true, chosen);
    ui.setMaps(MAPS, 'RUN/MP6.ZDB');
  });

  it('the suffix is short and says it in plain words', () => {
    expect(NOT_SERVED_SUFFIX).toBe(' · not on this server');
  });

  it('marks exactly the stems not in the set (the owner\'s run: MAPS=MP2,MP51,MP72), every map still listed', () => {
    ui.markServedMaps(['MP2', 'MP51', 'MP72']);
    expect([...bar().options].map((o) => o.value)).toEqual(['MP2', 'MP6', 'MP10']);
    expect(texts()).toEqual([labelFor(MAPS[0]!), labelFor(MAPS[1]!) + NOT_SERVED_SUFFIX, labelFor(MAPS[2]!) + NOT_SERVED_SUFFIX]);
  });

  it('nothing marked with no answer (null), and the marks taken off when the answer goes', () => {
    ui.markServedMaps(null);
    expect(texts()).toEqual(MAPS.map(labelFor));
    ui.markServedMaps(['MP2']);
    ui.markServedMaps(null);
    expect(texts()).toEqual(MAPS.map(labelFor));
  });

  it('the room\'s map stays selected, and choosing still hands the archive on (the reload)', () => {
    ui.markServedMaps(['MP2']);
    expect(bar().value).toBe('MP6');
    bar().value = 'MP10';
    bar().dispatchEvent(new Event('change'));
    expect(chosen).toHaveBeenCalledWith('MP10');
  });

  it('a set that comes before the map list marks it once it is in; a new list keeps the marks', () => {
    load();
    ui = new Ui();
    ui.onBarMap(() => true, chosen);
    ui.markServedMaps(['MP10']);
    ui.setMaps(MAPS, 'RUN/MP2.ZDB');
    expect(texts()).toEqual([labelFor(MAPS[0]!) + NOT_SERVED_SUFFIX, labelFor(MAPS[1]!) + NOT_SERVED_SUFFIX, labelFor(MAPS[2]!)]);
  });

  it('the panel\'s picker is not marked (its suffix is the players\' count)', () => {
    ui.markServedMaps(['MP2']);
    expect([...panelMaps().options].map((o) => o.textContent)).toEqual(MAPS.map(labelFor));
  });

  it('a page without the bar\'s markup still runs', () => {
    document.getElementById(MAP_BAR_FIELD_ID)?.remove();
    const bare = new Ui();
    expect(() => bare.markServedMaps(['MP2'])).not.toThrow();
  });
});

describe('TR-2: main.ts starts the /maps read beside the bar, and names the refused map on the Online line', () => {
  // TR-2's review (59848254f, FAIL high): the bar's re-read, registered before the page's own Online handler, swallowed the
  // page's -- the room never moved to the chosen server. main.ts's two handlers, as it registers them, on the real Ui and
  // the real reader (a fake /maps): one click on Local reaches both. main.ts itself is not run here (it boots the page).
  it('one click on Online -> Local reaches the bar\'s re-read and the page\'s own handler after it; the bar is marked', async () => {
    load();
    const ui = new Ui();
    ui.onBarMap(() => true, vi.fn());
    ui.setMaps(MAPS, 'RUN/MP6.ZDB');
    const asked: string[] = [];
    const fetchFn = vi.fn(async (url: string) => { asked.push(url); return new Response(JSON.stringify({ maps: ['MP2', 'MP51', 'MP72'] }), { status: 200 }); });
    const servedMaps = new ServedMapsRead((stems) => ui.markServedMaps(stems), fetchFn as unknown as typeof fetch);
    const location = { protocol: 'http:', host: 'localhost:5173', hostname: 'localhost' };
    let reread: Promise<void> | null = null;
    ui.onOnline((choice) => { reread = servedMaps.read(resolveOnline('', choice, location).url); });   // main.ts, beside the bar
    const page: string[] = [];
    ui.onOnline((choice) => page.push(choice));                                                       // main.ts, the page's own (later)
    ui.setOnline('off');
    document.querySelector<HTMLButtonElement>('#online [data-online="local"]')!.click();
    expect(page).toEqual(['local']);
    await reread;
    expect(asked).toEqual([`${LOCAL_SERVER.replace(/^ws:/, 'http:').replace(/\/ws$/, '')}/maps`]);
    expect([...bar().options].map((o) => o.textContent)).toEqual([labelFor(MAPS[0]!), labelFor(MAPS[1]!) + NOT_SERVED_SUFFIX, labelFor(MAPS[2]!) + NOT_SERVED_SUFFIX]);
  });

  it('after the bar\'s hook: one read of the online target\'s, again when the choice moves, the stems handed to the bar', () => {
    const at = main.indexOf('ui.onBarMap(');
    const window = main.slice(at, main.indexOf('\n// Restores the picture', at));
    expect(window).toContain('new ServedMapsRead((stems) => ui.markServedMaps(stems))');
    expect(window).toContain('servedMaps.read(NET.url)');
    expect(window).toContain("ui.onOnline((choice) => servedMaps.read(resolveOnline('', choice, PAGE_LOCATION).url))");
    expect(window).toMatch(/if \(!REPLAY_WORLD && SERVED !== null\)/);
  });

  it('the Online line\'s status carries the refused hello\'s map (`withRefusalMap`, the client\'s `refusal`)', () => {
    const at = main.indexOf('function showOnline(');
    const body = main.slice(at, main.indexOf('\n}', at));
    expect(body).toContain('withRefusalMap(net.status(), net.client.refusal)');
  });
});
