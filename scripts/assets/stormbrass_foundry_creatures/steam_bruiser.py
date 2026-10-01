"""The Steam Bruiser: the Stormbrass Foundry's boiler-bellied brute
(sim/content/stormbrass_foundry.ts `steam_bruiser`, its Overpressure and the
Boiler Burst it leaves 1.5 s after it falls).

  blender -b --factory-startup --python steam_bruiser.py -- <out.glb|-> [--sheet dir] [--blend f] [--fast] [--nobake]

A great riveted boiler walking on short iron legs: banded copper and brass
plates, a firebox grate in its belly glowing storm blue-white through its bars
(no ember orange: the Foundry runs on lightning), gauges and a valve wheel,
pipes looping round to two tall chimneys on its shoulders. Enormous plated
arms hang to its knees and end in riveted gauntlet fists; a small iron head
with two lit eyes and a grilled jaw sits sunk forward between the shoulders.

Scale: about 2.9 yards authored; its VISUALS row draws it some 4.6 yards tall
at its template's 1.6 (a player stands 2.6).

Clips (24 fps): Idle (the boiler heaving), Walk, Run (a knuckling charge),
Attack (a looping right hook), Attack2 (both fists raised and hammered down),
Hit, Death (it seizes: the boiler shudders harder and harder to ~36 f as the
pressure builds, it drops to its knees and pitches forward on its fists).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from automaton import M, Poser, claw_fist, frame_bones, iron_foot, joint, plated_limb, steam_vent  # noqa: E402
from foundry_kit import (  # noqa: E402
    ARC, ARC_HOT, BLACK, BRASS, BRASS_D, BRASS_HI, COPPER, COPPER_D, GLOW, HAZARD, IRON, IRON_D, IRON_HI, LIGHTNING,
    METAL, SIGNAL_RED, STEEL, MPart, Matrix, Vector, anim, basis, lerp, run, tracks,
)

J = dict(hips=(0, 0, 0.9), spine_top=(0, 0.05, 1.3), chest_top=(0, 0.08, 2.0), head=(0, -0.44, 1.96),
         head_top=(0, -0.52, 2.3), shoulder=(0.94, 0.05, 1.9), elbow=(1.24, 0.05, 1.3), wrist=(1.3, -0.16, 0.74),
         hand=(1.32, -0.26, 0.46), hip=(0.38, 0.0, 0.86), knee=(0.42, -0.08, 0.5), ankle=(0.42, 0.02, 0.18),
         toe=(0.42, -0.4, 0.05))
BONES = frame_bones(J)
REST = {n: (Vector(h), Vector(t)) for n, _, h, t in BONES}
BOILER_C = Vector((0, 0.08, 1.45))
BOILER_R = 0.74


def build_parts():
    parts = []

    def part(name, bone, **kw):
        pt = MPart(name, bone, **kw)
        parts.append(pt)
        return pt

    hp = part('Hips', 'Hips')
    hp.obox((0, 0.04, 0.88), (0.95, 0.65, 0.3), basis((0, 0, 1)), IRON, mat=METAL, bevel=0.06)
    hp.hazard(Vector((-0.42, -0.31, 0.9)), Vector((0.42, -0.31, 0.9)), (0, -1, 0), 0.1, 9)
    # ---- the boiler: the whole torso (on the Chest bone so it heaves with the breath) ---------
    ch = part('Chest', 'Chest')
    b0, b1 = BOILER_C - Vector((0, 0, 0.55)), BOILER_C + Vector((0, 0, 0.45))
    hull = lerp(COPPER, BRASS, 0.5)
    ch.cyl(b0, b1, BOILER_R, hull, sides=28, r2=BOILER_R * 1.02)
    ch.blob(tuple(b1), (BOILER_R * 2.04, BOILER_R * 2.04, 0.9), hull, segments=28, rings=12, mat=METAL)
    ch.blob(tuple(b0), (BOILER_R * 2.0, BOILER_R * 2.0, 0.45), COPPER_D, segments=28, rings=8, mat=METAL)
    for z in (-0.5, -0.18, 0.14, 0.42):
        c = BOILER_C + Vector((0, 0, z))
        ch.ring(c, (0, 0, 1), BOILER_R * 1.015, 0.045, BRASS_D if z != 0.14 else IRON, sides=32)
        ch.rivet_circle(c + Vector((0, 0, 0.06)), (0, 0, 1), BOILER_R * 1.01, 18, 0.022, BRASS_D)
    for a in (-1.1, -0.55, 0.55, 1.1, math.pi):
        ch.rivet_line(BOILER_C + Vector((math.sin(a) * BOILER_R, -math.cos(a) * BOILER_R, -0.48)),
                      BOILER_C + Vector((math.sin(a) * BOILER_R, -math.cos(a) * BOILER_R, 0.4)), 7, 0.02, BRASS_D,
                      normal=(math.sin(a), -math.cos(a), 0))
    # the firebox in the belly: an iron frame, a bar grate, the storm light behind it
    fb = BOILER_C + Vector((0, -BOILER_R + 0.02, -0.22))
    fr = basis((0, -1, 0))
    ch.obox(tuple(fb), (0.62, 0.12, 0.48), fr, IRON, mat=METAL, bevel=0.04)
    ch.blob(tuple(fb + Vector((0, -0.02, 0))), (0.5, 0.12, 0.36), ARC, segments=14, rings=8, mat=GLOW)
    ch.blob(tuple(fb + Vector((0, -0.04, -0.03))), (0.3, 0.08, 0.18), ARC_HOT, segments=10, rings=6, mat=GLOW)
    for k in range(6):
        ch.cyl(fb + Vector((-0.22 + 0.088 * k, -0.08, -0.2)), fb + Vector((-0.22 + 0.088 * k, -0.08, 0.2)), 0.022,
               IRON_D, sides=6)
    ch.obox(tuple(fb + Vector((0, -0.08, 0.27))), (0.66, 0.06, 0.07), fr, BRASS, mat=METAL, bevel=0.015)
    ch.obox(tuple(fb + Vector((0, -0.08, -0.27))), (0.66, 0.06, 0.07), fr, BRASS, mat=METAL, bevel=0.015)
    ch.rivets([fb + Vector((x, -0.1, z)) for x in (-0.28, 0.28) for z in (-0.2, 0.2)], 0.025, BRASS_HI)
    # gauges, a valve wheel, a warning plate
    ch.gauge(tuple(BOILER_C + Vector((-0.38, -0.66, 0.22))), (-0.5, -0.86, 0.1), 0.11, ticks=7)
    ch.gauge(tuple(BOILER_C + Vector((0.4, -0.64, 0.25))), (0.52, -0.84, 0.1), 0.08, ticks=6)
    ch.obox(tuple(BOILER_C + Vector((0.0, -0.74, 0.28))), (0.3, 0.02, 0.1), basis((0, -1, 0)), HAZARD, bevel=0.01)
    ch.obox(tuple(BOILER_C + Vector((0.0, -0.75, 0.28))), (0.22, 0.02, 0.04), basis((0, -1, 0)), BLACK)
    wc = BOILER_C + Vector((0, BOILER_R + 0.08, 0.1))
    ch.ring(wc, (0, 1, 0), 0.24, 0.03, SIGNAL_RED, sides=22)
    for k in range(4):
        a = math.pi * k / 4
        ch.cyl(wc + Vector((math.cos(a) * 0.24, 0, math.sin(a) * 0.24)),
               wc - Vector((math.cos(a) * 0.24, 0, math.sin(a) * 0.24)), 0.018, SIGNAL_RED, sides=6)
    ch.cyl(wc - Vector((0, 0.1, 0)), wc + Vector((0, 0.02, 0)), 0.05, IRON, sides=10)
    # pipes looping from the boiler to the chimneys, and the chimneys on the shoulders
    for s in (-1, 1):
        base = Vector((s * 0.66, 0.2, 2.02))
        ch.cyl(base, base + Vector((s * 0.06, 0.1, 0.78)), 0.13, IRON, sides=14, r2=0.14)
        ch.lathe(tuple(base + Vector((s * 0.06, 0.1, 0.78))), [(0.15, 0), (0.22, 0.08), (0.24, 0.16), (0.18, 0.18)],
                 16, BRASS_D, mat=METAL)
        ch.disc(tuple(base + Vector((s * 0.06, 0.1, 0.94))), (0, 0, 1), 0.16, 0.02, BLACK, sides=14)
        for z in (0.2, 0.5):
            ch.ring(base + Vector((s * 0.015 * z * 4, 0.025 * z * 4, z)), (0, 0, 1), 0.14, 0.025, COPPER_D, sides=14)
        ch.pipe([BOILER_C + Vector((s * 0.6, -0.3, -0.35)), BOILER_C + Vector((s * 0.86, -0.32, 0.0)),
                 BOILER_C + Vector((s * 0.82, -0.1, 0.45)), base + Vector((0, -0.1, 0.1))], 0.05, BRASS)
        steam_vent(ch, tuple(BOILER_C + Vector((s * 0.5, 0.52, -0.3))), (s * 0.6, 0.8, -0.2), 0.08)
    # the shoulder yokes
    for s in (-1, 1):
        ch.blob((s * 0.9, 0.05, 1.98), (0.72, 0.72, 0.58), BRASS, segments=18, rings=10, mat=METAL)
        ch.ring(Vector((s * 0.9, 0.05, 1.86)), (s * 0.4, 0, 1), 0.34, 0.04, IRON, sides=20)
        ch.rivet_circle(Vector((s * 0.92, 0.05, 1.92)), (s * 0.4, 0, 1), 0.33, 10, 0.022, BRASS_D)
    # the waist under the boiler
    sp = part('Spine', 'Spine')
    sp.cyl(Vector((0, 0.04, 0.9)), Vector((0, 0.06, 1.0)), 0.5, IRON_D, sides=20)
    # ---- the head: small, sunk forward, two lit eyes, a grilled jaw ---------------------------
    hd = part('Head', 'Head')
    hc = Vector((0, -0.52, 2.08))
    hd.blob(tuple(hc + Vector((0, 0.02, 0.03))), (0.5, 0.46, 0.42), IRON_HI, segments=20, rings=12, mat=METAL)
    hd.obox(tuple(hc + Vector((0, -0.14, 0.1))), (0.46, 0.14, 0.1), basis((0, -1, 0.2)), BRASS_D, mat=METAL, bevel=0.03)
    for s in (-1, 1):
        e = hc + Vector((s * 0.1, -0.205, 0.02))
        hd.obox(tuple(e + Vector((0, 0.02, 0))), (0.13, 0.05, 0.07), basis((0, -1, 0)), BLACK, bevel=0.01)
        hd.obox(tuple(e - Vector((0, 0.008, 0))), (0.11, 0.02, 0.035), Matrix.Rotation(s * 0.25, 3, 'Y'), ARC,
                mat=GLOW)
        # a heavy riveted brow plate slanting down over each eye
        hd.obox(tuple(e + Vector((s * 0.01, -0.03, 0.075))), (0.17, 0.06, 0.05),
                basis((0, -1, 0)) @ Matrix.Rotation(-s * 0.35, 3, 'Z'), BRASS, mat=METAL, bevel=0.012)
    hd.obox(tuple(hc + Vector((0, -0.17, -0.12))), (0.3, 0.1, 0.14), basis((0, -1, -0.2)), IRON_D, mat=METAL,
            bevel=0.02)
    for k in range(5):
        hd.obox(tuple(hc + Vector((-0.1 + 0.05 * k, -0.225, -0.12))), (0.02, 0.02, 0.1), basis((0, -1, 0)), BRASS)
    hd.rivet_line(hc + Vector((-0.2, -0.12, 0.18)), hc + Vector((0.2, -0.12, 0.18)), 5, 0.018, BRASS_D)
    # ---- arms: enormous, plated, gauntlet fists -----------------------------------------------
    for s, tag in ((1, '.L'), (-1, '.R')):
        sh, el, wr, hn = (M(J[k], s) for k in ('shoulder', 'elbow', 'wrist', 'hand'))
        ua = part('Arm' + tag, 'Arm' + tag)
        joint(ua, sh, 0.22)
        plated_limb(ua, sh, el, 0.24, 0.22, s=s, plates=2, rivet=0.024)
        joint(ua, el, 0.2)
        fo = part('Fore' + tag, 'Fore' + tag)
        plated_limb(fo, el, wr, 0.27, 0.32, s=s, plates=2, rivet=0.026, color=COPPER)
        fo.ring(wr, (wr - el).normalized(), 0.33, 0.05, BRASS_HI, sides=20)
        fo.pipe([el + Vector((s * 0.2, 0.15, -0.05)), wr + Vector((s * 0.24, 0.18, 0.12))], 0.04, BRASS, flanges=False)
        hd_ = part('Hand' + tag, 'Hand' + tag)
        claw_fist(hd_, wr, hn + (hn - wr) * 0.35, 0.28, s, color=IRON, knuckle=BRASS_HI)
    # ---- legs: short, thick ----------------------------------------------------------------
    for s, tag in ((1, '.L'), (-1, '.R')):
        hp_, kn, an, to = (M(J[k], s) for k in ('hip', 'knee', 'ankle', 'toe'))
        th = part('Thigh' + tag, 'Thigh' + tag)
        joint(th, hp_, 0.2)
        plated_limb(th, hp_, kn, 0.23, 0.2, s=s, plates=1, ribbed=True)
        sn = part('Shin' + tag, 'Shin' + tag)
        joint(sn, kn, 0.18)
        plated_limb(sn, kn, an, 0.22, 0.24, s=s, plates=1)
        ft = part('Foot' + tag, 'Foot' + tag)
        iron_foot(ft, an, to, 0.48)
    return parts


def make_clips(arm):
    pose = Poser(arm, BONES, REST, dict(
        wrist_l=(1.28, -0.3, 0.8), wrist_r=(-1.28, -0.3, 0.8), hand_l=(0.0, -0.4, -1.0),
        hand_r=(0.0, -0.4, -1.0), foot_l=(0.44, 0.0, 0.18), foot_r=(-0.44, 0.0, 0.18)))
    clips = []

    def add(name, frames, fn, loop=True):
        anim(arm, name, frames, fn, loop)
        clips.append(name)

    def idle(f):
        ph = math.tau * f / 56
        b = math.sin(ph)
        return pose(root=(0, 0, -0.04 + 0.03 * b), lean=0.1 + 0.03 * b, look=(0.12 * math.sin(ph * 0.5), 0.0),
                    wrist_l=(1.3, -0.32, 0.82 + 0.04 * b), wrist_r=(-1.3, -0.32, 0.82 + 0.04 * b),
                    scales={'Chest': (1.0 + 0.02 * b, 1.0, 1.0 + 0.02 * b)})
    add('Idle', 56, idle)

    def stride(ph, amp, run_=False):
        sl = 0.36 * amp
        lift = 0.18 * amp
        fl = (0.44, -sl * math.cos(ph), 0.18 + lift * max(0.0, math.sin(ph)))
        fr = (-0.44, sl * math.cos(ph), 0.18 + lift * max(0.0, -math.sin(ph)))
        bob = abs(math.cos(ph))
        sw = math.sin(ph)
        return pose(root=(0.08 * sw * amp, -0.06 * amp, -0.05 - 0.08 * bob * amp), lean=0.16 + (0.18 if run_ else 0),
                    twist=-9 * sw * amp, side=0.06 * sw, foot_l=fl, foot_r=fr,
                    wrist_l=(1.3, -0.3 - 0.4 * math.cos(ph) * amp, 0.82 + (0.06 if run_ else 0)),
                    wrist_r=(-1.3, -0.3 + 0.4 * math.cos(ph) * amp, 0.82 + (0.06 if run_ else 0)), look=(0.03 * sw, 0.05),
                    scales={'Chest': (1.0 + 0.01 * bob, 1.0, 1.0)})
    add('Walk', 36, lambda f: stride(math.tau * f / 36, 1.0))
    add('Run', 22, lambda f: stride(math.tau * f / 22, 1.45, True))
    tr_a = tracks({
        'wrist_r': [(0, (-1.28, -0.3, 0.8)), (9, (-1.6, 0.6, 1.7)), (12, (-1.55, 0.65, 1.75)), (15, (-0.2, -1.55, 1.4), 'in'),
                    (17, (0.15, -1.45, 1.3), 'back'), (24, (-0.9, -0.8, 1.0)), (32, (-1.28, -0.3, 0.8))],
        'hand_r': [(0, (0.0, -0.4, -1.0)), (9, (-0.3, 0.4, 0.6)), (15, (0.8, -0.6, 0.0), 'in'), (32, (0.0, -0.4, -1.0))],
        'twist': [(0, 0), (9, -30), (12, -32), (15, 26, 'in'), (17, 32, 'back'), (32, 0)],
        'lean': [(0, 0.1), (9, 0.0), (15, 0.3, 'in'), (32, 0.1)],
        'root': [(0, (0, 0, -0.04)), (9, (0.06, 0.08, -0.04)), (15, (-0.06, -0.18, -0.12), 'in'),
                 (17, (-0.07, -0.2, -0.14), 'back'), (32, (0, 0, -0.04))],
        'foot_r': [(0, (-0.44, 0.0, 0.18)), (11, (-0.48, 0.06, 0.32)), (14, (-0.46, -0.32, 0.18), 'in'),
                   (32, (-0.44, 0.0, 0.18))],
        'look': [(0, (0.0, 0.0)), (9, (0.15, 0.05)), (15, (-0.1, -0.05)), (32, (0.0, 0.0))],
    })
    add('Attack', 32, lambda f: pose(**tr_a(f)), loop=False)
    tr_b = tracks({
        'wrist_r': [(0, (-1.28, -0.3, 0.8)), (10, (-0.55, 0.2, 2.9)), (13, (-0.5, 0.25, 2.95)), (16, (-0.4, -1.4, 0.75), 'in'),
                    (18, (-0.38, -1.42, 0.62), 'back'), (26, (-0.9, -0.9, 0.85)), (34, (-1.28, -0.3, 0.8))],
        'wrist_l': [(0, (1.28, -0.3, 0.8)), (10, (0.55, 0.2, 2.9)), (13, (0.5, 0.25, 2.95)), (16, (0.4, -1.4, 0.75), 'in'),
                    (18, (0.38, -1.42, 0.62), 'back'), (26, (0.9, -0.9, 0.85)), (34, (1.28, -0.3, 0.8))],
        'hand_r': [(0, (0.0, -0.4, -1.0)), (10, (0.2, 0.1, 1.0)), (16, (0.0, -0.8, -0.6), 'in'), (34, (0.0, -0.4, -1.0))],
        'hand_l': [(0, (0.0, -0.4, -1.0)), (10, (-0.2, 0.1, 1.0)), (16, (0.0, -0.8, -0.6), 'in'), (34, (0.0, -0.4, -1.0))],
        'lean': [(0, 0.1), (10, -0.28), (13, -0.3), (16, 0.45, 'in'), (18, 0.5, 'back'), (34, 0.1)],
        'root': [(0, (0, 0, -0.04)), (10, (0, 0.1, 0.1)), (16, (0, -0.15, -0.28), 'in'), (18, (0, -0.16, -0.32), 'back'),
                 (34, (0, 0, -0.04))],
        'look': [(0, (0.0, 0.0)), (10, (0.0, 0.3)), (16, (0.0, -0.3)), (34, (0.0, 0.0))],
    })
    add('Attack2', 34, lambda f: pose(**tr_b(f), scales={'Chest': (1.0, 1.0, 1.0)}), loop=False)
    tr_h = tracks({
        'root': [(0, (0, 0, -0.04)), (3, (0, 0.14, 0.0), 'snap'), (16, (0, 0, -0.04))],
        'lean': [(0, 0.1), (3, -0.18, 'snap'), (16, 0.1)],
        'look': [(0, (0.0, 0.0)), (3, (0.15, 0.3), 'snap'), (16, (0.0, 0.0))],
        'wrist_l': [(0, (1.28, -0.3, 0.8)), (3, (1.45, 0.0, 1.1), 'snap'), (16, (1.28, -0.3, 0.8))],
        'wrist_r': [(0, (-1.28, -0.3, 0.8)), (3, (-1.45, 0.0, 1.1), 'snap'), (16, (-1.28, -0.3, 0.8))],
    })
    add('Hit', 16, lambda f: pose(**tr_h(f)), loop=False)
    # Death: it seizes, the boiler shuddering harder to ~36 f; knees, then forward onto its fists.
    tr_d = tracks({
        'root': [(0, (0, 0, -0.04)), (8, (0, 0.06, -0.02)), (34, (0, 0.04, -0.1)), (40, (0, -0.1, -0.42), 'in'),
                 (44, (0, -0.1, -0.38), 'back'), (54, (0, -0.25, -0.38), 'in'), (58, (0, -0.25, -0.35), 'back'),
                 (64, (0, -0.25, -0.36))],
        'tilt': [(0, 0.0), (34, -4.0), (40, 8.0, 'in'), (54, 40.0, 'in'), (58, 37.0, 'back'), (64, 38.0)],
        'lean': [(0, 0.1), (8, -0.25), (34, -0.3), (40, 0.2), (64, 0.25)],
        'look': [(0, (0.0, 0.0)), (8, (0.0, 0.4)), (34, (0.1, 0.45)), (44, (0.0, -0.2)), (64, (0.1, -0.35))],
        'wrist_l': [(0, (1.28, -0.3, 0.8)), (8, (1.5, 0.1, 1.3)), (34, (1.55, 0.15, 1.4)), (54, (1.1, -1.0, 0.7), 'in'),
                    (64, (1.1, -1.0, 0.7))],
        'wrist_r': [(0, (-1.28, -0.3, 0.8)), (8, (-1.5, 0.1, 1.3)), (34, (-1.55, 0.15, 1.4)),
                    (54, (-1.1, -1.0, 0.7), 'in'), (64, (-1.1, -1.0, 0.7))],
        'foot_l': [(0, (0.44, 0.0, 0.18)), (40, (0.46, 0.4, 0.2)), (64, (0.46, 0.55, 0.2))],
        'foot_r': [(0, (-0.44, 0.0, 0.18)), (40, (-0.46, 0.45, 0.2)), (64, (-0.46, 0.6, 0.2))],
    })

    def death(f):
        kw = tr_d(f)
        k = min(1.0, f / 36.0) ** 2 if f < 40 else max(0.0, 1 - (f - 40) / 12)
        j = math.sin(f * 4.1) * math.sin(f * 1.7 + 0.5)
        kw['root'] = (kw['root'][0] + 0.03 * k * j, kw['root'][1], kw['root'][2] + 0.02 * k * math.sin(f * 5.3))
        return pose(**kw, twist=6 * k * j, scales={'Chest': (1.0 + 0.04 * k * abs(j), 1.0, 1.0 + 0.05 * k * abs(j))})
    add('Death', 64, death, loop=False)
    return clips


if __name__ == '__main__':
    run('SteamBruiser', BONES, build_parts, make_clips, atlas=1024,
        sheet_args={'prefix': 'bruiser', 'focus': (0.2, -0.2, 1.4), 'dist': 5.8, 'scale': 1.6, 'ref_side': -2.4},
        anchors=[('Idle', 13, 'Head', False), ('Idle', 13, 'Chest', False), ('Attack', 17, 'Hand.R', True),
                 ('Attack2', 18, 'Hand.R', True), ('Death', 40, 'Chest', False)])
