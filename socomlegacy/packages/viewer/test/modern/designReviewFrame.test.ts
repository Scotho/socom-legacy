// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountReport } from '../../src/modern/report';

/**
 * MU-P1a of the rendered design review, round 1 (`docs/plans/briefs/modern-ui-design-review-r1.md`, items 20 and 24):
 * the look cards' guide frame (the modern Settings' Visuals choice) and the Report dialog. CX-27: the look cards' rule
 * (`src/startup.css` `.startup-look-body.is-guide`, its view retired with CX-26) is retired, no live markup drawing it;
 * item 20's case is not carried: nothing draws a look card now, so there is no frame left to hold.
 * Also the startup e2e's 1440 x 900 Home fit, restored after MU-P1b (the CSS that holds it, read as text). A browser
 * adaptation (MU.R1). CX-9b (CX.R8): the launcher frame's items (1, 3, 4, 6-9, 11, 12, 16, 21, 22) went with the old
 * layout (`src/modern/launcher.ts`, the setup page's bars); the console launcher is the launcher now. CX-25: the Home fit
 * (`modern/home/home.css`) went with Home and the modern shell.
 */
const here = dirname(fileURLToPath(import.meta.url));
const src = (rel: string): string => readFileSync(resolve(here, '../../src', rel), 'utf8').replace(/\r\n/g, '\n');
const strip = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
/** The declarations of every rule (in any block) whose selector list holds `sel` exactly, joined. */
const rule = (css: string, sel: string): string => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter((m) => m[1]!.split(',').map((s) => s.trim()).includes(sel)).map((m) => m[2]!).join(';');
/** The text of the `@media` block opened by `head` (the first one), to its closing brace. */
const block = (css: string, head: string): string => {
  const at = css.indexOf(head);
  if (at < 0) return '';
  let depth = 0;
  for (let i = css.indexOf('{', at); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(at, i + 1);
  }
  return css.slice(at);
};

afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('24: the Report dialog -- Circle and Cross on Cancel and Save, its file list a readout', () => {
  it('each button carries its glyph (decorative), its name unchanged; the context is the readout type', () => {
    document.body.innerHTML = '<div id="host"></div>';
    const ctx = { mode: 'setup', state: { disc: () => 'empty' }, session: { state: () => 'signed-out' } } as unknown as Parameters<typeof mountReport>[1];
    const d = mountReport(document.getElementById('host')!, ctx);
    const btn = (a: string): HTMLButtonElement => d.el.querySelector<HTMLButtonElement>(`button[data-action="${a}"]`)!;
    for (const [action, glyph, word] of [['cancel', 'circle', 'Cancel'], ['save', 'cross', 'Save']] as const) {
      const svg = btn(action).querySelector('svg')!;
      expect(svg.getAttribute('class')).toBe(`s2u-prompt__glyph s2u-prompt__glyph--${glyph}`);
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(btn(action).textContent).toBe(word);
    }
    expect(rule(strip(src('modern/report/report.css')), '.mu-report__context')).toMatch(/font:\s*var\(--mu-type-mono\)/);
    d.dispose();
  });
  it('the frame\'s other regions are freed in the same step as the content, before the focus goes back', () => {
    document.body.innerHTML = '<button id="back">b</button><div id="bar"></div><div id="content"></div><div id="host"></div>';
    const ctx = { mode: 'setup', state: { disc: () => 'empty' }, session: { state: () => 'signed-out' } } as unknown as Parameters<typeof mountReport>[1];
    const bar = document.getElementById('bar')!, content = document.getElementById('content')!;
    const d = mountReport(document.getElementById('host')!, ctx, { inertRoot: content, inertAlso: [bar] });
    document.getElementById('back')!.focus();
    d.open();
    expect(bar.hasAttribute('inert')).toBe(true);
    expect(content.hasAttribute('inert')).toBe(true);
    let freedFirst = false;
    document.getElementById('back')!.addEventListener('focus', () => { freedFirst = !bar.hasAttribute('inert'); });
    d.close();
    expect(freedFirst).toBe(true);
    d.dispose();
  });
});
