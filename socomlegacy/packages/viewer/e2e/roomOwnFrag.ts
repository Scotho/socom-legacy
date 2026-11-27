import { expect, type Page } from '@playwright/test';
import type {} from '../src/hook';
import type { ThrowInfo } from '../src/grenadeCore';
import { crouchSettled, OWN_FRAG_PITCH } from './ownCrouch';
import { turnTo as roomTurnTo } from './turnWithinLaw';

/**
 * The /testroom pages' crouched throw (`window.__viewer`), shared by the specs whose self-kill or throw a bare STANDING
 * toss no longer makes. A browser-test method (product track, no claim about the original): since B-06 (merge
 * 7967d16bee: the grenade's aim origin and wall clearance as the PS2's) the release's clearance refuses a weak standing
 * lob at some MP2 start slots, and its aim origin is latched AT THE SELECT, so a grenade taken up standing keeps the
 * standing latch however the body crouches after (LATER 1357). The pattern is WXO-OWNFRAG's (merge b579eb6769,
 * `weaponExchangeOriginal.spec.ts`; its source `voiceLobbyStall.spec.ts` `crouchedRoomFrags`, SELFKILL-CROUCH merge
 * 4298ba5d53), moved here so the five specs share it rather than copy it: per try the room hook's `crouch(true)`,
 * settled on the own body's clip (`./menuMatch` `crouchSettled`), BEFORE the grenade is taken up; the look turned within
 * the stick's law (`./turnWithinLaw` `turnTo`); still crouched, the item taken up (`select`, or `throwGrenade`'s own
 * take-up) and the hook's throw. Only a ThrowInfo (not null) counts; a refusal (null) faces 90 deg on and tries again.
 */

/** One try of `crouchedRoomThrow`: the look it threw at, and whether a grenade left the hand (and the phase if not). */
export interface RoomThrowTry { yaw: number; pitch: number; thrown: boolean; phase: string | null; refusal: string | null }

export interface CrouchedRoomThrowOptions {
  /** The hook's hold, seconds (`throwGrenade`'s first argument). */
  hold: number;
  /** `throwGrenade`'s `immediate` (its default when omitted). */
  immediate?: boolean;
  /** The look's pitch, degrees; the page's current pitch when omitted. */
  pitch?: number;
  /** The most tries (each refused one faces 90 deg on). */
  tries: number;
  /** Crouched and settled, before the throw: a spec's own take-up of the item (`selectItem`), when it names one. */
  select?: () => Promise<void>;
  /**
   * The body's own alive read (T14 F1): checked before each try, and when a crouch fails to settle, so a death that comes
   * late (after a spec's death wait) ends the throw as `died` instead of being misnamed "did not settle" or "no grenade
   * left the hand".
   */
  alive?: () => Promise<boolean>;
}

const roomCrouch = (q: Page) => q.evaluate(() => window.__viewer.crouch(true));
const poseNow = (p: Page) => p.evaluate(() => window.__viewer.pose()) as Promise<{ yaw: number; pitch: number }>;
/** The thrower instrument's last refusal (`__throwDiag`, THROW_DIAG_ADAPTATION; null without it) -- T14 F3. */
const lastRefusalOf = (p: Page) => p.evaluate(() => {
  const d = (globalThis as unknown as { __throwDiag?: () => { lastRefusal?: { reason: string; at: number } | null } }).__throwDiag?.();
  return d?.lastRefusal ? `${d.lastRefusal.reason}@${d.lastRefusal.at}` : null;
});
/** On a miss (T14 F4): the page's explosions and last throw, and the body's feet, to tell a far landing from a late blast. */
const missEvidenceOf = (p: Page) => p.evaluate(() => {
  const g = window.__viewer.grenade() as unknown as { explosions?: unknown; lastThrow?: unknown };
  const ex = g.explosions;
  return JSON.stringify({ explosions: Array.isArray(ex) ? ex.slice(-2) : ex ?? null, lastThrow: g.lastThrow ?? null, feet: window.__viewer.net?.()?.feet ?? null });
});

/**
 * One crouched throw that LEFT THE HAND: its ThrowInfo, after at most `o.tries` tries. Fails naming every try
 * ("no grenade left the hand") when each was refused -- never a null passed on to a wait for its effect.
 */
export async function crouchedRoomThrow(p: Page, tag: string, o: CrouchedRoomThrowOptions): Promise<{ info: ThrowInfo | null; tries: RoomThrowTry[]; died: boolean }> {
  const tries: RoomThrowTry[] = [];
  // T14 F2: the throw's page needs its own animation frames (the crouch settles on the drawn clip): to the front, as
  // `./menuMatch` does before its own throw (weaponExchangeMp's thrower is the page behind).
  await p.bringToFront();
  const dead = async (): Promise<boolean> => o.alive !== undefined && !(await o.alive());
  for (let k = 0; k < o.tries; k++) {
    if (await dead()) { console.log(`${tag} died before try ${k + 1} (a late death)`); return { info: null, tries, died: true }; }
    let yaw = 0, pitch = 0;
    try {
      await crouchSettled(p, tag, roomCrouch);
      const now = await poseNow(p);
      // A 'clear' refusal repeats at one look (WXO: MP2 start s0#11 refuses crouched at -65): each retry faces 90 deg on.
      yaw = now.yaw + (k > 0 ? 90 : 0); pitch = o.pitch ?? now.pitch;
      await roomTurnTo(p, yaw, pitch);
      await crouchSettled(p, tag, roomCrouch);                      // still crouched when the grenade is taken up
    } catch (e) {
      if (await dead()) { console.log(`${tag} died during try ${k + 1}'s crouch (a late death)`); return { info: null, tries, died: true }; }
      throw e;
    }
    await o.select?.();
    const info = await p.evaluate(({ hold, immediate }) => window.__viewer.throwGrenade(hold, immediate), { hold: o.hold, immediate: o.immediate });
    const phase = info ? null : await p.evaluate(() => window.__viewer.grenade().phase);
    const refusal = info ? null : await lastRefusalOf(p);
    tries.push({ yaw, pitch, thrown: info !== null, phase, refusal });
    console.log(`${tag} crouched throw try ${tries.length} ${info ? 'thrown' : `refused (throwGrenade null, phase ${phase}, lastRefusal ${refusal})`}`);
    if (info) return { info, tries, died: false };
  }
  throw new Error(`${tag}: no grenade left the hand in ${tries.length} crouched tries: ${JSON.stringify(tries)}`);
}

export interface CrouchedRoomSelfKillOptions {
  /** Whether the page's body is alive (each spec's own read). */
  alive: () => Promise<boolean>;
  /** The most frags (the spec's own attempt count); each one must leave the hand. */
  frags: number;
  /** The wait for the death after a frag left the hand, ms (the spec's own). */
  deathMs: number;
  /** The hook's hold, seconds (the specs' 4/60: power .185, the weakest lob the release request takes). */
  hold?: number;
  /** Refused tries per frag before it fails "no grenade left the hand". */
  triesPerFrag?: number;
  /** After a frag left the hand, before the wait for the death (a spec's own step). */
  afterThrow?: (info: ThrowInfo) => Promise<void>;
}

/**
 * The /testroom self-kill: up to `o.frags` crouched frags at `OWN_FRAG_PITCH`, each ASSERTED to have left the hand
 * (`crouchedRoomThrow`), then up to `o.deathMs` for the death. One that left the hand and did not kill is logged
 * "thrown, no death within N s"; when no frag killed, the failure names each ("thrown, no death ..."), so an aim that
 * throws but lands away from the feet is told apart from a refusal. Returns each frag's ThrowInfo.
 */
export async function crouchedRoomSelfKill(p: Page, tag: string, o: CrouchedRoomSelfKillOptions): Promise<ThrowInfo[]> {
  const thrown: ThrowInfo[] = [];
  const misses: string[] = [];
  for (let i = 0; i < o.frags && (await o.alive()); i++) {
    const { info, died } = await crouchedRoomThrow(p, `${tag} frag ${i + 1}`, { hold: o.hold ?? 4 / 60, immediate: true, pitch: OWN_FRAG_PITCH, tries: o.triesPerFrag ?? 4, alive: o.alive });
    if (died || !info) break;                                       // a late death of the frag before: done
    thrown.push(info);
    await o.afterThrow?.(info);
    const dead = await expect.poll(() => o.alive(), { timeout: o.deathMs }).toBe(false).then(() => true, () => false);
    if (!dead) {
      misses.push(`frag ${i + 1}: thrown, no death within ${o.deathMs / 1000} s (stance ${info.stance}, power ${info.power}, from ${JSON.stringify(info.from)}; ${await missEvidenceOf(p)})`);
      console.log(`${tag} ${misses.at(-1)}`);
    }
  }
  if (await o.alive()) throw new Error(`${tag}: alive after ${thrown.length} crouched frags that left the hand: ${misses.join('; ')}`);
  return thrown;
}
