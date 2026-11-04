/**
 * The modern UI's icon set (MU-1 of `docs/plans/2026-10-09-modern-ui-parallel.md`). A browser adaptation (MU.R1):
 * nothing of the game. Every drawing here is authored in this repository -- no third-party icon set is copied, so no
 * licence is owed (the plan's MU-H1 proposed an open set; an authored one settles the question without it).
 *
 * The grid: a 24 x 24 viewBox, a 2px stroke with round caps and joins, no fill, `currentColor` -- so an icon takes
 * its colour from the text around it and its size from the CSS (`.mu-icon`, `tokens.css`). Each icon is a list of
 * primitive shapes; `icon` builds the element, `iconSvg` the same drawing as markup.
 */

type Shape = readonly ['path', string] | readonly ['circle', number, number, number] | readonly ['rect', number, number, number, number, number];

const SHAPES = {
  /** Rooms: four rooms of a lobby, seen from above. */
  lobby: [['rect', 3, 3, 7, 7, 1.5], ['rect', 14, 3, 7, 7, 1.5], ['rect', 3, 14, 7, 7, 1.5], ['rect', 14, 14, 7, 7, 1.5]],
  /** A person: the profile. */
  user: [['circle', 12, 8, 4], ['path', 'M4 21a8 8 0 0 1 16 0']],
  /** Two people: the players in a room. */
  players: [['circle', 9, 8, 3.5], ['path', 'M2.5 20a6.5 6.5 0 0 1 13 0'], ['path', 'M16 4.5a3.5 3.5 0 0 1 0 7'], ['path', 'M18 14.2a6.5 6.5 0 0 1 3.5 5.8']],
  /** A gear: settings. */
  settings: [['circle', 12, 12, 3], ['circle', 12, 12, 7],
    ['path', 'M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1']],
  /** A strip of film: replays. */
  replay: [['rect', 3, 5, 18, 14, 2], ['path', 'M7 5v14M17 5v14M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4']],
  /** Two racked units: the server. */
  server: [['rect', 3, 4, 18, 7, 2], ['rect', 3, 13, 18, 7, 2], ['path', 'M7 7.5h.01M7 16.5h.01M11 7.5h6M11 16.5h6']],
  /** An arrow into a door: sign in. */
  'sign-in': [['path', 'M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5'], ['path', 'M3 12h11'], ['path', 'M10 8l4 4-4 4']],
  /** An arrow out of a door: sign out. */
  'sign-out': [['path', 'M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5'], ['path', 'M10 12h11'], ['path', 'M17 8l4 4-4 4']],
  /** A play mark: launch. */
  launch: [['path', 'M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z']],
  /** A disc with its hub and a glint: the ISO. */
  disc: [['circle', 12, 12, 9], ['circle', 12, 12, 2.5], ['path', 'M12 6a6 6 0 0 0-6 6']],
  /** A padlock: a locked room, or a control that waits. */
  lock: [['rect', 5, 11, 14, 10, 2], ['path', 'M8 11V7a4 4 0 0 1 8 0v4'], ['path', 'M12 15v2']],
  /** A warning triangle: a refusal or an error said inline (MU-2). */
  alert: [['path', 'M10.3 4.2 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z'], ['path', 'M12 9v4M12 17h.01']],
  /** Four rising bars: the connection's signal. */
  signal: [['path', 'M4 20v-3M9 20v-7M14 20V9M19 20V4']],
  /** A speaker with a wave: audio (MU-5). */
  volume: [['path', 'M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z'], ['path', 'M15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11']],
  /** A screen on a stand: display (MU-5). */
  display: [['rect', 3, 4, 18, 12, 2], ['path', 'M8 20h8M12 16v4']],
  /** A pad: controls (MU-5). */
  pad: [['rect', 2.5, 7, 19, 11, 5], ['path', 'M7.5 10.5v4M5.5 12.5h4M16 11h.01M18 14h.01']],
  /** A tick: saved (MU-5). */
  check: [['path', 'M5 12.5l4.5 4.5L19 7.5']],
  /** A turning arrow: reset to default (MU-5). */
  reset: [['path', 'M4 12a8 8 0 1 0 2.6-5.9'], ['path', 'M4 4v4.5h4.5']],
  /** An open door: a briefing room (MU-3). */
  door: [['path', 'M4 21h16'], ['path', 'M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17'], ['path', 'M14 12h.01']],
  /** Two crossed blades: a game lobby (MU-3). */
  swords: [['path', 'M4 4l10 10M4 4v4M4 4h4'], ['path', 'M20 4L10 14M20 4v4M20 4h-4'], ['path', 'M7 17l-3 3M17 17l3 3M8 13l3 3M16 13l-3 3']],
  /** An eye: spectators (MU-3). */
  eye: [['path', 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z'], ['circle', 12, 12, 3]],
  /** Two chasing arrows: refresh, retry (MU-3). */
  refresh: [['path', 'M20 11a8 8 0 0 0-14.3-4.9L4 8'], ['path', 'M4 3v5h5'], ['path', 'M4 13a8 8 0 0 0 14.3 4.9L20 16'], ['path', 'M20 21v-5h-5']],
  /** A broken link to the server: not reachable (MU-3). */
  offline: [['path', 'M3 3l18 18'], ['path', 'M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.2-1.6'], ['path', 'M12 20h.01']],
  /** A star: a rank tier's authored stand-in (MU-3; the dialogue's Q6 default -- the game's medal needs the disc). */
  star: [['path', 'M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z']],
  /** A shield: a clan game (MU-3). */
  shield: [['path', 'M12 21s8-4 8-10V5l-8-3-8 3v6c0 6 8 10 8 10z']],
  // MU-10, the replay viewer's transport (the dialogue's D4 replay icons).
  /** A play triangle: play a replay (MU-10). */
  play: [['path', 'M8 5.5v13l10.5-6.5z']],
  /** Two bars: pause (MU-10). */
  pause: [['rect', 6, 5, 4, 14, 1], ['rect', 14, 5, 4, 14, 1]],
  /** A bar and a back triangle: one snapshot back (MU-10). */
  'step-back': [['path', 'M6 5v14'], ['path', 'M18 6v12l-8.5-6z']],
  /** A forward triangle and a bar: one snapshot on (MU-10). */
  'step-forward': [['path', 'M18 5v14'], ['path', 'M6 6v12l8.5-6z']],
  /** Two back triangles: jump back (MU-10). */
  rewind: [['path', 'M11.5 6v12L3 12z'], ['path', 'M21 6v12l-8.5-6z']],
  /** Two forward triangles: jump on (MU-10). */
  'fast-forward': [['path', 'M3 6v12l8.5-6z'], ['path', 'M12.5 6v12L21 12z']],
  /** A bar and an arrow home: the recording's start (MU-10). */
  'skip-start': [['path', 'M5 5v14'], ['path', 'M19 12H9'], ['path', 'M13 7l-5 5 5 5']],
  /** An arrow to a bar: the recording's end (MU-10). */
  'skip-end': [['path', 'M19 5v14'], ['path', 'M5 12h10'], ['path', 'M11 7l5 5-5 5']],
  /** A minus: slower (MU-10). */
  minus: [['path', 'M6 12h12']],
  /** A plus: faster (MU-10). */
  plus: [['path', 'M6 12h12M12 6v12']],
  /** An arrow left: back to the list (MU-10). */
  back: [['path', 'M20 12H5'], ['path', 'M11 6l-6 6 6 6']],
  // MU-13b, the news card.
  /** A sheet with lines: news and server messages (MU-13b). */
  news: [['rect', 4, 4, 16, 16, 2], ['path', 'M8 9h8M8 13h8M8 17h5']],
  /** A sight's reticle: the loadouts, the ARMORY's records (MU-13f). */
  armory: [['circle', 12, 12, 7], ['path', 'M12 2v5M12 17v5M2 12h5M17 12h5'], ['circle', 12, 12, 1]],
  /** An "i" in a ring: the shell's adaptation badge (MU-8c). */
  info: [['circle', 12, 12, 9], ['path', 'M12 11v5M12 8h.01']],
  // MU2-8, the select-backed roller (`./roller`, the design system's `.cx-roller`).
  /** A chevron left: a roller's step back (the console's own `left`, `src/console/icons.ts`). */
  'chevron-left': [['path', 'M15 5l-7 7 7 7']],
  /** A chevron right: a roller's step on (the console's own `right`). */
  'chevron-right': [['path', 'M9 5l7 7-7 7']],
} as const satisfies Record<string, readonly Shape[]>;

export type IconName = keyof typeof SHAPES;
/** Every icon's name, in the set's order. */
export const ICON_NAMES = Object.keys(SHAPES) as IconName[];

export interface IconOptions {
  /** A name makes the icon an image (`role="img"`, `aria-label`); without one it is decoration (`aria-hidden`). */
  label?: string;
  className?: string;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const FRAME: Record<string, string> = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
};

function shapeAttrs(shape: Shape): [string, Record<string, string>] {
  switch (shape[0]) {
    case 'path': return ['path', { d: shape[1] }];
    case 'circle': return ['circle', { cx: String(shape[1]), cy: String(shape[2]), r: String(shape[3]) }];
    case 'rect': return ['rect', { x: String(shape[1]), y: String(shape[2]), width: String(shape[3]), height: String(shape[4]), rx: String(shape[5]) }];
  }
}
function frameAttrs(opts: IconOptions): Record<string, string> {
  const attrs: Record<string, string> = { ...FRAME };
  if (opts.className) attrs['class'] = opts.className;
  if (opts.label) { attrs['role'] = 'img'; attrs['aria-label'] = opts.label; } else attrs['aria-hidden'] = 'true';
  attrs['focusable'] = 'false';
  return attrs;
}

/** The icon as an element of `doc` (the page's document by default). */
export function icon(name: IconName, opts: IconOptions = {}, doc: Document = document): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries(frameAttrs(opts))) svg.setAttribute(k, v);
  for (const shape of SHAPES[name] as readonly Shape[]) {
    const [tag, attrs] = shapeAttrs(shape);
    const el = doc.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.appendChild(el);
  }
  return svg;
}

const escapeAttr = (v: string): string => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The same drawing as markup, for a template. */
export function iconSvg(name: IconName, opts: IconOptions = {}): string {
  const attrs = (o: Record<string, string>): string => Object.entries(o).map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('');
  const body = (SHAPES[name] as readonly Shape[]).map((s) => { const [tag, a] = shapeAttrs(s); return `<${tag}${attrs(a)}></${tag}>`; }).join('');
  return `<svg xmlns="${SVG_NS}"${attrs(frameAttrs(opts))}>${body}</svg>`;
}
