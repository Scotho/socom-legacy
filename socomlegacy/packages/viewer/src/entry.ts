import { bootFailure } from './bootFailure';
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
startPwa(window);
void bootPage(location.pathname + location.search).catch(bootFailure);
