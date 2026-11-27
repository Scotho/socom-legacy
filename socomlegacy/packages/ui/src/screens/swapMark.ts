import type { DialogDesign, DialogRecord, ListboxColumn } from '../dialog';
import { uiCommandFold } from '../uiCommands';
import { GAME_LOBBY } from './gameLobbyCommands';

/**
 * SWAP_MARK_ADAPTATION (WM-51 task 3; WM.R21, the owner's team swap queue -- a DEPARTURE from the original on his word,
 * match `gameLobby.ts` `SWAP_QUEUE_OWNER`; research 432). His word: "everyone sees the mark", "an icon beside the
 * player's name in the lobby bottom part itself like a little directional arrow going both ways vertically stacked",
 * "in the original ui", and the button not extended. The original has no queue and no mark: each side list's row is the
 * disc's [name, medal, ready dot, clan tag] (`FUN_002f7020` D:L196331-196496; `B_SEALLIST` and `B_REDLIST`, the ready
 * dot's column the third, `null.tif` / `ping_dot_red.tif` / `ping_dot_green.tif`, `READY_DOT_READING`).
 *
 * What is drawn, and where: a queued seat's row (the server's `gameLobby` seat field `queued`, never a page's belief)
 * has its ready dot's cell drawn as two disc textures stacked -- `arrow_top.tif` over `arrow_botm.tif`, the up and down
 * pair the disc's own ladder screens name so (`IMAGE arrow_up file arrow_top.tif` and `IMAGE arrow_dwn file
 * arrow_botm.tif`: dlgLadderLobby, `tools/test/onlineDialogs.pinned.json` P:L11897-11898; dlgClanLadderLobby,
 * P:L12127-12128; the main menu's `arrow_up` / `arrow_dwn` the same) -- each arrow's own texels
 * (`SWAP_MARK_ARROW_TEXELS`) spanning `SWAP_MARK_ARROW_SIZE_ADAPTATION` (`swapMarkQuad`), centred on the dot's
 * cell, meeting at the dot's middle, at the cell's full colour and alpha (the ladder screens draw them no brighter:
 * their arrows pulse to 0.99, `SWAP_MARK_ARROW_TEXELS`); `arrow_top.tif` points up, `arrow_botm.tif` down (their alpha, the dev-disc read); the dot is not
 * drawn for that row. The dot's cell because a queued seat is never READY (READY ends an ask, match
 * `SWAP_QUEUE_READY_RULED`; READY greys SWITCH TEAMS, research 432 §2) and the row has no free room: a column right of
 * the medal (POSITION 202, 12 wide) would cross the list's box, and after the name a long name collides. No port-made
 * asset; nothing else on the row moves; SWITCH TEAMS is not extended and gains no text.
 *
 * How (the BOTS adaptation's pattern, `./lobbyBots`: the disc's dialog record copied and added to, by a lookup
 * wrapper): `withSwapMark` gives each side list two more IMAGE columns at the dot column's own POSITION (`arrow_top.tif`,
 * `arrow_botm.tif`, each with the dot column's blank as its 0) and extends the dot column's TEXTURES by three blanks, so
 * a queued row's dot index shifted by `SWAP_MARK_DOT_SHIFT` draws no dot; on a design without the wrapper (the columns'
 * modulo, `ListboxWidget.itemOf`) the shifted index draws the very dot it draws today and the two added cells are not
 * drawn (no column for them). A row with no ask carries the disc's four cells only, on either design. A browser adaptation of the ruling; it changes nothing the room does.
 */
export const SWAP_MARK_ADAPTATION = 'WM.R21: a queued seat\'s ready-dot cell drawn as the dialog\'s arrow_top.tif over arrow_botm.tif, the dot not drawn' as const;

/** The two side lists of `dlgGameLobby.rdr` (`FUN_002f7020`'s SEALS and TERRORISTS). */
export const SWAP_MARK_LISTS = ['B_SEALLIST', 'B_REDLIST'] as const;
/** The disc's own textures the mark draws: the ladder screens' `arrow_up` and `arrow_dwn` (P:L11897-11898, P:L12127-12128). */
export const SWAP_MARK_TEXTURES = { up: 'arrow_top.tif', down: 'arrow_botm.tif' } as const;
/**
 * Each arrow's drawn size, width and height (the port's, `SWAP_MARK_ADAPTATION`; the controller's ruling of 2026-11-15 after
 * the first pictures: 8 x 7 read too faint beside the dots): 12 x 8, centred on the ready dot's cell, the two stacked
 * 12 x 16 in the row's 18 (SPACING), clear of the clan tag (column POSITION 14).
 */
export const SWAP_MARK_ARROW_SIZE_ADAPTATION = [12, 8] as const;
/**
 * SWAP_MARK_TEXTURE_SIZE: `arrow_top.tif` and `arrow_botm.tif` are each 16 x 16 texels (the disc's UI2D / UIBF
 * libraries read by viewer `readMenuArt` over SOCOM_DISC, 2026-11-15; pinned by viewer `test/swapMarkTexels.test.ts`).
 * The mark is a browser adaptation (product track, research 432's header: no ledger entry), so this and
 * `SWAP_MARK_ARROW_TEXELS` -- a disc asset's geometry the adaptation is laid out by, not a game value -- carry no
 * `_READING` suffix; the dev-disc test holds both.
 */
export const SWAP_MARK_TEXTURE_SIZE = [16, 16] as const;
/**
 * SWAP_MARK_ARROW_TEXELS: where each texture's arrow lies in its 16 x 16 -- x, y, width, height in texels: columns
 * 3-12, rows 5-10, every other texel's alpha 0 (the same read and test). The rest of the texture is transparent margin,
 * so the texture drawn whole at 12 x 8 drew its arrow at about 7 x 3 pixels, filtered pale (the controller's look at job
 * D's pictures, 2026-11-15: "far too faint"). The dialogs that name these textures (dlgLadderLobby P:L11897-11898,
 * dlgClanLadderLobby P:L12127-12128, the online pin set's only two) draw them no brighter than the cell does: their
 * PulseArrows take each arrow's OPACITY 0.2 -> 0.99 (P:L12019-12024, P:L12182-12187), and a list's IMAGE cell already
 * draws at the full 128 grey, 128 alpha (`newSprite`, `ListboxWidget.itemOf`). Those widgets' own colour is not in the
 * pinned set, and dialogs outside it were not searched.
 */
export const SWAP_MARK_ARROW_TEXELS = [3, 5, 10, 6] as const;
/** The disc's ready-dot column: the side list's third (`READY_DOT_READING`). */
export const SWAP_MARK_DOT_COLUMN = 2;
/** The disc's side list's column count: name, medal, ready dot, clan tag. */
export const SWAP_MARK_DISC_COLUMNS = 4;
/** The disc's ready-dot TEXTURES count; a queued row's dot index is shifted by it (drawn blank on the marked design). */
export const SWAP_MARK_DOT_SHIFT = 3;

/**
 * A row's cells past the disc's four: a queued seat's two (each added column's 1, its arrow); none for any other row, so
 * a row with no ask is the disc's own four cells on either design (`ListboxWidget.itemOf` draws a cell per element, up to
 * the column count).
 */
export function swapMarkCells(queued: boolean): number[] { return queued ? [1, 1] : []; }

/**
 * Each arrow's quad: the whole 16 x 16 texture scaled so the arrow's texels (`SWAP_MARK_ARROW_TEXELS`) span
 * `SWAP_MARK_ARROW_SIZE_ADAPTATION` (19 x 21), and how far it starts up and left of the arrow's own corner (4, 7) -- the
 * transparent margin, which draws nothing. Rounded to whole pixels as the list's cells are.
 */
export function swapMarkQuad(): { w: number; h: number; dx: number; dy: number } {
  const [w, h] = SWAP_MARK_ARROW_SIZE_ADAPTATION;
  const [tw, th] = SWAP_MARK_TEXTURE_SIZE;
  const [ax, ay, aw, ah] = SWAP_MARK_ARROW_TEXELS;
  const qw = Math.round(tw * w / aw), qh = Math.round(th * h / ah);
  return { w: qw, h: qh, dx: Math.round(ax * qw / tw), dy: Math.round(ay * qh / th) };
}

/** The side list with the mark's columns, or the record unchanged when it is not the disc's four-column list. */
function marked(record: DialogRecord): DialogRecord {
  if (!(SWAP_MARK_LISTS as readonly string[]).includes(record.name) || record.widget.type !== 'LISTBOX') return record;
  const columns = record.widget.columns;
  const dot = columns[SWAP_MARK_DOT_COLUMN];
  if (columns.length !== SWAP_MARK_DISC_COLUMNS || !dot || dot.kind !== 0 || !Array.isArray(dot.textures)) return record;
  const textures = dot.textures.filter((t): t is string => typeof t === 'string');
  if (textures.length !== SWAP_MARK_DOT_SHIFT || dot.textures.length !== SWAP_MARK_DOT_SHIFT) return record;
  const blank = textures[0]!;
  const middle = dot.topOffset + Math.trunc(dot.size[1] / 2);
  const [w, h] = SWAP_MARK_ARROW_SIZE_ADAPTATION;
  const q = swapMarkQuad();
  const position = dot.position - Math.trunc((w - dot.size[0]) / 2);   // the arrow's own left edge, centred on the dot's cell
  // Each texture drawn whole, its own pixels unchanged, scaled so its arrow's texels span w x h at (position, top).
  const arrow = (texture: string, top: number): ListboxColumn => ({ ...dot, position: position - q.dx, topOffset: top - q.dy, size: [q.w, q.h], textures: [blank, texture] });
  return {
    ...record,
    widget: {
      ...record.widget,
      columns: [
        ...columns.slice(0, SWAP_MARK_DOT_COLUMN), { ...dot, textures: [...textures, blank, blank, blank] }, ...columns.slice(SWAP_MARK_DOT_COLUMN + 1),
        arrow(SWAP_MARK_TEXTURES.up, middle - h), arrow(SWAP_MARK_TEXTURES.down, middle),
      ],
    },
  };
}

/** The original dialog lookup with the mark's columns on GAME LOBBY's two side lists; every other dialog unchanged; idempotent. */
export function withSwapMark(lookup: (name: string) => DialogDesign | null): (name: string) => DialogDesign | null {
  return (name) => {
    const d = lookup(name);
    if (!d || uiCommandFold(name) !== uiCommandFold(GAME_LOBBY)) return d;
    return { ...d, controls: d.controls.map(marked), objects: d.objects.map(marked) };
  };
}
