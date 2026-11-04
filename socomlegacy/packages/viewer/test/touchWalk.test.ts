// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PAD_BUTTON, type PadButton } from '../src/gamepad';
import { GLYPH } from '../src/console/icons';
import { attachWalkTouch } from '../src/touch';
import { removePlayUi } from '../src/features';

/**
 * Walk mode's touch layout (MP-1, FI.R1, FI.R3; a browser adaptation): the touch pad wears the PlayStation's buttons --
 * each touch button is one of the standard pad's sixteen (`data-pad`, the W3C standard mapping's index) and presses that
 * button on the touch layer's virtual pad, so it means what the controller's button means (`PAD_LAYOUT`). No button wears
 * a word for its action (the owner: "don't say shoot show the actual buttons"); each names its pad button to a reader.
 */
const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, '../setup/index.html'), 'utf-8');
const css = readFileSync(resolve(here, '../src/styles.css'), 'utf-8');
const load = (): void => { document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML; };
const button = (id: string): HTMLElement => document.getElementById(id)!;
const pad = (index: number): HTMLElement => document.querySelector<HTMLElement>(`#touch-walk button[data-pad="${index}"]`)!;
const ptr = (el: EventTarget, type: string, pointerId = 1): void => {
  el.dispatchEvent(new PointerEvent(type, { pointerId, pointerType: 'touch', bubbles: true, cancelable: true }));
};

/** The name each pad button goes by in its `aria-label` (and on the button, for the shoulders, the clicks and the two in the middle). */
const NAME: Record<PadButton, string> = {
  Cross: 'Cross', Circle: 'Circle', Square: 'Square', Triangle: 'Triangle', L1: 'L1', R1: 'R1', L2: 'L2', R2: 'R2',
  Select: 'SELECT', Start: 'START', L3: 'L3', R3: 'R3', Up: 'D-pad up', Down: 'D-pad down', Left: 'D-pad left', Right: 'D-pad right',
};
/** The words the old layout wore, and any other action a button could be tempted to say. */
const ACTION_WORDS = /\b(SHOOT|FIRE|JUMP|RELOAD|NEXT|ZOOM|CROUCH|PRONE|STANCE|ACTION|PEEK|LEAN|SWAP|ITEM|MENU|SCORE|BOOST|MODE)\b/i;
const FACE: Partial<Record<PadButton, keyof typeof GLYPH>> = { Cross: 'cross', Circle: 'circle', Square: 'square', Triangle: 'triangle' };

describe('the layout in the page', () => {
  beforeEach(load);

  it('is the play\'s: one wrapper that carries data-play, and the rotate hint too', () => {
    expect(button('touch-walk').hasAttribute('data-play')).toBe(true);
    expect(button('rotate-hint').hasAttribute('data-play')).toBe(true);
    expect(button('touch-walk').closest('#touch')).not.toBeNull();
  });

  it('has every one of the standard pad\'s sixteen buttons, once each, by its index (FI.R3)', () => {
    const indices = [...document.querySelectorAll<HTMLElement>('#touch-walk button[data-pad]')].map((b) => Number(b.dataset['pad']));
    expect(indices.sort((a, b) => a - b)).toEqual(Object.values(PAD_BUTTON).sort((a, b) => a - b));
  });

  it('no lane is named twice: no button carries a lane or a deed of its own -- only WEAPON EXCHANGE\'s INV has no pad button', () => {
    expect(document.querySelectorAll('#touch-walk [data-lane], #touch-walk [data-do]')).toHaveLength(0);
    const padless = [...document.querySelectorAll<HTMLElement>('#touch-walk button:not([data-pad])')].map((b) => b.id);
    expect(padless).toEqual(['tw-weapons']);
  });

  it('the face buttons wear the PlayStation symbols in their own colours (the system\'s glyph classes, icons.ts\'s paths)', () => {
    for (const [name, glyph] of Object.entries(FACE) as [PadButton, keyof typeof GLYPH][]) {
      const svg = pad(PAD_BUTTON[name]).querySelector('svg');
      expect(svg, name).not.toBeNull();
      expect(svg!.classList.contains('s2u-hint__glyph'), name).toBe(true);
      expect(svg!.classList.contains(`s2u-hint__glyph--${glyph}`), name).toBe(true);
      expect(svg!.getAttribute('aria-hidden'), name).toBe('true');
      // The design's own glyph (`../src/console/icons` GLYPH), not a fork of it.
      const ref = document.createElement('div');
      ref.innerHTML = `<svg>${GLYPH[glyph]}</svg>`;
      expect(svg!.innerHTML, name).toBe(ref.querySelector('svg')!.innerHTML);
    }
  });

  it('the D-pad is four arrows, and the shoulders, the stick clicks, SELECT and START wear their own names', () => {
    for (const name of ['Up', 'Down', 'Left', 'Right'] as const) {
      expect(pad(PAD_BUTTON[name]).querySelector('svg path'), name).not.toBeNull();
      expect(pad(PAD_BUTTON[name]).textContent!.trim(), name).toBe('');
    }
    for (const name of ['L1', 'L2', 'R1', 'R2', 'L3', 'R3'] as const) expect(pad(PAD_BUTTON[name]).textContent!.trim(), name).toBe(NAME[name]);
  });

  it('SELECT and START use the reference symbols and retain their accessible names and pad actions', () => {
    for (const name of ['Select', 'Start'] as const) {
      const control = pad(PAD_BUTTON[name]);
      expect(control.textContent!.trim()).toBe('');
      expect(control.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
      expect(control.getAttribute('aria-label')).toMatch(new RegExp(`^${NAME[name]}: `));
    }
  });

  it('both sticks have decorative resting rings without introducing another input target', () => {
    for (const name of ['stick', 'aim']) {
      const rest = document.getElementById(`${name}-rest`);
      expect(rest).not.toBeNull();
      expect(rest!.getAttribute('aria-hidden')).toBe('true');
      expect(rest!.closest(`#${name}-zone`)).not.toBeNull();
      expect(rest!.querySelector('button, [tabindex]')).toBeNull();
    }
  });

  it('no button wears a word for its action (the owner: "don\'t say shoot show the actual buttons")', () => {
    for (const b of document.querySelectorAll<HTMLElement>('#touch-walk button')) expect(b.textContent ?? '', b.id).not.toMatch(ACTION_WORDS);
  });

  it('each button\'s aria-label names its pad button first, then what it does', () => {
    for (const [name, index] of Object.entries(PAD_BUTTON) as [PadButton, number][]) {
      const label = pad(index).getAttribute('aria-label') ?? '';
      expect(label.startsWith(`${NAME[name]}: `), `${name}: "${label}"`).toBe(true);
      expect(label.length, name).toBeGreaterThan(NAME[name].length + 2);
    }
    expect(button('tw-weapons').getAttribute('aria-label')).toBeTruthy();
  });

  it('shows only while walking on a touch screen, on whatever root holds the layer, and lifts the fullscreen button off the HUD\'s corner', () => {
    expect(css).toMatch(/#touch-walk, #rotate-hint\s*{\s*display:\s*none/);
    expect(css).toMatch(/(^|[\s,}])\.touch\.is-walking #touch-walk\s*{\s*display:\s*block/m);
    expect(css).toMatch(/\.touch\.is-walking #touch-lift[^{]*#touch-fire\s*{\s*display:\s*none/);
    expect(css).toMatch(/body\.is-walking #fullscreen\s*{[^}]*right:\s*auto[^}]*left:/);
    expect(css).toMatch(/@media \(orientation: portrait\)\s*{[^}]*#rotate-hint/);
  });

  it('its sizes follow the viewport (min / clamp of the viewport), not fixed pixels alone', () => {
    const root = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/:root\s*{([^}]*)}/g)].map((m) => m[1]).join(' ');
    for (const v of ['--tw-u', '--tw-f']) expect(root, v).toMatch(new RegExp(`${v}:\\s*clamp\\([^;]*vmin[^;]*\\)`));
  });

  it('is taken out with the rest of the play when it is off, and nothing is wired', () => {
    removePlayUi();
    expect(document.getElementById('touch-walk')).toBeNull();
    expect(document.getElementById('rotate-hint')).toBeNull();
    expect(attachWalkTouch(() => undefined)).toBe(0);
  });

  it('says nothing about a walk in its words when the play is off', () => {
    removePlayUi();
    expect(document.body.textContent).not.toMatch(/sideways/);
  });
});

describe('attachWalkTouch', () => {
  const log: string[] = [];
  beforeEach(() => {
    load(); log.length = 0;
    attachWalkTouch((index, down) => log.push(`${index}:${down ? 'down' : 'up'}`));
  });

  it('wires every pad button, and nothing else', () => {
    document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
    expect(attachWalkTouch(() => undefined)).toBe(16);
  });

  it('a press holds its pad button and a release lets it go, once', () => {
    ptr(pad(PAD_BUTTON.Square), 'pointerdown');
    expect(log).toEqual(['2:down']);
    expect(pad(PAD_BUTTON.Square).classList.contains('is-down')).toBe(true);
    ptr(pad(PAD_BUTTON.Square), 'pointerup');
    ptr(pad(PAD_BUTTON.Square), 'lostpointercapture');                 // the browser's own follow-up: not a second release
    expect(log).toEqual(['2:down', '2:up']);
    expect(pad(PAD_BUTTON.Square).classList.contains('is-down')).toBe(false);
  });

  it('holds many at once, each by its own pointer: the thumb on R1 and Square together', () => {
    ptr(pad(PAD_BUTTON.R1), 'pointerdown', 1);
    ptr(pad(PAD_BUTTON.Triangle), 'pointerdown', 2);
    ptr(pad(PAD_BUTTON.Square), 'pointerdown', 3);
    expect(log).toEqual(['5:down', '3:down', '2:down']);
    ptr(pad(PAD_BUTTON.R1), 'pointerup', 1);
    expect(log.at(-1)).toBe('5:up');
    expect(pad(PAD_BUTTON.Triangle).classList.contains('is-down')).toBe(true);
  });

  it('ignores a second finger on a button already held, and a release by another pointer', () => {
    ptr(pad(PAD_BUTTON.R1), 'pointerdown', 1);
    ptr(pad(PAD_BUTTON.R1), 'pointerdown', 2);
    ptr(pad(PAD_BUTTON.R1), 'pointerup', 2);
    expect(log).toEqual(['5:down']);
    ptr(pad(PAD_BUTTON.R1), 'pointercancel', 1);
    expect(log).toEqual(['5:down', '5:up']);
  });

  it('a cancelled touch is a release', () => {
    ptr(pad(PAD_BUTTON.R2), 'pointerdown');
    ptr(pad(PAD_BUTTON.R2), 'pointercancel');
    expect(log).toEqual(['7:down', '7:up']);
  });

  it('R3 is a pad button like the rest: a press holds it, a release lets it go (the reload is its lane, not a deed of the touch\'s)', () => {
    ptr(pad(PAD_BUTTON.R3), 'pointerdown');
    ptr(pad(PAD_BUTTON.R3), 'pointerup');
    expect(log).toEqual(['11:down', '11:up']);
  });

  it('a pointer the browser will not capture is let go when it slides off', () => {
    const b = pad(PAD_BUTTON.Up) as HTMLButtonElement;
    b.setPointerCapture = () => { throw new DOMException('gone', 'NotFoundError'); };
    expect(() => ptr(b, 'pointerdown')).not.toThrow();
    ptr(b, 'pointerleave');
    expect(log).toEqual(['12:down', '12:up']);
  });

  it('a long press does not open the browser\'s menu', () => {
    const e = new Event('contextmenu', { bubbles: true, cancelable: true });
    pad(PAD_BUTTON.R1).dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('while the layer is hidden (a pad selected, FI.R4) a press reaches no button', () => {
    load(); log.length = 0;
    let hidden = true;
    attachWalkTouch((index, down) => log.push(`${index}:${down ? 'down' : 'up'}`), { blocked: () => hidden });
    ptr(pad(PAD_BUTTON.R1), 'pointerdown', 1);
    ptr(pad(PAD_BUTTON.R1), 'pointerup', 1);
    expect(log).toEqual([]);
    expect(pad(PAD_BUTTON.R1).classList.contains('is-down')).toBe(false);
    hidden = false;
    ptr(pad(PAD_BUTTON.R1), 'pointerdown', 2);
    expect(log).toEqual(['5:down']);
  });
});
