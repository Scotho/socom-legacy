/**
 * The engine handler catalogue (FCW-07b), a browser adaptation with no original (`EXTENSION_CONTRACTS_ADAPTATION`; the
 * contract is `docs/specs/2026-10-25-extension-contracts.md`). A slot is a named, engine-owned seam an application may
 * offer; an engine handler is engine code registered against a slot by the application; a pack can only CLAIM a slot's
 * handler by name (H272: no uploaded code runs). The vocabularies below are frozen before FCW-07c: a change to them
 * is a deliberate contract change, pinned by `test/handlers.test.ts`. Additive to `ENGINE_CONTRACT_VERSION` 0.1.0;
 * FCW-30 adds the `behaviour` slot family (`BEHAVIOUR_SLOTS`, the room's), additive in 0.1.1; 0.1.2 (FP-4) leaves it.
 */
import { diagnostic, type Diagnostic } from "./diagnostics.js";
import { PACK_CODES, type PackHandlerCapability, type PackHandlerClaim } from "./packs.js";

export const EXTENSION_CONTRACTS_ADAPTATION =
  "engine-owned extension slots with no original: engine code behind named seams, claimed by packs by name; with every system off the game is unchanged" as const;

/** What a slot changes: the picture, a mode's rules (the room's built-in capabilities, `BEHAVIOUR_SLOTS`), or an engine system. */
export const HANDLER_KINDS = Object.freeze(["visual", "behaviour", "system"] as const);
export type HandlerKind = (typeof HANDLER_KINDS)[number];

/** The lifecycle actions a slot's handler may be asked for, in their order. */
export const EXTENSION_ACTIONS = Object.freeze(["install", "enable", "disable", "dispose"] as const);
export type ExtensionAction = (typeof EXTENSION_ACTIONS)[number];

/** What the extension host reports: one event per lifecycle step, `restored` for the whole host, `failed` for a rollback. */
export const EXTENSION_EVENTS = Object.freeze(["installed", "enabled", "disabled", "disposed", "restored", "failed"] as const);
export type ExtensionEventType = (typeof EXTENSION_EVENTS)[number];

/** An engine-owned seam a pack may claim: its id, its kind, the actions its handlers offer, and whether one pack holds it. */
export interface HandlerSlot {
  readonly id: string;
  readonly kind: HandlerKind;
  readonly actions: readonly string[];
  readonly exclusive: boolean;
}

/**
 * The slots this build offers. `visual.post` (FCW-07b): one full-screen pass drawn over the world's picture at the end
 * of the renderer's frame, held by one pack at a time. Water/ocean is not listed (S7 adds its slot). These are the page
 * host's slots: no behaviour slot is among them (the behaviour family is the room's, `BEHAVIOUR_SLOTS`).
 */
export const HANDLER_SLOTS: readonly HandlerSlot[] = Object.freeze([
  Object.freeze({ id: "visual.post", kind: "visual" as const, actions: Object.freeze(["install", "enable", "disable", "dispose"]), exclusive: true }),
]);

/**
 * FCW-30: the `behaviour` slot family -- the room's built-in capabilities a rules pack claims by name
 * (`docs/specs/2026-10-27-creator-rules-contract.md` §4; H272: engine code a pack configures, never re-implements).
 * Server-owned (spec §5): the page's extension host publishes `HANDLER_SLOTS` only, so none of these is offered to it;
 * the room's rule host (FCW-31) registers their engine handlers. Catalogue data only: nothing here runs. The NPC brains
 * are the layout's (`layout.ts` `NPC_BEHAVIOURS`: patrol, sentry); the bomb and extraction authorities are the room's
 * own objectives; the zombies' chase and melee are the page's prototype (`viewer/src/zombies/`), reserved until
 * FCW-15/31 make it server-owned. An NPC brain is shared (many packs, many NPCs); an objective authority is one pack's.
 */
const lifecycle = (): readonly string[] => Object.freeze([...EXTENSION_ACTIONS]);
export const BEHAVIOUR_SLOTS: readonly HandlerSlot[] = Object.freeze([
  Object.freeze({ id: "behaviour.npc", kind: "behaviour" as const, actions: lifecycle(), exclusive: false }),
  Object.freeze({ id: "behaviour.zombie", kind: "behaviour" as const, actions: lifecycle(), exclusive: false }),
  Object.freeze({ id: "behaviour.bomb", kind: "behaviour" as const, actions: lifecycle(), exclusive: true }),
  Object.freeze({ id: "behaviour.extraction", kind: "behaviour" as const, actions: lifecycle(), exclusive: true }),
]);

/** A built-in capability on a behaviour slot: `available` to claim, or `reserved` -- named, not claimable `until` the tasks named. */
export interface BehaviourCapability {
  readonly id: string;
  readonly slot: string;
  readonly status: "available" | "reserved";
  readonly until?: string;
}
export const BEHAVIOUR_CAPABILITIES: readonly BehaviourCapability[] = Object.freeze([
  Object.freeze({ id: "behaviour.npc.patrol", slot: "behaviour.npc", status: "available" as const }),
  Object.freeze({ id: "behaviour.npc.sentry", slot: "behaviour.npc", status: "available" as const }),
  Object.freeze({ id: "behaviour.zombie.chase-melee", slot: "behaviour.zombie", status: "reserved" as const, until: "FCW-15/FCW-31" }),
  Object.freeze({ id: "behaviour.bomb.authority", slot: "behaviour.bomb", status: "available" as const }),
  Object.freeze({ id: "behaviour.extraction.authority", slot: "behaviour.extraction", status: "available" as const }),
]);

/** The available behaviour capabilities as `PackContext.handlers` takes them (`handlerCatalogue` over `BEHAVIOUR_SLOTS`); never a reserved one. */
export function behaviourCatalogue(): PackHandlerCapability[] {
  return handlerCatalogue(BEHAVIOUR_CAPABILITIES.filter((c) => c.status === "available").map((c) => ({ id: c.id, slot: c.slot })), BEHAVIOUR_SLOTS);
}

/** The extension host's own refusals (namespace `pack.`, beside `PACK_CODES`'s `HANDLER_*` / `ACTION_UNKNOWN`). */
export const EXTENSION_CODES = Object.freeze({
  /** Another pack asked to enable, disable, dispose or unregister a registration it does not own. */
  ownership: "pack.OWNERSHIP",
  /** No registration has that id. */
  systemUnknown: "pack.SYSTEM_UNKNOWN",
  /** A system's factory or hook threw; it was rolled back. */
  systemFailed: "pack.SYSTEM_FAILED",
  /** An enable was cancelled (its signal, a map switch, a restore or the host's teardown); it was rolled back. */
  systemAborted: "pack.SYSTEM_ABORTED",
  /** The application gave the host no seam for the claimed slot. */
  seamMissing: "pack.SEAM_MISSING",
  /** The host has been torn down. */
  hostDisposed: "pack.HOST_DISPOSED",
} as const);
export type ExtensionCode = (typeof EXTENSION_CODES)[keyof typeof EXTENSION_CODES];

/** Engine code the application registers against a slot (never a pack's). */
export interface EngineHandler {
  readonly id: string;
  readonly slot: string;
}

/** What a host publishes: the engine contract version, the slots and the engine handlers on them. */
export interface HandlerCatalogue {
  readonly contract: string;
  readonly slots: readonly HandlerSlot[];
  readonly handlers: readonly PackHandlerCapability[];
}

/**
 * The engine handlers as `PackContext.handlers` takes them, each with its slot's actions and exclusivity (so
 * `validatePack` treats a held slot as `checkHandlerClaim` does, LATER 472). Empty with none registered (the registry's
 * `handlers: []` today). An engine handler on an unknown slot, or one id twice, is a programming error.
 */
export function handlerCatalogue(engine: readonly EngineHandler[] = [], slots: readonly HandlerSlot[] = HANDLER_SLOTS): PackHandlerCapability[] {
  const seen = new Set<string>();
  return engine.map((h) => {
    const slot = slots.find((s) => s.id === h.slot);
    if (!slot) throw new TypeError(`Engine handler ${h.id} names no slot this build offers (${h.slot}).`);
    if (seen.has(h.id)) throw new TypeError(`Engine handler ${h.id} is registered twice.`);
    seen.add(h.id);
    return { id: h.id, slot: h.slot, actions: [...slot.actions], exclusive: slot.exclusive };
  });
}

/**
 * One claim against the catalogue, as `validatePack` checks a manifest's: an unknown slot or a handler not offered on
 * it is `HANDLER_UNKNOWN`, an action the handler does not offer `ACTION_UNKNOWN`, an exclusive slot held by another
 * pack (`claimed`: slot -> holder id; `options.pack` the claimant, whose own hold is no conflict) `HANDLER_CONFLICT`.
 */
export function checkHandlerClaim(
  claim: PackHandlerClaim,
  catalogue: readonly PackHandlerCapability[],
  claimed: Readonly<Record<string, string>> = {},
  options: { readonly pack?: string; readonly slots?: readonly HandlerSlot[] } = {},
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const err = (code: string, text: string, extra: { field: string; expected: string; actual: string }): void => {
    out.push(diagnostic({ source: "pack", severity: "error", code, text, ...extra }));
  };
  const slot = (options.slots ?? HANDLER_SLOTS).find((s) => s.id === claim.slot);
  if (!slot) {
    err(PACK_CODES.handlerUnknown, `The engine offers no slot ${claim.slot}.`, { field: "slot", expected: (options.slots ?? HANDLER_SLOTS).map((s) => s.id).join(", ") || "none", actual: claim.slot });
    return out;
  }
  const cap = catalogue.find((h) => h.id === claim.handler && h.slot === claim.slot);
  if (!cap) {
    const offered = catalogue.filter((h) => h.slot === claim.slot).map((h) => h.id);
    err(PACK_CODES.handlerUnknown, `The engine offers no handler ${claim.handler} for slot ${claim.slot}.`, { field: "handler", expected: offered.join(", ") || "none", actual: claim.handler });
  } else {
    (claim.actions ?? []).forEach((a, j) => {
      if (!cap.actions.includes(a)) err(PACK_CODES.actionUnknown, `${claim.handler} has no action ${a}.`, { field: `actions[${j}]`, expected: cap.actions.join(", ") || "none", actual: a });
    });
  }
  const holder = Object.prototype.hasOwnProperty.call(claimed, claim.slot) ? claimed[claim.slot] : undefined;
  if (slot.exclusive && holder !== undefined && holder !== options.pack) {
    err(PACK_CODES.handlerConflict, `Slot ${claim.slot} is held by another pack.`, { field: "slot", expected: "a free slot", actual: holder });
  }
  return out;
}
