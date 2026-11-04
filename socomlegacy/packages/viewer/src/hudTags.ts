import { Vector3, type Camera } from 'three';
import { taggedName } from './hud';
import { heardTalker } from './hudVoice';
import type { Team } from './net/protocol';
import { botDisplayName } from './botPresentation';

/**
 * NU-9 (c) T1 (research 329 §5 T1; reading, pending review): the teammates' name tags over their heads, as the HUD's
 * `CMPTeammateNames` (`CHUD+0x17580`, set up by `FUN_00227340` D:L77524-77562) makes them each frame in `FUN_002269a0`
 * (D:L77307-77460) -- pure: the page's state in, the tags' points out. Here: whose tag (§1.2), the `head` node 3.0 up
 * projected by the camera with none behind the eye (§1.3 steps 1-2), the text (§1.4) and its alpha (§1.5). The frame's
 * bounds, the pen's clamp, the overlap push, the cap of eight drawn and the talk sprites (§1.3 steps 4-6, §1.6) need the
 * frame's width in its 448-high units, which only the HUD knows as it draws: `./hud` `teamTagLayout`. The TEAMMATE NAMES
 * option gates only the texts, at the HUD (`Hud.setTeammateNames`): this computes the tags whatever it says (329 F1, N1).
 */

/**
 * MP_TEAM_TAG_CULL_READING (research 329 §1.2, §6): the original tags a body only when the renderer drew its model this
 * frame or the last (`FUN_00315580(node, 2)` D:L77376, the node's `+0x98` against the frame counter, D:L214885-214889;
 * the stamp `FUN_003374c0` D:L235478-235481) with its node's `+0x5c` bit 0 set (D:L77379); which bodies the renderer
 * leaves undrawn: the scene walk's region gate (LATER 415, `./regionCull`: the node's zone bit in the camera's mask), the
 * frustum and the opacity -- no line or hull test (research 329 §1.2). The page's: the body's group visible
 * (`RemotePlayers.headAt` null otherwise: a ghost, a hidden corpse, a rescued hostage at 0), its zone drawn
 * (`TeamTagBody.zoneDrawn`, `RegionCull.drawn`) and its head point inside the camera's frustum. A visual's own distance
 * and level-of-detail skip (`FUN_003b7b90`) is not modelled; the original's drawn test passes for this frame or the last
 * (`FUN_00315580(node, 2)`), the port's zone gate is this frame's (LATER 415's review, F5). Settles: research 329's
 * capture NU9C-1 (a teammate behind a wall inside the view, one far away).
 */
export const MP_TEAM_TAG_CULL_READING = 'the group visible, the zone drawn and the head inside the frustum' as const;

/**
 * MP_TEAM_TAG_TALKER_ADAPTATION (research 329 §1.6, §6; **a browser adaptation**): the original puts the talk arrow and
 * icon over the tag of the floor's holder alone -- the seat holding the listener's channel while another holds it
 * (`iStack_f0`, `FUN_0030e790`, D:L77345-77350, D:L77434-77443). The port names the talker by VOICE-LATE (B)'s rule
 * (`./hudVoice` `heardTalker`, research 226 §3.2): the voice playing now, else the floor's holder, never the page -- kept
 * for consistency with the HUD's other voice marks (the speaker's line, the busy icon, the compass mark), which name
 * whoever is heard. The two agree except while a talk's tail plays behind the jitter window.
 */
export const MP_TEAM_TAG_TALKER_ADAPTATION = 'heardTalker' as const;

/** The anchor's rise over the `head` node, world units up (`fStack_1c + 3.0`, D:L77383-77384). */
const HEAD_RAISE = 3.0;
/** None behind the eye: the projected w at or under this (D:L77388). */
const EYE_W = 0.0001;
/** A dead teammate's tag: gone from 5 s (D:L77377), alpha 100 - 20 t before (D:L77430-77433); 100 alive (D:L77427-77429). */
const FADE = { gone: 5.0, alive: 100, perSecond: 20 } as const;

/** One body the frame weighs (the original's actor list's type-2 actors, D:L77357-77365). */
export interface TeamTagBody {
  /** The member id (the seat, the original's `+0xfc8`). */
  id: number;
  /** Its side (the team word `+0xc8`), null for none known. */
  team: Team | null;
  /** Seconds since its drawn death (`FUN_00548050`, D:L413162-413174), null alive. */
  dead: number | null;
  /** The escortee bit 0x20000 (D:L77379). */
  escortee: boolean;
  /** Its `head` node in world space (`FUN_005a3070` D:L460118-460121), null when its body is not drawn. */
  head: readonly number[] | null;
  /** LATER 415: false when the region gate leaves its node undrawn (`./regionCull` `RegionCull.drawn`); absent, drawn. */
  zoneDrawn?: boolean;
  /** Its name (`+0x14`, D:L77389-77393) and its seat's clan tag (`FUN_002c3ac0(+0xfc8)`, D:L77394-77398). */
  name: string;
  clan?: string;
  /** Authored extension: only explicit trusted CPU identity enables gold initial ink. */
  bot?: true;
}

/** What `teamTags` reads: the page's own seat and side, the bodies in the actor list's order, the camera, the talker. */
export interface TeamTagInput {
  /** The page's own member id and side (`FUN_002b3580`'s actor, D:L77354); null side for a spectator; null for no page. */
  self: { id: number; team: Team | null } | null;
  /** In the actor list's order (`TEAMMATE_ROW_ORDER_READING`: member id, `teamTagInput`). */
  bodies: readonly TeamTagBody[];
  /** The view drawn this frame, its matrices current (`updateMatrixWorld`): `FUN_00308580`'s matrix (D:L77382-77387). */
  camera: Camera;
  /** The seat holding the listener's channel (`iStack_f0`, D:L77345-77350), as the voice indicators name it; null none. */
  holder: number | null;
}

/** One tag's point: the text, the alpha (GS units, 100 full), the centre's place across (0..1) and its y on the 448 frame. */
export interface TeamTagPoint { id: number; text: string; alpha: number; u: number; y: number }
/** What `Hud.setTeamTags` takes (`./hud` `teamTagLayout` lays it out): the points in order, the talker, the page's own id. */
export interface TeamTagsView { points: TeamTagPoint[]; holder: number | null; self: number | null }

const scratch = new Vector3();

/**
 * A world point through the camera: its w (`-z` in the view, the original's projected w, D:L77388) and its place on the
 * frame, `u` across 0..1 and `y` down in the 448 rows (x = X/w + 320 - 2048, y = Y/w + 224 - 2048 on the 640x448 frame,
 * D:L77402-77403; the camera's projection is the page's, so `u` maps to the frame's own width at the layout).
 */
function project(camera: Camera, x: number, y: number, z: number): { w: number; u: number; y: number; ndc: Vector3 } {
  const v = scratch.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
  const w = -v.z;
  v.applyMatrix4(camera.projectionMatrix);
  return { w, u: (v.x + 1) / 2, y: ((1 - v.y) / 2) * 448, ndc: v };
}

/** `MP_TEAM_TAG_CULL_READING`'s frustum half: the head point in front of the eye, within the far plane and the frame. */
function headInView(camera: Camera, head: readonly number[]): boolean {
  const p = project(camera, head[0]!, head[1]!, head[2]!);
  const far = (camera as Camera & { far?: number }).far ?? Infinity;
  return p.w > EYE_W && p.w <= far && Math.abs(p.ndc.x) <= 1 && Math.abs(p.ndc.y) <= 1;
}

/**
 * The tags' points this frame (research 329 §1.2-§1.5): for each body in order, a tag when -- the page has a side
 * (a spectator's word shares no bit with a side's, §1.2), the body is not the page's own (D:L77377), its side is the
 * page's (the team words share a bit, D:L77378), it is no escortee (D:L77379), it is drawn (`MP_TEAM_TAG_CULL_READING`,
 * D:L77376) and alive or dead under 5 s (D:L77377) -- its `head` 3.0 up (D:L77381-77386) projected in front of the eye
 * (w over 0.0001, D:L77388); its text "[tag] name" through `taggedName` for a tag of one character or more (the info box's
 * rule, 0x3e54f8, D:L77394-77398; online, the port's only mode); its alpha 100 alive, 100 - 20 t dead (D:L77427-77433).
 * Every eligible body is kept: the cap of eight counts drawn tags (D:L77357-77358), the layout's.
 */
export function teamTags(i: TeamTagInput): TeamTagsView {
  const self = i.self, points: TeamTagPoint[] = [];
  const own = self?.team ?? null;
  for (const b of i.bodies) {
    if (!self || own === null || b.id === self.id || b.team !== own || b.escortee || !b.head || b.zoneDrawn === false) continue;
    if (b.dead !== null && !(b.dead < FADE.gone)) continue;
    if (!headInView(i.camera, b.head)) continue;
    const p = project(i.camera, b.head[0]!, b.head[1]! + HEAD_RAISE, b.head[2]!);
    if (p.w <= EYE_W) continue;
    const alpha = b.dead === null ? FADE.alive : FADE.alive - FADE.perSecond * b.dead;
    points.push({ id: b.id, text: taggedName(b.clan, botDisplayName(b.name, b.bot === true)), alpha, u: p.u, y: p.y });
  }
  return { points, holder: i.holder, self: self?.id ?? null };
}

/** What `teamTagInput` reads of a page's `NetPage` (structural). */
export interface TeamTagPage {
  client: { id: number; role: string; team: Team | null };
  /** The room's score rows: the seats, each with its clan tag (research 275 §2.1). */
  rows: readonly { id: number; clan?: string; bot?: true }[];
  nameOf(id: number): string;
  isBot?(id: number): boolean;
}
/** What `teamTagInput` reads of the page's `RemotePlayers`. */
export interface TeamTagRemotes {
  headAt(id: number): readonly number[] | null;
  deathAge(id: number): number | null;
  teamOf(id: number): Team | null;
}

/**
 * The page's state as `teamTags`' input, once a frame: the seats of the room's score rows in member id order
 * (`TEAMMATE_ROW_ORDER_READING`, `./matchChat`: the actor list's order unread, research 227 §3), each with its side as the
 * room named it (`RemotePlayers.teamOf`), its drawn death's age and its head (`RemotePlayers.deathAge`, `headAt`), its
 * name (`nameOf`) and its row's clan; a row is a seat, never an escortee (the hostages have no row). The page's own side:
 * a player's team, null for a spectator (as `./hudVoice` `voiceHudFrame`). The talker: `MP_TEAM_TAG_TALKER_ADAPTATION`,
 * VOICE-LATE (B)'s `heardTalker` -- the voice playing, else the floor's holder, never the page (the original: the holder).
 * `drawn`: LATER 415's region gate (`./regionCull` `RegionCull.drawn`), each body's `zoneDrawn`; absent, every zone drawn.
 */
export function teamTagInput(
  page: TeamTagPage, remotes: TeamTagRemotes, camera: Camera, voice: { holder: number | null; playing?: number | null },
  drawn?: (id: number) => boolean,
): TeamTagInput {
  const id = page.client.id;
  const bodies = [...page.rows].sort((a, b) => a.id - b.id).map((r): TeamTagBody => ({
    id: r.id, team: remotes.teamOf(r.id), dead: remotes.deathAge(r.id), escortee: false, head: remotes.headAt(r.id),
    name: page.nameOf(r.id), ...(r.clan ? { clan: r.clan } : {}), ...(drawn ? { zoneDrawn: drawn(r.id) } : {}),
    ...((page.isBot?.(r.id) ?? r.bot === true) ? { bot: true as const } : {}),
  }));
  return {
    self: { id, team: page.client.role === 'player' ? page.client.team : null }, bodies, camera,
    holder: MP_TEAM_TAG_TALKER_ADAPTATION === 'heardTalker' ? heardTalker(voice.holder, voice.playing, id) : voice.holder === id ? null : voice.holder,
  };
}
