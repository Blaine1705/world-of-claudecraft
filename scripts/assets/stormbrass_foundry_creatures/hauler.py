"""The Gantry Hauler: the Stormbrass Foundry's Rail Yard showpiece patrol
(src/sim/encounters/stormbrass_foundry/gantry_hauler.ts).

  blender -b --factory-startup --python hauler.py -- <out.glb|-> [--sheet dir] [--blend out.blend] [--fast] [--nobake]

A huge tracked steam crawler hauling its boiler and a load of brass plates
round the yard. Two great caterpillar tread units (the links are fixed; the
drive sprocket, the idler and the road wheels turn on their own bones), a long
riveted iron chassis on its own suspension bone, a hazard-striped ram plough
across the front with two Steam Blast nozzles above it. Amidships a big
horizontal copper BOILER banded in iron with its steam dome, safety valve and
gauges; under its front the firebox, its grates glowing storm blue-white (the
Foundry runs on lightning, never embers); a tall flared CHIMNEY (the effect
layer puts the smoke on its lip) and a brass KLAXON horn. At the front an open
CAB with a goggled ENGINEER at his levers (his own spine, head and arm bones:
he looks about, hauls the levers, ducks when it dies) and a caged amber beacon
turning on its roof. On the boiler's back a small CRANE: a turntable, a truss
boom and a claw gripping a brass SCRAP PLATE (on its own bone: it leaves the
claw at the throw and a fresh one is gripped later). At the rear a tipping
BED stacked with brass plates.

Scale: about 3.46 yards to the chimney's lip and 4.7 long as authored; the
VISUALS row stands it some 9 yards tall at its template's 2.6 (the knight is
2.6).

Clips (24 fps): Idle, Walk, Run, Ram (attack: a lunge), CraneSwipe (attack:
the boom swung flat round), SteamBlast (the 1.5 s bar braced and building,
the blast at its end, the recoil played out), ScrapToss (the boom whipped
over like a catapult, the plate gone at frame 20), Unload (the bed tipped up
and dropped), Hit, Death (it lurches, the crane collapses, the engineer
ducks, it settles down on one tread).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from foundry_kit import (  # noqa: E402
    ARC, ARC_HOT, BLACK, BODY, BRASS, BRASS_D, BRASS_HI, COPPER, COPPER_D, GLASS, GLOW, HAIR, HAZARD, IRON,
    IRON_D, IRON_HI, LEATHER, LEATHER_D, LENS, METAL, SIGNAL_RED, SKIN, SKIN_D, STEEL, VERDI, WARN, MachineRig,
    Matrix, MPart, Vector, anim, basis, expand_bones, lerp, run, tracks,
)

SOOT = (0.05, 0.05, 0.055)
PAINT = (0.3, 0.33, 0.3)          # the chassis' old green-grey paint over iron
PAINT_D = (0.2, 0.22, 0.2)

TRACK_X = 1.05
TRACK_Z = 0.55
# basis((0, 0, 1)) has no defined heading (its up is its forward): world-aligned parts use this.
UP = Matrix.Identity(3)
RUBBER_TONE = (0.1, 0.1, 0.11)
TRACK_LEN = 3.78
TRACK_H = 0.92
HALF = TRACK_LEN / 2 - TRACK_H / 2
WHEELS = [   # (name, y, z, radius, sprocket?)
    ('Wheel1', -HALF, TRACK_Z, 0.4, True),
    ('Wheel2', -0.68, 0.41, 0.3, False),
    ('Wheel3', 0.0, 0.41, 0.3, False),
    ('Wheel4', 0.68, 0.41, 0.3, False),
    ('Wheel5', HALF, TRACK_Z, 0.4, True),
]

BOILER_C = Vector((0.0, 0.05, 1.68))
BOILER_R = 0.62
CHIMNEY = Vector((0.0, -0.62, 2.2))
CHIMNEY_TOP = 3.46
CRANE = Vector((0.0, 0.62, 2.3))

BONES = expand_bones([
    ('Root', None, (0, 0, 0), (0, 0, 0.4)),
    ('Track.L', 'Root', (TRACK_X, 0, TRACK_Z), (TRACK_X, -0.5, TRACK_Z)),
] + [(f'{n}.L', 'Track.L', (TRACK_X, y, z), (TRACK_X + 0.25, y, z)) for n, y, z, _, _ in WHEELS] + [
    ('Body', 'Root', (0, 0, 0.9), (0, 0, 1.4)),
    ('Beacon', 'Body', (0.5, -1.55, 2.2), (0.5, -1.55, 2.42)),
    ('Bed', 'Body', (0, 2.3, 1.06), (0, 1.2, 1.06)),
    ('CraneBase', 'Body', tuple(CRANE), tuple(CRANE + Vector((0, 0, 0.32)))),
    ('Boom', 'CraneBase', tuple(CRANE + Vector((0, 0, 0.32))), (0, 1.76, 3.06)),
    ('Claw', 'Boom', (0, 1.76, 3.06), (0, 1.76, 2.72)),
    ('Plate', 'Claw', (0, 1.76, 2.62), (0, 1.76, 2.3)),
    ('EngSpine', 'Body', (0, -1.42, 1.32), (0, -1.44, 1.66)),
    ('Head', 'EngSpine', (0, -1.45, 1.7), (0, -1.47, 1.98)),
    ('EngArm.L', 'EngSpine', (0.17, -1.43, 1.62), (0.23, -1.62, 1.46)),
    ('EngFore.L', 'EngArm.L', (0.23, -1.62, 1.46), (0.2, -1.84, 1.52)),
])
REST = {n: (Vector(h), Vector(t)) for n, _, h, t in BONES}


def M(v, s):
    return Vector((s * v.x, v.y, v.z))


def hazard_band(p, center, frame, length, height, n, depth=0.02):
    """A continuous hazard band on a face: a yellow strip (the frame's x along it,
    y across it, z out of the face) with black chevron bars slanted across it."""
    c = Vector(center)
    x, y, z = frame.col[0], frame.col[1], frame.col[2]
    p.obox(tuple(c + z * depth * 0.5), (length, height, depth), frame, HAZARD, mat=BODY)
    slant = math.radians(40)
    bar = Matrix.Rotation(slant, 3, 'Z')
    step = length / n
    w = step * 0.5 * math.cos(slant)
    for k in range(n):
        u = -length / 2 + step * (k + 0.5)
        p.obox(tuple(c + x * u + z * depth * 1.05), (w, height / math.cos(slant) * 0.98, depth * 0.6),
               frame @ bar, BLACK, mat=BODY)
    for sgn in (-1, 1):   # trim strips hiding the bars' cut ends
        p.obox(tuple(c + y * sgn * (height / 2 + 0.015) + z * depth * 0.8), (length, 0.05, depth * 1.6), frame,
               IRON_D, mat=METAL)


def build_parts():
    parts = []

    def part(name, bone, **kw):
        pt = MPart(name, bone, **kw)
        parts.append(pt)
        return pt

    # ---- the tread units and their wheels -------------------------------------------------
    for s, tag in ((1, '.L'), (-1, '.R')):
        tr = part('Track' + tag, 'Track' + tag)
        cx = s * TRACK_X
        tr.treads((cx, 0, TRACK_Z), TRACK_LEN, TRACK_H, 0.6, links=46, color=IRON_D)
        # the track frame inside the loop: a riveted side plate each side of the wheels
        for side_ in (-1, 1):
            x = cx + side_ * 0.17
            tr.obox((x, 0, TRACK_Z + 0.02), (0.05, TRACK_LEN - 1.05, 0.42), UP, IRON, mat=METAL,
                    bevel=0.015)
            tr.rivet_line((x + side_ * 0.03, -1.2, TRACK_Z + 0.17), (x + side_ * 0.03, 1.2, TRACK_Z + 0.17), 9,
                          0.022, BRASS_D, normal=(side_, 0, 0))
            tr.rivet_line((x + side_ * 0.03, -1.2, TRACK_Z - 0.13), (x + side_ * 0.03, 1.2, TRACK_Z - 0.13), 9,
                          0.022, BRASS_D, normal=(side_, 0, 0))
        # the return rollers along the top run
        for y in (-0.7, 0.0, 0.7):
            tr.cyl((cx - 0.22, y, TRACK_Z + 0.36), (cx + 0.22, y, TRACK_Z + 0.36), 0.07, STEEL, sides=12)
        for name, y, z, r, sprocket in WHEELS:
            w = part(name + tag, name + tag)
            c = Vector((cx, y, z))
            ax = Vector((1, 0, 0))
            if sprocket:
                w.gear(tuple(c), tuple(ax), r * 0.92, 14, 0.12, IRON_HI, hub=0.32, spokes=6)
                w.disc(tuple(c), tuple(ax), r * 0.62, 0.3, IRON, sides=20)
                w.disc(tuple(c + ax * s * 0.16), tuple(ax), r * 0.32, 0.06, BRASS, sides=16)
                w.rivet_circle(c + ax * s * 0.2, ax * s, r * 0.24, 6, 0.025, BRASS_D)
                w.cyl(c - ax * 0.32, c + ax * 0.32, 0.06, STEEL, sides=10)
            else:
                w.disc(tuple(c), tuple(ax), r, 0.36, RUBBER_TONE, sides=24)
                w.disc(tuple(c + ax * s * 0.17), tuple(ax), r * 0.78, 0.05, IRON, sides=20)
                for k in range(6):   # spokes, so the turn reads
                    a = math.tau * k / 6
                    d = Vector((0, math.cos(a), math.sin(a)))
                    w.obox(tuple(c + ax * s * 0.2 + d * r * 0.42), (0.04, 0.07, r * 0.62),
                           basis(d, (1, 0, 0)), BRASS_D, mat=METAL, bevel=0.01)
                w.disc(tuple(c + ax * s * 0.21), tuple(ax), r * 0.24, 0.06, BRASS, sides=14)
                w.rivet_circle(c + ax * s * 0.24, ax * s, r * 0.16, 5, 0.02, BRASS_D)
    # ---- the chassis -----------------------------------------------------------------------------
    ch = part('Chassis', 'Body')
    ch.obox((0, 0.05, 0.66), (1.42, 3.7, 0.42), UP, IRON_D, mat=METAL, bevel=0.03)
    ch.obox((0, 0.05, 0.96), (1.62, 4.1, 0.2), UP, PAINT, bevel=0.035)
    ch.rivet_line((0.8, -1.9, 0.96), (0.8, 2.0, 0.96), 16, 0.025, BRASS_D, normal=(1, 0, 0))
    ch.rivet_line((-0.8, -1.9, 0.96), (-0.8, 2.0, 0.96), 16, 0.025, BRASS_D, normal=(-1, 0, 0))
    for s in (-1, 1):
        # the fender over each tread, riveted, its leading edge hazard-painted
        ch.plate((s * TRACK_X, 0.0, 1.17), (0.74, 3.95, 0.07), UP, PAINT, mat=BODY, bevel=0.02,
                 rivet=0.022, rivet_n=(10, 3))
        ch.obox((s * TRACK_X, -2.02, 0.9), (0.74, 0.08, 0.32), basis((0, -0.3, 1)), PAINT_D, bevel=0.02)
        ch.hazard(Vector((s * (TRACK_X - 0.35), -2.07, 0.84)), Vector((s * (TRACK_X + 0.35), -2.07, 0.84)),
                  (0, -1, 0.3), 0.22, 4)
        # a skirt of hanging armour plates down the tread's outer side
        for k in range(5):
            y = -1.5 + 0.75 * k
            ch.plate((s * (TRACK_X + 0.34), y, 0.84), (0.68, 0.36, 0.05), basis((s, 0, 0), (0, 0, 1)),
                     PAINT if k % 2 else PAINT_D, mat=BODY, bevel=0.015, rivet=0.02, rivet_n=(3, 2))
        # the firebox grates glowing storm blue under the boiler's front
        g0 = Vector((s * 0.72, -0.75, 1.24))
        ch.obox(tuple(g0), (0.03, 0.62, 0.3), UP, ARC, mat=GLOW)
        ch.obox(tuple(g0 + Vector((s * 0.004, 0, 0))), (0.02, 0.3, 0.12), UP, ARC_HOT, mat=GLOW)
        for k in range(7):
            ch.obox((s * 0.75, -1.02 + 0.09 * k, 1.24), (0.04, 0.03, 0.34), UP, IRON_D, mat=METAL)
        ch.obox((s * 0.75, -0.75, 1.42), (0.06, 0.7, 0.05), UP, IRON, mat=METAL)
        ch.obox((s * 0.75, -0.75, 1.06), (0.06, 0.7, 0.05), UP, IRON, mat=METAL)
        # handrails along the deck edge
        posts = [Vector((s * 0.78, y, 1.06)) for y in (-0.9, -0.2, 0.5, 1.1)]
        for p0 in posts:
            ch.cyl(p0, p0 + Vector((0, 0, 0.42)), 0.022, BRASS_D, sides=6)
        ch.tube([p0 + Vector((0, 0, 0.42)) for p0 in posts], [0.025] * len(posts), BRASS, sides=6, mat=METAL)
        # the steam pipes from the boiler down to each nozzle
        ch.pipe([BOILER_C + Vector((s * 0.4, -0.55, 0.35)), Vector((s * 0.66, -0.9, 1.98)),
                 Vector((s * 0.86, -1.1, 1.7)), Vector((s * 0.86, -1.7, 1.42)), Vector((s * 0.66, -1.84, 1.26))],
                0.06, COPPER)
        # the Steam Blast nozzle, flared
        n0, n1 = Vector((s * 0.62, -1.84, 1.24)), Vector((s * 0.6, -2.22, 1.16))
        ch.cyl(n0, n1, 0.12, BRASS_D, sides=14, r2=0.13)
        nd = (n1 - n0).normalized()
        ch.tube([n1, n1 + nd * 0.1, n1 + nd * 0.16], [0.13, 0.18, 0.21], BRASS, sides=16, cap=False)
        ch.disc(tuple(n1 + nd * 0.06), tuple(nd), 0.11, 0.02, SOOT, sides=14)
        for k in range(3):
            ch.ring(n0.lerp(n1, 0.2 + 0.3 * k), nd, 0.13, 0.025, IRON, sides=14)
        # a lantern on each front corner
        lc = Vector((s * 0.82, -1.98, 1.22))
        ch.cyl(lc - Vector((0, 0, 0.1)), lc + Vector((0, 0, 0.1)), 0.09, IRON, sides=10)
        ch.disc(tuple(lc + Vector((0, -0.08, 0))), (0, -1, 0), 0.07, 0.03, (1.0, 0.92, 0.7), sides=12, mat=GLOW)
    # the ram plough across the front: a raked iron blade, hazard paint, teeth
    ram_f = basis((0, 0.38, 1.0))
    ch.obox((0, -2.18, 0.52), (2.6, 0.14, 0.86), ram_f, IRON, mat=METAL, bevel=0.03)
    band_f = Matrix((-ram_f.col[0], ram_f.col[2], ram_f.col[1])).transposed()
    hazard_band(ch, (0, -2.26, 0.6), band_f, 2.5, 0.36, 9, depth=0.025)
    ch.obox((0, -2.27, 0.24), (2.62, 0.12, 0.12), ram_f, STEEL, mat=METAL, bevel=0.02)
    for k in range(9):
        x = -1.2 + 0.3 * k
        ch.spike((x, -2.36, 0.22), 0.06, 0.18, STEEL, sides=4, lean=(0, -0.12), mat=METAL)
    ch.rivet_line((-1.2, -2.13, 0.92), (1.2, -2.13, 0.92), 12, 0.025, BRASS_D, normal=tuple(ram_f.col[1]))
    for s in (-1, 1):   # the ram's push arms back to the chassis
        ch.piston(Vector((s * 0.55, -1.7, 0.72)), Vector((s * 0.55, -2.12, 0.6)), 0.07)
    # a ladder up the right flank, a toolbox, coiled chain on the deck
    for k in range(5):
        ch.cyl((-0.86, 0.95, 1.1 + 0.18 * k), (-0.86, 1.15, 1.1 + 0.18 * k), 0.018, IRON_HI, sides=6)
    for y in (0.95, 1.15):
        ch.cyl((-0.86, y, 1.05), (-0.86, y, 1.92), 0.022, IRON, sides=6)
    ch.obox((0.5, 1.02, 1.17), (0.42, 0.26, 0.22), UP, SIGNAL_RED, bevel=0.025)
    ch.obox((0.5, 1.02, 1.29), (0.32, 0.06, 0.03), UP, IRON_D, mat=METAL)
    # ---- the boiler -----------------------------------------------------------------------------
    bo = part('Boiler', 'Body')
    b0 = BOILER_C - Vector((0, 1.0, 0))
    b1 = BOILER_C + Vector((0, 0.95, 0))
    bo.cyl(b0, b1, BOILER_R, COPPER, sides=32)
    bo.blob(tuple(b1), (BOILER_R * 2, 0.5, BOILER_R * 2), COPPER_D, segments=32, rings=12, mat=METAL)
    bo.disc(tuple(b0), (0, -1, 0), BOILER_R * 1.02, 0.06, IRON, sides=32)
    bo.rivet_circle(b1 + Vector((0, 0.05, 0)), (0, 1, 0), BOILER_R * 0.93, 24, 0.022, BRASS_D)
    bo.disc(tuple(b1 + Vector((0, 0.22, -0.05))), (0, 1, 0.1), 0.24, 0.06, IRON, sides=18)
    bo.rivet_circle(b1 + Vector((0, 0.26, -0.05)), (0, 1, 0.1), 0.19, 8, 0.025, BRASS_D)
    for k in range(5):
        y = -0.85 + 0.43 * k
        bo.ring(BOILER_C + Vector((0, y, 0)), (0, 1, 0), BOILER_R + 0.012, 0.04, IRON, sides=36)
        bo.rivet_circle(BOILER_C + Vector((0, y + 0.08, 0)), (0, 1, 0), BOILER_R + 0.006, 22, 0.02, BRASS_D)
    for s in (-1, 1):
        bo.rivet_line(BOILER_C + Vector((s * BOILER_R * 0.7, -0.95, BOILER_R * 0.7)),
                      BOILER_C + Vector((s * BOILER_R * 0.7, 0.9, BOILER_R * 0.7)), 14, 0.02, BRASS_D,
                      normal=(s, 0, 1))
        # gauges on the flanks and a water glass
        bo.gauge(tuple(BOILER_C + Vector((s * (BOILER_R + 0.05), 0.35, 0.05))), (s, 0, 0), 0.17, ticks=9,
                 up=(0, 0, 1))
        bo.cyl(BOILER_C + Vector((s * (BOILER_R + 0.03), 0.35, 0.05)),
               BOILER_C + Vector((s * (BOILER_R - 0.02), 0.35, 0.05)), 0.12, BRASS_D, sides=12)
        wg = BOILER_C + Vector((s * (BOILER_R + 0.06), -0.3, -0.1))
        bo.cyl(wg, wg + Vector((0, 0, 0.36)), 0.035, (0.55, 0.85, 0.95), sides=8, mat=GLASS)
        bo.cyl(wg - Vector((0, 0, 0.05)), wg, 0.05, BRASS, sides=8)
        bo.cyl(wg + Vector((0, 0, 0.36)), wg + Vector((0, 0, 0.41)), 0.05, BRASS, sides=8)
    # the cradle saddles it rests in
    for y in (-0.6, 0.6):
        bo.obox((0, BOILER_C.y + y, 1.17), (1.2, 0.18, 0.3), UP, IRON_D, mat=METAL, bevel=0.03)
    # steam dome, sand dome, safety valve, whistle
    top = BOILER_C.z + BOILER_R
    bo.lathe((0, 0.15, top - 0.08), [(0.3, 0), (0.29, 0.18), (0.24, 0.3), (0.13, 0.36), (0.0, 0.37)], 24, BRASS,
             mat=METAL)
    bo.ring(Vector((0, 0.15, top - 0.04)), (0, 0, 1), 0.31, 0.03, BRASS_D, sides=24)
    bo.lathe((0, 0.55, top - 0.06), [(0.18, 0), (0.17, 0.12), (0.1, 0.2), (0.0, 0.22)], 18, COPPER_D, mat=METAL)
    sv = Vector((0.24, -0.25, top - 0.02))
    bo.cyl(sv, sv + Vector((0, 0, 0.26)), 0.05, BRASS_D, sides=10)
    bo.blob(tuple(sv + Vector((0, 0, 0.28))), (0.12, 0.12, 0.08), BRASS_HI, segments=10, rings=6, mat=METAL)
    bo.cyl(sv + Vector((0, 0, 0.2)), sv + Vector((-0.02, 0.32, 0.18)), 0.018, IRON, sides=6)
    bo.blob(tuple(sv + Vector((-0.02, 0.34, 0.16))), (0.08, 0.08, 0.08), IRON_D, segments=8, rings=5, mat=METAL)
    # the copper feed pipes along the boiler's back and the whistle
    for s in (-1, 1):
        bo.pipe([Vector((s * 0.22, -0.7, top - 0.02)), Vector((s * 0.26, 0.05, top + 0.06)),
                 Vector((s * 0.3, 0.75, top - 0.06))], 0.035, COPPER)
    wh = Vector((-0.18, 0.42, top))
    bo.cyl(wh, wh + Vector((0, 0, 0.22)), 0.03, BRASS_D, sides=8)
    bo.lathe(tuple(wh + Vector((0, 0, 0.22))), [(0.05, 0), (0.06, 0.16), (0.04, 0.2), (0.0, 0.22)], 12, BRASS_HI,
             mat=METAL)
    # ---- the chimney ------------------------------------------------------------------------------
    cb = CHIMNEY
    bo.obox(tuple(cb + Vector((0, 0, -0.05))), (0.56, 0.5, 0.18), UP, IRON_D, mat=METAL, bevel=0.03)
    bo.cyl(cb, cb + Vector((0, 0, 0.95)), 0.2, IRON, sides=20, r2=0.23)
    bo.lathe(tuple(cb + Vector((0, 0, 0.95))), [(0.23, 0), (0.28, 0.12), (0.36, 0.26), (0.37, 0.31),
                                               (0.3, 0.31), (0.0, 0.31)], 22, IRON_D, mat=METAL)
    bo.disc(tuple(cb + Vector((0, 0, 1.26))), (0, 0, 1), 0.27, 0.03, SOOT, sides=20, mat=BODY)
    for z in (0.18, 0.55, 0.93):
        bo.ring(cb + Vector((0, 0, z)), (0, 0, 1), 0.215 + z * 0.02, 0.025, BRASS_D, sides=22)
    bo.rivet_line(cb + Vector((0, -0.21, 0.2)), cb + Vector((0, -0.225, 0.9)), 6, 0.018, BRASS_D, normal=(0, -1, 0))
    # soot running down from the lip
    for k in range(6):
        a = math.tau * k / 6 + 0.3
        p0 = cb + Vector((math.cos(a) * 0.235, math.sin(a) * 0.235, 0.9))
        bo.obox(tuple(p0), (0.06, 0.22, 0.012), basis((math.cos(a), math.sin(a), 0), (0, 0, 1)), SOOT)
    # the klaxon horn by the chimney
    hb = Vector((-0.3, -0.85, top - 0.04))
    bo.cyl(hb, hb + Vector((0, 0, 0.3)), 0.04, BRASS_D, sides=8)
    bo.tube([hb + Vector((0, 0, 0.3)), hb + Vector((0, -0.18, 0.38)), hb + Vector((0, -0.42, 0.4)),
             hb + Vector((0, -0.56, 0.4))], [0.05, 0.07, 0.15, 0.24], BRASS_HI, sides=18, mat=METAL)
    bo.disc(tuple(hb + Vector((0, -0.565, 0.4))), (0, -1, 0), 0.2, 0.01, BRASS_D, sides=18)
    # ---- the cab ------------------------------------------------------------------------------------
    cab = part('Cab', 'Body')
    for x in (-0.74, 0.74):
        for y in (-1.98, -1.08):
            cab.obox((x, y, 1.6), (0.09, 0.09, 1.08), UP, IRON, mat=METAL, bevel=0.015)
    cab.plate((0, -1.53, 2.17), (1.66, 1.12, 0.08), UP, BRASS, mat=METAL, bevel=0.025, rivet=0.022,
              rivet_n=(8, 5))
    cab.obox((0, -1.53, 2.23), (1.4, 0.86, 0.06), UP, BRASS_D, mat=METAL, bevel=0.015)
    cab.obox((0, -1.98, 1.28), (1.48, 0.07, 0.42), UP, PAINT, bevel=0.02)          # the dash
    cab.obox((0, -1.98, 2.06), (1.48, 0.07, 0.12), UP, PAINT_D, bevel=0.015)       # the brow
    hazard_band(cab, (0, -2.02, 1.12), Matrix(((1, 0, 0), (0, 0, 1), (0, -1, 0))).transposed(), 1.4, 0.1, 10)
    # the great headlamp over the cab's brow, lit storm-white
    hl = Vector((0, -2.0, 2.36))
    cab.cyl(hl + Vector((0, 0.16, 0)), hl, 0.17, BRASS, sides=20, r2=0.2)
    cab.ring(hl, (0, -1, 0), 0.19, 0.03, BRASS_HI, sides=22)
    cab.disc(tuple(hl + Vector((0, -0.01, 0))), (0, -1, 0), 0.16, 0.02, (0.92, 0.97, 1.0), sides=20, mat=GLOW)
    for k in range(3):
        cab.obox(tuple(hl + Vector((0, -0.03, -0.08 + 0.08 * k))), (0.3, 0.012, 0.012), UP, IRON_D, mat=METAL)
    cab.obox(tuple(hl + Vector((0, 0.12, -0.16))), (0.12, 0.12, 0.12), UP, IRON, mat=METAL, bevel=0.02)
    for s in (-1, 1):   # side half-walls with a round port
        cab.obox((s * 0.74, -1.53, 1.3), (0.06, 0.86, 0.46), UP, PAINT, bevel=0.02)
        cab.ring(Vector((s * 0.77, -1.53, 1.85)), (s, 0, 0), 0.16, 0.035, BRASS, sides=18)
        cab.obox((s * 0.74, -1.53, 1.99), (0.06, 0.86, 0.06), UP, IRON, mat=METAL)
    cab.obox((0, -1.08, 1.58), (1.48, 0.07, 1.04), UP, PAINT_D, bevel=0.02)        # the back wall
    # the window bars over the front
    for x in (-0.25, 0.25):
        cab.obox((x, -1.98, 1.78), (0.04, 0.04, 0.5), UP, IRON, mat=METAL)
    # the levers and the dial board in front of him
    for k, x in enumerate((-0.28, -0.12, 0.12, 0.28)):
        lv0 = Vector((x, -1.82, 1.46))
        tip = lv0 + Vector((0, -0.06 + 0.04 * (k % 2), 0.28))
        cab.cyl(lv0, tip, 0.016, STEEL, sides=6)
        cab.blob(tuple(tip), (0.07, 0.07, 0.07), SIGNAL_RED if k % 2 else BRASS_HI, segments=8, rings=5, mat=METAL)
    cab.obox((0, -1.9, 1.5), (0.8, 0.12, 0.08), UP, BRASS_D, mat=METAL, bevel=0.015)
    cab.gauge((0.45, -1.92, 1.42), (0, 1, 0.25), 0.07, ticks=7)
    cab.gauge((-0.45, -1.92, 1.42), (0, 1, 0.25), 0.07, ticks=7)
    cab.obox((0, -1.42, 1.18), (0.36, 0.3, 0.22), UP, LEATHER_D, bevel=0.04)      # his stool
    # the beacon's housing on the roof, its lamp on its own bone
    bc0 = Vector(REST['Beacon'][0])
    cab.cyl(bc0 - Vector((0, 0, 0.0)), bc0 + Vector((0, 0, 0.04)), 0.14, IRON, sides=14)
    bk = part('Beacon', 'Beacon')
    bk.blob(tuple(bc0 + Vector((0, 0, 0.15))), (0.22, 0.22, 0.26), WARN, segments=14, rings=8, mat=GLOW)
    bk.obox(tuple(bc0 + Vector((0, 0, 0.15))), (0.04, 0.26, 0.22), UP, IRON_D, mat=METAL)
    for k in range(4):
        a = math.tau * k / 4 + 0.4
        bk.cyl(bc0 + Vector((math.cos(a) * 0.15, math.sin(a) * 0.15, 0.03)),
               bc0 + Vector((math.cos(a) * 0.15, math.sin(a) * 0.15, 0.3)), 0.012, IRON_D, sides=5)
    bk.disc(tuple(bc0 + Vector((0, 0, 0.31))), (0, 0, 1), 0.16, 0.03, IRON_D, sides=14)
    # ---- the engineer in the cab ----------------------------------------------------------------
    sp = part('EngSpine', 'EngSpine', hard=False)
    sp.blob((0, -1.42, 1.47), (0.44, 0.34, 0.46), LEATHER, segments=14, rings=10)
    sp.blob((0, -1.43, 1.64), (0.36, 0.28, 0.16), LEATHER_D, segments=12, rings=6)      # the coat collar
    sp.tube([Vector((math.sin(a) * 0.15, -1.45 + math.cos(a) * 0.12, 1.66)) for a in
             (i * math.tau / 16 for i in range(17))], [0.03] * 17, SIGNAL_RED, sides=6)     # a red scarf
    sp.tube([Vector((0.05, -1.58, 1.65)), Vector((0.08, -1.6, 1.5)), Vector((0.1, -1.58, 1.38))],
            [0.035, 0.03, 0.02], SIGNAL_RED, sides=6, squash=0.4, up=(0, -1, 0))
    for s in (-1, 1):
        sp.obox((s * 0.1, -1.55, 1.38), (0.05, 0.02, 0.3), UP, LEATHER_D, bevel=0.005)
    hd = part('Head', 'Head', hard=False)
    hc = Vector((0, -1.47, 1.83))
    hd.blob(tuple(hc), (0.27, 0.26, 0.3), SKIN, segments=18, rings=12)
    hd.blob(tuple(hc + Vector((0, -0.13, -0.02))), (0.07, 0.07, 0.07), lerp(SKIN, SIGNAL_RED, 0.25), segments=8,
            rings=6)
    hd.blob(tuple(hc + Vector((0, 0.01, 0.08))), (0.3, 0.29, 0.18), LEATHER_D, segments=16, rings=8)  # the cap
    hd.blob(tuple(hc + Vector((0, -0.1, 0.07))), (0.22, 0.14, 0.04), LEATHER_D, rot=(-0.2, 0, 0), segments=12,
            rings=4)
    for s in (-1, 1):
        g = hc + Vector((s * 0.055, -0.115, 0.03))
        hd.cyl(g - Vector((0, -0.02, 0)), g + Vector((0, -0.03, 0)), 0.042, BRASS, sides=12)
        hd.disc(tuple(g + Vector((0, -0.032, 0))), (0, -1, 0), 0.034, 0.005, LENS, sides=12, mat=GLASS)
        hd.blob(tuple(hc + Vector((s * 0.06, -0.1, -0.08))), (0.09, 0.05, 0.035), HAIR, segments=8, rings=4)
    hd.tube([hc + Vector((math.sin(a) * 0.14, math.cos(a) * 0.125 - 0.0, 0.03)) for a in
             (math.radians(x) for x in range(25, 336, 30))], [0.012] * 11, LEATHER_D, sides=5)
    for s, tag in ((1, '.L'), (-1, '.R')):
        a0, a1 = (M(v, s) for v in REST['EngArm.L'])
        f0, f1 = (M(v, s) for v in REST['EngFore.L'])
        au = part('EngArm' + tag, 'EngArm' + tag, hard=False)
        au.tube([a0, a1], [0.065, 0.055], LEATHER, sides=10)
        fo = part('EngFore' + tag, 'EngFore' + tag, hard=False)
        fo.tube([f0, f0.lerp(f1, 0.7), f1], [0.05, 0.05, 0.045], [LEATHER, LEATHER_D, LEATHER_D], sides=10)
        fo.blob(tuple(f1 + (f1 - f0).normalized() * 0.03), (0.08, 0.08, 0.08), LEATHER_D, segments=8, rings=6)
    # ---- the crane ---------------------------------------------------------------------------------
    cr = part('CraneBase', 'CraneBase')
    cr.disc(tuple(CRANE + Vector((0, 0, 0.03))), (0, 0, 1), 0.34, 0.08, IRON, sides=24)
    cr.gear(tuple(CRANE + Vector((0, 0, 0.09))), (0, 0, 1), 0.32, 18, 0.05, BRASS_D)
    cr.cyl(CRANE + Vector((0, 0, 0.1)), CRANE + Vector((0, 0, 0.36)), 0.16, BRASS, sides=16)
    cr.obox(tuple(CRANE + Vector((0, -0.24, 0.22))), (0.36, 0.22, 0.2), UP, IRON_D, mat=METAL,
            bevel=0.025)   # the counterweight
    cr.hazard(CRANE + Vector((-0.17, -0.355, 0.22)), CRANE + Vector((0.17, -0.355, 0.22)), (0, -1, 0), 0.18, 4)
    for s in (-1, 1):
        cr.obox(tuple(CRANE + Vector((s * 0.12, 0.0, 0.38))), (0.05, 0.22, 0.2), UP, IRON, mat=METAL,
                bevel=0.01)
    bm_ = part('Boom', 'Boom')
    p0, p1 = REST['Boom']
    d = (p1 - p0).normalized()
    fr = basis(d, (0, 0, 1))
    side_v, up_v = fr.col[0], fr.col[1]
    L = (p1 - p0).length
    for sx in (-1, 1):
        for sz in (-1, 1):
            a = p0 + side_v * sx * 0.09 + up_v * sz * 0.08
            bm_.cyl(a, a + d * L, 0.025, BRASS, sides=6)
    n = 6
    for k in range(n):
        t0, t1 = k / n, (k + 1) / n
        for sx in (-1, 1):
            bm_.cyl(p0 + d * L * t0 + side_v * sx * 0.09 - up_v * 0.08,
                    p0 + d * L * t1 + side_v * sx * 0.09 + up_v * 0.08, 0.014, IRON, sides=5)
        bm_.cyl(p0 + d * L * t1 - side_v * 0.09 + up_v * 0.08, p0 + d * L * t1 + side_v * 0.09 + up_v * 0.08,
                0.014, IRON, sides=5)
    bm_.cyl(p0 - side_v * 0.14, p0 + side_v * 0.14, 0.07, IRON, sides=12)
    bm_.cyl(p1 - side_v * 0.12, p1 + side_v * 0.12, 0.09, BRASS_D, sides=14)          # the head pulley
    bm_.ring(p1, side_v, 0.09, 0.02, IRON_D, sides=14)
    bm_.piston(CRANE + Vector((0, 0.15, 0.36)) - d * 0.0, p0 + d * L * 0.42 - up_v * 0.1, 0.045)
    cl = part('Claw', 'Claw')
    c0, c1 = REST['Claw']
    cl.cyl(c0, c1 + Vector((0, 0, 0.04)), 0.012, STEEL, sides=5)          # the cable
    cl.cyl(c1 - Vector((0.1, 0, 0)), c1 + Vector((0.1, 0, 0)), 0.05, IRON, sides=10)
    cl.obox(tuple(c1 - Vector((0, 0, 0.05))), (0.26, 0.14, 0.1), UP, IRON_D, mat=METAL, bevel=0.02)
    for k in range(4):   # the grab's four fingers closed on the plate's edge
        a = math.tau * k / 4 + math.pi / 4
        o = Vector((math.cos(a) * 0.12, math.sin(a) * 0.08, 0))
        cl.tube([c1 + o * 0.6 - Vector((0, 0, 0.08)), c1 + o * 1.3 - Vector((0, 0, 0.16)),
                 c1 + o * 1.0 - Vector((0, 0, 0.3))], [0.03, 0.026, 0.012], STEEL, sides=6, mat=METAL)
    pl = part('Plate', 'Plate')
    q0 = Vector(REST['Plate'][0])
    pl.plate(tuple(q0 - Vector((0, 0, 0.2))), (0.62, 0.5, 0.06), basis((0, 1, 0), (0, 0, 1)), BRASS, bevel=0.015,
             rivet=0.022, rivet_n=(4, 3))
    pl.obox(tuple(q0 - Vector((0.24, 0, 0.42))), (0.14, 0.055, 0.14), basis((0.3, 1, 0.4), (0, 0, 1)), BRASS_D,
            mat=METAL, bevel=0.01)   # its bent corner
    # ---- the bed ---------------------------------------------------------------------------------------
    bd = part('Bed', 'Bed')
    bd.plate((0, 1.76, 1.12), (1.72, 1.16, 0.1), UP, IRON, bevel=0.02)
    for s in (-1, 1):
        bd.plate((s * 0.84, 1.76, 1.36), (1.16, 0.42, 0.07), basis((s, 0, 0), (0, 0, 1)), BRASS_D, bevel=0.015,
                 rivet=0.02, rivet_n=(5, 3))
        bd.obox((s * 0.84, 1.76, 1.58), (0.1, 1.2, 0.05), UP, IRON, mat=METAL, bevel=0.01)
    bd.plate((0, 1.2, 1.4), (1.72, 0.5, 0.07), basis((0, -1, 0), (0, 0, 1)), BRASS_D, bevel=0.015, rivet=0.02,
             rivet_n=(7, 3))
    bd.plate((0, 2.32, 1.3), (1.72, 0.32, 0.07), basis((0, 1, 0), (0, 0, 1)), PAINT, mat=BODY, bevel=0.015)
    hazard_band(bd, (0, 2.36, 1.3), Matrix(((-1, 0, 0), (0, 0, 1), (0, 1, 0))).transposed(), 1.6, 0.22, 8)
    # the load: stacked brass plates, some copper, one leaning
    import random
    rng = random.Random(7)
    for k in range(7):
        z = 1.2 + 0.07 * k
        col = [BRASS, COPPER, BRASS_HI, BRASS_D][k % 4]
        bd.obox((rng.uniform(-0.12, 0.12), 1.78 + rng.uniform(-0.1, 0.1), z), (1.3, 0.85, 0.05),
                basis((0, 0, 1), (rng.uniform(-0.15, 0.15), 1, 0)), col, mat=METAL, bevel=0.012)
    for k in range(3):
        bd.obox((-0.45 + 0.45 * k, 1.42, 1.72), (0.4, 0.05, 0.62), basis((0, -0.45, 1)), [COPPER, BRASS, VERDI][k],
                mat=METAL, bevel=0.012)
    bd.tube([Vector((-0.8, 2.2, 1.6)), Vector((-0.2, 2.0, 1.75)), Vector((0.4, 1.95, 1.72)), Vector((0.8, 2.2, 1.6))],
            [0.025] * 4, STEEL, sides=6, mat=METAL)   # a chain over the load
    # a tow hook and its chain at the back
    bd.cyl(Vector((0, 2.36, 1.02)), Vector((0, 2.56, 1.0)), 0.05, IRON, sides=10)
    bd.ring(Vector((0, 2.62, 0.96)), (1, 0, 0), 0.08, 0.025, STEEL, sides=14)
    # the hinge at the back
    bd.cyl(Vector((-0.8, 2.3, 1.06)), Vector((0.8, 2.3, 1.06)), 0.06, IRON, sides=12)
    return parts




# --------------------------------------------------------------------------- clips
def make_clips(arm):
    rig = MachineRig(BONES).attach(arm)
    P = rig.pose
    clips = []

    def add(name, frames, fn, loop=True):
        anim(arm, name, frames, fn, loop)
        clips.append(name)

    def pose(root=(0, 0, 0), roll=0.0, bob=0.0, pitch=0.0, sway=0.0, spin=0.0, beacon=0.0, crane=0.0, boom=0.0,
             claw=(0.0, 0.0, -1.0), plate=1.0, bed=0.0, look=(0.0, 0.0), lean=0.0, twist=0.0, arm_l=0.0, arm_r=0.0,
             fore_l=0.0, fore_r=0.0):
        """`spin` turns every wheel (degrees; the sprockets a little slower), `bob`
        lifts the chassis on its suspension, `pitch` rocks it nose down (+), `sway`
        rolls it; `crane` turns the turntable, `boom` raises the boom (+ lifts it up
        and over toward the front), `claw` is the grab's hanging direction; the
        engineer `look`s (yaw, pitch), `lean`s forward and hauls his levers."""
        turns = {'Root': [('y', roll)], 'Body': [('x', pitch), ('y', sway)], 'Beacon': [('z', beacon)],
                 'CraneBase': [('z', crane)], 'Boom': [('x', boom)], 'Bed': [('x', -bed)],
                 'EngSpine': [('x', lean), ('z', twist)], 'Head': [('z', look[0]), ('x', -look[1])],
                 'EngArm.L': [('x', arm_l)], 'EngArm.R': [('x', arm_r)],
                 'EngFore.L': [('x', fore_l)], 'EngFore.R': [('x', fore_r)]}
        for name, _, _, r, sprocket in WHEELS:
            a = spin * (0.3 / r)
            turns[name + '.L'] = [('x', a)]
            turns[name + '.R'] = [('x', a)]
        return P(aims={'Claw': claw}, turns=turns, root=root, slides={'Body': bob},
                 scales={'Plate': max(0.001, plate)})

    # ---- Idle: the engine rumbling, the beacon turning, the crane swaying ------------------------
    def idle(f):
        ph = math.tau * f / 72
        rum = math.sin(ph * 12) * 0.008 + math.sin(ph * 7 + 1) * 0.005
        return pose(bob=rum, pitch=0.25 * math.sin(ph * 2), sway=0.3 * math.sin(ph * 3), beacon=360 * f / 72,
                    crane=4 * math.sin(ph), boom=2 * math.sin(ph + 1),
                    claw=(0.06 * math.sin(ph + 0.5), 0.08 * math.sin(ph * 2), -1.0),
                    look=(38 * math.sin(ph), 6 * math.sin(ph * 2)), twist=10 * math.sin(ph), lean=4,
                    arm_l=6 * math.sin(ph * 2), arm_r=-6 * math.sin(ph * 2 + 1))
    add('Idle', 72, idle)

    def roll_(frames, turns_, amp):
        def fn(f):
            ph = math.tau * f / frames
            return pose(bob=0.025 * amp * math.sin(ph * 4) + 0.01 * math.sin(ph * 9), pitch=0.6 * amp * math.sin(ph * 2),
                        sway=0.5 * amp * math.sin(ph * 2 + 1), spin=360 * turns_ * f / frames,
                        beacon=360 * f / frames, crane=6 * amp * math.sin(ph * 2),
                        claw=(0.05 * math.sin(ph * 2), 0.15 * amp, -1.0), look=(12 * math.sin(ph), -4),
                        lean=6 + 3 * amp, arm_l=10 * math.sin(ph * 2), arm_r=-10 * math.sin(ph * 2))
        return fn
    add('Walk', 32, roll_(32, 1, 1.0))
    add('Run', 20, roll_(20, 1, 1.6))

    def oneshot(spec, extra=None):
        tr = tracks(spec)

        def fn(f):
            kw = dict(lean=4)
            kw.update(extra or {})
            kw.update(tr(f))
            return pose(**kw)
        return fn

    # ---- Ram: rocked back on its tracks, then a lunge into the plough's blow -----------------
    add('Ram', 32, oneshot({
        'root': [(0, (0, 0, 0)), (9, (0, 0.18, 0)), (13, (0, -0.55, 0), 'in'), (15, (0, -0.6, 0), 'back'),
                 (32, (0, 0, 0))],
        'spin': [(0, 0), (9, -40), (13, 120, 'in'), (15, 130), (32, 0)],
        'pitch': [(0, 0), (9, -3.5), (13, 4.5, 'in'), (15, 5.5, 'back'), (22, -1.0), (32, 0)],
        'bob': [(0, 0), (9, -0.05), (13, 0.04), (16, -0.06), (32, 0)],
        'crane': [(0, 0), (13, 0), (16, -12), (24, 6), (32, 0)],
        'claw': [(0, (0, 0, -1.0)), (13, (0, 0, -1.0)), (16, (0, -0.6, -0.8)), (24, (0, 0.3, -0.9)), (32, (0, 0, -1.0))],
        'lean': [(0, 4), (9, -10), (13, 30, 'in'), (18, 18), (32, 4)],
        'arm_l': [(0, 0), (9, -30), (13, 25, 'in'), (32, 0)],
        'arm_r': [(0, 0), (9, -30), (13, 25, 'in'), (32, 0)],
        'beacon': [(0, 0), (32, 200)],
    }), loop=False)
    # ---- CraneSwipe: the boom drawn round, then swung flat across the front -------------------
    add('CraneSwipe', 34, oneshot({
        'crane': [(0, 0), (9, -55), (12, -60), (19, 150, 'in'), (21, 162, 'back'), (34, 0)],
        'boom': [(0, 0), (9, -14), (19, -18), (26, -6), (34, 0)],
        'claw': [(0, (0, 0, -1.0)), (9, (0.4, 0.1, -0.9)), (19, (-0.8, 0.3, -0.6), 'in'), (24, (0.4, -0.3, -0.85)),
                 (34, (0, 0, -1.0))],
        'sway': [(0, 0), (9, 2.0), (19, -3.5, 'in'), (24, 1.0), (34, 0)],
        'bob': [(0, 0), (19, -0.04), (34, 0)],
        'look': [(0, (0, 0)), (9, (-40, 10)), (19, (50, 0)), (34, (0, 0))],
        'twist': [(0, 0), (9, -20), (19, 25), (34, 0)],
        'beacon': [(0, 0), (34, 220)],
    }), loop=False)
    # ---- SteamBlast (1.5 s bar, then the recoil): braced, building, the blast, rocked back ------
    def steam(f):
        tr = tracks({
            'pitch': [(0, 0), (8, -4.5), (34, -6.5), (36, 7.0, 'snap'), (40, 4.5), (48, 0)],
            'bob': [(0, 0), (8, -0.1), (34, -0.12), (36, 0.05, 'snap'), (42, -0.03), (48, 0)],
            'root': [(0, (0, 0, 0)), (34, (0, -0.05, 0)), (36, (0, 0.45, 0), 'snap'), (42, (0, 0.38, 0)),
                     (48, (0, 0, 0))],
            'spin': [(0, 0), (34, 8), (36, -95, 'snap'), (48, 0)],
            'crane': [(0, 0), (34, -3), (36, 8, 'snap'), (42, -4), (48, 0)],
            'claw': [(0, (0, 0, -1.0)), (34, (0, 0, -1.0)), (37, (0, 0.6, -0.8)), (44, (0, -0.2, -1.0)),
                     (48, (0, 0, -1.0))],
            'lean': [(0, 4), (10, 22), (34, 26), (36, -14, 'snap'), (44, 6), (48, 4)],
            'arm_l': [(0, 0), (10, -45), (32, -55), (36, 20, 'snap'), (48, 0)],
            'arm_r': [(0, 0), (10, -45), (32, -55), (36, 20, 'snap'), (48, 0)],
            'look': [(0, (0, 0)), (10, (0, -10)), (36, (0, 15)), (48, (0, 0))],
        })(f)
        shake = min(1.0, max(0.0, (f - 14) / 20)) if f < 36 else 0.0
        tr['sway'] = 1.4 * shake * math.sin(f * 2.7)
        tr['pitch'] += 0.8 * shake * math.sin(f * 3.9)
        tr['beacon'] = 360 * 3 * f / 48
        return pose(**tr)
    add('SteamBlast', 48, steam, loop=False)
    # ---- ScrapToss: the boom whipped up and over like a catapult; the plate leaves at frame 20 ---
    def toss(f):
        tr = tracks({
            'boom': [(0, 0), (9, -16), (13, -18), (20, 112, 'in'), (23, 118, 'back'), (30, 60), (40, 0)],
            'claw': [(0, (0, 0, -1.0)), (9, (0, -0.3, -1.0)), (13, (0, -0.4, -1.0)), (18, (0, 0.9, -0.4), 'in'),
                     (20, (0, 0.4, 0.9)), (24, (0, -0.8, 0.4)), (30, (0, -0.4, -0.9)), (40, (0, 0, -1.0))],
            'pitch': [(0, 0), (13, -1.5), (20, 3.5, 'in'), (24, 2.5), (40, 0)],
            'bob': [(0, 0), (13, -0.04), (20, 0.03), (24, -0.03), (40, 0)],
            'look': [(0, (0, 0)), (13, (25, 30)), (22, (0, 25)), (40, (0, 0))],
            'lean': [(0, 4), (13, -6), (20, 14), (40, 4)],
            'arm_r': [(0, 0), (12, -40), (20, 20, 'in'), (40, 0)],
        })(f)
        tr['plate'] = 1.0 if f < 20 else (0.001 if f < 34 else min(1.0, (f - 34) / 5))
        tr['beacon'] = 300 * f / 40
        return pose(**tr)
    add('ScrapToss', 40, toss, loop=False)
    # ---- Unload: the bed tipped up and back with a crash -----------------------------------------
    def unload(f):
        tr = tracks({
            'bed': [(0, 0), (6, 0), (18, 44, 'out'), (30, 46), (40, 0, 'in'), (42, 4, 'back'), (48, 0)],
            'pitch': [(0, 0), (18, 1.5), (30, 1.8), (40, -2.0, 'in'), (44, 0.5), (48, 0)],
            'bob': [(0, 0), (18, -0.03), (40, -0.07, 'in'), (44, 0.0), (48, 0)],
            'crane': [(0, 0), (18, 10), (40, -6), (48, 0)],
            'claw': [(0, (0, 0, -1.0)), (40, (0, 0.4, -0.9)), (44, (0, -0.2, -1.0)), (48, (0, 0, -1.0))],
            'look': [(0, (0, 0)), (6, (150, 15)), (30, (150, 10)), (44, (0, 0))],
            'twist': [(0, 0), (6, 40), (30, 40), (44, 0)],
            'arm_l': [(0, 0), (6, -50), (36, -50), (40, 10), (48, 0)],
        })(f)
        shake = 1.0 if 18 <= f <= 30 else 0.0
        tr['sway'] = 0.8 * shake * math.sin(f * 3.1)
        tr['beacon'] = 360 * 2 * f / 48
        return pose(**tr)
    add('Unload', 48, unload, loop=False)
    # ---- Hit ---------------------------------------------------------------------------------------
    add('Hit', 16, oneshot({
        'pitch': [(0, 0), (3, -2.5, 'snap'), (16, 0)],
        'sway': [(0, 0), (3, 2.0, 'snap'), (9, -0.8), (16, 0)],
        'bob': [(0, 0), (3, 0.04, 'snap'), (8, -0.03), (16, 0)],
        'crane': [(0, 0), (4, -8, 'snap'), (10, 4), (16, 0)],
        'claw': [(0, (0, 0, -1.0)), (4, (0.4, 0.3, -0.9)), (10, (-0.2, -0.1, -1.0)), (16, (0, 0, -1.0))],
        'lean': [(0, 4), (3, -16, 'snap'), (16, 4)],
        'look': [(0, (0, 0)), (3, (20, 20), 'snap'), (16, (0, 0))],
    }), loop=False)
    # ---- Death: it lurches, the crane collapses over the bed, the engineer ducks, it settles on one tread
    add('Death', 60, oneshot({
        'pitch': [(0, 0), (5, -3.5, 'snap'), (14, 6.0, 'in'), (18, 4.5), (30, 3.5), (60, 3.5)],
        'sway': [(0, 0), (5, 2.5, 'snap'), (12, -2.0), (30, 1.5), (60, 1.5)],
        'roll': [(0, 0), (20, 0), (32, 7.5, 'in'), (36, 6.5, 'back'), (60, 7.0)],
        'root': [(0, (0, 0, 0)), (20, (0, 0, 0)), (32, (0.06, 0, -0.06), 'in'), (60, (0.06, 0, -0.05))],
        'bob': [(0, 0), (5, 0.05, 'snap'), (14, -0.07, 'in'), (18, -0.04), (30, -0.06), (60, -0.06)],
        'boom': [(0, 0), (5, 8, 'snap'), (12, -20), (26, -62, 'in'), (30, -56, 'back'), (60, -58)],
        'crane': [(0, 0), (12, 10), (26, 34, 'in'), (60, 34)],
        'claw': [(0, (0, 0, -1.0)), (12, (0.5, 0.4, -0.8)), (26, (0.3, -0.3, -1.0)), (34, (0.1, 0.2, -1.0)),
                 (60, (0.1, 0.1, -1.0))],
        'bed': [(0, 0), (8, 12, 'snap'), (16, 0, 'in'), (18, 3), (60, 0)],
        'lean': [(0, 4), (5, -18, 'snap'), (14, 55, 'in'), (60, 60)],
        'look': [(0, (0, 0)), (5, (10, 30), 'snap'), (14, (0, -40)), (60, (0, -45))],
        'arm_l': [(0, 0), (5, -80, 'snap'), (14, -110), (60, -110)],
        'arm_r': [(0, 0), (5, -80, 'snap'), (14, -110), (60, -110)],
        'fore_l': [(0, 0), (14, -60), (60, -60)],
        'fore_r': [(0, 0), (14, -60), (60, -60)],
        'beacon': [(0, 0), (30, 120, 'out'), (60, 130)],
        'spin': [(0, 0), (14, 30), (32, 40), (60, 40)],
    }), loop=False)
    return clips


if __name__ == '__main__':
    run('GantryHauler', BONES, build_parts, make_clips,
        sheet_args={'prefix': 'hauler', 'focus': (0.0, 0.0, 1.5), 'dist': 8.5, 'scale': 2.6, 'ref_side': 2.6},
        anchors=[('Idle', 13, 'Body', False), ('Idle', 13, 'Beacon', True), ('ScrapToss', 20, 'Plate', False),
                 ('ScrapToss', 20, 'Claw', True), ('Unload', 24, 'Bed', True), ('SteamBlast', 36, 'Body', False),
                 ('Idle', 13, 'Head', True)])
