import type { Loadout, Side } from '@s2u/scene';
import { Armory, ARMORY_PAD, armoryNames, parseProfile, profileKey, type ArmoryWorld } from './armory';
import type { ArmoryData } from './armoryData';
import { armoryRoundHooks } from './armoryGlue';
import { ARMORY_SEND_NOW_S, armorySend, type ArmorySend } from './armorySend';
import { PULL_OUT_SECONDS, type ArmoryExit } from './armoryState';
import { ArmoryView, type ArmoryRenderer } from './armoryView';
import type { LoadedMap } from './loadMap';
import type { GamepadLike, PadButton } from './gamepad';
import { ArmoryStick } from './lobbyArmory';
import type { PlayerLoadout } from './loadout';
import { menuStick } from './menuInput';
import type { TipStore } from './mobileTip';
import { LEFT_DEAD_ZONE } from './moveStick';
import type { NetPageDeps } from './netPage';
import type { NetPage } from './netPage';
import type { ViewerHook } from './hook';

/**
 * PAR-2 (PARITY-2; audit A.2): the seat ARMORY as one part both pages mount -- `/testroom` (`./main`) and the front end's
 * match (`./matchMount`, OT.R43: the two matches are equivalent) -- written once here from `main.ts`'s lines at
 * 37c1dd0bd (main.ts:306-432 the screen, its live send, its round hooks, its world, its open, its change, its data;
 * main.ts:1615-1619 the frame's pull-out, step and draw; main.ts:1744-1748 the `NetPage` deps; main.ts:2164-2174 the
 * hook's read). The screen is `./armory` (web sprint 5 S3, W5.R1-R4; research 95), the send `./armorySend`
 * (ARMORY_ROUND_START_RACE_READING), the round hooks `./armoryGlue` (ARMORY_ABANDON_READING), the room's seat
 * `ARMORY_SEAT_READING` (`match/src/room.ts`): none of their values is touched here; this module only wires them once.
 *
 * What each page keeps as its own adapter (nothing here imports `./main` or reads page markup, OT.R12):
 * - `/testroom`: the worker's `armory` request and its answer (`askArmory`, the round screens' hand-off beside it), the
 *   offline match's room made when the screen is left (`soloAfterArmory`, the `done` hook) and its once-a-map-entry
 *   open, `&noarmory` and Play mode (`playing`), its keys, its canvas taps and its touch layer (`./armoryGlue`), and the
 *   `__viewer` hook's `openArmory` / `armoryKey`.
 * - the front end: the lobby's ARMORY read for the mission (`MatchMountOptions.armory`, `frontEnd.ts`'s `armoryRead`:
 *   PAR-3's one decode), the match's own audio, the pad (controller first, OT.R29: no keyboard path), and its
 *   decal-and-air clear, which `./matchNet` runs ahead of these hooks (`MatchNetParts.roundClear`).
 */

/** What the part reads: the page's match, map, side and kit, read at a call (the page makes them after the part). */
export interface MatchArmoryDeps {
  /** The page's match (`NetPage`): the seat's `ready`, the server's name, the round-end clock, the type's answer. */
  net(): Pick<NetPage, 'armoryDone' | 'serverName' | 'nextRoundIn' | 'answersType' | 'typeChosen'> | null;
  /** The map on screen (its arsenal and valves, its path for the save's key); null before one. */
  map(): Pick<LoadedMap, 'arsenal' | 'path' | 'archive' | 'name'> | null;
  /** The page's side in the match (`./matchCore` `matchSide`). */
  side(): Side;
  /** The runtime kit (`./loadout`): the type and the kit it opens on, and S2's seam a change goes through. */
  loadouts: Pick<PlayerLoadout, 'type' | 'pending' | 'base' | 'setType' | 'setPicks' | 'setLoadout'> & Partial<Pick<PlayerLoadout, 'equipmentLimit'>>;
  /** WEAPON EXCHANGE's rows shown the kit a change made (`./matchExchange` `answer`, main.ts:406). */
  answer(kit: Loadout): void;
  /** Whether the page opens the ARMORY at all (`/testroom`: `!NO_ARMORY && playOn`; the front end: always). */
  playing(): boolean;
  /** Whether the title bar names the server (`/testroom`: not the offline room; the front end: always), with a match. */
  online(): boolean;
  /** The UI bank's cues (`HUDUI.bnk`, research 95 §3.9): the page's audio. */
  audio: { play(name: string, at: null): unknown; restart(name: string): unknown };
  /** The saved loadouts' store (`./mobileTip` `storeOf`); absent, none saved. */
  store?: TipStore;
  /** The device the screen's lines are drawn for. */
  device(): 'pad' | 'keyboard' | 'touch';
  /** The screen opened: the game's input the screen's from this frame (the S3 review). */
  opened?(): void;
  /** After the seat is done with it (closed, or no screen to open): `/testroom`'s offline room made (`soloAfterArmory`). */
  done?(): void;
  /** The page's warm-up of the screen's passes, when its data lands (`ArmoryView.warmTargets`). */
  warm?(): void;
  /** The decal pools emptied at a round's start and an abandon (`./armoryGlue`); absent, the page clears them itself. */
  clearDecals?(): void;
  /** The air emptied at a round's start and an abandon (`./armoryGlue`); absent, the page clears it itself. */
  clearAir?(): void;
  /** Seconds, the screen's clock; absent, `performance.now()`'s (main.ts:321). */
  clock?(): number;
  /**
   * LATER 408: CONTROLLER OPTIONS' DEAD ZONE now (the pad's `+0x288`, the camera's `lookOptions().stick.deadZone`), the
   * stick's flick read through it (`./menuInput` `MENU_STICK_READING`); absent, the console's default (`LEFT_DEAD_ZONE`).
   */
  deadZone?(): number;
}

/** The `NetPage` deps the part owns (`./matchNet` `PART_DEPS.armory`). */
export type ArmoryNetDeps = Required<Pick<NetPageDeps, 'armory' | 'armoryOpen' | 'joined' | 'newRound' | 'abandoned'>>;

export interface MatchArmory {
  /** The screen (`./armory`): `/testroom`'s `armory` -- its keys, pad, taps and the loading lanes read it. */
  readonly armory: Armory;
  /** Its view (`./armoryView`): `/testroom`'s `armoryView` -- the worker's request and the warm-up read it. */
  readonly view: ArmoryView;
  /** The live send (`./armorySend`). */
  readonly send: ArmorySend<{ exit: ArmoryExit; side: Side }>;
  isOpen(): boolean;
  /** Opens it over the type and kit the page holds for the side (main.ts's `openArmory`); whether it opened. */
  open(): boolean;
  /** Whether it can open on the map now, its world brought up to date first (main.ts's `armoryReady`). */
  ready(): boolean;
  /** Its world: the map's arsenal and valves, the page's side, the map's stem (main.ts's `armoryWorld`). */
  world(): ArmoryWorld | null;
  /** A seat's ARMORY now: opened, else the room told at once (main.ts's `armoryOpenOrDone`). */
  openOrDone(): void;
  /** A seat the room opens it on (W5.R1; main.ts's `joined`): once its data is in -- now, or when it lands. */
  seat(): void;
  /** Its disc data landed (or none): kept, and the screen opened if a seat waited for it (main.ts's `armoryData`). */
  setData(data: ArmoryData | null): void;
  /** A seat waiting for the data forgotten (a new match: main.ts's `connectNet`). */
  forget(): void;
  /** The frame's step after the HUD's (main.ts:1615-1619): pulled out 5 s before the next round, stepped, drawn over everything. */
  frame(dt: number, renderer: ArmoryRenderer | null): void;
  /**
   * AM-2 (research 340 §2): the left stick on the shared screen, read every frame. The original's dialog takes the
   * stick's flick as the d-pad press (`./lobbyArmory` `ArmoryStick`): armed at every read while the screen is shut, and
   * at each read it takes input while open (`ARMORY_STICK_ARMING_READING`), so a stick held as it opens (a player running
   * at a respawn) is no flick. The flick is handed on only while the screen owns the pad (`owns`: no START menu, Chat
   * or editor over it) and no button it reads was pressed this frame (`ARMORY_STICK_SAME_FRAME_READING`). `pad` is the
   * physical pad the page read: under the screen the touch layer is hidden and the screen takes taps (`armoryTap`), so
   * the touch sticks never reach it (the gameplay seat's check, 2026-10-16).
   */
  stick(pad: GamepadLike | null, pressed: ReadonlySet<PadButton>, owns: boolean): void;
  /** Its `NetPage` deps (`PART_DEPS.armory`): the hello's `armory`, the rejoin's, the seat, the two round ends. */
  netDeps(): ArmoryNetDeps;
  /** The hook's read (`ViewerHook.armory`, main.ts:2164-2172). */
  state(): ReturnType<ViewerHook['armory']>;
  /** Closed for good without telling the room (the page let go of its match), the view freed. */
  dispose(): void;
}

const NO_VALVES: ReadonlyMap<string, number> = new Map();

export function mountArmory(d: MatchArmoryDeps): MatchArmory {
  const clock = d.clock ?? ((): number => performance.now() / 1000);
  let gone = false;
  /** The ARMORY asked to open before its data came (a welcome, the offline match): opened when it lands (main.ts:364). */
  let wanted = false;
  // main.ts:367-372.
  const world = (): ArmoryWorld | null => {
    const m = d.map(), a = m?.arsenal;
    if (!a || !m) return null;
    const stem = m.path.replace(/^.*\//, '').replace(/\.ZDB$/i, '').toUpperCase();
    return { arsenal: a.table.arsenal, valves: a.map?.valves ?? NO_VALVES, side: d.side(), map: stem, archive: m.archive, eqLimit: d.loadouts.equipmentLimit?.() ?? 0 };
  };
  // main.ts:396-402: S2's seam -- the side's type and picks, the kit the next spawn takes, the room told (protocol 9).
  const apply = (exit: ArmoryExit, side: Side): void => {
    const net = d.net();
    if (!d.loadouts.setType(side, exit.type, net?.answersType(side) ?? false)) return;
    d.loadouts.setPicks(side, exit.picks);
    d.loadouts.setLoadout(exit.kit, side);
    d.answer(exit.kit);
    net?.typeChosen(side);
  };
  // main.ts:342-345: one change per debounce, at once in the round-end interval's last ARMORY_SEND_NOW_S.
  const send = armorySend<{ exit: ArmoryExit; side: Side }>(({ exit, side }) => apply(exit, side), () => {
    const left = d.net()?.nextRoundIn() ?? null;
    return left !== null && left <= ARMORY_SEND_NOW_S;
  });
  // main.ts:320-336.
  const armory: Armory = new Armory({
    clock,
    change: (exit, side) => { if (!gone) send.push({ exit, side }); },   // none after the match is let go
    closed: () => {
      if (gone) return;                                // let go with the match: no `ready` on a client handed back
      send.flush();
      d.net()?.armoryDone();                           // the seat the room held for it takes its first spawn
      d.done?.();
    },
    ...(d.store ? { store: d.store } : {}),
    sound: (name) => { if (name === '.TYPE') d.audio.restart(name); else d.audio.play(name, null); },
    names: () => { const net = d.net(); return armoryNames({ online: d.online() && !!net, server: net?.serverName() ?? null, room: d.map()?.name ?? '' }); },
    device: () => d.device(),
  });
  const view = new ArmoryView();
  // main.ts:351-358: a round's start drops a pending change and closes the screen; an abandon sends it, the screen open.
  const hooks = armoryRoundHooks({
    clearDecals: () => { d.clearDecals?.(); },
    clearAir: () => { d.clearAir?.(); },
    send,
    closeArmory: () => armory.close(),
  });
  // main.ts:374-384.
  const open = (): boolean => {
    if (!d.playing()) return false;
    armory.setWorld(world());
    const side = d.side();
    const opened = armory.open({ type: d.loadouts.type(side), kit: d.loadouts.pending(side) ?? d.loadouts.base(side) });
    if (opened) d.opened?.();
    return opened;
  };
  // main.ts:386-389.
  const ready = (): boolean => { armory.setWorld(world()); return armory.ready(); };
  // main.ts:426-432: open already (a rejoin under the screen) it stays, and its own close tells the room.
  const openOrDone = (): void => {
    if (armory.isOpen() || open()) return;
    d.net()?.armoryDone();
    d.done?.();
  };
  // main.ts:1746. Off (`playing` false: the menu match's dormant part, `&noarmory`, Play mode off) the seat is told done at
  // once -- no screen to wait for, so no data either (PAR-2's re-review, F1).
  /** AM-2: the stick's flick on the shared screen (`stick`). */
  const armoryStick = new ArmoryStick();
  const seat = (): void => { if (!d.playing()) openOrDone(); else if (ready()) openOrDone(); else wanted = true; };
  return {
    armory,
    view,
    send,
    isOpen: () => armory.isOpen(),
    open,
    ready,
    world,
    openOrDone,
    seat,
    // main.ts:413-424 (the round screens' hand-off beside it is each page's: `./roundScreens` `handRoundScreenBitmaps`).
    setData: (data) => {
      if (gone) return;
      armory.setData(data);
      view.setBitmaps(data?.bitmaps ?? []);
      view.setModels(data?.models ?? [], data?.modelTextures ?? []);
      d.warm?.();                                      // its programs linked before it first draws (S3 part 2)
      if (!wanted) return;
      wanted = false;
      openOrDone();
    },
    forget: () => { wanted = false; },
    stick: (pad, pressed, owns) => {
      // LATER 408: the pad's stick 0 as `FUN_002da930` leaves it -- the live dead zone, the rescale and the circle, in the
      // game's signs (x positive left, y positive up: `./menuInput` `menuStick`, `MENU_STICK_READING`), as the menus read it.
      const axis = (i: number): number => { const v = pad?.axes[i]; return typeof v === 'number' && Number.isFinite(v) ? v : 0; };
      const [sx, sy] = menuStick(axis(0), axis(1), d.deadZone?.() ?? LEFT_DEAD_ZONE);
      const flick = armoryStick.read(sx, sy, !armory.isOpen() || armory.taking());
      if (!flick || !owns || !armory.isOpen()) return;
      for (const b of pressed) if (ARMORY_PAD[b]) return;
      armory.input(flick);
    },
    // main.ts:1615-1619: popup 47 (a notice) 5 s before the next round (ARMORY_CLOCK_READING), the scripts stepped, drawn.
    frame: (dt, renderer) => {
      const next = d.net()?.nextRoundIn() ?? null;
      if (armory.isOpen() && next !== null && next <= PULL_OUT_SECONDS) armory.pullOut();
      armory.frame(dt);
      if (renderer && armory.isOpen()) view.render(renderer, armory.quads(view.sizes()), armory.models());
    },
    // main.ts:1736-1748: the round's start and an abandon (`./armoryGlue`), a seat the room opens it on, the hello's two.
    netDeps: () => ({
      newRound: hooks.newRound,
      abandoned: hooks.abandoned,
      joined: () => { seat(); },
      armory: d.playing(),
      armoryOpen: () => armory.isOpen(),
    }),
    // main.ts:2164-2172.
    state: () => {
      const st = armory.state(), w = world();
      const profile = w && d.store ? parseProfile(d.store.get(profileKey(w.map, w.side))) : null;
      return {
        ready: armory.ready(), open: armory.isOpen(), screen: st?.screen ?? null, column: st?.column ?? null, committed: st?.committed ?? null,
        row: st?.row ?? null, kits: (st?.kits ?? []).map((k) => [...k]), valves: armory.valves(), taking: armory.taking(),
        profile: profile ? { ...profile, items: [...profile.items] } : null,
        preview: armory.preview(), modelsHeld: armory.models().every((m) => view.hasModel(m.entry.model)),
      };
    },
    dispose: () => {
      gone = true;
      wanted = false;
      send.drop();
      armory.close();
      view.dispose();
    },
  };
}
