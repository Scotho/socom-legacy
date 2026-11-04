import type { JourneyChapter } from './types';

/**
 * The journey (TS-2; MU.R21, MU.R22): the project's own account of how the browser game got here, for players -- brought
 * over from the teaser's public page (teaser@185764c3 `socomlegacy/packages/viewer/src/projectSite/content/journey.ts`) and
 * re-worded to this repository: no person named, no link to another site, "SOCOM II Legacy", no internals (agents' names,
 * commits, sprint numbers). Editorial, like `news.ts`: it states no figure, no date and no status. Every number on the page,
 * each chapter's dates (`journey.chapters`, from the plans `tools/sitePages.ts` `JOURNEY_CHAPTERS` names) and where the work
 * stands now (`journey.now`) are the generator's (`siteData.json`; MU.R7; TS-4); no screenshot is shipped (MU.R22, OT.R34).
 * This is the project's page, not the original's: nothing here is a game behaviour.
 *
 * TS-4's research wave (2026-10-10) re-read the chapters against the plans they cite: 04 now names the work its plans record
 * as closed (the briefing rooms to the match's start, web sprint 17, closed 2026-10-06 in the online path's Log; push-to-talk
 * voice, web sprint 20, landed); 06 and 07 are new (the three maps and the feel; the replays), each from its plans' Goals.
 */
export const journeyChapters: readonly JourneyChapter[] = [
  {
    id: 'map-viewer', number: '01', title: 'A map in a browser tab',
    summary: 'It started as a question: could SOCOM II run in a browser? The first answer was a map viewer. It drew Frostfire, Desert Glory and Crossroads straight from the game’s own files, and soon every multiplayer map loaded, with the game’s own lighting and fog.',
    highlights: [
      'Every map read from the disc itself, nothing re-made by hand',
      'Night maps, fog and textures fixed until they looked like the PS2',
      'A first preview: fly through any map, on desktop or phone',
    ],
  },
  {
    id: 'playable', number: '02', title: 'From viewer to a playable match',
    summary: 'Within days the viewer became a game. You walk Frostfire at a SEAL’s eye height, aim, shoot and throw grenades, and join a respawn round with other players on the project’s own server. The rule throughout: every value comes from the real game.',
    highlights: [
      'Movement, aiming and recoil taken from the original’s own numbers',
      'Grenades, doors, the tactical map, binoculars and the HUD',
      'The ARMORY and the in-match weapon exchange',
      'Other players in your world, with the scoreboard',
    ],
  },
  {
    id: 'own-project', number: '03', title: 'A project of its own',
    summary: 'The browser game stopped being a side folder of the PC recompilation and became its own project. The groundwork for the original front end went in: the game’s own menu screens, its movies and a virtual memory card. Automated checks hold every piece to the original, so nothing quietly drifts.',
    highlights: [
      'The original menu screens read from the disc’s own files',
      'The intro movies decoded in the browser',
      'A memory card that remembers your settings, like the PS2’s',
    ],
  },
  {
    id: 'menus', number: '04', title: 'The original menus',
    summary: 'The goal changed from flying around a map to booting the game like a PS2 and walking its real online menus: the main menu, then ONLINE -- LOGIN, DNAS, SELECT UNIVERSE, the user agreement and SOCOM II ONLINE, then the briefing rooms, CREATE GAME and the game lobby, into the match. Each screen is rebuilt from the disc and checked against captures of the original.',
    highlights: [
      'The loader screens, the opening cards and the intro movie with sound',
      'The main menu with its music, played from your disc',
      'The online menus, pointed at the project’s own server',
      'The briefing rooms, CREATE GAME and the game lobby, up to the match’s start',
      'Push-to-talk voice, from the game lobby into the round',
    ],
  },
  {
    id: 'legacy', number: '05', title: 'SOCOM II Legacy',
    summary: 'The project took its name and opened its front door: a setup page for your disc, controller and microphone, with the project’s own pages beside it.',
    highlights: [
      'The setup page, with News, Roadmap, this Journey, the Archive and the Server',
      'Your disc stays yours: it is read in your browser and never uploaded',
    ],
  },
  {
    id: 'three-maps', number: '06', title: 'Three maps, played as the original',
    summary: 'With the menus reaching the match, the work turned to the round itself: Frostfire, Crossroads and Vigilance, each in its own mode, made to play and feel as they do on the PS2, and then Desert Glory with its hostages. The match launched from the game lobby and the test room were brought onto the same parts, and what playtests found became tracked fixes.',
    highlights: [
      'Frostfire and Vigilance in SUPPRESSION, Crossroads in DEMOLITION',
      'Desert Glory and its hostages, the first of the EXTRACTION maps',
      'One set of match rules for the lobby’s match and the test room',
      'Playtest findings written down, fixed and checked',
    ],
  },
  {
    id: 'replays', number: '07', title: 'Every round on the record',
    summary: 'Testing a game this closely needs a memory. Matches are recorded in one replay format, a recorded round plays back the way a spectator sees a match -- play, pause, speed, step and seek, in the original’s three spectator modes -- and a playtest keeps each observation beside the moment it was made.',
    highlights: [
      'One replay format for the matches the server runs',
      'Playback in the original’s three spectator modes',
      'Playtest notes tied to their moment in the replay',
    ],
  },
];

/** How it is built: the golden rule, the checks, the review, in plain words (the teaser's "How it’s built", re-worded). */
export const journeyWorkflow: { title: string; note: string; intro: string; points: readonly { title: string; text: string }[] } = {
  title: 'How it’s built',
  note: 'The rules behind the work',
  intro: 'SOCOM II Legacy is built by the project’s developer with a team of AI coding agents. The developer plays it, decides what matters next and makes the calls; the agents do the research, the code and the checking. One rule sits above everything else.',
  points: [
    { title: 'The golden rule: parity with the original',
      text: 'The original SOCOM II is the reference for everything. If the PS2 does it, the browser does it the same way, and anything that is not yet known stays a clearly marked stand-in instead of a guess dressed up as fact.' },
    { title: 'Read from the game, never guessed',
      text: 'Maps, menus, weapons and movement come from the game’s own files on your disc, and from studying how the original program behaves. Speeds, timings and damage are the game’s own numbers, not values tuned to feel close.' },
    { title: 'Checked against the real thing',
      text: 'Screens are compared with captures of the original, and mechanics with the original’s behaviour. Each finding is kept at the level it has reached: read from the game, or measured against the original running. Automated checks run before any change goes in, so that nothing quietly drifts.' },
    { title: 'Small pieces, fresh eyes',
      text: 'Work is split into small pieces. One agent builds a piece, a different one that did not write it reviews it, and it only goes in when it passes the checks.' },
    { title: 'Open about what is not done',
      text: 'Gaps and differences are written down and left for the developer to decide, not hidden or quietly patched. That is why these pages say plainly what is in the game and what is not yet.' },
    { title: 'Your disc, your copy',
      text: 'Nothing from the game is hosted but the setup page’s background video, the one exception the project has made. Everything else is read from your own disc image, in your browser, and never uploaded.' },
  ],
};
