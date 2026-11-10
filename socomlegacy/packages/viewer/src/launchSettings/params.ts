/**
 * The page's address parameters, one table (web sprint 37 PTT-9, W37.R6; research 243 §9). LAUNCH_SETTINGS_ADAPTATION:
 * a browser adaptation with no original -- the parameters are the browser page's own switches, and this table only
 * names them; nothing here reads or changes a game value or behaviour.
 *
 * One row per key that a module under `packages/viewer/src` reads from the page's address, with what it means in plain
 * words, what the page does without it (`absent`), its kind, and the files that read it. Three readers of the table:
 * - the launch settings sheet (`./sheet`), which builds its fields from it (a development build's only);
 * - the playtest CLI (`packages/playtest/src/launchUrl.ts` `RESERVED_KEYS`), whose refusal list is the rows marked
 *   `cli: 'session'`;
 * - the agreement test (`test/launchSettingsTable.test.ts`), a source scan of `packages/viewer/src` that holds every
 *   key read there to a row, every row to a read, each row's `readIn` to the files that read it, and the playtest's
 *   vocabulary (`packages/playtest/src/urlState.ts` `URL_KEYS`, `FLAG_KEYS`) to the rows marked `cli`.
 *
 * The readers themselves are not changed: each keeps its own literal (or its `*_PARAM` constant), and the scan is what
 * keeps them and the table in step.
 *
 * Nothing is imported, by design: the Node CLI (`packages/playtest`) imports this file by a relative path, as it does
 * `../addressOnline` and `../net/protocol`, and the page's modules would bring the DOM, `three` and Vite's environment
 * with them.
 */

/** The label every surface of the launch settings carries (`data-adaptation`; research 243 §9, PTT-9). */
export const LAUNCH_SETTINGS_ADAPTATION = 'LAUNCH_SETTINGS_ADAPTATION' as const;

/** A parameter's kind: read by its presence (`has`), one of named values, a number, or free text. */
export type ParamKind = 'flag' | 'enum' | 'number' | 'string';

/** The sheet's groups, in the order it shows them; `pages` is the keys of the pages that are not the test room. */
export type ParamGroup = 'where' | 'net' | 'playtest' | 'instruments' | 'pages';

/**
 * The page a key is read on: the test room (`<base>/testroom`), the front end, the project pages, the console launcher.
 * Since CX-9a (CX.R8, the owner, 2026-10-12) the console launcher is the base path's page (`<base>/console` its alias)
 * and hands its whole query to the front end it mounts, `devmode` included (`../console/adapters/launch.ts`
 * `isoSearch`; the fix round's B2 ruling); on a development build with `devmode` and the served tree it boots the front
 * end over that tree at once, as the old page (now `<base>/setup`) does (`../console/launcherEntry.ts`). So a
 * `front end` key reaches the front end from both pages. CX-9b removed the old page's layout (its launcher frame,
 * `../modern/launcher.ts`, and the setup page, `../startup.ts`'s `Startup`) and kept it as the plain game page; none of
 * the removed modules read a key of the address, so no row went with them (the agreement test's scan holds that).
 * FORGE (OT.R52): `forge` is `<base>/forge`, the forge's page.
 */
export type ParamPage = 'testroom' | 'front end' | 'project site' | 'console' | 'forge';

export interface LaunchParam {
  readonly key: string;
  readonly group: ParamGroup;
  readonly kind: ParamKind;
  /** An enum's values, as the page takes them. */
  readonly values?: readonly string[];
  /** What it does, in plain words. */
  readonly meaning: string;
  /** What the page does when the key is absent. */
  readonly absent: string;
  /** The files under `packages/viewer/src` that read it (posix paths; held by the source scan). */
  readonly readIn: readonly string[];
  readonly pages: readonly ParamPage[];
  /**
   * The playtest CLI's part: `session`, a key the session sets itself (an `--opt` naming it is refused,
   * `launchUrl.ts` `RESERVED_KEYS`); `option`, a key an `--opt k=v` may set (`urlState.ts` `URL_KEYS`).
   */
  readonly cli?: 'session' | 'option';
  /** Honoured only with `devmode`, or with the dev switch that names it (`flyok` for fly, `devtools` for the tools). */
  readonly needsDevmode?: true;
  /** Shown as a field on the launch settings sheet (the test room's keys, `launch` itself aside). */
  readonly sheet: boolean;
}

/** The sheet's group titles, in its order. */
export const PARAM_GROUPS: readonly { readonly id: ParamGroup; readonly title: string }[] = [
  { id: 'where', title: 'Where and how' },
  { id: 'net', title: 'Network' },
  { id: 'playtest', title: 'Playtest and replay' },
  { id: 'instruments', title: 'Instruments' },
  { id: 'pages', title: 'Other pages' },
];

/** The table. Its order is the order the sheet writes an address in. */
export const LAUNCH_PARAMS: readonly LaunchParam[] = [
  // ---- where
  {
    key: 'devmode', group: 'where', kind: 'flag', sheet: true, cli: 'session', pages: ['testroom', 'front end'],
    meaning: 'All three dev switches at once: served maps, the fly toggle in Play, and the developer\'s tools. The same as served, flyok and devtools together; the sheet writes this when all three are on.',
    absent: 'each dev switch is off unless its own flag is set',
    readIn: ['source.ts'],
  },
  {
    key: 'served', group: 'where', kind: 'flag', sheet: true, pages: ['testroom', 'front end'],
    meaning: 'The served, extracted tree (socomlegacy/public/maps) instead of the visitor\'s disc image. A development build only (devmode works in every build).',
    absent: 'the page reads only the visitor\'s own disc image',
    readIn: ['source.ts'],
  },
  {
    key: 'flyok', group: 'where', kind: 'flag', sheet: true, pages: ['testroom'],
    meaning: 'The fly toggle is allowed in Play: the Fly / Walk switch, G, the pad\'s Start, and a fly in the address. A development build only.',
    absent: 'Play has no fly toggle (a bare fly is dropped)',
    readIn: ['source.ts'],
  },
  {
    key: 'devtools', group: 'where', kind: 'flag', sheet: true, pages: ['testroom', 'front end'],
    meaning: 'The developer\'s tools: the taunt editor, kit, noarmory, the teleport, the playtest instruments and the replay; and server= for the account requests. A development build only.',
    absent: 'those tools stay off',
    readIn: ['source.ts'],
  },
  {
    key: 'modmodels', group: 'where', kind: 'flag', sheet: false, pages: ['testroom'],
    meaning: 'The test room\'s private model pack: a folder or zip of GLB files named by models.json replaces the drawn mesh of those props and weapons. The test room only; collision and the match are unchanged.',
    absent: 'every model draws its own mesh',
    readIn: ['modelPack.ts'],
  },
  {
    key: 'renderer', group: 'where', kind: 'enum', values: ['auto', 'webgl2', 'xbox', 'webgpu'], sheet: false, pages: ['testroom', 'front end', 'console', 'forge'],
    meaning: 'The graphics mode for this load only, over Settings > Display > Graphics mode (#627; a browser adaptation): auto is Automatic (WebGPU first, WebGL2 when no hardware adapter answers in time or after a WebGPU error; WEBGPU-DEFAULT, LATER 708), webgl2 is WebGL2 (for a black screen), xbox is the Xbox preset (WebGL2 with edge smoothing off), webgpu asks for WebGPU (WebGL2 when no adapter answers in time). The saved choice is not changed, not even by a WebGPU error; Graphics mode shows the row locked while it is in the address.',
    absent: 'the saved Graphics mode, Automatic when none is saved',
    readIn: ['graphicsBackend.ts'],
  },
  {
    key: 'glowscale', group: 'where', kind: 'enum', values: ['half', 'full', 'auto'], sheet: false, pages: ['testroom', 'front end', 'console', 'forge'],
    meaning: 'The flashbang glow target scale for this load only, over the saved glow setting (GLOW-STEPDOWN, GLOW_TARGET_SCALE_ADAPTATION; a browser adaptation): half or full forces that scale on any page, auto is the policy (half on a software adapter or slow frames)',
    absent: 'the saved glow setting, Automatic when none is saved',
    readIn: ['glowScale.ts'],
  },
  {
    key: 'lobbyprepare', group: 'where', kind: 'enum', values: ['0', '1'], sheet: false, pages: ['front end', 'console'],
    meaning: 'The match prepared in the game lobby before the launch (IP3, LOBBY_PREPARE_ADAPTATION; a browser adaptation): 0 turns it off, 1 turns it on past the device-memory threshold. Never under the Xbox preset. For before/after timing runs, and for a player to turn it off.',
    absent: 'on, except under the Xbox preset or on a device that reports under 4 GB of memory',
    readIn: ['lobbyPrepare.ts'],
  },
  {
    key: 'map', group: 'where', kind: 'string', sheet: true, cli: 'session', pages: ['testroom'],
    meaning: 'The map, by its archive stem (MP2, MP71), case aside.',
    absent: 'the map remembered from the last visit, else the first',
    readIn: ['main.ts', 'playtestSession.ts', 'replay/mount.ts', 'shareUrl.ts'],
  },
  {
    key: 'mode', group: 'where', kind: 'enum', values: ['explore', 'play'], sheet: true, cli: 'session', pages: ['testroom'],
    meaning: 'Explore (the free camera) or Play (on foot, the offline match).',
    absent: 'the remembered choice, else explore',
    readIn: ['playtestSession.ts', 'shareUrl.ts'],
  },
  {
    key: 'view', group: 'where', kind: 'enum', values: ['modern', 'ps2'], sheet: true, cli: 'option', pages: ['testroom'],
    meaning: 'The picture: modern, or the PS2\'s 640x448 frame.',
    absent: 'the remembered choice',
    readIn: ['shareUrl.ts'],
  },
  {
    key: 'fly', group: 'where', kind: 'flag', sheet: true, cli: 'option', needsDevmode: true, pages: ['testroom'],
    meaning: 'Play opens in the fly camera, and the offline match is off.',
    absent: 'Play opens on foot (a bare fly without devmode or flyok is dropped)',
    readIn: ['flyAccess.ts'],
  },
  {
    key: 'nomatch', group: 'where', kind: 'flag', sheet: true, cli: 'option', pages: ['testroom'],
    meaning: 'Play without the offline match: the free walk.',
    absent: 'Play runs the offline match',
    readIn: ['flyAccess.ts'],
  },
  {
    key: 'noarmory', group: 'where', kind: 'flag', sheet: true, cli: 'option', needsDevmode: true, pages: ['testroom'],
    meaning: 'The pre-round ARMORY stays shut.',
    absent: 'the ARMORY opens where the room opens it',
    readIn: ['main.ts'],
  },
  {
    key: 'kit', group: 'where', kind: 'string', sheet: true, cli: 'option', needsDevmode: true, pages: ['testroom'],
    meaning: 'The spawn kit: up to five item ids 0-255, comma-separated, in slot order (62,15,121,126,255).',
    absent: 'the side\'s own kit',
    readIn: ['loadout.ts'],
  },
  {
    key: 'rules', group: 'where', kind: 'enum', values: ['classic', 'respawn'], sheet: true, pages: ['testroom'],
    meaning: 'The match\'s rules (OT.R71: respawn offered again): classic or respawn, ahead of the test room\'s remembered Rules choice; kept as it was when the page writes its address.',
    absent: 'the remembered Rules choice, else classic (the original\'s default)',
    readIn: ['rules.ts'],
  },
  // ---- net
  {
    key: 'online', group: 'net', kind: 'enum', values: ['off', 'shared', 'local'], sheet: true, cli: 'session', pages: ['testroom'],
    meaning: 'The Online setting: off, shared (the shared server) or local (this machine\'s). server= and mp beat it.',
    absent: 'the remembered choice (local only on a local page), else off',
    readIn: ['addressOnline.ts', 'shareUrl.ts'],
  },
  {
    key: 'server', group: 'net', kind: 'string', sheet: true, cli: 'session', pages: ['testroom', 'front end'],
    meaning: 'The match server to join, as its WebSocket URL (ws://127.0.0.1:8787/ws); its origin is also where the universe requests go, and the account requests under devtools (or devmode, which includes it) on a development build.',
    absent: 'with mp, this page\'s host at /ws; else no server from the address',
    readIn: ['addressOnline.ts', 'netPage.ts', 'universeHost.ts'],
  },
  {
    key: 'mp', group: 'net', kind: 'flag', sheet: true, cli: 'option', pages: ['testroom'],
    meaning: 'Join a match server from the address: this page\'s host at /ws, unless server= names another.',
    absent: 'no server from the address (the Online setting decides)',
    readIn: ['addressOnline.ts', 'netPage.ts'],
  },
  {
    key: 'lag', group: 'net', kind: 'number', sheet: true, cli: 'option', pages: ['testroom'],
    meaning: 'Simulated latency on the match socket, in milliseconds (jitter a fifth of it).',
    absent: '0',
    readIn: ['netPage.ts', 'online.ts'],
  },
  {
    key: 'loss', group: 'net', kind: 'number', sheet: true, cli: 'option', pages: ['testroom'],
    meaning: 'Simulated packet loss on the match socket, in percent.',
    absent: '0',
    readIn: ['netPage.ts', 'online.ts'],
  },
  // ---- playtest
  {
    key: 'playtest', group: 'playtest', kind: 'string', sheet: true, cli: 'session', needsDevmode: true, pages: ['testroom'],
    meaning: 'The playtest session\'s socket (ws://127.0.0.1:5303/session): the playtest instruments, the marks and the recording.',
    absent: 'no playtest session',
    readIn: ['playtestReport.ts', 'playtestSession.ts'],
  },
  {
    key: 'retest-at', group: 'playtest', kind: 'string', sheet: true, cli: 'session', needsDevmode: true, pages: ['testroom'],
    meaning: 'A focused retest\'s placement, x,y,z or x,y,z,yaw: the player is placed there once after the spawn, offline only.',
    absent: 'the spawn',
    readIn: ['playtestSession.ts'],
  },
  {
    key: 'replay', group: 'playtest', kind: 'string', sheet: true, needsDevmode: true, pages: ['testroom'],
    meaning: 'A recorded match segment (.s2r URL) to play back: the replay mode.',
    absent: 'no replay',
    readIn: ['main.ts', 'replay/embed.ts', 'replay/mount.ts'],
  },
  {
    key: 'replayview', group: 'playtest', kind: 'flag', sheet: true, pages: ['testroom'],
    meaning: 'The world view of the modern Replays section: the test room loads as the embedded replay stage (MU-11, MU.R15).',
    absent: 'the test room as usual',
    readIn: ['modern/replays/worldHost.ts'],
  },
  {
    key: 'tick', group: 'playtest', kind: 'number', sheet: true, pages: ['testroom'],
    meaning: 'The replay opens sought to this tick (a whole number).',
    absent: 'the replay opens at its start',
    readIn: ['replay/embed.ts'],
  },
  {
    key: 'pause', group: 'playtest', kind: 'flag', sheet: false, needsDevmode: true, pages: ['testroom'],
    meaning: 'The replay stands paused from its open, at exactly the tick= tick (the frame identity gate, CPS.R9 e).',
    absent: 'the replay plays from its open',
    readIn: ['replay/mount.ts'],
  },
  {
    key: 'gputime', group: 'playtest', kind: 'flag', sheet: false, needsDevmode: true, pages: ['testroom', 'front end'],
    meaning: 'The match asks three for its GPU timer (timestamp queries), read by the performance cell as GPU render ms a frame (CPS GPU time). It costs the main thread a read-back a frame, so it is off unless asked.',
    absent: 'no GPU timer: the renderer is built as before',
    readIn: ['gpuStats.ts'],
  },
  {
    key: 'embedder', group: 'playtest', kind: 'string', sheet: true, pages: ['testroom'],
    meaning: 'The report\'s origin (http://127.0.0.1:5303) whose seek messages the embedded replay takes; localhost or 127.0.0.1 only.',
    absent: 'no seek message is taken',
    readIn: ['replay/embed.ts'],
  },
  // ---- instruments
  {
    key: 'disc', group: 'pages', kind: 'flag', sheet: false, pages: ['forge'],
    meaning: 'On a development build, the forge reads the visitor’s own disc, as a release does, instead of the served tree: the launcher’s stored copy, the remembered disc or a chooser (FG.R12). A release always reads the disc and ignores it.',
    absent: 'a development build’s forge reads the served tree (socomlegacy/public/maps)',
    readIn: ['forge/page.ts'],
  },
  {
    key: 'floor', group: 'pages', kind: 'flag', sheet: false, pages: ['forge'],
    meaning: 'The forge opens on a blank floor when the address has no share code and this browser has no autosave. A linked disc otherwise opens its first map (MP2 when that archive is served). A share code or an autosave still wins.',
    absent: 'the forge opens the autosave, a share code, or the first served map',
    readIn: ['forge/page.ts'],
  },
  {
    key: 'lobby', group: 'pages', kind: 'string', sheet: false, pages: ['forge'],
    meaning: 'The forge lobby to join, by its id (FG-26; a browser adaptation, no original): the forge fetches the lobby’s layout from the server, draws it from the visitor’s own disc or served tree, and seats the visitor in its popup. Create lobby puts it in the address so the link can be shared; development and release alike.',
    absent: 'the forge opens its editor on the visitor’s own layout',
    readIn: ['forge/lobbyClient.ts'],
  },
  {
    key: 'at', group: 'instruments', kind: 'string', sheet: true, needsDevmode: true, pages: ['testroom'],
    meaning: 'Where to stand, as x,y,z. With yaw, the developer panel\'s copy link reopens this spot. Both are required.',
    absent: 'the map\'s own stand',
    readIn: ['devSpot.ts'],
  },
  {
    key: 'yaw', group: 'instruments', kind: 'number', sheet: true, needsDevmode: true, pages: ['testroom'],
    meaning: 'The facing, in degrees, for the at spot. The developer panel\'s copy link writes it. Ignored without at.',
    absent: 'the map\'s own facing',
    readIn: ['devSpot.ts'],
  },
  {
    key: 'launch', group: 'instruments', kind: 'string', sheet: false, pages: ['testroom'],
    meaning: 'This sheet, before the test room, on a development build: present (bare) shows it; launch=off goes past it.',
    absent: 'the sheet only when the address has no parameter at all',
    readIn: ['pageEntry.ts'],
  },
  {
    key: 'expMenu', group: 'instruments', kind: 'enum', values: ['nearest', 'bilinear', 'integer', 'sharpen'], sheet: false, needsDevmode: true, pages: ['front end'],
    meaning: 'The owner\'s menu sampling experiment (research 260) on the front end\'s frame.',
    absent: 'the menus\' own sampling',
    readIn: ['experimentalUiSampling.ts'],
  },
  {
    key: 'expMenuSharp', group: 'instruments', kind: 'number', sheet: false, needsDevmode: true, pages: ['front end'],
    meaning: 'The experiment\'s sharpness, 0-1.',
    absent: '0.5',
    readIn: ['experimentalUiSampling.ts'],
  },
  {
    key: 'expMenuSnap', group: 'instruments', kind: 'number', sheet: false, needsDevmode: true, pages: ['front end'],
    meaning: 'The experiment\'s whole-multiple snap, 1-4.',
    absent: '1',
    readIn: ['experimentalUiSampling.ts'],
  },
  {
    key: 'tracerhold', group: 'instruments', kind: 'flag', sheet: false, needsDevmode: true, pages: ['testroom'],
    meaning: 'A dev instrument (#425, research 89 §19): a due tracer is left at its hit instead of retiring there.',
    absent: 'a tracer flies and retires at the hit, as the original\'s pool does',
    readIn: ['source.ts'],
  },
  {
    key: 'hdMenuScale', group: 'instruments', kind: 'number', sheet: false, pages: ['front end'],
    meaning: 'With the HD pack chosen in Mods (or uiPerfHd, GM-02), a lower cap (1-4) on the scale the menus are drawn at; 1 draws the original menus (HD-3).',
    absent: "the HD pack's own scale (4x)",
    readIn: ['hdMenuTextures.ts'],
  },
  {
    key: 'uiGpu', group: 'instruments', kind: 'enum', values: ['off', 'shadow', 'on'], sheet: false, pages: ['front end', 'testroom'],
    meaning: 'The GPU menus switch for this load (GM-10, a browser adaptation; works without devmode, O9): off draws the menus in software as today, shadow draws both and compares, on shows the GPU frame. Over the stored support kill and the per-surface table.',
    absent: 'the per-surface table (UI_GPU_SURFACES_ADAPTATION; every surface on since the flip, GM.R18 -- the software only where the GPU cannot draw), after the stored kill s2u.uiGpu=off',
    readIn: ['uiGpuSwitch.ts'],
  },
  {
    key: 'uiGpuSurface', group: 'instruments', kind: 'string', sheet: false, pages: ['front end', 'testroom'],
    meaning: 'Limits uiGpu to the surfaces named, comma-separated: front, armory, overlay, loading (GM-10). Unknown names are dropped.',
    absent: 'uiGpu applies to every surface',
    readIn: ['uiGpuSwitch.ts'],
  },
  {
    key: 'uiGpuAllowSoftwareAdapter', group: 'instruments', kind: 'enum', values: ['1'], sheet: false, pages: ['front end', 'testroom'],
    meaning: 'Lets the GPU menus run on a software adapter (SwiftShader, llvmpipe, the Microsoft Basic Render Driver), for the test harness (GM-10).',
    absent: 'a software adapter keeps the menus in software',
    readIn: ['uiGpuSwitch.ts'],
  },
  {
    key: 'uiGpuBlend', group: 'instruments', kind: 'enum', values: ['ff', 'exact'], sheet: false, needsDevmode: true, pages: ['front end', 'testroom'],
    meaning: 'The GPU menus\' blend mode for every surface (GM.R6, dev and test only): ff fixed-function, exact the programmable path.',
    absent: 'the blend table (UI_GPU_BLEND_ADAPTATION): exact at scale 1, ff at HD (the loading screen exact at HD too, GM.R5)',
    readIn: ['uiGpuSwitch.ts'],
  },
  {
    key: 'uiGpuGuard', group: 'instruments', kind: 'enum', values: ['on'], sheet: false, pages: ['front end'],
    meaning: 'The GPU menus\' guard under on (GM-14c, a dev and canary instrument; the Vite dev server only): a sampled frame the GPU drew compared with the shown scale\'s software frame, rastered in idle time; the records on window.__uiGpu.guard.',
    absent: 'no guard under on (shadow guards as always); a built page ignores the key',
    readIn: ['uiGpuSwitch.ts'],
  },
  {
    key: 'uiGpuGuardPlant', group: 'instruments', kind: 'string', sheet: false, pages: ['front end'],
    meaning: 'A test\'s plant for the guard under on (GM-14c; with uiGpuGuard=on, the Vite dev server only): the byte of the guard\'s rastered reference at this offset flipped -- or, given exact, the red byte of the first pixel of the frame\'s exact class, so the plant trips -- shown on window.__uiGpu.guard. With an @<scale> suffix (exact@4, <byte>@4) only frames whose plan targets that scale are planted; any other frame\'s record says it was not.',
    absent: 'no plant; a built page ignores the key',
    readIn: ['uiGpuSwitch.ts'],
  },
  {
    key: 'uiPerf', group: 'instruments', kind: 'flag', sheet: false, needsDevmode: true, pages: ['front end'],
    meaning: 'The menus\' frame-time ring for the GPU menus\' browser baseline (GM-02, an instrument; a development build with devmode only): window.__uiGpuPerf.',
    absent: 'no ring; the loop as always',
    readIn: ['uiPerfRequest.ts'],
  },
  {
    key: 'uiPerfHd', group: 'instruments', kind: 'flag', sheet: false, needsDevmode: true, pages: ['front end'],
    meaning: 'The ring, and the menus\' HD path on for the measurement with no pack chosen, at the pack\'s scale capped by hdMenuScale (GM-02; a development build with devmode only).',
    absent: 'the menus\' HD path follows the texture pack chosen in Mods (B206 ML-3)',
    readIn: ['uiPerfRequest.ts'],
  },
  // ---- the pages that are not the test room
  {
    key: 'menuflow', group: 'pages', kind: 'string', sheet: false, pages: ['front end'],
    meaning: 'The front end\'s start dialog, <dialog>.rdr (a bare menuflow means nothing).',
    absent: 'the boot\'s own first dialog',
    readIn: ['frontEnd.ts'],
  },
  {
    key: 'q', group: 'pages', kind: 'string', sheet: false, pages: ['project site'],
    meaning: 'The archive page\'s search words.',
    absent: 'no search',
    readIn: ['projectSite/archivePage.ts'],
  },
  {
    key: 'category', group: 'pages', kind: 'string', sheet: false, pages: ['project site'],
    meaning: 'The archive page\'s category filter.',
    absent: 'All materials',
    readIn: ['projectSite/archivePage.ts'],
  },
  {
    key: 'available', group: 'pages', kind: 'enum', values: ['1'], sheet: false, pages: ['project site'],
    meaning: 'The archive page shows the available items only.',
    absent: 'every item',
    readIn: ['projectSite/archivePage.ts'],
  },
  {
    key: 'sample', group: 'pages', kind: 'flag', sheet: false, pages: ['console'],
    meaning: 'The console launcher runs on its sample adapters: the data of the design prototype, labelled "Prototype states" on the page, for screenshots and development; not a game setting.',
    absent: 'the console launcher reads what the server and the emulator report (its live adapters)',
    readIn: ['console/adapters/index.ts'],
  },
  {
    key: 'discshare', group: 'pages', kind: 'string', sheet: false, pages: ['front end'],
    meaning: "A disc share pairing code, from the QR the receiving device shows: the page opens the sender's dialog with the code filled in (DSH-5, DSH.R9; a browser adaptation).",
    absent: "no pairing code; the sender's dialog opens only from Settings' \"Send game files to another device\", by typing or picking a nearby code",
    readIn: ['discShareView.ts'],
  },
  {
    key: 'discshare-host', group: 'pages', kind: 'string', sheet: false, pages: ['console'],
    meaning: "A host's disc share link token (RB-26, over RB-25's hosted shares): the page asks that host for the game files at once, opening Play's \"Request Game Files (XBOX)\" area with its code for the host to match, and says the host's answer (queued, No, Yes; a browser adaptation).",
    absent: "no host's link; a request from Play's \"Request Game Files (XBOX)\" row makes its own code",
    readIn: ['discShareView.ts'],
  },
];

/** The row of `key`, or undefined. */
export function launchParam(key: string): LaunchParam | undefined {
  return LAUNCH_PARAMS.find((p) => p.key === key);
}

/** The keys the playtest session sets itself (`launchUrl.ts` `RESERVED_KEYS`). */
export function sessionKeys(): string[] {
  return LAUNCH_PARAMS.filter((p) => p.cli === 'session').map((p) => p.key);
}
