# Gravewyrm Sanctum surface feedback

Matched offline-game captures using `scripts/gravewyrm_sanctum_shot.mjs`.
Before: PR 4352 head `c4b82d1352`. After: this contribution's working tree.
Desktop is 1600x900, Ultra (preset 4). Mobile is an 844x390 landscape
viewport, not a physical-device performance measurement. The surface harness
requested preset 1, but did not set the first-run graphics marker: runtime
auto-detection can override that choice. These surface images therefore prove
viewport readability, not Low-tier coverage. The separately verified Low portal
capture below checks its active runtime tier.

| Surface | Desktop before | Desktop after | Mobile before | Mobile after |
| --- | --- | --- | --- | --- |
| Frost terrace | [Before](before_frost_platform.png) | [After](after_frost_platform.png) | [Before](before_mobile_frost_platform.png) | [After](after_mobile_frost_platform.png) |
| Both anchor chains | [Before](before_anchor_hang.png) | [After](after_anchor_hang.png) | [Before](before_mobile_anchor_hang.png) | [After](after_mobile_anchor_hang.png) |
| Chain bridge ice | [Before](before_bridge_ice.png) | [After](after_bridge_ice.png) | [Before](before_mobile_bridge_ice.png) | [After](after_mobile_bridge_ice.png) |

The terrace has shallow, matte frost fractures. Both loose chains bend over
the cliff and hang down. The opened bridge has a continuous textured ice
walkway; entering interest after the gate was opened snaps to that state.
Actual observed gate changes retain their reveal animation.

Use this `SHOT_JSON` with the helper for either revision:

```json
[
  {"id":"frost_platform","at":[-82,-40],"face":3.14159,"yaw":3.14159,"pitch":0.55,"dist":26},
  {"id":"anchor_hang","at":[62,-102],"face":1.9,"yaw":1.9,"pitch":0.55,"dist":28},
  {"id":"bridge_ice","at":[0,30],"face":3.14159,"yaw":3.14159,"pitch":0.5,"dist":27}
]
```

Set `SHOT_URL` to the corresponding local Vite server and `SHOT_PREFIX` to
`before_` or `after_`; mobile also sets `SHOT_W=844`, `SHOT_H=390`,
`SHOT_PRESET=1` and uses the `before_mobile_` or `after_mobile_` prefix.
Restart Vite after source edits when serving a checkout nested under
`.worktrees`: the repository's development watcher ignores that path.

The capture run reported unavailable launcher API endpoints without a local
server and unrelated training-dummy/walking-staff preload warnings. None of
the pictured Sanctum surfaces depended on those assets or endpoints.

## Exit portal and mobile alert

The exit portal is captured after the real offline simulation death handler
completes every mob in the claimed Sanctum instance. The resulting `dungeon_exit`
entity is at instance-local (-42, 192), on the permanent western shore.
The camera player stands at (-42, 184), yaw 0, pitch 0.16, distance 13.
[Desktop portal](after_exit_portal.png) and
[844x390 viewport portal](after_mobile_exit_portal.png) both use Ultra (preset 4).
The smaller capture changes viewport size within the same session; it does not
represent Low graphics or a physical mobile device. The portal opening, paired
rings and orbiting ice accents remain visible against the glacier.

[Mobile meltwater alert](mobile_meltwater_alert.png) is a DOM-only fixture,
using the shipping pure alert view, shared EncounterAlert painter, English
localization, repository CSS and `body.mobile-touch` at 844x390. Its input is
a Bonewalker with Grasp of the Thawed chasing the local player. It is not a
combat screenshot. The panel measures 422x94 at (211, 77.6), fits the viewport,
and has equal client/scroll dimensions: its full action and reason wrap into
two lines with no clipping. This fixture does not assess overlap with a live HUD.

[Verified Low, reduced-motion portal](after_mobile_low_reduced_exit_portal.png)
uses a fresh browser at 844x390 with `?gfx=low`, persisted preset 1,
`graphicsDefaultApplied: true`, `reduceMotion: true`, and an emulated OS
reduced-motion preference. The portal first enters rendering interest on arrival
from the landing after the real boss-death spawn; nameplates are hidden.
[Runtime assertions](portal_low_reduced.json) verify active `GFX.tier === 'low'`,
the renderer reduction flag, the low portal material, visible portal root and
unchanged vortex rotation across one second. The two rims and opening remain
clear on the dark shore without bloom or moving decoration. This is settled
cold-arrival visibility evidence, not a frame-by-frame loading-pop analysis.
