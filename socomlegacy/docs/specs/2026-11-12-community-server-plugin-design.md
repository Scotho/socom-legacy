# Community-server plugin kind — design (issue #766, step 3)

> **Status: the loader slice is built.** The pack role and the match-child loader are in the tree. Product track
> (OT.R53), except the optional listener on `RuleHost` in section 4, which is simulation track (CM-14) and takes a
> fresh review. An unmodded match is unchanged: no listener unless a declared plugin loaded, and the opt-in is off
> by default. Zombies are not ported. Central, rankings, the player client and deploy are not touched.
>
> **Follow-ups the design already decided, not new questions.** CM-16, central's modded tier, is not in this tree.
> Until it exists the loader's switch is the image flag on a community match child (answer 1). TODO(CM-16): require
> that tier once it exists. TODO(CM-15): the install directory is still a proposal; this slice checks bytes it is
> given and does not choose a path. The loader checks a plugin against the published `ENGINE_CONTRACT_VERSION`
> `0.2.0`. The page's `appliesOn` keeps a plugin off the page.
> `CONTAINER_CONTRACT.md` answer 8 is unchanged, because this slice does not edit deploy. LATER 797 is unchanged.
> **This pull request's base:** `origin/main` at `c6a72241ded999a9a30f95fcc01cc95df7c4ccb4` (v0.4.19). Host, room
> and rules citations are that tree.
> **The kind itself:** `origin/agent/v0420` at `520347f87fb894081a90d8a095f1625b40631a40`, which ships as v0.4.20.
> Those citations are marked **v0420**. On v0.4.19, `PACK_KINDS` has no `plugin`.
> **Issue:** [#766](https://github.com/Scotho/redotcom/issues/766). Rows CM-13, CM-14, CM-15 in
> [the community-mods spec](2026-11-09-community-mods-two-paths.md). Craig's answers of 2026-11-12 are folded
> below (the Forge lane's review on this pull request). The owner's controller session merges, on his rules.
> This document has his word. `main`, releases, deploys, live servers and player-side code stay his.
> **Evidence: source inspection.** Nothing here was run.

A **server plugin** is code in a v2 pack of kind `plugin`, run only on Fuse's modded community servers, and
allowed to act only by returning the rules contract's existing actions. A local rules pack stays data. The
community-server developer in the rest of the repository is Fuse.

Words marked **Proposal** are not in either tree.

## 1. What it is, beside a local rules pack

A rules pack is data. `RuleHost` (`packages/match/src/creator/rules/host.ts:125`) reads it. The room attaches
a host only when `RoomOptions.ruleHost` is set (`packages/match/src/room.ts:373`, assigned at `room.ts:2824`, `.attach` at `:2826`).
With the option absent, `ruleEvent` builds nothing (`room.ts:2834`). The names are `RULE_EVENTS` and
`RULE_ACTIONS` (`packages/creator-contracts/src/rules.ts:77`, `:87`). The page's actions are
`PRESENTATION_ACTIONS` (`rules.ts:96`). The zombie example is that shape:
`packages/creator-contracts/examples/zombie-waves/s2u-pack.json`, kind `rules`, sides `server`, contract `^0.1.1`. Its rules floor is
`RULES_PACK_CONTRACT_FLOOR` `"0.1.1"`. v0420 keeps that floor (`packs.ts:122`) and leaves this pack alone.

**v0420, already in the format.** `PACK_KINDS` is `"content" | "rules" | "system" | "plugin"` (`packs.ts:144`).
The comment there reserves `plugin` for a community server, runtime Fuse's design. A pack that holds the kind
must state `sides: "server"` and a `contract` that admits no engine before `0.2.0` (`packs.ts:756-758`,
`PACK_CONTRACT_0_2_FLOOR` at `:42`). The build publishes `ENGINE_CONTRACT_VERSION` `"0.2.0"` and still reads
`0.1.2` (`ENGINE_CONTRACT_VERSIONS`, `packs.ts:28` and `:35`). `validatePack` warns
`pack.KIND_NOT_APPLIED` (`PACK_CODES.kindNotApplied`, `packs.ts:250`, raised at `:760`) and stores the pack.
A well-formed plugin pack is not failed. `sides` other than `"server"`, or a contract that admits an engine
before `0.2.0`, is an error (`packs.ts:757-758`). `appliesOn` (`packs.ts:157`) is false for a page whenever the kinds include `plugin`, so
the Forge and the test room do not load its members. The wiki row is already there, status Planned
(`shared/modding-wiki/content/docs/kinds/index.mdx:20` on v0420).

Nothing in v0420 runs a plugin. This design is that runtime.

| | Local rules pack | Server plugin |
|---|---|---|
| Where it runs | Forge Play, through `RuleHost` | Fuse's modded community match child, and only when both gates in section 2 hold |
| What it is | JSON: when / if / then | One JavaScript module that returns actions |
| Contract | `^0.1.1` is enough | Must admit no engine before `0.2.0` |
| Browser | Presentation only | `appliesOn` keeps the members off the page. No client plugin |

`behaviour.zombie.chase-melee` is reserved (`packages/creator-contracts/src/handlers.ts:71`). A plugin does
not become a way to claim it.

## 2. Where it runs, and how it loads

The community container is `deploy/host/community/` and `deploy/host/CONTAINER_CONTRACT.md`. The script sets
`HOST_TIER=community`. `parseHostTier` (`packages/host/src/community.ts:92`) treats unset or `"trusted"` as
trusted. `separateIdentity` returns null for that tier (`packages/host/src/games.ts:136`), so the match child
shares the panel uid. Answer 8 of the container contract (`CONTAINER_CONTRACT.md:140`) still has no mod load
path. The loader, when it is built, runs in the match child after `childEnv` (`games.ts:329`). It does not
run in the supervisor or the startup script.

**Both gates, Craig 2026-11-12.** Central is the authority. The modded class is its own tier at central,
enrolled separately (CM-16, theirs to build). A plain community host, HyperNode's included, cannot declare
or run a plugin, whatever its environment says. The flag on the image is the local switch on top of that
tier. The loader refuses unless both hold, once the tier exists. Step 4 may develop on the flag alone on
Fuse's own server; that development exception ends when CM-16 is in central. A trusted host never loads one.

**Disk (CM-15), proposal.** The operator installs the pack outside `CUSTOMER_ROOT` (`community.ts:11`),
outside `DATA_DIR` (`community.ts:14`) and outside `OUTBOX_DIR` (`community.ts:21`). The client sends no
bytes and no URL. The host enables the pack only when id, version and `packDigest`
(`packages/creator-contracts/src/digest.ts:277`) match the list that server declared.

**A bad pack refuses that match, not the host.** Craig confirmed this. A server that cannot load what it
declared does not start that match, and does not run it as a retail round under a Modded label. The host
process stays up for its other matches. Exit 2 stays a refused host start (section 6), not a bad plugin.

The join check and the Modded label are step 1 (CM-2, CM-3). They are not on this pull request's base. What
is: `missingPackRefs` (`packages/creator-contracts/src/content.ts:77`), and the room list's
`unranked · HyperNode` when `community` is set (`packages/viewer/src/console/render/rooms.ts:115`, `:133`).
**Hand-off.** The client's check is `missingPackRefs` for `sides` `client` or `both`. A server plugin is not
in that set and is not downloaded. The server still declares it, so step 1's label can say Modded. A layout
with no pack and no plugin does not become Modded here. `onlineCreatorLayoutRefusal`
(`packages/creator-contracts/src/layout.ts:2119`) stays as it is on the live path.

## 3. Where the code lives in the pack

**v0420.** `PACK_ROLES` is `mesh`, `texture`, `audio`, `collision`, `gameplay`, `rules`, `system`, `data`,
`legacy-manifest` (`packs.ts:161`). None of those is code. A plugin pack today can validate and be stored,
with the `KIND_NOT_APPLIED` warning, and it has nowhere to put a module.

**Approved by Craig, 2026-11-12, and not built yet.** The shape below is the format change. No new manifest field. One new role, `plugin`:

- Exactly one member, path `plugin/main.js`, role `plugin`, intent `new-behaviour`.
- The file is an ES module. Its default export is the hook in section 4. The loader loads it with a dynamic
  `import()` (ES module), not `require`. A `.js` file is not treated as CommonJS.
- Other members are `data` JSON only. The host passes that JSON in. The module does not read files.
- No second script, no `.mjs`, `.cjs`, `.ts`, `.node`, or `.wasm`, no `node_modules`.

`packDigest` already covers member bytes, so the module is in the pin. A pack that holds kind `plugin`
already has to admit `0.2.0`; the role does not lower that. The existing zombie rules pack stays `^0.1.1`
and does not gain this role. A plugin, when one is needed, is its own pack.

## 4. The hook, the tick, and the one shared change

**Proposal.** One hook. Input and output are plain JSON. The host serializes the input and parses the reply,
even in-process, so the plugin holds no room object and no shared reference. That shape is what a later
process boundary (section 5) will send as messages.

Input, one object: the event name (one of `RULE_EVENTS`; `player.join` and `player.leave` are not in the
list and this design does not add them), the fields `RULE_EVENT_SPECS` already gives that event, a plain
copy of `RuleRoomView` (`packages/match/src/creator/rules/seam.ts:28`: `tick`, and each `RulePlayer`'s `id`,
`team`, `alive`, `out`, `feet`), and plain copies of the match's rule variables, phase and timers.

Output, one array: actions whose names are in `RULE_ACTIONS`, except `hit.scale`. `RoomRuleHost.hit`
(`seam.ts:80`) returns the factor before the room lays the hit, and a reply on a later tick cannot scale
that hit. Damage the plugin still wants is `player.damage` on the tick the reply is applied. The host applies the rest
through `RuleRoom` (`seam.ts:50`): `damage`, `eliminate`, `award`, `endRound`, `endMatch`, `door`,
`respawn`, `tell`. Presentation becomes `rulesPresent` on `RulesWire` (`seam.ts:45`). The plugin never sees
the `Room`, the socket, or a way to build a wire message.

**Timing.** The room does not wait inside the tick. `TICK_HZ` is 60 (`packages/viewer/src/net/protocol.ts:237`),
so a tick is `1000/60` ms. Rules data for the event runs in the current tick, synchronously, as `RuleHost`
does now. The host then posts the JSON input. A reply is applied on the first tick it has arrived, counting
from the post, within `PLUGIN_REPLY_TICKS_ADAPTATION` (proposed, not in the tree: 4 ticks, about 67 ms). It
counts toward `RULE_ACTIONS_PER_EVENT_ADAPTATION` (32, `rules.ts:51`), `RULE_EVENTS_PER_TICK_ADAPTATION`
(256, `rules.ts:53`) and `RULE_CHAIN_DEPTH_ADAPTATION` (8, `rules.ts:55`). A reply later than that bound is
not applied, and that drop is one miss. The plugin stays on. It trips for the round, the way `RuleHost.trip`
(`host.ts:310`) trips a rules pack, only after `PLUGIN_MISSES_PER_ROUND_ADAPTATION` misses in that round
(proposed: 3). One late message, a collection pause, or the timer ordering against the message does not end
the plugin for the round. A reply can be partly applied: actions before the one that trips are already done,
and the rest of that reply is dropped. The worker or process is already started before the round; a module that is not
loaded at match start refuses the match (section 2). A map rotation reuses the host, so `match.end` opens the next
map's worker in place of the one the last round opened. The game drops whatever worker remains when it ends. A host does not take a rules pack and a plugin together.
That combination is not supported yet: a plugin's `who` is a seat id, and a pack reads `who` as a rule subject.

The plugin's timing is wall-clock, measured from post to reply on the match thread's clock. It is not the
rules' seeded order, and two runs of one input do not have to return the same actions. That is acceptable
on this class, and it is why a recording does not re-run the module (below).

**The record.** A plugin's actions are applied through the room's own paths, the same paths a rule's
actions use. When a recorder is attached, `RoomOptions.recorder` (`room.ts:367`) is told the omniscient
snapshot, each broadcast, the lobby's member changes, and each command the room runs
(`packages/match/src/replay/recorder.ts:7-14`, `snapshot` at `room.ts:10799`).
Effects that move a body or go out as a broadcast are in that recording, as a rule's effects through those
paths are. The recorder is not given the plugin's input or the action list, and the module is not run
again from the file. Re-running it would not reproduce the actions, because the timing is wall-clock.
That is acceptable for the modded class: the recording is what the room did. Central's counted match
record still does not take the result (section 6).

**The one shared change**, when this is built: `RuleHost` grows an optional listener. That change is
simulation track (CM-14): it is in `packages/match`, which every live match runs, and it takes a fresh
review. The rest of this document is product track. There is no second outcome path on `Room`. The proof is
`packages/match/test/creator/rulesRetailParity.test.ts`: the host attached, no pack, no listener, and the
retail room matches a room without the host. The new role (section 3) is approved and lands in
`packages/creator-contracts` when this runtime is built, as its own change beside this seam. The central tier is CM-16, not this seam.

## 5. Sandbox and limits

`childEnv` already strips the match child's environment of the node key, central URL, tunnel token,
`DATA_DIR`, `OUTBOX_DIR` and the other `HOST_ONLY` names (`packages/host/src/games.ts:312`).
`communitySecretsRefusal` (`community.ts:174`) and `lockedCentralUrl` (`community.ts:194`) stay on the
supervisor. The startup script hands the tunnel token to cloudflared and unsets it
(`deploy/host/community/s2u-community-host:81`). The strip is not a file sandbox. On this tier the match
child shares the uid that can open `/var/lib/s2u` and `/var/lib/s2u-outbox` (`games.ts:136`).

**Stage 1, accepted for Fuse's own plugins on his own servers.** A host-owned worker in the match child.
Its environment is empty of every `HOST_ONLY` name. The loader refuses an import of `node:fs`, `node:net`,
`node:child_process`, `node:worker_threads`, and any specifier outside the one module. This protects the
operator from a careless plugin. It does not protect anyone from a hostile plugin: the worker runs as the
uid that holds the node key and the tunnel token. Node's `vm` module is not a security boundary and is not
used as one.

**What the loader slice scans.** The module is imported in the worker. The match child posts the JSON input and
reads the JSON reply. A trip or three misses may `terminate()` that worker, and a new round starts a fresh one.
Stage 1 is still a text scan, not a sandbox: the worker shares the match child's uid. Besides import specifiers it refuses
the identifiers `process`, `getBuiltinModule`, `binding`, `dlopen`, `globalThis`, `require`,
`module.createRequire`, `eval` and `Function(`. The known bypass class is `process.getBuiltinModule` (Node
22+), and `process.binding`, `process.dlopen` and `globalThis.process` are the same class: no specifier, the
match child's uid, so a plugin can read `/var/lib/s2u`. `S2U_COMMUNITY_PLUGINS=1` must not be turned on for
any host that runs third-party plugins until stage 2 lands. Stage 2 is a separate process under Node's
permission model, or an equivalent.

**Stage 2, before a plugin is shared between operators or offered on a store.** The runtime moves to a
separate plugin process, started with Node's permission model: no filesystem, no network, no child
processes, no workers, an empty environment. It talks to the match child in the section 4 messages. The
hook does not change in that move. This design does not build stage 2. It fixes the hook so the move is a
change of transport.

Limits the plugin sits inside, on this pull request's base: child heap 512 MB
(`HOST_CHILD_HEAP_MB_ADAPTATION`, `games.ts:39`), each game counted at 600 MB (`memoryRefusal`,
`packages/host/src/main.ts:117`), `communityProcessRefusal` against 512 (`community.ts:294`,
`COMMUNITY_PROCESS_LIMIT` at `:77`), OOM score 500 so the kernel kills a game before the supervisor
(`games.ts:47`). A stage-1 worker is threads inside the match child. A stage-2 process counts as its own
process under that same 512. No new container memory number here. There is no CPU controller in this host.
The CPU cap is the reply bound in section 4.

## 6. Rankings

The owner's answer of 2026-11-12, recorded with OT.R118. Central keeps no modded ladder. The wall is the one that already exists:
`HostResults.judge` dead-letters a result when `directory.tierOf(hostId) === 'community'`
(`packages/central/src/hostResults.ts:422`). A ranked game is never placed on a community host
(`Directory.eligible`, `packages/central/src/directory.ts:1095`). A modded ranking, if Fuse wants one, lives on his servers.
`MatchReason` has no `modded` value (`packages/central/src/serviceStore.ts:2563`; the column check is
`:1699`). LATER 797 stays open only for that mark, and the mark belongs with the tier (CM-16). This design
does not add it.

## 7. Failure

Container codes on this pull request's base (`COMMUNITY_EXIT`, `community.ts:83`;
`CONTAINER_CONTRACT.md:24`, rows `:26-32`): 0 after SIGTERM's drain; 2 a refused start (`communityRefusalLine`, no secret
in the line); 70 `LAST_RESORT_EXIT` (`packages/match/src/lastResort.ts:17`), the log line the error's class
only; 75 `LINK_LOST_EXIT` (`packages/host/src/supervisor.ts:121`) or the startup script when cloudflared
dies (`s2u-community-host:88`). `closeReasonOfExit` (`games.ts:402`) ignores the signal: a match child's 70 is `failed`,
and any other exit, signalled or not, is `crashed`. `fatalOfLine` (`games.ts:420`) reports `heap` for V8's abort.

`OUTBOX_DIR/last-exit.json` is not on this base. Open pull requests #784, #785 and #786 describe it: one
object, `exit`, `reason`, `at`, under `OUTBOX_DIR`, no key, token, hostname or path. A plugin does not
write that file and does not choose 0, 2, 70 or 75.

A throw, a missed tick, a failed import, or a dead worker trips that plugin for the round. The match child
stays up. Players stay connected. The log line is the error's class. A fault that still kills the match
child uses the existing child path. The plugin is not loaded in the supervisor.

A declared pack that fails `validatePack` or `packDigest` refuses that match only. Other matches on the
host keep running. SIGTERM's drain is unchanged.

## 8. Zombies (step 4)

`packages/creator-contracts/examples/zombie-waves/` stays the rules pack, the same data locally and on the server. Forge Play seats
`spawner.release` of `behaviour.npc.patrol` through `RuleNpcSeats` (`host.ts:56`) and `Room.seatRuleRelease`
(`room.ts:3060`). The chase brain stays reserved.

The gaps from #768 that are general vocabulary, asked on #766 and added for everyone, not invented by a
plugin: an NPC strike event, and health, kind, speed and a live cap on a release.

**The growing wave count is vocabulary, not the first plugin.** A computed count (the test room's
`4 + (wave - 1) * 3`, or a count taken from a variable) serves Forge Play as well as the server. Plugin
code does not run in Forge Play, so a plugin-only count would split the local pack from the server pack.
Step 4 asks for that primitive on #766. Craig has asked that the pack check, the Modded label, the modded
tier at central, and this section's vocabulary be scoped into v0.4.21. Until the count exists, the pack's
three explicit waves (4, 7, 10) are what both sides run.

Step 4 on the server is that rules pack, through the pack check, on Fuse's server with the flag on. A
plugin is added only for a later behaviour the vocabulary still cannot say. The hook in section 4 is the
shape of that later code. It is not how wave size is implemented.

With every pack off, and with either gate off, a standard match is the retail room.

## 9. Craig's answers, recorded

1. **Opt-in.** Both. Central's tier is the authority (CM-16). The image flag is the local switch. The
   loader refuses unless both hold, once the tier exists. Step 4 may use the flag alone on Fuse's server
   until then.
2. **Same uid.** Accepted for his own plugins on his own servers. Stage 1 protects a careless plugin only.
   Stage 2, before a plugin is shared or put on a store, is a permission-model process and the same messages.
3. **The kind.** Already in v0420. Nothing waits on a further format read for the kind. The role in
   section 3 is approved as written there.
4. **A bad pack.** Refuse the match, not the host.
5. **Rankings.** As section 6: the owner's answer of 2026-11-12, recorded with OT.R118. LATER 797 remains for the `modded` mark, with CM-16.
6. **Zombies.** The rules pack stays. Vocabulary for the gaps in section 8, including the growing count.

No question from the first draft is still open.

## 10. Docs and wiki updated with the loader

The loader slice updates the wiki and the specs below in the same change as the code. `CONTAINER_CONTRACT.md` and
`docs/LATER.md` 797 stay as they are: deploy and the `modded` mark are out of this slice.

| page | what changes |
|---|---|
| `shared/modding-wiki/content/docs/kinds/index.mdx` | the `plugin` row's status, once something runs it |
| `anatomy.mdx`, `reference/manifest.mdx`, `changelog.mdx` | the `plugin` role, `sides: server`, the `0.2.0` floor |
| `rules-and-limits.mdx` | the hook's JSON, the reply bound, `hit.scale` excluded, recordings do not re-run the module |
| `what-is-a-pack.mdx` | one sentence: kind `plugin` is stored today and runs only on a modded community server |
| `deploy/host/CONTAINER_CONTRACT.md` answer 8 | both gates, the match refusal, `last-exit.json` not the plugin's file |
| `docs/specs/2026-10-27-creator-rules-contract.md` section 3 | the third level, opened for this class |
| `docs/specs/2026-10-25-pack-framework.md` | the role |
| `docs/plans/2026-10-30-community-host-tier.md` | the "no plugin path" hold, true for every host whose tier is plain community |
| `docs/LATER.md` 797 | with CM-16, for the `modded` mark only |
