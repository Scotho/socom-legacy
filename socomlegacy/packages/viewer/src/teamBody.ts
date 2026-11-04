import type { MotionClip, Skeleton } from '@s2u/scene';
import type { LoadedBody } from './body';
import type { Stance } from './mover';
import type { Team } from './net/protocol';
import { bodySkeleton } from './play';
import { ESCORTEE_IDLE_CLIPS, IDLE_CLIPS } from './simMap';

/**
 * A player's body by side (2026-09-30, the owner's play test of e373be70: the page's own Terrorist wore the SEAL) and,
 * since web sprint 5 S2, by character type (research 95 §6, W5.R2: each ARMORY column its own body). The map carries
 * `body`, its SEAL 1 (`loadBody` with 'navyseals', MP2's `seal_A_scuba`), `terrorist`, its TERRORIST 1 (web sprint 3
 * M5), and `types`, each side's four (`./loadMap`) -- as the room reads each type's hit capsules (`./simMap`
 * `simSkeletonsFromBytes`, `Room.volumesOf`). With no type chosen a player is SEAL 1 / TERRORIST 1 (R95.5). The remote
 * players (`./remotePlayers`) and the page's own body both take it here.
 */

/**
 * A map's bodies as the page holds them (`LoadedMap`'s `body`, `terrorist` and `types`). HX-2 (web sprint 31; research
 * 238 §1): `types.escortees`, the third family -- the map's hostages, `chartype.rdr`'s `escortees` in order (MP6's
 * `mp_fem1-3`), absent or empty on a map with none.
 */
export interface MapBodies {
  body?: LoadedBody | null;
  terrorist?: LoadedBody | null;
  types?: { seal: readonly (LoadedBody | null)[]; terrorist: readonly (LoadedBody | null)[]; escortees?: readonly (LoadedBody | null)[] };
}

/**
 * The body of a player of `team` and character type `type` (0, SEAL 1 / TERRORIST 1, by default): the type's when the
 * map decoded it, else the side's first -- the Terrorist's when the map has one (else the SEAL's), the SEAL's for a SEAL
 * and for no side.
 */
export function bodyForTeam(map: MapBodies | null | undefined, team: Team | null, type = 0): LoadedBody | null {
  if (!map) return null;
  const typed = team ? map.types?.[team][type] : undefined;
  if (typed) return typed;
  return (team === 'terrorist' ? (map.terrorist ?? map.body) : map.body) ?? null;
}

/**
 * HX-2: a hostage's body -- the map's `index`-th escortee, or the one whose `character.rdr` character is `which` (the
 * room names a hostage by its character, HX-1's welcome list) -- or null: a hostage is never drawn as a side's body.
 */
export function escorteeBody(map: MapBodies | null | undefined, which: number | string): LoadedBody | null {
  const list = map?.types?.escortees ?? [];
  const i = typeof which === 'number' ? which : list.findIndex((b) => b?.character === which);
  return (i >= 0 ? list[i] : null) ?? null;
}

/** What the page does to put a body on its player (`./main`'s scene, `Play.setBody`, the kit's hang). */
export interface OwnBodyOps<V> {
  build(body: LoadedBody): V;
  dispose(view: V): void;
  /** `Play.setBody` (and the scene's add): the play mode's body and skeleton -- the walk, the death clips, the shadow. */
  attach(view: V | null, body: LoadedBody | null): void;
  /** The kit hung afresh on the new body (`hangKit(true)`). */
  hang(): void;
}

/**
 * The page's own body, following its side: `follow(want)` rebuilds only when the wanted body differs from the one on
 * the player -- the old view disposed, the new one built and attached, the kit re-hung. Returns whether it changed.
 */
export class OwnBody<V> {
  private loaded_: LoadedBody | null = null;
  private view_: V | null = null;

  constructor(private readonly ops: OwnBodyOps<V>) {}

  loaded(): LoadedBody | null { return this.loaded_; }
  view(): V | null { return this.view_; }

  /** A new map: whatever was on the player goes, and `want` is put on (the kit is the map's to hang). */
  reset(want: LoadedBody | null): void {
    this.drop();
    this.put(want);
  }

  follow(want: LoadedBody | null): boolean {
    if (want === this.loaded_) return false;
    this.drop();
    this.put(want);
    this.ops.hang();
    return true;
  }

  private drop(): void {
    if (this.view_ !== null) this.ops.dispose(this.view_);
    this.view_ = null;
    this.loaded_ = null;
  }

  private put(want: LoadedBody | null): void {
    this.loaded_ = want;
    this.view_ = want ? this.ops.build(want) : null;
    this.ops.attach(this.view_, want);
  }
}

/** A side's hit body for the room (`@s2u/match` `Room` `HitBody`): a skeleton and its three stance idles. */
export interface HitBodyOfPage { skeleton: Skeleton; idles: Record<Stance, MotionClip | null> }

/**
 * The in-page room's hit bodies (`./net/loopback`), from the page's own bodies and clips -- each side's types, as the
 * server reads them (`./simMap` `simSkeletonsFromBytes`), so the loopback's players are hit on their own type's
 * capsules. A list per side, `types` order (the side's first alone when the map has no `types`); a type without a body is
 * null (the room gives it its side's first's), a side without any is empty (the SEAL's, or the placeholder). A body
 * shared by two types is one hit body.
 */
export function hitBodiesOfPage(map: MapBodies, clips: { clips: readonly MotionClip[] } | null):
  { seal: (HitBodyOfPage | null)[]; terrorist: (HitBodyOfPage | null)[]; escortees: (HitBodyOfPage | null)[] } {
  const idle = (name: string | null): MotionClip | null => (name === null ? null : clips?.clips.find((c) => c.name === name) ?? null);
  const idles = { stand: idle(IDLE_CLIPS.stand), crouch: idle(IDLE_CLIPS.crouch), prone: idle(IDLE_CLIPS.prone) };
  // HX-2: the hostages at the No_weapon set's idles, as the server's `TypeSkeletons.escortees` (no prone: the bind pose)
  const civ = { stand: idle(ESCORTEE_IDLE_CLIPS.stand), crouch: idle(ESCORTEE_IDLE_CLIPS.crouch), prone: idle(ESCORTEE_IDLE_CLIPS.prone) };
  const made = new Map<LoadedBody, HitBodyOfPage>();
  const of = (b: LoadedBody | null | undefined, at = idles): HitBodyOfPage | null => {
    if (!b) return null;
    let h = made.get(b);
    if (!h) { h = { skeleton: bodySkeleton(b), idles: at }; made.set(b, h); }
    return h;
  };
  const side = (types: readonly (LoadedBody | null)[] | undefined, first: LoadedBody | null | undefined): (HitBodyOfPage | null)[] =>
    (types?.length ? types : first ? [first] : []).map((b) => of(b));
  return {
    seal: side(map.types?.seal, map.body), terrorist: side(map.types?.terrorist, map.terrorist),
    escortees: (map.types?.escortees ?? []).map((b) => of(b, civ)),
  };
}
