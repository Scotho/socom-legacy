// @vitest-environment jsdom
import { version } from '../../../../package.json';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveCentralVersion, readCentralVersion } from '../../src/console/adapters/centralVersion';
import { versionLabel } from '../../src/console/render/header';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import type { Adapters } from '../../src/console/state';
import { mountShell } from './shell';

/**
 * LR-33 (LR.R27, the owner, 2026-10-27: "make sure the launcher redesign shows the proper central version number label at
 * the top"): the header's version label is central's, read from its `/health`. The field is LATER 534's `version` (a tag
 * at stage, else the date-sha release name); main's `/health` answers `release` and `commit` only until 534 lands, so the
 * read takes `version` and, absent it, the `release` name -- the same words LATER 534's else-branch writes.
 * (a) the dispatcher's reading, the owner may overturn: central unreachable -> the page's own build version, greyed;
 * the two differing -> both ("central v0.3.4 / page v0.3.3"). A launcher adaptation, nothing of the game.
 */
let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.useRealTimers(); });

describe('LR-33: the label', () => {
  const V = (version: string) => ({ kind: 'version' as const, version });
  const R = (version: string) => ({ kind: 'release' as const, version });
  it('central version alone when it equals the page version', () => {
    expect(versionLabel('0.3.3', V('0.3.3'))).toEqual({ text: 'v0.3.3', reached: true });
    expect(versionLabel('0.3.3', V('v0.3.3'))).toEqual({ text: 'v0.3.3', reached: true });
  });
  it('a `version` that differs: both, central first', () => {
    expect(versionLabel('0.3.3', V('0.3.4'))).toEqual({ text: 'central v0.3.4 / page v0.3.3', reached: true });
  });
  it('only a `release` name (a date-sha, not semver): that name alone, never compared with the page version, not greyed', () => {
    expect(versionLabel('0.3.3', R('20261027-abc1234'))).toEqual({ text: '20261027-abc1234', reached: true });
    expect(versionLabel('20261027-abc1234', R('20261027-abc1234'))).toEqual({ text: '20261027-abc1234', reached: true });
  });
  it('the page own version, greyed, while central is unreachable', () => {
    expect(versionLabel('0.3.3', null)).toEqual({ text: 'v0.3.3', reached: false });
  });
});

describe('LR-33: the read of /health', () => {
  const ok = (body: unknown) => async () => ({ ok: true, json: async () => body });
  it('takes `version`, else the `release` name, else nothing', async () => {
    expect(await readCentralVersion('https://c.example', ok({ ok: true, version: '0.3.4', release: '20261027-abc1234' }))).toEqual({ kind: 'version', version: '0.3.4' });
    expect(await readCentralVersion('https://c.example', ok({ ok: true, release: '20261027-abc1234' }))).toEqual({ kind: 'release', version: '20261027-abc1234' });
    expect(await readCentralVersion('https://c.example', ok({ ok: true, release: null }))).toBeNull();
    expect(await readCentralVersion('https://c.example', ok({ ok: true, version: 5 }))).toBeNull();
    expect(await readCentralVersion('https://c.example', ok('<html>'))).toBeNull();
  });
  it('a refusal, a network error and a non-JSON answer are unreachable, never an exception', async () => {
    expect(await readCentralVersion('https://c.example', async () => ({ ok: false, json: async () => ({}) }))).toBeNull();
    expect(await readCentralVersion('https://c.example', async () => { throw new Error('offline'); })).toBeNull();
    expect(await readCentralVersion('https://c.example', async () => ({ ok: true, json: async () => { throw new Error('html'); } }))).toBeNull();
  });
  it('asks central\'s own /health, never a made-up address', async () => {
    const urls: string[] = [];
    await readCentralVersion('https://c.example', async (u) => { urls.push(u); return { ok: true, json: async () => ({}) }; });
    expect(urls).toEqual(['https://c.example/health']);
  });
  it('the live reader answers null until central answers, then its version, and keeps it through a failed refresh', async () => {
    let body: unknown = { ok: true, version: '0.3.4' };
    let fail = false;
    const notified = vi.fn();
    const live = liveCentralVersion(notified, { base: 'https://c.example', fetch: async () => { if (fail) throw new Error('x'); return { ok: true, json: async () => body }; } });
    expect(live.version()).toBeNull();
    await vi.advanceTimersByTimeAsync(10);
    expect(live.version()).toEqual({ kind: 'version', version: '0.3.4' });
    expect(notified).toHaveBeenCalled();
    fail = true; body = { ok: true, version: '0.3.5' };
    await live.refresh();
    expect(live.version()).toBeNull();                              // unreachable: greyed page version (a)
    fail = false;
    await live.refresh();
    expect(live.version()).toEqual({ kind: 'version', version: '0.3.5' });
    live.dispose();
  });
});

describe('LR-33: the header', () => {
  const boot = (central: { kind: 'version' | 'release'; version: string } | null | undefined): HTMLElement => {
    const sample = sampleAdapters();
    const a: Adapters = { ...sample, server: { ...sample.server, ...(central === undefined ? {} : { centralVersion: () => central }) } };
    page = bootConsole(document, window, a, { keymap: false });
    return document.querySelector<HTMLElement>('#header .cx-version')!;
  };
  it('with central\'s version equal to the page\'s: that version, not greyed', () => {
    const el = boot({ kind: 'version', version });
    expect(el.textContent).toBe(`v${version}`);
    expect(el.classList.contains('is-unreached')).toBe(false);
  });
  it('with a different central version: both, in the badge and its aria-label', () => {
    const el = boot({ kind: 'version', version: '9.9.9' });
    expect(el.textContent).toBe(`central v9.9.9 / page v${version}`);
    expect(el.getAttribute('aria-label')).toBe(`Version: central 9.9.9, page ${version}`);
  });
  it('with only a release name: that name alone, not greyed, no page part', () => {
    const el = boot({ kind: 'release', version: '20261027-abc1234' });
    expect(el.textContent).toBe('20261027-abc1234');
    expect(el.classList.contains('is-unreached')).toBe(false);
    expect(el.getAttribute('aria-label')).toBe('Release 20261027-abc1234');
  });
  it('with central unreachable (null) or no reader at all: the page\'s version, greyed', () => {
    for (const c of [null, undefined]) {
      page?.dispose(); page = null; mountShell(document);
      const el = boot(c);
      expect(el.textContent).toBe(`v${version}`);
      expect(el.classList.contains('is-unreached')).toBe(true);
    }
  });
});
