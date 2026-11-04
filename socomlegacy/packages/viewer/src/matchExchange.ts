import type { Loadout, Side } from '@s2u/scene';
import { ExchangeInput } from './exchangeInput';
import type { PadButton } from './gamepad';
import type { HudQuad, HudTri } from './hud';
import type { LoadedMap } from './loadMap';
import type { PlayerLoadout } from './loadout';
import type { MatchNetHooks } from './matchNet';
import type { NetPage } from './netPage';
import { respawnHelpLines } from './respawnPrompt';
import { compactPicks, WeaponExchange, type MatchGate } from './weaponExchange';
import type { InputDevice, PromptInfo } from './weaponSelect';
import type { MenuContext, MenuState } from './weaponSelectState';
import { equipmentLimitValves } from './equipmentLimit';

/**
 * PAR-1 (web research 253): WEAPON EXCHANGE and the dead's prompt as one part both pages mount -- `/testroom`
 * (`./main`) and the front end's match (`./matchMount`, once wave 4's integrator turns `FRONT_END_CAPABILITIES.exchange`
 * on) -- written once here from `main.ts`'s lines (research 253 §2 cites each: main.ts:282-312 the menu, its confirm,
 * its context; main.ts:439-450 the gate and the prompt; main.ts:256-257 the overlay; main.ts:1158, 1173, 1196-1209 the
 * pad's edges and the ownership; main.ts:1572-1573 the frame's refresh; main.ts:1721-1726 the `NetPage` hooks;
 * main.ts:2149-2156 the hook's read). The menu itself is `./weaponExchange` (research 94 part 2: the gate `FUN_001f7ff0`
 * D:L56648-56661, the confirm `FUN_0023e5e0` D:L88379, the round's reset `FUN_002a7d40` D:L149757 -> `FUN_00240d50`),
 * the input ownership `./exchangeInput` (research 300 §3, a browser safeguard). Nothing here imports `./main` or reads
 * page markup (OT.R12): the page hands the window, its match, its map, its side, its kit and its prompt's device.
 *
 * Not here (research 253 §4): the touch button (`#tw-weapons`) and the canvas's taps -- `/testroom`'s markup, moved with
 * the touch layer by PAR-5 (PARITY-2) -- and the key `I` with the menu's keys, a development build's only on `/testroom`
 * (OT.R29; `WEAPON_SELECT_KEY_READING`): `main.ts` keeps both, through `menu` and `input`.
 */

/** What the part reads: the page's match and map, read at a call (the page makes them after the part). */
export interface MatchExchangeDeps {
  /** The page's match (`NetPage`): the gate, the dead's prompt, the `loadout` request (protocol 7); null: no match. */
  net(): Pick<NetPage, 'gate' | 'prompt' | 'requestLoadout'> | null;
  /** The map on screen (its arsenal: the kit tables, the map's valves); null before one. */
  map(): Pick<LoadedMap, 'arsenal'> | null;
  /** The page's side in the match (`./matchCore` `matchSide`). */
  side(): Side;
  /** The runtime kit (`./loadout`): the side's list confirmed, the kit it is replayed from, the pick held, the body's kit. */
  loadouts: Pick<PlayerLoadout, 'confirm' | 'base' | 'pending' | 'loadout' | 'picks'> & Partial<Pick<PlayerLoadout, 'equipmentLimit'>>;
  /** On foot in the game (`/testroom`: `playOn && walk.mode() === 'walk'`; the front end: `walk.mode() === 'walk'`): the prompt's only place. */
  walking(): boolean;
  /** The device the prompt's `%c` is drawn for (`./weaponSelect` `InputDevice`). */
  device(): InputDevice;
  /** The window whose blur lets the held keys go (`main.ts:288`); absent, none listened to. */
  win?: { addEventListener(type: string, fn: EventListener): void; removeEventListener(type: string, fn: EventListener): void };
  /** Seconds, the menu's clock (its fades and pulses); absent, `performance.now()`'s (`main.ts:290`). */
  clock?(): number;
}

/** The hook's read (`main.ts`'s `weaponSelect()` less `/testroom`'s touch button). */
export interface ExchangeState {
  screen: MenuState['screen']; slot: number; category: string; item: number; loadout: number[];
  picks: { slot: number; id: number }[]; sent: { slot: number; id: number }[];
  gate: MatchGate; prompt: string[] | null;
}

export interface MatchExchange {
  /** The menu (`./weaponExchange`): `/testroom`'s `exchange` -- its keys, its touch button and taps, the hook read it. */
  readonly menu: WeaponExchange;
  /** The buttons and keys a screen took, owned until let go (`./exchangeInput`, research 300 §3): `/testroom`'s `exchangeInput`. */
  readonly input: ExchangeInput;
  isOpen(): boolean;
  /** The menu's world kept current -- a new map, a match joined or left, a side changed (`main.ts`'s `refreshExchange`). */
  refresh(): void;
  /** The frame's line after the net's (`main.ts:1573`): the context kept current. */
  frame(): void;
  /** The gate (`NetPage.gate`; `main.ts`'s `exchangeGate`): no match, no menu. */
  gate(): MatchGate;
  /** The dead's prompt (S1 / S1g) for the overlay, or null (`main.ts`'s `promptInfo`). */
  prompt(): PromptInfo | null;
  /**
   * LATER 118: the device the prompt's `%c` is drawn for (the page's `device`, read at the call) -- the one source the
   * page hands the HUD's help lines too (`./hud` `spectatorHudView`), so the two never disagree.
   */
  device(): InputDevice;
  /**
   * The pad's buttons down this frame (`padButtonsDown`): the ones pressed since the last frame -- the menu's presses, and
   * `/testroom`'s ARMORY's -- the context kept current after (`main.ts:1196-1200`).
   */
  edges(down: ReadonlySet<PadButton>): Set<PadButton>;
  /** The loading hold: the buttons as they are become the last frame's, so none is a press at the release (`main.ts:1173`). */
  hold(down: ReadonlySet<PadButton>): void;
  /**
   * The menu's pad step, ahead of the trigger lane, the R2 inventory and the game's lanes (`main.ts:1207`): closed, R2
   * opens it through the gate; open, the edges step it -- whether it holds the pad. The page ORs it with its other
   * screens' and hands the result to `input.frame` (the ownership: `main.ts:1209`).
   */
  pad(edges: ReadonlySet<PadButton>): boolean;
  /** The menu and the prompt on the HUD's overlay, layer 1 (`main.ts:256-257`). */
  overlay(frame: { width: number; height: number }, sizes: Record<string, { width: number; height: number }>): { quads: HudQuad[]; tris: HudTri[] };
  /** A kit shown on the menu's rows: the room's answer, `/testroom`'s ARMORY's (`main.ts:406`). */
  answer(kit: Loadout): void;
  /** The round's reset (S8): the menu closed over the kit the spawn took (`main.ts:1726`, `1779`, `1794`). */
  reset(): void;
  /** The part's own addition to `./matchNet`'s shared hooks: the room's answer shown (`main.ts:1723`). */
  netHooks(): Required<Pick<MatchNetHooks, 'answered'>>;
  /** The hook's read (`main.ts:2149-2156`). */
  state(): ExchangeState;
  /** The blur's listener off, the held keys forgotten, the menu closed for good. */
  dispose(): void;
}

/** No match: the gate's answer with no `NetPage` (`main.ts:440`) -- no menu. */
const NO_MATCH: MatchGate = { inMatch: false, alive: true, cameraOnSelf: true, spectator: false };

export function mountExchange(d: MatchExchangeDeps): MatchExchange {
  const clock = d.clock ?? ((): number => performance.now() / 1000);
  // main.ts:287-288: the browser's ownership, its keys forgotten when the window loses focus (a keyup never comes).
  const input = new ExchangeInput();
  const blur = (): void => { input.blur(); };
  d.win?.addEventListener('blur', blur);
  // main.ts:289-299: each confirm adds the pick to the side's list (`PlayerLoadout.confirm`) and sends the list as the
  // `loadout` request through the page's match (protocol 7), whose answer is the kit shown and spawned with next (R94.3).
  const menu: WeaponExchange = new WeaponExchange({
    clock,
    opensOn: () => d.loadouts.pending(d.side()) ?? d.loadouts.base(d.side()),
    confirm: (pick) => {
      const side = d.side(), ctx = menu.context();
      const list = d.loadouts.confirm(side, pick, (l) => (ctx ? compactPicks(ctx, d.loadouts.base(side), l) : [...l]));
      // A list past MAX_LOADOUT_PICKS is not taken: the menu shows the kit held again.
      if (!list) { menu.answer(d.loadouts.pending(side) ?? d.loadouts.base(side)); return; }
      d.net()?.requestLoadout(list);
    },
  });
  // main.ts:301-304: the menu's world -- the map's arsenal and valves, the page's side; none without the kit tables or a match.
  const context = (): MenuContext | null => {
    const a = d.map()?.arsenal;
    return a && d.net() ? { arsenal: a.table.arsenal, valves: equipmentLimitValves(a.map?.valves ?? new Map(), d.loadouts.equipmentLimit?.() ?? 0), side: d.side() } : null;
  };
  // main.ts:305-312: kept current on the map, the match and the side.
  let key: unknown[] = [];
  let gone = false;
  const refresh = (): void => {
    if (gone) return;                                  // let go: no context set again (the front end's teardown)
    const now = [d.map(), d.net(), d.side(), d.loadouts.equipmentLimit?.() ?? 0];
    if (now.every((k, i) => k === key[i])) return;
    key = now;
    menu.setContext(context());
  };
  // main.ts:439-441.
  const gate = (): MatchGate => { const net = d.net(); return net ? net.gate() : NO_MATCH; };
  // main.ts:447-450: on foot in the game only; the room's dead or ghost lines.
  const prompt = (): PromptInfo | null => {
    const p = d.walking() ? d.net()?.prompt() ?? null : null;
    return p ? { ...p, device: d.device() } : null;
  };
  // main.ts:1158: the pad's buttons down last frame, by name (the menu's edges: `menuInputOfPad`).
  let last: ReadonlySet<PadButton> = new Set<PadButton>();
  return {
    menu,
    input,
    isOpen: () => menu.isOpen(),
    refresh,
    frame: refresh,
    gate,
    prompt,
    device: () => d.device(),
    edges: (down) => {
      const out = new Set([...down].filter((b) => !last.has(b)));
      last = down;
      refresh();
      return out;
    },
    hold: (down) => { last = down; },
    pad: (edges) => (edges.size ? menu.pad(edges, gate()) : menu.isOpen()),
    // LATER 118 (research 282 §8): the menu alone -- the dead's lines are the HUD's six help lines (`./hud`
    // `spectatorHudView`'s `help`), on its clock and its hides (the scoreboard, the Chat menu); `prompt()` and the
    // hook's read below keep their text.
    overlay: (frame, sizes) => menu.draw(frame, sizes, null),
    answer: (kit) => { menu.answer(kit); },
    reset: () => { menu.reset(d.loadouts.loadout()); },
    netHooks: () => ({ answered: (kit) => { menu.answer(kit); } }),
    state: () => {
      const st = menu.state(), p = prompt();
      const lines = p?.respawnReady !== undefined ? respawnHelpLines(p.device, p.respawnReady).slice(0, p.respawnReady ? 2 : 1)
        : p ? menu.layout(p).items.filter((i) => i.part === 'prompt').map((i) => (i.kind === 'text' ? i.text : '')) : null;
      return {
        screen: st.screen, slot: st.slot, category: st.category, item: st.item, loadout: [...st.loadout], picks: st.picks.map((x) => ({ ...x })),
        sent: d.loadouts.picks(d.side()).map((x) => ({ ...x })), gate: gate(),
        prompt: lines,
      };
    },
    dispose: () => {
      gone = true;
      d.win?.removeEventListener('blur', blur);
      input.blur();
      menu.setContext(null);
    },
  };
}
