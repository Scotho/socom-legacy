/**
 * @s2u/ui -- the front end's dialog runtime (web sprint 6, ruling W6.R2; PLAT-02).
 *
 * Will hold what reCOM splits into `zUI`, `zAnim` and `zInput`: the generic dialog (.rdr screen) loader (PLAT-05), the
 * zAnim UI script runner (PLAT-07), the host command table (PLAT-08), the valve store and UI variables (PLAT-09), the
 * screen and state manager (PLAT-10), menu input as abstract buttons (PLAT-11), the front-end frame clock (PLAT-12),
 * and the text, compositor, widget, popup and software-keyboard logic (PLAT-13..17) as data the viewer draws.
 *
 * The boundary: pure, DOM-free, testable under Node as `IsoAssetSource` is. It may import `@s2u/archive`,
 * `@s2u/gs`, `@s2u/mesh`, `@s2u/scene` and `@s2u/sound`; never `@s2u/viewer`, never `three`, never a browser global.
 * A browser API (a pad, a key, a canvas) enters through an interface this package declares and the viewer fills.
 * Enforced by `tools/test/packageBoundaries.test.ts`. The spec:
 * `docs/specs/2026-10-01-web-sprint-6-package-boundaries.md`.
 *
 * Today's ARMORY code stays where it is -- `packages/viewer/src/uiScript.ts` and `armory*.ts` -- until PLAT-34 folds
 * the ARMORY into the generic runtime; where the `ui*.ts` readers in `packages/scene/src` end up is PLAT-05's and
 * PLAT-34's to say.
 *
 * The interim loading screen's readers (`./loading`, INT-LOADING) are the deep import `@s2u/ui/loading`, not part of
 * this index: they are its only value import of `@s2u/scene`, which every `@s2u/ui` import would otherwise load
 * (review F3; `test/headless.test.ts`).
 */
export * from './valves';
export * from './uiVars';
export * from './stickTuners';
export * from './rdrLookup';
export * from './dialog';
export * from './loadPhases';
export * from './zanimRuntime';
export * from './uiCommands';
export * from './movie';
export * from './clock';
export * from './text/index';
export * from './compositor/index';
export * from './screens/index';
export * from './routes/index';
export * from './widgets/index';
export * from './popup/index';
export * from './sounds/index';
export * from './input/index';
export * from './keyboard/index';
export * from './boot/loaderScreens';
export * from './boot/bootBindings';
export * from './boot/screenButtons';
export * from './boot/opener';
export * from './screens/netLoginCommands';
export * from './desktopScreen/index';
export * from './screens/cardCommands';
export * from './screens/dnasCommands';
export * from './screens/universeCommands';
export * from './screens/usagePolicyCommands';
export * from './screens/clanInvitations';
export * from './screens/personaCommands';
export * from './screens/worldOfSocomCommands';
export * from './screens/optionsCommands';
export * from './screens/optionsSchema';
export * from './screens/onlineOptionsCommands';
export * from './screens/onlineFiltersCommands';
export * from './screens/ignoreListCommands';
export * from './screens/ladderLobbyCommands';
export * from './screens/friendListCommands';
export * from './screens/createClanCommands';
export * from './screens/invitedPlayersCommands';
export * from './screens/respondToInvitesCommands';
export * from './screens/clanMessagesCommands';
export * from './screens/manageRosterCommands';
export * from './screens/manageRosterLeaderCommands';
export * from './screens/autoplayCommands';
export * from './screens/briefingRoomCommands';
export * from './screens/briefingRoomChat';
export * from './screens/gameLobbyCommands';
export * from './screens/lobbyBots';
export * from './screens/lobbyRecovery';
export * from './screens/inviteJoin';
export * from './screens/createGameCommands';
export * from './screens/armoryProfileCommands';
export * from './screens/lobbyClient';
export * from './screens/logoffCommands';
export * from './screens/connectCommands';
