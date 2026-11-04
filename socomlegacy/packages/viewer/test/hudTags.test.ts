// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import {
  MP_TEAM_TAG_CULL_READING, MP_TEAM_TAG_TALKER_ADAPTATION, teamTagInput, teamTags, type TeamTagBody, type TeamTagInput, type TeamTagPoint, type TeamTagsView,
} from '../src/hudTags';
import {
  MP_TEAM_TAG_LINE_HEIGHT_READING, MP_TEAM_TAG_TOP_MARGIN_READING, MP_TEAM_TAG_WIDE_FRAME_ADAPTATION, TEAM_TAG_LAYOUT, teamTagLayout,
} from '../src/hud';
import { textWidth } from '../src/hudFont';
import { VOICE_TAG_ARROW, VOICE_TALK_ICON } from '../src/hudVoice';

/**
 * NU-9 (c), research 329 §5 T1: the teammates' name tags over their heads, as `CMPTeammateNames`'s frame `FUN_002269a0`
 * (D:L77307-77460) makes them -- whose tag (§1.2, D:L77359-77380), the `head` node 3 up projected into the 640x448 frame
 * with none behind the eye (§1.3, D:L77381-77403), the text and its alpha (§1.4, §1.5), the bounds, the pen's clamp and
 * the overlap push (§1.3 steps 4-6, D:L77404-77426, `FUN_00227130` D:L77463-77483), at most eight (D:L77357-77358), and
 * the talk sprites on the holder's tag (§1.6, D:L77434-77443). Pure: a camera, fakes, no page.
 */

/** A camera at the origin looking down -z (three's default), the PS2 frame's proportion, 60 degrees high. */
function eye(): PerspectiveCamera {
  const c = new PerspectiveCamera(60, 640 / 448, 1, 10000);
  c.updateMatrixWorld();
  c.updateProjectionMatrix();
  return c;
}
const mate = (id: number, over: Partial<TeamTagBody> = {}): TeamTagBody => ({
  id, team: 'seal', dead: null, escortee: false, head: [0, 0, -100], name: 'BRAVO', ...over,
});
const input = (bodies: TeamTagBody[], over: Partial<TeamTagInput> = {}): TeamTagInput => ({
  self: { id: 1, team: 'seal' }, bodies, camera: eye(), holder: null, ...over,
});
/** The projected point's place on the frame by three's own projection (the test's independent arithmetic). */
const onFrame = (camera: PerspectiveCamera, p: readonly number[]): { u: number; y: number } => {
  const n = new Vector3(p[0], p[1], p[2]).project(camera);
  return { u: (n.x + 1) / 2, y: ((1 - n.y) / 2) * 448 };
};
const view = (points: TeamTagPoint[], holder: number | null = null, self: number | null = 1): TeamTagsView => ({ points, holder, self });
const pt = (id: number, u: number, y: number, text = 'BRAVO', alpha = 100): TeamTagPoint => ({ id, text, alpha, u, y });

describe('NU-9 T1: teamTags -- whose tag, the head 3 up projected, the text and the alpha (research 329 §1.2-§1.5)', () => {
  it('a teammate in front: one point, its text, its alpha 100 alive, at the head + 3.0 on y projected into the 640x448 frame', () => {
    const i = input([mate(2, { head: [10, 5, -100] })]);
    const out = teamTags(i);
    const at = onFrame(i.camera as PerspectiveCamera, [10, 8, -100]);
    expect(out.points).toHaveLength(1);
    expect(out.points[0]!).toMatchObject({ id: 2, text: 'BRAVO', alpha: 100 });
    expect(out.points[0]!.u).toBeCloseTo(at.u, 9);
    expect(out.points[0]!.y).toBeCloseTo(at.y, 9);
    expect(out.points[0]!.y).toBeLessThan(onFrame(i.camera as PerspectiveCamera, [10, 5, -100]).y);   // 3 up is higher on the frame
    expect(out).toMatchObject({ holder: null, self: 1 });
  });

  it('an enemy none; the page\'s own body none; an escortee none; a spectator page (team null) none; no page self none (D:L77377-77379)', () => {
    expect(teamTags(input([mate(2, { team: 'terrorist' })])).points).toEqual([]);
    expect(teamTags(input([mate(1)])).points).toEqual([]);
    expect(teamTags(input([mate(2, { escortee: true })])).points).toEqual([]);
    expect(teamTags(input([mate(2)], { self: { id: 1, team: null } })).points).toEqual([]);
    expect(teamTags(input([mate(2)], { self: null })).points).toEqual([]);
    expect(teamTags(input([mate(2, { team: null })])).points).toEqual([]);
  });

  it('a teammate behind the camera none (w <= 0.0001, D:L77388) -- though three\'s project lands it inside the frame', () => {
    const i = input([mate(2, { head: [5, 0, 100] })]);
    const n = new Vector3(5, 3, 100).project(i.camera);
    expect(Math.abs(n.x) <= 1 && Math.abs(n.y) <= 1).toBe(true);    // the trap: a mirrored point on the frame
    expect(teamTags(i).points).toEqual([]);
  });

  it('MP_TEAM_TAG_CULL_READING: a body not drawn (no head: its group hidden) or with its head outside the view none', () => {
    expect(MP_TEAM_TAG_CULL_READING).toBe('the group visible, the zone drawn and the head inside the frustum');   // LATER 415: the zone drawn (regionCull.test.ts)
    expect(teamTags(input([mate(2, { head: null })])).points).toEqual([]);
    expect(teamTags(input([mate(2, { head: [-1000, 0, -10] })])).points).toEqual([]);    // far off the left edge
    expect(teamTags(input([mate(2, { head: [0, 0, -20000] })])).points).toEqual([]);     // past the far plane
  });

  // H340 (Fuse's #504, superseded; the original decides): the tag follows the renderer's drawn test -- the zone drawn
  // (LATER 415), the frustum -- and no line or hull test (research 329 §1.2): a teammate behind a wall inside a drawn zone
  // keeps the tag (the input carries no hull to ask), one in an undrawn zone loses it.
  it("H340: a teammate in a drawn zone is tagged whatever stands between (no hull is asked); in an undrawn zone, none", () => {
    expect(teamTags(input([mate(2, { zoneDrawn: true })])).points.map((p) => p.id)).toEqual([2]);
    expect(teamTags(input([mate(2, { zoneDrawn: false })])).points).toEqual([]);
    expect('grid' in input([mate(2)]), 'no hull in the tags\' input').toBe(false);
  });

  it('a dead teammate fades: 0, 2.5, 4.99 s dead -> alpha 100, 50, 0.2; from 5 s none (FUN_00548050 < 5.0, D:L77377, D:L77430-77433)', () => {
    const alpha = (dead: number): number | undefined => teamTags(input([mate(2, { dead })])).points[0]?.alpha;
    expect(alpha(0)).toBe(100);
    expect(alpha(2.5)).toBe(50);
    expect(alpha(4.99)).toBeCloseTo(0.2, 9);
    expect(alpha(5)).toBeUndefined();
    expect(alpha(9)).toBeUndefined();
  });

  it('the text: "[NSW] BRAVO" for tag "NSW", "[X] BRAVO" for "X" (one character or more, D:L77394-77398), "BRAVO" with none', () => {
    const text = (clan?: string): string | undefined => teamTags(input([mate(2, clan === undefined ? {} : { clan })])).points[0]?.text;
    expect(text('NSW')).toBe('[NSW] BRAVO');
    expect(text('X')).toBe('[X] BRAVO');
    expect(text('')).toBe('BRAVO');
    expect(text()).toBe('BRAVO');
  });

  it('the actor list\'s order is the input\'s, every eligible body kept (the cap of eight is the layout\'s: drawn tags)', () => {
    const out = teamTags(input([5, 3, 9, 2, 4, 6, 7, 8, 10].map((id) => mate(id))));
    expect(out.points.map((p) => p.id)).toEqual([5, 3, 9, 2, 4, 6, 7, 8, 10]);
  });
});

describe('NU-9 T1: teamTagLayout -- the bounds, the clamp, the overlap push, eight at most, the talk sprites (research 329 §1.3, §1.6)', () => {
  const W = textWidth('BRAVO', TEAM_TAG_LAYOUT.scale), h = W / 2;   // 46 at 0.9: h 23
  const II = textWidth('II', TEAM_TAG_LAYOUT.scale);                 // 10 at 0.9: h 5

  it('the constants: scale 0.9 (D:L77539), the line height 15 (MP_TEAM_TAG_LINE_HEIGHT_READING, FUN_00359c40), the margin 0, the right bound 40 short of the frame', () => {
    expect(TEAM_TAG_LAYOUT).toMatchObject({ scale: 0.9, max: 8, pad: 10, push: 5, raise: 3 });
    expect(MP_TEAM_TAG_LINE_HEIGHT_READING).toBe(15);
    expect(MP_TEAM_TAG_TOP_MARGIN_READING).toBe(0);
    expect(MP_TEAM_TAG_WIDE_FRAME_ADAPTATION).toEqual({ rightInset: 40 });
    expect([W, II]).toEqual([46, 10]);
  });

  it('one tag: its pen the centre less half its width, truncated, its baseline the projected y (D:L77404-77411, D:L77445)', () => {
    const { tags, sprites } = teamTagLayout(view([pt(2, 0.5, 212.7)]));
    expect(tags).toEqual([{ id: 2, text: 'BRAVO', x: Math.trunc(320 - h), y: 212, width: W, alpha: 100 }]);
    expect(sprites).toEqual([]);
  });

  it('the left edge strictly inside 0..600: at 0 or 600 none (an "II" tag, h 5, at centres 5 and 605)', () => {
    expect(teamTagLayout(view([pt(2, 5 / 640, 200, 'II')])).tags).toEqual([]);
    expect(teamTagLayout(view([pt(2, 605 / 640, 200, 'II')])).tags).toEqual([]);
    expect(teamTagLayout(view([pt(2, 6 / 640, 200, 'II')])).tags).toHaveLength(1);
    expect(teamTagLayout(view([pt(2, 604 / 640, 200, 'II')])).tags).toHaveLength(1);
  });

  it('the clamp\'s two branches: a centre past 600 held at 600 - h; a left edge under h pushed to h (as the decompiled text reads)', () => {
    expect(teamTagLayout(view([pt(2, 610 / 640, 200)])).tags[0]!.x).toBe(600 - h);
    expect(teamTagLayout(view([pt(2, 30 / 640, 200)])).tags[0]!.x).toBe(h);
    expect(teamTagLayout(view([pt(2, 100 / 640, 200)])).tags[0]!.x).toBe(100 - h);
  });

  it('the baseline strictly inside top..448 - top: at 0 or 448 none', () => {
    expect(teamTagLayout(view([pt(2, 0.5, 0)])).tags).toEqual([]);
    expect(teamTagLayout(view([pt(2, 0.5, 448)])).tags).toEqual([]);
    expect(teamTagLayout(view([pt(2, 0.5, 1)])).tags).toHaveLength(1);
    expect(teamTagLayout(view([pt(2, 0.5, 447)])).tags).toHaveLength(1);
    // A margin (the letterbox's bars, MP_TEAM_TAG_TOP_MARGIN_READING) narrows both.
    expect(teamTagLayout(view([pt(2, 0.5, 30)]), 640, 30).tags).toEqual([]);
    expect(teamTagLayout(view([pt(2, 0.5, 418)]), 640, 30).tags).toEqual([]);
  });

  it('two teammates at one point: the second 5 px lower per step until its padded box clears the first\'s (FUN_00227130)', () => {
    const { tags } = teamTagLayout(view([pt(2, 0.5, 200), pt(3, 0.5, 200)]));
    expect(tags.map((t) => [t.id, t.y])).toEqual([[2, 200], [3, 225]]);     // 200 + 5 x 5: (225 - 10) clears 200 + 15 (was 235 with 25)
    // Side by side, clear: no push.
    const apart = teamTagLayout(view([pt(2, 0.25, 200), pt(3, 0.75, 200)])).tags;
    expect(apart.map((t) => t.y)).toEqual([200, 200]);
  });

  it('a ninth teammate none: eight tags at most (D:L77357-77358); the ninth tested only after eight are drawn', () => {
    const nine = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => pt(10 + k, 0.5, 20 + 40 * k));
    const { tags } = teamTagLayout(view(nine));
    expect(tags.map((t) => t.id)).toEqual([10, 11, 12, 13, 14, 15, 16, 17]);
    // An undrawn one (out of bounds) takes no place: the ninth body is drawn then.
    const off = [pt(9, 0.5, 0), ...nine.slice(0, 8)];
    expect(teamTagLayout(view(off)).tags).toHaveLength(8);
  });

  it('the holder\'s tag carries the arrow and the icon at its projected centre, truncated (D:L77434-77443); another\'s none; the page\'s own hold none', () => {
    const { tags, sprites } = teamTagLayout(view([pt(2, 0.5, 200.6), pt(3, 0.25, 300)], 3));
    expect(tags).toHaveLength(2);
    expect(sprites).toEqual([
      { texture: VOICE_TAG_ARROW, x0: 160 - 16, y0: 300 - 10, x1: 160 + 16, y1: 300 - 42, rgb: [40, 96, 110], alpha: 64 },
      { texture: VOICE_TALK_ICON, x0: 160 - 16, y0: 300 - 35 - 32, x1: 160 + 16, y1: 300 - 35, rgb: [128, 128, 128], alpha: 64 },
    ]);
    // At a fractional centre and baseline the rectangle's corners are each (int) of their sums (D:L77437-77441).
    const frac = teamTagLayout(view([pt(2, 100.5 / 640, 200.6)], 2)).sprites[0]!;
    expect([frac.x0, frac.y0, frac.x1, frac.y1]).toEqual([84, 190, 116, 158]);
    expect(teamTagLayout(view([pt(2, 0.5, 200)], 9)).sprites).toEqual([]);
    expect(teamTagLayout(view([pt(2, 0.5, 200)], 2, 2)).sprites).toEqual([]);
    expect(teamTagLayout(view([pt(2, 0.5, 200)], null)).sprites).toEqual([]);
    // A holder whose tag is not drawn (out of bounds) gets none.
    expect(teamTagLayout(view([pt(2, 0.5, 0)], 2)).sprites).toEqual([]);
  });

  it('MP_TEAM_TAG_WIDE_FRAME_ADAPTATION: a wider frame (in 448-high units) takes its own right bound, its width less 40', () => {
    // 896 wide: the bound 856. A centre at 870 is held at 856 - h; the same point on the 640 frame (u > 1) is gone.
    const u = 870 / 896;
    expect(teamTagLayout(view([pt(2, u, 200)]), 896).tags[0]!.x).toBe(856 - h);
    expect(teamTagLayout(view([pt(2, 0.5, 200)]), 896).tags[0]!.x).toBe(Math.trunc(448 - h));
  });
});

describe('NU-9 T1: teamTagInput -- the page\'s rows, names, sides, heads and the talker as the tags\' input', () => {
  const camera = eye();
  const page = {
    client: { id: 1, role: 'player', team: 'seal' as const },
    rows: [{ id: 4, clan: 'NSW' }, { id: 1 }, { id: 2 }, { id: 3 }],
    nameOf: (id: number) => `P${id}`,
  };
  const remotes = {
    headAt: (id: number): [number, number, number] | null => (id === 3 ? null : [id, 0, -100]),
    deathAge: (id: number): number | null => (id === 2 ? 1.5 : null),
    teamOf: (id: number) => (id === 4 ? 'terrorist' as const : 'seal' as const),
  };

  it('the rows in member id order (TEAMMATE_ROW_ORDER_READING), each with its side, death age, head, name and clan; the page\'s team; the talker heard', () => {
    const i = teamTagInput(page, remotes, camera, { holder: 2, playing: null });
    expect(i.self).toEqual({ id: 1, team: 'seal' });
    expect(i.bodies.map((b) => b.id)).toEqual([1, 2, 3, 4]);
    expect(i.bodies[1]).toEqual({ id: 2, team: 'seal', dead: 1.5, escortee: false, head: [2, 0, -100], name: 'P2' });
    expect(i.bodies[2]!.head).toBeNull();
    expect(i.bodies[3]).toMatchObject({ team: 'terrorist', clan: 'NSW' });
    expect(i.holder).toBe(2);
    expect(i.camera).toBe(camera);
    // MP_TEAM_TAG_TALKER_ADAPTATION (VOICE-LATE (B)'s rule, a browser adaptation): the voice heard names the talker, as the
    // HUD's other voice indicators (`heardTalker`); the original's sprites go over the floor's holder alone.
    expect(MP_TEAM_TAG_TALKER_ADAPTATION).toBe('heardTalker');
    expect(teamTagInput(page, remotes, camera, { holder: 2, playing: 3 }).holder).toBe(3);
    expect(teamTagInput(page, remotes, camera, { holder: null, playing: 3 }).holder).toBe(3);
    expect(teamTagInput(page, remotes, camera, { holder: 1, playing: null }).holder).toBeNull();
    // A spectator page: team null, no tags (the team rule).
    expect(teamTagInput({ ...page, client: { id: 9, role: 'spectator', team: null } }, remotes, camera, { holder: null }).self).toEqual({ id: 9, team: null });
    expect(teamTags(teamTagInput(page, remotes, camera, { holder: null })).points.map((p) => p.id)).toEqual([2]);
  });
});
