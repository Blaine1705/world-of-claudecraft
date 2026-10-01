"""The Shieldbearer Frame: the Stormbrass Foundry's big guard automaton
(sim/content/stormbrass_foundry.ts `shieldbearer_frame`, its Steam Screen cast).

  blender -b --factory-startup --python shieldbearer.py -- <out.glb|-> [--sheet dir] [--blend f] [--fast] [--nobake]

A heavy, broad-shouldered iron frame: a wedge torso of overlapping riveted
plates with a grilled storm core in its chest, layered pauldrons with two
steam stacks rising behind them, a horizontal boiler across its back, a small
sunken helm with ONE round lens of storm light. On its left hand a great
riveted TOWER SHIELD (modelled on the hand bone: it never turns against it):
a brass rim, an iron face banded with hazard paint at the foot, a viewport
slit and a brass boss. The right hand is a heavy clenched fist.

Scale: about 2.86 yards authored; its VISUALS row draws it some 5 yards tall at
its template's 1.75 (a player stands 2.6).

Clips (24 fps): Idle, Walk, Run, Attack (the shield bash: drawn back, rammed
forward with a step), Attack2 (the right fist hammered down), SteamScreen (the
2 s bar: the shield planted before it, the frame dropped into a brace, the
stacks venting; 48 f, played out), Hit, Death (it rocks back and topples onto
its back, the shield falling across it).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from automaton import (  # noqa: E402
    M, Poser, claw_fist, frame_bones, glow_core, iron_foot, joint, plated_limb, steam_vent,
)
from foundry_kit import (  # noqa: E402
    ARC, ARC_HOT, BLACK, BRASS, BRASS_D, BRASS_HI, COPPER, COPPER_D, GLOW, HAZARD, IRON, IRON_D, IRON_HI,
    METAL, MPart, Matrix, Vector, anim, basis, lerp, run, tracks,
)

J = dict(hips=(0, 0, 1.12), spine_top=(0, 0.03, 1.55), chest_top=(0, 0.05, 2.12), head=(0, -0.1, 2.1),
         head_top=(0, -0.12, 2.5), shoulder=(0.84, 0.03, 1.98), elbow=(1.02, 0.08, 1.5), wrist=(1.06, -0.1, 1.06),
         hand=(1.08, -0.18, 0.78), hip=(0.37, 0.0, 1.07), knee=(0.41, -0.05, 0.62), ankle=(0.41, 0.02, 0.22),
         toe=(0.41, -0.42, 0.07))
BONES = frame_bones(J)
REST = {n: (Vector(h), Vector(t)) for n, _, h, t in BONES}


def build_parts():
    parts = []

    def part(name, bone, **kw):
        pt = MPart(name, bone, **kw)
        parts.append(pt)
        return pt

    # ---- hips --------------------------------------------------------------------------------
    hp = part('Hips', 'Hips')
    hp.obox((0, 0.02, 1.1), (0.92, 0.6, 0.36), basis((0, 0, 1)), IRON, mat=METAL, bevel=0.06)
    for k, (x, yaw) in enumerate(((0.0, 0.0), (0.34, 0.45), (-0.34, -0.45))):
        f = Matrix.Rotation(yaw, 3, 'Z') @ Matrix.Rotation(-0.18, 3, 'X')
        hp.obox((x, -0.32 + abs(x) * 0.15, 0.86), (0.34, 0.05, 0.42), f, IRON_HI if k else BRASS_D, mat=METAL,
                bevel=0.025, taper=0.85)
        hp.rivet_line(Vector((x - 0.1, -0.36 + abs(x) * 0.15, 1.0)), Vector((x + 0.1, -0.36 + abs(x) * 0.15, 1.0)), 3,
                      0.02, BRASS_D)
    # ---- the waist ---------------------------------------------------------------------------
    sp = part('Spine', 'Spine')
    sp.cyl(Vector((0, 0.02, 1.2)), Vector((0, 0.03, 1.6)), 0.34, IRON_D, sides=18, r2=0.42)
    for k in range(5):
        sp.ring(Vector((0, 0.025, 1.24 + 0.08 * k)), (0, 0, 1), 0.35 + 0.016 * k, 0.028, IRON_HI, sides=22)
    # ---- the wedge torso ---------------------------------------------------------------------
    ch = part('Chest', 'Chest')
    ch.obox((0, 0.06, 1.86), (1.5, 0.9, 0.76), basis((0, 0, -1), (0, -1, 0)), IRON, mat=METAL, bevel=0.08,
            taper=0.7)
    # overlapping breast plates
    for k, (z, w) in enumerate(((2.05, 1.3), (1.84, 1.12), (1.64, 0.92))):
        ch.obox((0, -0.38 - 0.02 * k, z), (w, 0.08, 0.26), basis((0, -1, 0.25)), BRASS if k != 1 else BRASS_D,
                mat=METAL, bevel=0.03, taper=0.96)
        ch.rivet_line(Vector((-w / 2 + 0.08, -0.43 - 0.02 * k, z + 0.08)), Vector((w / 2 - 0.08, -0.43 - 0.02 * k, z + 0.08)),
                      7, 0.02, BRASS_D, normal=(0, -1, 0.25))
    glow_core(ch, (0, -0.47, 1.84), (0, -1, 0.15), 0.13)
    for k in range(5):   # the grille over the core
        ch.obox((-0.12 + 0.06 * k, -0.52, 1.84), (0.02, 0.03, 0.3), basis((0, -1, 0.1)), IRON_D, mat=METAL)
    # layered pauldrons and two steam stacks behind them
    for s in (-1, 1):
        for k in range(3):
            c = Vector((s * (0.72 + 0.04 * k), 0.04, 2.2 - 0.13 * k))
            f = Matrix.Rotation(-s * (0.35 + 0.12 * k), 3, 'Y')
            ch.obox(tuple(c), (0.62 - 0.06 * k, 0.78 - 0.04 * k, 0.12), f, BRASS if k == 0 else lerp(BRASS, IRON, 0.35),
                    mat=METAL, bevel=0.03)
        ch.rivet_line(Vector((s * 0.55, -0.32, 2.27)), Vector((s * 0.55, 0.38, 2.27)), 5, 0.022, BRASS_D)
        st = Vector((s * 0.48, 0.42, 2.0))
        ch.cyl(st, st + Vector((s * 0.06, 0.08, 0.86)), 0.11, IRON, sides=12, r2=0.12)
        ch.lathe(tuple(st + Vector((s * 0.06, 0.08, 0.86))), [(0.12, 0), (0.18, 0.08), (0.2, 0.14), (0.15, 0.16)],
                 14, BRASS_D, mat=METAL)
        ch.disc(tuple(st + Vector((s * 0.06, 0.08, 0.99))), (0, 0, 1), 0.13, 0.02, BLACK, sides=12)
        ch.ring(st + Vector((s * 0.03, 0.04, 0.4)), (0, 0, 1), 0.125, 0.025, COPPER, sides=14)
        steam_vent(ch, (s * 0.7, -0.12, 2.27), (s * 0.4, -0.2, 1.0), 0.07)
    # the back boiler, lying across
    bc = Vector((0, 0.62, 1.82))
    ch.cyl(bc - Vector((0.52, 0, 0)), bc + Vector((0.52, 0, 0)), 0.3, COPPER, sides=20)
    for x in (-0.5, 0.5):
        ch.blob(tuple(bc + Vector((x, 0, 0))), (0.2, 0.6, 0.6), COPPER_D, segments=16, rings=8, mat=METAL)
    for x in (-0.3, 0.0, 0.3):
        ch.ring(bc + Vector((x, 0, 0)), (1, 0, 0), 0.305, 0.028, IRON, sides=22)
    ch.gauge((0.22, 0.94, 1.86), (0, 1, 0.1), 0.1, ticks=7)
    ch.pipe([bc + Vector((-0.35, 0.2, 0.25)), Vector((-0.48, 0.42, 2.3))], 0.04, COPPER)
    # ---- the head: a small sunken helm, one round lens -----------------------------------------
    hd = part('Head', 'Head')
    hc = Vector((0, -0.16, 2.36))
    hd.obox(tuple(hc), (0.5, 0.5, 0.48), basis((0, 0, 1)), IRON_HI, mat=METAL, bevel=0.07, taper=0.85)
    hd.obox(tuple(hc + Vector((0, -0.06, 0.24))), (0.54, 0.42, 0.08), basis((0, 0, 1)), BRASS, mat=METAL, bevel=0.03)
    hd.obox(tuple(hc + Vector((0, 0.02, 0.34))), (0.08, 0.46, 0.16), basis((0, 0, 1)), BRASS_HI, mat=METAL, bevel=0.02,
            taper=0.6)
    hd.obox(tuple(hc + Vector((0, -0.2, 0.06))), (0.48, 0.1, 0.1), basis((0, -1, 0)), BRASS_D, mat=METAL, bevel=0.02)
    hd.cyl(hc + Vector((0, -0.18, -0.04)), hc + Vector((0, -0.25, -0.04)), 0.11, IRON_D, sides=16)
    hd.ring(hc + Vector((0, -0.25, -0.04)), (0, -1, 0), 0.11, 0.022, BRASS_HI, sides=18)
    hd.blob(tuple(hc + Vector((0, -0.235, -0.04))), (0.17, 0.05, 0.17), ARC, segments=14, rings=6, mat=GLOW)
    hd.blob(tuple(hc + Vector((0, -0.25, -0.04))), (0.07, 0.02, 0.07), ARC_HOT, segments=8, rings=4, mat=GLOW)
    for k in range(4):
        hd.obox(tuple(hc + Vector((-0.09 + 0.06 * k, -0.23, -0.17))), (0.025, 0.03, 0.07), basis((0, -1, 0)), BLACK)
    hd.rivet_line(hc + Vector((-0.2, -0.22, 0.16)), hc + Vector((0.2, -0.22, 0.16)), 5, 0.018, BRASS_D)
    # ---- arms ---------------------------------------------------------------------------------
    for s, tag in ((1, '.L'), (-1, '.R')):
        sh, el, wr, hn = (M(J[k], s) for k in ('shoulder', 'elbow', 'wrist', 'hand'))
        ua = part('Arm' + tag, 'Arm' + tag)
        joint(ua, sh, 0.18)
        plated_limb(ua, sh, el, 0.19, 0.17, s=s, plates=1)
        joint(ua, el, 0.15)
        fo = part('Fore' + tag, 'Fore' + tag)
        plated_limb(fo, el, wr, 0.18, 0.2, s=s, plates=2, rivet=0.022)
        fo.ring(wr, (wr - el).normalized(), 0.21, 0.04, BRASS, sides=18)
        hd_ = part('Hand' + tag, 'Hand' + tag)
        if s < 0:
            claw_fist(hd_, wr, hn + (hn - wr) * 0.3, 0.19, s)
        else:
            claw_fist(hd_, wr, hn + (hn - wr) * 0.2, 0.15, s)
            tower_shield(hd_, wr, hn)
    # ---- legs ---------------------------------------------------------------------------------
    for s, tag in ((1, '.L'), (-1, '.R')):
        hp_, kn, an, to = (M(J[k], s) for k in ('hip', 'knee', 'ankle', 'toe'))
        th = part('Thigh' + tag, 'Thigh' + tag)
        joint(th, hp_, 0.18)
        plated_limb(th, hp_, kn, 0.21, 0.18, s=s, plates=1, ribbed=True)
        sn = part('Shin' + tag, 'Shin' + tag)
        joint(sn, kn, 0.16)
        sn.obox(tuple(kn + Vector((0, -0.17, 0.02))), (0.3, 0.12, 0.28), basis((0, -1, 0.3)), BRASS_HI, mat=METAL,
                bevel=0.03)
        plated_limb(sn, kn, an, 0.2, 0.21, s=s, plates=2)
        ft = part('Foot' + tag, 'Foot' + tag)
        iron_foot(ft, an, to, 0.42)
    return parts


# The shield, in the left hand's rest frame: its centre in front of the fist.
SHIELD_W, SHIELD_H = 0.95, 1.6


def tower_shield(p, wr, hn):
    """The riveted tower shield held on the left fist, its face to the front."""
    c = Vector(wr) + Vector((-0.06, -0.3, -0.12))
    f = basis((0, -1, 0), (0, 0, 1))          # local z = the face's normal (front), y up, x across
    x, y, z = f.col[0], f.col[1], f.col[2]
    hw_ = SHIELD_W / 2
    # two faces angled a little, a raised spine down the middle
    for sgn in (-1, 1):
        ff = f @ Matrix.Rotation(sgn * 0.14, 3, 'Y')
        p.obox(tuple(c + x * sgn * SHIELD_W * 0.24 - z * 0.03), (SHIELD_W * 0.5, SHIELD_H, 0.06), ff, IRON_HI,
               mat=METAL, bevel=0.015)
    for u in (-0.5, 0.5):   # two riveted straps down the face
        p.obox(tuple(c + x * hw_ * u + z * 0.035), (0.08, SHIELD_H * 0.96, 0.03), f, BRASS_D, mat=METAL, bevel=0.01)
        p.rivet_line(c + x * hw_ * u - y * SHIELD_H * 0.42 + z * 0.055, c + x * hw_ * u + y * SHIELD_H * 0.42 + z * 0.055,
                     8, 0.02, BRASS_HI, normal=tuple(z))
    # the brass rim
    hw, hh = SHIELD_W / 2, SHIELD_H / 2
    corners = [c + x * hw * u + y * hh * v - z * 0.0 for u, v in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    for a, b in zip(corners, corners[1:] + corners[:1]):
        p.cyl(a, b, 0.045, BRASS, sides=8)
    for q in corners:
        p.blob(tuple(q), (0.12, 0.12, 0.12), BRASS_HI, segments=8, rings=6, mat=METAL)
    for a, b in zip(corners, corners[1:] + corners[:1]):
        p.rivet_line(a.lerp(b, 0.06) + z * 0.05, a.lerp(b, 0.94) + z * 0.05, 6, 0.022, BRASS_D, normal=tuple(z))
    # hazard band across its foot and a viewport slit near its top
    p.hazard(c - y * hh * 0.78 - x * hw * 0.9, c - y * hh * 0.78 + x * hw * 0.9, tuple(z), 0.16, 9, depth=0.03)
    p.obox(tuple(c + y * hh * 0.8 + z * 0.05), (SHIELD_W * 0.62, 0.15, 0.03), f, BRASS_D, mat=METAL, bevel=0.01)
    p.obox(tuple(c + y * hh * 0.8 + z * 0.065), (SHIELD_W * 0.5, 0.05, 0.02), f, BLACK)
    # the boss
    p.lathe(tuple(c + z * 0.04), [(0.24, 0), (0.22, 0.05), (0.15, 0.12), (0.06, 0.16), (0.0, 0.17)], 18, BRASS,
            mat=METAL)
    p.rivet_circle(c + z * 0.06, z, 0.26, 8, 0.024, BRASS_D)
    # dents and a stamped number
    p.obox(tuple(c - y * hh * 0.35 + x * hw * 0.45 + z * 0.04), (0.18, 0.12, 0.01), f, lerp(HAZARD, BRASS, 0.5),
           mat=METAL)
    # the grip bar back to the fist
    p.cyl(Vector(wr).lerp(Vector(hn), 0.5), c - z * 0.04, 0.05, IRON_D, sides=8)


def make_clips(arm):
    pose = Poser(arm, BONES, REST, dict(
        wrist_l=(1.0, -0.36, 1.1), wrist_r=(-1.04, -0.3, 1.08), hand_l=(-0.05, -0.15, -1.0),
        hand_r=(-0.05, -0.4, -1.0), foot_l=(0.42, 0.0, 0.22), foot_r=(-0.42, 0.0, 0.22)))
    clips = []

    def add(name, frames, fn, loop=True):
        anim(arm, name, frames, fn, loop)
        clips.append(name)

    def idle(f):
        ph = math.tau * f / 72
        b = math.sin(ph)
        return pose(root=(0, 0, -0.03 + 0.02 * b), look=(0.12 * math.sin(ph * 0.5), 0.02 * b), lean=0.02 * b,
                    wrist_l=(1.0, -0.38, 1.12 + 0.02 * b), wrist_r=(-1.04, -0.3, 1.08 + 0.02 * b))
    add('Idle', 72, idle)

    def stride(ph, amp, run_=False):
        sl = 0.36 * amp
        lift = 0.2 * amp
        fl = (0.42, -sl * math.cos(ph), 0.22 + lift * max(0.0, math.sin(ph)))
        fr = (-0.42, sl * math.cos(ph), 0.22 + lift * max(0.0, -math.sin(ph)))
        bob = abs(math.cos(ph))
        sw = math.sin(ph)
        return pose(root=(0.05 * sw * amp, -0.04 * amp, -0.04 - 0.07 * bob * amp), lean=0.08 + (0.12 if run_ else 0),
                    twist=-10 * sw * amp, foot_l=fl, foot_r=fr,
                    wrist_l=(1.0, -0.42 - 0.1 * math.cos(ph) * amp, 1.14),
                    wrist_r=(-1.06, -0.26 + 0.3 * math.cos(ph) * amp, 1.12), look=(0.03 * sw, -0.04))
    add('Walk', 34, lambda f: stride(math.tau * f / 34, 1.0))
    add('Run', 22, lambda f: stride(math.tau * f / 22, 1.4, True))

    # Attack: the shield bash, drawn back and rammed forward with a step.
    tr_a = tracks({
        'wrist_l': [(0, (1.0, -0.36, 1.1)), (9, (1.1, 0.35, 1.25)), (12, (1.08, 0.4, 1.26)), (15, (0.55, -1.25, 1.3), 'in'),
                    (17, (0.5, -1.3, 1.28), 'back'), (24, (0.8, -0.8, 1.2)), (30, (1.0, -0.36, 1.1))],
        'hand_l': [(0, (-0.05, -0.15, -1.0)), (9, (0.1, 0.1, -1.0)), (15, (-0.1, -0.35, -1.0), 'in'),
                   (30, (-0.05, -0.15, -1.0))],
        'twist': [(0, 0), (9, 24), (12, 26), (15, -18, 'in'), (17, -22, 'back'), (30, 0)],
        'lean': [(0, 0.0), (9, -0.1), (15, 0.25, 'in'), (17, 0.28, 'back'), (30, 0.0)],
        'root': [(0, (0, 0, -0.03)), (9, (-0.05, 0.1, -0.06)), (15, (0.04, -0.28, -0.12), 'in'),
                 (17, (0.05, -0.3, -0.14), 'back'), (30, (0, 0, -0.03))],
        'foot_l': [(0, (0.42, 0.0, 0.22)), (11, (0.44, 0.05, 0.36)), (14, (0.44, -0.45, 0.22), 'in'),
                   (24, (0.44, -0.45, 0.22)), (30, (0.42, 0.0, 0.22))],
        'look': [(0, (0.0, 0.0)), (9, (-0.1, 0.05)), (15, (0.05, -0.05)), (30, (0.0, 0.0))],
    })
    add('Attack', 30, lambda f: pose(**tr_a(f)), loop=False)
    # Attack2: the right fist raised overhead and hammered down.
    tr_b = tracks({
        'wrist_r': [(0, (-1.04, -0.3, 1.08)), (9, (-0.75, 0.2, 2.75)), (12, (-0.7, 0.25, 2.8)), (15, (-0.35, -1.2, 1.1), 'in'),
                    (17, (-0.32, -1.24, 1.0), 'back'), (24, (-0.75, -0.7, 1.1)), (30, (-1.04, -0.3, 1.08))],
        'hand_r': [(0, (-0.05, -0.4, -1.0)), (9, (0.0, 0.2, 1.0)), (15, (0.0, -0.6, -0.8), 'in'), (30, (-0.05, -0.4, -1.0))],
        'twist': [(0, 0), (9, -14), (15, 14, 'in'), (30, 0)],
        'lean': [(0, 0.0), (9, -0.2), (12, -0.22), (15, 0.32, 'in'), (17, 0.35, 'back'), (30, 0.0)],
        'root': [(0, (0, 0, -0.03)), (9, (0, 0.06, 0.04)), (15, (0, -0.12, -0.2), 'in'), (17, (0, -0.13, -0.24), 'back'),
                 (30, (0, 0, -0.03))],
        'look': [(0, (0.0, 0.0)), (9, (0.0, 0.25)), (15, (0.0, -0.25)), (30, (0.0, 0.0))],
    })
    add('Attack2', 30, lambda f: pose(**tr_b(f)), loop=False)
    # SteamScreen: the shield planted before it, a brace, the stacks venting (2 s bar).
    tr_s = tracks({
        'wrist_l': [(0, (1.0, -0.36, 1.1)), (10, (0.45, -1.0, 1.05), 'out'), (13, (0.42, -1.05, 0.98), 'back'),
                    (48, (0.42, -1.05, 0.98))],
        'hand_l': [(0, (-0.05, -0.15, -1.0)), (10, (-0.25, -0.2, -1.0)), (48, (-0.25, -0.2, -1.0))],
        'wrist_r': [(0, (-1.04, -0.3, 1.08)), (10, (-0.35, -0.95, 1.45)), (48, (-0.35, -0.95, 1.45))],
        'hand_r': [(0, (-0.05, -0.4, -1.0)), (10, (0.6, -0.4, -0.2)), (48, (0.6, -0.4, -0.2))],
        'root': [(0, (0, 0, -0.03)), (10, (0, -0.06, -0.26), 'out'), (13, (0, -0.08, -0.3), 'back'),
                 (30, (0, -0.08, -0.32)), (48, (0, -0.08, -0.3))],
        'lean': [(0, 0.0), (10, 0.2), (48, 0.2)],
        'twist': [(0, 0), (10, -12), (48, -12)],
        'foot_l': [(0, (0.42, 0.0, 0.22)), (6, (0.46, -0.1, 0.34)), (10, (0.5, -0.35, 0.22), 'in'), (48, (0.5, -0.35, 0.22))],
        'foot_r': [(0, (-0.42, 0.0, 0.22)), (10, (-0.5, 0.3, 0.22)), (48, (-0.5, 0.3, 0.22))],
        'look': [(0, (0.0, 0.0)), (10, (0.0, -0.1)), (48, (0.0, -0.1))],
    })

    def screen(f):
        kw = tr_s(f)
        k = 0.01 * math.sin(f * 2.3) if f > 14 else 0.0     # the frame shudders as the stacks blow
        kw['root'] = (kw['root'][0] + k, kw['root'][1], kw['root'][2] + k)
        return pose(**kw)
    add('SteamScreen', 48, screen, loop=False)
    tr_h = tracks({
        'root': [(0, (0, 0, -0.03)), (3, (0, 0.14, 0.0), 'snap'), (16, (0, 0, -0.03))],
        'lean': [(0, 0.0), (3, -0.22, 'snap'), (16, 0.0)],
        'look': [(0, (0.0, 0.0)), (3, (0.12, 0.22), 'snap'), (16, (0.0, 0.0))],
        'wrist_l': [(0, (1.0, -0.36, 1.1)), (3, (1.1, -0.1, 1.25), 'snap'), (16, (1.0, -0.36, 1.1))],
    })
    add('Hit', 16, lambda f: pose(**tr_h(f)), loop=False)
    # Death: it rocks back and topples onto its back, the shield falling across it.
    tr_d = tracks({
        'root': [(0, (0, 0, -0.03)), (8, (0, -0.1, -0.08)), (18, (0, 0.2, -0.3), 'in'), (34, (0, 0.85, -0.2), 'in'),
                 (38, (0, 0.88, -0.17), 'back'), (54, (0, 0.88, -0.18))],
        'tilt': [(0, 0.0), (8, 6.0), (18, -14.0, 'in'), (34, -74.0, 'in'), (38, -70.0, 'back'), (54, -71.0)],
        'wrist_l': [(0, (1.0, -0.36, 1.1)), (18, (1.2, -0.4, 1.5)), (34, (0.6, -0.8, 1.8)), (54, (0.6, -0.85, 1.75))],
        'hand_l': [(0, (-0.05, -0.15, -1.0)), (34, (-0.5, -0.8, 0.0)), (54, (-0.5, -0.85, 0.05))],
        'wrist_r': [(0, (-1.04, -0.3, 1.08)), (18, (-1.3, -0.2, 1.6)), (34, (-1.5, 0.0, 1.7)), (54, (-1.5, 0.05, 1.65))],
        'foot_l': [(0, (0.42, 0.0, 0.22)), (18, (0.45, -0.2, 0.22)), (34, (0.5, -0.7, 0.4)), (54, (0.5, -0.7, 0.3))],
        'foot_r': [(0, (-0.42, 0.0, 0.22)), (18, (-0.45, -0.1, 0.22)), (34, (-0.5, -0.8, 0.45)), (54, (-0.5, -0.8, 0.32))],
        'look': [(0, (0.0, 0.0)), (8, (0.0, -0.2)), (34, (0.2, 0.3)), (54, (0.25, 0.3))],
    })
    add('Death', 54, lambda f: pose(**tr_d(f)), loop=False)
    return clips


if __name__ == '__main__':
    run('ShieldbearerFrame', BONES, build_parts, make_clips, atlas=1024,
        sheet_args={'prefix': 'shield', 'focus': (0.2, -0.2, 1.5), 'dist': 5.6, 'scale': 1.75, 'ref_side': -2.1},
        anchors=[('Idle', 13, 'Head', False), ('SteamScreen', 30, 'Hand.L', False), ('Attack', 17, 'Hand.L', True),
                 ('Idle', 13, 'Chest', True)])

