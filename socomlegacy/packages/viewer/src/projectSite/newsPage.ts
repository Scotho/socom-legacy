import { badge, element, emptyState, filterButtons, link, pageShell, sectionHeading, sourceLink } from './components';
import { inFlightList, siteData, type GeneratedData, type GeneratedNews } from './generated';
import { newsEntries } from './content/news';
import type { NewsEntry } from './content/types';

/** UTC keeps date-only editorial records on the same day in every visitor's time zone. */
export function publicationDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

export function newsCard(entry: NewsEntry): HTMLElement {
  const article = element('article', 'project-news-entry'); article.id = entry.id;
  const meta = element('div', 'project-meta');
  const time = element('time', '', publicationDate(entry.date)); time.dateTime = entry.date;
  meta.append(badge(entry.kind), time);
  if (entry.version) meta.append(element('span', 'project-version', entry.version));
  const heading = element('h2'); heading.append(link(entry.title, `#${entry.id}`, 'project-tap'));
  article.append(meta, heading, element('p', 'project-news-summary', entry.summary));
  for (const section of entry.sections) {
    const group = element('section', 'project-change-group'); group.append(element('h3', '', section.title));
    const list = element('ul'); list.append(...section.items.map((text) => element('li', '', text)));
    group.append(list); article.append(group);
  }
  if (entry.links?.length) {
    const links = element('div', 'project-source-list'); links.append(...entry.links.map(sourceLink)); article.append(links);
  }
  return article;
}

/**
 * The plans' own record (TS-4; MU.R7): each plan whose Log records its landing on main or its close, at that entry's date,
 * newest first (`tools/sitePages.ts` `buildNews`). Text only; it links nowhere -- the source is the plan's path.
 */
export function planRecord(items: readonly GeneratedNews[]): HTMLElement {
  const section = element('section', 'project-generated-section'); section.id = 'plan-record';
  section.append(sectionHeading('From the project’s plans', 'Each plan whose record names its landing or its close, newest first'));
  const list = element('ul', 'project-topics');
  for (const n of [...items].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))) {
    const li = element('li');
    const meta = element('div', 'project-meta');
    const time = element('time', '', publicationDate(n.date)); time.dateTime = n.date;
    meta.append(time, badge(n.state === 'landed' ? 'Landed' : 'Closed', n.state === 'landed' ? 'active' : 'neutral'));
    li.append(meta, element('h3', '', n.title));
    if (n.summary) li.append(element('p', '', n.summary));
    li.append(element('p', 'project-fine', `Source: ${n.source}`));
    list.append(li);
  }
  section.append(list);
  return section;
}

export function newsPage(entries: readonly NewsEntry[] = newsEntries, data: GeneratedData = siteData): HTMLElement {
  const shell = pageShell('news', 'News & patch notes', 'Project updates', 'Release notes, development updates and the work behind SOCOM II Legacy.');
  const main = shell.querySelector('main')!;
  const layout = element('div', 'project-news-layout');
  const feed = element('div', 'project-news-feed');
  feed.append(sectionHeading('Latest updates', entries.length ? 'Newest first' : 'The record starts here'));
  const posts = element('div');
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  const render = (kind: string): void => {
    const selected = sorted.filter((entry) => kind === 'All updates' || entry.kind === kind);
    posts.replaceChildren(...(selected.length ? selected.map(newsCard) : [emptyState('No updates published yet', 'This will be the home for patch notes and project updates. Check the roadmap for the current direction.')]));
  };
  if (entries.length) feed.append(filterButtons('Update type', ['All updates', ...new Set(entries.map((entry) => entry.kind))], 'All updates', render));
  feed.append(posts); render('All updates');
  // The bigger picture, a ds callout (the public site's surface rule: a 2px gold top rule, no hover lift).
  const aside = element('aside', 'project-aside s2u-panel s2u-panel--callout');
  const asideBody = element('div', 's2u-panel__body');
  asideBody.append(element('p', 'project-kicker', 'The bigger picture'), element('h2', '', 'Parity comes first.'),
    element('p', '', 'The roadmap follows the project from recreating the original multiplayer experience to a reliable release, then to future extensions.'),
    link('Explore the roadmap →', `${import.meta.env.BASE_URL}roadmap`, 's2u-action s2u-action--tertiary project-text-link'));
  const topics = element('ul', 'project-topics');
  for (const [title, description] of [
    ['Patch notes', 'Changes, fixes and known issues for each release.'],
    ['Development', 'Progress and decisions along the way.'],
    ['Announcements', 'Testing opportunities and project news.'],
  ]) {
    const item = element('li'); item.append(element('h3', '', title), element('p', '', description)); topics.append(item);
  }
  asideBody.append(topics); aside.append(asideBody); layout.append(feed, aside); main.append(layout);
  if (data.news.length) main.append(planRecord(data.news));
  // Generated from the repository's handoff (tools/sitePages.ts): what is in flight now, as the project's own record states it.
  const state = element('section', 'project-generated-section'); state.id = 'in-flight';
  state.append(sectionHeading('Where the work stands', `${data.inFlight.length} items from the project handoff, and ${data.plans.length} plans on record`), inFlightList(data.inFlight));
  main.append(state);
  return shell;
}
