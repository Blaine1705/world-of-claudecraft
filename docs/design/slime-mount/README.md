# Slime mount

A big blue jelly slime with a saddle, blanket, girth straps and stirrups,
built from `concept.webp` (top, side and front views). It has the same clip list
and seat contract as the gold sprite mount (`docs/design/sprite-mount` on
`feat/gold-sprite-mount`), but it sits on the ground in its idle instead of
hovering, hops to move, and jiggles. Not wired into the mount catalog yet.

## Files

- `concept.webp`: the turnaround the model was built from.
- `slime_tripo.glb`: the Tripo model, the source of the tack. Made with the
  asset pipeline's multiview input (`prop --front --left --right` on
  `feat/tripo-multiview`, `--face-limit 12000`) from the front view and the side
  view and its mirror. Tripo calls the view from the viewer's left `--left`, so
  the concept's side view, which faces right, went in as `--right`. Textures
  were shrunk to 1024 px WebP for the repo.
- `assemble_mount.py`: the static mount. It finds the jelly by colour, grown
  from the bottom of the shell so that blue glints on the leather are left
  alone, and fits a smooth body to it. It keeps the tack whole and tucks the
  body just under it. The new body replaces Tripo's jelly skin, which had
  lighting and highlights baked in.
- `build_mount.py`: paints the jelly (gradient, base glow, highlights,
  bubbles), then builds the rig and clips (Blender 5.2, headless).
- `finish_mount.mjs`: resamples, prunes, dedups and converts textures to WebP,
  then checks that the clips and the saddle bone survived.

## Rebuild

From the repo root, with `$W` an empty working directory:

```sh
D=docs/design/slime-mount
blender --background --python $D/assemble_mount.py -- $D/slime_tripo.glb $W/static.glb
blender --background --python $D/build_mount.py -- $W/static.glb $W/slime_anim.glb
node $D/finish_mount.mjs $W/slime_anim.glb public/models/mounts/slime.glb
node scripts/assets/compress_glb_textures.mjs public/models/mounts/slime.glb
node scripts/build_media_manifest.mjs generate
```

The KTX2 step is mandatory (`tests/glb_texture_compression.test.ts`). A rebuild
changes the bytes, so update the pin in `tests/slime_mount_asset.test.ts`.

## What the GLB carries

- Size: 6.61 units tall, 8 units nose to tail, 7.25 wide, on the ground at
  y = 0, facing +Z.
- Rig: `root` > `move` > `squash` > `base` > `mid` > `top`, plus `move` >
  `saddle`. `squash` scales from the ground, so the slime stays planted. The
  `base`/`mid`/`top` spine bends the jelly: the body and the lower tack blend
  along it by height, so the top can lag behind the bottom or overshoot it.
  `saddle` carries the seat, the cantle and the pommel rigidly. Each frame it
  is placed where the spine carries the top of the body, turned with it but
  never squashed. Use `saddle` as the rider's seat bone (`MountSeatSpec`) so
  the rider rides the wobble.
- Clips at 30 fps:
  - `Idle` (6 s loop): sat on the ground (no hover), breathing, swaying, with
    two little shivers.
  - `Walk` (1 s loop) and `Run` (0.9 s loop): one hop per loop. The slime
    gathers before take-off, stretches as it leaves the ground and squashes on
    landing, then jiggles down. The top lags back on take-off and carries on
    forward on landing. Each loop picks up the end of the previous landing's
    jiggle, so the seam does not show. Run hops twice as high and leans
    forward.
  - `Jump` (0.8 s): squash, spring off with a stretch that wobbles out in the
    air. It ends on the neutral pose, because the game holds the last frame
    through a fall.
