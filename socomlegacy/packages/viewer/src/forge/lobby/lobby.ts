import type { ArmoryDeps } from '../../armory';
import { PAD_BUTTON } from '../../gamepad';
import { MenuStick, type PadSnapshot } from '../pad';
import type { ForgeLobbyDeps } from './deps';
import { ForgeLobbyArmory, type ArmoryLike, type ArmoryPaint } from './lobbyArmory';
import { LobbyView } from './lobbyView';
import { ForgeLobbyVoice, type ForgeLobbyVoiceDeps } from './lobbyVoice';
import { ForgeWindow, type WindowStore } from './window';

/**
 * FORGE (FG-27; FG.R22): the forge's lobby popup, mounted -- a browser adaptation with no original: the window
 * (`./window`) over the forge's page, holding the lobby view (`./lobbyView`) or the ARMORY (`./lobbyArmory`), with the
 * lobby's voice (`./lobbyVoice`), all fed by the seam the page provides (`./deps` `ForgeLobbyDeps`, FG-26). Nothing of
 * the game's behaviour is changed: every request is the room's to take or refuse.
 *
 * - **Its open and close** are the page's: the forge's START menu, a toolbar button, the window's close and LEAVE (both
 *   `deps.close`). The pad's Home button (button 16) is never read or claimed -- it is the modern UI overlay's (the
 *   owner's word, 2026-10-14, FG.R22); `pad` reads the sixteen standard buttons (`../../gamepad` `PAD_BUTTON`) only.
 * - **The pad** (the page hands each frame's snapshot while the window is open): in the lobby view the d-pad walks the
 *   controls and Cross presses the one in focus, Circle held talks (the original's lobby CIRCLE, `VCButton`); START
 *   and SELECT are left to the page. Over the ARMORY every press is the screen's (`Armory.pad`). The first read after
 *   the mount or a change of screen only notes what is held, so the press that opened it is no press. AM-1 (FI.R2; the
 *   owner, 2026-10-16: "make menu movement work with analog sticks across the board"): the left stick walks the controls
 *   as the d-pad does, with the forge menu's rule and repeat (`../pad` `MenuStick`); a stick pushed at that first read
 *   waits for the rest. Over the ARMORY the stick is the screen's own (the original's, AM-2's).
 * - **The visibility** (FG-45, FG.R24): the creator's page gives `deps.visibility`; its control (LISTED / UNLISTED) asks
 *   the change, its label follows the server's answer, and a refusal is said in the chat panel as the other notices.
 * - **The password** (FG-48a, FG.R24; an adaptation, no original): the host's page gives `deps.password`; its control
 *   (PASSWORD / LOCKED) opens a card in the window -- a field typed by a keyboard, SET, CLEAR, CANCEL -- which the pad
 *   walks while it shows (the d-pad, Cross, Circle closing it instead of talking). A refusal is a notice line; the
 *   password typed is never shown, kept or said.
 * - **The kick** (FG-48b, FG.R24; an adaptation, no original): the host's page gives `deps.kick`; its control (KICK)
 *   opens a card listing the other seats -- the d-pad chooses, Cross kicks, Circle cancels (no talk), as the password's
 *   card. The kicked seat is named in a notice line once the server has answered, a refusal said as one.
 * - **The host handed on** (FG-48c, FG.R24; an adaptation, no original): the host's seams are read each frame, so a
 *   successor's window gains LISTED, PASSWORD, KICK and CLOSE LOBBY live and an old host's loses them. LEAVE and the
 *   window's close are the page's leave (`deps.close`: a host's hands the lobby on); CLOSE LOBBY (`deps.end`) opens a
 *   card that asks before the page closes the lobby for everyone -- the pad walks it as the other cards.
 * - **The ARMORY** opens in the window over the lobby view; its change goes to the room only (`deps.armory().send`,
 *   FG.R21); its close, and the room's launch, bring the lobby view back.
 */

export interface ForgeLobby {
  /** The window's element (in `host`). */
  readonly root: HTMLElement;
  /** Which screen the window shows. */
  screen(): 'lobby' | 'armory';
  /** Once a frame: the clocks, the voice, the talker bar, the ARMORY's step and draw. */
  frame(dt: number): void;
  /** The pad's snapshot this frame (or null with none); button 16 is never read. */
  pad(snap: PadSnapshot | null): void;
  /** Circle held (true) or let go (false), when the page routes the pad's talk itself. */
  talk(down: boolean): void;
  /** FG-26: a line of the page's own in the chat panel (the lobby closed, the connection lost). */
  notice(text: string): void;
  /** FG-26: the window shown or hidden (the forge's START menu and toolbar): hidden, it stays mounted and the voice runs. */
  setShown(on: boolean): void;
  /** Everything let go: the seam's listeners, the voice, the ARMORY, the window. */
  dispose(): void;
}

/** What the page may set beside the seam (each absent: the page's own defaults). */
export interface ForgeLobbyOptions {
  /** Where the window's rect is kept; absent, `pageSettings`. */
  store?: WindowStore;
  viewport?(): { width: number; height: number };
  /** The voice client's options (`ForgeLobbyVoiceDeps`). */
  voice?: ForgeLobbyVoiceDeps;
  /** The ARMORY's render step (`armoryViewPaint` on the page's renderer); absent or null, nothing is drawn. */
  paint?: ArmoryPaint | null;
  /** The ARMORY's maker (a test's stand-in); absent, `new Armory`. */
  makeArmory?(deps: ArmoryDeps): ArmoryLike;
  /** The page's clock, ms; absent, `performance.now`. */
  now?(): number;
}

const D_PAD = { up: PAD_BUTTON.Up, down: PAD_BUTTON.Down, left: PAD_BUTTON.Left, right: PAD_BUTTON.Right } as const;
/** The sixteen standard buttons the popup reads (0..15); the Home button (16) is not among them. */
const READ = new Set<number>(Object.values(PAD_BUTTON));

export function mountForgeLobby(host: HTMLElement, deps: ForgeLobbyDeps, o: ForgeLobbyOptions = {}): ForgeLobby {
  const doc = deps.doc;
  const titleOf = (): string => `GAME LOBBY · ${deps.title().name}`;
  let gone = false;
  let screen: 'lobby' | 'armory' = 'lobby';
  /** The lobby view's pad read before (null: the next read only notes what is held). */
  let prev: ReadonlySet<number> | null = null;
  /** AM-1: the lobby view's left stick, as its d-pad. */
  const stick = new MenuStick();
  const clock = o.now ?? ((): number => performance.now());

  const win = new ForgeWindow({
    doc, title: titleOf(), onClose: () => { deps.close(); },
    ...(o.store ? { store: o.store } : {}), ...(o.viewport ? { viewport: o.viewport } : {}),
  });

  const show = (s: 'lobby' | 'armory'): void => {
    screen = s;
    win.root.classList.toggle('is-armory', s === 'armory');
    view.root.hidden = s === 'armory';
    armory.canvas.hidden = s !== 'armory';
    prev = null;
  };

  const armory = new ForgeLobbyArmory({
    doc,
    source: () => deps.armory(),
    map: () => deps.title().map,
    names: () => ({ game: deps.title().name, room: '' }),
    closed: () => { if (!gone) show('lobby'); },
    paint: o.paint ?? null,
    ...(o.makeArmory ? { make: o.makeArmory } : {}),
  });

  const openArmory = (): void => {
    void armory.open().then((ok) => { if (ok && !gone) show('armory'); });
  };

  /** FG-45: a visibility change asked and not answered (the control closed meanwhile). */
  let listedBusy = false;
  const toggleListed = (): void => {
    const vis = deps.visibility?.() ?? null;
    if (!vis || listedBusy) return;
    listedBusy = true;
    view.tick();
    void vis.set(!vis.listed()).then((words) => words, () => 'the server did not answer').then((words) => {
      listedBusy = false;
      if (gone) return;
      if (words !== null) view.notice(`The lobby's visibility was not changed: ${words}`);
      view.tick();
    });
  };

  /** FG-48a: a password change asked and not answered (the control closed meanwhile). */
  let passwordBusy = false;
  const setPassword = (password: string | null): void => {
    const pw = deps.password?.() ?? null;
    if (!pw || passwordBusy) return;
    passwordBusy = true;
    view.tick();
    void pw.set(password).then((words) => words, () => 'the server did not answer').then((words) => {
      passwordBusy = false;
      if (gone) return;
      if (words !== null) view.notice(`The lobby's password was not changed: ${words}`);   // never the password itself
      view.tick();
    });
  };

  /** FG-48b: a kick asked and not answered (KICK closed meanwhile). */
  let kickBusy = false;
  const kick = (seat: number): void => {
    const k = deps.kick?.() ?? null;
    if (!k || kickBusy) return;
    const name = deps.lobby()?.seats.find((s) => s.id === seat)?.name ?? null;
    kickBusy = true;
    view.tick();
    void k.kick(seat).then((words) => words, () => 'the server did not answer').then((words) => {
      kickBusy = false;
      if (gone) return;
      if (words !== null) view.notice(`The player was not removed: ${words}`);
      else view.notice(`${name ?? 'The player'} was removed from the lobby`);
      view.tick();
    });
  };

  const view = new LobbyView({
    doc,
    title: () => deps.title(),
    listed: () => { const vis = deps.visibility?.() ?? null; return vis ? { on: vis.listed(), busy: listedBusy } : null; },
    toggleListed,
    password: () => { const pw = deps.password?.() ?? null; return pw ? { locked: pw.locked(), busy: passwordBusy } : null; },
    setPassword,
    kickable: () => (deps.kick?.() ? { busy: kickBusy } : null),
    kick,
    closable: () => (deps.end?.() ?? null) !== null,
    closeLobby: () => { deps.end?.()?.close(); },
    me: () => deps.me(),
    send: (ev) => { deps.send(ev); },
    chat: (text, team) => { deps.chat(text, team); },
    armory: openArmory,
    armoryReady: () => deps.armory() !== null,
    leave: () => { deps.close(); },
    talk: (down) => { voice.talk('pointer', down); },
    ...(o.now ? { now: o.now } : {}),
  });

  const voice = new ForgeLobbyVoice({
    link: () => deps.net(),
    line: (text) => { view.notice(text); },
    typing: () => view.typing(),
    inArmory: () => armory.isOpen(),
    ...(o.voice ? { deps: o.voice } : {}),
  });

  win.body.append(view.root, armory.canvas);
  show('lobby');
  host.append(win.root);
  view.update(deps.lobby());

  const offLobby = deps.onLobby((ev) => {
    view.update(ev);
    // The room started the match: an open ARMORY closes (the page hands the seat on), the lobby view stays.
    if (ev.launched && armory.isOpen()) { armory.close(); show('lobby'); }
  });
  const offChat = deps.onChat((line) => { view.chatLine(line); });

  const seatName = (id: number): string | null => deps.lobby()?.seats.find((s) => s.id === id)?.name ?? null;

  return {
    root: win.root,
    screen: () => screen,
    frame: (dt) => {
      if (gone) return;
      win.setTitle(titleOf());
      view.tick();
      voice.frame();
      view.setTalker(voice.bar(seatName));
      view.setTalking(voice.recording());
      armory.frame(dt);
    },
    pad: (snap) => {
      if (gone) return;
      if (screen === 'armory') { armory.pad(snap); return; }
      const down = new Set<number>();
      if (snap) snap.buttons.forEach((b, i) => { if (b.pressed && READ.has(i)) down.add(i); });
      const was = prev;
      prev = down;
      if (was === null) { stick.hold(); return; }
      const pressed = (i: number): boolean => down.has(i) && !was.has(i);
      // FG-48: a card over the controls takes the pad -- the d-pad walks it, Cross presses, Circle closes it (no talk).
      if (view.cardOpen() !== null) {
        if (pressed(D_PAD.up) || pressed(D_PAD.left)) view.cardMove(-1);
        if (pressed(D_PAD.down) || pressed(D_PAD.right)) view.cardMove(1);
        if (pressed(PAD_BUTTON.Cross)) view.cardPress();
        if (pressed(PAD_BUTTON.Circle)) view.cardCancel();
        if (!down.has(PAD_BUTTON.Circle) && was.has(PAD_BUTTON.Circle)) voice.talk('pad', false);
        return;
      }
      if (pressed(D_PAD.up) || pressed(D_PAD.left)) view.focusMove(-1);
      if (pressed(D_PAD.down) || pressed(D_PAD.right)) view.focusMove(1);
      // AM-1: the left stick, as the d-pad (up and left the control before, down and right the next).
      // AM-1's review F1: the d-pad held, the stick waits -- one step a frame, never the two added.
      if ([D_PAD.up, D_PAD.down, D_PAD.left, D_PAD.right].some((i) => down.has(i))) stick.hold();
      const s = stick.step(snap?.axes ?? [], clock());
      if (s === 'up' || s === 'left') view.focusMove(-1);
      else if (s) view.focusMove(1);
      if (pressed(PAD_BUTTON.Cross)) view.press();
      // Circle: its edges set and clear the pad's talk (the original's VCButton 1x / 0x on its FALLING and RISING).
      if (pressed(PAD_BUTTON.Circle)) voice.talk('pad', true);
      else if (!down.has(PAD_BUTTON.Circle) && was.has(PAD_BUTTON.Circle)) voice.talk('pad', false);
    },
    talk: (down) => { voice.talk('pad', down); },
    notice: (text) => { if (!gone) view.notice(text); },
    setShown: (on) => { if (gone) return; win.root.hidden = !on; prev = null; },
    dispose: () => {
      if (gone) return;
      gone = true;
      offLobby(); offChat();
      voice.release();
      armory.dispose();
      win.dispose();
    },
  };
}
