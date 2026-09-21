"""The TEMPEST VHAROK room kit: a summit under a storm that never ends.

  blender --background --python docs/design/boss-rooms/storm/build_storm_kit.py [-- --preview]

Writes storm_kit_components.glb beside this file (scripts/assets/boss_rooms/build.mjs
ships it). Conventions and the painting model: ../kitlib.py and ../README.md.

Readability rule this kit keeps: Vharok telegraphs in bright CIRCLES on the floor.
The cyan here is a hairline inside split stone and a spark at a rod's tip, always
upright and above the ground; nothing in the kit is a lit ring or disc.
"""
import math
import os
import sys

sys.dont_write_bytecode = True  # no __pycache__ beside the shared kit library

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from kitlib import GLOW, Piece, build_kit, export_kit, here, preview  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

GRANITE = (0.56, 0.58, 0.63)
GRANITE_DARK = (0.4, 0.42, 0.47)
GRANITE_DEEP = (0.28, 0.3, 0.34)
COPPER = (0.78, 0.5, 0.33)
VERDIGRIS = (0.4, 0.68, 0.6)
IRON = (0.36, 0.37, 0.41)
IRON_DARK = (0.24, 0.25, 0.28)
BONE = (0.84, 0.82, 0.73)
BONE_OLD = (0.66, 0.65, 0.58)
CLOTH = (0.34, 0.46, 0.58)
CLOTH_DARK = (0.24, 0.32, 0.44)
TRIM = (0.7, 0.62, 0.4)
WOOD = (0.4, 0.34, 0.3)
SCORCH = (0.1, 0.1, 0.12)
ARC = (0.5, 0.96, 1.0)
ARC_DIM = (0.24, 0.58, 0.66)
COLD = (0.02, 0.05, 0.07)


def piece(name):
    return Piece(name, warm=COLD)


def chain_run(p, a, b, size=0.6, color=IRON_DARK, sag=0.0):
    """Chain from a to b, sagging a little: slabs turned a quarter each."""
    a, b = Vector(a), Vector(b)
    mid = (a + b) / 2 - Vector((0, 0, sag))
    count = max(3, int((b - a).length / (size * 0.72)))
    points = p.bezier(a, mid, b, steps=count)
    for i in range(count):
        here_, there = points[i], points[i + 1]
        along = there - here_
        pitch = math.atan2(math.hypot(along.x, along.y), along.z)
        yaw = math.atan2(along.y, along.x) - math.pi / 2
        start = p.mark()
        p.box((0, 0, 0), (size * 0.5, size * 0.2, size), color, yaw=(math.pi / 2) * (i % 2), bevel=size * 0.05)
        p.turn(start, Matrix.Translation((here_ + there) / 2) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(-pitch, 4, 'X'))


def anchor_ring(p, at, r=0.6):
    p.box((at[0], at[1], at[2] + 0.15), (1.4, 1.4, 0.3), GRANITE_DEEP, bevel=0.08)
    p.ring((at[0], at[1], at[2] + 0.3 + r * 0.7), r, 0.16, IRON, segments=8)


def crack(p, x, y, z0, z1, width=0.14, tone=ARC_DIM, wander=0.35):
    """A lightning crack up a front face: a jagged run of thin lit bars."""
    steps = max(2, int((z1 - z0) / 1.1))
    px = x
    for i in range(steps):
        nx = x + (p.rng.random() - 0.5) * 2 * wander
        za, zb = z0 + (z1 - z0) * i / steps, z0 + (z1 - z0) * (i + 1) / steps
        length = math.hypot(nx - px, zb - za)
        p.box(((px + nx) / 2, y, (za + zb) / 2), (width, 0.08, length * 1.04), tone, mat=GLOW, roll=math.atan2(nx - px, zb - za))
        px = nx


def torn_cloth(p, x0, z_top, width, drops, y=0.0, pitch=0.12):
    """Cloth hung from a yard, in strips of unequal length, the wind in it."""
    n = len(drops)
    for i, length in enumerate(drops):
        x = x0 + (i + 0.5) * width / n
        p.box((x, y - 0.06 * i, z_top - length / 2), (width / n * 0.96, 0.07, length), CLOTH if i % 2 == 0 else CLOTH_DARK,
              pitch=pitch + 0.05 * i, taper=0.55 if i % 2 else 0.85)


# --------------------------------------------------------------------- hero
def lightning_spire():
    """The Great Lightning Spire: a monolith banded in copper, chained to the mountain,
    what is left of its storm hall fallen round its foot. Back at y = +4."""
    p = piece('Kit_LightningSpire')
    for i, (w, d, h) in enumerate(((17, 9, 1.0), (13, 7, 1.0), (9.5, 5.4, 1.1))):
        p.box((0, 1.0, 0.5 + i * 1.0), (w, d, h), GRANITE if i % 2 == 0 else GRANITE_DARK, bevel=0.14)
    # The monolith, split down its face by an age of strikes.
    p.box((0, 1.6, 12.6), (5.6, 4.0, 19.4), GRANITE_DARK, taper=0.5, bevel=0.25)
    p.box((-0.2, 1.4, 23.2), (2.9, 2.2, 3.4), GRANITE, taper=0.7, bevel=0.15, roll=0.04)
    crack(p, 0.0, -0.46, 3.4, 8.0, width=0.2, tone=ARC, wander=0.5)
    crack(p, 0.2, -0.1, 8.0, 13.5, width=0.16, tone=ARC_DIM, wander=0.4)
    # Copper: bands round it, a crown of prongs, the rod that draws the sky down.
    for z, w, d in ((6.0, 5.3, 4.0), (11.5, 4.5, 3.4), (17.0, 3.7, 2.9), (21.4, 3.2, 2.5)):
        p.box((0, 1.6, z), (w, d, 0.55), COPPER if z != 11.5 else VERDIGRIS, bevel=0.06)
    p.prism((0, 1.5, 24.8), 6, 0.34, 0.2, 6.0, COPPER)
    for k in range(4):
        a = k * math.tau / 4 + 0.4
        p.sweep(p.bezier((math.cos(a) * 0.8, 1.5 + math.sin(a) * 0.8, 24.6), (math.cos(a) * 2.4, 1.5 + math.sin(a) * 2.4, 25.6),
                         (math.cos(a) * 1.9, 1.5 + math.sin(a) * 1.9, 28.2), steps=4), 0.18, 0.06, VERDIGRIS if k % 2 else COPPER, sides=4)
    p.rock((0, 1.5, 31.0), (0.5, 0.5, 0.7), ARC, jitter=0.1, mat=GLOW)
    # The hall that stood round it: two broken piers and a span that did not fall.
    for side, h in ((-1, 12.0), (1, 8.0)):
        p.box((side * 12.0, 2.4, h / 2), (3.4, 3.2, h), GRANITE_DARK, taper=0.86, bevel=0.2)
        p.box((side * 12.0, 2.4, h + 0.3), (4.2, 3.8, 0.8), GRANITE if side < 0 else GRANITE_DEEP, bevel=0.12, roll=0.0 if side < 0 else 0.22)
        p.box((side * 12.0, 0.72, h * 0.55), (2.2, 0.2, 0.5), VERDIGRIS)
    p.box((-9.2, 2.4, 13.3), (4.4, 2.6, 1.3), GRANITE, roll=-0.16, bevel=0.15)
    for x, y, z, w, yaw, roll in ((8.4, -2.6, 0.7, 3.2, 0.5, 0.2), (5.0, -3.4, 0.5, 2.0, -0.4, -0.1), (-6.6, -3.0, 0.5, 2.4, 0.9, 0.12),
                                  (14.6, -1.4, 0.6, 2.4, 0.2, 0.3)):
        p.box((x, y, z), (w, w * 0.7, 1.1), GRANITE_DEEP if w < 2.2 else GRANITE, yaw=yaw, roll=roll, bevel=0.15)
    # Grounded: heavy chain from the copper down to ringbolts set in the floor.
    for side in (-1, 1):
        chain_run(p, (side * 2.4, 0.4, 16.6), (side * 9.2, -2.4, 0.9), size=0.8, sag=2.2)
        anchor_ring(p, (side * 9.4, -2.5, 0.0), r=0.7)
    return p


# ------------------------------------------------------------------- props
def split_menhir():
    """A standing stone the lightning keeps finding: split, scorched, a glow in the wound."""
    p = piece('Kit_SplitMenhir')
    p.rock((0, 0.3, 0.3), (3.6, 2.8, 1.1), GRANITE_DEEP, jitter=0.18)
    p.box((-0.72, 0.2, 3.3), (1.5, 1.5, 6.6), GRANITE, taper=0.6, roll=-0.07, bevel=0.2)
    p.box((0.74, 0.2, 2.8), (1.4, 1.4, 5.6), GRANITE_DARK, taper=0.5, roll=0.1, bevel=0.2)
    p.box((0.02, 0.1, 2.6), (0.22, 1.0, 4.6), ARC_DIM, mat=GLOW, taper=0.4)
    p.box((-0.75, -0.57, 5.4), (1.0, 0.1, 1.6), SCORCH, roll=-0.07)
    p.box((0.72, -0.5, 4.4), (0.8, 0.1, 1.3), SCORCH, roll=0.1)
    return p


def lightning_rod():
    """A conductor of copper on an iron foot. A spark lives at its tip."""
    p = piece('Kit_LightningRod')
    for k in range(3):
        a = k * math.tau / 3 + 0.3
        p.sweep([(math.cos(a) * 1.1, math.sin(a) * 1.1, 0), (math.cos(a) * 0.2, math.sin(a) * 0.2, 2.2)], 0.1, 0.1, IRON_DARK, sides=4)
    p.prism((0, 0, 1.8), 6, 0.2, 0.12, 6.4, COPPER)
    for z, r in ((3.0, 0.5), (4.2, 0.42), (5.4, 0.34)):
        p.prism((0, 0, z), 8, r, r, 0.16, VERDIGRIS)
    p.prism((0, 0, 8.2), 6, 0.3, 0.06, 0.8, COPPER)
    p.rock((0, 0, 9.2), (0.3, 0.3, 0.4), ARC, jitter=0.1, mat=GLOW)
    return p


def torn_banner():
    """A war banner the wind has been at for years. It rocks on its pole."""
    p = piece('Kit_TornBanner')
    p.rock((0, 0, 0.2), (1.6, 1.5, 0.8), GRANITE_DEEP, jitter=0.18)
    start = p.mark()
    p.prism((0, 0, 0), 6, 0.15, 0.11, 9.4, WOOD)
    p.spike((0, 0, 9.4), 0.24, 0.8, IRON, sides=4)
    p.box((1.3, 0, 8.6), (3.0, 0.14, 0.14), WOOD)
    torn_cloth(p, 0.0, 8.5, 2.7, (4.4, 2.6, 3.8, 1.9, 3.1))
    p.box((1.35, -0.12, 7.4), (0.8, 0.08, 0.8), TRIM, roll=math.pi / 4, pitch=0.14)
    p.turn(start, Matrix.Rotation(0.07, 4, 'Y'))
    return p


def bone_cluster():
    """What is left of something very large that came up here to die."""
    p = piece('Kit_BoneCluster')
    for x, top, tone in ((-2.2, 5.2, BONE), (-0.6, 6.0, BONE_OLD), (1.0, 5.6, BONE), (2.6, 4.4, BONE_OLD)):
        p.sweep(p.bezier((x, 1.2, 0.0), (x + 0.1, 2.2, top * 0.8), (x + 0.3, -1.0, top), steps=6), 0.34, 0.1, tone, sides=5, squash=0.7)
    for k in range(5):
        p.prism((-2.8 + k * 1.4, 1.4, 0.45), 6, 0.55, 0.5, 0.9, BONE_OLD if k % 2 else BONE, axis='X')
        p.box((-2.4 + k * 1.4, 1.4, 1.2), (0.25, 0.3, 0.8), BONE, taper=0.5)
    p.sweep([(-3.6, -1.4, 0.3), (-0.2, -1.9, 0.35)], 0.3, 0.26, BONE, sides=6)
    for x in (-3.7, -0.1):
        p.rock((x, -1.45 if x < -1 else -1.9, 0.35), (0.85, 0.7, 0.6), BONE_OLD, jitter=0.12)
    p.rock((3.2, -0.8, 0.2), (1.4, 1.2, 0.7), GRANITE_DEEP, jitter=0.2)
    return p


def grounding_chain():
    """A heavy chain from a bolt high on the wall to a ringbolt in the floor. Origin at the wall's foot."""
    p = piece('Kit_GroundingChain')
    p.box((0, 0.6, 7.6), (1.2, 1.0, 1.2), IRON, bevel=0.1)
    chain_run(p, (0, 0.2, 7.4), (0, -4.6, 0.8), size=0.78, sag=1.6)
    anchor_ring(p, (0, -4.8, 0.0), r=0.62)
    p.box((0, 0.4, 3.6), (1.0, 0.5, 0.5), VERDIGRIS)
    return p


def storm_shrine():
    """A wayside shrine to the storm, unroofed by it."""
    p = piece('Kit_StormShrine')
    p.box((0, 0.4, 0.3), (5.0, 3.4, 0.6), GRANITE_DARK, bevel=0.1)
    for side, h in ((-1, 4.4), (1, 2.6)):
        p.box((side * 1.9, 0.8, 0.6 + h / 2), (0.9, 0.9, h), GRANITE, bevel=0.1)
    p.box((-0.6, 0.8, 5.3), (3.6, 1.6, 0.5), COPPER, roll=-0.22, bevel=0.05)
    p.box((2.6, -0.9, 0.85), (2.2, 1.2, 0.3), VERDIGRIS, yaw=0.5, roll=0.3, bevel=0.05)
    p.box((0, 1.0, 1.6), (1.6, 0.8, 2.0), GRANITE_DEEP, bevel=0.1)
    crack(p, 0.0, 0.58, 0.8, 2.5, width=0.1, tone=ARC_DIM, wander=0.25)
    p.prism((0, -0.3, 0.6), 8, 0.4, 0.7, 0.45, COPPER)
    p.rock((0, -0.3, 1.1), (0.3, 0.3, 0.26), ARC_DIM, jitter=0.1, mat=GLOW)
    p.box((1.9, 0.8, 3.5), (0.7, 0.7, 0.6), GRANITE_DARK, roll=0.3, bevel=0.1)
    return p


BUILDERS = (lightning_spire, split_menhir, lightning_rod, torn_banner, bone_cluster, grounding_chain, storm_shrine)

if __name__ == '__main__':
    parts = build_kit('StormKit_ROOT', BUILDERS)
    export_kit(os.path.join(here(__file__), 'storm_kit_components.glb'))
    if '--preview' in sys.argv:
        preview(parts, {
            'Kit_LightningSpire': (0, 12, 0, 0), 'Kit_SplitMenhir': (-20, -2, 0, 0.3), 'Kit_LightningRod': (-13, -5, 0, 0),
            'Kit_TornBanner': (-7, -7, 0, 0), 'Kit_BoneCluster': (1, -7, 0, 0), 'Kit_GroundingChain': (10, -2, 0, 0),
            'Kit_StormShrine': (19, -3, 0, -0.3),
        }, os.path.join(here(__file__), 'storm_kit.png'), background=(0.06, 0.065, 0.075))
