/**
 * PAGE-ALLOC-A's oracle (LATER 867 (A); a product-track pin): `hudLayout` as it stood at agent/v0419 3a8fa1ba85
 * (`src/hud.ts`), kept verbatim but for its name and the imports, so `pageAllocA.test.ts` can hold the reworked
 * function to the same quads and rects with `Object.is` on every number. Not used by the game.
 */
import {
  ACTION_COLOURS, ACTION_ICON_FADE, ACTION_ICONS, AT_REST, BASE_MARK_TYPE_RGB_READING, C4_FUSE_BAR_PRESENTATION_ADAPTATION,
  compassMarks, FIRE_MODE_ROUNDS, HUD_ALIVE_RIGHT_LAYOUT_ADAPTATION, HUD_COLOURS, HUD_LAYOUT, infoBoxName, infoNumberText,
  MP_TEAM_TAG_COLOUR_READING, NAV_MARK, OBJECTIVE_MARK_RGB_READING, OWN_BODY_HIDES, SPECTATOR_HELP, SPECTATOR_HELP_TAIL_PLACEHOLDER,
  SPECTATOR_HIDES, SPECTATOR_INFO_LAYOUT, SPECTATOR_INFO_RGB_PLACEHOLDER, SPECTATOR_INFO_TEXT_RGB_PLACEHOLDER,
  SPECTATOR_OWN_INFO_PLACEHOLDER, spectatorInfoText, STANCE_WORDS, taggedName, TEAM_TAG_LAYOUT, TEAMMATE_HIDES, teamTagLayout,
  TEXT_LINE_LAYOUT, timerText, VICTORY_CAPTION_READING, WHITE, ammoLines,
  type ActionPrompt, type CompassMark, type HudElement, type HudModel, type HudQuad, type HudTiming,
} from '../../src/hud';
import { FONT_TEXT_01, layoutText, textWidth } from '../../src/hudFont';
import { keepClearNeighbours, messagePanelSpan } from '../../src/hudMessagePanel';
import type { Rect } from '../../src/reticle';
import { VOICE_ICON_RAMP } from '../../src/hudVoice';

const PS2_W = 640, PS2_H = 448;
type Rgba4 = [number, number, number, number];
interface TextSpot { x: number; y: number; scale: number; align?: 'left' | 'right' | 'centre' }

export function hudLayoutBase(
  frame: { width: number; height: number }, model: HudModel, sizes: Record<string, { width: number; height: number }>,
  timing: HudTiming = AT_REST,
): { scale: number; quads: HudQuad[]; rects: Partial<Record<HudElement, Rect>> } {
  const s = frame.height / PS2_H;
  const quads: HudQuad[] = [];
  // Anchors: the left edge, the right edge, the centre line.
  const L = (x: number): number => x * s;
  const R = (x: number): number => frame.width - (PS2_W - x) * s;
  const C = (x: number): number => frame.width / 2 + (x - PS2_W / 2) * s;
  const Y = (y: number): number => y * s;
  const alpha = (rgba: Rgba4, a: number): Rgba4 => [rgba[0], rgba[1], rgba[2], rgba[3] * a];
  const bitmap = (
    element: HudElement, texture: string, x: number, y: number, w: number, h: number, rgba: Rgba4,
    turn = 0, src?: [number, number, number, number], layer = 0,
  ): void => {
    const size = sizes[texture];
    if (!size || rgba[3] <= 0) return;
    const [u0, v0, u1, v1] = src ?? [0, 0, size.width, size.height];
    quads.push({ element, texture, x: x + w / 2, y: y + h / 2, w, h, turn, u0, v0, u1, v1, rgba, ...(layer ? { layer } : {}) });
  };
  // PAR-48: `opts.special` reads the pad glyphs (`./hudFont`), drawn from their atlas in their own colour with no shadow;
  // `opts.shadow` is the shadow's alpha when not the HUD's (`FUN_003625e0`: min(the string's, 96), as `./weaponSelect`).
  const text = (
    element: HudElement, line: string, spot: TextSpot, anchor: (x: number) => number, a = 1, rgb?: readonly number[], opacity = HUD_COLOURS.text[3],
    opts: { special?: boolean; shadow?: number } = {},
  ): void => {
    const font = FONT_TEXT_01.texture;
    if (!sizes[font] || a <= 0) return;
    const read = { special: opts.special === true };
    const width = textWidth(line, spot.scale, read);
    const pen = spot.align === 'right' ? spot.x - width : spot.align === 'centre' ? spot.x - width / 2 : spot.x;
    const { glyphs } = layoutText(line, pen, spot.y, spot.scale, read);
    const [dx, dy] = FONT_TEXT_01.dropShadow.pixels;
    for (const pass of ['shadow', 'text'] as const) {
      const [ox, oy] = pass === 'shadow' ? [dx * spot.scale, dy * spot.scale] : [0, 0];
      for (const g of glyphs) {
        if (g.texture) {
          if (pass === 'text' && g.rgb) {
            bitmap(element, g.texture, anchor(g.x), Y(g.y), g.w * s, g.h * s, alpha([g.rgb[0] / 128, g.rgb[1] / 128, g.rgb[2] / 128, opacity], a), 0, [g.u0, g.v0, g.u1, g.v1]);
          }
          continue;
        }
        const base: Rgba4 = pass === 'text' && g.rgb ? [g.rgb[0] / 128, g.rgb[1] / 128, g.rgb[2] / 128, opacity]
          : pass === 'text' && rgb ? [rgb[0]!, rgb[1]!, rgb[2]!, opacity]
          : pass === 'shadow' && opts.shadow !== undefined ? [0, 0, 0, opts.shadow] : HUD_COLOURS[pass];
        bitmap(element, font, anchor(g.x + ox), Y(g.y + oy), g.w * s, g.h * s, alpha(base, a),
          0, [g.u0, g.v0, g.u1, g.v1]);
      }
    }
  };

  // The ammo box, faded in on a spawn; hidden while scoped (`FUN_00237de0`, L56217-56225: the zoom readout stands
  // where it was).
  const A = HUD_LAYOUT.ammo, fade = model.zoom > 1.01 ? 0 : timing.fade;
  bitmap('panel', 'newweapnbkrnd.tif', L(A.panel.x), Y(A.panel.y), A.panel.w * s, A.panel.h * s, alpha(HUD_COLOURS.panel, fade));
  // LATER 117: watching a teammate, the icon is the viewed actor's held item's (`FUN_00237760` D:L85245-85249), not the
  // dead walker's own; none known, the panel alone.
  const watching = model.spectator?.path === 'teammate' ? model.spectator : null;
  const iconName = watching ? watching.weaponIcon ?? null : model.weaponIcon;
  const icon = iconName ? sizes[iconName] : undefined;
  if (iconName && icon) bitmap('icon', iconName, L(A.icon.x), Y(A.icon.y), icon.width * s, icon.height * s, alpha(HUD_COLOURS.icon, fade));
  const fm = sizes['firemode.tif'];
  const roundIcon = model.fireModeIcon ? sizes[model.fireModeIcon] : undefined;
  if (model.fireModeRow === false) {
    // Nothing up that has fire modes: no row (`FUN_005bc300`).
  } else if (model.fireModeIcon) {
    // A round mode (`FUN_00237b40`): the four cells hidden, the first shows the round's icon at its own size.
    if (roundIcon) bitmap('firemode', model.fireModeIcon, L(A.rounds4.xs[0]!), Y(A.rounds4.y), roundIcon.width * s, roundIcon.height * s, alpha(HUD_COLOURS.icon, fade));
  } else if (fm) {
    for (const x of A.rounds4.xs.slice(0, FIRE_MODE_ROUNDS[model.fireMode])) {
      bitmap('firemode', 'firemode.tif', L(x), Y(A.rounds4.y), fm.width * s, fm.height * s, alpha(HUD_COLOURS.icon, fade));
    }
  }
  const lines = ammoLines(model);
  text('rounds', lines.rounds, A.rounds, L, fade);
  if (lines.mags) text('mags', lines.mags, A.mags, L, fade);

  // The compass: the ring turned by the heading (`FUN_00211510` -> `FUN_00358730`).
  const K = HUD_LAYOUT.compass;
  bitmap('compass', 'compass_lo.tif', R(K.cx - K.size / 2), Y(K.cy - K.size / 2), K.size * s, K.size * s,
    [1, 1, 1, K.alpha], (model.yaw * Math.PI) / 180);

  // The compass's nav marks (`FUN_00211510`, research 87 §10): each nav point by its bearing from the view, within
  // 200 units at 0.005 x 65 pixels a unit and its own size; farther, pinned at radius 64 at 1.2x with `ret_triangle`
  // at radius 50 at 0.6x pointing to it. Shown: those within 200, and the nearest.
  // XR-06: the objective marks (`extraMarks`) by the same rule, in their colour (OBJECTIVE_MARK_RGB_READING).
  // HX-5: each objective mark in its type's colour (OBJECTIVE_MARK_RGB_READING), a pulsing one at the marks' pulse.
  // BOMB-MARKS: a typed base mark in its type's colour (BASE_MARK_TYPE_RGB_READING).
  for (const m of compassMarks(model)) {
    const c = m.type ? BASE_MARK_TYPE_RGB_READING[m.type]
      : m.objective ? OBJECTIVE_MARK_RGB_READING[m.bitmap as CompassMark['bitmap']] ?? NAV_MARK.rgb : NAV_MARK.rgb;
    const rgbNav: Rgba4 = [c[0] / 128, c[1] / 128, c[2] / 128, m.pulse ? timing.marks ?? 1 : 1];
    const size = sizes[m.bitmap];
    if (!size) continue;
    const at = (radius: number): [number, number] => [K.cx + radius * m.sin, K.cy - radius * m.cos];
    if (m.distance < 200) {
      const [x, y] = at(m.distance * 0.005 * 65);
      bitmap('marks', m.bitmap, R(x - size.width / 2), Y(y - size.height / 2), size.width * s, size.height * s, rgbNav);
    } else {
      const tri = sizes['ret_triangle.tif'];
      if (tri) {
        const [x, y] = at(50), w = tri.width * 0.6, h = tri.height * 0.6;
        bitmap('marks', 'ret_triangle.tif', R(x - w / 2), Y(y - h / 2), w * s, h * s,
          [NAV_MARK.arrow[0] / 128, NAV_MARK.arrow[1] / 128, NAV_MARK.arrow[2] / 128, 1], Math.atan2(m.sin, m.cos));
      }
      const [x, y] = at(64), w = size.width * 1.2, h = size.height * 1.2;
      bitmap('marks', m.bitmap, R(x - w / 2), Y(y - h / 2), w * s, h * s, rgbNav);
    }
  }

  // The info box: the health bar and the name on it, the timer line's box, the timer, the number (HUD-ALIVE B).
  // PAR-48: a seat viewing another shows the viewed body's (`FUN_00238500` D:L85555-85569), the walker's model untouched.
  const view = model.spectator ?? null, away = view !== null && view.path !== 'own';
  const body = away && view ? view.followed ?? SPECTATOR_OWN_INFO_PLACEHOLDER : null;
  const I = HUD_LAYOUT.info;
  const shownHealth = away ? body?.health ?? null : model.health;
  if (shownHealth !== null) {
    const health = Math.min(1, Math.max(0, shownHealth));
    if (health > 0) bitmap('bar', WHITE, R(I.bar.x), Y(I.bar.y), I.bar.w * health * s, I.bar.h * s, HUD_COLOURS.health);
    if (health < 1) {
      bitmap('bar', WHITE, R(I.bar.x + I.bar.w * health), Y(I.bar.y), I.bar.w * (1 - health) * s, I.bar.h * s, HUD_COLOURS.healthLost);
    }
  }
  // W4: "[tag] name", D:L85563-85567; NU-9 N1: the walker's own the same, his name and tag kept apart until here.
  const infoName = away ? (body ? taggedName(body.tag, body.name) : '') : model.name ? taggedName(model.tag, model.name) : '';
  if (infoName) text('name', infoBoxName(infoName), I.name, R);
  const panel = sizes['newweapnbkrnd.tif'];
  if (panel) {
    bitmap('box', 'newweapnbkrnd.tif', R(I.box.x), Y(I.box.y), I.box.w * s, I.box.h * s, HUD_COLOURS.panel, 0,
      [panel.width, 0, 0, panel.height]);
  }
  // XR-06: the fuse in the round timer's place while it runs (DEFUSE_TIMER_LAYOUT_READING).
  text('timer', timerText(model.defuseTimer ?? view?.roundTimer ?? model.timer), I.timer, R);
  const infoNumber = infoNumberText(model);   // HUD-ALIVE B: the consoles' count ("%d" / "%dm"); C: the range readout, when on
  if (infoNumber !== null) text('range', infoNumber, I.range, R);

  // MATCH-05 (research 170 §5.2): the voice element -- the number's box and the number, always (`FUN_00238ac0`
  // D:L85716-85717), the speaker's line, the channel icon and the talk / busy icon when they have a texture.
  // AD-7 (C93): each icon at its own ramped alpha (`timing.voice`; was the fixed 64 / 128 of
  // `VOICE_INDICATOR_LOOK_PLACEHOLDER.iconAlpha`), no positional motion (none read).
  if (model.voice) {
    const V = HUD_LAYOUT.voice, v = model.voice, rest = VOICE_ICON_RAMP.target / 128;
    const iconA = timing.voice?.icon ?? rest, talkA = timing.voice?.talk ?? rest;
    bitmap('voice', WHITE, R(V.countBox.x), Y(V.countBox.y), V.countBox.w * s, V.countBox.h * s, HUD_COLOURS.voiceBox);
    text('voice', v.count, V.count, R, 1, [1, 1, 1], HUD_COLOURS.voiceCount[3]);
    if (v.right != null) {   // HUD-ALIVE (OT.R117, a browser adaptation): the Terrorists alive, the left box mirrored
      const A = HUD_ALIVE_RIGHT_LAYOUT_ADAPTATION;
      bitmap('voice', WHITE, R(A.countBox.x), Y(A.countBox.y), A.countBox.w * s, A.countBox.h * s, HUD_COLOURS.voiceBox);
      text('voice', v.right, A.count, R, 1, [1, 1, 1], HUD_COLOURS.voiceCount[3]);
    }
    if (v.name) text('voice', v.name, V.name, R);
    if (v.icon) bitmap('voice', v.icon, R(V.icon.x), Y(V.icon.y), V.icon.w * s, V.icon.h * s, [1, 1, 1, iconA]);
    if (v.talk) bitmap('voice', v.talk, R(V.talk.x), Y(V.talk.y), V.talk.w * s, V.talk.h * s, [1, 1, 1, talkA]);
  }

  // NU-9 (c) T3 (research 329 §1.3-§1.7): the teammates' over-head tags, laid on the frame's own width in its 448-high
  // units (`teamTagLayout`; MP_TEAM_TAG_WIDE_FRAME_ADAPTATION) and placed from its left edge. The name texts in
  // `font_text_01` at 0.9 (LATER 671: the view's scale, the adaptation's by default), left at the pen, white (MP_TEAM_TAG_COLOUR_READING) at the tag's alpha over 128 with the drop
  // shadow at min(alpha, 96) (`FUN_003625e0`) -- none with TEAMMATE NAMES off (D:L77292-77301) or the Chat menu open
  // (D:L56617-56623). The talk arrow and icon over the holder's tag always (the HUD's own sprites, D:L77550, D:L77557),
  // each over its rectangle as `FUN_00364660` takes it -- the arrow's y0 under its y1, so drawn flipped.
  if (model.teamTags) {
    const laid = teamTagLayout(model.teamTags, s > 0 ? frame.width / s : PS2_W);
    if (model.teammateNames !== false && !model.commandMenu) {
      for (const t of laid.tags) {
        text('teamTags', t.text, { x: t.x, y: t.y, scale: model.teamTags.scale ?? TEAM_TAG_LAYOUT.scale }, L, 1, MP_TEAM_TAG_COLOUR_READING, t.alpha / 128,
          { shadow: Math.min(t.alpha, 96) / 128 });
      }
    }
    for (const sp of laid.sprites) {
      const size = sizes[sp.texture];
      if (!size) continue;
      const flipped = sp.y0 > sp.y1;
      bitmap('teamTalk', sp.texture, L(Math.min(sp.x0, sp.x1)), Y(Math.min(sp.y0, sp.y1)), Math.abs(sp.x1 - sp.x0) * s,
        Math.abs(sp.y1 - sp.y0) * s, [sp.rgb[0] / 128, sp.rgb[1] / 128, sp.rgb[2] / 128, sp.alpha / 128], 0,
        flipped ? [0, size.height, size.width, 0] : undefined);
    }
  }

  // The zoom readout and the scope's range (research 87 §13): while magnified.
  if (model.zoom > 1.01) {
    text('zoom', `ZOOM: ${model.zoom.toFixed(1)}x`, HUD_LAYOUT.zoom, L);
    text('scopeRange', `RANGE(m): ${model.range === null ? '----' : model.range.toFixed(0)}`, model.binoculars ? HUD_LAYOUT.binocularsRange : HUD_LAYOUT.scopeRange, C);
  }

  // The stance word, fading after a change.
  if (timing.stance > 0) text('stance', STANCE_WORDS[model.stance], HUD_LAYOUT.stance, R, timing.stance / HUD_COLOURS.text[3]);

  // The context prompt, pulsing.
  if (model.action) {
    const P = HUD_LAYOUT.action, c = ACTION_COLOURS[model.actionColour];
    const rgb = c.base.map((b, i) => (b + timing.pulse * c.delta[i]!) / 128) as [number, number, number];
    // LkPaioX5 part 2 (b): the head's caption (`actionCaptionOf`), every record's on the one label `FUN_00220350` writes
    // (D:L74385-74496), placed at (306, 435) as research 303 read it for VICTORY DANCE (VICTORY_CAPTION_READING's spot).
    if (model.actionCaption) {
      const V = VICTORY_CAPTION_READING;
      text('actionCaption', model.actionCaption, { x: V.x, y: V.y, scale: V.scale, align: 'centre' }, C, 1, [V.rgb / 128, V.rgb / 128, V.rgb / 128], V.alpha / 128);
    }
    // A bitmap the map lacks is `action_x.tif`, as `FUN_0021ded0` falls back for each (D:L73569-73570 the emblem's).
    const icon = (p: ActionPrompt): string => (sizes[ACTION_ICONS[p]] ? ACTION_ICONS[p] : ACTION_ICONS.action);
    // LkPaioX5 part 2 (a): each slot at its alpha (`ACTION_ICON_FADE`), the head's cap at rest.
    const F = ACTION_ICON_FADE, A = timing.actionAlpha;
    bitmap('action', icon(model.action), C(P.cx - P.size / 2), Y(P.y), P.size * s, P.size * s, [...rgb, A?.[0] ?? F.primary.cap / 128]);
    // list[1] right, list[2] left (`FUN_0021f210` D:L73987-74000: odd right, even left, 62 out), each its record's colour
    // on the one pulse (D:L74004-74012).
    (model.actionSides ?? []).slice(0, 2).forEach((side, i) => {
      const k = ACTION_COLOURS[side.colour], cx = P.cx + (i === 0 ? 1 : -1) * (P.size + P.gap);
      const sideRgb = k.base.map((b, j) => (b + timing.pulse * k.delta[j]!) / 128) as [number, number, number];
      bitmap('actionSides', icon(side.prompt), C(cx - P.size / 2), Y(P.y), P.size * s, P.size * s, [...sideRgb, A ? (A[i + 1] ?? 0) : F.side.cap / 128]);
    });
  }

  // PB-8: the bomb's hold bar, the box then the fill (`FUN_00220350` D:L74437-74442), right-anchored as the info box
  // is; its alphas its own, not the prompt's pulse.
  if (model.holdBar) {
    const H = HUD_LAYOUT.holdBar, f = Math.min(1, Math.max(0, model.holdBar.fill)), fade = model.holdBar.fade;
    const box: Rgba4 = fade === undefined ? HUD_COLOURS.holdBox : [0, 0, 0, fade / 128];
    const [r, g, b] = HUD_COLOURS.holdFill;
    const fill: Rgba4 = fade === undefined ? HUD_COLOURS.holdFill : [r, g, b, fade / 128];
    bitmap('holdBar', WHITE, R(H.box.x), Y(H.box.y), H.box.w * s, H.box.h * s, box);
    const width = Math.trunc(H.fill.x + H.fill.w * f) - H.fill.x;     // the (int) of D:L74442
    if (width > 0) bitmap('holdBar', WHITE, R(H.fill.x), Y(H.fill.y), width * s, H.fill.h * s, fill);
  }

  // The bomb hold (including its fade) has priority; the C4 clock itself continues in the projectile.
  if (model.c4FuseBar && !model.holdBar) {
    const H = HUD_LAYOUT[C4_FUSE_BAR_PRESENTATION_ADAPTATION.layout];
    const f = Math.min(1, Math.max(0, model.c4FuseBar.fill));
    bitmap('c4FuseBar', WHITE, R(H.box.x), Y(H.box.y), H.box.w * s, H.box.h * s, HUD_COLOURS.holdBox);
    const width = Math.trunc(H.fill.w * f);
    if (width > 0) bitmap('c4FuseBar', WHITE, R(H.fill.x), Y(H.fill.y), width * s, H.fill.h * s, HUD_COLOURS.holdFill);
  }

  // PAR-48: a spectator's own (`FUN_001f9160` D:L56875-56895): the panel `CSpectatorInfo` -- the stats panel, then the
  // title bar, then their words (`SPECTATOR_INFO_LAYOUT`, `spectatorInfoText`). The help lines follow, every seat's.
  if (view && (view.path ?? 'spectator') === 'spectator') {
    const S = SPECTATOR_INFO_LAYOUT, words = spectatorInfoText(view), ink = SPECTATOR_INFO_TEXT_RGB_PLACEHOLDER;
    const panelRgb = SPECTATOR_INFO_RGB_PLACEHOLDER;
    if (words.rows) {
      bitmap('spectatorInfo', 'newweapnbkrnd.tif', L(S.stats.x), Y(S.stats.y), S.stats.w * s, S.stats.h * s, [panelRgb[0], panelRgb[1], panelRgb[2], S.stats.alpha / 128]);
    }
    const titleRgb = words.titleRgb ?? panelRgb;
    bitmap('spectatorInfo', 'newweapnbkrnd.tif', L(S.title.x), Y(S.title.y), S.title.w * s, S.title.h * s, [titleRgb[0], titleRgb[1], titleRgb[2], S.title.alpha / 128]);
    text('spectatorInfo', words.title, S.titleText, L, 1, ink, ink[3]);
    words.rows?.forEach((row, i) => {
      text('spectatorInfo', row.label, { x: S.labels.x, y: S.labels.y0 + i * S.labels.pitch, scale: S.labels.scale }, L, 1, ink, ink[3]);
      if (row.value) {
        text('spectatorInfo', row.value, { x: S.values.x, y: S.values.y0 + i * S.values.pitch, scale: S.values.scale, align: S.values.align }, L, 1, ink, ink[3]);
      }
    });
  }
  // LATER 118 (research 282 §8): the six help lines `CHUD+0x19d58` on every seat's path -- the spectator's four
  // (`FUN_001f9160` D:L56869-56872) or a dead player's six (`view.help`: `FUN_001f97b0` D:L56996-57107, `FUN_001f9f20`
  // D:L57149-57173) -- placed and shown alike (`SPECTATOR_HELP`: D:L56881-56895, D:L57120-57135, D:L57191-57205), on the
  // one clock (`timing.help`, D:L56541-56562); RSP-6's ready Action line reasserts 100 every eligible frame
  // (research 351 §2, loaded r0004 0x1f9c50-0x1f9c68). Hidden while the Chat menu is open, for every seat (control state 2,
  // D:L56617-56622), and under the scoreboard (`SCOREBOARD_HIDES`, D:L56817-56823).
  const helpLines = !view ? null
    : (view.path ?? 'spectator') === 'spectator' ? [...SPECTATOR_HELP.lines, ...SPECTATOR_HELP_TAIL_PLACEHOLDER] : view.help ?? null;
  const H = SPECTATOR_HELP;
  if (helpLines && !model.commandMenu) {
    helpLines.forEach((line, i) => {
      const helpA = i === 1 && view?.respawnReady ? H.alpha : (timing.help ?? 1) * H.alpha;
      if (helpA <= 0) return;
      text('help', line, { x: H.x, y: H.y0 + i * H.pitch, scale: H.scale, align: 'centre' }, C, 1,
        [H.rgb[0] / 128, H.rgb[1] / 128, H.rgb[2] / 128], helpA / 128, { special: true, shadow: Math.min(helpA, 96) / 128 });
    });
  }

  // The event banner: the panel while any message shows, the lines newest at the bottom (`HUD_LAYOUT.banner`).
  const messages = model.message ? [...model.banner, { lines: [{ text: model.message, scale: 1 }], alpha: 1 }] : model.banner;
  const shown = messages.filter((m) => m.alpha > 0);
  if (shown.length > 0) {
    const M = HUD_LAYOUT.message, B = HUD_LAYOUT.banner;
    const panelAlpha = Math.max(...shown.map((m) => m.alpha));
    const lines = shown.flatMap((m) => m.lines.map((l) => ({ ...l, alpha: m.alpha })));
    // OT.R82 (`./hudMessagePanel`): wider, to its cap, for a line the default does not hold, clear of what stands beside it.
    const P = messagePanelSpan({ x: C(M.panel.x), w: M.panel.w * s, y0: Y(M.panel.y), y1: Y(M.panel.y + M.panel.h) }, s,
      Math.max(0, ...lines.map((l) => textWidth(l.text, l.scale))), [...quads, ...keepClearNeighbours(frame, model.keepClear ?? [])]);
    bitmap('banner', 'newweapnbkrnd.tif', P.x, Y(M.panel.y), P.w, M.panel.h * s, alpha(HUD_COLOURS.panel, panelAlpha));
    let y = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i]!;
      y = i === lines.length - 1 ? B.base + B.perScale * l.scale : y - B.pitch;
      text('message', l.text, { x: B.x, y, scale: l.scale, align: 'centre' }, C, l.alpha, l.rgb, l.opacity);
    }
  }

  // KEYBOARD-WHISPER (`TEXT_LINE_LAYOUT`; `ROUND_TEXT_LINE_DRAW_READING`): the round's text line, the box then the text,
  // anchored on the centre line as the message window is (25..615 is symmetric about x 320).
  const T = model.textLine;
  if (T) {
    const TL = TEXT_LINE_LAYOUT, [r, g, b] = TL.rgb;
    if (T.box > 0) bitmap('textLine', WHITE, C(TL.box.x), Y(TL.box.y), TL.box.w * s, TL.box.h * s, [0, 0, 0, T.box / 128]);
    if (T.text && T.ink > 0) {
      text('textLine', T.text, { x: TL.text.x, y: TL.text.y, scale: TL.text.scale }, C, 1, [r / 128, g / 128, b / 128], T.ink / 128,
        { shadow: Math.min(T.ink, 96) / 128 });
    }
  }

  // The spawn's fade from black, over everything the pass draws.
  if (model.fader > 0) bitmap('fader', WHITE, 0, 0, frame.width, frame.height, [0, 0, 0, model.fader], 0, undefined, 1);

  // PAR-48: what the view's path does not draw (`SPECTATOR_HIDES`, `OWN_BODY_HIDES`); LATER 117: `TEAMMATE_HIDES`.
  const hides = !view ? null : view.path === 'teammate' ? TEAMMATE_HIDES : away ? SPECTATOR_HIDES : OWN_BODY_HIDES;
  const kept = hides ? quads.filter((q) => !hides.has(q.element)) : quads;
  const rects: Partial<Record<HudElement, Rect>> = {};
  for (const q of kept) {
    const c = Math.abs(Math.cos(q.turn)), n = Math.abs(Math.sin(q.turn));
    const hw = (q.w * c + q.h * n) / 2, hh = (q.w * n + q.h * c) / 2;
    const r = rects[q.element];
    const x0 = q.x - hw, y0 = q.y - hh, x1 = q.x + hw, y1 = q.y + hh;
    if (!r) rects[q.element] = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    else {
      const nx0 = Math.min(r.x, x0), ny0 = Math.min(r.y, y0);
      rects[q.element] = { x: nx0, y: ny0, width: Math.max(r.x + r.width, x1) - nx0, height: Math.max(r.y + r.height, y1) - ny0 };
    }
  }
  return { scale: s, quads: kept, rects };
}
