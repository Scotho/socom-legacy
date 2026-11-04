/**
 * The page's toast held while the ARMORY is open (web sprint 5): the pill sits top centre, over the screen's title bar
 * (ARMORY, the server and game names), and the original's ARMORY shows no such pill (the owner's capture of the lobby,
 * research 95 §2.7). So while the screen is open a toast is not shown: the newest is kept, and one already showing is
 * taken down and kept, and the kept one is shown when the screen closes -- nothing said is lost, nothing lies over the
 * dialog. `body.armory-open #toast` (`styles.css`) covers the frame before the hold.
 */
export class ToastHold {
  private held = false;
  /** The toast showing now (null once it ran out, `expired`, or was taken down). */
  private showing: string | null = null;
  /** The newest toast said while held, shown on the release. */
  private pending: string | null = null;

  constructor(private readonly show: (text: string) => void, private readonly hide: () => void) {}

  /** A toast: shown at once, or kept for the release while held. */
  toast(text: string): void {
    if (this.held) { this.pending = text; return; }
    this.showing = text;
    this.show(text);
  }

  /** The toast showing ran its time out (the pill's own timer). */
  expired(): void {
    this.showing = null;
  }

  /** The ARMORY opened (true) or closed (false). */
  hold(on: boolean): void {
    if (on === this.held) return;
    this.held = on;
    if (on) {
      if (this.showing !== null) { this.pending = this.showing; this.showing = null; this.hide(); }
      return;
    }
    const text = this.pending;
    this.pending = null;
    if (text !== null) this.toast(text);
  }
}
