/**
 * The console launcher's marks and pad glyphs, as the S2U Briefing design system's "Console launcher" prototype draws
 * them (its `P` paths, `ico`, `GLYPH`, `btn`, `DP`, `dpad`, `shoulder`, `shoulders`, `esc`; RB-29 drew the brand as
 * the logo image, and RB-45 took the prototype's `EMBLEM` out). The design's own set, kept apart from the modern
 * launcher's (`../modern/icons`). A browser adaptation with no original (the project's launcher page, OT.R28): nothing
 * of the game is drawn.
 */
export const P = {
  home: '<path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>',
  replay: '<path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v4h4"/><path d="m10 9 5 3-5 3z"/>',
  armory: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4-6.5 8-6.5s7 2 8 6.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  /**
   * CX-19 (CX.R11, the owner, 2026-10-12: the Disc row's source control "should be a cog"): a toothed gear, the page's own
   * mark -- the design's launcher set has no cog (its `settings` is the sun-like mark above) -- drawn here on the set's
   * grid and stroke: eight teeth, tips on a 9.5 circle (7 degrees either side of a tooth's centre), roots on a 7 circle
   * (12 degrees), one tooth at the top, and the hub. The project's own drawing (no third-party set).
   */
  cog: '<path d="M10.54 5.15L10.84 2.57A9.5 9.5 0 0 1 13.16 2.57L13.46 5.15A7 7 0 0 1 15.81 6.13L17.85 4.51A9.5 9.5 0 0 1 19.49 6.15L17.87 8.19A7 7 0 0 1 18.85 10.54L21.43 10.84A9.5 9.5 0 0 1 21.43 13.16L18.85 13.46A7 7 0 0 1 17.87 15.81L19.49 17.85A9.5 9.5 0 0 1 17.85 19.49L15.81 17.87A7 7 0 0 1 13.46 18.85L13.16 21.43A9.5 9.5 0 0 1 10.84 21.43L10.54 18.85A7 7 0 0 1 8.19 17.87L6.15 19.49A9.5 9.5 0 0 1 4.51 17.85L6.13 15.81A7 7 0 0 1 5.15 13.46L2.57 13.16A9.5 9.5 0 0 1 2.57 10.84L5.15 10.54A7 7 0 0 1 6.13 8.19L4.51 6.15A9.5 9.5 0 0 1 6.15 4.51L8.19 6.13A7 7 0 0 1 10.54 5.15Z"/><circle cx="12" cy="12" r="3"/>',
  /** FORGE: the Experiments section's mark, the page's own drawing on the set's grid and stroke (a flask). */
  flask: '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/><path d="M7 15h10"/>',
  /** FORGE: the forge's row mark (a hammer). */
  hammer: '<path d="m14 6 4 4M12 4l4-1 5 5-1 4-3-3-9.5 9.5a1.4 1.4 0 0 1-2-2L15 7z"/>',
  server: '<rect x="4" y="4" width="16" height="7"/><rect x="4" y="13" width="16" height="7"/><path d="M8 7.5h.01M8 16.5h.01"/>',
  pad: '<path d="M7 8h10a4 4 0 0 1 4 4l.5 4a2.5 2.5 0 0 1-4.5 1.5L15.5 16h-7L7 17.5A2.5 2.5 0 0 1 2.5 16L3 12a4 4 0 0 1 4-4z"/><path d="M7 11v3M5.5 12.5h3"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  micOff: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 12.5 4.3M12 18v3M3 3l18 18"/>',
  disc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/>',
  card: '<path d="M6 3h9l3 3v15H6z"/><path d="M9 3v5h6V3"/>',
  display: '<rect x="3" y="4" width="18" height="12"/><path d="M8 20h8M12 16v4"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>',
  news: '<rect x="4" y="4" width="16" height="16"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  /** DSH-10 (DSH.R17): "Send Game Files" and "SEND DISC" -- the download mark's line turned up (the files leave this device). */
  upload: '<path d="M12 15V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  lock: '<rect x="5" y="11" width="14" height="10"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  signout: '<path d="M10 4H4v16h6M15 8l4 4-4 4M19 12H9"/>',
  record: '<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4h-4"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  // B206 ML-2: the Mods row and screen -- a box, drawn in the set's own line (no outside art).
  package: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
  // CX-PERSONA: the rank's stand-in before the disc is in -- the modern set's authored star (`../modern/icons` `star`,
  // MU-3), the same path; with the disc in, the disc's own medal picture is drawn instead.
  star: '<path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/>',
  left: '<path d="m15 5-7 7 7 7"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  network: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01"/>',
  /**
   * LR-1 (the launcher redesign plan, LR.R9: the launcher's own set, extended in the same stroke for the artifact's
   * glyphs it lacked; never a fetched icon font): Appearance's theme mark (the artifact's `palette`), Home's Play
   * (`play_arrow`) and the controller settings' sliders (`tune`), drawn here on the set's grid.
   */
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  tune: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  /**
   * LR-20 (the LR.R11 side-by-side's pass 2, Q12: the App tab wore Display's monitor): the artifact's App mark
   * (`install_desktop`: a screen, its corner open to an arrow coming down into it, on its stand), drawn here on the set's
   * grid and stroke as LR-1 drew the artifact's other marks (LR.R9).
   */
  install: '<path d="M12 4H3v12h18v-4"/><path d="M8 20h8M12 16v4"/><path d="M17 3v7M14 7l3 3 3-3"/>',
  /** LR-22 (the side-by-side's pass 3, R5: the Mobile tab wore Controller's gamepad): a phone, drawn on the set's grid and stroke (LR.R9). */
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
  /**
   * LR-23 (LR.R22, the owner: "Adopt it's icons too please" -- "for the rows"): the mockup's marks for Home's rows
   * (`S2 Launcher v2.dc.html` ICONS, line 311: `card: 'sd_card'`, `activity: 'monitoring'`; Play's `play_arrow` is LR-1's
   * `play` above), drawn here on the set's grid and stroke as LR-1 drew the artifact's other marks (LR.R9: the launcher's
   * own set, never the fetched icon font): the memory card a card with its corner cut and its three contacts; Server
   * status a rising line over its bars.
   */
  sdCard: '<path d="M10 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9z"/><path d="M10 7v3M13 7v3M16 7v3"/>',
  monitoring: '<path d="M3 14l7-7 4 4 7-7"/><path d="M4 20v-3M8 20v-7M12 20v-7M16 20v-7M20 20v-11"/>',
  /**
   * RV2-04 (the replay viewer redesign, RV2.R4; LR.R9: the launcher's own set, extended in the same stroke): an eye --
   * the replay viewer's free camera and a spectator in its roster -- drawn on the set's grid as the modern set's eye
   * (`../modern/icons` `eye`, MU-3), the same outline and pupil.
   */
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
} as const;

export type IconName = keyof typeof P;

export const ico = (n: IconName, cls = ''): string => `<svg class="cx-ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n]}</svg>`;

export const GLYPH = {
  cross: '<path class="g" d="M8.5 8.5l9 9M17.5 8.5l-9 9"/>',
  circle: '<circle class="g" cx="13" cy="13" r="5"/>',
  square: '<rect class="g" x="8.5" y="8.5" width="9" height="9"/>',
  triangle: '<path class="g" d="M13 7.5l5.5 9.5h-11z"/>',
} as const;

export type FaceButton = keyof typeof GLYPH;

export const btn = (k: FaceButton): string =>
  `<span class="cx-btn cx-btn--${k}" data-menu-glyph="${k}" aria-hidden="true"><svg viewBox="0 0 26 26"><circle cx="13" cy="13" r="11"/>${GLYPH[k]}</svg></span>`;

const DP = { up: 'M11 2.5h6v7.5l-3 3-3-3z', down: 'M11 25.5h6V18l-3-3-3 3z', left: 'M2.5 11v6H10l3-3-3-3z', right: 'M25.5 11v6H18l-3-3 3-3z' } as const;

/** The D-pad with the live pair filled: `h` left / right, `v` up / down. */
export const dpad = (dir: 'h' | 'v'): string =>
  `<svg class="cx-dpad" data-menu-axis="${dir}" viewBox="0 0 28 28" aria-hidden="true">${(Object.keys(DP) as (keyof typeof DP)[]).map((k) => `<path class="${(dir === 'h') === (k === 'left' || k === 'right') ? 'on' : 'off'}" d="${DP[k]}"/>`).join('')}</svg>`;

export const shoulder = (k: string): string => `<span class="cx-shoulder ${/2$/.test(k) ? 'is-trigger' : ''}" data-menu-glyph="${esc(k.toLowerCase())}"><span class="cx-label">${k}</span></span>`;

export const shoulders = (ks: string): string => `<span class="cx-shoulders" aria-hidden="true">${ks.split(' ').map(shoulder).join('')}</span>`;

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/** Markup-escapes a server or card string before it is drawn. */
export const esc = (s: unknown): string => String(s).replace(/[&<>"]/g, (c) => ESC[c] ?? c);
