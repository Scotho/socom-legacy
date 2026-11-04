import type { PadButton } from './gamepad';
import { TAUNT_DELAY_SECONDS, type TauntChoice } from './taunts';
/** ISO ELF 235bdc,235c78; 235ff8/236088;232240. Readings, research301. */
export const CHAT_HOLD_SECONDS = .3;
export const CHAT_REPEAT_SECONDS = .2;
/**
 * The root rows `FUN_00232bc0` builds for a player, literals of the game's ELF, by root id (the page's numbering: 0-4 as
 * before, SPECTATORS 5); `ROOT_HELP` their help lines (S:0x3e5f00, 0x3e60a0, 0x3e5dd8, 0x3e6250, 0x3e6460, 0x3e63f0).
 */
export const ROOTS = ['TACTICAL ORDERS', 'TAUNTS', 'RADIO', 'TEAMMATES', 'MESSAGES', 'SPECTATORS'] as const;
export const ROOT_HELP: readonly string[] = [
  'Issue tactical orders to your allies', 'Taunt your enemies', 'Use the radio', 'Teammate controls', 'Send custom text messages', 'Spectator controls',
];
/** SVC-23f: the SPECTATORS root (S:0x3e63e0, D:L83632), its one row VOTE ALL (`./spectatorVote`). */
export const SPECTATORS_ROOT = 5;
/** The roots in the tree's order (D:L83586-83634): TACTICAL ORDERS, TAUNTS, RADIO, TEAMMATES, SPECTATORS, MESSAGES. */
export const ROOT_ORDER: readonly number[] = [0, 1, 2, 3, SPECTATORS_ROOT, 4];
/**
 * AD-11 (web sprint 40, C47; research 227 §2.10): an online spectator's tree, RADIO alone -- `FUN_001fa360` builds tree 2
 * for the page a spectator online (D:L57441-57444) and `FUN_00232bc0`'s branch 2 makes RADIO > RADIO ONOFF only
 * (D:L83641-83645). (D:L57445-57446 force tree 1 while `DAT_00408e50` is set; nothing in the decompilation writes it, and
 * the ELF holds it in the BSS: research 227 §2.10.)
 */
export const SPECTATOR_ROOT_ORDER: readonly number[] = [2];
/** The TAUNTS root (its rows are the menu's own: CHARACTER TAUNT and the five). */
const TAUNTS_ROOT = 1;
/** The TEAMMATES root. */
const TEAMMATES_ROOT = 3;
/**
 * AD-10 (web sprint 40, C86; research 227 §2.9): the page's role as the roots' enable callbacks read it -- a living
 * actor (`+0xe1` bit 4) and an online spectator (`FUN_002c2fa0`). The page's menu is the online round's only.
 */
export interface ChatRole { alive: boolean; spectator: boolean }
/** A living player's role: what a menu given no `role` reads (its roots as before AD-10). */
const LIVING: ChatRole = { alive: true, spectator: false };
/**
 * CHAT_COMMAND_GROUP_READING: TACTICAL ORDERS' and MESSAGES' enable (`FUN_002301e0` D:L81879-81883) asks, besides a
 * living actor, that the command group 0x1f exists (`FUN_005ef2f0` D:L502133-502147, the list at `DAT_0044d5b8` by its
 * `+0x58`); who makes that group online is not read, so the page takes it present for every seat, as it did before
 * AD-10 for the living. [reading]
 */
export const CHAT_COMMAND_GROUP_READING = 'present' as const;
/**
 * Each root's enable callback as `FUN_002344e0` binds it (`FUN_002306e0(tree, label, action, arg, enable, arg)`), by
 * root id: TACTICAL ORDERS (D:L83766) and MESSAGES (D:L83781) `FUN_002301e0` with the group 0x1f, 'command'; TAUNTS
 * (D:L83774) and RADIO (D:L83787) `FUN_0022f810`, 'actor'; TEAMMATES (D:L83793) and SPECTATORS (D:L83794) none, null --
 * drawn by their rows alone. (NODEACTION ROOT, D:L83757, `FUN_0022f810` too, is not in the port: research 227 §2.9.)
 */
const ROOT_ENABLE: readonly ('command' | 'actor' | null)[] = ['command', 'actor', 'actor', null, 'command', null];
/**
 * Whether a root's enable callback enables it for `role` (`FUN_00231a30` D:L82546-82556 calls it with the page's actor,
 * `FUN_002b3580`): 'actor' is `FUN_0022f810` (D:L81519-81527: a living actor, else an online spectator); 'command' is
 * `FUN_002301e0` (D:L81879-81883: the group and a living actor); a root with none is enabled.
 */
export function rootEnabled(root: number, role: ChatRole): boolean {
  const enable = ROOT_ENABLE[root] ?? null;
  if (enable === 'actor') return role.alive || role.spectator;
  if (enable === 'command') return role.alive && CHAT_COMMAND_GROUP_READING === 'present';
  return true;
}
/**
 * A row of another root (`./matchChat`, research 302 §3): its label and help line; a submenu (`children`), a send
 * (`action`, once a node per `TAUNT_DELAY_SECONDS`, keyed by `key`), or a parked row (`unsupported`: nothing happens).
 */
export interface ChatEntry { label: string; help: string; children?: ChatEntry[]; action?: () => void; unsupported?: string; key?: string }
export interface TauntMenuDeps {
  send(choice: TauntChoice): void; custom(): readonly string[]; sound(name: string): void; unsupported(name: string): void;
  /** The rows of a root other than TAUNTS; none (or absent) leaves that root parked. */
  entries?(root: number): ChatEntry[];
  /**
   * The preset's TeamCommand button (action 11, research 197 §2; Goldeneye's is Square, `../voice/talkInput`); read
   * each frame. Absent, Circle (the Default preset's).
   */
  teamCommand?: PadButton;
  /** AD-10: the page's role, read for the roots drawn (`rootEnabled`); absent, a living player's. */
  role?(): ChatRole;
}
/** A column of another root's rows as drawn (`./tauntLayout`). */
export interface ChatColumn { rows: { label: string; help: string; arrow: boolean }[]; selected: number }
/** Original TCM navigation (research 301 §3, 302 §3): TAUNTS' rows, the other roots' from `entries`. */
export class TauntMenu {
  private open = false;
  private depth = 0;
  private root = 0;
  private row = 0;
  private last = new Set<PadButton>();
  private circleAt: number | null = null;
  private voiceHeld = false;
  private nextRepeat = 0;
  private reopenAt = 0;
  private nextSend = Array<number>(6).fill(0);
  /** Another root's open columns, and the row each parent column left selected. */
  private branch: ChatEntry[][] = [];
  private parents: number[] = [];
  private branchSend = new Map<string, number>();
  /** AD-10: opened with the cursor on a root not drawn (a dead player's empty TEAMMATES): closed on the next frame. */
  private openedHidden = false;
  constructor(private readonly deps: TauntMenuDeps) {}
  isOpen(): boolean { return this.open; }
  state(): { open: boolean; root: number; row: number; depth: number; nextSend: number; cooldowns: number[]; voiceHeld: boolean; columns: ChatColumn[]; roots: number[] } {
    const columns = this.root === TAUNTS_ROOT ? [] : this.branch.map((rows, i) => ({
      rows: rows.map((r) => ({ label: r.label, help: r.help, arrow: !!r.children })), selected: this.parents[i] ?? this.row,
    }));
    return { open: this.open, root: this.root, row: this.row, depth: this.depth, nextSend: this.nextSend[this.row]!, cooldowns: [...this.nextSend], voiceHeld: this.voiceHeld, columns, roots: this.roots() };
  }
  /**
   * The roots drawn, in the tree's order (a disabled node is not drawn, `FUN_00230870` D:L82151). AD-10: a root whose
   * enable callback refuses the page's role is not drawn (`rootEnabled`: a dead player's TACTICAL ORDERS, TAUNTS, RADIO
   * and MESSAGES); TEAMMATES and SPECTATORS, which carry no callback, only while their rows are there -- a parent whose
   * rows are all disabled is disabled (`FUN_00231a30` D:L82568-82582): no teammate (`FUN_0022f6e0` D:L81486-81507), no
   * spectator (`FUN_0022f210` D:L81293-81313). The other roots always give rows in the original once enabled; parked
   * here, one stays drawn and does nothing (research 301 §3, 302 §3). AD-11: an online spectator's tree is RADIO alone
   * (`SPECTATOR_ROOT_ORDER`), enabled for him by `FUN_0022f810`'s spectator branch.
   */
  private roots(): number[] {
    const role = this.deps.role?.() ?? LIVING;
    return this.tree(role).filter((r) => rootEnabled(r, role) && (ROOT_ENABLE[r] !== null || (this.deps.entries?.(r).length ?? 0) > 0));
  }
  /** The role's tree (`FUN_001fa360` D:L57441-57448): an online spectator's, tree 2; a player's, tree 1. */
  private tree(role: ChatRole): readonly number[] { return role.spectator ? SPECTATOR_ROOT_ORDER : ROOT_ORDER; }
  /**
   * The root the cursor opens on (`FUN_00235440` D:L83998-83999 -> `FUN_00235560` D:L84027-84049): the first in the
   * tree's order that is enabled, or that carries no enable callback even if disabled (D:L84036-84038) -- for a living
   * player TACTICAL ORDERS, for a dead one TEAMMATES, drawn or not, for a spectator RADIO.
   */
  private openRoot(roots: readonly number[]): number {
    const tree = this.tree(this.deps.role?.() ?? LIVING);
    return tree.find((r) => roots.includes(r) || ROOT_ENABLE[r] === null) ?? tree[0] ?? TEAMMATES_ROOT;
  }
  /**
   * The TCM closes when the node it is on is disabled: `FUN_00231690`'s open state (case 1, D:L82464-82470) finds the
   * node the cursor is on (`FUN_00236b20`) disabled and calls `FUN_00232890(+0xdb8, 0)` then `FUN_00235300(.., 0)` --
   * the pair Triangle at the top closes the menu with (D:L84334-84336); `FUN_00235300` with 0 sets +0x750 to 3, the
   * closing state (D:L83949-83954). Here as the page's Triangle at the top: closed, its reopening held off
   * `CHAT_HOLD_SECONDS`. Two cases: on a root with no enable callback (SPECTATORS, TEAMMATES), or in it, when it stops
   * being drawn (SVC-23f: the last spectator gone; AD-10: the last teammate gone) -- the port reads its roots live, where
   * the original reads them once at the opening (`FUN_00231a30`'s one caller, D:L83998; research 227 §2.9); and AD-10's,
   * a menu opened on a root not drawn (a dead player with no teammate opens on TEAMMATES), closed the frame after (the
   * original's after its opening, state 0, which the port does not draw).
   */
  private settle(now: number): void {
    if (!this.openedHidden && (ROOT_ENABLE[this.root] !== null || this.roots().includes(this.root))) return;
    this.reset(); this.reopenAt = now + CHAT_HOLD_SECONDS;
  }
  reset(): void { this.open = false; this.depth = 0; this.circleAt = null; this.voiceHeld = false; this.branch = []; this.parents = []; this.openedHidden = false; }
  /** A send made: the menu closed, its reopening held off as Circle's release would. */
  private sent(now: number): void { this.deps.sound('.TCM_SELECT'); this.reset(); this.reopenAt = now + CHAT_HOLD_SECONDS; }
  frame(now: number, held: ReadonlySet<PadButton>, allowed: boolean): boolean {
    const pressed = (b: PadButton): boolean => held.has(b) && !this.last.has(b);
    const released = (b: PadButton): boolean => !held.has(b) && this.last.has(b);
    const wasOpen = this.open;
    if (!allowed) { this.reset(); this.last = new Set(held); return wasOpen; }
    if (this.open) this.settle(now);
    const team = this.deps.teamCommand ?? 'Circle';
    if (!this.open) {
      if (pressed(team) && now >= this.reopenAt) { this.circleAt = now; this.voiceHeld = false; }
      if (held.has(team) && this.circleAt !== null && now - this.circleAt > CHAT_HOLD_SECONDS) this.voiceHeld = true;
      if (released(team) && this.circleAt !== null) {
        if (!this.voiceHeld && now - this.circleAt <= CHAT_HOLD_SECONDS) {
          // AD-10: the roots read for the page's role at the opening (`FUN_00231a30` D:L83998), the cursor on its root.
          const roots = this.roots();
          this.open = true; this.depth = 0; this.root = this.openRoot(roots); this.row = 0; this.openedHidden = !roots.includes(this.root);
        }
        this.circleAt = null; this.voiceHeld = false;
      }
    } else if (now < this.nextRepeat) {
      // Native menu db4 blocks all menu actions until the navigation delay expires.
    } else if (released('Triangle')) {
      if (this.depth) {
        this.depth--;
        if (this.root !== TAUNTS_ROOT) { this.branch.pop(); this.row = this.parents.pop() ?? 0; }
      } else { this.reset(); this.reopenAt = now + CHAT_HOLD_SECONDS; }
    } else if (pressed('Cross') || pressed(team)) {
      if (!this.depth) {
        if (this.root === TAUNTS_ROOT) { this.depth = 1; this.row = 0; this.deps.sound('.TCM_SELECT'); }
        else {
          const entries = this.deps.entries?.(this.root) ?? [];
          if (entries.length) { this.depth = 1; this.row = 0; this.branch = [entries]; this.parents = []; this.deps.sound('.TCM_SELECT'); }
          else this.deps.unsupported(ROOTS[this.root]!);
        }
      } else if (this.root !== TAUNTS_ROOT) {
        const entry = this.branch.at(-1)?.[this.row];
        const key = entry ? entry.key ?? entry.label : '';
        if (entry?.children?.length) { this.parents.push(this.row); this.branch.push(entry.children); this.depth++; this.row = 0; this.deps.sound('.TCM_SELECT'); }
        else if (entry?.unsupported) this.deps.unsupported(entry.unsupported);
        else if (entry?.action && now >= (this.branchSend.get(key) ?? 0)) {
          entry.action(); this.branchSend.set(key, now + TAUNT_DELAY_SECONDS); this.sent(now);
        }
      } else if (now >= this.nextSend[this.row]!) {
        const text = this.deps.custom()[this.row - 1] ?? '';
        if (this.row === 0 || text.length) {
          this.deps.send(this.row === 0 ? { kind: 'vocal' } : { kind: 'custom', slot: this.row - 1, text });
          this.nextSend[this.row] = now + TAUNT_DELAY_SECONDS; this.sent(now);
        }
      }
    } else {
      const direction = held.has('Down') ? 'Down' : held.has('Up') ? 'Up' : null;
      if (direction && (pressed(direction) || now >= this.nextRepeat)) {
        const roots = this.roots();
        const count = !this.depth ? roots.length : this.root === TAUNTS_ROOT ? 6 : this.branch.at(-1)!.length;
        const delta = direction === 'Down' ? 1 : -1;
        // AD-10: no root drawn (a dead player's last teammate gone while it is open): the column has nothing to walk.
        if (count) {
          if (this.depth) this.row = (this.row + delta + count) % count;
          else this.root = roots[(roots.indexOf(this.root) + delta + count) % count]!;
          this.nextRepeat = now + CHAT_REPEAT_SECONDS; this.deps.sound('.TCM_SLIDE');
        }
      }
    }
    this.last = new Set(held);
    return wasOpen || this.open;
  }
}
