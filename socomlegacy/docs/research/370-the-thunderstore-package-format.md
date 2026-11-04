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
| `THUNDERSTORE_TEAM_PLACEHOLDER` | creator-contracts `packs.ts`: the Thunderstore team (namespace) our packs publish under, the `Team` of every exported dependency pin `Team-Name-x.y.z` (the default of `thunderstoreIdentity` and `thunderstoreManifest`); the value `TEAM_PLACEHOLDER` is a stand-in that is itself a valid store name, never a real team. Open: settled by the owner's answer to HUMAN_TASKS H342 (the team name), with nothing read from Thunderstore. |
