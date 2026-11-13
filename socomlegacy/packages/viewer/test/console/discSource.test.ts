// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOCOM2_US_BOOT } from '@s2u/archive';
import { buildIso } from '../../../archive/test/isoImage';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveDisc, type DiscDeps } from '../../src/console/adapters/disc';
import { liveLaunch } from '../../src/console/adapters/launch';
import { prompts } from '../../src/console/render/legend';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS, deployChecks, HOME_CATEGORY, playNeed, type Adapters } from '../../src/console/state';
import { openedDiscRequest, openFrontEndDisc } from '../../src/discPrompt';
import type { FrontEndMount } from '../../src/frontEnd';
import { openedDiscImage, publishDiscImage } from '../../src/modern/discImage';
import { publishDisc, readDisc } from '../../src/modern/discStore';
import type { ModernSession } from '../../src/modern/session';
import type { SourceRequest } from '../../src/worker';
import { mountShell } from './shell';

/**
 * CX-16 (CX.R9, the owner, 2026-10-12: "move DISC FOLDER into a DROPDOWN beside DISC buried in a SETTINGS icon. Only one
 * needs/should be active to launch."): Home's action list has one source action, Disc; the second source (CX-10a's
 * folder) is no listed action any more but an option of a dropdown behind a settings icon beside the Disc action -- "Disc
 * ISO" and "RETAIL DISC" since DISC-LABELS (were "Disc image" and "Disc folder"), the chosen one the single active source. The action's verb and its line follow it ("Choose
 * disc" / "Choose disc folder"; the line naming the open image or folder), so do the chip, START's blocked line and the
 * readout's; Cross on the action (and the chip) opens only the active source's chooser, and the disc open now is the one
 * START hands on. Choosing the other source while a disc is open closes nothing: that disc stays until a new one is
 * chosen. The pad reaches the dropdown with Square on the Disc action (the legend's "the screen's own" press; Left / Right
 * stay the crossbar's), the pointer with a click on the icon. A browser adaptation (DA.R2, OT.R28) with no original.
 * Generated values only: a `SYSTEM.CNF` in the retail line's form and four bytes standing for `RUN/UI/READERC.ZAR`.
 *
 * LR-13 (LR.R17) made the Disc action the disc check of Play's "Before you deploy" panel, the cog on it. LR-23 (LR.R22,
 * the owner: "The entire right side overlay for the selected category - gone"; "The bottom row? the new mockup UI"): the
 * panel is gone; the Disc action is Play's Cross while the disc is not in (and the legend's chip always), its line the
 * chip's (`.cx-chip__line`), the cog beside the chip, Square on Play its pad's way in. The facts below are read there
 * (`onDisc`: the focus on Play). The Disc's title and state are `deployChecks`' first item. Was: read on the panel's disc
 * check (its drawn hint, the cog in its split box, Select on it, the Deploy row's line, START's pill).
 *
 * LR-24 (LR.R23 (b), the dispatcher's reading of LR.R22; the owner may overturn): the chip and its cog are the bottom
 * row's disc mark, the disc's one control on the page's Home: a click on it opens the dropdown (the cog's act), an option
 * there makes it the source and opens its chooser (the chip's act after it); its line is the mark's (`.cx-mark__line`),
 * its words (the chip's and the cog's name) in its aria-label. Was (LR-23): the chip's click the chooser, the cog beside it.
 */
let page: ConsolePage | null = null;
// The disc store and the opened source are per Document, and the tests share one: each starts with no disc.
beforeEach(() => { publishDisc(document, { state: 'empty', filename: null }); publishDiscImage(document, null); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.restoreAllMocks(); vi.useRealTimers(); });

const settle = async (ms = 0): Promise<void> => {
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
  if (ms) await new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
};

const text = (s: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(s);
const picked = (bytes: Uint8Array<ArrayBuffer>, path: string): File => {
  const f = new File([bytes], path.split('/').pop()!, { lastModified: 1_000 });
  Object.defineProperty(f, 'webkitRelativePath', { value: path });
  return f;
};
const folderFiles = (name: string): File[] => [
  picked(text(`BOOT2 = cdrom0:\\${SOCOM2_US_BOOT};1\r\nVER = 1.00\r\nVMODE = NTSC\r\n`), `${name}/SYSTEM.CNF`),
  picked(new Uint8Array(4), `${name}/RUN/UI/READERC.ZAR`),
];
const GOOD = (): File => new File([buildIso([{ path: 'RUN/UI/READERC.ZAR', bytes: new Uint8Array(64) }])], 'socom2.iso');

const imageInput = (): HTMLInputElement => document.getElementById('disc-page-file') as HTMLInputElement;
const folderInput = (): HTMLInputElement => document.querySelector<HTMLInputElement>('input[webkitdirectory]')!;
/** Hands `files` to a hidden input as the browser's picker does. */
const give = (input: HTMLInputElement, files: File[]): void => {
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  input.dispatchEvent(new Event('change'));
};

const items = (): { title: string; sub: string; state: string }[] => [...document.querySelectorAll('#stage .cx-item')].map((e) => ({
  title: e.querySelector('.cx-item__title')!.textContent!,
  sub: e.querySelector('.cx-item__sub')!.textContent!,
  state: e.querySelector('.cx-item__state')?.textContent ?? '',
}));
/** LR-23: the Disc step: its title and state the model's, its line the legend chip's (was: Play's panel's drawn hint). */
const discItem = () => {
  const d = deployChecks(page!.ctl.S, page!.ctl.A)[0]!;
  return { title: d.title, sub: document.querySelector('#legend .cx-mark[data-mark="disc"] .cx-mark__line')?.textContent ?? '', state: d.state?.[0] ?? '' };   // LR-24 (was: the chip's line)
};
/** LR-23: the focus on Home's Play (where Square opens the source's dropdown; was LR-13's panel open on its disc check). */
const onDisc = (): void => {
  page!.ctl.S.screen = 'home';
  page!.ctl.S.cat = HOME_CATEGORY;
  page!.ctl.S.item[HOME_CATEGORY] = 0;
  page!.render();
};
/** LR-24: the disc mark opens the dropdown (was LR-23: the cog beside the chip, `.cx-chipsrc .cx-srcbtn`). */
const gear = (): HTMLButtonElement | null => document.querySelector<HTMLButtonElement>('#legend .cx-mark[data-mark="disc"]');
const options = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('#legend .cx-srcopt')];
const said = (): [string, string][] => prompts(page!.ctl.S, page!.ctl.A).map((p) => [p.k, p.label]);
/** LR-24: the chip's words ride in the disc mark's aria-label, "word: sub · line · Disc source: ..." (was: `.cx-chip__sub`). */
const chipSub = (): string => /^[^:]+: (.*?)(?: · |$)/.exec(gear()!.getAttribute('aria-label')!)![1]!;

/** The dropdown by the pad: Square on the Disc action, the option `i` (0 the image, 1 the folder), Cross. */
const pickSource = (i: 0 | 1): void => {
  page!.ctl.press('square');
  page!.ctl.press(i === 1 ? 'down' : 'up');
  page!.ctl.press('cross');
  expect(page!.ctl.A.disc.source?.(), 'the source the dropdown made active').toBe(i === 1 ? 'folder' : 'image');
};

function live(deps: DiscDeps = {}, over: Partial<Adapters> = {}) {
  const open = vi.fn(openFrontEndDisc);
  const disc = liveDisc(document, () => { page?.render(); }, { openFolder: open, scope: {}, ...deps });
  page = bootConsole(document, window, { ...sampleAdapters(), data: 'live', states: undefined, disc, ...over }, { keymap: true });
  onDisc();
  return { disc, open };
}

describe('CX-16: one Disc action, its source behind a settings icon', () => {
  it('Home lists one source action, Disc -- no "Choose disc folder" item -- and a settings icon beside it, in its row', () => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: true });
    expect(items().map((i) => i.title)).toEqual(['Play SOCOM II', 'Server status', 'Discord', 'GitHub']);   // LR-13
    onDisc();
    expect(document.querySelectorAll('.cx-srcbtn')).toHaveLength(0);            // LR-24: no cog on the page (was: one)
    const g = gear()!;
    expect(g.tagName).toBe('BUTTON');
    expect(g.closest('.cx-markbox')).not.toBeNull();                            // LR-24: the disc mark (was LR-23: beside the chip; was: in the disc check's row)
    expect(g.querySelector('svg.cx-ico')).not.toBeNull();                       // the disc's mark (was: the cog)
    expect(g.getAttribute('aria-haspopup')).toBe('menu');
    expect(g.getAttribute('aria-expanded')).toBe('false');
    expect(g.getAttribute('aria-label')).toContain('Disc source: DISC ISO');   // LR-24: CX-16's name in the mark's (was: the cog's whole name)
    expect(options()).toHaveLength(0);
    // The pad's way in, said in the legend on Play (LR-23; was on the Disc action): Square, "the screen's own".
    expect(said()).toContainEqual(['square', 'Disc source']);
    // Not on another category's item; the cog stays the chip's on Home (LR-23; was: gone with the Disc action).
    page.ctl.press('r1');
    expect(gear()).not.toBeNull();
    expect(said().some(([k, l]) => k === 'square' && l === 'Disc source')).toBe(false);
  });

  it('Square opens the dropdown: "DISC ISO" and "RETAIL DISC", the active one checked and focused; Down, Cross makes the folder the source', () => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: true });
    page.ctl.S.input = 'pad';
    onDisc();
    page.ctl.press('square');
    expect(options().map((o) => o.textContent!.trim())).toEqual(['DISC ISO', 'RETAIL DISC']);
    expect(options().map((o) => o.getAttribute('role'))).toEqual(['menuitemradio', 'menuitemradio']);
    expect(options().map((o) => o.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(options()[0]!.classList.contains('is-focused')).toBe(true);
    expect(document.querySelectorAll('#stage .is-focused, #legend .is-focused')).toHaveLength(1);    // one focus: the option, not the item
    expect(gear()!.getAttribute('aria-expanded')).toBe('true');
    expect(said()).toEqual([['cross', 'Choose'], ['circle', 'Close']]);
    page.ctl.press('down');
    expect(options()[1]!.classList.contains('is-focused')).toBe(true);
    page.ctl.press('cross');
    expect(options()).toHaveLength(0);
    expect(page.ctl.A.disc.source!()).toBe('folder');
    expect(page.ctl.S.cat).toBe(HOME_CATEGORY);
    expect(document.querySelector('#stage .cx-list .cx-item.is-focused .cx-item__title')!.textContent).toBe('Play SOCOM II');   // LR-23 (was: the disc check)
    expect(said()[0]).toEqual(['cross', 'Play SOCOM II']);                 // LR-25 (F1): a pad press is no gesture, the option opened no chooser, the sample disc stays (was LR-24: 'Play SOCOM II: disc being read', the chooser opened)
    expect(gear()!.getAttribute('aria-label')).toContain('Disc source: RETAIL DISC');   // LR-24 (was: toBe, the cog's)
    page.ctl.press('square');
    expect(options().map((o) => o.getAttribute('aria-checked'))).toEqual(['false', 'true']);
    expect(options()[1]!.classList.contains('is-focused')).toBe(true);           // opens on the active source
  });

  it('Circle closes the dropdown with nothing changed; Left / Right stay the crossbar\'s', () => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: true });
    onDisc();
    page.ctl.press('square');
    page.ctl.press('down');
    page.ctl.press('circle');
    expect(options()).toHaveLength(0);
    expect(page.ctl.A.disc.source!()).toBe('image');
    expect(page.ctl.S.cat).toBe(HOME_CATEGORY);
    page.ctl.press('right');                                                     // LR-23: no panel to leave (was: Circle again)                                                     // from the list: the next category
    expect(CATS[page.ctl.S.cat]?.id).toBe('online');
    page.ctl.press('left');
    onDisc();
    page.ctl.press('square');
    page.ctl.press('r1');                                                        // a category switch closes it
    expect(CATS[page.ctl.S.cat]?.id).toBe('online');
    page.ctl.press('l1');
    expect(options()).toHaveLength(0);
  });

  it('the pointer: a click on the icon toggles the dropdown, a click on an option makes it the source', () => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: true });
    gear()!.click();
    expect(options()).toHaveLength(2);
    gear()!.click();
    expect(options()).toHaveLength(0);
    gear()!.click();
    options()[1]!.click();
    expect(page.ctl.A.disc.source!()).toBe('folder');
    expect(options()).toHaveLength(0);
  });

  it('the pointer: a click or tap outside the open dropdown closes it with nothing changed (the controller, the CX-16/17 review)', () => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: true });
    const tap = (el: Element): void => {
      el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      (el as HTMLElement).click();
    };
    // Outside on nothing that acts: the readout, the header, the page's body.
    for (const at of [() => document.querySelector('#stage .cx-home__body')!, () => document.getElementById('header')!, () => document.body]) {   // LR-23: the list's body (was: the readout)
      tap(gear()!);
      expect(options()).toHaveLength(2);
      tap(at());
      expect(options(), `outside on ${at().className || at().id || at().tagName}`).toHaveLength(0);
      expect(gear()!.getAttribute('aria-expanded')).toBe('false');
      expect(page.ctl.A.disc.source!()).toBe('image');
      expect(page.ctl.S.cat).toBe(HOME_CATEGORY);
    }
    // Outside on another control: closed, and that control does its own work.
    tap(gear()!);
    tap(document.querySelector('#stage .cx-cat[aria-label="Profile"]')!);
    expect(options()).toHaveLength(0);
    expect(CATS[page.ctl.S.cat]?.id).toBe('profile');
    expect(page.ctl.S.src.open).toBe(false);
    // Inside: the menu's own padding keeps it open; the icon still toggles it; an option still picks.
    tap(document.querySelector('#stage .cx-cat[aria-label="Home"]')!);
    tap(gear()!);
    tap(document.querySelector('#legend .cx-srcmenu')!);
    expect(options()).toHaveLength(2);
    tap(gear()!);
    expect(options()).toHaveLength(0);
    tap(gear()!);
    tap(options()[1]!);
    expect(page.ctl.A.disc.source!()).toBe('folder');
  });

  it('the action\'s line, the chip and the blocked START follow the source', () => {
    // LR-23: Play's Cross names the need whatever the source (was: Select, and the Deploy row's line naming the source).
    live();
    expect(discItem()).toEqual({ title: 'Disc', sub: 'Your SOCOM 2 ISO (or the retail disc)', state: 'NEEDED' });
    expect(said()[0]).toEqual(['cross', 'Play SOCOM II: disc needed']);
    expect(chipSub()).toBe('Your own .iso');
    pickSource(1);
    expect(discItem()).toEqual({ title: 'Disc', sub: 'A drive, a mounted image or a copy of your disc’s files', state: 'NEEDED' });
    expect(said()[0]).toEqual(['cross', 'Play SOCOM II: disc needed']);
    expect(chipSub()).toBe('Your disc folder');
    page!.ctl.press('options');
    expect(page!.ctl.S.legendError).toBe('Choose your disc folder first: Cross on Play, or the disc mark.');   // LR-24 (was: Home, then Disc)
  });

  // The LR-36 fold (LR.R30 amended): the Disc action is the launch check's disc row -- Play's Cross with the disc out opens
  // the panel there, no chooser; Cross on the row opens the active source's (was LR-23: Play's Cross opened it at once).
  it('Cross on the Disc action (the launch check\'s disc row), and the mark, open only the active source\'s chooser', () => {
    live();
    const image = vi.spyOn(imageInput(), 'click').mockImplementation(() => {});
    const folder = vi.spyOn(folderInput(), 'click').mockImplementation(() => {});
    const onDiscRow = (): void => {
      page!.ctl.press('cross');                                                   // Play: the panel, on its disc row
      expect(document.querySelector('#stage [data-panel="launch"] .cx-r.is-focused[data-id="disc"]')).not.toBeNull();
    };
    onDiscRow();
    expect([image.mock.calls.length, folder.mock.calls.length]).toEqual([0, 0]);
    page!.ctl.press('cross');
    expect([image.mock.calls.length, folder.mock.calls.length]).toEqual([1, 0]);
    page!.ctl.press('circle');                                                    // back on Play, where Square is the source's menu
    // LR-24: an option of the disc mark's menu opens the chosen source's chooser (was: it opened nothing, the chip did)
    pickSource(1);
    expect([image.mock.calls.length, folder.mock.calls.length]).toEqual([1, 1]);
    onDiscRow();
    page!.ctl.press('cross');
    expect([image.mock.calls.length, folder.mock.calls.length]).toEqual([1, 2]);
    gear()!.click();
    options()[1]!.click();
    expect([image.mock.calls.length, folder.mock.calls.length]).toEqual([1, 3]);
    page!.ctl.press('circle');
    pickSource(0);
    expect([image.mock.calls.length, folder.mock.calls.length]).toEqual([2, 3]);
    gear()!.click();
    options()[0]!.click();
    expect([image.mock.calls.length, folder.mock.calls.length]).toEqual([3, 3]);
  });

  it('the line names the open disc: the image by its file, the folder by its own name', async () => {
    live();
    give(imageInput(), [GOOD()]);
    await settle();
    page!.render();
    expect(discItem()).toEqual({ title: 'Disc', sub: 'the disc image socom2.iso', state: 'READY' });
    pickSource(1);
    give(folderInput(), folderFiles('SOCOM2'));
    await settle();
    page!.render();
    expect(discItem()).toEqual({ title: 'Disc', sub: 'the disc folder SOCOM2', state: 'READY' });
    expect(page!.ctl.S.toast).toBe('Disc ready: SOCOM2');                        // LR-24: the option's press opened the chooser, so its read is the press's (was: a change event alone, no toast)
  });

  it('choosing the other source while a disc is open closes nothing: that disc stays until a new one is chosen', async () => {
    live();
    give(imageInput(), [GOOD()]);
    await settle();
    pickSource(1);
    expect(readDisc(document)).toMatchObject({ state: 'ready', filename: 'socom2.iso' });
    expect(openedDiscRequest()?.kind).toBe('iso');
    expect(openedDiscImage(document)).not.toBeNull();
    expect(discItem()).toEqual({ title: 'Disc', sub: 'the disc image socom2.iso', state: 'READY' });
    expect(said()[0]).toEqual(['cross', 'Play SOCOM II']);                                   // LR-23: Play launches (was: Select)
    expect(playNeed(page!.ctl.S, page!.ctl.A)).toBeNull();                          // was: START's pill not disabled
  });
});

describe('CX-16: the hand-over -- only the active source\'s disc launches', () => {
  const rig = () => {
    window.history.replaceState(null, '', '/console?menuflow=x');
    const mount = vi.fn((): FrontEndMount => ({ canvas: document.createElement('canvas'), status: '', session: Promise.resolve(null), stop: () => {} }));
    const session = { signOut: async () => {}, end: () => {} } as unknown as ModernSession;
    const launch = liveLaunch(document, { session, mount: mount as never, base: '/', sheets: [], loadSheet: async () => {} });
    live({}, { launch });
    return mount;
  };
  const mounted = (mount: ReturnType<typeof vi.fn>) => {
    expect(mount).toHaveBeenCalledTimes(1);
    const [, source, , opts] = mount.mock.calls[0] as unknown as [string, SourceRequest, Document, { assets: unknown }];
    return { source, assets: opts.assets };
  };

  it('an image, then the folder made the source and chosen: START mounts the folder\'s request and source, not the image\'s', async () => {
    const mount = rig();
    give(imageInput(), [GOOD()]);
    await settle();
    const image = openedDiscRequest();
    expect(image?.kind).toBe('iso');
    pickSource(1);
    give(folderInput(), folderFiles('SOCOM2'));
    await settle();
    const folder = openedDiscRequest();
    expect(folder?.kind).toBe('dir');
    page!.ctl.press('options');
    await settle(400);
    const m = mounted(mount);
    expect(m.source).toBe(folder);
    expect(m.source).not.toBe(image);
    expect(m.assets).toBe(openedDiscImage(document));
    expect(readDisc(document)).toMatchObject({ state: 'in-game', filename: 'SOCOM2' });
  });

  it('a folder, then the image made the source and chosen: START mounts the image', async () => {
    const mount = rig();
    pickSource(1);
    give(folderInput(), folderFiles('SOCOM2'));
    await settle();
    const folder = openedDiscRequest();
    pickSource(0);
    give(imageInput(), [GOOD()]);
    await settle();
    page!.ctl.press('options');
    await settle(400);
    const m = mounted(mount);
    expect(m.source.kind).toBe('iso');
    expect(m.source).not.toBe(folder);
    expect(readDisc(document)).toMatchObject({ state: 'in-game', filename: 'socom2.iso' });
  });

  it('the source switched with no new choice: the disc still open is the one handed on (nothing was closed)', async () => {
    const mount = rig();
    give(imageInput(), [GOOD()]);
    await settle();
    const image = openedDiscRequest();
    pickSource(1);
    page!.ctl.press('options');
    await settle(400);
    expect(mounted(mount).source).toBe(image);
  });
});

describe('CX-16: the sample adapters\' source (SAMPLE_DATA, for the browser spec and the screenshots)', () => {
  it('the dropdown switches the sample source; the chip reads the sample folder, then the sample image', async () => {
    vi.useFakeTimers();
    const a = sampleAdapters();
    expect(a.disc.source!()).toBe('image');
    page = bootConsole(document, window, a, { keymap: true });
    onDisc();
    pickSource(1);
    expect(a.disc.source!()).toBe('folder');
    // LR-24: the option opened the folder's chooser itself (was LR-23: then the chip's click, Play's Cross launching)
    expect(a.disc.state()).toBe('reading');
    expect(a.disc.kind!()).toBe('folder');
    await vi.advanceTimersByTimeAsync(1200);
    expect(a.disc.state()).toBe('ready');
    expect(a.disc.label!()).toBe('the disc folder SOCOM2');
    pickSource(0);                                                               // LR-24: and the image's (was: then the chip's click)
    expect(a.disc.kind!()).toBe('image');
    await vi.advanceTimersByTimeAsync(1200);
    expect(a.disc.state()).toBe('ready');
  });
});

describe('CX-16: phone widths show the icon like the other controls', () => {
  it('no rule of the page or of the design system hides the settings icon at 760 px and below', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const page = readFileSync(resolve(here, '../../src/console/console.css'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
    const ds = readFileSync(resolve(here, '../../../../../shared/ds/components.css'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(page).toMatch(/\.cx-srcbtn\s*\{/);
    expect(page).not.toMatch(/\.cx-srcbtn[^{]*\{[^}]*display:\s*none/);
    expect(ds).not.toMatch(/cx-srcbtn|cx-srcmenu|cx-srcopt/);                   // the page's own control, not the system's
  });
});

/**
 * Setup onboarding (Trello ZjCZXTTW, the playtest of 2026-11-01: retail disc owners did not find the retail disc): the
 * source choice is on the Disc row of "Before you deploy" itself -- DISC ISO and RETAIL DISC drawn side by side, the active
 * one checked; Left / Right on the row switch it (the pad's, no chooser: a pad press is no gesture), Cross opens the active
 * source's chooser as before; a click on a choice makes it the source and opens its chooser (as the disc mark's menu
 * does, LR-24, which stays). A browser adaptation: the launcher's setup, nothing of the game.
 */
describe('Setup onboarding: the Disc row of "Before you deploy" offers both sources', () => {
  const discRow = (): HTMLElement | null => document.querySelector<HTMLElement>('#stage [data-panel="launch"] .cx-r[data-id="disc"]');
  const choices = (): HTMLButtonElement[] => [...(discRow()?.querySelectorAll<HTMLButtonElement>('[data-act="chksrc"]') ?? [])];
  const openOnDisc = (): void => {
    page!.ctl.press('cross');                                                   // Play with no disc: the panel, on its disc row
    expect(discRow()!.classList.contains('is-focused')).toBe(true);
  };

  it('the row draws DISC ISO and RETAIL DISC, the active one checked; the legend names Left / Right; the mark keeps its menu', () => {
    live();
    openOnDisc();
    expect(choices().map((b) => b.textContent!.trim())).toEqual(['DISC ISO', 'RETAIL DISC']);
    expect(choices().map((b) => b.tagName)).toEqual(['BUTTON', 'BUTTON']);
    expect(choices().map((b) => b.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(discRow()!.querySelector('[role="radiogroup"]')!.getAttribute('aria-label')).toBe('Disc source');
    expect(said()).toContainEqual(['dpad-h', 'Disc source']);
    expect(said()[0]).toEqual(['cross', 'Choose disc']);
    expect(gear()!.getAttribute('aria-haspopup')).toBe('menu');                // the disc mark's menu, unchanged
  });

  it('the pad: Right makes RETAIL DISC the source with no chooser, Cross then opens the folder\'s; Left back to the ISO', () => {
    live();
    const image = vi.spyOn(imageInput(), 'click').mockImplementation(() => {});
    const folder = vi.spyOn(folderInput(), 'click').mockImplementation(() => {});
    openOnDisc();
    page!.ctl.press('right');
    expect(page!.ctl.A.disc.source!()).toBe('folder');
    expect([image.mock.calls.length, folder.mock.calls.length]).toEqual([0, 0]);
    expect(choices().map((b) => b.getAttribute('aria-checked'))).toEqual(['false', 'true']);
    expect(discRow()!.classList.contains('is-focused'), 'the cursor stays on the row').toBe(true);
    expect(said()[0]).toEqual(['cross', 'Choose disc folder']);
    page!.ctl.press('cross');
    expect([image.mock.calls.length, folder.mock.calls.length]).toEqual([0, 1]);
    page!.ctl.press('left');
    expect(page!.ctl.A.disc.source!()).toBe('image');
    expect(choices().map((b) => b.getAttribute('aria-checked'))).toEqual(['true', 'false']);
  });

  it('the pointer: a click on RETAIL DISC makes it the source and opens its chooser; on DISC ISO, the image\'s', () => {
    live();
    const image = vi.spyOn(imageInput(), 'click').mockImplementation(() => {});
    const folder = vi.spyOn(folderInput(), 'click').mockImplementation(() => {});
    openOnDisc();
    choices()[1]!.click();
    expect(page!.ctl.A.disc.source!()).toBe('folder');
    expect([image.mock.calls.length, folder.mock.calls.length]).toEqual([0, 1]);
    expect(page!.ctl.S.chk.open, 'the panel stays').toBe(true);
    choices()[0]!.click();
    expect(page!.ctl.A.disc.source!()).toBe('image');
    expect([image.mock.calls.length, folder.mock.calls.length]).toEqual([1, 1]);
  });

  it('with no source to switch the row draws no choice', () => {
    const a = sampleAdapters();
    const { setSource: _gone, ...disc } = a.disc;
    page = bootConsole(document, window, { ...a, disc }, { keymap: true });
    onDisc();
    page.ctl.openCheck();
    page.ctl.S.chk.row = 0;
    page.render();
    expect(discRow()).not.toBeNull();
    expect(choices()).toHaveLength(0);
    expect(said().some(([k]) => k === 'dpad-h')).toBe(false);
  });
});
