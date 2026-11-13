# 370 -- Thunderstore's package format, fitted to the v2 pack (FCW-33)

Written 2026-10-27 by FCW-33's implementer (branch `agent/fcw-33-pack-import`). **Product track** (OT.R53): a browser
adaptation with no original -- the creator pack format and how it fits an outside store's -- so nothing here is a
reading of the game and no value here changes what the game does. The note exists for one reason: the dispatcher's
approved brief names the store team a `*_PLACEHOLDER`, and the placeholder ledger
(`tools/test/placeholderLedger.test.ts`) reads only research notes. The format itself is specified in
[`specs/2026-10-25-pack-framework.md`](../specs/2026-10-25-pack-framework.md), "Thunderstore's package format"; the
deltas it closes are [`specs/2026-10-27-creator-rules-contract.md`](../specs/2026-10-27-creator-rules-contract.md) §8.

## 1. The source

Thunderstore's wiki, "Creating a package" (wiki.thunderstore.io), as the rules spec §8 quotes it (read 2026-10-26 by
the UI seat). Nothing is fetched at run time and nothing was fetched for this task (H342; the owner, 2026-10-26: their
format now, no API fetch, no store page). The wiki's list is held as data in `packages/creator-contracts/src/packs.ts`
`THUNDERSTORE_PACKAGE_RULES` and tested by `checkThunderstorePackage`.

## 2. Placeholders

| Name | Status and evidence needed |
|---|---|
| `THUNDERSTORE_TEAM_PLACEHOLDER` | Resolved 2026-11-11 (FX-4): replaced by `THUNDERSTORE_TEAM` = `SOCOM_Legacy`, the owner's answer to HUMAN_TASKS H342 (plan `2026-11-11-forge-export-sprint.md` FX.R2); the team is not yet created on thunderstore.io. It was the stand-in `TEAM_PLACEHOLDER` in creator-contracts `packs.ts`, the default of `thunderstoreIdentity` and `thunderstoreManifest` and then the `Team` of every exported dependency pin; a pin now takes the team that published that dependency, given per dependency, and one with none given is `store.DEPENDENCY_TEAM_UNKNOWN`. |
| `HD_PACK_STORE_PAGE_PLACEHOLDER` | viewer `console/adapters/mods.ts` (B206 ML-2, ML.R16): the HD pack's Thunderstore page, linked from the MODS screen; `null`, so no link is drawn -- never a made-up address. Open: settled once the owner has uploaded the pack ML-5's option builds (H413's answer) and its page exists, its address given by him. |
