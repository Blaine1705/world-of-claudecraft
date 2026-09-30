"""The Gaol Turnkey: the Sunken Bastion's drowned jailer and the gaol's miniboss
(src/sim/encounters/sunken_bastion: the Iron Cage, Open the Cells).

  blender -b --factory-startup --python turnkey.py -- <out.glb> [--sheet dir] [--blend out.blend] [--fast]

A hulking, waterlogged gaoler the tide left in its own cells: a vast bloated
belly straining a rotted linen shirt, a torn leather apron riveted and stained,
a stud-riveted jerkin over great sloped shoulders crusted with barnacles and
weed, arms like mooring posts ending in swollen fists. Its small head sits sunk
forward between its shoulders inside a rusted iron collar, the broken chain it
drowned on still hanging from it; one eye swollen shut, the other lit with sea
light, a heavy underbite of broken teeth, a leather jailer's cap. From its right
fist a great ring of rusted keys swings on a chain; from its left a storm
lantern burns with sea light; pairs of open shackles hang from its belt.
Stumpy legs in cracked sea boots.

Built on the organic kit (hollow_crypt_creatures/organic_kit.py) like the
reaper: smooth parts bound one bone each, the apron's torn skirt as a membrane
on its own spars, a Cycles bake of a drowned-skin and leather surface with its
ambient occlusion, a rusted-iron metal material for the collar, keys, lantern,
rivets and shackles, the eye and the lantern's light on the glow material (the
lantern flame flickers on a keyed bone scale, build_morthen.clip).

Scale (yards; a player stands about 2.6): about 6.2 to the cap at rest; the game
draws it at its template's 1.3, some 8 yards: three players tall.

Clips (24 fps), the names its VISUALS row already maps:
  Idle          the belly heaving, keys jingling, the lantern swaying.
  Walk, Run     a heavy, rolling waddle, keys and lantern swinging.
  KeySwing      the key ring whirled overhead on its chain and brought down.
  ChainLash     the chain lashed flat across its front, keys at full reach.
  LanternRaise  Open the Cells: the lantern thrust high (its top at frame 9,
                where the lantern flare lights), the keys rattled, a bellow.
  Cast          the rattle, held.
  Hit, Death    a lurch back; it drops to its knees and falls on its face.
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(HERE, '..', 'hollow_crypt_creatures')))
from mathutils import Vector  # noqa: E402
from build_morthen import RollRig, clip  # noqa: E402
from organic_kit import (  # noqa: E402
    GLOW, MEMBRANE, Membrane, Part, _procedural_surface, bake_surface, bind, build_armature, export,
    expand_bones, join, make_materials, new_scene, render_sheet, setup_preview, triangles,
)

METAL = 3

SKIN = (0.62, 0.72, 0.64)        # drowned fish-belly pale, green-grey
SKIN_D = (0.42, 0.52, 0.47)
BRUISE = (0.44, 0.38, 0.52)
SOCKET = (0.05, 0.07, 0.07)
SEA = (0.45, 1.0, 0.82)
SEA_HOT = (0.88, 1.0, 0.95)
SHIRT = (0.66, 0.62, 0.5)
SHIRT_D = (0.45, 0.42, 0.33)
APRON = (0.5, 0.32, 0.18)
APRON_D = (0.3, 0.18, 0.1)
JERKIN = (0.44, 0.31, 0.2)
TROUSER = (0.24, 0.23, 0.22)
BOOT = (0.18, 0.12, 0.08)
RUST = (0.55, 0.3, 0.16)
RUST_D = (0.3, 0.16, 0.09)
BRASS = (0.74, 0.58, 0.3)
BARNACLE = (0.78, 0.76, 0.68)
BARNACLE_D = (0.46, 0.44, 0.4)
KELP = (0.2, 0.34, 0.18)
KELP_D = (0.12, 0.2, 0.1)
TOOTH = (0.78, 0.74, 0.55)
MOUTH = (0.16, 0.06, 0.07)
LAMP = (1.0, 0.78, 0.4)

KEY_RING = 0.36                  # the key ring's radius
APRON_SPARS = 7

BONES = expand_bones([
    ('Root', None, (0, 0, 0), (0, 0, 0.5)),
    ('Hips', 'Root', (0, 0, 2.2), (0, 0, 2.7)),
    ('Belly', 'Hips', (0, -0.3, 2.9), (0, -0.9, 2.9)),
    ('Spine', 'Hips', (0, 0, 2.7), (0, -0.08, 3.5)),
    ('Chest', 'Spine', (0, -0.08, 3.5), (0, 0.0, 4.4)),
    ('Neck', 'Chest', (0, -0.25, 4.45), (0, -0.55, 4.8)),
    ('Head', 'Neck', (0, -0.55, 4.8), (0, -0.7, 5.6)),
    ('Jaw', 'Head', (0, -0.8, 4.98), (0, -1.22, 4.86)),
    ('CollarChain', 'Chest', (0.1, -0.78, 4.42), (0.12, -0.9, 3.82)),
    ('Arm.L', 'Chest', (1.25, 0.0, 4.3), (1.6, -0.05, 3.2)),
    ('Fore.L', 'Arm.L', (1.6, -0.05, 3.2), (1.72, -0.3, 2.12)),
    ('Hand.L', 'Fore.L', (1.72, -0.3, 2.12), (1.74, -0.42, 1.68)),
    ('Thigh.L', 'Hips', (0.58, 0.0, 2.2), (0.62, 0.0, 1.22)),
    ('Shin.L', 'Thigh.L', (0.62, 0.0, 1.22), (0.62, 0.06, 0.34)),
    ('Foot.L', 'Shin.L', (0.62, 0.06, 0.34), (0.62, -0.55, 0.1)),
    ('Shackle.L', 'Hips', (1.02, -0.42, 2.3), (1.06, -0.46, 1.76)),
    ('Apron', 'Hips', (0, -1.12, 2.45), (0, -1.2, 1.35)),
    ('KeyChain', 'Hand.R', (-1.74, -0.42, 1.68), (-1.74, -0.42, 1.44)),
    ('Keys', 'KeyChain', (-1.74, -0.42, 1.44), (-1.74, -0.42, 0.98)),
    ('Lantern', 'Hand.L', (1.74, -0.42, 1.68), (1.74, -0.42, 1.26)),
    ('LampFlame', 'Lantern', (1.74, -0.42, 1.0), (1.74, -0.42, 1.2)),
])
REST = {n: (Vector(h), Vector(t)) for n, _, h, t in BONES}


def lerp(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def mirror(v, s):
    return Vector((s * v.x, v.y, v.z))


def barnacles(p, center, radius, n, seed, normal=(0, 0, 1)):
    """A crust of barnacle cones about `center`, open mouths out."""
    import random
    rng = random.Random(seed)
    nv = Vector(normal).normalized()
    t1 = nv.orthogonal().normalized()
    t2 = nv.cross(t1).normalized()
    for _ in range(n):
        a = rng.random() * math.tau
        r = radius * math.sqrt(rng.random())
        c = Vector(center) + (t1 * math.cos(a) + t2 * math.sin(a)) * r
        s = 0.035 + 0.05 * rng.random()
        p.prism(tuple(c), 6, s, s * 0.45, s * 1.1, lerp(BARNACLE, BARNACLE_D, rng.random()), axis=tuple(nv))
        p.blob(tuple(c + nv * s * 1.1), (s * 0.5, s * 0.5, s * 0.2), SOCKET, segments=6, rings=3)


def kelp(p, top, length, seed, sway=(0.0, 0.0)):
    top = Vector(top)
    pts = [top + Vector((sway[0] * t + 0.04 * math.sin(t * 7 + seed), sway[1] * t, -length * t))
           for t in (i / 6 for i in range(7))]
    p.tube(pts, [0.05, 0.05, 0.045, 0.04, 0.03, 0.02, 0.006], [KELP, KELP, KELP_D, KELP, KELP_D, KELP_D, KELP_D],
           sides=5, squash=0.35, mat=MEMBRANE)


def key(p, top, angle, length, color):
    """A great iron key hanging from the ring: bow, shank, bit."""
    d = Vector((math.cos(angle) * 0.3, math.sin(angle) * 0.1, -1)).normalized()
    t = Vector(top)
    side = Vector((1, 0, 0))
    bow = [t + side * 0.07 * math.cos(u) + d * 0.07 * (1 + math.sin(u)) for u in (i * math.tau / 10 for i in range(11))]
    p.tube(bow, [0.02] * 11, color, sides=5, cap=False, mat=METAL)
    a = t + d * 0.14
    b = a + d * length
    p.tube([a, a.lerp(b, 0.5), b], [0.028, 0.024, 0.024], color, sides=6, mat=METAL)
    p.box(tuple(b - d * 0.06 + side * 0.06), (0.1, 0.035, 0.08), color, bevel=0.01, mat=METAL)
    p.box(tuple(b - d * 0.16 + side * 0.05), (0.08, 0.035, 0.04), color, bevel=0.008, mat=METAL)


def rivets(p, pts, r=0.028, color=BRASS):
    for c in pts:
        p.blob(tuple(c), (r * 2, r * 2, r * 1.2), color, segments=6, rings=4, mat=METAL)


def chain_links(p, a, b, n, color, r=0.018, size=0.05):
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    for i in range(n):
        c = a.lerp(b, (i + 0.5) / n)
        side = Vector((1, 0, 0)) if i % 2 == 0 else Vector((0, 1, 0))
        link = [c + d * size * math.cos(t) + side * size * 0.65 * math.sin(t) for t in
                (j * math.tau / 10 for j in range(11))]
        p.tube(link, [r] * 11, color if i % 2 else RUST_D, sides=5, cap=False, mat=METAL)


def build_parts():
    parts = []

    def part(name, bone, **kw):
        pt = Part(name, bone, **kw)
        parts.append(pt)
        return pt

    # --- the bloated belly (its own bone: it heaves) under a rotted shirt ----------------
    belly = part('Belly', 'Belly')
    belly.blob((0, -0.42, 2.85), (1.95, 1.75, 1.55), SHIRT, segments=36, rings=24)
    belly.blob((0, -0.9, 2.62), (1.0, 0.7, 0.8), SHIRT_D, segments=16, rings=10)
    for i in range(5):
        z = 3.4 - i * 0.17
        belly.blob((0.02, -1.12 - 0.12 * math.sin(i / 4 * math.pi), z), (0.05, 0.03, 0.05), BARNACLE_D,
                   segments=6, rings=4)
    for (x, z, w) in ((0.45, 2.55, 0.32), (-0.55, 2.95, 0.26), (0.2, 3.25, 0.2)):
        belly.blob((x, -1.2 + abs(x) * 0.25, z), (w, 0.08, w * 0.6), SKIN_D, segments=10, rings=6)
        belly.blob((x, -1.24 + abs(x) * 0.25, z), (w * 0.7, 0.05, w * 0.35), BRUISE, segments=8, rings=5)
    # --- the chest, the jerkin and the great sloped shoulders ----------------------------
    chest = part('Chest', 'Chest')
    chest.loft([
        ((0, -0.1, 3.4), 1.0, 0.8, 2.4, (0, 0, 1)),
        ((0, -0.08, 3.9), 1.28, 0.88, 2.6, (0, 0, 1)),
        ((0, -0.02, 4.3), 1.4, 0.82, 2.8, (0, 0, 1)),
        ((0, 0.0, 4.55), 0.9, 0.6, 2.4, (0, 0, 1)),
    ], JERKIN, sides=20)
    chest.blob((0, -0.72, 4.05), (0.62, 0.3, 0.55), SHIRT, segments=12, rings=8)
    for i in range(5):
        z = 3.6 + i * 0.16
        for s in (-1, 1):
            chest.blob((s * 0.3, -0.84, z), (0.05, 0.03, 0.05), BRASS, segments=6, rings=4, mat=METAL)
        chest.tube([Vector((-0.3, -0.85, z)), Vector((0.3, -0.85, z + 0.08))], [0.012, 0.012], APRON_D, sides=4)
    chest.blob((0, 0.45, 4.25), (1.6, 0.9, 0.9), JERKIN, segments=16, rings=10)   # the hump of the back
    barnacles(chest, (0.3, 0.64, 4.5), 0.45, 22, 3, normal=(0.2, 1, 0.5))
    barnacles(chest, (-0.55, 0.45, 4.55), 0.3, 12, 4, normal=(-0.4, 0.6, 0.8))
    for k in range(6):
        kelp(chest, (-0.8 + 0.32 * k, 0.55 + 0.1 * math.sin(k), 4.3 + 0.1 * math.cos(k * 1.3)), 0.7 + 0.25 * (k % 3), k,
             sway=(0.05, 0.2))
    for s in (-1, 1):
        sh = Vector((s * 1.12, 0.02, 4.3))
        chest.blob(tuple(sh), (0.78, 0.82, 0.62), JERKIN, segments=14, rings=10)
        chest.tube([sh + Vector((s * 0.05 * math.cos(a), 0.4 * math.sin(a), 0.2 + 0.08 * math.cos(a)))
                    for a in (math.radians(x) for x in range(-100, 101, 25))], [0.07] * 9, APRON_D, sides=6,
                   squash=0.4)
        rivets(chest, [sh + Vector((s * 0.06, 0.4 * math.sin(math.radians(x)), 0.28)) for x in range(-80, 81, 40)])
        barnacles(chest, tuple(sh + Vector((s * 0.2, 0.1, 0.25))), 0.3, 16, 7 + s, normal=(s * 0.4, 0.2, 1))
    # --- the rusted iron collar and its broken chain -----------------------------------------
    col = part('Collar', 'Chest', smooth=True)
    cc = Vector((0, -0.45, 4.52))
    ring = [cc + Vector((math.sin(a) * 0.58, math.cos(a) * 0.48, 0.05 * math.cos(a))) for a in
            (i * math.tau / 24 for i in range(25))]
    col.tube(ring, [0.1] * 25, RUST, sides=8, cap=False, mat=METAL)
    rivets(col, [ring[i] + Vector((0, 0, 0.1)) for i in range(0, 24, 3)], 0.03, RUST_D)
    col.box(tuple(cc + Vector((0.12, -0.52, -0.02))), (0.22, 0.1, 0.2), RUST_D, bevel=0.03, mat=METAL)
    cch = part('CollarChain', 'CollarChain', smooth=True)
    a0, a1 = REST['CollarChain']
    chain_links(cch, a0, a1, 6, RUST, 0.02, 0.065)
    cch.prism(tuple(a1 + Vector((0, 0, -0.02))), 5, 0.05, 0.02, 0.1, RUST_D, mat=METAL)
    # --- the head: sunk forward, swollen, one eye shut, sea light in the other -------------
    head = part('Head', 'Head', smooth=True, subdiv=1)
    hc = Vector((0, -0.8, 5.15))
    head.blob(tuple(hc), (0.9, 0.86, 0.86), SKIN, segments=18, rings=14)
    head.blob(tuple(hc + Vector((0, -0.28, -0.22))), (0.74, 0.5, 0.42), SKIN, segments=14, rings=10)
    head.blob(tuple(hc + Vector((0.34, -0.3, -0.1))), (0.3, 0.26, 0.24), BRUISE, segments=10, rings=8)
    head.blob(tuple(hc + Vector((0, -0.42, 0.02))), (0.18, 0.16, 0.2), SKIN_D, segments=10, rings=8)
    head.blob(tuple(hc + Vector((0.2, -0.38, 0.14))), (0.2, 0.12, 0.13), BRUISE, segments=10, rings=8)
    head.blob(tuple(hc + Vector((-0.2, -0.36, 0.15))), (0.17, 0.1, 0.13), SOCKET, segments=10, rings=8)
    head.blob(tuple(hc + Vector((-0.2, -0.42, 0.15))), (0.08, 0.04, 0.08), SEA, mat=GLOW, segments=8, rings=6)
    head.blob(tuple(hc + Vector((-0.2, -0.44, 0.15))), (0.035, 0.02, 0.035), SEA_HOT, mat=GLOW, segments=6, rings=4)
    head.blob(tuple(hc + Vector((0, -0.38, 0.32))), (0.5, 0.14, 0.1), SKIN_D, segments=10, rings=6)
    head.blob(tuple(hc + Vector((0, 0.05, 0.3))), (0.95, 0.9, 0.55), APRON_D, segments=16, rings=8)     # the cap
    head.tube([hc + Vector((math.sin(a) * 0.47, math.cos(a) * 0.45 + 0.04, 0.2)) for a in
               (i * math.tau / 20 for i in range(21))], [0.05] * 21, APRON, sides=6, cap=False)
    rivets(head, [hc + Vector((math.sin(a) * 0.48, math.cos(a) * 0.46 + 0.04, 0.22)) for a in
                  (i * math.tau / 8 for i in range(8))], 0.025)
    for k in range(4):
        kelp(head, tuple(hc + Vector((-0.4 + 0.25 * k, 0.3, 0.4))), 0.5 + 0.2 * (k % 2), 20 + k, sway=(0.05, 0.15))
    for k in range(9):
        a = math.radians(-120 + 30 * k)
        top = hc + Vector((math.sin(a) * 0.45, math.cos(a) * 0.4 + 0.04, 0.12))
        head.tube([top, top + Vector((math.sin(a) * 0.05, math.cos(a) * 0.05, -0.25)),
                   top + Vector((math.sin(a) * 0.08, math.cos(a) * 0.08, -0.45))], [0.035, 0.025, 0.008],
                  KELP_D, sides=4)
    for k in range(5):
        x = (k - 2) * 0.09
        head.box(tuple(hc + Vector((x, -0.5, -0.26))), (0.05, 0.04, 0.07 - 0.02 * (k % 2)), TOOTH, bevel=0.01)
    jaw = part('Jaw', 'Jaw', smooth=True)
    jaw.blob((0, -1.08, 4.9), (0.72, 0.5, 0.36), SKIN, segments=14, rings=10)
    jaw.blob((0, -1.2, 4.9), (0.3, 0.14, 0.16), MOUTH, segments=10, rings=6)
    for x, h in ((-0.24, 0.16), (-0.12, 0.1), (0.1, 0.13), (0.26, 0.19)):
        jaw.spike((x, -1.28, 4.98), 0.04, h, TOOTH, sides=5, lean=(0, -0.02))
    barnacles(jaw, (0.22, -1.22, 4.82), 0.1, 5, 31, normal=(0.3, -1, -0.3))
    # --- the apron: a riveted leather bib over the belly (its torn skirt is a membrane) ----
    ap = part('ApronBib', 'Belly', smooth=True)
    # layered bands of leather hugging the belly's front, the bib's top edge at the chest
    for i in range(8):
        z = 3.5 - i * 0.16
        rz = max(0.0, 1 - ((z - 2.85) / 0.8) ** 2) ** 0.5
        arc = []
        for j in range(9):
            a = math.radians(-34 + 68 * j / 8)
            ry = 0.9 * rz + 0.05
            arc.append(Vector((math.sin(a) * (ry + 0.1) * 1.05, -0.42 - math.cos(a) * ry, z)))
        ap.tube(arc, [0.13] * 9, lerp(APRON, APRON_D, 0.25 * (i % 2)), sides=8, squash=0.22, up=(0, -1, 0))
    rivets(ap, [Vector((s * 0.55, -1.33, 3.0)) for s in (-1, 1)] + [Vector((s * 0.6, -1.27, 2.62)) for s in (-1, 1)],
           0.035)
    ap.box((0.25, -1.36, 2.85), (0.34, 0.03, 0.26), APRON_D, bevel=0.02)
    for s in (-1, 1):
        ap.tube([Vector((s * 0.62, -1.3, 3.55)), Vector((s * 0.8, -0.6, 4.05)), Vector((s * 0.4, -0.4, 4.4))],
                [0.035] * 3, APRON_D, sides=5)
    # --- the belt, the shackles hanging off it ---------------------------------------------
    belt = part('Belt', 'Hips', smooth=True)
    belt.tube([Vector((math.sin(a) * 1.02, -0.22 - math.cos(a) * 0.8, 2.28 + 0.05 * math.sin(a * 2))) for a in
               (i * math.tau / 32 for i in range(33))], [0.09] * 33, APRON_D, sides=6, cap=False)
    belt.box((0, -1.04, 2.3), (0.34, 0.08, 0.26), RUST, bevel=0.03, mat=METAL)
    for s in (-1, 1):
        belt.box((s * 0.8, -0.74, 2.28), (0.2, 0.06, 0.22), RUST_D, bevel=0.02, mat=METAL)
    for s, tag in ((1, '.L'), (-1, '.R')):
        sk = part('Shackle' + tag, 'Shackle' + tag, smooth=True)
        s0, s1 = (mirror(v, s) for v in REST['Shackle.L'])
        chain_links(sk, s0, s1 - Vector((0, 0, 0.1)), 4, RUST, 0.016, 0.05)
        for dx in (-0.1, 0.1):
            cuff = s1 + Vector((dx, 0, -0.16))
            ring = [cuff + Vector((math.cos(t) * 0.1, 0, math.sin(t) * 0.1)) for t in
                    (math.radians(20 + j * 300 / 12) for j in range(13))]
            sk.tube(ring, [0.028] * 13, RUST_D, sides=6, mat=METAL)
            sk.blob(tuple(cuff + Vector((0, 0, 0.1))), (0.06, 0.05, 0.05), RUST, segments=6, rings=4, mat=METAL)
    # --- arms: shirt sleeves rolled to the elbow, bloated bare forearms, huge fists -------
    for s, tag in ((1, '.L'), (-1, '.R')):
        a0, a1 = (mirror(v, s) for v in REST['Arm.L'])
        up = part('Arm' + tag, 'Arm' + tag, smooth=True)
        up.tube([a0.lerp(a1, t) for t in (0, 0.3, 0.65, 1.0)], [0.44, 0.42, 0.38, 0.36], SHIRT, sides=14)
        up.tube([a1 + (a0 - a1).normalized() * 0.2, a1 + (a0 - a1).normalized() * 0.02], [0.42, 0.4], SHIRT_D,
                sides=14)
        barnacles(up, tuple(a0.lerp(a1, 0.35) + Vector((s * 0.38, 0.1, 0))), 0.18, 8, 40 + s, normal=(s, 0.2, 0))
        f0, f1 = (mirror(v, s) for v in REST['Fore.L'])
        lo = part('Fore' + tag, 'Fore' + tag, smooth=True)
        lo.tube([f0.lerp(f1, t) for t in (0, 0.25, 0.55, 0.85, 1.0)], [0.34, 0.37, 0.33, 0.27, 0.25],
                [SKIN, SKIN, SKIN_D, SKIN, SKIN], sides=12)
        lo.blob(tuple(f0.lerp(f1, 0.45) + Vector((s * 0.18, -0.12, 0))), (0.18, 0.14, 0.26), BRUISE, segments=10,
                rings=6)
        lo.tube([f1 + (f0 - f1).normalized() * 0.08, f1], [0.3, 0.3], RUST, sides=12, mat=METAL)
        h0, h1 = (mirror(v, s) for v in REST['Hand.L'])
        hand = part('Hand' + tag, 'Hand' + tag, smooth=True)
        d = (h1 - h0).normalized()
        hand.blob(tuple(h0 + d * 0.18), (0.44, 0.4, 0.46), SKIN, segments=14, rings=10)
        for k in range(4):
            hand.blob(tuple(h0 + d * 0.36 + Vector(((k - 1.5) * 0.1, -0.16, 0))), (0.13, 0.13, 0.13), SKIN_D,
                      segments=8, rings=6)
        hand.blob(tuple(h0 + d * 0.15 + Vector((s * -0.16, -0.14, 0.06))), (0.12, 0.12, 0.16), SKIN_D, segments=8,
                  rings=6)
    # --- legs: stumpy, in sodden trousers and cracked sea boots ------------------------------
    for s, tag in ((1, '.L'), (-1, '.R')):
        t0, t1 = (mirror(v, s) for v in REST['Thigh.L'])
        th = part('Thigh' + tag, 'Thigh' + tag, smooth=True)
        th.tube([t0.lerp(t1, t) for t in (0, 0.4, 0.8, 1.0)], [0.5, 0.48, 0.42, 0.38], TROUSER, sides=14)
        k0, k1 = (mirror(v, s) for v in REST['Shin.L'])
        sh = part('Shin' + tag, 'Shin' + tag, smooth=True)
        sh.tube([k0.lerp(k1, t) for t in (0, 0.3, 0.6, 1.0)], [0.38, 0.4, 0.42, 0.4], BOOT, sides=14)
        sh.tube([k0.lerp(k1, 0.18), k0.lerp(k1, 0.08)], [0.46, 0.45], BOOT, sides=14)
        barnacles(sh, tuple(k0.lerp(k1, 0.6) + Vector((s * 0.3, -0.2, 0))), 0.15, 6, 50 + s, normal=(s, -0.5, 0))
        o0, o1 = (mirror(v, s) for v in REST['Foot.L'])
        ft = part('Foot' + tag, 'Foot' + tag, smooth=True)
        ft.loft([(tuple(o0 + Vector((0, 0.12, -0.12))), 0.34, 0.2, 2.6, (0, -1, 0)),
                 (tuple(o0.lerp(o1, 0.6) + Vector((0, 0, -0.1))), 0.36, 0.2, 2.6, (0, -1, 0)),
                 (tuple(o1 + Vector((0, 0.0, -0.02))), 0.26, 0.14, 2.4, (0, -1, 0))], BOOT, sides=12)
        ft.box(tuple(o0.lerp(o1, 0.5) + Vector((0, 0, -0.22))), (0.66, 0.95, 0.06), APRON_D, bevel=0.02)
    # --- the key ring on its chain ----------------------------------------------------------
    kc = part('KeyChain', 'KeyChain', smooth=True)
    c0, c1 = REST['KeyChain']
    chain_links(kc, c0, c1, 3, RUST)
    ks = part('Keys', 'Keys', smooth=True)
    rc = Vector(REST['Keys'][0]) - Vector((0, 0, KEY_RING))
    ring = [rc + Vector((math.cos(a) * KEY_RING, 0, math.sin(a) * KEY_RING)) for a in
            (i * math.tau / 28 for i in range(29))]
    ks.tube(ring, [0.045] * 29, RUST, sides=7, cap=False, mat=METAL)
    for k in range(9):
        a = math.radians(-160 + 140 * k / 8)
        top = rc + Vector((math.cos(a) * KEY_RING, 0, math.sin(a) * KEY_RING))
        key(ks, tuple(top), a, 0.26 + 0.1 * ((k * 5) % 3), RUST if k % 3 else (BRASS if k % 2 else RUST_D))
    # --- the storm lantern and its sea-lit flame ---------------------------------------------
    ln = part('Lantern', 'Lantern', smooth=True)
    l0 = Vector(REST['Lantern'][0])
    lc = l0 - Vector((0, 0, 0.62))
    ln.tube([l0, l0 - Vector((0, 0, 0.18))], [0.02, 0.02], RUST, sides=5, mat=METAL)
    ln.tube([l0 - Vector((0, 0, 0.36)) + Vector((0.2 * math.cos(a), 0, 0.2 * math.sin(a))) for a in
             (math.radians(x) for x in range(0, 181, 20))], [0.02] * 10, RUST, sides=5, mat=METAL)
    ln.lathe(tuple(lc + Vector((0, 0, 0.28))), [(0.2, 0), (0.22, 0.04), (0.14, 0.14), (0.05, 0.2), (0.0, 0.22)], 10,
             RUST_D, mat=METAL)
    ln.lathe(tuple(lc - Vector((0, 0, 0.3))), [(0.2, 0), (0.22, 0.06), (0.2, 0.1)], 10, RUST_D, mat=METAL)
    for k in range(6):
        a = math.tau * k / 6
        ln.tube([lc + Vector((math.cos(a) * 0.19, math.sin(a) * 0.19, -0.22)),
                 lc + Vector((math.cos(a) * 0.2, math.sin(a) * 0.2, 0.0)),
                 lc + Vector((math.cos(a) * 0.19, math.sin(a) * 0.19, 0.28))], [0.02] * 3, RUST, sides=4, mat=METAL)
    ln.blob(tuple(lc), (0.3, 0.3, 0.46), lerp(SEA, (0.2, 0.3, 0.28), 0.6), mat=GLOW, segments=10, rings=8)
    barnacles(ln, tuple(lc + Vector((0.1, 0, 0.3))), 0.1, 4, 60, normal=(0.3, 0, 1))
    lf = part('LampFlame', 'LampFlame', smooth=True)
    lf.blob(tuple(lc + Vector((0, 0, -0.02))), (0.14, 0.14, 0.26), LAMP, mat=GLOW, segments=8, rings=6)
    lf.blob(tuple(lc + Vector((0, 0, -0.04))), (0.07, 0.07, 0.13), SEA_HOT, mat=GLOW, segments=6, rings=5)
    return parts


def apron_spar(k):
    """The apron skirt's k-th spar from the belt round the belly's front to the knee."""
    a = math.radians(-58 + 116 * k / (APRON_SPARS - 1))
    top = Vector((math.sin(a) * 1.15, -0.3 - math.cos(a) * 0.98, 2.3))
    low = Vector((math.sin(a) * 1.2, -0.3 - math.cos(a) * 1.08, 1.05 - 0.08 * math.cos(a * 3)))
    return top, low


def build_membranes():
    skirt = Membrane('ApronSkirt', APRON, seed=31)
    spars = []
    for k in range(APRON_SPARS):
        top, low = apron_spar(k)
        spars.append([(tuple(top), 'Hips'), (tuple(top.lerp(low, 0.5)), 'Apron'), (tuple(low), 'Apron')])
    for k in range(APRON_SPARS - 1):
        skirt.panel(spars[k], spars[k + 1], rows=10, cols=5, scallop=0.04, tear=0.6, shade=0.9)
    return [skirt]


def make_clips(arm):
    rig = RollRig(BONES).attach(arm)
    P = rig.pose
    clips = []

    def add(name, keys, loop_clip=True, fire=None):
        clip(arm, name, keys, loop_clip, fire, flicker=['LampFlame'])
        clips.append(name)

    def norm(v):
        return Vector(v).normalized()

    head_rest = (REST['Head'][1] - REST['Head'][0]).normalized()

    def stance(root=(0, 0, 0), lean=0.0, twist=0.0, look=(0, 0, 0), jaw=4.0, wrist_r=(-1.72, -0.5, 2.35),
               wrist_l=(1.72, -0.5, 2.35), foot_l=(0.62, -0.1, 0.34), foot_r=(-0.62, -0.1, 0.34), keys=(0, 0, -1),
               chain=(0, 0, -1), lantern=(0, 0, -1), shackle=(0.0, 0.0), apron=0.0, belly=1.0, collar=(0.0, 0.0),
               lamp_up=False):
        """`wrist_*` ride the root, the feet stay planted where given; `keys`,
        `chain` and `lantern` are the dangling pieces' directions."""
        rootv = Vector(root)
        aims = {
            'Spine': (twist * 0.2, -0.1 - lean * 0.5, 1.0),
            'Chest': (twist * 0.45, 0.09 - lean, 1.0),
            'Head': tuple(head_rest + Vector((look[0], 0.0, look[2]))),
            'KeyChain': tuple(norm(chain)),
            'Keys': tuple(norm(keys)),
            'Lantern': tuple(norm(lantern)),
            'CollarChain': tuple(norm((collar[0], -0.2 + collar[1], -1.0))),
            'Apron': tuple(norm((0.0, -0.08 - apron, -1.0))),
            'Hand.R': (0.0, -0.3, -1.0),
            'Hand.L': (0.0, -0.3, 1.0) if lamp_up else (0.0, -0.3, -1.0),
            'Foot.L': (0.0, -1.0, -0.35),
            'Foot.R': (0.0, -1.0, -0.35),
        }
        for s, tag in ((1, '.L'), (-1, '.R')):
            aims['Shackle' + tag] = tuple(norm((s * 0.08 + shackle[0], -0.05 + shackle[1], -1.0)))
        turns = {'Jaw': [('x', jaw)]}
        ik = {
            'arm.L': ('Arm.L', 'Fore.L', tuple(Vector(wrist_l) + rootv), (1.4, 0.8, -0.2)),
            'arm.R': ('Arm.R', 'Fore.R', tuple(Vector(wrist_r) + rootv), (-1.4, 0.8, -0.2)),
            'leg.L': ('Thigh.L', 'Shin.L', foot_l, (0.3, -1.0, 0.2)),
            'leg.R': ('Thigh.R', 'Shin.R', foot_r, (-0.3, -1.0, 0.2)),
        }
        return P(aims=aims, ik=ik, turns=turns, root=root, scales={'Belly': belly})

    # Idle: the belly heaves, the keys jingle, the lantern sways.
    idle = []
    for i in range(6):
        ph = math.tau * i / 6
        idle.append((1 + i * 14, stance(root=(0, 0, -0.03 + 0.04 * math.sin(ph)), belly=1.0 + 0.035 * math.sin(ph),
                                        keys=(0.1 * math.sin(ph * 2), 0.12 * math.cos(ph), -1),
                                        chain=(0.05 * math.sin(ph * 2), 0.05 * math.cos(ph), -1),
                                        lantern=(0.08 * math.sin(ph + 1), 0.1 * math.sin(ph), -1),
                                        look=(0.08 * math.sin(ph * 0.5), 0, 0.03 * math.sin(ph)),
                                        jaw=4 + 5 * max(0.0, math.sin(ph)), collar=(0.06 * math.sin(ph), 0.0),
                                        shackle=(0.05 * math.sin(ph * 2), 0.04 * math.cos(ph)))))
    idle.append((85, idle[0][1]))
    add('Idle', idle)

    def waddle(ph, amp=1.0, run=False):
        """A heavy rolling waddle: the body rocks over each planted foot."""
        stride = 0.55 * amp
        lift = 0.28 * amp
        fl = (0.62, -0.1 - stride * math.cos(ph), 0.34 + lift * max(0.0, math.sin(ph)))
        fr = (-0.62, -0.1 + stride * math.cos(ph), 0.34 + lift * max(0.0, -math.sin(ph)))
        sway = 0.12 * math.sin(ph) * amp
        return stance(root=(sway, -0.1 * amp, -0.06 - 0.07 * abs(math.cos(ph)) * amp), lean=0.12 + (0.14 if run else 0),
                      twist=-0.25 * math.sin(ph) * amp, foot_l=fl, foot_r=fr, belly=1.0 + 0.03 * abs(math.cos(ph)),
                      wrist_r=(-1.7, -0.5 + 0.35 * math.cos(ph) * amp, 2.35 + 0.1 * amp),
                      wrist_l=(1.7, -0.5 - 0.35 * math.cos(ph) * amp, 2.35 + 0.1 * amp),
                      keys=(0.25 * math.sin(ph) * amp, 0.35 * math.cos(ph) * amp, -1),
                      chain=(0.15 * math.sin(ph) * amp, 0.25 * math.cos(ph) * amp, -1),
                      lantern=(-0.2 * math.sin(ph) * amp, -0.3 * math.cos(ph) * amp, -1),
                      apron=0.25 * math.sin(ph * 2) * amp, collar=(0.15 * math.sin(ph), 0.15 * amp),
                      shackle=(0.2 * math.sin(ph) * amp, 0.15 * math.cos(ph)), jaw=6 + 6 * amp,
                      look=(0.1 * math.sin(ph), 0, 0.05))

    add('Walk', [(1 + i * 8, waddle(i / 4 * math.tau)) for i in range(4)] + [(33, waddle(0.0))])
    add('Run', [(1 + i * 5, waddle(i / 4 * math.tau, 1.4, True)) for i in range(4)] + [(21, waddle(0.0, 1.4, True))])
    stand = idle[0][1]
    # KeySwing: the key ring whirled up over the head on its chain, then down.
    wind = stance(lean=-0.25, twist=-0.5, wrist_r=(-1.3, 0.3, 4.6), chain=(0.3, 0.6, 0.6), keys=(0.2, 0.9, 0.2),
                  jaw=18, look=(-0.2, 0, 0.25), apron=-0.1, collar=(0.0, 0.2))
    top = stance(lean=-0.2, twist=-0.2, wrist_r=(-0.9, -0.2, 5.4), chain=(0.2, 0.3, 1.0), keys=(0.0, 0.2, 1.0),
                 jaw=28, look=(0, 0, 0.35), collar=(0.0, 0.1))
    slam = stance(root=(0, -0.2, -0.2), lean=0.55, twist=0.2, wrist_r=(-0.6, -2.0, 2.8), chain=(0.1, -1.0, -0.2),
                  keys=(0.05, -0.6, -1.0), jaw=38, look=(0.1, 0, -0.35), apron=0.3, belly=1.04, collar=(0.0, -0.4),
                  shackle=(0.1, -0.2))
    follow = stance(root=(0, -0.15, -0.12), lean=0.4, twist=0.3, wrist_r=(-0.8, -1.7, 2.2), chain=(0.0, -0.5, -1.0),
                    keys=(0.0, -0.2, -1.0), jaw=20, look=(0.15, 0, -0.2), apron=0.15)
    add('KeySwing', [(1, stand), (7, wind), (11, top), (14, slam), (18, follow), (30, stand)], loop_clip=False)
    # ChainLash: the keys lashed flat across the front at full reach.
    back = stance(twist=-0.9, lean=0.05, wrist_r=(-2.1, 0.5, 3.4), chain=(-0.9, 0.5, 0.1), keys=(-0.9, 0.6, 0.0),
                  jaw=16, look=(-0.3, 0, 0.1))
    lash = stance(twist=0.8, lean=0.25, wrist_r=(0.2, -2.0, 3.1), chain=(0.9, -0.6, 0.0), keys=(1.0, -0.2, 0.0),
                  jaw=34, look=(0.3, 0, -0.05), apron=0.2, collar=(0.3, 0.0), shackle=(0.25, 0.0))
    past = stance(twist=1.0, lean=0.2, wrist_r=(0.9, -1.4, 2.8), chain=(0.8, 0.5, -0.2), keys=(0.6, 0.8, -0.2),
                  jaw=22, look=(0.4, 0, -0.05), collar=(0.35, 0.1))
    add('ChainLash', [(1, stand), (8, back), (12, lash), (16, past), (28, stand)], loop_clip=False)
    # LanternRaise: Open the Cells: the lantern thrust high, the keys rattled, a bellow.
    raise_ = stance(lean=-0.3, wrist_l=(1.2, -0.7, 5.6), lamp_up=True, jaw=40, look=(0.15, 0, 0.45),
                    wrist_r=(-1.5, -0.9, 3.2), chain=(0.1, -0.3, -1), keys=(0.3, -0.3, -1), belly=1.05,
                    collar=(0.0, 0.3))
    rattle_a = stance(lean=-0.28, wrist_l=(1.25, -0.72, 5.55), lamp_up=True, jaw=44, look=(0.1, 0, 0.4),
                      wrist_r=(-1.35, -1.05, 3.4), chain=(0.5, -0.4, -0.6), keys=(0.7, -0.3, -0.6), belly=1.05)
    rattle_b = stance(lean=-0.28, wrist_l=(1.2, -0.68, 5.6), lamp_up=True, jaw=30, look=(0.2, 0, 0.42),
                      wrist_r=(-1.65, -0.85, 3.3), chain=(-0.5, -0.3, -0.6), keys=(-0.7, -0.2, -0.6), belly=1.04)
    add('LanternRaise', [(1, stand), (9, raise_), (13, rattle_a), (17, rattle_b), (21, rattle_a), (25, rattle_b),
                         (40, stand)], loop_clip=False, fire=[(1, 1.0), (9, 2.2), (30, 1.8), (40, 1.0)])
    add('Cast', [(1, rattle_a), (7, rattle_b), (13, rattle_a), (19, rattle_b), (25, rattle_a)],
        fire=[(1, 1.8), (25, 1.8)])
    hit = stance(root=(0, 0.3, 0.02), lean=-0.3, look=(-0.2, 0, 0.3), jaw=26, keys=(-0.3, 0.6, -1), chain=(-0.2, 0.4, -1),
                 lantern=(0.3, 0.5, -1), belly=1.05, collar=(0.0, 0.4))
    add('Hit', [(1, stand), (4, hit), (15, stand)], loop_clip=False)
    # Death: it sags to its knees, then falls on its face; the lantern gutters out.
    knees = stance(root=(0, -0.3, -0.95), lean=0.35, look=(0, 0, -0.3), jaw=34, foot_l=(0.62, 0.9, 0.3),
                   foot_r=(-0.62, 0.9, 0.3), wrist_r=(-1.6, -0.9, 1.2), wrist_l=(1.6, -0.9, 1.2), keys=(0.2, -0.3, -1),
                   belly=1.02)
    flat = stance(root=(0, -1.4, -1.55), lean=1.45, look=(0, 0, -0.1), jaw=40, foot_l=(0.62, 1.2, 0.3),
                  foot_r=(-0.62, 1.2, 0.3), wrist_r=(-1.9, -2.2, 0.35), wrist_l=(1.9, -2.2, 0.35), keys=(0.4, -1, -0.2),
                  chain=(0.2, -1, -0.1), lantern=(0.6, -0.5, -0.4), belly=0.98, collar=(0.0, -1.0), apron=-0.6)
    add('Death', [(1, stand), (10, knees), (20, knees), (32, flat), (44, flat)], loop_clip=False,
        fire=[(1, 1.0), (20, 0.8), (32, 0.3), (44, 0.0)])
    return clips


if __name__ == '__main__':
    import bpy
    argv = sys.argv[sys.argv.index('--') + 1:]
    out = argv[0]
    fast = '--fast' in argv
    new_scene()
    mats = make_materials('membrane', membrane_kind='cloth')
    metal = bpy.data.materials.new('CreatureMetal')
    metal.use_nodes = True
    metal.use_backface_culling = True
    _procedural_surface(metal, 'iron')
    mats.append(metal)
    parts = build_parts()
    mems = build_membranes()
    objects = [pt.to_object(mats) for pt in parts] + [m.to_object(mats) for m in mems]
    body = join(objects, 'GaolTurnkey')
    print('TRIANGLES', triangles(body))
    bake_surface(body, size=512 if fast else 2048, samples=16 if fast else 40)
    bsdf = next(n for n in metal.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Metallic'].default_value = 0.55
    bsdf.inputs['Roughness'].default_value = 0.55
    arm = build_armature('GaolTurnkey', BONES)
    bind(body, arm)
    clips = make_clips(arm)
    scene = bpy.context.scene
    arm.animation_data.action = bpy.data.actions['Idle']
    scene.frame_set(1)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg)
    zs = [(ev.matrix_world @ v.co).z for v in ev.data.vertices]
    print('IDLE_HEIGHT', round(max(zs) - min(zs), 3), 'MINZ', round(min(zs), 3), 'MAXZ', round(max(zs), 3))
    # The lantern at the top of LanternRaise: the flare's anchor (bastion_creature_fx_core.ts).
    arm.animation_data.action = bpy.data.actions['LanternRaise']
    scene.frame_set(9)
    h = arm.matrix_world @ arm.pose.bones['LampFlame'].head
    print('LANTERN_HIGH side', round(h.x, 3), 'up', round(h.z, 3), 'fwd', round(-h.y, 3))
    for b in arm.pose.bones:
        b.scale = (1, 1, 1)
    export(out, arm)
    if '--sheet' in argv:
        setup_preview((0, -0.3, 2.9), 12, ref_x=3.4)
        render_sheet(arm, clips, argv[argv.index('--sheet') + 1], 'turnkey', frames_per_clip=5)
    if '--blend' in argv:
        arm.animation_data.action = bpy.data.actions['Idle']
        bpy.ops.wm.save_as_mainfile(filepath=argv[argv.index('--blend') + 1])
        print('SAVED')
