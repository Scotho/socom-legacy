import type { SpectatorPress } from './stage';
import type { TransportAction } from './transport';
import { MU_REPLAY_JUMP_SECONDS_ADAPTATION } from './transportStrings';
import type { ReplaySteerHeld } from './worldHost';

/**
 * The replay viewer's keyboard and mouse, ONE table (RVK-B, LATER 966, V21.R7; the owner, 2026-11-12: "The replay mode
 * should be fully navigable with keyboard and mouse. Every view."; closes LATER 628 and the replay batch's Q6, "the replay
 * viewer gets keyboard shortcuts in every build"). A browser adaptation with no original -- SOCOM II plays no recording
 * back -- of the viewer alone: the launcher's Watch and the public `/replay/<id>` page, in every build. Nothing a match
 * does changes and a match page gains no key and no mouse (OT.R29, OT.R38 stand for a match; OT.R48 untouched): the
 * listeners are the viewer's own elements' (`./view`, `./transport`), never the window's, and the framed world stays deaf
 * (`./worldSteer`).
 *
 * `VIEWER_KEY_ROWS` is the map; the listeners (`./transport`'s `TRANSPORT_KEYS`, `./view`'s camera and steer keys), the
 * tooltips and `aria-keyshortcuts`, and the keys list (`./keysList`) all read it, so they cannot disagree. A key is never
 * read with Ctrl, Alt or Meta; a typed field keeps its keys; Enter and Space on a focused control are that control's.
 * Changes from the development build's maps, on purpose (the controller's ruling): Left / Right are no longer the
 * transport's snapshot steps (`,` and `.` are, as they were advertised) but the spectator's previous / next player, as
 * the pad's D-pad is; Space is play / pause only; V is not X's alias; Shift is the look modifier, not "down". A key the
 * map gives to one camera is taken and does nothing in the others (it never falls through to the console's walk).
 */

/**
 * The viewer's cameras, by the stage's mode ids (`./worldStage` `CAMERA_MODES`). PV-RVK (the merge with the player's-view
 * lane): `'pov'`, the strip's PLAYER'S VIEW (PV-8) -- its key the next free number, 4, by its id and not its place in the
 * strip (second), so PLAYER, FREE and SCENIC keep the 1, 2 and 3 v0.4.21 ships with (the controller's ruling 2).
 */
export type ViewerCamera = 'follow' | 'pov' | 'free' | 'scenic';

/** What a row does when its key is pressed. `steer`, `look`, `mouse` and `seek` rows are read by their own maps below. */
export type ViewerKeyAct =
  | { kind: 'transport'; action: TransportAction }
  | { kind: 'camera'; camera: ViewerCamera }
  | { kind: 'press'; press: SpectatorPress }
  | { kind: 'list' }
  | { kind: 'back' }
  | { kind: 'steer' }
  | { kind: 'look' }
  | { kind: 'mouse' }
  | { kind: 'seek' };

/** The keys list's groups, in its order. */
export type ViewerKeySection = 'playback' | 'camera' | 'free' | 'scenic' | 'mouse';
export const VIEWER_KEY_SECTIONS: readonly (readonly [ViewerKeySection, string])[] = [
  ['playback', 'Playback'], ['camera', 'Camera'], ['free', 'Free camera'], ['scenic', 'Scenic views'], ['mouse', 'Mouse on the picture'],
];

/**
 * One row: the key codes the listeners read (`KeyboardEvent.code`; none for a gesture or a key read by its `key`), the
 * caps the tooltips and the list show, the `aria-keyshortcuts` value, what it does, and the controller's way to the same
 * (the pad's reach: the launcher's walk and Cross, and the world's own spectator controls).
 */
export interface ViewerKeyRow {
  section: ViewerKeySection;
  codes: readonly string[];
  caps: readonly string[];
  shortcut: string;
  does: string;
  pad: string;
  act: ViewerKeyAct;
}

const J = MU_REPLAY_JUMP_SECONDS_ADAPTATION;
const WALK = 'D-pad to it, Cross';

/** The map (the brief's table, row by row). */
export const VIEWER_KEY_ROWS: readonly ViewerKeyRow[] = Object.freeze([
  { section: 'playback', codes: ['Space', 'KeyK'], caps: ['Space', 'K'], shortcut: 'Space K', does: 'Play / pause', pad: WALK, act: { kind: 'transport', action: 'toggle' } },
  { section: 'playback', codes: ['KeyJ'], caps: ['J'], shortcut: 'J', does: `Back ${J} seconds (held: pages back)`, pad: `${WALK} (held: pages)`, act: { kind: 'transport', action: 'jump-back' } },
  { section: 'playback', codes: ['KeyL'], caps: ['L'], shortcut: 'L', does: `On ${J} seconds (held: pages on)`, pad: `${WALK} (held: pages)`, act: { kind: 'transport', action: 'jump-forward' } },
  { section: 'playback', codes: ['Comma'], caps: [','], shortcut: ',', does: 'One snapshot back', pad: WALK, act: { kind: 'transport', action: 'back' } },
  { section: 'playback', codes: ['Period'], caps: ['.'], shortcut: '.', does: 'One snapshot on', pad: WALK, act: { kind: 'transport', action: 'forward' } },
  { section: 'playback', codes: ['BracketLeft', 'Minus'], caps: ['[', '-'], shortcut: '[ -', does: 'Slower', pad: WALK, act: { kind: 'transport', action: 'slower' } },
  { section: 'playback', codes: ['BracketRight', 'Equal'], caps: [']', '='], shortcut: '] =', does: 'Faster', pad: WALK, act: { kind: 'transport', action: 'faster' } },
  { section: 'playback', codes: ['Home'], caps: ['Home'], shortcut: 'Home', does: 'To the start', pad: WALK, act: { kind: 'transport', action: 'start' } },
  { section: 'playback', codes: ['End'], caps: ['End'], shortcut: 'End', does: 'To the end', pad: WALK, act: { kind: 'transport', action: 'end' } },
  { section: 'playback', codes: ['KeyB'], caps: ['B'], shortcut: 'B', does: 'Previous round', pad: WALK, act: { kind: 'transport', action: 'round-back' } },
  { section: 'playback', codes: ['KeyN'], caps: ['N'], shortcut: 'N', does: 'Next round', pad: WALK, act: { kind: 'transport', action: 'round-forward' } },
  { section: 'playback', codes: [], caps: ['← ↓', '→ ↑'], shortcut: 'ArrowLeft ArrowRight', does: `On the seek bar: back / on ${J} seconds`, pad: 'D-pad Left / Right on the bar', act: { kind: 'seek' } },
  { section: 'camera', codes: ['Digit1', 'Numpad1'], caps: ['1'], shortcut: '1', does: 'Player camera', pad: WALK, act: { kind: 'camera', camera: 'follow' } },
  { section: 'camera', codes: ['Digit2', 'Numpad2'], caps: ['2'], shortcut: '2', does: 'Free camera', pad: WALK, act: { kind: 'camera', camera: 'free' } },
  { section: 'camera', codes: ['Digit3', 'Numpad3'], caps: ['3'], shortcut: '3', does: 'Scenic views', pad: WALK, act: { kind: 'camera', camera: 'scenic' } },
  // PV-RVK (ruling 2): the player's view on the next free number. PV-13c item 4: what it does in the list's sentence case,
  // as its siblings' rows (the strip's capitals, `./view` CAMERA_WORDS "Player's View", are the strip's style)
  { section: 'camera', codes: ['Digit4', 'Numpad4'], caps: ['4'], shortcut: '4', does: "Player's view", pad: WALK, act: { kind: 'camera', camera: 'pov' } },
  { section: 'camera', codes: ['KeyX'], caps: ['X'], shortcut: 'X', does: 'Free camera and back to the last camera', pad: 'Cross (the world\'s)', act: { kind: 'press', press: 'toggle' } },
  { section: 'camera', codes: ['ArrowLeft'], caps: ['←'], shortcut: 'ArrowLeft', does: 'Previous player', pad: 'D-pad Left (the world\'s)', act: { kind: 'press', press: 'previous' } },
  { section: 'camera', codes: ['ArrowRight'], caps: ['→'], shortcut: 'ArrowRight', does: 'Next player', pad: 'D-pad Right (the world\'s)', act: { kind: 'press', press: 'next' } },
  { section: 'camera', codes: ['ArrowUp'], caps: ['↑'], shortcut: 'ArrowUp', does: 'Next scenic view', pad: 'D-pad Up (the world\'s)', act: { kind: 'press', press: 'scenicNext' } },
  { section: 'camera', codes: ['ArrowDown'], caps: ['↓'], shortcut: 'ArrowDown', does: 'Previous scenic view', pad: 'D-pad Down (the world\'s)', act: { kind: 'press', press: 'scenicPrevious' } },
  { section: 'camera', codes: ['KeyC'], caps: ['C'], shortcut: 'C', does: 'The player in view', pad: 'Triangle (the world\'s)', act: { kind: 'press', press: 'jump' } },
  { section: 'camera', codes: ['Escape'], caps: ['Esc'], shortcut: 'Escape', does: 'Back (this list first, when it is open)', pad: 'Circle', act: { kind: 'back' } },
  { section: 'camera', codes: [], caps: ['?'], shortcut: '?', does: 'This list', pad: WALK, act: { kind: 'list' } },
  { section: 'free', codes: ['KeyW', 'KeyS'], caps: ['W', 'S'], shortcut: 'W S', does: 'Fly forward / back', pad: 'Left stick', act: { kind: 'steer' } },
  { section: 'free', codes: ['KeyA', 'KeyD'], caps: ['A', 'D'], shortcut: 'A D', does: 'Fly left / right', pad: 'Left stick', act: { kind: 'steer' } },
  { section: 'free', codes: ['KeyE', 'KeyQ'], caps: ['E', 'Q'], shortcut: 'E Q', does: 'Up / down', pad: 'Square: up', act: { kind: 'steer' } },
  { section: 'free', codes: [], caps: ['W twice, held'], shortcut: '', does: 'Boost', pad: 'Circle, held (a replay\'s own page; on the launcher\'s Watch Circle is Close)', act: { kind: 'steer' } },
  { section: 'free', codes: [], caps: ['Shift + arrows'], shortcut: 'Shift+ArrowLeft Shift+ArrowRight Shift+ArrowUp Shift+ArrowDown', does: 'Look', pad: 'Right stick', act: { kind: 'look' } },
  { section: 'scenic', codes: ['KeyW', 'KeyS'], caps: ['W', 'S'], shortcut: 'W S', does: 'Zoom in / out', pad: 'Left stick up / down', act: { kind: 'steer' } },
  { section: 'scenic', codes: [], caps: ['Shift + arrows'], shortcut: 'Shift+ArrowLeft Shift+ArrowRight Shift+ArrowUp Shift+ArrowDown', does: 'Look', pad: 'Right stick', act: { kind: 'look' } },
  { section: 'mouse', codes: [], caps: ['Drag'], shortcut: '', does: 'Look (Free, Scenic)', pad: 'Right stick', act: { kind: 'mouse' } },
  { section: 'mouse', codes: [], caps: ['Wheel'], shortcut: '', does: 'Fly speed (Free), zoom (Scenic)', pad: '—', act: { kind: 'mouse' } },
] satisfies ViewerKeyRow[]);

/**
 * A word the list says where it matters (RVK-B's "not in this task"): the world's own pad read beside the launcher's, and
 * the public page's pad. A browser adaptation's words.
 */
export const VIEWER_KEYS_NOTE = 'On the launcher\'s Watch the controller\'s D-pad and Cross also reach the world itself; on a replay\'s own page the controller drives the world only. While paused, the play button at the picture\'s centre is play / pause: drag and wheel off it.';

/**
 * The code the viewer's listeners read for `e` (the review's finding 6): a numpad digit is that digit only while it types
 * one (NumLock on, `e.key` the digit); with NumLock off it is what it sends -- End, the arrows, Home, Page Up / Down,
 * Insert, Delete -- read as that key (End: to the end; Down: the previous scenic view; Page Down: nothing of the
 * viewer's). Every other code is its own.
 */
const NUMPAD_NAV: ReadonlySet<string> = new Set(['Home', 'End', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Insert', 'Delete', 'Clear']);
export function viewerCode(e: { code: string; key: string }): string {
  if (!/^Numpad\d$/.test(e.code)) return e.code;
  if (/^\d$/.test(e.key)) return e.code;
  return NUMPAD_NAV.has(e.key) ? e.key : '';
}

/** `TRANSPORT_KEYS` (`./transport`): the transport's rows, by code. */
export function transportKeyMap(): Readonly<Record<string, TransportAction>> {
  const out: Record<string, TransportAction> = {};
  for (const r of VIEWER_KEY_ROWS) if (r.act.kind === 'transport') for (const c of r.codes) out[c] = r.act.action;
  return Object.freeze(out);
}

/** The row of a transport action, a camera or a spectator press (the tooltips and `aria-keyshortcuts` read it). */
export function rowOf(act: ViewerKeyAct): ViewerKeyRow | null {
  const same = (a: ViewerKeyAct): boolean => {
    if (a.kind !== act.kind) return false;
    if (a.kind === 'transport' && act.kind === 'transport') return a.action === act.action;
    if (a.kind === 'camera' && act.kind === 'camera') return a.camera === act.camera;
    if (a.kind === 'press' && act.kind === 'press') return a.press === act.press;
    return a.kind === 'list' || a.kind === 'back';
  };
  return VIEWER_KEY_ROWS.find((r) => same(r.act)) ?? null;
}

/** The viewer's own keys by code: the cameras, the spectator's presses, Back. */
export const VIEWER_CAMERA_KEYS: Readonly<Record<string, ViewerKeyAct>> = Object.freeze(Object.fromEntries(
  VIEWER_KEY_ROWS.filter((r) => r.act.kind === 'camera' || r.act.kind === 'press' || r.act.kind === 'back').flatMap((r) => r.codes.map((c) => [c, r.act] as const)),
));

/** One push of a held key on the world's camera (`steerOf` adds them up). */
export type SteerPart = 'forward' | 'back' | 'left' | 'right' | 'up' | 'down' | 'zoomIn' | 'zoomOut' | 'lookLeft' | 'lookRight' | 'lookUp' | 'lookDown';

/**
 * The held keys of each camera (the FREE and SCENIC rows above); PLAYER has none, nor (PV-RVK, ruling 2) the player's view:
 * its picture is the watched player's own camera, which the watcher does not steer (`../../spectatorView` PV-6a: the
 * watcher's sticks move nothing in the follow; Cross's hold, `voidHold`, is the pad's alone and no key's). Every one of them
 * is taken in every camera.
 */
export const VIEWER_STEER_KEYS: Readonly<Record<ViewerCamera, Readonly<Record<string, SteerPart>>>> = Object.freeze({
  follow: {},
  pov: {},
  free: { KeyW: 'forward', KeyS: 'back', KeyA: 'left', KeyD: 'right', KeyE: 'up', KeyQ: 'down' },
  scenic: { KeyW: 'zoomIn', KeyS: 'zoomOut' },
});
/** The keys any camera's steer takes (inert where the camera has no use for them). */
export const STEER_CODES: ReadonlySet<string> = new Set(Object.values(VIEWER_STEER_KEYS).flatMap((m) => Object.keys(m)));
/** Shift held: the arrows look (FREE, SCENIC; taken and inert in PLAYER). */
export const VIEWER_LOOK_KEYS: Readonly<Record<string, SteerPart>> = Object.freeze({
  ArrowLeft: 'lookLeft', ArrowRight: 'lookRight', ArrowUp: 'lookUp', ArrowDown: 'lookDown',
});

/**
 * REPLAY_BOOST_DOUBLE_TAP_MS_ADAPTATION: W pressed again within this many ms of its last press, and held, boosts the
 * free camera -- the fly camera's own double tap (`../../camera.ts` `DOUBLE_TAP_MS`, 300), read here because the viewer
 * holds the keys and the frame hears none. A browser adaptation.
 */
export const REPLAY_BOOST_DOUBLE_TAP_MS_ADAPTATION = 300;

/**
 * What the held keys hold on `camera`'s world (`./worldHost` `ReplaySteerHeld`): FREE the left stick (W / S forward,
 * D / A right), the lift (E up, Q down), the boost and the right stick (the Shift arrows); SCENIC the zoom stick (W / S,
 * the left stick's y) and the right stick; PLAYER nothing (the follow pose is the world's own), and the player's view
 * nothing (PV-RVK: the watched player's own camera). Opposites cancel.
 */
export function steerOf(camera: string, held: ReadonlySet<SteerPart>, boost: boolean): ReplaySteerHeld {
  const h = (p: SteerPart): number => (held.has(p) ? 1 : 0);
  const lookX = h('lookRight') - h('lookLeft'), lookY = h('lookUp') - h('lookDown');
  if (camera === 'free') {
    return { moveX: h('right') - h('left'), moveY: h('forward') - h('back'), lift: h('up') - h('down'), boost, lookX, lookY };
  }
  if (camera === 'scenic') return { moveX: 0, moveY: h('zoomIn') - h('zoomOut'), lift: 0, boost: false, lookX, lookY };
  return { moveX: 0, moveY: 0, lift: 0, boost: false, lookX: 0, lookY: 0 };
}

/** Whether two held states are the same (the viewer writes the lane only when it changes). */
export function sameSteer(a: ReplaySteerHeld, b: ReplaySteerHeld): boolean {
  return a.moveX === b.moveX && a.moveY === b.moveY && a.lift === b.lift && a.boost === b.boost && a.lookX === b.lookX && a.lookY === b.lookY;
}
