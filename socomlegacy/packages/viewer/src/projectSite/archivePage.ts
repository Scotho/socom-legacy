import { badge, element, emptyState, pageShell, sourceLink } from './components';
import { archiveItems, preservationLinks } from './content/archive';
import { archiveCategories, type ArchiveCategory, type ArchiveItem } from './content/types';

export interface ArchiveFilter { category: string; query: string; availableOnly: boolean }
export function filterArchive(items: readonly ArchiveItem[], filter: ArchiveFilter): ArchiveItem[] {
  const terms = filter.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    const text = [item.title, item.description, item.category, item.period, item.format, item.credit, ...item.tags].join(' ').toLocaleLowerCase();
    return (filter.category === 'All materials' || item.category === filter.category)
      && (!filter.availableOnly || item.status === 'Available') && terms.every((term) => text.includes(term));
  });
}

/**
 * The archive's halls (TS-3; teaser@185764c3 `projectSite/archivePage.ts` l.18-52 `ARCHIVE_HALLS`, adapted): each category a
 * hall with its number and a line in the collectors' voice (the scope brief's Q5, adopted by MU.R22). The teaser's
 * screenshot backdrops are not taken (MU.R22: no game screenshot) and no image is planned for them, so a hall's banner is
 * the plain ds panel (the TS-3 review).
 */
export const ARCHIVE_HALLS: Record<ArchiveCategory, { code: string; intro: string }> = {
  'Manuals & print': { code: '01', intro: 'The booklet in the case and the paper that came with it.' },
  'Ads & trailers': { code: '02', intro: 'How SOCOM II was sold: magazine spreads, TV spots and trailers.' },
  'Original website': { code: '03', intro: 'The game’s corner of the early-2000s web, and the teasers that lived there.' },
  'History': { code: '04', intro: 'How the sequel was talked about at the time, before anyone had played it.' },
};

/** "On display" for an item with a checked source, "Wanted" for one still sought: the content's `status`, in the collectors' words. */
export const stampFor = (item: ArchiveItem): string => (item.status === 'Available' ? 'On display' : 'Wanted');
const hallCount = (items: readonly ArchiveItem[]): string => {
  const on = items.filter((i) => i.status === 'Available').length;
  return `${on} on display · ${items.length - on} wanted`;
};

/** An exhibit: on display (a source to visit) or wanted (a gap in the collection), stamped so; originals and hosts credited apart. */
export function archiveCard(item: ArchiveItem): HTMLElement {
  const article = element('article', 'project-archive-card'); article.id = item.id; article.dataset['status'] = item.status;
  const hall = ARCHIVE_HALLS[item.category];
  const cover = element('div', 'project-artifact-cover'); cover.setAttribute('aria-hidden', 'true');
  cover.append(element('span', 'project-artifact-code', `${hall.code} / ${item.category}`), element('strong', '', item.format), element('span', '', item.period));
  const body = element('div', 'project-artifact-body');
  const meta = element('div', 'project-meta');
  const stamp = element('span', 'project-stamp', stampFor(item)); stamp.dataset['status'] = item.status;
  meta.append(stamp, badge(item.category));
  body.append(meta, element('h3', '', item.title), element('p', '', item.description), element('p', 'project-credit', item.credit));
  const details = element('details', 'project-provenance');
  details.append(element('summary', 'project-tap', 'Source & provenance'), element('p', '', item.provenance));
  if (item.status === 'Available') {
    details.append(element('p', 'project-fine', `Source checked ${item.checked}. Linked material is hosted externally.`));
    body.append(sourceLink(item.source));
  } else {
    // The teaser's "tell us" without its link (no social links, MU.R22): plain about what is not open yet.
    body.append(element('p', 'project-seeking', 'Collecting · source needed'),
      element('p', 'project-wanted-cta', 'Have it? A way to send it to the project is not open yet.'));
  }
  body.append(details); article.append(cover, body); return article;
}

/** A hall: its banner (the plain ds panel) with the whole hall's counts, and its matching exhibits. */
function hallSection(category: ArchiveCategory, shown: readonly ArchiveItem[], all: readonly ArchiveItem[]): HTMLElement {
  const hall = ARCHIVE_HALLS[category];
  const section = element('section', 'project-hall'); section.dataset['hall'] = category;
  const id = `hall-${hall.code}`;
  section.setAttribute('aria-labelledby', id);
  const banner = element('header', 'project-hall-banner s2u-panel');
  const title = element('h2', 's2u-panel__head'); title.id = id;
  title.append(element('span', 'project-hall-code', hall.code), document.createTextNode(` ${category}`));
  const bannerBody = element('div', 's2u-panel__body');
  bannerBody.append(element('p', '', hall.intro), element('p', 'project-hall-count', hallCount(all.filter((i) => i.category === category))));
  banner.append(title, bannerBody);
  const grid = element('div', 'project-archive-grid'); grid.append(...shown.map(archiveCard));
  section.append(banner, grid);
  return section;
}

/** The tiles that filter the collection: All materials, then one per hall with its counts (ds secondary actions, pressed when chosen). */
function hallTiles(items: readonly ArchiveItem[], selected: string, change: (value: string) => void): HTMLElement {
  const group = element('div', 'project-filters project-hall-tiles');
  group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Archive category');
  const choose = (button: HTMLButtonElement, value: string): void => {
    for (const other of group.querySelectorAll('button')) other.setAttribute('aria-pressed', String(other === button));
    change(value);
  };
  const all = element('button', 's2u-action project-filter', 'All materials'); all.type = 'button';
  all.setAttribute('aria-pressed', String(selected === 'All materials'));
  all.addEventListener('click', () => choose(all, 'All materials'));
  group.append(all);
  for (const category of archiveCategories) {
    const hall = ARCHIVE_HALLS[category];
    const button = element('button', 's2u-action project-filter project-hall-tile'); button.type = 'button';
    button.setAttribute('aria-label', category); button.setAttribute('aria-pressed', String(selected === category));
    // The aria-label stays the category exactly (the e2e finds the tile by it); the counts are its description.
    const count = element('span', 'project-hall-count', hallCount(items.filter((i) => i.category === category)));
    count.id = `hall-tile-${hall.code}-count`; button.setAttribute('aria-describedby', count.id);
    button.append(element('span', 'project-hall-code', hall.code), element('strong', '', category), count);
    button.addEventListener('click', () => choose(button, category));
    group.append(button);
  }
  return group;
}

export function archivePage(items: readonly ArchiveItem[] = archiveItems): HTMLElement {
  const shell = pageShell('archive', 'The SOCOM II archive', 'A living collection', 'The manuals, advertisements, websites and stories around the game. A small museum of what came before.');
  const main = shell.querySelector('main')!;
  const toolbar = element('div', 'project-archive-toolbar');
  const searchLabel = element('label', 'project-search-label', 'Search the archive');
  const search = element('input', 'project-tap'); search.type = 'search'; search.placeholder = 'Manuals, trailers, E3…'; search.name = 'q';
  searchLabel.append(search);
  const availableLabel = element('label', 'project-available-label project-tap');
  const available = element('input'); available.type = 'checkbox'; available.name = 'available';
  availableLabel.append(available, document.createTextNode('Available sources only'));
  toolbar.append(searchLabel, availableLabel);
  const count = element('p', 'project-results'); count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite');
  const halls = element('div', 'project-halls');
  const reset = element('button', 's2u-action s2u-action--tertiary project-reset', 'Clear filters'); reset.type = 'button';
  const params = new URLSearchParams(location.search);
  const initialCategory = params.get('category') ?? 'All materials';
  const filter: ArchiveFilter = {
    category: (archiveCategories as readonly string[]).includes(initialCategory) ? initialCategory : 'All materials',
    query: params.get('q') ?? '', availableOnly: params.get('available') === '1',
  };
  search.value = filter.query; available.checked = filter.availableOnly;
  const update = (writeUrl = true): void => {
    const selected = filterArchive(items, filter);
    count.textContent = `${selected.length} ${selected.length === 1 ? 'item' : 'items'} · ${selected.filter((item) => item.status === 'Available').length} on display`;
    // The halls holding a matching item, in the categories' order; none, the empty state.
    const byHall = archiveCategories.map((c) => [c, selected.filter((i) => i.category === c)] as const).filter(([, list]) => list.length);
    halls.replaceChildren(...(byHall.length ? byHall.map(([c, list]) => hallSection(c, list, items))
      : [emptyState('No matching items', 'Try a different search or clear the filters to see the whole collection.')]));
    reset.hidden = !filter.query && !filter.availableOnly && filter.category === 'All materials';
    if (writeUrl) {
      const url = new URL(location.href);
      for (const key of ['q', 'category', 'available']) url.searchParams.delete(key);
      if (filter.query) url.searchParams.set('q', filter.query);
      if (filter.category !== 'All materials') url.searchParams.set('category', filter.category);
      if (filter.availableOnly) url.searchParams.set('available', '1');
      history.replaceState(null, '', url);
    }
  };
  const categories = hallTiles(items, filter.category, (value) => { filter.category = value; update(); });
  search.addEventListener('input', () => { filter.query = search.value; update(); });
  available.addEventListener('change', () => { filter.availableOnly = available.checked; update(); });
  reset.addEventListener('click', () => {
    filter.query = ''; filter.availableOnly = false; filter.category = 'All materials';
    search.value = ''; available.checked = false;
    for (const [index, button] of Array.from(categories.querySelectorAll('button')).entries()) button.setAttribute('aria-pressed', String(index === 0));
    search.focus(); update();
  });
  const results = element('div', 'project-results-row'); results.append(count, reset);
  const browse = element('h2', 's2u-visually-hidden', 'Browse the collection');
  main.append(browse, categories, toolbar, results, halls);
  // The closing call, a ds callout: what the archive still looks for, and where research starts.
  const collecting = element('aside', 'project-collecting s2u-panel s2u-panel--callout'); collecting.id = 'contribute';
  const intro = element('div'); intro.append(element('p', 'project-kicker', 'Still collecting'), element('h2', '', 'Keep the context, too.'),
    element('p', '', 'A magazine issue, a capture date, a creator’s name. These details help preserve the history alongside the material. Items stamped “Wanted” are spaces in the collection, not verified artifacts.'));
  const sources = element('div', 'project-preservation'); sources.append(element('h3', '', 'Preservation resources'), ...preservationLinks.map(sourceLink), element('p', 'project-fine', 'Research destinations, separate from the catalogued items above.'));
  const collectingBody = element('div', 's2u-panel__body project-collecting-body'); collectingBody.append(intro, sources);
  collecting.append(collectingBody); main.append(collecting); update(false);
  return shell;
}
