import type { IconName } from '../icons';
import type { ReplayEntry } from './data';
import type { TransportClient } from './transport';

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
}

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
