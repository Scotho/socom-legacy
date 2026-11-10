// @vitest-environment jsdom
/**
 * LS-2 (MU.R23, MU.R24; `docs/plans/briefs/modern-ui-live-site-scope.md` §2, §6): the reading pages' nav is the ds's
 * `s2u-navlinks` (icon + word, `shared/ds` 1.3.0), with a two-row header on phones, and the public name is the live
 * site's "SOCOM II Legacy" (MU.R24, Q-A), never "SOCOM 2 Legacy".
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { archivePage } from '../src/projectSite/archivePage';
import { newsPage } from '../src/projectSite/newsPage';
import { roadmapPage } from '../src/projectSite/roadmapPage';
import { journeyPage } from '../src/projectSite/journeyPage';
import { serverPage } from '../src/projectSite/serverPage';
import type { PageId } from '../src/projectSite/content/types';

const here = dirname(fileURLToPath(import.meta.url));
const viewer = resolve(here, '..');
afterEach(() => { document.body.replaceChildren(); });

const down = () => Promise.resolve({ state: 'down' as const });
const PAGES: readonly [Exclude<PageId, 'agent'>, () => HTMLElement][] = [
  ['news', () => newsPage()], ['roadmap', () => roadmapPage()], ['journey', () => journeyPage()],
  ['archive', () => archivePage()], ['server', () => serverPage(undefined, down)],
];

describe('the nav: s2u-navlinks, icon + word', () => {
  it('on every page: seven links (LCM-16: Leaderboard after Server), each an aria-hidden icon and its word, current marked, then Play kept', () => {
    for (const [id, make] of PAGES) {
      const page = make();
      const nav = page.querySelector('nav.s2u-navlinks')!;
      expect(nav).not.toBeNull();
      expect(nav.getAttribute('aria-label')).toBe('Project');
      const links = [...nav.querySelectorAll<HTMLAnchorElement>('a.s2u-navlinks__link')];
      expect(links.map((a) => a.textContent)).toEqual(['News', 'Roadmap', 'Journey', 'Archive', 'Server', 'Leaderboard', 'Status']);
      for (const a of links) {
        const svgs = a.querySelectorAll('svg');
        expect(svgs).toHaveLength(1);
        expect(svgs[0]!.getAttribute('aria-hidden')).toBe('true');
        expect(svgs[0]!.classList.contains('s2u-icon')).toBe(true);
        expect(a.firstElementChild).toBe(svgs[0]);
      }
      expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
      expect(nav.querySelector('[aria-current="page"]')!.textContent).toBe(
        { news: 'News', roadmap: 'Roadmap', journey: 'Journey', archive: 'Archive', server: 'Server', status: 'Status' }[id]);
      expect(page.querySelector('.project-header a.project-launcher')!.textContent).toBe('Play');
      expect(nav.compareDocumentPosition(page.querySelector('.project-launcher')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
  it('the server link carries the ds server mark, not another page’s', () => {
    const page = newsPage();
    const icons = [...page.querySelectorAll('.s2u-navlinks__link svg')].map((s) => s.innerHTML);
    expect(new Set(icons).size).toBe(7);
  });
  it('the phone header: two rows at <= 640px (brand + Play over the nav), the pad ring from the ds link rule', () => {
    const css = readFileSync(resolve(viewer, 'src/projectSite/site.css'), 'utf8');
    const phone = css.slice(css.indexOf('@media (max-width: 640px)'));
    expect(phone).toMatch(/\.project-header[^{]*\{[^}]*flex-wrap: wrap/);
    expect(phone).toMatch(/\.project-nav\s*\{[^}]*flex: 1 0 100%[^}]*order: 3/);
    expect(phone).not.toMatch(/\.project-nav\s*\{[^}]*overflow-x/);
    const ds = readFileSync(resolve(viewer, '../../../shared/ds/components.css'), 'utf8');
    expect(ds).toMatch(/\.s2u-navlinks__link:focus-visible[^{]*\{[^}]*outline/);
  });
  it('the two-tier header at every width (LCM-16 fold 2): the nav its own row, left-aligned, wrapping on ds gaps, scoped to the shell', () => {
    const css = readFileSync(resolve(viewer, 'src/projectSite/site.css'), 'utf8');
    const wide = css.slice(0, css.indexOf('@media'));
    const rule = /\.project-nav\s*\{([^}]*)\}/.exec(wide)?.[1] ?? '';
    expect(rule).toMatch(/flex: 1 0 100%/);
    expect(rule).toMatch(/order: 3/);
    // seven links at 18px Oswald are about 914 px against a column of min(1040, 92vw): they must wrap below ~994 px
    expect(rule).toMatch(/flex-wrap: wrap/);
    expect(rule).toMatch(/justify-content: flex-start/);
    expect(rule).toMatch(/gap: 0 var\(--s2u-space-4\)/);
    expect(rule).not.toMatch(/overflow|white-space|nowrap/);
    // the arithmetic is written beside the rule
    expect(wide).toMatch(/914/);
    // the override is the shell's: no rule in site.css restyles the ds's .s2u-navlinks itself (the launcher keeps its own)
    expect(css).not.toMatch(/(^|[},]\s*)\.s2u-navlinks\b/m);
    // the phone rule keeps the wrap and the 44px links (the ds's min-height: --s2u-hit-min is never undone here)
    const phone = css.slice(css.indexOf('@media (max-width: 640px)'));
    expect(phone).toMatch(/\.project-nav\s*\{[^}]*flex-wrap: wrap[^}]*justify-content: flex-start/);
    expect(css).not.toMatch(/\.project-nav[^{]*\{[^}]*min-height: (?!var\(--s2u-hit-min\))/);
  });
});

describe('the name (MU.R24): SOCOM II Legacy', () => {
  it('the brand, label, titles and footer say SOCOM II Legacy, and no page says SOCOM 2 Legacy', () => {
    for (const [, make] of PAGES) {
      const page = make();
      expect(page.querySelector('.project-brand')!.getAttribute('aria-label')).toBe('SOCOM II Legacy launcher');
      expect(page.querySelector('.project-brand-word')!.textContent).toBe('SOCOM II LEGACY');
      expect(page.querySelector('svg.project-brand-mark')!.getAttribute('aria-label')).toBe('SOCOM II Legacy');
      expect(page.querySelector('.project-footer-brand')!.textContent).toBe('SOCOM II LEGACY');
      expect(page.textContent).not.toMatch(/SOCOM 2 Legacy/i);
    }
  });
  it('no source of these pages (entries, modules, content, README) holds "SOCOM 2 Legacy"', () => {
    const files = ['archive', 'journey', 'news', 'roadmap', 'server', 'status'].map((p) => join(viewer, p, 'index.html'));
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
    files.push(...walk(join(viewer, 'src/projectSite')));
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/SOCOM 2 Legacy/i);
    for (const p of ['archive', 'journey', 'news', 'roadmap', 'server', 'status'])
      expect(readFileSync(join(viewer, p, 'index.html'), 'utf8')).toContain('SOCOM II Legacy');
  });
});
