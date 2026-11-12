import { describe, expect, it } from "vitest";
import {
  BEHAVIOUR_CAPABILITIES,
  BEHAVIOUR_SLOTS,
  behaviourCatalogue,
  checkHandlerClaim,
  ENGINE_CONTRACT_VERSION,
  EXTENSION_ACTIONS,
  EXTENSION_CODES,
  EXTENSION_EVENTS,
  HANDLER_KINDS,
  HANDLER_SLOTS,
  handlerCatalogue,
  PACK_CODES,
  type HandlerSlot,
} from "../src/index.js";

const TINT = { id: "visual.post.tint", slot: "visual.post" } as const;

describe("the engine handler catalogue (FCW-07b, frozen before 07c)", () => {
  it("lists exactly the one slot 07b proves, and freezes it", () => {
    expect(HANDLER_SLOTS).toEqual([{ id: "visual.post", kind: "visual", actions: ["install", "enable", "disable", "dispose"], exclusive: true }]);
    expect(Object.isFrozen(HANDLER_SLOTS)).toBe(true);
    expect(Object.isFrozen(HANDLER_SLOTS[0])).toBe(true);
    expect(Object.isFrozen(HANDLER_SLOTS[0]!.actions)).toBe(true);
  });
  // Changed deliberately by FCW-30: the behaviour kind, reserved by 07b, is opened as its own family (BEHAVIOUR_SLOTS,
  // the room's, below) -- still no behaviour slot in HANDLER_SLOTS, the page host's.
  it("keeps the behaviour kind out of the page host's slots, and lists no water or ocean slot (S7 adds it)", () => {
    expect(HANDLER_KINDS).toEqual(["visual", "behaviour", "system"]);
    expect(HANDLER_SLOTS.filter((s) => s.kind === "behaviour")).toEqual([]);
    expect(HANDLER_SLOTS.some((s) => /water|ocean/.test(s.id))).toBe(false);
  });
  it("freezes the event, action and code vocabularies", () => {
    expect(EXTENSION_EVENTS).toStrictEqual(["installed", "enabled", "disabled", "disposed", "restored", "failed"]);
    expect(EXTENSION_ACTIONS).toStrictEqual(["install", "enable", "disable", "dispose"]);
    expect(HANDLER_SLOTS).toStrictEqual([{ id: "visual.post", kind: "visual", actions: ["install", "enable", "disable", "dispose"], exclusive: true }]);
    // Every key and its string, value by value: a change to any is a deliberate contract change.
    expect(EXTENSION_CODES).toStrictEqual({
      ownership: "pack.OWNERSHIP",
      systemUnknown: "pack.SYSTEM_UNKNOWN",
      systemFailed: "pack.SYSTEM_FAILED",
      systemAborted: "pack.SYSTEM_ABORTED",
      seamMissing: "pack.SEAM_MISSING",
      hostDisposed: "pack.HOST_DISPOSED",
    });
    expect(Object.keys(EXTENSION_CODES)).toStrictEqual(["ownership", "systemUnknown", "systemFailed", "systemAborted", "seamMissing", "hostDisposed"]);
    expect(Object.isFrozen(EXTENSION_EVENTS) && Object.isFrozen(EXTENSION_ACTIONS) && Object.isFrozen(EXTENSION_CODES)).toBe(true);
    expect(Object.values(EXTENSION_CODES).every((c) => c.startsWith("pack."))).toBe(true);
    expect(Object.values(EXTENSION_CODES).some((c) => (Object.values(PACK_CODES) as string[]).includes(c))).toBe(false);
  });
  // Changed deliberately by FCW-30: 0.1.0 -> 0.1.1 (the patch: additive under caret SemVer; the dispatcher's fold, was
  // 0.2.0), the first engine contract that carries the rules vocabulary
  // (`rules.ts`, spec 2026-10-27 section 7); additive -- nothing 0.1.0 published is removed or changed.
  // Changed deliberately by FP-4 (FP.R2): 0.1.1 -> 0.1.2, the patch again: the forge-map bundle (`bundle.ts`) and the
  // content map's version 2 (`maps.ts`) are additive -- nothing 0.1.1 published is removed or changed, and this
  // catalogue's vocabularies are as they were.
  it("is the engine contract 0.1.2 (FP-4's bundle and content-map v2, additive)", () => {
    expect(ENGINE_CONTRACT_VERSION).toBe("0.1.2");
  });
});

// Added by FCW-30 (a deliberate contract change): the behaviour slot family, catalogue data only, pinned exactly.
describe("the behaviour slot family (FCW-30, spec 2026-10-27 section 4)", () => {
  const LIFECYCLE = ["install", "enable", "disable", "dispose"];
  it("names the room's built-in capability slots, frozen", () => {
    expect(BEHAVIOUR_SLOTS).toStrictEqual([
      { id: "behaviour.npc", kind: "behaviour", actions: LIFECYCLE, exclusive: false },
      { id: "behaviour.zombie", kind: "behaviour", actions: LIFECYCLE, exclusive: false },
      { id: "behaviour.bomb", kind: "behaviour", actions: LIFECYCLE, exclusive: true },
      { id: "behaviour.extraction", kind: "behaviour", actions: LIFECYCLE, exclusive: true },
    ]);
    expect(Object.isFrozen(BEHAVIOUR_SLOTS) && BEHAVIOUR_SLOTS.every((s) => Object.isFrozen(s) && Object.isFrozen(s.actions))).toBe(true);
    expect(BEHAVIOUR_SLOTS.some((s) => HANDLER_SLOTS.some((h) => h.id === s.id))).toBe(false);
  });
  it("names the capabilities, the zombies' chase and melee reserved until FCW-15/31 make it server-owned", () => {
    expect(BEHAVIOUR_CAPABILITIES).toStrictEqual([
      { id: "behaviour.npc.patrol", slot: "behaviour.npc", status: "available" },
      { id: "behaviour.npc.sentry", slot: "behaviour.npc", status: "available" },
      { id: "behaviour.zombie.chase-melee", slot: "behaviour.zombie", status: "reserved", until: "FCW-15/FCW-31" },
      { id: "behaviour.bomb.authority", slot: "behaviour.bomb", status: "available" },
      { id: "behaviour.extraction.authority", slot: "behaviour.extraction", status: "available" },
    ]);
    expect(Object.isFrozen(BEHAVIOUR_CAPABILITIES) && BEHAVIOUR_CAPABILITIES.every(Object.isFrozen)).toBe(true);
  });
  it("offers the available ones as handler capabilities, with their slot's actions and exclusivity; never a reserved one", () => {
    const caps = behaviourCatalogue();
    expect(caps.map((c) => c.id)).toEqual(["behaviour.npc.patrol", "behaviour.npc.sentry", "behaviour.bomb.authority", "behaviour.extraction.authority"]);
    expect(caps[0]).toEqual({ id: "behaviour.npc.patrol", slot: "behaviour.npc", actions: LIFECYCLE, exclusive: false });
    expect(caps[2]).toEqual({ id: "behaviour.bomb.authority", slot: "behaviour.bomb", actions: LIFECYCLE, exclusive: true });
    expect(checkHandlerClaim({ slot: "behaviour.npc", handler: "behaviour.npc.patrol" }, caps, {}, { slots: BEHAVIOUR_SLOTS })).toEqual([]);
    const reserved = checkHandlerClaim({ slot: "behaviour.zombie", handler: "behaviour.zombie.chase-melee" }, caps, {}, { slots: BEHAVIOUR_SLOTS });
    expect(reserved.map((d) => d.code)).toEqual([PACK_CODES.handlerUnknown]);
    // the page host's own catalogue is unchanged: a behaviour claim against it names no slot it offers
    expect(checkHandlerClaim({ slot: "behaviour.npc", handler: "behaviour.npc.patrol" }, handlerCatalogue([TINT])).map((d) => d.code)).toEqual([PACK_CODES.handlerUnknown]);
  });
});

describe("handlerCatalogue", () => {
  it("is empty with no engine handler registered (the registry's handlers: [] today)", () => {
    expect(handlerCatalogue()).toEqual([]);
  });
  it("offers each engine handler with its slot's actions and exclusivity", () => {
    expect(handlerCatalogue([TINT])).toEqual([{ id: "visual.post.tint", slot: "visual.post", actions: ["install", "enable", "disable", "dispose"], exclusive: true }]);
  });
  it("refuses engine code that names an unknown slot or one handler twice", () => {
    expect(() => handlerCatalogue([{ id: "water.ocean.fft", slot: "water.ocean" }])).toThrow(TypeError);
    expect(() => handlerCatalogue([TINT, TINT])).toThrow(TypeError);
  });
});

describe("checkHandlerClaim", () => {
  const catalogue = handlerCatalogue([TINT]);
  const codes = (d: readonly { code: string }[]): string[] => d.map((x) => x.code);
  it("accepts a known handler on its slot with known actions", () => {
    expect(checkHandlerClaim({ slot: "visual.post", handler: "visual.post.tint", actions: ["enable", "disable"] }, catalogue)).toEqual([]);
  });
  it("refuses an unknown slot and an unknown handler (HANDLER_UNKNOWN)", () => {
    expect(codes(checkHandlerClaim({ slot: "water.ocean", handler: "visual.post.tint" }, catalogue))).toEqual([PACK_CODES.handlerUnknown]);
    const d = checkHandlerClaim({ slot: "visual.post", handler: "visual.post.bloom" }, catalogue);
    expect(codes(d)).toEqual([PACK_CODES.handlerUnknown]);
    expect(d[0]).toMatchObject({ source: "pack", severity: "error", field: "handler", expected: "visual.post.tint", actual: "visual.post.bloom" });
  });
  it("refuses a handler offered on another slot (HANDLER_UNKNOWN)", () => {
    const slots: HandlerSlot[] = [...HANDLER_SLOTS, { id: "visual.other", kind: "visual", actions: ["enable"], exclusive: false }];
    const two = handlerCatalogue([TINT], slots);
    expect(codes(checkHandlerClaim({ slot: "visual.other", handler: "visual.post.tint" }, two, {}, { slots }))).toEqual([PACK_CODES.handlerUnknown]);
  });
  it("refuses each action the handler does not offer (ACTION_UNKNOWN)", () => {
    const d = checkHandlerClaim({ slot: "visual.post", handler: "visual.post.tint", actions: ["enable", "run", "eval"] }, catalogue);
    expect(codes(d)).toEqual([PACK_CODES.actionUnknown, PACK_CODES.actionUnknown]);
    expect(d.map((x) => x.field)).toEqual(["actions[1]", "actions[2]"]);
  });
  it("refuses an exclusive slot held by another pack (HANDLER_CONFLICT), not by the claimant itself", () => {
    const claim = { slot: "visual.post", handler: "visual.post.tint" };
    expect(codes(checkHandlerClaim(claim, catalogue, { "visual.post": "other.pack" }, { pack: "my.pack" }))).toEqual([PACK_CODES.handlerConflict]);
    expect(codes(checkHandlerClaim(claim, catalogue, { "visual.post": "other.pack" }))).toEqual([PACK_CODES.handlerConflict]);
    expect(checkHandlerClaim(claim, catalogue, { "visual.post": "my.pack" }, { pack: "my.pack" })).toEqual([]);
  });
  it("leaves a claim's options to the handler (LATER 458): the claim check and the catalogue say nothing of them", () => {
    const claim = { slot: "visual.post", handler: "visual.post.tint", options: { colour: "not a colour", strength: 9 } };
    expect(checkHandlerClaim(claim, catalogue)).toEqual([]);
    expect(Object.keys(catalogue[0]!)).toStrictEqual(["id", "slot", "actions", "exclusive"]);
  });
  it("lets a shared (non-exclusive) slot be claimed twice", () => {
    const slots: HandlerSlot[] = [{ id: "visual.shared", kind: "visual", actions: ["enable"], exclusive: false }];
    const cat = handlerCatalogue([{ id: "visual.shared.a", slot: "visual.shared" }], slots);
    expect(checkHandlerClaim({ slot: "visual.shared", handler: "visual.shared.a" }, cat, { "visual.shared": "other.pack" }, { slots, pack: "me" })).toEqual([]);
  });
});
