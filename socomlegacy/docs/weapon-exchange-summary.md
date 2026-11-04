# Weapon Exchange: manager review summary

This branch fixes menu input escaping into gameplay and verifies the complete existing Weapon Exchange:
primary, sidearm and three equipment slots. The pregame Armory and living player's inventory remain separate.
Confirmed selections remain pending until the next spawn in classic rounds; living players cannot replace their
loadout during an active round. Closing or resetting the menu consumes held controls until release, preventing
accidental firing, throwing or immediate reopening.

## Achieved

- Inspected the entire locally supplied ISO, including outside RUN, and decoded selected original executable
  functions. Recorded asset/archive paths, five-slot structure, navigation, ammunition and availability evidence.
- Audited all 22 multiplayer maps: team/map restrictions, dependent launcher ammunition, quantities, duplicate
  equipment and 2X ammunition. Preserved both-team M14 selection and explicit invalid-selection rejection.
- Verified the full five-slot flow through menu confirmation, real server acceptance, next-round equipment and
  peer synchronization. Checked models/HUD icons, ammunition, equipment counts and selected firing/reload cues.
- Delivered a separate asset-free Windows/Mac test ZIP with freshly compiled current client/server code.
  Windows double-click launch detects and validates RUN, then opens the local browser. Mac join prompts for the
  host IP. Both enable the test-report overlay; no npm/build step is required after extraction. Missing Node.js
  is reported clearly. The v5 package supplied launcher behavior only; no older gameplay code was copied.
- The user reports the easy-launch package works. This feedback does not establish unreported controller or
  Mac hardware coverage. Older Desktop v5 ZIP was recycled only after verification; reports and notes were kept.

## Validation

| Evidence kind | Result |
|---|---|
| Focused unit/dev-disc | 244 passed; affected 66 server/disc cases subsequently expanded and rerun, all passed |
| Original executable instruction checks | 4 passed; fresh reviewer independently checked the readings |
| Two-client rendered browser | 1 passed, both teams, complete kits, real ISO/server, simulated controllers |
| Documents / conventions / placeholder ledger | 129 passed |
| Workspace typecheck / current-source package build | Passed |
| Portable launcher helper | 1 passed; independently repeated by reviewer |
| Extracted-folder integration | Windows CMD and Windows Git Bash join, path with spaces, automatic detection, missing Node, invalid folder, ISO/Armory/report overlay; zero page errors |
| Delivery | ZIP CRC and extracted bytes verified; 700 corresponding source files verified; Mac command mode 0755 |
| Package leak scan | 744 files, zero findings; scanner self-test 32/32, reviewed artifact-specific exceptions |
| Fresh reviews | PASS, medium confidence; scopes and unperformed reruns recorded in the plan |

The 66-case rerun is part of the 244, not 66 additional distinct tests. The complete two-client run used source;
the compiled package received a separate browser/launcher smoke test. The latest full repository gate remains
**RED**, with the historical leak finding and Windows guard/data-fixture failures detailed in the plan. Focused
results are not a green full gate or permission to merge.

## Remaining limitations

Physical Mac/Finder and physical-controller checks remain unverified. Survivor access between rounds, original
remote timing and pixel/audio parity still need original-running evidence. The screenshot's white headings
conflict with the inspected native tint; narrow-window clipping remains. C4 has target-specific planting but
partial original verification; thermal visual parity is incomplete. Unsupported records are identified rather
than silently offered as another item. The original menu reads directional press edges without held auto-repeat.

## Review and reproduction

Base: `1b0beb2c36f41cc1692e596cfddcaf1666fe95ca`. Branch: `chris/original-weapon-exchange`.
The user authorized pushing this branch for the manager's review, explicitly **without merging**.
No game assets, screenshots, original executable, manual PDF or private reports belong in the push.

- [Evidence and disc/archive paths](research/300-original-weapon-exchange.md)
- [Complete category/support matrix and map restrictions](weapon-exchange-categories.md)
- [Launch instructions and physical-controller checklist](weapon-exchange-playtest.md)
- [Dated tests, failures, review scopes and gate records](plans/2026-10-05-original-weapon-exchange.md)
- Portable package builder: the playtest package tooling is held on `agent/chris-wx-launcher` pending fixes (the LAN host's exposure, the builder's dev build and
  its source sweep; distribution is the owner's call).
