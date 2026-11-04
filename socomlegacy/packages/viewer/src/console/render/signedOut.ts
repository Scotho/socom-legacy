import { btn, esc } from '../icons';

/**
 * LR-1 (the launcher redesign plan, LR.R8: the "Signed out" resting screen, a product-track adaptation): the artifact's
 * screen after a sign-out (`docs/specs/launcher-redesign/S2-Launcher-v2.dc.html`, its `signedOut` layer): the launcher
 * veiled and blurred behind, the persona's initials in a gold ring, "Signed out", and the way back -- Cross (LR.R5: the
 * original's glyph; Enter and a click do the same) to sign in as the persona last signed in, the quick sign-in
 * (PERSONA-PERSIST), or to open the sign-in when none is remembered. The whole screen is the one target (`data-act`).
 * The dialog takes focus on show (tabindex -1; LR-4 moves it there) and its line is a button: a key or a click on it
 * bubbles to the screen's one `data-act`. Its showing and its press are the grammar's (LR-12: `../grammar` `restSignedOut`,
 * after a sign-out from the launcher page; Cross the sign-in with the persona chosen, Circle closes), drawn by `./frame`.
 */
export interface SignedOutView {
  /** The persona the quick sign-in would sign in as; null, none remembered. */
  name: string | null;
  /** The act its press asks for (`../grammar`'s `data-act`). */
  act?: string;
}

/** The ring's letters: a name's first letter and the first of its last part (WRAITH-6: W6), else its first two. */
export function initials(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length > 1) return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  return (parts[0] ?? '').slice(0, 2).toUpperCase();
}

export function signedOutHtml(v: SignedOutView): string {
  const who = v.name ? ` as <b class="cx-signedout__name">${esc(v.name)}</b>` : '';
  return `<div class="cx-signedout" role="dialog" aria-modal="true" aria-labelledby="cx-signedout-title" tabindex="-1" data-act="${esc(v.act ?? 'signedout')}">
    <div class="cx-signedout__ring" aria-hidden="true">${v.name ? esc(initials(v.name)) : ''}</div>
    <h2 class="cx-signedout__title" id="cx-signedout-title">Signed out</h2>
    <button type="button" class="cx-signedout__line"><span class="cx-signedout__press">Press</span> ${btn('cross')}<span class="sr-only">Cross</span> <span>to sign in${who}</span></button>
  </div>`;
}
