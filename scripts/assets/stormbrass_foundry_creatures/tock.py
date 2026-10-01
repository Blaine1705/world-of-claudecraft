"""Line-Master Ambrel Tock: the Stormbrass Foundry's first boss
(src/sim/encounters/stormbrass_foundry/line_master.ts).

  blender -b --factory-startup --python tock.py -- <out.glb|-> [--sheet dir] [--blend out.blend] [--fast] [--nobake]

A stout, barrel-bellied foreman strapped into a steam harness. A big round
head under a riveted leather cap, brass goggles down over his eyes, bushy
brows bristling over them, a bulbous ruddy nose, mutton-chop sideburns and a
HUGE ginger-grey handlebar moustache swept out and curled up at the tips (it
bristles on its own bone when he bellows). A canvas work shirt with the
sleeves rolled to the elbow, leather gauntlets, a heavy leather apron with
tool pockets and a brass-buckled belt, steel-capped boots.

On his back the steam harness: a riveted brass boiler pack with two short
stacks, the klaxon horn and a caged amber beacon on top, and the big PRESSURE
GAUGE facing back and up, its needle on its own bone (the renderer's dial
turns it toward the red as the lever throw nears: VisualDef.dials). From the
pack's shoulders rise two MECHANICAL ARMS of brass and iron with exposed
pistons and copper hoses: the right one ends in a giant adjustable WRENCH, the
left in a drum-fed RIVETER (the drum turns on its own bone). The tools are
modelled on the arms' last segments and never turn against them. A valve box
on his chest carries the great brass LEVER he yanks to reverse the line.

Scale: about 3.9 yards to the wrench at rest; the VISUALS row draws him so
that his template's 1.9 stands him some 8 yards tall, three players.

Clips (24 fps): Idle, Walk, Run, WrenchSlam, WrenchSweep, Haymaker (melee),
LeverThrow (the 2 s klaxon bar: grabs the lever, braces, the beacon spinning,
yanks it down at its end), RivetGun (the 1 s bar: the riveter swung level,
three hammering recoils, played out), PressSignal (the press windup: he
stamps and points the wrench at the press), PartsCall (Parts Drop: the
riveter whirled overhead, bellowing at the chute), Cast, Hit, Death (he
staggers, sits down hard on his pack and topples back, the arms flopping).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from foundry_kit import (  # noqa: E402
    BLACK, BODY, BRASS, BRASS_D, BRASS_HI, CANVAS, CANVAS_D, COPPER, COPPER_D, GLASS, GLOW, HAIR, HAIR_D,
    HAIR_GREY, HAZARD, IRON, IRON_D, IRON_HI, LEATHER, LEATHER_D, LENS, METAL, SIGNAL_RED, SKIN, SKIN_D,
    SKIN_RUDDY, STEEL, WARN, MachineRig, Matrix, MPart, Vector, anim, basis, expand_bones, lerp, run, tracks,
)

TROUSER = (0.22, 0.2, 0.2)
BOOT = (0.17, 0.11, 0.07)
MOUTH = (0.2, 0.06, 0.05)
TOOTH = (0.86, 0.82, 0.68)

GAUGE_C = Vector((0.0, 1.44, 2.6))
GAUGE_N = Vector((0.0, 0.86, 0.5)).normalized()
GAUGE_R = 0.36

BONES = expand_bones([
    ('Root', None, (0, 0, 0), (0, 0, 0.4)),
    ('Hips', 'Root', (0, 0, 1.25), (0, 0, 1.55)),
    ('Belly', 'Hips', (0, -0.25, 1.68), (0, -0.75, 1.68)),
    ('Apron', 'Hips', (0, -0.86, 1.18), (0, -0.92, 0.62)),
    ('Spine', 'Hips', (0, 0, 1.55), (0, 0.02, 2.05)),
    ('Chest', 'Spine', (0, 0.02, 2.05), (0, 0.05, 2.6)),
    ('Neck', 'Chest', (0, -0.06, 2.6), (0, -0.1, 2.8)),
    ('Head', 'Neck', (0, -0.1, 2.8), (0, -0.12, 3.3)),
    ('Jaw', 'Head', (0, -0.18, 2.86), (0, -0.5, 2.72)),
    ('Stache', 'Head', (0, -0.5, 2.94), (0, -0.62, 2.94)),
    ('Lever', 'Chest', (-0.46, -0.66, 2.12), (-0.46, -0.98, 2.4)),
    ('Pack', 'Chest', (0, 0.62, 2.0), (0, 0.64, 2.6)),
    ('GaugeNeedle', 'Pack', tuple(GAUGE_C), tuple(GAUGE_C + GAUGE_N * 0.22)),
    ('Beacon', 'Pack', (0.36, 0.86, 3.12), (0.36, 0.86, 3.34)),
    ('Arm.L', 'Chest', (0.82, 0.05, 2.45), (1.12, 0.0, 1.86)),
    ('Fore.L', 'Arm.L', (1.12, 0.0, 1.86), (1.2, -0.18, 1.33)),
    ('Hand.L', 'Fore.L', (1.2, -0.18, 1.33), (1.22, -0.26, 1.06)),
    ('Thigh.L', 'Hips', (0.42, 0.0, 1.25), (0.46, 0.0, 0.7)),
    ('Shin.L', 'Thigh.L', (0.46, 0.0, 0.7), (0.46, 0.04, 0.22)),
    ('Foot.L', 'Shin.L', (0.46, 0.04, 0.22), (0.46, -0.44, 0.07)),
    ('MechArm.L', 'Pack', (0.64, 0.74, 2.8), (1.16, 0.38, 3.46)),
    ('MechFore.L', 'MechArm.L', (1.16, 0.38, 3.46), (1.56, -0.42, 3.12)),
    ('MechHand.L', 'MechFore.L', (1.56, -0.42, 3.12), (1.62, -0.96, 2.98)),
    ('RivetDrum', 'MechHand.L', (1.62, -0.6, 3.32), (1.62, -0.6, 3.52)),
])
REST = {n: (Vector(h), Vector(t)) for n, _, h, t in BONES}
HC = Vector((0.0, -0.16, 3.0))


def M(v, s):
    return Vector((s * v.x, v.y, v.z))


def _ss(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def _g(x):
    return math.exp(-x * x)


MOUTH_T = -0.4
EYE_PHI, EYE_T = 0.34, 0.14


def head_point(phi, theta):
    """Tock's face at azimuth `phi` (0 ahead, -Y) and elevation `theta`: a round,
    jowly head, a heavy brow, a big bulbous nose, ruddy cheek apples, a wide
    mouth line, a cleft chin. (position, normal, (ruddy, dark))."""
    ct = math.cos(theta)
    u = Vector((math.sin(phi) * ct, -math.cos(phi) * ct, math.sin(theta)))
    rx, ry = 0.45, 0.43
    rz = 0.44 if u.z > 0 else 0.47
    p0 = Vector((u.x * rx, u.y * ry, u.z * rz))
    p0.x *= 1.0 + 0.16 * _ss(0.0, -0.9, theta)          # the jowls widen him below
    n = Vector((p0.x / rx ** 2, p0.y / ry ** 2, p0.z / rz ** 2)).normalized()
    front = max(0.0, -u.y)
    ap = abs(phi)
    dr = 0.0
    ruddy = 0.0
    dark = 0.0
    dr += 0.07 * _g((theta - 0.36) / 0.09) * _g(phi / 0.75) * front          # the heavy brow
    dr -= 0.03 * _g((theta - EYE_T) / 0.12) * _g((ap - EYE_PHI) / 0.2) * front  # under the goggles
    nose = _g(phi / 0.13) * _g((theta + 0.05) / 0.15) * front
    bulb = _g(phi / 0.15) * _g((theta + 0.15) / 0.09) * front
    dr += 0.13 * nose + 0.14 * bulb                                         # the potato nose
    ruddy = max(ruddy, 0.7 * bulb + 0.3 * nose)
    for s in (-1, 1):
        nostril = _g((phi - s * 0.08) / 0.035) * _g((theta + 0.21) / 0.03) * front
        dr -= 0.03 * nostril
        dark = max(dark, nostril)
        apple = _g((theta + 0.1) / 0.13) * _g((ap - 0.5) / 0.2) * front
        dr += 0.045 * apple
        ruddy = max(ruddy, 0.6 * apple)
    edge = 1.0 - _ss(0.42, 0.6, ap)
    slit = _g((theta - MOUTH_T) / 0.024) * edge * front
    dr -= 0.04 * slit
    dark = max(dark, slit)
    dr += 0.035 * _g((theta - MOUTH_T + 0.07) / 0.045) * edge * front        # the lower lip
    dr += 0.07 * _g((theta + 0.72) / 0.12) * _g(phi / 0.35) * front          # the chin
    dr -= 0.015 * _g((theta + 0.72) / 0.08) * _g(phi / 0.05) * front         # its cleft
    dr += 0.05 * _g((theta + 0.6) / 0.22) * _g((ap - 0.9) / 0.35)            # the jowls
    pos = HC + p0 + n * dr
    return pos, n, (ruddy, dark)


def sculpt_head(head, jaw, n_phi=56, n_theta=44):
    grid = {}
    j_m = round((MOUTH_T + math.pi / 2 - 0.03) / (math.pi - 0.06) * n_theta)
    base = [-math.pi / 2 + 0.03 + (math.pi - 0.06) * j / n_theta for j in range(n_theta + 1)]
    shift = MOUTH_T - base[j_m]
    for j in range(n_theta + 1):
        for i in range(n_phi):
            phi = -math.pi + math.tau * i / n_phi
            fall = max(0.0, 1.0 - abs(j - j_m) / 5.0) * (1.0 - _ss(1.0, 1.4, abs(phi)))
            theta = base[j] + shift * fall
            grid[(i, j)] = (phi, theta) + head_point(phi, theta)
    made = {}

    def vert(p, i, j):
        key = (id(p), i % n_phi, j)
        v = made.get(key)
        if v is None:
            phi, theta, pos, _, (ruddy, dark) = grid[(i % n_phi, j)]
            v = p.bm.verts.new(pos)
            col = lerp(SKIN, SKIN_RUDDY, ruddy)
            col = lerp(col, SKIN_D, 0.25 * max(0.0, -math.sin(theta)) * 0.6)
            stub = _ss(MOUTH_T - 0.05, MOUTH_T - 0.25, theta) * _g(phi / 1.0)
            col = lerp(col, lerp(SKIN_D, HAIR_D, 0.4), 0.45 * stub)
            col = lerp(col, MOUTH, min(1.0, dark * 1.3))
            made[key] = v
            made[('col', v)] = col
        return v

    for part_ in (head, jaw):
        part_._before = set(part_.bm.faces)
    for j in range(n_theta):
        for i in range(n_phi):
            phi = -math.pi + math.tau * (i + 0.5) / n_phi
            p = jaw if (j < j_m and abs(phi) < 1.2) else head
            p.bm.faces.new((vert(p, i, j), vert(p, i + 1, j), vert(p, i + 1, j + 1), vert(p, i, j + 1)))
    head.bm.faces.new([vert(head, i, n_theta) for i in range(n_phi)])
    head.bm.faces.new(list(reversed([vert(head, i, 0) for i in range(n_phi)])))
    for part_ in (head, jaw):
        faces = part_._new_faces(part_._before)
        part_._paint(faces, SKIN, BODY)
        for f in faces:
            for lp in f.loops:
                lp[part_.col] = (*made[('col', lp.vert)], 1.0)


def hair_strand(p, pts, r0, r1, color, sides=7):
    n = len(pts)
    p.tube(pts, [r0 + (r1 - r0) * (i / (n - 1)) ** 0.8 for i in range(n)], color, sides=sides)


def build_parts():
    parts = []

    def part(name, bone, **kw):
        pt = MPart(name, bone, **kw)
        parts.append(pt)
        return pt

    # ---- the head: sculpted face, goggles, brows, the moustache, the cap -------------
    head = part('Head', 'Head', hard=False)
    jaw = part('Jaw', 'Jaw', hard=False)
    sculpt_head(head, jaw)
    for s in (-1, 1):
        ep, en = head_point(s * EYE_PHI, EYE_T)[:2]
        gc = ep + en * 0.06
        head.cyl(gc - en * 0.06, gc + en * 0.05, 0.135, BRASS, sides=18)
        head.ring(gc + en * 0.05, en, 0.13, 0.025, BRASS_HI, sides=20)
        head.disc(tuple(gc + en * 0.055), tuple(en), 0.11, 0.01, LENS, sides=18, mat=GLASS)
        head.blob(tuple(gc + en * 0.062 + Vector((s * 0.03, 0, 0.035))), (0.05, 0.03, 0.02), (0.6, 0.85, 0.8),
                  segments=6, rings=4, mat=GLASS)
        head.rivets([gc + en * 0.02 + Vector((math.cos(a) * 0.135, 0, math.sin(a) * 0.135))
                     for a in (0.5, 2.2, 4.0)], 0.014, BRASS_D)
        # the bushy brow bristling over the goggle, angry, slanting in
        bp = [head_point(s * ph, th)[0] + head_point(s * ph, th)[1] * 0.08 for ph, th in
              ((0.12, 0.3), (0.28, 0.35), (0.46, 0.36), (0.6, 0.31))]
        for k, off in enumerate((0.0, 0.028, -0.022, 0.012)):
            hair_strand(head, [q + Vector((0, -0.012 * k, off + 0.012 * i * (k - 1.5))) for i, q in enumerate(bp)],
                        0.034, 0.008, lerp(HAIR, HAIR_GREY, 0.3 + 0.17 * k))
        # the mutton-chop sideburns down to the jaw
        sb = [head_point(s * ph, th)[0] + head_point(s * ph, th)[1] * 0.03 for ph, th in
              ((1.2, 0.2), (1.05, -0.05), (0.95, -0.25), (0.82, -0.36))]
        head.tube(sb, [0.09, 0.11, 0.1, 0.06], lerp(HAIR, HAIR_GREY, 0.3), sides=8, squash=0.5)
        # an ear under the cap
        ec, ecn = head_point(s * 1.5, 0.05)[:2]
        head.blob(tuple(ec + ecn * 0.03), (0.08, 0.16, 0.2), SKIN_D, segments=10, rings=8)
    # the goggle strap round the head and the bridge between the eyes
    strap = [head_point(ph, EYE_T + 0.02)[0] + head_point(ph, EYE_T + 0.02)[1] * 0.025
             for ph in [math.radians(x) for x in range(30, 331, 15)]]
    head.tube(strap, [0.035] * len(strap), LEATHER_D, sides=6, squash=0.5)
    br = head_point(0.0, EYE_T + 0.03)
    head.obox(tuple(br[0] + br[1] * 0.08), (0.12, 0.04, 0.05), basis(br[1]), BRASS_D, mat=METAL, bevel=0.01)
    # the leather foreman's cap with its brass gear badge
    head.blob(tuple(HC + Vector((0, 0.03, 0.2))), (0.98, 0.94, 0.62), LEATHER, segments=24, rings=14)
    head.ring(HC + Vector((0, 0.02, 0.17)), (0, 0, 1), 0.47, 0.045, LEATHER_D, sides=28)
    head.blob(tuple(HC + Vector((0, -0.4, 0.2))), (0.62, 0.34, 0.06), LEATHER_D, rot=(-0.2, 0, 0), segments=16,
              rings=6)
    head.gear(tuple(HC + Vector((0, -0.44, 0.33))), (0, -0.85, 0.5), 0.1, 10, 0.03, BRASS_HI)
    head.rivets([HC + Vector((math.sin(a) * 0.475, math.cos(a) * 0.455 + 0.02, 0.2)) for a in
                 (i * math.tau / 12 for i in range(12))], 0.022, BRASS_D)
    # the mouth's dark and its teeth, a stub of clenched cigar
    head.blob(tuple(HC + Vector((0, -0.34, -0.2))), (0.38, 0.18, 0.08), MOUTH, segments=12, rings=8)
    for k in range(5):
        x = -0.12 + 0.06 * k
        q = head_point(x * 1.9, MOUTH_T + 0.02)
        head.obox(tuple(q[0] - q[1] * 0.025), (0.05, 0.03, 0.04), basis(q[1]), TOOTH, bevel=0.008)
    cq = head_point(-0.32, MOUTH_T)
    head.cyl(cq[0] - cq[1] * 0.02, cq[0] + cq[1] * 0.16 + Vector((-0.04, 0, -0.03)), 0.028, (0.32, 0.2, 0.1),
             sides=8, mat=BODY)
    head.blob(tuple(cq[0] + cq[1] * 0.17 + Vector((-0.045, 0, -0.035))), (0.05, 0.05, 0.05), (0.55, 0.52, 0.5),
              segments=6, rings=4)
    # a short, bristling chin beard under the lip
    for k in range(7):
        ph = -0.3 + 0.6 * k / 6
        q0, n0 = head_point(ph, -0.58)[:2]
        q1 = head_point(ph * 0.8, -0.86)[0] + n0 * 0.05
        jaw.tube([q0 + n0 * 0.01, q0.lerp(q1, 0.5) + n0 * 0.06, q1], [0.05, 0.045, 0.012],
                 lerp(HAIR, HAIR_GREY, 0.25 + 0.1 * (k % 3)), sides=6)
    # ---- the moustache: its own bone so it bristles when he bellows -------------------
    st = part('Stache', 'Stache', hard=False)
    for s in (-1, 1):
        for k, (dz, dy, rr, tone) in enumerate(((0.0, 0.0, 1.0, 0.2), (0.04, 0.02, 0.72, 0.45), (-0.035, 0.02, 0.75, 0.1),
                                                (0.015, -0.03, 0.6, 0.6), (-0.015, 0.035, 0.62, 0.3))):
            pts = [HC + Vector((s * x, y + dy, z + dz * (1 - 0.5 * i / 6))) for i, (x, y, z) in enumerate((
                (0.03, -0.5, -0.12), (0.18, -0.52, -0.18), (0.36, -0.47, -0.2), (0.52, -0.39, -0.15),
                (0.61, -0.33, -0.07), (0.63, -0.3, 0.0), (0.58, -0.31, 0.03)))]
            cols = [lerp(HAIR, HAIR_GREY, tone)] * 4 + [lerp(HAIR, HAIR_GREY, min(1.0, tone + 0.35))] * 3
            st.tube(pts, [0.075 * rr, 0.1 * rr, 0.092 * rr, 0.07 * rr, 0.048 * rr, 0.03 * rr, 0.01],
                    cols, sides=9)
    # ---- the neck ---------------------------------------------------------------------------
    nk = part('Neck', 'Neck', hard=False)
    nk.loft([((0, 0.0, 2.52), 0.46, 0.4, 2.2, (0, 0, 1)), ((0, -0.06, 2.7), 0.38, 0.34, 2.2, (0, -0.2, 1)),
             ((0, -0.1, 2.84), 0.36, 0.32, 2.2, (0, -0.2, 1))], SKIN_D, sides=16)
    nk.tube([Vector((math.sin(a) * 0.44, -0.02 + math.cos(a) * 0.38, 2.55)) for a in
             (i * math.tau / 20 for i in range(21))], [0.06] * 21, CANVAS_D, sides=6)   # the shirt collar
    # ---- the belly and the apron over it ----------------------------------------------------
    belly = part('Belly', 'Belly', hard=False)
    belly.blob((0, -0.22, 1.68), (1.6, 1.42, 1.25), CANVAS, segments=32, rings=20)
    for k in range(4):   # shirt buttons
        belly.blob((0, -0.92 + 0.02 * k, 2.0 - 0.17 * k), (0.06, 0.03, 0.06), BRASS_D, segments=6, rings=4,
                   mat=METAL)
    ap = part('ApronBib', 'Belly', hard=False)

    def bib(u, v):
        half = 0.58 - 0.12 * v
        x = u * half
        z = 1.22 + v * 0.95
        k = 1.0 - (x / 0.8) ** 2 - ((z - 1.68) / 0.63) ** 2
        y = -0.22 - 0.71 * math.sqrt(max(0.0, k)) - 0.04 if k > 0 else -0.75
        return Vector((x, y - 0.015 * math.sin(u * 8), z))

    nu, nv = 16, 12
    before = set(ap.bm.faces)
    rows = [[ap.bm.verts.new(bib(-1 + 2 * i / nu, j / nv)) for i in range(nu + 1)] for j in range(nv + 1)]
    back = [[ap.bm.verts.new(v.co + Vector((0, 0.03, 0))) for v in row] for row in rows]
    for j in range(nv):
        for i in range(nu):
            ap.bm.faces.new((rows[j][i], rows[j + 1][i], rows[j + 1][i + 1], rows[j][i + 1]))
            ap.bm.faces.new((back[j][i], back[j][i + 1], back[j + 1][i + 1], back[j + 1][i]))
    ring_ = ([(0, i) for i in range(nu + 1)] + [(j, nu) for j in range(1, nv + 1)]
             + [(nv, i) for i in range(nu - 1, -1, -1)] + [(j, 0) for j in range(nv - 1, 0, -1)])
    for (j0, i0), (j1, i1) in zip(ring_, ring_[1:] + ring_[:1]):
        ap.bm.faces.new((rows[j0][i0], back[j0][i0], back[j1][i1], rows[j1][i1]))
    ap._paint(ap._new_faces(before), LEATHER, BODY)
    border = ([bib(-1 + 2 * i / nu, 0.0) for i in range(nu + 1)] + [bib(1.0, j / nv) for j in range(1, nv + 1)]
              + [bib(1 - 2 * i / nu, 1.0) for i in range(1, nu + 1)] + [bib(-1.0, 1 - j / nv) for j in range(1, nv)])
    ap.tube([q + Vector((0, -0.01, 0)) for q in border] + [border[0] + Vector((0, -0.01, 0))],
            [0.022] * (len(border) + 1), LEATHER_D, sides=6, cap=False)
    for (u0, u1, v0, v1) in ((-0.8, -0.15, 0.25, 0.55), (0.15, 0.8, 0.25, 0.55)):   # tool pockets
        pk = [bib(u, v) + Vector((0, -0.03, 0)) for u, v in ((u0, v0), (u1, v0), (u1, v1), (u0, v1))]
        ap.tube(pk + [pk[0]], [0.018] * 5, LEATHER_D, sides=5, cap=False)
        ap.blob(tuple(pk[0].lerp(pk[2], 0.5) + Vector((0, -0.02, -0.02))), (0.32, 0.06, 0.22),
                lerp(LEATHER, LEATHER_D, 0.3), segments=10, rings=6)
    # a screwdriver and a pencil in the pockets
    ap.cyl(bib(-0.5, 0.5) + Vector((0, -0.05, 0)), bib(-0.55, 0.78) + Vector((0, -0.06, 0)), 0.025, (0.62, 0.15, 0.1),
           sides=8, mat=BODY)
    ap.cyl(bib(0.45, 0.5) + Vector((0, -0.05, 0)), bib(0.5, 0.75) + Vector((0, -0.06, 0)), 0.02, STEEL, sides=8)
    # ---- the belt and the apron skirt -----------------------------------------------------
    belt = part('Belt', 'Hips')
    belt.tube([Vector((math.sin(a) * 0.86, -0.2 - math.cos(a) * 0.74, 1.22)) for a in
               (i * math.tau / 32 for i in range(33))], [0.08] * 33, LEATHER_D, sides=6, cap=False)
    belt.obox((0, -0.98, 1.22), (0.32, 0.06, 0.26), basis((0, -1, 0)), BRASS, mat=METAL, bevel=0.03)
    belt.obox((0, -1.01, 1.22), (0.18, 0.04, 0.14), basis((0, -1, 0)), IRON_D, mat=METAL, bevel=0.02)
    for s in (-1, 1):   # pouches and a hanging hammer loop
        belt.obox((s * 0.72, -0.62, 1.1), (0.26, 0.16, 0.26), basis((s * 0.6, -0.8, 0)), LEATHER, bevel=0.04)
        belt.obox((s * 0.72, -0.71, 1.19), (0.28, 0.06, 0.1), basis((s * 0.6, -0.8, 0)), LEATHER_D, bevel=0.02)
    skirt = part('ApronSkirt', 'Apron', hard=False)
    sk = []
    for j in range(9):
        a = math.radians(-50 + 100 * j / 8)
        top = Vector((math.sin(a) * 0.85, -0.25 - math.cos(a) * 0.68, 1.2))
        low = Vector((math.sin(a) * 0.9, -0.25 - math.cos(a) * 0.74, 0.6))
        sk.append((top, low))
    before = set(skirt.bm.faces)
    rows = []
    for j, (top, low) in enumerate(sk):
        rows.append([skirt.bm.verts.new(top.lerp(low, t) + Vector((0, -0.02 * math.sin(j * 1.9) * t, 0)))
                     for t in (0, 0.25, 0.5, 0.75, 1.0)])
    backs = [[skirt.bm.verts.new(v.co + Vector((0, 0.03, 0))) for v in r] for r in rows]
    for j in range(len(rows) - 1):
        for t in range(4):
            skirt.bm.faces.new((rows[j][t], rows[j][t + 1], rows[j + 1][t + 1], rows[j + 1][t]))
            skirt.bm.faces.new((backs[j][t], backs[j + 1][t], backs[j + 1][t + 1], backs[j][t + 1]))
    for j in range(len(rows) - 1):
        skirt.bm.faces.new((rows[j][4], backs[j][4], backs[j + 1][4], rows[j + 1][4]))
    skirt._paint(skirt._new_faces(before), LEATHER, BODY)
    skirt.tube([r[4].co + Vector((0, -0.01, 0)) for r in rows], [0.025] * len(rows), LEATHER_D, sides=6)
    # ---- the chest: shirt, braces and the steam harness straps, the valve box ---------------
    ch = part('Chest', 'Chest', hard=False)
    ch.loft([((0, 0.0, 1.95), 0.78, 0.62, 2.2, (0, 0, 1)), ((0, 0.02, 2.25), 0.88, 0.66, 2.3, (0, 0, 1)),
             ((0, 0.03, 2.48), 0.86, 0.6, 2.4, (0, 0, 1)), ((0, 0.0, 2.6), 0.55, 0.45, 2.2, (0, 0, 1))],
            CANVAS, sides=20)
    for s in (-1, 1):
        sh = Vector((s * 0.78, 0.04, 2.42))
        ch.blob(tuple(sh), (0.56, 0.6, 0.5), CANVAS, segments=14, rings=10)
        # harness straps over the shoulders, down the front to the belt
        strap_pts = [Vector((s * 0.42, 0.6, 2.5)), Vector((s * 0.5, 0.2, 2.68)), Vector((s * 0.5, -0.38, 2.42)),
                     Vector((s * 0.46, -0.66, 2.0)), Vector((s * 0.42, -0.78, 1.6))]
        ch.tube(strap_pts, [0.06] * 5, LEATHER_D, sides=6, squash=0.35, up=(0, -1, 0))
        ch.obox(tuple(strap_pts[2] + Vector((0, -0.04, 0))), (0.16, 0.05, 0.13), basis((0, -1, 0.4)), BRASS,
                mat=METAL, bevel=0.015)
    ch.tube([Vector((-0.5, -0.5, 2.2)), Vector((0, -0.62, 2.24)), Vector((0.5, -0.5, 2.2))], [0.05] * 3,
            LEATHER_D, sides=6, squash=0.4, up=(0, -1, 0))
    vb = part('ValveBox', 'Chest')
    vbc = Vector((-0.42, -0.62, 2.12))
    vb.obox(tuple(vbc), (0.42, 0.24, 0.36), basis((0, -1, 0)), BRASS, mat=METAL, bevel=0.035)
    vb.obox(tuple(vbc + Vector((0, -0.12, 0))), (0.34, 0.03, 0.28), basis((0, -1, 0)), BRASS_D, mat=METAL,
            bevel=0.01)
    vb.gauge(tuple(vbc + Vector((0.13, -0.15, 0.06))), (0, -1, 0), 0.075, ticks=7)
    vb.hazard(vbc + Vector((-0.2, -0.13, -0.15)), vbc + Vector((0.2, -0.13, -0.15)), (0, -1, 0), 0.06, 6)
    vb.pipe([vbc + Vector((0.2, 0, 0.1)), Vector((-0.1, -0.5, 2.38)), Vector((0.1, 0.2, 2.6)),
             Vector((0.22, 0.55, 2.55))], 0.035, COPPER)
    # ---- the great lever (its own bone: he yanks it) ------------------------------------------
    lv = part('Lever', 'Lever')
    l0, l1 = REST['Lever']
    lv.cyl(l0 - Vector((0.08, 0, 0)), l0 + Vector((0.08, 0, 0)), 0.07, IRON, sides=12)
    lv.cyl(l0, l1 + (l1 - l0) * 0.6, 0.032, BRASS, sides=10)
    tip = l1 + (l1 - l0) * 0.6
    lv.blob(tuple(tip), (0.16, 0.16, 0.16), SIGNAL_RED, segments=12, rings=8, mat=METAL)
    # ---- the boiler pack, its stacks, horn, beacon and the big gauge --------------------------
    pk = part('Pack', 'Pack')
    pc = Vector((0, 0.86, 2.3))
    pk.cyl(pc - Vector((0, 0, 0.62)), pc + Vector((0, 0, 0.58)), 0.46, BRASS, sides=24)
    pk.blob(tuple(pc + Vector((0, 0, 0.58))), (0.92, 0.92, 0.5), BRASS, segments=24, rings=10, mat=METAL)
    pk.blob(tuple(pc - Vector((0, 0, 0.62))), (0.92, 0.92, 0.36), BRASS_D, segments=24, rings=8, mat=METAL)
    for z in (-0.45, -0.05, 0.38):
        pk.ring(pc + Vector((0, 0, z)), (0, 0, 1), 0.47, 0.04, IRON, sides=28)
        pk.rivet_circle(pc + Vector((0, 0, z + 0.06)), (0, 0, 1), 0.47, 16, 0.022, BRASS_D)
    pk.rivet_line(pc + Vector((0.0, 0.47, -0.55)), pc + Vector((0.0, 0.47, 0.5)), 8, 0.022, BRASS_D,
                  normal=(0, 1, 0))
    # the frame that straps it on
    for s in (-1, 1):
        pk.obox((s * 0.42, 0.52, 2.3), (0.08, 0.14, 1.3), basis((0, 0, 1)), IRON, mat=METAL, bevel=0.02)
        pk.rivet_line((s * 0.42, 0.44, 1.75), (s * 0.42, 0.44, 2.85), 5, 0.022, BRASS_D, normal=(0, -1, 0))
    pk.obox((0, 0.52, 1.72), (0.92, 0.14, 0.1), basis((0, 0, 1)), IRON, mat=METAL, bevel=0.02)
    # two short stacks, sooty at the lip
    for s, h in ((-1, 0.62), (1, 0.48)):
        b = pc + Vector((s * 0.2, 0.12, 0.72))
        pk.cyl(b, b + Vector((0, 0.05, h)), 0.09, IRON, sides=12, r2=0.1)
        pk.ring(b + Vector((0, 0.05, h)), (0, 0, 1), 0.11, 0.03, IRON_D, sides=14)
        pk.disc(tuple(b + Vector((0, 0.05, h - 0.02))), (0, 0, 1), 0.075, 0.02, BLACK, sides=12)
    # the klaxon horn
    hb = pc + Vector((-0.34, -0.05, 0.75))
    pk.cyl(hb, hb + Vector((-0.08, 0.18, 0.32)), 0.05, BRASS_D, sides=10, r2=0.06)
    pk.lathe(tuple(hb + Vector((-0.08, 0.18, 0.32))), [(0.06, 0), (0.1, 0.12), (0.2, 0.24), (0.24, 0.27),
                                                         (0.0, 0.27)], 16, BRASS_HI, mat=METAL)
    # the gauge, big and readable from behind
    pk.cyl(GAUGE_C - GAUGE_N * 0.25, GAUGE_C - GAUGE_N * 0.04, 0.08, BRASS_D, sides=10)
    pk.gauge(tuple(GAUGE_C), tuple(GAUGE_N), GAUGE_R, ticks=11, up=(0, -0.62, 0.78))
    # the gauge needle on its own bone, resting at the dial's low end
    nd = part('GaugeNeedle', 'GaugeNeedle')
    nd.needle(tuple(GAUGE_C), tuple(GAUGE_N), GAUGE_R, 225.0, SIGNAL_RED, up=(0, -0.62, 0.78))
    # the caged beacon's housing on the pack, its lamp on its own bone
    b0 = Vector(REST['Beacon'][0])
    pk.cyl(b0 - Vector((0, 0, 0.14)), b0, 0.13, IRON, sides=14)
    bc = part('Beacon', 'Beacon')
    bc.blob(tuple(b0 + Vector((0, 0, 0.12))), (0.2, 0.2, 0.24), WARN, segments=12, rings=8, mat=GLOW)
    bc.obox(tuple(b0 + Vector((0.0, 0.0, 0.12))), (0.04, 0.24, 0.2), basis((0, 0, 1)), IRON_D, mat=METAL)
    for k in range(4):
        a = math.tau * k / 4 + 0.4
        bc.cyl(b0 + Vector((math.cos(a) * 0.14, math.sin(a) * 0.14, 0.0)),
               b0 + Vector((math.cos(a) * 0.14, math.sin(a) * 0.14, 0.27)), 0.012, IRON_D, sides=5)
    bc.disc(tuple(b0 + Vector((0, 0, 0.28))), (0, 0, 1), 0.15, 0.03, IRON_D, sides=14)
    # copper hoses from the pack round to the mech arms
    for s in (-1, 1):
        pk.pipe([pc + Vector((s * 0.4, -0.1, 0.3)), Vector((s * 0.7, 0.6, 2.7)), Vector((s * 0.66, 0.72, 2.82))],
                0.04, COPPER)
    # ---- the mechanical arms: brass segments, pistons, gears, the tools ----------------------
    for s, tag in ((1, '.L'), (-1, '.R')):
        a0, a1 = (M(v, s) for v in REST['MechArm.L'])
        f0, f1 = (M(v, s) for v in REST['MechFore.L'])
        h0, h1 = (M(v, s) for v in REST['MechHand.L'])
        up_ = part('MechArm' + tag, 'MechArm' + tag)
        up_.gear(tuple(a0 + Vector((s * 0.08, 0, 0))), (s, 0.2, 0.0), 0.3, 14, 0.08, BRASS)
        up_.cyl(a0 - Vector((s * 0.14, 0, 0)), a0 + Vector((s * 0.16, 0, 0)), 0.2, IRON, sides=16)
        up_.disc(tuple(a0 + Vector((s * 0.17, 0, 0))), (s, 0, 0), 0.12, 0.03, BRASS_HI, sides=14)
        d = (a1 - a0).normalized()
        fr = basis(d, (s * 0.3, 0.2, 1.0))
        L = (a1 - a0).length
        up_.obox(tuple(a0.lerp(a1, 0.5)), (0.26, 0.2, L * 0.95), fr, BRASS, mat=METAL, bevel=0.04)
        for side_ in (1, -1):
            up_.obox(tuple(a0.lerp(a1, 0.5) + fr.col[0] * side_ * 0.135), (0.03, 0.24, L * 0.78), fr, IRON,
                     mat=METAL, bevel=0.01)
            up_.rivet_line(a0.lerp(a1, 0.15) + fr.col[0] * side_ * 0.152,
                           a0.lerp(a1, 0.85) + fr.col[0] * side_ * 0.152, 6, 0.02, BRASS_D,
                           normal=tuple(fr.col[0] * side_))
        up_.piston(a0.lerp(a1, 0.12) - fr.col[1] * 0.2, a0.lerp(a1, 0.88) - fr.col[1] * 0.2, 0.06)
        up_.hazard(a0.lerp(a1, 0.3) + fr.col[1] * 0.1, a0.lerp(a1, 0.7) + fr.col[1] * 0.1, tuple(fr.col[1]), 0.2, 5)
        lo = part('MechFore' + tag, 'MechFore' + tag)
        lo.cyl(f0 - Vector((s * 0.16, 0, 0)), f0 + Vector((s * 0.16, 0, 0)), 0.19, IRON_HI, sides=16)
        lo.gear(tuple(f0 + Vector((s * 0.12, 0, 0))), (s, 0, 0), 0.24, 12, 0.06, BRASS_D)
        lo.disc(tuple(f0 + Vector((s * 0.18, 0, 0))), (s, 0, 0), 0.1, 0.03, BRASS_HI, sides=12)
        d = (f1 - f0).normalized()
        fr = basis(d, (s * 0.2, 0.0, 1.0))
        L = (f1 - f0).length
        lo.obox(tuple(f0.lerp(f1, 0.5)), (0.24, 0.22, L * 0.92), fr, BRASS, mat=METAL, bevel=0.04, taper=0.82)
        lo.obox(tuple(f0.lerp(f1, 0.5) - fr.col[1] * 0.115), (0.18, 0.03, L * 0.7), fr, IRON, mat=METAL, bevel=0.01)
        lo.piston(f0.lerp(f1, 0.08) + fr.col[1] * 0.18, f0.lerp(f1, 0.92) + fr.col[1] * 0.16, 0.055)
        lo.pipe([f0.lerp(f1, 0.1) - fr.col[1] * 0.16 + fr.col[0] * 0.08, f0.lerp(f1, 0.5) - fr.col[1] * 0.2,
                 f0.lerp(f1, 0.9) - fr.col[1] * 0.15 + fr.col[0] * 0.06], 0.032, COPPER)
        lo.cyl(f1 - Vector((s * 0.14, 0, 0)), f1 + Vector((s * 0.14, 0, 0)), 0.15, IRON, sides=14)
        tool = part('MechHand' + tag, 'MechHand' + tag)
        hd = (h1 - h0).normalized()
        if s < 0:
            # The giant adjustable wrench: the handle runs down the segment, the
            # open jaw at its end (the jaw opening faces down, the thumbscrew in it).
            fr = basis(hd, (0, 0, 1))
            tool.cyl(h0 - fr.col[0] * 0.16, h0 + fr.col[0] * 0.16, 0.16, IRON, sides=14)
            tool.obox(tuple(h0 + hd * 0.5), (0.2, 0.13, 1.0), fr, STEEL, mat=METAL, bevel=0.035)
            tool.obox(tuple(h0 + hd * 0.5), (0.23, 0.07, 0.8), fr, IRON_HI, mat=METAL, bevel=0.012)
            tool.hazard(h0 + hd * 0.15 + fr.col[1] * 0.07, h0 + hd * 0.75 + fr.col[1] * 0.07, tuple(fr.col[1]), 0.19,
                        6)
            hc = h0 + hd * 1.12
            tool.obox(tuple(hc), (0.3, 0.2, 0.42), fr, STEEL, mat=METAL, bevel=0.05)
            for side_, k in ((1, 1.0), (-1, 0.82)):
                jaw_c = hc + hd * 0.3 + fr.col[1] * side_ * 0.24
                tool.obox(tuple(jaw_c), (0.28, 0.16, 0.42 * k), fr, STEEL, mat=METAL, bevel=0.04)
                tool.obox(tuple(jaw_c + hd * 0.22 * k - fr.col[1] * side_ * 0.05), (0.26, 0.24, 0.12), fr, IRON_HI,
                          mat=METAL, bevel=0.03)
            tool.cyl(hc - fr.col[0] * 0.16 - hd * 0.02, hc + fr.col[0] * 0.16 - hd * 0.02, 0.08, BRASS, sides=12)
            for k in range(7):
                tool.ring(hc - hd * 0.02 + fr.col[0] * (-0.12 + 0.04 * k), fr.col[0], 0.083, 0.012, BRASS_D, sides=12)
            tool.rivets([hc + fr.col[0] * 0.15 + fr.col[1] * 0.12 + hd * 0.1,
                         hc + fr.col[0] * 0.15 - fr.col[1] * 0.12 + hd * 0.1], 0.025, BRASS_D)
        else:
            # The drum-fed riveter: a stocky gun body, a barrel with a flared nozzle,
            # a rivet drum on top (its own bone, it turns as it feeds).
            fr = basis(hd, (0, 0, 1))
            tool.cyl(h0 - fr.col[0] * 0.16, h0 + fr.col[0] * 0.16, 0.16, IRON, sides=14)
            tool.obox(tuple(h0 + hd * 0.26), (0.34, 0.32, 0.5), fr, BRASS, mat=METAL, bevel=0.05)
            tool.obox(tuple(h0 + hd * 0.26 - fr.col[1] * 0.17), (0.26, 0.04, 0.4), fr, IRON, mat=METAL, bevel=0.01)
            tool.cyl(h0 + hd * 0.45, h0 + hd * 1.15, 0.1, IRON_HI, sides=16)
            for k in range(5):
                tool.ring(h0 + hd * (0.55 + 0.11 * k), hd, 0.112, 0.025, IRON_D, sides=16)
            tool.lathe(tuple(h0 + hd * 1.15), [(0.1, 0), (0.14, 0.08), (0.16, 0.14), (0.09, 0.17), (0.0, 0.17)], 16,
                       BRASS_D, mat=METAL)
            tool.disc(tuple(h0 + hd * 1.32), tuple(hd), 0.06, 0.02, BLACK, sides=12)
            tool.pipe([h0 + hd * 0.1 - fr.col[1] * 0.2, h0 + hd * 0.8 - fr.col[1] * 0.14], 0.035, COPPER)
            tool.gauge(tuple(h0 + hd * 0.26 + fr.col[0] * 0.18), tuple(fr.col[0]), 0.09, ticks=5)
            tool.hazard(h0 + hd * 0.05 + fr.col[1] * 0.165, h0 + hd * 0.48 + fr.col[1] * 0.165, tuple(fr.col[1]), 0.26,
                        4)
            dr = part('RivetDrum', 'RivetDrum')
            d0 = Vector(REST['RivetDrum'][0])
            dr.cyl(d0, d0 + Vector((0, 0, 0.18)), 0.25, BRASS_D, sides=20)
            for k in range(12):
                a = math.tau * k / 12
                dr.blob(tuple(d0 + Vector((math.cos(a) * 0.18, math.sin(a) * 0.18, 0.2))), (0.08, 0.08, 0.06),
                        STEEL, segments=6, rings=4, mat=METAL)
            dr.ring(d0 + Vector((0, 0, 0.08)), (0, 0, 1), 0.255, 0.025, IRON, sides=22)
            dr.disc(tuple(d0 + Vector((0, 0, 0.19))), (0, 0, 1), 0.08, 0.03, IRON_D, sides=12)
    # ---- arms: rolled shirt sleeves, thick forearms, leather gauntlets -----------------------
    for s, tag in ((1, '.L'), (-1, '.R')):
        a0, a1 = (M(v, s) for v in REST['Arm.L'])
        ad = (a1 - a0).normalized()
        up_ = part('Arm' + tag, 'Arm' + tag, hard=False)
        up_.loft([(tuple(a0.lerp(a1, t)), w, w * 0.95, 2.1, tuple(ad)) for t, w in
                  ((0.0, 0.3), (0.2, 0.32), (0.55, 0.28), (0.85, 0.24), (1.0, 0.22))], CANVAS, sides=16)
        roll_c = a0.lerp(a1, 0.86)
        e1 = ad.orthogonal().normalized()
        e2 = ad.cross(e1).normalized()
        up_.tube([roll_c + (e1 * math.cos(k * math.tau / 18) + e2 * math.sin(k * math.tau / 18)) * 0.25
                  for k in range(19)], [0.07] * 19, CANVAS_D, sides=7, cap=False)
        f0, f1 = (M(v, s) for v in REST['Fore.L'])
        fd = (f1 - f0).normalized()
        lo = part('Fore' + tag, 'Fore' + tag, hard=False)
        lo.tube([f0.lerp(f1, t) for t in (0.0, 0.25, 0.55, 0.62, 0.8, 1.0)], [0.21, 0.24, 0.22, 0.25, 0.26, 0.25],
                [SKIN, SKIN, SKIN, LEATHER, LEATHER, LEATHER], sides=14)
        lo.tube([f0.lerp(f1, 0.62), f0.lerp(f1, 0.62) + fd * 0.01], [0.3, 0.3], LEATHER_D, sides=14)  # the cuff
        lo.rivets([f0.lerp(f1, 0.62) + M(Vector((0.29, 0, 0)), s), f0.lerp(f1, 0.62) + Vector((0, -0.29, 0))],
                  0.02, BRASS_D)
        for k in range(3):   # forearm hair
            q = f0.lerp(f1, 0.2 + 0.12 * k) + Vector((0, -0.21, 0))
            lo.blob(tuple(q), (0.12, 0.03, 0.06), lerp(HAIR, SKIN_D, 0.5), segments=6, rings=4)
        h0, h1 = (M(v, s) for v in REST['Hand.L'])
        hd = (h1 - h0).normalized()
        hand = part('Hand' + tag, 'Hand' + tag, hard=False)
        fwd = Vector((0, -1, 0))
        hand.blob(tuple(h0 + hd * 0.12), (0.34, 0.3, 0.32), LEATHER, segments=14, rings=10)
        for k in range(4):
            off = M(Vector(((k - 1.5) * 0.075, 0, 0)), s)
            kn = h0 + hd * 0.24 + fwd * 0.1 + off
            hand.tube([kn, kn + hd * 0.08 + fwd * 0.03, kn + hd * 0.11 - fwd * 0.06, kn + hd * 0.06 - fwd * 0.12],
                      [0.048, 0.046, 0.042, 0.036], LEATHER, sides=8)
        th = h0 + hd * 0.06 + fwd * 0.1 + M(Vector((-0.15, 0, 0)), s)
        hand.tube([th, th + hd * 0.1 + fwd * 0.05 + M(Vector((0.06, 0, 0)), s),
                   th + hd * 0.16 + fwd * 0.06 + M(Vector((0.14, 0, 0)), s)], [0.055, 0.05, 0.04], LEATHER, sides=8)
    # ---- legs: short and thick, steel-capped boots ------------------------------------------
    for s, tag in ((1, '.L'), (-1, '.R')):
        t0, t1 = (M(v, s) for v in REST['Thigh.L'])
        th = part('Thigh' + tag, 'Thigh' + tag, hard=False)
        th.tube([t0.lerp(t1, t) for t in (0, 0.4, 0.8, 1.0)], [0.38, 0.36, 0.3, 0.27], TROUSER, sides=14)
        k0, k1 = (M(v, s) for v in REST['Shin.L'])
        sh = part('Shin' + tag, 'Shin' + tag, hard=False)
        sh.tube([k0.lerp(k1, t) for t in (0, 0.3, 0.6, 1.0)], [0.27, 0.3, 0.31, 0.3], BOOT, sides=14)
        sh.tube([k0.lerp(k1, 0.1), k0.lerp(k1, 0.0)], [0.34, 0.34], BOOT, sides=14)
        sh.ring(k0.lerp(k1, 0.5), (0, 0, 1), 0.31, 0.025, BRASS_D, sides=16)
        o0, o1 = (M(v, s) for v in REST['Foot.L'])
        ft = part('Foot' + tag, 'Foot' + tag, hard=False)
        ft.loft([(tuple(o0 + Vector((0, 0.1, -0.03))), 0.27, 0.15, 2.6, (0, -1, 0)),
                 (tuple(o0.lerp(o1, 0.6) + Vector((0, 0, -0.01))), 0.29, 0.14, 2.6, (0, -1, 0)),
                 (tuple(o1 + Vector((0, 0.0, 0.04))), 0.24, 0.11, 2.4, (0, -1, 0))], BOOT, sides=12)
        ft.blob(tuple(o1 + Vector((0, 0.04, 0.06))), (0.44, 0.24, 0.22), STEEL, segments=12, rings=8, mat=METAL,
                flat_bottom=True)
        ft.obox(tuple(o0.lerp(o1, 0.5) + Vector((0, -0.02, -0.11))), (0.46, 0.66, 0.04), basis((0, 0, 1)), BLACK,
                bevel=0.012)
    return parts


# --------------------------------------------------------------------------- clips
def make_clips(arm):
    rig = MachineRig(BONES).attach(arm)
    P = rig.pose
    clips = []

    def add(name, frames, fn, loop=True):
        anim(arm, name, frames, fn, loop)
        clips.append(name)

    head_rest = (REST['Head'][1] - REST['Head'][0]).normalized()
    drum_axis = (REST['RivetDrum'][1] - REST['RivetDrum'][0]).normalized()

    def rz(v, deg):
        a = math.radians(deg)
        return Vector((v[0] * math.cos(a) - v[1] * math.sin(a), v[0] * math.sin(a) + v[1] * math.cos(a), v[2]))

    def stance(root=(0, 0, 0), yaw=0.0, tilt=0.0, lean=0.0, side=0.0, twist=0.0, look=(0.0, 0.0), jaw=2.0,
               stache=0.0, belly=1.0, wrist_l=(1.18, -0.42, 1.3), wrist_r=(-1.18, -0.42, 1.3),
               hand_l=(0.05, -0.3, -1.0), hand_r=(-0.05, -0.3, -1.0), foot_l=(0.46, 0.0, 0.22),
               foot_r=(-0.46, 0.0, 0.22), mech_l=(1.6, -0.5, 3.0), mech_r=(-1.6, -0.5, 3.1),
               tool_l=(0.05, -1.0, -0.2), tool_r=(-0.1, -0.7, 0.7), lever=0.0, beacon=0.0, drum=0.0,
               pack=0.0, apron=0.0):
        """One pose. Hands, mech tools and feet are targets in the body's frame
        (root + yaw), except the feet, which stay planted where given."""
        rootv = Vector(root)
        rm = Matrix.Rotation(math.radians(yaw), 3, 'Z') @ Matrix.Rotation(math.radians(tilt), 3, 'X')

        def rz(v, _deg=0.0):
            return rm @ Vector(v)

        def body(v):
            return tuple(rootv + rz(v))

        aims = {
            'Spine': tuple(rz((side * 0.3, -0.04 - lean * 0.5, 1.0), yaw)),
            'Chest': tuple(rz((side * 0.5, 0.06 - lean, 1.0), yaw)),
            'Head': tuple(rz(head_rest + Vector((look[0], 0.0, look[1])), yaw)),
            'Hand.L': tuple(rz(hand_l, yaw)),
            'Hand.R': tuple(rz(hand_r, yaw)),
            'MechHand.L': tuple(rz(tool_l, yaw)),
            'MechHand.R': tuple(rz(tool_r, yaw)),
            'Foot.L': (0.0, -1.0, -0.3),
            'Foot.R': (0.0, -1.0, -0.3),
            'Apron': tuple(rz((0, -0.08 - apron, -1.0), yaw)),
        }
        turns = {'Root': [('x', tilt), ('z', yaw)], 'Spine': [('z', twist * 0.4)], 'Chest': [('z', twist * 0.6)],
                 'Jaw': [('x', jaw)], 'Stache': [('x', -stache * 0.5)], 'Lever': [('x', lever)],
                 'Beacon': [('z', beacon)], 'RivetDrum': [(tuple(drum_axis), drum)], 'Pack': [('x', pack)]}
        ik = {
            'arm.L': ('Arm.L', 'Fore.L', body(wrist_l), tuple(rz((1.2, 0.8, -0.3), yaw))),
            'arm.R': ('Arm.R', 'Fore.R', body(wrist_r), tuple(rz((-1.2, 0.8, -0.3), yaw))),
            'leg.L': ('Thigh.L', 'Shin.L', foot_l, (0.3, -1.0, 0.2)),
            'leg.R': ('Thigh.R', 'Shin.R', foot_r, (-0.3, -1.0, 0.2)),
            'mech.L': ('MechArm.L', 'MechFore.L', body(mech_l), tuple(rz((0.7, 0.4, 1.0), yaw))),
            'mech.R': ('MechArm.R', 'MechFore.R', body(mech_r), tuple(rz((-0.7, 0.4, 1.0), yaw))),
        }
        scales = {'Belly': belly, 'Stache': (1.0 + stache * 0.004, 1.0, 1.0 + stache * 0.006)}
        return P(aims=aims, ik=ik, turns=turns, root=root, scales=scales)

    # ---- Idle: breathing, the moustache twitching, the arms hovering ------------------------
    def idle(f):
        ph = math.tau * f / 72
        b = math.sin(ph)
        return stance(root=(0, 0, -0.02 + 0.025 * b), belly=1.0 + 0.03 * b, look=(0.12 * math.sin(ph * 0.5), 0.02 * b),
                      stache=6 * max(0.0, math.sin(ph * 3)) ** 8, jaw=2 + 2 * max(0.0, b),
                      mech_l=(1.6 + 0.05 * math.sin(ph + 1), -0.5 + 0.06 * b, 3.0 + 0.06 * math.sin(ph + 0.5)),
                      mech_r=(-1.55 + 0.04 * math.sin(ph), -0.45 - 0.05 * b, 3.12 + 0.08 * math.sin(ph + 2)),
                      tool_r=(-0.1, -0.7 + 0.05 * b, 0.7), drum=6 * math.sin(ph),
                      wrist_l=(1.1, -0.55, 1.33 + 0.02 * b), hand_l=(-0.2, -0.3, -1.0),
                      wrist_r=(-0.62, -0.95, 1.85 + 0.02 * b), hand_r=(0.2, -0.6, 0.6))
    add('Idle', 72, idle)

    def stride(ph, amp, run_=False):
        sl = 0.36 * amp
        lift = 0.2 * amp
        fl = (0.46, 0.0 - sl * math.cos(ph), 0.22 + lift * max(0.0, math.sin(ph)))
        fr = (-0.46, 0.0 + sl * math.cos(ph), 0.22 + lift * max(0.0, -math.sin(ph)))
        bob = abs(math.cos(ph))
        sw = math.sin(ph)
        return stance(root=(0.06 * sw * amp, -0.05 * amp, -0.03 - 0.06 * bob * amp), lean=0.08 + (0.12 if run_ else 0),
                      twist=-14 * sw * amp, side=0.05 * sw, foot_l=fl, foot_r=fr, belly=1.0 + 0.02 * bob,
                      wrist_l=(1.12, -0.4 - 0.3 * math.cos(ph) * amp, 1.38), wrist_r=(-1.12, -0.4 + 0.3 * math.cos(ph) * amp, 1.38),
                      mech_l=(1.62, -0.4 + 0.12 * math.cos(ph) * amp, 3.0 + 0.1 * bob * amp),
                      mech_r=(-1.6, -0.4 - 0.12 * math.cos(ph) * amp, 3.1 + 0.1 * bob * amp),
                      look=(0.05 * sw, -0.03), jaw=3 + 3 * amp, stache=3 * bob, pack=2 * bob * amp,
                      apron=0.15 * math.sin(ph * 2) * amp, drum=8 * sw)
    add('Walk', 32, lambda f: stride(math.tau * f / 32, 1.0))
    add('Run', 20, lambda f: stride(math.tau * f / 20, 1.45, True))

    ready = dict(wrist_l=(1.1, -0.55, 1.33), hand_l=(-0.2, -0.3, -1.0), wrist_r=(-0.62, -0.95, 1.85),
                 hand_r=(0.2, -0.6, 0.6))

    def oneshot(spec, extra=None):
        tr = tracks(spec)

        def fn(f):
            kw = dict(ready)
            kw.update(extra or {})
            kw.update(tr(f))
            return stance(**kw)
        return fn

    # ---- WrenchSlam: the wrench hauled up and back, held, brought down like a hammer -------
    add('WrenchSlam', 32, oneshot({
        'mech_r': [(0, (-1.55, -0.45, 3.12)), (9, (-1.1, 0.45, 4.2)), (13, (-1.0, 0.55, 4.3)),
                   (16, (-0.9, -1.75, 1.7), 'in'), (18, (-0.88, -1.8, 1.6), 'back'), (25, (-1.2, -1.1, 2.4)),
                   (32, (-1.55, -0.45, 3.12))],
        'tool_r': [(0, (-0.1, -0.7, 0.7)), (9, (0.1, 0.9, 0.8)), (13, (0.15, 1.0, 0.7)), (16, (0.0, -0.7, -1.0), 'in'),
                   (18, (0.0, -0.6, -1.0)), (25, (-0.1, -0.9, 0.0)), (32, (-0.1, -0.7, 0.7))],
        'lean': [(0, 0.0), (9, -0.22), (13, -0.25), (16, 0.32, 'in'), (18, 0.36, 'back'), (25, 0.12), (32, 0.0)],
        'twist': [(0, 0), (9, -18), (13, -20), (16, 12, 'in'), (22, 8), (32, 0)],
        'root': [(0, (0, 0, -0.02)), (9, (0, 0.06, 0.04)), (16, (0, -0.1, -0.16), 'in'), (18, (0, -0.12, -0.2), 'back'),
                 (26, (0, -0.04, -0.06)), (32, (0, 0, -0.02))],
        'jaw': [(0, 2), (9, 22), (14, 28), (17, 10), (32, 2)],
        'stache': [(0, 0), (9, 10), (14, 14), (18, 4), (32, 0)],
        'look': [(0, (0.0, 0.0)), (9, (-0.1, 0.2)), (16, (0.05, -0.25)), (32, (0.0, 0.0))],
        'mech_l': [(0, (1.6, -0.5, 3.0)), (9, (1.7, -0.2, 3.3)), (16, (1.5, -0.8, 2.7), 'in'), (32, (1.6, -0.5, 3.0))],
        'pack': [(0, 0), (16, 5, 'in'), (20, -2), (32, 0)],
        'belly': [(0, 1.0), (9, 1.04), (16, 0.97, 'in'), (32, 1.0)],
    }), loop=False)
    # ---- WrenchSweep: drawn wide to his right, raked flat across the front -----------------
    add('WrenchSweep', 30, oneshot({
        'mech_r': [(0, (-1.55, -0.45, 3.12)), (9, (-2.2, 0.6, 2.9)), (12, (-2.25, 0.7, 2.85)), (15, (0.2, -2.1, 2.5), 'in'),
                   (17, (1.0, -1.6, 2.5), 'back'), (23, (-0.6, -1.4, 2.8)), (30, (-1.55, -0.45, 3.12))],
        'tool_r': [(0, (-0.1, -0.7, 0.7)), (9, (-0.8, 0.6, 0.0)), (12, (-0.8, 0.6, -0.05)), (15, (0.7, -0.7, -0.1), 'in'),
                   (17, (1.0, 0.0, -0.1)), (23, (0.2, -0.8, 0.3)), (30, (-0.1, -0.7, 0.7))],
        'twist': [(0, 0), (9, -30), (12, -32), (15, 26, 'in'), (17, 32, 'back'), (24, 10), (30, 0)],
        'lean': [(0, 0.0), (9, -0.05), (15, 0.18, 'in'), (30, 0.0)],
        'side': [(0, 0.0), (9, -0.15), (15, 0.12, 'in'), (30, 0.0)],
        'root': [(0, (0, 0, -0.02)), (10, (0.08, 0.04, -0.04)), (15, (-0.06, -0.08, -0.1), 'in'), (30, (0, 0, -0.02))],
        'jaw': [(0, 2), (10, 18), (15, 30), (20, 12), (30, 2)],
        'stache': [(0, 0), (10, 8), (15, 14), (30, 0)],
        'look': [(0, (0.0, 0.0)), (10, (-0.25, 0.05)), (16, (0.15, -0.05)), (30, (0.0, 0.0))],
        'foot_l': [(0, (0.46, 0.0, 0.22)), (10, (0.5, 0.1, 0.22)), (14, (0.46, -0.25, 0.3)), (16, (0.46, -0.3, 0.22), 'in'),
                   (30, (0.46, 0.0, 0.22))],
    }), loop=False)
    # ---- Haymaker: his own gauntleted right fist, a big looping punch ------------------------
    add('Haymaker', 28, oneshot({
        'wrist_r': [(0, (-0.62, -0.95, 1.85)), (8, (-1.3, 0.3, 2.1)), (11, (-1.35, 0.35, 2.15)),
                    (14, (-0.2, -1.65, 2.05), 'in'), (16, (-0.1, -1.7, 2.0), 'back'), (22, (-0.6, -1.1, 1.7)),
                    (28, (-0.62, -0.95, 1.85))],
        'hand_r': [(0, (0.2, -0.6, 0.6)), (8, (0.0, 0.5, 0.6)), (14, (0.3, -1.0, 0.1), 'in'), (28, (0.2, -0.6, 0.6))],
        'twist': [(0, 0), (8, -26), (11, -28), (14, 24, 'in'), (16, 28), (28, 0)],
        'lean': [(0, 0.0), (8, -0.08), (14, 0.25, 'in'), (28, 0.0)],
        'root': [(0, (0, 0, -0.02)), (8, (0.04, 0.05, -0.02)), (14, (-0.04, -0.12, -0.08), 'in'), (28, (0, 0, -0.02))],
        'jaw': [(0, 2), (8, 14), (14, 30), (28, 2)],
        'stache': [(0, 0), (14, 12), (28, 0)],
        'mech_r': [(0, (-1.55, -0.45, 3.12)), (8, (-1.8, 0.2, 3.3)), (14, (-1.4, -0.8, 3.0), 'in'), (28, (-1.55, -0.45, 3.12))],
        'foot_r': [(0, (-0.46, 0.0, 0.22)), (12, (-0.5, 0.05, 0.3)), (14, (-0.46, -0.3, 0.22), 'in'), (28, (-0.46, 0.0, 0.22))],
    }), loop=False)
    # ---- LeverThrow (2 s): both hands on the chest lever, the beacon spinning, the yank ----
    add('LeverThrow', 54, oneshot({
        'wrist_r': [(0, (-0.62, -0.95, 1.85)), (7, (-0.55, -1.12, 2.5)), (34, (-0.55, -1.12, 2.5)),
                    (42, (-0.5, -1.05, 1.75), 'in'), (44, (-0.5, -1.02, 1.7), 'back'), (54, (-0.62, -0.95, 1.85))],
        'wrist_l': [(0, (1.1, -0.55, 1.33)), (8, (-0.2, -1.16, 2.45)), (34, (-0.2, -1.16, 2.45)),
                    (42, (-0.22, -1.08, 1.72), 'in'), (54, (1.1, -0.55, 1.33))],
        'hand_r': [(0, (0.2, -0.6, 0.6)), (7, (0.2, -1.0, 0.1)), (54, (0.2, -0.6, 0.6))],
        'hand_l': [(0, (-0.2, -0.3, -1.0)), (8, (-0.4, -1.0, 0.1)), (42, (-0.4, -1.0, -0.2)), (54, (-0.2, -0.3, -1.0))],
        'lever': [(0, 0.0), (7, 0.0), (34, -8.0), (42, 95.0, 'in'), (44, 88.0, 'back'), (54, 0.0)],
        'beacon': [(0, 0.0), (6, 0.0), (54, 360.0 * 3.4, 'linear')],
        'lean': [(0, 0.0), (8, 0.08), (30, 0.14), (34, -0.06), (42, 0.38, 'in'), (46, 0.3), (54, 0.0)],
        'root': [(0, (0, 0, -0.02)), (10, (0, 0.04, -0.08)), (34, (0, 0.08, 0.02)), (42, (0, -0.06, -0.28), 'in'),
                 (46, (0, -0.05, -0.24)), (54, (0, 0, -0.02))],
        'jaw': [(0, 2), (8, 6), (30, 10), (38, 32), (44, 36), (54, 2)],
        'stache': [(0, 0), (34, 6), (42, 16), (54, 0)],
        'look': [(0, (0.0, 0.0)), (8, (0.0, -0.25)), (34, (0.0, 0.15)), (42, (0.0, 0.3)), (54, (0.0, 0.0))],
        'mech_l': [(0, (1.6, -0.5, 3.0)), (10, (1.9, 0.0, 3.8)), (38, (1.95, 0.05, 3.9)), (42, (1.7, -0.6, 3.2), 'in'),
                   (54, (1.6, -0.5, 3.0))],
        'mech_r': [(0, (-1.55, -0.45, 3.12)), (10, (-1.9, 0.0, 3.85)), (38, (-1.95, 0.05, 3.95)),
                   (42, (-1.6, -0.6, 3.3), 'in'), (54, (-1.55, -0.45, 3.12))],
        'tool_l': [(0, (0.05, -1.0, -0.2)), (10, (0.3, -0.3, 0.9)), (42, (0.05, -1.0, -0.2)), (54, (0.05, -1.0, -0.2))],
        'tool_r': [(0, (-0.1, -0.7, 0.7)), (10, (-0.3, -0.3, 0.9)), (42, (-0.1, -0.8, 0.2)), (54, (-0.1, -0.7, 0.7))],
        'belly': [(0, 1.0), (30, 1.05), (42, 0.96, 'in'), (54, 1.0)],
        'pack': [(0, 0), (42, 4, 'in'), (46, -3), (54, 0)],
        'foot_l': [(0, (0.46, 0.0, 0.22)), (8, (0.56, 0.12, 0.22)), (54, (0.46, 0.0, 0.22))],
        'foot_r': [(0, (-0.46, 0.0, 0.22)), (8, (-0.56, 0.12, 0.22)), (54, (-0.46, 0.0, 0.22))],
    }), loop=False)
    # ---- RivetGun (1 s, played out): the riveter swung level, three hammering recoils --------
    aim_l = (0.9, -1.85, 2.55)
    kick = (1.0, -1.45, 2.75)
    add('RivetGun', 36, oneshot({
        'mech_l': [(0, (1.6, -0.5, 3.0)), (8, aim_l, 'out'), (10, aim_l), (11, kick, 'snap'), (13, aim_l),
                   (15, kick, 'snap'), (17, aim_l), (19, kick, 'snap'), (23, aim_l), (36, (1.6, -0.5, 3.0))],
        'tool_l': [(0, (0.05, -1.0, -0.2)), (8, (-0.25, -1.0, -0.12), 'out'), (10, (-0.25, -1.0, -0.12)),
                   (11, (-0.2, -1.0, 0.3), 'snap'), (13, (-0.25, -1.0, -0.12)), (15, (-0.2, -1.0, 0.3), 'snap'),
                   (17, (-0.25, -1.0, -0.12)), (19, (-0.2, -1.0, 0.32), 'snap'), (24, (-0.25, -1.0, -0.12)),
                   (36, (0.05, -1.0, -0.2))],
        'drum': [(0, 0), (9, 0), (23, 108, 'linear'), (36, 108)],
        'twist': [(0, 0), (8, 14), (23, 14), (36, 0)],
        'lean': [(0, 0.0), (8, 0.1), (11, 0.02, 'snap'), (13, 0.1), (15, 0.02, 'snap'), (17, 0.1), (19, 0.0, 'snap'),
                 (24, 0.08), (36, 0.0)],
        'jaw': [(0, 2), (8, 16), (12, 26), (24, 20), (36, 2)],
        'stache': [(0, 0), (11, 10), (15, 12), (19, 14), (36, 0)],
        'look': [(0, (0.0, 0.0)), (8, (0.15, -0.05)), (36, (0.0, 0.0))],
        'wrist_l': [(0, (1.1, -0.55, 1.33)), (8, (1.0, -0.85, 1.5)), (36, (1.1, -0.55, 1.33))],
    }), loop=False)
    # ---- PressSignal: a stamp of the boot, the wrench thrust at the press ---------------------
    add('PressSignal', 30, oneshot({
        'mech_r': [(0, (-1.55, -0.45, 3.12)), (8, (-1.3, 0.0, 3.7)), (13, (-0.7, -2.0, 3.4), 'in'),
                   (16, (-0.65, -2.05, 3.3), 'back'), (24, (-0.65, -2.0, 3.35)), (30, (-1.55, -0.45, 3.12))],
        'tool_r': [(0, (-0.1, -0.7, 0.7)), (8, (0.0, 0.2, 1.0)), (13, (0.1, -1.0, 0.15), 'in'), (30, (-0.1, -0.7, 0.7))],
        'foot_r': [(0, (-0.46, 0.0, 0.22)), (6, (-0.48, 0.05, 0.6)), (10, (-0.48, -0.05, 0.22), 'in'),
                   (30, (-0.46, 0.0, 0.22))],
        'root': [(0, (0, 0, -0.02)), (6, (0.06, 0.02, 0.06)), (10, (0.02, -0.04, -0.12), 'in'), (14, (0, -0.02, -0.06)),
                 (30, (0, 0, -0.02))],
        'wrist_l': [(0, (1.1, -0.55, 1.33)), (10, (0.9, -1.4, 2.4)), (24, (0.85, -1.45, 2.42)), (30, (1.1, -0.55, 1.33))],
        'hand_l': [(0, (-0.2, -0.3, -1.0)), (10, (0.0, -1.0, 0.2)), (30, (-0.2, -0.3, -1.0))],
        'jaw': [(0, 2), (10, 34), (20, 30), (30, 2)],
        'stache': [(0, 0), (10, 16), (22, 12), (30, 0)],
        'look': [(0, (0.0, 0.0)), (10, (0.1, 0.12)), (30, (0.0, 0.0))],
        'lean': [(0, 0.0), (10, 0.18, 'in'), (30, 0.0)],
    }), loop=False)
    # ---- PartsCall: the riveter whirled overhead, bellowing at the chute ---------------------
    def parts_call(f):
        tr = tracks({
            'jaw': [(0, 2), (6, 36), (30, 34), (36, 2)],
            'stache': [(0, 0), (6, 16), (30, 14), (36, 0)],
            'look': [(0, (0.0, 0.0)), (6, (-0.15, 0.35)), (30, (-0.1, 0.3)), (36, (0.0, 0.0))],
            'lean': [(0, 0.0), (6, -0.18), (30, -0.15), (36, 0.0)],
            'wrist_l': [(0, (1.1, -0.55, 1.33)), (6, (1.15, -0.9, 2.6)), (30, (1.12, -0.9, 2.55)),
                        (36, (1.1, -0.55, 1.33))],
            'hand_l': [(0, (-0.2, -0.3, -1.0)), (6, (0.0, -0.4, 1.0)), (36, (-0.2, -0.3, -1.0))],
        })(f)
        k = min(1.0, f / 6) * min(1.0, max(0.0, (36 - f) / 6))
        a = math.tau * f / 15
        ml = Vector((1.6, -0.5, 3.0)).lerp(Vector((1.2 + 0.5 * math.cos(a), -0.3 + 0.5 * math.sin(a), 4.2)), k)
        kw = dict(ready)
        kw.update(tr)
        kw.update(mech_l=tuple(ml), tool_l=(0.3 * math.cos(a), 0.3 * math.sin(a), 1.0 if k > 0.5 else -0.2),
                  drum=f * 14)
        return stance(**kw)
    add('PartsCall', 36, parts_call, loop=False)
    # ---- Cast: fiddling with the valve box ---------------------------------------------------
    def cast(f):
        ph = math.tau * f / 24
        return stance(wrist_r=(-0.5, -1.08, 2.3 + 0.04 * math.sin(ph)), hand_r=(0.2, -1.0, 0.0),
                      wrist_l=(-0.15, -1.1, 2.1 + 0.04 * math.cos(ph)), hand_l=(-0.4, -1.0, 0.0),
                      look=(0.0, -0.3), jaw=6 + 6 * max(0.0, math.sin(ph)), lever=6 * math.sin(ph))
    add('Cast', 24, cast)
    # ---- Hit: a lurch back ---------------------------------------------------------------------
    add('Hit', 16, oneshot({
        'root': [(0, (0, 0, -0.02)), (3, (0, 0.18, 0.02), 'snap'), (16, (0, 0, -0.02))],
        'lean': [(0, 0.0), (3, -0.28, 'snap'), (16, 0.0)],
        'look': [(0, (0.0, 0.0)), (3, (-0.15, 0.3), 'snap'), (16, (0.0, 0.0))],
        'jaw': [(0, 2), (3, 26, 'snap'), (16, 2)],
        'stache': [(0, 0), (3, 14, 'snap'), (16, 0)],
        'belly': [(0, 1.0), (3, 1.06, 'snap'), (16, 1.0)],
        'mech_l': [(0, (1.6, -0.5, 3.0)), (3, (1.75, 0.0, 3.4), 'snap'), (16, (1.6, -0.5, 3.0))],
        'mech_r': [(0, (-1.55, -0.45, 3.12)), (3, (-1.7, 0.05, 3.5), 'snap'), (16, (-1.55, -0.45, 3.12))],
    }), loop=False)
    # ---- Death: he staggers, sits down hard on his pack, topples back, the arms flop --------
    add('Death', 60, oneshot({
        'root': [(0, (0, 0, -0.02)), (8, (0, 0.15, -0.05)), (18, (0, 0.1, -0.45), 'in'), (26, (0, -0.2, -0.62), 'in'),
                 (30, (0, -0.22, -0.58), 'back'), (42, (0, -1.0, -0.08), 'in'), (46, (0, -1.02, -0.04), 'back'),
                 (60, (0, -1.0, -0.06))],
        'tilt': [(0, 0.0), (8, -4.0), (18, -8.0), (26, -18.0, 'in'), (30, -16.0), (42, -55.0, 'in'), (46, -52.0, 'back'),
                 (60, -53.0)],
        'lean': [(0, 0.0), (8, -0.2), (26, 0.25), (42, 0.1), (60, 0.1)],
        'foot_l': [(0, (0.46, 0.0, 0.22)), (18, (0.6, -0.3, 0.22)), (26, (0.62, -0.85, 0.24)), (42, (0.62, -0.95, 0.42)),
                   (60, (0.62, -0.95, 0.32))],
        'foot_r': [(0, (-0.46, 0.0, 0.22)), (12, (-0.5, 0.2, 0.3)), (26, (-0.6, -0.8, 0.24)), (42, (-0.62, -0.95, 0.46)),
                   (60, (-0.62, -0.95, 0.34))],
        'wrist_l': [(0, (1.1, -0.55, 1.33)), (18, (1.4, -0.3, 1.9)), (42, (1.6, -0.2, 1.5)), (60, (1.6, -0.2, 1.4))],
        'wrist_r': [(0, (-0.62, -0.95, 1.85)), (18, (-1.4, -0.3, 1.9)), (42, (-1.6, -0.2, 1.5)), (60, (-1.6, -0.2, 1.4))],
        'mech_l': [(0, (1.6, -0.5, 3.0)), (12, (1.8, 0.0, 3.5)), (30, (2.0, -0.3, 2.4), 'in'), (46, (2.1, 0.2, 1.6), 'in'),
                   (52, (2.1, 0.15, 1.65), 'back'), (60, (2.1, 0.15, 1.62))],
        'mech_r': [(0, (-1.55, -0.45, 3.12)), (12, (-1.8, 0.0, 3.5)), (30, (-2.0, -0.4, 2.3), 'in'),
                   (46, (-2.1, 0.1, 1.5), 'in'), (52, (-2.1, 0.05, 1.55), 'back'), (60, (-2.1, 0.05, 1.52))],
        'tool_l': [(0, (0.05, -1.0, -0.2)), (30, (0.4, -0.6, -0.7)), (60, (0.6, -0.2, -0.8))],
        'tool_r': [(0, (-0.1, -0.7, 0.7)), (30, (-0.4, -0.6, -0.7)), (60, (-0.6, -0.3, -0.8))],
        'jaw': [(0, 2), (8, 30), (26, 20), (42, 36), (60, 30)],
        'stache': [(0, 0), (8, 14), (30, 4), (60, 2)],
        'look': [(0, (0.0, 0.0)), (8, (0.1, 0.35)), (30, (0.05, -0.2)), (46, (0.2, 0.4)), (60, (0.25, 0.35))],
        'belly': [(0, 1.0), (26, 0.95), (42, 1.03), (60, 1.0)],
        'beacon': [(0, 0), (60, 40)],
    }), loop=False)
    return clips


if __name__ == '__main__':
    run('LineMasterTock', BONES, build_parts, make_clips,
        sheet_args={'prefix': 'tock', 'focus': (0.4, -0.2, 2.0), 'dist': 7.0, 'scale': 1.87, 'ref_side': 2.6},
        anchors=[('Idle', 13, 'GaugeNeedle', False), ('Idle', 13, 'Beacon', True),
                 ('RivetGun', 11, 'MechHand.L', True), ('WrenchSlam', 18, 'MechHand.R', True),
                 ('LeverThrow', 42, 'Lever', True), ('Idle', 13, 'Head', True)])
