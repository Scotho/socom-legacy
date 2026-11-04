# FCW-35: rules come from installed packs (the design note for H354)

Drafted by the UI seat, 2026-10-27, on the dispatcher's ask; the owner's row is H354 (`HUMAN_TASKS.md`). **Docs
only: no `creator-contracts` code until Craig says go.** FCW.R19 is the dispatcher's reading of the reviewer's
recommendation; FCW-30's contract owner and Craig may overturn it. This note is what it would mean, what it costs,
and the one alternative.

## The question in one line
When a creator writes rules for a layout in the Forge, where do those rules live: **inside the layout's saved record**,
or **in a rules pack installed beside it** that the layout names (mode + requires)?

## Today (FCW-32 as it lands in B167)
- The record (layout v3) has no field for rules. The Forge keeps the author's rules **beside** the record: in undo
  steps, in an "authoring envelope" (autosave and a downloaded file, written only for a layout with rules), and in a
  named save's `rules` field. An older build sets an envelope aside as unreadable, and nothing is lost.
- What travels: a file download (the envelope). What does not: the share code (refused by name, "a layout with rules
  travels as a file"), the lobby (refused, H273/H274), map packs (refused by name).
- Two copies of one check: FCW-30's F2 (a `brain` naming a capability that is no brain; a release whose kind does not
  match its spawner's source) runs in the Forge (`rulesAuthoring.ts`), not in the shared `validateRules`, because the
  contract's entity list does not carry spawner sources. The two already disagree on a case (review F9).

## The recommendation (FCW.R19): rules from installed packs
1. **The record stays mode + requires.** No rules field in layout v3. A layout says "I play mode X from pack P@v
   (digest d)", as it already does for a downloaded mode.
2. **The author's draft becomes a local rules pack in the registry.** Writing rules in the Forge makes or updates a
   local pack (kind `rules`, the author's id, version bumped on save, re-sealed on the first edit after an import --
   FCW-32's F1/F2 already do the sealing). The mode list reads installed packs (`rulesModeCatalogue`, spec §7), so a
   creator's own mode and a downloaded mode are the same kind of thing.
3. **A download is the layout and its pack, one bundle.** Opening the bundle installs the pack (FCW-33's v2 install)
   and opens the layout. The share code can then carry a reference and say "needs pack P" instead of refusing.
4. **F2 moves into `validateRules`.** `layoutEntityIds` carries each entity's source (and a brain marker on the
   slots), so the shared validator refuses what Play would refuse; the Forge's copy is deleted. One check, everywhere
   (the Forge, MCP, the room, a future store).
5. **Migration.** The envelope and `NamedSave.rules` are read once, turned into a local pack plus a requires line, and
   never written again. Whether that needs a record version step is decided in FCW-35.

## Why (the review's case, #532's direction)
- **#532:** modes are examples built on the public mechanisms. A creator's own mode on the same path as a downloaded
  one means one way in, one way to share, one validator.
- **Forks:** an inline rules field makes every layout a private fork of its mode -- two layouts on "the same" paintball
  differ silently. A pack keeps one copy, versioned, with a digest.
- **Thunderstore:** a rules pack is already a store-shaped package (FCW-33); a mode authored in the Forge can be
  published as-is later (the API sprint, H342), with no conversion.
- **FCW-34** (the independent CTF test) works from installed packs; an inline field would be a second path it must
  not need.

## What it costs
- `creator-contracts`: `layoutEntityIds`' shape (sources), `validateRules` gains F2, the registry learns local rules
  packs. That is FCW-30's contract, so a contract version note (additive).
- The Forge: the save paths switch from the envelope to "pack + requires"; one migration read; the bundle download.
- My estimate: about the size of FCW-32's round 2 (a few hundred lines plus tests), one implementer, after B167.

## The alternative (not recommended)
**An inline v3 rules field.** Simpler today (no registry step, the rules live where the layout lives), but
every layout becomes a fork of its mode, sharing needs the whole spec in the share code (likely past its size;
not measured), and the store path needs a conversion. It also keeps two kinds of mode (inline and installed)
the Forge and the room must both handle.

## What Craig is asked

**Answered (2026-10-28, H354, the owner's words verbatim there):** the rules do not go in the Forge layout; its
settings for matches do; a separate Forge layout save is an option if the customization grows large. FCW-35 proceeds on
that when the Forge lane resumes.
- **Go / no-go on FCW.R19** (rules from installed packs), so FCW-35 can touch `creator-contracts`.
- Until then: nothing in `creator-contracts`; FCW-32 ships with the envelope (it loses nothing; it cannot share or host
  a rules layout, as today).
