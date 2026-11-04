/**
 * Actors (FCW-07a), a browser adaptation with no original: the base every creator actor extends -- a layout's team
 * spawns and its NPC seats, each by its stable authored id. FCW-12b builds guard profiles and routes on it; the
 * concrete modes come later (FCW-13). Nothing here plays: the room reads the record's own rows.
 */
import type { CreatorLayoutRecord } from "./layout.js";

export type ActorKind = "spawn" | "npc";

export interface ActorSpecBase {
  /** The row's stable authored id (`CreatorLayoutRecord.ids`). */
  readonly id: string;
  readonly kind: ActorKind;
  /** Game units, one decimal place, as the record's row. */
  readonly at: readonly [number, number, number];
  /** Whole degrees 0..359 about the vertical, as the record's row. */
  readonly yaw: number;
  /** FG-49's editor lock. */
  readonly locked: boolean;
}

/** A team spawn marker (`SpawnRow`). */
export interface SpawnActorSpec extends ActorSpecBase {
  readonly kind: "spawn";
  readonly team: "A" | "B";
}

/** An NPC seat (`NpcRow`): its side and the side's character type on the map (`LoadedMap.types[side]`). */
export interface NpcActorSpec extends ActorSpecBase {
  readonly kind: "npc";
  readonly side: "seal" | "terrorist";
  readonly type: number;
}

export type ActorSpec = SpawnActorSpec | NpcActorSpec;

/** The record's actors, spawns then NPCs in their rows' order. */
export function actorsOfRecord(r: CreatorLayoutRecord): ActorSpec[] {
  const spawns = r.spawns.map(([team, x, y, z, yaw, locked], i): SpawnActorSpec => ({
    id: r.ids.spawns[i]!, kind: "spawn", team, at: [x, y, z], yaw, locked: locked === true,
  }));
  const npcs = (r.npcs ?? []).map(([side, type, x, y, z, yaw, locked], i): NpcActorSpec => ({
    id: r.ids.npcs![i]!, kind: "npc", side, type, at: [x, y, z], yaw, locked: locked === true,
  }));
  return [...spawns, ...npcs];
}
