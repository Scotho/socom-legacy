import { bootFailure } from '../bootFailure';
import { watchSoftwareRenderer } from '../softwareRendererNotice';
import { installClientErrorBeacon, pageClientErrorBeacon } from '../clientErrorBeacon';
import { startPwa } from '../pwa/boot';
import { adaptersFor, liveAdapters } from './adapters';
import { bootConsole } from './app';
import { bootLauncher } from './launcherEntry';
import { lobbyIdOfPath, mountLobbyLiveLink } from '../lobbyLiveLink';
import { replayPageOf } from './routes';

/**
 * The console launcher page's entry (`index.html`, served at the base path since CX-9a, CX.R8; `/console` its alias):
 * the S2U Briefing design system's "Console launcher", ported. Slice 2: the page runs on what the server and the emulator report (`./adapters`); the
 * prototype's sample adapters (`SAMPLE_DATA`, the header says so) only under `?sample`, for screenshots. The keyboard
 * map is a development build's only (OT.R29). Enter, Space, o and p press START on every build (Craig, 2026-10-20:
 * the launcher is excluded). A browser adaptation
 * with no original (the project's own launcher page, OT.R28): the launched game's flow, the setup page and the reading
 * pages are not touched.
 *
 * CX-9a fix round (B1): on a development build, at the base path or a menu route with `?devmode` and the served tree
 * answering, the page boots the game through the old page's entry instead (`./launcherEntry`), so the owner's link and
 * a reload of the game keep the served tree and the router's trail; otherwise the console shows.
 */
startPwa(window);
watchSoftwareRenderer(document, window);   // CPS-4c: a software WebGL renderer named, after the first frame (browser adaptation)
installClientErrorBeacon(window, pageClientErrorBeacon());   // CLIENT_ERROR_BEACON_ADAPTATION, part A (2026-11-05): what breaks is kept, named on the page and (part B) told to our server
// LCM-8: a lobby link's page (`/online/lobby/<id>`) boots the launcher as before and shows "Live match stats" while
// `/api/live` names its match. LCM-16: `/match/<id>` and `/player/<name>` are no longer this document's -- each is its own
// (`leaderboard/match/index.html`, `leaderboard/player/index.html`), central's head injected, the dev server's rewrite.
// LCM-RP (RB-12): `/replay/<id>` is the replay page in this document (central injects its head): the replay viewer on that
// replay, loaded only there (`./render/replayPublic`); a malformed id goes Home from it.
const replayPage = replayPageOf(window.location.pathname, window.location.search, import.meta.env.BASE_URL ?? '/');
if (replayPage) {
  void import('./render/replayPublic').then((m) => { m.bootReplayPage(document, window, replayPage); }).catch(bootFailure);
} else {
  const lobbyId = lobbyIdOfPath(window.location.pathname, import.meta.env.BASE_URL ?? '/');   // LCM-18d: it ends with the lobby's page
  if (lobbyId) mountLobbyLiveLink(document, lobbyId, { base: import.meta.env.BASE_URL ?? '/' });
  void bootLauncher(document, {
    dev: import.meta.env.DEV,
    base: import.meta.env.BASE_URL ?? '/',
    console: () => { bootConsole(document, window, adaptersFor(window.location.search, () => liveAdapters(document, window)), { keymap: import.meta.env.DEV }); },
  }).catch(bootFailure);
}
