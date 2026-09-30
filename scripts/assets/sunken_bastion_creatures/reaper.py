"""Vael the Fogbinder as Death itself: the Sunken Bastion's final boss, a hooded,
skeletal reaper with a great scythe (src/sim/encounters/sunken_bastion/vael.ts).

  blender -b --factory-startup --python reaper.py -- <out.glb> [--sheet dir] [--blend out.blend] [--fast]

A gaunt, towering figure that never touches the flags: a skull burning with pale
soul fire deep in a peaked hood, a shroud of tattered shadow cloth that hangs to
a ragged hem a hand above the floor and trails a torn cape behind, bare ribs
where the shroud has rotted open, long skeletal hands gripping a great scythe
(a black-iron blade longer than a man, its edge lit with the same pale fire),
a caged soul lantern swinging at the hip, and five soul motes circling him.
Built on the organic kit (hollow_crypt_creatures/organic_kit.py): smooth parts
bound one bone each, the shroud and cape as membranes weighted across their
hanging spars (they bend and stream, never tear), a Cycles bake of a shadow
cloth surface with its ambient occlusion, emissive soul fire kept on the glow
material.

Scale (yards; a player stands about 2.6): 6.3 to the hood's peak at rest, the
scythe's blade over 7 up; the game draws him at template scale 1.35, so some
8.5 yards of Death looms over the crown.

Clips (24 fps):
  Idle         hovering: a slow bob, the shroud breathing, the motes circling.
  Walk, Run    the glide: leaning into it, the shroud and cape streaming back.
  Attack       a flat sweep of the scythe across his front.
  Attack2      an overhead chop, the blade brought down two-handed.
  Cast         the soul reap (Mist Surge): scythe raised high, the free hand
               clawing the souls out of the living.
  Hymn         the Drowning Hymn (the Fog Veil's channel): scythe planted,
               arms wide, head bowed.
  Vanish       the Shadow Crossing's bar: he folds into his shroud and sinks
               through the floor, and stays under while the pool opens.
  Emerge       he rises out of the shadow pool with the scythe drawn back.
  ScytheSweep  the reaping from behind: a huge forward sweep off the wind-up.
  Hit, Death   a recoil; the shroud collapses empty, the scythe falls.
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(HERE, '..', 'hollow_crypt_creatures')))
from mathutils import Vector  # noqa: E402
from organic_kit import (  # noqa: E402
    GLOW, Membrane, Part, Rig, bake_surface, bind, build_armature, clip, cycle, expand_bones, export, join,
    make_materials, new_scene, render_sheet, setup_preview, triangles,
)

# ------------------------------------------------------------------ palette
SHROUD = (0.075, 0.08, 0.095)
SHROUD_HI = (0.16, 0.17, 0.2)
SHROUD_EDGE = (0.22, 0.24, 0.27)
BONE = (0.8, 0.76, 0.66)
BONE_OLD = (0.62, 0.57, 0.48)
BONE_DARK = (0.3, 0.27, 0.23)
SOCKET = (0.02, 0.02, 0.025)
SOUL = (0.55, 1.0, 0.82)
SOUL_HOT = (0.9, 1.0, 0.96)
SOUL_DEEP = (0.12, 0.5, 0.36)
BLADE = (0.2, 0.21, 0.24)
BLADE_HI = (0.42, 0.44, 0.48)
WOOD = (0.2, 0.14, 0.09)
WOOD_D = (0.11, 0.08, 0.05)
IRON = (0.17, 0.17, 0.19)
ROPE = (0.3, 0.26, 0.2)

HOVER = 0.35
SKIRT = 12       # shroud spars round the waist
CLOAK = 11       # cloak spars round the shoulders (the front stays open)


def lerp(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


# ------------------------------------------------------------------- bones
def _skirt_bones():
    out = []
    for k in range(SKIRT):
        a = math.tau * k / SKIRT
        ca, sa = math.sin(a), -math.cos(a)  # k = 0 faces -Y (front)
        top = (ca * 0.68, sa * 0.56, 3.3)
        mid = (ca * 1.12, sa * 0.98, 1.9)
        hem = (ca * 1.62, sa * 1.42, HOVER + 0.02)
        out.append((f'Skirt{k}a', 'Hips', top, mid))
        out.append((f'Skirt{k}b', f'Skirt{k}a', mid, hem))
    return out


def cloak_spar(k):
    """The k-th cloak spar's stations: neck, shoulder, mid, low, hem. theta 0
    hangs straight down the back, the two ends frame the open front."""
    th = math.radians(-152 + 304 * k / (CLOAK - 1))
    sx, cy = math.sin(th), math.cos(th)
    back = max(0.0, cy)
    return th, [
        (sx * 0.44, cy * 0.36 + 0.02, 5.22),
        (sx * 1.16, cy * 0.66 + 0.06, 4.78),
        (sx * 1.3, cy * 0.92 + 0.12 + back * 0.15, 3.25),
        (sx * 1.46, cy * 1.18 + 0.2 + back * 0.55, 1.45),
        (sx * 1.58, cy * 1.32 + back * 1.35, 0.06),
    ]


def _cloak_bones():
    out = []
    for k in range(CLOAK):
        _, st = cloak_spar(k)
        out.append((f'Cloak{k}a', 'Chest', st[1], st[2]))
        out.append((f'Cloak{k}b', f'Cloak{k}a', st[2], st[3]))
        out.append((f'Cloak{k}c', f'Cloak{k}b', st[3], st[4]))
    return out


BONES = expand_bones([
    ('Root', None, (0, 0, 0), (0, 0, 0.6)),
    ('Hips', 'Root', (0, 0, 3.1), (0, 0, 3.6)),
    ('Spine', 'Hips', (0, 0, 3.6), (0, -0.05, 4.3)),
    ('Chest', 'Spine', (0, -0.05, 4.3), (0, -0.1, 5.0)),
    ('Neck', 'Chest', (0, -0.1, 5.0), (0, -0.2, 5.32)),
    ('Head', 'Neck', (0, -0.2, 5.32), (0, -0.42, 5.78)),
    ('Jaw', 'Head', (0, -0.32, 5.38), (0, -0.56, 5.22)),
    ('Arm.L', 'Chest', (0.98, -0.05, 4.9), (1.32, -0.12, 3.7)),
    ('Fore.L', 'Arm.L', (1.32, -0.12, 3.7), (1.42, -0.5, 2.6)),
    ('Hand.L', 'Fore.L', (1.42, -0.5, 2.6), (1.44, -0.62, 2.2)),
    ('Scythe', 'Hand.R', (-1.44, -0.62, 2.2), (-1.44, -0.62, 3.2)),
    ('Lantern', 'Hips', (0.62, -0.2, 3.1), (0.7, -0.25, 2.1)),
    ('Motes', 'Root', (0, 0, 4.2), (0, 0, 4.8)),
] + _skirt_bones() + _cloak_bones())
REST = {n: (Vector(h), Vector(t)) for n, _, h, t in BONES}

# The scythe's reach along its own bone from the grip: pommel below, blade on top.
SHAFT_BELOW = 1.5
SHAFT_ABOVE = 5.4


# ------------------------------------------------------------------- parts
def finger(p, base, direction, curl_axis, lengths, r, color=BONE):
    """A bony finger: phalanges curling about `curl_axis`, knuckle knobs between."""
    d = Vector(direction).normalized()
    ax = Vector(curl_axis).normalized()
    pos = Vector(base)
    from mathutils import Matrix
    for i, ln in enumerate(lengths):
        d = (Matrix.Rotation(math.radians(24 + 10 * i), 3, ax) @ d).normalized()
        end = pos + d * ln
        p.tube([pos, pos.lerp(end, 0.5), end], [r * (1 - 0.15 * i), r * 0.8 * (1 - 0.15 * i), r * 0.85 * (1 - 0.15 * i)],
               lerp(color, BONE_OLD, i * 0.25), sides=6)
        p.blob(end, (r * 2.0, r * 2.0, r * 2.0), BONE_OLD, segments=6, rings=4)
        pos = end


def skeletal_hand(p, wrist, down, side, s):
    """A long skeletal hand at `wrist` pointing `down`, fingers curled about
    `side` (a grip); `s` mirrors the thumb."""
    w = Vector(wrist)
    d = Vector(down).normalized()
    sd = Vector(side).normalized()
    fwd = d.cross(sd).normalized()
    p.blob(w, (0.13, 0.13, 0.13), BONE_OLD, segments=8, rings=6)                   # the wrist knob
    palm = w + d * 0.16
    for k in range(4):
        off = sd * ((k - 1.5) * 0.065)
        p.tube([w + off * 0.4, palm + off], [0.028, 0.025], BONE, sides=6)          # metacarpals
        finger(p, palm + off, d, sd, [0.12, 0.1, 0.08], 0.026)
    finger(p, w + d * 0.06 + sd * (s * 0.1) + fwd * 0.05, d * 0.6 + fwd * 0.4 + sd * (s * 0.3), sd, [0.1, 0.08], 0.028)


def build_parts():
    parts = []

    def part(name, bone, **kw):
        pt = Part(name, bone, **kw)
        parts.append(pt)
        return pt

    # --- the torso under the shroud, and the rotted-open front with its ribs ------
    torso = part('Torso', 'Spine', subdiv=1)
    torso.loft([
        ((0, 0.02, 3.35), 0.52, 0.34, 2.4, (0, 0, 1)),
        ((0, 0.04, 3.9), 0.5, 0.33, 2.4, (0, 0, 1)),
        ((0, 0.06, 4.35), 0.66, 0.36, 2.6, (0, 0, 1)),
    ], SHROUD, sides=18)
    chest = part('Chest', 'Chest', subdiv=1)
    chest.loft([
        ((0, 0.06, 4.35), 0.7, 0.38, 2.6, (0, 0, 1)),
        ((0, 0.08, 4.75), 0.95, 0.44, 2.8, (0, 0, 1)),
        ((0, 0.06, 5.02), 1.06, 0.42, 3.0, (0, 0, 1)),
        ((0, 0.0, 5.16), 0.44, 0.3, 2.2, (0, 0, 1)),
    ], SHROUD, sides=18)
    ribs = part('Ribs', 'Chest', smooth=True)
    ribs.tube([Vector((0, -0.34, 4.9)), Vector((0, -0.4, 4.55)), Vector((0, -0.36, 4.2))], [0.035, 0.04, 0.03],
              BONE, sides=6)                                                              # the sternum
    for i in range(5):
        z = 4.86 - i * 0.14
        for s in (-1, 1):
            pts = [Vector((s * (0.03 + 0.34 * math.sin(t * math.pi * 0.62)), -0.37 + 0.36 * (1 - math.cos(t * math.pi * 0.62)),
                           z - 0.1 * t)) for t in (j / 6 for j in range(7))]
            ribs.tube(pts, [0.03 - 0.004 * i] * 7, lerp(BONE, BONE_OLD, i / 5), sides=6)
    ribs.blob((0, -0.2, 4.5), (0.26, 0.2, 0.3), SOUL, mat=GLOW, segments=10, rings=8)    # the soul he hoards
    ribs.blob((0, -0.24, 4.52), (0.13, 0.1, 0.16), SOUL_HOT, mat=GLOW, segments=8, rings=6)
    # The cord belt, its knot and its bone charms.
    belt = part('Belt', 'Hips', smooth=True)
    belt.tube([Vector((math.sin(math.tau * i / 32) * 0.58, -math.cos(math.tau * i / 32) * 0.46, 3.32 + 0.03 * math.sin(i)))
               for i in range(33)], [0.05] * 33, ROPE, sides=6, cap=False)
    for s, drop in ((-1, 0.8), (-1.3, 1.1)):
        belt.tube([Vector((s * 0.22, -0.46, 3.3)), Vector((s * 0.26, -0.5, 3.3 - drop * 0.5)),
                   Vector((s * 0.24, -0.47, 3.3 - drop))], [0.04, 0.035, 0.03], ROPE, sides=6)
        belt.blob((s * 0.24, -0.47, 3.24 - drop), (0.08, 0.07, 0.09), BONE_OLD, segments=8, rings=5)
    # --- the skull in the hood --------------------------------------------------------------
    head = part('Skull', 'Head', smooth=True, subdiv=1)
    head.blob((0, -0.36, 5.7), (0.36, 0.5, 0.46), BONE, segments=18, rings=14)           # the cranium
    head.blob((0, -0.56, 5.8), (0.3, 0.24, 0.14), BONE, segments=14, rings=8)            # the brow
    head.loft([                                                                          # the face, tapering
        ((0, -0.5, 5.66), 0.19, 0.12, 2.6, (0, -0.25, -1)),
        ((0, -0.58, 5.5), 0.16, 0.1, 2.4, (0, -0.2, -1)),
        ((0, -0.62, 5.38), 0.12, 0.08, 2.2, (0, -0.2, -1)),
    ], BONE, sides=14)
    for s in (-1, 1):
        head.blob((s * 0.12, -0.68, 5.6), (0.12, 0.09, 0.1), SOCKET, segments=12, rings=8)   # deep sockets
        head.loft([                                                                      # sharp cheekbones
            ((s * 0.14, -0.6, 5.5), 0.03, 0.04, 2.0, (s * 1, -0.6, -0.2)),
            ((s * 0.22, -0.55, 5.48), 0.04, 0.05, 2.0, (s * 1, -0.6, -0.2)),
            ((s * 0.27, -0.44, 5.5), 0.02, 0.03, 2.0, (s * 1, -0.6, -0.2)),
        ], BONE_OLD, sides=8)
        head.blob((s * 0.12, -0.765, 5.6), (0.045, 0.02, 0.045), SOUL_HOT, mat=GLOW, segments=8, rings=6)  # embers
        head.blob((s * 0.12, -0.758, 5.6), (0.085, 0.012, 0.07), SOUL, mat=GLOW, segments=8, rings=6)
        head.blob((s * 0.26, -0.32, 5.62), (0.06, 0.1, 0.09), BONE_OLD, segments=8, rings=6)   # temples
    head.prism((0, -0.66, 5.5), 3, 0.045, 0.001, 0.09, SOCKET, axis=(0, -0.3, -1))       # nasal cavity
    for k in range(8):
        x = (k - 3.5) * 0.034
        head.box((x, -0.66 + abs(x) * 0.4, 5.37), (0.026, 0.024, 0.055), BONE_OLD, bevel=0.004)   # upper teeth
    jaw = part('Jaw', 'Jaw', smooth=True)
    jaw.loft([
        ((-0.2, -0.42, 5.36), 0.03, 0.05, 2.0, (1, -0.4, 0)),
        ((-0.12, -0.58, 5.3), 0.04, 0.05, 2.0, (1, -0.4, 0)),
        ((0, -0.63, 5.28), 0.05, 0.05, 2.0, (1, 0, 0)),
        ((0.12, -0.58, 5.3), 0.04, 0.05, 2.0, (1, 0.4, 0)),
        ((0.2, -0.42, 5.36), 0.03, 0.05, 2.0, (1, 0.4, 0)),
    ], BONE, sides=8)
    for k in range(7):
        x = (k - 3) * 0.034
        jaw.box((x, -0.62 + abs(x) * 0.4, 5.33), (0.025, 0.022, 0.045), BONE_OLD, bevel=0.004)
    # The hood: a deep cowl round the skull, open at the face, its peak falling
    # back; an open shell, so it rides the double-sided shroud material.
    hood = part('Hood', 'Head', smooth=True, subdiv=1)
    hood_path = [Vector((0, 0.42, 5.3)), Vector((0, 0.3, 5.72)), Vector((0, 0.02, 5.98)), Vector((0, -0.34, 6.02)),
                 Vector((0, -0.66, 5.86)), Vector((0, -0.9, 5.6))]
    hood.tube(hood_path, [0.3, 0.52, 0.6, 0.6, 0.58, 0.6], SHROUD_HI, sides=20, squash=1.18, cap=False,
              up=(1, 0, 0), mat=2)
    hood.tube([Vector((0, 0.1, 6.35)), Vector((0, 0.42, 6.5)), Vector((0, 0.8, 6.35)), Vector((0, 1.0, 6.05))],
              [0.2, 0.14, 0.07, 0.015], SHROUD_HI, sides=12, mat=2)                      # the peak, falling back
    # The hood's rolled lip, hugging the rim of the opening.
    lip = [Vector((0.6 * math.sin(math.radians(a)), -0.9 + 0.04 * math.cos(math.radians(a)),
                   5.6 + 0.7 * math.cos(math.radians(a)))) for a in range(-125, 126, 10)]
    hood.tube(lip, [0.055] * len(lip), SHROUD_EDGE, sides=7)
    # --- arms: tattered sleeves and skeletal hands ----------------------------------------
    for s, tag in ((1, '.L'), (-1, '.R')):
        up = part('Sleeve' + tag, 'Arm' + tag, smooth=True)
        a0, a1 = REST['Arm.L']
        a0 = Vector((s * a0.x, a0.y, a0.z))
        a1 = Vector((s * a1.x, a1.y, a1.z))
        up.tube([a0.lerp(a1, t) for t in (0, 0.33, 0.66, 1.0)], [0.25, 0.22, 0.21, 0.22], SHROUD_HI, sides=12)
        lo = part('Cuff' + tag, 'Fore' + tag, smooth=True)
        f0, f1 = REST['Fore.L']
        f0 = Vector((s * f0.x, f0.y, f0.z))
        f1 = Vector((s * f1.x, f1.y, f1.z))
        lo.tube([f0.lerp(f1, t) for t in (0, 0.3, 0.6, 0.85, 1.0)], [0.21, 0.23, 0.27, 0.33, 0.37], SHROUD,
                sides=14, cap=False, mat=2)
        # tatters hanging off the cuff
        for k in range(7):
            ang = math.tau * k / 7
            base = f1 + Vector((math.cos(ang) * 0.32, math.sin(ang) * 0.32, 0.05))
            ln = 0.35 + 0.35 * ((k * 37) % 5) / 5
            lo.tube([base, base + Vector((0.05 * math.cos(ang), 0.05 * math.sin(ang), -ln * 0.5)),
                     base + Vector((0.08 * math.cos(ang), 0.08 * math.sin(ang), -ln))], [0.09, 0.07, 0.02],
                    SHROUD_EDGE, sides=4, squash=0.25)
        hand = part('Hand' + tag, 'Hand' + tag, smooth=True)
        h0, h1 = REST['Hand.L']
        h0 = Vector((s * h0.x, h0.y, h0.z))
        h1 = Vector((s * h1.x, h1.y, h1.z))
        skeletal_hand(hand, h0, h1 - h0, (1, 0, 0), s)
    # --- the scythe (rides the Scythe bone, rests upright in the right hand) --------------------
    sc = part('Scythe', 'Scythe', smooth=True)
    g = Vector(REST['Scythe'][0])
    up = Vector((0, 0, 1))
    shaft = [g - up * SHAFT_BELOW + up * (SHAFT_BELOW + SHAFT_ABOVE) * t + Vector((0.03 * math.sin(t * 6), 0.02 * math.sin(t * 4), 0))
             for t in (i / 12 for i in range(13))]
    sc.tube(shaft, [0.095, 0.092, 0.09, 0.088, 0.086, 0.085, 0.084, 0.082, 0.08, 0.078, 0.076, 0.075, 0.074],
            [lerp(WOOD_D, WOOD, (i % 3) / 2) for i in range(13)], sides=9)
    for t in (0.02, 0.33, 0.55, 0.98):
        c = g - up * SHAFT_BELOW + up * (SHAFT_BELOW + SHAFT_ABOVE) * t
        sc.tube([c - up * 0.08, c + up * 0.08], [0.115, 0.115], IRON, sides=9)              # iron ferrules
    sc.blob(g - up * (SHAFT_BELOW + 0.06), (0.14, 0.14, 0.18), IRON, segments=8, rings=6)   # the pommel
    # The snath's two grips (nibs) jutting forward off the shaft.
    for t, ln in ((0.26, 0.4), (0.62, 0.34)):
        c = g - up * SHAFT_BELOW + up * (SHAFT_BELOW + SHAFT_ABOVE) * t
        sc.tube([c, c + Vector((0, -ln, 0.05))], [0.045, 0.04], WOOD, sides=6)
    # The blade: a long crescent of black iron, sweeping forward and down, its
    # edge burning with pale soul fire, a bone socket where it meets the shaft.
    top = g + up * SHAFT_ABOVE
    socket = top - up * 0.15
    sc.blob(socket, (0.22, 0.22, 0.26), BONE, segments=10, rings=8)
    sc.blob(socket + Vector((0, -0.18, 0.02)), (0.1, 0.07, 0.1), SOCKET, segments=8, rings=6)
    n = 14
    spine_pts = []
    for i in range(n + 1):
        t = i / n
        ang = t * 1.4
        spine_pts.append(socket + Vector((0, -math.sin(ang) * 3.7, 0.3 - (1 - math.cos(ang)) * 1.8 + 0.45 * t)))
    # The blade is a flat loft of sections: thick back, thin toward the tip.
    secs = []
    for i, pnt in enumerate(spine_pts):
        t = i / n
        tang = (spine_pts[min(n, i + 1)] - spine_pts[max(0, i - 1)]).normalized()
        width = 0.46 * (1 - t) ** 0.7 + 0.025
        secs.append((tuple(pnt + Vector((0, 0, -width * 0.5)) * 1.0), 0.035 * (1 - 0.6 * t) + 0.006, width * 0.5, 2.2,
                     tuple(tang)))
    sc.loft(secs, BLADE, sides=10)
    # The burning edge along the blade's belly.
    edge = [pnt + Vector((0, 0, -(0.46 * (1 - i / n) ** 0.7 + 0.025))) for i, pnt in enumerate(spine_pts)]
    sc.tube(edge, [0.04 * (1 - 0.7 * i / n) + 0.008 for i in range(n + 1)], SOUL, mat=GLOW, sides=5)
    # Notches hacked into the blade's back.
    for i in (3, 6, 9):
        sc.spike(spine_pts[i] + Vector((0, 0, 0.02)), 0.05, 0.16, BLADE_HI, sides=4, lean=(0, 0.04))
    # Runnels of soul light etched along the flat.
    rn = [pnt + Vector((0.04, 0, -0.14 * (1 - i / n))) for i, pnt in enumerate(spine_pts[:10])]
    sc.tube(rn, [0.012] * len(rn), SOUL_DEEP, mat=GLOW, sides=4)
    # Ribbons of shroud knotted under the blade.
    for k, ln in ((0, 1.2), (1, 0.9)):
        base = socket - up * (0.25 + 0.05 * k) + Vector((0.08 * (k * 2 - 1), 0, 0))
        sc.tube([base, base + Vector((0.12 * (k * 2 - 1), 0.05, -ln * 0.5)), base + Vector((0.2 * (k * 2 - 1), 0.12, -ln))],
                [0.07, 0.06, 0.015], SHROUD_EDGE, sides=4, squash=0.25)
    # --- the soul lantern at the hip ---------------------------------------------------------
    lan = part('Lantern', 'Lantern', smooth=True)
    l0, l1 = REST['Lantern']
    for i in range(4):
        c = l0.lerp(l1, i / 5)
        lan.tube([c + Vector((0, 0, 0.06)), c - Vector((0, 0, 0.06))], [0.03, 0.03], IRON, sides=6)
    cage_c = l1 - Vector((0, 0, 0.15))
    lan.blob(cage_c + Vector((0, 0, 0.26)), (0.2, 0.2, 0.08), IRON, segments=8, rings=5)
    lan.blob(cage_c - Vector((0, 0, 0.26)), (0.2, 0.2, 0.08), IRON, segments=8, rings=5)
    for k in range(6):
        ang = math.tau * k / 6
        off = Vector((math.cos(ang) * 0.17, math.sin(ang) * 0.17, 0))
        lan.tube([cage_c + off + Vector((0, 0, 0.25)), cage_c + off * 1.15, cage_c + off - Vector((0, 0, 0.25))],
                 [0.022] * 3, IRON, sides=5)
    lan.blob(cage_c, (0.13, 0.13, 0.19), SOUL, mat=GLOW, segments=10, rings=8)             # the trapped soul
    lan.blob(cage_c + Vector((0, 0, 0.02)), (0.07, 0.07, 0.1), SOUL_HOT, mat=GLOW, segments=8, rings=6)
    # --- the soul motes ------------------------------------------------------------------------
    motes = part('Motes', 'Motes', smooth=True)
    for k in range(5):
        ang = math.tau * k / 5
        r = 1.6 + 0.25 * math.sin(k * 2.1)
        c = Vector((math.cos(ang) * r, math.sin(ang) * r, 4.1 + 0.6 * math.sin(k * 1.7)))
        motes.blob(c, (0.14, 0.14, 0.16), SOUL, mat=GLOW, segments=10, rings=8)
        motes.blob(c, (0.07, 0.07, 0.08), SOUL_HOT, mat=GLOW, segments=8, rings=6)
        for j in (1, 2):
            sat = c + Vector((-math.sin(ang) * 0.3 * j, math.cos(ang) * 0.3 * j, -0.06 * j))
            motes.blob(sat, (0.06 / j, 0.06 / j, 0.07 / j), SOUL, mat=GLOW, segments=6, rings=4)
    return parts


def build_membranes():
    mems = []
    # The shroud: panels between the hanging skirt spars, the hem torn to rags.
    skirt = Membrane('Shroud', SHROUD, seed=7)
    spars = []
    for k in range(SKIRT):
        a0, a1 = REST[f'Skirt{k}a']
        b1 = REST[f'Skirt{k}b'][1]
        spars.append([(tuple(a0), 'Hips'), (tuple(a0.lerp(a1, 0.5)), f'Skirt{k}a'), (tuple(a1), f'Skirt{k}a'),
                      (tuple(a1.lerp(b1, 0.5)), f'Skirt{k}b'), (tuple(b1), f'Skirt{k}b')])
    for k in range(SKIRT):
        skirt.panel(spars[k], spars[(k + 1) % SKIRT], rows=14, cols=7, scallop=0.04, tear=0.75, shade=1.0)
    mems.append(skirt)
    # The cloak: from the hood's foot over the shoulders to the flags, open at the
    # front, dragging behind. The side spars ride the upper arms at the shoulder
    # so a raised arm lifts its fold of cloak.
    cloak = Membrane('Cloak', SHROUD, seed=11)
    cs = []
    for k in range(CLOAK):
        th, st = cloak_spar(k)
        sx = math.sin(th)
        mid_bone = f'Cloak{k}a'
        if abs(sx) > 0.72:
            mid_bone = 'Arm.L' if sx > 0 else 'Arm.R'
        cs.append([(st[0], 'Neck'), (st[1], 'Chest'), (st[2], mid_bone), (st[3], f'Cloak{k}b'), (st[4], f'Cloak{k}c')])
    for k in range(CLOAK - 1):
        cloak.panel(cs[k], cs[k + 1], rows=18, cols=5, scallop=0.02, tear=0.85, shade=0.92, sag=0.05)
    mems.append(cloak)
    return mems


# -------------------------------------------------------------------- clips
def make_clips(arm):
    rig = Rig(BONES).attach(arm)
    P = rig.pose
    clips = []

    def add(name, keys, loop_clip=True):
        clip(arm, name, keys, loop_clip)
        clips.append(name)

    def norm(v):
        v = Vector(v)
        return v.normalized()

    head_rest = (REST['Head'][1] - REST['Head'][0]).normalized()
    neck_rest = (REST['Neck'][1] - REST['Neck'][0]).normalized()

    def stance(root=(0, 0, 0), lean=0.0, twist=0.0, look=(0, -1, 0.0), scythe=(0.05, -0.12, 1.0),
               wrist=(-1.4, -0.55, 3.1), left=None, both=False, left_pole=(1.2, 0.4, -0.4), flutter=0.0,
               stream=0.0, cape_lift=0.0, jaw=6.0, motes=0.0, splay=0.0, tilt=0.0):
        """The whole body: `scythe` is the blade shaft's direction (armature
        space), `wrist` the right wrist; with `both` the left hand holds the
        shaft 1.7 up from the right, else `left` is its own wrist target (the
        free claw hand held out a little by default). `look` turns the skull:
        x sideways, z up (positive) or bowed (negative), off its rest."""
        d = norm(scythe)
        side = Vector((1, 0, 0))
        hand_r = (side.cross(d)).normalized() * -1.0
        if hand_r.length < 1e-3:
            hand_r = Vector((0, -1, 0))
        # Wrist targets ride the root (a sinking or rising body carries its hands).
        rootv = Vector(root)
        w_r = Vector(wrist) + rootv
        grip_r = w_r + hand_r * 0.3
        if both:
            grip_l = grip_r + d * 1.7
            hand_l = hand_r
            w_l = grip_l - hand_l * 0.3
        else:
            w_l = Vector(left if left is not None else (1.35, -1.0, 2.9)) + rootv
            hand_l = norm((0.15, -0.6, -0.8))
        head_dir = head_rest + Vector((look[0], 0.0, look[2] * 1.2))
        neck_dir = neck_rest + Vector((look[0] * 0.3, 0.0, look[2] * 0.3))
        aims = {
            'Spine': (0, -0.08 - lean * 0.6, 1.0),
            'Chest': (twist * 0.4, -0.1 - lean, 1.0),
            'Neck': tuple(neck_dir),
            'Head': tuple(head_dir),
            'Hand.R': tuple(hand_r),
            'Hand.L': tuple(hand_l),
            'Scythe': tuple(d),
            'Lantern': (0.08 + 0.3 * math.sin(flutter * 2.0) * (0.3 + stream), 0.25 * stream, -1.0),
            'Motes': (0.0, 0.0, 1.0),
        }
        turns = {'Jaw': [('x', jaw)], 'Motes': [('z', motes)], 'Root': [('x', tilt)]}
        for k in range(SKIRT):
            a = math.tau * k / SKIRT
            fwd = -math.cos(a)  # 1 at the front
            ph = flutter + k * 0.9
            sw = 4.0 * math.sin(ph) + stream * 14.0 * fwd + splay * 22.0
            turns[f'Skirt{k}a'] = [((math.cos(a), math.sin(a), 0), sw * 0.6 + splay * 10)]
            turns[f'Skirt{k}b'] = [((math.cos(a), math.sin(a), 0), sw * 0.8 + 3.0 * math.sin(ph * 1.3))]
        for k in range(CLOAK):
            th, _ = cloak_spar(k)
            ph = flutter * 1.2 + k * 1.1
            lift = cape_lift + stream * 0.9
            back = max(0.0, math.cos(th))
            ax = (math.cos(th), -math.sin(th), 0)   # swings the spar out from the body
            turns[f'Cloak{k}a'] = [(ax, -3 * lift * back - 1.5 * math.sin(ph) - splay * 8)]
            turns[f'Cloak{k}b'] = [(ax, -9 * lift * back - 3 * math.sin(ph + 0.6) - splay * 10)]
            turns[f'Cloak{k}c'] = [(ax, -14 * lift * back - 5 * math.sin(ph + 1.2) - splay * 12)]
        ik = {
            'arm.R': ('Arm.R', 'Fore.R', tuple(w_r), (-1.2, 0.6, -0.3)),
            'arm.L': ('Arm.L', 'Fore.L', tuple(w_l), left_pole),
        }
        return P(aims=aims, ik=ik, turns=turns, root=(root[0], root[1], root[2] + HOVER))

    def idle(ph, bob=0.08, **kw):
        return stance(root=(0, 0, bob * math.sin(ph)), flutter=ph, motes=math.degrees(ph) / 4, **kw)

    # Idle: hovering, the shroud breathing, the motes circling (a full turn over
    # the loop is keyed as quarter turns so each key interpolates the short way).
    idle_keys = []
    for i in range(8):
        ph = math.tau * i / 8
        idle_keys.append((1 + i * 8, stance(root=(0, 0, 0.09 * math.sin(ph)), flutter=ph, motes=45 * i,
                                            look=(0.06 * math.sin(ph * 0.5), -1, 0.08))))
    idle_keys.append((65, stance(root=(0, 0, 0.0), flutter=math.tau, motes=360 - 1e-3, look=(0, -1, 0.08))))
    add('Idle', idle_keys)
    glide = dict(lean=0.35, stream=0.8, scythe=(0.45, 0.25, 1.0), wrist=(-1.1, -0.55, 3.1), look=(0, -1, -0.05))
    add('Walk', cycle(32, [stance(root=(0, 0, 0.1 * math.sin(i * math.pi / 2)), flutter=i * 1.6, motes=22 * i, **glide)
                           for i in range(4)]))
    run = dict(lean=0.6, stream=1.2, scythe=(0.5, 0.55, 0.85), wrist=(-1.05, -0.3, 3.2), look=(0, -1, -0.15),
               cape_lift=0.6)
    add('Run', cycle(20, [stance(root=(0, 0, 0.14 * math.sin(i * math.pi / 2)), flutter=i * 2.2, motes=30 * i, **run)
                          for i in range(4)]))
    ready = idle(0)
    # Attack: the flat sweep, wound over the right shoulder, cut across the front.
    wind = stance(both=True, twist=-0.9, lean=-0.1, scythe=(-0.9, 0.55, 0.25), wrist=(-1.3, 0.25, 4.1), look=(-0.3, -1, 0.1),
                  flutter=1.0, stream=0.2, jaw=14)
    cut = stance(both=True, twist=0.8, lean=0.25, scythe=(0.95, -0.35, 0.05), wrist=(-0.2, -1.5, 3.4), look=(0.3, -1, 0.0),
                 flutter=2.0, stream=0.5, jaw=24)
    follow = stance(both=True, twist=1.0, lean=0.2, scythe=(0.6, 0.6, -0.1), wrist=(0.5, -1.0, 3.2), look=(0.4, -1, -0.05),
                    flutter=2.6, stream=0.3, jaw=16)
    add('Attack', [(1, ready), (9, wind), (13, cut), (16, follow), (28, ready)], loop_clip=False)
    # Attack2: the overhead chop, two-handed.
    raise_ = stance(both=True, lean=-0.35, scythe=(0.05, 0.9, 0.45), wrist=(-0.5, -0.2, 5.4), look=(0, -1, 0.35), jaw=20,
                    flutter=1.0, cape_lift=0.3)
    chop = stance(both=True, lean=0.55, scythe=(0.05, -0.95, 0.3), wrist=(-0.45, -1.4, 3.3), look=(0, -1, -0.3), jaw=30,
                  flutter=2.2, stream=0.4)
    add('Attack2', [(1, ready), (11, raise_), (15, chop), (19, chop), (30, ready)], loop_clip=False)
    # Cast: the soul reap, scythe high, the free hand clawing out.
    reap_a = stance(lean=-0.25, scythe=(0.15, 0.05, 1.0), wrist=(-0.85, -0.5, 4.9), left=(1.7, -1.3, 4.3),
                    left_pole=(1.2, 0.8, -0.2), look=(0.2, -1, 0.35), jaw=36, flutter=1.0, cape_lift=0.5)
    reap_b = stance(lean=-0.3, scythe=(0.2, 0.1, 1.0), wrist=(-0.85, -0.45, 5.0), left=(1.9, -1.1, 4.5),
                    left_pole=(1.2, 0.8, -0.2), look=(0.25, -1, 0.4), jaw=42, flutter=2.6, cape_lift=0.7)
    add('Cast', [(1, reap_a), (12, reap_b), (24, reap_a), (36, reap_b), (48, reap_a)])
    # Hymn: the veil's channel: scythe planted, arms wide, head bowed.
    hy_a = stance(scythe=(0.0, -0.1, 1.0), wrist=(-1.35, -0.7, 3.4), left=(1.9, -0.6, 3.9), left_pole=(1.2, 0.8, -0.3),
                  look=(0, -1, -0.45), jaw=18, flutter=0.5, cape_lift=0.2)
    hy_b = stance(root=(0, 0, 0.12), scythe=(0.0, -0.1, 1.0), wrist=(-1.35, -0.7, 3.5), left=(2.0, -0.5, 4.1),
                  left_pole=(1.2, 0.8, -0.3), look=(0, -1, -0.4), jaw=26, flutter=2.0, cape_lift=0.35)
    add('Hymn', cycle(56, [hy_a, hy_b]))
    # Vanish: he folds into the shroud and sinks through the flags, and stays under.
    fold = stance(root=(0, 0, -0.4), lean=0.4, scythe=(0.1, -0.2, 1.0), wrist=(-0.7, -0.8, 3.2), look=(0, -1, -0.5),
                  jaw=4, flutter=1.0, splay=0.7, cape_lift=0.4)
    sink1 = stance(root=(0, 0, -2.6), lean=0.5, scythe=(0.1, -0.2, 1.0), wrist=(-0.7, -0.8, 3.2), look=(0, -1, -0.5),
                   jaw=4, flutter=2.0, splay=1.0, cape_lift=0.8)
    under = stance(root=(0, 0, -10.5), lean=0.5, scythe=(0.1, -0.2, 1.0), wrist=(-0.7, -0.8, 3.2), look=(0, -1, -0.5),
                   jaw=4, flutter=2.0, splay=1.0, cape_lift=0.8)
    add('Vanish', [(1, ready), (6, fold), (12, sink1), (19, under), (58, under)], loop_clip=False)
    # Emerge: up out of the pool, the scythe drawn back over the shoulder.
    windup = stance(both=True, twist=-1.0, lean=-0.15, scythe=(-0.85, 0.7, 0.35), wrist=(-1.35, 0.45, 4.3), look=(-0.2, -1, 0.15),
                    jaw=30, flutter=1.4, stream=0.3, cape_lift=0.6)
    rising = stance(both=True, root=(0, 0, -3.5), twist=-0.6, lean=0.2, scythe=(-0.6, 0.6, 0.6), wrist=(-1.2, 0.2, 4.0),
                    look=(0, -1, 0.3), jaw=40, flutter=2.4, splay=0.6, cape_lift=1.2)
    add('Emerge', [(1, under), (6, rising), (11, windup), (15, windup)], loop_clip=False)
    # ScytheSweep: the reaping from behind, a huge sweep through the front.
    reap = stance(both=True, twist=1.1, lean=0.55, scythe=(0.95, -0.25, -0.15), wrist=(0.1, -1.7, 3.3), look=(0.3, -1, -0.15),
                  jaw=44, flutter=3.0, stream=0.9)
    through = stance(both=True, twist=1.25, lean=0.4, scythe=(0.4, 0.8, -0.3), wrist=(0.9, -0.8, 3.0), look=(0.45, -1, -0.1),
                     jaw=30, flutter=3.6, stream=0.6)
    add('ScytheSweep', [(1, windup), (4, reap), (8, through), (22, ready)], loop_clip=False)
    add('Hit', [(1, ready), (4, stance(root=(0, 0.35, 0.1), lean=-0.35, look=(0.25, -0.8, 0.35), jaw=22, flutter=1.5,
                                       cape_lift=0.4)), (13, ready)], loop_clip=False)
    # Death: the shroud gives up its dead: it slumps, the skull drops, it folds empty to the flags.
    sag = stance(root=(0, 0.1, -0.6), lean=0.7, scythe=(0.7, -0.4, 0.4), wrist=(-0.4, -1.3, 2.4), look=(0.2, -1, -0.8),
                 jaw=40, flutter=1.0, splay=0.5)
    heap = stance(root=(0, 0.3, -2.9), lean=0.9, scythe=(0.95, 0.1, -0.25), wrist=(-0.2, -1.4, 1.1),
                  left=(1.2, -1.3, 0.9), look=(0.3, -0.7, -0.9), jaw=45, flutter=1.0, splay=1.0, cape_lift=-0.2,
                  tilt=-8)
    add('Death', [(1, ready), (8, stance(lean=-0.4, look=(0, -0.7, 0.7), jaw=50, cape_lift=0.9)), (18, sag),
                  (32, heap), (44, heap)], loop_clip=False)
    return clips


if __name__ == '__main__':
    import bpy
    argv = sys.argv[sys.argv.index('--') + 1:]
    out = argv[0]
    fast = '--fast' in argv
    new_scene()
    mats = make_materials('cloth', membrane_kind='cloth')
    parts = build_parts()
    mems = build_membranes()
    objects = [pt.to_object(mats) for pt in parts] + [m.to_object(mats) for m in mems]
    body = join(objects, 'VaelReaper')
    print('TRIANGLES', triangles(body))
    bake_surface(body, size=512 if fast else 2048, samples=16 if fast else 40)
    arm = build_armature('VaelReaper', BONES)
    bind(body, arm)
    clips = make_clips(arm)
    arm.animation_data.action = bpy.data.actions['Idle']
    bpy.context.scene.frame_set(1)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg)
    zs = [(ev.matrix_world @ v.co).z for v in ev.data.vertices]
    print('IDLE_HEIGHT', round(max(zs) - min(zs), 3), 'MINZ', round(min(zs), 3), 'MAXZ', round(max(zs), 3))
    export(out, arm)
    if '--sheet' in argv:
        setup_preview((0, -0.4, 3.4), 15, ref_x=3.4)
        render_sheet(arm, clips, argv[argv.index('--sheet') + 1], 'reaper')
    if '--blend' in argv:
        bpy.ops.wm.save_as_mainfile(filepath=argv[argv.index('--blend') + 1])
        print('SAVED')
