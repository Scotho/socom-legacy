// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  PLAY_ATTRIBUTE, PLAY_KEY, PlayUi, readPlayChoice, writePlayChoice,
} from '../src/features';
import { Ui } from '../src/ui';
import { bootSource } from '../src/discIndex';
import { discLabel, discName, type DiscRequest } from '../src/discSource';

/**
 * The owner's 2026-09-29 settings: the Mode switch (Explore / Play, at run time, remembered; the address's `mode=play` /
 * `mode=explore` beats the memory -- `./shareUrl`, pinned in shareUrl.test.ts; no flag gates it, "&redotcom can die now"),
 * the Online setting's markup, and the disc page the page opens on without `?devmode`.
 */
const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, '../setup/index.html'), 'utf-8');
const load = (): void => { document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML; };
const keys = (): string => [...document.querySelectorAll('#keys-list tbody tr')].map((r) => r.textContent).join(' | ');

describe('the remembered mode', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { localStorage.clear(); });

  it('is written as 1 or 0 under s2u.viewer.recom and read back', () => {
    expect(readPlayChoice()).toBeNull();
    writePlayChoice(true);
    expect(localStorage.getItem(PLAY_KEY)).toBe('1');
    expect(readPlayChoice()).toBe('1');
    writePlayChoice(false);
    expect(localStorage.getItem('s2u.viewer.recom')).toBe('0');
    expect(readPlayChoice()).toBe('0');
  });

  it('survives a storage that throws', () => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    Storage.prototype.getItem = () => { throw new Error('private window'); };
    Storage.prototype.setItem = () => { throw new Error('private window'); };
    try {
      expect(readPlayChoice()).toBeNull();
      expect(() => writePlayChoice(true)).not.toThrow();
    } finally {
      Storage.prototype.getItem = get;
      Storage.prototype.setItem = set;
    }
  });
});

describe('PlayUi: the play markup out and back in, at run time', () => {
  beforeEach(load);

  it('takes every data-play element out and puts the same nodes back where they were', () => {
    const before = [...document.querySelectorAll(`[${PLAY_ATTRIBUTE}]`)];
    const places = before.map((el) => [el.parentElement, el.nextSibling]);
    const ui = new PlayUi();
    expect(ui.shown()).toBe(true);
    expect(ui.detach()).toBeGreaterThanOrEqual(5);
    expect(ui.shown()).toBe(false);
    expect(document.querySelectorAll(`[${PLAY_ATTRIBUTE}]`)).toHaveLength(0);
    for (const id of ['mode', 'walk', 'body-row', 'sound-section', 'look-section', 'touch-stance', 'touch-fire', 'touch-walk']) {
      expect(document.getElementById(id), id).toBeNull();
    }
    expect(ui.detach()).toBe(0);                                  // nothing twice
    ui.attach();
    expect(ui.shown()).toBe(true);
    const after = [...document.querySelectorAll(`[${PLAY_ATTRIBUTE}]`)];
    expect(after).toEqual(before);                                 // the same nodes, in the same order
    after.forEach((el, i) => { expect(el.parentElement).toBe(places[i]![0]); expect(el.nextSibling).toBe(places[i]![1]); });
    expect(document.body.innerHTML).not.toMatch(/<!--data-play-->/);
  });

  it('keeps what was wired while the markup was on the page: a listener still fires after a round trip', () => {
    const ui = new PlayUi();
    let heard = 0;
    document.getElementById('mute')!.addEventListener('change', () => { heard++; });
    ui.set(false);
    ui.set(true);
    document.getElementById('mute')!.dispatchEvent(new Event('change'));
    expect(heard).toBe(1);
  });

  it('the panel kicker is the PLAYERS ONLINE count in both modes, a dash until it is known (owner, 2026-09-29: it replaces "redotcom · SOCOM II multiplayer")', () => {
    const kicker = (): string | null | undefined => document.getElementById('panel-kicker')?.textContent;
    expect(kicker()).toBe('Players online –');
    expect(kicker()).not.toMatch(/redotcom|SOCOM II multiplayer/);
    const ui = new PlayUi();
    ui.detach();
    expect(kicker()).toBe('Players online –');
  });

  it('with the markup out, no word about walking is left in the page text or tooltips (the mode and online switches included)', () => {
    new PlayUi().detach();
    // Startup configures both modes before entry; this assertion concerns in-game chrome.
    document.getElementById('disc-page')?.remove();
    const words = (document.body.textContent ?? '') + [...document.querySelectorAll('[title],[aria-label]')]
      .map((e) => `${e.getAttribute('title')} ${e.getAttribute('aria-label')}`).join(' ');
    expect(words.match(/.{0,40}\b(walk\w*|stance|crouch\w*|prone|devmode)\b.{0,40}/gi)).toBeNull();
  });
});

describe('the Mode switch in the panel', () => {
  let ui: Ui;
  beforeEach(() => { load(); ui = new Ui(); });

  it('is always there: no flag gates it (owner, 2026-09-29: "&redotcom can die now. The mode replaces it")', () => {
    const src = (f: string): string => readFileSync(resolve(here, f), 'utf-8');
    // The page builds the same markup for every address; nothing reads a feature flag before it.
    expect(document.getElementById('recom')).not.toBeNull();
    for (const f of ['../src/main.ts', '../src/features.ts', '../src/ui.ts']) {
      expect(src(f), f).not.toMatch(/playEnabled|PLAY_PARAM|\.has\(['"]redotcom['"]\)|get\(['"]redotcom['"]\)/);
    }
    // With the play's markup out (Explore) the switch stays, and offers Play.
    new PlayUi().detach();
    expect(document.querySelector('#recom [data-recom="on"]')).not.toBeNull();
    expect(document.querySelector('#recom [data-recom="off"]')).not.toBeNull();
  });

  // LATER 46 (the test room's maps' close review; `onOnline`'s trap, TR-2's review): a listener per handler let the first
  // press the button and every later one find it pressed and return -- a second handler never ran.
  it('LATER 46: every handler hears one click, in registration order; a click on the pressed button calls none', () => {
    const heard: string[] = [];
    ui.onRecomSwitch((on) => heard.push(`first ${on}`));
    ui.onRecomSwitch((on) => heard.push(`second ${on}`));
    const button = (v: 'on' | 'off'): HTMLButtonElement => document.querySelector<HTMLButtonElement>(`#recom [data-recom="${v}"]`)!;
    ui.setRecom(false);
    button('on').click();
    expect(heard).toEqual(['first true', 'second true']);
    expect(button('on').getAttribute('aria-pressed')).toBe('true');
    button('on').click();                                          // already pressed: nobody hears it
    expect(heard).toEqual(['first true', 'second true']);
    button('off').click();
    expect(heard).toEqual(['first true', 'second true', 'first false', 'second false']);
  });

  it('the Play-only settings follow the mode: in on Play, out on Explore, the rest stays', () => {
    const play = new PlayUi();
    const PLAY_ONLY = ['sound-section', 'look-section', 'body-row'];
    const ALWAYS = ['recom', 'look', 'online', 'maps', 'advanced'];
    play.set(false);
    for (const id of PLAY_ONLY) expect(document.getElementById(id), id).toBeNull();
    for (const id of ALWAYS) expect(document.getElementById(id), id).not.toBeNull();
    play.set(true);
    for (const id of [...PLAY_ONLY, ...ALWAYS]) expect(document.getElementById(id), id).not.toBeNull();
  });

  it('is the picture switch markup, in the panel, not the play (it is there in both modes)', () => {
    const recom = document.getElementById('recom')!;
    expect(recom.className).toBe(document.getElementById('look')!.className);
    expect(recom.getAttribute('role')).toBe('group');
    expect(recom.closest('#panel')).not.toBeNull();
    expect(recom.closest(`[${PLAY_ATTRIBUTE}]`)).toBeNull();
    const buttons = [...recom.querySelectorAll('button')];
    expect(buttons.map((b) => b.dataset['recom'])).toEqual(['off', 'on']);
    for (const b of buttons) { expect(b.classList.contains('s2u-tab')).toBe(true); expect(b.querySelector('.s2u-tab__what')).not.toBeNull(); }
    expect(buttons.map((b) => b.firstChild!.textContent)).toEqual(['Explore', 'Play']);
  });

  it('hands the visitor choice on once, and shows it', () => {
    const heard: boolean[] = [];
    ui.onRecomSwitch((on) => heard.push(on));
    const on = document.querySelector<HTMLButtonElement>('#recom [data-recom="on"]')!;
    const off = document.querySelector<HTMLButtonElement>('#recom [data-recom="off"]')!;
    off.click();                                                  // already chosen: nothing
    on.click();
    on.click();
    expect(heard).toEqual([true]);
    expect(on.getAttribute('aria-pressed')).toBe('true');
    expect(off.getAttribute('aria-pressed')).toBe('false');
    off.click();
    expect(heard).toEqual([true, false]);
    ui.setRecom(true);
    expect(on.getAttribute('aria-pressed')).toBe('true');
  });

  it('the Controls popover follows the mode: G walk listed only with the play on the page (and the developer toggle)', () => {
    ui.setFlyToggle(true);
    const play = new PlayUi();
    play.detach(); ui.setPlay(false);
    expect(keys()).not.toMatch(/walk/i);
    play.attach(); ui.setPlay(true);
    expect(keys()).toMatch(/Gwalk/);
    play.detach(); ui.setPlay(false);
    expect(keys()).not.toMatch(/Gwalk/);
  });
});

describe('the Online setting in the panel', () => {
  let ui: Ui;
  beforeEach(() => { load(); ui = new Ui(); });

  it('is Off / Shared / Local in the picture switch markup, with a connection line, outside the play', () => {
    const online = document.getElementById('online')!;
    expect(online.className).toBe(document.getElementById('look')!.className);
    expect(online.getAttribute('role')).toBe('group');
    expect([...online.querySelectorAll('button')].map((b) => b.dataset['online'])).toEqual(['off', 'shared', 'local']);
    expect(online.closest(`[${PLAY_ATTRIBUTE}]`)).toBeNull();
    expect(document.getElementById('mp-name')!.closest(`[${PLAY_ATTRIBUTE}]`)).toBeNull();
    expect(document.getElementById('online-lamp')!.classList.contains('s2u-lamp')).toBe(true);
    expect(document.getElementById('online-state')!.classList.contains('s2u-status')).toBe(true);
  });

  it('hands a new choice on, shows it, and a URL server presses none', () => {
    const heard: string[] = [];
    ui.onOnline((c) => heard.push(c));
    const button = (c: string): HTMLButtonElement => document.querySelector<HTMLButtonElement>(`#online [data-online="${c}"]`)!;
    button('off').click();
    button('local').click();
    button('shared').click();
    expect(heard).toEqual(['local', 'shared']);
    expect(button('shared').getAttribute('aria-pressed')).toBe('true');
    expect(button('local').getAttribute('aria-pressed')).toBe('false');
    ui.setOnline('url');
    expect([...document.querySelectorAll('#online [aria-pressed="true"]')]).toHaveLength(0);
  });

  // TR-2's review (59848254f, FAIL high): a second handler (the bar's /maps re-read, main.ts) registered before the page's
  // own pressed the button first, and the page's listener then found it pressed and returned -- the room never moved.
  it('every handler hears one click, in registration order; a click on the pressed button calls none', () => {
    const heard: string[] = [];
    ui.onOnline((c) => heard.push(`first ${c}`));
    ui.onOnline((c) => heard.push(`second ${c}`));
    const button = (c: string): HTMLButtonElement => document.querySelector<HTMLButtonElement>(`#online [data-online="${c}"]`)!;
    ui.setOnline('off');
    button('local').click();
    expect(heard).toEqual(['first local', 'second local']);
    expect(button('local').getAttribute('aria-pressed')).toBe('true');
    button('local').click();                                      // already pressed: nobody hears it
    expect(heard).toEqual(['first local', 'second local']);
    button('shared').click();
    expect(heard).toEqual(['first local', 'second local', 'first shared', 'second shared']);
  });

  it('on a local page keeps all three options', () => {
    ui.offerLocal(true);
    expect([...document.querySelectorAll('#online button')].map((b) => (b as HTMLElement).dataset['online'])).toEqual(['off', 'shared', 'local']);
  });

  it('on a page that is not local Local is not rendered at all: two options, one pressed, both working', () => {
    ui.offerLocal(false);
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('#online button')];
    expect(buttons.map((b) => b.dataset['online'])).toEqual(['off', 'shared']);
    expect(document.querySelector('[data-online="local"]')).toBeNull();
    expect(document.getElementById('online')!.textContent).not.toMatch(/localhost|Local/);
    const heard: string[] = [];
    ui.onOnline((c) => heard.push(c));
    ui.setOnline('off');
    buttons[1]!.click();
    expect(heard).toEqual(['shared']);
    expect(buttons.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset['online'])).toEqual(['shared']);
    ui.setOnline('local');                                        // a server=ws://localhost link: nothing pressed
    expect(buttons.filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(0);
  });

  it('the switch lays out two options as it does three: its columns follow its children, and a segment may shrink', () => {
    const css = readFileSync(resolve(here, '../src/styles.css'), 'utf-8');
    const rule = css.match(/\.s2u-overlay \.s2u-tabs\[role="group"\]\s*{([^}]*)}/)![1]!;
    expect(rule).toMatch(/grid-template-columns:\s*none/);          // not the system's fixed 1fr 1fr
    expect(rule).toMatch(/grid-auto-flow:\s*column/);
    expect(rule).toMatch(/grid-auto-columns:\s*minmax\(0, 1fr\)/);
    expect(css).toMatch(/\.s2u-overlay \.s2u-tabs\[role="group"\] \.s2u-tab\s*{[^}]*min-width:\s*0/);
  });

  it('writes the connection line and lights the lamp up or down', () => {
    const lamp = document.getElementById('online-lamp')!;
    ui.setOnlineState('online · 3 players', 'up');
    expect(document.getElementById('online-text')!.textContent).toBe('online · 3 players');
    expect(lamp.classList.contains('is-up')).toBe(true);
    ui.setOnlineState('server unreachable · retrying in 4 s', 'down');
    expect(lamp.classList.contains('is-up')).toBe(false);
    expect(lamp.classList.contains('is-down')).toBe(true);
    ui.setOnlineState('single player: no server', null);
    expect(lamp.className).toBe('s2u-lamp s2u-lamp--small');
  });

  it('writes the retry countdown to a non-live span (aria-live=off) inside the status line, so a screen reader hears the state and not every second (review 2 m-11)', () => {
    const text = document.getElementById('online-text')!;
    const retry = document.getElementById('online-retry')!;
    expect(retry).not.toBeNull();
    expect(retry.getAttribute('aria-live')).toBe('off');
    expect(document.getElementById('online-state')!.contains(retry)).toBe(true);   // beside the line, on screen
    ui.setOnlineState('server unreachable · retrying', 'down', 'in 4 s');
    const node = text.firstChild;
    expect(text.textContent).toBe('server unreachable · retrying');
    expect(retry.textContent).toBe(' in 4 s');
    ui.setOnlineState('server unreachable · retrying', 'down', 'in 3 s');
    expect(text.textContent).toBe('server unreachable · retrying');
    expect(text.firstChild).toBe(node);                                               // not rewritten, so not re-announced
    expect(retry.textContent).toBe(' in 3 s');
    ui.setOnlineState('online · 2 players', 'up');
    expect(retry.textContent).toBe('');
  });
});

describe('the disc page (no served assets by default)', () => {
  let ui: Ui;
  beforeEach(() => { load(); ui = new Ui(); document.body.classList.remove('no-served', 'disc-over'); });

  it('is hidden in the markup (the entry or the viewer shows it), outside the panel, on the design system, and says what it needs and that nothing is uploaded', () => {
    const page = document.getElementById('disc-page')!;
    expect(page.hidden).toBe(true);
    expect(page.closest('#panel')).toBeNull();
    // Changed deliberately for CX-9b (CX.R8: the old launcher's layout removed): `#disc-page` is the design system's
    // section again, the plain disc prompt -- no longer the `s2u-launcher` frame of LU-1 with its disc chip and help tip.
    expect(page.classList.contains('s2u-section')).toBe(true);
    expect(page.classList.contains('s2u-launcher')).toBe(false);
    expect(page.querySelector('.s2u-title')).not.toBeNull();
    const text = page.textContent!.replace(/\s+/g, ' ');
    expect(text).toMatch(/your own copy of the disc/);
    expect(text).toMatch(/SCUS-97275/);
    expect(text).toMatch(/\.iso/);
    expect(text).toMatch(/Drop the \.iso anywhere on this window/);
    expect(text).toMatch(/Nothing is uploaded/);
    expect(text).toMatch(/2048-byte sectors/);
    const input = page.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input.id).toBe('disc-page-file');
    expect(input.accept).toBe(''); // the ISO reader validates after mobile file selection
    expect(input.closest('label')!.classList.contains('s2u-tab')).toBe(true);
  });

  it('offerDisc shows it without unfolding the panel; hideDiscPage takes it down', () => {
    ui.onPanelToggle();
    ui.offerDisc();
    expect(ui.discPageShown()).toBe(true);
    expect(document.body.classList.contains('no-served')).toBe(true);
    expect(ui.panelCollapsed()).toBe(true);
    ui.hideDiscPage();
    expect(ui.discPageShown()).toBe(false);
    expect(document.body.classList.contains('no-served')).toBe(false);
  });

  it('its line says reading, or the reader words in the error colour', () => {
    ui.setDiscState('reading the disc image a.iso ...');
    const line = document.getElementById('disc-state')!;
    expect(line.textContent).toBe('reading the disc image a.iso ...');
    expect(line.classList.contains('is-bad')).toBe(false);
    ui.setDiscState('not an ISO9660 image', 'error');
    expect(line.classList.contains('is-bad')).toBe(true);
  });

  it('the whole window is the drop target: a drag over lights it, a drop hands the file on, and its button does too', () => {
    const files: string[] = [];
    ui.onDisc((f) => files.push(f instanceof File ? f.name : discName(f)));
    const file = new File([new Uint8Array(8)], 'SOCOM2.iso');
    const transfer = { types: ['Files'], files: [file], dropEffect: 'none' };
    const drag = (type: string): Event => { const e = new Event(type, { bubbles: true, cancelable: true }); Object.assign(e, { dataTransfer: transfer, relatedTarget: null }); return e; };
    const over = drag('dragover');
    document.getElementById('view')!.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    expect(document.body.classList.contains('disc-over')).toBe(true);
    const drop = drag('drop');
    document.getElementById('disc-title')!.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    expect(document.body.classList.contains('disc-over')).toBe(false);
    const input = document.getElementById('disc-page-file') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File([new Uint8Array(8)], 'picked.iso')], configurable: true });
    input.dispatchEvent(new Event('change'));
    expect(files).toEqual(['SOCOM2.iso', 'picked.iso']);
  });

  it('DA-4: the test room takes a dropped folder as a dir request, named on the disc page\'s line by its own name', async () => {
    const got: (File | DiscRequest)[] = [];
    ui.onDisc((d) => got.push(d));
    // A dropped folder: its entry walked (`webkitGetAsEntry`), its own name first.
    const dropped = new File([new Uint8Array(4)], 'SYSTEM.CNF');
    const entry = { isFile: false, isDirectory: true, name: 'SOCOM2', createReader: () => {
      let done = false;
      return { readEntries: (ok: (e: unknown[]) => void) => { const b = done ? [] : [{ isFile: true, isDirectory: false, name: 'SYSTEM.CNF', file: (f: (x: File) => void) => { f(dropped); } }]; done = true; ok(b); } };
    } };
    const drop = new Event('drop', { cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { types: ['Files'], files: [new File([], 'SOCOM2')], items: [{ kind: 'file', webkitGetAsEntry: () => entry }] } });
    document.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(got).toHaveLength(1));
    expect(got[0]).toEqual({ kind: 'dir', entries: [{ path: 'SOCOM2/SYSTEM.CNF', file: dropped }] });
    // `main.ts` `openDisc` writes `reading ${discLabel(disc)} ...` (the "chip" of the test room: its disc page's line).
    ui.setDiscState(`reading ${discLabel(got[0] as DiscRequest)} ...`);
    expect(document.getElementById('disc-state')!.textContent).toBe('reading the disc folder SOCOM2 ...');
    // An image dropped is handed on as before, and no visible folder control is on the page (the console's to place).
    const iso = new File([new Uint8Array(8)], 'b.iso');
    const plain = new Event('drop', { cancelable: true });
    Object.defineProperty(plain, 'dataTransfer', { value: { types: ['Files'], files: [iso] } });
    document.dispatchEvent(plain);
    expect(got[1]).toBe(iso);
    expect(document.querySelector('input[webkitdirectory]')).toBeNull();
  });

  it('the stylesheet lights it while a file is over the window and clears the chrome over it, in tokens', () => {
    const css = readFileSync(resolve(here, '../src/styles.css'), 'utf-8');
    expect(css).toMatch(/body\.disc-over #disc-page\s*{[^}]*var\(--s2u-gold\)/);
    expect(css).toMatch(/#disc-page\[hidden\]\s*{\s*display:\s*none/);
    expect(css).toMatch(/body\.no-served #fps, body\.no-served #fullscreen, body\.no-served #touch\s*{\s*display:\s*none/);
  });
});

describe('what the page opens on at boot (bootSource; review 2, m-15)', () => {
  it.each([
    // served?, the served tree answers?, a disc indexing?, a source open?  ->  what the page does
    [false, false, false, false, 'offer-disc'],
    [false, false, true, false, 'offer-disc'],       // a disc dropped while the renderer came up: the page still offered
    [true, false, true, false, 'offer-disc'],
    [true, true, false, false, 'served'],
    [true, true, true, false, 'wait'],               // devmode: the disc wins over the served tree
    [false, false, true, true, 'wait'],              // the disc already opened: nothing to offer
  ] as const)('served %s, answers %s, disc pending %s, open %s -> %s', (served, hasServed, pendingIso, opened, want) => {
    expect(bootSource(served, hasServed, pendingIso, opened)).toBe(want);
  });
});


describe('the debug hook keeps Play on foot (review 2, m-27; ./flyAccess)', () => {
  const main = readFileSync(resolve(here, '../src/main.ts'), 'utf-8');
  it('a setCamera with no floor under it restands the walk in Play without the developer toggle', () => {
    expect(main).toMatch(/setCamera: \(pose: Partial<Pose>\) => walk\.setCamera\(pose, playOn && !FLY\.toggle\),/);
    expect(main).not.toMatch(/walk\.setCamera\(pose\);/);          // the keepOnFoot flag is never dropped
  });
});

describe('which pages run the offline match (soloMatchOn; review 2, m-24 -- the truth table is flyAccess.test.ts)', () => {
  it('main.ts reads it, and nomatch or a devmode fly turns it off', async () => {
    const { soloMatchOn } = await import('../src/flyAccess');
    const main = readFileSync(resolve(here, '../src/main.ts'), 'utf-8');
    expect(main).toMatch(/const SOLO_MATCH = soloMatchOn\(SEARCH\);/);
    expect(soloMatchOn('?mode=play')).toBe(true);
    expect(soloMatchOn('?mode=play&nomatch')).toBe(false);
    expect(soloMatchOn('?mode=play&fly')).toBe(true);                 // `fly` counts only with ?devmode
    expect(soloMatchOn('?devmode&mode=play&fly')).toBe(false);
  });
});

/**
 * The setup page's VISUALS reach the match (the owner, 2026-10-04: "make sure the game retains ... settings as the setup
 * implies"): the setup page writes the Picture setting (`s2u.viewer.look`, `src/startup.ts`), and the test room's
 * `Ui.onLook` applies it as one preset -- Modern widescreen, PS2 the 640 x 448 4:3 frame -- both with the detail pass
 * (the original's own, research 232 §4 PF-30; OT.R79's parity fix of 2026-10-23: PS2 had drawn it off).
 */
describe('the setup page\'s visuals, applied by the match (`Ui.onLook`)', () => {
  afterEach(() => { localStorage.removeItem('s2u.viewer.look'); });
  it.each([['ps2', true, true], ['modern', false, true]] as const)('%s: ps2look %s, detail %s', (view, ps2, detail) => {
    load();
    localStorage.setItem('s2u.viewer.look', view);
    new Ui().onLook(null);
    expect((document.getElementById('ps2look') as HTMLInputElement).checked).toBe(ps2);
    expect((document.getElementById('detail') as HTMLInputElement).checked).toBe(detail);
  });
});
