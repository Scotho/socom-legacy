// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { morph } from '../../src/console/morph';
import { exitMs, LX_MOTION_MS, lxMs, reducedMotion } from '../../src/console/motion';
import { screenDir } from '../../src/console/render/frame';

/**
 * RB-4 (the replay batch plan, `docs/plans/2026-11-08-replay-batch.md`): the launcher's motion foundation -- the motion
 * tokens read from the design system's `--s2u-dur-lx-*`, the patcher's keyed exit (a node that opts in with `data-exit`
 * stays mounted, marked leaving, for its exit's duration, then leaves) and its direction attribute. A browser adaptation
 * with no original (the project's launcher page, OT.R28); nothing of the game.
 */

const BASE = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../shared/ds/base.css'), 'utf-8');

function reduce(on: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({ matches: on && q.includes('prefers-reduced-motion: reduce'), media: q, addEventListener() {}, removeEventListener() {} }),
  });
}

describe('motion tokens (console/motion.ts)', () => {
  afterEach(() => { reduce(false); document.documentElement.removeAttribute('style'); });

  it('the fallbacks are base.css\'s --s2u-dur-lx-* values, held equal', () => {
    for (const [name, ms] of Object.entries(LX_MOTION_MS)) {
      const m = new RegExp(`--s2u-dur-lx-${name}:\\s*(\\d+)ms;`).exec(BASE);
      expect(m, name).not.toBeNull();
      expect(Number(m![1]), name).toBe(ms);
    }
  });

  it('a token reads the page\'s live value where it has one, else its fallback', () => {
    expect(lxMs(document, 'slide')).toBe(LX_MOTION_MS.slide);
    document.documentElement.style.setProperty('--s2u-dur-lx-slide', '0.3s');
    expect(lxMs(document, 'slide')).toBe(300);
    document.documentElement.style.setProperty('--s2u-dur-lx-slide', '0s');   // base.css's reduced-motion value
    expect(lxMs(document, 'slide')).toBe(0);
  });

  it('zero under reduced motion, whatever the token says', () => {
    reduce(true);
    expect(reducedMotion(document)).toBe(true);
    expect(lxMs(document, 'fade')).toBe(0);
    const el = document.createElement('i');
    el.setAttribute('data-exit', '420');
    expect(exitMs(el)).toBe(0);
  });

  it('data-exit names a token or a whole number of ms; anything else is no exit', () => {
    const el = document.createElement('i');
    el.setAttribute('data-exit', 'item');
    expect(exitMs(el)).toBe(LX_MOTION_MS.item);
    el.setAttribute('data-exit', '250');
    expect(exitMs(el)).toBe(250);
    for (const bad of ['', 'nope', '-5', '1.5s']) { el.setAttribute('data-exit', bad); expect(exitMs(el), bad).toBe(0); }
    el.removeAttribute('data-exit');
    expect(exitMs(el)).toBe(0);
  });
});

describe('the patcher\'s keyed exit (console/morph.ts)', () => {
  beforeEach(() => { vi.useFakeTimers(); reduce(false); });
  afterEach(() => { vi.useRealTimers(); reduce(false); });

  it('an exiting keyed node stays for its duration, marked leaving and inert, then leaves', () => {
    const host = document.createElement('div');
    morph(host, '<section data-key="a" data-exit="200">A</section>');
    const a = host.firstElementChild!;
    morph(host, '');
    expect(a.parentNode).toBe(host);
    expect(a.hasAttribute('data-leaving')).toBe(true);
    expect(a.hasAttribute('inert')).toBe(true);
    expect(a.getAttribute('aria-hidden')).toBe('true');
    vi.advanceTimersByTime(199);
    expect(a.parentNode).toBe(host);
    vi.advanceTimersByTime(1);
    expect(a.parentNode).toBeNull();
    expect(host.childNodes).toHaveLength(0);
  });

  it('a replaced keyed node leaves after its successor, which takes its place first in the document', () => {
    const host = document.createElement('div');
    morph(host, '<section data-key="home" data-exit="slide"><b class="is-focused">h</b></section>');
    const home = host.firstElementChild!;
    morph(host, '<section data-key="rooms"><b class="is-focused">r</b></section>');
    expect(host.children).toHaveLength(2);
    expect(host.firstElementChild!.getAttribute('data-key')).toBe('rooms');
    expect(host.querySelector('.is-focused')!.textContent).toBe('r');
    expect(home.hasAttribute('data-leaving')).toBe(true);
    vi.advanceTimersByTime(LX_MOTION_MS.slide);
    expect(host.children).toHaveLength(1);
    expect(home.parentNode).toBeNull();
  });

  it('a leaving node is out of the index match: the next draw patches the live nodes only', () => {
    const host = document.createElement('div');
    morph(host, '<p data-key="x" data-exit="300">x</p><p data-key="y">y</p>');
    morph(host, '<p data-key="y">y</p>');                             // the index match: a new y before the leaving x
    const y = host.firstElementChild!;
    expect(y.getAttribute('data-key')).toBe('y');
    morph(host, '<p data-key="y">y2</p><p data-key="z">z</p>');
    expect(y.textContent).toBe('y2');
    expect(Array.from(host.children).map((e) => e.getAttribute('data-key'))).toEqual(['y', 'z', 'x']);
    vi.advanceTimersByTime(300);
    expect(Array.from(host.children).map((e) => e.getAttribute('data-key'))).toEqual(['y', 'z']);
  });

  it('a key drawn again while it leaves is revived, not doubled, and its removal cancelled', () => {
    const host = document.createElement('div');
    morph(host, '<section data-key="p" data-exit="400" class="a">p</section>');
    const p = host.firstElementChild!;
    morph(host, '');
    vi.advanceTimersByTime(100);
    morph(host, '<section data-key="p" data-exit="400" class="b">p2</section>');
    expect(host.children).toHaveLength(1);
    expect(host.firstElementChild).toBe(p);
    expect(p.hasAttribute('data-leaving')).toBe(false);
    expect(p.hasAttribute('inert')).toBe(false);
    expect(p.getAttribute('class')).toBe('b');
    vi.advanceTimersByTime(1000);
    expect(p.parentNode).toBe(host);
  });

  it('zero under reduced motion: an exiting node leaves at once', () => {
    reduce(true);
    const host = document.createElement('div');
    morph(host, '<section data-key="a" data-exit="slide">A</section>');
    morph(host, '');
    expect(host.childNodes).toHaveLength(0);
  });

  it('a node without data-exit, or without a key, leaves at once as before', () => {
    const host = document.createElement('div');
    morph(host, '<section data-key="a">A</section><section data-exit="200">B</section>');
    morph(host, '');
    expect(host.childNodes).toHaveLength(0);
  });

  it('the direction: written on the host, and frozen on a node as it starts to leave', () => {
    const host = document.createElement('div');
    morph(host, '<section data-key="a" data-exit="200">A</section>', { dir: 'forward' });
    expect(host.getAttribute('data-dir')).toBe('forward');
    const a = host.firstElementChild!;
    morph(host, '<section data-key="b">B</section>', { dir: 'back' });
    expect(host.getAttribute('data-dir')).toBe('back');
    expect(a.getAttribute('data-dir')).toBe('back');
    morph(host, '<section data-key="b">B</section>', { dir: 'forward' });
    expect(a.getAttribute('data-dir')).toBe('back');
    morph(host, '<section data-key="b">B</section>');
    expect(host.getAttribute('data-dir')).toBe('forward');   // no direction given: the last one stands
  });
});

describe('the frame\'s screen direction (render/frame.ts)', () => {
  it('deeper is forward, toward Home is back, a redraw or the same depth gives none', () => {
    const doc = document.implementation.createHTMLDocument('t');
    expect(screenDir(doc, 'home')).toBeUndefined();
    expect(screenDir(doc, 'options')).toBe('forward');
    expect(screenDir(doc, 'options')).toBeUndefined();
    expect(screenDir(doc, 'home')).toBe('back');
    expect(screenDir(doc, 'rooms')).toBe('forward');
    expect(screenDir(doc, 'room')).toBe('forward');
    expect(screenDir(doc, 'game')).toBe('forward');
    expect(screenDir(doc, 'rooms')).toBe('back');
    expect(screenDir(doc, 'options')).toBeUndefined();   // the same depth: the last direction stands
    expect(screenDir(doc, 'remap')).toBe('forward');
  });
});
