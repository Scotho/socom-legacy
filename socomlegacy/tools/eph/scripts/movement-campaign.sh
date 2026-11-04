#!/usr/bin/env bash
# The EPH movement campaign and parity matrix: every case below, three trials each, PCSX2 (r0001) beside the page on
# M51, from the saved standing state (slot 8, M51's insertion point); each trial's run directory then measured by
# tools/eph/analyze.ts, and the trials of every case summarised in one matrix CSV. Product track (OT.R53): a
# validation instrument, an adaptation, never in a build and never changing the game's behaviour.
#
# The owner (2026-10-31): "much more time should be spent testing various movement features (and confirming the
# rebinding and prone pop and prone drop mechanics)" -- CASES; and "i noticed the speed was off between the clients. we
# need many creative tests between the clients with notable differences mapped cleanly." -- MATRIX (mx-*). Each case's
# header says what it tests, what to look at and (mx-*) what the analyzer measures.
#
# A heavy run (AGENTS.md, "Layout and local directories", 5): the controller launches it on the owner's host only when
# the host is free -- no gate, no browser run, no playtest beside it -- and it reads the desktop's lock (check only) and
# stops if it is held. It stops on the first trial that fails (the run exits non-zero), as the STM-3 loop did.
#
#   cd socomlegacy && bash tools/eph/scripts/movement-campaign.sh [movement|matrix|all] [run.ts options]
#   cd socomlegacy && bash tools/eph/scripts/movement-campaign.sh all --dry-run    # every plan printed, nothing started
#
# The set defaults to all (CASES, then MATRIX); EPH_TRIALS overrides the three trials. Any further arguments are passed
# to every run (e.g. --base http://localhost:5303, --tail-ms 4000). After the runs the campaign measures each run
# directory (its analysis.csv) and writes $EPH_RUN_DIR/matrix-<stamp>.csv: per case, segment and metric, the median of
# the trials on each side, their spread, the PS2-over-page ratio and difference. A trial's directory is the newest
# under $EPH_RUN_DIR/runs once its run ends (the runs are serial). A campaign stopped part way is measured by hand:
#   node --import tsx tools/eph/analyze.ts <runDir>... --matrix <out.csv>
# Env, as tools/eph/run.ts: SOCOM_PC_ROOT, SOCOM_ISO, EPH_RUN_DIR; the page from a dev server the operator starts.
#
# Rebinding. The scripts are in the original's pad terms, so a pad layout has no meaning for them: --pad-layout
# (standard | machete, tools/eph/live.ts PAD_LAYOUTS) is a live mode remap of the physical pad onto those terms, and a
# script run takes none. The rebinding is confirmed in a live session, the owner's, at his word:
#   node --import tsx tools/eph/run.ts --live --map M51 --state 8 --build r0001 --pad-layout machete
# with the quick drop played by hand (crouch with L2 + Triangle, still, a slight push, Triangle; then the pop), and
# the session's live.script replayed with --script: the replay must show the same drop on both sides, and its
# live.script must name the original's inputs (circle, r3, start), never the physical buttons the layout moved. The
# page's own rebinding (SEPARATE: Prone on Triangle, Crouch on L3, tools/eph/pageSeed.ts) is in every case below.
set -u

CASES=(qpd-drop-a qpd-drop-b qpd-pop-a qpd-pop-b prone-from-stand prone-from-crouch incline-prone incline-qpd light-from-crouch light-from-prone)
MATRIX=(
  mx-stand-fwd-100 mx-stand-back-100 mx-stand-left-100 mx-stand-right-100 mx-stand-fwdleft-100 mx-stand-fwdright-100
  mx-stand-backleft-100 mx-stand-fwd-035 mx-stand-fwd-050 mx-stand-fwd-065 mx-stand-fwd-080 mx-stand-back-050
  mx-stand-left-050 mx-stand-right-050 mx-stand-left-020
  mx-crouch-fwd-050 mx-crouch-fwd-080 mx-crouch-fwd-100 mx-crouch-back-050 mx-crouch-back-100 mx-crouch-left-050
  mx-crouch-right-050 mx-crouch-left-020
  mx-prone-fwd-100 mx-prone-fwd-050 mx-prone-fwd-035 mx-prone-back-100 mx-prone-left-100 mx-prone-right-100
  mx-tap-stand-fwd-100 mx-startstop-stand-fwd-100 mx-startstop-crouch-fwd-050
  mx-long-stand-fwd-100 mx-long-crouch-fwd-050 mx-long-prone-fwd-100
  mx-turn-place-right mx-turn-place-left mx-turn-place-right-short mx-turn-moving-right mx-turn-moving-left
  mx-strafe-circle-left mx-strafe-circle-right
  mx-run-to-crouch mx-run-to-prone mx-crouchwalk-to-prone mx-crouchwalk-to-stand mx-crawl-to-stand
  mx-jump-stand mx-jump-run mx-jump-run-left
  mx-incline-fwd mx-incline-back mx-incline-left mx-incline-right
)
TRIALS="${EPH_TRIALS:-3}"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
web="$(cd "$here/../../.." && pwd)"
cd "$web" || exit 1

set_name=all
case "${1:-}" in movement|matrix|all) set_name="$1"; shift ;; esac
case "$set_name" in
  movement) RUN=("${CASES[@]}") ;;
  matrix) RUN=("${MATRIX[@]}") ;;
  *) RUN=("${CASES[@]}" "${MATRIX[@]}") ;;
esac

dry=0
for a in "$@"; do [ "$a" = "--dry-run" ] && dry=1; done

if [ "$dry" = 0 ] && [ -n "${SOCOM_PC_ROOT:-}" ] && [ -f "$SOCOM_PC_ROOT/scripts/loop_lock.sh" ]; then
  lock="$(bash "$SOCOM_PC_ROOT/scripts/loop_lock.sh" check 2>&1)"
  echo "host lock: $lock"
  case "$lock" in *HELD*) echo "movement-campaign: the host lock is held; not started" >&2; exit 2 ;; esac
fi

for c in "${RUN[@]}"; do
  [ -f "$here/$c.txt" ] || { echo "movement-campaign: no script $here/$c.txt" >&2; exit 1; }
done

newest_run() { ls -1d "${EPH_RUN_DIR:-.}"/runs/*/ 2>/dev/null | sort | tail -1; }
dirs=()
for c in "${RUN[@]}"; do
  for i in $(seq 1 "$TRIALS"); do
    echo "=== movement-campaign: $c trial $i of $TRIALS"
    before="$(newest_run)"
    if ! node --import tsx tools/eph/run.ts --script "tools/eph/scripts/$c.txt" --map M51 --state 8 --build r0001 \
        --question "$c-$i" "$@"; then
      echo "movement-campaign: $c trial $i failed; stopped" >&2
      exit 1
    fi
    after="$(newest_run)"
    if [ "$dry" = 0 ] && [ -n "$after" ] && [ "$after" != "$before" ]; then dirs+=("${after%/}"); fi
  done
done
echo "movement-campaign: ${#RUN[@]} cases x $TRIALS trials done ($set_name)"

if [ "$dry" = 0 ] && [ "${#dirs[@]}" -gt 0 ]; then
  out="${EPH_RUN_DIR:-.}/matrix-$(date -u +%Y%m%dT%H%M%SZ).csv"
  node --import tsx tools/eph/analyze.ts "${dirs[@]}" --matrix "$out" || { echo "movement-campaign: the analysis failed" >&2; exit 1; }
fi
