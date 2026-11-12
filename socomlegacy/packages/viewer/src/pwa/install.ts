/**
 * How this browser can install the page (PWA-6). A browser adaptation.
 * `beforeinstallprompt` is held back so the launcher's Install row can open a dialog; `prompt()` runs only from a
 * click or a tap whose event is trusted. A gamepad press is not a user activation, and a synthetic click is not either.
 */

export type InstallSurface = 'installed' | 'chromium' | 'ios' | 'firefox' | 'android' | 'other';

export const IOS_INSTALL_STEPS = 'In Safari, tap Share, then Add to Home Screen.';

/**
 * RB-39: the iOS steps as rows, each a step and its detail (the design `S2 Launcher v2`, its App panel on iOS, the
 * replay batch plan's `D:1186-1187`). "It launches full screen": the manifest's `display` is fullscreen
 * (`./manifest.ts`).
 */
export const IOS_INSTALL_ROWS: readonly (readonly [string, string])[] = [
  ['1 · Tap Share', 'The square with an arrow, bottom of Safari'],
  ['2 · Add to Home Screen', 'Scroll the share sheet to find it'],
  ['3 · Open from your Home Screen', 'It launches full screen'],
];

/**
 * Android with no held prompt: Chrome holds `beforeinstallprompt` until the page has been used for a while, and Firefox
 * never fires it, but both install from the browser's menu. Android has no install button in the address bar.
 */
export const ANDROID_INSTALL_STEPS = 'Open the browser menu (⋮), then choose Install, Install app or Add to Home screen.';

/** An installed iOS web app keeps its own storage, separate from Safari. Said on the Install dialog. */
export const IOS_STORAGE_NOTE = 'On iPhone and iPad, an installed app keeps its own storage, separate from Safari. Your disc and any files kept in this browser are not in the installed app. Open the app and pick your disc again.';

export interface InstallEnv {
  userAgent: string;
  /** `(display-mode: standalone)`. */
  standalone: boolean;
  /**
   * `(display-mode: fullscreen)` while the Fullscreen API is not holding an element. The page's own fullscreen
   * button sets `fullscreenElement`, and that is not an installed app.
   */
  fullscreen: boolean;
  /** iOS `navigator.standalone`. */
  iosStandalone: boolean;
  /** A `beforeinstallprompt` is held. */
  promptReady: boolean;
}

export function installSurface(env: InstallEnv): InstallSurface {
  if (env.standalone || env.fullscreen || env.iosStandalone) return 'installed';
  const ua = env.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua);
  if (ios && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) return 'ios';
  if (env.promptReady) return 'chromium';
  if (/Android/.test(ua)) return 'android';
  if (/Firefox\//.test(ua) && !ios) return 'firefox';
  return 'other';
}

/**
 * RB-39: where the page cannot install the app -- Firefox, which has no install on a computer, and the other browsers
 * that have not offered it -- the dialog offers to copy the launcher's address, to open in a browser that installs
 * (the design's App panel, `D:1188`, `D:1190`). Android installs from its menu (`ANDROID_INSTALL_STEPS`), iOS from
 * Share; neither needs the address.
 */
export function installCopyOffered(surface: InstallSurface): boolean {
  return surface === 'firefox' || surface === 'other';
}

export const COPY_LAUNCHER_ADDRESS = 'Copy launcher address';
/** How long the button says Copied (as the Copy performance line's two seconds, CPS-5). A browser adaptation. */
export const INSTALL_COPIED_MS_ADAPTATION = 2000;

/**
 * The launcher's address: the page's base (Vite's `BASE_URL`, which is the manifest's `start_url`, `./manifest.ts`),
 * not the screen it is on, so the address carries no route and no query.
 */
export function launcherAddress(href: string = globalThis.location?.href ?? 'http://localhost/'): string {
  return new URL(import.meta.env?.BASE_URL || '/', href).href;
}

/** The copy's state: `copied` for two seconds after a write lands; `refused` holds the address for the note. */
export type InstallCopy = { kind: 'idle' } | { kind: 'copied' } | { kind: 'refused'; address: string };
let copy: InstallCopy = { kind: 'idle' };
let copiedTimer: ReturnType<typeof setTimeout> | null = null;

export function installCopyState(): InstallCopy {
  return copy;
}

interface ClipboardLike { writeText(text: string): Promise<void> }

/** Tell the launcher to redraw: the options adapter redraws on this event (`console/adapters/options.ts`). */
function redrawLauncher(): void {
  globalThis.window?.dispatchEvent(new Event('s2u-install-offer'));
}

/**
 * RB-39: copy the launcher's address -- the fallback of the Copy performance line (`console/adapters/options.ts`,
 * CPS-5): the clipboard is tried, and a refusal (no clipboard, or a press that is not a user activation, as a pad's is
 * not, in a browser that asks for one) puts the address in the dialog's note to select and copy by hand. The press
 * may be a trusted click or a pad's; the clipboard decides, so a browser that lets a focused page write copies on a pad
 * press too.
 */
export async function copyLauncherAddress(deps: { clipboard?: ClipboardLike | null; href?: string; redraw?: () => void } = {}): Promise<'copied' | 'refused'> {
  const address = deps.href ?? launcherAddress();
  const clip = deps.clipboard !== undefined ? deps.clipboard : ((globalThis.navigator?.clipboard as ClipboardLike | undefined) ?? null);
  const redraw = deps.redraw ?? redrawLauncher;
  if (copiedTimer !== null) { clearTimeout(copiedTimer); copiedTimer = null; }
  try {
    if (!clip) throw new Error('no clipboard');
    await clip.writeText(address);
  } catch {
    copy = { kind: 'refused', address };
    redraw();
    return 'refused';
  }
  copy = { kind: 'copied' };
  copiedTimer = setTimeout(() => { copiedTimer = null; copy = { kind: 'idle' }; redraw(); }, INSTALL_COPIED_MS_ADAPTATION);
  redraw();
  return 'copied';
}

/** Tests: forget the copy's state. */
export function resetInstallCopyForTest(): void {
  if (copiedTimer !== null) { clearTimeout(copiedTimer); copiedTimer = null; }
  copy = { kind: 'idle' };
}

/** The row's action word. */
export function installAction(surface: InstallSurface): string {
  if (surface === 'installed') return 'Installed';
  if (surface === 'ios') return 'Add to Home Screen';
  if (surface === 'firefox') return 'Not supported';
  return 'Install';
}

export function readInstallSurface(win: Window | undefined): InstallSurface {
  if (!win) return 'other';
  const mm = (q: string): boolean => {
    try { return win.matchMedia?.(q).matches ?? false; } catch { return false; }
  };
  const nav = win.navigator as Navigator & { standalone?: boolean };
  let fullscreenElement = false;
  try { fullscreenElement = win.document?.fullscreenElement != null; } catch { fullscreenElement = false; }
  return installSurface({
    userAgent: nav?.userAgent ?? '',
    standalone: mm('(display-mode: standalone)'),
    fullscreen: mm('(display-mode: fullscreen)') && !fullscreenElement,
    iosStandalone: nav?.standalone === true,
    promptReady: installPromptReady(),
  });
}

interface HeldPrompt { prompt: () => Promise<void> }

let deferred: HeldPrompt | null = null;
let promptImpl: (() => void) | null = null;

export function installPromptReady(): boolean {
  return deferred !== null;
}

/** Remember the browser's prompt and tell the launcher to redraw. */
export function bindInstallOffer(win: Window): void {
  win.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    const ev = e as Event & { prompt?: () => Promise<void> };
    if (typeof ev.prompt !== 'function') return;
    deferred = ev as HeldPrompt;
    win.dispatchEvent(new Event('s2u-install-offer'));
  });
}

/** Call `prompt()` now. Only the trusted-click path may call this. */
export function promptInstallFromClick(): void {
  if (promptImpl) { promptImpl(); return; }
  const held = deferred;
  if (!held) return;
  deferred = null;
  void held.prompt();
}

/**
 * A click on the dialog's Install button (or, RB-39, its Copy launcher address button). `isTrusted` is false for a scripted `.click()` and for anything a pad poll
 * synthesises, so those do not call `prompt()`.
 */
export function onInstallClick(e: { isTrusted: boolean; target: { closest?: (sel: string) => unknown } | null }): void {
  // RB-39: Copy launcher address, from any click; the clipboard decides whether it lands (`copyLauncherAddress`).
  if (e.target?.closest?.('[data-pwa-copy]')) { void copyLauncherAddress(); return; }
  const el = e.target?.closest?.('[data-pwa-install]');
  if (!el || !e.isTrusted) return;
  promptInstallFromClick();
}

/** Tests: replace the prompt, and put a held prompt in place. */
export function setInstallPromptForTest(prompt: (() => void) | null, ready = true): void {
  promptImpl = prompt;
  deferred = ready ? { prompt: () => Promise.resolve() } : null;
}
