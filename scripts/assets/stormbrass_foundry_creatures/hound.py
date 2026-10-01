"""The Coilspring Hound (`clockwork_hound`, shown "Coilspring Hound";
sim/content/stormbrass_foundry.ts): the Foundry's brass hunting automaton.

  blender -b --factory-startup --python hound.py -- <out.glb|-> [--sheet dir] [--blend f] [--fast] [--nobake]

A deep-chested brass hound: a riveted barrel chest with a blue storm-core
grille glowing through its ribs, a lean hindquarter of plates, a ribbed
copper hose running down its spine, an iron collar with a brass tag. The head
is a boxy snout of riveted plates over an iron muzzle, two blue eyes burning
under a heavy brow plate, swept iron ear fins, and a hinged lower jaw (its own
bone) lined with iron teeth. Every leg is iron and brass with an exposed COIL
SPRING wound round the knee and a piston down its back; heavy three-toed paws.
The tail is an antenna with a glowing tip.

Scale: about 1.8 yards to the head authored; drawn about 2.4 at its 1.35.

Clips (24 fps): Idle, Walk (a trot), Run (a rotary gallop), Attack (a bite),
Attack2 (a rearing lunge bite), Leap (the Spring Leap: coiled, then stretched
out in flight), Land, Hit, Death (it crashes onto its side, legs twitching).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from foundry_kit import (  # noqa: E402
    ARC, ARC_HOT, BLACK, BODY, BRASS, BRASS_D, BRASS_HI, COPPER, COPPER_D, GLOW, IRON, IRON_D, IRON_HI, METAL,
    STEEL, MachineRig, Matrix, MPart, Vector, anim, basis, expand_bones, lerp, run, tracks,
)

B = expand_bones([
    ('Root', None, (0, 0, 0), (0, 0, 0.3)),
    ('Body', 'Root', (0, 0.3, 1.02), (0, -0.45, 1.08)),
    ('Hind', 'Body', (0, 0.3, 1.02), (0, 0.85, 0.98)),
    ('Neck', 'Body', (0, -0.5, 1.18), (0, -0.78, 1.46)),
    ('Head', 'Neck', (0, -0.78, 1.46), (0, -1.25, 1.44)),
    ('Jaw', 'Head', (0, -0.86, 1.33), (0, -1.33, 1.24)),
    ('Tail', 'Hind', (0, 0.95, 1.06), (0, 1.25, 1.36)),
    ('Tail2', 'Tail', (0, 1.25, 1.36), (0, 1.45, 1.74)),
    ('Arm.L', 'Body', (0.3, -0.42, 0.98), (0.33, -0.36, 0.56)),
    ('Fore.L', 'Arm.L', (0.33, -0.36, 0.56), (0.33, -0.44, 0.16)),
    ('Paw.L', 'Fore.L', (0.33, -0.44, 0.16), (0.33, -0.66, 0.06)),
    ('Thigh.L', 'Hind', (0.3, 0.72, 0.96), (0.33, 0.5, 0.56)),
    ('Hock.L', 'Thigh.L', (0.33, 0.5, 0.56), (0.33, 0.8, 0.18)),
    ('HPaw.L', 'Hock.L', (0.33, 0.8, 0.18), (0.33, 0.6, 0.06)),
])
REST = {n: (Vector(h), Vector(t)) for n, _, h, t in B}


def M(v, s):
    return Vector((s * v.x, v.y, v.z))


def build_parts():
    parts = []

    def part(name, bone, **kw):
        pt = MPart(name, bone, **kw)
        parts.append(pt)
        return pt

    # ---- the barrel chest and the storm core ---------------------------------------------
    b = part('Chest', 'Body')
    cc = Vector((0, -0.2, 1.02))
    b.blob(tuple(cc), (0.8, 1.02, 0.86), BRASS, segments=24, rings=16, mat=METAL)
    b.blob(tuple(cc + Vector((0, -0.12, -0.18))), (0.7, 0.8, 0.5), IRON, segments=18, rings=10, mat=METAL)
    for k in range(5):     # rib plates over the chest
        y = -0.48 + 0.15 * k
        b.ring(Vector((0, y, 1.02)), (0, 1, 0), 0.4 - 0.02 * abs(k - 2), 0.035, BRASS_D, sides=24, arc=0.62, phase=-0.25)
    for s in (-1, 1):
        b.plate((s * 0.4, -0.2, 1.08), (0.04, 0.5, 0.36), basis((s, 0, 0)), BRASS_HI, rivet=0.014, rivet_n=(4, 3))
        # the storm core glowing through a grille on each flank
        gc = Vector((s * 0.42, -0.22, 0.92))
        b.disc(tuple(gc), (s, 0, 0), 0.12, 0.02, ARC, sides=18, mat=GLOW)
        for k in range(4):
            b.obox(tuple(gc + Vector((s * 0.015, -0.09 + 0.06 * k, 0))), (0.02, 0.018, 0.24), Matrix.Identity(3), IRON_D,
                   mat=METAL)
        b.ring(gc + Vector((s * 0.01, 0, 0)), (s, 0, 0), 0.13, 0.02, IRON, sides=18)
    # the chest's front grille, the core seen through it
    b.disc(tuple(cc + Vector((0, -0.48, -0.06))), (0, -1, 0.2), 0.16, 0.02, ARC_HOT, sides=18, mat=GLOW)
    for k in range(5):
        b.obox(tuple(cc + Vector((-0.12 + 0.06 * k, -0.5, -0.06))), (0.02, 0.02, 0.3), Matrix.Identity(3), IRON_D, mat=METAL)
    b.ring(cc + Vector((0, -0.49, -0.06)), (0, -1, 0.2), 0.17, 0.025, BRASS_D, sides=20)
    # the collar
    b.ring(Vector((0, -0.52, 1.2)), (0, -0.7, 0.7), 0.27, 0.045, IRON, sides=22)
    b.rivet_circle(Vector((0, -0.55, 1.23)), (0, -0.7, 0.7), 0.27, 10, 0.016, BRASS_HI)
    b.disc((0, -0.72, 1.02), (0, -1, 0.3), 0.06, 0.012, BRASS_HI, sides=6)
    # the spine hose (front half)
    b.tube([Vector((0, -0.5, 1.4)), Vector((0, -0.2, 1.47)), Vector((0, 0.25, 1.4))], [0.06] * 3, COPPER, sides=10)
    for k in range(8):
        b.ring(Vector((0, -0.45 + 0.09 * k, 1.42 + 0.04 * math.sin(k / 7 * math.pi))), (0, 1, 0), 0.066, 0.014, COPPER_D,
               sides=10)
    # ---- the hindquarter ----------------------------------------------------------------------
    h = part('Hind', 'Hind')
    hc = Vector((0, 0.62, 1.0))
    h.blob(tuple(hc), (0.58, 0.8, 0.52), BRASS, segments=20, rings=12, mat=METAL)
    h.blob(tuple(hc + Vector((0, 0.02, -0.1))), (0.48, 0.64, 0.38), IRON, segments=16, rings=8, mat=METAL)
    for s in (-1, 1):
        h.plate((s * 0.31, 0.62, 1.04), (0.035, 0.42, 0.3), basis((s, 0.2, 0)), BRASS_HI, rivet=0.013, rivet_n=(3, 3))
        h.gear((s * 0.34, 0.74, 0.96), (s, 0, 0), 0.13, 10, 0.035, BRASS_D)
    h.tube([Vector((0, 0.25, 1.4)), Vector((0, 0.65, 1.32)), Vector((0, 0.95, 1.12))], [0.06, 0.055, 0.05], COPPER, sides=10)
    for k in range(6):
        h.ring(Vector((0, 0.32 + 0.11 * k, 1.38 - 0.045 * k * (k / 5))), (0, 1, -0.3), 0.062, 0.013, COPPER_D, sides=10)
    h.cyl(Vector((0, 0.9, 1.05)), Vector((0, 1.0, 1.1)), 0.08, IRON, sides=12)
    # exhaust stub on the rump, sooty
    h.cyl(Vector((0.12, 0.85, 1.25)), Vector((0.16, 0.95, 1.42)), 0.04, IRON_D, sides=10)
    # ---- the neck ----------------------------------------------------------------------------
    n = part('Neck', 'Neck')
    n0, n1 = REST['Neck']
    for k in range(4):
        c = n0.lerp(n1, (k + 0.5) / 4)
        n.cyl(c - (n1 - n0).normalized() * 0.06, c + (n1 - n0).normalized() * 0.06, 0.17 - 0.012 * k,
              BRASS if k % 2 == 0 else IRON, sides=16)
    n.piston(n0 + Vector((0, 0.05, -0.15)), n1 + Vector((0, 0.02, -0.12)), 0.035)
    # ---- the head: boxy snout, brow plate, eyes, ear fins, teeth ------------------------------
    hd = part('Head', 'Head')
    sk = Vector((0, -0.95, 1.5))
    hd.obox(tuple(sk), (0.42, 0.42, 0.34), basis((0, 0, 1), (0, -1, 0)), BRASS, mat=METAL, bevel=0.05)
    hd.obox(tuple(sk + Vector((0, -0.32, -0.06))), (0.3, 0.38, 0.2), basis((0, 0, 1), (0, -1, 0)), IRON_HI, mat=METAL,
            bevel=0.035, taper=0.9)
    hd.obox(tuple(sk + Vector((0, -0.48, 0.02))), (0.16, 0.08, 0.1), basis((0, 0, 1), (0, -1, 0)), BLACK, bevel=0.02)
    hd.obox(tuple(sk + Vector((0, -0.08, 0.17))), (0.48, 0.3, 0.07), basis((0, 0, 1), (0, -1, 0)), BRASS_D, mat=METAL,
            bevel=0.02)
    hd.rivet_line(sk + Vector((-0.2, -0.2, 0.2)), sk + Vector((0.2, -0.2, 0.2)), 6, 0.016, BRASS_HI, normal=(0, -0.3, 1))
    hd.rivet_line(sk + Vector((-0.2, 0.06, 0.2)), sk + Vector((0.2, 0.06, 0.2)), 6, 0.016, BRASS_HI, normal=(0, 0, 1))
    for s in (-1, 1):
        ec = sk + Vector((s * 0.13, -0.21, 0.07))
        hd.blob(tuple(ec), (0.11, 0.06, 0.08), ARC, segments=10, rings=6, mat=GLOW)
        hd.blob(tuple(ec + Vector((0, -0.02, 0))), (0.05, 0.03, 0.04), ARC_HOT, segments=8, rings=4, mat=GLOW)
        hd.ring(ec + Vector((0, -0.01, 0)), (0, -1, 0.1), 0.055, 0.015, IRON_D, sides=12)
        # swept ear fins
        hd.obox(tuple(sk + Vector((s * 0.22, 0.12, 0.2))), (0.05, 0.22, 0.34), basis((s * 0.3, 0.9, 0.6), (s, 0, 0)),
                IRON, mat=METAL, bevel=0.015, taper=0.5)
        hd.rivets([sk + Vector((s * 0.215, 0.06, 0.06))], 0.02, BRASS_HI)
        hd.plate(tuple(sk + Vector((s * 0.215, -0.02, -0.02))), (0.025, 0.3, 0.2), basis((s, 0, 0)), BRASS_D,
                 rivet=0.012, rivet_n=(3, 2))
    for k in range(6):   # upper teeth
        x = -0.12 + 0.048 * k
        hd.spike((x, sk.y - 0.42 + 0.06 * abs(x) * 3, sk.z - 0.15), 0.022, -0.09, STEEL, sides=4, lean=(0, 0), mat=METAL)
    for s in (-1, 1):   # fangs
        hd.spike((s * 0.12, sk.y - 0.34, sk.z - 0.14), 0.03, -0.16, STEEL, sides=5, mat=METAL)
    jw = part('Jaw', 'Jaw')
    j0, j1 = REST['Jaw']
    jw.obox(tuple(j0.lerp(j1, 0.5) + Vector((0, 0, -0.04))), (0.28, 0.1, 0.5), basis((j1 - j0), (0, 0, 1)), IRON_HI,
            mat=METAL, bevel=0.03, taper=0.8)
    jw.obox(tuple(j0.lerp(j1, 0.4) + Vector((0, 0, -0.1))), (0.32, 0.06, 0.4), basis((j1 - j0), (0, 0, 1)), BRASS,
            mat=METAL, bevel=0.02)
    for k in range(5):
        x = -0.1 + 0.05 * k
        jw.spike((x, j0.y - 0.22 - 0.05 * (2 - abs(k - 2)), j0.z - 0.02 - 0.04), 0.02, 0.08, STEEL, sides=4, mat=METAL)
    jw.hazard(j0.lerp(j1, 0.15) + Vector((0.15, 0, -0.08)), j0.lerp(j1, 0.85) + Vector((0.15, 0, -0.1)), (1, 0, 0), 0.06,
              5, depth=0.01)
    # ---- the tail: an antenna with a glowing tip ----------------------------------------------
    for bn in ('Tail', 'Tail2'):
        t = part(bn, bn)
        t0, t1 = REST[bn]
        t.cyl(t0, t1, 0.045 if bn == 'Tail' else 0.03, IRON if bn == 'Tail' else STEEL, sides=10,
              r2=0.035 if bn == 'Tail' else 0.02)
        for k in range(3):
            t.ring(t0.lerp(t1, 0.2 + 0.3 * k), (t1 - t0).normalized(), 0.05 if bn == 'Tail' else 0.035, 0.012, BRASS_D,
                   sides=10)
        if bn == 'Tail2':
            t.blob(tuple(t1), (0.11, 0.11, 0.11), ARC_HOT, segments=10, rings=8, mat=GLOW)
            t.ring(t1 - (t1 - t0).normalized() * 0.04, (t1 - t0).normalized(), 0.05, 0.012, BRASS, sides=10)
    # ---- the legs: iron and brass, coil springs at the knees, pistons, heavy paws ------------
    for s, tag in ((1, '.L'), (-1, '.R')):
        for up_name, lo_name, paw_name, front in (('Arm', 'Fore', 'Paw', True), ('Thigh', 'Hock', 'HPaw', False)):
            u0, u1 = (M(v, s) for v in REST[up_name + '.L'])
            l0, l1 = (M(v, s) for v in REST[lo_name + '.L'])
            p0, p1 = (M(v, s) for v in REST[paw_name + '.L'])
            up = part(up_name + tag, up_name + tag)
            ud = (u1 - u0).normalized()
            up.blob(tuple(u0), (0.36, 0.36, 0.36), BRASS_D, segments=14, rings=10, mat=METAL)
            up.obox(tuple(u0.lerp(u1, 0.45)), (0.2, 0.22, (u1 - u0).length * 0.9), basis(ud, (0, -1 if front else 1, 0)),
                    BRASS, mat=METAL, bevel=0.04, taper=0.75)
            up.plate(tuple(u0.lerp(u1, 0.4) + Vector((s * 0.105, 0, 0))), (0.02, 0.18, 0.26), basis((s, 0, 0)), BRASS_HI,
                     rivet=0.011, rivet_n=(3, 2))
            up.piston(u0 + Vector((0, 0.1 if front else -0.1, -0.05)), u1 + Vector((0, 0.08 if front else -0.08, 0.06)),
                      0.03)
            lo = part(lo_name + tag, lo_name + tag)
            ld = (l1 - l0).normalized()
            lo.coil(tuple(l0), tuple(ld), 0.11, 0.2, 4.5, 0.022, STEEL, sides=6)
            lo.cyl(l0, l0 + ld * 0.12, 0.06, IRON_D, sides=10)
            lo.obox(tuple(l0.lerp(l1, 0.58)), (0.17, 0.17, (l1 - l0).length * 0.8), basis(ld, (0, -1, 0)), IRON, mat=METAL,
                    bevel=0.035, taper=0.8)
            lo.plate(tuple(l0.lerp(l1, 0.55) + Vector((0, -0.09 if front else 0.09, 0))), (0.13, 0.025, 0.22),
                     basis((0, -1 if front else 1, 0)), BRASS, rivet=0.01, rivet_n=(2, 2))
            lo.ring(l0.lerp(l1, 0.92), ld, 0.1, 0.022, BRASS_D, sides=12)
            pw = part(paw_name + tag, paw_name + tag)
            pc = p0.lerp(p1, 0.45) + Vector((0, 0, -0.03))
            pw.blob(tuple(p0), (0.2, 0.2, 0.18), BRASS_D, segments=12, rings=8, mat=METAL)
            pw.obox(tuple(p0.lerp(pc, 0.5) + Vector((0, 0, 0.0))), (0.16, 0.14, 0.16), basis((pc - p0), (0, 0, 1)), IRON,
                    mat=METAL, bevel=0.03)
            pw.obox(tuple(pc), (0.24, 0.28, 0.11), Matrix.Identity(3), IRON_HI, mat=METAL, bevel=0.035)
            for k in (-1, 0, 1):
                tc = pc + Vector((k * 0.07, -0.15, -0.0))
                pw.obox(tuple(tc), (0.06, 0.1, 0.07), Matrix.Identity(3), BRASS, mat=METAL, bevel=0.015)
                pw.spike(tuple(tc + Vector((0, -0.05, 0.0))), 0.022, -0.06, STEEL, sides=4, lean=(0, -0.06), mat=METAL)
    return parts


# ------------------------------------------------------------------------- clips
def make_clips(arm):
    rig = MachineRig(B).attach(arm)
    P = rig.pose
    clips = []
    feet0 = {k: M(REST[p + '.L'][1], s) * 0 + Vector((s * 0.33, REST[p + '.L'][0].y, 0.16)) for k, p, s in (
        ('fl', 'Paw', 1), ('fr', 'Paw', -1), ('hl', 'HPaw', 1), ('hr', 'HPaw', -1))}

    def add(name, frames, fn, loop=True):
        anim(arm, name, frames, fn, loop)
        clips.append(name)

    head_rest = (REST['Head'][1] - REST['Head'][0]).normalized()
    neck_rest = (REST['Neck'][1] - REST['Neck'][0]).normalized()
    tail_rest = (REST['Tail'][1] - REST['Tail'][0]).normalized()
    tail2_rest = (REST['Tail2'][1] - REST['Tail2'][0]).normalized()

    def pose(root=(0, 0, 0), pitch=0.0, roll=0.0, yaw=0.0, spine=0.0, neck=(0.0, 0.0), look=(0.0, 0.0), jaw=2.0,
             tail=(0.0, 0.0), fl=None, fr=None, hl=None, hr=None, paws=(0.0, 0.0, 0.0, 0.0)):
        rootv = Vector(root)
        rm = Matrix.Rotation(math.radians(yaw), 3, 'Z') @ Matrix.Rotation(math.radians(pitch), 3, 'X') @ \
            Matrix.Rotation(math.radians(roll), 3, 'Y')
        aims = {
            'Body': tuple(rm @ (REST['Body'][1] - REST['Body'][0]).normalized()),
            'Neck': tuple(rm @ (neck_rest + Vector((neck[0], 0.0, neck[1])))),
            'Head': tuple(rm @ (head_rest + Vector((look[0], 0.0, look[1])))),
            'Tail': tuple(rm @ (tail_rest + Vector((tail[0], 0.0, tail[1])))),
            'Tail2': tuple(rm @ (tail2_rest + Vector((tail[0] * 1.6, 0.0, tail[1] * 0.6)))),
        }
        turns = {'Root': [('x', pitch), ('z', yaw), ('y', roll)], 'Hind': [('x', spine)], 'Jaw': [('x', jaw)]}
        feet = {'fl': fl, 'fr': fr, 'hl': hl, 'hr': hr}
        ik = {}
        for k, (u, lo, pw, pole) in {'fl': ('Arm.L', 'Fore.L', 'Paw.L', (0, 1, -0.2)),
                                    'fr': ('Arm.R', 'Fore.R', 'Paw.R', (0, 1, -0.2)),
                                    'hl': ('Thigh.L', 'Hock.L', 'HPaw.L', (0, -1, 0.1)),
                                    'hr': ('Thigh.R', 'Hock.R', 'HPaw.R', (0, -1, 0.1))}.items():
            tgt = feet[k] if feet[k] is not None else tuple(feet0[k])
            ik[k] = (u, lo, tuple(tgt), tuple(rm @ Vector(pole)))
        for i, (k, pw) in enumerate((('fl', 'Paw.L'), ('fr', 'Paw.R'), ('hl', 'HPaw.L'), ('hr', 'HPaw.R'))):
            a = math.radians(paws[i])
            aims[pw] = (0.0, -math.cos(a), -0.35 - math.sin(a))
        return P(aims=aims, ik=ik, turns=turns, root=root)

    def foot(k, dy=0.0, dz=0.0, dx=0.0):
        f = feet0[k]
        return (f.x + dx, f.y + dy, f.z + dz)

    def idle(f):
        ph = math.tau * f / 60
        b = math.sin(ph)
        return pose(root=(0, 0, 0.015 * b), pitch=-1.0 * b, neck=(0.08 * math.sin(ph * 0.5), 0.03 * b),
                    look=(0.15 * math.sin(ph * 0.5 + 1), 0.04 * math.sin(ph * 1.5)), jaw=2 + 3 * max(0.0, math.sin(ph * 2)),
                    tail=(0.15 * math.sin(ph * 2), 0.05 * b))
    add('Idle', 60, idle)

    def trot(f, n, stride, lift, run_=False):
        ph = math.tau * f / n
        a, c = ph, ph + math.pi
        fl = foot('fl', -stride * math.cos(a), lift * max(0.0, math.sin(a)))
        hr = foot('hr', -stride * math.cos(a), lift * max(0.0, math.sin(a)))
        fr = foot('fr', -stride * math.cos(c), lift * max(0.0, math.sin(c)))
        hl = foot('hl', -stride * math.cos(c), lift * max(0.0, math.sin(c)))
        bob = abs(math.cos(ph))
        return pose(root=(0, -0.05, -0.03 * bob + 0.02), pitch=2 * math.sin(ph * 2), roll=2 * math.sin(ph),
                    fl=fl, fr=fr, hl=hl, hr=hr, neck=(0.0, -0.05), look=(0.03 * math.sin(ph), -0.05), jaw=6,
                    tail=(0.2 * math.sin(ph), 0.1), paws=(25 * max(0.0, math.sin(a)), 25 * max(0.0, math.sin(c)),
                                                         25 * max(0.0, math.sin(c)), 25 * max(0.0, math.sin(a))))
    add('Walk', 28, lambda f: trot(f, 28, 0.28, 0.18))

    def gallop(f):
        n = 16
        ph = math.tau * f / n
        # a rotary gallop: the hind pair pushes off, the body stretches, the front pair reaches
        offs = {'fl': 0.0, 'fr': 0.12, 'hl': 0.55, 'hr': 0.62}
        feet = {}
        lifts = {}
        for k, o in offs.items():
            q = ph + math.tau * o
            feet[k] = foot(k, -0.5 * math.cos(q), 0.32 * max(0.0, math.sin(q)))
            lifts[k] = 40 * max(0.0, math.sin(q))
        stretch = math.sin(ph)
        return pose(root=(0, -0.1, 0.06 + 0.08 * math.sin(ph * 2 + 0.6)), pitch=-6 * stretch, spine=8 * stretch,
                    fl=feet['fl'], fr=feet['fr'], hl=feet['hl'], hr=feet['hr'], neck=(0.0, -0.18 + 0.08 * stretch),
                    look=(0.0, -0.1), jaw=14, tail=(0.1 * math.sin(ph), 0.35),
                    paws=(lifts['fl'], lifts['fr'], lifts['hl'], lifts['hr']))
    add('Run', 16, gallop)

    def shot(spec):
        tr = tracks(spec)
        return lambda f: pose(**tr(f))

    add('Attack', 22, shot({
        'root': [(0, (0, 0, 0)), (7, (0, 0.18, -0.12)), (11, (0, -0.32, 0.05), 'in'), (13, (0, -0.36, 0.04), 'back'),
                 (22, (0, 0, 0))],
        'pitch': [(0, 0.0), (7, -6.0), (11, 8.0, 'in'), (22, 0.0)],
        'neck': [(0, (0.0, 0.0)), (7, (0.0, 0.25)), (11, (0.0, -0.3), 'in'), (16, (0.0, -0.15)), (22, (0.0, 0.0))],
        'look': [(0, (0.0, 0.0)), (7, (0.0, 0.2)), (11, (0.0, -0.25), 'in'), (22, (0.0, 0.0))],
        'jaw': [(0, 2), (7, 4), (10, 42), (12, 0, 'snap'), (16, 6), (22, 2)],
        'tail': [(0, (0.0, 0.0)), (7, (0.0, 0.3)), (12, (0.2, 0.1)), (22, (0.0, 0.0))],
        'fl': [(0, foot('fl')), (9, foot('fl', -0.2, 0.15)), (12, foot('fl', -0.35), 'in'), (22, foot('fl'))],
        'fr': [(0, foot('fr')), (22, foot('fr'))],
    }), loop=False)
    add('Attack2', 28, shot({
        'root': [(0, (0, 0, 0)), (8, (0, 0.25, -0.18)), (13, (0, -0.4, 0.45), 'in'), (16, (0, -0.55, 0.25)),
                 (19, (0, -0.6, 0.0), 'back'), (28, (0, 0, 0))],
        'pitch': [(0, 0.0), (8, -4.0), (13, -22.0, 'in'), (16, -10.0), (19, 6.0, 'back'), (28, 0.0)],
        'neck': [(0, (0.0, 0.0)), (8, (0.0, 0.2)), (13, (0.0, 0.1)), (16, (0.0, -0.35), 'in'), (28, (0.0, 0.0))],
        'look': [(0, (0.0, 0.0)), (13, (0.0, 0.2)), (16, (0.0, -0.35), 'in'), (28, (0.0, 0.0))],
        'jaw': [(0, 2), (12, 48), (16, 0, 'snap'), (20, 8), (28, 2)],
        'fl': [(0, foot('fl')), (8, foot('fl', 0.05)), (13, foot('fl', -0.6, 0.55), 'in'), (19, foot('fl', -0.6), 'in'),
               (28, foot('fl'))],
        'fr': [(0, foot('fr')), (8, foot('fr', 0.05)), (13, foot('fr', -0.65, 0.5), 'in'), (19, foot('fr', -0.65), 'in'),
               (28, foot('fr'))],
        'hl': [(0, foot('hl')), (16, foot('hl', -0.3, 0.1)), (19, foot('hl', -0.4)), (28, foot('hl'))],
        'hr': [(0, foot('hr')), (16, foot('hr', -0.3, 0.1)), (19, foot('hr', -0.4)), (28, foot('hr'))],
        'paws': [(0, (0, 0, 0, 0)), (13, (40, 40, 0, 0)), (19, (0, 0, 0, 0)), (28, (0, 0, 0, 0))],
        'tail': [(0, (0.0, 0.0)), (13, (0.0, 0.5)), (19, (0.2, 0.1)), (28, (0.0, 0.0))],
    }), loop=False)

    # Leap: coiled on the springs, then stretched out flying (the jump / fall pose).
    def leap(f):
        ph = math.tau * f / 24
        w = 0.04 * math.sin(ph)
        return pose(root=(0, 0, 0.35 + w), pitch=-8.0 + 3 * math.sin(ph), spine=6.0,
                    fl=foot('fl', -0.55, 0.55), fr=foot('fr', -0.6, 0.5), hl=foot('hl', 0.55, 0.35),
                    hr=foot('hr', 0.6, 0.3), neck=(0.0, -0.1), look=(0.0, -0.15), jaw=28 + 6 * math.sin(ph * 2),
                    tail=(0.05 * math.sin(ph), 0.5), paws=(50, 50, -30, -30))
    add('Leap', 24, leap)
    add('Land', 16, shot({
        'root': [(0, (0, 0, 0.2)), (3, (0, 0, -0.22), 'in'), (6, (0, 0, -0.26), 'back'), (16, (0, 0, 0))],
        'pitch': [(0, -6.0), (3, 6.0, 'in'), (16, 0.0)],
        'neck': [(0, (0.0, -0.1)), (3, (0.0, -0.25)), (16, (0.0, 0.0))],
        'jaw': [(0, 20), (4, 6), (16, 2)],
        'tail': [(0, (0.0, 0.5)), (4, (0.0, -0.1)), (16, (0.0, 0.0))],
    }), loop=False)
    add('Hit', 14, shot({
        'root': [(0, (0, 0, 0)), (3, (0.08, 0.12, 0.02), 'snap'), (14, (0, 0, 0))],
        'roll': [(0, 0.0), (3, 8.0, 'snap'), (14, 0.0)],
        'neck': [(0, (0.0, 0.0)), (3, (0.25, 0.2), 'snap'), (14, (0.0, 0.0))],
        'jaw': [(0, 2), (3, 30, 'snap'), (14, 2)],
        'tail': [(0, (0.0, 0.0)), (3, (0.3, -0.2), 'snap'), (14, (0.0, 0.0))],
    }), loop=False)

    def death(f):
        tr = tracks({
            'root': [(0, (0, 0, 0)), (6, (0, 0.05, -0.05)), (14, (-0.75, 0.0, 0.12), 'in'), (17, (-0.73, 0.0, 0.17), 'back'),
                     (40, (-0.75, 0.0, 0.15))],
            'roll': [(0, 0.0), (6, -6.0), (14, 78.0, 'in'), (17, 72.0, 'back'), (40, 74.0)],
            'neck': [(0, (0.0, 0.0)), (6, (0.0, 0.3)), (14, (0.2, -0.2)), (40, (0.25, -0.3))],
            'look': [(0, (0.0, 0.0)), (40, (0.2, -0.2))],
            'jaw': [(0, 2), (6, 35), (16, 20), (40, 26)],
            'tail': [(0, (0.0, 0.0)), (14, (0.4, -0.3)), (40, (0.5, -0.4))],
        })(f)
        tw = 12 * max(0.0, math.sin(f * 1.3)) * max(0.0, 1.0 - abs(f - 28) / 8) if 20 < f < 36 else 0.0
        kw = dict(tr)
        sink = min(1.0, max(0.0, (f - 6) / 8))
        kw.update(fl=foot('fl', -0.15 * sink, -0.04 * sink, -0.83 * sink), fr=foot('fr', -0.25 * sink, 0.32 * sink, -0.35 * sink),
                  hl=foot('hl', 0.15 * sink, -0.04 * sink, -0.83 * sink), hr=foot('hr', 0.25 * sink, 0.3 * sink, -0.35 * sink),
                  paws=(tw, -tw, tw, -tw))
        return pose(**kw)
    add('Death', 40, death, loop=False)
    return clips


if __name__ == '__main__':
    run('CoilspringHound', B, build_parts, make_clips, atlas=1024,
        sheet_args={'prefix': 'hound', 'focus': (0.0, 0.0, 0.9), 'dist': 4.6, 'scale': 1.33, 'ref_side': -1.6},
        anchors=[('Idle', 13, 'Head', True), ('Attack', 12, 'Jaw', True), ('Idle', 13, 'Tail2', True),
                 ('Idle', 13, 'Arm.L', False), ('Idle', 13, 'Fore.L', False), ('Idle', 13, 'Fore.L', True), ('Idle', 13, 'Paw.L', False)])
