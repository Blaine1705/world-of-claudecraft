# Handoff prompt: v0.34.0 re-target + post-packet scoping session

Paste everything below the line into a fresh Fable session.

---

Run the v0.34.0 re-target and the post-packet SCOPING pass for the
professions tuning packet in the git worktree ~/wt/prof-packet (branch
feature/professions-tuning-packet, LOCAL, never pushed; do not push, do
not open a PR). Ultracode, NEW session, fresh eyes. This is a PLANNING
session first: investigate, then draft the new phase files and get the
worklist settled with the maintainer BEFORE any build phase starts.

Entry tip should be bdf53f1b60 (the phase 18 docs close; gate tip
d8b9496744, PASS all 11 steps exit 0). FIRST ACTION: check the
worktree's checked-out branch (git -C ~/wt/prof-packet rev-parse
--abbrev-ref HEAD); earlier sessions have three times found it switched
or dirtied by parallel work; if it is not
feature/professions-tuning-packet, inspect the reflog, confirm no WIP,
and restore it before anything else.

Read FIRST, in this order: the professions-tuning-packet-phase18 memory
file (its Gotchas are load-bearing: kill waves leave fake-dry/fake-
CONFIRMED artifacts in workflow summaries, read the journal; a process
restart orphans the agent registry, harvest unread reports from
subagents/agent-*.jsonl; per-value bounds are not aggregate bounds and
shared bounds hoist ABOVE early-exit continues; after any module-scope
import change re-run every test file that vi.mocks that module; judge
gates by their own explicit exit line, never a pipeline's), then the
doc's Phase 18 COMPLETE block and the maintainer decision list inside
it (docs/design/professions-tuning-packet-review.md), then the
professions-tuning-packet-phase16-qa memory for the fan-out shape.

PREAMBLE, before any scoping: release/v0.33.0 has MERGED TO MAIN and
the new integration base is release/v0.34.0. git fetch origin, confirm
release/v0.34.0 exists, merge it into the branch, resolve (on a
both-sides fix collision take the RELEASE side wholesale, the
terrorspark precedent), run the release-merge-audit skill over the
merge, and get npm run gate green BEFORE scoping. Expect the 5x map
expansion in this delta: the merge audit should specifically flag what
it does to the packet's node placements, zone-scaling pins, wire-budget
measurements, and the R37 guard.

CONCURRENT-SESSION RULE, standing for this whole effort: another
session is generating large numbers of images to replace placeholder
icons/art IN THE SAME WORKTREE. Ignore all uncommitted churn under
public/, docs/screenshots/, and any *_icons/art asset paths plus
MISSING_ICONS.md; never stage, revert, stash, or commit it; stage your
own work by explicit path only and diff the staged set before every
commit.

The scoping items, from the maintainer (2026-08-01), each to be
investigated against the merged tree and written up as a numbered phase
in the review doc's style (scope, acceptance, tests, reviewers), with
open questions collected into a decision list rather than answered
unilaterally:

1. BANK "Deposit materials": the definition predates the packet's
   material explosion. It should deposit MATERIALS ONLY: with fine
   grades, charms, and the new catalog, audit what the current
   predicate matches, define the materials taxonomy honestly (gathered
   materials, fine grades, vendor staples? never tools, never charms,
   never equipment), and spec the fix plus its pins.

2. THE 5x MAP vs gathering content: the world just grew five-fold.
   Audit that every placed gathering node and fishing spot is still
   ACCESSIBLE (the placement validation test family exists:
   tests/gather_node_placement.test.ts) and WELL SPREAD at the new
   scale; the quest-critical mining node MUST stay close to its quest
   (q_prof_intro's objective range); and bring a measured proposal for
   whether the bottom-map zones need additional nodes so they do not
   feel empty (node density per zone area before/after, travel-time
   deltas, plus the D5 six-per-type-per-zone target as the baseline).
   Flag any placement the 5x scale broke as a blocker for the packet
   merge decision if it lands before this work.

3. VENDOR BUY MULTIPLES: buy 1x / 5x / 10x / custom-amount in stores.
   Scope the wire command shape (the buy command today buys one row
   unit), capacity pre-checks, price arithmetic and overflow guards,
   the UI on desktop AND mobile (touch targets, the confirm family),
   stale-client compatibility for the deploy window, and the i18n keys.
   Check how buyback and the delve Marks shop relate before widening.

4. NEW PHASE FILES: draft these as the next numbered phases in
   docs/design/professions-tuning-packet-review.md (or propose a
   successor worklist doc if the maintainer prefers a clean packet
   boundary; ask, do not assume), each with the standing cadence: build
   phase then QA phase in a NEW session, reviewers named, gate green
   per phase.

Standing rules, unchanged: findings are ALL applied (blocking,
should-fix, AND nits) once building starts, and fixes are reviewed as
unreviewed code; every sim or server change gets a test; never
hand-edit generated files; commits with scope and body, no session
trailers, no em dashes, no emojis (locale VALUES keep their native
typography); the branch stays LOCAL, no push, no PR without the
maintainer's explicit go; the locale fill remains deferred past the
packet; and the phase 18 maintainer decision list (in the doc record)
still awaits the merge decision, which this scoping session must not
preempt.

Finish with: the merge + audit + gate green recorded, a written scoping
document per item with the proposed phase files drafted into the review
doc, the open decision list presented to the maintainer, and a
prof-packet-v034-scoping memory file with any new gotchas, ending with
NEXT = the maintainer settles the new worklist (and separately, the
packet merge decision).
