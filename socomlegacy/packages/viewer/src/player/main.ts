/**
 * LCM-16 (the LCM plan, LCM.R18 (e)): the `/player/<name>` document's entry (`leaderboard/player/index.html`; central
 * injects the player's head into it, `central/src/playerPageHttp.ts`; the dev server rewrites `/player/<name>` to it,
 * `vite.config.ts` `statsDocumentFor`). It loads the page module and the project site's stylesheet, nothing of the
 * launcher (chrome.md). A browser adaptation (product track, OT.R53).
 */
import '../projectSite/site.css';
import { mountPlayerPage, playerPageNameOf } from '../playerPage';

mountPlayerPage(document, window, playerPageNameOf(window.location.pathname, import.meta.env.BASE_URL ?? '/'));
