"""The Brass Sentry: the Stormbrass Foundry's riveted soldier automaton
(sim/content/stormbrass_foundry.ts `brass_sentry`, its Piston Slam cast).

  blender -b --factory-startup --python brass_sentry.py -- <out.glb|-> [--sheet dir] [--blend f] [--fast] [--nobake]

A barrel-chested brass soldier on iron legs: a riveted chest banded in iron
with a caged porthole of storm light in its middle, a back boiler with a short
stack and a copper coil, hanging tasset plates, a round riveted helm with a
glowing visor slit and a brass crest. Its RIGHT forearm is a great piston
sleeve whose ram, ending in a riveted fist block, slides out on its own bone
(the Ram is part of the arm, never a held weapon); the left forearm is plated,
ending in a clenched three-finger fist.

Scale: about 2.7 yards authored; its VISUALS row draws it some 3.9 yards tall
at its template's 1.45 (a player stands 2.6).

Clips (24 fps): Idle, Walk, Run, Attack (the piston hook: the ram fired at the
end of the swing), Attack2 (a left backhand), PistonSlam (the 1.5 s bar: the
arm hauled back, the ram drawn in and trembling under pressure, the explosive
punch at the bar's end with a step in; played out to 44 f), Hit, Death (the
legs give, it pitches forward onto its face and the core gutters).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from automaton import (  # noqa: E402
    M, Poser, claw_fist, frame_bones, glow_core, iron_foot, joint, plated_limb, steam_vent,
)
from foundry_kit import (  # noqa: E402
    ARC, ARC_HOT, BLACK, BODY, BRASS, BRASS_D, BRASS_HI, COPPER, COPPER_D, GLOW, HAZARD, IRON, IRON_D,
    IRON_HI, METAL, STEEL, MPart, Matrix, Vector, anim, basis, lerp, run, tracks,
)

J = dict(hips=(0, 0, 1.05), spine_top=(0, 0.02, 1.45), chest_top=(0, 0.04, 1.95), head=(0, -0.06, 2.02),
         head_top=(0, -0.08, 2.46), shoulder=(0.7, 0.02, 1.86), elbow=(0.88, 0.05, 1.4), wrist=(0.92, -0.1, 0.98),
         hand=(0.94, -0.16, 0.74), hip=(0.31, 0.0, 1.0), knee=(0.34, -0.05, 0.58), ankle=(0.34, 0.02, 0.2),
         toe=(0.34, -0.36, 0.06))
ELB_R, WR_R = M(J['elbow'], -1), M(J['wrist'], -1)
BONES = frame_bones(J, [('Ram', 'Fore.R', tuple(ELB_R.lerp(WR_R, 0.35)), tuple(WR_R))])
REST = {n: (Vector(h), Vector(t)) for n, _, h, t in BONES}


def ellipse_band(p, cz, rx, ry, cy, r, color, n=32):
    pts = [Vector((math.sin(a) * rx, cy - math.cos(a) * ry, cz)) for a in (i * math.tau / n for i in range(n + 1))]
    p.tube(pts, [r] * len(pts), color, sides=6, mat=METAL, cap=False)
    return pts


def build_parts():
    parts = []

    def part(name, bone, **kw):
        pt = MPart(name, bone, **kw)
        parts.append(pt)
        return pt

    # ---- hips: an iron pelvis, a brass belt and hanging tassets --------------------------
    hp = part('Hips', 'Hips')
    hp.obox((0, 0.02, 1.05), (0.78, 0.5, 0.32), basis((0, 0, 1)), IRON, mat=METAL, bevel=0.06)
    ellipse_band(hp, 1.18, 0.44, 0.3, 0.02, 0.05, BRASS_D)
    hp.obox((0, -0.3, 1.16), (0.26, 0.06, 0.2), basis((0, -1, 0)), BRASS_HI, mat=METAL, bevel=0.03)
    for k, (x, y, yaw) in enumerate(((0.0, -0.33, 0.0), (0.3, -0.24, 0.6), (-0.3, -0.24, -0.6), (0.4, 0.05, 1.5),
                                     (-0.4, 0.05, -1.5))):
        f = Matrix.Rotation(yaw, 3, 'Z') @ Matrix.Rotation(-0.25, 3, 'X')
        hp.obox((x, y - 0.02, 0.84), (0.26, 0.04, 0.38), f, BRASS if k == 0 else lerp(BRASS, BRASS_D, 0.3),
                mat=METAL, bevel=0.025, taper=0.86)
        hp.rivets([Vector((x, y - 0.07, 0.96)) + Vector((math.sin(yaw), -math.cos(yaw), 0)) * 0.0], 0.02, BRASS_D)
    # ---- the waist: an iron bellows of ribs ----------------------------------------------------
    sp = part('Spine', 'Spine')
    sp.cyl(Vector((0, 0.02, 1.15)), Vector((0, 0.02, 1.48)), 0.3, IRON_D, sides=16, r2=0.36)
    for k in range(4):
        sp.ring(Vector((0, 0.02, 1.2 + 0.08 * k)), (0, 0, 1), 0.31 + 0.015 * k, 0.03, IRON_HI, sides=20)
    # ---- the barrel chest -------------------------------------------------------------------
    ch = part('Chest', 'Chest')
    ch.blob((0, 0.04, 1.7), (1.3, 1.02, 0.86), BRASS, segments=32, rings=18, mat=METAL)
    for z, rx, ry in ((1.46, 0.6, 0.47), (1.7, 0.66, 0.52), (1.92, 0.56, 0.44)):
        pts = ellipse_band(ch, z, rx, ry, 0.04, 0.035, IRON)
        ch.rivets(pts[::3], 0.02, BRASS_D)
    # vertical seams, riveted
    for a in (-0.9, -0.45, 0.45, 0.9):
        ch.rivet_line(Vector((math.sin(a) * 0.64, 0.04 - math.cos(a) * 0.5, 1.5)),
                      Vector((math.sin(a) * 0.63, 0.04 - math.cos(a) * 0.49, 1.88)), 4, 0.018, BRASS_D,
                      normal=(math.sin(a), -math.cos(a), 0))
    glow_core(ch, (0, -0.5, 1.68), (0, -1, 0.12), 0.17)
    # hazard chevrons over the core and a stamped number plate
    ch.hazard(Vector((-0.28, -0.47, 1.95)), Vector((0.28, -0.47, 1.95)), (0, -0.85, 0.5), 0.06, 7)
    ch.obox((0.32, -0.49, 1.52), (0.16, 0.02, 0.1), basis((0.3, -1, 0)), lerp(BRASS_HI, (1, 1, 1), 0.2), mat=METAL,
            bevel=0.01)
    # the gorget round the neck
    ch.cyl(Vector((0, -0.02, 1.9)), Vector((0, -0.04, 2.02)), 0.27, IRON, sides=18, r2=0.24)
    ch.ring(Vector((0, -0.03, 2.0)), (0, 0, 1), 0.25, 0.03, BRASS_D, sides=18)
    # the back boiler: a riveted drum, a short stack, a copper coil, two vents
    bc = Vector((0, 0.56, 1.72))
    ch.cyl(bc - Vector((0, 0, 0.32)), bc + Vector((0, 0, 0.3)), 0.25, COPPER, sides=18)
    ch.blob(tuple(bc + Vector((0, 0, 0.3))), (0.5, 0.5, 0.26), COPPER, segments=18, rings=8, mat=METAL)
    for z in (-0.22, 0.0, 0.22):
        ch.ring(bc + Vector((0, 0, z)), (0, 0, 1), 0.255, 0.025, IRON, sides=20)
    ch.cyl(bc + Vector((0.08, 0.04, 0.3)), bc + Vector((0.1, 0.08, 0.72)), 0.07, IRON, sides=10, r2=0.085)
    ch.ring(bc + Vector((0.1, 0.08, 0.72)), (0, 0, 1), 0.09, 0.025, IRON_D, sides=12)
    ch.disc(tuple(bc + Vector((0.1, 0.08, 0.7))), (0, 0, 1), 0.06, 0.02, BLACK, sides=10)
    ch.coil(tuple(bc + Vector((-0.1, 0.27, 0.02))), (0, 0, 1), 0.07, 0.42, 5, 0.018, COPPER_D)
    ch.blob(tuple(bc + Vector((-0.1, 0.27, 0.02))), (0.08, 0.08, 0.36), ARC, segments=8, rings=6, mat=GLOW)
    for s in (-1, 1):
        steam_vent(ch, (s * 0.24, 0.62, 1.48), (s * 0.5, 0.8, -0.3), 0.07)
    ch.gauge((0.2, 0.62, 1.82), (0.3, 0.95, 0.1), 0.09, ticks=7)
    # ---- the head: a round riveted helm, a glowing visor slit, a brass crest ----------------
    hd = part('Head', 'Head')
    hc = Vector((0, -0.09, 2.22))
    hd.blob(tuple(hc), (0.56, 0.54, 0.52), IRON_HI, segments=24, rings=14, mat=METAL)
    hd.blob(tuple(hc + Vector((0, -0.02, 0.06))), (0.6, 0.58, 0.44), BRASS, segments=24, rings=12, mat=METAL)
    # the visor band and its slit of storm light
    hd.obox(tuple(hc + Vector((0, -0.24, -0.02))), (0.5, 0.14, 0.17), basis((0, -1, 0.05)), IRON, mat=METAL,
            bevel=0.03)
    hd.obox(tuple(hc + Vector((0, -0.31, -0.02))), (0.38, 0.03, 0.045), basis((0, -1, 0)), ARC_HOT, mat=GLOW)
    hd.obox(tuple(hc + Vector((0, -0.305, -0.02))), (0.44, 0.03, 0.075), basis((0, -1, 0)), ARC, mat=GLOW)
    for k in range(5):   # breathing grille under the visor
        hd.obox(tuple(hc + Vector((-0.12 + 0.06 * k, -0.27, -0.15))), (0.025, 0.04, 0.1), basis((0, -1, -0.3)),
                BLACK, bevel=0.005)
    hd.obox(tuple(hc + Vector((0, 0.0, 0.28))), (0.07, 0.48, 0.16), basis((0, 0, 1)), BRASS_HI, mat=METAL,
            bevel=0.02, taper=0.7)
    hd.rivet_line(hc + Vector((0, -0.25, 0.2)), hc + Vector((0, 0.25, 0.2)), 5, 0.02, BRASS_D)
    for s in (-1, 1):
        hd.disc(tuple(hc + Vector((s * 0.29, 0, -0.02))), (s, 0, 0), 0.1, 0.05, BRASS_D, sides=14)
        hd.blob(tuple(hc + Vector((s * 0.32, 0, -0.02))), (0.08, 0.08, 0.08), IRON_D, segments=8, rings=6,
                mat=METAL)
    hd.rivet_circle(hc + Vector((0, 0, 0.06)), (0, 0, 1), 0.29, 14, 0.02, BRASS_D)
    # ---- arms -------------------------------------------------------------------------------
    for s, tag in ((1, '.L'), (-1, '.R')):
        sh, el, wr, hn = (M(J[k], s) for k in ('shoulder', 'elbow', 'wrist', 'hand'))
        ua = part('Arm' + tag, 'Arm' + tag)
        joint(ua, sh, 0.15)
        plated_limb(ua, sh, el, 0.16, 0.14, s=s, plates=1)
        # the pauldron: a riveted dome over the shoulder, a hazard band on its rim
        ua.blob(tuple(sh + Vector((s * 0.08, 0.0, 0.08))), (0.56, 0.58, 0.42), BRASS, segments=18, rings=10,
                mat=METAL)
        ua.ring(sh + Vector((s * 0.08, 0, -0.04)), (s * 0.3, 0, 1), 0.27, 0.035, IRON, sides=20)
        ua.rivet_circle(sh + Vector((s * 0.1, 0, 0.0)), (s * 0.3, 0, 1), 0.25, 8, 0.02, BRASS_D)
        joint(ua, el, 0.12)
        fo = part('Fore' + tag, 'Fore' + tag)
        if s > 0:
            plated_limb(fo, el, wr, 0.13, 0.12, s=s, plates=2)
            fo.obox(tuple(el.lerp(wr, 0.45) + Vector((0.12, -0.04, 0))), (0.06, 0.32, 0.42),
                    basis((wr - el).normalized(), (1, 0, 0)), IRON_HI, mat=METAL, bevel=0.02)
            hd_ = part('Hand' + tag, 'Hand' + tag)
            claw_fist(hd_, wr, hn + (hn - wr) * 0.2, 0.15, s)
        else:
            # The piston sleeve: a great riveted cylinder, a gauge, a hose, exhaust ports.
            d = (wr - el).normalized()
            a0 = el + d * 0.04
            a1 = wr + d * 0.04
            fo.cyl(a0, a1, 0.24, IRON, sides=20, r2=0.26)
            for t in (0.12, 0.45, 0.8):
                fo.ring(a0.lerp(a1, t), d, 0.255, 0.035, BRASS, sides=22)
                fo.rivet_circle(a0.lerp(a1, t) + d * 0.04, d, 0.26, 10, 0.017, BRASS_D)
            fo.ring(a1, d, 0.27, 0.045, BRASS_HI, sides=22)
            fr = basis(d, (-1, 0, 0))
            fo.gauge(tuple(a0.lerp(a1, 0.6) + fr.col[1] * 0.265), tuple(fr.col[1]), 0.08, ticks=6)
            fo.pipe([a0.lerp(a1, 0.2) - fr.col[1] * 0.24, a0.lerp(a1, 0.5) - fr.col[1] * 0.32,
                     a0.lerp(a1, 0.85) - fr.col[1] * 0.25], 0.035, COPPER)
            for k in range(3):
                steam_vent(fo, tuple(a0.lerp(a1, 0.25 + 0.2 * k) + fr.col[0] * 0.24), tuple(fr.col[0]), 0.045)
            fo.hazard(a0.lerp(a1, 0.28) - fr.col[0] * 0.25, a0.lerp(a1, 0.72) - fr.col[0] * 0.25,
                      tuple(-fr.col[0]), 0.12, 5)
            # the ram: a polished rod and a heavy riveted fist block
            ram = part('Ram', 'Ram')
            r0, r1 = REST['Ram']
            rd = (r1 - r0).normalized()
            ram.cyl(r0 - rd * 0.24, r1 + rd * 0.12, 0.13, STEEL, sides=16)
            for k in range(3):
                ram.ring(r0.lerp(r1, 0.3 + 0.3 * k), rd, 0.132, 0.012, IRON_HI, sides=14)
            ram.ring(r1 + rd * 0.02, rd, 0.12, 0.02, IRON_D, sides=14)
            fc = r1 + rd * 0.3
            rf = basis(rd, (0, -1, 0))
            ram.obox(tuple(fc), (0.36, 0.36, 0.34), rf, BRASS, mat=METAL, bevel=0.05)
            ram.obox(tuple(fc + rd * 0.19), (0.34, 0.34, 0.06), rf, IRON_D, mat=METAL, bevel=0.02)
            for u in (-1, 1):
                for v in (-1, 1):
                    ram.rivets([fc + rf.col[0] * u * 0.13 + rf.col[1] * v * 0.13 + rd * 0.23], 0.025, BRASS_HI)
            for u in (-1, 1):
                ram.obox(tuple(fc + rf.col[0] * u * 0.19), (0.04, 0.3, 0.26), rf, IRON, mat=METAL, bevel=0.01)
    # ---- legs -------------------------------------------------------------------------------
    for s, tag in ((1, '.L'), (-1, '.R')):
        hp_, kn, an, to = (M(J[k], s) for k in ('hip', 'knee', 'ankle', 'toe'))
        th = part('Thigh' + tag, 'Thigh' + tag)
        joint(th, hp_, 0.15, axis=(1, 0, 0))
        plated_limb(th, hp_, kn, 0.17, 0.15, s=s, plates=1, ribbed=True)
        sn = part('Shin' + tag, 'Shin' + tag)
        joint(sn, kn, 0.13)
        sn.obox(tuple(kn + Vector((0, -0.13, 0.02))), (0.24, 0.1, 0.22), basis((0, -1, 0.3)), BRASS_HI, mat=METAL,
                bevel=0.03)
        plated_limb(sn, kn, an, 0.16, 0.17, s=s, plates=2)
        sn.pipe([kn + Vector((s * 0.15, 0.1, -0.05)), an + Vector((s * 0.16, 0.1, 0.15))], 0.025, COPPER,
                flanges=False)
        ft = part('Foot' + tag, 'Foot' + tag)
        iron_foot(ft, an, to, 0.34)
    return parts


def make_clips(arm):
    pose = Poser(arm, BONES, REST, dict(
        wrist_l=(0.9, -0.24, 1.02), wrist_r=(-0.92, -0.3, 1.08), hand_l=(0.05, -0.35, -1.0),
        hand_r=(-0.05, -0.4, -1.0), foot_l=(0.36, 0.0, 0.2), foot_r=(-0.36, 0.0, 0.2)))
    clips = []

    def add(name, frames, fn, loop=True):
        anim(arm, name, frames, fn, loop)
        clips.append(name)

    def idle(f):
        ph = math.tau * f / 64
        b = math.sin(ph)
        return pose(root=(0, 0, -0.02 + 0.02 * b), look=(0.15 * math.sin(ph * 0.5), 0.03 * b), lean=0.02 * b,
                    wrist_l=(0.9, -0.26, 1.04 + 0.02 * b), wrist_r=(-0.92, -0.32, 1.08 + 0.02 * b),
                    slides={'Ram': 0.02 + 0.02 * max(0.0, math.sin(ph * 2))})
    add('Idle', 64, idle)

    def stride(ph, amp, run_=False):
        sl = 0.34 * amp
        lift = 0.2 * amp
        fl = (0.36, -sl * math.cos(ph), 0.2 + lift * max(0.0, math.sin(ph)))
        fr = (-0.36, sl * math.cos(ph), 0.2 + lift * max(0.0, -math.sin(ph)))
        bob = abs(math.cos(ph))
        sw = math.sin(ph)
        return pose(root=(0.04 * sw * amp, -0.04 * amp, -0.03 - 0.06 * bob * amp), lean=0.1 + (0.14 if run_ else 0),
                    twist=-12 * sw * amp, foot_l=fl, foot_r=fr,
                    wrist_l=(0.92, -0.2 - 0.32 * math.cos(ph) * amp, 1.08),
                    wrist_r=(-0.94, -0.26 + 0.22 * math.cos(ph) * amp, 1.1), look=(0.04 * sw, -0.04))
    add('Walk', 32, lambda f: stride(math.tau * f / 32, 1.0))
    add('Run', 20, lambda f: stride(math.tau * f / 20, 1.45, True))

    def oneshot(spec):
        tr = tracks(spec)
        return lambda f: pose(**tr(f))

    # Attack: the piston hook, the ram fired as the fist lands.
    a_spec = {
        'wrist_r': [(0, (-0.92, -0.3, 1.08)), (8, (-1.15, 0.45, 1.55)), (11, (-1.1, 0.5, 1.6)),
                    (14, (-0.35, -1.25, 1.5), 'in'), (16, (-0.3, -1.3, 1.48), 'back'), (22, (-0.7, -0.7, 1.25)),
                    (28, (-0.92, -0.3, 1.08))],
        'hand_r': [(0, (-0.05, -0.4, -1.0)), (8, (-0.2, 0.6, -0.4)), (14, (0.4, -1.0, 0.0), 'in'),
                   (28, (-0.05, -0.4, -1.0))],
        'twist': [(0, 0), (8, -26), (11, -28), (14, 22, 'in'), (16, 26, 'back'), (28, 0)],
        'lean': [(0, 0.0), (8, -0.08), (14, 0.22, 'in'), (28, 0.0)],
        'root': [(0, (0, 0, -0.02)), (8, (0.04, 0.06, -0.04)), (14, (-0.04, -0.12, -0.1), 'in'), (28, (0, 0, -0.02))],
        'foot_r': [(0, (-0.36, 0.0, 0.2)), (10, (-0.4, 0.06, 0.32)), (13, (-0.38, -0.24, 0.2), 'in'),
                   (28, (-0.36, 0.0, 0.2))],
        'look': [(0, (0.0, 0.0)), (8, (0.1, 0.05)), (14, (-0.1, -0.08)), (28, (0.0, 0.0))],
    }
    ram_a = tracks({'r': [(0, 0.02), (8, -0.08), (13, -0.08), (15, 0.42, 'snap'), (19, 0.36), (28, 0.02)]})
    tr_a = tracks(a_spec)
    add('Attack', 28, lambda f: pose(**tr_a(f), slides={'Ram': ram_a(f)['r']}), loop=False)
    # Attack2: a backhand with the plated left arm.
    tr_b = tracks({
        'wrist_l': [(0, (0.9, -0.24, 1.02)), (8, (0.55, -0.9, 1.6)), (10, (0.5, -0.95, 1.62)),
                    (14, (1.25, -0.6, 1.35), 'in'), (16, (1.35, -0.3, 1.3), 'back'), (26, (0.9, -0.24, 1.02))],
        'hand_l': [(0, (0.05, -0.35, -1.0)), (8, (-0.6, -0.4, 0.2)), (14, (0.9, -0.3, 0.0), 'in'),
                   (26, (0.05, -0.35, -1.0))],
        'twist': [(0, 0), (8, -22), (10, -24), (14, 24, 'in'), (17, 28), (26, 0)],
        'lean': [(0, 0.0), (8, 0.05), (14, 0.16, 'in'), (26, 0.0)],
        'root': [(0, (0, 0, -0.02)), (14, (0.05, -0.06, -0.08), 'in'), (26, (0, 0, -0.02))],
        'look': [(0, (0.0, 0.0)), (8, (-0.2, 0.0)), (14, (0.2, -0.05)), (26, (0.0, 0.0))],
    })
    add('Attack2', 26, lambda f: pose(**tr_b(f)), loop=False)

    # PistonSlam: the 1.5 s bar, the explosive punch at its end, played out.
    tr_p = tracks({
        'wrist_r': [(0, (-0.92, -0.3, 1.08)), (8, (-1.05, 0.62, 1.45), 'out'), (32, (-1.08, 0.66, 1.42)),
                    (35, (-0.28, -1.45, 1.42), 'in'), (37, (-0.25, -1.5, 1.4), 'back'), (44, (-0.6, -0.95, 1.25))],
        'hand_r': [(0, (-0.05, -0.4, -1.0)), (8, (0.0, 0.8, -0.2)), (35, (0.25, -1.0, 0.0), 'in'),
                   (44, (0.1, -0.8, -0.4))],
        'wrist_l': [(0, (0.9, -0.24, 1.02)), (8, (0.6, -0.7, 1.4)), (32, (0.62, -0.72, 1.42)), (35, (0.95, 0.2, 1.2), 'in'),
                    (44, (0.9, -0.2, 1.05))],
        'hand_l': [(0, (0.05, -0.35, -1.0)), (8, (-0.3, -0.6, 0.4)), (35, (0.2, 0.3, -0.8), 'in'),
                   (44, (0.05, -0.35, -1.0))],
        'twist': [(0, 0), (8, -32, 'out'), (32, -34), (35, 26, 'in'), (37, 30, 'back'), (44, 14)],
        'lean': [(0, 0.0), (8, -0.12), (32, -0.15), (35, 0.36, 'in'), (37, 0.4, 'back'), (44, 0.2)],
        'root': [(0, (0, 0, -0.02)), (8, (0.06, 0.12, -0.16), 'out'), (32, (0.06, 0.14, -0.2)),
                 (35, (-0.04, -0.3, -0.18), 'in'), (37, (-0.05, -0.33, -0.2), 'back'), (44, (-0.03, -0.22, -0.1))],
        'foot_r': [(0, (-0.36, 0.0, 0.2)), (8, (-0.4, 0.22, 0.2)), (32, (-0.4, 0.22, 0.2)), (34, (-0.4, 0.0, 0.34)),
                   (36, (-0.38, -0.5, 0.2), 'in'), (44, (-0.38, -0.5, 0.2))],
        'foot_l': [(0, (0.36, 0.0, 0.2)), (44, (0.36, 0.0, 0.2))],
        'look': [(0, (0.0, 0.0)), (8, (0.15, 0.0)), (32, (0.15, -0.02)), (35, (-0.05, -0.1)), (44, (0.0, -0.05))],
    })
    ram_p = tracks({'r': [(0, 0.02), (8, -0.14, 'out'), (34, -0.16), (35, 0.5, 'snap'), (38, 0.44), (44, 0.24)]})

    def slam(f):
        kw = tr_p(f)
        shake = 0.012 * math.sin(f * 2.7) if 10 <= f <= 32 else 0.0   # trembling under pressure
        kw['root'] = (kw['root'][0] + shake, kw['root'][1], kw['root'][2] + shake * 0.5)
        return pose(**kw, slides={'Ram': ram_p(f)['r'] + shake * 2})
    add('PistonSlam', 44, slam, loop=False)

    tr_h = tracks({
        'root': [(0, (0, 0, -0.02)), (3, (0, 0.14, 0.0), 'snap'), (16, (0, 0, -0.02))],
        'lean': [(0, 0.0), (3, -0.25, 'snap'), (16, 0.0)],
        'look': [(0, (0.0, 0.0)), (3, (-0.15, 0.25), 'snap'), (16, (0.0, 0.0))],
        'wrist_r': [(0, (-0.92, -0.3, 1.08)), (3, (-1.05, 0.0, 1.3), 'snap'), (16, (-0.92, -0.3, 1.08))],
        'wrist_l': [(0, (0.9, -0.24, 1.02)), (3, (1.05, 0.0, 1.28), 'snap'), (16, (0.9, -0.24, 1.02))],
    })
    add('Hit', 16, lambda f: pose(**tr_h(f)), loop=False)
    # Death: the knees give, it pitches forward onto its face, the arms splay.
    tr_d = tracks({
        'root': [(0, (0, 0, -0.02)), (6, (0, 0.1, 0.0)), (16, (0, -0.1, -0.42), 'in'), (20, (0, -0.12, -0.38), 'back'),
                 (34, (0, -0.25, -0.06), 'in'), (38, (0, -0.25, -0.02), 'back'), (48, (0, -0.25, -0.04))],
        'tilt': [(0, 0.0), (6, -6.0), (16, 12.0, 'in'), (20, 10.0), (34, 74.0, 'in'), (38, 70.0, 'back'),
                 (48, 71.0)],
        'lean': [(0, 0.0), (6, -0.2), (16, 0.25), (48, 0.15)],
        'foot_l': [(0, (0.36, 0.0, 0.2)), (16, (0.38, 0.1, 0.2)), (34, (0.4, 0.9, 0.24)), (48, (0.4, 0.95, 0.22))],
        'foot_r': [(0, (-0.36, 0.0, 0.2)), (16, (-0.38, 0.15, 0.2)), (34, (-0.4, 0.95, 0.26)),
                   (48, (-0.4, 1.0, 0.24))],
        'wrist_l': [(0, (0.9, -0.24, 1.02)), (16, (0.9, -0.7, 1.1)), (34, (1.3, -0.6, 1.8)), (48, (1.35, -0.5, 1.85))],
        'wrist_r': [(0, (-0.92, -0.3, 1.08)), (16, (-0.95, -0.8, 1.1)), (34, (-1.3, -0.7, 1.7)),
                    (48, (-1.35, -0.6, 1.75))],
        'look': [(0, (0.0, 0.0)), (6, (0.1, 0.3)), (20, (0.0, -0.3)), (48, (0.3, -0.2))],
    })
    add('Death', 48, lambda f: pose(**tr_d(f)), loop=False)
    return clips


if __name__ == '__main__':
    run('BrassSentry', BONES, build_parts, make_clips, atlas=1024,
        sheet_args={'prefix': 'sentry', 'focus': (0.2, -0.2, 1.3), 'dist': 5.0, 'scale': 1.44, 'ref_side': -1.8},
        anchors=[('PistonSlam', 37, 'Ram', True), ('Idle', 13, 'Head', False), ('Idle', 13, 'Chest', False),
                 ('Attack', 16, 'Ram', True)])
