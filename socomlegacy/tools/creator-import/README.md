# Original-authored source preparation

This is a product adaptation. The tool prepares neutral geometry from approved local bytes; it does not publish
packs, load resources, serialize rendered materials, choose engine units or establish player collision.
Its internal TypeScript shapes are not the pack manifest or an engine asset contract.

The current container subset is deliberately strict: one glTF 2.0 JSON chunk first, followed optionally by one
BIN chunk. Duplicate or unknown chunk types refuse `GLB_CONTAINER`, including bounded unknown chunks which a
general glTF reader would ignore. This is a labelled import-tool restriction, not a claim that such containers
violate glTF. No unknown chunk is silently discarded and no extension's semantics are implicitly implemented.

The prepared numeric-output, aggregate structural-work and GLB JSON limits are named product-tool adaptations in
`src/limits.ts`, separate from the shared pack byte/member bounds. The numeric counter includes returned bounds,
positions, indices and hulls; it is not a JavaScript heap or timing measurement. Source and baked hull work both
charge the shared counter; known shape cost reserves before face access, and face index counts reserve before
index traversal. Over-cap inputs refuse without truncation.

The original prop fixtures under `fixtures/props` retain their neutral sidecar shape (`coordinates`,
`intendedCollision`, and named faces with `indices`). A tool-internal adapter projects that shape without coercion;
it does not make those files runtime asset definitions or independently verify their audit-inventory hashes.

The F1–F4 follow-up retained behavioral RED on `690609d92`: 12 failed, 116 passed, 1 TODO. The candidate now names
unsupported extensions before resource interpretation, bakes each visual-only node frame independently, and adapts
the actual solid/external prop sidecars. Solid sidecars still require one matching resolved frame. `extras` remains
opaque author metadata, and original GLB provenance stays an owned byte copy. The ordinary GLB suite retained GREEN
128 passed / 1 TODO in `codex-seat-20261025T101111Z-690609d92-test.log` on exact tree
`361bc0988eed1bc99378ef0fcb9d91fc6d63b43d` (committed as `9e31e81a8`). Collision regression at `6a9383351` passed
35 with 4 TODOs. A subsequent fresh source review found uncharged outer hull projection; `422f27031` retained
2 failed / 128 passed / 1 TODO using traversal canaries. Fix `c0d581fa0` reserves outer work and rejects undersized
hulls before later traversal: GREEN 130 / 1 TODO on exact tree `1338b487561bbb3ad04ea65a2d6ef4cd15e4c03a`, then
fresh corrective source PASS, high confidence. Prior FAIL remains part of this evidence; neither rendered
materials nor renderer/engine/player-collision acceptance is claimed.

The aggregate `SOURCE_BUDGET` case uses distinct approved member paths and one shared readonly 1 MiB byte source,
testing real logical member accounting with a small physical input. The single-member 500 MiB + 1 byte boundary
is separately prepared in `creatorImportSourceBudget.large.test.ts` and explicitly skipped without a separate
controller memory grant. It must not be enabled in the ordinary one-file slot. Total process peak/RSS is unmeasured.
No fake byte lengths, reduced production cap or test-only production injection seam substitutes for these cases.

## Asset-member writer

`src/assetMember.ts` implements the asynchronous `prepareAssetMember(glb, authoring, context)` seam. Context
extends the existing approved-member context with `assetId`; no pack reference is required before the pack digest
exists. Existing source preflight supplies owned baked geometry; approved member bytes and metadata are snapshotted
before the first digest await. The writer checks the published ID/path, collision face bound and output budgets,
hashes exact owned original bytes, and returns canonical JSON bytes or a diagnostic report with no member.
Root retained **41 collected behavioral assertion failures** against the inert writer at `198f9a40a` before this
implementation. Root then retained 41 GREEN, tools typecheck exit 0 and fresh whole-source review PASS high at
`00d86c31f`. Claude independently reviewed PASS WITH FINDINGS high and integrated the writer with 41 GREEN.
Rendered/textured and whole-batch acceptance remain owed. Checks use the
guarded shared runner, one file per invocation, after explicit grants; this README grants no runtime authorization.

The single output is `assets/<assetId>.json`, using the engine reader's existing schema, identity frame for
already-baked hulls, and freshly computed provenance over the exact original GLB view bytes. Visual-only collision is
exactly `{intent:'none'}`. The visual member remains the original owned GLB with its original node hierarchy; the
definition's baked claim covers hulls and bounds. Sources remain explicitly metre/+Y. No visual serializer, engine
unit conversion, manifest, public schema, installation or page change is part of this bounded writer. The page owner
still owes matching metre-to-game scaling and approved relative-image resolution. Definition output alone establishes
no rendered/textured prop, Blender export, physical solidity, navigation or full FCW-09 acceptance.
