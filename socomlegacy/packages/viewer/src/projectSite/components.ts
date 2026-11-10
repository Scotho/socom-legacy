import type { PageId, SourceLink } from './content/types';
import siteData from '../site/siteData.json';
// The ds's authored marks (shared/ds 1.2.0, README "Icons and the emblem"; MU.R21): constants of the design system, never
// content. They are the only markup these pages parse; every content string still goes through `textContent`.
import { icon, type IconName, type IconSize } from '../../../../../shared/ds/icons';
import emblemSvg from '../../../../../shared/ds/emblem.svg?raw';

/** A ds mark as an element: decorative (`aria-hidden`), sized on the ds scale. */
export function dsIcon(name: IconName, size: IconSize = 20): SVGElement {
  return markup(icon(name, size));
}

/** The ds emblem, inline (it takes no request and is not an image file): its own `role="img"` and accessible name. */
export function emblem(): SVGElement {
  const svg = markup(emblemSvg);
  svg.classList.add('project-brand-mark');
  svg.setAttribute('aria-label', 'SOCOM II Legacy'); // MU.R24: the live site's name; the ds file's own label predates it
  return svg;
}

function markup(svg: string): SVGElement {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  return document.importNode(doc.documentElement, true) as unknown as SVGElement;
}

export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function link(label: string, href: string, className = ''): HTMLAnchorElement {
  const node = element('a', className, label);
  node.href = href;
  return node;
}

/** An outside source: the ds tertiary action, opening in a new tab, the ds "external" mark after its words. */
export function sourceLink(source: SourceLink): HTMLAnchorElement {
  const node = link(source.label, source.href, 's2u-action s2u-action--tertiary project-source');
  node.target = '_blank'; node.rel = 'noopener noreferrer';
  node.append(dsIcon('external', 16));
  node.setAttribute('aria-label', `${source.label} (opens in a new tab)`);
  return node;
}

export function badge(text: string, tone = 'neutral'): HTMLElement {
  const node = element('span', 'project-badge', text);
  node.dataset['tone'] = tone;
  return node;
}

export function emptyState(title: string, description: string): HTMLElement {
  const section = element('section', 'project-empty');
  section.append(element('span', 'project-empty-mark', '—'), element('h2', '', title), element('p', '', description));
  section.firstElementChild!.setAttribute('aria-hidden', 'true');
  return section;
}

export function sectionHeading(title: string, note?: string): HTMLElement {
  const header = element('header', 'project-section-heading');
  header.append(element('h2', '', title));
  if (note) header.append(element('p', '', note));
  return header;
}

export function filterButtons(label: string, options: readonly string[], selected: string, change: (value: string) => void): HTMLElement {
  const group = element('div', 'project-filters');
  group.setAttribute('role', 'group'); group.setAttribute('aria-label', label);
  for (const option of options) {
    const button = element('button', 's2u-action project-filter', option);
    button.type = 'button'; button.setAttribute('aria-pressed', String(option === selected));
    button.addEventListener('click', () => {
      for (const other of group.querySelectorAll('button')) other.setAttribute('aria-pressed', String(other === button));
      change(option);
    });
    group.append(button);
  }
  return group;
}

/**
 * LCM-16 (the LIVE cards plan, LCM.R18 (e): "Leaderboard joins the project nav with an additive ds mark"): the nav's pages
 * -- the six project pages and the leaderboard, a stats page with its own document (`leaderboard/index.html`), after Server. FP-14's
 * /agent is a project page outside the nav (no ds mark), so the nav's pages exclude it.
 */
export type NavPage = PageId | 'leaderboard';
const pages: readonly [Exclude<NavPage, 'agent'>, string][] = [['news', 'News'], ['roadmap', 'Roadmap'], ['journey', 'Journey'], ['archive', 'Archive'], ['server', 'Server'], ['leaderboard', 'Leaderboard'], ['status', 'Status']];

/** One step of a breadcrumb: a link, or (the last) the page itself. */
export interface Crumb { readonly label: string; readonly href?: string }

/**
 * LCM-16: the shell's options, additive. `crumbs` puts a breadcrumb where the kicker sits (LCM.R11: "a breadcrumb, a page
 * title and lede"); `section` lights a nav item for a page that is not one of them (the match and player pages sit under
 * the leaderboard): `aria-current="location"`, never "page", so assistive tech is not told it is the leaderboard.
 */
export interface ShellOptions { readonly crumbs?: readonly Crumb[]; readonly section?: NavPage }

/**
 * LCM-16 (LCM.R11): the breadcrumb -- a nav landmark of an ordered list, the separators drawn by CSS (never read aloud),
 * the last step the page (`aria-current="page"`). Each link takes the ds tap size.
 */
export function breadcrumb(items: readonly Crumb[]): HTMLElement {
  const nav = element('nav', 'project-crumbs'); nav.setAttribute('aria-label', 'Breadcrumb');
  const list = element('ol');
  items.forEach((item, i) => {
    const li = element('li');
    const last = i === items.length - 1;
    const node = item.href !== undefined ? link(item.label, item.href, 'project-tap') : element('span', 'project-crumb-here', item.label);
    if (last) node.setAttribute('aria-current', 'page');
    li.append(node);
    list.append(li);
  });
  nav.append(list);
  return nav;
}

/** LCM-16: a page's loading line -- a polite status region, so the wait is said once and the answer replaces it. */
export function loadingLine(text: string): HTMLElement {
  const line = element('p', 'project-state', text);
  line.setAttribute('role', 'status');
  return line;
}

/**
 * LCM-16: a failure and its retry, one wording and one control on every stats page ("<what> did not load. Try again in a
 * minute." with "Try again"): a page's failure takes the ds action, a panel's the tertiary one.
 */
export function failure(message: string, retry: () => void, scope: 'page' | 'panel' = 'page'): HTMLElement {
  const box = element('div', `project-failure project-failure--${scope}`);
  const button = element('button', scope === 'page' ? 's2u-action' : 's2u-action s2u-action--tertiary', 'Try again');
  button.type = 'button';
  button.addEventListener('click', retry);
  box.append(element('p', '', message), button);
  return box;
}

/** LCM-16: a list of bars (a label, its count, a meter drawn and not read) -- the match page's kills by weapon, the player page's panels. */
export function barList(rows: readonly { label: string; n: number; text?: string }[], of?: number): HTMLElement {
  const list = element('ul', 'project-bars');
  // `of`: the whole a share is of (LCM-20 review: a share's bar measures its share); counts scale to the largest row
  const most = Math.max(1, of ?? Math.max(0, ...rows.map((r) => r.n)));
  for (const r of rows) {
    const li = element('li', 'project-bar');
    const meter = element('span', 'project-bar-meter');
    meter.setAttribute('aria-hidden', 'true');
    meter.style.setProperty('--project-bar-w', `${Math.round((100 * r.n) / most)}%`);
    li.append(element('span', 'project-bar-label', r.label), document.createTextNode(' '), element('span', 'project-bar-value', r.text ?? String(r.n)), meter);
    list.append(li);
  }
  return list;
}

/** LCM-16: a ds panel (`.s2u-panel`): its head, a heading at `level` in the panel-heading type, and its body. */
export function dsPanel(title: string, className: string, level: 'h2' | 'h3', ...content: Node[]): HTMLElement {
  const box = element('section', `s2u-panel ${className}`);
  const body = element('div', 's2u-panel__body');
  body.append(...content);
  box.append(element(level, 's2u-panel__head', title), body);
  return box;
}

/** LCM-16: a figure -- its value, then its label (the stylesheet may lift the label above), and a note in a readable colour. */
export function figure(value: string, label: string, note?: string): HTMLElement {
  const box = element('div', 'project-figure');
  box.append(element('span', 'project-figure-value', value), document.createTextNode(' '), element('span', 'project-figure-label', label));
  if (note) box.append(element('span', 'project-figure-note', note));
  return box;
}

/** LCM-16: the stats pages' one time zone, the Eastern time the cards print ("<time> ET", the LCM plan's card copy). */
export const SITE_TIME_ZONE_ADAPTATION = 'America/New_York' as const;

/**
 * LCM-16: the stats pages' one date and time format -- "Nov 8, 2026, 8:41 PM ET" (`date-time-year`), "Nov 8, 8:41 PM ET"
 * (`date-time`), "8:41 PM ET" (`time`); en-US, Eastern.
 */
export function easternTime(ms: number, form: 'date-time-year' | 'date-time' | 'time'): string {
  const parts: Intl.DateTimeFormatOptions = form === 'time' ? { hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', ...(form === 'date-time-year' ? { year: 'numeric' } : {}), hour: 'numeric', minute: '2-digit' };
  return `${new Intl.DateTimeFormat('en-US', { ...parts, timeZone: SITE_TIME_ZONE_ADAPTATION }).format(ms)} ET`;
}

/** LCM-16: the house title form, "<page> · SOCOM II Legacy" (as the reading pages' documents and central's heads). */
export function siteTitle(page: string): string {
  return `${page} · SOCOM II Legacy`;
}

/**
 * The shell, in the public site's look (TS-3; teaser@185764c3 `projectSite/components.ts` l.62-100, adapted): the ds emblem
 * in the link home, the six pages' nav as the ds's `s2u-navlinks` (icon + word, the Server mark included; MU.R23), PLAY as the one primary action back to the launcher, the footer with
 * the generated commit. Not taken: the community row (no social links, MU.R22).
 * The shell is the ds reading column (`s2u-reading`). Reading pages deliberately import no viewer/renderer, disc,
 * controller, microphone or match modules. LCM-16: the nav gains Leaderboard (`NavPage`); `page` is null for a page
 * outside the nav (`options.section` then lights its section), and `options.crumbs` takes the kicker's place.
 */
export function pageShell(page: NavPage | null, title: string, kicker: string, description: string, options: ShellOptions = {}): HTMLElement {
  const shell = element('div', 'project-shell s2u-reading');
  const header = element('header', 'project-header');
  const home = link('', import.meta.env.BASE_URL, 'project-brand project-tap');
  home.setAttribute('aria-label', 'SOCOM II Legacy launcher');
  home.append(emblem(), element('span', 'project-brand-word', 'SOCOM II LEGACY'));
  const nav = element('nav', 'project-nav s2u-navlinks'); nav.setAttribute('aria-label', 'Project');
  for (const [id, name] of pages) {
    const item = link('', `${import.meta.env.BASE_URL}${id}`, 's2u-navlinks__link');
    item.append(dsIcon(id), element('span', '', name));
    if (id === page) item.setAttribute('aria-current', 'page');
    else if (page === null && id === options.section) item.setAttribute('aria-current', 'location');
    nav.append(item);
  }
  const play = link('', import.meta.env.BASE_URL, 's2u-action s2u-action--primary s2u-action--large project-launcher');
  play.append(dsIcon('play'), element('span', '', 'Play'));
  header.append(home, nav, play);
  const main = element('main', 'project-main'); main.id = 'project-main'; main.tabIndex = -1;
  const hero = element('header', 'project-hero');
  hero.append(options.crumbs ? breadcrumb(options.crumbs) : element('p', 'project-kicker', kicker), element('h1', '', title), element('p', 'project-lede', description));
  main.append(hero);
  const footer = element('footer', 'project-footer');
  footer.append(element('p', 'project-footer-brand', 'SOCOM II LEGACY'), element('p', '', 'A community project. Preserving the game. Building its future.'),
    element('p', 'project-fine', 'Independent fan project. SOCOM II and original materials belong to their respective creators.'),
    element('p', 'project-fine project-generated', `Project record generated from the repository at commit ${siteData.commit}.`));
  shell.append(link('Skip to content', '#project-main', 's2u-skip'), header, main, footer);
  return shell;
}
