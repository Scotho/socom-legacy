import './devPanel.css';
import { DEV_CLOCK_NOTE, devClockDt, devClockState, type DevClockState } from './devClock';
import { formatDevReadout, type DevLive } from './devReadout';
import { boundsOf, devPlaces, minimapFrame, minimapHit, planPointPlace, type DevPlace, type XzBounds } from './devTargets';
import { DEV_GAPS } from './devGaps';
import { DEV_LOS_NOTE } from './devTraces';
import { DEV_PANEL_KEY, nextCameraMode, planOwnSpawnTeleport } from './devTools';
export { devSpotSearch, readDevSpot } from './devSpot';
export { devPlaces, nearestFloor } from './devTargets';
export { rememberTrace, tracePositions } from './devTraces';
import type { FlyAccess } from './flyAccess';
import { keyboardSite } from './keyboardTesting';

/**
 * `/testroom`'s in-game developer panel. A browser adaptation, a development instrument with no original: fly/walk,
 * teleport, markers, the frame counter, a clock, a readout, and the sections below. Where the page has no command
 * for a thing, the section says so and does not imitate it. Each control starts at the page's own state (the clock at
 * 1x, the ammo, traces and toggles off), and while the panel is closed, the game's clock and ammo are main's; only the
 * drawing overlays may stay. Closing it sets the clock back to 1x, unpaused, and clears infinite ammo (04's ruling,
 * OT.R53): a development instrument left at 0.25x or with infinite ammo while the panel is closed would make a
 * playtester's observation wrong without a visible sign. The switches of the traces, the markers and the collision
 * and wireframe overlays stay until they are toggled: they change nothing of play. Since TRS-CONDENSE (the owner,
 * 2026-11-01: "make the overlay fuse added only show when it's active") the panel's own drawings -- the traces and the
 * markers -- are drawn only while it is open: their switches stay set and draw again when it reopens
 * (`overlaysShown`); collision and wireframe are the page's Advanced switches, and stay drawn.
 *
 * `./main` loads this module with `import()` under `import.meta.env.DEV && devToolsEnabled(...)`, which every
 * `vite build` folds away, so a release holds neither the panel nor this listener. Closed until F2. While it is
 * closed the listener returns on every key but F2 and never calls `preventDefault`, so G and the rest of the page's
 * keys are untouched. F2 is free: the menus, the forge, the launcher and the console keymap do not take it.
 * No pad chord: Start is the fly toggle, Select is the scoreboard, L3+R3 is the playtest mark,
 * and Select+Start leaves a forge match. The key's one assignment is `./devTools` `DEV_PANEL_KEY`, re-exported here.
 */
export { DEV_PANEL_KEY };

/** The firearm's two reads the panel's infinite ammo needs (`./fire` `Fire`). */
export interface DevRefillFire {
  state(): { magazine: { rounds: number; capacity: number } };
  replenishMagazine(): void;
}

/**
 * The panel's infinite ammo, the frame's half: the magazine in the weapon refilled once a shot has emptied it
 * (`Fire.replenishMagazine`). A browser adaptation, a development instrument with no original; `./main` calls it only
 * from this module's gated import, and only while the panel's Infinite ammo box is on.
 */
export function devRefillEmptied(fire: DevRefillFire): void {
  const mag = fire.state().magazine;
  if (mag.rounds === 0 && mag.capacity > 0) fire.replenishMagazine();
}

/**
 * The panel's infinite ammo, the round's half: the firearm reported the round that emptied the magazine, and it is
 * refilled before the reload takes a spare. The same adaptation and the same gate as `devRefillEmptied`.
 */
export function devRefillMagazine(fire: DevRefillFire): void {
  fire.replenishMagazine();
}

export interface DevPanelDeps {
  doc: Document;
  /** The page's `flyAccess` result. The fly control asks `mayEnter` through `nextCameraMode`. */
  access: Pick<FlyAccess, 'toggle'>;
  playing(): boolean;
  mode(): 'walk' | 'fly';
  /** The hook's `setMode` (`window.__viewer`): false when `mayEnter` or the walk refuses. */
  setMode(mode: 'walk' | 'fly'): boolean;
  spawns(): { a: readonly number[]; b: readonly number[] } | null;
  team(): string | null | undefined;
  /** The hook's `teleport`, false when it is absent or the walk refuses the point. */
  teleport(x: number, y: number, z: number, yaw?: number): boolean;
  markers(): boolean;
  setMarkers(on: boolean): void;
  /** Where the page is now. Absent in a test that does not paint the readout. */
  live?: () => DevLive;
  /** Writes the link that reopens this spot. Null when the position is not a number. */
  copySpot?: () => string | null;
  /** Spawns, slots, hostages, extraction and the bomb, when the map has them. */
  places?: () => readonly DevPlace[];
  /**
   * The ground's xz extent. Used only when the map lists no places. The world's drawn box is not this: it leaves
   * the places as a cluster in the middle of the canvas.
   */
  mapBounds?: () => XzBounds | null;
  /** The floor's y at (x, z), or null where the ground has none. A click with no floor is ignored. */
  floorUnder?: (x: number, z: number) => number | null;
  /** The free camera, used in Explore where the walk is refused. */
  setCamera?: (pose: { x: number; y: number; z: number; yaw?: number }) => void;
  /** The page's collision and wireframe toggles, which this panel drives rather than drawing again. */
  worldToggles?: () => { collision: boolean; wireframe: boolean };
  setWorldToggle?: (name: 'collision' | 'wireframe', on: boolean) => void;
  tracesOn?: () => boolean;
  setTraces?: (on: boolean) => void;
  /** This page's magazines, refilled when a shot empties one. The room's own count is not a page command. */
  infiniteAmmo?: () => boolean;
  setInfiniteAmmo?: (on: boolean) => void;
  /** `'ok'` applied at the next spawn, `'bad'` not a kit, `'refused'` the page refused it. */
  applyKit?: (text: string) => 'ok' | 'bad' | 'refused';
  /**
   * Told at each open and close, after the panel's state has turned: the page draws the panel's own traces and markers
   * only while it is open (`./devTools` `devOverlayDrawn`; the owner, 2026-11-01).
   */
  overlaysShown?: (open: boolean) => void;
}

export interface DevPanel {
  isOpen(): boolean;
  setOpen(on: boolean): void;
  /** The frame counter's pair (`Ui.setFps`). Held while closed and painted when the panel is open. */
  sample(fps: number, frameMs: number): void;
  /**
   * The frame's seconds after the clock (`./devClock`). The page calls this every frame, open or closed; closed, it
   * returns the real `dt` untouched, and a release never loads this module, so its frame stays the real `dt`.
   */
  scaleFrame(dt: number): number;
  dispose(): void;
}

export function mountDevPanel(d: DevPanelDeps): DevPanel {
  const doc = d.doc;
  let open = false;
  let fps: number | null = null;
  let frameMs: number | null = null;
  let clock: DevClockState = devClockState();

  const root = doc.createElement('div');
  root.id = 'dev-panel';
  root.className = 's2u-overlay';
  root.hidden = true;
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Developer tools');
  const body = doc.createElement('div');
  body.className = 's2u-overlay__body';
  const kicker = doc.createElement('p');
  kicker.className = 's2u-fine';
  kicker.textContent = `Developer · ${DEV_PANEL_KEY}`;
  const readout = doc.createElement('p');
  readout.id = 'dev-panel-fps';
  readout.className = 's2u-status';
  readout.textContent = '- fps';
  const actions = doc.createElement('div');
  actions.className = 's2u-tabs';
  actions.setAttribute('role', 'group');
  const fly = doc.createElement('button');
  fly.type = 'button';
  fly.id = 'dev-panel-fly';
  fly.className = 's2u-tab';
  const spawn = doc.createElement('button');
  spawn.type = 'button';
  spawn.id = 'dev-panel-spawn';
  spawn.className = 's2u-tab';
  spawn.textContent = 'Own spawn';
  spawn.title = 'Teleport to this side\'s spawn';
  actions.append(fly, spawn);
  const marksLabel = doc.createElement('label');
  marksLabel.className = 's2u-check';
  const marks = doc.createElement('input');
  marks.type = 'checkbox';
  marks.id = 'dev-panel-marks';
  marks.title = 'Show or hide markers for hostages, extraction zones and spawns';
  const marksText = doc.createElement('span');
  marksText.textContent = 'Hostages, zones, spawns';
  marksLabel.append(marks, marksText);
  const time = section(doc, 'Time', 'dev-panel-time');
  const clockRow = doc.createElement('div');
  clockRow.className = 's2u-tabs';
  clockRow.setAttribute('role', 'group');
  const clockButtons: [string, string, () => void][] = [
    ['dev-panel-clock-1', '1×', () => { clock = { scale: 1, step: false }; }],
    ['dev-panel-clock-half', '0.5×', () => { clock = { scale: 0.5, step: false }; }],
    ['dev-panel-clock-quarter', '0.25×', () => { clock = { scale: 0.25, step: false }; }],
    ['dev-panel-pause', 'Pause', () => { clock = { scale: 0, step: false }; }],
    ['dev-panel-step', 'Step', () => { clock = { scale: 0, step: true }; }],
  ];
  const clockEls: HTMLButtonElement[] = [];
  for (const [id, label, apply] of clockButtons) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.id = id;
    button.className = 's2u-tab';
    button.textContent = label;
    button.addEventListener('click', () => { apply(); paintClock(); blur(button); });
    clockEls.push(button);
    clockRow.append(button);
  }
  const clockState = doc.createElement('p');
  clockState.id = 'dev-panel-clock';
  clockState.className = 's2u-status';
  time.append(clockRow, clockState, fine(doc, 'dev-panel-clock-note', DEV_CLOCK_NOTE));
  const place = section(doc, 'Readout', 'dev-panel-readout');
  const liveText = doc.createElement('p');
  liveText.id = 'dev-panel-live';
  liveText.className = 's2u-status';
  liveText.textContent = '-';
  const copy = doc.createElement('button');
  copy.type = 'button';
  copy.id = 'dev-panel-copy';
  copy.className = 's2u-tab';
  copy.textContent = 'Copy link';
  const copyNote = doc.createElement('p');
  copyNote.id = 'dev-panel-copy-note';
  copyNote.className = 's2u-fine';
  copyNote.textContent = 'Reopens this map, mode, position and facing.';
  place.append(liveText, copy, copyNote);
  const teleport = section(doc, 'Teleport', 'dev-panel-teleport');
  const field = doc.createElement('div');
  field.className = 's2u-field';
  const placesLabel = doc.createElement('label');
  placesLabel.className = 's2u-field__label';
  placesLabel.htmlFor = 'dev-panel-places';
  placesLabel.textContent = 'Places';
  const places = doc.createElement('select');
  places.id = 'dev-panel-places';
  const go = doc.createElement('button');
  go.type = 'button';
  go.id = 'dev-panel-go';
  go.className = 's2u-tab';
  go.textContent = 'Go';
  const map = doc.createElement('canvas');
  map.id = 'dev-panel-map';
  map.width = 288;
  map.height = 140;
  const mapNote = doc.createElement('p');
  mapNote.className = 's2u-fine';
  mapNote.textContent = 'Click the map to stand there. The top of the map is +z.';
  field.append(placesLabel, places);
  teleport.append(field, go, map, mapNote);
  const visual = section(doc, 'Visual', 'dev-panel-visual');
  const collisionBox = check(doc, 'dev-panel-collision', 'Collision');
  const wireBox = check(doc, 'dev-panel-wireframe', 'Wireframe');
  const traceBox = check(doc, 'dev-panel-traces', 'Bullet traces');
  const los = doc.createElement('p');
  los.id = 'dev-panel-los';
  los.className = 's2u-fine';
  los.textContent = DEV_LOS_NOTE;
  visual.append(collisionBox.label, wireBox.label, traceBox.label, los);
  const cheats = section(doc, 'Cheats', 'dev-panel-cheats');
  const ammo = check(doc, 'dev-panel-ammo', 'Infinite ammo');
  const ammoNote = fine(doc, 'dev-panel-ammo-note', DEV_GAPS.ammo);
  const god = fine(doc, 'dev-panel-god', DEV_GAPS.god);
  const health = fine(doc, 'dev-panel-health', DEV_GAPS.health);
  const kitField = doc.createElement('div');
  kitField.className = 's2u-field';
  const kitLabel = doc.createElement('label');
  kitLabel.className = 's2u-field__label';
  kitLabel.htmlFor = 'dev-panel-kit';
  kitLabel.textContent = 'Kit';
  const kitInput = doc.createElement('input');
  kitInput.id = 'dev-panel-kit';
  kitInput.type = 'text';
  kitInput.spellcheck = false;
  const kitApply = doc.createElement('button');
  kitApply.type = 'button';
  kitApply.id = 'dev-panel-kit-apply';
  kitApply.className = 's2u-tab';
  kitApply.textContent = 'Apply kit';
  const kitNote = fine(doc, 'dev-panel-kit-note', DEV_GAPS.kit);
  const kitStatus = doc.createElement('p');
  kitStatus.id = 'dev-panel-kit-status';
  kitStatus.className = 's2u-status';
  kitField.append(kitLabel, kitInput);
  cheats.append(ammo.label, ammoNote, god, health, kitField, kitApply, kitNote, kitStatus);
  const round = section(doc, 'Round', 'dev-panel-round');
  round.append(fine(doc, 'dev-panel-hostages', DEV_GAPS.hostages), fine(doc, 'dev-panel-round-result', DEV_GAPS.round), fine(doc, 'dev-panel-timer', DEV_GAPS.timer));
  const bots = section(doc, 'Bots', 'dev-panel-bots');
  bots.append(fine(doc, 'dev-panel-bots-spawn', DEV_GAPS.bots), fine(doc, 'dev-panel-bots-view', DEV_GAPS.botView));
  body.append(kicker, readout, actions, marksLabel, time, place, teleport, visual, cheats, round, bots);
  root.append(body);
  (doc.body ?? doc.documentElement).append(root);

  const paintReadout = (): void => {
    readout.textContent = fps === null || frameMs === null ? '- fps' : `${Math.round(fps)} fps · ${frameMs.toFixed(1)} ms`;
  };
  const paintControls = (): void => {
    const next = nextCameraMode(d.mode(), d.playing(), d.access);
    const word = next ?? (d.mode() === 'walk' ? 'fly' : 'walk');
    fly.textContent = word === 'fly' ? 'Fly' : 'Walk';
    fly.disabled = next === null;
    fly.title = next === null ? 'Not available in this mode' : `${next === 'fly' ? 'Fly' : 'Walk'} (G)`;
    marks.checked = d.markers();
  };
  const blur = (el: HTMLElement): void => { el.blur(); };
  const paintLive = (): void => {
    const live = d.live?.();
    liveText.textContent = live ? formatDevReadout(live) : '-';
  };
  let mapBounds: XzBounds | null = null;
  let listed = '';
  const placeAt = (at: readonly [number, number, number], yaw: number | null): void => {
    if (planPointPlace(d.mode(), d.playing(), d.access) === 'walk') {
      if (d.mode() !== 'walk' && !d.setMode('walk')) return;
      d.teleport(at[0], at[1], at[2], yaw ?? undefined);
      return;
    }
    d.setCamera?.({ x: at[0], y: at[1], z: at[2], ...(yaw === null ? {} : { yaw }) });
  };
  const paintMap = (list: readonly DevPlace[]): void => {
    const ctx = map.getContext('2d');
    mapBounds = boundsOf(list.map((p) => p.at)) ?? d.mapBounds?.() ?? null;
    if (!ctx) return;
    ctx.clearRect(0, 0, map.width, map.height);
    const style = getComputedStyle(map);
    ctx.fillStyle = style.getPropertyValue('--s2u-ground-deep').trim() || style.backgroundColor || '#000';
    ctx.fillRect(0, 0, map.width, map.height);
    if (!mapBounds) return;
    const bounds = mapBounds;
    const frame = minimapFrame(bounds, map.width, map.height);
    if (!frame) return;
    const plot = (x: number, z: number): [number, number] => [
      frame.x + (x - bounds.minX) / (bounds.maxX - bounds.minX) * frame.w,
      frame.y + (bounds.maxZ - z) / (bounds.maxZ - bounds.minZ) * frame.h,
    ];
    ctx.fillStyle = style.getPropertyValue('--s2u-gold').trim() || '#fff';
    for (const p of list) {
      const [px, py] = plot(p.at[0], p.at[2]);
      ctx.fillRect(px - 2, py - 2, 4, 4);
    }
    if (d.live) {
      const here = d.live();
      const [px, py] = plot(here.x, here.z);
      ctx.fillStyle = style.getPropertyValue('--s2u-highlight').trim() || '#fff';
      ctx.fillRect(px - 3, py - 3, 6, 6);
    }
  };
  const paintPlaces = (): void => {
    const list = d.places?.() ?? [];
    const key = list.map((p) => p.id).join('|');
    if (key !== listed) {
      listed = key;
      const chosen = places.value;
      places.replaceChildren();
      const empty = doc.createElement('option');
      empty.value = '';
      empty.textContent = list.length ? 'Choose a place' : 'No places on this map';
      places.append(empty);
      for (const p of list) {
        const opt = doc.createElement('option');
        opt.value = p.id;
        opt.textContent = p.label;
        places.append(opt);
      }
      if (list.some((p) => p.id === chosen)) places.value = chosen;
    }
    paintMap(list);
  };
  go.addEventListener('click', () => {
    const picked = (d.places?.() ?? []).find((p) => p.id === places.value);
    if (picked) placeAt(picked.at, picked.yaw);
    blur(go);
  });
  const paintVisual = (): void => {
    const world = d.worldToggles?.();
    if (world) { collisionBox.input.checked = world.collision; wireBox.input.checked = world.wireframe; }
    if (d.tracesOn) traceBox.input.checked = d.tracesOn();
  };
  collisionBox.input.addEventListener('change', () => { d.setWorldToggle?.('collision', collisionBox.input.checked); });
  wireBox.input.addEventListener('change', () => { d.setWorldToggle?.('wireframe', wireBox.input.checked); });
  traceBox.input.addEventListener('change', () => { d.setTraces?.(traceBox.input.checked); });
  const paintCheats = (): void => { if (d.infiniteAmmo) ammo.input.checked = d.infiniteAmmo(); };
  ammo.input.addEventListener('change', () => { d.setInfiniteAmmo?.(ammo.input.checked); });
  kitApply.addEventListener('click', () => {
    const result = d.applyKit?.(kitInput.value);
    kitStatus.textContent = result === 'ok' ? 'Kit applies at the next spawn.' : result === 'refused' ? 'The kit was refused.' : 'Use up to five item ids, 0-255.';
    blur(kitApply);
  });
  map.addEventListener('click', (e) => {
    if (!mapBounds) return;
    const rect = map.getBoundingClientRect();
    const px = rect.width > 0 ? (e.clientX - rect.left) / rect.width * map.width : 0;
    const py = rect.height > 0 ? (e.clientY - rect.top) / rect.height * map.height : 0;
    const hit = minimapHit(mapBounds, px, py, map.width, map.height);
    if (!hit || !d.floorUnder) return;
    const y = d.floorUnder(hit.x, hit.z);
    if (y === null) return;
    placeAt([hit.x, y, hit.z], d.live?.().yaw ?? null);
  });
  copy.addEventListener('click', () => {
    const wrote = d.copySpot?.() ?? null;
    copyNote.textContent = wrote ? 'Link copied.' : 'No link: the position is not a number.';
    blur(copy);
  });
  const paintClock = (): void => {
    const paused = !(clock.scale > 0);
    clockState.textContent = clock.step ? 'step' : paused ? 'paused' : `${clock.scale}×`;
    const pressed = clock.step ? 'dev-panel-step' : clock.scale === 1 ? 'dev-panel-clock-1' : clock.scale === 0.5 ? 'dev-panel-clock-half' : clock.scale === 0.25 ? 'dev-panel-clock-quarter' : 'dev-panel-pause';
    for (const button of clockEls) button.setAttribute('aria-pressed', button.id === pressed ? 'true' : 'false');
  };

  fly.addEventListener('click', () => {
    const next = nextCameraMode(d.mode(), d.playing(), d.access);
    if (!next || !d.setMode(next)) return;
    paintControls();
    blur(fly);
  });
  spawn.addEventListener('click', () => {
    const plan = planOwnSpawnTeleport(d.mode(), d.playing(), d.access, d.spawns(), d.team());
    if (!plan) return;
    if (d.mode() !== 'walk' && !d.setMode('walk')) return;
    d.teleport(plan.at[0]!, plan.at[1]!, plan.at[2]!);
    paintControls();
    blur(spawn);
  });
  marks.addEventListener('change', () => { d.setMarkers(marks.checked); });

  /** Closing hands the clock and the ammo back to the page (04, OT.R53); the overlays' switches stay as they are set. */
  const handBack = (): void => {
    clock = devClockState();
    ammo.input.checked = false;
    d.setInfiniteAmmo?.(false);
  };
  const setOpen = (on: boolean): void => {
    open = on;
    root.hidden = !on;
    if (!on) handBack();
    if (!on && root.contains(doc.activeElement)) blur(doc.activeElement as HTMLElement);
    if (on) { paintReadout(); paintControls(); paintClock(); paintLive(); paintPlaces(); paintVisual(); paintCheats(); }
    d.overlaysShown?.(on);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.code !== DEV_PANEL_KEY || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    setOpen(!open);
  };
  if (import.meta.env.DEV) {                                       // OT.R29: a development build's only
    keyboardSite('s2u-kb-dev-panel');
    globalThis.addEventListener('keydown', onKey);
  }

  return {
    isOpen: () => open,
    setOpen,
    sample: (nextFps, nextFrame) => {
      if (!Number.isFinite(nextFps) || !Number.isFinite(nextFrame) || nextFrame < 0) return;
      fps = nextFps;
      frameMs = nextFrame;
      if (open) { paintReadout(); paintControls(); paintLive(); paintPlaces(); }
    },
    scaleFrame: (dt) => {
      if (!open) return dt;                                         // closed: the page's own clock (04, OT.R53)
      const next = devClockDt(clock, dt);
      clock = next.state;
      if (open) paintClock();
      return next.dt;
    },
    dispose: () => { globalThis.removeEventListener('keydown', onKey); root.remove(); },
  };
}

function fine(doc: Document, id: string, text: string): HTMLParagraphElement {
  const p = doc.createElement('p');
  p.id = id;
  p.className = 's2u-fine';
  p.textContent = text;
  return p;
}

function check(doc: Document, id: string, text: string): { label: HTMLLabelElement; input: HTMLInputElement } {
  const label = doc.createElement('label');
  label.className = 's2u-check';
  const input = doc.createElement('input');
  input.type = 'checkbox';
  input.id = id;
  const span = doc.createElement('span');
  span.textContent = text;
  label.append(input, span);
  return { label, input };
}

function section(doc: Document, title: string, id: string): HTMLDetailsElement {
  const el = doc.createElement('details');
  el.className = 's2u-disclosure';
  el.id = id;
  const summary = doc.createElement('summary');
  summary.textContent = title;
  el.append(summary);
  return el;
}
