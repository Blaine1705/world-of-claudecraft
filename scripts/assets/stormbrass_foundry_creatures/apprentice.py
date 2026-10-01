"""The Gearwright Apprentice (`gearwright_apprentice`, sim/content/stormbrass_foundry.ts):
a young engineer who plants Tripod Turrets in the fight.

  blender -b --factory-startup --python apprentice.py -- <out.glb|-> [--sheet dir] [--blend f] [--fast] [--nobake]

A lean, freckled young woman: auburn hair pulled back into a long braid (it
swings on its own bone), brass goggles pushed up into her hair, a sleeveless
work vest over a canvas shirt rolled high, fingerless gloves, a short leather
tool apron and a belt of pouches, knee boots. On her back, strapped in a brass
frame, a FOLDED TRIPOD TURRET: the gun head and its barrel pointing at the sky,
the three legs folded down along it (the Turret bone; it is unslung and
planted in DeployTurret, then a spare unfolds back into the frame). In her
right fist an open-ended SPANNER, modelled in the fist on Hand.R.

Scale: about 2.35 yards authored; drawn about 2.9 yards at her 1.25.

Clips (24 fps): Idle, Walk, Run, Attack (an overhand smack with the spanner),
Attack2 (a quick backhand), DeployTurret (the 1.5 s bar: she reaches over her
shoulder, unslings the turret, drops to a knee and slams it down in front,
then springs back; played out), Hit, Death.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from engineer_body import (  # noqa: E402
    Look, M, body_parts, bones, eyes, goggles, grip_axis, hair_shell, oneshot_fn, sculpt_face, stance_fn,
    walk_cycle,
)
from foundry_kit import (  # noqa: E402
    ARC, BLACK, BODY, BRASS, BRASS_D, BRASS_HI, COPPER, GLOW, HAZARD, IRON, IRON_D, IRON_HI, LEATHER, LEATHER_D,
    METAL, STEEL, Matrix, MPart, Vector, anim, basis, lerp, run,
)

LOOK = Look(hip_z=0.97, chest_z=1.45, shoulder_x=0.38, shoulder_z=1.66, head_c=Vector((0.0, -0.07, 2.04)),
            head_r=(0.29, 0.28, 0.31, 0.3), torso_w=0.88, nose=0.6, brow=0.5, jowl=0.0, chin=0.7, soot=0.25,
            eye_phi=0.31, eye_t=0.1, eye_r=0.075, mouth_t=-0.36, freckles=0.8,
            skin=(0.94, 0.78, 0.68), skin_d=(0.76, 0.56, 0.46), cheek=(0.94, 0.64, 0.58))
HAIR = (0.52, 0.22, 0.12)       # auburn
HAIR_HI = (0.72, 0.38, 0.2)
SHIRT = (0.62, 0.56, 0.44)
SHIRT_D = (0.44, 0.38, 0.28)
VEST = (0.26, 0.38, 0.36)       # a verdigris-green work vest
TROUSER = (0.3, 0.26, 0.22)
BOOT = (0.2, 0.13, 0.08)
GLOVE = (0.4, 0.27, 0.17)

_B = bones(LOOK)
HC = LOOK.head_c
TURRET_C = Vector((0.0, 0.5, 1.62))
B = _B + [
    ('Braid', 'Head', (0.0, HC.y + 0.3, HC.z - 0.02), (0.0, HC.y + 0.4, HC.z - 0.32)),
    ('Braid2', 'Braid', (0.0, HC.y + 0.4, HC.z - 0.32), (0.0, HC.y + 0.43, HC.z - 0.62)),
    ('Turret', 'Pack', tuple(TURRET_C), tuple(TURRET_C + Vector((0, 0, 0.4)))),
]
REST = {n: (Vector(h), Vector(t)) for n, _, h, t in B}


def build_parts():
    parts = []

    def part(name, bone, **kw):
        pt = MPart(name, bone, **kw)
        parts.append(pt)
        return pt

    L = LOOK
    body_parts(L, part, B, SHIRT, SHIRT_D, TROUSER, BOOT, GLOVE, sleeve_roll=0.45)
    head = part('Head', 'Head', hard=False)
    jaw = part('Jaw', 'Jaw', hard=False)
    point = sculpt_face(L, head, jaw, split=False)
    eyes(L, head, point, iris=(0.3, 0.52, 0.34), lid=(0.8, 0.6, 0.52), lash=True, lid_k=0.55, lid_up=0.095)
    for s in (-1, 1):
        bp = [point(s * ph, th)[0] + point(s * ph, th)[1] * 0.012 for ph, th in
              ((0.13, 0.24), (0.27, 0.28), (0.42, 0.27), (0.52, 0.22))]
        head.tube(bp, [0.012, 0.016, 0.013, 0.005], (0.38, 0.16, 0.08), sides=6)
        ec, en = point(s * 1.5, 0.04)[:2]
        head.blob(tuple(ec + en * 0.015), (0.05, 0.08, 0.11), L.skin_d, segments=8, rings=6)
        # lips: a soft upper and fuller lower lip
        lp = [point(s * ph, L.mouth_t + 0.01)[0] + point(s * ph, L.mouth_t + 0.01)[1] * 0.012 for ph in (0.0, 0.12, 0.24)]
        head.tube(lp, [0.015, 0.012, 0.005], (0.76, 0.45, 0.42), sides=6)
        lo = [point(s * ph, L.mouth_t - 0.045)[0] + point(s * ph, L.mouth_t - 0.045)[1] * 0.014 for ph in (0.0, 0.11, 0.22)]
        jaw.tube(lo, [0.018, 0.015, 0.005], (0.78, 0.47, 0.44), sides=6)
    # hair: swept back from a side parting, a few loose strands, and the braid
    def lo_(ph):
        a = abs(ph)
        return 0.3 + 0.0 * a if a < 0.6 else (0.3 - 0.5 * min(1.0, (a - 0.6) / 1.2))

    def hi_(ph):
        return 1.45

    def thick(ph, th):
        return 0.035 + 0.02 * max(0.0, math.cos(ph)) * max(0.0, th - 0.3)
    hair_shell(head, point, (-3.0, 3.0, lo_, hi_), thick, HAIR, HAIR_HI, n_phi=44, n_theta=12, grooves=23.0)
    for k, ph in enumerate((-0.95, -1.1, 0.98)):
        p0, n0 = point(ph, 0.3)[:2]
        q1 = point(ph * 1.04, 0.05)[0] + point(ph * 1.04, 0.05)[1] * 0.03
        q2 = point(ph * 1.06, -0.2)[0] + point(ph * 1.06, -0.2)[1] * 0.035
        head.tube([p0 + n0 * 0.03, q1, q2], [0.02, 0.015, 0.004], lerp(HAIR, HAIR_HI, 0.5), sides=6)
    # a swept fringe from the parting across the brow
    hair_shell(head, point, (-0.75, 0.2, lambda ph: 0.36 + 0.08 * (ph + 0.75), lambda ph: 0.62), lambda ph, th: 0.03,
               HAIR, HAIR_HI, n_phi=12, n_theta=5, grooves=30.0, seed=1.0)
    goggles(L, head, point, 0.5, phi=0.27, r=0.07, pushed=True)
    # the braid, plaited in three strands, its tie, on two bones
    for bn in ('Braid', 'Braid2'):
        br = part(bn, bn, hard=False)
        b0, b1 = REST[bn]
        d = (b1 - b0)
        for k in range(6):
            t = (k + 0.5) / 6
            c = b0 + d * t
            side = (-1) ** k
            r = 0.06 * (1.0 - 0.35 * t) if bn == 'Braid' else 0.045 * (1.0 - 0.4 * t)
            br.blob(tuple(c + Vector((side * r * 0.35, 0, 0))), (r * 2.1, r * 1.8, d.length / 6 * 1.6),
                    lerp(HAIR, HAIR_HI, 0.25 + 0.3 * (k % 2)), rot=(0, side * 0.35, 0), segments=10, rings=6)
        if bn == 'Braid2':
            br.ring(b1 + Vector((0, 0, 0.05)), (0, 0, 1), 0.035, 0.012, LEATHER_D, sides=10, mat=BODY)
            br.tube([b1 + Vector((0, 0, 0.04)), b1 + Vector((0.01, 0.01, -0.05)), b1 + Vector((0.0, 0.03, -0.12))],
                    [0.035, 0.03, 0.006], HAIR_HI, sides=6)
    # ---- the work vest over the shirt, its buttons and pockets ------------------------------
    cz, hz = L.chest_z, L.hip_z
    v = part('Vest', 'Chest', hard=False)
    v.loft([((0, 0.0, cz - 0.22), 0.34, 0.27, 2.3, (0, 0, 1)), ((0, 0.02, cz + 0.06), 0.4, 0.31, 2.4, (0, 0, 1)),
            ((0, 0.03, L.shoulder_z - 0.04), 0.4, 0.28, 2.5, (0, 0, 1))], VEST, sides=18)
    for k in range(4):
        v.blob((0.0, -0.31, cz - 0.15 + 0.1 * k), (0.03, 0.02, 0.03), BRASS, segments=6, rings=4, mat=METAL)
    for s in (-1, 1):
        v.obox((s * 0.17, -0.3, cz - 0.02), (0.13, 0.03, 0.12), basis((s * 0.3, -1, 0)), lerp(VEST, BLACK, 0.25),
               bevel=0.01)
        v.cyl(Vector((s * 0.2, -0.32, cz)), Vector((s * 0.21, -0.33, cz + 0.12)), 0.01, BRASS_HI if s > 0 else IRON_HI,
              sides=6)
        v.tube([Vector((s * 0.18, 0.3, cz - 0.12)), Vector((s * 0.22, 0.14, L.shoulder_z + 0.06)),
                Vector((s * 0.2, -0.22, L.shoulder_z - 0.05)), Vector((s * 0.2, -0.32, cz - 0.05))], [0.028] * 4,
               LEATHER_D, sides=6, squash=0.4)
    v.tube([Vector((-0.3, -0.27, cz - 0.05)), Vector((0, -0.33, cz - 0.02)), Vector((0.3, -0.27, cz - 0.05))],
           [0.025] * 3, LEATHER_D, sides=6, squash=0.4)
    # ---- belt, pouches and a short tool apron ------------------------------------------------
    belt = part('Belt', 'Hips')
    belt.tube([Vector((math.sin(a) * 0.33, math.cos(a) * 0.26 - 0.01, hz + 0.05)) for a in
               (i * math.tau / 26 for i in range(27))], [0.03] * 27, LEATHER_D, sides=6, cap=False)
    belt.obox((0, -0.3, hz + 0.05), (0.1, 0.03, 0.08), Matrix.Identity(3), BRASS, mat=METAL, bevel=0.01)
    for a in (0.8, -0.8, 1.6, -1.6):
        c = Vector((math.sin(a) * 0.35, -math.cos(a) * 0.28, hz - 0.03))
        belt.obox(tuple(c), (0.1, 0.07, 0.11), basis((math.sin(a), -math.cos(a), 0)), LEATHER, bevel=0.012)
        belt.obox(tuple(c + Vector((0, 0, 0.05))), (0.11, 0.075, 0.025), basis((math.sin(a), -math.cos(a), 0)),
                  LEATHER_D, bevel=0.006)
    belt.obox((0.0, -0.31, hz - 0.15), (0.38, 0.025, 0.3), Matrix.Identity(3), LEATHER, bevel=0.01)
    belt.cyl(Vector((-0.08, -0.33, hz - 0.12)), Vector((-0.09, -0.33, hz + 0.02)), 0.012, STEEL, sides=6)
    # ---- the frame and the folded tripod turret on her back ---------------------------------
    pk = part('Pack', 'Pack')
    for s in (-1, 1):
        pk.obox((s * 0.15, 0.32, cz + 0.05), (0.035, 0.05, 0.62), Matrix.Identity(3), BRASS, mat=METAL, bevel=0.008)
        pk.rivet_line((s * 0.15, 0.295, cz - 0.2), (s * 0.15, 0.295, cz + 0.3), 4, 0.01, BRASS_D, normal=(0, -1, 0))
    pk.obox((0, 0.33, cz - 0.24), (0.36, 0.06, 0.05), Matrix.Identity(3), BRASS, mat=METAL, bevel=0.008)
    pk.obox((0, 0.33, cz + 0.36), (0.36, 0.06, 0.05), Matrix.Identity(3), BRASS, mat=METAL, bevel=0.008)
    tu = part('Turret', 'Turret')
    tc = TURRET_C
    tu.cyl(tc - Vector((0, 0, 0.12)), tc + Vector((0, 0, 0.18)), 0.13, BRASS, sides=16)
    tu.blob(tuple(tc + Vector((0, 0, 0.18))), (0.26, 0.26, 0.16), BRASS_HI, segments=16, rings=8, mat=METAL)
    tu.ring(tc + Vector((0, 0, 0.0)), (0, 0, 1), 0.135, 0.016, IRON, sides=18)
    tu.rivet_circle(tc + Vector((0, 0, 0.02)), (0, 0, 1), 0.135, 10, 0.01, BRASS_D)
    tu.cyl(tc + Vector((0.0, 0.0, 0.2)), tc + Vector((0.0, -0.02, 0.62)), 0.035, IRON_HI, sides=10)
    tu.ring(tc + Vector((0.0, -0.02, 0.6)), (0, -0.05, 1), 0.045, 0.012, BRASS_D, sides=10)
    tu.blob(tuple(tc + Vector((0.0, -0.13, 0.12))), (0.06, 0.03, 0.06), ARC, segments=8, rings=4, mat=GLOW)
    tu.obox(tuple(tc + Vector((0.0, -0.14, 0.05))), (0.22, 0.03, 0.16), basis((0, -1, 0)), HAZARD, bevel=0.01)
    tu.hazard(tc + Vector((-0.1, -0.16, 0.05)), tc + Vector((0.1, -0.16, 0.05)), (0, -1, 0), 0.14, 4, depth=0.008)
    tu.cyl(tc + Vector((0.12, 0.0, 0.08)), tc + Vector((0.2, 0.0, 0.08)), 0.06, BRASS_D, sides=12)  # the drum
    for k in range(3):
        a = math.radians(-60 + 120 * k)
        d = Vector((math.sin(a), math.cos(a) * 0.4 + 0.2, 0.0)).normalized()
        top = tc + d * 0.12 - Vector((0, 0, 0.1))
        bot = top + Vector((0, 0, -0.42)) + d * 0.04
        tu.cyl(top, bot, 0.022, IRON, sides=8)
        tu.cyl(bot, bot - Vector((0, 0, 0.06)), 0.032, BRASS_D, sides=8)
    # ---- the open-ended spanner, closed in her right fist -----------------------------------
    h0 = M(REST['Hand.L'][0], -1)
    hd, g = grip_axis(REST, '.R')
    sp = part('Spanner', 'Hand.R')
    grip = h0 + hd * 0.09
    side = g.cross(hd).normalized()
    fr = Matrix((side, hd, g)).transposed()
    sp.obox(tuple(grip + g * 0.2), (0.035, 0.07, 0.62), fr, STEEL, mat=METAL, bevel=0.01)
    sp.obox(tuple(grip + g * 0.2), (0.042, 0.04, 0.48), fr, IRON_HI, mat=METAL, bevel=0.004)
    for end, k, flip in ((grip + g * 0.55, 1.0, 1), (grip - g * 0.14, 0.75, -1)):
        c = end + g * flip * 0.05
        sp.ring(c, side, 0.075 * k, 0.03 * k, STEEL, sides=14, arc=0.72, phase=math.atan2(0, 1) + (0.0 if flip > 0 else math.pi) + 0.9)
        sp.disc(tuple(c - g * flip * 0.05), tuple(side), 0.05 * k, 0.04, STEEL, sides=12)
    sp.obox(tuple(grip), (0.05, 0.08, 0.1), fr, LEATHER_D, bevel=0.008)
    return parts


def make_clips(arm):
    make, stance, rwl, rwr = stance_fn(B, LOOK)
    make(arm)
    clips = []
    braid_rest = (REST['Braid'][1] - REST['Braid'][0]).normalized()

    def st(braid=(0.0, 0.0), turret=1.0, turret_tilt=0.0, **kw):
        bd = braid_rest + Vector((braid[0], braid[1], 0.0))
        b2 = bd + Vector((braid[0] * 0.8, braid[1] * 0.8, 0.0))
        return stance(extra_aims={'Braid': tuple(bd), 'Braid2': tuple(b2)},
                      extra_turns={'Turret': [('x', turret_tilt)]}, scales={'Turret': turret}, **kw)

    def add(name, frames, fn, loop=True):
        anim(arm, name, frames, fn, loop)
        clips.append(name)

    held = dict(wrist_r=(-0.66, -0.22, 0.98), grip_r=((-0.1, -0.85, -0.4), (0.0, 0.2, -1.0)),
                wrist_l=(0.6, -0.12, 0.98), hand_l=(0.0, -0.2, -1.0))

    def idle(f):
        ph = math.tau * f / 72
        b = math.sin(ph)
        kw = dict(held)
        kw.update(root=(0.02 * math.sin(ph * 0.5), 0, -0.01 + 0.01 * b), side=0.04 * math.sin(ph * 0.5),
                  look=(0.25 * math.sin(ph * 0.5), 0.04 * b), jaw=1 + max(0.0, b), braid=(0.05 * math.sin(ph * 0.5), 0.03 * b),
                  foot_l=(0.24, 0.02, 0.15), foot_r=(-0.2, -0.06, 0.15))
        return st(**kw)
    add('Idle', 72, idle)

    def carry(ph, amp):
        return dict(wrist_r=(-0.62, -0.2 + 0.18 * math.cos(ph) * amp, 1.0), grip_r=((-0.1, -0.85, -0.4), (0.0, 0.2, -1.0)),
                    wrist_l=(0.58, -0.2 - 0.18 * math.cos(ph) * amp, 1.0), hand_l=(0.0, -0.2, -1.0))

    def gait(f, n, amp, run_):
        ph = math.tau * f / n
        pose = walk_cycle(lambda **kw: st(braid=(0.08 * math.sin(ph), 0.12 * amp + 0.05 * math.cos(ph * 2)), **kw),
                          ph, amp, run_, extra=carry)
        return pose
    add('Walk', 30, lambda f: gait(f, 30, 1.0, False))
    add('Run', 18, lambda f: gait(f, 18, 1.55, True))

    def oneshot(spec, base=None):
        return oneshot_fn(st, spec, base or held)

    add('Attack', 26, oneshot({
        'wrist_r': [(0, (-0.66, -0.22, 0.98)), (8, (-0.42, 0.1, 1.95)), (10, (-0.4, 0.12, 1.98)),
                    (13, (-0.18, -0.68, 1.1), 'in'), (15, (-0.15, -0.7, 1.02), 'back'), (26, (-0.66, -0.22, 0.98))],
        'grip_r': [(0, ((-0.1, -0.85, -0.4), (0.0, 0.2, -1.0))), (8, ((0.0, 0.7, 0.7), (0.0, -0.3, 1.0))),
                   (13, ((0.0, -0.6, -0.8), (0.0, 0.5, -1.0)), 'in'), (26, ((-0.1, -0.85, -0.4), (0.0, 0.2, -1.0)))],
        'lean': [(0, 0.0), (8, -0.15), (13, 0.28, 'in'), (26, 0.0)],
        'twist': [(0, 0), (8, -14), (13, 10, 'in'), (26, 0)],
        'root': [(0, (0, 0, -0.01)), (8, (0, 0.03, 0.02)), (13, (0, -0.05, -0.06), 'in'), (26, (0, 0, -0.01))],
        'braid': [(0, (0.0, 0.0)), (8, (0.0, -0.1)), (13, (0.05, 0.5), 'in'), (18, (-0.05, 0.2)), (26, (0.0, 0.0))],
        'jaw': [(0, 1), (8, 6), (13, 12), (26, 1)],
        'look': [(0, (0.0, 0.0)), (8, (0.0, 0.15)), (13, (0.0, -0.2)), (26, (0.0, 0.0))],
    }), loop=False)
    add('Attack2', 24, oneshot({
        'wrist_r': [(0, (-0.66, -0.22, 0.98)), (7, (-0.7, 0.2, 1.3)), (11, (0.25, -0.62, 1.2), 'in'),
                    (13, (0.42, -0.38, 1.18), 'back'), (24, (-0.66, -0.22, 0.98))],
        'grip_r': [(0, ((-0.1, -0.85, -0.4), (0.0, 0.2, -1.0))), (7, ((-0.7, 0.7, 0.1), (0.0, 0.0, 1.0))),
                   (11, ((0.8, -0.6, 0.0), (0.0, 0.0, 1.0)), 'in'), (13, ((0.9, 0.3, 0.0), (0.0, 0.0, 1.0))),
                   (24, ((-0.1, -0.85, -0.4), (0.0, 0.2, -1.0)))],
        'twist': [(0, 0), (7, -28), (11, 22, 'in'), (13, 28, 'back'), (24, 0)],
        'braid': [(0, (0.0, 0.0)), (7, (0.3, 0.1)), (12, (-0.45, 0.15)), (24, (0.0, 0.0))],
        'jaw': [(0, 1), (11, 10), (24, 1)],
        'look': [(0, (0.0, 0.0)), (7, (-0.2, 0.0)), (11, (0.15, -0.05)), (24, (0.0, 0.0))],
    }), loop=False)
    # DeployTurret: reach back, unsling, kneel and slam it down, spring back.
    add('DeployTurret', 44, oneshot({
        'wrist_r': [(0, (-0.66, -0.22, 0.98)), (7, (-0.3, 0.1, 1.85)), (14, (-0.3, -0.35, 1.7)),
                    (22, (-0.22, -0.82, 0.55), 'in'), (24, (-0.22, -0.84, 0.48), 'back'), (34, (-0.35, -0.6, 0.8)),
                    (44, (-0.66, -0.22, 0.98))],
        'wrist_l': [(0, (0.6, -0.12, 0.98)), (7, (0.3, 0.1, 1.85)), (14, (0.3, -0.35, 1.7)),
                    (22, (0.22, -0.82, 0.55), 'in'), (24, (0.22, -0.84, 0.48), 'back'), (34, (0.4, -0.5, 0.85)),
                    (44, (0.6, -0.12, 0.98))],
        'grip_r': [(0, ((-0.1, -0.85, -0.4), (0.0, 0.2, -1.0))), (7, ((0.0, 0.3, 1.0), (0.0, 0.6, 0.6))),
                   (22, ((0.2, -0.9, 0.2), (0.0, -0.3, -1.0))), (44, ((-0.1, -0.85, -0.4), (0.0, 0.2, -1.0)))],
        'hand_l': [(0, (0.0, -0.2, -1.0)), (7, (0.0, 0.6, 0.6)), (22, (0.0, -0.4, -1.0)), (44, (0.0, -0.2, -1.0))],
        'turret_tilt': [(0, 0.0), (7, 0.0), (14, -55.0), (20, -110.0, 'in'), (22, -115.0), (44, 0.0)],
        'turret': [(0, 1.0), (21, 1.0), (22, 0.0, 'snap'), (36, 0.0), (44, 1.0, 'out')],
        'root': [(0, (0, 0, -0.01)), (7, (0, 0.03, 0.03)), (14, (0, 0.0, 0.0)), (22, (0, -0.12, -0.5), 'in'),
                 (24, (0, -0.13, -0.53), 'back'), (32, (0, 0.12, -0.08)), (44, (0, 0, -0.01))],
        'lean': [(0, 0.0), (7, -0.25), (14, 0.0), (22, 0.5, 'in'), (32, -0.05), (44, 0.0)],
        'foot_l': [(0, (0.22, 0.0, 0.15)), (14, (0.22, -0.05, 0.15)), (20, (0.24, -0.35, 0.18)),
                   (22, (0.24, -0.4, 0.15), 'in'), (32, (0.22, 0.15, 0.15)), (44, (0.22, 0.0, 0.15))],
        'foot_r': [(0, (-0.22, 0.0, 0.15)), (22, (-0.24, 0.2, 0.15)), (28, (-0.22, 0.28, 0.2)), (32, (-0.22, 0.22, 0.15)),
                   (44, (-0.22, 0.0, 0.15))],
        'braid': [(0, (0.0, 0.0)), (7, (0.0, 0.2)), (22, (0.1, -0.6), 'in'), (30, (0.0, 0.4)), (44, (0.0, 0.0))],
        'jaw': [(0, 1), (7, 6), (22, 14), (30, 4), (44, 1)],
        'look': [(0, (0.0, 0.0)), (7, (0.1, 0.25)), (22, (0.0, -0.35)), (32, (0.0, 0.0)), (44, (0.0, 0.0))],
    }), loop=False)
    add('Hit', 14, oneshot({
        'root': [(0, (0, 0, -0.01)), (3, (0, 0.1, 0.01), 'snap'), (14, (0, 0, -0.01))],
        'lean': [(0, 0.0), (3, -0.3, 'snap'), (14, 0.0)],
        'look': [(0, (0.0, 0.0)), (3, (-0.15, 0.3), 'snap'), (14, (0.0, 0.0))],
        'braid': [(0, (0.0, 0.0)), (3, (0.1, -0.4), 'snap'), (8, (0.0, 0.2)), (14, (0.0, 0.0))],
        'jaw': [(0, 1), (3, 14, 'snap'), (14, 1)],
    }), loop=False)
    add('Death', 46, oneshot({
        'root': [(0, (0, 0, -0.01)), (6, (0, 0.08, -0.02)), (14, (0, 0.0, -0.4), 'in'), (24, (0, 0.45, -0.12), 'in'),
                 (27, (0, 0.47, -0.1), 'back'), (46, (0, 0.46, -0.11))],
        'tilt': [(0, 0.0), (6, 4.0), (14, 12.0), (24, 80.0, 'in'), (27, 77.0, 'back'), (46, 78.0)],
        'yaw': [(0, 0.0), (14, -15.0), (46, -20.0)],
        'lean': [(0, 0.0), (6, 0.2), (24, 0.1), (46, 0.1)],
        'foot_l': [(0, (0.22, 0.0, 0.15)), (14, (0.24, 0.15, 0.15)), (24, (0.28, 0.45, 0.3)), (46, (0.3, 0.5, 0.15))],
        'foot_r': [(0, (-0.22, 0.0, 0.15)), (14, (-0.22, 0.2, 0.15)), (24, (-0.26, 0.5, 0.35)), (46, (-0.28, 0.55, 0.15))],
        'wrist_r': [(0, (-0.66, -0.22, 0.98)), (14, (-0.7, -0.5, 1.2)), (27, (-0.8, -0.3, 1.5)), (46, (-0.85, -0.2, 1.55))],
        'wrist_l': [(0, (0.6, -0.12, 0.98)), (14, (0.7, -0.5, 1.2)), (46, (0.85, -0.2, 1.5))],
        'braid': [(0, (0.0, 0.0)), (14, (0.0, 0.4)), (27, (0.3, -0.2)), (46, (0.4, -0.1))],
        'jaw': [(0, 1), (6, 14), (46, 8)],
        'look': [(0, (0.0, 0.0)), (6, (0.1, 0.3)), (27, (0.2, -0.2)), (46, (0.3, -0.2))],
    }), loop=False)
    return clips


if __name__ == '__main__':
    run('GearwrightApprentice', B, build_parts, make_clips, atlas=1024,
        sheet_args={'prefix': 'apprentice', 'focus': (0.2, -0.1, 1.2), 'dist': 4.6, 'scale': 1.23, 'ref_side': -1.4},
        anchors=[('Idle', 13, 'Head', True), ('DeployTurret', 22, 'Hand.R', False)])
