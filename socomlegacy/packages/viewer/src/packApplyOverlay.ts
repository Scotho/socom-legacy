/**
 * B206 ML-4 (plan 2026-11-06-mods-loader, ML.R10; the owner, ML.R1: "please make a loading screen that applies the
 * packs mid-match (so the user doesn't think they froze)"): the page-level overlay while a texture pack applies.
 */
export const PACK_APPLY_OVERLAY_ADAPTATION =
  'A browser adaptation with no original (ML.R2: product track): "Applying pack... n/N" with the pack\'s name and a bar, full-screen out of live play and a corner strip in live play, while a texture pack applies; it draws over the page and never pauses the simulation (ML.R10).' as const;
/** ML.R10's limit on the worst frame during an apply (the GPU menus' cold-switch limit, GM-13b's row); the aim is 33.4 ms. */
export const PACK_APPLY_FRAME_LIMIT_MS = 50.0;
/** How long a refusal's words stay before the overlay goes (a browser adaptation, no original). */
export const PACK_APPLY_REFUSAL_HOLD_MS_ADAPTATION = 4000;

/** What the overlay draws: n of N textures replaced (`applied` of `total`), the pack's name, done, or refused with why. */
export interface PackApplyProgress {name: string; applied: number; total: number; done: boolean; refused: string | null}

/** The overlay's words: the count once the pack has named a texture here, the refusal's reason on a refusal. */
export function packApplyWords(p: PackApplyProgress): string {
  if (p.refused) return `${p.name}: not applied -- ${p.refused}`;
  return p.total > 0 ? `Applying pack... ${p.applied}/${p.total}` : 'Applying pack...';
}

/**
 * ML-9's F2: the overlay's z-index while the match's loading screen is up -- one over `#original-loading`'s (`styles.css`
 * line 51, z-index 19000), so the strip draws over the loading screen's corner and its art stays visible (a browser
 * adaptation, no original).
 */
export const PACK_APPLY_OVER_LOADING_Z = 19001;
/** ML-9's F1: live play on the test room's and the Forge's pages -- Play on, walking, alive (`./matchMount`'s `packLive`'s form). */
export function pagePlayLive(play: boolean, walking: boolean, dead: boolean): boolean { return play && walking && !dead; }

const ID = 's2u-pack-apply';
const LOADING_ID = 'original-loading';
const STYLE_ID = 's2u-pack-apply-style';
/**
 * The overlay's own rules, put in the document once: every page draws it (the front end's and the Forge's page link
 * none of the test room's `styles.css`). Out of live play a dim full-screen panel; in live play a small strip in the top
 * right corner, over nothing the HUD draws there; never a target for the pointer.
 */
const STYLE = `#${ID}{position:fixed;z-index:2000;pointer-events:none;color:#e8ecef;font:600 14px/1.35 system-ui,sans-serif;text-shadow:0 1px 2px #000}
#${ID}.is-full{inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(0,0,0,.72)}
#${ID}.is-strip{top:8px;right:8px;display:flex;flex-direction:column;gap:4px;padding:6px 10px;min-width:200px;background:rgba(0,0,0,.6);border-radius:4px;font-size:12px}
#${ID} [data-part=name]{opacity:.8}
#${ID} [data-part=bar]{width:min(320px,60vw);height:6px;background:rgba(255,255,255,.18);overflow:hidden}
#${ID}.is-strip [data-part=bar]{width:100%;height:4px}
#${ID} [data-part=fill]{width:0;height:100%;background:#d8b25a}
#${ID}.is-refused [data-part=fill]{background:#c0504d}
#${ID}.is-over-loading{z-index:${PACK_APPLY_OVER_LOADING_Z}}`;
type Later = (f: () => void, ms: number) => unknown;
type Frame = (f: () => void) => unknown;
const pageFrame: Frame = (f) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => f()) : setTimeout(f, 16));

/**
 * One overlay on the page (`#s2u-pack-apply`, `role="status"`): `update` with the apply's progress draws it, N/N
 * (done) or null takes it away, a refusal shows its words for `PACK_APPLY_REFUSAL_HOLD_MS_ADAPTATION` then goes.
 * `live()` -- the player alive in a running match -- picks the corner strip (`is-strip`, never hiding the
 * play) over the full-screen panel (`is-full`); `refresh` reads it again (the page's frame, a death). It reads
 * nothing of the game and calls nothing of it: the simulation runs on as before. A running count is drawn at most once a
 * frame (the first at once, the rest of that frame's on the next): a pack names thousands of textures, each a change.
 */
export class PackApplyOverlay {
  private el: HTMLElement | null = null;
  private refusal = 0;
  private scheduled = false;
  private dirty = false;
  private pending: PackApplyProgress | null = null;
  constructor(private doc: Document, private live: () => boolean = () => false,
    private later: Later = (f, ms) => setTimeout(f, ms), private frame: Frame = pageFrame,
    private visible: () => boolean = () => true) {}
  update(p: PackApplyProgress | null): void {
    this.pending = p;
    if (!p || p.done || p.refused) { this.dirty = false; this.draw(p); return; }
    if (this.scheduled) { this.dirty = true; return; }
    this.draw(p);
    this.scheduled = true;
    this.frame(() => { this.scheduled = false; if (this.dirty) { this.dirty = false; this.update(this.pending); } });
  }
  private draw(p: PackApplyProgress | null): void {
    this.refusal++;
    if (!p || (p.done && !p.refused)) { this.remove(); return; }
    const el = this.element();
    el.querySelector('[data-part=name]')!.textContent = p.name;
    el.querySelector('[data-part=words]')!.textContent = packApplyWords(p);
    const share = p.total > 0 ? Math.min(1, p.applied / p.total) : 0;
    (el.querySelector('[data-part=fill]') as HTMLElement).style.width = `${Math.round(share * 1000) / 10}%`;
    el.classList.toggle('is-refused', !!p.refused);
    this.refresh();
    if (p.refused) { const n = this.refusal; this.later(() => { if (n === this.refusal) this.remove(); }, PACK_APPLY_REFUSAL_HOLD_MS_ADAPTATION); }
  }
  /** The strip in live play or over the loading screen (above it: ML-9's F2), the full-screen panel otherwise. */
  refresh(): void {
    if (!this.el) return;
    let strip = false;
    try { strip = this.live(); } catch { strip = false; }
    const loading = this.doc.getElementById(LOADING_ID), overLoading = !!loading && !loading.hidden;
    strip ||= overLoading;
    this.el.classList.toggle('is-over-loading', overLoading);
    this.el.classList.toggle('is-strip', strip);
    this.el.classList.toggle('is-full', !strip);
    // A prepared match drawn hidden under the menus (`./matchMount`'s IP3) shows no overlay until it is shown.
    let shown = true;
    try { shown = this.visible(); } catch { shown = true; }
    this.el.style.display = shown ? '' : 'none';
  }
  get shown(): boolean { return this.el !== null; }
  dispose(): void { this.refusal++; this.remove(); }
  private remove(): void { this.el?.remove(); this.el = null; }
  private element(): HTMLElement {
    if (this.el) return this.el;
    const d = this.doc, el = d.createElement('div');
    el.id = ID; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    const name = d.createElement('div'); name.dataset.part = 'name';
    const words = d.createElement('div'); words.dataset.part = 'words';
    const bar = d.createElement('div'); bar.dataset.part = 'bar';
    const fill = d.createElement('div'); fill.dataset.part = 'fill'; bar.append(fill);
    el.append(name, words, bar);
    d.getElementById(ID)?.remove();
    if (!d.getElementById(STYLE_ID)) { const st = d.createElement('style'); st.id = STYLE_ID; st.textContent = STYLE; d.head.append(st); }
    d.body.append(el);
    return this.el = el;
  }
}
