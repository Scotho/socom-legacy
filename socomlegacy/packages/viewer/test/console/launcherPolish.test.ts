// @vitest-environment jsdom
import { version } from '../../../../package.json';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS, homeItems } from '../../src/console/state';
import { decodeLauncherPath, encodeLauncherPath, launcherParentKey } from '../../src/console/routes';
import { screenHead } from '../../src/console/render/head';
import { mountShell } from './shell';

let page: ConsolePage | null = null;
beforeEach(() => mountShell(document));
afterEach(() => { page?.dispose(); page = null; });
const boot = () => {
  const a = sampleAdapters();
  a.session = { ...a.session, signedIn: () => true };
  page = bootConsole(document, window, a, { keymap: false });
  return { a, s: page.ctl.S, ctl: page.ctl };
};
const titles = (selector: string) => [...document.querySelectorAll(selector)].map((e) => e.textContent?.trim());

it('category navigation exposes all names with one current label, and puts Replays inside Profile', () => {
  boot();
  expect(CATS.map((c) => c.id)).toEqual(['profile', 'options', 'home', 'online', 'experiments']);      // LR.R2
  expect(document.querySelectorAll('.cx-cat__label')).toHaveLength(CATS.length);
  expect(document.querySelectorAll('.cx-cat.is-current .cx-cat__label')).toHaveLength(1);
  expect([...document.querySelectorAll('.cx-cat')].map((e) => e.getAttribute('aria-label'))).toEqual(CATS.map((c) => c.label));
  expect(CATS.find((c) => c.id === 'options')?.icon).toBe('cog');
});

it('Profile and the header account disclosure offer the same ordered actions, Sign out last', () => {
  const { a, s } = boot();
  const wanted = ['Service record', 'Replays', 'Loadouts', 'Profiles', 'Sign out'];
  expect(homeItems('profile', s, a).map((x) => x.title)).toEqual(wanted);
  expect(titles('.cx-account-menu .cx-account-menu__label')).toEqual(wanted);
  expect(document.querySelector('.cx-account-menu details summary')?.getAttribute('aria-label')).toContain('Account');
});

it('the launcher Settings list offers only System Settings and App without individual setting previews', () => {
  const { a, s, ctl } = boot();
  expect(homeItems('options', s, a).map((x) => x.title)).toEqual(['Game', 'Launcher', 'Theme']);   // LATER 294: Game and Launcher; the theme drop-up stays
  ctl.doAct(homeItems('options', s, a)[0]?.act);
  ctl.render();
  expect(s.screen).toBe('options');
  expect(document.querySelector('.cx-tabs')).not.toBeNull();
  expect(document.querySelector('.cx-screenhead .cx-eyebrow')).toBeNull();
  expect(document.querySelector('.cx-back__pad')).toBeNull();
});

it('installation lives under App and opens the brief dialog', () => {
  const { a, s, ctl } = boot();
  expect(homeItems('home', s, a).some((x) => x.title === 'Install app')).toBe(false);
  ctl.doAct('opt:app'); ctl.render();
  ctl.press('cross');
  expect(s.overlay).toBe('install');
  expect(document.querySelector('[data-pwa-surface]')).not.toBeNull();
});

it('Loadouts first opens the side chooser, then the existing mission list and returns through both levels', () => {
  const { a, s, ctl } = boot();
  const open = vi.fn();
  a.loadouts = { open, list: () => ({ kind: 'loading' }), editor: () => ({ kind: 'gone' }), sync: vi.fn(), follow: vi.fn() } as unknown as NonNullable<typeof a.loadouts>;
  ctl.doAct('loadout-sides'); ctl.render();
  expect(s.screen).toBe('loadoutSides');
  expect(titles('#stage .cx-rlist .cx-r__label')).toEqual(['SEAL', 'Terrorist']);     // LR-4: the side chooser in LR-1's link rows
  expect(encodeLauncherPath(s, a)).toBe('profile/armory');
  ctl.press('down'); ctl.press('cross');
  expect([s.screen, s.lo.side]).toEqual(['loadouts', 'terrorist']);
  expect(open).toHaveBeenCalledWith('terrorist');
  expect(launcherParentKey(s, a)).toBe('loadout-sides');
  ctl.press('circle');
  expect(s.screen).toBe('loadoutSides');
  ctl.press('circle');
  expect(CATS[s.cat]?.id).toBe('profile');
  expect(homeItems('profile', s, a)[s.item[s.cat]!]?.title).toBe('Loadouts');
});

it('a direct side-chooser URL and replay Back return to the right Profile action', () => {
  const { a, s, ctl } = boot();
  decodeLauncherPath('/profile/armory', '/', s, a);
  expect(s.screen).toBe('loadoutSides');
  ctl.doAct('replays'); ctl.press('circle');
  expect(CATS[s.cat]?.id).toBe('profile');
  expect(homeItems('profile', s, a)[s.item[s.cat]!]?.title).toBe('Replays');
});

it('all nested screen heads use one quiet parent link without the local Circle prompt', () => {
  const html = screenHead('Settings', 'Audio', 'Settings');
  expect(html).not.toContain('cx-eyebrow');
  expect(html).not.toContain('cx-back__pad');
  expect(html).toContain('Back to Settings');
  expect(html).toContain('data-b="circle"');
});

it('the header displays the release version as a compact badge', () => {
  boot();
  expect(document.querySelector('.cx-version')?.textContent).toBe(`v${version}`);
});

it('controller and microphone status live with readiness instead of crowding the header', () => {
  boot();
  expect(document.querySelectorAll('#header .cx-lampword')).toHaveLength(0);
  // LR-23 (LR.R22): the readiness is the legend's (was: Play's panel's microphone and controller rows on the stage).
  expect(document.querySelector('#legend .cx-mark[data-mark="mic"]')).not.toBeNull();   // LR-24 (was: [data-device=mic])
  expect(document.querySelector('#legend .cx-mark[data-mark="pad"]')).not.toBeNull();   // LR-24 (was: [data-device=pad])
});

it('the footer shows device states, with missing required equipment distinct from optional microphone status', () => {
  const { a, ctl } = boot();
  a.pad.connected = () => false;
  a.mic.on = () => false;
  a.disc.state = () => 'empty';
  ctl.render();
  expect(document.querySelector('#legend .cx-mark[data-mark="pad"]')?.classList.contains('cx-status--danger')).toBe(true);   // LR-24 (was: [data-device=pad])
  expect(document.querySelector('#legend .cx-mark[data-mark="mic"]')?.classList.contains('cx-status--warning')).toBe(true);   // LR-24 (was: [data-device=mic])
  expect(document.querySelector('#legend .cx-mark[data-mark="disc"]')?.classList.contains('cx-status--danger')).toBe(true);   // LR-24 (was: the chip)
  // LR-23 (LR.R22): no panel and no dot (was: the disc check not ok, Play's dot yellow); Play's Cross names the need.
  expect(document.querySelector('#stage .cx-item__dot')).toBeNull();
  expect(document.querySelector('#legend .cx-prompts [data-b="cross"] .cx-label')?.textContent).toBe('Play SOCOM II: disc needed');
});
