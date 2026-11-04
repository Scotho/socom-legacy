# Supported settings catalog

## The structure that is approved

The crossbar's Settings list contains **System Settings** and **App**. System Settings opens the existing tabbed screen; App opens that screen on App. The actual groups are **Display / App / Audio / Controller / Mobile / Communication / Account**. Mobile appears only when touch is available. Both original and browser settings remain in this complete screen; a larger Client/Game reorganization is still an open investigation.

The source of truth is `console/adapters/options.ts` over `modern/settings/model.ts`, both included. Screenshot fixtures use these live row definitions, not `sampleAdapters.ts`'s old proposal catalog. Current values in a screenshot are illustrative and do not establish defaults or measured game behavior.

## Original game options exposed in the launcher

| Group | Setting | Control and constraints | Persistence |
|---|---|---|---|
| Display | Brightness | Original tuner, 0–100% displayed | Memory card |
| Display | Head bob | Off / On | Memory card |
| Display | Teammate names | Off / On | Memory card |
| Display | Help windows | Off / On | Memory card |
| Display | Screen position, across | Integer 0–250, step 1 | Memory card |
| Display | Screen position, down | Integer 80–250, step 1 | Memory card |
| Audio | Music volume | Original tuner, 0–100% | Memory card |
| Audio | Sound volume | Original tuner, 0–100% | Memory card |
| Audio | Dialog volume | Original tuner, 0–100% | Memory card |
| Audio | Headset volume | Original tuner, 0–100% | Memory card |
| Audio | Sound mode | Mono / Stereo / Dolby | Memory card |
| Controller | Vibration | Off / On; separate from the browser's ability to produce rumble | Memory card |
| Controller | Aim assist | Off / On | Memory card |
| Controller | Pitch | Normal / Inverted | Memory card |
| Controller | Fire rate | L3 / Select | Memory card |
| Controller | Stick preset | Trainee / Soldier / Seal / Custom, as the current model labels them | Memory card |
| Controller | Look speed | Original stick tuner; editable with Custom | Memory card |
| Controller | Acceleration | Original stick tuner; editable with Custom | Memory card |
| Controller | Dead zone | Original stick tuner; editable with Custom | Memory card |
| Communication | External whispers | Off / On | Memory card |

The original tuner track uses 2-percentage-point steps from its held value and clamps to its real range. An off-grid saved value is retained, displayed as a whole percentage and stepped from there; do not snap it merely for a tidy mockup. Custom-only stick rows explain their lock when another preset is selected. A preset change applies its associated original tuner values; the design must not invent new preset numbers.

The card is the same card the original front end reads and writes; the launcher is not a second copy of game preferences. Missing valve defaults are read from the player's disc when available. Required lock states include **Needs disc**, **Reading disc**, **Not saved yet**, **Custom preset** and **Card cannot be read**. A refused card save keeps the prior contents and says why.

The source also inventories original settings not offered by this launcher: Video mode and Hard disk remain in the original's own flow; the unused subtitle/dialog/order-response/stick-swap/prohibition valves are not new toggles. SelectedControllerConfig/ChosePresetOnce are tied to the original controller-preset flow, not a promise of another browser settings page. VoiceMask belongs to the original START menu, not this settings screen.

## Browser and launcher settings

| Group | Setting/action | Supported choices or behavior | Persistence/conditions |
|---|---|---|---|
| App | Install app | Opens browser-specific explanatory dialog; native Install requires a trusted click | Installed surface/browser state |
| App | Remove downloaded content | Local kept disc read set, with size/backend/partial state and confirmation | Locked Nothing stored; locked while in use by game |
| App | Interface size | 100% / 115% / 130% | This browser; applies now |
| App | Scanline overlay | Off / On | This browser; off by default |
| App | Backdrop motion | Off / On | This browser; off by default, always still under reduced motion |
| Audio | Launcher sounds | Off / On | This browser; on by default; does not change game sound |
| Audio | Launcher sound volume | 0–100% in 10% steps | This browser; source default 70% |
| Controller | Controller | Automatic, then connected device names | This browser/device choice |
| Controller | Stick dead zone | 0–40% in 1% steps | Per controller profile in this browser; requires connected controller |
| Controller | Stance mode | Existing Prone-pop and Separate choices | This browser; applies now; behavior defined by existing implementation |
| Controller | Button mapping | Opens full mapper | Per controller in this browser |
| Controller | Overlay button | Home and other supported physical buttons | Conditional: overlay host supplies it; explains hold behavior |
| Mobile | Touch layout | Opens orientation-specific editor | Touch devices only; this browser/device |
| Communication | Use microphone in game | Off / On | This browser; optional voice input |
| Communication | Microphone | System default, then enumerated inputs | This browser; real names require permission |
| Account | Remember me on this browser | Informational locked row: Chosen on the sign-in | Actual choice is on the sign-in dialog, ticked by default where offered |
| Account | Sign out | Opens shared confirmation | Signed-in action; game/round locks apply |

Do not confuse the browser's **Stick dead zone** with the original game's **Dead zone** tuner. Do not confuse the physical button mapper with the original stick preset. Each row's aside explains its purpose, where it saves, its default where known and any immediate/next-start effect.

## Row behavior

- Category tabs and scrollable rows have distinct controller focus zones. Within Settings, L1/R1 wraps category tabs; Up/Down clamps within category focus. Circle from a setting row returns to category focus; another Circle returns to the Settings landing list. This is distinct from the newly clamped main crossbar.
- Previous/next changes a value; bounds clamp. An action row opens its named screen/dialog rather than masquerading as a selector.
- Show current and changed-from-default states. Reset uses a known real default and is unavailable where there is none.
- Locked values stay readable, with a reason. Do not merely fade the whole control until it cannot be read.
- Account and overlay locks are applied to the same row model. Changes usually save immediately; errors remain visible in context.
- Touch and pointer controls remain reachable at 130% interface size and short landscape heights.

## Excluded sample options

The old design sample offers **Internal resolution / Aspect ratio / Frame rate / Picture smoothing / Master volume / Network / Show ping / Connection test**. The live adapter explicitly excludes these. It also has a different editable remember toggle and historical default values. Do not treat those samples as requirements, even if a source file or older screenshot draws them.

## Saved data clarification

Profiles/personas, phrases and game settings use the memory card; account loadouts and replays have their own server-backed paths. App's downloaded-content removal deletes only the local kept disc copy. It preserves accounts, memory cards, profiles and preferences. A general memory-card backup/import/export/delete interface is not implemented by this PR and should be scoped as a separate proposal if desired.
