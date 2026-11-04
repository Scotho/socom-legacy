/**
 * The launcher's one community link (LATER 291, owner row H290). Discord's public brand page
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

/** Opens the invite in a new tab. The anchors do this natively; the pad's Cross uses this. */
export function openDiscord(): void {
  const open = globalThis.open;
  if (typeof open !== 'function') return;
  open.call(globalThis, DISCORD_INVITE, '_blank', 'noopener,noreferrer');
}
