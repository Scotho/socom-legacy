import type { ArchiveItem, SourceLink } from './types';

/** External references only. Unverified ads/site/teaser material stays visibly Seeking. */
export const archiveItems: readonly ArchiveItem[] = [
  {
    id: 'us-manual', title: 'The SOCOM II instruction manual', category: 'Manuals & print',
    status: 'Available', period: 'PlayStation 2 era', format: 'Scanned manual',
    description: 'The original guide to controls, the headset, online setup, multiplayer modes and the briefing room.',
    credit: 'Sony Computer Entertainment America',
    provenance: 'A third-party scan hosted by ManualMachine. The original publisher and the preservation host are credited separately.',
    source: { label: 'Read the manual', href: 'https://manualmachine.com/gamesps2/socomiiusnavyseals/1116603-user-manual/' },
    checked: '2026-10-04', tags: ['instructions', 'headset', 'online', 'PS2', 'Sony'],
  },
  {
    id: 'e3-impressions', title: 'Before release: E3 impressions', category: 'History',
    status: 'Available', period: '15 May 2003', format: 'Contemporary coverage',
    description: 'Jeff Gerstmann’s early look at SOCOM II, written while the game was still on the way. A record of how the sequel was introduced at the time.',
    credit: 'Jeff Gerstmann / GameSpot',
    provenance: 'The original publication. Previewed features describe a prerelease build and may differ from the released game.',
    source: { label: 'Read the preview', href: 'https://www.gamespot.com/articles/socom-ii-us-navy-seals-impressions/1100-6028099/' },
    checked: '2026-10-04', tags: ['E3', 'preview', '2003', 'press'],
  },
  {
    id: 'original-mini-site', title: 'The original SOCOM II mini-site', category: 'Original website',
    status: 'Seeking', period: 'Original web era', format: 'Website / Wayback capture',
    description: 'A place for the original promotional site, its teaser and the small details that made the early web part of the game’s history.',
    credit: 'Original credits to be confirmed',
    provenance: 'Seeking a verified capture and its original URL. No working reconstruction or complete archived site is claimed yet.',
    tags: ['teaser', 'website', 'Flash', 'Wayback', 'Internet Archive'],
  },
  {
    id: 'print-campaign', title: 'Magazine ads & promotional print', category: 'Ads & trailers',
    status: 'Seeking', period: 'Launch era', format: 'Print campaign',
    description: 'Magazine spreads, retail advertisements and other printed pieces from the original campaign.',
    credit: 'Publication and creative credits to be confirmed',
    provenance: 'Seeking scans with the magazine title, issue date and page number so each piece can be placed in context.',
    tags: ['advertising', 'magazine', 'ads', 'print'],
  },
  {
    id: 'trailers', title: 'Teasers & original trailers', category: 'Ads & trailers',
    status: 'Seeking', period: 'Before release', format: 'Video',
    description: 'Original trailers and teaser footage, with release context and credits kept alongside each recording.',
    credit: 'Original credits to be confirmed',
    provenance: 'Seeking an attributable original or preservation copy. Reuploads will be identified as reuploads.',
    tags: ['video', 'teaser', 'trailer', 'advertising'],
  },
];

/** Research destinations, kept separate from catalogued artifacts. */
export const preservationLinks: readonly SourceLink[] = [
  { label: 'Internet Archive', href: 'https://archive.org/' },
  { label: 'Wayback Machine', href: 'https://web.archive.org/' },
];
