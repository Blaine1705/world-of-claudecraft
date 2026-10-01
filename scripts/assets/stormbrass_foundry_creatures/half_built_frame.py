"""The Half-Built Frame: an unfinished automaton Line-Master Tock's chute drops
onto the Main Line belts (sim/encounters/stormbrass_foundry/line_master.ts,
`half_built_frame`, its 8 s `foundry_frame_booting` aura).

  blender -b --factory-startup --python half_built_frame.py -- <out.glb|-> [--sheet dir] [--blend f] [--fast] [--nobake]

A frame pulled off the line before it was done: a cage of brass rib struts
round an empty chest where a bare storm socket sparks and flickers (its own
bone, scaled), half a breast plate bolted on, the right arm only a stump with
its cut cables dangling, the right leg a bare iron skeleton of struts, the left
leg and arm plated, a head that is a half-skinned cage with one lens lit (its
light flickers on its own bone), loose wires hanging from the waist.

Scale: about 2.4 yards authored; its VISUALS row draws it some 3.6 yards tall
at its template's 1.5 (a player stands 2.6).

Clips (24 fps): Idle (twitchy, listing), Walk (a lurching limp on the bare
leg), Run, Attack (a clamping swipe of the one arm), Hit, Death (it folds into
a heap of struts), Dormant (looping: slumped forward, head hanging, the socket
and lens guttering) and BootUp (one-shot, 72 f: spasms, the lens snaps on, it
hauls itself upright into Idle).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from automaton import M, Poser, claw_fist, frame_bones, iron_foot, joint, plated_limb  # noqa: E402
from foundry_kit import (  # noqa: E402
    ARC, ARC_HOT, BLACK, BRASS, BRASS_D, BRASS_HI, COPPER, COPPER_D, GLOW, HAZARD, IRON, IRON_D, IRON_HI, METAL,
    SIGNAL_RED, STEEL, MPart, Vector, anim, basis, lerp, run, tracks,
)

J = dict(hips=(0, 0, 0.98), spine_top=(0, 0.02, 1.32), chest_top=(0, 0.03, 1.78), head=(0, -0.05, 1.84),
         head_top=(0, -0.07, 2.22), shoulder=(0.6, 0.02, 1.7), elbow=(0.76, 0.05, 1.28), wrist=(0.8, -0.08, 0.9),
         hand=(0.82, -0.14, 0.66), hip=(0.27, 0.0, 0.94), knee=(0.3, -0.05, 0.54), ankle=(0.3, 0.02, 0.18),
         toe=(0.3, -0.32, 0.05))
CORE_C = Vector((0, -0.02, 1.52))
EYE_C = Vector((0.08, -0.29, 2.0))
BONES = frame_bones(J, [
    ('Core', 'Chest', tuple(CORE_C), tuple(CORE_C + Vector((0, -0.15, 0)))),
    ('Eye', 'Head', tuple(EYE_C), tuple(EYE_C + Vector((0, -0.1, 0)))),
    ('Cables', 'Arm.R', (-0.68, 0.03, 1.52), (-0.7, 0.03, 1.1)),
])
REST = {n: (Vector(h), Vector(t)) for n, _, h, t in BONES}


def strut(p, a, b, r, color=IRON_HI):
    p.cyl(Vector(a), Vector(b), r, color, sides=8)


def bare_limb(p, a, b, r, color=IRON):
    """A skeleton limb of twin struts with cross braces and bolt ends."""
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    side = d.cross(Vector((0, -1, 0))).normalized()
    for s in (-1, 1):
        strut(p, a + side * s * r, b + side * s * r * 0.8, r * 0.35, color)
    for k in range(3):
        t0, t1 = 0.15 + 0.27 * k, 0.15 + 0.27 * (k + 1)
        strut(p, a.lerp(b, t0) + side * r, a.lerp(b, t1) - side * r * 0.85, r * 0.2, IRON_D)
    for q in (a, b):
        p.blob(tuple(q), (r * 2.2, r * 2.2, r * 2.2), BRASS_D, segments=10, rings=6, mat=METAL)


def build_parts():
    parts = []

    def part(name, bone, **kw):
        pt = MPart(name, bone, **kw)
        parts.append(pt)
        return pt

    hp = part('Hips', 'Hips')
    hp.obox((0, 0.02, 0.98), (0.66, 0.42, 0.26), basis((0, 0, 1)), IRON, mat=METAL, bevel=0.05)
    hp.hazard(Vector((-0.3, -0.22, 1.05)), Vector((0.3, -0.22, 1.05)), (0, -1, 0), 0.08, 7)
    # loose wires hanging from the waist
    for k, (x, ln, col) in enumerate(((-0.2, 0.42, SIGNAL_RED), (-0.08, 0.3, COPPER), (0.15, 0.5, BLACK),
                                      (0.26, 0.34, HAZARD))):
        top = Vector((x, -0.2, 0.92))
        hp.tube([top, top + Vector((0.02, -0.04, -ln * 0.5)), top + Vector((0.05 * (k - 1.5), -0.02, -ln))],
                [0.016, 0.016, 0.014], col, sides=5)
    sp = part('Spine', 'Spine')
    strut(sp, (0, 0.02, 1.02), (0, 0.02, 1.36), 0.09, STEEL)
    for k in range(3):
        sp.ring(Vector((0, 0.02, 1.1 + 0.08 * k)), (0, 0, 1), 0.12, 0.02, BRASS_D, sides=12)
    # ---- the chest: a cage of ribs round an empty, sparking socket -----------------------------
    ch = part('Chest', 'Chest')
    for k in range(5):
        z = 1.34 + 0.09 * k
        rr = 0.42 + 0.06 * math.sin(math.pi * (k + 0.5) / 5)
        pts = [Vector((math.sin(a) * rr, 0.04 - math.cos(a) * rr * 0.75, z)) for a in
               (math.radians(x) for x in range(-150, 151, 12))]
        ch.tube(pts, [0.03] * len(pts), BRASS if k % 2 else lerp(BRASS, IRON, 0.4), sides=6, mat=METAL)
    ch.cyl(Vector((0, 0.3, 1.32)), Vector((0, 0.3, 1.8)), 0.07, IRON, sides=10)          # the back spine
    ch.obox((0, 0.32, 1.56), (0.5, 0.06, 0.4), basis((0, 1, 0)), IRON_D, mat=METAL, bevel=0.02)
    # half a breast plate bolted on (the left side), a stamped QC tag hanging off it
    ch.obox((0.2, -0.33, 1.62), (0.36, 0.06, 0.34), basis((0.25, -1, 0.1)), BRASS, mat=METAL, bevel=0.03)
    ch.rivets([Vector((0.06, -0.36, 1.74)), Vector((0.34, -0.31, 1.74)), Vector((0.06, -0.36, 1.5))], 0.022,
              BRASS_D)
    ch.obox((0.32, -0.36, 1.42), (0.1, 0.01, 0.14), basis((0, -1, 0)), (0.85, 0.82, 0.72))
    ch.obox((0.32, -0.37, 1.43), (0.06, 0.01, 0.025), basis((0, -1, 0)), SIGNAL_RED)
    # the socket housing (the light inside is its own bone)
    ch.ring(CORE_C + Vector((0, -0.1, 0)), (0, -1, 0), 0.13, 0.03, COPPER, sides=16)
    ch.coil(tuple(CORE_C + Vector((0, 0.06, 0))), (0, -1, 0), 0.11, 0.18, 4, 0.014, COPPER_D)
    for s in (-1, 1):   # shoulder yokes
        ch.obox((s * 0.48, 0.03, 1.72), (0.36, 0.3, 0.12), basis((0, 0, 1)), IRON_HI, mat=METAL, bevel=0.03)
    cr = part('Core', 'Core')
    cr.blob(tuple(CORE_C), (0.24, 0.24, 0.24), ARC, segments=12, rings=8, mat=GLOW)
    cr.blob(tuple(CORE_C + Vector((0, -0.03, 0))), (0.12, 0.12, 0.12), ARC_HOT, segments=8, rings=6, mat=GLOW)
    for k in range(6):   # little static forks round the socket
        a = math.tau * k / 6
        q = CORE_C + Vector((math.cos(a) * 0.1, -0.02, math.sin(a) * 0.1))
        cr.tube([q, q + Vector((math.cos(a + 0.6) * 0.05, -0.02, math.sin(a + 0.6) * 0.05))], [0.01, 0.003],
                ARC_HOT, sides=4, mat=GLOW)
    # ---- the head: a half-skinned cage, one lens ------------------------------------------------
    hd = part('Head', 'Head')
    hc = Vector((0, -0.08, 2.0))
    for k in range(4):
        a = math.pi * k / 4
        pts = [hc + Vector((math.cos(a) * math.sin(t) * 0.22, math.sin(a) * math.sin(t) * 0.22, math.cos(t) * 0.22))
               for t in (math.radians(x) for x in range(-160, 161, 20))]
        hd.tube(pts, [0.018] * len(pts), IRON_HI, sides=5, mat=METAL)
    hd.ring(hc, (0, 0, 1), 0.22, 0.025, BRASS_D, sides=18)
    # half the faceplate, the right side bare
    hd.obox(tuple(hc + Vector((0.08, -0.19, 0.02))), (0.2, 0.06, 0.32), basis((0.2, -1, 0)), BRASS, mat=METAL,
            bevel=0.025)
    hd.cyl(EYE_C + Vector((0, 0.06, 0)), EYE_C - Vector((0, 0.02, 0)), 0.06, IRON_D, sides=12)
    hd.ring(EYE_C - Vector((0, 0.02, 0)), (0, -1, 0), 0.06, 0.014, BRASS_HI, sides=14)
    hd.blob(tuple(hc + Vector((0, 0.0, -0.05))), (0.16, 0.16, 0.16), COPPER_D, segments=10, rings=6, mat=METAL)
    ey = part('Eye', 'Eye')
    ey.blob(tuple(EYE_C - Vector((0, 0.025, 0))), (0.09, 0.04, 0.09), ARC, segments=10, rings=6, mat=GLOW)
    # ---- the left arm, plated; the right arm a stump with its cables ----------------------------
    sh, el, wr, hn = (M(J[k], 1) for k in ('shoulder', 'elbow', 'wrist', 'hand'))
    ua = part('Arm.L', 'Arm.L')
    joint(ua, sh, 0.12)
    plated_limb(ua, sh, el, 0.13, 0.11, s=1, plates=1)
    joint(ua, el, 0.1)
    fo = part('Fore.L', 'Fore.L')
    bare_limb(fo, el, wr, 0.07, IRON)
    fo.obox(tuple(el.lerp(wr, 0.5) + Vector((0.08, -0.02, 0))), (0.05, 0.2, 0.3), basis((wr - el).normalized(), (1, 0, 0)),
            BRASS, mat=METAL, bevel=0.015)
    hd_ = part('Hand.L', 'Hand.L')
    claw_fist(hd_, wr, hn + (hn - wr) * 0.2, 0.13, 1)
    shr = M(J['shoulder'], -1)
    st = part('Arm.R', 'Arm.R')
    joint(st, shr, 0.12)
    elr = M(J['elbow'], -1)
    stub_end = shr.lerp(elr, 0.42)
    st.cyl(shr, stub_end, 0.1, IRON, sides=12)
    st.disc(tuple(stub_end), tuple((elr - shr).normalized()), 0.12, 0.04, IRON_D, sides=12)
    st.blob(tuple(stub_end + (elr - shr).normalized() * 0.02), (0.1, 0.1, 0.06), BLACK, segments=8, rings=4)
    cb = part('Cables', 'Cables')
    c0, c1 = REST['Cables']
    for k, (dx, col, ln) in enumerate(((-0.04, SIGNAL_RED, 1.0), (0.0, COPPER, 0.8), (0.04, BLACK, 1.15),
                                       (0.02, HAZARD, 0.7))):
        a = c0 + Vector((dx, 0.02 * (k - 1.5), 0))
        b = c0.lerp(c1, ln) + Vector((dx * 2, 0.03 * k, 0))
        cb.tube([a, a.lerp(b, 0.5) + Vector((0.02, -0.02, 0)), b], [0.018, 0.018, 0.014], col, sides=5)
        cb.blob(tuple(b), (0.04, 0.04, 0.04), STEEL, segments=6, rings=4, mat=METAL)
    cb.blob(tuple(c0.lerp(c1, 1.08) + Vector((0.05, 0.04, 0))), (0.06, 0.06, 0.06), ARC_HOT, segments=6, rings=4,
            mat=GLOW)
    # ---- legs: the left plated, the right a bare skeleton ---------------------------------------
    for s, tag in ((1, '.L'), (-1, '.R')):
        hp_, kn, an, to = (M(J[k], s) for k in ('hip', 'knee', 'ankle', 'toe'))
        th = part('Thigh' + tag, 'Thigh' + tag)
        joint(th, hp_, 0.12)
        sn = part('Shin' + tag, 'Shin' + tag)
        joint(sn, kn, 0.11)
        if s > 0:
            plated_limb(th, hp_, kn, 0.15, 0.13, s=s, plates=1, ribbed=True)
            plated_limb(sn, kn, an, 0.13, 0.14, s=s, plates=2)
        else:
            bare_limb(th, hp_, kn, 0.08, IRON)
            bare_limb(sn, kn, an, 0.075, IRON)
        ft = part('Foot' + tag, 'Foot' + tag)
        iron_foot(ft, an, to, 0.3 if s > 0 else 0.27, color=IRON if s > 0 else IRON_D)
    return parts


def make_clips(arm):
    pose = Poser(arm, BONES, REST, dict(
        wrist_l=(0.78, -0.22, 0.95), wrist_r=(-0.76, -0.1, 1.2), hand_l=(0.05, -0.35, -1.0),
        hand_r=(0.0, -0.2, -1.0), foot_l=(0.3, 0.0, 0.18), foot_r=(-0.3, 0.0, 0.18)))
    clips = []

    def add(name, frames, fn, loop=True):
        anim(arm, name, frames, fn, loop)
        clips.append(name)

    def flick(f, base=1.0):
        """A flicker scale for the socket and lens (hashed, 0..1 of `base`)."""
        x = math.sin(f * 12.9898 + 3.1) * 43758.5453
        j = x - math.floor(x)
        return max(0.05, base * (0.75 + 0.4 * j) if j > 0.12 else base * 0.25)

    def cables(sway):
        return {'Cables': (0.15 * sway, -0.05, -1.0)}

    def idle(f):
        ph = math.tau * f / 60
        b = math.sin(ph)
        tw = 6 * max(0.0, math.sin(ph * 5)) ** 12      # a sudden twitch now and then
        return pose(root=(0.02 * b, 0, -0.03 + 0.015 * b), side=0.08, lean=0.06, twist=tw, look=(0.15 + 0.1 * b, -0.05),
                    wrist_l=(0.78, -0.24, 0.97 + 0.02 * b), aims=cables(b),
                    scales={'Core': flick(f), 'Eye': flick(f + 7, 1.0)})
    add('Idle', 60, idle)

    def lurch(ph, amp, run_=False):
        sl = 0.3 * amp
        lift = 0.18 * amp
        fl = (0.3, -sl * math.cos(ph), 0.18 + lift * max(0.0, math.sin(ph)))
        fr = (-0.3, sl * math.cos(ph), 0.18 + 0.6 * lift * max(0.0, -math.sin(ph)))
        sw = math.sin(ph)
        dip = max(0.0, -sw)     # it sags onto the bare right leg
        return pose(root=(0.06 * sw * amp - 0.04 * dip, -0.04 * amp, -0.04 - 0.1 * dip * amp), lean=0.14 + (0.1 if run_ else 0),
                    side=0.08 - 0.15 * dip, twist=-12 * sw * amp, foot_l=fl, foot_r=fr,
                    wrist_l=(0.8, -0.22 - 0.25 * math.cos(ph) * amp, 1.0), look=(0.1 * sw, -0.08), aims=cables(sw * 2),
                    scales={'Core': 1.0, 'Eye': 1.0})
    add('Walk', 34, lambda f: lurch(math.tau * f / 34, 1.0))
    add('Run', 22, lambda f: lurch(math.tau * f / 22, 1.35, True))
    tr_a = tracks({
        'wrist_l': [(0, (0.78, -0.22, 0.95)), (8, (1.0, 0.3, 1.5)), (11, (0.98, 0.32, 1.52)), (14, (0.1, -1.0, 1.1), 'in'),
                    (16, (-0.1, -0.9, 1.0), 'back'), (24, (0.78, -0.22, 0.95))],
        'hand_l': [(0, (0.05, -0.35, -1.0)), (8, (0.3, 0.2, 0.6)), (14, (-0.6, -0.6, -0.3), 'in'), (24, (0.05, -0.35, -1.0))],
        'twist': [(0, 0), (8, 22), (11, 24), (14, -26, 'in'), (16, -30, 'back'), (24, 0)],
        'lean': [(0, 0.06), (8, -0.05), (14, 0.25, 'in'), (24, 0.06)],
        'root': [(0, (0, 0, -0.03)), (14, (0.02, -0.1, -0.08), 'in'), (24, (0, 0, -0.03))],
        'look': [(0, (0.15, -0.05)), (8, (0.2, 0.05)), (14, (-0.15, -0.1)), (24, (0.15, -0.05))],
    })
    add('Attack', 24, lambda f: pose(**tr_a(f), side=0.08, aims=cables(0.5), scales={'Core': flick(f), 'Eye': 1.0}),
        loop=False)
    tr_h = tracks({
        'root': [(0, (0, 0, -0.03)), (3, (0.05, 0.12, 0.0), 'snap'), (16, (0, 0, -0.03))],
        'lean': [(0, 0.06), (3, -0.25, 'snap'), (16, 0.06)],
        'twist': [(0, 0), (3, 14, 'snap'), (16, 0)],
        'look': [(0, (0.15, -0.05)), (3, (-0.3, 0.3), 'snap'), (16, (0.15, -0.05))],
    })
    add('Hit', 16, lambda f: pose(**tr_h(f), side=0.08, aims=cables(1.5 * math.sin(f)),
                                  scales={'Core': flick(f), 'Eye': flick(f + 3)}), loop=False)
    tr_d = tracks({
        'root': [(0, (0, 0, -0.03)), (6, (0.05, 0.05, -0.1)), (16, (-0.1, -0.05, -0.55), 'in'), (20, (-0.1, -0.05, -0.5), 'back'),
                 (34, (-0.2, -0.15, -0.28), 'in'), (40, (-0.2, -0.15, -0.3)), (44, (-0.2, -0.15, -0.3))],
        'tilt': [(0, 0.0), (16, 10.0, 'in'), (34, 70.0, 'in'), (38, 66.0, 'back'), (44, 67.0)],
        'side': [(0, 0.08), (16, -0.4), (44, -0.5)],
        'foot_l': [(0, (0.3, 0.0, 0.18)), (16, (0.32, 0.25, 0.18)), (34, (0.34, 0.85, 0.22)), (44, (0.34, 0.9, 0.2))],
        'foot_r': [(0, (-0.3, 0.0, 0.18)), (12, (-0.36, 0.2, 0.18)), (34, (-0.4, 0.8, 0.22)), (44, (-0.42, 0.85, 0.2))],
        'wrist_l': [(0, (0.78, -0.22, 0.95)), (16, (0.9, -0.6, 1.0)), (34, (1.2, -0.6, 1.55)), (44, (1.25, -0.5, 1.6))],
        'look': [(0, (0.15, -0.05)), (16, (0.3, -0.3)), (44, (0.5, -0.2))],
    })
    fade_d = tracks({'k': [(0, 1.0), (10, 0.9), (16, 0.2), (20, 0.6), (26, 0.05), (44, 0.01)]})
    add('Death', 44, lambda f: pose(**tr_d(f), aims=cables(0.0), scales={'Core': max(0.01, fade_d(f)['k'] * flick(f)),
                                                                           'Eye': max(0.01, fade_d(f + 2)['k'])}),
        loop=False)

    # Dormant: slumped, head hanging, the socket and lens guttering.
    def dormant(f):
        ph = math.tau * f / 48
        return pose(root=(0.05, 0.12, -0.36 + 0.01 * math.sin(ph)), lean=1.15, side=0.35, twist=10,
                    look=(0.2, -1.3), wrist_l=(0.62, -0.75, 0.35), hand_l=(0.0, -0.3, -1.0),
                    foot_l=(0.32, -0.08, 0.18), foot_r=(-0.34, 0.12, 0.18), aims=cables(0.0),
                    scales={'Core': 0.25 * flick(f, 1.0), 'Eye': 0.02 + 0.05 * flick(f + 5, 1.0)})
    add('Dormant', 48, dormant)
    # BootUp: spasms, the lens snaps on, it hauls itself upright.
    tr_u = tracks({
        'root': [(0, (0.05, 0.12, -0.36)), (10, (0.06, 0.1, -0.33)), (22, (0.03, 0.06, -0.26)), (40, (0.02, 0.02, -0.12), 'out'),
                 (56, (0.0, 0.0, 0.02), 'back'), (72, (0.0, 0.0, -0.03))],
        'lean': [(0, 1.15), (22, 1.0), (40, 0.3, 'out'), (56, -0.05, 'back'), (72, 0.06)],
        'side': [(0, 0.35), (30, 0.25), (56, 0.0), (72, 0.08)],
        'twist': [(0, 10), (30, 4), (56, -8), (72, 0)],
        'look': [(0, (0.2, -1.3)), (24, (0.1, -1.1)), (30, (0.0, 0.25), 'snap'), (44, (-0.2, 0.15)),
                 (56, (0.2, 0.0)), (72, (0.15, -0.05))],
        'wrist_l': [(0, (0.62, -0.75, 0.35)), (36, (0.8, -0.6, 0.75)), (50, (1.0, -0.4, 1.35), 'out'),
                    (72, (0.78, -0.24, 0.97))],
        'hand_l': [(0, (0.0, -0.3, -1.0)), (50, (0.3, -0.5, 0.6)), (72, (0.05, -0.35, -1.0))],
        'foot_l': [(0, (0.32, -0.08, 0.18)), (72, (0.3, 0.0, 0.18))],
        'foot_r': [(0, (-0.34, 0.12, 0.18)), (72, (-0.3, 0.0, 0.18))],
    })
    eye_u = tracks({'k': [(0, 0.03), (28, 0.05), (30, 1.4, 'snap'), (34, 0.8), (36, 1.2), (72, 1.0)]})
    core_u = tracks({'k': [(0, 0.2), (8, 0.8, 'snap'), (11, 0.1), (16, 1.0, 'snap'), (19, 0.2), (26, 1.2, 'snap'),
                           (40, 1.0), (72, 1.0)]})

    def boot(f):
        kw = tr_u(f)
        if f < 30:   # spasms: the frame jerks as the charge catches
            j = math.sin(f * 7.3) * math.sin(f * 2.1)
            kw['twist'] += 9 * j
            kw['look'] = (kw['look'][0] + 0.12 * j, kw['look'][1])
        return pose(**kw, aims=cables(math.sin(f * 0.5)), scales={'Core': core_u(f)['k'] * flick(f, 1.0),
                                                                   'Eye': eye_u(f)['k']})
    add('BootUp', 72, boot, loop=False)
    return clips


if __name__ == '__main__':
    run('HalfBuiltFrame', BONES, build_parts, make_clips, atlas=1024,
        sheet_args={'prefix': 'frame', 'focus': (0.1, -0.2, 1.2), 'dist': 4.6, 'scale': 1.5, 'ref_side': -1.6},
        anchors=[('Idle', 13, 'Head', False), ('Idle', 13, 'Core', False), ('BootUp', 30, 'Eye', False)])
