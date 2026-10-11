# Temple replacement creatures

Live offline-instance evidence: desktop Ultra at 1600x900 and touch Low at
844x390. Actors use their authored spawn locations; unrelated nearby packs were
removed only in the capture session to expose the models and effects. Casts are
driven by actual AI, not screenshot-only VFX.

Capture URLs explicitly forced `?gfx=ultra` and `?gfx=low`, alongside stored presets 4 and 1; the mobile run also confirmed the guardian's richer particle layer was disabled at runtime.

| Subject | Desktop | Mobile |
|---|---|---|
| Guardian pair | [View](desktop-ultra-guardians.png) | [View](mobile-low-guardians.png) |
| Amphibian | [View](desktop-ultra-lurker.png) | [View](mobile-low-lurker.png) |
| Tide cast | [View](desktop-ultra-surge-charge.png) | [View](mobile-low-surge-charge.png) |
| Trident cast | [View](desktop-ultra-trident-charge.png) | [View](mobile-low-trident-charge.png) |

[Tide release](desktop-ultra-surge-release.png) and
[trident release](desktop-ultra-trident-release.png) show the impact cosmetics.
Final images include corrected Blender vertex colors and localized cast labels.

`capture-report.json` records actors and boot diagnostics. Its raw renderer
counters are cumulative because `info.autoReset` is disabled; they are not
per-frame benchmarks. There were no page exceptions. Boot logged missing
unrelated walking-staff/training-dummy preloads, offline-backend 502s and compile
gate watchdog fallbacks, including the Temple telegraphs on desktop. These
captures verify appearance and readable warnings, not hitch-free cold startup.
