import type { RoadmapPhase } from './types';

/**
 * Direction and exit criteria, not release-date promises or estimated completion percentages. The first phase's milestones
 * carry an id and no typed state: each one's state is the generator's (`siteData.json` `milestones`, from the sprints and
 * plans `tools/sitePages.ts` `ROADMAP_MILESTONES` names; TS-4). The later phases' states are directions, not progress.
 */
export const roadmapPhases: readonly RoadmapPhase[] = [
  {
    id: 'parity', number: '01', title: 'Recreate the original', status: 'Current focus',
    summary: 'The first release goal is a faithful SOCOM II multiplayer experience in the browser. The original game is the reference.',
    gate: 'The original multiplayer rules, map behavior and presentation hold up under comparison and playtesting.',
    milestones: [
      { id: 'round-feel', title: 'The feel of a round', description: 'Movement, aiming, weapons, damage, inventory and the rhythm of round-based play.' },
      { id: 'map-rules', title: 'Every map has its rules', description: 'Objectives, bridges, breaches, hostages, extraction routes and the interactions that shape each available retail map.' },
      { id: 'online-flow', title: 'The complete online flow', description: 'Lobbies, teams, match settings, communication, results and reliable state for every player.' },
      { id: 'look-sound-controls', title: 'Look, sound and controls', description: 'Menus, animation, audio and controller behavior, with usable setup and touch controls for mobile layouts.' },
    ],
  },
  {
    id: 'release', number: '02', title: 'Prove it in play', status: 'Next',
    summary: 'Turn the parity work into a dependable release through comparison, complete matches and community testing.',
    gate: 'Release blockers are resolved, supported setups are documented, and repeatable tests back the release.',
    milestones: [
      { title: 'Original-game comparison', status: 'Planned', description: 'Check the details against original behavior, including the less obvious map and gameplay edge cases.' },
      { title: 'Multiplayer and device testing', status: 'Planned', description: 'Exercise full matches, joining and leaving, controllers, microphones and mobile browser layouts.' },
      { title: 'Release readiness', status: 'Planned', description: 'Address stability and performance issues, document known limitations, and publish clear patch notes.' },
    ],
  },
  {
    id: 'beyond', number: '03', title: 'Extend the legacy', status: 'After parity',
    summary: 'Build on a stable original experience. These are directions to explore with the community after parity, not promised features.',
    gate: 'Extensions are clearly identified and preserve an original-style way to play.',
    milestones: [
      { title: 'Quality of life and accessibility', status: 'Exploring', description: 'Consider optional improvements that help more people play comfortably.' },
      { title: 'Community-led additions', status: 'Exploring', description: 'Evaluate new ways to play and community tools once the original foundation is reliable.' },
      { title: 'More to preserve', status: 'Exploring', description: 'Expand the historical collection and revisit additional maps when their source material is available.' },
    ],
  },
];
