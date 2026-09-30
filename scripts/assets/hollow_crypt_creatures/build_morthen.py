"""Morthen the Gravecaller as the Lich Bishop: the Hollow Crypt's last boss before
the Knellwyrm (src/sim/encounters/hollow_crypt/morthen_rise.ts, his entrance).

  blender -b --factory-startup --python build_morthen.py -- <out.glb> [--sheet dir] [--blend out.blend] [--fast]

A towering dead prelate who never touches the floor. Layered funeral vestments
(a plum chasuble torn at the hem over a grey alb, a gold-banded stole, a stiff
standing collar) hang from a gaunt skeleton; below the waist there are no legs,
only a twisting funnel of soul smoke that the robes dissolve into. The chasuble
parts over an open ribcage where green soul fire burns. A tall BONE MITRE of two
fused plates, ridged with vertebrae, carries a burning eye. Clusters of melting
funeral candles stand on both shoulder plates, their wax running down over the
bone. The BOOK OF NAMES, a heavy iron-cornered tome, hangs from his left wrist
on a chain; it rises and opens when he reads the names. In his right hand, the
BELL STAFF: a vertebral shaft crowned by a gothic iron cradle with a funeral
bell hanging in it, and a folded iron crest over it that UNFOLDS INTO A GREAT
SCYTHE (Blade1 swings down and out of the crest, Blade2 flicks out of it).

Built on the organic kit (organic_kit.py): smooth parts bound one bone each, the
robes as membranes weighted across hanging spars, a Cycles bake of the cloth and
bone surfaces with their ambient occlusion, a metal material for the bell, the
iron and the gold, the soul fire, eyes, flames and runes on the glow material.
Flames and the soul fire flicker on keyed bone scales in every clip.

Scale (yards; a player stands about 2.6): 5.85 to the mitre's peak at rest; the
game draws him at his template's 1.35, so some 7.9 yards: three players tall.

Clips (24 fps). The staff set, before his last rites:
  Idle          hovering: a slow bob, the smoke turning, the bell and the book swaying.
  Walk, Run     the glide: leaning in, robes and smoke streaming back.
  StaffStrike   the bell head brought down overhead onto his victim.
  StaffStrike2  a backhand bash across the front with the shaft.
  BellToll      Shadow Pulse: the staff thrust high, the bell tolling hard.
  Rise          the entrance: curled in his robes, he unfurls as he rises.
  SummonSouls   reading the names: the book floats up open, the staff raised,
                the souls whirling (the rise's proclamation, the generic cast).
  ShieldRitual  the ward: the staff held level before him, the souls a ring.
  Hit, Death    a recoil; the fire gutters out and the vestments fold empty.
  Transform     the last rites: the crest unfolds into the scythe, whirled
                overhead and brought round to guard.
The scythe set (the blade out), after it:
  ScytheIdle, ScytheWalk, ScytheRun, ScytheHit, ScytheDeath, ScytheSummon,
  ScytheToll (the pulse), ScytheSweep (a flat reaping sweep), ScytheSweep2
  (a rising diagonal reap brought down across the front).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Matrix, Quaternion, Vector  # noqa: E402
from organic_kit import (  # noqa: E402
    BODY, GLOW, MEMBRANE, Membrane, Part, Rig, _procedural_surface, bake_surface, bind, build_armature,
    export, expand_bones, join, make_materials, new_scene, render_sheet, setup_preview, triangles, two_bone,
)

METAL = 3

# ------------------------------------------------------------------ palette
VEST = (0.4, 0.13, 0.46)          # the chasuble, deep plum
VEST_HI = (0.55, 0.22, 0.6)
VEST_DARK = (0.19, 0.06, 0.22)
ALB = (0.5, 0.47, 0.54)           # the grey alb under it
ALB_DARK = (0.32, 0.27, 0.36)
SMOKE = (0.52, 0.46, 0.62)
SMOKE_DARK = (0.2, 0.17, 0.26)
GOLD = (0.92, 0.74, 0.32)
GOLD_HI = (1.0, 0.9, 0.55)
BONE = (0.8, 0.76, 0.66)
BONE_OLD = (0.62, 0.57, 0.47)
BONE_DARK = (0.32, 0.28, 0.23)
SOCKET = (0.02, 0.018, 0.025)
CAVITY = (0.035, 0.02, 0.04)
SOUL = (0.55, 1.0, 0.45)          # ghost fire: green-white, never cyan
SOUL_HOT = (0.92, 1.0, 0.82)
SOUL_DEEP = (0.14, 0.48, 0.12)
WAX = (0.86, 0.8, 0.64)
WAX_OLD = (0.68, 0.6, 0.44)
FLAME = (1.0, 0.66, 0.24)
FLAME_HOT = (1.0, 0.93, 0.72)
BRONZE = (0.66, 0.48, 0.26)
VERDI = (0.36, 0.62, 0.5)
IRON = (0.15, 0.15, 0.17)
IRON_HI = (0.34, 0.34, 0.37)
LEATHER = (0.26, 0.09, 0.07)
PAGE = (0.76, 0.69, 0.53)

SKIRT = 12   # smoke-robe spars round the waist
CHAS = 11    # chasuble spars round the shoulders (the front stays open)
SOULS = 6

SHAFT_BELOW = 1.35
SHAFT_ABOVE = 3.3
GRIP = Vector((-1.22, -0.5, 1.72))       # the staff's grip in the right hand (rest)
APEX = GRIP + Vector((0, 0, SHAFT_ABOVE + 0.12))
BELL_PIVOT = GRIP + Vector((0, 0, SHAFT_ABOVE - 0.42))
BOOK_TOP = Vector((1.22, -0.5, 0.98))


def lerp(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def blade_curve(t):
    """The unfolded blade's spine, from the hinge at the crest (t=0) to the tip
    (t=1), relative to the hinge: a long crescent sweeping forward and down."""
    ang = t * 1.42
    return Vector((0.0, -math.sin(ang) * 2.75, 0.18 - (1 - math.cos(ang)) * 1.55 + 0.22 * t))


BLADE_MID = 0.48


# ------------------------------------------------------------------- bones
def _skirt_bones():
    out = []
    for k in range(SKIRT):
        st = skirt_spar(k)
        out.append((f'Skirt{k}a', 'Hips', st[0], st[1]))
        out.append((f'Skirt{k}b', f'Skirt{k}a', st[1], st[2]))
        out.append((f'Skirt{k}c', f'Skirt{k}b', st[2], st[3]))
    return out


def skirt_spar(k):
    """Waist to smoke tip: out over the hips, then twisting in to a point."""
    a = math.tau * k / SKIRT
    pts = []
    for z, rx, ry, twist in ((2.46, 0.56, 0.46, 0.0), (1.72, 0.98, 0.9, 0.12), (0.98, 0.66, 0.62, 0.42),
                             (0.16, 0.14, 0.14, 1.05)):
        aa = a + twist
        pts.append((math.sin(aa) * rx, -math.cos(aa) * ry, z))
    return pts


def chas_spar(k):
    """The chasuble's k-th spar: collar, shoulder, chest, waist, hem. theta 0
    hangs down the back; the two ends frame the open front over the ribs."""
    th = math.radians(-150 + 300 * k / (CHAS - 1))
    sx, cy = math.sin(th), math.cos(th)
    back = max(0.0, cy)
    front = max(0.0, -cy)
    return th, [
        (sx * 0.42, cy * 0.32 + 0.02, 3.98),
        (sx * 0.98, cy * 0.52 + 0.04, 3.86),
        (sx * 1.04, cy * 0.66 + 0.08 + back * 0.08, 3.0 + front * 0.1),
        (sx * 1.08, cy * 0.8 + 0.12 + back * 0.25, 2.1 + front * 0.25),
        (sx * 1.1, cy * 0.9 + back * 0.55, 1.28 - back * 0.25 + front * 0.45),
    ]


def _chas_bones():
    out = []
    for k in range(CHAS):
        _, st = chas_spar(k)
        out.append((f'Chas{k}a', 'Chest', st[1], st[2]))
        out.append((f'Chas{k}b', f'Chas{k}a', st[2], st[3]))
        out.append((f'Chas{k}c', f'Chas{k}b', st[3], st[4]))
    return out


# Candle wicks on the left shoulder plate (mirrored onto the right).
CANDLES = [((0.6, 0.02, 4.02), 0.44, 0.058), ((0.78, 0.1, 3.99), 0.32, 0.052), ((0.72, -0.13, 3.98), 0.22, 0.05)]


def _flame_bones():
    out = []
    for i, (base, h, _) in enumerate(CANDLES):
        tip = Vector(base) + Vector((0, 0, h))
        out.append((f'Flame{i}.L', 'Chest', tuple(tip), tuple(tip + Vector((0, 0, 0.2)))))
    return out


BONES = expand_bones([
    ('Root', None, (0, 0, 0), (0, 0, 0.6)),
    ('Hips', 'Root', (0, 0, 2.3), (0, 0, 2.8)),
    ('Spine', 'Hips', (0, 0, 2.8), (0, -0.04, 3.35)),
    ('Chest', 'Spine', (0, -0.04, 3.35), (0, -0.06, 3.95)),
    ('Neck', 'Chest', (0, -0.06, 3.95), (0, -0.12, 4.2)),
    ('Head', 'Neck', (0, -0.12, 4.2), (0, -0.2, 4.62)),
    ('Jaw', 'Head', (0, -0.24, 4.28), (0, -0.44, 4.14)),
    ('Arm.L', 'Chest', (0.82, -0.02, 3.82), (1.12, -0.06, 2.9)),
    ('Fore.L', 'Arm.L', (1.12, -0.06, 2.9), (1.2, -0.4, 2.05)),
    ('Hand.L', 'Fore.L', (1.2, -0.4, 2.05), (1.22, -0.5, 1.72)),
    ('Staff', 'Hand.R', tuple(GRIP), tuple(GRIP + Vector((0, 0, 1)))),
    ('Bell', 'Staff', tuple(BELL_PIVOT), tuple(BELL_PIVOT - Vector((0, 0, 0.45)))),
    ('Blade1', 'Staff', tuple(APEX), tuple(APEX + blade_curve(BLADE_MID))),
    ('Blade2', 'Blade1', tuple(APEX + blade_curve(BLADE_MID)), tuple(APEX + blade_curve(1.0))),
    ('Chain1', 'Hand.L', (1.22, -0.5, 1.72), (1.22, -0.5, 1.36)),
    ('Chain2', 'Chain1', (1.22, -0.5, 1.36), tuple(BOOK_TOP)),
    ('Book', 'Chain2', tuple(BOOK_TOP), tuple(BOOK_TOP - Vector((0, 0, 0.5)))),
    ('BookLid', 'Book', tuple(BOOK_TOP + Vector((0.12, 0, 0))), tuple(BOOK_TOP + Vector((0.12, 0, -0.5)))),
    ('SoulFire', 'Chest', (0, -0.1, 3.32), (0, -0.1, 3.72)),
    ('Souls', 'Root', (0, 0, 3.3), (0, 0, 3.8)),
    ('Smoke', 'Root', (0, 0, 0.2), (0, 0, 1.2)),
    ('SmokeIn', 'Root', (0, 0.01, 0.3), (0, 0.01, 1.3)),
] + _flame_bones() + _skirt_bones() + _chas_bones())
REST = {n: (Vector(h), Vector(t)) for n, _, h, t in BONES}
FLAMES = [n for n, *_ in BONES if n.startswith('Flame')]
FLICKER = set(FLAMES) | {'SoulFire'}

# The Book of Names opened before him: pages facing out and up at whoever he
# names, the spine left to right (columns: the book's local x, y, z).
BOOK_OPEN = Matrix(((0.0, 1.0, 0.0), (-0.55, 0.0, 0.84), (0.84, 0.0, 0.55))).to_quaternion()


# ------------------------------------------------------------------- parts
def finger(p, base, direction, curl_axis, lengths, r, color=BONE, ring=None):
    d = Vector(direction).normalized()
    ax = Vector(curl_axis).normalized()
    pos = Vector(base)
    for i, ln in enumerate(lengths):
        d = (Matrix.Rotation(math.radians(22 + 10 * i), 3, ax) @ d).normalized()
        end = pos + d * ln
        p.tube([pos, pos.lerp(end, 0.5), end], [r * (1 - 0.15 * i), r * 0.8 * (1 - 0.15 * i), r * 0.85 * (1 - 0.15 * i)],
               lerp(color, BONE_OLD, i * 0.25), sides=6)
        p.blob(end, (r * 2.0, r * 2.0, r * 2.0), BONE_OLD, segments=6, rings=4)
        if ring is not None and i == 0:
            c = pos.lerp(end, 0.55)
            p.tube([c - d * 0.022, c + d * 0.022], [r * 1.9, r * 1.9], ring, sides=8, mat=METAL)
        pos = end


def skeletal_hand(p, wrist, down, side, s, rings=(1, 3)):
    w = Vector(wrist)
    d = Vector(down).normalized()
    sd = Vector(side).normalized()
    fwd = d.cross(sd).normalized()
    p.blob(w, (0.12, 0.12, 0.12), BONE_OLD, segments=8, rings=6)
    palm = w + d * 0.14
    for k in range(4):
        off = sd * ((k - 1.5) * 0.06)
        p.tube([w + off * 0.4, palm + off], [0.026, 0.023], BONE, sides=6)
        finger(p, palm + off, d, sd, [0.11, 0.095, 0.075], 0.024, ring=GOLD if k in rings else None)
    finger(p, w + d * 0.05 + sd * (s * 0.09) + fwd * 0.05, d * 0.6 + fwd * 0.4 + sd * (s * 0.3), sd, [0.09, 0.075], 0.026)


def ribbon(p, pts, sides, widths, colors, mat, rag=0.0, seed=0):
    """A flat strip along `pts`, `widths[i]` across `sides[i]`: smoke, silk,
    a torn veil. Its far edge is torn by `rag`."""
    import random
    rng = random.Random(seed * 131 + 7)
    rows = []
    for i, (c, sd, w) in enumerate(zip(pts, sides, widths)):
        tear = 1.0 - rag * rng.random() * (0.3 + 0.7 * i / max(1, len(pts) - 1))
        a = p.bm.verts.new(c - sd * w * 0.5)
        b = p.bm.verts.new(c + sd * w * 0.5 * tear)
        rows.append((a, b))
    for i in range(len(rows) - 1):
        (a0, b0), (a1, b1) = rows[i], rows[i + 1]
        f = p.bm.faces.new((a0, b0, b1, a1))
        f.material_index = mat
        for lp, ci in zip(f.loops, (i, i, i + 1, i + 1)):
            lp[p.col] = (*colors[ci], 1.0)


def build_parts():
    parts = []

    def part(name, bone, **kw):
        pt = Part(name, bone, **kw)
        parts.append(pt)
        return pt

    # --- the torso: a dark cavity behind an open ribcage full of soul fire -------------
    torso = part('Torso', 'Spine', subdiv=1)
    torso.loft([
        ((0, 0.04, 2.5), 0.46, 0.34, 2.4, (0, 0, 1)),
        ((0, 0.06, 2.95), 0.42, 0.32, 2.4, (0, 0, 1)),
        ((0, 0.08, 3.3), 0.52, 0.34, 2.6, (0, 0, 1)),
    ], ALB_DARK, sides=18, mat=MEMBRANE)
    chest = part('ChestShell', 'Chest', subdiv=1)
    chest.loft([
        ((0, 0.1, 3.3), 0.54, 0.3, 2.6, (0, 0, 1)),
        ((0, 0.12, 3.6), 0.74, 0.34, 2.8, (0, 0, 1)),
        ((0, 0.1, 3.88), 0.9, 0.36, 3.0, (0, 0, 1)),
        ((0, 0.04, 4.02), 0.42, 0.26, 2.2, (0, 0, 1)),
    ], CAVITY, sides=18, mat=MEMBRANE)
    ribs = part('Ribs', 'Chest', smooth=True)
    ribs.tube([Vector((0, -0.38, 3.9)), Vector((0, -0.44, 3.6)), Vector((0, -0.4, 3.28))], [0.04, 0.045, 0.034],
              BONE, sides=6)
    for i in range(6):
        z = 3.84 - i * 0.1
        w = 0.36 + 0.05 * math.sin(i * 0.9)
        for s in (-1, 1):
            pts = [Vector((s * (0.03 + w * math.sin(t * math.pi * 0.64)), -0.41 + 0.4 * (1 - math.cos(t * math.pi * 0.64)),
                           z - 0.12 * t)) for t in (j / 7 for j in range(8))]
            ribs.tube(pts, [0.03 - 0.003 * i] * 8, lerp(BONE, BONE_OLD, i / 6), sides=6)
    # The spine behind the ribs, then bare down to the smoke under them.
    for i in range(11):
        z = 3.86 - i * 0.12
        y = 0.02 if z > 3.3 else -0.12
        ribs.blob((0, y, z), (0.1, 0.09, 0.07), lerp(BONE, BONE_DARK, i / 14), segments=8, rings=5)
        ribs.box((0, y + 0.08, z), (0.035, 0.08, 0.05), BONE_OLD, bevel=0.01)
        if z <= 3.3:
            for s in (-1, 1):
                ribs.spike((s * 0.05, y - 0.02, z), 0.025, 0.12, BONE_OLD, sides=4, lean=(s * 0.1, -0.02))
    # A rosary of bone beads slung under the ribs, a gold reliquary at its foot.
    beads = [Vector((math.sin(t) * 0.36, -0.36 - 0.08 * math.cos(t), 3.26 - 0.46 * math.cos(t * 0.5) ** 2 + 0.46))
             for t in (math.radians(a) for a in range(-80, 81, 8))]
    for b in beads:
        ribs.blob(b, (0.05, 0.05, 0.05), BONE, segments=6, rings=4)
    low = min(beads, key=lambda v: v.z)
    ribs.tube([low, low - Vector((0, 0, 0.18))], [0.01, 0.01], GOLD, sides=4, mat=METAL)
    ribs.blob(low - Vector((0, 0.02, 0.28)), (0.1, 0.05, 0.14), GOLD, segments=8, rings=6, mat=METAL)
    ribs.blob(low - Vector((0, 0.05, 0.28)), (0.05, 0.02, 0.07), SOUL, mat=GLOW, segments=6, rings=4)
    # The soul fire caged in the ribs (flickers on the SoulFire bone).
    fire = part('SoulFireCore', 'SoulFire', smooth=True)
    fire.blob((0, -0.12, 3.46), (0.42, 0.3, 0.44), SOUL_DEEP, mat=GLOW, segments=12, rings=10)
    fire.blob((0, -0.18, 3.44), (0.26, 0.2, 0.3), SOUL, mat=GLOW, segments=10, rings=8)
    fire.blob((0, -0.21, 3.42), (0.13, 0.1, 0.16), SOUL_HOT, mat=GLOW, segments=8, rings=6)
    for k in range(7):
        a = k * 2.4
        x = math.sin(a) * 0.16
        y = -0.14 + math.cos(a) * 0.08
        h = 0.26 + 0.08 * ((k * 5) % 3)
        fire.spike((x, y, 3.5), 0.07, h, lerp(SOUL, SOUL_HOT, 0.4), sides=5, lean=(x * 0.4, -0.05), mat=GLOW)
    # --- the skull ---------------------------------------------------------------------------
    head = part('Skull', 'Head', smooth=True, subdiv=1)
    head_mark = head.mark()
    head.blob((0, -0.26, 4.44), (0.36, 0.46, 0.44), BONE, segments=18, rings=14)
    head.blob((0, -0.44, 4.52), (0.3, 0.22, 0.12), BONE, segments=14, rings=8)
    head.loft([
        ((0, -0.4, 4.42), 0.19, 0.12, 2.6, (0, -0.25, -1)),
        ((0, -0.48, 4.27), 0.16, 0.1, 2.4, (0, -0.2, -1)),
        ((0, -0.52, 4.16), 0.12, 0.08, 2.2, (0, -0.2, -1)),
    ], BONE, sides=14)
    for s in (-1, 1):
        head.blob((s * 0.12, -0.57, 4.38), (0.12, 0.09, 0.1), SOCKET, segments=12, rings=8)
        head.loft([
            ((s * 0.14, -0.5, 4.28), 0.03, 0.04, 2.0, (s * 1, -0.6, -0.2)),
            ((s * 0.22, -0.45, 4.26), 0.04, 0.05, 2.0, (s * 1, -0.6, -0.2)),
            ((s * 0.27, -0.34, 4.28), 0.02, 0.03, 2.0, (s * 1, -0.6, -0.2)),
        ], BONE_OLD, sides=8)
        head.blob((s * 0.12, -0.655, 4.38), (0.05, 0.02, 0.05), SOUL_HOT, mat=GLOW, segments=8, rings=6)
        head.blob((s * 0.12, -0.648, 4.38), (0.09, 0.012, 0.075), SOUL, mat=GLOW, segments=8, rings=6)
    head.prism((0, -0.56, 4.28), 3, 0.045, 0.001, 0.09, SOCKET, axis=(0, -0.3, -1))
    for k in range(8):
        x = (k - 3.5) * 0.034
        head.box((x, -0.56 + abs(x) * 0.4, 4.15), (0.026, 0.024, 0.055), BONE_OLD, bevel=0.004)
    # A crack across the brow, lit from inside.
    head.tube([Vector((0.1, -0.58, 4.6)), Vector((0.03, -0.6, 4.55)), Vector((0.06, -0.6, 4.49)),
               Vector((-0.02, -0.6, 4.46))], [0.012, 0.014, 0.012, 0.008], SOUL, mat=GLOW, sides=4)
    skull_scale = Matrix.Translation((0, -0.3, 4.36)) @ Matrix.Scale(1.18, 4) @ Matrix.Translation((0, 0.3, -4.36))
    head.turn(head_mark, skull_scale)
    jaw = part('Jaw', 'Jaw', smooth=True)
    jaw_mark = jaw.mark()
    jaw.loft([
        ((-0.2, -0.32, 4.16), 0.03, 0.05, 2.0, (1, -0.4, 0)),
        ((-0.12, -0.48, 4.09), 0.04, 0.05, 2.0, (1, -0.4, 0)),
        ((0, -0.53, 4.07), 0.05, 0.05, 2.0, (1, 0, 0)),
        ((0.12, -0.48, 4.09), 0.04, 0.05, 2.0, (1, 0.4, 0)),
        ((0.2, -0.32, 4.16), 0.03, 0.05, 2.0, (1, 0.4, 0)),
    ], BONE, sides=8)
    for k in range(7):
        x = (k - 3) * 0.034
        jaw.box((x, -0.52 + abs(x) * 0.4, 4.12), (0.025, 0.022, 0.045), BONE_OLD, bevel=0.004)
    jaw.turn(jaw_mark, skull_scale)
    # --- the bone mitre: two fused plates, ridged, a burning eye -----------------------------
    mit = part('Mitre', 'Head', smooth=True)
    for plate_y, tilt in ((-0.16, -1), (0.14, 1)):
        secs = []
        for i in range(9):
            t = i / 8
            z = 4.62 + t * 1.2
            hw = 0.33 * (1 + 0.16 * math.sin(t * math.pi * 0.9)) * (1 - t ** 2.2) + 0.012
            secs.append(((0, plate_y + tilt * 0.08 * t * t - 0.07 * t, z), hw, 0.035, 2.4, (0, 0, 1)))
        mit.loft(secs, BONE, sides=12)
        # vertebral ridge up the plate's middle
        for i in range(8):
            t = (i + 0.5) / 9
            z = 4.66 + t * 1.12
            mit.blob((0, plate_y + tilt * 0.08 * t * t - 0.07 * t + tilt * 0.035, z), (0.08 * (1 - t * 0.6), 0.04, 0.07),
                     BONE_OLD, segments=8, rings=5)
        # bony flanges along the rim
        for s in (-1, 1):
            for i in range(6):
                t = 0.1 + i * 0.14
                hw = 0.33 * (1 + 0.16 * math.sin(t * math.pi * 0.9)) * (1 - t ** 2.2)
                mit.spike((s * (hw + 0.005), plate_y + tilt * 0.08 * t * t - 0.07 * t, 4.62 + t * 1.2), 0.03,
                          0.1 * (1 - t * 0.5), GOLD, sides=4, lean=(s * 0.08, 0), mat=METAL)
            # a gilt edge up each side of the plate
            edge = []
            for i in range(9):
                t = i / 8
                hw = 0.33 * (1 + 0.16 * math.sin(t * math.pi * 0.9)) * (1 - t ** 2.2) + 0.012
                edge.append(Vector((s * hw, plate_y + tilt * 0.08 * t * t - 0.07 * t, 4.62 + t * 1.2)))
            mit.tube(edge, [0.028] * 8 + [0.012], GOLD, sides=5, mat=METAL)
    # the band round the brow, gold-banded bone, and the side walls between the plates
    mit.loft([((0, -0.01, 4.6), 0.4, 0.34, 2.2, (0, 0, 1)), ((0, -0.01, 4.74), 0.38, 0.3, 2.2, (0, 0, 1))],
             BONE_OLD, sides=18)
    mit.loft([((0, -0.01, 4.63), 0.41, 0.35, 2.2, (0, 0, 1)), ((0, -0.01, 4.68), 0.41, 0.35, 2.2, (0, 0, 1))],
             GOLD, sides=18, mat=METAL)
    # the eye on the front plate
    mit.blob((0, -0.21, 5.0), (0.16, 0.05, 0.22), GOLD, segments=10, rings=8, mat=METAL)
    mit.blob((0, -0.235, 5.0), (0.1, 0.03, 0.14), SOUL, mat=GLOW, segments=10, rings=8)
    mit.blob((0, -0.25, 5.0), (0.04, 0.02, 0.06), SOUL_HOT, mat=GLOW, segments=8, rings=6)
    for k in range(6):
        a = math.tau * k / 6
        mit.spike((math.sin(a) * 0.19, -0.2, 5.0 + math.cos(a) * 0.26), 0.02, 0.1, GOLD_HI, sides=4,
                  lean=(math.sin(a) * 0.08, 0), mat=METAL)
    # the lappets hanging down the back, strung with bone beads
    for s in (-1, 1):
        base = Vector((s * 0.18, 0.28, 4.66))
        pts = [base + Vector((s * 0.03 * t, 0.12 * t, -0.9 * t)) for t in (i / 6 for i in range(7))]
        mit.tube(pts, [0.07] * 7, VEST_HI, sides=6, squash=0.25, mat=MEMBRANE)
        for i in range(1, 7):
            mit.blob(pts[i] + Vector((0, 0.03, 0)), (0.05, 0.04, 0.05), BONE_OLD, segments=6, rings=4)
        mit.blob(pts[-1] + Vector((0, 0.03, -0.08)), (0.07, 0.06, 0.1), GOLD, segments=8, rings=5, mat=METAL)
    # --- the high collar behind the skull and the shoulder plates with their candles ----------
    col = part('Collar', 'Chest', smooth=True)
    for i in range(9):
        a = math.radians(-120 + 240 * i / 8)
        x, y = math.sin(a) * 0.52, math.cos(a) * 0.42 + 0.06
        top = 4.6 + 0.3 * math.cos(a * 0.8)
        col.tube([Vector((x, y, 3.92)), Vector((x * 1.12, y * 1.12 + 0.04, (3.92 + top) / 2)),
                  Vector((x * 1.25, y * 1.2 + 0.1, top))], [0.13, 0.12, 0.05], VEST, sides=5, squash=0.28,
                 mat=MEMBRANE)
        col.tube([Vector((x * 1.26, y * 1.22 + 0.1, top)), Vector((x * 1.27, y * 1.23 + 0.1, top + 0.02))], [0.05, 0.035],
                 GOLD, sides=5, mat=METAL)
    for s in (-1, 1):
        # a pauldron of old bone: a scapula shell over the shoulder, a skull on its point
        sh = Vector((s * 0.74, 0.0, 3.9))
        col.blob(sh, (0.5, 0.52, 0.2), BONE, rot=(0, s * 0.35, 0), segments=14, rings=8)
        col.blob(sh + Vector((s * 0.1, 0, -0.04)), (0.56, 0.56, 0.12), BONE_OLD, rot=(0, s * 0.45, 0), segments=14,
                 rings=6)
        col.skull((s * 1.02, -0.18, 3.74), size=0.16, yaw=s * 0.5, color=BONE)
        for k in range(4):
            a = math.radians(-60 + 40 * k)
            col.spike(sh + Vector((s * 0.36 * math.cos(a), 0.3 * math.sin(a), -0.02)), 0.035, 0.18, BONE_OLD, sides=4,
                      lean=(s * 0.12, 0.03 * math.sin(a)))
        # the gold-banded stole edging the opening, falling to the waist
        stole = [Vector((s * 0.2, -0.3, 4.0)), Vector((s * 0.36, -0.44, 3.72)), Vector((s * 0.46, -0.48, 3.35)),
                 Vector((s * 0.44, -0.46, 2.95)), Vector((s * 0.38, -0.48, 2.5)), Vector((s * 0.36, -0.52, 2.05))]
        col.tube(stole, [0.14] * 6, VEST_HI, sides=6, squash=0.2, mat=MEMBRANE, up=(0, -1, 0))
        for edge in (-1, 1):
            col.tube([v + Vector((edge * 0.125, -0.03, 0)) for v in stole], [0.016] * 6, GOLD, sides=5, mat=METAL)
        for i in range(5):
            c = stole[i].lerp(stole[i + 1], 0.5) + Vector((0, -0.045, 0))
            col.blob(c, (0.06, 0.02, 0.06), GOLD_HI, segments=6, rings=4, mat=METAL)
            col.prism(c + Vector((0, -0.012, 0)), 4, 0.03, 0.03, 0.01, SOUL, mat=GLOW, axis=(0, -1, 0), phase=0.785)
        for j in range(5):
            x = s * (0.3 + j * 0.03)
            col.tube([Vector((x, -0.52, 2.02)), Vector((x, -0.53, 1.9))], [0.012, 0.008], GOLD, sides=4, mat=METAL)
        # the candles, wax pooled on the plate and running down over its edge
        for i, (base, h, r) in enumerate(CANDLES):
            b = Vector((s * base[0], base[1], base[2]))
            col.lathe(tuple(b), [(r * 1.1, 0), (r, r * 0.4), (r * 0.98, h * 0.9), (r * 0.8, h)], 9,
                      lerp(WAX, WAX_OLD, 0.25 * i), mat=BODY)
            col.tube([b + Vector((0, 0, h - 0.01)), b + Vector((0, 0, h + 0.05))], [0.008, 0.006], SOCKET, sides=4)
            for d in range(4):
                a = (d * 1.7 + i) % math.tau
                top = b + Vector((math.cos(a) * r, math.sin(a) * r, h * (0.9 - 0.12 * d)))
                drop = 0.12 + 0.1 * d + 0.08 * i
                col.tube([top, top + Vector((math.cos(a) * 0.012, math.sin(a) * 0.012, -drop * 0.6)),
                          top + Vector((math.cos(a) * 0.018, math.sin(a) * 0.018, -drop))], [0.022, 0.018, 0.024],
                         WAX, sides=5)
        col.blob(Vector((s * 0.72, -0.02, 3.97)), (0.34, 0.3, 0.05), WAX_OLD, segments=10, rings=5)
        for d in range(6):
            a = math.radians(-100 + 40 * d)
            top = Vector((s * (0.72 + 0.3 * math.cos(a)), -0.02 + 0.26 * math.sin(a), 3.95))
            drop = 0.2 + 0.14 * ((d * 3) % 4)
            col.tube([top, top + Vector((s * 0.05, 0, -drop * 0.5)), top + Vector((s * 0.07, 0, -drop))],
                     [0.03, 0.022, 0.028], WAX, sides=5)
    # the flames, each on its own flickering bone
    for i, (base, h, r) in enumerate(CANDLES):
        for s, tag in ((1, '.L'), (-1, '.R')):
            wick = Vector((s * base[0], base[1], base[2] + h + 0.03))
            fl = part(f'Flame{i}{tag}', f'Flame{i}{tag}', smooth=True)
            fl.blob(wick + Vector((0, 0, 0.06)), (0.07, 0.07, 0.15), FLAME, mat=GLOW, segments=8, rings=6)
            fl.blob(wick + Vector((0, 0, 0.04)), (0.035, 0.035, 0.08), FLAME_HOT, mat=GLOW, segments=6, rings=5)
            fl.spike(wick + Vector((0, 0, 0.08)), 0.03, 0.16, FLAME, sides=5, mat=GLOW)
    # --- the cincture: knotted bone beads, skull charms ---------------------------------------
    belt = part('Belt', 'Hips', smooth=True)
    belt.tube([Vector((math.sin(math.tau * i / 32) * 0.56, -math.cos(math.tau * i / 32) * 0.46, 2.52 + 0.03 * math.sin(i)))
               for i in range(33)], [0.05] * 33, GOLD, sides=6, cap=False, mat=METAL)
    for i in range(16):
        a = math.tau * i / 16
        belt.blob((math.sin(a) * 0.58, -math.cos(a) * 0.48, 2.52), (0.07, 0.06, 0.06), BONE_OLD, segments=6, rings=4)
    for s, drop in ((-1, 0.7), (1, 1.0), (-0.4, 0.5)):
        belt.tube([Vector((s * 0.24, -0.47, 2.5)), Vector((s * 0.27, -0.5, 2.5 - drop * 0.5)),
                   Vector((s * 0.25, -0.48, 2.5 - drop))], [0.025, 0.02, 0.02], GOLD, sides=5, mat=METAL)
        belt.skull((s * 0.25, -0.48, 2.36 - drop), size=0.1, color=BONE_OLD)
    # --- arms: bell sleeves of plum and gold, skeletal hands ----------------------------------
    for s, tag in ((1, '.L'), (-1, '.R')):
        a0, a1 = REST['Arm.L']
        a0 = Vector((s * a0.x, a0.y, a0.z))
        a1 = Vector((s * a1.x, a1.y, a1.z))
        up = part('Sleeve' + tag, 'Arm' + tag, smooth=True)
        up.tube([a0.lerp(a1, t) for t in (0, 0.33, 0.66, 1.0)], [0.24, 0.22, 0.21, 0.23], VEST, sides=12, mat=MEMBRANE)
        f0, f1 = REST['Fore.L']
        f0 = Vector((s * f0.x, f0.y, f0.z))
        f1 = Vector((s * f1.x, f1.y, f1.z))
        lo = part('Cuff' + tag, 'Fore' + tag, smooth=True)
        lo.tube([f0.lerp(f1, t) for t in (0, 0.3, 0.6, 0.85, 1.0)], [0.22, 0.26, 0.32, 0.4, 0.45], VEST, sides=16,
                cap=False, mat=MEMBRANE)
        lo.tube([f1 + (f1 - f0).normalized() * 0.01, f1 + (f1 - f0).normalized() * 0.05], [0.46, 0.465], GOLD, sides=16,
                cap=False, mat=METAL)
        for k in range(9):
            ang = math.tau * k / 9
            base = f1 + Vector((math.cos(ang) * 0.42, math.sin(ang) * 0.42, 0.04))
            ln = 0.35 + 0.4 * ((k * 37) % 5) / 5
            lo.tube([base, base + Vector((0.06 * math.cos(ang), 0.06 * math.sin(ang), -ln * 0.5)),
                     base + Vector((0.1 * math.cos(ang), 0.1 * math.sin(ang), -ln))], [0.12, 0.09, 0.02], VEST,
                    sides=4, squash=0.12, mat=MEMBRANE, up=(math.cos(ang), math.sin(ang), 0))
        hand = part('Hand' + tag, 'Hand' + tag, smooth=True)
        h0, h1 = REST['Hand.L']
        h0 = Vector((s * h0.x, h0.y, h0.z))
        h1 = Vector((s * h1.x, h1.y, h1.z))
        skeletal_hand(hand, h0, h1 - h0, (1, 0, 0), s, rings=(1, 3) if s > 0 else (0, 2))
    # the manacle and chain on the left wrist
    ch1 = part('Manacle', 'Hand.L', smooth=True)
    w = Vector(REST['Hand.L'][0])
    ch1.tube([w + Vector((0, 0, 0.04)), w + Vector((0, 0, -0.06))], [0.14, 0.14], IRON, sides=10, cap=False, mat=METAL)
    ch1.blob(w + Vector((0.13, -0.02, -0.02)), (0.05, 0.05, 0.06), IRON_HI, segments=6, rings=4, mat=METAL)

    def links(p, a, b, n, phase=0.0):
        a, b = Vector(a), Vector(b)
        for i in range(n):
            c = a.lerp(b, (i + 0.5) / n)
            d = (b - a).normalized()
            side = Vector((1, 0, 0)) if (i + phase) % 2 == 0 else Vector((0, 1, 0))
            ring = [c + d * 0.045 * math.cos(t) + side * 0.028 * math.sin(t) for t in (j * math.tau / 10 for j in range(11))]
            p.tube(ring, [0.012] * 11, IRON_HI if i % 3 == 0 else IRON, sides=5, cap=False, mat=METAL)

    links(ch1, REST['Chain1'][0], REST['Chain1'][1], 4)
    ch2 = part('Chain', 'Chain2', smooth=True)
    links(ch2, REST['Chain2'][0], REST['Chain2'][1], 4, 1)
    # --- the Book of Names -----------------------------------------------------------------------
    bk = part('Book', 'Book', smooth=False)
    bk_mark = bk.mark()
    t0 = Vector(BOOK_TOP)
    # the book hangs with its spine up; covers face +-X
    ctr = t0 + Vector((0, 0, -0.27))
    bk.box(tuple(ctr + Vector((-0.07, 0, 0))), (0.035, 0.46, 0.52), LEATHER, bevel=0.012)       # back cover
    bk.box(tuple(ctr + Vector((0.005, 0, -0.005))), (0.12, 0.43, 0.49), PAGE, bevel=0.004)      # the page block
    for z in (-0.19, -0.06, 0.07, 0.2):
        bk.box(tuple(ctr + Vector((0.005, -0.216, z))), (0.12, 0.004, 0.012), (0.45, 0.4, 0.3))  # page edges
    bk.tube([t0 + Vector((-0.07, -0.23, 0.01)), t0 + Vector((0.06, -0.23, 0.01))], [0.05, 0.05], LEATHER, sides=8,
            mat=BODY)
    bk.tube([t0 + Vector((-0.07, -0.23, 0.01)), t0 + Vector((-0.07, 0.23, 0.01))], [0.045, 0.045], LEATHER, sides=8)
    for y in (-0.14, 0.0, 0.14):
        bk.tube([t0 + Vector((-0.1, y, 0.01)), t0 + Vector((0.08, y, 0.01))], [0.018, 0.018], GOLD, sides=6, mat=METAL)
    bk.blob(t0 + Vector((-0.01, 0, 0.06)), (0.07, 0.07, 0.07), IRON_HI, segments=8, rings=5, mat=METAL)   # the ring
    for y in (-1, 1):
        for z in (-1, 1):
            bk.box(tuple(ctr + Vector((-0.085, y * 0.2, z * 0.23))), (0.02, 0.09, 0.09), IRON, bevel=0.01, mat=METAL)
    lid = part('BookLid', 'BookLid', smooth=False)
    lid_mark = lid.mark()
    lid.box(tuple(ctr + Vector((0.085, 0, 0))), (0.035, 0.46, 0.52), LEATHER, bevel=0.012)
    for y in (-1, 1):
        for z in (-1, 1):
            lid.box(tuple(ctr + Vector((0.1, y * 0.2, z * 0.23))), (0.02, 0.09, 0.09), IRON, bevel=0.01, mat=METAL)
    lid.skull(tuple(ctr + Vector((0.11, 0, -0.04))), size=0.13, yaw=math.pi / 2, color=BONE)
    lid.box(tuple(ctr + Vector((0.1, 0, 0.19))), (0.012, 0.3, 0.05), GOLD, bevel=0.004, mat=METAL)
    lid.box(tuple(ctr + Vector((0.08, 0.25, -0.02))), (0.05, 0.06, 0.14), IRON_HI, bevel=0.01, mat=METAL)  # the clasp
    # the burning names on the open pages (hidden under the lid when shut)
    for i in range(5):
        z = -0.18 + i * 0.085
        lid.box(tuple(ctr + Vector((0.064, -0.08, z))), (0.004, 0.24, 0.018), SOUL, mat=GLOW)
        bk.box(tuple(ctr + Vector((0.066, 0.06, z + 0.02))), (0.004, 0.2, 0.016), SOUL, mat=GLOW)
    # The tome is heavy: every part of it grown about its ring at the spine.
    tome = Matrix.Translation(t0) @ Matrix.Scale(1.4, 4) @ Matrix.Translation(-t0)
    bk.turn(bk_mark, tome)
    lid.turn(lid_mark, tome)
    # --- the bell staff and the folded scythe ----------------------------------------------------
    st = part('Staff', 'Staff', smooth=True)
    up = Vector((0, 0, 1))
    g = Vector(GRIP)
    bottom = g - up * SHAFT_BELOW
    top = g + up * SHAFT_ABOVE
    n = 30
    for i in range(n):
        t0_ = i / n
        t1_ = (i + 0.8) / n
        a = bottom.lerp(top, t0_)
        b = bottom.lerp(top, t1_)
        st.tube([a, a.lerp(b, 0.5), b], [0.075, 0.062, 0.075], lerp(BONE_OLD, BONE_DARK, (i % 4) / 5), sides=8)
        st.tube([b, bottom.lerp(top, (i + 1) / n)], [0.05, 0.05], BONE_DARK, sides=6)
    for t in (0.0, 0.14, 0.3, 0.62, 0.9):
        c = bottom.lerp(top, t)
        st.tube([c - up * 0.07, c + up * 0.07], [0.1, 0.1], GOLD, sides=10, mat=METAL)
    st.spike(bottom, 0.08, -0.3, IRON, sides=6, mat=METAL)
    st.blob(bottom - up * 0.02, (0.13, 0.13, 0.1), GOLD, segments=8, rings=5, mat=METAL)
    # the gothic cradle: two iron arms rising to a pointed arch, the bell hung between them
    cb = top - up * 0.95
    st.blob(cb, (0.22, 0.2, 0.16), GOLD, segments=10, rings=6, mat=METAL)
    for s in (-1, 1):
        arm_pts = [cb + Vector((s * 0.08, 0, 0.05)), cb + Vector((s * 0.46, 0, 0.35)), cb + Vector((s * 0.5, 0, 0.72)),
                   cb + Vector((s * 0.36, 0, 0.98)), cb + Vector((s * 0.12, 0, 1.08)), top + up * 0.13]
        st.tube(arm_pts, [0.05, 0.05, 0.048, 0.045, 0.042, 0.04], IRON, sides=7, mat=METAL)
        for k, t in enumerate((0.3, 0.55, 0.8)):
            p = arm_pts[1].lerp(arm_pts[3], t)
            st.spike(p, 0.025, 0.16, IRON_HI, sides=4, lean=(s * 0.12, 0), mat=METAL)
        st.skull(tuple(cb + Vector((s * 0.52, -0.02, 0.55))), size=0.1, yaw=0, color=BONE_OLD)
    st.tube([cb + Vector((-0.44, 0, 0.62)), cb + Vector((0.44, 0, 0.62))], [0.035, 0.035], IRON_HI, sides=6, mat=METAL)
    st.blob(top + up * 0.12, (0.11, 0.11, 0.11), GOLD, segments=8, rings=6, mat=METAL)            # the crest hinge
    # the bell (on its own bone, swinging)
    bl = part('Bell', 'Bell', smooth=True)
    pv = Vector(BELL_PIVOT)
    bl.tube([pv + Vector((0, 0, 0.02)), pv - Vector((0, 0, 0.1))], [0.04, 0.04], IRON, sides=6, mat=METAL)
    bl.lathe(tuple(pv - Vector((0, 0, 0.56))), [(0.27, 0.0), (0.25, 0.04), (0.2, 0.14), (0.16, 0.3), (0.15, 0.4),
                                                 (0.12, 0.45), (0.0, 0.47)], 18, BRONZE, mat=METAL)
    bl.lathe(tuple(pv - Vector((0, 0, 0.56))), [(0.275, 0.0), (0.28, 0.02), (0.26, 0.045)], 18, VERDI, mat=METAL)
    for k in range(6):
        a = math.tau * k / 6
        bl.blob(pv - Vector((0, 0, 0.36)) + Vector((math.cos(a) * 0.17, math.sin(a) * 0.17, 0)), (0.05, 0.05, 0.05),
                VERDI, segments=6, rings=4, mat=METAL)
    bl.skull(tuple(pv - Vector((0, 0.19, 0.42))), size=0.1, color=BONE_OLD)
    bl.tube([pv - Vector((0, 0, 0.12)), pv - Vector((0, 0, 0.5))], [0.018, 0.018], IRON, sides=5, mat=METAL)
    bl.blob(pv - Vector((0, 0, 0.53)), (0.07, 0.07, 0.08), IRON_HI, segments=8, rings=5, mat=METAL)   # clapper
    bl.blob(pv - Vector((0, 0, 0.44)), (0.13, 0.13, 0.08), SOUL_DEEP, mat=GLOW, segments=10, rings=5)  # soul light in its throat
    # the blade: two halves, each on its hinge; modelled OUT (the scythe) and folded by the clips
    for tag, t_a, t_b, dx in (('Blade1', 0.0, BLADE_MID, 0.0), ('Blade2', BLADE_MID, 1.0, 0.045)):
        bp = part(tag, tag, smooth=True)
        nseg = 10
        spine = [Vector(APEX) + blade_curve(t_a + (t_b - t_a) * i / nseg) + Vector((dx, 0, 0)) for i in range(nseg + 1)]
        secs = []
        for i, pnt in enumerate(spine):
            t = t_a + (t_b - t_a) * i / nseg
            tang = (spine[min(nseg, i + 1)] - spine[max(0, i - 1)]).normalized()
            width = 0.5 * (1 - t) ** 0.65 + 0.03
            secs.append((tuple(pnt + Vector((0, 0, -width * 0.5))), 0.034 * (1 - 0.6 * t) + 0.007, width * 0.5, 2.2,
                         tuple(tang)))
        bp.loft(secs, IRON, sides=10, mat=METAL)
        edge = [pnt + Vector((0, 0, -(0.5 * (1 - (t_a + (t_b - t_a) * i / nseg)) ** 0.65 + 0.03))) for i, pnt in enumerate(spine)]
        bp.tube(edge, [0.034 * (1 - 0.7 * (t_a + (t_b - t_a) * i / nseg)) + 0.008 for i in range(nseg + 1)], SOUL,
                mat=GLOW, sides=5)
        for i in (2, 5, 8):
            bp.spike(spine[i] + Vector((0, 0, 0.02)), 0.05, 0.17, IRON_HI, sides=4, lean=(0, 0.05), mat=METAL)
        rn = [pnt + Vector((0.038, 0, -0.16 * (1 - (t_a + (t_b - t_a) * i / nseg)))) for i, pnt in enumerate(spine)]
        bp.tube(rn, [0.012] * len(rn), SOUL_DEEP, mat=GLOW, sides=4)
        # the hinge knuckle
        bp.blob(spine[0], (0.13, 0.1, 0.13), GOLD, segments=8, rings=6, mat=METAL)
        if tag == 'Blade1':
            bp.skull(tuple(spine[0] + Vector((0, -0.06, 0.1))), size=0.12, color=BONE)
    # --- the souls he has gathered, circling --------------------------------------------------
    so = part('Souls', 'Souls', smooth=True)
    for k in range(SOULS):
        ang = math.tau * k / SOULS
        r = 1.55 + 0.25 * math.sin(k * 2.1)
        z = 3.2 + 0.7 * math.sin(k * 1.7)
        c = Vector((math.cos(ang) * r, math.sin(ang) * r, z))
        so.blob(c, (0.2, 0.2, 0.22), SOUL, mat=GLOW, segments=10, rings=8)
        so.blob(c + Vector((0, 0, 0.01)), (0.1, 0.1, 0.11), SOUL_HOT, mat=GLOW, segments=8, rings=6)
        # a comet tail trailing back along the orbit, rising and thinning
        # a short flame of a tail licking back along the orbit and up
        tail = [Vector((math.cos(ang - 0.055 * j) * r, math.sin(ang - 0.055 * j) * r, z + 0.035 * j)) for j in range(7)]
        so.tube(tail, [0.17 * (1 - j / 7) ** 0.8 + 0.006 for j in range(7)],
                [lerp(SOUL, SOUL_DEEP, j / 7) for j in range(7)], sides=7, squash=0.6, mat=GLOW)
        for sx in (-1, 1):
            eye = c + Vector((-math.sin(ang) * 0.05 * sx, math.cos(ang) * 0.05 * sx, 0.03)) + Vector(
                (math.cos(ang), math.sin(ang), 0)) * 0.09
            so.blob(eye, (0.035, 0.035, 0.045), SOUL_DEEP, mat=GLOW, segments=6, rings=4)
    # --- the soul smoke the body dissolves into ------------------------------------------------
    sm = part('Smoke', 'Smoke', smooth=True)
    for k in range(9):
        a0 = math.tau * k / 9 + 0.3 * math.sin(k * 3.1)
        top = 2.25 - 0.12 * (k % 3)
        pts, sides_, widths, cols = [], [], [], []
        n = 16
        for i in range(n + 1):
            t = i / n
            z = top - t * (top - 0.08 - 0.05 * (k % 2))
            a = a0 + t * (2.6 + 0.3 * (k % 3))
            # hug the alb's funnel, a hand outside it
            prof = 0.2 + 0.78 * math.sin(math.pi * min(1.0, (z - 0.05) / 2.6)) ** 0.9
            rr = prof + 0.07 + 0.05 * math.sin(t * 9 + k)
            c = Vector((math.sin(a) * rr, -math.cos(a) * rr, z))
            pts.append(c)
            radial = Vector((math.sin(a), -math.cos(a), 0))
            tang = Vector((math.cos(a), math.sin(a), 0)) * rr * 2.8 + Vector((0, 0, -(top - 0.1)))
            side = tang.normalized().cross(radial).normalized()
            sides_.append(side)
            widths.append((0.34 * math.sin(math.pi * min(1.0, t * 1.25 + 0.08)) + 0.03) * (1 - 0.5 * t))
            cols.append(lerp(lerp(SMOKE, VEST, 0.3 * (1 - t)), SMOKE_DARK, t ** 1.4))
        ribbon(sm, pts, sides_, widths, cols, MEMBRANE, rag=0.35, seed=k)
    si = part('SmokeIn', 'SmokeIn', smooth=True)
    for k in range(4):
        a0 = math.tau * k / 4 + 0.4
        pts = []
        for i in range(10):
            t = i / 9
            a = a0 - t * 3.6
            r = 0.12 + 0.3 * math.sin(t * math.pi)
            pts.append(Vector((math.sin(a) * r, -math.cos(a) * r, 0.25 + t * 1.9)))
        si.tube(pts, [0.008 + 0.03 * math.sin(t * math.pi) for t in (i / 9 for i in range(10))], SOUL, mat=GLOW, sides=4)
    return parts


def build_membranes():
    mems = []
    # The alb: from the waist it flares, then twists in to the smoke's point, torn to rags.
    skirt = Membrane('Alb', ALB, seed=17)
    spars = []
    for k in range(SKIRT):
        st = skirt_spar(k)
        a0, a1 = Vector(st[0]), Vector(st[1])
        b1, c1 = Vector(st[2]), Vector(st[3])
        spars.append([(tuple(a0), 'Hips'), (tuple(a0.lerp(a1, 0.5)), f'Skirt{k}a'), (tuple(a1), f'Skirt{k}a'),
                      (tuple(a1.lerp(b1, 0.5)), f'Skirt{k}b'), (tuple(b1), f'Skirt{k}b'),
                      (tuple(b1.lerp(c1, 0.5)), f'Skirt{k}c'), (tuple(c1), f'Skirt{k}c')])
    for k in range(SKIRT):
        skirt.panel(spars[k], spars[(k + 1) % SKIRT], rows=18, cols=6, scallop=0.05, tear=0.95, shade=0.95)
    # Darken toward the smoke: the lower rows fade from alb grey to smoke.
    zs = [co.z for co, _ in skirt.verts]
    for i, (co, _) in enumerate(skirt.verts):
        k = max(0.0, min(1.0, (2.2 - co.z) / 2.0))
        base = skirt.cols_rgb[i]
        skirt.cols_rgb[i] = lerp(base, lerp(SMOKE, SMOKE_DARK, k), k ** 0.8)
    del zs
    mems.append(skirt)
    # The chasuble: collar to hem over the shoulders, open over the ribs, torn at the hem.
    chas = Membrane('Chasuble', VEST, seed=23)
    cs = []
    for k in range(CHAS):
        th, st = chas_spar(k)
        sx = math.sin(th)
        mid_bone = f'Chas{k}a'
        if abs(sx) > 0.7:
            mid_bone = 'Arm.L' if sx > 0 else 'Arm.R'
        cs.append([(st[0], 'Neck'), (st[1], 'Chest'), (st[2], mid_bone), (st[3], f'Chas{k}b'), (st[4], f'Chas{k}c')])
    for k in range(CHAS - 1):
        chas.panel(cs[k], cs[k + 1], rows=18, cols=5, scallop=0.03, tear=0.7, shade=0.95, sag=0.04)
    # The orphrey: a gold band down the chasuble's back and along its hem.
    for i, (co, w) in enumerate(chas.verts):
        th = math.atan2(co.x, co.y + 0.001)
        if abs(th) < 0.1 and co.z < 3.7:
            chas.cols_rgb[i] = GOLD
        elif abs(th) < 0.16 and co.z < 3.7:
            chas.cols_rgb[i] = lerp(chas.cols_rgb[i], GOLD, 0.4)
        elif co.z < 1.6:
            chas.cols_rgb[i] = lerp(chas.cols_rgb[i], VEST_DARK, 0.35)
    mems.append(chas)
    return mems


# -------------------------------------------------------------------- posing
class RollRig(Rig):
    """The organic kit's Rig with a roll about each aimed bone's own axis
    (`rolls` {bone: degrees}): the staff has to keep its crest and blade facing
    the way the swing goes, which a bare aim cannot say."""

    def pose(self, aims=None, ik=None, turns=None, root=(0, 0, 0), rolls=None, scales=None, absolute=None):
        absolute = dict(absolute or {})
        aims = self._mirror({k: Vector(v) for k, v in (aims or {}).items()}, 'aim')
        turns = self._mirror(turns or {}, 'turns')
        rolls = dict(rolls or {})
        ik = dict(ik or {})
        for k, (u, lo, tgt, pole) in list(ik.items()):
            if u.endswith('.L') and (k[:-2] + '.R') not in ik and k.endswith('.L'):
                t = Vector(tgt)
                p = Vector(pole)
                ik[k[:-2] + '.R'] = (u[:-2] + '.R', lo[:-2] + '.R', (-t.x, t.y, t.z), (-p.x, p.y, p.z))
        ik_upper = {u: (lo, Vector(tgt), Vector(pole)) for u, lo, tgt, pole in ik.values()}
        delta, head, out = {}, {}, {}
        for name, parent, h, t in self.bones:
            rh, rt = self.rest[name]
            if parent:
                ph = self.rest[parent][0]
                head[name] = head[parent] + delta[parent] @ (rh - ph)
                dp = delta[parent]
            else:
                head[name] = rh + Vector(root)
                dp = Quaternion()
            if name in ik_upper:
                lo, tgt, pole = ik_upper[name]
                l1 = (rt - rh).length
                l2 = (self.rest[lo][1] - self.rest[lo][0]).length
                d1, d2 = two_bone(head[name], l1, l2, tgt, pole)
                aims[name] = d1
                aims[lo] = d2
            q = Quaternion()
            if name in absolute:
                q = dp.inverted() @ absolute[name]
            elif name in aims:
                r0 = (rt - rh).normalized()
                want = dp.inverted() @ aims[name].normalized()
                q = r0.rotation_difference(want)
                if name in rolls:
                    q = Quaternion(want, math.radians(rolls[name])) @ q
            for a, deg in turns.get(name, []):
                q = Quaternion(Vector(a) if not isinstance(a, str) else
                               {'x': Vector((1, 0, 0)), 'y': Vector((0, 1, 0)), 'z': Vector((0, 0, 1))}[a],
                               math.radians(deg)) @ q
            delta[name] = dp @ q
            rest_m = self.rest_matrix(name)
            out[name] = (rest_m.inverted() @ q.to_matrix() @ rest_m).to_quaternion()
        out['__root'] = Vector(root)
        out['__scale'] = dict(scales or {})
        out['__head'] = head
        out['__delta'] = delta
        return out


def key_pose(arm, pose, frame):
    scales = pose.get('__scale', {})
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        q = pose.get(pb.name)
        pb.rotation_quaternion = q if q is not None else (1, 0, 0, 0)
        pb.location = (0, 0, 0)
        s = scales.get(pb.name, 1.0)
        pb.scale = (s, s, s) if isinstance(s, (int, float)) else s
    rb = arm.pose.bones.get('Root')
    root = pose.get('__root')
    if rb is not None and root is not None:
        rb.location = rb.bone.matrix_local.to_3x3().inverted() @ root
    for pb in arm.pose.bones:
        pb.keyframe_insert('rotation_quaternion', frame=frame)
        pb.keyframe_insert('location', frame=frame)
        if pb.name not in FLICKER:
            pb.keyframe_insert('scale', frame=frame)


def _hash(i, j):
    x = math.sin(i * 12.9898 + j * 78.233) * 43758.5453
    return x - math.floor(x)


def clip(arm, name, keys, loop_clip=True, fire=None):
    """keys: [(frame, pose)]; `fire` [(frame, level)] drives the flames' and the
    soul fire's flicker size (1 = burning as at rest, 0 = snuffed)."""
    import bpy
    from creature_kit import _fcurves
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = act
    for frame, pose in keys:
        key_pose(arm, pose, frame)
    for fc in _fcurves(act):
        for kp in fc.keyframe_points:
            kp.interpolation = 'BEZIER'
            kp.easing = 'AUTO'
            kp.handle_left_type = 'AUTO_CLAMPED'
            kp.handle_right_type = 'AUTO_CLAMPED'
    # The flicker: the flames and the soul fire breathe on their own bones.
    start, end = keys[0][0], keys[-1][0]
    fire = fire or [(start, 1.0), (end, 1.0)]

    def level(f):
        for (fa, la), (fb, lb) in zip(fire, fire[1:]):
            if fa <= f <= fb:
                return la + (lb - la) * (f - fa) / max(1, fb - fa)
        return fire[-1][1] if f > fire[-1][0] else fire[0][1]

    seed = sum(ord(c) for c in name)
    for f in range(start, end + 1, 2):
        lv = level(f)
        last = f + 2 > end
        ff = start if (loop_clip and last) else f
        for bi, bname in enumerate(FLAMES + ['SoulFire']):
            pb = arm.pose.bones[bname]
            j = _hash(seed + bi * 7, ff)
            k = _hash(seed + bi * 13 + 3, ff)
            if bname == 'SoulFire':
                s = (0.9 + 0.22 * j) * lv
                pb.scale = (s * (0.95 + 0.1 * k), s * (0.95 + 0.1 * k), s * (0.88 + 0.3 * j))
            else:
                s = max(0.001, lv) * (0.82 + 0.3 * j)
                pb.scale = (s * (0.9 + 0.15 * k), s * (0.9 + 0.15 * k), s * (0.85 + 0.45 * j))
            pb.keyframe_insert('scale', frame=f)
        if last and f != end:
            for bname in FLAMES + ['SoulFire']:
                arm.pose.bones[bname].keyframe_insert('scale', frame=end)
    for fc in _fcurves(act):
        if '"Flame' in fc.data_path or '"SoulFire"' in fc.data_path:
            if fc.data_path.endswith('scale'):
                for kp in fc.keyframe_points:
                    kp.interpolation = 'LINEAR'
    return act


def make_clips(arm):
    rig = RollRig(BONES).attach(arm)
    P = rig.pose
    clips = []

    def add(name, keys, loop_clip=True, fire=None):
        clip(arm, name, keys, loop_clip, fire)
        clips.append(name)

    def norm(v):
        return Vector(v).normalized()

    head_rest = (REST['Head'][1] - REST['Head'][0]).normalized()
    neck_rest = (REST['Neck'][1] - REST['Neck'][0]).normalized()

    def stance(root=(0, 0, 0), lean=0.0, twist=0.0, look=(0, -1, 0.0), staff=(0.1, -0.14, 1.0),
               wrist=(-1.08, -0.66, 2.25), roll=0.0, left=None, both=False, grip2=1.3, left_pole=(1.2, 0.4, -0.4),
               right_pole=(-1.2, 0.6, -0.3), flutter=0.0, stream=0.0, splay=0.0, cape=0.0, jaw=6.0, souls=0.0,
               souls_ring=1.0, swirl=0.0, bell=(0.0, 0.0), blade=(0.0, 0.0), book=None,
               book_sway=(0.0, 0.0), lid=0.0, tilt=0.0, crumple=0.0):
        """`staff` is the shaft's direction (armature space), `wrist` the right
        wrist; with `both` the left hand grips the shaft `grip2` up from the right.
        `blade` (b1, b2): 0 folded into the crest, 1 out as the scythe. `book`
        None hangs it from the chain; a point floats it there, open by `lid`."""
        d = norm(staff)
        side = Vector((1, 0, 0))
        hand_r = side.cross(d).normalized() * -1.0
        if hand_r.length < 1e-3:
            hand_r = Vector((0, -1, 0))
        rootv = Vector(root)
        w_r = Vector(wrist) + rootv
        grip_r = w_r + hand_r * 0.26
        if both:
            grip_l = grip_r + d * grip2
            hand_l = hand_r
            w_l = grip_l - hand_l * 0.26
        else:
            w_l = Vector(left if left is not None else (1.18, -0.72, 2.25)) + rootv
            hand_l = norm((0.2, -0.7, 0.35)) if book is not None else norm((0.15, -0.55, -0.8))
        head_dir = head_rest + Vector((look[0], 0.0, look[2] * 1.2))
        neck_dir = neck_rest + Vector((look[0] * 0.3, 0.0, look[2] * 0.3))
        aims = {
            'Spine': (0, -0.07 - lean * 0.6, 1.0),
            'Chest': (twist * 0.4, -0.08 - lean, 1.0),
            'Neck': tuple(neck_dir),
            'Head': tuple(head_dir),
            'Hand.R': tuple(hand_r),
            'Hand.L': tuple(hand_l),
            'Staff': tuple(d),
            'Souls': (0.0, 0.0, 1.0),
            'Smoke': (0.25 * stream * 0.0, 0.35 * stream, 1.0),
            'SmokeIn': (0.0, 0.3 * stream, 1.0),
        }
        rolls = {'Staff': roll}
        # The book: hanging from the wrist, swinging; or floated up open over the hand.
        absolute = {}
        if book is None:
            bx, by = book_sway
            dn = norm((0.1 * math.sin(math.radians(bx)) + 0.02, 0.35 * math.sin(math.radians(by)) + 0.1 * stream, -1.0))
            aims['Chain1'] = tuple(dn)
            aims['Chain2'] = tuple(norm(dn + Vector((0.05 * math.sin(math.radians(bx)), 0.05 * stream, 0))))
            aims['Book'] = tuple(norm(dn + Vector((0.08 * math.sin(math.radians(bx)), 0.08 * stream, 0))))
        else:
            bx, by = book_sway
            aims['Chain1'] = tuple(norm((0.05 + 0.05 * math.sin(math.radians(bx)), -0.2, 1.0)))
            aims['Chain2'] = tuple(norm((0.0, -0.3 + 0.05 * math.sin(math.radians(by)), 1.0)))
            absolute['Book'] = Quaternion(Vector((0, 0, 1)), math.radians(book_sway[0] * 0.3)) @ BOOK_OPEN
        turns = {
            'Jaw': [('x', jaw)],
            'Souls': [('z', souls)],
            'Smoke': [('z', swirl)],
            'SmokeIn': [('z', -swirl * 1.4)],
            'Root': [('x', tilt)],
            'Bell': [('x', bell[0]), ('y', bell[1])],
            'Blade1': [('x', -100.0 * (1 - blade[0]))],
            'Blade2': [('x', 172.0 * (1 - blade[1]))],
            'BookLid': [('y', -lid * 165.0)],
        }
        for k in range(SKIRT):
            a = math.tau * k / SKIRT
            fwd = -math.cos(a)
            ph = flutter + k * 0.9
            ax = (math.cos(a), math.sin(a), 0)
            sw = 4.0 * math.sin(ph) + stream * 12.0 * fwd + splay * 18.0 + crumple * 30
            turns[f'Skirt{k}a'] = [(ax, sw * 0.5 + splay * 8)]
            turns[f'Skirt{k}b'] = [(ax, sw * 0.7 + 3.0 * math.sin(ph * 1.3) - crumple * 20), ('z', 6 * math.sin(ph + swirl * 0.02))]
            turns[f'Skirt{k}c'] = [(ax, sw * 0.9 + 5.0 * math.sin(ph * 1.7) - crumple * 25),
                                   ('z', 14 * math.sin(ph * 0.8) + swirl * 0.1)]
        for k in range(CHAS):
            th, _ = chas_spar(k)
            ph = flutter * 1.2 + k * 1.1
            back = max(0.0, math.cos(th))
            ax = (math.cos(th), -math.sin(th), 0)
            lift = cape + stream * 0.9
            turns[f'Chas{k}a'] = [(ax, -3 * lift * back - 1.5 * math.sin(ph) - splay * 6 - crumple * 10)]
            turns[f'Chas{k}b'] = [(ax, -8 * lift * back - 3 * math.sin(ph + 0.6) - splay * 8 + crumple * 25)]
            turns[f'Chas{k}c'] = [(ax, -12 * lift * back - 5 * math.sin(ph + 1.2) - splay * 10 + crumple * 30)]
        ik = {
            'arm.R': ('Arm.R', 'Fore.R', tuple(w_r), right_pole),
            'arm.L': ('Arm.L', 'Fore.L', tuple(w_l), left_pole),
        }
        return P(aims=aims, ik=ik, turns=turns, root=root, rolls=rolls,
                 scales={'Souls': souls_ring, 'Blade1': 0.42 + 0.58 * min(1.0, blade[0])},
                 absolute=absolute)

    # ------------------------------------------------------------ the two stances
    def rest(ph, scythe, **kw):
        """The standing hover at phase `ph` (radians) in either stance."""
        base = dict(root=(0, 0, 0.1 * math.sin(ph)), flutter=ph, souls=math.degrees(ph) / 4, swirl=math.degrees(ph) / 4,
                    look=(0.06 * math.sin(ph * 0.5), -1, 0.05), jaw=5 + 3 * math.sin(ph * 2),
                    bell=(7 * math.sin(ph + 0.8), 4 * math.sin(ph * 0.5)), book_sway=(6 * math.sin(ph + 1.4), 5 * math.sin(ph)))
        if scythe:
            base.update(staff=(-0.06, -0.32, 1.0), wrist=(-1.2, -0.85, 2.6), roll=-35.0, blade=(1.0, 1.0), lean=0.08,
                        look=(0.08 * math.sin(ph * 0.5), -1, 0.0))
        base.update(kw)
        return stance(**base)

    for scythe, pre in ((False, ''), (True, 'Scythe')):
        # Idle: the souls and the smoke make a full turn over the loop, keyed as eighths.
        keys = []
        for i in range(8):
            ph = math.tau * i / 8
            keys.append((1 + i * 8, rest(ph, scythe, souls=45 * i, swirl=45 * i)))
        keys.append((65, rest(0.0, scythe, souls=360 - 1e-3, swirl=360 - 1e-3)))
        add(pre + 'Idle' if pre else 'Idle', keys)
        glide = dict(lean=0.35, stream=0.8, look=(0, -1, -0.05))
        if scythe:
            glide.update(staff=(0.55, 0.35, 0.8), wrist=(-1.0, -0.4, 2.7), roll=-10.0)
        else:
            glide.update(staff=(0.25, -0.5, 1.0), wrist=(-1.1, -0.9, 2.5))
        add(pre + 'Walk' if pre else 'Walk',
            [(1 + i * 8, rest(i * math.pi / 2, scythe, root=(0, 0, 0.1 * math.sin(i * math.pi / 2)), flutter=i * 1.6,
                              souls=22.5 * i, swirl=30 * i, book_sway=(4 * math.sin(i * 1.6), 25), **glide)) for i in range(4)]
            + [(33, rest(0, scythe, root=(0, 0, 0), flutter=6.4, souls=90 - 1e-3, swirl=120, book_sway=(0, 25), **glide))])
        run = dict(lean=0.6, stream=1.2, look=(0, -1, -0.15), cape=0.6)
        if scythe:
            run.update(staff=(0.5, 0.75, 0.45), wrist=(-0.95, -0.2, 2.8), roll=-10.0)
        else:
            run.update(staff=(0.35, 0.65, 0.7), wrist=(-1.0, -0.3, 2.7))
        add(pre + 'Run' if pre else 'Run',
            [(1 + i * 5, rest(i * math.pi / 2, scythe, root=(0, 0, 0.14 * math.sin(i * math.pi / 2)), flutter=i * 2.2,
                              souls=22.5 * i, swirl=40 * i, book_sway=(6 * math.sin(i * 2.2), 45), **run)) for i in range(4)]
            + [(21, rest(0, scythe, flutter=8.8, souls=90 - 1e-3, swirl=160, book_sway=(0, 45), **run))])
        ready = rest(0.0, scythe)
        # Hit: a recoil, the mitre thrown back, the bell and book jolted.
        add(pre + 'Hit' if pre else 'Hit',
            [(1, ready), (4, rest(0.6, scythe, root=(0, 0.35, 0.15), lean=-0.35, look=(0.25, -0.8, 0.35), jaw=24, cape=0.4,
                                  bell=(-25, 10), book_sway=(20, -30))), (14, ready)], loop_clip=False)
        # Death: the fire flares, he is thrown back, then the vestments fold empty to the floor.
        heap_staff = (0.95, -0.25, -0.12)
        jolt = rest(0.3, scythe, root=(0, 0.2, 0.25), lean=-0.45, look=(0, -0.6, 0.8), jaw=55, cape=0.9, splay=0.4,
                    left=(1.6, -0.6, 3.6), bell=(-30, 0), book_sway=(-25, -30))
        sag = rest(0.6, scythe, root=(0, 0.1, -0.7), lean=0.7, look=(0.2, -1, -0.8), jaw=40, splay=0.6, crumple=0.3,
                   staff=(0.7, -0.5, 0.4), wrist=(-0.6, -1.2, 2.2), book_sway=(10, 20))
        heap = rest(0.9, scythe, root=(0, 0.3, -2.25), lean=0.95, look=(0.3, -0.7, -0.9), jaw=46, splay=1.0, crumple=1.0,
                    cape=-0.3, staff=heap_staff, wrist=(-0.3, -1.5, 2.4), left=(1.1, -1.3, 2.5), tilt=-6,
                    souls_ring=0.02, bell=(40, 0), book_sway=(60, 30))
        add(pre + 'Death' if pre else 'Death',
            [(1, ready), (7, jolt), (18, sag), (32, heap), (60, heap)], loop_clip=False,
            fire=[(1, 1.0), (7, 2.0), (18, 1.2), (32, 0.4), (48, 0.02), (60, 0.0)])
        # The generic cast / the proclamation: reading the names.
        read_kw = dict(book=True, lid=1.0, left=(0.8, -1.05, 2.95), left_pole=(1.2, 0.5, -0.5),
                       look=(0.2, -1, -0.3), splay=0.3, cape=0.3, souls_ring=1.25)
        if scythe:
            read_kw.update(staff=(0.25, -0.1, 1.0), wrist=(-1.0, -0.6, 3.3), blade=(1.0, 1.0), roll=-20.0)
        else:
            read_kw.update(staff=(0.12, -0.2, 1.0), wrist=(-1.05, -0.7, 3.4))
        summon = []
        for i in range(6):
            ph = math.tau * i / 6
            summon.append((1 + i * 8, stance(root=(0, 0, 0.18 + 0.06 * math.sin(ph)), flutter=ph * 1.5, souls=90 * i,
                                             swirl=60 * i, jaw=10 + 22 * abs(math.sin(ph * 1.5)),
                                             bell=(10 * math.sin(ph * 2), 6 * math.cos(ph)), **read_kw)))
        summon.append((49, stance(root=(0, 0, 0.18), flutter=math.tau * 1.5, souls=540 - 1e-3, swirl=360 - 1e-3, jaw=10,
                                  bell=(0, 6), **read_kw)))
        add(pre + 'Summon' if scythe else 'SummonSouls', summon, fire=[(1, 1.3), (25, 1.5), (49, 1.3)])
        # The pulse: the staff thrust high, the bell tolling hard.
        if scythe:
            hi = dict(staff=(0.2, 0.1, 1.0), wrist=(-0.85, -0.55, 4.35), blade=(1.0, 1.0), roll=-20.0)
        else:
            hi = dict(staff=(0.05, -0.05, 1.0), wrist=(-0.9, -0.6, 4.45))
        toll = [(1, ready)]
        for i, (f, b) in enumerate(((5, 45), (9, -40), (13, 34), (17, -26), (22, 18), (28, -10))):
            toll.append((f, stance(root=(0, 0, 0.25), lean=-0.2, look=(0, -1, 0.35), jaw=45 - i * 5, splay=0.9 - i * 0.12,
                                   cape=0.7, souls=30 * f, souls_ring=1.6 - i * 0.08, swirl=20 * f, bell=(b, 0),
                                   left=(1.7, -0.9, 3.4), flutter=f * 0.3, **hi)))
        toll.append((40, ready))
        add('ScytheToll' if scythe else 'BellToll', toll, loop_clip=False, fire=[(1, 1), (5, 1.9), (20, 1.3), (40, 1)])

    # ---------------------------------------------------------------- staff strikes
    ready = rest(0.0, False)
    wind = stance(lean=-0.25, twist=-0.3, staff=(-0.1, 0.75, 0.65), wrist=(-0.95, -0.2, 4.3), look=(0, -1, 0.25), jaw=18,
                  left=(1.5, -0.6, 3.2), bell=(-35, 0), cape=0.3, flutter=1.0)
    smash = stance(lean=0.55, twist=0.15, staff=(0.05, -0.95, 0.25), wrist=(-0.65, -1.45, 3.0), look=(0, -1, -0.3),
                   jaw=34, stream=0.4, bell=(60, 0), book_sway=(20, -35), flutter=2.0)
    add('StaffStrike', [(1, ready), (10, wind), (14, smash), (18, smash), (30, ready)], loop_clip=False)
    back = stance(both=True, twist=-0.95, lean=-0.1, staff=(-0.95, 0.2, 0.3), wrist=(-1.3, 0.1, 3.3), grip2=1.1,
                  look=(-0.35, -1, 0.1), jaw=14, bell=(0, -30), flutter=1.0)
    bash = stance(both=True, twist=0.9, lean=0.3, staff=(0.95, -0.35, 0.15), wrist=(-0.3, -1.4, 3.1), grip2=1.1,
                  look=(0.35, -1, 0.0), jaw=30, bell=(0, 55), stream=0.4, flutter=2.4, book_sway=(30, -20))
    add('StaffStrike2', [(1, ready), (9, back), (13, bash), (17, bash), (30, ready)], loop_clip=False)

    # ------------------------------------------------------------------- the rise
    curl = dict(lean=0.55, look=(0, -1, -0.9), jaw=2, staff=(-0.3, -0.3, 1.0), wrist=(-0.45, -0.8, 3.1), roll=0.0,
                left=(0.35, -0.75, 3.2), left_pole=(1.0, 0.2, -0.5), splay=-0.4, cape=-0.2, souls_ring=0.35,
                book_sway=(0, 10))
    spread = dict(lean=-0.3, look=(0, -1, 0.55), jaw=38, staff=(0.1, 0.0, 1.0), wrist=(-1.8, -0.5, 4.4),
                  left=(1.95, -0.4, 4.2), left_pole=(1.2, 0.6, -0.2), splay=1.0, cape=1.0, souls_ring=1.5, bell=(15, 0),
                  book_sway=(25, 10))
    add('Rise', [(1, stance(flutter=0.0, souls=0, swirl=0, **curl)),
                 (40, stance(flutter=1.5, souls=90, swirl=120, **curl)),
                 (70, stance(flutter=3.0, souls=180, swirl=240, lean=0.2, look=(0, -1, -0.3), jaw=12,
                             staff=(-0.1, -0.2, 1.0), wrist=(-1.0, -0.8, 3.5), left=(1.1, -0.9, 3.3), splay=0.3, cape=0.3,
                             souls_ring=0.8, bell=(-12, 0))),
                 (100, stance(flutter=4.5, souls=270, swirl=360, **spread)),
                 (125, stance(flutter=6.0, souls=360, swirl=480, jaw=46, **{k: v for k, v in spread.items() if k != 'jaw'})),
                 # it ends where the proclamation begins: the book lifted open, the staff high
                 (145, stance(root=(0, 0, 0.18), flutter=7.2, souls=450, swirl=600, jaw=10, book=True, lid=1.0,
                              left=(0.8, -1.05, 2.95), left_pole=(1.2, 0.5, -0.5), look=(0.2, -1, -0.3), splay=0.3,
                              cape=0.3, souls_ring=1.25, staff=(0.12, -0.2, 1.0), wrist=(-1.05, -0.7, 3.4)))],
        loop_clip=False, fire=[(1, 0.3), (40, 0.6), (100, 1.6), (145, 1.4)])

    # -------------------------------------------------------------- the shield ritual
    ward = dict(both=True, staff=(1.0, -0.05, 0.08), wrist=(-0.75, -1.0, 3.3), grip2=1.5, roll=90.0, look=(0, -1, -0.35),
                splay=0.5, cape=0.4, souls_ring=1.7, left_pole=(1.2, 0.3, -0.6))
    wk = []
    for i in range(6):
        ph = math.tau * i / 6
        wk.append((1 + i * 8, stance(root=(0, 0, 0.12 * math.sin(ph)), flutter=ph, souls=60 * i, swirl=45 * i,
                                     jaw=8 + 12 * abs(math.sin(ph)), bell=(8 * math.sin(ph), 0), **ward)))
    wk.append((49, stance(root=(0, 0, 0), flutter=math.tau, souls=360 - 1e-3, swirl=270, jaw=8, bell=(0, 0), **ward)))
    add('ShieldRitual', wk, fire=[(1, 1.2), (25, 1.4), (49, 1.2)])

    # ------------------------------------------------------------------ the transform
    s_ready = rest(0.0, True)
    lift = dict(both=True, staff=(0.0, -0.1, 1.0), wrist=(-0.35, -1.0, 3.0), grip2=1.0, look=(0, -1, 0.6), splay=0.4,
                cape=0.4, left_pole=(1.2, 0.3, -0.5), right_pole=(-1.2, 0.3, -0.5))
    trans = [(1, ready),
             (9, stance(jaw=20, souls=40, swirl=40, bell=(10, 0), **lift)),
             (15, stance(jaw=30, souls=80, swirl=80, bell=(-25, 10), blade=(0.25, 0.0), **lift)),
             (21, stance(jaw=40, souls=120, swirl=120, bell=(35, -10), blade=(1.08, 0.0), **lift)),
             (25, stance(jaw=48, souls=160, swirl=160, bell=(-30, 5), blade=(1.0, 1.1), **lift)),
             (29, stance(jaw=50, souls=200, swirl=200, bell=(20, 0), blade=(1.0, 1.0), **lift))]
    # the whirl overhead: the scythe carried round a full turn in the right hand
    for j, f in enumerate((33, 37, 41, 45, 49)):
        a = math.radians(-90 + 90 * j)
        trans.append((f, stance(staff=(math.cos(a), math.sin(a), 0.18), wrist=(-0.55, -0.45, 4.55), roll=-90.0 + 90 * j,
                                look=(0, -1, 0.5), jaw=55, splay=1.0, cape=0.9, souls=240 + 40 * j, souls_ring=1.9,
                                swirl=240 + 60 * j, bell=(30 * (-1) ** j, 0), blade=(1.0, 1.0), left=(1.7, -0.7, 3.6),
                                flutter=2 + j)))
    trans.append((54, stance(both=True, lean=0.35, twist=0.5, staff=(0.9, -0.4, -0.1), wrist=(-0.25, -1.5, 3.0), grip2=1.2,
                             roll=-80.0, look=(0.3, -1, -0.1), jaw=40, splay=0.6, stream=0.4, souls=460, swirl=520,
                             bell=(0, 40), blade=(1.0, 1.0), flutter=7)))
    trans.append((64, s_ready))
    add('Transform', trans, loop_clip=False, fire=[(1, 1.0), (15, 1.4), (25, 2.4), (45, 1.9), (64, 1.3)])

    # ------------------------------------------------------------------ scythe sweeps
    s_wind = stance(both=True, twist=-1.0, lean=-0.1, staff=(-0.9, 0.5, 0.3), wrist=(-1.35, 0.3, 3.8), grip2=1.25,
                    roll=-60.0, look=(-0.3, -1, 0.1), jaw=16, blade=(1.0, 1.0), flutter=1.0, stream=0.2, bell=(0, -20))
    s_cut = stance(both=True, twist=0.85, lean=0.3, staff=(0.95, -0.3, 0.02), wrist=(-0.15, -1.6, 3.2), grip2=1.25,
                   roll=-90.0, look=(0.3, -1, 0.0), jaw=32, blade=(1.0, 1.0), flutter=2.0, stream=0.5, bell=(0, 40),
                   book_sway=(35, -25))
    s_follow = stance(both=True, twist=1.05, lean=0.2, staff=(0.55, 0.65, -0.1), wrist=(0.55, -1.0, 3.0), grip2=1.25,
                      roll=-100.0, look=(0.4, -1, -0.05), jaw=18, blade=(1.0, 1.0), flutter=2.6, stream=0.3, bell=(0, 25))
    add('ScytheSweep', [(1, s_ready), (9, s_wind), (13, s_cut), (16, s_follow), (30, s_ready)], loop_clip=False)
    s_raise = stance(both=True, lean=-0.35, twist=-0.4, staff=(-0.35, 0.75, 0.55), wrist=(-0.9, -0.1, 4.7), grip2=1.2,
                     roll=-30.0, look=(0, -1, 0.35), jaw=22, blade=(1.0, 1.0), cape=0.3, flutter=1.0, bell=(-30, 0))
    s_chop = stance(both=True, lean=0.6, twist=0.45, staff=(0.4, -0.9, 0.15), wrist=(-0.4, -1.5, 3.0), grip2=1.2,
                    roll=-40.0, look=(0.15, -1, -0.3), jaw=36, blade=(1.0, 1.0), flutter=2.2, stream=0.4, bell=(45, 0),
                    book_sway=(25, -35))
    add('ScytheSweep2', [(1, s_ready), (11, s_raise), (15, s_chop), (19, s_chop), (32, s_ready)], loop_clip=False)
    return clips


if __name__ == '__main__':
    import bpy
    argv = sys.argv[sys.argv.index('--') + 1:]
    out = argv[0]
    fast = '--fast' in argv
    new_scene()
    mats = make_materials('bone', membrane_kind='cloth')
    metal = bpy.data.materials.new('CreatureMetal')
    metal.use_nodes = True
    metal.use_backface_culling = True
    _procedural_surface(metal, 'bone')
    mats.append(metal)
    parts = build_parts()
    mems = build_membranes()
    objects = [pt.to_object(mats) for pt in parts] + [m.to_object(mats) for m in mems]
    body = join(objects, 'MorthenLich')
    print('TRIANGLES', triangles(body))
    bake_surface(body, size=512 if fast else 2048, samples=16 if fast else 40)
    # The metal keeps its shine: gold, iron and bronze read as metal, not cloth.
    nt = metal.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Metallic'].default_value = 0.6
    bsdf.inputs['Roughness'].default_value = 0.45
    arm = build_armature('MorthenLich', BONES)
    bind(body, arm)
    clips = make_clips(arm)
    arm.animation_data.action = bpy.data.actions['Idle']
    bpy.context.scene.frame_set(1)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg)
    zs = [(ev.matrix_world @ v.co).z for v in ev.data.vertices]
    print('IDLE_HEIGHT', round(max(zs) - min(zs), 3), 'MINZ', round(min(zs), 3), 'MAXZ', round(max(zs), 3))
    for pb in arm.pose.bones:
        pb.scale = (1, 1, 1)
    export(out, arm)
    if '--sheet' in argv:
        setup_preview((0, -0.4, 3.1), 11, ref_x=3.4)
        render_sheet(arm, clips, argv[argv.index('--sheet') + 1], 'morthen', frames_per_clip=5)
    if '--blend' in argv:
        arm.animation_data.action = bpy.data.actions['Idle']
        bpy.ops.wm.save_as_mainfile(filepath=argv[argv.index('--blend') + 1])
        print('SAVED')
