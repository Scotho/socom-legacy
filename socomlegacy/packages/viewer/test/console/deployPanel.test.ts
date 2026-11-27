// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { deployPanelHtml, deploySteps, type DeployPanel } from '../../src/console/deployPanel';

/**
 * WM-37 (the owner's "12 b approved on both", 2026-11-15; product track, a browser adaptation): ONE drawing of the
 * launcher's DEPLOYING panel (`../../src/console/deployPanel`) for OUR two deploying layers -- the direct link's cover
 * and the launcher's own hand-over. 12B's polish: a 4 px bar with a glowing head, the step marks on one rail filling
 * gold, a done step a check, the parts rising staggered, a gold rule before the kicker. Its look is the design system's
 * tokens by class: no inline colour or type (the viewer chrome's rule). Fakes only.
 */
const box = (html: string): HTMLElement => { const d = document.createElement('div'); d.innerHTML = html; return d; };
const base = (o: Partial<DeployPanel> = {}): DeployPanel => ({
  kicker: 'Direct link', title: 'DEPLOYING', share: 0.5, line: 'Loading the game…', steps: deploySteps(['Disc', 'Load', 'Connect', 'Lobby'], 1), foot: 'F', ...o,
});
const SHEET = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/console/deployPanel.css'), 'utf8');

describe('the shared panel: its parts', () => {
  it('one root .dp: the kicker, the head with the title, the bar, the status line, the step rail and the foot, in that order', () => {
    const b = box(deployPanelHtml(base()));
    const root = b.querySelector('.dp')!;
    expect(b.children).toHaveLength(1);
    expect([...root.children].map((e) => e.classList[0])).toEqual(['dp__kicker', 'dp__head', 'dp__bar', 'dp__line', 'dp__steps', 'dp__foot']);
    expect(root.querySelector('.dp__head > h2.dp__title')!.textContent).toBe('DEPLOYING');
    expect(root.querySelector('.dp__kicker')!.textContent).toBe('Direct link');
    expect(root.querySelector('[data-part="line"]')!.textContent).toBe('Loading the game…');
    expect(root.querySelector('.dp__foot')!.textContent).toBe('F');
  });

  it('each stage: the steps before it done (a check), it now, after it next; the rail filled to it', () => {
    for (let now = 0; now < 4; now++) {
      const b = box(deployPanelHtml(base({ steps: deploySteps(['Disc', 'Load', 'Connect', 'Lobby'], now) })));
      const steps = [...b.querySelectorAll('.dp__step')];
      expect(steps.map((e) => e.className)).toEqual([0, 1, 2, 3].map((i) => `dp__step is-${i < now ? 'done' : i === now ? 'now' : 'next'}`));
      expect(steps.map((e) => e.querySelector('.dp__node')!.textContent)).toEqual([0, 1, 2, 3].map((i) => (i < now ? '✓' : String(i + 1))));
      expect(b.querySelector<HTMLElement>('.dp__steps')!.style.getPropertyValue('--dp-fill')).toBe(String(now / 3));
    }
  });

  it('the bar carries its share (clamped 0..1) for the fill and the glowing head; an unknown share waits', () => {
    expect(box(deployPanelHtml(base({ share: 0.36 }))).querySelector<HTMLElement>('.dp__bar')!.style.getPropertyValue('--dp-share')).toBe('0.36');
    expect(box(deployPanelHtml(base({ share: 1.4 }))).querySelector<HTMLElement>('.dp__bar')!.style.getPropertyValue('--dp-share')).toBe('1');
    expect(box(deployPanelHtml(base({ share: -1 }))).querySelector<HTMLElement>('.dp__bar')!.style.getPropertyValue('--dp-share')).toBe('0');
    const waiting = box(deployPanelHtml(base({ share: null }))).querySelector('.dp__bar')!;
    expect(waiting.classList.contains('is-waiting')).toBe(true);
    expect((waiting as HTMLElement).style.getPropertyValue('--dp-share')).toBe('');
  });

  it('the entrance: only on the first draw, each part its stagger index as a custom property', () => {
    const entering = box(deployPanelHtml(base({ enter: true }))).querySelector('.dp')!;
    expect(entering.classList.contains('is-entering')).toBe(true);
    expect([...entering.children].map((e) => (e as HTMLElement).style.getPropertyValue('--dp-i'))).toEqual(['0', '1', '2', '3', '4', '5']);
    expect(box(deployPanelHtml(base())).querySelector('.dp.is-entering')).toBeNull();
  });

  it('the review\'s F6: the `after` children (the error line, Back) rise last -- the sheet gives every child past the six the last index', () => {
    const root = box(deployPanelHtml(base({ enter: true, after: '<p role="alert">E</p><button type="button">Back</button>' }))).querySelector('.dp')!;
    const after = [...root.children].slice(6);
    expect(after.map((e) => e.tagName)).toEqual(['P', 'BUTTON']);
    for (const e of after) expect((e as HTMLElement).style.getPropertyValue('--dp-i')).toBe('');   // no inline index: the sheet's
    expect(SHEET.replace(/\/\*[\s\S]*?\*\//g, '')).toMatch(/\.dp > :nth-child\(n\+7\) \{ --dp-i: 6; \}/);
  });

  it('the head: a title id and trusted markup beside the title (the hand-over\'s close button), its own class added', () => {
    const b = box(deployPanelHtml(base({ titleId: 'launch-title', headClass: 'cx-launch__head', close: '<button type="button" data-close>×</button>', footClass: 'cx-launch__note', after: '<p role="alert">E</p>' })));
    expect(b.querySelector('#launch-title')!.textContent).toBe('DEPLOYING');
    expect(b.querySelector('.dp__head.cx-launch__head [data-close]')).not.toBeNull();
    expect(b.querySelector('.dp__foot.cx-launch__note')!.textContent).toBe('F');
    expect(b.querySelector('.dp > [role="alert"]')!.textContent).toBe('E');
  });

  it('the words are escaped; nothing in it plays (no sound element)', () => {
    const b = box(deployPanelHtml(base({ title: '<b>x</b>', line: 'a & b', steps: deploySteps(['<i>'], 0) })));
    expect(b.querySelector('b')).toBeNull();
    expect(b.querySelector('.dp__title')!.textContent).toBe('<b>x</b>');
    expect(b.querySelector('.dp__label')!.textContent).toBe('<i>');
    expect(b.querySelector('audio, video')).toBeNull();
  });
});

describe('the shared panel: no inline colour or type; its look the design system\'s', () => {
  it('every inline style is a --dp-* custom property only', () => {
    const b = box(deployPanelHtml(base({ enter: true })));
    const styles = [...b.querySelectorAll('[style]')].map((e) => e.getAttribute('style')!);
    expect(styles.length).toBeGreaterThan(0);
    for (const s of styles) for (const decl of s.split(';').map((d) => d.trim()).filter(Boolean)) expect(decl, s).toMatch(/^--dp-[a-z]+:\s*[0-9.]+$/);
  });

  it('the sheet: no colour literal; every colour, face and duration a --s2u- token; 12B\'s polish in it', () => {
    const body = SHEET.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(body).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\b(white|black)\b/i);
    for (const m of body.matchAll(/(?:^|[;{\s])(color|background|background-color)\s*:\s*([^;}]+)/g)) expect(m[2]!.trim(), m[0]).toMatch(/var\(--s2u-|^(transparent|none|currentColor|inherit)$|linear-gradient\(90deg, var\(--s2u-/);
    for (const m of body.matchAll(/var\(--s2u-font-([a-z]+)\)/g)) expect(['label', 'display', 'mono']).toContain(m[1]);
    expect(body).toMatch(/\.dp__bar \{[^}]*height: 0\.25rem;/);                     // a 4 px bar
    expect(body).toMatch(/\.dp__bar:not\(\.is-waiting\)::after \{[^}]*box-shadow:/);   // its glowing head
    expect(body).toMatch(/\.dp__kicker::before \{[^}]*background: var\(--s2u-gold\)/); // the gold rule before the kicker
    expect(body).toMatch(/\.dp__title \{[^}]*6\.5rem/);                              // 104 px
    expect(body).toMatch(/\.dp__line \{[^}]*font: 400 /);                             // the status line at 400
    expect(body).toMatch(/\.dp\.is-entering > \* \{[^}]*animation: dp-rise var\(--s2u-dur-slow\)[^}]*animation-delay: calc\(var\(--dp-i, 0\) \* 60ms\)/);
    expect(body).toMatch(/@keyframes dp-rise \{ from \{ opacity: 0; transform: translateY\(0\.75rem\); \} \}/);
    expect(body).toMatch(/prefers-reduced-motion: reduce/);
  });
});
