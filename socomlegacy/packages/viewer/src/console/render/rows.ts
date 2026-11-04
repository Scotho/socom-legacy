import { esc, ico, type IconName } from '../icons';

/**
 * LR-1 (the launcher redesign plan, LR.R8): the row kinds of the owner's Claude Design artifact
 * (`docs/specs/launcher-redesign/S2-Launcher-v2.dc.html`, its `rowsFor` builders H, T, S, L, A, G, I, LI, PK and its
 * meter, drop and check rows, drawn by its row template): the panel's vocabulary for LR-2..LR-5's screens. Each row is
 * drawn as the artifact draws it (`../console.css`, "the row kinds") with the native role that lets the keyboard, the
 * mouse and a reader reach it as the pad does (LR.R13); what a row says, and what its press does, is the screen's
 * (CX.R5: the launcher shows what the server and the emulator report, nothing of the artifact's sample data). The click
 * reaches the grammar as every control's does: `data-act` (the screen's act), `data-i` (the row's index), `data-id`. A
 * browser adaptation: the launcher's look, nothing of the game.
 */

/** The artifact's action tones: the primary verb, a verb that cannot run now, a destructive one. */
export type ActionTone = 'primary' | 'muted' | 'danger';
/** The artifact's info tones. */
export type InfoTone = 'good' | 'warn' | 'bad';

interface Labelled { label: string; hint?: string }
export type Row =
  | { kind: 'header'; label: string }
  | ({ kind: 'toggle'; id: string; on: boolean } & Labelled)
  | ({ kind: 'slider'; id: string; value: number; min: number; max: number; step?: number; unit?: string } & Labelled)
  | ({ kind: 'select'; id: string; value: string } & Labelled)
  | ({ kind: 'action'; id: string; tone?: ActionTone } & Labelled)
  | ({ kind: 'link'; id: string; icon?: IconName } & Labelled)
  | { kind: 'info'; label: string; value: string; tone?: InfoTone; hint?: string; ring?: Ring }   // LR-11: a line under the label (Replays' status)
  | ({ kind: 'list'; id: string; value?: string } & Labelled)
  | ({ kind: 'pick'; id: string; group: string; picked: boolean; value?: string; swatch?: readonly [string, string, string]; thumb?: string } & Labelled)
  | { kind: 'meter'; label: string; hint?: string; level: number; threshold?: number }
  | { kind: 'drop'; id: string; label: string; hint: string; progress?: number }
  | { kind: 'check'; id: string; label: string; hint: string; icon: IconName; ok: boolean; progress: number; chip: string; choice?: CheckChoice };

/**
 * Setup onboarding (Trello ZjCZXTTW, the playtest of 2026-11-01): a check row's own choice -- the Disc row's two sources,
 * drawn side by side under its line, the active one on. Each option is a real button (`act`, `data-i` its index), so
 * the row with a choice is a group, as the step rows are (`stepRowHtml`), and its chip a button of the row's act. A
 * browser adaptation: the launcher's setup.
 */
export interface CheckChoice { label: string; act: string; options: readonly { label: string; on: boolean }[] }

/**
 * LR-20 (the LR.R11 side-by-side's P11): the check ring on an info row -- Play's panel's Microphone, optional and never a
 * blocker, drawn with the ring its Disc and Controller rows carry: its mark, how full, and a badge only when there is one
 * to give (on: the check; the browser's refusal: the alert; off: none).
 */
export interface Ring { icon: IconName; progress: number; badge?: 'check' | 'alert' }

/** The meter's bars (the artifact's 24): the first 16 the level's blue, to 21 gold, the last three bad. */
export const METER_BARS = 24;

export interface RowOpts {
  focused: boolean;
  /** The row's index among the screen's rows (the click's `data-i`, the frame's `data-row`). */
  index: number;
  /** The screen's act for a row's click (`../grammar`'s `data-act`). */
  act: string;
  /** LR-10: marks a screen's row carries before the class (its own `data-*`, set verbatim by the screen). */
  attrs?: string;
  /** LR-10: an icon before an action, list or info row's text (a lock or an alert). */
  icon?: IconName;
  /** LR-10: a row whose Cross does nothing, drawn muted (`aria-disabled`); an action row's own tone says it. */
  muted?: boolean;
  /** LR-13 (review F4): a toggle that has just flipped -- the knob's motion plays on it alone, never on a row merely drawn. */
  flipped?: boolean;
  /** LR-10: the old chip's ready tone, as the info rows' good. */
  tone?: 'good';
  /** LR-10 (LR.R13): an info row that carries its act is reachable by Tab and by the frame's focus (`tabindex`, `data-act`, `data-i`). */
  reach?: boolean;
}

const pct = (n: number): string => `${Math.round(Math.max(0, Math.min(1, n)) * 1000) / 10}%`;
/** The check ring (the check row's, and LR-20's info row's): the mark in its well, the progress round it, the badge. */
const ringHtml = (r: Ring): string => `<span class="cx-r__ring" style="--cx-r-pct: ${pct(r.progress)}" aria-hidden="true"><span class="cx-r__ring-in">${ico(r.icon)}</span>${r.badge ? `<span class="cx-r__badge">${ico(r.badge)}</span>` : ''}</span>`;
const text = (r: Labelled): string => `<span class="cx-r__text"><span class="cx-r__label">${esc(r.label)}</span>${r.hint ? `<span class="cx-r__hint">${esc(r.hint)}</span>` : ''}</span>`;
/** A swatch is a token colour as hex: anything else is refused, so no markup or style rides in on it. */
const colour = (c: string): string => { if (!/^#[0-9a-f]{3,8}$/i.test(c)) throw new Error(`not a swatch colour: ${c}`); return c; };

/** One row's markup. */
export function rowHtml(r: Row, o: RowOpts): string {
  const muted = o.muted && r.kind !== 'action';
  const cls = (extra = '') => `cx-r${o.tone ? ` is-${o.tone}` : ''}${muted ? ' is-muted' : ''} cx-r--${r.kind}${o.focused ? ' is-focused' : ''}${extra}`;
  const pre = `${muted ? ' aria-disabled="true"' : ''}${o.attrs ? ` ${o.attrs}` : ''}`;
  const ic = o.icon ? `<span class="cx-r__icon">${ico(o.icon)}</span>` : '';
  const hooks = (id: string) => `data-row="${o.index}" data-act="${esc(o.act)}" data-i="${o.index}" data-id="${esc(id)}"`;
  switch (r.kind) {
    case 'header':
      return `<div${pre} class="${cls(r.label ? '' : ' is-spacer')}" role="heading" aria-level="3" data-row="${o.index}">${esc(r.label)}</div>`;
    case 'toggle':
      return `<button${pre} type="button" class="${cls(`${r.on ? ' is-on' : ''}${o.flipped ? ' is-flipped' : ''}`)}" role="switch" aria-checked="${r.on}" ${hooks(r.id)}>${text(r)}<span class="cx-r__pill" aria-hidden="true"><span class="cx-r__knob"></span></span></button>`;
    case 'slider': {
      const share = r.max > r.min ? (r.value - r.min) / (r.max - r.min) : 0;
      const shown = `${r.value}${r.unit ?? ''}`;
      return `<div${pre} class="${cls()}" role="slider" tabindex="0" aria-label="${esc(r.label)}" aria-valuemin="${r.min}" aria-valuemax="${r.max}" aria-valuenow="${r.value}" aria-valuetext="${esc(shown)}" ${hooks(r.id)}>${text(r)}<span class="cx-r__ctl"><span class="cx-r__track" style="--cx-r-pct: ${pct(share)}" aria-hidden="true"><span class="cx-r__fill"></span><span class="cx-r__thumb"></span></span><span class="cx-r__value">${esc(shown)}</span></span></div>`;
    }
    case 'select':
      return `<button${pre} type="button" class="${cls()}" aria-label="${esc(`${r.label}: ${r.value}`)}" ${hooks(r.id)}>${text(r)}<span class="cx-r__ctl"><span class="cx-r__step" data-d="-1" aria-hidden="true">‹</span><span class="cx-r__choice">${esc(r.value)}</span><span class="cx-r__step" data-d="1" aria-hidden="true">›</span></span></button>`;
    case 'action':
      return `<button${pre} type="button" class="${cls(r.tone ? ` is-${r.tone}` : '')}"${r.tone === 'muted' ? ' aria-disabled="true"' : ''} ${hooks(r.id)}>${ic}${text(r)}<span class="cx-r__arrow" aria-hidden="true">→</span></button>`;
    case 'link':
      return `<button${pre} type="button" class="${cls()}" ${hooks(r.id)}>${r.icon ? `<span class="cx-r__icon">${ico(r.icon)}</span>` : ''}${text(r)}<span class="cx-r__arrow" aria-hidden="true">›</span></button>`;
    case 'info':
      return `<div${pre} class="${cls(`${r.tone ? ` is-${r.tone}` : ''}${r.ring ? ' has-ring' : ''}`)}"${o.reach ? ` tabindex="0" data-act="${esc(o.act)}" data-i="${o.index}"` : ''} data-row="${o.index}">${ic}${r.ring ? ringHtml(r.ring) : ''}${text(r)}<span class="cx-r__value">${esc(r.value)}</span></div>`;
    case 'list':
      return `<button${pre} type="button" class="${cls()}" ${hooks(r.id)}>${ic}${text(r)}${r.value ? `<span class="cx-r__side"><span class="cx-r__value">${esc(r.value)}</span></span>` : ''}</button>`;
    case 'pick': {
      const sw = r.swatch ? `<span class="cx-r__swatches" aria-hidden="true">${r.swatch.map((c) => `<span class="cx-r__swatch" style="background: ${colour(c)}"></span>`).join('')}</span>` : '';
      const pic = r.thumb ? `<span class="cx-r__thumb-pic" aria-hidden="true" style="background-image: url(&quot;${esc(r.thumb).replace(/["()\\]/g, '')}&quot;)"></span>` : '';
      return `<button${pre} type="button" class="${cls(r.picked ? ' is-picked' : '')}" role="radio" aria-checked="${r.picked}" data-group="${esc(r.group)}" ${hooks(r.id)}>${text(r)}<span class="cx-r__side">${sw}${pic}${r.value ? `<span class="cx-r__value">${esc(r.value)}</span>` : ''}<span class="cx-r__mark" aria-hidden="true"></span></span></button>`;
    }
    case 'meter': {
      const lit = Math.round(Math.max(0, Math.min(1, r.level)) * METER_BARS);
      const thr = r.threshold === undefined ? -1 : Math.round(r.threshold * METER_BARS);
      const bars = Array.from({ length: METER_BARS }, (_, i) => `<span class="cx-r__bar ${i < 16 ? 'is-low' : i < 21 ? 'is-mid' : 'is-high'}${i < lit ? ' is-lit' : ''}${i === thr ? ' is-threshold' : ''}"></span>`).join('');
      return `<div${pre} class="${cls()}" role="meter" aria-label="${esc(r.label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(Math.max(0, Math.min(1, r.level)) * 100)}" data-row="${o.index}"><span class="cx-r__meterhead"><span class="cx-r__label">${esc(r.label)}</span>${r.hint ? `<span class="cx-r__value">${esc(r.hint)}</span>` : ''}</span><span class="cx-r__bars" aria-hidden="true">${bars}</span></div>`;
    }
    case 'drop':
      return `<button${pre} type="button" class="${cls(r.progress !== undefined ? ' is-busy' : '')}" ${hooks(r.id)}><span class="cx-r__zone"><span class="cx-r__label">${esc(r.label)}</span><span class="cx-r__hint">${esc(r.hint)}</span>${r.progress !== undefined ? `<span class="cx-r__bar-line" style="--cx-r-pct: ${pct(r.progress)}" aria-hidden="true"></span>` : ''}</span></button>`;
    case 'check': {
      const ring = ringHtml({ icon: r.icon, progress: r.progress, badge: r.ok ? 'check' : 'alert' });
      if (!r.choice) return `<button${pre} type="button" class="${cls(r.ok ? ' is-ok' : '')}" ${hooks(r.id)}>${ring}${text(r)}<span class="cx-r__chip">${esc(r.chip)}</span></button>`;
      const c = r.choice;
      const opts = c.options.map((x, i) => `<button type="button" class="cx-r__opt${x.on ? ' is-on' : ''}" role="radio" aria-checked="${x.on}" data-act="${esc(c.act)}" data-i="${i}">${esc(x.label)}</button>`).join('');
      return `<div${pre} class="${cls(`${r.ok ? ' is-ok' : ''} has-choice`)}" role="group" aria-label="${esc(r.label)}" ${hooks(r.id)}>${ring}<span class="cx-r__main">${text(r)}<span class="cx-r__opts" role="radiogroup" aria-label="${esc(c.label)}">${opts}</span></span><button type="button" class="cx-r__chip" data-act="${esc(o.act)}" data-i="${o.index}">${esc(r.chip)}</button></div>`;
    }
  }
}

export interface RowsOpts {
  /** The focused row's index (-1: none). */
  focus: number;
  act: string;
  /** The list's identity for the frame's patching and scroll (`data-key`). */
  key: string;
  label?: string;
}

/** A screen's rows in one scroll box (`data-scroll`: the frame keeps the pad's row in view, `./frame` keepInView). */
export function rowsHtml(rows: readonly Row[], o: RowsOpts): string {
  return `<div class="cx-rlist" data-scroll data-key="rows-${esc(o.key)}"${o.label ? ` role="group" aria-label="${esc(o.label)}"` : ''}>${rows.map((r, i) => rowHtml(r, { focused: i === o.focus, index: i, act: o.act })).join('')}</div>`;
}

/**
 * LR-4: a roller as the artifact's select row (the select drawing above: the label, the value between its two gold step
 * marks) whose marks stay the pointer's controls (`stepAct`, `data-d`, as the old roller's were): a group, not a button,
 * so its two step buttons are real ones. `./loadouts`' rollers are drawn so too.
 */
export function stepRowHtml(act: string, stepAct: string, i: number, focused: boolean, label: string, value: string, o: { muted?: boolean; about?: string } = {}): string {
  return `<div class="cx-r cx-r--select${o.muted ? ' is-muted' : ''}${focused ? ' is-focused' : ''}" role="group" aria-label="${esc(`${label}: ${value}${o.about ? `, ${o.about}` : ''}`)}"${o.muted ? ' aria-disabled="true"' : ''} tabindex="-1" data-row="${i}" data-act="${esc(act)}" data-i="${i}" data-id="${esc(`${act}-${i}`)}">`
    + `<span class="cx-r__text"><span class="cx-r__label">${esc(label)}</span></span>`
    + `<span class="cx-r__ctl"><button type="button" class="cx-r__step" data-act="${esc(stepAct)}" data-i="${i}" data-d="-1" aria-label="Previous value">‹</button><span class="cx-r__choice">${esc(value)}</span><button type="button" class="cx-r__step" data-act="${esc(stepAct)}" data-i="${i}" data-d="1" aria-label="Next value">›</button></span></div>`;
}
