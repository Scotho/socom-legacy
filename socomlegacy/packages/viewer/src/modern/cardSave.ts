import {
  Libmc, MC_RESULT, PERSONA_FILE_PATH, PERSONA_SAVE_DIR, UI_VAR_MODULE, clustersFor, personaFileSize, personaFromLogin,
  uiVarKeysOf, withPersona, type CardFailure, type CardSlots, type PersonaCard, type PersonaLogin,
} from '@s2u/card';
import { CARD_PATHS, CardCommands, UiVarManager, ValveStore, type UiCommandHandler } from '@s2u/ui';

/**
 * The modern editors' card-save boundary (MU-F2b; dot's P1). The modern profile (`./profile/cardEdits`) and settings
 * (`./settings/store`) write the save file `BASCUS-97275SOCOMII` through `PersonaCard`, whose writer is the original's
 * `CSaveManager::Save` as libmc sees it: Delete the old file, Open WRONLY|CREAT (an empty file, persisted), then one
 * Write of the enlarged size (`FUN_003a05a0` D:L295406-295412; `PersonaCard.write`). A card with room for the old file
 * but not the enlarged one answers the Write FullDevice (libmc's Write rule, `Libmc.write`) and keeps the empty file:
 * every persona and option lost. The original never meets that card on its own path:
 *
 * - `save_and_leave` asks `IsSpaceForSaveGameFile` before `SaveConfig` (web research 143 §5, "A full card"):
 *   `UIIsSpaceForSaveGameFile` `FUN_0027b3d0` D:L124932-124944 -- the free KB, plus the folder's KB when below 3001,
 *   not below 3000 (`@s2u/ui` `CardCommands.IsSpaceForSaveGameFile`, run here as it is, over this card);
 * - `SaveConfig` releases `SCRATCHPAD.DAT` before it writes (`FUN_003a1c60` D:L296104-296126, the first step of
 *   `UISaveConfig` `FUN_0027b000` D:L124762-124786), so the scratch file's clusters are the save's to take.
 *
 * So a save here runs, before anything on the card changes: the original's space rule; then the libmc Write rule for
 * this file -- the enlarged file's clusters (`clustersFor` of the size `PersonaCard` writes) against the card's free
 * clusters (GetInfo), the old file's (Delete frees them) and, when that is not enough, `SCRATCHPAD.DAT`'s; a folder
 * not yet made takes one (the stub's `mcUsedClusters`, `cardSlots.ts` `usedClusters`). Either refusing, nothing is
 * written and the edit says why. Neither the original's flow (`@s2u/ui`) nor libmc's semantics change.
 *
 * **Staged, then one write (MU-F2d; dot's review of MU-F2b).** The whole save -- the checks, the scratch release, the
 * writer's Delete/Open/Write -- runs over a memory copy of the card (`CardSlots.stage`), and only the result is
 * persisted, as one save of the slot's record taken only if its revision is still the one the copy read
 * (`CARD_SAVE_STAGED_COMMIT_ADAPTATION`). A write the browser's storage refuses writes nothing (the card's atomic-save
 * rule, `cardSlots.ts`), and another tab's save this tab can already read is refused as `changed`, not overwritten.
 * The cross-tab window of web research 99 §7.6 remains: two tabs saving within localStorage's propagation delay can
 * both pass the revision check, and the later write wins.
 */

/** Why a save was refused, in the modern UI's copy ("... not saved: <reason>"). */
export const CARD_SAVE_REFUSED = {
  space: 'the memory card is full',
  storage: 'this browser refused the write',
  card: 'the memory card refused the write',
  /** Another tab saved the card after this edit read it: nothing written, its save kept (`CARD_SAVE_STAGED_COMMIT_ADAPTATION`). */
  changed: 'the memory card changed; try again',
} as const;
export type CardSaveRefusal = keyof typeof CARD_SAVE_REFUSED;
export type CardSaveOutcome = { readonly ok: true } | { readonly ok: false; readonly why: CardSaveRefusal; readonly message: string };

/**
 * MODERN_SAVE_SCRATCH_ADAPTATION: the modern editors release `SCRATCHPAD.DAT` only when the enlarged save needs its
 * clusters, and do not run `SaveConfig`'s later steps (the `SaveGame0..6` dummies, `PATCHFILE.DAT`, the scratch file
 * refilled to `2999 - folder` KB, D:L124775-124786 / `FUN_003a1880`): those are the game's own save path, which runs
 * them at its next `SaveConfig`. A browser adaptation: the modern UI has no screen in the original (MU.R1).
 */
export const MODERN_SAVE_SCRATCH_ADAPTATION = 'SCRATCHPAD.DAT released only when the save needs its clusters; the fillers left to the game\'s SaveConfig' as const;

/**
 * CARD_SAVE_STAGED_COMMIT_ADAPTATION: the modern editors' save runs on a memory copy of the card and is persisted as one
 * write of the slot's record, compare-and-swap on its revision (`CardSlots.stage` / `commit`): a browser quota refusal
 * leaves the stored record byte-identical, and another tab's newer save this tab can already read is refused as
 * `changed`, not overwritten (two tabs saving within localStorage's propagation delay still race, the later write
 * winning: research 99 §7.6). The console has no such refusal past its space rule and no second writer; a browser
 * adaptation that keeps the save the player had. The card's revision moves by one per save, not one per libmc step (no reader counts the steps).
 */
export const CARD_SAVE_STAGED_COMMIT_ADAPTATION = 'the edit staged on a memory copy of the card, persisted as one compare-and-swap write' as const;

/**
 * What an editor stages: over the staged slots it is handed, the `Libmc` its `PersonaCard` was opened over and its port,
 * the file's size the commit writes, and `commit` (the card package's own `save` / `saveLogin`).
 */
export interface StagedSave { readonly mc: Libmc; readonly port: 0 | 1; readonly size: number; readonly commit: () => number }

/** Where the boundary's checks run: the staged card's `Libmc` and port. */
interface CardSaveAt { readonly mc: Libmc; readonly port: 0 | 1 }

const SCRATCH_PATH = `${PERSONA_SAVE_DIR}/${CARD_PATHS.scratch}`;
const refused = (why: CardSaveRefusal): CardSaveOutcome => ({ ok: false, why, message: CARD_SAVE_REFUSED[why] });
const sizeOf = (mc: Libmc, port: 0 | 1, path: string): number | null => {
  const d = mc.getDir(port, 0, path, 1);
  return d.result > 0 ? d.entries[0]!.size : null;
};

/**
 * The original's `IsSpaceForSaveGameFile` over this card: `CardCommands`' own body, its port this card's, with the
 * folder as the current directory (the chain's `Ensure_MC_Dirs` / `MC_ChDir` before it, research 143 §1); a folder not
 * made leaves the root, where the folder's KB is none.
 */
function originalSpaceRule(at: CardSaveAt): boolean {
  at.mc.chdir(at.port, 0, PERSONA_SAVE_DIR);
  const commands = new CardCommands({ valves: () => new ValveStore(), uiVars: new UiVarManager(), card: at.mc, io: () => ({ port: at.port, slot: 0 }) });
  // The body reads no argument of its row (`IsSpaceForSaveGameFile: UiCommandHandler = () => ...`).
  return commands.IsSpaceForSaveGameFile(...([] as unknown as Parameters<UiCommandHandler>));
}

/** The file's nominal size `saveLogin` writes for `login`: its record replacing the same HOST, PORT and NAME, else appended. */
export function loginSaveSize(card: PersonaCard, login: PersonaLogin): number {
  const list = card.personas();
  const probe = personaFromLogin(login);
  const previous = list.find((r) => r.HOST === probe.HOST && r.NAME === probe.NAME && (login.port === undefined || r.PORT === login.port));
  return personaFileSize(withPersona(list, personaFromLogin(login, previous)).length, uiVarKeysOf(card.part(UI_VAR_MODULE)));
}

/** The libmc steps over the staged card: the checks, the scratch release, the commit; `null` when it went through. */
function stagedSave(p: StagedSave): CardSaveOutcome | null {
  const { mc, port, size } = p;
  const info = mc.getInfo(port, 0);
  if (info.result < 0) return refused('card');
  if (!originalSpaceRule(p)) return refused('space');
  const old = sizeOf(mc, port, PERSONA_FILE_PATH);
  const scratch = sizeOf(mc, port, SCRATCH_PATH);
  const folder = mc.chdir(port, 0, PERSONA_SAVE_DIR).result === MC_RESULT.Succeed;
  const need = clustersFor(size) - clustersFor(old ?? 0) + (folder ? 0 : 1);
  const release = need > info.free;
  if (release && (scratch === null || need > info.free + clustersFor(scratch))) return refused('space');
  if (release && mc.delete(port, 0, SCRATCH_PATH) < 0) return refused('card');
  const result = p.commit();
  if (result === MC_RESULT.Succeed) return null;
  return refused(result === MC_RESULT.FullDevice ? 'space' : result === MC_RESULT.DeniedPermit ? 'storage' : 'card');
}

const commitRefusal = (f: CardFailure): CardSaveRefusal => (f.kind === 'changed' ? 'changed' : f.kind === 'write-failed' ? 'storage' : 'card');

/**
 * The boundary: `plan` opens the card over the staged slots it is handed and makes its change in memory (null: nothing
 * to write, and `saveWithinCard` answers null); the save then runs over the staged card only when the original's space
 * rule and the Write rule say it fits, after `SCRATCHPAD.DAT` is released when the fit needs it; and the staged slot's
 * record is persisted once, compare-and-swap (`CARD_SAVE_STAGED_COMMIT_ADAPTATION`). Any refusal writes nothing.
 */
export function saveWithinCard(slots: CardSlots, plan: (staged: CardSlots) => StagedSave | null): CardSaveOutcome | null {
  const stage = slots.stage();
  const p = plan(stage.slots);
  if (p === null) return null;
  const staged = stagedSave(p);
  if (staged) return staged;
  const out = stage.commit(p.port === 0 ? 1 : 2);
  return out.ok ? { ok: true } : refused(commitRefusal(out.failure));
}
