/**
 * LCM-16 (the LCM plan, LCM.R18 (e)): the `/match/<id>` document's entry (`leaderboard/match/index.html`; central injects
 * the match's head into it, `central/src/matchPageHttp.ts`; the dev server rewrites `/match/<id>` to it, `vite.config.ts`
 * `statsDocumentFor`). It loads the page module and the project site's stylesheet, nothing of the launcher (chrome.md:
 * reading pages import no game bootstrap module). A browser adaptation (product track, OT.R53).
 */
import '../projectSite/site.css';
import { matchPageIdOf, mountMatchPage } from '../matchPage';

mountMatchPage(document, window, matchPageIdOf(window.location.pathname, import.meta.env.BASE_URL ?? '/'));
