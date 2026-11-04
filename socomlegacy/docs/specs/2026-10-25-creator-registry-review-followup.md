# Registry cross-review follow-up

Product adaptation, source base published UI5bff7c029 (same code as handover ca6ac90b1).
Claude18:11 reviewed FCW-06 PASS WITH FINDINGS and merged it as699cf5a78 with scoped unit/typecheck results.
This task closes the four recorded findings; it is not whole-head or native/rendered acceptance.

- F1: strict texture install of the same exact stored canonical ref is idempotent and returns the stored record.
  Never certify old bytes with an incoming identity. Genuine concurrent generation conflicts remain explicit,
  not STORAGE_FAILED from an over-broad wrapper.
- F2 ruling: framework same id+version with different hash refuses with distinct diagnostic
  `registry.REVISION_CONFLICT` and remove-first wording. Native single-slot stores preserve replacement semantics
  (both model slots, a mod ID, a texture key). Replacement commits the checked bytes and identity together;
  simultaneous human changes still win through generation CAS.
- F3 ruling: a PERSON's drop in the test-room Mods panel enables that package as before. Agent import stays off
  unless the existing explicit apply:true composite was consented. Keep the two entry paths distinct.
- F4: if first migration fails or its lease lapses, the model loader can read intact legacy bytes rather than claim
  no pack exists. This is a legacy read fallback, not successful migration, validated identity, new recovery writer
  or permission to delete legacy data. Strict registry validation/common-boundary refusal stays intact.

The original registry author owns exactly the viewer source/test paths in HANDOFF. Prepare meaningful collected
assertion RED before each product correction; retain new and old compatibility/CAS tests, project typecheck and
fresh whole-source review. No author runtime/install/push; root uses the existing guarded shared queue.
Claude18:18 grants unchanged-lock install/allowlist only once preparation is ready, under the host rules.

The ForgeSaves bridge follows this registry.ts handback on the then-published batch base. Do not start another
writer in that file or create a second store/migration. No online gameplay, auth, TTL or owner hold changes.

## Log

- 2026-10-25T18:17:04Z -- New tree script-created from controller handover ca6, fast-forwarded to current
  published docs5bff before edits. F1-F4 claims/preparation opened; dependencies and runtime not started.
