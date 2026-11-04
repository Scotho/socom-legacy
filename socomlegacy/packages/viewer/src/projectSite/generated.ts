import data from '../site/siteData.json';
import { badge, element, emptyState, sectionHeading } from './components';

/**
 * The repository's own facts, as `socomlegacy/tools/sitePages.ts` wrote them (`npx tsx tools/sitePages.ts` from `socomlegacy/`; MU.R7):
 * the pages render this and restate none of it by hand. Every string is rendered with `textContent`.
 */
/** `source`: the document the state was read from (SPRINTS, a plan's Log entry, or HANDOFF section 2; TS-4). */
export interface GeneratedSprint { number: number; name: string; seat: string; tasks: number; points: number; after: string; online: boolean; state: string; status: string; source: string }
export interface GeneratedItem { title: string; state: string; summary: string }
export interface GeneratedPlan { id: string; date: string; title: string }
export interface GeneratedIssue { number: number; title: string; labels: string[]; milestone: string }
/** The journey page's figures (`tools/sitePages.ts` `JourneyBlock`, TS-2): each with its source; `null` / empty when unread. */
export interface GeneratedJourney {
  start: { date: string; source: string } | null;
  maps: { count: number; source: string } | null;
  checks: { passed: number; skipped: number; head: string; source: string } | null;
  /** `scoring`: the note's own words for how it was scored; `exact`: false where the note says it is not pixel-exact (TS-4). */
  scores: { screen: string; score: number; reference: string; scoring: string; exact: boolean; source: string }[];
  /** Each chapter's dates, from its plans (TS-4; `tools/sitePages.ts` `JOURNEY_CHAPTERS`). */
  chapters: { id: string; from: string; to: string; source: string }[];
  /** Where it stands now (TS-4): the running and scheduled sprints' names, and work in development (`IN_DEVELOPMENT`). */
  now: { inProgress: string[]; next: string[]; inDevelopment: { label: string; source: string }[]; source: string };
}
/** A plan whose Log records its landing or its close (TS-4; `tools/sitePages.ts` `buildNews`). */
export interface GeneratedNews { date: string; id: string; title: string; summary: string; state: string; source: string }
/** A roadmap milestone's state, from its sprints and plans (TS-4; `ROADMAP_MILESTONES`). */
export interface GeneratedMilestone { id: string; status: string; source: string }
export interface GeneratedData {
  commit: string; sprints: GeneratedSprint[]; inFlight: GeneratedItem[]; plans: GeneratedPlan[];
  issues: { included: boolean; open: GeneratedIssue[]; openCount: number; closedCount: number };
  journey: GeneratedJourney;
  news: GeneratedNews[]; milestones: GeneratedMilestone[];
}
export const siteData: GeneratedData = data as GeneratedData;

const tone = (state: string): string => (state === 'closed' || state === 'landed' ? 'active' : 'neutral');
const ITEM_LABEL: Record<string, string> = { 'in-flight': 'In flight', landed: 'Landed', owed: 'Owed', parked: 'Parked', closed: 'Closed', open: 'In progress' };
const STATE_LABEL: Record<string, string> = { closed: 'Closed', parked: 'Parked', scheduled: 'Scheduled', open: 'In progress', owed: 'Close owed', unstated: 'No status recorded', draft: 'Draft' };
export const stateLabel = (state: string): string => STATE_LABEL[state] ?? state;

/** The sprint list: number, name, state, size. `onlineOnly` keeps the online track (the server page's). */
export function sprintTable(sprints: readonly GeneratedSprint[], caption: string): HTMLElement {
  const table = element('table', 'project-table');
  table.append(element('caption', '', caption));
  const head = element('tr');
  for (const h of ['Sprint', 'What', 'State', 'Tasks', 'Points']) head.append(element('th', '', h));
  head.querySelectorAll('th').forEach((th) => th.setAttribute('scope', 'col'));
  table.append(element('thead')); table.tHead!.append(head);
  const body = element('tbody');
  for (const s of sprints) {
    const row = element('tr'); row.id = `sprint-${s.number}`;
    const state = element('td'); const b = badge(stateLabel(s.state), tone(s.state)); b.title = s.status; state.append(b);
    row.append(element('td', '', String(s.number)), element('td', '', s.name), state, element('td', '', String(s.tasks)), element('td', '', String(s.points)));
    body.append(row);
  }
  table.append(body);
  const wrap = element('div', 'project-table-wrap'); wrap.append(table);
  return wrap;
}

export function inFlightList(items: readonly GeneratedItem[]): HTMLElement {
  const list = element('ul', 'project-topics');
  for (const item of items) {
    const li = element('li');
    // HANDOFF section 2's four states (`tools/sitePages.ts` `HandoffState`, MU-8a); an older file's closed / open as before.
    const meta = element('div', 'project-meta'); meta.append(badge(ITEM_LABEL[item.state] ?? 'In progress', tone(item.state)));
    li.append(meta, element('h3', '', item.title));
    if (item.summary) li.append(element('p', '', item.summary));
    list.append(li);
  }
  return list;
}

/** The open issues, or the sentence that the build did not include them. */
export function issuesSection(issues: GeneratedData['issues']): HTMLElement {
  const section = element('section', 'project-generated-section');
  section.append(sectionHeading('Known issues', issues.included ? `${issues.openCount} open, ${issues.closedCount} closed` : undefined));
  if (!issues.included) { section.append(element('p', 'project-fine', 'The issue list is not included in this build.')); return section; }
  if (!issues.open.length) { section.append(emptyState('No open issues', 'The issue snapshot this page was built from lists none open.')); return section; }
  const list = element('ul', 'project-topics');
  for (const issue of issues.open) {
    const li = element('li'); li.append(element('h3', '', `#${issue.number} ${issue.title}`));
    const meta = element('div', 'project-meta');
    if (issue.milestone) meta.append(badge(issue.milestone));
    for (const label of issue.labels) meta.append(badge(label));
    li.append(meta); list.append(li);
  }
  section.append(list);
  return section;
}
