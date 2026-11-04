# Settings organisation

LATER 294, card (the private board).

**Decided:** layout A, by Dustin, 2026-10-28 at 19:43 Central Time. B and C stay below as the layouts that were considered. Craig's review of this layout is still open.

The first player-visible slice is in. The Settings list is Game and Launcher (the Theme drop-up is still there; question 7 is open). Game's tabs are Display, Audio, Communication. Launcher's tabs are Controller, Appearance, App, Account, and Mobile when the browser has touch. Controller is the first Launcher tab. Its rows lead with Controller, Stick dead zone, Button mapping and Stance mode, then Overlay button when the overlay supplies it, then the same card rows as before. Nothing else moved: Detail distance is still on Display, the microphone rows are still on Communication, and there is no separate Controls tab. Slice 3 adds three headings and moves no row: This browser above Detail distance on Display and above the microphone rows on Communication, In the game above Controller's card rows. Ids, storage keys and what a row writes are unchanged.

Product track. The rows below are what the launcher draws today, read from `packages/viewer/src/console/adapters/options.ts` (the tab list, `liveOptions`'s `groups`) over `packages/viewer/src/modern/settings/model.ts` `CONTROLS`. A mock of the three layouts is `assets/2026-10-28-settings-organisation/index.html`. Values drawn on the mock are samples so a row has something to show. They are not defaults.

`Owner` is where the row saves. **game** is the memory card (the original OPTIONS valves and tuners). **launcher** is this browser. The overlay draws the same tabs, with its own locks on Sign out and Remove downloaded content.

## Inventory

42 rows the Options tabs can show. 39 are always in the list. Three appear only when their condition holds. The Controller rows are in the order slice 1 draws them. Every other group is unchanged.

| id | label | group | owner | when |
|---|---|---|---|---|
| BRIGHTNESS | Brightness | Display | game | |
| BOBBING_1ST_PERSON | Head bob | Display | game | |
| DISPLAY_MP_TEAM_NAMES | Teammate names | Display | game | |
| HelpWindowsEnabled | Help windows | Display | game | |
| ScreenOriginX | Screen position, across | Display | game | |
| ScreenOriginY | Screen position, down | Display | game | |
| detail-distance | Detail distance | Display | launcher | |
| install-app | Install app | App | launcher | |
| disc-kept | Remove downloaded content | App | launcher | |
| update-restart | New version available | App | launcher | a new build is waiting |
| version | Version | App | launcher | |
| theme-panel | Theme & background | Appearance | launcher | |
| drift | Backdrop motion | Appearance | launcher | |
| clock | Clock | Appearance | launcher | |
| sounds | Launcher sounds | Appearance | launcher | |
| soundVolume | Launcher sound volume | Appearance | launcher | |
| uiscale | Interface size | Appearance | launcher | |
| scan | Scanline overlay | Appearance | launcher | |
| MUSIC_VOLUME | Music volume | Audio | game | |
| SOUND_VOLUME | Sound volume | Audio | game | |
| DIALOG_VOLUME | Dialog volume | Audio | game | |
| HEADSET_CONTROLLER | Headset volume | Audio | game | |
| STEREO_CONTROLLER | Sound mode | Audio | game | |
| pad-device | Controller | Controller | launcher | |
| pad-dead | Stick dead zone | Controller | launcher | |
| remap | Button mapping | Controller | launcher | |
| stance-mode | Stance mode | Controller | launcher | |
| overlay-button | Overlay button | Controller | launcher | the overlay host supplies it |
| VIBRATION_CONTROLLER | Vibration | Controller | game | |
| AutoAim | Aim assist | Controller | game | |
| INVERT_PITCH_CONTROLLER | Pitch | Controller | game | |
| FIREMODESWAP_CONTROLLER | Fire rate | Controller | game | |
| stick_preset | Stick preset | Controller | game | |
| STICK_SENSITIVITY | Look speed | Controller | game | |
| STICK_INERTIA | Acceleration | Controller | game | |
| STICK_DEADZONE | Dead zone | Controller | game | |
| mobile-layout | Touch layout | Mobile | launcher | this browser has touch |
| EnableExternalWhispers | External whispers | Communication | game | |
| mic-on | Use microphone in game | Communication | launcher | |
| mic-device | Microphone | Communication | launcher | |
| remember | Remember me on this browser | Account | launcher | |
| signout | Sign out | Account | launcher | |

Screen position is the model's `console` group. The adapter appends those two steppers to Display. Video mode and Hard disk are in that group too, and `cardSpec` drops every readonly control, so they are not rows.

Theme & background is a pushed page (`panel('theme')`). Its nine picks are the settings. The held `theme` and `backdrop` rows are not drawn.

| id | label | section | owner |
|---|---|---|---|
| theme:0 | Navy & Gold | Theme | launcher |
| theme:1 | Deep Water | Theme | launcher |
| theme:2 | Blackout | Theme | launcher |
| theme:3 | Night Ops | Theme | launcher |
| theme:4 | Jungle | Theme | launcher |
| theme:5 | Desert | Theme | launcher |
| theme:6 | Frost | Theme | launcher |
| backdrop:0 | None | Background picture | launcher |
| backdrop:1 | Crossroads | Background picture | launcher |

Button mapping is a pushed screen. Its sixteen actions are Cross, Circle, Square, Triangle, L1, R1, L2, R2, Select, Start, L3, R3, Up, Down, Left, Right (`PAD_BUTTON_NAMES`). After them: Stick dead zone (the same browser value as `pad-dead`), Crouch, Prone, Stance mode (the same value as `stance-mode`). Crouch and Prone exist only on this screen.

Defined and not offered, so they are not in the tables: `video_mode`, `HDD_ENABLE`, and `NOT_OFFERED` in `model.ts` (subtitle, dialog, order response, stick swap, `NoAutoAim`, `SelectedControllerConfig`, `ChosePresetOnce`, `VoiceMask`). `sampleAdapters.ts` `SAMPLE_OPT_CATS` still lists the old prototype rows (internal resolution, aspect, frame rate, smoothing, master volume, ping, connection test). The live adapter does not.

The picture (modern / PS2 / experimental) is not an Options row. Detail distance reads it and locks on PS2. The same stored factor is also the Forge View row and the test room's. This proposal does not regroup the Forge.

The dev launch sheet (`launchSettings/sheet.ts`, `/testroom` and `/playtest` only) already groups by job: Where and how, Network, Playtest and replay, Instruments, Other pages. Leave it.

## What is wrong

Before slice 1, Controller drew the eight card rows first. Controller, Stick dead zone, Stance mode and Button mapping came after them. Remap was the twelfth row. Slice 1 puts those four first. The two dead zones are still on the same tab.

Two dead zones share that tab. `STICK_DEADZONE` is the card tuner, labelled Dead zone, and it edits only on the Custom stick preset. `pad-dead` is the browser stick, labelled Stick dead zone, 0–40%, per controller. Button mapping repeats the browser one, and repeats Stance mode.

Display, Controller and Communication mix card rows and browser rows. Since slice 3 each has one heading: This browser on Display and Communication, In the game on Controller. Audio is card only. Appearance, App, Account and Mobile are launcher only. Mobile is one row. Account is two, and Remember me is locked (the choice is on the sign-in).

The Settings list and the tabs disagree. The list is System Settings (`opt:display`), App, and Theme (`state.ts` lines 1265–1273). Theme opens a drop-up when the panel exists. Appearance is also a tab on the screen System Settings opens. App is both a list item and a tab.

Sign out is on Account and on Profile.

`docs/specs/launcher-redesign/03_SETTINGS_CATALOG.md` still places Interface size, Scanline overlay and Backdrop motion on App, and Launcher sounds on Audio. The adapter moved them to Appearance, and the catalog has no Appearance tab, no Version, no update row, and no Detail distance.

Touch layout is one editor. Theme & background is already two sections. Nothing to regroup inside either.

## Three layouts

Client and Game as the only two tabs is option C. Dustin chose A. B and C were considered and were not chosen. The rest of A (a Controls tab, microphone under Voice, a This browser heading on Detail distance) is not in the first slice.

**A. Game and Launcher, Controller first on the Launcher side.** Chosen by Dustin, 2026-10-28 at 19:43 Central Time. The Settings list becomes Game and Launcher. The full layout's Game tabs are Display, Audio, Controls, Communication, card rows only, plus Detail distance on Display under a This browser heading. Launcher tabs: Controller, Appearance, App, Account, and Mobile when touch exists. Controller's order in the full layout: Controller, Stick dead zone, Button mapping, Stance mode, Overlay button, then a Voice heading with the two microphone rows. Category ids stay (`display`, `controller`, …) so `/settings/controller/mapping` still resolves. The first slice does the doors, the tab families, and the four Controller rows at the top. It does not add Controls, Voice, or the heading.

**B. Today's eight tabs, reordered, with headings.** Controller leads with the four or five browser rows, then a heading In the game and the eight card rows. Display and Communication get a This browser heading before their launcher rows. The Settings list stays System Settings, App, Theme. No route change.

**C. Two tabs, Client and Game, each one scrolling page.** Client sections, in order: Controller (device, dead zone, mapping, stance, overlay), Voice, Appearance, App, Account, Mobile. Game sections: Display (card rows, then This browser and Detail distance), Audio, Controls, Communication (External whispers only). L1/R1 would move between the two pages, or between sections. That choice is part of building C.

## Recommendation

A is the layout Dustin chose. Controller, the browser dead zone, Button mapping and Stance mode are the first rows of the Launcher's Controller tab, and the shoulder buttons stay inside one family. B would only reorder today's one strip. C would make Game one long page.

Craig has not reviewed the choice. Detail distance staying on Display, and the microphone staying on Communication, are the first slice. Moving either is still question 2 and question 3.

## Questions for Dustin and Craig

1. The Settings list words. Dustin's choice of A uses Game and Launcher. Craig has not confirmed the words.
2. Detail distance: stay on Display under a browser heading, or move to the Launcher side?
3. The microphone rows: on Controller under Voice (as in A), their own Launcher tab, or left beside External whispers?
4. Stick dead zone and Stance mode are on Controller and on Button mapping. Keep both copies, or keep them only on the mapping screen? Crouch and Prone stay on the mapping screen either way.
5. If the two dead zones can sit on one page (layout B), which label changes so Dead zone and Stick dead zone are not neighbours?
6. Sign out on Account and on Profile: keep both?
7. The Theme item on the Settings list: keep the drop-up, or leave themes to the Appearance tab?
8. Mobile is one row, and only with touch. Keep the tab, or put Touch layout on Appearance?

## Slice plan

Each slice is one pull request, product track, and stops when its check is green. No slice invents a row.

1. Done in this change, as the first thing a player can see of A: Game and Launcher on the Settings list, each family's tabs, Controller first on Launcher, and Controller, Stick dead zone, Button mapping, Stance mode at the top of that tab. `test/console/settingsFamilies.test.ts` holds it. The Theme drop-up is still on the list.
2. The rest of the Controller reorder is already in slice 1 (Overlay button, then the card rows). Slice 3 added the In the game heading. `/settings/controller/mapping` still returns to the Button mapping row.
3. Headings, using the row `section` field that Theme & background already uses. Display, Controller and Communication. A heading is not a focus stop (Up/Down and the pointer skip it). Check that on the three tabs.
   Done in 1773ce6f7: This browser above `detail-distance` (Display) and `mic-on` (Communication), In the game above `VIBRATION_CONTROLLER` (Controller, so item 2's heading too); no heading above the rows that lead a tab, including when a tab has no card rows before its browser rows. `test/console/settingsHeadings.test.ts` holds it.
4. Split the strip into the two families of A, once questions 1–3 and 8 have answers. `homeItems('options')` and `test/console/lr32SystemSettings.test.ts` pin System Settings → `opt:display`; that test moves with the list. `/settings/<id>` selects the family that owns the id. The overlay's locks stay on the same row ids.
5. Move the microphone, and Detail distance if question 2 says so. One table in the test: id, family, tab, index.
6. Question 4, on the mapping screen only. Removing a duplicate deletes the row there and leaves the value. Crouch and Prone stay.
7. Bring `03_SETTINGS_CATALOG.md` in line with the adapter in the same slice that moves those rows. Then look at the tab strip at a phone width (the strip already scrolls; A and B shorten it).
