import { startPwa } from '../pwa/boot';
import './site.css';
import { newsPage } from './newsPage';
import { roadmapPage } from './roadmapPage';
import { archivePage } from './archivePage';
import { serverPage } from './serverPage';
import { journeyPage } from './journeyPage';
import { statusPage } from './statusPage';
import { fixtureReport } from './statusModel';
import type { PageId } from './content/types';

/**
 * A development picture of one state, loopback only. The query is read by hand, not as a launch parameter
 * (the playtest table, PTT-9, owns every `URLSearchParams` key under this package).
 */
function statusEntry(): HTMLElement {
  if (import.meta.env.DEV) {
    const host = location.hostname;
    const onLoopback = host === '127.0.0.1' || host === 'localhost' || host === '[::1]';
    const fixed = onLoopback ? pictureFrom(location.search) : null;
    if (fixed) return statusPage({ load: async () => fixed, poll: false });
  }
  return statusPage();
}

function pictureFrom(search: string): ReturnType<typeof fixtureReport> {
  const key = 'statusFixture=';
  let from = 0;
  while (from < search.length) {
    const at = search.indexOf(key, from);
    if (at < 0) return null;
    const before = at === 0 ? '?' : search[at - 1];
    if (before === '?' || before === '&') {
      const start = at + key.length;
      const end = search.indexOf('&', start);
      const raw = search.slice(start, end < 0 ? undefined : end);
      let name = raw;
      try { name = decodeURIComponent(raw); } catch { /* leave the raw text */ }
      return fixtureReport(name);
    }
    from = at + key.length;
  }
  return null;
}

startPwa(window);
const pages: Record<PageId, () => HTMLElement> = {
  news: newsPage, roadmap: roadmapPage, journey: () => journeyPage(), archive: archivePage, server: serverPage, status: statusEntry,
};
const page = document.body.dataset['projectPage'] as PageId;
document.querySelector('#project-site')!.replaceChildren(pages[page]());
// Static document IDs keep article/phase/catalog permalinks useful on a direct load.
if (location.hash) {
  let id = location.hash.slice(1);
  try { id = decodeURIComponent(id); } catch { /* malformed incoming fragment: leave it literal */ }
  document.getElementById(id)?.scrollIntoView();
}
