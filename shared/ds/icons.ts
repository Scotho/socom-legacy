/**
 * The authored marks of the public site's design guide (adopted at 1.2.0; MU.R21), drawn by the project (the teaser's
 * own, teaser@185764c3:socomlegacy/packages/viewer/src/teaser/icons.ts; licence: the repository's own GPL-3.0, no third
 * party), and 1.3.0's authored `server` mark. Ten marks on a 24-unit grid, inline so they take the text's colour (`currentColor`) and need no request.
 * Each is decorative (`aria-hidden`, not focusable): the control's own words name it (the guide's rule, and the ds's).
 * The status mark is the public status page's nav (PST-1): a pulse line and a lamp, still `currentColor`.
 * The size is the ds scale (16, 20, 24, 40) through the existing `s2u-icon` classes, never a width attribute.
 * The four brand marks (YouTube, Discord, X, GitHub) are NOT here: third-party logos and the owner's Q2 (the community
 * links) -- see README, "From the public site". The launcher's one Discord link (LATER 291, MU.R22's exception) is the
 * console's own mark, not this set. No path holds four dotted numbers in a row: the leak check reads them
 * as an address.
 */
const G = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

/** the mark bodies, each on a 24x24 viewBox */
export const ICONS = {
  play: '<path fill="currentColor" stroke="none" d="M7 3.5 21 12 7 20.5z"/>',
  news: `<g ${G}><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h8M8 11h8M8 15h3M8 18h3M15 15h1v3h-1z"/></g>`,
  roadmap: `<g ${G}><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16"/></g>`,
  journey: `<g ${G}><circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><path d="M8 5h7a4 4 0 0 1 0 8H9a3 3 0 0 0 0 6h7"/></g>`,
  archive: `<g ${G}><path d="M4 8h16v13H4zM3 3h18v5H3zM9 12h6"/></g>`,
  playtest: '<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/><circle cx="12" cy="12" r="1"/></g>',
  external: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  back: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M15 5l-7 7 7 7"/>',
  /* 1.3.0 (MU.R24; README, "From the live site"): authored for the Server tile and the reading pages' nav, which the
     live site has no mark for -- two rack units, each with its lamp and a vent, in the guide marks' 1.5 stroke */
  server: `<g ${G}><rect x="4" y="4" width="16" height="7" rx="1"/><rect x="4" y="13" width="16" height="7" rx="1"/><path d="M8 7.5h.01M8 16.5h.01M12 7.5h4M12 16.5h4"/></g>`,
  status: `<g ${G}><path d="M3 12h3l2-5 4 10 2-5h3"/><circle cx="19" cy="7" r="2"/></g>`,
} as const;

export type IconName = keyof typeof ICONS;
/** the ds icon scale (tokens `--s2u-icon-16` to `-40`; the guide's 18 and 28 are not adopted) */
export const ICON_SIZES = [16, 20, 24, 40] as const;
export type IconSize = (typeof ICON_SIZES)[number];

/** an inline, decorative `<svg>`; 20 (the default) is the plain `s2u-icon` class, the others add `s2u-icon--N` */
export function icon(name: IconName, size: IconSize = 20): string {
  if (!ICON_SIZES.includes(size)) throw new Error(`icon size ${size} is not on the ds scale ${ICON_SIZES.join(', ')}`);
  const cls = size === 20 ? 's2u-icon' : `s2u-icon s2u-icon--${size}`;
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
}
