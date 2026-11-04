import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLIDERS } from '../src/ui';
import { playOptionsOf } from '../src/originalOptions';

/**
 * PARITY-1's recorded exemptions (PAR.R5: visible, never silent; the plan's "What the sprint needs from the owner", the
 * owner rows numbered at the pull request), held at the page boundary. PAR-14, PAR-15 and PAR-16 are
 * `build_keyboard.test.ts`'s ("PARITY-1's exemptions"). Read off the sources: `/testroom` (`src/main.ts`) is the
 * development viewer's shell and the front end's match (`src/matchMount.ts`) the release's, and neither has a runtime
 * seam that names what it mounts beyond these lines. Under OT.R43 (the online-path plan's rulings: the two matches are
 * equivalent but `/testroom`'s explicit test-only instruments) a capability that differs is either an exempt instrument
 * (the tactical map, PAR-15; the replay viewer -- sprint 35's development instrument, and since MU-11 also the host of
 * the modern replay viewer's world, `/testroom?replayview` framed by the release build's viewer) or a game feature still owed to the
 * front end (the seat ARMORY, PAR-2; touch, PAR-5), never a third kind, and the owed ones are never exempt.
 */
const here = dirname(fileURLToPath(import.meta.url));
const src = (f: string): string => readFileSync(resolve(here, '../src', f), 'utf-8');

/**
 * The files `f` reaches by its static VALUE imports (`import type` and `export type` are erased by the build, so a type
 * shared with the viewer's shell is no mount of it): `matchMount.test.ts`'s walk, types left out.
 */
function valueGraph(f: string): Set<string> {
  const seen = new Set<string>();
  const walk = (g: string): void => {
    if (seen.has(g)) return;
    let text: string;
    try { text = src(g); } catch { return; }                         // a directory index or a non-ts asset
    seen.add(g);
    for (const m of text.matchAll(/^(?:import|export)(?! type)[^;]*? from '\.\/([^']+)';/gm)) {
      const next = `${m[1]!}.ts`;
      if (/^[\w/]+\.ts$/.test(next)) walk(next);
    }
  };
  walk(f);
  return seen;
}

/**
 * PAR-17 (audit A's exemptions; the plan's PAR-17 row): the viewer's chrome -- the disc and map picker, the share URL, the
 * look panel's sliders and the debug status line -- is `/testroom`'s shell, a development viewer's tools with no original:
 * the menu-launched match (the release's) mounts none of it. The match settings the menus own are not chrome: OPTIONS
 * (research 302 s4, `./originalOptions` -- the pitch, the bob, the fire-mode swap the original's StoreOptions keeps) reach
 * the front end's match from the session, and the shell's sliders are none of them.
 */
describe("PAR-17: the viewer's chrome is /testroom's shell, never the front end's match; the menus' OPTIONS are not chrome", () => {
  /** Each tool of the chrome, as `main.ts` mounts it (audit A main:1066-1077, 1342-1449, 1623-1631, 1927-1948, re-located). */
  const CHROME: readonly (readonly [string, RegExp])[] = [
    ['the page panel', /\bnew Ui\(\)/],
    ['the disc picker', /\bui\.onDisc\(/],
    ['the disc choice', /\bnew DiscChoice\(/],
    ['the map picker', /\bui\.onMapChange\(/],
    ["the picker's list", /\bui\.setMaps\(/],
    ["the picker's order", /\bsortByPopularity\(/],
    ["the picker's allowlist", /\ballowedMultiplayerMaps\(/],
    ['the share URL read', /\breadShare\(/],
    ['the share URL written', /\bupdateAddress\(/],
    ['the sliders', /\bui\.onSlider\(/],
    ['the debug status', /\bui\.setStatus\(/],
    ['the frame counter', /\bui\.setFps\(/],
    ['the Experimental panel', /\bmountExperimentalGraphics\(/],   // ACT.R7's graphics experiment, one of OT.R43's instruments
  ];

  it("/testroom mounts every tool of the chrome (the boundary's control: the patterns name live code)", () => {
    const main = src('main.ts');
    for (const [what, re] of CHROME) expect(main, what).toMatch(re);
  });

  it("the front end's match mounts none of them, and nothing it imports for its values reaches the shell's modules", () => {
    const mount = src('matchMount.ts');
    for (const [what, re] of CHROME) expect(mount, what).not.toMatch(re);
    expect(mount).not.toMatch(/^import [^;]*from '@s2u\/ui';/m);    // the disc choice's package, not even a value of it
    const reached = valueGraph('matchMount.ts');
    expect(reached.size).toBeGreaterThan(100);                       // the walk follows the mount's parts
    expect(reached.has('matchFirearm.ts')).toBe(true);
    const shell = valueGraph('main.ts');                              // the control: the same walk from the shell finds them
    for (const f of ['ui.ts', 'shareUrl.ts', 'multiplayerMaps.ts', 'discIndex.ts', 'features.ts', 'flyAccess.ts']) expect(shell.has(f), f).toBe(true);
    // The shell's modules: the panel, the share URL, the picker's allowlist, the disc index, the play switch, the fly gate.
    for (const f of ['ui.ts', 'shareUrl.ts', 'multiplayerMaps.ts', 'discIndex.ts', 'features.ts', 'flyAccess.ts', 'main.ts']) {
      expect(reached.has(f), f).toBe(false);
    }
    // The Experimental panel: no module the front end's match reaches for its values mounts it.
    for (const f of reached) if (f !== 'experimentalGraphics.ts') expect(src(f), f).not.toMatch(/\bmountExperimentalGraphics\(/);
    // `./mapOrder` is reached for `rankOf` alone -- the HUD's game-mode caption off the map's name (matchMount.ts's
    // `hud.setGame`) -- never for the picker's popularity order. FG-51: a forge layout may name its own mode
    // (`o.gameMode`); unset, the caption is still `rankOf`.
    expect(mount).toMatch(/hud\.setGame\(m\.name, o\.gameMode \?\? rankOf\(m\.name\)\?\.mode \?\? ''\);/);
    // The front end mounts a disc map. It never passes a forge layout's `gameMode` (FG-51's caption stays in the forge).
    expect(src('frontEnd.ts')).not.toMatch(/\bgameMode\b/);
  });

  it("the menus' OPTIONS are the match's settings, not chrome: the front end hands the session's to the mount, which reads them each frame; the shell's sliders are none of them", () => {
    // The front end: the globals StoreOptions left, read off the session, handed to the mount (`MatchMountOptions.options`).
    const front = src('frontEnd.ts');
    expect(front).toMatch(/const options = \(\) => playOptionsOf\(session_\?\.options, session_\?\.uiVars \?\? null\);/);   // OT.R72: the stick tuners too
    expect(front).toMatch(/l\.mount\([^\n]*\boptions\b[^\n]*\)/);
    // The mount: the pitch, the bob and the fire-rate swap applied to the pad, and PAR-22's fire-mode setting off the same --
    // through the part both pages mount (PAR-36 (a), `./matchOptions`; `/testroom`'s wiring is `matchOptions.test.ts`'s).
    const mount = src('matchMount.ts');
    expect(mount).toMatch(/\n\s+options\?: \(\) => PlayOptions;/);
    expect(mount).toMatch(/const playOptions = matchOptions\(o\.options\);/);
    expect(mount).toMatch(/playOptions\.apply\(fly, pad\);/);
    expect(mount).toMatch(/fireModeSetting: playOptions\.fireModeSetting,/);
    expect(src('matchOptions.ts')).toMatch(/const current = \(\): PlayOptions => source\?\.\(\) \?\? playOptionsOf\(null\);/);
    // The shell's sliders (the light and the fog) are not an option the original stores.
    const optionKeys = Object.keys(playOptionsOf(null));
    expect(optionKeys.sort()).toEqual(['fireModeSwap', 'headBob', 'invertPitch', 'stick', 'vibration']);   // OT.R72: CONTROLLER OPTIONS' look stick
    for (const s of SLIDERS) expect(optionKeys, s).not.toContain(s);
  });
});

/**
 * PAR-18 (audit A's exemptions; the plan's PAR-18 row): `/testroom`'s offline match -- the match server's own room in the
 * page (`./net/loopback` `LoopbackMatch`, the owner's 2026-09-29) -- is a transport, recorded as an exemption, while the
 * gameplay is the one shared core. Both pages mount the same match parts, build `NetPage`'s deps with the one builder
 * (`./matchNet` `matchNetDeps`) and differ in the socket under it: `/testroom` a URL's or the loopback room's, the front
 * end the lobby's adopted client. The loopback's own behaviour (welcomed as a match is, the commands run in the room,
 * its rounds) is `loopback.test.ts`'s; the front end's adoption is `matchMount.test.ts`'s.
 */
describe('PAR-18: the offline loopback is a transport exemption over the one shared gameplay core', () => {
  /** The shared parts both pages mount, each once (ONE-WIRE, research 222; PARITY-1 wave 4). */
  const CORE = [
    'mountFirearm', 'mountThrowables', 'mountActions', 'mountSound', 'mountEffects', 'mountExchange', 'mountTaunts',
    'mountChat', 'mountCharShadow', 'playerLanes', 'watchViewport', 'handRoundScreenBitmaps', 'matchNetDeps',
  ] as const;

  it('both pages mount the same match parts, each once', () => {
    for (const f of ['main.ts', 'matchMount.ts']) {
      const text = src(f);
      for (const part of CORE) expect(text.match(new RegExp(`\\b${part}\\(`, 'g'))?.length ?? 0, `${f}: ${part}`).toBe(1);
    }
  });

  it("only the transport differs: /testroom hands the one deps to a URL's socket, a recorded replay's client or the loopback room's, the front end to the lobby's client; the loopback and the replay are /testroom's alone", () => {
    const main = src('main.ts'), mount = src('matchMount.ts');
    // One deps builder a page, its NetPage(s) over it.
    expect(main.match(/const deps = matchNetDeps\(\{/g)).toHaveLength(1);
    expect(mount.match(/const deps = matchNetDeps\(\{/g)).toHaveLength(1);
    expect(main.match(/new NetPage\(\{\s*\.\.\.deps,/g)).toHaveLength(4);                 // the URL's, the replay's, the loopback's and the replay viewer's world
    // MU-11 (MU.R9): the modern replay viewer's world -- /testroom framed by the viewer, the recording's client its host's
    // (`./modern/replays/worldHost`): the replay's watcher path again, another client of the same deps.
    expect(main).toMatch(/new NetPage\(\{ \.\.\.deps, \.\.\.replayWorldDeps\(REPLAY_WORLD, \{ throwable: \(k\) => throws\.throwable\(k\), hull: replayHull \}\),/);   // RV-7c-2: the page's throwables and hull to the frame's client
    // Sprint 35's replay viewer (PT-18, W35.R5): a recorded segment through the watcher path on a development build
    // (`?devmode&replay=`, REPLAY_ADAPTATION) -- another client of the same deps, never the front end's.
    expect(main).toMatch(/new NetPage\(\{ \.\.\.deps, client: replayClient\(SEARCH, undefined, \{ throwable: \(k\) => throws\.throwable\(k\), hull: replayHull, held: \(\) => loadingJoin\.blocked \}\),/);   // LATER 32: the thrower's records to the fold; RV-7c-2: the hull; RV2-03: the page's loading hold
    expect(mount).not.toMatch(/replayClient/);
    expect(main).toMatch(/new NetPage\(\{ \.\.\.deps, socket: solo\.socket, solo: true, joined: \(\) => \{\}, armory: false \}, 'loopback:'/);
    expect(main).toMatch(/const soloMap = simMapOfLoaded\(map\);[\s\S]{0,400}?solo = new LoopbackMatch\(soloMap, simClipsOfPlay\(playClips\), \{/);   // EPH campaign stand: round 1's slots set on it first
    expect(mount.match(/new NetPage\(\{\s*\.\.\.deps,/g)).toHaveLength(1);                // the lobby's adopted client (`game.adopt`)
    expect(mount).toMatch(/adopt: \{ client: o\.client, events: adopted \},/);
    // The loopback is the shell's: the front end constructs none and imports nothing of it by name. (Its graph reaches
    // `./net/loopback` for `SOLO_IS_NETWORK_READING` alone, through `./deathCamera`: a reading, no transport.)
    expect(mount).not.toMatch(/\bLoopbackMatch\b|from '\.\/net\/loopback'/);
    expect(src('deathCamera.ts')).toMatch(/^import \{ SOLO_IS_NETWORK_READING \} from '\.\/net\/loopback';$/m);
  });

  it("no capability names the transport: under OT.R43 the switches differ only by /testroom's exempt instruments -- the tactical map (PAR-15), the replay (sprint 35's development instrument, and the modern replay viewer's world since MU-11) -- and the game features still owed to the front end -- none since PAR-5 (touch) and PAR-2 (the seat ARMORY) mounted", async () => {
    const { FRONT_END_CAPABILITIES, TESTROOM_CAPABILITIES } = await import('../src/matchCore');
    type Capability = keyof typeof TESTROOM_CAPABILITIES;
    const keys = Object.keys(TESTROOM_CAPABILITIES) as Capability[];
    /** OT.R43's named test-only instruments among the switches: /testroom's alone, never the front end's. */
    const EXEMPT: readonly Capability[] = ['replay', 'tacMap'];
    /** Game features owed to the front end, not exempt (OT.R43: the matches are equivalent); each row lands its own. */
    const OWED: readonly (readonly [Capability, string])[] = [];   // PAR-2's armory: on both since PAR-2; PAR-5's touch layer: since PAR-5
    for (const k of EXEMPT) {
      expect([TESTROOM_CAPABILITIES[k], FRONT_END_CAPABILITIES[k]], `${k}: an exempt test-only instrument, /testroom's alone`).toEqual([true, false]);
    }
    for (const [k, row] of OWED) {
      expect(FRONT_END_CAPABILITIES[k], `${k} is on the front end: it was owed (${row}), never exempt -- drop it from OWED here`).toBe(false);
      expect(TESTROOM_CAPABILITIES[k], `${k}: owed to the front end, /testroom's today`).toBe(true);
    }
    const named = new Set<Capability>([...EXEMPT, ...OWED.map(([k]) => k)]);
    const differ = keys.filter((k) => TESTROOM_CAPABILITIES[k] !== FRONT_END_CAPABILITIES[k]);
    expect(differ.filter((k) => !named.has(k)), 'a difference neither exempt nor owed (OT.R43: the two matches are equivalent)').toEqual([]);
    for (const k of keys) expect(k, k).not.toMatch(/loopback|offline|solo|transport|socket/i);
    // The loopback's own pins stay (the shapes this exemption leans on).
    expect(readFileSync(resolve(here, 'loopback.test.ts'), 'utf-8')).toMatch(/it\('joins through the same client as a match: welcomed as the host\\'s SEAL, stood at a slot, the round on'/);
  });
});
