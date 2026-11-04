# Extension contracts -- content, behaviour, engine systems (FCW-07b)

Product adaptation, 2026-10-25 (OT.R53 product track; `EXTENSION_CONTRACTS_ADAPTATION`, `EXTENSION_HOST_ADAPTATION`,
`VISUAL_POST_SEAM_ADAPTATION`). An extension has no original. With every system disabled, disposed or restored, nothing
the game draws, plays or simulates differs from the original's; that is the line every rule below serves. This is
XT-2's three contracts as they are built today, and XT-7's registry and its first seam. The plan of record is
`docs/plans/2026-10-24-forge-creator-wishlist.md`, FCW-07b; the direction is `docs/plans/2026-10-22-extensibility.md`
(XT-2, XT-7, XT.R1-R12). Candidate, unreviewed: it is reviewed with the batch.

Code: `packages/creator-contracts/src/handlers.ts` (the catalogue and the claim check, browser-safe, exported from
`@s2u/creator-contracts`), `packages/viewer/src/packs/systems/host.ts` (the host), `packages/viewer/src/visualPostSeam.ts`
(the seam, reached only through `visualPostSeams(renderer)`) and its one claim in `packages/viewer/src/renderer.ts`
(`createRenderer`), and `packages/viewer/src/packs/systems/visualTint.ts` (the proof system, `visualTintHandler`).

## H272, plainly

No uploaded code runs. A system's code is engine code: a `SystemFactory` the application itself registers with the
host. A pack can only **claim** a slot's engine handler **by name** in its manifest (`handlers: [{slot, handler,
actions?, options?}]`, `docs/specs/2026-10-25-pack-framework.md`); the claim is data, checked against the catalogue, and
gives the pack no code path, no clock and no loop of its own. A claim's `options` are data too ("A claim's options",
below): values the engine handler reads, never code.

## (a) Content

The content contract is the pack framework's: `docs/specs/2026-10-25-pack-framework.md`, "The manifest" (the roles and
payload types: meshes, textures, audio, collision, gameplay JSON) and "Content -- an authored map". Nothing in this
batch changes it.

## (b) Behaviour -- opened as data (FCW-30), still no pack code

FCW-30 (2026-10-27, pending review; `docs/specs/2026-10-27-creator-rules-contract.md` §4, superseding FCW-07c's
per-mode plan by FCW.R18) opens the kind as its own family in `handlers.ts`, catalogue data only: `BEHAVIOUR_SLOTS`
(`behaviour.npc` and `behaviour.zombie` shared, `behaviour.bomb` and `behaviour.extraction` exclusive, each with the
lifecycle actions) and `BEHAVIOUR_CAPABILITIES` (`behaviour.npc.patrol`, `behaviour.npc.sentry`,
`behaviour.bomb.authority`, `behaviour.extraction.authority` available; `behaviour.zombie.chase-melee` reserved until
FCW-15/31 make it server-owned). `behaviourCatalogue()` offers the available ones; a rules spec claims them by name
(`RulesSpec.capabilities`, checked by `validateRules`; a reserved one is `rules.CAPABILITY_RESERVED`). These are the
room's (server-owned, spec §5): `HANDLER_SLOTS`, the page host's, still has no behaviour entry, so a behaviour claim
against the page host stays `HANDLER_UNKNOWN`. Nothing registers their engine handlers before FCW-31; declarative rules
only (H272): no pack code runs. `ENGINE_CONTRACT_VERSION` is `0.1.1` from FCW-30 (additive: the patch under caret SemVer).

## (c) Engine systems

### The catalogue (frozen before FCW-07c)

| name | value |
|---|---|
| `HANDLER_KINDS` | `visual`, `behaviour`, `system` |
| `HANDLER_SLOTS` | `{id: "visual.post", kind: "visual", actions: [install, enable, disable, dispose], exclusive: true}` -- the one slot FCW-07b proves |
| `EXTENSION_ACTIONS` | `install`, `enable`, `disable`, `dispose` |
| `EXTENSION_EVENTS` | `installed`, `enabled`, `disabled`, `disposed`, `restored`, `failed` |
| `EXTENSION_CODES` | `pack.OWNERSHIP`, `pack.SYSTEM_UNKNOWN`, `pack.SYSTEM_FAILED`, `pack.SYSTEM_ABORTED`, `pack.SEAM_MISSING`, `pack.HOST_DISPOSED` (beside `PACK_CODES`' `HANDLER_CONFLICT`, `HANDLER_UNKNOWN`, `ACTION_UNKNOWN`) |

Water/ocean is not listed: S7 adds its slot (FCW-25), through this same registry. The lists are frozen objects and a
test pins each one exactly, so a change is a deliberate contract change. `ENGINE_CONTRACT_VERSION` stayed `0.1.0` for this
catalogue (additive); FCW-30's rules vocabulary made it `0.1.1` (additive, the patch).

`handlerCatalogue(engine?)` turns the application's engine handlers (`{id, slot}`) into `PackContext.handlers`
(`{id, slot, actions, exclusive}`, the slot's actions and exclusivity); with none registered it is `[]` (the registry's
context today). An engine handler on an unknown slot, or one id twice, throws (a programming error, not a pack's).
`checkHandlerClaim(claim, catalogue, claimed?, {pack?, slots?})` applies `validatePack`'s handler rules to one claim:
an unknown slot, or a handler not offered on that slot, `HANDLER_UNKNOWN`; each action the handler does not offer
`ACTION_UNKNOWN`; an exclusive slot held by another pack `HANDLER_CONFLICT` (the claimant's own hold is no conflict).
`validatePack` reads the same rule from its catalogue (LATER 472, 2026-10-26): a slot is shared when a capability on it
says `exclusive: false`, and a shared slot held by another pack is no conflict; a capability without `exclusive` is
exclusive (today's behaviour). `checkHandlerClaim` reads no options: the catalogue (`PackHandlerCapability {id, slot, actions,
exclusive?}`) says nothing of them.

### A claim's options (LATER 458) -- the shape is the contract's, the content the handler's

A claim (`PackHandlerClaim`) is `{slot, handler, actions?, options?}`; `validatePack` refuses any other key
(`FIELD_INVALID` on `handlers[i]`). `options`, when present, is a plain JSON object: null, booleans, finite numbers,
strings, and lists or objects nested at most `PACK_HANDLER_OPTIONS_DEPTH_ADAPTATION` (2) deep -- the options object is
1, an object or a list in it 2 -- with no `__proto__` key, and its JSON at most `PACK_HANDLER_OPTIONS_BYTES_ADAPTATION`
(4096) UTF-8 bytes. Both bounds are named adaptations chosen for this contract (no earlier loader names one). A list,
a string, a number or null for `options`, a value nested deeper, a number JSON cannot write back (`1e999`), a
`__proto__` key or JSON over the bound is `FIELD_INVALID` on `handlers[i].options` (with the bound or the kind as
`expected`); an external URI inside it is `EXTERNAL_URI`, as anywhere in the manifest. The manifest keeps a copy,
frozen with it, covered by the pack hash (`packDigest`, keys in canonical order); a claim without `options` is as it
was, the same hash. The contract checks only this shape: what the options mean -- which keys, which values -- only the
claimed handler checks, with its own refusal (the tint's `VISUAL_TINT_CODES.option`).

The application hands them to the handler: `systemForClaim(handler, claim, defaults?)` (`packs/systems/host.ts`) is
`handler.system(claim.options)` when the claim carries options, and `handler.system(defaults)` -- the application's
own -- only when it carries none; a claim's options the handler refuses stay that refusal (its diagnostics, never a
throw), and the defaults never stand in for them. The result goes to `register(pack, claim, factory)`, whose
signature is unchanged; the registration does not carry the options.

### The host -- `createExtensionHost({seams, handlers?, now?, contract?})`

The sole systems registry, modeled on `ViewerRenderer.setExperimental`: a reversible switch the engine owns, off by
default, whose off state is the original's. `seams` are the seams the application claimed, by slot id;
`catalogue()` publishes `{contract, slots, handlers}`.

- **Register.** `register(pack, claim, factory)` checks the claim (`checkHandlerClaim`), that the application gave a
  seam for the slot (`SEAM_MISSING`), and that the slot is free: a second registration on an exclusive slot, by another
  pack or the same one, is `HANDLER_CONFLICT`. It installs nothing. `unregister` ends the system and frees the slot.
- **The lifecycle.** `enable` installs (a fresh instance from the factory on the first enable and after `disposed` or
  `failed`) then enables; `disable` turns it off, undoes every seam install the system made (the lease cleared) and
  keeps the instance; `dispose` ends the instance and keeps the registration. **Re-enable** (FCW-07b-2): an `enable`
  after a `disable` runs the same instance's `install` again, under that enable's own abort signal (an abort or a
  throw there rolls the system back as at a first install), then its `enable`, so a system that put its pass on the
  seam at `install` draws again and `frame` reaches it again; a system therefore puts back at `install` what it
  installs on the seam and builds its own resources once an instance. `dispose` after a `disable` is final: one
  `disposed`, no `disable` called twice, no later `frame`. Status `registered -> enabled -> disabled -> enabled ->
  disposed`; events `installed` (once an instance), `enabled`, `disabled`, `enabled`, then -- a dispose from enabled
  reporting the disable it makes -- `disabled`, `disposed`. Calls are serialized.
- **Ownership.** A registration belongs to the pack that registered it. `enable`, `disable`, `dispose` and
  `unregister` take the asking pack's id (`by`); another pack's is refused `OWNERSHIP` and does no work.
- **Rollback.** A factory, `install` or `enable` that throws, or an `enable` whose signal aborts while `install` or
  `enable` is pending, is rolled back at once: the instance's `dispose` is called (its own throw ignored), every seam
  install the system made is undone by the host, and the status is `failed` with the diagnostic (`SYSTEM_FAILED` or
  `SYSTEM_ABORTED`); event `failed`. No half state: a late install by the stale system is refused. A `disable` or a
  `frame` that throws is rolled back the same way. A failed system is enabled again only explicitly.
- **No off work; engine-owned scheduling.** The host's `frame(dt)` calls `frame(dt)` of enabled systems only; a
  disabled, disposed or failed system is never called. A factory is given its lease on one seam (`install`,
  `snapshot`) and nothing else: no loop, no clock, no renderer.
- **What ends a system.** `dispose(id)`; `unregister(id)`; `onMapSwitch()` (synchronous, before the world changes:
  every system disabled and disposed, an enable in flight cancelled, re-enabling explicit); `restore()` (every system
  off, every seam back to its original state, registrations kept; event `restored`); and the host's own `dispose()`
  (every system ended, the registrations dropped, every later call refused `HOST_DISPOSED`). A queued enable asked
  before a map switch, a restore or the teardown is cancelled.

### The seam rule

One seam per system, installed and uninstalled only through the host. The host hands a system a **lease** on its
slot's seam; on disable the host undoes whatever the lease still holds, so a disabled system leaves the seam as it
found it, and when the system ends the lease is closed.

`visual.post` (`VisualPostSeam {install(pass) -> uninstall; snapshot()}`) is claimed in one place, `createRenderer`,
and **reachable only through the seam module** (FCW-07b-2): the renderer keeps no `post` property (none at the type,
none at run time); `visualPostSeams(renderer)` returns the seams object the host takes and hands it **once** per
renderer (a second call throws), so the application's composition --
`createExtensionHost({ seams: visualPostSeams(renderer), handlers: [visualTintHandler] })` -- is its one claimant and
the host the only install path. Within one JavaScript realm this is an API rule, not a sandbox: engine code that called
`visualPostSeams` before the composition would hold the seam, and the composition's own call would then throw. It is the narrowest frame-level point of the renderer: one full-screen pass (`{id, scene}`,
its scene and materials the system's own) drawn with the renderer's clip-space camera at the end of `render`, on the
target the frame ended on, with `autoClear` off for that draw and put back -- after the native, PS2, glow and
experimental paths, before the caller's HUD. It touches no object of the world's scene, no material the original
draws and no target of the frame before it; with no pass installed the frame's draw list is the original's, unchanged.
One pass at a time; a stale uninstall never removes a newer pass. `snapshot()` is the renderer's draw configuration
(presentation, pixel ratio, sizes, glow, experimental state, its own screen materials, the installed pass's id): equal
before an install and after its uninstall.

### The proof system -- `visualTint` (FCW-07b-2)

`packs/systems/visualTint.ts` is the engine handler `visual.post.tint` (H272: a pack claims it by name; the code is the
engine's). `visualTintHandler` is an `EngineHandler` the application lists in `handlers`, with
`system(options) -> SystemFactory | Diagnostic[]` for a claim's options: `colour`, six hexadecimal digits (`rrggbb`, a
leading `#` allowed), written to the picture as given (the renderer's output is linear, unconverted), and `strength`
from 0 to 1; anything else -- missing, mistyped, out of range, an extra key -- is refused with
`VISUAL_TINT_CODES.option` (`visual.TINT_OPTION`), a diagnostic, never a throw. Its pass is one clip-space quad (a
`PlaneGeometry(2, 2)` and a transparent `MeshBasicNodeMaterial`, depth off: the default blend at alpha = strength mixes
the picture toward the colour) in a scene of its own, put on the seam at `install`, shown at `enable`, hidden and taken
off at `disable`; `dispose` takes it off and disposes its geometry and material (it makes no texture). Its options
come from the pack's claim (`{slot: 'visual.post', handler: 'visual.post.tint', options: {colour, strength}}`), through
`systemForClaim(visualTintHandler, claim, defaults?)`: the application's defaults only for a claim with none.

What its unit tests prove (`viewer/test/packs/visualTint.test.ts`, `createRenderer` over a fake `WebGPURenderer` that
records each draw and keeps `info.memory` as three does -- counted at a draw's first meeting, uncounted at `dispose`):
the draw list equals the baseline with the tint not offered or only registered; enabled, exactly one post draw a frame,
the pass's own scene, mesh, colour and strength; disabled, none; after `dispose` (from enabled, after a disable, and at
the host's teardown) the geometry, material and texture counts are back to the baseline; a second enable after a
disable draws again (B2-1 through a real handler: red against the host before the fix); a bad option refused by its
code. What only the rendered pass proves, owed: the rendered capture equality before / on / restored (`captureScore`
over an original fixture -- the picture with the tint off, and after it is restored, equal to the one before), the
tint's colour on screen, and the resource counts on a real GPU.

### Evidence, kept apart

Unit tests: `creator-contracts/test/handlers.test.ts` (every vocabulary pinned value by value: `EXTENSION_CODES` key
by key, `HANDLER_SLOTS`, `EXTENSION_EVENTS`, `EXTENSION_ACTIONS` exact; the claim check ignores options),
`creator-contracts/test/packs.test.ts` (a claim's options: kept, copied and frozen, refused by shape and by bound),
`viewer/test/packs/extensionHost.test.ts` (the lifecycle with test systems over the real seam, re-enable included;
`systemForClaim`'s choice between the claim's options and the defaults), `viewer/test/packs/visualTint.test.ts` (the
tint drawn with a claim's options, the defaults for a claim without, a refused option a refusal),
`viewer/test/visualPostSeam.test.ts` (the seam against `createRenderer` with a fake `WebGPURenderer`: the draw list,
the configuration snapshot, no `post` property, one claimant). Not run here: the rendered pass above, owed; the FUI-16
visual proof is FCW-08's.

## Not in this contract

The page's injection of the host (`ForgePageContext.host`; its composition is the line above, with
`visualTintHandler` in `handlers`; its registrant calls `systemForClaim`), the Packs UI, behaviour slots (FCW-07c),
water/ocean (S7, FCW-25), any online use (H273/H274).
