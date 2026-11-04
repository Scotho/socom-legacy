import { esc, ico } from '../icons';
import { ANDROID_INSTALL_STEPS, installAction, IOS_INSTALL_STEPS, IOS_STORAGE_NOTE, type InstallSurface } from '../../pwa/install';
import { dialogHeadHtml } from './close';

/**
 * OPTIONS → Install app (PWA-6). A browser adaptation. The row opens this dialog; the Install button is a real
 * `<button>` carrying `data-pwa-install`, and only a trusted click on it calls `prompt()`. The iOS storage note is
 * on every surface, because that is the copy a player has to see before installing.
 */

const LEAD: Record<InstallSurface, string> = {
  installed: 'SOCOM II Legacy is already installed on this device.',
  ios: IOS_INSTALL_STEPS,
  firefox: 'Firefox on this computer cannot install an app from this page.',
  chromium: 'Tap Install to add SOCOM II Legacy to this device.',
  android: ANDROID_INSTALL_STEPS,
  other: 'This browser has not offered to install the app yet. Chrome and Edge offer it from the address bar once the page is installable.',
};

export function installAppHtml(surface: InstallSurface): string {
  const install = surface === 'chromium';
  const label = install ? 'Install' : 'Close';
  const act = install ? ' data-pwa-install' : '';
  return `<div class="cx-scrim" data-key="install"><div class="cx-dialog cx-install is-focused" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="pwa-title" data-pwa-surface="${surface}">
      ${dialogHeadHtml('Install app', 'pwa-title')}
      <div class="cx-install__mark" aria-hidden="true">${ico('download')}</div>
      <p class="cx-install__benefit">Your launcher. One tap away.</p>
      <p class="cx-dialog__note">Add an app icon and open in its own window.</p>
      <p class="cx-dialog__lead">${esc(LEAD[surface])}</p>
      <p class="cx-dialog__note" data-pwa-ios-note>${esc(IOS_STORAGE_NOTE)}</p>
      <button type="button" class="cx-toggle" data-act="press" data-b="circle"${act} data-pwa-action="${esc(installAction(surface))}"><span>${esc(label)}</span></button>
    </div></div>`;
}
