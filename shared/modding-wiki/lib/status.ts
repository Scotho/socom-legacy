// MW.R6's five statuses, in its order (the plan's "current state means honest status"). Every page names one in its
// frontmatter (`status`) with what owns it (`source`); source.config.ts validates both at build and the page route
// draws the badge. socomlegacy/tools/test/moddingWikiStatus.test.ts holds this list equal to the reference generator's.
export const STATUSES = ['Works', 'Test room only', 'Forge, local only', 'Format only', 'Planned'] as const;

export type Status = (typeof STATUSES)[number];

/** One line a status, for the badge's title (the plan's MW.R6 in plain words). */
export const STATUS_MEANING: Record<Status, string> = {
  Works: 'Works in every build.',
  'Test room only': 'Works in the test room only.',
  'Forge, local only': "Works in the Forge's local Play only; the Forge is paused.",
  'Format only': 'The format is checked and stored; nothing in the game applies it.',
  Planned: 'Not built yet.',
};
