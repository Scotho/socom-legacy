import { badge, element, pageShell, sectionHeading } from './components';
import { issuesSection, siteData, sprintTable, type GeneratedData, type GeneratedMilestone } from './generated';
import { roadmapPhases } from './content/roadmap';
import type { RoadmapPhase } from './content/types';

export function roadmapPhase(phase: RoadmapPhase, states: readonly GeneratedMilestone[] = []): HTMLElement {
  const section = element('section', 'project-phase'); section.id = phase.id;
  section.dataset['current'] = String(phase.status === 'Current focus');
  const intro = element('header', 'project-phase-intro');
  intro.append(element('span', 'project-phase-number', phase.number), badge(phase.status, phase.status === 'Current focus' ? 'active' : 'neutral'),
    element('h2', '', phase.title), element('p', '', phase.summary));
  const body = element('div', 'project-phase-body');
  const list = element('ul', 'project-milestones');
  for (const milestone of phase.milestones) {
    const item = element('li');
    const heading = element('div', 'project-milestone-heading');
    // TS-4: a milestone with an id shows the generator's state (from its sprints and plans), never a typed one.
    const generated = milestone.id ? states.find((s) => s.id === milestone.id) : undefined;
    const status = generated?.status ?? milestone.status;
    heading.append(element('h3', '', milestone.title));
    if (status) heading.append(badge(status, status === 'In progress' || status === 'Complete' ? 'active' : 'neutral'));
    item.append(heading, element('p', '', milestone.description));
    if (generated) item.append(element('p', 'project-fine', `State read from ${generated.source}`));
    list.append(item);
  }
  const gate = element('div', 'project-phase-gate'); gate.append(element('h3', '', 'Ready to move on when'), element('p', '', phase.gate));
  body.append(list, gate); section.append(intro, body);
  return section;
}

export function roadmapPage(phases: readonly RoadmapPhase[] = roadmapPhases, data: GeneratedData = siteData): HTMLElement {
  const shell = pageShell('roadmap', 'The road to release', 'Parity first. Then possibilities.', 'Recreate the original experience, prove it in play, and build on that foundation.');
  const main = shell.querySelector('main')!;
  // The note is a ds callout; the phases are panels, the current one ruled in gold (the teaser's phase screenshots are not taken: MU.R22).
  const note = element('div', 'project-roadmap-note s2u-panel s2u-panel--callout');
  note.append(element('p', 's2u-panel__body', 'A direction, not a deadline. These phases describe the release goals; there are no announced release dates.'));
  const list = element('div', 'project-phases'); list.append(...phases.map((p) => roadmapPhase(p, data.milestones)));
  main.append(note, list);
  // Generated from the repository (tools/sitePages.ts): the sprint list's own numbers and states, never restated by hand.
  const sprints = element('section', 'project-generated-section'); sprints.id = 'sprints';
  sprints.append(sectionHeading('The sprint list', 'Read from the repository’s roadmap; states are the roadmap’s own words, not dates.'),
    sprintTable(data.sprints, 'Sprints, in number order'));
  main.append(sprints, issuesSection(data.issues)); return shell;
}
