// AX-2 (a browser adaptation, product track; contract C5): the guide's `forge-build` topic.
import { FORGE_PROBE_LIMITS, LIMITS } from "@s2u/forge-agent-protocol";

export function forgeBuildTopic(): string {
  return [
    "# forge-build -- reading, editing and checking a Forge layout (surface forge-editor)",
    "",
    "## Read before you write",
    // viewer/src/agent/forgeTarget.ts "target.status"
    "- `target.status`: ready, revision (the layout's), viewRevision, canUndo, canRedo, selection.",
    // forgeTarget.ts "forge.read": section default "pieces"; "metadata", "view", "refs" or any array field of the layout
    "- `forge.read` {section?, cursor?}: section defaults to \"pieces\"; \"metadata\" (name, base, counts), \"view\" (camera, " +
      "toggles, tool, snap), \"refs\" (the placements you can name), or another array of the layout record (spawns, assets, " +
      "hidden, npcs ...). A section that is not an array: INVALID_SECTION.",
    // viewer/src/agent/paging.ts page: at most 100 items, within LIMITS.controlBytes - 4096, a base64 cursor bound to revision and section
    "- Pages hold at most 100 items. Pass the answer's nextCursor as cursor for the next page; a cursor is bound to its " +
      "section and revision (after any edit: REVISION_CONFLICT; read from the start).",
    // forgeTarget.ts "forge.catalogue": default "operations" (FORGE_AGENT_OPERATIONS), "saves", or a catalogue array (api.ts ForgeAgentCatalogue)
    "- `forge.catalogue` {section?, cursor?}: section defaults to \"operations\" (the page's Forge operations with their " +
      "input schemas); \"saves\"; or a catalogue list: archives, palette, characters, absent, basePlacements, hidden, favourites.",
    // viewer/src/forge/agent/api.ts assets.query: query, archive, role (visual | ground-surface | wall-surface), limit 1..100, cursor
    "- `forge.assets` {query?, archive?, role?, limit?, cursor?}: the loaded palette's prototypes with their actual visual " +
      "bounds and collision roles (visual, ground-surface, wall-surface); limit 1..100. Never judge solidity by a name.",
    // api.ts starters.list / starters.preview / starters.apply; protocol OPERATIONS forge.starter.* (apply needs import)
    "- `forge.starters`, `forge.starter.preview` {id, ...}: six authored starter layouts and a read-only plan of one on " +
      "the loaded base; `forge.starter.apply` imports it as one undoable edit (import permission, expectedRevision).",
    "",
    "## Where the player points",
    // protocol OPERATIONS["forge.focus"] (inspect, forge-editor); viewer/src/forge/agent/editorFacade.ts notePoint / focus;
    // the point is the editor's own pick under a left click (viewer/src/forge/page.ts act -> pick), cleared with a new base
    "- \"Put a crate here\" means nothing until you know where here is: ask the player to click where they want it, then " +
      "call `forge.focus` {}. It answers {point: [x, y, z] | null, pointAt, selection, camera: {x, y, z, yaw, pitch}, " +
      "revision}: point is the world point under their last left click in the viewport (a placement, the map or the " +
      "floor), pointAt its time in ms since the epoch -- use it as an edit's at. point is null before a click, after a " +
      "click on nothing, or once the base is replaced. selection is refs, valid for one revision: act on them at that revision.",
    "",
    "## Check a placement",
    // api.ts placement.check {ref, at, yaw?}; protocol OPERATIONS["forge.placement"] (diagnose)
    "- `forge.placement` {ref, at, yaw?} (diagnose): inspects a proposed placement of a queried asset without placing it. " +
      "Its bounds overlap and sampled hull probes never certify that a player can walk there.",
    // AX-17: protocol OPERATIONS["forge.probe"] (diagnose) -> viewer/src/forge/agent/probe.ts probeForge over the placement grid
    "- Probe the ground before placing; place at the returned height. `forge.probe` (diagnose, read-only) reads the same " +
      "collision: {kind: \"ground\", at: [x, z], below?} answers y, the point and what it hit ({kind: \"base\"} or {kind: " +
      "\"piece\", ref}); {kind: \"ray\", from, to} the first hit (point, normal, distance); {kind: \"free\", near, radius, " +
      "footprint?: [w, d], step?, limit?} ground points nearest first whose footprint overlaps no placed piece's bounds. " +
      // forgeOperations.ts FORGE_PROBE_LIMITS
      "Bounded: radius <= " + FORGE_PROBE_LIMITS.radius + ", ray <= " + FORGE_PROBE_LIMITS.ray + " units (else PROBE_TOO_LARGE), at most " +
      FORGE_PROBE_LIMITS.samples + " samples and " + FORGE_PROBE_LIMITS.budgetMs + " ms; past a bound the answer is partial and names it in " +
      "bounds. A diagnostic: it never certifies that a player can walk there.",
    "",
    "## Edit",
    // forgeTarget.ts "forge.edit": args.operation must be a FORGE_AGENT_OPERATIONS entry whose permission is edit, else PERMISSION_DENIED
    "Every layout write is `forge.edit` with args {operation, arguments} -- two levels: agent_request's operation is " +
      "forge.edit; the page's own operation and its arguments ride inside. Only the page's operations whose permission " +
      "is edit pass; any other is refused UNSUPPORTED_OPERATION, whose data.admitted lists those that pass (re-pairing " +
      "never helps). The inner arguments are checked against that operation's " +
      "schema (INVALID_ARGUMENT names the path). expectedRevision sits on agent_request, not inside args.",
    // api.ts piece.place {asset, at, yaw?}
    "Example: agent_request {operation: \"forge.edit\", expectedRevision: 12, args: {operation: \"piece.place\", " +
      "arguments: {asset: \"<a forge.assets row's asset>\", at: [x, y, z], yaw: 0}}}. piece.place takes the row's " +
      "asset field, not its ref (the ref is forge.placement's; passing it is refused ABSENT_ASSET).",
    // api.ts FORGE_AGENT_OPERATIONS names (permission edit)
    "Common edits: `piece.place`, `piece.move` {refs, delta}, `piece.rotate` {refs, yaw}, `piece.delete`, `piece.lock`, " +
      "`piece.unlock`, `spawn.place` {team A|B, at, yaw?}, `npc.place`, `bomb.place`, `placement.set`, `layout.name`, " +
      "`type.set`, `settings.set`, `objectives.set`, `layout.new`, `layout.base`.",
    // api.ts layout.batch: edits 1..100 of {operation, args}; "destructive ref reindexing is refused before later ref writes"
    "- `layout.batch` {edits: [{operation, args}, ...]}: 1..100 edits as ONE undo step (note: args here, not arguments). " +
      "A delete renumbers refs, so an edit that writes a ref after a delete in the same batch is refused: put deletes last.",
    // the revision: api.ts guard (STALE_REVISION), forgeTarget.ts (REVISION_CONFLICT); api.ts "Refs live for ONE revision"
    "- After an edit the result's revision is the next expectedRevision, and every ref read before it is void: read " +
      "`forge.read` {section: \"refs\"} again (topic coordinates).",
    // viewer/src/forge/agent/editorFacade.ts AGENT_VIEW_OPERATIONS: need the current revision, advance only the view's
    "- `view.set`, `camera.pose`, `camera.look`, `camera.focus`, `snap.set`, `tool.set` and the palette edits need the current " +
      "revision but do not advance it.",
    // editorFacade.ts agentRef: a locked ref refuses LOCKED
    "- A locked placement refuses LOCKED: `piece.unlock` it first (ask the player; they locked it).",
    // protocol OPERATIONS forge.undo / forge.redo; forgeTarget.ts -> api 'undo' / 'redo'
    "- `forge.undo` and `forge.redo` (expectedRevision) step the editor's history one edit; canUndo/canRedo say whether " +
      "they can.",
    "",
    "## Check the map",
    // forgeTarget.ts "forge.check": answers {issues: <count>, detailsOperation: "forge.issues"}
    "- `forge.check` (diagnose) runs the editor's layout and hull check and answers the issue count; `forge.issues` pages the " +
      "issues themselves. Run it before `forge.play`: Play with issues is refused (topic forge-test).",
    // protocol OPERATIONS forge.rules / forge.rules.check
    "- Rules: `forge.rules` {section?} reads the vocabulary, spec, modes or entities; `forge.rules.check` validates them; " +
      "their writes are forge.edit's rules.* and zone/marker/spawner edits.",
    "",
    "## Save and export",
    // api.ts saves.save (edit) via forge.edit; forgeTarget.ts forge.catalogue "saves"
    "- `saves.save` {name} through forge.edit stores the layout in the player's browser; `forge.catalogue` {section: " +
      "\"saves\"} lists the saves. `saves.load` needs import and is not an edit, so forge.edit refuses it: no wire route today.", // forgeTarget.ts forge.edit permission check
    // forgeTarget.ts forge.export.begin / chunk: {transferId, size, chunkBytes, revision}; base64 chunks of LIMITS.chunkBytes
    "- `forge.export.begin` {} answers {transferId, size, chunkBytes, revision}; then `forge.export.chunk` {transferId, index} " +
      "for index 0, 1, ... while index * chunkBytes < size, each base64 (`chunkBytes` = " + LIMITS.chunkBytes + "). An edit " +
      "between chunks voids it (REVISION_CONFLICT); it expires after `transferAbsoluteMs` = " + LIMITS.transferAbsoluteMs + ".",
    // forgeTarget.ts forge.import.begin {transferId, size, digest: sha256 hex}, chunk {transferId, index, data}, finish
    "- `forge.import.begin` {transferId, size, digest (SHA-256 hex)}, `forge.import.chunk` {transferId, index, data (base64)}, " +
      "`forge.import.finish` {transferId}: a layout of at most `transferBytes` = " + LIMITS.transferBytes + " bytes, " +
      "imported as one undoable edit (import permission; each call carries expectedRevision).",
    "",
    "## Ask the player first",
    "Before `layout.new`, `layout.base`, `piece.delete` of many refs, `saves.delete`, `rules.clear` or an import over their " +
      "work, say what will change and wait for the player's yes. Everything is undoable, but ask.",
  ].join("\n");
}
