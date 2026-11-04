// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS, HOME_CATEGORY, createState } from '../../src/console/state';
import { mountShell } from './shell';

// LR.R2 (the owner, 2026-10-26): Profile / Settings / Home / Online / Experiments, Home the default and centred. It
// amends LP.R18's order only; the route identities (the ids) are unchanged.
let page: ConsolePage | null = null;
beforeEach(() => mountShell(document));
afterEach(() => { page?.dispose(); page = null; });

it('LR.R2: the categories are Profile / Settings / Home / Online / Experiments, ids unchanged', () => {
  expect(CATS.map((c) => c.label)).toEqual(['Profile', 'Settings', 'Home', 'Online', 'Experiments']);
  expect(CATS.map((c) => c.id)).toEqual(['profile', 'options', 'home', 'online', 'experiments']);
});

it('LR.R2: Home is the default, the middle of the five, and the one current on boot', () => {
  expect(HOME_CATEGORY).toBe(2);
  expect(CATS[HOME_CATEGORY]?.id).toBe('home');
  expect(createState(sampleAdapters()).cat).toBe(HOME_CATEGORY);
  page = bootConsole(document, window, sampleAdapters(), { keymap: false });
  expect(CATS[page.ctl.S.cat]?.id).toBe('home');
  expect([...document.querySelectorAll('.cx-cat')].map((e) => e.getAttribute('aria-label')))
    .toEqual(['Profile', 'Settings', 'Home', 'Online', 'Experiments']);
  expect(document.querySelector('.cx-cat.is-current')?.getAttribute('aria-label')).toBe('Home');
});
