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

const pages: readonly [PageId, string][] = [['news', 'News'], ['roadmap', 'Roadmap'], ['journey', 'Journey'], ['archive', 'Archive'], ['server', 'Server'], ['status', 'Status']];

/**
 * The shell, in the public site's look (TS-3; teaser@185764c3 `projectSite/components.ts` l.62-100, adapted): the ds emblem
 * in the link home, the six pages' nav as the ds's `s2u-navlinks` (icon + word, the Server mark included; MU.R23), PLAY as the one primary action back to the launcher, the footer with
 * the generated commit. Not taken: the community row (no social links, MU.R22).
 * The shell is the ds reading column (`s2u-reading`). Reading pages deliberately import no viewer/renderer, disc,
 * controller, microphone or match modules.
 */
export function pageShell(page: PageId, title: string, kicker: string, description: string): HTMLElement {
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
    nav.append(item);
  }
  const play = link('', import.meta.env.BASE_URL, 's2u-action s2u-action--primary s2u-action--large project-launcher');
  play.append(dsIcon('play'), element('span', '', 'Play'));
  header.append(home, nav, play);
  const main = element('main', 'project-main'); main.id = 'project-main'; main.tabIndex = -1;
  const hero = element('header', 'project-hero');
  hero.append(element('p', 'project-kicker', kicker), element('h1', '', title), element('p', 'project-lede', description));
  main.append(hero);
  const footer = element('footer', 'project-footer');
  footer.append(element('p', 'project-footer-brand', 'SOCOM II LEGACY'), element('p', '', 'A community project. Preserving the game. Building its future.'),
    element('p', 'project-fine', 'Independent fan project. SOCOM II and original materials belong to their respective creators.'),
    element('p', 'project-fine project-generated', `Project record generated from the repository at commit ${siteData.commit}.`));
  shell.append(link('Skip to content', '#project-main', 's2u-skip'), header, main, footer);
  return shell;
}
