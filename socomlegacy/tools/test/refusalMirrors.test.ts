import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * P34 (D1), the online-parity sweep's class D guard (2026-11-02): a one-sided guard -- the page refuses and the room
 * trusts it, or the room refuses what the page offers. A product-track guard: it reads source text and changes nothing
 * the game does.
 *
 * Every reason the room refuses a request by -- `Room.dropped(kind, why)` (`packages/match/src/room.ts`), and
 * `Room.refuseRound`'s word -- is read off the syntax tree (`ts.createSourceFile`, no program): a string literal; a
 * template by its literal head (`muzzle *`); both arms of a `?:` or a `??`; a room function that forwards its own
 * parameter to `dropped` (`turretDropped`, `dropStretch`, `launchRocket`'s `told`, `refuseRound`) -- or wraps it in a
 * template's head (`launchRound`'s `told`: `round ${why}`) -- by the arguments its callers hand it (a local forwarder in
 * the function that declares it: two members' `told`s are two); anything else -- a variable, a module's callback
 * (`hostageOrder`'s, `pickup`'s, `rulePurchase`'s) -- by its expression in braces (`{shut}`), one entry for every reason
 * it carries. A kind that is no literal (`ev.type`, `kind`) is `*`. The key is `<kind>: <why>`.
 *
 * `REFUSAL_MIRRORS` holds one entry a key, each one of:
 * - **a mirror** -- `room`, EVERY room member the reason is emitted from (`room.ts:<member>`), each with the page's check
 *   for that member's request (`<file>:<name>` under `packages/viewer/src`: a function, a method, or a property or a
 *   variable holding a function, that file declares; `Class.method` for a class's own; or `{ page, todo, note }` when that
 *   member's mirror is the known gap), `how` the page holds the same line: `refuses` (it
 *   refuses or withholds the same request first), `claims` (it computes the claimed value the room bounds, honestly
 *   inside the bound), `wire` (the network's own bookkeeping -- a shape, an order, a stale or flooded command, which
 *   the page's sender forms or its journal reconciles; no game rule to mirror);
 * - **no page** -- `room` and `sender: null`: no page sends the request at all (no `type: '<kind>'` in the viewer's
 *   sources), so there is nothing to mirror until one does;
 * - **a trust** -- keyed by the page's own refusal the room does not emit (the room trusting the page): `trust`, the
 *   `*_TRUST_ADAPTATION` name the sweep's row will give it (not a constant in the sources yet), `row`, and `page`.
 *
 * `todo` names the sweep's row (section 1 of `agent-mail/handoffs/2026-11-02/online-parity-sweep.md`) whose mirror is
 * known missing -- class D's AR-1, AR-3/WK-4, AR-5, TB-9, WK-5, WK-6 and WK-2 (the inverse: the page offers what the room
 * refuses), and DMA-3's `used`/`busy` -- or `new` for a gap this guard found that no row names yet; each is reported as a
 * `test.todo`, so the tree stays green while the gap is open. Fails: a reason emitted with no entry, an entry whose
 * reason is no longer emitted (a trust entry: one the room now emits), a member the reason is emitted from that `room`
 * does not list (a known reason from a new path -- P4's `launchRound`) or a listed one that no longer emits it, a cited
 * page file or function that no longer exists, a "no page" request a page now sends.
 */

const root = resolve(import.meta.dirname, '../..');
const ROOM = join(root, 'packages', 'match', 'src', 'room.ts');
const PAGE_DIR = join(root, 'packages', 'viewer', 'src');

function parse(text: string, file = 'x.ts'): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
}

function unwrap(n: ts.Expression): ts.Expression {
  let e = n;
  while (ts.isAsExpression(e) || ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e)) e = e.expression;
  return e;
}

/** The reasons an argument carries: a literal, a template's head (`muzzle *`), both arms of `?:`/`??`, else `{text}`. */
export function reasonsOf(n: ts.Expression, sf: ts.SourceFile): string[] {
  const e = unwrap(n);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return [e.text];
  if (ts.isTemplateExpression(e)) return [`${e.head.text}*`];
  if (ts.isConditionalExpression(e)) return [...reasonsOf(e.whenTrue, sf), ...reasonsOf(e.whenFalse, sf)];
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) return [...reasonsOf(e.left, sf), ...reasonsOf(e.right, sf)];
  return [`{${e.getText(sf)}}`];
}

function thisCall(n: ts.Node, method: string): n is ts.CallExpression {
  return ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
    && n.expression.expression.kind === ts.SyntaxKind.ThisKeyword && n.expression.name.text === method;
}

/** The class member a node sits in: a method's, an accessor's or a property's name, `constructor`; null outside one. */
function memberOf(n: ts.Node): string | null {
  for (let m: ts.Node | undefined = n.parent; m; m = m.parent) {
    if (!m.parent || !ts.isClassLike(m.parent)) continue;
    if (ts.isConstructorDeclaration(m)) return 'constructor';
    if ((ts.isMethodDeclaration(m) || ts.isPropertyDeclaration(m) || ts.isGetAccessor(m)) && m.name) return m.name.getText();
  }
  return null;
}

/** One emitted refusal: its key and the room member it is emitted from. */
export interface Refusal { key: string; member: string | null; line: number }

/**
 * The refusals a room source emits (see the file's doc). A forwarder is a function whose `dropped` call hands on one of
 * its own parameters: a class method (called `this.<name>(`) or a local `const <name> = (...) =>` (called `<name>(`) is
 * followed to its callers; one handed to another module (an object property's arrow) is kept as `{<parameter>}`.
 */
export function roomRefusals(text: string): Refusal[] {
  const sf = parse(text, 'room.ts');
  const out: Refusal[] = [];
  const at = (n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  // A method by `this.<name>`; a local by `<function start>:<name>`, the function it is declared in -- two members' own
  // `told`s (P4's launchRound, LATER 503's launchRocket) are two forwarders. `prefix`: a template's head the parameter
  // is wrapped in (`round ${why}`), put before each reason its callers hand on.
  const forwarders = new Map<string, { kind: string; i: number; prefix: string }>([['this.refuseRound', { kind: 'fire', i: 5, prefix: '' }]]);
  const kindOf = (e: ts.Expression): string => { const k = unwrap(e); return ts.isStringLiteral(k) ? k.text : '*'; };
  const fnOf = (n: ts.Node): ts.Node | undefined => { let f = n.parent; while (f && !ts.isFunctionLike(f)) f = f.parent; return f; };
  const visit = (n: ts.Node): void => {
    if (thisCall(n, 'dropped') && n.arguments.length >= 2) {
      const kind = kindOf(n.arguments[0]!), why = unwrap(n.arguments[1]!);
      if (thisCall(why, 'refuseRound')) { ts.forEachChild(n, visit); return; }   // its word: counted at refuseRound's callers
      const f = fnOf(n);
      // The parameter handed on: bare, or the one span of a template that ends with it (`round ${why}`).
      const wrapped = ts.isTemplateExpression(why) && why.templateSpans.length === 1 && why.templateSpans[0]!.literal.text === ''
        ? unwrap(why.templateSpans[0]!.expression) : null;
      const param = ts.isIdentifier(why) ? why : wrapped && ts.isIdentifier(wrapped) ? wrapped : null;
      const prefix = wrapped && ts.isTemplateExpression(why) ? why.head.text : '';
      const i = f && param ? (f as ts.SignatureDeclaration).parameters.findIndex((q) => ts.isIdentifier(q.name) && q.name.text === param.text) : -1;
      if (f && i >= 0) {
        if (ts.isMethodDeclaration(f)) { forwarders.set(`this.${f.name.getText(sf)}`, { kind, i, prefix }); ts.forEachChild(n, visit); return; }
        if (ts.isVariableDeclaration(f.parent)) {
          forwarders.set(`${fnOf(f.parent)?.getStart(sf) ?? -1}:${f.parent.name.getText(sf)}`, { kind, i, prefix });
          ts.forEachChild(n, visit); return;
        }
      }
      for (const r of reasonsOf(why, sf)) out.push({ key: `${kind}: ${r}`, member: memberOf(n), line: at(n) });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  /** The forwarder a call names: `this.<method>`, else a local declared in the nearest function around the call that has one. */
  const forwarderOf = (n: ts.CallExpression): { kind: string; i: number; prefix: string } | undefined => {
    const name = n.expression.getText(sf);
    if (!ts.isIdentifier(n.expression)) return forwarders.get(name);
    for (let s = fnOf(n); s; s = fnOf(s)) { const f = forwarders.get(`${s.getStart(sf)}:${name}`); if (f) return f; }
    return undefined;
  };
  const callers = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const f = forwarderOf(n);
      if (f && n.arguments.length > f.i) for (const r of reasonsOf(n.arguments[f.i]!, sf)) out.push({ key: `${f.kind}: ${f.prefix}${r}`, member: memberOf(n), line: at(n) });
    }
    ts.forEachChild(n, callers);
  };
  callers(sf);
  return out;
}

/**
 * The functions a source declares, by name: function declarations, methods, and properties (a class's, an object
 * literal's) and variables whose value is a function (an arrow or a function expression) -- a class's own members also
 * as `Class.name`. Not a class, an interface or its signatures, an accessor, or a property or variable holding a value.
 */
export function declaredNames(text: string): Set<string> {
  const sf = parse(text);
  const out = new Set<string>();
  const fn = (e: ts.Expression | undefined): boolean => {
    let x = e;
    while (x && (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isSatisfiesExpression(x))) x = x.expression;
    return !!x && (ts.isArrowFunction(x) || ts.isFunctionExpression(x));
  };
  const visit = (n: ts.Node): void => {
    const named = (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)
      || ((ts.isPropertyDeclaration(n) || ts.isPropertyAssignment(n) || ts.isVariableDeclaration(n)) && fn(n.initializer)))
      && n.name && (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name)) ? n.name.text : null;
    if (named !== null) {
      out.add(named);
      if (n.parent && ts.isClassDeclaration(n.parent) && n.parent.name) out.add(`${n.parent.name.text}.${named}`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** A sweep row (`AR-1`, `WK-2`), or `new`: a gap this guard found that no row names. */
type Row = 'AR-1' | 'AR-3' | 'AR-5' | 'TB-9' | 'WK-2' | 'WK-5' | 'WK-6' | 'DMA-3' | 'new';
/** A room member's page check: a cite, or a cite with the known gap in it. */
type Site = string | { page: string; todo: Row; note: string };
interface Mirror { room: Record<string, Site>; how: 'refuses' | 'claims' | 'wire'; todo?: Row; note?: string }
interface NoPage { room: string[]; sender: null; note: string }
interface Trust { trust: `${string}_TRUST_ADAPTATION`; row: Row; page: string; todo: Row; note: string }
type Entry = Mirror | NoPage | Trust;

const isTrust = (e: Entry): e is Trust => 'trust' in e;
const isNoPage = (e: Entry): e is NoPage => 'sender' in e;

/**
 * Today's refusals (main `e181bf6c3`, 2026-11-02; main `5114525e3`'s, 2026-11-03), by key. A page name is
 * `<file>:<name>` under `packages/viewer/src` (`Class.method` -- that class's own); a room name is `room.ts:<member>`.
 */
export const REFUSAL_MIRRORS: Record<string, Entry> = {
  // ---- any kind (`ev.type`, `kind`): the decision's order, the mount, the prompts' common gate ----
  '*: stale': { room: { 'room.ts:decide': 'netPage.ts:event' }, how: 'wire', note: "the page's journal refunds on the room's `stale` (case 'stale')" },
  '*: too many waiting': { room: { 'room.ts:timed': 'net/client.ts:lastSeq' }, how: 'wire' },
  '*: its command never ran': { room: { 'room.ts:settle': 'net/client.ts:lastSeq' }, how: 'wire' },
  '*: ahead': { room: { 'room.ts:turretRequest': 'turretPage.ts:claimSeq' }, how: 'wire' },
  '*: mounted': { room: { 'room.ts:decide': 'turretPage.ts:action', 'room.ts:mountedRefused': 'turretPage.ts:action' }, how: 'refuses', note: 'mounted, the action press is the turret\'s' },
  '*: releasing': { room: { 'room.ts:releaseRefused': 'turretPage.ts:travelling' }, how: 'refuses' },
  '*: no turret': { room: { 'room.ts:turretRequest': 'turretPage.ts:mounted' }, how: 'refuses' },
  '*: not mounted': { room: { 'room.ts:turretRequest': 'turretPage.ts:mounted' }, how: 'refuses' },
  '*: {shut}': { room: { 'room.ts:decide': 'walk.ts:actionGateShut' }, how: 'refuses', note: 'actionGateWhy, the room\'s actionGateShut' },
  // ---- the commands ----
  'command: ahead': { room: { 'room.ts:binary': 'net/client.ts:tick' }, how: 'wire' },
  'command: flood': { room: { 'room.ts:binary': 'net/client.ts:tick' }, how: 'wire' },
  'command: backlog': { room: { 'room.ts:dropBacklog': 'net/client.ts:tick' }, how: 'wire' },
  'command: cut': { room: { 'room.ts:stepRoom': 'net/client.ts:tick' }, how: 'wire' },
  'look: turn': { room: { 'room.ts:run': 'net/client.ts:shadowStep' }, how: 'refuses', note: 'the page steps the same LookGate' },
  'look: pitch': { room: { 'room.ts:run': 'net/client.ts:shadowStep' }, how: 'refuses', todo: 'AR-5', note: "lookAllowance's kick rate on every command, the page's kick scoped only" },
  // ---- the hand's rounds ----
  'fire: shape': { room: { 'room.ts:text': 'netPage.ts:sendRound' }, how: 'wire' },
  'fire: not alive': { room: { 'room.ts:fire': 'matchFirearm.ts:ready' }, how: 'refuses' },
  'fire: no frame': { room: { 'room.ts:fire': 'matchFirearm.ts:roundSeq' }, how: 'wire' },
  'fire: nofire': { room: { 'room.ts:fireAt': 'walk.ts:fireAllowed', 'room.ts:fire': 'turretPage.ts:mountFireRefused' }, how: 'refuses', note: 'Fire.source.fireRefused' },
  'fire: released': { room: { 'room.ts:fire': 'turretPage.ts:travelling' }, how: 'refuses' },
  'fire: launcher': { room: { 'room.ts:fireAt': 'matchThrow.ts:trigger' }, how: 'refuses', note: 'the launcher\'s trigger, the firearm\'s ready time' },
  'fire: no firearm': { room: { 'room.ts:fireAt': 'matchFirearm.ts:ready' }, how: 'refuses' },
  'fire: rate': { room: { 'room.ts:fireAt': 'fire.ts:pullRound', 'room.ts:turretRound': 'actionWiring.ts:TurretTrigger.frame' }, how: 'refuses', note: 'fireGate gapOpen/scheduleOpen, ROOM_GATE_MIRROR_ADAPTATION' },
  'fire: reload or empty': { room: { 'room.ts:fireAt': 'fire.ts:tryFire' }, how: 'refuses' },
  'fire: swapping': { room: { 'room.ts:fireAt': 'matchFirearm.ts:ready', 'room.ts:turretRound': 'turretPage.ts:mountFireRefused' }, how: 'refuses' },
  'fire: binoculars': { room: { 'room.ts:fireAt': 'matchFirearm.ts:fireRefused', 'room.ts:turretRound': 'matchActions.ts:sendTurretRound' }, how: 'refuses' },
  'fire: muzzle *': { room: { 'room.ts:fireAt': 'fire.ts:ray' }, how: 'claims', note: 'startRefused far/walled: the page\'s muzzle and its startWalled' },
  'fire: dir': { room: { 'room.ts:fireAt': 'fire.ts:ray', 'room.ts:turretRound': 'turretPage.ts:round' }, how: 'claims' },
  'fire: cone: *': { room: { 'room.ts:fireAt': 'fire.ts:ray', 'room.ts:turretRound': 'turretPage.ts:round' }, how: 'claims', todo: 'AR-1', note: 'scoped: the room checks the SniperDistLimit box, never the sway point' },
  // ---- the turret's rounds (turretDropped) ----
  'fire: no turret weapon': { room: { 'room.ts:turretRound': 'matchActions.ts:turretRecord' }, how: 'refuses' },
  'fire: before the mount': { room: { 'room.ts:turretRound': 'turretPage.ts:claimSeq' }, how: 'wire' },
  'fire: reload': { room: { 'room.ts:turretRound': 'turretPage.ts:round' }, how: 'refuses' },
  'fire: empty': { room: { 'room.ts:turretRound': 'turretPage.ts:round' }, how: 'refuses' },
  // ---- throwables, charges, the Detonator ----
  'throwStart: shape': { room: { 'room.ts:text': 'netPage.ts:throwStartEvent' }, how: 'wire' },
  'throwStart: not alive': { room: { 'room.ts:takeThrowStart': 'grenade.ts:startThrow' }, how: 'refuses' },
  'throwStart: unknown kind': { room: { 'room.ts:takeThrowStart': 'netPage.ts:throwStartEvent' }, how: 'wire' },
  'throwStart: none left': { room: { 'room.ts:takeThrowStart': 'grenade.ts:pull' }, how: 'refuses' },
  'throwStart: no frame': { room: { 'room.ts:takeThrowStart': 'net/client.ts:lastSeq' }, how: 'wire' },
  'throwStart: airborne': { room: { 'room.ts:takeThrowStart': 'grenade.ts:startThrow' }, how: 'refuses' },
  'throwStart: swapping': { room: { 'room.ts:takeThrowStart': 'matchThrow.ts:takeSlot' }, how: 'refuses' },
  'throwStart: nofire': {
    room: { 'room.ts:takeThrowStart': 'grenade.ts:startThrow' }, how: 'refuses', todo: 'new',
    note: 'the page holds only the climb\'s NoFire (CLIMB_THROW_REFUSED_READING); no other playing motion\'s NoFire is asked at the release',
  },
  'throwStart: binoculars': { room: { 'room.ts:takeThrowStart': 'matchThrow.ts:trigger' }, how: 'refuses' },
  'throwStart: launcher': { room: { 'room.ts:takeThrowStart': 'matchThrow.ts:trigger' }, how: 'refuses' },
  'throwStart: rate': { room: { 'room.ts:takeThrowStart': 'grenade.ts:pull' }, how: 'refuses', note: 'the phase: no wind-up before the last throw is out' },
  'throwStart: net cap': { room: { 'room.ts:takeThrowStart': 'grenade.ts:netCapRefused' }, how: 'refuses' },
  'throw: not alive': { room: { 'room.ts:throwGrenade': 'grenade.ts:startThrow', 'room.ts:placeCharge': 'grenade.ts:pull', 'room.ts:detonate': 'grenade.ts:pull' }, how: 'refuses' },
  'throw: unknown kind': { room: { 'room.ts:throwGrenade': 'netPage.ts:throwEvent', 'room.ts:placeCharge': 'netPage.ts:throwEvent' }, how: 'wire' },
  'throw: slot': { room: { 'room.ts:throwGrenade': 'netPage.ts:throwEvent' }, how: 'wire' },
  'throw: none left': { room: { 'room.ts:throwGrenade': 'grenade.ts:pull', 'room.ts:placeCharge': 'grenade.ts:pull' }, how: 'refuses' },
  'throw: no frame': { room: { 'room.ts:throwGrenade': 'net/client.ts:lastSeq', 'room.ts:launchRocket': 'net/client.ts:lastSeq' }, how: 'wire' },
  // P38-room (9bc897234) took the Detonator's FireWait out of `detonate`: no `rate` there, so its `new` gap is gone.
  'throw: rate': { room: { 'room.ts:throwGrenade': 'grenade.ts:pull' }, how: 'refuses' },
  'throw: net cap': { room: { 'room.ts:throwGrenade': 'grenade.ts:netCapRefused', 'room.ts:placeCharge': 'grenade.ts:startPlacing' }, how: 'refuses' },
  'throw: hand *': { room: { 'room.ts:throwGrenade': 'grenade.ts:startThrow', 'room.ts:placeCharge': 'grenade.ts:placeCharge' }, how: 'claims', note: 'startRefused far/walled on the release point the page sends' },
  'throw: launch': { room: { 'room.ts:throwGrenade': 'grenade.ts:startThrow' }, how: 'claims', note: 'throwLaunchAllowed bounds the page\'s velocity (TB-9: power sampled from 0)' },
  'throw: facing': { room: { 'room.ts:placeCharge': 'grenade.ts:placeCharge' }, how: 'claims' },
  'throw: {shut}': { room: { 'room.ts:placeCharge': 'walk.ts:actionGateShut' }, how: 'refuses' },
  'throw: no c4 target': { room: { 'room.ts:placeCharge': 'grenade.ts:c4CommitOk' }, how: 'refuses' },
  'throw: c4 hand': { room: { 'room.ts:placeCharge': 'grenade.ts:placeCharge' }, how: 'claims' },
  'throw: c4 reach': { room: { 'room.ts:placeCharge': 'equipment.ts:c4InReach' }, how: 'refuses' },
  'throw: c4 *': { room: { 'room.ts:placeCharge': 'equipment.ts:c4Line' }, how: 'refuses' },
  'throw: c4 surface': { room: { 'room.ts:placeCharge': 'equipment.ts:c4Line' }, how: 'refuses' },
  'throw: charges down': { room: { 'room.ts:placeCharge': 'grenade.ts:startPlacing' }, how: 'refuses' },
  'throw: wading': { room: { 'room.ts:placeCharge': 'grenade.ts:startPlacing', 'room.ts:raiseLauncher': 'rocket.ts:selectSlot' }, how: 'refuses', note: 'and the launcher\'s raise, rocket.ts selectSlot' },
  'throw: ground': { room: { 'room.ts:placeCharge': 'grenade.ts:placeCharge' }, how: 'refuses', note: 'placeGround: no ground in reach sets nothing down' },
  'throw: no claymore': { room: { 'room.ts:detonate': 'grenade.ts:takeDetonator' }, how: 'refuses' },
  // ---- the launcher (`launchRocket`'s `told`, the raise and the lower) ----
  'throw: hand': { room: { 'room.ts:launchRocket': 'rocket.ts:pull' }, how: 'refuses' },
  'throw: raise': { room: { 'room.ts:launchRocket': 'matchThrow.ts:trigger' }, how: 'refuses', note: 'raiseRefused, LATER 192' },
  'throw: nofire': { room: { 'room.ts:launchRocket': 'matchThrow.ts:trigger' }, how: 'refuses', note: 'walk.fireAllowed, LATER 199' },
  'throw: start *': { room: { 'room.ts:launchRocket': 'rocket.ts:pull' }, how: 'claims' },
  'throw: wait': { room: { 'room.ts:launchRocket': 'rocket.ts:pull' }, how: 'refuses' },
  'throw: swapping': { room: { 'room.ts:refuseRaise': 'matchThrow.ts:takeSlot' }, how: 'refuses' },
  'throw: moving lower': { room: { 'room.ts:raiseLauncher': 'walk.ts:actionGateShut' }, how: 'refuses', note: 'launcherMovingUntil' },
  'throw: launcher clip': { room: { 'room.ts:raiseLauncher': 'matchThrow.ts:kitChangeGate', 'room.ts:lowerLauncher': 'matchThrow.ts:kitChangeGate' }, how: 'refuses' },
  // ---- a carrier's launched round (P4, 1a63dc29f: `launchRound`'s `told`, tallied `round <why>`); the page fires it
  // through the firearm's pull (`Fire.tryFire` -> `Fire.launch`) in the round mode `showFireMode` sets ----
  'throw: round not alive': { room: { 'room.ts:launchRound': 'matchFirearm.ts:ready' }, how: 'refuses', note: 'walk.isDead' },
  'throw: round over': { room: { 'room.ts:launchRound': 'matchFirearm.ts:ready' }, how: 'refuses', note: 'OBF-31: no round under the round screens (`screens`)' },
  'throw: round no frame': { room: { 'room.ts:launchRound': 'net/client.ts:lastSeq' }, how: 'wire' },
  'throw: round weapon': { room: { 'room.ts:launchRound': 'matchFirearm.ts:showFireMode' }, how: 'refuses', note: 'a round mode only with the rifle in hand (`kitItem === \'rifle\'`)' },
  'throw: round hand': { room: { 'room.ts:launchRound': 'matchThrow.ts:trigger' }, how: 'refuses', note: 'an item or the launcher up takes the trigger' },
  'throw: round raise': { room: { 'room.ts:launchRound': 'matchThrow.ts:trigger' }, how: 'refuses', note: 'the launcher\'s lowering, the firearm\'s ready time (`firearmReadyAt`), as fire: launcher' },
  'throw: round carrier': { room: { 'room.ts:launchRound': 'matchFirearm.ts:showFireMode' }, how: 'refuses', note: 'the round mode set only for a round the kit holds (`kitRounds.round`)' },
  'throw: round empty': { room: { 'room.ts:launchRound': 'fire.ts:tryFire' }, how: 'refuses' },
  'throw: round reload': { room: { 'room.ts:launchRound': 'fire.ts:tryFire' }, how: 'refuses', note: 'the reload and the after-shot lock' },
  'throw: round wait': { room: { 'room.ts:launchRound': 'fire.ts:tryFire' }, how: 'refuses', note: 'the round\'s FireWait (`Fire.launch` sets `wait`)' },
  'throw: round rate': {
    room: { 'room.ts:launchRound': 'fire.ts:tryFire' }, how: 'refuses', todo: 'new',
    note: 'the kit\'s one wait carries the rifle\'s last gap; the room\'s period chain (`scheduleOpen`, P3-room) is mirrored for a firearm\'s round only (`pullRound`\'s named gate skips a round mode)',
  },
  'throw: round swapping': { room: { 'room.ts:launchRound': 'matchFirearm.ts:ready' }, how: 'refuses', note: 'kit.swapping' },
  'throw: round nofire': { room: { 'room.ts:launchRound': 'matchFirearm.ts:fireRefused' }, how: 'refuses', note: 'walk.fireAllowed' },
  'throw: round binoculars': { room: { 'room.ts:launchRound': 'matchFirearm.ts:fireRefused' }, how: 'refuses' },
  'throw: round start *': { room: { 'room.ts:launchRound': 'fire.ts:Fire.launch' }, how: 'claims', note: 'startRefused far/walled on the page\'s `launchPoint` (firepoint_203)' },
  'throw: round speed': { room: { 'room.ts:launchRound': 'fire.ts:Fire.launch' }, how: 'claims', note: 'the round\'s Muzzle_Velocity, inside ROUND_SPEED_SLACK_PLACEHOLDER' },
  // ---- the reload ----
  'reload: airborne': { room: { 'room.ts:reload': 'matchFirearm.ts:airborne' }, how: 'refuses' },
  'reload: climb': { room: { 'room.ts:reload': 'walk.ts:climbHolds' }, how: 'refuses' },
  'reload: flinch': { room: { 'room.ts:reload': 'matchFirearm.ts:flinching' }, how: 'refuses' },
  'reload: proneCover': { room: { 'room.ts:reload': 'matchFirearm.ts:flinching' }, how: 'refuses', note: 'walk.knockCovered' },
  // ---- the turret's mount, take and release ----
  'mount: stale': { room: { 'room.ts:resolveMounts': 'turretPage.ts:action' }, how: 'wire' },
  'mount: its command never ran': { room: { 'room.ts:resolveMounts': 'net/client.ts:lastSeq' }, how: 'wire' },
  'mount: not alive': { room: { 'room.ts:resolveMounts': 'walk.ts:mountRefused', 'room.ts:takeMount': 'walk.ts:mountRefused' }, how: 'refuses' },
  'mount: mounted': { room: { 'room.ts:resolveMounts': 'turretPage.ts:target' }, how: 'refuses' },
  'mount: fall': { room: { 'room.ts:resolveMounts': 'walk.ts:mountRefused', 'room.ts:takeMount': 'walk.ts:mountRefused' }, how: 'refuses' },
  'mount: mounting': { room: { 'room.ts:resolveMounts': 'turretPage.ts:action' }, how: 'refuses', note: 'the predicted release on its way' },
  'mount: occupied': { room: { 'room.ts:resolveMounts': 'turretPage.ts:target' }, how: 'refuses' },
  'mount: busy': {
    room: { 'room.ts:resolveMounts': 'turretPage.ts:target' }, how: 'refuses', todo: 'new',
    note: 'the room refuses a mount while the mover\'s move is busy; the page\'s target asks no move',
  },
  'mount: launcher': { room: { 'room.ts:resolveMounts': 'turretPage.ts:target' }, how: 'refuses', note: 'launcherSet' },
  'mount: {shut}': { room: { 'room.ts:resolveMounts': 'turretPage.ts:target' }, how: 'refuses', note: 'kitLocked' },
  'mount: reach': { room: { 'room.ts:resolveMounts': 'turretPage.ts:target' }, how: 'refuses', note: 'canMount' },
  'mountTake: not reserved': { room: { 'room.ts:mountWord': 'turretPage.ts:takeOwn' }, how: 'wire' },
  'mountTake: stale': { room: { 'room.ts:mountWord': 'turretPage.ts:takeOwn' }, how: 'wire' },
  'mountTake: ahead': { room: { 'room.ts:mountWord': 'turretPage.ts:takeOwn' }, how: 'wire' },
  'dismount: mounting': { room: { 'room.ts:takeDismount': 'turretPage.ts:releaseOffered' }, how: 'refuses' },
  'dismount: reload': { room: { 'room.ts:takeDismount': 'turretPage.ts:releaseOffered' }, how: 'refuses' },
  // ---- the prompts' actions: doors, switches, the bomb, pickups, hostages, the dance ----
  // HOTFIX DOOR-RESET (ae1e9121e): `useDoor`'s refusals named, log-only (`dropped`'s `logOnly`: no seat tally, no report).
  'door: shape': { room: { 'room.ts:text': 'doorPage.ts:action', 'room.ts:useDoor': 'doorPage.ts:target' }, how: 'wire', note: 'useDoor: a door index the map has; the page sends `pickDoor`\'s' },
  'door: dead': { room: { 'room.ts:useDoor': 'actionWiring.ts:canAct' }, how: 'refuses', note: 'no context fires for the dead' },
  'door: reach': { room: { 'room.ts:useDoor': 'doorPage.ts:target' }, how: 'refuses', note: 'pickDoor within the door\'s reach of the page\'s feet' },
  'door: inactive': { room: { 'room.ts:useDoor': 'doors.ts:pickDoor' }, how: 'refuses', note: 'V13-3b (research 386 s4): pickDoor\'s segmentHits passes no owner whose node is off (modelGate)' },
  'door: {why}': {
    room: { 'room.ts:useDoor': 'doorPage.ts:action' }, how: 'refuses', todo: 'new',
    note: 'DoorSet.use\'s noprogram / busy / locked: online the page sends the press whatever the door\'s state (its own use, offline, refuses the same three); log-only, nothing predicted on it',
  },
  'action: shape': { room: { 'room.ts:text': 'actionPage.ts:action' }, how: 'wire' },
  'action: not alive': { room: { 'room.ts:useAction': 'actionPage.ts:action' }, how: 'refuses' },
  'action: no switch': { room: { 'room.ts:useAction': 'actionPage.ts:pickAt' }, how: 'refuses' },
  'action: no action': { room: { 'room.ts:useAction': 'actionPage.ts:pickAt' }, how: 'refuses' },
  'action: reach': { room: { 'room.ts:useAction': 'actionPage.ts:pickAt' }, how: 'refuses', note: 'actionReachNote' },
  'action: {line.why}': { room: { 'room.ts:useAction': 'actionPage.ts:pickAt' }, how: 'claims', note: 'the room judges the line from its own eyes; the page sends its pick' },
  'action: used': {
    room: { 'room.ts:useAction': 'actionPage.ts:pickAt' }, how: 'refuses', todo: 'DMA-3',
    note: 'the page still picks a used switch; the room drops the press',
  },
  'action: busy': {
    room: { 'room.ts:useAction': 'actionPage.ts:pickAt' }, how: 'refuses', todo: 'DMA-3',
    note: 'the page offers a switch whose program runs; the room drops the press',
  },
  'bombAction: shape': { room: { 'room.ts:text': 'matchActions.ts:bombDrop', 'room.ts:bombAction': 'matchActions.ts:bombDrop' }, how: 'wire' },
  'bombAction: not alive': { room: { 'room.ts:bombAction': 'bombPage.ts:prompt' }, how: 'refuses' },
  'bombAction: {why}': { room: { 'room.ts:bombAction': 'bombPage.ts:prompt' }, how: 'refuses', note: 'BombAuthority.manualDrop; the page\'s canDrop' },
  'pickup: shape': { room: { 'room.ts:text': 'netPage.ts:pickup' }, how: 'wire' },
  'pickup: {why}': {
    room: { 'room.ts:worldDrops': 'drops.ts:promptAt' }, how: 'refuses', todo: 'WK-2',
    note: 'WorldDrops.judge: the page\'s prompt asks no speed, binoculars or NoFire',
  },
  'hostageOrder: shape': { room: { 'room.ts:text': 'netPage.ts:hostageOrder' }, how: 'wire' },
  'hostageOrder: stale': { room: { 'room.ts:text': 'netPage.ts:hostageOrder' }, how: 'wire' },
  'hostageOrder: no hostages': { room: { 'room.ts:text': 'hostagePage.ts:computeWhy' }, how: 'refuses' },
  'hostageOrder: {why}': { room: { 'room.ts:constructor': 'hostagePage.ts:computeWhy' }, how: 'refuses', note: 'orderTestRefusal, both sides' },
  'victory: shape': { room: { 'room.ts:requestVictory': 'victory.ts:fire' }, how: 'wire' },
  'victory: rate': { room: { 'room.ts:requestVictory': 'victory.ts:fire' }, how: 'refuses', note: 'one request pending until the offer' },
  'rulePurchase: {why}': { room: ['room.ts:ruleView'], sender: null, note: 'a creator rule pack\'s purchase (creator/rules/host.ts request); no viewer page sends one' },
  // ---- the room trusts the page: a page refusal with no room twin ----
  'fire: raise': {
    trust: 'ROOM_RAISE_TRUST_ADAPTATION', row: 'AR-3', todo: 'AR-3', page: 'matchFirearm.ts:raiseRefused',
    note: 'LATER 180: no bullet round before the rifle is up -- the page alone (WK-4)',
  },
  'fire: mode': {
    trust: 'FIRE_MODE_TRUST_ADAPTATION', row: 'WK-5', todo: 'WK-5', page: 'fire.ts:pullRound',
    note: 'rounds per pull and the mode\'s wait: the room gates at the record\'s fastest mode, no mode on the wire',
  },
  'throwStart: clear': {
    trust: 'THROW_CLEAR_TRUST_ADAPTATION', row: 'TB-9', todo: 'TB-9', page: 'grenade.ts:startThrow',
    note: 'throwClear, the stance segment against the world',
  },
  'throwStart: power': {
    trust: 'THROW_CLEAR_TRUST_ADAPTATION', row: 'TB-9', todo: 'TB-9', page: 'grenade.ts:startThrow',
    note: 'releasePowerClears; no power on the wire',
  },
  'throwStart: stance': {
    trust: 'THROW_CLEAR_TRUST_ADAPTATION', row: 'TB-9', todo: 'TB-9', page: 'grenade.ts:startThrow',
    note: 'state 3 with no lean clip has no throw',
  },
  'reload: round mode': {
    trust: 'RELOAD_MODE_TRUST_ADAPTATION', row: 'WK-6', todo: 'WK-6', page: 'fire.ts:beginReload',
    note: 'latent: a launcher-round mode\'s reload moves the rifle\'s ring in the room; unreachable with retail data',
  },
};

function viewerSources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { if (name !== 'node_modules') out.push(...viewerSources(path)); }
    else if (/\.ts$/.test(name) && !/\.d\.ts$/.test(name)) out.push(path);
  }
  return out;
}

/** The room members an entry lists (`room.ts:<member>` keys of a mirror, the list of a "no page"). */
function listedMembers(e: Mirror | NoPage): string[] {
  return Array.isArray(e.room) ? e.room : Object.keys(e.room);
}

/**
 * Each entry whose listed room members are not exactly the members its reason is emitted from: one the room emits it
 * from that the entry does not list (a known reason on a new path), and one listed that no longer emits it.
 */
export function memberMismatches(emitted: readonly Refusal[], table: Record<string, Entry>): string[] {
  const byKey = new Map<string, Set<string>>();
  for (const r of emitted) { if (!byKey.has(r.key)) byKey.set(r.key, new Set()); byKey.get(r.key)!.add(`room.ts:${r.member ?? '?'}`); }
  const out: string[] = [];
  for (const [k, e] of Object.entries(table)) {
    if (isTrust(e) || !byKey.has(k)) continue;
    const from = byKey.get(k)!, listed = new Set(listedMembers(e));
    for (const m of from) if (!listed.has(m)) out.push(`${k}: emitted from ${m}, not listed -- cite that path's page check`);
    for (const m of listed) if (!from.has(m)) out.push(`${k}: listed ${m}, which no longer emits it`);
  }
  return out;
}

const pageNames = new Map<string, Set<string> | null>();
/** Whether `<file>:<name>` (or `<file>:<Class>.<method>`) names a file under the viewer's sources declaring that function. */
function pageExists(cite: string): boolean {
  const m = /^([\w/]+\.ts):(\w+(?:\.\w+)?)$/.exec(cite);
  if (!m) return false;
  const file = join(PAGE_DIR, m[1]!);
  if (!pageNames.has(file)) pageNames.set(file, existsSync(file) ? declaredNames(readFileSync(file, 'utf8')) : null);
  return pageNames.get(file)?.has(m[2]!) ?? false;
}

/** Every page cite of an entry, with where it stands. */
function pageCites(key: string, e: Entry): [string, string][] {
  if (isTrust(e)) return [[key, e.page]];
  if (isNoPage(e)) return [];
  return Object.entries(e.room).map(([member, s]) => [`${key} @${member}`, typeof s === 'string' ? s : s.page]);
}

describe('P34 (D1): every room refusal has a page mirror, a named trust, or no page that sends it', () => {
  it('reads literals, template heads, both arms, forwarders and callbacks', () => {
    const room = [
      'class Room {',
      "  a(p) { this.dropped('fire', 'rate', p); this.dropped(ev.type, 'stale', p); this.dropped('throw', `hand ${s}`, p); }",
      "  b(p) { this.dropped('mount', ok ? 'fall' : 'not alive', p); const shut = g(); this.dropped('mount', shut, p); }",
      "  c(p, t, why) { this.dropped('fire', why, p); }",
      "  d(p) { this.c(p, t, 'empty'); const told = (why) => { this.dropped('throw', why, p); }; told('wait'); }",
      "  e(p) { this.dropped('fire', this.refuseRound(p, 1, 0, 2, 1, 'muzzle far', null), p); }",
      "  f = new X({ refused: (why, id) => this.dropped('pickup', why, id) });",
      '}',
    ].join('\n');
    expect(roomRefusals(room).map((r) => `${r.key} @${r.member}`).sort()).toEqual([
      '*: stale @a', 'fire: empty @d', 'fire: muzzle far @e', 'fire: rate @a', 'mount: fall @b', 'mount: not alive @b',
      'mount: {shut} @b', 'pickup: {why} @f', 'throw: hand * @a', 'throw: wait @d',
    ]);
  });

  it("reads a local forwarder in its own function, and a parameter a template wraps (P4's launchRound `told`, beside launchRocket's)", () => {
    const room = [
      'class Room {',
      "  g(p) { const told = (why) => { this.dropped('throw', `round ${why}`, p); }; told('over'); told(ok ? 'speed' : `start ${s}`); }",
      "  h(p) { const told = (why) => { this.dropped('throw', why, p); }; told('wait'); }",
      '}',
    ].join('\n');
    expect(roomRefusals(room).map((r) => `${r.key} @${r.member}`).sort()).toEqual([
      'throw: round over @g', 'throw: round speed @g', 'throw: round start * @g', 'throw: wait @h',
    ]);
  });

  it('reads the functions a page declares: functions, methods, and properties and variables holding one -- nothing else', () => {
    const names = declaredNames([
      'export function a() {}', 'class B { c() {} private d = () => 1; get e() { return 1; } private k = 1; }',
      'const f = { g: () => 1, h: function () {}, l: 2 };', 'const m = () => 1, n = 3;', 'interface H { i(): void; j?(): void; o: () => void }',
    ].join('\n'));
    for (const n of ['a', 'c', 'd', 'g', 'h', 'm', 'B.c', 'B.d']) expect(names.has(n), n).toBe(true);
    for (const n of ['B', 'e', 'k', 'f', 'l', 'n', 'H', 'i', 'j', 'o']) expect(names.has(n), n).toBe(false);
  });

  const emitted = roomRefusals(readFileSync(ROOM, 'utf8'));
  const byKey = new Map<string, Refusal[]>();
  for (const r of emitted) { if (!byKey.has(r.key)) byKey.set(r.key, []); byKey.get(r.key)!.push(r); }

  it('lists every reason room.ts emits, and no reason it no longer emits', () => {
    const missing = [...byKey.keys()].filter((k) => !(k in REFUSAL_MIRRORS))
      .map((k) => `${k} (room.ts:${byKey.get(k)!.map((r) => r.line).join(', ')})`);
    expect(missing, 'a room refusal with no entry: name its page mirror (or the trust) in REFUSAL_MIRRORS').toEqual([]);
    const gone = Object.entries(REFUSAL_MIRRORS).filter(([k, e]) => !isTrust(e) && !byKey.has(k)).map(([k]) => k);
    expect(gone, 'an entry whose reason room.ts no longer emits: remove or rename it').toEqual([]);
    const built = Object.entries(REFUSAL_MIRRORS).filter(([k, e]) => isTrust(e) && byKey.has(k)).map(([k]) => k);
    expect(built, 'a trust the room now refuses itself: make it a mirror entry').toEqual([]);
  });

  it('cites the room members each reason is emitted from', () => {
    expect(memberMismatches(emitted, REFUSAL_MIRRORS)).toEqual([]);
  });

  it("fails a known reason emitted from a new member (the review's mutation: told('swapping') in launchRocket)", () => {
    const text = readFileSync(ROOM, 'utf8');
    const at = "if (at < p.rocketWaitUntil) return told('wait');";
    expect(text.includes(at)).toBe(true);
    const mutated = roomRefusals(text.replace(at, "if (at < p.rocketWaitUntil) { told('swapping'); return told('wait'); }"));
    expect(memberMismatches(mutated, REFUSAL_MIRRORS).some((m) => m.startsWith('throw: swapping:') && m.includes('launchRocket'))).toBe(true);
  });

  it('cites page files and names that exist', () => {
    const cites = Object.entries(REFUSAL_MIRRORS).flatMap(([k, e]) => pageCites(k, e));
    expect(cites.filter(([, c]) => !pageExists(c)).map(([k, c]) => `${k}: ${c}`), 'a cited page predicate is gone: cite the one that holds the line now').toEqual([]);
  });

  it('has no page that sends a request listed as sent by none', () => {
    const pages = viewerSources(PAGE_DIR).map((f) => readFileSync(f, 'utf8'));
    const sent = Object.keys(REFUSAL_MIRRORS).filter((k) => isNoPage(REFUSAL_MIRRORS[k]!)).map((k) => k.split(':')[0]!)
      .filter((kind) => pages.some((t) => t.includes(`type: '${kind}'`)));
    expect(sent, 'a page sends it now: give it a mirror').toEqual([]);
  });

  it('names a trust by its suffix and its row', () => {
    for (const e of Object.values(REFUSAL_MIRRORS)) if (isTrust(e)) { expect(e.trust).toMatch(/^[A-Z][A-Z0-9_]*_TRUST_ADAPTATION$/); expect(e.todo).toBe(e.row); }
  });

  for (const [key, e] of Object.entries(REFUSAL_MIRRORS)) {
    if ('todo' in e && e.todo) it.todo(`${e.todo === 'new' ? 'new (no sweep row)' : e.todo}: ${key} -- ${e.note ?? ''}`);
    if (!isTrust(e) && !isNoPage(e)) {
      for (const [member, s] of Object.entries(e.room)) {
        if (typeof s !== 'string') it.todo(`${s.todo === 'new' ? 'new (no sweep row)' : s.todo}: ${key} @${member} -- ${s.note}`);
      }
    }
  }
});
