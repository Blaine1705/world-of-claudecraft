# Wildheart corpse pose comparison

The production GLB loader renders all five affected Wildheart rigs under identical
lighting and camera framing. Before bytes come from task HEAD `c4b82d1352`; after
bytes are the working-tree assets. `report.json` records joint diagnostics.

| Arrival | Before | After |
|---|---|---|
| Already dead | [Before](before-cold-oblique.png) | [After](after-cold-oblique.png) |
| Attack into death | [Before](before-transitioned-oblique.png) | [After](after-transitioned-oblique.png) |

The animated corpse retains the idle arm posture before collapsing, with every
joint keyed. `tests/wildheart_death_pose.test.mjs` checks grounding, horizontal
torso, arm and knee posture, complete tracks and byte-identical regeneration.
