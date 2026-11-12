export type PageId = 'news' | 'roadmap' | 'journey' | 'archive' | 'server' | 'status' | 'agent';

export interface SourceLink {
  label: string;
  href: `https://${string}`;
}

export type NewsKind = 'Patch notes' | 'Development' | 'Announcement';
export interface NewsEntry {
  id: string;
  title: string;
  /** Publication date, YYYY-MM-DD. Add only published entries to the public collection. */
  date: string;
  kind: NewsKind;
  version?: string;
  summary: string;
  sections: readonly { title: string; items: readonly string[] }[];
  links?: readonly SourceLink[];
}

export type MilestoneStatus = 'In progress' | 'Planned' | 'Exploring' | 'Complete';
export interface RoadmapPhase {
  id: string;
  number: string;
  title: string;
  status: 'Current focus' | 'Next' | 'After parity';
  summary: string;
  gate: string;
  /**
   * A milestone with an `id` takes its state from the generator (`siteData.json` `milestones`, from the sprints and plans it
   * is made of; TS-4) and carries no typed `status`; one without an id is a direction ("Planned", "Exploring").
   */
  milestones: readonly { id?: string; title: string; description: string; status?: MilestoneStatus }[];
}

export const archiveCategories = ['Manuals & print', 'Ads & trailers', 'Original website', 'History'] as const;
export type ArchiveCategory = typeof archiveCategories[number];
interface ArchiveRecord {
  id: string;
  title: string;
  category: ArchiveCategory;
  description: string;
  period: string;
  format: string;
  /** Original author/publisher, separately from the host preserving the item. */
  credit: string;
  provenance: string;
  tags: readonly string[];
}
export type ArchiveItem = ArchiveRecord & (
  | { status: 'Available'; source: SourceLink; checked: string }
  | { status: 'Seeking'; source?: never; checked?: never }
);

/** A headline figure on the journey page: its value as shown, what it counts, and where the repository states it. */
export interface JourneyStat { value: string; label: string; source: string }

/**
 * A chapter of the project's story (`content/journey.ts`): editorial, hand-written; no figure and no date in it (MU.R7). Its
 * period is the generator's (`journey.chapters`, by `id`, from the plans `tools/sitePages.ts` `JOURNEY_CHAPTERS` names; TS-4).
 */
export interface JourneyChapter {
  id: string;
  number: string;
  title: string;
  summary: string;
  highlights: readonly string[];
}
