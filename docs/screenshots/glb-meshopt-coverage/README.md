# Geometry compression: before / after evidence (issue #3287)

This change compresses geometry. Its claim is a NEGATIVE one, that nothing a
player sees changes, so a screenshot of one happy scene proves very little. What
is committed here instead is every rewritten model rendered twice, from its
committed base bytes and from its shipped bytes, through ONE SHARED CAMERA, with
an amplified difference map beside each pair.

The shared camera matters. Framing each version to its own bounds re-centres a
model that shifted and then reports the resulting whole-image offset as a huge
difference; that mistake read 14.5 percent on CombatMech before it was fixed.

## What to look at

`static-before-after-diff-*.png` are contact sheets, sorted worst difference
FIRST, so page 1 carries the cases that matter. Each row is three tiles:

    BEFORE | AFTER | DIFFERENCE (amplified 4x)

`animated-before-after-diff-*.png` sample the first clip at six points along it,
three rows: before, after, difference. The signature of a skinning drift is a
difference that GROWS from left to right; a faint, constant speckle is edge
noise from vertex quantization.

The animation-only clip banks (`*_anims.glb`) carry no geometry of their own, so
they are driven on the body the characters manifest pairs them with. Rendering
one alone produces a blank frame and a meaningless zero difference.

## Result

Static pass, worst five of the rewritten set:

```
  5.86%  delta 255  rift_portal
  1.33%  delta 255  shadowjump_toad
  1.26%  delta 255  CombatMech
  0.94%  delta 255  wildheart_hexcaller
  0.78%  delta 255  wildheart_beastmaster
```

Animated pass, worst five, with no model whose difference grows along its clip:

```
  0.69%  CombatMech  clip "Death_A" (22 clip(s), 0.80s)  par pose: 0.28 0.69 0.17 0.32 0.43 0.39
  0.24%  water_elemental  clip "Idle" (6 clip(s), 2.40s)  par pose: 0.01 0.08 0.16 0.24 0.16 0.08
  0.18%  shadowjump_toad  clip "Idle" (4 clip(s), 3.60s)  par pose: 0.18 0.13 0.13 0.18 0.12 0.12
  0.16%  CombatMech_hit_variety_anims (joue sur CombatMech)  clip "Hit_B_Stagger" (1 clip(s), 0.52s)  par pose: 0.13 0.15 0.12 0.11 0.16 0.12
  0.14%  bow_anims (joue sur ranger)  clip "Bow_Draw_Shot" (1 clip(s), 0.95s)  par pose: 0.10 0.07 0.07 0.14 0.07 0.13
```

`rift_portal` leads the static list and is the one to inspect deliberately: it
was the only shipped model already carrying KHR_mesh_quantization, an earlier
revision of this branch shipped it destroyed (POSITION max `[0, 32767, 0]`, every
x and z flattened to zero), and the converter now dequantizes back to float
before re-quantizing. Its silhouette is identical here.

## Reproducing

The two comparators live under `tmp/` on the authoring machine and are not
committed: they exist to produce this evidence, not to be a maintained tool. They
extract each model's base bytes with `git show`, serve both trees, and drive the
renders through headless Chrome with swiftshader.
