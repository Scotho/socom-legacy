import type { IconName } from '../icons';
import type { ReplayEntry } from './data';
import type { TransportClient } from './transport';
import type { ReplaySteerHeld } from './worldHost';

/**
 * Where the viewer page opens a replay (MU-10; MU.R9): the stage's types. A browser adaptation (MU.R1, REPLAY_ADAPTATION).
 *
 * **The engine is the existing one** (MU.R9: the playtest lane's): a stage builds the viewer's own `ReplayClient`
 * (`../../replay/replayClient`) on the viewer's own `loadSegment` (`../../replay/load`) on `GET <base>/replays/<id>`,
 * the hosted replay PT-27 reads, the session's ticket as bearer. MU-11's `./worldStage` is the viewer's stage: it draws
 * the match's world (`world: 'drawn'`), its `view` (the framed test room) and its spectator modes (`spectator`). A stage
 * that draws no world answers `world: 'unwired'` (a test's): the viewer then shows the transport, the state and the
 * roster the client holds. CX-13: `engineStage`, the stage without a world that only its own test opened, is removed.
 */

export interface SpectatorMode { id: string; label: string; icon: IconName }
/** The spectator's camera modes a stage offers (none from a stage without a world: the client holds no camera). */
export interface SpectatorControls {
  modes: readonly SpectatorMode[];
  current(): string;
  set(id: string): void;
  /**
   * PV-8 (PV.R6; a browser adaptation, no original): the sentence why camera `id` cannot be chosen now -- the strip
   * draws it disabled with it -- or null. Absent: every camera can be.
   */
  refused?(id: string): string | null;
  /**
   * PV-8 (PV.R6): camera `id` is the choice but its picture is not drawn this frame -- the player's view fallen back to
   * the follow (the subject dead or absent, the rig warming). The strip marks the lit button (`data-camera-waiting`).
   * Absent: never.
   */
  fallback?(id: string): boolean;
  /**
   * RVK-A (LATER 966, V21.R7; a browser adaptation): a roster name's press -- the camera PLAYER (as its button's press,
   * the choice kept) and the page following body `id`. False, nothing changed, where the page will not follow it.
   * Absent: the roster's names stay text (a stage that cannot follow a body).
   */
  follow?(id: number): boolean;
  /** RVK-A: the body the page follows now; null in free and scenic, or with no page. */
  followed?(): number | null;
  /**
   * RVK-A: whether the page could follow `id` now, for the roster's look: a living body, a dead one, or none. RVK-B's fold
   * of the review's F3: 'wait' while the world's page is not attached yet -- neither refused nor followable; a press then
   * is kept and replayed at the page's attach (`follow`).
   */
  canFollow?(id: number): 'yes' | 'dead' | 'absent' | 'wait';
  /**
   * RVK-B (LATER 966, V21.R7; a browser adaptation): one of the spectator's own controls pressed, as its key's release
   * presses it (`SpectatorView.key`: the next / previous player, the next / previous scenic view, X's toggle, the player
   * in view); a press that moves the camera keeps the strip's choice as a press of its button keeps it. Absent: the
   * viewer has no such control (its keys for them are inert, its context buttons not drawn).
   */
  press?(action: SpectatorPress): void;
  /** RVK-B: what the viewer's keyboard holds on the world's camera now (`./worldHost` `ReplaySteerHeld`); idle lets go. */
  steer?(held: ReplaySteerHeld): void;
  /** RVK-B: the viewer's mouse drag on the world, in CSS pixels, added up until the world's next frame. */
  look?(dx: number, dy: number): void;
  /** RVK-B: the viewer's wheel on the world, in notches (positive away from the user), until the world's next frame. */
  notch?(n: number): void;
}

/** RVK-B: the spectator's own controls the viewer presses (`../../spectatorView`'s actions, by their names). */
export type SpectatorPress = 'next' | 'previous' | 'scenicNext' | 'scenicPrevious' | 'toggle' | 'jump';

export interface ReplayStageContext {
  /** The account requests' base (`accountServiceBase`), the match server's HTTP origin for `/replays/<id>`. */
  base: string;
  /** The session's ticket (memory only), the replay fetch's bearer. */
  ticket: () => string | null;
  /** The watcher's name for the client's welcome. */
  name: string;
  fetch?: typeof fetch;
  /** SA-9b: whether a grant's loopback door (http://127.0.0.1:5343-5349) is followed: a development build's ?devmode only (`connectHost` `replayDevDoors`). */
  devDoors?: boolean;
}

export interface ReplayStageHandle {
  client: TransportClient;
  /** Whether the stage draws the match's world, or only the client's state. */
  world: 'drawn' | 'unwired';
  /** MU-11: what draws the world (`./worldStage`'s framed test room), put in the viewer's world place once. */
  view?: HTMLElement;
  spectator?: SpectatorControls;
  /** Closes the client and takes away whatever the stage drew. */
  dispose(): void;
}

export interface ReplayStage {
  open(entry: ReplayEntry, ctx: ReplayStageContext): Promise<ReplayStageHandle>;
}
