import { keyboardSite } from './keyboardTesting';
/**
 * The scoreboard's keyboard hold (socomlegacy/docs/research/87-hud.md §12): `Tab` held shows the multiplayer round's
 * scoreboard, as SELECT held does on the console (the pad's `scoreboard` lane, `./gamepad`). `Tab` is taken from the
 * browser's focus walk only while walking, so the page's controls stay reachable by keyboard in flight.
 */
export class ScoreboardKeys {
  private held_ = false;
  private bound: EventTarget | null = null;

  constructor(private readonly enabled: () => boolean) {}

  /** Whether `Tab` is held now (and walking). */
  held(): boolean { return this.held_ && this.enabled(); }

  /** RB-8 (OT.R114, RB.R4): `kbm`, a page's opt-in (the test room's `kbmAllowed`), attaches the keys in every build and is asked again at each press. */
  bindKey(target: EventTarget = globalThis, kbm: (() => boolean) | null = null): void {
    this.unbindKey();
    this.kbm = kbm;
    if (import.meta.env.DEV || kbm !== null) {                       // OT.R29: the keys a development build's only; RB-8: or a `kbm` page's
      if (import.meta.env.DEV) keyboardSite('s2u-kb-scoreboard');
      target.addEventListener('keydown', this.onDown as EventListener);
      target.addEventListener('keyup', this.onUp as EventListener);
    }
    target.addEventListener('blur', this.onBlur);
    this.bound = target;
  }

  unbindKey(): void {
    this.bound?.removeEventListener('keydown', this.onDown as EventListener);
    this.bound?.removeEventListener('keyup', this.onUp as EventListener);
    this.bound?.removeEventListener('blur', this.onBlur);
    this.bound = null;
  }

  /** RB-8: the page's keyboard opt-in given at `bindKey`, else null. */
  private kbm: (() => boolean) | null = null;

  private readonly onDown = (e: KeyboardEvent): void => {
    if (!import.meta.env.DEV && !this.kbm?.()) return;
    if (e.code !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey || !this.enabled()) return;
    e.preventDefault();
    this.held_ = true;
  };

  private readonly onUp = (e: KeyboardEvent): void => {
    if (e.code === 'Tab') this.held_ = false;
  };

  /** A window that loses the focus never sees the key come up: the hold ends with it. */
  private readonly onBlur = (): void => { this.held_ = false; };
}
