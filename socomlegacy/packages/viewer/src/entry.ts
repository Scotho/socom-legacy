import { bootFailure } from './bootFailure';
import { installClientErrorBeacon, pageClientErrorBeacon } from './clientErrorBeacon';
import { installInputSources } from './inputSources';
import { bootPage } from './pageEntry';
import { startPwa } from './pwa/boot';

/**
 * `index.html`'s one script (OT.R12, 2026-10-03; OT.R19, 2026-10-04): the address decides what the page is -- the
 * front end alone at the page's base path and every path but `<base>/testroom`, the map viewer and the match (`./main`)
 * at `<base>/testroom`. The decision and its test are `./pageEntry`'s; this file only runs it on the page's own address,
 * so a test can import the decision without booting anything.
 */
// A navigation that aborts the page chunk's import rejects the boot: said, never an unhandled rejection (the WebKit
// pageerror); any other boot failure is rethrown and stays one (`./bootFailure`).
// CLIENT_ERROR_BEACON_ADAPTATION, part A (Codex on #685): the capture is on before the selected page's chunk is even asked
// for, so a failed import (`chunkload`) and every error or graphics event of the front end or the test room has its
// listener; the pages' own installs after this are no-ops (one install a window).
installClientErrorBeacon(window, pageClientErrorBeacon());
installInputSources(window);   // XBOX-DIAG (`./inputSources`): which input drove the menus and the match, counts only
startPwa(window);
void bootPage(location.pathname + location.search).catch(bootFailure);
