/**
 * How this browser can install the page (PWA-6). A browser adaptation.
 * `beforeinstallprompt` is held back so the launcher's Install row can open a dialog; `prompt()` runs only from a
 * click or a tap whose event is trusted. A gamepad press is not a user activation, and a synthetic click is not either.
 */

export type InstallSurface = 'installed' | 'chromium' | 'ios' | 'firefox' | 'android' | 'other';

export const IOS_INSTALL_STEPS = 'In Safari, tap Share, then Add to Home Screen.';

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
 * A click on the dialog's Install button. `isTrusted` is false for a scripted `.click()` and for anything a pad poll
 * synthesises, so those do not call `prompt()`.
 */
export function onInstallClick(e: { isTrusted: boolean; target: { closest?: (sel: string) => unknown } | null }): void {
  const el = e.target?.closest?.('[data-pwa-install]');
  if (!el || !e.isTrusted) return;
  promptInstallFromClick();
}

/** Tests: replace the prompt, and put a held prompt in place. */
export function setInstallPromptForTest(prompt: (() => void) | null, ready = true): void {
  promptImpl = prompt;
  deferred = ready ? { prompt: () => Promise.resolve() } : null;
}
