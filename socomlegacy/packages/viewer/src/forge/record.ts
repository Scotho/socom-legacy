import {
  checkCreatorRecord, type AnyLayoutRecord, type CreatorLayoutRecord, type CheckRecordOptions,
} from '@s2u/creator-contracts';
import { readForgeAuthoring } from './rulesAuthoring';

/**
 * FORGE (the owner, 2026-10-13: "allow map saves to accounts in a simplified data-driven format (instead of new asset
 * files)"; his answer "Compact, yaw-only"; FG.R10). The saved record: what this browser keeps and what an account
 * keeps on the server, one shape for both. A browser adaptation with no original.
 *
 * FCW-07a: the record is v3 (`{schema: "forge-layout", version: 3, ...}`), owned by the creator contracts
 * (`@s2u/creator-contracts` `layout.ts`, the contract `docs/specs/2026-10-25-layout-record-v3.md`): the v2 rows as they
 * were, every row's stable authored id (`ids`), pack content beside the disc's ids (`assets`), the packs it needs
 * (`requires`), a creator mode (`mode`), and a legacy file's unknown objectives members kept inert (`legacyCarry`).
 * `readSaved` reads a v1 file, a v2 record and a v3 record into v3 (`readCreatorRecord`); `recordOfLayout` writes v3;
 * `checkRecord` admits a v2 record (its own check, unchanged) and a v3 record (strict). This module re-exports them
 * beside the page's own helpers (`savedLayoutHasWork`, `autosaveUnreadable`).
 *
 * Nothing of the disc is in it: the ids name the player's own disc's prototypes, a pack's content by its reference.
 * A pure module (no DOM, no three): a server validates a `PUT` with the same check.
 */
export {
  layoutIds, layoutOfRecord, RECORD_LIMITS, RECORD_POSITION_DENOMINATOR, RECORD_SCHEMA, RECORD_VERSION, recordOfLayout, withIds,
} from '@s2u/creator-contracts';
export type {
  CreatorLayoutRecord, LayoutRecordV2, NpcRow, PieceRow, RecordAsset, RecordContentBase, RecordIds, SpawnRow,
} from '@s2u/creator-contracts';

/** A record this build reads: a v2 record (read, migrated) or a v3 record (what `recordOfLayout` writes). */
export type LayoutRecord = AnyLayoutRecord;

/** Null when `r` is a v2 record or a v3 record within its bounds, else the first reason it is not. */
export function checkRecord(r: unknown, options?: CheckRecordOptions): string | null {
  return checkCreatorRecord(r, options);
}

/**
 * True when `text` is a saved layout with a piece, a spawn, an NPC, or a hidden prop (FCW-32: or a mode, or a rules
 * zone, marker or spawner). Anything else is empty.
 */
export function savedLayoutHasWork(text: string): boolean {
  try {
    const record = readSaved(text, 'Autosave');
    return record.pieces.length > 0 || record.spawns.length > 0 || (record.npcs?.length ?? 0) > 0 || (record.hidden?.length ?? 0) > 0
      || record.objectives !== undefined                        // FG-51: a named type or a bomb marker is the author's too
      || record.mode !== undefined || record.zones !== undefined || record.markers !== undefined || record.spawners !== undefined;   // FCW-32
  } catch {
    return false;
  }
}

/**
 * LATER 193: a kept text this build cannot read (a hand edit, a later build's record) -- not work to replace without a
 * word, and not nothing: the page sets it aside (`./saves` `setAsideAutosave`). False for no text and for a readable one.
 */
export function autosaveUnreadable(text: string | null): boolean {
  if (!text) return false;
  try { readSaved(text, 'Autosave'); return false; } catch { return true; }
}

/**
 * A saved text read as a v3 record (`readCreatorRecord`): a v3 record as it is (checked), a v2 record migrated, or a v1
 * layout file (`./layout`) converted and named `name`. Throws with the reason otherwise. Its warnings (legacy members
 * kept inert) and the packs it needs that are not here are `readCreatorRecord`'s; part 2's UI shows them. FCW-32: the
 * authoring envelope of a layout with rules (`./rulesAuthoring` `forgeAuthoringText`) reads as its record, checked with
 * its rules' modes; `readForgeAuthoring` reads the rules too.
 */
export function readSaved(text: string, name: string): CreatorLayoutRecord {
  return readForgeAuthoring(text, name).record;
}
