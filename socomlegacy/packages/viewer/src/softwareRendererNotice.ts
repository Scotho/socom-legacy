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

/** The notice's sentence, naming the renderer the probe read (or that no context could be made). */
export function softwareRendererText(renderer: string | null): string {
  const what = renderer ?? 'no WebGL context could be made';
  return `Hardware acceleration looks off in this browser (${what}). The game will run slowly.`;
}

/** The help sheet's lines: each browser's path to the switch, its name in `<b>`. */
const HELP: readonly [string, string][] = [
  ['Chrome', 'Settings > System > "Use graphics acceleration when available": turn it on, then relaunch Chrome.'],
  ['Edge', 'Settings > System and performance > "Use graphics acceleration when available": turn it on, then restart Edge.'],
  ['Firefox', 'Settings > General > Performance: uncheck "Use recommended performance settings", check "Use hardware acceleration when available", then restart Firefox.'],
  ['Remote desktop or a VM', 'a remote desktop or a virtual machine shows the same software renderer even with the setting on: play on the machine itself.'],
];

/** One notice on the page, over the launcher, replacing an earlier one; its link opens the help sheet in place. */
export function showSoftwareRendererNotice(doc: Document, renderer: string | null): HTMLElement {
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
  line.textContent = `${softwareRendererText(renderer)} `;
  const open = doc.createElement('button');
  open.type = 'button';
  open.className = 's2u-chip';
  open.setAttribute('data-no-gpu-open', '');
  open.setAttribute('aria-expanded', 'false');
  open.textContent = 'How to turn it on';
  const close = doc.createElement('button');
  close.type = 'button';
  close.className = 's2u-chip';
  close.setAttribute('data-no-gpu-dismiss', '');
  close.textContent = 'Dismiss';
  line.append(open, ' ', close);

  const help = doc.createElement('div');
  help.setAttribute('data-no-gpu-help', '');
  help.hidden = true;
  for (const [who, how] of HELP) {
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
      } catch { /* a page being torn down, or no canvas: no notice */ }
    }, 0);
  });
}
