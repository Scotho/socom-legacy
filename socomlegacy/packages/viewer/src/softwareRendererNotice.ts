/**
 * Browser adaptation (no original; product track, PLAT-38 (e), CPS-4c): the no-GPU notice. When a throwaway WebGL
 * context reports a software renderer (`./softwareRenderer`), the launcher page says so, names the string, and opens an
 * in-page sheet of the steps that turn hardware acceleration on in Chrome, Edge and Firefox. The pattern is
 * `./graphicsLost`'s fixed `s2u-notice`, its own element. Dismissed for the session only (this module's flag), never
 * stored. It changes nothing the game does.
 */
import { noticeSuppressed, pageSoftwareProbe, type SoftwareProbe } from './softwareRenderer';

/** Dismissed for this page's session: a module variable, not storage. */
let dismissed = false;

/**
 * The notice's sentence, naming the renderer the probe read. GPU-BLOCKED-NOTICE (#790, 2026-11-14; a browser adaptation):
 * no context at all (`renderer` null) is not acceleration switched off -- a browser with it off still makes a software
 * context -- but the browser refusing the site any WebGL, as Chromium does to a site after a graphics reset until the
 * browser is closed (seen on an Xbox, after the UI's GPU restore timed out and a reload: central's `uigpufallback` L4
 * `no-webgl2`); so it says to restart the browser.
 */
export function softwareRendererText(renderer: string | null, noWebGL2 = false): string {
  // LATER 1265: a WebGL1 context but no WebGL2 -- the browser refused (or blocked) WebGL2, which the game draws with.
  if (noWebGL2) {
    return 'This browser is not giving the game WebGL2, so a match may have nothing to draw with. After a graphics reset a browser can block a site until it is closed: close the browser completely and open it again.';
  }
  if (renderer === null) {
    return 'This browser is giving the game no graphics right now (no WebGL context could be made). After a graphics reset a browser can block a site until it is closed: close the browser completely and open it again.';
  }
  return `Hardware acceleration looks off in this browser (${renderer}). The game will run slowly.`;
}

/** The help sheet's lines: each browser's path to the switch, its name in `<b>`. */
const HELP: readonly [string, string][] = [
  ['Chrome', 'Settings > System > "Use graphics acceleration when available": turn it on, then relaunch Chrome.'],
  ['Edge', 'Settings > System and performance > "Use graphics acceleration when available": turn it on, then restart Edge.'],
  ['Firefox', 'Settings > General > Performance: uncheck "Use recommended performance settings", check "Use hardware acceleration when available", then restart Firefox.'],
  ['Remote desktop or a VM', 'a remote desktop or a virtual machine shows the same software renderer even with the setting on: play on the machine itself.'],
];
/** GPU-BLOCKED-NOTICE: with no context at all, restarting the browser comes first (`softwareRendererText`), then `HELP`. */
const RESTART: readonly [string, string][] = [
  ['Xbox', 'press the Xbox button, go to Home, highlight Microsoft Edge, press the Menu button and choose Quit, then open Edge again.'],
  ['Any other device', 'close every window of the browser, then open it again.'],
];

/** One notice on the page, over the launcher, replacing an earlier one; its link opens the help sheet in place. */
export function showSoftwareRendererNotice(doc: Document, renderer: string | null, noWebGL2 = false): HTMLElement {
  doc.querySelector('[data-no-gpu]')?.remove();
  const el = doc.createElement('div');
  el.setAttribute('data-no-gpu', '');
  el.setAttribute('role', 'status');
  // The design system's notice panel gives the colour and the type (chrome_classes: no colour or type inline); only
  // where it sits is set here, one layout property at a time (`./graphicsLost`'s placement, one layer under it).
  el.className = 's2u-notice';
  el.style.position = 'fixed';
  el.style.left = '50%';
  el.style.top = '12px';
  el.style.transform = 'translateX(-50%)';
  el.style.zIndex = '2147483646';
  el.style.maxWidth = '90vw';
  el.style.margin = '0';

  const line = doc.createElement('p');
  line.textContent = `${softwareRendererText(renderer, noWebGL2)} `;
  const open = doc.createElement('button');
  open.type = 'button';
  open.className = 's2u-chip';
  open.setAttribute('data-no-gpu-open', '');
  open.setAttribute('aria-expanded', 'false');
  open.textContent = renderer === null ? 'What to do' : 'How to turn it on';
  const close = doc.createElement('button');
  close.type = 'button';
  close.className = 's2u-chip';
  close.setAttribute('data-no-gpu-dismiss', '');
  close.textContent = 'Dismiss';
  line.append(open, ' ', close);

  const help = doc.createElement('div');
  help.setAttribute('data-no-gpu-help', '');
  help.hidden = true;
  for (const [who, how] of renderer === null ? [...RESTART, ...HELP] : HELP) {
    const p = doc.createElement('p');
    const b = doc.createElement('b');
    b.textContent = `${who}: `;
    p.append(b, how);
    help.appendChild(p);
  }

  open.addEventListener('click', () => {
    help.hidden = !help.hidden;
    open.setAttribute('aria-expanded', String(!help.hidden));
  });
  close.addEventListener('click', () => { dismissed = true; el.remove(); });
  el.append(line, help);
  (doc.body ?? doc.documentElement).appendChild(el);
  return el;
}

/**
 * Probes once after the page's first frame (a frame, then a task: never on the boot's own path) and shows the notice
 * when the renderer is software. A probe that throws shows nothing; a dismissed notice stays dismissed this session.
 * Under a test driver it does nothing: the notice is for a player; an automated browser (Playwright, the perf drivers)
 * runs on SwiftShader by design -- the batch review, 2026-11-02 (`noticeSuppressed`).
 * N1b (the fresh review of N1): the page's one memoised probe (deviceClass `pageRendererProbe`), never a second throwaway WebGL context beside a live one on the Xbox class (GM-XBOX1); a browser adaptation.
 * The memo itself is `./softwareRenderer` `pageSoftwareProbe`, which `pageRendererProbe` returns: this module imports no `./deviceClass` value.
 */
export function watchSoftwareRenderer(doc: Document, win: Window, probe: (doc: Document) => SoftwareProbe = () => pageSoftwareProbe()): void {
  if (dismissed || noticeSuppressed(win.navigator ?? {})) return;
  win.requestAnimationFrame(() => {
    win.setTimeout(() => {
      if (dismissed) return;
      try {
        const found = probe(doc);
        if (found.software) showSoftwareRendererNotice(doc, found.renderer);
        else if (found.webgl2 === false) showSoftwareRendererNotice(doc, null, true);   // LATER 1265: WebGL1 only
      } catch { /* a page being torn down, or no canvas: no notice */ }
    }, 0);
  });
}
