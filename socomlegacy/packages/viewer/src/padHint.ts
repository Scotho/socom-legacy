/**
 * XBOX-PAD-HINT (product track, **a browser adaptation with no original**; the main controller's v0.4.19 decision,
 * 2026-11-11, under the owner's delegated authority): on a console page (`./matchDiag` `xboxConsole`: the agent's token
 * or the `SraKmd_` driver -- never a PC's saved Xbox pick, review F2), in a match
 * whose pad reader has found NO gamepad for `PAD_HINT_NO_PAD_MS_ADAPTATION` continuously from the mount, a dismissable,
 * never-blocking notice that the console's browser has the controller in its browsing controls. Hidden the moment a pad
 * is found; once a match; recorded in `inputdiag` (`hint`). Why: b0's field read (`agent-mail/evidence/respawn-join-1111/
 * REPORT.md`) -- Xbox seats ran smooth frames and sent no input until the room's 240 s idle kick; the menus take a cursor
 * in release builds, the match reads the Gamepad API only. Its condition is what makes a wrong diagnosis harmless: a
 * player whose controller the game reads never sees it. It changes nothing the game does.
 */

/** No pad found this long from the mount, ms, before the hint. An adaptation. */
export const PAD_HINT_NO_PAD_MS_ADAPTATION = 10_000;

/**
 * The hint's words: the certain part plainly, the switch as the sources give it. Sources, three, independent and in
 * agreement (2026-11-11; none of them Microsoft documentation of Chromium Edge on Xbox, which we did not find):
 * - webЯcade's Xbox platform docs, https://docs.webrcade.com/platforms/xbox/ -- Edge on Xbox "defaults to `Browsing
 *   Controls` mode"; to switch, "hold down on the `Menu` button ... `Use game controls`".
 * - PureXbox at the browser's launch (2021-09), https://www.purexbox.com/news/2021/09/xboxs_new_internet_browser_is_out_now_and_its_a_major_improvement
 *   -- "press and hold the Menu button".
 * - Microsoft's own MakeCode issue, https://github.com/microsoft/pxt-arcade/issues/6176 -- "Default mode is browsing mode,
 *   allowing the controller to manipulate the browser as if it were a mouse."
 * The owner's confirmation on a console is asked (the main controller, 2026-11-11).
 */
export const PAD_HINT_TEXT = 'The game is not receiving controller input. In the Xbox browser the controller starts in browsing controls: hold the Menu button and choose Use game controls.';

/** The hint's state through one match: when it shows, when it hides. */
export class PadHint {
  private origin: number | null = null;
  private marked = false;
  private padSeen = false;
  private dismissed = false;
  private showing = false;
  /** It showed this match (`inputdiag`'s `hint`). */
  shown = false;

  begin(now: number, xboxMarked: boolean): void {
    this.origin = now; this.marked = xboxMarked;
    this.padSeen = false; this.dismissed = false; this.showing = false; this.shown = false;
  }

  end(): void { this.origin = null; this.showing = false; }

  /** The player dismissed it: hidden, not again this match. */
  dismiss(): void { this.dismissed = true; this.showing = false; }

  /** A frame with the pads the match's reader found: 'show' or 'hide' when the notice should change, else null. */
  frame(now: number, pads: number): 'show' | 'hide' | null {
    if (this.origin === null || !this.marked) return null;
    if (pads > 0) {
      this.padSeen = true;
      if (this.showing) { this.showing = false; return 'hide'; }
      return null;
    }
    if (this.padSeen || this.dismissed || this.shown) return null;
    if (now - this.origin < PAD_HINT_NO_PAD_MS_ADAPTATION) return null;
    this.showing = true; this.shown = true;
    return 'show';
  }
}

const MARK = 'data-pad-hint';

/** The notice: `./graphicsLost`'s fixed `s2u-notice`, a status (never an alert), under the graphics notices, with a Dismiss. */
export function showPadHint(doc: Document, onDismiss: () => void): HTMLElement {
  doc.querySelector(`[${MARK}]`)?.remove();
  const el = doc.createElement('div');
  el.setAttribute(MARK, '');
  el.setAttribute('role', 'status');
  // The design system's notice panel gives the colour and the type (chrome_classes: no colour or type inline); only
  // where it sits is set here, one layout property at a time (`./graphicsLost`'s placement, under its three rows).
  el.className = 's2u-notice';
  el.style.position = 'fixed';
  el.style.left = '50%';
  el.style.top = '168px';
  el.style.transform = 'translateX(-50%)';
  el.style.zIndex = '2147483646';
  el.style.maxWidth = '90vw';
  el.style.margin = '0';
  el.style.textAlign = 'center';
  const line = doc.createElement('p');
  line.textContent = `${PAD_HINT_TEXT} `;
  const close = doc.createElement('button');
  close.type = 'button';
  close.className = 's2u-chip';
  close.setAttribute(`${MARK}-dismiss`, '');
  close.textContent = 'Dismiss';
  close.addEventListener('click', () => { el.remove(); onDismiss(); });
  line.append(close);
  el.append(line);
  (doc.body ?? doc.documentElement).appendChild(el);
  return el;
}

export function hidePadHint(doc: Document | null | undefined): void {
  doc?.querySelector(`[${MARK}]`)?.remove();
}
