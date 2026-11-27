import { CLAYMORE_RULES, EMPTY_ITEM, type KitTable, type Loadout, type WeaponRecord } from '@s2u/scene';
import { equipmentKind, slotSelectable, throwableOf } from '../equipment';
import type { Input, PadButton } from '../gamepad';
import type { HudQuad, HudTri } from '../hudLayout';
import { InventoryMenu, type InventoryKit, type SlotInfo } from '../inventoryMenu';
import { slotIcon } from '../loadout';
import { MatchAbort } from '../matchAbort';
import type { MatchExchange } from '../matchExchange';
import { stickWalk } from '../menuStick';
import { localStartMenuOptions, StartMenu, type StartMenuOptions } from '../startMenu';
import type { PrototypeHud } from './sceneFrame';

/** The Detonator's slot in the R2 inventory: after the loadout's five (`../matchThrow` `DETONATOR_SLOT`). */
const DETONATOR_SLOT = 5;

/**
 * The lightweight match's menus over the game (a browser adaptation's mounting; the menus are the production modules):
 * the in-round START menu (`../startMenu`) with its ABORT (`../matchAbort`: the round left three seconds after the
 * confirm, back to the game's lobby), and the R2 inventory (`../inventoryMenu`, SOCOM II's `CWeaponSel`) on the kit the
 * lightweight combat and throwables hold. Both draw as HUD quads through the shared `HudState.setOverlay`. The host
 * rules are `../matchThrow`'s (`inventoryKit`, `takeSlot`, `slotIcon`, `slotInfo`, `kitChangeGate`), on the same kit.
 *
 * XBOX-ARMORY (a contribution): WEAPON EXCHANGE (`exchange`, `./walkingExchange`), the in-match loadout change -- R2
 * while dead -- holding the pad after START and the Chat menu, before the R2 inventory, as `../matchMount` orders them.
 *
 * Not here: the START menu's SETTINGS, FULLSCREEN and SHOW LAUNCHER rows (the front end's own overlays), the rocket
 * and the ARMORY (in a match nothing opens it: INT.R3).
 */
export function walkingMenus(d: {
  hud: PrototypeHud; table: KitTable | null; loadout(): Loadout;
  walking(): boolean; alive(): boolean; inMatch(): boolean; spectator(): boolean;
  /** The firearm side (`./combatRuntime`). */
  firearm: {
    kitChangeGate(): boolean; select(item: 'rifle' | 'pistol'): boolean; hand(): 0 | 1;
    records(): readonly [WeaponRecord, WeaponRecord]; magazineOf(record: WeaponRecord): { rounds: number; capacity: number; spare: number };
  };
  /** The throwables' side (`./walkingGrenades` `kit`). */
  items: {
    takeable(slot: 1 | 2 | 3 | 'detonator'): string | null; hasDetonator(): boolean; heldSlot(): number | null; held(): string | null;
    phase(): string; magazineOf(slot: number): { rounds: number; capacity: number; mags: number } | null; left(item: string): number;
    selectEquipment(slot: 1 | 2 | 3): boolean; selectDetonator(): boolean; putAway(): void;
    launcherRounds(id: number): number; wadingDepth(): number; launcherSlot(): number | null;
  };
  options?: StartMenuOptions; caption(id: number): string | null; title(): string | null; sound(name: string): void;
  /** Another menu the START menu's open is refused under, and what its open closes. */
  otherMenu?(): boolean; opened?(): void; voiceMask?(on: boolean): void;
  /** XBOX-ARMORY: WEAPON EXCHANGE (`./walkingExchange`); absent, none. */
  exchange?: Pick<MatchExchange, 'edges' | 'pad' | 'isOpen' | 'overlay' | 'input'>;
}) {
  const exchange = d.exchange ?? null;
  const abort = new MatchAbort();
  let more: ((frame: { width: number; height: number }, sizes: Record<string, { width: number; height: number }>) => { quads: HudQuad[]; tris: HudTri[] } | null) | null = null;
  const kit = (): InventoryKit => {
    const loadout = d.loadout(), detonator = d.items.hasDetonator();
    const takeable = (slot: number): boolean => {
      if (slot === DETONATOR_SLOT) return d.items.takeable('detonator') !== null;
      const id = loadout[slot];
      if (id === undefined || id === EMPTY_ITEM) return false;
      if (slot < 2) return slotSelectable(id, { claymoresDown: 0, roundsFor: () => 0 });
      // PF-37 (research 236 s4): a launcher with a round left, the SEAL not wading too deep.
      if (equipmentKind(id) === 'launcher') return slotSelectable(id, { claymoresDown: 0, roundsFor: launcher => d.items.launcherRounds(launcher), wadingDepth: () => d.items.wadingDepth() });
      return d.items.takeable(slot - 1 as 1 | 2 | 3) !== null;
    };
    const held = d.items.held(), at = d.items.heldSlot(), launcher = d.items.launcherSlot();
    const current = launcher !== null ? launcher : held === 'Detonator' ? DETONATOR_SLOT : held !== null && at !== null ? at : d.firearm.hand();
    return { count: detonator ? DETONATOR_SLOT + 1 : DETONATOR_SLOT, takeable, current };
  };
  const take = (slot: number): boolean => {
    if (!d.walking()) return false;
    if (slot === 0 || slot === 1) { d.items.putAway(); return d.firearm.select(slot === 0 ? 'rifle' : 'pistol'); }
    if (!d.firearm.kitChangeGate()) return false;
    if (d.items.phase() === 'throwing') return false;              // PAR-19 D07: the wind-up yields
    if (slot === DETONATOR_SLOT) return d.items.selectDetonator();
    return slot >= 2 && slot <= 4 ? d.items.selectEquipment(slot - 1 as 1 | 2 | 3) : false;
  };
  const icon = (slot: number): string | null => {
    if (slot === DETONATOR_SLOT) return CLAYMORE_RULES.detonator.icon.toLowerCase();
    if (slot === 0 || slot === 1) return slotIcon(d.table, d.loadout(), slot);
    const id = d.loadout()[slot];
    if (id === undefined || id === EMPTY_ITEM) return null;
    return (d.table?.arsenal.items.get(id)?.icon ?? throwableOf(d.table, id)?.icon ?? null)?.toLowerCase() ?? null;
  };
  const info = (slot: number): SlotInfo | null => {
    if (slot === DETONATOR_SLOT) {
      const item = d.table?.arsenal.byName.get('Detonator') ?? null;
      return { id: item?.id ?? 193, name: item?.displayName ?? 'Detonator', rounds: 0, capacity: 0, mags: 0 };
    }
    const id = d.loadout()[slot];
    if (id === undefined || id === EMPTY_ITEM) return null;
    const item = d.table?.arsenal.items.get(id) ?? null, name = item?.displayName ?? throwableOf(d.table, id)?.name ?? null;
    if (name === null) return null;
    if (slot === 0 || slot === 1) { const m = d.firearm.magazineOf(d.firearm.records()[slot]); return { id, name, rounds: m.rounds, capacity: m.capacity, mags: m.spare }; }
    const mag = d.items.magazineOf(slot), thrown = item?.name ?? throwableOf(d.table, id)?.name ?? '';
    if (equipmentKind(id) === 'launcher') return { id, name, rounds: d.items.launcherRounds(id), capacity: mag?.capacity ?? item?.magazine ?? 0, mags: mag?.mags ?? 0 };
    return { id, name, rounds: mag?.rounds ?? d.items.left(thrown), capacity: mag?.capacity ?? item?.magazine ?? throwableOf(d.table, id)?.capacity ?? 0, mags: mag?.mags ?? 0 };
  };
  const inventory = new InventoryMenu({
    kit, alive: () => d.walking() && d.alive(), canChange: () => d.firearm.kitChangeGate(),
    take: slot => d.walking() && (slot < 2 || d.firearm.kitChangeGate()) ? take(slot) : false,
    icon, info, clock: () => performance.now() / 1000,
  });
  const startMenu = new StartMenu({
    options: d.options ?? localStartMenuOptions(),
    seat: () => ({ multiplayer: true, spectator: d.spectator(), comeFromLan: false }),
    caption: d.caption, title: d.title, sound: d.sound,
    allowed: () => d.inMatch() && !inventory.isOpen() && !(exchange?.isOpen() ?? false) && !(d.otherMenu?.() ?? false),
    ...(d.voiceMask ? { voiceMask: d.voiceMask } : {}), ...(d.opened ? { opened: d.opened } : {}),
    abort: () => { abort.abort(); },
    hud: d.hud,
  });
  startMenu.levelStart();
  d.hud.setOverlay((frame, sizes) => {
    const ws = exchange?.overlay(frame, sizes) ?? null;   // XBOX-ARMORY: WEAPON EXCHANGE first, as `../matchMount`'s overlay
    const inv = inventory.draw(frame, sizes), extra = more?.(frame, sizes) ?? null, menu = startMenu.draw(frame, sizes);   // the START menu last, over them
    const quads: HudQuad[] = [...(ws?.quads ?? []), ...inv.quads, ...(extra?.quads ?? []), ...menu.quads], tris: HudTri[] = [...(ws?.tris ?? []), ...inv.tris, ...(extra?.tris ?? [])];
    return quads.length || tris.length ? { quads, tris } : null;
  });
  let disposed = false;
  return {
    startMenu, inventory,
    /** Another part's quads between the inventory's and the START menu's (the Chat menu's). */
    setOverlayPart(part: typeof more): void { more = part; },
    /**
     * One pad frame, before the game's lanes (`../matchMount`'s order): the START menu first -- up, the pad is its own --
     * then the abort's tick; `chat` (the Chat menu's pad, when mounted) between; then the R2 inventory, which hands the
     * game the input less the lanes it holds. `owns`: a menu holds the pad and the game's lanes take nothing.
     */
    pad(held: Set<PadButton>, input: Input, before: Input, dt: number, real: number,
      chat?: (held: ReadonlySet<PadButton>, input: Input) => { owns: boolean; input: Input; walk?: boolean }): { input: Input; owns: boolean; open: boolean } {
      if (disposed) return { input, owns: false, open: false };
      const edges = exchange?.edges(held) ?? null;   // XBOX-ARMORY: `../matchMount`'s -- the buttons pressed this frame
      const start = startMenu.pad(held, input, dt); abort.frame(dt);
      const talk = chat ? chat(start.held, start.input) : { owns: false, input: start.input };
      // XBOX-ARMORY: WEAPON EXCHANGE after START and the Chat menu (closed, R2 opens it dead; open, the pad is its).
      const owns = start.owns || talk.owns || (!!exchange && exchange.pad(edges!)), walking = d.walking();
      const lanes = exchange ? exchange.input.frame(talk.input, owns) : talk.input;
      // Review F1: the Chat menu's walk under it (OT.R130, `../menuStick` `stickWalk`) past the mask, as `../matchMount`.
      if (exchange && 'walk' in talk && talk.walk) Object.assign(lanes, stickWalk(talk.input));
      if (!walking && inventory.isOpen()) inventory.close();
      const game = owns || !walking ? lanes : inventory.frame(before, lanes, dt, real);
      return { input: game, owns, open: startMenu.isOpen() || inventory.isOpen() || (exchange?.isOpen() ?? false) };
    },
    /** The shoulders' slots as the inventory binds them (L1, L2). */
    shoulder(which: 'l1' | 'l2'): boolean { return take(inventory.binds()[which]); },
    /** The abort's end (`MatchAbort.ended`): the dialog's id once the three seconds have run, else null. */
    aborted: () => abort.ended(), aborting: () => abort.aborting(),
    /** A test's hook: the confirm's YES on ABORT, as the menu's row asks it. */
    abortNow(): void { abort.abort(); },
    roundStart(): void { startMenu.roundStart(); }, spawned(first: boolean): void { if (first) inventory.spawned(); else inventory.respawned(); startMenu.reset(); },
    report() { return { start: startMenu.isOpen(), inventory: inventory.isOpen(), exchange: exchange?.isOpen() ?? false, aborting: abort.aborting(), binds: inventory.binds(),
      gate: { walking: d.walking(), alive: d.alive(), canChange: d.firearm.kitChangeGate(), current: kit().current, count: kit().count } }; },
    dispose(): void { if (disposed) return; disposed = true; d.hud.setOverlay(null); startMenu.dispose(); inventory.close(); },
  };
}
export type WalkingMenus = ReturnType<typeof walkingMenus>;
