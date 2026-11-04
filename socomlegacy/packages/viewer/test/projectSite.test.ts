// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { archivePage, filterArchive } from '../src/projectSite/archivePage';
import { newsPage, publicationDate } from '../src/projectSite/newsPage';
import { roadmapPage } from '../src/projectSite/roadmapPage';
import { roadmapPhases } from '../src/projectSite/content/roadmap';
import { siteData, type GeneratedData } from '../src/projectSite/generated';
import { archiveItems } from '../src/projectSite/content/archive';
import type { NewsEntry } from '../src/projectSite/content/types';

afterEach(() => { document.body.replaceChildren(); history.replaceState(null, '', '/'); });

describe('archive discovery', () => {
  it('combines words, category and availability without exposing seeking items as sources', () => {
    expect(filterArchive(archiveItems, { category: 'All materials', query: ' SONY  headset ', availableOnly: true }).map(x => x.id)).toEqual(['us-manual']);
    expect(filterArchive(archiveItems, { category: 'Original website', query: 'teaser', availableOnly: true })).toEqual([]);
    expect(filterArchive(archiveItems, { category: 'Original website', query: 'teaser', availableOnly: false }).map(x => x.id)).toEqual(['original-mini-site']);
  });
  it('restores a shared search, updates its URL, and clears filters accessibly', () => {
    history.replaceState(null, '', '/archive?q=teaser&category=Original+website&available=1');
    document.body.append(archivePage());
    expect(document.querySelector('.project-empty')?.textContent).toContain('No matching items');
    const available = document.querySelector<HTMLInputElement>('input[name="available"]')!;
    available.click();
    expect(document.querySelectorAll('.project-archive-card')).toHaveLength(1);
    expect(document.querySelector('.project-archive-card a')).toBeNull();
    expect(new URLSearchParams(location.search).has('available')).toBe(false);
    document.querySelector<HTMLButtonElement>('.project-reset')!.click();
    expect(document.querySelectorAll('.project-archive-card')).toHaveLength(archiveItems.length);
    expect(document.activeElement?.getAttribute('name')).toBe('q');
    expect(location.search).toBe('');
    expect(document.querySelector('[aria-pressed="true"]')?.textContent).toBe('All materials');
  });
  it('rejects unknown categories and labels external references', () => {
    history.replaceState(null, '', '/archive?category=made-up');
    document.body.append(archivePage());
    expect(document.querySelectorAll('.project-archive-card')).toHaveLength(archiveItems.length);
    for (const source of document.querySelectorAll<HTMLAnchorElement>('a.project-source')) {
      expect(source.protocol).toBe('https:'); expect(source.target).toBe('_blank');
      expect(source.rel).toContain('noopener'); expect(source.getAttribute('aria-label')).toContain('new tab');
    }
  });
});

describe('future patch notes', () => {
  const older: NewsEntry = { id: 'old', title: '<b>Literal title</b>', date: '2026-01-01', kind: 'Patch notes', summary: 'Earlier', sections: [{ title: 'Fixed', items: ['<script>literal</script>'] }] };
  const newer: NewsEntry = { id: 'new', title: 'Newer', date: '2026-02-01', kind: 'Development', summary: 'Later', sections: [] };
  it('shows a truthful empty feed until an update is published', () => {
    const page = newsPage([]);
    expect(page.querySelectorAll('.project-news-entry')).toHaveLength(0);
    expect(page.textContent).toContain('No updates published yet');
  });
  it('orders updates, filters kinds, and treats editorial strings as text', () => {
    document.body.append(newsPage([older, newer]));
    expect([...document.querySelectorAll('.project-news-entry')].map(x => x.id)).toEqual(['new', 'old']);
    expect(document.querySelector('.project-news-entry script, .project-news-entry b')).toBeNull();
    [...document.querySelectorAll<HTMLButtonElement>('.project-filter')].find(x => x.textContent === 'Patch notes')!.click();
    expect([...document.querySelectorAll('.project-news-entry')].map(x => x.id)).toEqual(['old']);
    expect(publicationDate('2026-01-01')).toBe('1 Jan 2026');
  });
});

describe('TS-4: the generated news and milestone states', () => {
  const base: GeneratedData = { ...siteData, news: [
    { date: '2026-10-07', id: 'b', title: '<b>Older</b>', summary: 'the room', state: 'closed', source: 'docs/plans/b.md, ## Log, 2026-10-07' },
    { date: '2026-10-08', id: 'a', title: 'Voice', summary: 'push-to-talk', state: 'landed', source: 'docs/plans/a.md, ## Log, 2026-10-08' },
  ], milestones: [{ id: 'online-flow', status: 'Complete', source: 'docs/roadmap/SPRINTS.md: sprints 8' }] };
  it('the news page lists the plans’ recorded landings and closes, newest first, dated, as text, linking nowhere', () => {
    document.body.append(newsPage([], base));
    const items = [...document.querySelectorAll('#plan-record li')];
    expect(items.map((li) => li.querySelector('h3')!.textContent)).toEqual(['Voice', '<b>Older</b>']);
    expect(items[0]!.querySelector('time')!.getAttribute('datetime')).toBe('2026-10-08');
    expect(items.map((li) => li.querySelector('.project-meta')!.textContent)).toEqual(['8 Oct 2026Landed', '7 Oct 2026Closed']);
    expect(document.querySelector('#plan-record b, #plan-record a')).toBeNull();
    expect(items[1]!.textContent).toContain('docs/plans/b.md, ## Log, 2026-10-07');
  });
  it('the committed news is the generator’s, newest first', () => {
    const dates = siteData.news.map((n) => n.date);
    expect(dates.length).toBeGreaterThan(0);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
  it('the roadmap shows a milestone’s generated state, and its source', () => {
    document.body.append(roadmapPage(roadmapPhases, base));
    const online = [...document.querySelectorAll('.project-milestones li')].find((li) => li.querySelector('h3')!.textContent === 'The complete online flow')!;
    expect(online.querySelector('.project-milestone-heading')!.textContent).toBe('The complete online flowComplete');
    expect(online.textContent).toContain('docs/roadmap/SPRINTS.md: sprints 8');
  });
  it('every first-phase milestone has an id the committed data states', () => {
    const ids = new Set(siteData.milestones.map((m) => m.id));
    for (const m of roadmapPhases[0]!.milestones) expect(ids.has(m.id ?? ''), m.title).toBe(true);
  });
});

// The site port (2026-10-04, OT.R30) brings the three links only; the page's Legacy branding (#source, the About
// panel's sister-project link) arrives with the startup page's own port, which owns index.html's other changes.
// Changed deliberately for LS-1 (MU.R23, MU.R24): the links were the launcher top bar's project nav (`s2u-navlinks`, the
// live site's five pages), the Project tile and its three-link list retired. Changed deliberately for CX-9b (CX.R8: the
// old launcher's layout removed): the top bar went with the old layout, so the game page carries no project navigation;
// the pages are still served at their routes (`test/menuRoutesServe.test.ts`).
it('the game page carries no project navigation (CX-9b)', () => {
  const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../setup/index.html'), 'utf8');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  expect(doc.querySelectorAll('.s2u-navlinks a')).toHaveLength(0);
  expect(doc.querySelector('#site-links .s2u-navlinks, .startup-project')).toBeNull();
});
