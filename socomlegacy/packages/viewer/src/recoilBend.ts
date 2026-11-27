/**
 * Research 442 (LATER 1144; INTAKE 129): the shooter's body bends with each round -- the original's picture of recoil on
 * the body, which the port read (`RecoilPct`) and drew nothing with.
 *
 * - **The value** (body `+0x378`): each round fired in a view of 0-3 (`recoilAdds`, R4P-256) adds the weapon's
 *   `RecoilPct` (weapon `+0x6c`, `FUN_003d2000` D:L324561-324565; `WeaponRecord.recoilPct`), clamped at `RECOIL_BEND_CAP`
 *   (`FUN_0057d510` D:L440319-440327, from the round's fire `FUN_005c3360` D:L477806-477807). Each body tick (`FUN_0057b550` D:L439621-439636, from
 *   `CZSealBody_Tick_0` `FUN_0057a330` D:L439196, after the head look and the aim's twist, before the run's bank) it
 *   falls by `RECOIL_BEND_DECAY` x itself x body `+0x2e0` (`RECOIL_BEND_TIME_BASE_READING`) and is 0 under
 *   `RECOIL_BEND_FLOOR`.
 * - **The pose** (`FUN_0057b550` D:L439666-440316): with a rifle or a pistol in the hand (`+0xf79` 1 or 2) one of six
 *   tables -- the stance (`+0x174`, else `+0x374`) by the hand -- turns 21 bones, each by `bendQuat(v, axis)`
 *   (`FUN_003066d0`) composed before the node's own rotation (`FUN_003070c0`, normalised `FUN_003072e0`), and adds
 *   `v x offset` to the translation of a few (`FUN_00309240`): `layBend`. A row with no axis keeps the default rotation
 *   (`DAT_003f6460`, the node constructor's default rotation -- the identity, D:L135856-135859; research 442 section 2).
 * - **Picture only** (the main controller's ruling, 2026-11-16): for a rifle `skel_root` -- the camera's node and the eye's
 *   -- takes no offset, so no round moves; the room's hit volumes do not take the bend until a capture
 *   (`RECOIL_BEND_REMOTE_READING`, `RECOIL_BEND_ROOT_TO_CAMERA_READING`; the emplaced branch `FUN_003a7330`, D:L439633-
 *   439642, not built: research 442 section 7).
 */
type Vec3 = [number, number, number];
type Quat = [number, number, number, number];

/** `FUN_0057d510` D:L440324-440326: the body's recoil value is clamped at 10.0. */
export const RECOIL_BEND_CAP = 10;
/** `FUN_0057b550` D:L439627: each tick `v += v x -1.1 x body+0x2e0`. */
export const RECOIL_BEND_DECAY = 1.1;
/** `FUN_0057b550` D:L439623, D:L439629: under 0.01 the value is set to 0. */
export const RECOIL_BEND_FLOOR = 0.01;
/**
 * RECOIL_BEND_TIME_BASE_READING: what body `+0x2e0` (the decay's multiplier, D:L439627) is per second of the tick --
 * read as the tick's seconds (1: `v` falls at 1.1 a second, a time constant near 0.9 s) [reading: `+0x2e0`'s writer is
 * `CZSealBody::PreTick` `FUN_00551ec0`, which stores its time argument there (D:L418488; r0004 D4:L457192; R4P-256 r48 --
 * the three lines once cited here are `CMPInfoBox::Init`, a camera constructor and `CCharacterType::Parse`); relay-1's
 * capture read `+0x2e0` = 0.03337, the frame's seconds, and the fall x0.96329 a frame (research 442 s6a); whether every
 * caller passes seconds is unread; research 442 section 7].
 */
export const RECOIL_BEND_TIME_BASE_READING = 1;
/**
 * RECOIL_BEND_REMOTE_READING: whether the others' bodies bend on this page -- not built (false) [reading: whether each
 * console runs `FUN_005c3360` for a remote shooter, and so `FUN_0057d510` on that body, is unread; body `+0xe0` bit 5,
 * which gates `FUN_0057b550` (D:L439621), is unread; research 442 section 7].
 */
export const RECOIL_BEND_REMOTE_READING = false;
/**
 * RECOIL_BEND_ROOT_TO_CAMERA_READING: whether `skel_root`'s offset (the stand-pistol table only) reaches the camera and the
 * first-person eye (`WalkMode.setPosedRoot`) -- not handed over (false) [reading: whether the camera reads `skel_root`'s
 * node before or after `FUN_0057b550` in the tick is unread; under 0.03 u at a pistol's 0.1 a round; research 442 s7].
 */
export const RECOIL_BEND_ROOT_TO_CAMERA_READING = false;
/**
 * RECOIL_BEND_MUZZLE_READING: whether the muzzle (the round's leg, the tracer's start, the accuracy pip's muzzle ray) and
 * the launch point follow the bent gun -- not (false): the port keeps the unbent arm chain's (`Play.unbent`; the main
 * controller's ruling (B), 2026-11-17) [reading: whether the original's firepoint (`+0x14b0`) is posed after
 * `FUN_0057b550` is unread; the rig's read of `+0x14b0` through a held pull against `+0x378` settles it; research 442 s7].
 */
export const RECOIL_BEND_MUZZLE_READING = false;

/**
 * RECOIL_BEND_VIEW_GATE_READING (R4P-256 SCOPED-RECOIL): whether a round's bend add takes `CZKit::Recoil`'s view gate --
 * on (true). `FUN_005c3360` adds the body's recoil value (`FUN_0057d510`, D:L477806-477807) only inside its test of body
 * `+0x200`, the zoom state (`SetCurZoomState` `FUN_005448a0` its one writer, D:L410938-410941): below 5 and not 4
 * (D:L477752-477753; r0004 `FUN_005ca830` D4:L519757-519758, identical, its callees mapped). `CZKit::Fire` `FUN_005c5340`
 * keeps a scope (a view over 4) up on a pull's first round (kit `+0x818` < 2) and sets the view to 1 on a later one, both
 * before Recoil (D:L479399-479406; D4:L521470-521476): so a scoped pull's first round adds nothing and its later rounds
 * do; binoculars (4) never add [reading: static, both exports, pending review; capture Q-256 (body `+0x378` beside
 * `+0x200` and kit `+0x818` through a scoped single round and a scoped burst) settles it; research 442 section 7].
 */
export const RECOIL_BEND_VIEW_GATE_READING = true;

/**
 * Whether a round fired at `zoomState` (body `+0x200` at Recoil's time, after `FUN_005c5340`'s drop) adds its
 * `RecoilPct`: `FUN_005c3360` D:L477752-477753, below 5 and not 4 (0 third person, 1-2 first person and thermal, 3 night
 * vision; not 4 the binoculars, nor 5-12 the scope's levels). `RECOIL_BEND_VIEW_GATE_READING` off: every round adds.
 */
export function recoilAdds(zoomState: number): boolean {
  if (!RECOIL_BEND_VIEW_GATE_READING) return true;
  return zoomState < 5 && zoomState !== 4;
}

/** The body's recoil value (`+0x378`): `add` per round (`FUN_0057d510`), `step` per tick (`FUN_0057b550`). */
export class RecoilBend {
  value = 0;

  /** A round fired: + the weapon's `RecoilPct`, clamped at `RECOIL_BEND_CAP` (D:L440322-440326). */
  add(recoilPct: number): void {
    this.value += recoilPct;
    if (this.value >= RECOIL_BEND_CAP) this.value = RECOIL_BEND_CAP;
  }

  /** The tick (D:L439622-439632): 0 under the floor; else the decay, and 0 again under the floor. */
  step(dt: number): void {
    if (this.value < RECOIL_BEND_FLOOR) { this.value = 0; return; }
    this.value += this.value * -RECOIL_BEND_DECAY * dt * RECOIL_BEND_TIME_BASE_READING;
    if (this.value < RECOIL_BEND_FLOOR) this.value = 0;
  }

  reset(): void {
    this.value = 0;
  }
}

/** `FUN_003066d0(v, q, a)`: `q = (sin(v|a|) a/|a|, cos(v|a|))`; a zero axis gives the identity. */
export function bendQuat(v: number, a: readonly number[]): Quat {
  const n = Math.hypot(a[0]!, a[1]!, a[2]!);
  if (n === 0) return [0, 0, 0, 1];
  const s = Math.sin(v * n) / n;
  return [a[0]! * s, a[1]! * s, a[2]! * s, Math.cos(v * n)];
}

/** One bone of a table: its name, its axis (null: the default rotation) and its offset per unit of `v`. */
export interface BendRow {
  readonly bone: string;
  readonly axis: readonly number[] | null;
  readonly offset: readonly number[];
}

const f32 = (w: number): number => new Float32Array(new Uint32Array([w]).buffer)[0]!;

/** The transcription: per table, per bone in `FUN_0057b550`'s order (D:L440183-440316), the axis's three words and the offset. */
const WORDS: Record<string, [string, readonly number[] | null, readonly number[]][]> = {
  // D:L439718-439792
  'stand/rifle': [
    ['skel_root', null, [0, 0, 0]],  // default
    ['hips', null, [0.011489, 0, 0.075324]],  // default
    ['spinelo', [0x3bb0856e, 0xbc52ed78, 0x3bd04e62], [0, 0, 0]],  // D:L439728
    ['spinehi', [0xbba7b4e5, 0xb9e9d51b, 0x37fba882], [0, 0, 0]],  // D:L439732
    ['lbicep', [0x3c0155d6, 0xbb87a073, 0x3ae62995], [0, 0, 0]],  // D:L439736
    ['lforearm', [0x00000000, 0x00000000, 0xbc95dd4c], [0, 0, 0]],  // D:L439740
    ['lhand', [0x3b40df59, 0x3c2187a5, 0x3cb634db], [0, 0, 0]],  // D:L439744
    ['rbicep', [0x3a9d6adf, 0x3c217b0f, 0xbc793bc1], [-0.102813, -0.130555, -0.039765]],  // D:L439748
    ['rforearm', [0x00000000, 0x00000000, 0x3ca4a490], [0, 0, 0]],  // D:L439752
    ['rhand', [0x3cef9db2, 0xbbd002e2, 0xbcb2e59b], [0, 0, 0]],  // D:L439756
    ['lshoulder_wgt', [0x3c00a9df, 0xbb76be38, 0x3b0df373], [0, 0, 0]],  // D:L439764
    ['rshoulder_wgt', [0x3a1203a3, 0x3d02edbb, 0xbc89203a], [-0.102813, -0.130555, -0.039766]],  // D:L439760
    ['rscap', [0xbd0ef34d, 0x3cee0f3d, 0xbba979e1], [0, 0, 0]],  // D:L439768
    ['neck', null, [0, 0, 0]],  // default
    ['head', null, [0, 0, 0]],  // default
    ['lthigh', [0xbac23fab, 0xb9f88334, 0xbb58ba41], [0, 0, 0]],  // D:L439772
    ['lcalf', [0x00000000, 0x00000000, 0xbbb68cef], [0, 0, 0]],  // D:L439776
    ['lfoot', [0x39991794, 0x3b6eae9f, 0x3bb47410], [0, 0, 0]],  // D:L439780
    ['rthigh', [0x3c0090b4, 0x3ac6b485, 0xbb34bf90], [0, 0, 0]],  // D:L439784
    ['rcalf', [0x00000000, 0x00000000, 0x3c4918e3], [0, 0, 0]],  // D:L439788
    ['rfoot', [0xb9302928, 0x3b84944f, 0xbb9efd87], [0, 0, 0]],  // D:L439792
  ],
  // D:L439795-439871
  'stand/pistol': [
    ['skel_root', null, [0.005375, 0.059233, 0.075169]],  // default
    ['hips', null, [0, 0, 0]],  // default
    ['spinelo', [0xb92aeafb, 0xb88a697b, 0xb941fc8f], [0, 0, 0]],  // D:L439807
    ['spinehi', [0x382393ee, 0xb8a5accd, 0x3914e5d6], [0, 0, 0]],  // D:L439811
    ['lbicep', [0x3c0b2639, 0x3d258927, 0xbd39fcb1], [0, 0, 0]],  // D:L439815
    ['lforearm', [0xb60637bd, 0x00000000, 0xbc66cd29], [0, 0, 0]],  // D:L439819
    ['lhand', [0x3c00f990, 0xbc0b8f15, 0xbc8285ec], [0, 0, 0]],  // D:L439823
    ['rbicep', [0xbadf9bdc, 0x3c82b40f, 0xbd387161], [-0.033543, -0.095054, -0.053353]],  // D:L439827
    ['rforearm', [0x00000000, 0x00000000, 0xbac75c4b], [0, 0, 0]],  // D:L439831
    ['rhand', [0xba8e581d, 0x3d32dd37, 0xbba2e3c5], [0, 0, 0]],  // D:L439835
    ['lshoulder_wgt', [0x3c2dd591, 0x3d98eb03, 0xbcbd5bab], [0, 0, 0]],  // D:L439843
    ['rshoulder_wgt', [0xbbd93815, 0xbc9ce076, 0xbd8005c4], [-0.033543, -0.095054, -0.053353]],  // D:L439839
    ['rscap', [0xbcf60179, 0x3c1103c9, 0x3b4bd124], [0, 0, 0]],  // D:L439847
    ['neck', null, [0, 0, 0]],  // default
    ['head', null, [0, 0, 0]],  // default
    ['lthigh', [0xbbf240fb, 0x3a8cc576, 0xb9ecfa6a], [0, 0, 0]],  // D:L439851
    ['lcalf', [0x00000000, 0x00000000, 0xbca5aab4], [0, 0, 0]],  // D:L439855
    ['lfoot', [0x39302928, 0x3ad73861, 0x3c53bafe], [0, 0, 0]],  // D:L439859
    ['rthigh', [0xbb37f5a5, 0xbb045133, 0xbb991794], [0, 0, 0]],  // D:L439863
    ['rcalf', [0x00000000, 0x00000000, 0xbc58be73], [0, 0, 0]],  // D:L439867
    ['rfoot', [0x39aaeafb, 0x3b88ce70, 0x3c16b767], [0, 0, 0]],  // D:L439871
  ],
  // D:L439879-439952
  'crouch/rifle': [
    ['skel_root', null, [0, 0, 0]],  // default
    ['hips', null, [-0.000467, 0, 0.094615]],  // default
    ['spinelo', [0x3cd594f2, 0x3a25accd, 0xbbab5808], [0, 0, 0]],  // D:L439889
    ['spinehi', [0xbbd76252, 0xbc186b9c, 0x3c7d9fd3], [0, 0, 0]],  // D:L439893
    ['lbicep', [0x3bf38822, 0xbbe789e7, 0x3c0e79ab], [0, 0, 0]],  // D:L439897
    ['lforearm', [0x00000000, 0x00000000, 0xbd180c31], [0, 0, 0]],  // D:L439901
    ['lhand', [0x3b416590, 0xbb3e2f7b, 0x3cb8c543], [0, 0, 0]],  // D:L439905
    ['rbicep', [0xbb55d80e, 0x3a3fe3b0, 0xb8e27e0f], [-0.082743, -0.071263, -0.025372]],  // D:L439909
    ['rforearm', [0x00000000, 0x00000000, 0xbb84406c], [0, 0, 0]],  // D:L439913
    ['rhand', null, [0, 0, 0]],  // default
    ['lshoulder_wgt', [0x3bcaa327, 0xbc2a8a83, 0x3bdbb59e], [0, 0, 0]],  // D:L439924
    ['rshoulder_wgt', [0xbbb28d86, 0x3d10129d, 0xbbf5d356], [-0.082744, -0.071263, -0.025372]],  // D:L439920
    ['rscap', [0xbc90f0e9, 0x3cb4c7f3, 0xbb8c2e77], [0, 0, 0]],  // D:L439928
    ['neck', null, [0, 0, 0]],  // default
    ['head', null, [0, 0, 0]],  // default
    ['lthigh', [0x3b613f4b, 0x3a206ea0, 0xbb2a53fc], [0, 0, 0]],  // D:L439932
    ['lcalf', [0x00000000, 0x358637bd, 0xbbfde2ef], [0, 0, 0]],  // D:L439936
    ['lfoot', [0x3a1bf9c6, 0x3a42c5e3, 0x3c4486ad], [0, 0, 0]],  // D:L439940
    ['rthigh', [0x3c209cc3, 0x3bd844d0, 0xbbfb5d03], [0, 0, 0]],  // D:L439944
    ['rcalf', [0x00000000, 0x00000000, 0x3c209460], [0, 0, 0]],  // D:L439948
    ['rfoot', [0x3925accd, 0x38e6afcd, 0x3b8c79f6], [0, 0, 0]],  // D:L439952
  ],
  // D:L439955-440024
  'crouch/pistol': [
    ['skel_root', null, [0, 0, 0]],  // default
    ['hips', null, [0, -1e-06, 0.131876]],  // default
    ['spinelo', [0x3be631f9, 0xbb081e47, 0x39473abd], [0, 0, 0]],  // D:L439961
    ['spinehi', [0xbbaa758a, 0xba2569b1, 0x3950aaa8], [0, 0, 0]],  // D:L439965
    ['lbicep', [0x3c89d495, 0x3cc5197a, 0xbca1e3eb], [0, 0, 0]],  // D:L439969
    ['lforearm', [0x358637bd, 0x00000000, 0xbc49e668], [0, 0, 0]],  // D:L439973
    ['lhand', [0x3d4d0460, 0xbd1f47fa, 0xbcbc5586], [0, 0, 0]],  // D:L439977
    ['rbicep', [0xbc209cc3, 0x3c3c6a7f, 0xbc29cdc4], [0, 0, 0]],  // D:L439981
    ['rforearm', [0xb60637bd, 0x00000000, 0xbd1043e5], [0, 0, 0]],  // D:L439985
    ['rhand', [0xbc9b5200, 0x3d9b1b7a, 0xbca0c8cd], [0, 0, 0]],  // D:L439989
    ['lshoulder_wgt', [0x3c68bc17, 0x3c4197e5, 0xbd05d95e], [0, 0, 0]],  // D:L439997
    ['rshoulder_wgt', [0xbc30fadf, 0x3c1ed7c7, 0xbc3ccaf7], [0, 0, 0]],  // D:L439993
    ['rscap', null, [0, 0, 0]],  // default
    ['neck', null, [0, 0, 0]],  // default
    ['head', null, [0, 0, 0]],  // default
    ['lthigh', [0x3b999dcb, 0xb9d9945b, 0xbabe9425], [0, 0, 0]],  // D:L440004
    ['lcalf', [0xb58637bd, 0xb58637bd, 0xbc2f1cb9], [0, 0, 0]],  // D:L440008
    ['lfoot', [0xba07ca64, 0xba25efe9, 0x3c7eb4a6], [0, 0, 0]],  // D:L440012
    ['rthigh', [0x3c4e8d97, 0x3bc9320e, 0xbbed1394], [0, 0, 0]],  // D:L440016
    ['rcalf', [0x00000000, 0x00000000, 0x3c6f8ceb], [0, 0, 0]],  // D:L440020
    ['rfoot', [0x3adc5500, 0x3adf9bdc, 0x3a7fda40], [0, 0, 0]],  // D:L440024
  ],
  // D:L440037-440110
  'prone/rifle': [
    ['skel_root', null, [0, 0, 0]],  // default
    ['hips', null, [0, 0, 0.031129]],  // default
    ['spinelo', null, [0, 0, 0]],  // default
    ['spinehi', null, [0, 0, 0]],  // default
    ['lbicep', [0x3c005e5f, 0xbc00cf9e, 0xbc008851], [0, 0, 0]],  // D:L440047
    ['lforearm', [0x00000000, 0x00000000, 0xbd2d7625], [0, 0, 0]],  // D:L440051
    ['lhand', [0x3bfc58ac, 0xbb29de8b, 0x3d02e233], [0, 0, 0]],  // D:L440055
    ['rbicep', [0xb9712c28, 0xb92bf76a, 0xbc164a5a], [-0.032738, -0.002479, -0.016733]],  // D:L440059
    ['rforearm', [0x00000000, 0x00000000, 0xbc76ceff], [0, 0, 0]],  // D:L440063
    ['rhand', null, [0, 0, 0]],  // default
    ['lshoulder_wgt', [0x3c873de2, 0x3b58665e, 0xbb2efb2b], [0, 0, 0]],  // D:L440074
    ['rshoulder_wgt', [0x3866afcd, 0x3a83ba34, 0xbc198d04], [-0.032737, -0.002479, -0.016733]],  // D:L440070
    ['rscap', [0xbb0b75ea, 0x3c09656f, 0x3b3f7f06], [0, 0, 0]],  // D:L440078
    ['neck', [0x3b17fa5d, 0xba356755, 0xbb01c2e3], [0, 0, 0]],  // D:L440082
    ['head', [0x3b7f64d0, 0x3a8f648c, 0xbc2b10ba], [0, 0, 0]],  // D:L440086
    ['lthigh', [0x3bce5f74, 0xbba8650e, 0xbb630447], [0, 0, 0]],  // D:L440090
    ['lcalf', [0x00000000, 0x00000000, 0x3c8d77b8], [0, 0, 0]],  // D:L440094
    ['lfoot', [0x386f1349, 0x3a03558a, 0xbc0a6549], [0, 0, 0]],  // D:L440098
    ['rthigh', [0x3b42a455, 0x39a84be4, 0x3b0cf7cb], [0, 0, 0]],  // D:L440102
    ['rcalf', [0x00000000, 0x00000000, 0x3b64c943], [0, 0, 0]],  // D:L440106
    ['rfoot', [0xb9913a50, 0xb9798fa3, 0x39334e77], [0, 0, 0]],  // D:L440110
  ],
  // D:L440113-440179
  'prone/pistol': [
    ['skel_root', null, [0, 0, 0]],  // default
    ['hips', null, [0, 0, 0.036443]],  // default
    ['spinelo', null, [0, 0, 0]],  // default
    ['spinehi', null, [0, 0, 0]],  // default
    ['lbicep', [0x3b9363f5, 0xbbb64170, 0xbc05271c], [0, 0, 0]],  // D:L440123
    ['lforearm', [0x00000000, 0x00000000, 0xbc947065], [0, 0, 0]],  // D:L440127
    ['lhand', [0x3d778fef, 0xbd026784, 0xbccfbfc6], [0, 0, 0]],  // D:L440131
    ['rbicep', [0x3b30f27c, 0xbae4da0a, 0x3a7f10ed], [-0.041599, 0.000939, -0.023483]],  // D:L440135
    ['rforearm', [0xb58637bd, 0x00000000, 0xbc4896dd], [0, 0, 0]],  // D:L440139
    ['rhand', [0xbd0929aa, 0x3c9ea359, 0xbd8ce67d], [0, 0, 0]],  // D:L440143
    ['lshoulder_wgt', [0x3bc93a71, 0xbb81c2e3, 0xbbf3b214], [0, 0, 0]],  // D:L440151
    ['rshoulder_wgt', [0x3bb55ef2, 0x3aa5ce5b, 0x3a8a8b09], [-0.041599, 0.000939, -0.023483]],  // D:L440147
    ['rscap', [0xbaf62739, 0x3c34e981, 0x3b770154], [0, 0, 0]],  // D:L440155
    ['neck', null, [0, 0, 0]],  // default
    ['head', null, [0, 0, 0]],  // default
    ['lthigh', [0x3befb2ab, 0xbbc3c18b, 0xbb83f4ed], [0, 0, 0]],  // D:L440159
    ['lcalf', [0x00000000, 0xb58637bd, 0x3ca467be], [0, 0, 0]],  // D:L440163
    ['lfoot', [0x388e9b39, 0x3a199dcb, 0xbc20e411], [0, 0, 0]],  // D:L440167
    ['rthigh', [0x3b63ef28, 0x39c521de, 0x3b2515cf], [0, 0, 0]],  // D:L440171
    ['rcalf', [0x00000000, 0x00000000, 0x3b85e3da], [0, 0, 0]],  // D:L440175
    ['rfoot', [0xb9a9de8b, 0xb99246bf, 0x3954dc66], [0, 0, 0]],  // D:L440179
  ],
};

/** The six tables (`stand/rifle` ... `prone/pistol`), the axes as the floats the source's words hold. */
export const RECOIL_BEND_TABLES: Readonly<Record<string, readonly BendRow[]>> = Object.freeze(Object.fromEntries(
  Object.entries(WORDS).map(([name, rows]) => [name, Object.freeze(rows.map(([bone, words, offset]) => Object.freeze({
    bone, axis: words ? Object.freeze(words.map(f32)) : null, offset: Object.freeze([...offset]),
  })))]),
));

/** The table for a stance and the hand's item (`+0xf79`: 1 the rifle, 2 the pistol); none with no gun in the hand. */
export function bendTable(stance: string, hand: string | null): readonly BendRow[] | null {
  if (hand !== 'rifle' && hand !== 'pistol') return null;
  // Stand, crouch, prone (`+0x174`, else `+0x374`, 0 / 1 / 2); any other: no pose (D:L439666-439681).
  if (stance !== 'stand' && stance !== 'crouch' && stance !== 'prone') return null;
  return RECOIL_BEND_TABLES[`${stance}/${hand}`] ?? null;
}

/**
 * One bone's bend laid on its local rotation and translation (`FUN_003070c0(bend, node+0x20, out)` -- the Hamilton
 * product, the bend first, `FUN_003072e0` normalising into the node; `FUN_00309240(node, v x offset, node)`).
 */
export function layBend(q: readonly number[], t: readonly number[], row: Pick<BendRow, 'axis' | 'offset'>, v: number): { q: Quat; t: Vec3 } {
  const tOut: Vec3 = [t[0]! + row.offset[0]! * v, t[1]! + row.offset[1]! * v, t[2]! + row.offset[2]! * v];
  if (!row.axis) return { q: [q[0]!, q[1]!, q[2]!, q[3]!], t: tOut };
  const b = bendQuat(v, row.axis);
  const out: Quat = [
    b[3] * q[0]! + b[0] * q[3]! + b[1] * q[2]! - b[2] * q[1]!,
    b[3] * q[1]! - b[0] * q[2]! + b[1] * q[3]! + b[2] * q[0]!,
    b[3] * q[2]! + b[0] * q[1]! - b[1] * q[0]! + b[2] * q[3]!,
    b[3] * q[3]! - b[0] * q[0]! - b[1] * q[1]! - b[2] * q[2]!,
  ];
  const n = Math.hypot(out[0], out[1], out[2], out[3]) || 1;
  return { q: [out[0] / n, out[1] / n, out[2] / n, out[3] / n], t: tOut };
}

/**
 * `layBend` undone (the main controller's ruling (B): the muzzle from the unbent arm chain, `Play.unbent`): the local
 * rotation and translation before the bend, from the drawn ones. `pre` is a turn laid after the bend before the node's
 * rotation (the run's bank on `spinelo`, `Animator.aim`): drawn `q' = pre b q`, and `pre b^-1 pre^-1 q' = pre q` -- the
 * bank stays, only the bend goes. `t = t' - v x offset`.
 */
export function unlayBend(
  q: readonly number[], t: readonly number[], row: Pick<BendRow, 'axis' | 'offset'>, v: number, pre: readonly number[] = [0, 0, 0, 1],
): { q: Quat; t: Vec3 } {
  const tOut: Vec3 = [t[0]! - row.offset[0]! * v, t[1]! - row.offset[1]! * v, t[2]! - row.offset[2]! * v];
  const b = row.axis ? bendQuat(v, row.axis) : ([0, 0, 0, 1] as Quat);
  const mul = (a: readonly number[], c: readonly number[]): Quat => [
    a[3]! * c[0]! + a[0]! * c[3]! + a[1]! * c[2]! - a[2]! * c[1]!,
    a[3]! * c[1]! - a[0]! * c[2]! + a[1]! * c[3]! + a[2]! * c[0]!,
    a[3]! * c[2]! + a[0]! * c[1]! - a[1]! * c[0]! + a[2]! * c[3]!,
    a[3]! * c[3]! - a[0]! * c[0]! - a[1]! * c[1]! - a[2]! * c[2]!,
  ];
  const conj = (a: readonly number[]): Quat => [-a[0]!, -a[1]!, -a[2]!, a[3]!];
  return { q: mul(pre, mul(conj(b), mul(conj(pre), q))), t: tOut };
}
