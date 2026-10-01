"""The Foundry Engineer (`foundry_engineer`, sim/content/stormbrass_foundry.ts):
the line's repair hand, the one who keeps the automata on their feet.

  blender -b --factory-startup --python engineer.py -- <out.glb|-> [--sheet dir] [--blend f] [--fast] [--nobake]

A broad, soot-smudged engineer in his forties: a square jaw under a short,
bristling dark beard and moustache, heavy brows, brass goggles pushed up on a
riveted leather cap, a canvas shirt with the sleeves rolled, gauntlets, a
scorched leather apron to the knee, a tool belt hung with a hammer, a
screwdriver, an oil can and pouches, and a brass boiler pack with a gauge, a
valve wheel and copper hoses. In his right fist a BIG adjustable WRENCH,
modelled in the closed fist on Hand.R (it never turns against the hand).

Scale: about 2.4 yards authored; its VISUALS row draws it about 3 yards tall
at the template's 1.3, a head over a player.

Clips (24 fps): Idle (the wrench on his shoulder), Walk, Run, Attack (the
wrench hauled overhead and brought down), Attack2 (a flat backhand swing),
FieldRepair (the 2.5 s bar: crouched over the automaton, ratcheting a nut,
loop-safe), Hit, Death (spins off his feet onto his back).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from engineer_body import (  # noqa: E402
    Look, M, body_parts, bones, eyes, goggles, grip_axis, hair_shell, oneshot_fn, sculpt_face, stance_fn, walk_cycle,
)
from foundry_kit import (  # noqa: E402
    BLACK, BODY, BRASS, BRASS_D, BRASS_HI, CANVAS, CANVAS_D, COPPER, IRON, IRON_D, IRON_HI, LEATHER, LEATHER_D,
    METAL, SIGNAL_RED, STEEL, Matrix, MPart, Vector, anim, basis, lerp, run, tracks,
)

LOOK = Look(soot=0.75, nose=1.15, brow=1.3, jowl=0.16, chin=1.2, torso_w=1.08, belly=0.04,
            skin=(0.82, 0.6, 0.47), skin_d=(0.58, 0.38, 0.28), cheek=(0.8, 0.48, 0.4))
B = bones(LOOK)
BEARD = (0.2, 0.13, 0.08)
BEARD_HI = (0.34, 0.23, 0.15)
BROW = (0.12, 0.08, 0.05)
SHIRT = (0.42, 0.46, 0.5)        # a faded blue work shirt
SHIRT_D = (0.3, 0.33, 0.37)
TROUSER = (0.27, 0.24, 0.2)
BOOT = (0.18, 0.12, 0.08)
GLOVE = (0.36, 0.25, 0.16)


def build_parts():
    parts = []

    def part(name, bone, **kw):
        pt = MPart(name, bone, **kw)
        parts.append(pt)
        return pt

    L = LOOK
    REST = body_parts(L, part, B, SHIRT, SHIRT_D, TROUSER, BOOT, GLOVE)
    hc = L.head_c
    head = part('Head', 'Head', hard=False)
    jaw = part('Jaw', 'Jaw', hard=False)
    point = sculpt_face(L, head, jaw)
    eyes(L, head, point, iris=(0.32, 0.42, 0.5))
    # heavy brows, bristling
    for s in (-1, 1):
        bp = [point(s * ph, th)[0] + point(s * ph, th)[1] * 0.02 for ph, th in
              ((0.1, 0.25), (0.25, 0.29), (0.42, 0.28), (0.55, 0.23))]
        for k, off in enumerate((0.0, 0.012, -0.01)):
            head.tube([q + Vector((0, -0.004 * k, off)) for q in bp], [0.02, 0.024, 0.02, 0.008],
                      lerp(BROW, BEARD, 0.3 * k), sides=7)
        ec, en = point(s * 1.5, 0.05)[:2]
        head.blob(tuple(ec + en * 0.02), (0.06, 0.1, 0.13), L.skin_d, segments=10, rings=8)
    # the short full beard: one combed mass from the sideburns round the jaw
    mt = L.mouth_t

    def lo_(ph):
        return -1.02 + 0.25 * (abs(ph) / 1.25) ** 2

    def hi_(ph):
        a = abs(ph)
        return mt - 0.05 if a < 0.42 else (mt - 0.05) + (0.42 - (mt - 0.05)) * min(1.0, (a - 0.42) / 0.5)

    def thick(ph, th):
        return 0.03 + 0.05 * max(0.0, -th - 0.55) * (1.0 - abs(ph) / 1.4)
    hair_shell(jaw, point, (-1.25, 1.25, lo_, hi_), thick, BEARD, BEARD_HI, n_phi=34, n_theta=14, grooves=17.0)
    for s in (-1, 1):
        mp = [point(s * ph, th)[0] + point(s * ph, th)[1] * 0.025 for ph, th in
              ((0.02, -0.25), (0.14, -0.28), (0.27, -0.34), (0.37, -0.43), (0.42, -0.52))]
        for k, (dz, rr) in enumerate(((0.0, 1.0), (0.012, 0.75), (-0.012, 0.7))):
            head.tube([q + Vector((0, -0.004 * k, dz)) for q in mp], [0.026 * rr, 0.032 * rr, 0.028 * rr, 0.02 * rr, 0.006],
                      lerp(BROW, BEARD, 0.2 + 0.3 * k), sides=8)
    # the riveted leather cap and the goggles pushed up on it
    head.blob(tuple(hc + Vector((0, 0.02, 0.15))), (0.68, 0.66, 0.42), LEATHER, segments=20, rings=12)
    head.ring(hc + Vector((0, 0.01, 0.11)), (0, 0, 1), 0.33, 0.03, LEATHER_D, sides=24, mat=BODY)
    head.blob(tuple(hc + Vector((0, -0.29, 0.13))), (0.42, 0.22, 0.045), LEATHER_D, rot=(-0.25, 0, 0), segments=14,
              rings=6)
    head.rivets([hc + Vector((math.sin(a) * 0.335, math.cos(a) * 0.32 + 0.01, 0.13)) for a in
                 (i * math.tau / 10 for i in range(10))], 0.014, BRASS_D)
    goggles(L, head, point, 0.42, phi=0.28, r=0.075, pushed=True)
    # ---- the apron: scorched leather from the chest to the knee ---------------------------
    cz, hz = L.chest_z, L.hip_z
    for name, bone, z0, z1, w0, w1, y0 in (('ApronTop', 'Chest', cz - 0.18, cz + 0.2, 0.3, 0.24, -0.31),
                                          ('ApronLow', 'Hips', hz * 0.45, hz + 0.1, 0.36, 0.34, -0.31)):
        ap = part(name, bone, hard=False)
        nu, nv = 10, 8
        before = set(ap.bm.faces)
        grid = []
        for j in range(nv + 1):
            v = j / nv
            z = z0 + (z1 - z0) * v
            w = w0 + (w1 - w0) * v
            row = []
            for i in range(nu + 1):
                u = -1 + 2 * i / nu
                if bone == 'Hips':
                    y = y0 - 0.03 + 0.15 * u * u - 0.025 * math.sin(u * 7) * (1 - v) - 0.03 * (1 - v)
                else:
                    y = y0 - 0.06 * (1 - u * u)
                row.append(ap.bm.verts.new((u * w, y, z)))
            grid.append(row)
        back = [[ap.bm.verts.new(v.co + Vector((0, 0.02, 0))) for v in row] for row in grid]
        for j in range(nv):
            for i in range(nu):
                ap.bm.faces.new((grid[j][i], grid[j + 1][i], grid[j + 1][i + 1], grid[j][i + 1]))
                ap.bm.faces.new((back[j][i], back[j][i + 1], back[j + 1][i + 1], back[j + 1][i]))
        for j in range(nv):
            for i in (0, nu):
                ap.bm.faces.new((grid[j][i], back[j][i], back[j + 1][i], grid[j + 1][i]))
        for i in range(nu):
            for j in (0, nv):
                ap.bm.faces.new((grid[j][i], grid[j][i + 1], back[j][i + 1], back[j][i]))
        faces = ap._new_faces(before)
        ap._paint(faces, LEATHER, BODY)
        for f in faces:
            for lp in f.loops:
                co = lp.vert.co
                scorch = max(0.0, math.sin(co.x * 13 + co.z * 9) * math.sin(co.x * 5 - co.z * 17)) ** 2
                lp[ap.col] = (*lerp(LEATHER, (0.12, 0.08, 0.05), 0.7 * scorch), 1.0)
        ap.tube([grid[0][i].co + Vector((0, -0.01, 0)) for i in range(nu + 1)], [0.012] * (nu + 1), LEATHER_D, sides=5)
        if bone == 'Chest':
            ap.rivets([grid[nv][0].co + Vector((0.02, -0.02, -0.02)), grid[nv][nu].co + Vector((-0.02, -0.02, -0.02))],
                      0.018, BRASS_D)
            pk = [Vector((-0.14, y0 - 0.07, cz - 0.08)), Vector((0.1, y0 - 0.07, cz - 0.08)),
                  Vector((0.1, y0 - 0.07, cz + 0.08)), Vector((-0.14, y0 - 0.07, cz + 0.08))]
            ap.tube(pk + [pk[0]], [0.01] * 5, LEATHER_D, sides=5, cap=False)
            ap.cyl(Vector((-0.08, y0 - 0.08, cz + 0.02)), Vector((-0.08, y0 - 0.09, cz + 0.17)), 0.012, BRASS_HI, sides=6)
            ap.cyl(Vector((0.03, y0 - 0.08, cz + 0.02)), Vector((0.04, y0 - 0.09, cz + 0.14)), 0.014, (0.7, 0.2, 0.1),
                   sides=6, mat=BODY)
    # straps of the apron and the pack over the shoulders
    ch = part('Straps', 'Chest', hard=False)
    for s in (-1, 1):
        ch.tube([Vector((s * 0.2, 0.3, cz - 0.1)), Vector((s * 0.24, 0.16, L.shoulder_z + 0.08)),
                 Vector((s * 0.22, -0.22, L.shoulder_z - 0.06)), Vector((s * 0.22, -0.34, cz + 0.2))], [0.03] * 4,
                LEATHER_D, sides=6, squash=0.4)
    # ---- the tool belt -----------------------------------------------------------------------
    belt = part('Belt', 'Hips')
    belt.tube([Vector((math.sin(a) * 0.37, math.cos(a) * 0.28 - 0.01, hz + 0.06)) for a in
               (i * math.tau / 28 for i in range(29))], [0.035] * 29, LEATHER_D, sides=6, cap=False)
    belt.obox((0, -0.32, hz + 0.06), (0.12, 0.03, 0.09), Matrix.Identity(3), BRASS, mat=METAL, bevel=0.012)
    for s, a in ((1, 0.9), (-1, 1.1), (1, 2.3)):
        c = Vector((math.sin(a) * 0.38 * s, -math.cos(a) * 0.3, hz - 0.02))
        belt.obox(tuple(c), (0.12, 0.08, 0.13), basis((math.sin(a) * s, -math.cos(a), 0)), LEATHER, bevel=0.015)
        belt.obox(tuple(c + Vector((0, 0, 0.06))), (0.13, 0.085, 0.03), basis((math.sin(a) * s, -math.cos(a), 0)),
                  LEATHER_D, bevel=0.008)
    # a hammer hanging in a loop on his left hip
    hp = Vector((0.36, -0.12, hz - 0.05))
    belt.cyl(hp + Vector((0, 0, 0.12)), hp - Vector((0, 0, 0.32)), 0.022, (0.42, 0.3, 0.18), sides=8, mat=BODY)
    belt.obox(tuple(hp + Vector((0, 0, 0.15))), (0.06, 0.18, 0.06), Matrix.Identity(3), IRON_HI, mat=METAL, bevel=0.01)
    # an oil can on the right hip
    oc = Vector((-0.38, 0.05, hz - 0.02))
    belt.lathe(tuple(oc - Vector((0, 0, 0.09))), [(0.06, 0), (0.065, 0.05), (0.06, 0.1), (0.03, 0.14), (0.0, 0.14)],
               12, SIGNAL_RED, mat=METAL)
    belt.cyl(oc + Vector((0, 0, 0.04)), oc + Vector((0, -0.12, 0.16)), 0.008, BRASS, sides=6)
    # ---- the boiler pack ---------------------------------------------------------------------
    pk = part('Pack', 'Pack')
    pc = Vector((0, 0.42, cz + 0.1))
    pk.cyl(pc - Vector((0, 0, 0.3)), pc + Vector((0, 0, 0.26)), 0.2, BRASS, sides=18)
    pk.blob(tuple(pc + Vector((0, 0, 0.26))), (0.4, 0.4, 0.2), BRASS, segments=18, rings=8, mat=METAL)
    pk.blob(tuple(pc - Vector((0, 0, 0.3))), (0.4, 0.4, 0.14), BRASS_D, segments=18, rings=6, mat=METAL)
    for z in (-0.2, 0.05, 0.2):
        pk.ring(pc + Vector((0, 0, z)), (0, 0, 1), 0.205, 0.018, IRON, sides=22)
        pk.rivet_circle(pc + Vector((0, 0, z + 0.03)), (0, 0, 1), 0.205, 12, 0.012, BRASS_D)
    pk.gauge(tuple(pc + Vector((0.0, 0.2, 0.05))), (0, 1, 0.2), 0.1, ticks=7)
    pk.cyl(pc + Vector((0.14, 0.1, 0.3)), pc + Vector((0.16, 0.12, 0.55)), 0.04, IRON, sides=10)
    pk.ring(pc + Vector((0.16, 0.12, 0.55)), (0, 0, 1), 0.05, 0.012, IRON_D, sides=10)
    vw = pc + Vector((-0.2, 0.05, 0.08))
    pk.ring(vw, (-1, 0, 0), 0.07, 0.012, SIGNAL_RED, sides=12)
    for k in range(4):
        a = math.tau * k / 4
        pk.cyl(vw, vw + Vector((0, math.cos(a) * 0.07, math.sin(a) * 0.07)), 0.008, SIGNAL_RED, sides=5)
    for s in (-1, 1):
        pk.obox((s * 0.17, 0.3, cz + 0.1), (0.04, 0.06, 0.6), Matrix.Identity(3), IRON, mat=METAL, bevel=0.01)
        pk.pipe([pc + Vector((s * 0.18, -0.02, -0.2)), Vector((s * 0.36, 0.14, hz + 0.2)),
                 Vector((s * 0.35, -0.02, hz + 0.08))], 0.022, COPPER)
    # ---- the big wrench, closed in the right fist ---------------------------------------------
    h0 = M(REST['Hand.L'][0], -1)
    hd, g = grip_axis(REST, '.R')
    wr = part('Wrench', 'Hand.R')
    grip = h0 + hd * 0.1
    side = g.cross(hd).normalized()
    fr = Matrix((side, hd, g)).transposed()
    wr.obox(tuple(grip + g * 0.25), (0.06, 0.035, 0.85), fr, STEEL, mat=METAL, bevel=0.012)
    wr.obox(tuple(grip + g * 0.25), (0.07, 0.02, 0.65), fr, IRON_HI, mat=METAL, bevel=0.005)
    wr.obox(tuple(grip - g * 0.12), (0.08, 0.05, 0.12), fr, LEATHER_D, bevel=0.01)
    hcn = grip + g * 0.72
    wr.obox(tuple(hcn), (0.14, 0.13, 0.2), fr, STEEL, mat=METAL, bevel=0.025)
    for sd, k in ((1, 1.0), (-1, 0.8)):
        jc = hcn + g * 0.16 + hd * sd * 0.12
        wr.obox(tuple(jc), (0.13, 0.085, 0.24 * k), fr, STEEL, mat=METAL, bevel=0.02)
        wr.obox(tuple(jc + g * 0.12 * k - hd * sd * 0.03), (0.12, 0.13, 0.07), fr, IRON_HI, mat=METAL, bevel=0.015)
    wr.cyl(hcn - side * 0.075, hcn + side * 0.075, 0.042, BRASS, sides=12)
    for k in range(6):
        wr.ring(hcn + side * (-0.06 + 0.024 * k), side, 0.044, 0.007, BRASS_D, sides=12)
    wr.hazard(grip + g * 0.05 + hd * 0.02, grip + g * 0.42 + hd * 0.02, tuple(hd), 0.06, 4, depth=0.01)
    return parts


def make_clips(arm):
    make, stance, rwl, rwr = stance_fn(B, LOOK)
    make(arm)
    clips = []

    def add(name, frames, fn, loop=True):
        anim(arm, name, frames, fn, loop)
        clips.append(name)

    # the wrench on his shoulder: the fist at the front of the shoulder, the head behind it
    shoulder = dict(wrist_r=(-0.5, -0.28, 1.42), grip_r=((-0.35, 0.45, 0.82), (0.0, -1.0, 0.2)),
                    wrist_l=(0.62, -0.2, 0.95), hand_l=(-0.1, -0.2, -1.0))

    def idle(f):
        ph = math.tau * f / 72
        b = math.sin(ph)
        kw = dict(shoulder)
        kw.update(root=(0, 0, -0.01 + 0.012 * b), look=(0.15 * math.sin(ph * 0.5), 0.03 * b), jaw=2 + 2 * max(0, b),
                  wrist_r=(-0.5, -0.28, 1.42 + 0.015 * b), pack=1.5 * b)
        return stance(**kw)
    add('Idle', 72, idle)

    def carry(ph, amp):
        return dict(wrist_r=(-0.5, -0.28 - 0.03 * math.cos(ph) * amp, 1.42 + 0.02 * abs(math.cos(ph))),
                    grip_r=((-0.35, 0.45, 0.82), (0.0, -1.0, 0.2)),
                    wrist_l=(0.6, -0.15 - 0.18 * math.cos(ph) * amp, 0.97), hand_l=(-0.1, -0.2, -1.0))
    add('Walk', 32, lambda f: walk_cycle(stance, math.tau * f / 32, 1.0, extra=carry))
    add('Run', 20, lambda f: walk_cycle(stance, math.tau * f / 20, 1.5, True, extra=carry))

    def oneshot(spec, base=None):
        return oneshot_fn(stance, spec, base or shoulder)

    # Attack: hauled up overhead, held, slammed down in front, follow-through, back.
    add('Attack', 30, oneshot({
        'wrist_r': [(0, (-0.5, -0.28, 1.42)), (9, (-0.3, 0.12, 2.05)), (12, (-0.28, 0.15, 2.08)),
                    (15, (-0.22, -0.72, 1.05), 'in'), (17, (-0.2, -0.74, 0.98), 'back'), (23, (-0.35, -0.5, 1.15)),
                    (30, (-0.5, -0.28, 1.42))],
        'grip_r': [(0, ((-0.35, 0.45, 0.82), (0.0, -1.0, 0.2))), (9, ((0.05, 0.75, 0.6), (0.0, 0.0, 1.0))),
                   (12, ((0.05, 0.8, 0.55), (0.0, 0.0, 1.0))), (15, ((0.0, -0.75, -0.65), (0.0, 0.3, -1.0)), 'in'),
                   (17, ((0.0, -0.5, -0.86), (0.0, 0.6, -1.0))), (23, ((0.1, -0.4, 0.3), (0.0, -1.0, 0.0))),
                   (30, ((-0.35, 0.45, 0.82), (0.0, -1.0, 0.2)))],
        'lean': [(0, 0.0), (9, -0.18), (12, -0.2), (15, 0.3, 'in'), (17, 0.34, 'back'), (30, 0.0)],
        'twist': [(0, 0), (9, -14), (15, 10, 'in'), (30, 0)],
        'root': [(0, (0, 0, -0.01)), (9, (0, 0.04, 0.02)), (15, (0, -0.06, -0.09), 'in'), (17, (0, -0.07, -0.11), 'back'),
                 (30, (0, 0, -0.01))],
        'jaw': [(0, 2), (9, 14), (15, 22), (30, 2)],
        'look': [(0, (0.0, 0.0)), (9, (0.0, 0.2)), (15, (0.0, -0.25)), (30, (0.0, 0.0))],
        'foot_r': [(0, (-0.22, 0.0, 0.15)), (10, (-0.24, 0.06, 0.2)), (15, (-0.22, -0.18, 0.15), 'in'),
                   (30, (-0.22, 0.0, 0.15))],
    }), loop=False)
    # Attack2: a flat backhand sweep across the front, right to left.
    add('Attack2', 28, oneshot({
        'wrist_r': [(0, (-0.5, -0.28, 1.42)), (8, (-0.75, 0.15, 1.3)), (11, (-0.78, 0.18, 1.28)),
                    (14, (0.2, -0.72, 1.2), 'in'), (16, (0.45, -0.45, 1.18), 'back'), (22, (0.0, -0.6, 1.25)),
                    (28, (-0.5, -0.28, 1.42))],
        'grip_r': [(0, ((-0.35, 0.45, 0.82), (0.0, -1.0, 0.2))), (8, ((-0.7, 0.7, 0.1), (0.0, 0.0, 1.0))),
                   (14, ((0.8, -0.6, 0.0), (0.0, 0.0, 1.0)), 'in'), (16, ((0.9, 0.35, 0.0), (0.0, 0.0, 1.0))),
                   (22, ((0.5, -0.6, 0.4), (0.0, -1.0, 0.0))), (28, ((-0.35, 0.45, 0.82), (0.0, -1.0, 0.2)))],
        'twist': [(0, 0), (8, -28), (11, -30), (14, 22, 'in'), (16, 28, 'back'), (28, 0)],
        'lean': [(0, 0.0), (8, 0.0), (14, 0.15, 'in'), (28, 0.0)],
        'root': [(0, (0, 0, -0.01)), (14, (-0.03, -0.05, -0.06), 'in'), (28, (0, 0, -0.01))],
        'jaw': [(0, 2), (8, 10), (14, 20), (28, 2)],
        'look': [(0, (0.0, 0.0)), (8, (-0.2, 0.0)), (14, (0.15, -0.05)), (28, (0.0, 0.0))],
        'foot_l': [(0, (0.22, 0.0, 0.15)), (12, (0.22, -0.15, 0.2)), (14, (0.24, -0.2, 0.15), 'in'), (28, (0.22, 0.0, 0.15))],
    }), loop=False)

    # FieldRepair: crouched in, ratcheting a nut on the automaton in front of him.
    nut = Vector((-0.05, -0.78, 0.95))

    def repair(f):
        ph = math.tau * f / 30
        a = math.radians(-20 + 34 * (0.5 + 0.5 * math.sin(ph)))
        w = Vector((math.sin(a), -math.cos(a) * 0.6, 0.0)).normalized()
        w = Vector((-math.cos(a), -0.25, -math.sin(a) * 0.4)).normalized()
        grip = nut - w * 0.62
        b = math.sin(ph * 0.5)
        return stance(root=(0, 0.02, -0.16 + 0.01 * b), lean=0.32, twist=6 * math.sin(ph), look=(0.05, -0.35),
                      wrist_r=tuple(grip - Vector((0, 0, 0.0))), grip_r=(tuple(w), (0.0, 0.0, -1.0)),
                      wrist_l=(0.25, -0.72, 1.0 + 0.02 * math.sin(ph + 1)), hand_l=(-0.4, -0.6, -0.5),
                      foot_l=(0.26, -0.15, 0.15), foot_r=(-0.26, 0.12, 0.15), jaw=4 + 6 * max(0.0, math.sin(ph * 2)))
    add('FieldRepair', 60, repair)
    add('Hit', 14, oneshot({
        'root': [(0, (0, 0, -0.01)), (3, (0, 0.1, 0.01), 'snap'), (14, (0, 0, -0.01))],
        'lean': [(0, 0.0), (3, -0.3, 'snap'), (14, 0.0)],
        'look': [(0, (0.0, 0.0)), (3, (-0.1, 0.3), 'snap'), (14, (0.0, 0.0))],
        'jaw': [(0, 2), (3, 20, 'snap'), (14, 2)],
        'wrist_l': [(0, (0.62, -0.2, 0.95)), (3, (0.7, 0.0, 1.15), 'snap'), (14, (0.62, -0.2, 0.95))],
    }), loop=False)
    add('Death', 48, oneshot({
        'root': [(0, (0, 0, -0.01)), (6, (0, 0.1, -0.02)), (14, (0, 0.05, -0.35), 'in'), (24, (0, -0.65, -0.12), 'in'),
                 (28, (0, -0.67, -0.1), 'back'), (48, (0, -0.66, -0.11))],
        'tilt': [(0, 0.0), (6, -6.0), (14, -14.0), (24, -78.0, 'in'), (28, -75.0, 'back'), (48, -76.0)],
        'yaw': [(0, 0.0), (14, 18.0), (48, 22.0)],
        'lean': [(0, 0.0), (6, -0.3), (24, 0.1), (48, 0.1)],
        'foot_l': [(0, (0.22, 0.0, 0.15)), (14, (0.26, -0.25, 0.15)), (24, (0.3, -0.7, 0.3)), (48, (0.3, -0.75, 0.15))],
        'foot_r': [(0, (-0.22, 0.0, 0.15)), (14, (-0.24, -0.1, 0.15)), (24, (-0.26, -0.8, 0.35)), (48, (-0.28, -0.85, 0.15))],
        'wrist_r': [(0, (-0.5, -0.28, 1.42)), (14, (-0.8, -0.1, 1.6)), (28, (-0.85, 0.0, 1.3)), (48, (-0.85, 0.0, 1.25))],
        'grip_r': [(0, ((-0.35, 0.45, 0.82), (0.0, -1.0, 0.2))), (14, ((-0.6, 0.5, 0.6), (0.0, 0.0, 1.0))),
                   (48, ((-0.5, 0.8, 0.0), (0.0, 0.0, 1.0)))],
        'wrist_l': [(0, (0.62, -0.2, 0.95)), (14, (0.8, -0.2, 1.4)), (48, (0.85, 0.0, 1.3))],
        'jaw': [(0, 2), (6, 20), (28, 14), (48, 18)],
        'look': [(0, (0.0, 0.0)), (6, (0.1, 0.3)), (28, (0.1, -0.1)), (48, (0.2, 0.0))],
    }), loop=False)
    return clips


if __name__ == '__main__':
    run('FoundryEngineer', B, build_parts, make_clips, atlas=1024,
        sheet_args={'prefix': 'engineer', 'focus': (0.2, -0.1, 1.2), 'dist': 4.6, 'scale': 1.25, 'ref_side': -1.4},
        anchors=[('Idle', 13, 'Head', True), ('Attack', 17, 'Hand.R', False), ('FieldRepair', 15, 'Hand.R', False)])
