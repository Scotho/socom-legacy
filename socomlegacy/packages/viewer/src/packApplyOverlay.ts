import { packApplyChipWords, type PackApplyChip, type PackApplyKind } from './packApplyChip';
/**
 * B206 ML-4 (plan 2026-11-06-mods-loader, ML.R10; the owner, ML.R1: "please make a loading screen that applies the
 * packs mid-match (so the user doesn't think they froze)"): the page-level overlay while a texture pack applies.
 * WM-PACKS-CHIP (the owner's 8B, "texture pack chip without size warning"): it is the loading chip everywhere.
 */
export const PACK_APPLY_OVERLAY_ADAPTATION =
  'A browser adaptation with no original (ML.R2: product track; WM-PACKS-CHIP, the owner\'s 8B): a corner chip -- "LOADING HD TEXTURES" (a GX per-map pack: "LOADING TEXTURES"), the count "n of N" and a thin bar -- in the page\'s top right corner while a texture pack applies, never full-screen and never a pointer target, so the menu or the map behind stays usable; in live play of a match whose HUD draws the chip (`./packApplyChip`) the page draws none; it never pauses the simulation (ML.R10).' as const;
/** ML.R10's limit on the worst frame during an apply (the GPU menus' cold-switch limit, GM-13b's row); the aim is 33.4 ms. */
export const PACK_APPLY_FRAME_LIMIT_MS = 50.0;
/** How long a refusal's words stay before the overlay goes (a browser adaptation, no original). */
export const PACK_APPLY_REFUSAL_HOLD_MS_ADAPTATION = 4000;

/** What the overlay draws: n of N textures replaced (`applied` of `total`), the pack's name, done, or refused with why. */
export interface PackApplyProgress {name: string; applied: number; total: number; done: boolean; refused: string | null}

/**
 * The overlay's words before WM-PACKS-CHIP: the count once the pack has named a texture here, the refusal's reason on a
 * refusal. The chip (`./packApplyChip` `packApplyChipWords`) says a refusal in these words and its count as "n of N";
 * the count's form here is no longer drawn -- the modding wiki still quotes it and `tools/test/moddingWikiPages.test.ts`
 * pins it, both outside WM-PACKS-CHIP's claim (owed to the wiki's owner).
 */
export function packApplyWords(p: PackApplyProgress): string {
  if (p.refused) return `${p.name}: not applied -- ${p.refused}`;
  return p.total > 0 ? `Applying pack... ${p.applied}/${p.total}` : 'Applying pack...';
}

/**
 * ML-9's F2: the overlay's z-index while the match's loading screen is up -- one over `#original-loading`'s (`styles.css`
 * line 51, z-index 19000), so the chip draws over the loading screen's corner and its art stays visible (a browser
 * adaptation, no original).
 */
export const PACK_APPLY_OVER_LOADING_Z = 19001;
/** ML-9's F1: live play on the test room's and the Forge's pages -- Play on, walking, alive (`./matchMount`'s former `packLive`'s form). */
export function pagePlayLive(play: boolean, walking: boolean, dead: boolean): boolean { return play && walking && !dead; }
/**
 * WM-PACKS-CHIP review F2: a match's HUD is up this frame -- `./hud` `Hud.render`'s own gate (it draws while on, or with
 * a spectator's view set): on is `./matchMount`'s `hud.setVisible(walking && spawned)`, the view its
 * `hud.setSpectator(spectatorHudView(...))` (a spectator, a dead seat watching). So a dead, spectating or held
 * (`blocked`) seat in a shown match has the HUD's chip, not the page's. `./matchMount` passes it as its overlay's live test.
 */
export function matchHudUp(on: boolean, spectating: boolean): boolean { return on || spectating; }

const ID = 's2u-pack-apply';
const LOADING_ID = 'original-loading';
const STYLE_ID = 's2u-pack-apply-style';
/**
 * The overlay's own rules, put in the document once: every page draws it (the front end's and the Forge's page link
 * none of the test room's `styles.css`). WM-PACKS-CHIP: the 8B chip in the top right corner everywhere -- the title, the
 * count, a thin bar -- in the HUD chip's colours (the START confirm's frame and inside, the START title's gold, the
 * scoreboard's row grey, the START bar's peak and the scoreboard's header green); never full-screen; never a target
 * for the pointer.
 */
const STYLE = `#${ID}{position:fixed;z-index:2000;pointer-events:none;top:8px;right:8px;display:flex;flex-direction:column;gap:3px;min-width:190px;padding:7px 10px 8px;background:rgba(11,21,24,.78);border:2px solid rgba(35,51,56,.62);border-radius:2px;font:600 12px/1.25 system-ui,sans-serif;letter-spacing:.04em;text-shadow:1px 1px 0 rgba(0,0,0,.75)}
#${ID} [data-part=words]{color:#ffffc0;opacity:.86}
#${ID} [data-part=count]{color:#e6e6e6;opacity:.86}
#${ID} [data-part=bar]{width:100%;height:3px;margin-top:2px;background:rgb(52,76,84);overflow:hidden}
#${ID} [data-part=fill]{width:0;height:100%;background:rgb(64,128,64)}
#${ID}.is-over-loading{z-index:${PACK_APPLY_OVER_LOADING_Z}}`;
type Later = (f: () => void, ms: number) => unknown;
type Frame = (f: () => void) => unknown;
const pageFrame: Frame = (f) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => f()) : setTimeout(f, 16));

/**
 * One overlay on the page (`#s2u-pack-apply`, `role="status"`, class `is-chip`): `update` with the apply's progress
 * (and which pack, `kind`: the HD pack's words say HD) draws the chip, N/N (done) or null takes it away, a refusal shows
 * its words for `PACK_APPLY_REFUSAL_HOLD_MS_ADAPTATION` then goes. `hudDraws`: the page's match HUD draws the chip
 * (`./packApplyChip`, fed by `hudChip`) -- then in live play (`live()`) and off the loading screen the DOM chip is not
 * shown, so the chip is never drawn twice; `refresh` reads both again (the page's frame, a death). It reads nothing of
 * the game and calls nothing of it: the simulation runs on as before. A running count is drawn at most once a frame (the
 * first at once, the rest of that frame's on the next): a pack names thousands of textures, each a change.
 */
export class PackApplyOverlay {
  private el: HTMLElement | null = null;
  private refusal = 0;
  private scheduled = false;
  private dirty = false;
  private pending: PackApplyProgress | null = null;
  private pendingKind: PackApplyKind = 'gx';
  private drawn: PackApplyChip | null = null;
  constructor(private doc: Document, private live: () => boolean = () => false,
    private later: Later = (f, ms) => setTimeout(f, ms), private frame: Frame = pageFrame,
    private visible: () => boolean = () => true, private hudDraws = false) {}
  update(p: PackApplyProgress | null, kind: PackApplyKind = 'gx'): void {
    this.pending = p; this.pendingKind = kind;
    if (!p || p.done || p.refused) { this.dirty = false; this.draw(p, kind); return; }
    if (this.scheduled) { this.dirty = true; return; }
    this.draw(p, kind);
    this.scheduled = true;
    this.frame(() => { this.scheduled = false; if (this.dirty) { this.dirty = false; this.update(this.pending, this.pendingKind); } });
  }
  private draw(p: PackApplyProgress | null, kind: PackApplyKind): void {
    this.refusal++;
    if (!p || (p.done && !p.refused)) { this.remove(); return; }
    const el = this.element(), words = packApplyChipWords(p, kind);
    this.drawn = { progress: p, kind };
    el.querySelector('[data-part=words]')!.textContent = words.title;
    el.querySelector('[data-part=count]')!.textContent = words.line;
    const share = !p.refused && p.total > 0 ? Math.min(1, p.applied / p.total) : 0;
    (el.querySelector('[data-part=fill]') as HTMLElement).style.width = `${Math.round(share * 1000) / 10}%`;
    el.classList.toggle('is-refused', !!p.refused);
    this.refresh();
    if (p.refused) { const n = this.refusal; this.later(() => { if (n === this.refusal) this.remove(); }, PACK_APPLY_REFUSAL_HOLD_MS_ADAPTATION); }
  }
  /**
   * The HUD draws the chip now: its page's HUD draws one, `live()` (the test room's: live play, `pagePlayLive`; the
   * match's: its HUD is up, `matchHudUp`), off the loading screen, its match shown.
   */
  private inHud(): boolean {
    if (!this.hudDraws) return false;
    let live = false;
    try { live = this.live(); } catch { live = false; }
    return live && !this.overLoading() && this.matchShown();
  }
  private overLoading(): boolean { const l = this.doc.getElementById(LOADING_ID); return !!l && !l.hidden; }
  private matchShown(): boolean { try { return this.visible(); } catch { return true; } }
  /** The chip over the loading screen (above it: ML-9's F2); hidden while the HUD draws it or its match is hidden. */
  refresh(): void {
    if (!this.el) return;
    this.el.classList.toggle('is-over-loading', this.overLoading());
    // A prepared match drawn hidden under the menus (`./matchMount`'s IP3) shows no chip until it is shown.
    this.el.style.display = this.matchShown() && !this.inHud() ? '' : 'none';
  }
  /** What the HUD's chip draws (`./packApplyChip` `feedPackApplyChip`): the chip shown, while the HUD draws it; else null. */
  hudChip(): PackApplyChip | null { return this.el && this.drawn && this.inHud() ? this.drawn : null; }
  get shown(): boolean { return this.el !== null; }
  dispose(): void { this.refusal++; this.remove(); }
  private remove(): void { this.el?.remove(); this.el = null; this.drawn = null; }
  private element(): HTMLElement {
    if (this.el) return this.el;
    const d = this.doc, el = d.createElement('div');
    el.id = ID; el.className = 'is-chip'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    const words = d.createElement('div'); words.dataset.part = 'words';
    const count = d.createElement('div'); count.dataset.part = 'count';
    const bar = d.createElement('div'); bar.dataset.part = 'bar';
    const fill = d.createElement('div'); fill.dataset.part = 'fill'; bar.append(fill);
    el.append(words, count, bar);
    d.getElementById(ID)?.remove();
    if (!d.getElementById(STYLE_ID)) { const st = d.createElement('style'); st.id = STYLE_ID; st.textContent = STYLE; d.head.append(st); }
    d.body.append(el);
    return this.el = el;
  }
}
