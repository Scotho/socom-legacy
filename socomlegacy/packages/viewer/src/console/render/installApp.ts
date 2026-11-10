import { esc, ico } from '../icons';
import {
  ANDROID_INSTALL_STEPS, COPY_LAUNCHER_ADDRESS, installAction, installCopyOffered, installCopyState, IOS_INSTALL_ROWS, IOS_INSTALL_STEPS,
  IOS_STORAGE_NOTE, type InstallSurface,
} from '../../pwa/install';
import { dialogHeadHtml } from './close';

/**
 * OPTIONS → Install app (PWA-6). A browser adaptation. The row opens this dialog; the Install button is a real
 * `<button>` carrying `data-pwa-install`, and only a trusted click on it calls `prompt()`. The iOS storage note is
 * on every surface, because that is the copy a player has to see before installing.
 *
 * RB-39 (the replay batch plan; the design `S2 Launcher v2`, its App panel): where the page cannot install (Firefox,
 * the other browsers), a Copy launcher address button -- a click copies (`pwa/install` `copyLauncherAddress`), and a
 * refused clipboard puts the address in a note to copy by hand; on iOS the steps as rows under the one-line steps.
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
  const steps = surface === 'ios'
    ? `<div class="cx-install__steps" role="list" data-pwa-ios-steps>${IOS_INSTALL_ROWS.map(([step, detail]) => `<div role="listitem"><p class="cx-dialog__lead">${esc(step)}</p><p class="cx-dialog__note">${esc(detail)}</p></div>`).join('')}</div>`
    : '';
  let copy = '';
  if (installCopyOffered(surface)) {
    const st = installCopyState();
    // A press that is not the clipboard's to take: the note says how, with the address to select (CPS-5's fallback).
    const note = st.kind === 'refused'
      ? `<p class="cx-dialog__note" data-pwa-copy-note role="status">Select the address and copy it: the browser refused the clipboard. ${esc(st.address)}</p>`
      : '';
    copy = `${note}<button type="button" class="cx-toggle" data-act="press" data-b="cross" data-pwa-copy><span>${esc(st.kind === 'copied' ? 'Copied' : COPY_LAUNCHER_ADDRESS)}</span></button>`;
  }
  return `<div class="cx-scrim" data-key="install"><div class="cx-dialog cx-install is-focused" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="pwa-title" data-pwa-surface="${surface}">
      ${dialogHeadHtml('Install app', 'pwa-title')}
      <div class="cx-install__mark" aria-hidden="true">${ico('download')}</div>
      <p class="cx-install__benefit">Your launcher. One tap away.</p>
      <p class="cx-dialog__note">Add an app icon and open in its own window.</p>
      <p class="cx-dialog__lead">${esc(LEAD[surface])}</p>
      ${steps}
      <p class="cx-dialog__note" data-pwa-ios-note>${esc(IOS_STORAGE_NOTE)}</p>
      ${copy}
      <button type="button" class="cx-toggle" data-act="press" data-b="circle"${act} data-pwa-action="${esc(installAction(surface))}"><span>${esc(label)}</span></button>
    </div></div>`;
}
