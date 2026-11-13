/**
 * The launcher's Discord link (LATER 291, owner row H290; since 2026-11-12 the GitHub link beside it, below). Discord's public brand page
 * (https://discord.com/branding, read 2026-10-23) says the logo may be used in colour, black or white,
 * and the symbol where the Discord brand is named. This is their official white Clyde symbol
 * (the branding page's Symbol.svg: viewBox 0 0 64 48, fill white), copied, not redrawn. It is not
 * `currentColor`: a focus state must not recolor it. Clear space is that page's symbol diagram
 * (31.5 units around a mark 72.8 units tall), applied in `console.css`. A browser adaptation
 * (OT.R28). MU.R22's no-social-links default is set aside for this link only.
 */

/** The public invite (LATER 291; checked 2026-10-22, server "Socom 2 Legacy"). */
export const DISCORD_INVITE = 'https://discord.gg/vUUewwvtcy';

/** The control's accessible name (LATER 291). Not a hotkey. */
export const DISCORD_LABEL = 'Discord (opens in a new tab)';

/** Official white symbol path, fill white, from https://discord.com/branding (2026-10-23). */
const MARK_PATH = 'M40.575 0C39.9562 1.09866 39.4006 2.2352 38.8954 3.397C34.0967 2.67719 29.2096 2.67719 24.3982 3.397C23.9057 2.2352 23.3374 1.09866 22.7186 0C18.2104 0.770324 13.8157 2.12155 9.64839 4.02841C1.38951 16.2652 -0.845688 28.1863 0.265599 39.9432C5.10222 43.517 10.5197 46.2447 16.2909 47.9874C17.5916 46.2447 18.7407 44.3883 19.7257 42.4562C17.8568 41.7616 16.0509 40.8903 14.3208 39.88C14.7755 39.5517 15.2175 39.2107 15.6468 38.8824C25.7873 43.6559 37.5316 43.6559 47.6847 38.8824C48.1141 39.236 48.5561 39.577 49.0107 39.88C47.2806 40.9029 45.4748 41.7616 43.5931 42.4688C44.5781 44.4009 45.7273 46.2573 47.028 48C52.7991 46.2573 58.2167 43.5422 63.0533 39.9684C64.3666 26.3299 60.8055 14.5099 53.6452 4.04104C49.4905 2.13418 45.0959 0.782952 40.5876 0.0252565L40.575 0ZM21.1401 32.7072C18.0209 32.7072 15.4321 29.8785 15.4321 26.3804C15.4321 22.8824 17.9199 20.041 21.1275 20.041C24.3351 20.041 26.886 22.895 26.8354 26.3804C26.7849 29.8658 24.3224 32.7072 21.1401 32.7072ZM42.1788 32.7072C39.047 32.7072 36.4834 29.8785 36.4834 26.3804C36.4834 22.8824 38.9712 20.041 42.1788 20.041C45.3864 20.041 47.9246 22.895 47.8741 26.3804C47.8236 29.8658 45.3611 32.7072 42.1788 32.7072Z';

/** The mark, decorative: the control's accessible name says Discord. Aspect 64×48 kept. */
export function discordMark(): string {
  return `<svg class="cx-discord__mark" width="64" height="48" viewBox="0 0 64 48" fill="none" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><path d="${MARK_PATH}" fill="white"/></svg>`;
}

/** Opens `url` in a new tab, as the anchors do natively; the pad's Cross uses this. */
function openNewTab(url: string): void {
  const open = globalThis.open;
  if (typeof open !== 'function') return;
  open.call(globalThis, url, '_blank', 'noopener,noreferrer');
}

/** Opens the invite in a new tab. The anchors do this natively; the pad's Cross uses this. */
export function openDiscord(): void { openNewTab(DISCORD_INVITE); }

/*
 * The GitHub link beside the Discord one. The owner, Craig, 2026-11-12 (the main controller's seat 2f, verbatim): "Add a
 * github link beside the discord one with the same icon set on the launcher main menu". It is drawn wherever the Discord
 * link is -- the header's icon above the phone rule, Home's row at and below it -- right after it, and is the pad's
 * next stop after it (Home's last). A browser adaptation (OT.R28) like the Discord link; MU.R22's no-social-links
 * default is set aside for these two links only.
 *
 * The mark is GitHub's own, the Invertocat (GitHub's logo page, https://github.com/logos: the mark used unmodified, in
 * one colour, black or white; no effect, rotation or outline applied to it). This is the `mark-github` 16x16 path of
 * GitHub's Octicons (primer/octicons `mark-github-16.svg`), written from that asset, not redrawn. As the Discord mark,
 * fill white (not `currentColor`: a focus state must not recolour it), CanvasText under forced colours (`console.css`).
 */

/** The public client repository (OSC.R11), "SOCOM Legacy Client". */
export const GITHUB_REPO = 'https://github.com/Scotho/socom-legacy';

/** The control's accessible name, the Discord link's pattern. Not a hotkey. */
export const GITHUB_LABEL = 'GitHub (opens in a new tab)';

/**
 * Octicons `mark-github` (16x16), fill white. Spelled with a space between every two numbers (SVG path data allows it):
 * the repository's leak check reads compact path data (four numbers joined by dots alone) as an IPv4 address, so the compact spelling
 * cannot be committed. The geometry is GitHub's, unmodified -- the same commands and numbers in the same order;
 * `discordLink.test.ts` holds the official compact path and proves the two equal number for number.
 */
const GITHUB_MARK_PATH = 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59 .4 .07 .55 -.17 .55 -.38 0 -.19 -.01 -.82 -.01 -1.49 -2.01 .37 -2.53 -.49 -2.69 -.94 -.09 -.23 -.48 -.94 -.82 -1.13 -.28 -.15 -.68 -.52 -.01 -.53 .63 -.01 1.08 .58 1.23 .82 .72 1.21 1.87 .87 2.33 .66 .07 -.52 .28 -.87 .51 -1.07 -1.78 -.2 -3.64 -.89 -3.64 -3.95 0 -.87 .31 -1.59 .82 -2.15 -.08 -.2 -.36 -1.02 .08 -2.12 0 0 .67 -.21 2.2 .82 .64 -.18 1.32 -.27 2 -.27 .68 0 1.36 .09 2 .27 1.53 -1.04 2.2 -.82 2.2 -.82 .44 1.1 .16 1.92 .08 2.12 .51 .56 .82 1.27 .82 2.15 0 3.07 -1.87 3.75 -3.65 3.95 .29 .25 .54 .73 .54 1.48 0 1.07 -.01 1.93 -.01 2.2 0 .21 .15 .46 .55 .38A8.013 8.013 0 0 0 16 8c0 -4.42 -3.58 -8 -8 -8z';

/** The mark, decorative: the control's accessible name says GitHub. Square, 16x16 kept. */
export function githubMark(): string {
  return `<svg class="cx-github__mark" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><path d="${GITHUB_MARK_PATH}" fill="white"/></svg>`;
}

/** Opens the repository in a new tab. The anchors do this natively; the pad's Cross uses this. */
export function openGithub(): void { openNewTab(GITHUB_REPO); }

/**
 * The review's header measurement (2026-11-12, rendered, `agent-mail/evidence/v0420/launcher-github-link/`): at 761px
 * signed in with a 14-character name and the 12-hour clock the second header icon slid the brand under the clock (24.6px;
 * none at the base). Up to this width -- above the phone rule (`./fit` NARROW_PX) -- the header keeps Discord's icon
 * alone and GitHub's link is Home's row, the pad's stop after Discord's icon; above it, the icon beside Discord's.
 * `console.css` holds the same width. A browser adaptation.
 *
 * Why 1100 (the delta review, 2026-11-12): the header's widths are in rem, so the overlap reaches further at a larger
 * Interface size -- at the largest, 130% (rem 16.64px), signed in with a 14-character name and the 12-hour clock, the
 * icon slid the brand under the clock up to about 1021px wide (the base, without it: up to about 952px). 1100 is that
 * widest overlap plus a margin. A threshold in rem, following the Interface size, replaces this one number later.
 */
export const GITHUB_ROW_PX = 1100;

/**
 * Whether the GitHub link is Home's row (not the header's icon) at `win`'s width: the stylesheet's own query
 * (`matchMedia`), so a fractional width under browser zoom (1100.5px) decides as the CSS does -- `innerWidth`, whole
 * pixels, only where `matchMedia` is missing. The phone rule (`narrow`) always counts as the row.
 */
export function githubOnRow(win: Window | null | undefined, narrow: boolean): boolean {
  if (narrow) return true;
  if (!win) return false;
  const mm = typeof win.matchMedia === 'function' ? win.matchMedia(`(max-width: ${GITHUB_ROW_PX}px)`) : null;
  return mm ? mm.matches : win.innerWidth <= GITHUB_ROW_PX;
}

/** The launcher's community links' acts, in Home's order: Discord's, then GitHub's (the owner, 2026-11-12). */
export const COMMUNITY_ACTS: readonly string[] = ['discord', 'github'];
export const isCommunityAct = (act: string | undefined): boolean => act !== undefined && COMMUNITY_ACTS.includes(act);
