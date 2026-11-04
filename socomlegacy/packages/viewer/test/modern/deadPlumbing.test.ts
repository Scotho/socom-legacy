// @vitest-environment jsdom
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as stage from '../../src/modern/replays/stage';
import * as replaysView from '../../src/modern/replays/view';
import * as cards from '../../src/modern/home/cards';
import * as agreement from '../../src/modern/agreement/agreement';
import * as logoff from '../../src/modern/logoff';
import * as dialog from '../../src/modern/dialog';
import * as session from '../../src/modern/session';
import * as roller from '../../src/modern/roller';
import * as replaysData from '../../src/modern/replays/data';
import * as layers from '../../src/modern/padLayers';
import { padLayers } from '../../src/modern/padLayers';

/**
 * CX-13 (the console plan): the plumbing CX-9b left with no page to serve is removed, each part named against the reason
 * nothing reads it. A browser adaptation's code, product track: nothing of the game changes.
 * - `launch.ts`'s Launch slot and footer bar: the detail panel's slot was drawn by no section since MU-F3, the setup
 *   page's footer the bar wrote into went with CX-9b; only their own tests mounted them. CX-25 retired the rest of
 *   `launch.ts` (its `createLaunch` had no page either), so the file itself is gone (below).
 * - `replays/stage.ts`'s `engineStage`: the viewer's stage is `worldStage` (MU-11); only its own test opened it.
 * - `e2e/startupDevices.ts`'s `installStartupMic`: no spec installs it since the setup page's microphone test went (CX-9b).
 * - `ui.ts`'s startup-look radios: no page draws an `input[name="startup-look"]` since CX-9b.
 */
const here = dirname(fileURLToPath(import.meta.url));
const VIEWER = resolve(here, '../..');
const src = (p: string): string => readFileSync(resolve(VIEWER, p), 'utf8');
const code = (p: string): string => src(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('CX-13: the dead plumbing after CX-9b is gone', () => {
  it('replays/stage.ts has no engineStage', () => {
    expect('engineStage' in stage).toBe(false);
  });

  it('e2e/startupDevices.ts has no installStartupMic', () => {
    expect(src('e2e/startupDevices.ts')).not.toMatch(/installStartupMic/);
  });

  it('ui.ts reads no startup-look radios', () => {
    expect(src('src/ui.ts')).not.toMatch(/startup-look/);
  });
});

/**
 * CX-25 (the console plan; CX-13's carry): the modern shell's remainder is retired. `src/modern/index.ts`'s `mountShell`
 * and `mountSections` -- Home, Server status, News, Settings, Replays, the account chip and the sign-in panel -- were
 * reached from no page since OVERLAY-CONSOLE (#259): the import graph walked from every entry (the vite inputs and their
 * HTML, `pageEntry.ts`, the project pages, the forge's, the test room's, the console's and the overlay's) reaches none
 * of the modules below, and only tests mounted them (the walk's list is the plan's Log, CX-25). Each is gone with its
 * tests and CSS. `index.ts` stays for the type the kept modules import (`LauncherContext`, the overlay's Report's, with
 * its `LauncherMode`), with no code; CX-27 retired `ShellSectionId` and `LauncherContext.open` (below), which no reader
 * reads (`home/cards`' `HomeAction`, their last importer, went with CX-26). A browser adaptation's code: nothing of the
 * game.
 */
const RETIRED = [
  'src/modern/signIn.ts', 'src/modern/signIn.css', 'src/modern/cardArt.ts',
  'src/modern/home/index.ts', 'src/modern/home/devices.ts', 'src/modern/home/server.ts', 'src/modern/home/home.css',
  'src/modern/news/view.ts', 'src/modern/news/news.css',
  'src/modern/launch/launch.ts', 'src/modern/launch/launch.css',
  'src/modern/settings/index.ts', 'src/modern/settings/browser.ts', 'src/modern/settings/flow.ts',
  'src/modern/settings/overlayButton.ts', 'src/modern/settings/settings.css',
] as const;

const tree = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? tree(join(d, e.name)) : [join(d, e.name)]));

describe('CX-25: the modern shell\'s remainder is retired', () => {
  it('each module only the shell mounted is gone, with its CSS', () => {
    for (const f of RETIRED) expect(existsSync(resolve(VIEWER, f)), f).toBe(false);
  });

  it('src/modern/index.ts holds types only: no code, no value import, no stylesheet', () => {
    const text = code('src/modern/index.ts');
    expect(text).not.toMatch(/\bexport\s+(?:async\s+)?(?:function|const|let|class)\b/);
    expect(text).not.toMatch(/\bmountShell\b|\bmountSections\b|\bSHELL_SECTIONS\b/);
    for (const line of text.split('\n').filter((l) => /^\s*import\b/.test(l))) expect(line).toMatch(/^\s*import\s+type\b/);
    expect(text).not.toMatch(/pageStart|disc-page|startup-start|startup-ready/);   // CX-13 (c)'s, kept
  });

  it('nothing under src/, test/ or e2e/ imports a retired module', () => {
    const stems = RETIRED.map((f) => f.replace(/^src\//, '').replace(/\.ts$/, ''));
    const bad: string[] = [];
    for (const dir of ['src', 'test', 'e2e']) {
      for (const f of tree(resolve(VIEWER, dir)).filter((p) => /\.(ts|css)$/.test(p))) {
        const text = code(relative(VIEWER, f));
        for (const m of text.matchAll(/(?:from\s*|import\s*\(\s*|import\s+|@import\s+)['"]([^'"]+)['"]/g)) {
          const spec = m[1]!.replace(/\?.*$/, '');
          if (!spec.startsWith('.') && !spec.startsWith('/src/')) continue;
          const to = spec.startsWith('/src/') ? spec.slice('/src/'.length) : relative(resolve(VIEWER, 'src'), resolve(dirname(f), spec)).replace(/\\/g, '/');
          const hit = stems.find((s) => to === s || to === `${s}.ts` || (s.endsWith('/index') && to === s.slice(0, -'/index'.length)));
          if (hit) bad.push(`${relative(VIEWER, f).replace(/\\/g, '/')}: ${spec}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

/**
 * CX-26 (the console plan; CX-25's carry): the modern tree's test-only remainder is retired -- code CX-25's walk left in
 * modules an entry reaches, that only tests reached: the import graph walked again from every entry (the seven HTML
 * pages vite builds with `pageEntry.ts`'s loaders, `console/main.ts`, `main.ts`, `projectSite/index.ts`, and every
 * `central`, `match` and `playtest` source that imports viewer code), counted per export, reaches none of the names
 * below (the walk's result is the plan's Log, CX-26). Each is gone with its tests and CSS; each module keeps the exports
 * an entry reads, held present here. A browser adaptation's code: nothing of the game.
 */
/** A module's namespace, read by name. */
const ns = (m: object): Record<string, unknown> => m as Record<string, unknown>;
const RETIRED_26 = [
  'src/modern/agreement/agreement.css', 'src/modern/logoff.css', 'src/modern/osk.ts', 'src/modern/osk.css',
  'src/startupSettingsView.ts',
] as const;
/** Each retired export by its module, absent at run time and from the module's code (types included). */
const GONE_26: readonly [string, Record<string, unknown>, readonly string[]][] = [
  ['src/modern/replays/view.ts', ns(replaysView), ['mountReplays', 'ReplaysOptions', 'Replays']],
  ['src/modern/home/cards.ts', ns(cards), ['homeCards', 'readyFacts', 'readyLede', 'discLine', 'HOME_MAX_LINES', 'SERVER_OFFLINE', 'HomeInput',
    'HomeCard', 'HomeAction', 'HomeCardId', 'SlotState', 'ReadyFact', 'ReadyFactId', 'DiscReading', 'DiscLineState', 'UniverseReading',
    'ReplaysReading', 'CardReading', 'AnnouncementReading']],
  ['src/modern/agreement/agreement.ts', ns(agreement), ['agreementPanel', 'AgreementOptions', 'AgreementPanel']],
  ['src/modern/logoff.ts', ns(logoff), ['logoffConfirm', 'LogoffConfirm']],
  ['src/modern/dialog.ts', ns(dialog), ['dialogFocus', 'DialogFocus', 'DialogFocusOptions']],
  ['src/modern/session.ts', ns(session), ['registerSessionForLaunch']],
  ['src/modern/roller.ts', ns(roller), ['asRoller', 'rollerControl', 'stepRoller']],
];
/** What each module keeps: the exports an entry reads (the walk's), present. */
const KEPT_26: readonly [Record<string, unknown>, readonly string[]][] = [
  [ns(replaysView), ['mountReplayViewer', 'REPLAY_LIST_FAILURE_WORDS', 'resultWords', 'REPLAY_ROUND_WORDS', 'REPLAY_REFUSAL_WORDS', 'replayRefusalKind']],
  [ns(cards), ['serverStateWords']],
  [ns(agreement), ['agreementTextOf', 'pagePolicyService', 'AGREEMENT_TITLE', 'AGREEMENT_CONTENT_CHANGE', 'AGREEMENT_DECLINE_QUESTION', 'MU_AGREEMENT_SCROLL_STEP_ADAPTATION']],
  [ns(logoff), ['LOGOFF_QUESTION', 'LOGOFF_NO', 'LOGOFF_YES']],
  [ns(dialog), ['focusables']],
  [ns(session), ['endForLaunch', 'pageSession', 'createSession']],
  [ns(roller), ['rollerStep']],
];

describe('CX-26: the modern tree\'s test-only remainder is retired', () => {
  // The Sony art and its notice went with CX-26 (the owner, 2026-10-18) and came back with LATER 380 (the owner,
  // 2026-10-23: "the ps4 controller the socom2legacy-teaser had"): `tools/test/thirdPartyNotices.test.ts` holds them.
  it('each retired file is gone', () => {
    for (const f of RETIRED_26) expect(existsSync(resolve(VIEWER, f)), f).toBe(false);
  });

  it('each retired export is gone from its module (run time and code); what an entry reads stays', () => {
    for (const [file, mod, names] of GONE_26) {
      const text = code(file);
      for (const n of names) {
        expect(n in mod, `${file} exports ${n}`).toBe(false);
        expect(text, `${file} declares ${n}`).not.toMatch(new RegExp(`\\bexport\\s+(?:declare\\s+)?(?:async\\s+)?(?:function|const|let|class|interface|type)\\s+${n}\\b|\\bexport\\s*\\{[^}]*\\b${n}\\b`));
      }
    }
    for (const [mod, names] of KEPT_26) for (const n of names) expect(typeof mod[n], n).not.toBe('undefined');
  });

  it('padLayers has no account chain (addAccount, account): no reader registered one since the shell\'s Triangle', () => {
    const l = padLayers(document) as unknown as Record<string, unknown>;
    expect('addAccount' in l).toBe(false);
    expect('account' in l).toBe(false);
    expect(typeof l['addReset']).toBe('function');
  });

  it('the retired rules are gone: modern.css\'s sign-in panel parts and startup.css\'s Settings cards', () => {
    expect(src('src/modern/modern.css')).not.toMatch(/\.mu-signin|mu-spin/);
    expect(src('src/startup.css').replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/\.mu-set\b|mu-pad__art/);
    // CX-27: the rest of the sheet (the `.startup-look-body.is-guide` rule this line held) is retired too (below).
  });

  it('nothing under src/, test/ or e2e/ imports a retired module, or a retired export from its kept module', () => {
    const stems = RETIRED_26.filter((f) => /\.ts$/.test(f)).map((f) => f.replace(/^src\//, '').replace(/\.ts$/, ''));
    const assets = RETIRED_26.filter((f) => !/\.ts$/.test(f)).map((f) => f.replace(/^src\//, ''));
    const gone = new Map(GONE_26.map(([file, , names]) => [file.replace(/^src\//, '').replace(/\.ts$/, ''), names]));
    const bad: string[] = [];
    for (const dir of ['src', 'test', 'e2e']) {
      for (const f of tree(resolve(VIEWER, dir)).filter((p) => /\.(ts|css)$/.test(p))) {
        const rel = relative(VIEWER, f).replace(/\\/g, '/');
        const text = code(rel);
        const target = (spec: string): string | null => {
          spec = spec.replace(/\?.*$/, '');
          if (!spec.startsWith('.') && !spec.startsWith('/src/')) return null;
          return (spec.startsWith('/src/') ? spec.slice('/src/'.length) : relative(resolve(VIEWER, 'src'), resolve(dirname(f), spec)).replace(/\\/g, '/')).replace(/\.(ts|js)$/, '');
        };
        for (const m of text.matchAll(/(?:from\s*|import\s*\(\s*|import\s+|@import\s+)['"]([^'"]+)['"]/g)) {
          const to = target(m[1]!);
          if (to !== null && (stems.includes(to) || assets.includes(to))) bad.push(`${rel}: ${m[1]}`);
        }
        // A named import of a retired export from the module that kept the rest (an import or a re-export).
        for (const m of text.matchAll(/(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
          const names = gone.get(target(m[2]!) ?? '');
          if (!names) continue;
          for (const part of m[1]!.split(',')) {
            const n = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]!.trim();
            if (names.includes(n)) bad.push(`${rel}: ${n} from ${m[2]}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

/**
 * CX-27 (the console plan; CX-26's "left for a later row"): the dead remainder CX-26's walk found, re-walked from every
 * entry (the seven HTML pages, the code `setup/index.html`'s script reaches, `shared/`, and every `central`, `match` and
 * `playtest` source that imports viewer code; the walk's result is the plan's Log, CX-27). Each rule, export and route
 * below has no reader there, so each is gone with its tests; what an entry reads stays, held present here.
 * - `src/startup.css`: no live markup or code draws a class any of its rules names (`setup/index.html` draws only
 *   `.startup-emblem` of the sheet's family, whose rule is `styles.css`'); the file stays, empty of rules, because it is a
 *   build input (`setup/index.html` links it, `console/adapters/launch.ts` `GAME_SHEETS` hands it to the game page).
 * - `src/modern/modern.css`' `.mu-field*`, `.mu-check`, `.mu-link` (the sign-in panel's fields, retired with CX-26).
 * - `src/modern/replays/replays.css`' list rules (the Replays section's cards, filter, More and head, retired with
 *   CX-26's `mountReplays`); the viewer's own rules stay (`view.ts`, `transport.ts`, the console's Watch layer).
 * - `replays/data.ts` `newestReplays` (Home's Recent matches card, retired with CX-25).
 * - `padLayers.ts`' `keyboard` layer (the retired modern `osk`'s; no live markup draws `[data-osk]` or `.s2u-osk`).
 * - `src/modern/index.ts` `ShellSectionId` and `LauncherContext.open` (no reader); `LauncherMode` and `.mode` stay: the
 *   Report reads `ctx.mode` into its context line (`modern/report/index.ts`).
 * A browser adaptation's code: nothing of the game.
 */
const rulesOf = (css: string): string[] => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{/g)].map((m) => m[1]!.trim());
const named = (css: string, cls: string): boolean => new RegExp(`\\.${cls}(?![\\w-])`).test(css.replace(/\/\*[\s\S]*?\*\//g, ''));

describe('CX-27: the dead remainder CX-26 found is retired', () => {
  it('startup.css keeps no rule (no live markup draws one), and stays linked: a build input', () => {
    expect(rulesOf(src('src/startup.css'))).toEqual([]);
    expect(src('setup/index.html')).toMatch(/<link rel="stylesheet" href="\/src\/startup\.css" \/>/);
    expect(src('src/console/adapters/launch.ts')).toMatch(/import STARTUP_HREF from '\.\.\/\.\.\/startup\.css\?url'/);
    expect(src('src/styles.css')).toMatch(/#home \.startup-emblem \{/);   // the one startup-* class the page draws: styles.css'
  });

  it('modern.css has no .mu-field, .mu-check or .mu-link; the controls the viewer and the Report draw stay', () => {
    const css = src('src/modern/modern.css');
    for (const c of ['mu-field', 'mu-field__label', 'mu-field__input', 'mu-check', 'mu-link']) expect(named(css, c), c).toBe(false);
    for (const c of ['mu-button', 'mu-button--primary', 'mu-pill']) expect(named(css, c), c).toBe(true);
  });

  it('replays.css has no list rule of the retired section; every rule the viewer draws stays', () => {
    const css = src('src/modern/replays/replays.css');
    for (const c of ['mur__head', 'mur__title', 'mur__mark', 'mur__heading', 'mur__refresh', 'mur__list', 'mur__card', 'mur__card--ghost',
      'mur__thumb', 'mur__info', 'mur__line', 'mur__meta', 'mur__length', 'mur__count', 'mur__names', 'mur__side', 'mur__result',
      'mur__filter', 'mur__filter-label', 'mur__filter-select', 'mur__more', 'mur__more-button']) expect(named(css, c), c).toBe(false);
    expect(css).not.toMatch(/mur-ghost/);
    for (const c of ['mur', 'mur__body', 'mur__quiet', 'mur__map', 'mur__chip', 'mur__date', 'mur__locked', 'mur__prompt', 'mur__prompt--alert',
      'mur__prompt-icon', 'mur__viewer', 'mur__viewer-head', 'mur__cameras', 'mur__camera', 'mur__stage', 'mur__world', 'mur__frame-host',
      'mur__frame', 'mur__world-icon', 'mur__roster', 'mur__player', 'mur__player-name', 'mur__player-team', 'mur__status',
      'mur-transport', 'mur-status', 'mur-note', 'mur-seek', 'mur-seek__input', 'mur-seek__fill', 'mur-seek__marks', 'mur-seek__mark',
      'mur-seek__head', 'mur-seek__hover', 'mur-transport__row', 'mur-tbtn', 'mur-time', 'mur-partial', 'mur-speed', 'mur-speed__value',
      'mur-hints']) expect(named(css, c), c).toBe(true);
    // RV2-08 (the RV2 plan; RV2-04's note): the viewer draws no `.mur` class since RV2-04 and RV2-05 (its chrome and its
    // transport on the console's sheets, `src/console/replay.css` and `replay-transport.css`), so it loads this sheet no
    // more; the sheet's own retirement is left to the lane's record (RV2-10).
    expect(src('src/modern/replays/view.ts')).not.toMatch(/^import '\.\/replays\.css';$/m);
  });

  it('replays/data.ts has no newestReplays; what the console reads stays', () => {
    const r = ns(replaysData);
    expect('newestReplays' in r).toBe(false);
    expect(code('src/modern/replays/data.ts')).not.toMatch(/\bnewestReplays\b/);
    for (const n of ['durationText', 'replaysOf']) expect(typeof r[n], n).toBe('function');
  });

  it('padLayers has no keyboard layer: no route, no kind, no read of an on-screen keyboard; the dialog and page routes stay', () => {
    const routes = layers.PAD_LAYER_ROUTES_ADAPTATION as unknown as Record<string, unknown>;
    expect(Object.keys(routes).sort()).toEqual(['capture', 'dialog', 'page']);
    const text = code('src/modern/padLayers.ts');
    expect(text).toMatch(/export type PadLayerKind = 'capture' \| 'dialog' \| 'page';/);
    expect(text).not.toMatch(/data-osk|s2u-osk/);
    document.body.innerHTML = '<main><button>One</button></main><div class="s2u-osk" data-osk></div>';
    expect(padLayers(document).top()).toEqual({ kind: 'page', root: null });
    document.body.innerHTML = '';
  });

  it('src/modern/index.ts has no ShellSectionId and LauncherContext no open(); LauncherMode and mode stay (the Report reads it)', () => {
    const text = code('src/modern/index.ts');
    expect(text).not.toMatch(/\bShellSectionId\b/);
    expect(text).not.toMatch(/^\s*open\(/m);
    expect(text).toMatch(/export type LauncherMode = 'setup' \| 'overlay';/);
    expect(text).toMatch(/^\s*mode: LauncherMode;$/m);
    expect(code('src/modern/report/index.ts')).toMatch(/mode: i\.ctx\.mode/);
    expect(code('src/modern/overlay/index.ts')).not.toMatch(/\bopen: \(\) => \{\}/);
  });
});

/**
 * CX-29 (the console plan; CX-27's entry, "For the seat" (d)): the dead remainder CX-27's walk found, re-walked from
 * every entry as CX-27's was (the walk's result is the plan's Log, CX-29). Each rule, member and route below has no reader
 * there, so each is gone with its tests; what an entry reads stays, held present here.
 * - `src/modern/modern.css`' `.mu-account*`, `.mu-badge`, `.mu-empty*`, `.mu-shell` and `.mul__note` (the retired
 *   shell's top bar, its sections' empty states and labels; no live markup or code draws one).
 * - `src/modern/replays/replays.css`' `.mu-shell .mur__prompt-title`: it matched nothing since CX-25 (no `.mu-shell`
 *   is drawn), so the viewer's prompt title draws as it did.
 * - `padLayers.ts`' `PadReader` `'keyboard'` with the dialog route's `back` that named it: no reader asks for it. The
 *   one live asker of `back` is the walker (`owns('walker', 'back')`), false over a dialog before and after.
 * - `src/startupNavigation.ts`' `owns('walker', 'walk')` guard (never false past the capture return: the capture layer
 *   alone routes no walk) and its `[data-osk]` test (no live markup draws one).
 * - `src/modern/index.ts` `LauncherContext`'s `signIn`, `signOut` and `pad`: the one live context is the overlay's,
 *   and its one reader, the Report, reads `mode`, `state` and `session` only.
 * A browser adaptation's code: nothing of the game.
 */
describe('CX-29: the dead remainder CX-27 found is retired', () => {
  it('modern.css has no .mu-account*, .mu-badge, .mu-empty*, .mu-shell or .mul__note; the controls the viewer and the Report draw stay', () => {
    const css = src('src/modern/modern.css');
    for (const c of ['mu-account', 'mu-account__who', 'mu-account__name', 'mu-account__action', 'mu-badge', 'mu-empty', 'mu-empty__icon',
      'mu-empty__title', 'mu-empty__blurb', 'mu-shell', 'mul__note']) expect(named(css, c), c).toBe(false);
    for (const c of ['mu-button', 'mu-button--primary', 'mu-pill']) expect(named(css, c), c).toBe(true);
  });

  it('replays.css names no .mu-shell; the prompt\'s own rules stay, and the viewer still draws its title', () => {
    const css = src('src/modern/replays/replays.css');
    expect(named(css, 'mu-shell')).toBe(false);
    for (const c of ['mur__prompt', 'mur__prompt--alert', 'mur__prompt-icon']) expect(named(css, c), c).toBe(true);
    // RV2-04 (RV2.R4): the viewer draws its refusal's title in the console's empty block now (`../../src/console/replay.css`).
    expect(code('src/modern/replays/view.ts')).toMatch(/el\('h3', 'cx-item__title', title\)/);
  });

  it('padLayers names no keyboard reader: the dialog routes the walk alone, Circle to nobody; the page\'s routes stay', () => {
    expect(code('src/modern/padLayers.ts')).toMatch(/export type PadReader = 'walker' \| 'launcher' \| 'start';/);
    expect(layers.PAD_LAYER_ROUTES_ADAPTATION.dialog).toEqual({ walk: 'walker' });
    expect(layers.PAD_LAYER_ROUTES_ADAPTATION.page).toEqual({ walk: 'walker', back: 'walker', tiles: 'launcher', regions: 'launcher',
      start: 'start', account: 'launcher', reset: 'walker' });
    document.body.innerHTML = '<main><div role="dialog" aria-modal="true"><button>Yes</button></div></main>';
    const l = padLayers(document);
    expect(l.owner('back')).toBeNull();
    expect(l.owns('walker', 'back')).toBe(false);   // the walker's answer, the one live asker's: false before and after
    expect(l.owns('walker', 'walk')).toBe(true);
    document.body.innerHTML = '';
  });

  it('startupNavigation asks no walk guard past the capture return, and tests for no on-screen keyboard; its back and Square asks stay', () => {
    const text = code('src/startupNavigation.ts');
    expect(text).not.toMatch(/owns\('walker', 'walk'\)/);
    expect(text).not.toMatch(/data-osk/);
    expect(text).toMatch(/layer\.kind === 'capture'/);
    expect(text).toMatch(/this\.layers\.owns\('walker', 'back'\)/);
    expect(text).toMatch(/this\.layers\.owns\('walker', 'reset'\)/);
  });

  it('LauncherContext has no signIn, signOut or pad; what the Report reads stays, and the overlay builds no retired field', () => {
    const text = code('src/modern/index.ts');
    expect(text).not.toMatch(/^\s*(signIn|signOut|pad)\??[(:]/m);
    expect(text).not.toMatch(/\bPadSource\b/);
    for (const f of ['state: LauncherState;', 'session: ModernSession;', 'mode: LauncherMode;']) expect(text).toContain(f);
    const report = code('src/modern/report/index.ts');
    for (const r of ['i.ctx.mode', 'i.ctx.state.disc()', 'i.ctx.session.state()']) expect(report).toContain(r);
    expect(report).not.toMatch(/ctx\.(signIn|signOut|pad)\b/);
    const overlay = code('src/modern/overlay/index.ts');
    const built = /const ctx: LauncherContext = \{([^}]*)\};/.exec(overlay)?.[1] ?? '';
    expect(built).toMatch(/\bstate\b/);
    expect(built).not.toMatch(/\bsignIn\b|\bsignOut\b|\bpad:/);
  });
});

/**
 * CX-29 (item 5): the design system's `.s2u-osk` (part C, the on-screen keyboard) is retired: no live markup or code
 * draws it (the console's keyboard is `cx-osk`, part G; MU2's plan, which drew it, is closed). Its README section, its
 * place in part C's ring list and `selectors.ts`' entries go with it; the `--s2u-z-osk` token stays (the tokens are the
 * system's contract, and a consumer outside the repository carries it). The removal shipped in 2.0.0; the file is 2.1.0
 * (part K, the launcher's header Back).
 */
describe('CX-29: the design system\'s .s2u-osk is retired', () => {
  const ds = (p: string): string => readFileSync(resolve(VIEWER, '../../../shared/ds', p), 'utf8');
  it('components.css, selectors.ts and the README name no .s2u-osk; the ring keeps its three surfaces; the token stays', () => {
    const css = ds('components.css');
    expect(named(css, 's2u-osk')).toBe(false);
    expect(css).not.toMatch(/s2u-osk/);
    expect(css).toMatch(/:is\(\.s2u-launcher, \.s2u-shelf, \.s2u-dialog\) :is\(button, a\[href\], input, select, textarea, summary, \[tabindex\]\):is\(:focus-visible, \.is-pad-focused\)/);
    expect(named(css, 'cx-osk')).toBe(true);
    expect(ds('selectors.ts')).not.toMatch(/s2u-osk/);
    expect(ds('README.md')).not.toMatch(/s2u-osk/);
    expect(ds('base.css')).toMatch(/--s2u-z-osk: 34;/);
    // 2.3.0 (LR-1, part M) follows; the retirement holds at every later version
    const [maj, min] = ds('VERSION').trim().split('.').map(Number);
    expect(maj! > 2 || (maj === 2 && min! >= 2)).toBe(true);
  });
});

/**
 * CX-30 (the console plan; CX-29's walk, the merge controller's word 2026-10-18): `LauncherContext`'s last three
 * optional fields are retired. `roundRunning` was passed by the overlay (`overlay/index.ts`, the one live context) and
 * read by none -- the Report reads `mode`, `state` and `session` (`report/index.ts`), and the console reads the round
 * through its own `ConsolePageReads.roundRunning`, which stays. `onRoundChange` and `servedTree` were set by nothing and
 * read by nothing (the overlay's own `servedTree` option and the page reads' are other types, and stay). A browser
 * adaptation's code: nothing of the game.
 */
describe('CX-30: LauncherContext\'s dead fields are retired', () => {
  it('LauncherContext has no roundRunning, onRoundChange or servedTree, and the overlay builds the context without them', () => {
    const text = code('src/modern/index.ts');
    expect(text).not.toMatch(/^\s*(roundRunning|onRoundChange|servedTree)\??[(:]/m);
    for (const f of ['state: LauncherState;', 'session: ModernSession;', 'mode: LauncherMode;']) expect(text).toContain(f);
    const overlay = code('src/modern/overlay/index.ts');
    const built = /const ctx: LauncherContext = \{([^}]*)\};/.exec(overlay)?.[1] ?? '';
    expect(built).toMatch(/\bstate\b/);
    expect(built).not.toMatch(/\b(roundRunning|onRoundChange|servedTree)\b/);
    expect(code('src/modern/report/index.ts')).not.toMatch(/ctx\.(roundRunning|onRoundChange|servedTree)\b/);
  });
  it('the reads that stay: the console\'s page reads keep roundRunning, the overlay keeps its own servedTree option', () => {
    expect(code('src/console/state.ts')).toMatch(/roundRunning\(\): boolean;/);
    expect(code('src/modern/overlay/index.ts')).toMatch(/servedTree\?: \(\) => boolean;/);
    expect(code('src/modern/overlay/index.ts')).toMatch(/roundRunning: readRound/);   // the console's page reads, not the context
  });
});
