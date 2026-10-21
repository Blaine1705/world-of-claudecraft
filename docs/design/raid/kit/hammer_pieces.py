"""The Hammer vein kit's built pieces (build_smith_heart_hammer_kit.py): the
quarry's columns and their sockets, the cut blocks, the derrick, the
scaffold, the chain hoist, the quarry faces and lips, the Slab and its
frame, the rubble. Crisp bmesh work (split faces stay flat, joints stay
sharp); the sculpted pieces live in hammer_sculpt.py.

Conventions as the kit's (yards, +Z up, front -Y, origin at the base centre
unless the piece says otherwise). Deterministic: every random draw is the
piece's own seeded rng.
"""
import math

from mathutils import Matrix, Vector

from gwkit import chain_link, chain_run, mix, crystal, hull, loft_z, loop_tube, rivets, rune_strokes, slab
from hckit import GLOW
from shkit import (
    BRONZE, BRONZE_DARK, DRESSED, DRESSED_SHADE, DRESSED_STONE, DUST, GRANITE_DARK, IRON, IRON_DARK, LEATHER,
    MASON_RED, METAL, PAINT, PI, QUARRY, QUARRY_DARK, QUARRY_DEEP, QUARRY_PALE, QUARRY_RED, RAW, ROPE, RUNE_OCHRE,
    SP, TAU, TIMBER, WOOD, TIMBER_DARK, TIMBER_GREY, VEIN, VEIN_DIM, beam, drill_line, pole, rope,
)

CHAIN_IRON = (0.25, 0.235, 0.22)


def _rot_z(a):
    return Matrix.Rotation(a, 4, 'Z')


def runes_round(p, glyph, radius, z, unit, width, glow, sides=4, groove=QUARRY_DEEP, phase=0.0):
    """The same carved rune on `sides` faces round the Z axis (each face at
    distance `radius`, the first toward -Y)."""
    for k in range(sides):
        m = p.mark()
        rune_strokes(p, glyph, (-2 * unit, z), unit, width, -radius, glow=glow, groove=groove)
        p.turn(m, _rot_z(phase + TAU * k / sides))


# ===================================================================== the quarry
def pit_column():
    """One of the Quarry's five columns (Mountain's Wrath's cover, 13 yd,
    collider r 2.6): a plinth of quarried stone, a shaft of four octagonal
    drums set a hair askew (dressed, their joints dark), two bronze bands, the
    hammer rune cut on four faces with the vein's light in it, a squared
    capital under a bench-cut abacus. Made to sink into its socket."""
    p = SP('PitColumn', seed=101, ao_dist=2.4)
    with p.as_kind(RAW):
        slab(p, (0, 0, 0.45), (4.4, 4.4, 0.95), QUARRY_DARK, chamfer=0.05, jitter=0.03)
        drill_line(p, (-1.9, -2.21, 0.15), (1.9, -2.21, 0.15), 0.07, 0.42, out=(0, -1, 0))
        drill_line(p, (-2.21, -1.9, 0.15), (-2.21, 1.9, 0.15), 0.07, 0.42, out=(-1, 0, 0))
    with p.as_kind(DRESSED):
        p.box((0, 0, 1.15), (3.7, 3.7, 0.5), DRESSED_SHADE, bevel=0.08)
        z = 1.4
        for i, h in enumerate((2.6, 2.4, 2.7, 2.3)):
            r = 1.5 - i * 0.04
            dx, dy = p.rng.uniform(-0.04, 0.04), p.rng.uniform(-0.04, 0.04)
            twist = PI / 8 + p.rng.uniform(-0.03, 0.03)
            p.lathe((dx, dy, z), [(r * 0.95, 0), (r, 0.1), (r, h - 0.12), (r * 0.95, h)], 8,
                    p.vary(DRESSED_STONE, 0.04), phase=twist, smooth=False)
            z += h
        top = z
        p.box((0, 0, top + 0.35), (3.4, 3.4, 0.7), DRESSED_SHADE, bevel=0.12, taper=1.12)
        p.box((0, 0, top + 0.95), (3.9, 3.9, 0.5), p.vary(DRESSED_STONE, 0.03), bevel=0.1)
    with p.as_kind(METAL):
        for zz in (3.95, 9.35):
            loft_z(p, [(zz - 0.22, 0, 0, 1.58, 1.58, 2.8), (zz + 0.22, 0, 0, 1.56, 1.56, 2.8)], 16, BRONZE)
            rivets(p, [(math.cos(a) * 1.6, math.sin(a) * 1.6, zz) for a in [TAU * i / 8 for i in range(8)]], 0.1,
                   color=BRONZE_DARK)
    apothem = 1.46 * math.cos(PI / 8)
    runes_round(p, 'hammer', apothem, 5.4, 0.36, 0.14, VEIN, sides=4, phase=0.0)
    print('PitColumn top', top + 1.2)
    return p


def pit_column_socket():
    """The column's socket in the quarry floor (flush, 0.2 tall): a square
    frame of dressed stone round the plinth, a dark gap all round where the
    column will sink, and the vein's seam glowing in the gap's floor."""
    p = SP('PitColumnSocket', seed=103, ao=0.4)
    with p.as_kind(DRESSED):
        for k in range(4):
            m = p.mark()
            p.box((0, -3.05, 0.09), (7.0, 1.3, 0.18), p.vary(DRESSED_SHADE, 0.05), bevel=0.05)
            for j in range(3):
                p.box((-2.2 + j * 2.2, -3.71, 0.05), (0.08, 0.04, 0.1), QUARRY_DEEP)
            p.turn(m, _rot_z(PI / 2 * k))
    with p.as_kind(RAW):
        for k in range(4):
            m = p.mark()
            p.box((0, -2.33, 0.02), (4.75, 0.16, 0.04), QUARRY_DEEP)
            p.turn(m, _rot_z(PI / 2 * k))
    with p.as_kind(PAINT):
        for k in range(4):
            m = p.mark()
            p.box((0, -2.33, 0.05), (4.5, 0.06, 0.04), VEIN_DIM, mat=GLOW)
            p.turn(m, _rot_z(PI / 2 * k))
    return p


def cut_block(variant):
    """A quarried block waiting to be hauled (collider 4.8 square, 7.4 tall).
    A: a block with a smaller one set on it, wedge slots along its top edge,
    the drill line it split on, a rope sling and an iron lifting dog. B: one
    great block on a timber sledge over rollers, chocked, a rope coil."""
    p = SP('CutBlock' + variant, seed=110 + ord(variant), ao_dist=2.0)
    if variant == 'A':
        with p.as_kind(RAW):
            slab(p, (0, 0, 2.3), (4.6, 4.5, 4.6), p.vary(QUARRY_PALE, 0.05), chamfer=0.04, jitter=0.02)
            slab(p, (0.3, -0.2, 5.85), (3.2, 3.0, 2.5), p.vary(QUARRY, 0.05), yaw=0.42, chamfer=0.05, jitter=0.03)
            drill_line(p, (-2.1, -2.27, 0.3), (-2.1, -2.27, 4.3), 0.08, 0.42, out=(0, -1, 0))
            for k in range(5):
                p.box((-1.6 + k * 0.8, -2.27, 4.45), (0.32, 0.06, 0.22), QUARRY_DEEP)
        with p.as_kind(METAL):
            for k in range(3):
                p.box((-0.8 + k * 0.8, -2.3, 4.5), (0.18, 0.12, 0.42), IRON_DARK, pitch=0.15)
            # The lifting dog: two hooks in the top block's sides, a ring, a chain up.
            c = Vector((0.3, -0.2, 7.3))
            for s in (-1, 1):
                p.sweep([c + Vector((s * 1.55, 0, -1.0)), c + Vector((s * 1.2, 0, 0.2)), c + Vector((0, 0, 0.9))],
                        0.09, 0.09, IRON, sides=6)
            loop_tube(p, [c + Vector((math.cos(a) * 0.35, 0, 1.15 + math.sin(a) * 0.35))
                          for a in [TAU * i / 12 for i in range(12)]], 0.08, IRON_DARK, normal=(0, 1, 0))
        for s in (-1, 1):
            rope(p, (s * 1.4, -1.55, 4.6), (s * 1.4, 1.5, 4.6), 0.08, sag=-0.05)
    else:
        with p.as_kind(RAW):
            slab(p, (0, 0, 3.45), (4.3, 4.6, 4.9), p.vary(QUARRY_PALE, 0.05), chamfer=0.04, jitter=0.02)
            drill_line(p, (2.17, -1.9, 1.3), (2.17, 1.9, 1.3), 0.08, 0.42, out=(1, 0, 0))
            drill_line(p, (-1.9, -2.32, 5.6), (1.9, -2.32, 5.6), 0.08, 0.42, out=(0, -1, 0))
        # The sledge: two runners upturned at the front, cross-ties, rollers under.
        for s in (-1, 1):
            beam(p, (s * 1.5, 2.6, 0.75), (s * 1.5, -2.2, 0.75), 0.45, 0.5, TIMBER)
            beam(p, (s * 1.5, -2.2, 0.75), (s * 1.5, -2.85, 1.25), 0.45, 0.45, TIMBER)
        for y in (-1.6, 0.0, 1.6):
            beam(p, (-1.95, y, 1.05), (1.95, y, 1.05), 0.4, 0.3, TIMBER_GREY)
        for y in (-1.4, 1.2):
            pole(p, (-2.1, y, 0.3), (2.1, y, 0.3), 0.3, TIMBER_DARK)
        rope(p, (-1.5, -2.85, 1.2), (-0.4, -3.1, 0.3), 0.08, sag=0.1)
        with p.as_kind(PAINT):
            loop_tube(p, [Vector((1.3 + math.cos(a) * 0.55, -2.9 + math.sin(a) * 0.45, 0.12))
                          for a in [TAU * i / 12 for i in range(12)]], 0.11, ROPE, normal=(0, 0, 1))
    return p


def derrick():
    """The derrick that lifted the blocks (collider r 2.6, 18 yd): a stone
    footing, an A of squared timbers to an iron-capped apex, a back stay, a
    boom hinged low reaching 13 yd over the pit (-Y), a sheave at its tip, a
    chain running down to a hoisted block in a rope sling, a windlass between
    the legs, guy ropes to iron pins."""
    p = SP('Derrick', seed=121, ao_dist=2.0)
    with p.as_kind(RAW):
        slab(p, (0, 0, 0.3), (3.2, 3.0, 0.6), QUARRY_DARK, chamfer=0.06)
    apex = Vector((0, 0.35, 17.0))
    for s in (-1, 1):
        beam(p, (s * 1.55, 0.2, 0.6), apex, 0.55, 0.55, TIMBER)
    beam(p, (0, 2.5, 0.4), apex, 0.5, 0.5, TIMBER_GREY)
    for z in (5.0, 10.0):
        t = z / 17.0
        beam(p, (-1.55 * (1 - t), 0.2 + 0.15 * t, z), (1.55 * (1 - t), 0.2 + 0.15 * t, z), 0.32, 0.32, TIMBER_GREY)
    hinge = Vector((0, -0.5, 2.6))
    tip = Vector((0, -13.0, 15.2))
    beam(p, hinge, tip, 0.6, 0.6, TIMBER)
    beam(p, hinge + Vector((0, 0, 0.5)), tip + Vector((0, 1.0, -0.4)), 0.25, 0.25, TIMBER_DARK)
    with p.as_kind(METAL):
        p.box(tuple(apex + Vector((0, 0, 0.25))), (0.9, 0.9, 0.6), IRON_DARK, bevel=0.06)
        for t in (0.15, 0.5, 0.85):
            q = hinge.lerp(tip, t)
            loft_z(p, [(q.z - 0.2, q.x, q.y, 0.42, 0.42, 3.0), (q.z + 0.2, q.x, q.y, 0.42, 0.42, 3.0)], 10, IRON)
        # The sheave at the tip.
        loop_tube(p, [tip + Vector((0, math.cos(a) * 0.55, math.sin(a) * 0.55 - 0.3))
                      for a in [TAU * i / 14 for i in range(14)]], 0.12, IRON, normal=(1, 0, 0))
    # The chain down from the sheave to the hoisted block.
    end = chain_run(p, tip + Vector((0, -0.55, -0.4)), tip + Vector((0, -0.55, -8.4)), 0.7, 0.32, 0.09,
                    color=CHAIN_IRON)
    with p.as_kind(RAW):
        slab(p, tuple(end + Vector((0, 0, -1.6))), (2.6, 2.4, 2.4), p.vary(QUARRY_PALE, 0.04), yaw=0.3,
             chamfer=0.05)
    for s in (-1, 1):
        rope(p, end + Vector((s * 1.1, 0, -0.4)), end + Vector((0, 0, 0.1)), 0.07)
    # The chain's other run, slack, back down the boom to the windlass.
    rope(p, tip + Vector((0, 0.3, -0.1)), (0, 0.7, 1.8), 0.06, sag=0.6)
    # The windlass: a drum between two posts, its spokes.
    for s in (-1, 1):
        beam(p, (s * 0.9, 0.7, 0.6), (s * 0.9, 0.7, 2.2), 0.3, 0.3, TIMBER_DARK)
    with p.as_kind(PAINT):
        p.prism((-0.8, 0.7, 1.8), 10, 0.42, 0.42, 1.6, ROPE, axis=(1, 0, 0))
    for k in range(4):
        a = TAU * k / 4 + 0.3
        beam(p, (1.05, 0.7, 1.8), (1.05, 0.7 + math.cos(a) * 1.0, 1.8 + math.sin(a) * 1.0), 0.12, 0.12, TIMBER_DARK)
    # Guy ropes from the apex to iron pins.
    for (x, y) in ((-2.9, 1.2), (2.9, 1.2)):
        rope(p, apex, (x, y, 0.45), 0.05, sag=0.4)
        with p.as_kind(METAL):
            p.prism((x, y, 0.25), 6, 0.1, 0.08, 0.45, IRON_DARK)
    return p


def scaffold():
    """Timber scaffolding against the Smith's carving (8 wide, 3 deep, 16
    tall, its back toward +Y on the stone): standards lashed to ledgers, plank
    decks at 5, 10 and 15, cross braces, ladders between the decks, a rope and
    pulley over the top, a bucket and a mallet left on the top deck."""
    p = SP('Scaffold', seed=131, ao_dist=1.6)
    xs = (-3.8, 0.0, 3.8)
    ys = (-1.4, 1.4)
    for x in xs:
        for y in ys:
            pole(p, (x, y, 0), (x + p.rng.uniform(-0.05, 0.05), y, 16.2), 0.16, TIMBER_GREY)
    for z in (5.0, 10.0, 15.0):
        for y in ys:
            pole(p, (-4.2, y, z), (4.2, y, z), 0.13, TIMBER)
        for x in xs:
            pole(p, (x, -1.6, z - 0.15), (x, 1.6, z - 0.15), 0.12, TIMBER)
        # The deck: planks across, a gap or two.
        for k in range(9):
            y = -1.25 + k * 0.32
            if p.rng.random() < 0.1:
                continue
            with p.as_kind(WOOD):
                p.box((p.rng.uniform(-0.1, 0.1), y, z + 0.2), (8.2, 0.3, 0.08), p.vary(TIMBER, 0.1),
                      yaw=p.rng.uniform(-0.01, 0.01))
    for (z0, z1) in ((0.2, 5.0), (5.0, 10.0), (10.0, 15.0)):
        pole(p, (-3.8, -1.45, z0), (0.0, -1.45, z1), 0.09, TIMBER_DARK)
        pole(p, (3.8, -1.45, z0), (0.0, -1.45, z1), 0.09, TIMBER_DARK)
    # Ladders (two rails, rungs).
    for i, (z0, z1, x) in enumerate(((0.0, 5.2, 2.2), (5.2, 10.2, -2.2), (10.2, 15.2, 2.2))):
        for s in (-0.3, 0.3):
            pole(p, (x + s, -1.75, z0), (x + s, -1.2, z1), 0.06, TIMBER)
        for k in range(1, 12):
            t = k / 12
            pole(p, (x - 0.3, -1.75 + 0.55 * t, z0 + (z1 - z0) * t), (x + 0.3, -1.75 + 0.55 * t, z0 + (z1 - z0) * t),
                 0.04, TIMBER_DARK)
    # Lashings at the joints.
    with p.as_kind(PAINT):
        for x in xs:
            for y in ys:
                for z in (5.0, 10.0, 15.0):
                    p.prism((x, y, z - 0.25), 6, 0.2, 0.2, 0.45, ROPE)
    # A gin pole over the top, its pulley and a rope down to a bucket.
    pole(p, (3.8, -1.4, 15.0), (3.8, -3.6, 18.0), 0.1, TIMBER_DARK)
    rope(p, (3.8, -3.6, 17.8), (3.8, -3.6, 6.5), 0.04)
    with p.as_kind(WOOD):
        p.prism((3.8, -3.6, 5.8), 8, 0.32, 0.38, 0.65, TIMBER_DARK)
        p.prism((-1.2, 0.4, 15.3), 8, 0.3, 0.34, 0.55, TIMBER_DARK)
        beam(p, (-2.4, -0.6, 15.35), (-1.6, -0.2, 15.35), 0.1, 0.1, TIMBER)
        p.box((-2.5, -0.65, 15.4), (0.35, 0.3, 0.3), TIMBER_DARK)
    return p


def chain_hoist():
    """A hoist jutting from the rock over the void (origin where its beam
    meets the rock): an iron-strapped timber beam 5 yd out along -Y on an iron
    bracket, a sheave at its end, one chain hanging 14 yd to a hook and a
    block in a sling, a second chain hanging slack and broken."""
    p = SP('ChainHoist', seed=141, ao_dist=1.5)
    with p.as_kind(METAL):
        p.box((0, 0.1, 0), (1.6, 0.3, 2.4), IRON_DARK, bevel=0.06)
        rivets(p, [(x, -0.06, z) for x in (-0.55, 0.55) for z in (-0.8, 0.0, 0.8)], 0.1)
    beam(p, (0, 0.2, 0.0), (0, -5.2, 0.4), 0.6, 0.7, TIMBER)
    beam(p, (0, 0.2, -2.2), (0, -3.6, 0.0), 0.35, 0.35, TIMBER_DARK)
    with p.as_kind(METAL):
        for y in (-1.5, -3.5):
            p.box((0, y, 0.25), (0.7, 0.25, 0.85), IRON, bevel=0.03)
        tip = Vector((0, -5.0, 0.0))
        loop_tube(p, [tip + Vector((0, math.cos(a) * 0.5, math.sin(a) * 0.5 - 0.35))
                      for a in [TAU * i / 14 for i in range(14)]], 0.11, IRON, normal=(1, 0, 0))
    end = chain_run(p, tip + Vector((0, -0.5, -0.5)), tip + Vector((0, -0.5, -13.5)), 0.66, 0.3, 0.085,
                    color=CHAIN_IRON)
    with p.as_kind(METAL):
        p.sweep([end, end + Vector((0, 0, -0.6)), end + Vector((0, -0.4, -1.0)), end + Vector((0, -0.6, -0.6))],
                0.11, 0.08, IRON_DARK, sides=6)
    with p.as_kind(RAW):
        slab(p, tuple(end + Vector((0, -0.2, -2.6))), (2.2, 2.0, 1.9), p.vary(QUARRY_PALE, 0.04), yaw=0.5,
             chamfer=0.05)
    for s in (-1, 1):
        rope(p, end + Vector((s * 0.9, -0.2, -1.8)), end + Vector((0, -0.4, -0.9)), 0.07)
    chain_run(p, tip + Vector((0, 0.45, -0.5)), tip + Vector((0, 0.6, -7.5)), 0.66, 0.3, 0.085, color=CHAIN_IRON)
    return p


# ===================================================================== quarry faces
def _course_face(p, rng, x0, x1, z_top, z_bot, depth, course=(2.4, 3.7), stepout=0.0, drill=0.45, wedge=0.0,
                 pale=0.25, bench=0.55, pull=0.18, width=(5.5, 10.0)):
    """A worked quarry face toward -Y from z_top down to z_bot between x0 and
    x1, the way a quarry is cut: in benches, each lift of blocks standing a
    little proud of the one above (a ledge on each), the split faces flat,
    drill lines down the splits, iron wedges left in a few, and here and
    there a block already pulled out (a square notch showing the face
    behind). The body runs `depth` back (+Y), a dark back mass behind it."""
    p.box(((x0 + x1) / 2, depth * 0.8, (z_top + z_bot) / 2), (x1 - x0, depth * 0.4, z_top - z_bot), QUARRY_DEEP)
    z = z_top
    row = 0
    while z > z_bot + 0.05:
        h = min(rng.uniform(*course), z - z_bot)
        if z - h - z_bot < 0.8:
            h = z - z_bot
        x = x0 - rng.uniform(0, 2.5)
        inset = -row * bench * rng.uniform(0.7, 1.2) + rng.uniform(-stepout, stepout)
        # One tone per lift (a lift reads as one band of the same bed), a
        # fresh pale block now and then.
        lift_tone = QUARRY if rng.random() < 0.6 else mix(QUARRY, QUARRY_DARK, rng.uniform(0.3, 0.7))
        while x < x1 - 0.05:
            w = rng.uniform(*width)
            a, b = max(x0, x), min(x1, x + w)
            if b - a > 0.4:
                if row > 0 and rng.random() < pull:
                    x += w
                    continue
                fresh = rng.random() < pale
                c = mix(lift_tone, QUARRY_PALE, 0.4) if fresh else lift_tone
                yo = inset + rng.uniform(-0.06, 0.06)
                slab(p, ((a + b) / 2, yo + depth / 2, z - h / 2), (b - a - 0.05, depth, h - 0.05), p.vary(c, 0.03),
                     chamfer=0.025, jitter=0.015)
                if rng.random() < drill:
                    xx = a + 0.12 if rng.random() < 0.5 else b - 0.12
                    drill_line(p, (xx, yo - 0.02, z - h + 0.15), (xx, yo - 0.02, z - 0.15), 0.07, 0.32,
                               out=(0, -1, 0))
                if rng.random() < drill * 0.5:
                    drill_line(p, (a + 0.2, yo - 0.02, z - 0.12), (b - 0.2, yo - 0.02, z - 0.12), 0.06, 0.36,
                               out=(0, -1, 0))
                if wedge and rng.random() < wedge:
                    with p.as_kind(METAL):
                        for k in range(int((b - a) / 0.7)):
                            p.box((a + 0.35 + k * 0.7, yo - 0.05, z - 0.05), (0.18, 0.18, 0.4), IRON_DARK, pitch=0.2)
            x += w
        z -= h
        row += 1


def quarry_face(variant):
    """A module of the quarry's terrace risers (8 yd along X, ends run 0.4 past
    to overlap): origin on the lip, the worked face dropping 7.4 to below
    the step beneath, toward -Y; its body 3 yd back under the step above.
    A: courses and benches. B: a block half split out of the face, its drill
    line and wedges. C: a seam of the Hammer's light across a fresh face, a
    red-ochre guide line snapped across."""
    seeds = {'A': 151, 'B': 157, 'C': 163}
    p = SP('QuarryFace' + variant, seed=seeds[variant], marks=variant != 'A', ao_dist=1.6)
    rng = p.rng
    with p.as_kind(RAW):
        _course_face(p, rng, -4.4, 4.4, -0.02, -7.4, 3.0, wedge=0.25 if variant == 'B' else 0.05,
                     pale=0.18 if variant == 'C' else 0.08)
        if variant == 'B':
            slab(p, (0.6, -0.9, -3.0), (3.4, 2.4, 2.6), p.vary(QUARRY_PALE, 0.04), yaw=0.08, chamfer=0.04)
            drill_line(p, (-1.05, -2.12, -4.2), (2.25, -2.12, -4.2), 0.07, 0.36, out=(0, -1, 0))
    if variant == 'C':
        with p.as_kind(PAINT):
            pts = [(-4.4, -0.42, -3.4), (-2.0, -0.45, -2.9), (0.4, -0.45, -3.6), (2.6, -0.45, -3.0), (4.4, -0.42, -3.3)]
            for a, b in zip(pts, pts[1:]):
                p.sweep([a, b], 0.09, 0.09, VEIN, sides=5, mat=GLOW)
    return p


def quarry_lip(variant):
    """A module for a quarried lip over the void (10 yd along X): origin on
    the lip, worked lifts down the first eight yards (each a little proud of
    the one above), then rough split rock leaning out over the void to -30,
    toward -Y, so it stays in front of the field's flaring massif below."""
    seeds = {'A': 171, 'B': 177}
    p = SP('QuarryLip' + variant, seed=seeds[variant], ao_dist=2.4)
    rng = p.rng
    with p.as_kind(RAW):
        _course_face(p, rng, -5.4, 5.4, -0.02, -8.0, 3.2, course=(2.0, 3.0), drill=0.4, bench=0.85, pull=0.1)
        z = -7.0
        while z > -30:
            h = rng.uniform(5.0, 8.0)
            x = -5.6
            out = 2.4 + 0.3 * (-z - 7.0)
            while x < 5.6:
                w = rng.uniform(4.0, 7.0)
                tone = mix(QUARRY_DARK, QUARRY_DEEP, rng.uniform(0.2, 0.7))
                slab(p, (x + w / 2, 1.6 - out + rng.uniform(-0.4, 0.4), z - h / 2), (w * 1.1, 4.6, h * 1.08),
                     p.vary(tone, 0.04), yaw=rng.uniform(-0.06, 0.06), pitch=rng.uniform(-0.12, 0.05),
                     chamfer=0.12, jitter=0.12)
                x += w * 0.9
            z -= h * 0.9
    return p


def quarry_rim(variant):
    """A module for the pit's own rim, where a walked floor meets the
    terrace above (8 yd along X, 7.4 tall): flat worked lifts, drill lines,
    no bench proud of the lip, so it never stands out over the floor below
    (origin on the lip, the face toward -Y)."""
    seeds = {'A': 211, 'B': 217}
    p = SP('QuarryRim' + variant, seed=seeds[variant], marks=variant == 'B', ao_dist=1.6)
    with p.as_kind(RAW):
        _course_face(p, p.rng, -4.4, 4.4, -0.02, -7.4, 3.0, bench=0.0, pull=0.0, wedge=0.08,
                     pale=0.12 if variant == 'B' else 0.06)
    return p


def rubble_pile():
    """A heap of quarry spoil off the walks (6 across, 1.8 tall): split chips,
    a few spalls, dust drifted round its foot."""
    p = SP('RubblePile', seed=181, ao_dist=1.2)
    rng = p.rng
    with p.as_kind(RAW):
        crystal(p, (0, 0, 0.1), (5.4, 4.6, 1.4), DUST, n=18, boxy=0.9, jitter=0.1, floor=0.0)
        for k in range(26):
            a = rng.uniform(0, TAU)
            r = rng.uniform(0, 2.6) ** 0.8
            s = rng.uniform(0.35, 1.2) * (1.2 - r / 3.5)
            slab(p, (math.cos(a) * r, math.sin(a) * r, 0.5 + (2.6 - r) * 0.35), (s * 1.3, s, s * 0.7),
                 p.vary(QUARRY if k % 3 else QUARRY_PALE, 0.08), yaw=rng.uniform(0, TAU), pitch=rng.uniform(-0.4, 0.4),
                 roll=rng.uniform(-0.4, 0.4), chamfer=0.12, jitter=0.12)
    return p


def chip_scatter():
    """Chips and dust on a walked floor (5 across, flat: under a hand tall)."""
    p = SP('ChipScatter', seed=187, ao=0.0)
    rng = p.rng
    with p.as_kind(RAW):
        for k in range(30):
            a = rng.uniform(0, TAU)
            r = rng.uniform(0, 2.4)
            s = rng.uniform(0.12, 0.38)
            slab(p, (math.cos(a) * r, math.sin(a) * r, s * 0.18), (s * 1.4, s, s * 0.3),
                 p.vary(QUARRY_PALE if k % 2 else QUARRY, 0.08), yaw=rng.uniform(0, TAU), chamfer=0.2, jitter=0.15)
    return p


# ===================================================================== the Slab
SLAB_W, SLAB_H, SLAB_T = 15.2, 9.0, 2.2
# The split down the slab (x at each height), shared by both halves.
SPLIT = [(0.2, 0.0), (-0.45, 1.4), (0.35, 2.9), (-0.2, 4.1), (0.55, 5.6), (-0.3, 7.0), (0.25, 8.2), (-0.1, 9.0)]


def _prism_poly(p, outline, y0, y1, color):
    """A flat polygon (x, z points, counter-clockwise seen from -Y) extruded
    from y0 to y1."""
    bm = p.bm
    before = set(bm.faces)
    front = [bm.verts.new((x, y0, z)) for x, z in outline]
    back = [bm.verts.new((x, y1, z)) for x, z in outline]
    n = len(outline)
    bm.faces.new(list(reversed(front)))
    bm.faces.new(back)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], front[j], back[j], back[i]))
    faces = [f for f in bm.faces if f not in before]
    p._paint(faces, color, 0)
    return faces


def slab_half(side):
    """One half of the Slab (both in the shut slab's frame: its base centre).
    Living stone: a dressed border, the field inside pick-dressed, the Hammer's
    rune of the vein cut across both halves with the light in it, the split
    jagged down the middle. side -1 the west half (L), +1 the east (R)."""
    name = 'SlabHalfL' if side < 0 else 'SlabHalfR'
    p = SP(name, seed=191 if side < 0 else 193, ao_dist=1.6)
    half = SLAB_W / 2
    if side < 0:
        outline = [(-half, 0.0)] + [(x, z) for x, z in SPLIT] + [(-half, SLAB_H)]
    else:
        outline = [(SPLIT[0][0], 0.0), (half, 0.0), (half, SLAB_H)] + [(x, z) for x, z in reversed(SPLIT)][:-1]
    with p.as_kind(DRESSED):
        faces = _prism_poly(p, outline, -SLAB_T / 2, SLAB_T / 2, p.vary(DRESSED_SHADE, 0.03))
    # The border, raised a hand on both faces.
    x_out = -half if side < 0 else half
    with p.as_kind(DRESSED):
        for yf in (-1, 1):
            y = yf * (SLAB_T / 2 + 0.08)
            p.box((x_out - side * 0.45, y, SLAB_H / 2), (0.9, 0.16, SLAB_H - 0.2), DRESSED_STONE, bevel=0.04)
            for zz in (0.45, SLAB_H - 0.45):
                p.box((x_out - side * half / 2, y, zz), (half - 0.2, 0.16, 0.9), DRESSED_STONE, bevel=0.04)
            # The field's tool marks: bands of fine pick-dressing.
            for k in range(6):
                zz = 1.4 + k * 1.15
                p.box((x_out - side * half * 0.55, y * 0.985, zz), (half * 0.62, 0.04, 0.08), QUARRY_DEEP)
    # The great hammer rune of the vein across both halves (the handle and
    # its grip on the west half, the head spanning the split): each half
    # draws the strokes that lie on it.
    strokes = [((-1.3, 1.2), (-1.3, 5.6), 'v'), ((-4.0, 5.6), (3.0, 5.6), 'h'), ((-4.0, 7.8), (3.0, 7.8), 'h'),
               ((-4.0, 5.6), (-4.0, 7.8), 'v'), ((3.0, 5.6), (3.0, 7.8), 'v'), ((-2.3, 2.0), (-0.3, 2.0), 'h')]
    for yf in (-1, 1):
        y = yf * (SLAB_T / 2 + 0.1)
        for (x0, z0), (x1, z1), kind in strokes:
            if kind == 'v':
                if (x0 < 0) != (side < 0):
                    continue
                mx, mz, L = x0, (z0 + z1) / 2, abs(z1 - z0)
                size_g, size_l = (0.34, 0.08, L + 0.3), (0.16, 0.06, L)
            else:
                lo, hi = (x0, min(x1, -0.8)) if side < 0 else (max(x0, 0.9), x1)
                if hi - lo < 0.2:
                    continue
                mx, mz, L = (lo + hi) / 2, z0, hi - lo
                size_g, size_l = (L + 0.3, 0.08, 0.34), (L, 0.06, 0.16)
            p.box((mx, y, mz), size_g, QUARRY_DEEP)
            with p.as_kind(PAINT):
                p.box((mx, y + yf * 0.04, mz), size_l, RUNE_OCHRE, mat=GLOW)
    # The split's lips, raw and pale.
    with p.as_kind(RAW):
        for (x0, z0), (x1, z1) in zip(SPLIT, SPLIT[1:]):
            mx, mz = (x0 + x1) / 2 - side * 0.12, (z0 + z1) / 2
            L = math.hypot(x1 - x0, z1 - z0)
            ang = math.atan2(z1 - z0, x1 - x0)
            p.box((mx, 0, mz), (L, SLAB_T + 0.05, 0.22), QUARRY_PALE, roll=-ang)
    return p


def slab_frame():
    """The Slab's frame over the stair (origin on the stair at the slab's
    line, the frame 2 yd north of it, toward -Y: the Balcony side): two dressed monoliths rising out of
    the fissure from -20 to 14 at x +-9.6 (clear of the stair), banded and
    cut with the Smith's four tools, a lintel 22 yd across with the vein's
    hammer rune, a cornice over it, the split already showing through it."""
    p = SP('SlabFrame', seed=197, ao_dist=3.0)
    y = -2.0
    with p.as_kind(DRESSED):
        for s in (-1, 1):
            x = s * 9.7
            p.box((x, y, -3.0), (2.8, 3.2, 34.0), p.vary(DRESSED_SHADE, 0.03), bevel=0.12)
            p.box((x, y, 13.6), (3.4, 3.8, 0.8), DRESSED_STONE, bevel=0.1)
            for zz in (2.0, 7.0):
                p.box((x, y, zz), (3.1, 3.5, 0.5), DRESSED_STONE, bevel=0.06)
        p.box((0, y, 15.4), (23.6, 3.6, 2.8), p.vary(DRESSED_STONE, 0.03), bevel=0.14)
        p.box((0, y, 17.2), (25.0, 4.2, 0.8), DRESSED_SHADE, bevel=0.1)
        p.box((0, y + 0.3, 18.0), (21.0, 3.2, 0.9), p.vary(DRESSED_STONE, 0.03), bevel=0.1, taper=0.92)
    with p.as_kind(RAW):
        for s in (-1, 1):
            crystal(p, (s * 9.7, y + 0.4, -18.0), (5.0, 5.0, 8.0), QUARRY_DARK, n=16, boxy=0.4)
    # The tools on the jambs, the hammer on the lintel.
    for s, glyph in ((-1, 'tongs'), (1, 'anvil')):
        m = p.mark()
        rune_strokes(p, glyph, (-1.0, 8.6), 0.5, 0.18, -1.62, glow=RUNE_OCHRE, groove=QUARRY_DEEP)
        p.turn(m, Matrix.Translation((s * 9.7, y, 0)))
    m = p.mark()
    rune_strokes(p, 'hammer', (-1.3, 14.4), 0.42, 0.18, -1.82, glow=RUNE_OCHRE, groove=QUARRY_DEEP)
    p.turn(m, Matrix.Translation((0, y, 0)))
    # The split through the lintel's middle, glowing faintly.
    with p.as_kind(PAINT):
        for (x0, z0, x1, z1) in ((0.3, 14.0, -0.2, 15.4), (-0.2, 15.4, 0.25, 16.8)):
            ang = math.atan2(z1 - z0, x1 - x0)
            p.box(((x0 + x1) / 2, y - 1.83, (z0 + z1) / 2), (math.hypot(x1 - x0, z1 - z0), 0.06, 0.1), VEIN_DIM,
                  mat=GLOW, roll=-ang)
    return p


def slab_chunk(variant):
    """Debris of the breaking Slab (origin at its middle, tumbled by the
    runtime): a dressed face on one side, raw split faces elsewhere."""
    sizes = {'A': (2.2, 1.8, 1.6), 'B': (1.4, 1.2, 1.0), 'C': (0.8, 0.7, 0.6)}
    p = SP('SlabChunk' + variant, seed=200 + ord(variant), ao=0.5)
    with p.as_kind(DRESSED):
        crystal(p, (0, 0, 0), sizes[variant], p.vary(DRESSED_SHADE, 0.05), n=20, boxy=0.3, jitter=0.2)
    return p
