// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { prompts } from '../../src/console/render/legend';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { cardLine, deployChecks, homeItems, playNeed, type Adapters } from '../../src/console/state';
import { mountShell } from './shell';

/**
 * LR-2 (the launcher redesign plan, the row "Home"; LR.R1, LR.R8) drew Home's right panel as the artifact's "Before you
 * deploy" check -- a check row for the disc and one for the controller, the microphone's optional row, Deploy (START) and
 * the "On the server now" card -- and LR-13 (LR.R17) moved the old steps into it, one level under Play.
 *
 * LR-23 (LR.R22, the owner, 2026-10-27: "The entire right side overlay for the selected category - gone"; "Start game,
 * gone"; the readiness expressed "another way"): the panel is gone with its head, rows, Deploy and card. These pins hold
 * where each of its facts went -- was-notes at each -- and that the overlay's readout over a game is gone too (LR.R18's;
 * since LR-39, LR.R32, the overlay's Home is the page's, its disc line the legend's disc mark's):
 * - the disc check -> the legend's status chip (its word, its tone, the step's line for a reader);
 * - the controller check -> the legend's controller mark and Play's Cross ("Play: controller needed", its options);
 * - the microphone row -> the legend's microphone mark, optional, never a blocker;
 * - Deploy (START) -> Play's Cross, and the pad's START (its warn line unchanged when not ready);
 * - "On the server now" -> Home's Server status row's line (read on Home, drawn on the Server screen).
 * A browser adaptation.
 */
let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.useRealTimers(); });

const boot = (a: Adapters = sampleAdapters()): ConsolePage => (page = bootConsole(document, window, a, { keymap: true }));
const chip = (): HTMLElement => document.querySelector<HTMLElement>('#legend .cx-mark[data-mark="disc"]')!;   // LR-24 (was: the chip)
const crossWord = (): string | undefined => prompts(page!.ctl.S, page!.ctl.A).find((x) => x.k === 'cross')?.label;

describe('LR-23: Home\'s "Before you deploy" panel is gone; its facts where they went', () => {
  it('no panel: no readout, no check rows, no Deploy; Home\'s heading for a reader is its one h1 ("Home")', () => {
    boot();
    expect(document.querySelector('#stage .cx-readout')).toBeNull();          // was: the panel, "Home / Play" over "Ready to deploy"
    expect(document.querySelector('#stage .cx-r--check')).toBeNull();
    expect(document.querySelector('#stage [data-id="deploy"]')).toBeNull();
    expect([...document.querySelectorAll('#stage h1')].map((h) => h.textContent)).toEqual(['Home']);
    expect(document.querySelector('#stage h2')).toBeNull();                   // was: the panel's h2 (review-lr-2 F4)
  });

  it('the disc not in: the chip asks for it, not ready (was: "Disc needed", its ring empty, its chip the Disc action\'s verb)', () => {
    const a = sampleAdapters();
    a.disc.state = () => 'empty';
    boot(a);
    expect(chip().classList.contains('is-empty')).toBe(true);
    expect(chip().classList.contains('cx-status--danger')).toBe(true);
    expect(chip().querySelector('.cx-mark__word')!.textContent).toBe('Choose disc');   // LR-24 (was: .cx-chip__word)
    expect(chip().querySelector('.cx-mark__line')!.textContent).toBe(deployChecks(page!.ctl.S, a)[0]!.sub);   // LR-24 (was: .cx-chip__line)
    expect(crossWord()).toBe('Play SOCOM II: disc needed');
  });

  it('the disc in: the chip ready, its line the Disc step\'s (was: the check ok and full, its hint that line)', () => {
    const a = sampleAdapters();
    boot(a);
    expect(chip().classList.contains('is-ready')).toBe(true);
    expect(chip().querySelector('.cx-mark__word')!.textContent).toBe('Disc ready');   // LR-24 (was: .cx-chip__word)
    expect(chip().querySelector('.cx-mark__line')!.textContent).toBe(deployChecks(page!.ctl.S, a)[0]!.sub);   // LR-24 (was: .cx-chip__line)
  });

  it('while the disc is read: the chip reading, Play waits (was: the ring following the extraction\'s files done)', () => {
    const a = sampleAdapters();
    a.disc.state = () => 'reading';
    boot(a);
    expect(chip().classList.contains('is-reading')).toBe(true);
    expect(crossWord()).toBe('Play SOCOM II: disc being read');
  });

  it('the controller: the legend\'s mark and Play\'s word follow the controls adapter (was: the controller check, its chip Controller options)', () => {
    const a = sampleAdapters();
    let ready = false;
    a.controls = { ready: () => ready, line: () => (ready ? 'Controller connected' : 'Press a button'), reason: () => 'Press any button on your controller.' };
    boot(a);
    expect(playNeed(page!.ctl.S, a)).toBe('controller');
    expect(crossWord()).toBe('Play SOCOM II: controller needed');
    expect(document.querySelector('#legend .cx-mark[data-mark="pad"]')).not.toBeNull();   // LR-24 (was: [data-device=pad])
    ready = true;
    page!.ctl.render();
    expect(crossWord()).toBe('Play SOCOM II');
  });

  it('the microphone: optional, never a blocker -- the legend\'s mark in the warning tone while off, Play still ready', () => {
    const a = sampleAdapters();
    boot(a);
    const mic = (): HTMLElement => document.querySelector<HTMLElement>('#legend .cx-mark[data-mark="mic"]')!;   // LR-24 (was: [data-device=mic])
    expect(mic().getAttribute('aria-label')).toBe('Microphone off (optional)');
    expect(mic().classList.contains('cx-status--warning')).toBe(true);
    expect(crossWord()).toBe('Play SOCOM II');
    a.mic.on = () => true;
    page!.ctl.render();
    expect(mic().getAttribute('aria-label')).toBe('Microphone on');
    expect(mic().classList.contains('cx-status--ready')).toBe(true);
  });

  it('Deploy\'s START is Play\'s Cross; not ready, the pad\'s START says the legend\'s one warn line as before', () => {
    const a = sampleAdapters();
    boot(a);
    document.querySelector<HTMLElement>('#stage .cx-list [data-act="item"][data-i="0"]')!.click();   // was: a click on Deploy
    expect(page!.ctl.S.start).toBe('arming');
    page!.dispose();
    mountShell(document);
    const b = sampleAdapters();
    b.disc.state = () => 'empty';
    b.disc.choose = vi.fn(async () => false);
    boot(b);
    page!.ctl.press('options');
    expect(page!.ctl.S.start).toBe('idle');
    expect(page!.ctl.S.legendError).toBe('Choose your disc image first: Cross on Play, or the disc mark.');   // LR-24 (was: Home, then Disc)
  });

  it('Server status carries the server\'s figures in its line (was: the "On the server now" card and its two figures)', () => {
    const a = sampleAdapters();
    boot(a);
    const t = a.server.totals()!;
    const server = homeItems('home', page!.ctl.S, a).find((x) => x.title === 'Server status')!;
    expect(server.sub).toBe(`${t.players} player${t.players === 1 ? '' : 's'} · ${t.rooms} room${t.rooms === 1 ? '' : 's'}`);
    expect(document.querySelector('#stage [aria-label="Server status"]')).toBeNull();
  });

  // LR-37 (4; the owner, 2026-10-29: "Remove Memory Card from the modern launcher UI."): the page's Home has no Memory card
  // row; LR-39 (LR.R32): nor the overlay's (it kept one until then). The slot and the personas stay Profile's Profiles line.
  it('no Home has a Memory card row, the page\'s or the overlay\'s; the card\'s line is Profile\'s Profiles row\'s', () => {
    const a = sampleAdapters();
    boot(a);
    expect(homeItems('home', page!.ctl.S, a).map((x) => x.title)).toEqual(['Play SOCOM II', 'Server status', 'Discord']);
    const profiles = homeItems('profile', page!.ctl.S, a).find((x) => x.title === 'Profiles')!;
    expect(profiles.sub).toBe(cardLine(a));
    expect(profiles.sub).toMatch(/^Slot 1 · 1 persona · /);
    page!.ctl.S.mode = 'overlay';
    expect(homeItems('home', page!.ctl.S, a).find((x) => x.title === 'Memory card')).toBeUndefined();
  });

  // LR-39 (LR.R32): the overlay's Home is the page's, so its readout is drawn no more (`readoutHtml` removed); its disc
  // line is the legend's disc mark's (was: the readout's "Over your game", its disc line, no Deploy, no check rows).
  it('over a game no readout is drawn; the disc line is the legend\'s disc mark\'s; no Deploy and no check rows', () => {
    const a = sampleAdapters();
    boot(a);
    page!.ctl.S.mode = 'overlay';
    page!.render();
    expect(document.querySelector('#stage .cx-readout')).toBeNull();
    expect(document.querySelector('#legend .cx-mark[data-mark="disc"][data-disc-line]')).not.toBeNull();
    expect(document.querySelector('[data-id="deploy"], .cx-r--check')).toBeNull();
  });
});
