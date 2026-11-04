import { element, pageShell, sectionHeading } from './components';
import { journeyChapters, journeyWorkflow } from './content/journey';
import type { JourneyChapter, JourneyStat } from './content/types';
import { siteData, type GeneratedJourney } from './generated';

/**
 * The journey page (TS-2; MU.R7, MU.R21, MU.R22): the teaser's public page (teaser@185764c3 `projectSite/journeyPage.ts`)
 * in this repository's conventions -- the same shell, nav and generated-commit footer. The chapters are editorial
 * (`content/journey.ts`); every figure is the generator's (`siteData.json`'s `journey` block, each with its source), and a
 * figure the generator left out is not shown. No screenshot (MU.R22), no outside link, every string through `textContent`.
 */

/** Days of development so far, counting the first day; worked out when the page is read, from the generated start. */
export function developmentDays(now: Date, start: string): number {
  const from = Date.parse(`${start}T00:00:00Z`);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(1, Math.floor((today - from) / 86400000) + 1);
}

/** A chapter's period as players read it, from the generator's dates (TS-4): "Sep 20 – 28", "Sep 28 – Oct 1", "Oct 4". */
export function chapterPeriod(from: string, to: string): string {
  const parts = (d: string): [string, number] => {
    const date = new Date(`${d}T00:00:00Z`);
    return [new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(date), date.getUTCDate()];
  };
  const [m1, d1] = parts(from);
  const [m2, d2] = parts(to);
  if (from === to) return `${m1} ${d1}`;
  return m1 === m2 ? `${m1} ${d1} – ${d2}` : `${m1} ${d1} – ${m2} ${d2}`;
}

/** The headline figures, in order: days, maps, tests passed, then each capture score. Only what the generator holds. */
export function journeyStats(data: GeneratedJourney, now: Date = new Date()): JourneyStat[] {
  const out: JourneyStat[] = [];
  if (data.start) {
    const days = developmentDays(now, data.start.date);
    out.push({ value: `${days} ${days === 1 ? 'day' : 'days'}`, label: 'of development so far, counted from the first plan', source: data.start.source });
  }
  if (data.maps) out.push({ value: String(data.maps.count), label: 'multiplayer maps, read from your disc', source: data.maps.source });
  if (data.checks) {
    out.push({ value: data.checks.passed.toLocaleString('en-US'), label: 'automated tests passed in the last full run of the project’s checks',
      source: `${data.checks.source}, at ${data.checks.head}` });
  }
  for (const s of data.scores) {
    // Research 144 §7: the frame is scored after the 4:3 correction, and the note says it is not pixel-exact (TS-2 review).
    const how = [s.scoring, s.exact ? '' : 'scored, not pixel-exact'].filter(Boolean).join(' -- ');
    out.push({ value: String(s.score), label: `the ${s.screen} screen’s score out of 100 against ${s.reference}${how ? `, ${how}` : ''}`, source: s.source });
  }
  return out;
}

/**
 * A figure's source as a reader sees it (the TS-3 review; MU.R19 the least text): each `;` part shortened -- a research note
 * to "research N" with its section, a plan to "plan of <date>", a document to its name, a test file to "<name> test";
 * anything else as written. Rendering only: the full source stays in the element's title.
 */
export function sourceLabel(source: string): string {
  return source.split(/;\s*/).map((part) => {
    const research = /^docs\/research\/(\d+)-[^ ,;]*\.md(.*)$/.exec(part);
    if (research) return `research ${Number(research[1])}${research[2]!.replace(/^,/, '')}`;
    const plan = /^docs\/plans\/(\d{4}-\d{2}-\d{2})-[^ ,;]*\.md/.exec(part);
    if (plan) return `plan of ${plan[1]}`;
    const test = /^(?:[\w.-]+\/)*([\w.-]+)\.test\.ts$/.exec(part);
    if (test) return `${test[1]} test`;
    const doc = /^docs\/(?:[\w-]+\/)*([\w-]+)\.md\b/.exec(part);
    if (doc) return doc[1]!;
    return part;
  }).join('; ');
}

function stats(list: readonly JourneyStat[]): HTMLElement {
  const dl = element('dl', 'project-journey-stats');
  for (const s of list) {
    const item = element('div', 'project-journey-stat');
    const source = element('dd', 'project-journey-source', `Source: ${sourceLabel(s.source)}`); source.title = s.source;
    item.append(element('dt', '', s.label), element('dd', 'project-journey-value', s.value), source);
    dl.append(item);
  }
  return dl;
}

export function journeyChapter(c: JourneyChapter, period?: { from: string; to: string }): HTMLElement {
  const section = element('section', 'project-chapter'); section.id = c.id;
  section.setAttribute('aria-labelledby', `${c.id}-title`);
  const head = element('header', 'project-chapter-head');
  const title = element('h2', '', c.title); title.id = `${c.id}-title`;
  head.append(element('span', 'project-chapter-number', c.number));
  // The dates are the generator's (`journey.chapters`, from the chapter's plans); a chapter without them shows none.
  if (period) head.append(element('p', 'project-chapter-period', chapterPeriod(period.from, period.to)));
  head.append(title);
  const body = element('div', 'project-chapter-body');
  body.append(element('p', 'project-chapter-summary', c.summary));
  if (c.highlights.length) {
    const ul = element('ul', 'project-chapter-highlights');
    for (const h of c.highlights) ul.append(element('li', '', h));
    body.append(ul);
  }
  section.append(head, body);
  return section;
}

/** Where it stands now (TS-4): the generator's `journey.now`, never a chapter's typed claim; left out when it holds nothing. */
function nowSection(now: GeneratedJourney['now']): HTMLElement | null {
  const lines: string[] = [];
  if (now.inProgress.length) lines.push(`In progress: ${now.inProgress.join('; ')}`);
  if (now.next.length) lines.push(`Next on the roadmap: ${now.next.join('; ')}`);
  for (const d of now.inDevelopment) lines.push(`In development: ${d.label}`);
  if (!lines.length) return null;
  const section = element('section', 'project-generated-section'); section.id = 'now';
  const list = element('ul', 'project-chapter-highlights');
  for (const line of lines) list.append(element('li', '', line));
  const sources = [now.source, ...now.inDevelopment.map((d) => d.source)].filter(Boolean).join('; ');
  section.append(sectionHeading('Where it stands now', 'Read from the project’s roadmap and plans when these pages are generated'), list,
    element('p', 'project-fine', `Source: ${sources}`));
  return section;
}

/** How it is built: the golden rule, the checks, the review, in plain words. */
function workflow(): HTMLElement {
  const section = element('section', 'project-workflow'); section.id = 'how-its-built';
  section.setAttribute('aria-labelledby', 'how-its-built-title');
  const heading = sectionHeading(journeyWorkflow.title, journeyWorkflow.note);
  heading.querySelector('h2')!.id = 'how-its-built-title';
  const list = element('ol', 'project-workflow-points');
  for (const p of journeyWorkflow.points) {
    const li = element('li');
    li.append(element('h3', '', p.title), element('p', '', p.text));
    list.append(li);
  }
  section.append(heading, element('p', 'project-workflow-intro', journeyWorkflow.intro), list);
  return section;
}

export function journeyPage(chapters: readonly JourneyChapter[] = journeyChapters, data: GeneratedJourney = siteData.journey, now: Date = new Date()): HTMLElement {
  const shell = pageShell('journey', 'The journey', 'How the browser game got here',
    'From a single map on a web page to SOCOM II’s original menus and online play: the project’s own account of its work.');
  const main = shell.querySelector('main')!;
  const list = element('div', 'project-chapters');
  const periods = new Map(data.chapters.map((p) => [p.id, p]));
  list.append(...chapters.map((c) => journeyChapter(c, periods.get(c.id))));
  const figures = journeyStats(data, now);
  if (figures.length) {
    main.append(stats(figures), element('p', 'project-fine project-journey-note',
      'The figures are read from the project’s own repository when these pages are generated; a figure it cannot back is left out.'));
  }
  main.append(list);
  const standing = nowSection(data.now);
  if (standing) main.append(standing);
  main.append(workflow(), element('p', 'project-fine', 'SOCOM II Legacy’s own page: it describes the project’s work, not the original game.'));
  return shell;
}
