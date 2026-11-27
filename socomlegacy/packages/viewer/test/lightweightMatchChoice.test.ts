// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DeviceClass } from '../src/deviceClass';

/**
 * LW-DEFAULT (a browser adaptation, no original; product track): the lightweight match's choice is three-state -- '1' the
 * lightweight match, '0' the standard engine, anything else the device class's default (`LIGHTWEIGHT_MATCH_DEFAULT_ADAPTATION`,
 * off for every class until the owner decides) -- and ONE decision (`../src/lightweightMatchOptIn`) gates the front end's
 * mount and the lean audio, so the two never disagree (LATER 1277). The page's class is held by a test seam below.
 */
const page = vi.hoisted(() => ({ cls: null as DeviceClass | null }));
vi.mock('../src/deviceClass', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/deviceClass')>();
  return { ...real, pageDeviceClass: (): DeviceClass => page.cls ?? real.pageDeviceClass() };
});

import {
  LIGHTWEIGHT_MATCH_DEFAULT_ADAPTATION, LIGHTWEIGHT_MATCH_KEY, lightweightMatchChosen, lightweightMatchSavedChoice, pageLightweightMatch,
} from '../src/lightweightMatchOptIn';
import { leanXboxAudio } from '../src/audio';
import { GRAPHICS_BACKEND_KEY } from '../src/graphicsBackend';
import { VIDEO_SETTINGS_KEY, VIDEO_SETTINGS_KEY_V2, videoSettingsKeeperV2 } from '../src/videoSettings';
import { pagePicture } from '../src/picture';
import { LIGHTWEIGHT_MATCH_ROW, liveOptions } from '../src/console/adapters/options';

const CLASSES: readonly DeviceClass[] = ['xbox', 'software', 'touch', 'lowMemory', 'standard', 'high'];
/** The later one-line flip, supplied by the test: the Xbox class's default on, every other class's as today. */
const FLIPPED: Readonly<Record<DeviceClass, boolean>> = { ...LIGHTWEIGHT_MATCH_DEFAULT_ADAPTATION, xbox: true };
const stored = (v: string | null) => (key: string): string | null => (key === LIGHTWEIGHT_MATCH_KEY ? v : null);

beforeEach(() => { localStorage.clear(); page.cls = null; });
afterEach(() => { localStorage.clear(); page.cls = null; history.replaceState(null, '', '/'); });

describe('(a) the default: off for every class today; the flip turns on the Xbox class only', () => {
  it('the table is false for every class', () => {
    expect(Object.keys(LIGHTWEIGHT_MATCH_DEFAULT_ADAPTATION).sort()).toEqual([...CLASSES].sort());
    for (const c of CLASSES) expect(LIGHTWEIGHT_MATCH_DEFAULT_ADAPTATION[c], c).toBe(false);
  });
  it.each(CLASSES)('%s, no key, no flag: false under today\'s table, with the pick too', (c) => {
    expect(lightweightMatchChosen({ search: '', read: stored(null), deviceClass: c, pick: false })).toBe(false);
    expect(lightweightMatchChosen({ search: '', read: stored(null), deviceClass: c, pick: true })).toBe(false);
  });
  it.each(CLASSES)('%s, no key, no flag, the flipped table: only the Xbox class enters by default', (c) => {
    expect(lightweightMatchChosen({ search: '', read: stored(null), deviceClass: c, pick: false, defaults: FLIPPED })).toBe(c === 'xbox');
  });
});

describe('(b) the saved choice', () => {
  it("'1' on a non-Xbox class with no pick: false; on the Xbox class or with the pick: true", () => {
    for (const c of CLASSES.filter((x) => x !== 'xbox')) {
      expect(lightweightMatchChosen({ search: '', read: stored('1'), deviceClass: c, pick: false }), c).toBe(false);
      expect(lightweightMatchChosen({ search: '', read: stored('1'), deviceClass: c, pick: true }), c).toBe(true);
    }
    expect(lightweightMatchChosen({ search: '', read: stored('1'), deviceClass: 'xbox', pick: false })).toBe(true);
  });
  it("'0' on the Xbox class with the flipped table: false (the Standard pick wins over the default)", () => {
    expect(lightweightMatchChosen({ search: '', read: stored('0'), deviceClass: 'xbox', pick: false, defaults: FLIPPED })).toBe(false);
  });
  it("an empty string or any other value reads as absent: the class's default", () => {
    for (const v of ['', 'true', 'yes', ' 1']) {
      expect(lightweightMatchChosen({ search: '', read: stored(v), deviceClass: 'xbox', pick: false }), v).toBe(false);
      expect(lightweightMatchChosen({ search: '', read: stored(v), deviceClass: 'xbox', pick: false, defaults: FLIPPED }), v).toBe(true);
    }
  });
  it('a storage that throws is the standard engine', () => {
    expect(lightweightMatchChosen({ search: '', read: () => { throw new Error('refused'); }, deviceClass: 'xbox', pick: true })).toBe(false);
  });
});

describe('(c) the address flag, an instrument: wins over the saved key', () => {
  it("on the Xbox class: ?lightweightmatch=1 over a saved '0', ?lightweightmatch=0 over a saved '1' and over the default", () => {
    expect(lightweightMatchChosen({ search: '?lightweightmatch=1', read: stored('0'), deviceClass: 'xbox', pick: false })).toBe(true);
    expect(lightweightMatchChosen({ search: '?lightweightmatch=0', read: stored('1'), deviceClass: 'xbox', pick: false })).toBe(false);
    expect(lightweightMatchChosen({ search: '?lightweightmatch=0', read: stored(null), deviceClass: 'xbox', pick: false, defaults: FLIPPED })).toBe(false);
    expect(lightweightMatchChosen({ search: '?lightweightmatch', read: stored('1'), deviceClass: 'xbox', pick: false })).toBe(true);   // no value: no flag
  });
  it('?lightweightmatch=1 on a non-Xbox class with no pick: false', () => {
    for (const c of CLASSES.filter((x) => x !== 'xbox')) {
      expect(lightweightMatchChosen({ search: '?lightweightmatch=1', read: stored('1'), deviceClass: c, pick: false }), c).toBe(false);
    }
  });
  it('the saved choice (the Options row) ignores the flag', () => {
    expect(lightweightMatchSavedChoice({ read: stored('0'), deviceClass: 'xbox', pick: false })).toBe(false);
    expect(lightweightMatchSavedChoice({ read: stored('1'), deviceClass: 'xbox', pick: false })).toBe(true);
    expect(lightweightMatchSavedChoice({ read: stored(null), deviceClass: 'xbox', pick: false, defaults: FLIPPED })).toBe(true);
  });
});

describe('(d) the engine and the audio never disagree (LATER 1277)', () => {
  it("the Xbox class with no pick: key '1', both on; key '0', both off; a standard class with '1', both off", () => {
    page.cls = 'xbox';
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBeNull();
    localStorage.setItem(LIGHTWEIGHT_MATCH_KEY, '1');
    expect([pageLightweightMatch(''), leanXboxAudio()]).toEqual([true, true]);
    localStorage.setItem(LIGHTWEIGHT_MATCH_KEY, '0');
    expect([pageLightweightMatch(''), leanXboxAudio()]).toEqual([false, false]);
    page.cls = 'standard';
    localStorage.setItem(LIGHTWEIGHT_MATCH_KEY, '1');
    expect([pageLightweightMatch(''), leanXboxAudio()]).toEqual([false, false]);
  });
  it('the mount and the audio both call the one page decision, and the module is imported only on it', () => {
    const src = (f: string): string => readFileSync(resolve(import.meta.dirname, '../src', f), 'utf8');
    const front = src('frontEnd.ts');
    expect(front).toMatch(/const lightweightMatch = \(\): boolean => pageLightweightMatch\(win\?\.location\.search\);/);
    expect(front).toMatch(/lightweightMatch\(\) \? import\('\.\/xboxPrototype\/matchLoader'\)/);
    expect(front.match(/import\('\.\/xboxPrototype\/matchLoader'\)/g)).toHaveLength(1);
    const audio = src('audio.ts');
    expect(audio).toMatch(/export function leanXboxAudio\(\): boolean \{\s*return pageLightweightMatch\(/);
    for (const s of [front, audio]) expect(s).not.toMatch(/lightweightMatchAsked/);
  });
});

describe('(e) LATER 1275, both directions: the video rows and the engine row keep each other\'s keys', () => {
  const picked = (): void => {
    localStorage.setItem(GRAPHICS_BACKEND_KEY, 'xbox');
    localStorage.setItem(LIGHTWEIGHT_MATCH_KEY, '0');
  };
  const kept = (): void => {
    expect(localStorage.getItem(LIGHTWEIGHT_MATCH_KEY)).toBe('0');
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('xbox');
  };
  it('one video row (shadows, the frame cap), a preset, PS2 then Modern, and the picture reset each keep the engine key and the pick', () => {
    picked();
    const v = videoSettingsKeeperV2();
    v.set({ shadows: v.get().shadows === 'off' ? 'low' : 'off' }); kept();
    v.set({ frameCap: v.get().frameCap === 30 ? 60 : 30 }); kept();
    v.set({ preset: 'quality' }); kept();
    v.set({ preset: 'auto' }); kept();
    pagePicture().choose('ps2'); kept();
    pagePicture().choose('modern'); kept();
    pagePicture().clear(); kept();
  });
  it('the engine row set both ways and reset leaves the renderer key and the video settings keys byte-identical', () => {
    localStorage.setItem(GRAPHICS_BACKEND_KEY, 'xbox');
    videoSettingsKeeperV2().set({ preset: 'custom', shadows: 'low', frameCap: 60 });
    localStorage.setItem(VIDEO_SETTINGS_KEY, JSON.stringify({ renderScale: 'performance', shadows: false }));
    const o = liveOptions(() => {}, { signedIn: () => false, pads: () => [], touch: () => false });
    try {
      const snap = () => [GRAPHICS_BACKEND_KEY, VIDEO_SETTINGS_KEY, VIDEO_SETTINGS_KEY_V2].map((k) => localStorage.getItem(k));
      const before = snap();
      o.set(LIGHTWEIGHT_MATCH_ROW, 0);
      expect(localStorage.getItem(LIGHTWEIGHT_MATCH_KEY)).toBe('1');
      expect(snap()).toEqual(before);
      o.set(LIGHTWEIGHT_MATCH_ROW, 1);
      expect(localStorage.getItem(LIGHTWEIGHT_MATCH_KEY)).toBe('0');
      expect(snap()).toEqual(before);
      o.reset(LIGHTWEIGHT_MATCH_ROW);
      expect(localStorage.getItem(LIGHTWEIGHT_MATCH_KEY)).toBe('');
      expect(snap()).toEqual(before);
    } finally { o.dispose(); }
  });
});
