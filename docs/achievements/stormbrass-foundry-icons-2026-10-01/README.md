# Stormbrass Foundry loot icons: generated-art provenance

Twenty-seven shipping inventory icons for the Stormbrass Foundry's loot
(`src/sim/content/stormbrass_foundry_items.ts`, the two trinkets in
`src/sim/content/trinkets.ts` and the Draft Record quest object), registered in
`public/ui/items/mapping.json` as the generated batch
`stormbrass-foundry-icons-2026-10-01`.

## What happened

- Generator: no image model. Each icon is an authored SVG composition (per-item
  vector art over a three-stop radial ground, a paper-grain overlay) rasterized
  with Sharp at the 512 master and downscaled to the shipping 128x128 opaque sRGB
  WebP by `scripts/generate_stormbrass_foundry_item_icons.mjs`. The script IS the
  retained source: re-running it reproduces every file byte for byte, so no
  separate originals or masters are kept.
- Style contract: woc-item-icon-v1 (`docs/design/item-icon-art-style.md`): opaque
  dark vignette, warm top-left key light, cool bottom-right shadow, centered
  silhouette with safe padding, distinct art per item. The Foundry's palette:
  polished brass, verdigris copper, riveted iron, storm blue and white-blue
  lightning; never the Crucible raid's fire.
- Owner/license: World of ClaudeCraft, project-generated art, project asset,
  rights reserved. No prior icon is replaced and there is no supersession.

## Items

- Line-Master Ambrel Tock: `riveters_gauntlets` (a riveted mail gauntlet with a
  riveter nozzle), `beltrunners_boots` (leather boots with hazard-chevron soles),
  `draftsmans_mantle` (a blueprint mantle with a brass compass),
  `tocks_torque_wrench` (a brass torque wrench with its gauge; the rare chase row).
- The Rangewarden: `proofplate_legguards` (mail legguards with a dented target),
  `rangefinders_hood` (a leather hood with a hinged rangefinder lens),
  `coilwound_cord` (a cloth cord wound with copper coil),
  `proving_range_quiver` (a brass-banded quiver of test bolts; the rare chase row)
  and its Heroic clone `heroic_proving_range_quiver` (the same quiver storm-lit,
  lightning on its bolt heads).
- The Voltaic Warden: `grounding_pauldrons` (a verdigris pauldron with a grounding
  rod), `arcstep_treads` (treads trailing arcs), `stormglass_circlet` (a brass
  circlet set with storm glass), `voltaic_coil_staff` (a staff crowned with a glass
  coil; the rare chase row).
- The Prime Draft: `draftplate_breastplate` (a riveted brass breastplate),
  `gearwork_jerkin` (a jerkin with cog buckles), `stormbrass_robe` (a storm-grey
  robe hemmed in brass), `piston_maul`, `cellspark_dagger` and `governors_scepter`
  (the three bonus rares).
- Heroic epics: `line_masters_steam_hammer`, `rangewardens_targeting_visor`,
  `stormglass_robes`, `prime_draft_core_plate`, `heartless_gearmask`.
- Trinkets: `rangefinders_lens` (a brass lens with range marks and a red
  reticle), `overclocked_governor` (a flyball governor spun past its limit).
- Quest object: `draft_record` (a blueprint roll in a brass case, an empty circle
  where the Draft's heart was never set).

## Review

Machine-checked by the shipping catalog audit (`tests/item_art_consistency.test.ts`,
`tests/item_icons.test.ts`): 128x128, opaque, within the byte budget, unique bytes,
one mapping owner each. Owner visual review of the compositions is pending, like
every generated batch's.
