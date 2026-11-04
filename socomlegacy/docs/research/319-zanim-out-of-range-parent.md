# 319 -- A zAnim node reference's parent 249: the original's 0xf9, not out of range (PAR-92, PARITY-2)

- Date: 2026-10-14 (PARITY-2, row PAR-92; plan
  [`../plans/2026-10-08-web-sprint-parity-2.md`](../plans/2026-10-08-web-sprint-parity-2.md); the gameplay seat's
  brief `2026-10-14-par92-zanim-parent-read.md`, dispatched on the merge controller's sequencing, OT.R54). Branch
  `agent/par92-read`, base 2d4cd649c. **A read alone**: no build, no test written, no node process and no reader run.
- Status: **reading, pending review.** Source inspection only: the decompilation, the game ELF's bytes (its strings
  and the resolver's instructions, read by a scratch script), reCOM's header, the committed fixtures' manifest and
  goldens, and the port's code. No game, emulator, capture, browser or reader was run. Every value below is a reading
  until a reviewer who did not write it re-reads it at the source. *Reviewed 2026-10-14 at 25bfd7250: PASS WITH
  FINDINGS, high confidence (the central claim and the sign question hold); its four low findings F1-F4 are folded
  below, each with the text it replaces beside it.*
- *PAR-92's build (2026-10-14, branch `agent/par92`, commits f234bbc0d..76f831e29; the gameplay seat's brief
  `2026-10-14-par92-campaign-zanim.md`):* B1-B4 built, B5 asserted; §4.2's survey run off the dev disc by B4's
  `packages/viewer/test/campaignZanimDisc.test.ts` (13 of 13 passed, none skipped), its numbers written under each of
  U1-U4 with the open text kept; §5's three candidates are in code. Dev-disc test and unit tests, reading, pending
  review; no game, capture or browser run. One failure in the files run is the environment's, not the build's:
  `packages/scene/test/zanim.test.ts`'s "every map" test reads `public/maps/RUN` and finds 3 of its 22 maps (the copy
  of `wt-parity-2`'s `public/maps` this worktree used holds MP2, MP51 and MP72), so it fails at its count before it
  reads an archive, whatever the reader does. *Widened the same day by the gameplay controller:* `worldState.ts`'s
  three `placeRefs` calls pass the parents (§4.1, B2), held by the dev-disc test
  `packages/viewer/test/zanimParentRunDisc.test.ts` (5 of 5 passed, none skipped).
- Sources: `D:L<n>` is `game/analysis/socom2_game.elf.decomp.c` (SHA256
  `B9E863762F08D55602C4310C9491286879CFCF2947683E723BC2905E1AAA42D4`, the bytes research 230, 251 and 318 pin). The
  ELF is `game/disc/socom2_game.elf` (SHA256 `06B83684719A78AD0580F236BD0EDDD40453F87D9C30C0D39021331915798872`). The
  functions' names are the desktop's table at the pin
  (`desktop@be5578311ff2dd33a814d39e7d6d4f2255da4da3:recomp/socom2_names.csv:930`, `:931`, `:933`:
  `CZAnimSet::Load` 0x26bc50, `CZAnim::Load` 0x26d370, `CZAnim::CreateInstanceNode` 0x26ee70); the others are named
  here by what they do, not by a table. reCOM's `zAnim/zanim.h:417-435` (`_zanim_node_ref`). Evidence:
  [research 77](77-motion-format.md) §9 (the 66 multiplayer archives); [research 89](89-effects.md) and
  [research 149](149-the-muzzle-fire-follows-the-gun.md) §2.2 (0xf9 and 0xfa as command operands); [research 209](209-the-mutable-world.md)
  §4, §7 (`NODE_REF_SCOPE_READING`); [research 318](318-line-strips-under-the-mesh-state.md) §3.2 (B0's survey, which
  found the refusal on all 12 campaign archives).

## 0. Answers

| # | finding | level | section |
|---|---|---|---|
| R319.1 | **Parent 249 is 0xf9, a sentinel, not an index.** The original's node resolver gives 0xf9 the meaning it gives the commands' node byte: the animation's own instance node, else its root reference's node. The port already reads it so for commands (`NODE_ROOT`, `packages/scene/src/effects.ts:165`). It is not "none" (0 is none) | reading, pending review | §1.2, §1.3, §2.2 |
| R319.2 | **The loader checks no parent.** `CZAnim::Load` copies `Node_Ref_List` as it is read and returns 1 every time; `CZAnimSet::Load` ignores the return. Nothing is refused, skipped or clamped, and no animation or archive is lost | reading, pending review | §1.1 |
| R319.3 | **Reference 2 resolves beneath the animation's instance or root**, as a named child of that node, at the set's start. Where neither node exists, the reference stays null: its commands act on nothing, and there is no error | reading, pending review | §1.3, §1.4 |
| R319.4 | **An index past the table never reads past it.** For an index that is not 0, 0xf9 or 0xfa, the resolver first appends blank references until the index is inside the table. A blank reference can still resolve a node, by the animation's name 0. Index 255 never ends: the one-byte count cannot pass it (§1.2). *Fixed at the review (F1); was:* "the resolver first appends blank references until the index is inside the table" (and §2.2's "resolves to nothing") | reading, pending review | §1.2 |
| R319.5 | **When: the set's start**, which is the round's start at the map's load (`FUN_002a7d40`; online the round's restart `FUN_002232a0`. *F4; was:* "offline `FUN_002a7d40`": `FUN_00223680` calls it too), and again whenever an animation makes its instance. The load of the archive itself resolves nothing | reading, pending review | §1.4 |
| R319.6 | **A parent-0 reference is looked up beneath the root first, then in the world by its search mode, but never in the world for search 1.** This is the resolver research 209's `NODE_REF_SCOPE_READING` owed, and it agrees with the port's `SCENE_INSTANCE_SCOPE_READING`. A non-zero parent is looked up beneath the parent's node only, with no world fallback | reading, pending review | §1.2, §1.5 |
| R319.7 | **`otc_posechar` is not in the committed sources.** No fixture holds a campaign archive and no golden names it, so its commands, its flags and who starts it remain unread (§4.2). The multiplayer archives have no reference like it: all 66 pass the reader's parent check (research 77 §9). *PAR-92 B4 (2026-10-14):* read off the dev disc -- a character pose animation rooted at `player`, its 25 bone references parented 0xf9, started on one map only (M51's `m51obj1`), §4.2 U1-U2. Reference 2 was the first of 636 parents 0xf9 on the twelve maps (four `otc_` animations), the one the old reader stopped at | the absence: source inspection; the survey: dev-disc test, reading, pending review | §2, §4.2 |
| R319.8 | **The port differs in seven places.** The reader refuses the whole archive. Four readers each lose the whole mission set; the sound reader loses the common set's zAnim sounds as well. The placement ignores `parent`. Three doc lines are wrong. *PAR-92:* D1, D2, D3, D4, D5 and D7 closed by B1-B3; D6 closed in `mapMeta.ts` and `sceneHealth.ts` (B2), and at run time in `worldState.ts` (§4.1; *was:* "with two run-time callers left outside the build's files"); the page's effects owed (§4.1) | source inspection | §3 |

## 1. The original's loader

### 1.1 The load: no parent is looked at

- The path from the archive to an animation: `CZAnimMain::LoadZAR` (`FUN_00267ab0`) calls `CZAnimSet::Load`
  (`FUN_0026bc50`) once for each set (D:L113538), and that calls `CZAnim::Load` (`FUN_0026d370`) once for each animation
  key (D:L115952). `CZAnimSet::Load` does not look at the return.
- `CZAnim::Load` (D:L116925-116982) reads these keys in order (their names are the ELF's strings at 0x3ed3f8-0x3ed448):
  1. `Anim_Params`, 24 bytes into the animation (D:L116937).
  2. `Anim_Health` where present (D:L116939-116949).
  3. The name index table (`FUN_00268960`, D:L116950).
  4. `Node_Ref_Count`, kept as a byte at +0x36 (D:L116951-116952).
  5. `Node_Ref_List`, count × 8 bytes, into a table at +0x40 (D:L116957-116960). The second word of each record is
     then set to 0 (D:L116961-116969): it is reCOM's `node_ptr` (zanim.h:434), the slot the resolver fills.
  6. `Seq_Data_Size` and `Seq_Data` (D:L116971-116980).
- Then it returns 1 (D:L116981). None of the record's three fields (parent, name, search) is compared with anything at
  the load.

### 1.2 The resolver (`FUN_0026f4e0`, D:L118147-118235)

The resolver takes an animation, an index and a create flag, and returns a node pointer. In order:

- **0** gives null (D:L118159-118160): reference 0 is the empty one, as the port's `NA` reference 0 is.
- **0xfa** gives the caller's node, through the context at +0x18 (`FUN_00272390`, D:L118164-118169).
- **0xf9** gives the animation's instance node at +0x3c if it has one. Otherwise it gives the stored pointer of the root
  reference (the `Anim_Params` byte 1 at +1), or null when the root index is 0 (D:L118170-118179). It does not create
  anything.
- **Any other index** first grows the table: while the count at +0x36 is not above the index, it appends a blank
  reference (`FUN_0026e2f0` with name 0, parent 0 and search 0, D:L118182-118184; the append is D:L117501-117531). Then
  it reads the pointer slot (D:L118185-118187). The table is never read past its end. Two consequences (*F1, added
  at the review*):
  - **Index 255 never returns.** The count is one byte. The loop reads it zero-extended and compares with `slt`
    (0x26f5a8-0x26f5b0), and the append adds 1 to it as a byte (D:L117514, D:L117527). The loop needs the count above
    255, so the count wraps to 0. The append's empty-table branch (D:L117508-117515) then reallocates the table to one
    slot, and the loop goes round again for ever.
  - **Indices count .. 248 and 251 .. 254 end at a blank slot**: name index 0, parent 0, search 0. With create set, the
    blank slot resolves as any parent-0, search-0 reference does (D:L118191-118217): the name at index 0 of the
    animation's name table is looked up beneath the root, then in the world. The port reads that name as `NA`
    (`packages/scene/src/zanim.ts:153`). Whether any node answers to it is untraced.
- **With create set**, an empty slot is resolved unless the record is a light that is not a local light (bit 22 set and
  bit 30 clear, D:L118188-118190; reCOM's order puts `is_light` at bit 22 and `is_local_light` at bit 30):
  - **Parent byte 0** (D:L118191-118219):
    - If the reference is not the root itself, the root reference is resolved first (recursively). The name is then
      looked up beneath the root's node, through the node's find-by-name with argument 1 (D:L118192-118198).
    - If nothing was found, the world is searched (D:L118199-118203). That happens when the search mode is not 1, or the
      reference is the root, or there is no root (root index 0). An instanced root goes through `FUN_0031fd10` by name
      (`Anim_Params` flags bit 9, D:L118204-118210). Every other reference goes through `FUN_00269230` with its search
      mode (D:L118211-118217; §1.5).
  - **Parent byte non-zero** (D:L118221-118228): the parent is resolved through this same function (recursively), and
    the name is looked up beneath the parent's node with the same find-by-name. There is no world fallback, and the
    search mode is not consulted.
  - The result is stored in the slot, null included (D:L118230).

**The parent byte is zero-extended.** The decompilation types the record as `char` at the recursive call (D:L118222).
The machine code shows the type does not matter:
- At 0x26f600 the parent is loaded with `lbu` (zero-extended) into the argument register, and the call is at 0x26f60c.
- On entry, the function compares the whole register with 250 (0x26f518-0x26f51c) and then with 249 (0x26f540-0x26f544),
  without masking it.

So parent 0xf9 arrives as 249 and takes the 0xf9 branch. It is not -7, which would have indexed slot -7.

### 1.3 What parent 0xf9 names

A reference whose parent is 0xf9 is **a named child of the animation's own node**:
- the instance the animation made of its root, when it has one;
- else the root reference's resolved node.

It is looked up beneath that node only, never in the world (§1.2, the non-zero parent branch).

The instance is `CZAnim::CreateInstanceNode` (`FUN_0026ee70`, D:L117936-118006). It runs for an animation with
`Anim_Params` flags bit 9 set and no instance yet (D:L117950):
1. It makes a copy or an instance of the root's node (D:L117959-117967; flags bit 10 picks which) and names it
   `<name>:zanim_instance` (the ELF's string at 0x3ed4a0, D:L117968-117974).
2. It makes the copy the root reference's node (D:L117975-117980).
3. It clears every reference it did not create (D:L117981-117994) and resolves them all again (D:L117995).

So after an instance exists, the 0xf9 parent and the root name the same node. With no instance, the root's own node is
used. A parent-0xf9 reference therefore resolves as a parent-0 reference of search mode 1 does, beneath the root only.
When the root does not resolve, both stay null: the parent-0 one's world lookup with search 1 finds nothing (§1.5).
Its own search mode is never read (§1.2), so a parent-0xf9 reference of search 0 still gets no world lookup.

### 1.4 When it runs: the set's start, at the map's load

- **The resolve pass.** `FUN_0026f210` (D:L118051-118116) does three things:
  1. With `Anim_Params` flags bit 12 set and no root, it creates an empty root `<name>::created_root` (the ELF's
     string at 0x3ed460, D:L118066-118098).
  2. It resolves the root with create set (D:L118100-118102), then every reference whose slot is empty, in index order
     (D:L118103-118113). Each reference resolves its parent first (§1.2), so reference 2 meets an already-resolved root.
  3. It calls `CZAnim::CreateInstanceNode` (D:L118114).
- **Who calls it.** `FUN_00271650` (D:L119421-119457) clears the slots it does not own (D:L119430-119442) and calls the
  pass (D:L119443). `FUN_002713f0`, the animation's start (D:L119314-119335), calls `FUN_00271650` first (D:L119321).
  It then saves the references' init state through `FUN_0026f120` (D:L118011-118046), but only while the set's
  byte 0 is 0 (D:L119323-119324). `FUN_0026c600` sets that byte after the set's first start (D:L116379), and the
  reset's stop clears byte +1 only (`FUN_0026c2e0`, D:L116179), so the save is taken once, at the first start. A
  reference whose slot is still null is not saved (D:L118037). (*F4, added at the review*; the condition was not stated.)
- **The set's start.** `FUN_0026c600` (D:L116314-116386) calls `FUN_002713f0` for every animation of the set whose
  flags bit 11 is clear, whether or not the animation starts itself (D:L116368-116371). An animation with bit 11 set
  goes to `FUN_00271250` or `FUN_00271390` instead (D:L116359-116366), which this read did not open.
- **When the set starts.** The round's start `FUN_002a7d40` starts `common` and then `mission` (D:L149735-149742; the
  ELF's strings at 0x3f12f8 and 0x3f1300) as the map's load ends. It has two callers: the offline path, and
  `FUN_00223680` (D:L75935), beside the online round's states. Which round `FUN_00223680` serves was not opened. Online,
  the round's restart `FUN_002232a0` does the same for every later round (D:L75850-75866; research 237 §0,
  `AUTOSTART_RESET_READING`). (*F4; was:* "The round's start `FUN_002a7d40` [...] as the map's load ends", and §0
  called it "offline".)
- So `otc_posechar`'s reference 2 is resolved once its set has started, at the end of the level load and before the
  first frame of play. Under the instance branch, it is resolved again whenever the animation makes its instance.

### 1.5 The world lookup by search mode (`FUN_00269230`, D:L114368-114413)

This is the lookup a parent-0 reference falls back to (§1.2). By search mode:
- **Search 0 or 3** searches the scene at `DAT_0045c380`, then its list at +0x6ba0 (count at +0x6b9c), by name and by
  find-by-name (D:L114379-114401). That pointer is the one the unload hands to the world light list (`FUN_0031fb50`,
  D:L117034), so it is read here as the world. That is an inference from the use, not a traced type.
- **Search 0 or 2** then tries `FUN_0031fd10` by name (D:L114402-114404): the same lookup an instanced root uses
  (§1.2). It was not opened here.
- **Search 4** searches beneath the node `FUN_0027f7d0` returns (D:L114405-114408). Not opened.
- **Search 0** last tries `FUN_00311ef0` on `DAT_0045c298` (D:L114409-114411). Not opened.
- **Search 1** matches no branch, so it finds nothing: a search-1 reference is beneath the root or null.

This settles the order `NODE_REF_SCOPE_READING` and `SCENE_INSTANCE_SCOPE_READING` read for search 0 and 1: beneath the
root first, then the world for search 0, then nothing for search 1. Two parts stay unread: the find-by-name's depth (the
argument 1 to the node's +0x24 method) and the three lookups not opened above.

### 1.6 Beside the brief: the record's other bits, as the code uses them

- **The second word.** The load zeroes it (§1.1), so the disc's value is never used. Research 77 §9 counts it non-zero
  on 264 of the 11,418 multiplayer references.
- **The init bits.** The unload (`FUN_0026d560`, D:L117025-117054) and the uninit (`FUN_0026f830`, D:L118250-118324) read the record's
  bits 22, 23 and 25:
  - it deletes the node of a reference with bit 23 set (`created_here`);
  - it takes a node off the world light list when bits 22 and 25 are set (`is_light`, `on_world_lightlist`).

  The resolver sets bit 23 on the nodes it creates (D:L117979, D:L118097). This agrees with reCOM's declaration order
  for those bits, the reading `nodeRefInit` makes for bits 26-31 (`packages/scene/src/zanim.ts:70-79`).
- **`FUN_0026f430`** (D:L118121-118142) is another command-operand accessor. It special-cases 0 and 0xfa but not 0xf9,
  and nothing passes it a parent.

## 2. `otc_posechar`, from the committed sources

### 2.1 What the committed sources hold of it: nothing

- **The fixtures.** `test-fixtures/MANIFEST.json` lists, among the `RUN/` files, three multiplayer ZDBs (`MP2`, `MP6`,
  `MP72`) and the common archives (`MPZANIM.ZAR`, `UIZANIM.ZAR` and others); none is a campaign `M*.ZDB`. A byte search
  of the three ZDBs and `MPZANIM.ZAR` for `posechar` or `otc_` finds nothing. The same search finds `beer_parts` in
  `MP6.ZDB`, so the key names are plain in those files.
- **The goldens.** No golden names it:
  - `character-zanim.json` holds MP2's three archives;
  - `zanimInventory.json` holds `UIZANIM.ZAR`, `EXTZANIM.ZAR` and `MPZANIM.ZAR`;
  - `effectsFrostfire.json` and `doors.json` hold MP2 and MP6.
- **The tree.** In the tracked tree, `git grep posechar` finds only research 318 (§3, §3.2) and the plan's PAR-92 row.
  Both carry B0's dev-disc line (`mission/otc_posechar`: node reference 2's parent 249 of 27, on all 12 campaign
  `MZANIM.ZAR`s).

So its commands, its `Anim_Params` (flags: whether it starts with its set, bit 9's instance, bit 11) and its 26 other
references are unread here. So is who starts it: a `CALL_ANIMATION` naming it, an `actions.rdr` record, or a mission
script. The name alone is no evidence. All of these are §4.2's survey items, settled once the reader takes the archive.

### 2.2 The value against the format's sentinels

| parent byte | the original (`FUN_0026f4e0`) | the port today |
|---|---|---|
| 0 | none: looked up beneath the root, then by search mode (§1.2). Reference 0 itself is the empty one | read; placement ignores it |
| 1 .. count - 1 | an index: looked up beneath that reference's node only | read; placement ignores it (§3, D6) |
| count .. 248, 251 .. 254 | the table grows with blank references, and the last resolves by the animation's name 0, beneath the root, then in the world (§1.2); never observed on the disc | throws for the whole archive |
| 255 | the growth loop never ends: the one-byte count wraps (§1.2); never observed on the disc. *F1; was:* one row "count .. 248, 251 .. 255: the table grows with blank references" | throws for the whole archive |
| **249 (0xf9)** | **the animation's instance, else its root (§1.3)** | throws for the whole archive (`otc_posechar`) |
| 250 (0xfa) | the caller's node | throws for the whole archive; never observed as a parent |

0xf9 and 0xfa are the command operands' sentinels: research 89 (0xf9 the instance, 0xfa the caller), research 149
§2.2, and `NODE_ROOT` and `NODE_CALLER` in `packages/scene/src/effects.ts:165`. The resolver is one function, so a
parent byte means what a command's node byte means. reCOM declares the field as a plain 8-bit `parent_index`
(zanim.h:419) and names no sentinel.

The engine names them itself (*added at the review*). `FUN_0026dea0` turns a node path into a reference index. Its path
token `INPUT_NODE` (the ELF's string at 0x3ed480) gives 0xfa, and `ROOT_NODE` (0x3ed490) gives 0xf9 (D:L117392-117418,
D:L117456-117463). For any other token it finds or appends a reference whose parent is the previous token's index
(D:L117447, D:L117480). The review read the builder as appending references with parent 0xf9. Its machine code does
not: every 0xf9 and 0xfa site branches straight to the epilogue with that value (0x26df48, 0x26e184, then 0x26e2b0).
So a `ROOT_NODE` token ends the path and returns 0xf9, and never becomes a later token's parent. Its four callers pass
parent 0 (D:L117494, D:L156273, D:L489035, D:L492794). So the builder confirms that 0xf9 and 0xfa share one index
space with the references, but not that the engine writes 0xf9 into a parent byte. The disc's parent 0xf9 is the
archive's own.

### 2.3 The multiplayer archives

- No multiplayer reference has a parent at or above its animation's count. `parseAnimSets` checks exactly that
  (`zanim.ts:282`), and research 77 §9 reads all 66 archives of the 22 maps through it (11,418 references). Research
  318's B0 survey read them again on 2026-10-14.
- So the multiplayer archives carry no 0xf9 or 0xfa parent, unless some animation there has more than 249 references.
  None is recorded, and B1's survey prints the largest count. *PAR-92 B4:* the largest is 27; no 0xf9, 0xfa or
  out-of-table parent on any of the 66 (§4.2 U4).
- Whether they carry in-range non-zero parents is not recorded either (77 §9 records the field, not its spread; the
  goldens record no parent). That count is a survey item (§4.2). *PAR-92 B4:* 22, on MP10, MP11 and MP62 (§4.2 U4).

## 3. The port, against the read

| # | where | the port | the original | what is lost |
|---|---|---|---|---|
| D1 | `packages/scene/src/zanim.ts:279-284` | throws when `parent >= refCount`, so the whole archive is refused | no check; 0xf9 is the instance-or-root sentinel (§1.2-§1.3) | everything below, on all 12 campaign maps |
| D2 | `packages/viewer/src/mapMeta.ts:186-193`, `:212`, `:256`, `:259` | the throw is caught, `archive` is undefined, and `initial` is `[]`, `autostart` absent and `scene` absent | the mission set loaded and started | **the page** (`loadMap.ts:1150-1170`): MAP-02's opening states, so only the name rule hides; **the room** (`simMap.ts:135-138`, `worldState.ts:207-209`, `:241`, `:254`, `:279`): no destructibles (C4 has no targets), no debris paths, nothing saved for the reset, no autostart replayed |
| D3 | `packages/viewer/src/doors.ts:77-81`, `:92`; read by the room (`simMap.ts:117`), the page (`loadMap.ts:1328`) and the forge's server (`packages/match/src/forgeSimMap.ts:234`, carrying a campaign base's `meta` and `doors` at `:247-255`, `:306-310`) | the same throw is caught and `programs` is empty, so every DOOR record is dropped with "not in MZANIM.ZAR" | the doors' programs | every campaign door, where the mission's `actions.rdr` carries DOOR records (unread here), in the room, on the page and on a forge map built on a campaign base. *F2; was:* the doors' readers were not named |
| D4 | `packages/viewer/src/effectData.ts:95-115` | `MZANIM.ZAR`'s parse throws, so its programs and its autostart list are absent on the page; `CZANIM.ZAR`'s are kept | both sets | the mission set's effects on the page |
| D5 | `packages/viewer/src/soundData.ts:403-407`, the catch at `:442` | both archives are parsed in one `map`, so `MZANIM.ZAR`'s throw ends the whole zAnim block | both sets | the zAnim callbacks and their volumes, the ambience beds and layers, the emitters and the objectives' round cues: **the common set's too**, on every campaign map |
| D6 | `mapMeta.ts:227-229`, `:239-240`; `sceneHealth.ts:153-175` (`placeRefs`) | a reference is placed by its search mode and the root's placement, and `parent` is never read | a non-zero parent is looked up beneath the parent's node only, with no world fallback (§1.2); 0xf9 beneath the instance or root (§1.3) | once D1 is fixed: a parent-0xf9 reference of search 0 would be placed at the world's first placement when the root holds none, where the original leaves it null |
| D7 | `zanim.ts:5-7`, `:57`, `:64` | "their bodies are not in the tree"; the parent is "an index into the same list (below its length on all 11,418)"; the second word "not decoded" | the bodies are at D:L113462, D:L115894 and D:L116925; the 11,418 are the multiplayer's, and 0xf9/0xfa are sentinels; the second word is `node_ptr`, zeroed at the load | the doc lines only |

The loss is wider than research 318 §3.2 and the plan's row state. Beside `initial`, `autostart` and `scene`, the
campaign maps lose their doors' programs (D3), the page's mission effects (D4) and the common set's zAnim sounds (D5).

## 4. The build list and the unknowns

### 4.1 The build list (RED first)

| # | change | where | test (RED first) |
|---|---|---|---|
| B1 | **The reader takes the sentinels.** Read the parent byte raw and type it as a reference index, `root` (0xf9) or `caller` (0xfa). Index 0 is none. Any other out-of-table byte no longer refuses the archive: it is recorded on the reference as unresolvable, with a diagnostic (`ZANIM_PARENT_OUT_OF_TABLE_PLACEHOLDER`, untraced; *F1, was* `ZANIM_PARENT_OUT_OF_TABLE_READING`). Fix D7's three doc lines | `packages/scene/src/zanim.ts` (+ `index.ts` if the type is exported) | unit, red today: a built archive whose reference 2 has parent 0xf9 of 27 parses, and its parent reads `root`; 0xfa reads `caller`; 30 of 27 parses with the reference unresolvable and the rest of the archive intact. The 66 multiplayer archives are unchanged: `character-zanim.json` and the existing `zanim.test.ts` stay green |
| B2 | **The placement reads the parent.** A non-zero parent is placed beneath its parent's placement only, with no world fallback; `root` beneath the root's placement (one per placement under `SCENE_INSTANCE_SCOPE_READING`); `caller` beneath the caller's node where one exists. Parent 0 is unchanged (`ZANIM_PARENT_SCOPE_READING`) | `packages/viewer/src/mapMeta.ts` (`pathsOf`, `openingPaths`), `sceneHealth.ts` (`placeRefs`, whose callers must pass the parents), and the page's run lookup `effects.ts` (`nodeOf`/`nodeMatrix`) | unit: a hand-built meta where a parent-0xf9 search-0 reference is not placed when the root holds no such child (the world placement is ignored), and a parent-k reference is placed under reference k's path. Whether the fixtures' maps stay unchanged depends on U4's count. If the multiplayer maps hold no in-range non-zero parent, `doors.json`, `effectsFrostfire.json` and the MAP-02 tests stay green. If they hold some, B2 moves those placements rightly, and each moved golden line is re-taken with its reference named. *F3; was:* "The fixtures' maps must stay unchanged, so [...] stay green" |
| B3 | **The sound reader parses each archive on its own**, so one refused archive costs only its own set. This is the port's own error handling (the original refuses none) and changes no value | `packages/viewer/src/soundData.ts:403-407` | unit: a mission archive that throws still leaves the common set's callbacks and beds |
| B4 | **The dev-disc RED.** For each of the 12 campaign maps: `parseAnimSets(MZANIM.ZAR)` does not throw; `readMapMeta` has no `meta: MZANIM.ZAR` diagnostic, has `scene` defined, and has `initial` non-empty wherever the archive holds an init bit; `doors` has no "not in MZANIM.ZAR" line. It prints §4.2's survey | new `packages/viewer/test/campaignZanimDisc.test.ts`, off `SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc` (as `stripsSurveyDisc.test.ts` does); without them it skips, and says so | red today on all 12 (the throw); green after B1. The destructibles' presence is per map, from the survey: a map whose archive holds no kind-3 damage block expects none |
| B5 | **Room, page and forge together.** Room and page read the one `readMapMeta` (`simMap.ts:135`, `loadMap.ts:1150`) and the one `readDoors` (`simMap.ts:117`, `loadMap.ts:1328`), so B1-B2 reach both. The forge's server builds on `simMapFromBytes` (`forgeSimMap.ts:234`) and carries a campaign base's `meta` and `doors` (`:306-310`). On the campaign maps the room's world state gains destructibles, debris and saved state it lacked; `MapInstance` ids are unchanged (`flattenScene`, PF.R15), but a campaign join's world-state snapshot changes shape, so the room and the page ship in one merge | `simMap.ts`, `worldState.ts`, `loadMap.ts`, `packages/match/src/forgeSimMap.ts` (no change expected beyond B1-B2) | B4's test asserts, for each campaign map, that the room's `simMapFromBytes(...)` and the page's composition agree on `initial`, `scene` and the doors (each DOOR record's node and programs). A forge map on a campaign base carries the same doors. *F2; was:* "agree on `initial` and `scene`", with neither the doors nor the forge named |
| B6 | **Follow-ups in the documents.** In research 101 §4, the `NODE_REF_SCOPE_READING` row's "owed: read (`CZAnim::Load` 0x26d370's resolver)" points here (§1.2, §1.5). Research 209 §7 and 318 §3.2 re-run their campaign rows (318's 69 *unread*) once B1 lands | `docs/research/101-…`, `209-…`, `318-…` | the ledger tests (`roundLedger.test.ts`, `placeholderLedger.test.ts`) with the rows edited |

*PAR-92's build against the list (2026-10-14):*
- **B1** as written (`nodeRefParent`; `ZAnimNodeRef.parent` typed `ZAnimNodeParent`, the byte kept in `word`; an
  out-of-table byte sets `ZAnimNodeRef.unresolved`, which `readMapMeta` repeats as a `meta:` line).
- **B2** in `mapMeta.ts` (`pathsOf`, `openingPaths`, the missing line naming the parent) and `sceneHealth.ts`
  (`placeRefs` takes the parents; `SceneProgram.parents`, present where any is not 0; `destructiblesOf` passes them).
  `caller` is placed nowhere: a placement has no caller. *(PAR-92's review, F1: at run time `executeAction` and
  `CALL_ANIMATION` do have a caller (D:L118164-118169: 0xfa is the caller's node through the context's +0x18,
  `FUN_00272390`), but `placeRefs` takes no caller, so a 0xfa parent resolves to null there too -- owed when `placeRefs`
  next changes; the survey finds no 0xfa parent on any of the 34 maps, so no retail data moves.)* **At run time** (the
  brief widened by the gameplay controller, 2026-10-14): `worldState.ts`'s three calls of `placeRefs` -- `runDisplay`
  (no scope), `executeAction` (the action's node), `CALL_ANIMATION` (the caller's root) -- pass `SceneProgram.parents`;
  the room and the page share the file. On the disc that moves MP11 and MP62 only (§4.2 U4's reach): MP62's
  `gate_openclose2`, run from either wood-gate switch, names `lever_3`'s `gatehand` for its reference 6 (its
  `relatedopen` turns it) where it named `lever_2`'s, and `action_reset`'s handles lie beneath their own levers where
  all were `lever_1`'s; held by `zanimParentRunDisc.test.ts` on the room (`simMapFromBytes` + `WorldState`) and the page
  (`loadMap` + `buildPageWorld`), which name the same nodes. The world runs no motion command, so what moves is the node
  a run's reference names, not yet a turn. *Was:* "**Not built, outside the brief's files:** `worldState.ts`'s three
  run-time calls of `placeRefs` (`:445`, `:493`, `:541`) do not pass `SceneProgram.parents` yet, so at run time a parent
  is still read as 0 there." **Owed, not built: the page's effects.** `effects.ts` `nodeOf`/`nodeMatrix` and
  `effectData.ts` are unchanged: their programs (`EffectProgram`, built in `packages/scene/src/effects.ts`) carry no
  parents. Their only world lookup (`sceneNodes`) serves the ambient programs (with their set, drawing), and no
  reference with a parent belongs to one on the 34 maps (U3, U4), so nothing the page's effects draw moves today. It is
  owed the day an effect program -- an ambient one, or one the page runs by name -- gains a reference with a non-zero
  parent: `EffectProgram` then carries the parents, and `nodeMatrix` looks such a reference up beneath its parent's
  node, never in `sceneNodes`.
- **B3** as written. **B4** as written, with one narrowing: a `DOOR` record whose *kick* animation is in no archive of
  the map keeps its line (M63's 16 `kick_Door`, M82's 32 `kick_Door_left`/`_right`; research 92 §6: the kick is not run);
  the assertion is on the swing, which drops the record. **B5** asserted by B4's test on all twelve; `simMap.ts`,
  `loadMap.ts` and `forgeSimMap.ts` unchanged; `worldState.ts` changed at its three `placeRefs` calls only (B2 above;
  *was:* "`worldState.ts` ... unchanged").

### 4.2 Unknowns the survey settles

B4's test prints these; none needs a constant until the survey shows one. *PAR-92 B4's numbers (2026-10-14), from its
run at 76f831e29 over the dev host's disc tree, are under each item; the open text above them is kept.*

- **U1. `otc_posechar` itself:** its `Anim_Params` (activation in the low bits, flags bits 9, 10, 11 and 12), its
  references (each one's name, search mode and parent), and its sequences and commands. Settled by the survey's dump
  of it on the 12 maps, and by whether it is byte-identical across them.
  - *Survey:* in `mission` on all twelve. Its key's raw bytes come in 9 variants, and read through its name tables it
    is one (the variants differ in set name-table indices, the `OBJECT_MOTION_SI_SCRIPT` command's u16 at +4 among
    them). `Anim_Params`: root reference 1 `player` (parent 0, search 0), state 1, flags 0xa2 -- activation 2 in the low
    three bits, so not started with its set; bits 9, 10, 11 and 12 clear (no instance, no created root; bit 11 clear,
    so a start goes through `FUN_002713f0` and U5 is not needed). 27 references: 0 `NA`, 1 `player`, 2-26 the
    skeleton's 25 nodes (`skel_root` .. `rtoe`), each parent 0xf9 and search 1, no init bit, second word 0. No
    `Anim_Health`. One sequence (`NA`, activation 1): `OBJECT_ACTIVE_STATE` on node 0xf9 (on), then
    `OBJECT_MOTION_SI_SCRIPT` (command 26, not decoded) driving them. So 0xf9 here names the `player` node the
    animation is run on, and each skeleton node is looked up beneath it (§1.3). The same shape on `otc_restraintpose` (26
    references parented 0xf9), `otc_headlook` and `otc_random_headlook` (`head`, 0xf9): 53 parents 0xf9 a map, 636 on
    the twelve. No placed node is named `player` on any campaign map, so `readMapMeta` places none of them, before or
    after B2.
- **U2. Who starts it:** every `CALL_ANIMATION` naming it in either set, every `actions.rdr` record naming it, and
  whether its flags start it with the set. Settled by the same survey.
  - *Survey:* one command on the disc names it: M51's `m51obj1` (flags 0x22, not with its set) runs `CALL_ANIMATION
    otc_posechar` in its activation-1 sequence. No `CALL_ANIMATION`, `STOP_ANIMATION`, `PAUSE_ANIMATION` or
    `EXECUTE_ACTION` of any zAnim archive names it on the other eleven maps, and no `actions.rdr` record names it on
    any. Its own flags do not start it with the set. Whether code or a mission script starts it by name elsewhere is
    not read here.
- **U3. The rest of the campaign archives.** The reader stops at the first refusal, so every animation after
  `otc_posechar` in each archive is unread. The survey counts parents by value (0, in range, 0xf9, 0xfa, other) per map.
  - *Survey:* every zAnim archive of each map reads (`LDZANIM.ZAR`, the mission's `MZANIM.ZAR`, `CZANIM.ZAR`), none
    refused. Parents, every archive of the map (0 / in range / 0xf9 / 0xfa / other; the largest reference count), and
    what `readMapMeta`, `readDoors` and the scene now hold (initial, of it off; autostart; kind-3 blocks;
    destructibles, unplaced; `DOOR` records with their programs):

    | map | parents | largest | initial (off) | autostart | kind-3 | destructibles (unplaced) | doors |
    |---|---|---|---|---|---|---|---|
    | M51 | 500 / 1 / 53 / 0 / 0 | 28 | 5 (0) | 0 | 0 | 0 (0) | 5 |
    | M52 | 504 / 1 / 53 / 0 / 0 | 28 | 5 (1) | 0 | 1 | 1 (0) | 0 |
    | M53 | 624 / 9 / 53 / 0 / 0 | 30 | 134 (14) | 0 | 15 | 41 (0) | 17 |
    | M61 | 542 / 2 / 53 / 0 / 0 | 28 | 39 (3) | 1 | 3 | 65 (0) | 20 |
    | M62 | 1014 / 3 / 53 / 0 / 0 | 29 | 157 (15) | 20 | 22 | 22 (0) | 0 |
    | M63 | 656 / 1 / 53 / 0 / 0 | 28 | 84 (24) | 0 | 21 | 44 (0) | 16 |
    | M71 | 624 / 1 / 53 / 0 / 0 | 28 | 9 (1) | 0 | 10 | 8 (2) | 0 |
    | M72 | 618 / 1 / 53 / 0 / 0 | 28 | 58 (25) | 0 | 4 | 4 (0) | 0 |
    | M73 | 580 / 5 / 53 / 0 / 0 | 28 | 65 (9) | 0 | 2 | 2 (0) | 6 |
    | M81 | 625 / 1 / 53 / 0 / 0 | 28 | 72 (21) | 11 | 13 | 41 (2) | 14 |
    | M82 | 613 / 1 / 53 / 0 / 0 | 37 | 84 (30) | 1 | 6 | 80 (0) | 32 |
    | M83 | 760 / 1 / 53 / 0 / 0 | 58 | 125 (25) | 0 | 15 | 15 (0) | 44 |

    All twelve: 7,660 / 27 / 636 / 0 / 0. The 0xf9 are U1's four `otc_` animations. The 27 in range: `cam_orbit`'s
    `camrig_null1` beneath `camrig` (search 1) on all twelve; M53's and M73's `action_reset` double doors
    (`doubledoorNN` beneath `drN`, search 0, with init bits; 8 on M53, 4 on M73); M61's `m61obj6` `rifle` beneath
    `leader` (search 0); M62's `destroy_badhelo` `gun` and `turret` beneath `badhelo` (search 1). No 0xfa and no parent
    past its table anywhere, so `ZANIM_PARENT_OUT_OF_TABLE_PLACEHOLDER` is a guard that never runs on retail data. The
    room, the page and a forge map on each base agree on `initial`, `scene` and the doors (B5). Against the same
    archive read with every parent 0, B2 moves nothing on the twelve: every map's `initial`, autostart and
    destructibles are the same, and no run-time placement moves.
- **U4. In-range non-zero parents on the multiplayer archives (§2.3).** These decide whether B2 changes any
  multiplayer placement. Settled by the survey's count over the 22 maps.
  - *Survey:* **22**, over the 66 archives (11,418 references, none refused; 0 on 11,396; no 0xf9, 0xfa or other;
    the largest count 27): MP10's `mp10copter` 4 (its rotors, search 3, beneath `chopper1`); MP11 10 (`action_reset`'s
    `gate_move1`, `gate_move2` and two `gatehand`, search 0 with init bits, beneath `access1`, `access2`, `lever_1`,
    `lever_2`; `gate_openclose1` and `gate_openclose2` one each; `mp11copter` 4); MP62 8 (`action_reset` 5, with
    `lever_3`'s `gatehand`; `gate_openclose1` 1; `gate_openclose2` 2). None on the fixtures' MP2, MP6 and MP72, so no
    multiplayer golden moves (`doors.json`, `effectsFrostfire.json` and the MAP-02 tests stay as they are).
  - *B2's reach,* against the same archive read with every parent 0: MP11's `initial` goes from 25 to 26 and MP62's from
    65 to 67 -- `worldmodel/lever_2/gateswitch=gateswitch/gatehand` (and MP62's `lever_3/...`) is now saved (its
    transform) where the port saved `lever_1`'s alone, all three references having taken the world's first `gatehand`;
    autostart and destructibles unchanged. MP10 moves nothing (its rotors lie beneath `chopper1` either way). At run
    time (`placeRefs` per program, at no scope and at each placement of its root): MP11's `action_reset` moves one
    placement, MP62's `action_reset` two and `gate_openclose2` two (its `gatehand` beneath `lever_3`, not `lever_2`'s);
    the room and the page reach them since `worldState.ts` passes the parents (§4.1, B2; *was:* "those reach the room
    only once `worldState.ts` passes the parents").
- **U5. Animations with flags bit 11:** whether `FUN_00271250` and `FUN_00271390` resolve references at the set's start
  as `FUN_002713f0` does (§1.4). Settled by opening those two functions, and needed only if U1 finds bit 11 on
  `otc_posechar`. *Survey:* bit 11 is clear on it (and on the other three `otc_` animations), so not needed for it.
- **U6. The find-by-name's depth** (argument 1 to the node's +0x24 method; §1.5), shared with
  `SCENE_INSTANCE_SCOPE_READING`. Settled by opening that method.

## 5. Readings and placeholders (candidates for the build)

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `ZANIM_PARENT_SENTINEL_READING` | a node reference's parent byte: 0 none; 0xf9 the animation's instance, else its root reference's node; 0xfa the caller's node; else an index into the animation's references | `FUN_0026f4e0` D:L118159-118179 and its zero-extended argument (0x26f600, 0x26f518-0x26f544), §1.2-§1.3 | a reviewer's re-read; one memory read of `otc_posechar`'s reference-2 slot on a campaign map after the round's start (its node's parent is the animation's instance or root) | in code: `packages/scene/src/zanim.ts` (PAR-92 B1, 2026-10-14); reading, pending review. *Was:* *note only*: a candidate, B1 |
| `ZANIM_PARENT_OUT_OF_TABLE_PLACEHOLDER` (was `ZANIM_PARENT_OUT_OF_TABLE_READING`) | untraced: a parent byte at or past the count that is not 0xf9 or 0xfa leaves its reference unresolved, and the archive is kept | the original, which the port does not follow there (§1.2): for count .. 254 the table grows with blank references and the blank resolves by the animation's name 0, a lookup not traced; for 255 the growth loop never ends | U3's survey: if no reference on the disc has such a parent, the placeholder stays a guard that never runs; if one has, trace the name-0 lookup on that map. *PAR-92 B4:* none on the 34 maps (§4.2 U3, U4): a guard that never runs on retail data | in code: `packages/scene/src/zanim.ts` (PAR-92 B1, 2026-10-14); placeholder. *Was:* *note only*: a candidate, B1. *F1; was:* `ZANIM_PARENT_OUT_OF_TABLE_READING`, "resolves to nothing", read from the growth alone |
| `ZANIM_PARENT_SCOPE_READING` | a reference with a non-zero parent is placed beneath its parent's placement only, never in the world; `root` beneath the root's placement | `FUN_0026f4e0` D:L118221-118228 (no world fallback, the search mode unread) and §1.3 | U6, for the depth; U4, for whether any multiplayer placement moves (*PAR-92 B4:* MP11's and MP62's `gatehand` saves move onto their own levers, §4.2 U4) | in code: `packages/viewer/src/mapMeta.ts`, read by `sceneHealth.ts` `placeRefs` (PAR-92 B2, 2026-10-14); reading, pending review; read by `worldState.ts`'s run-time calls too; the page's effects owed (§4.1). *Was:* *note only*: a candidate, B2 |
