"""The Arc Drone (`arc_drone`, sim/content/stormbrass_foundry.ts; also the
Hauler's unloaded drones, the Rangewarden's Drill Drones and the Voltaic
Warden's plated drones).

  blender -b --factory-startup --python arc_drone.py -- <out.glb|-> [--sheet dir] [--blend f] [--fast] [--nobake]

A small hovering brass sphere: two riveted hemispheres on an iron equator
band, four portholes with the storm core burning blue behind them, a big glass
lens for an eye, a copper COIL RING wound round its middle that spins on its
own bone with porcelain insulator knobs, two stabiliser rotor pods (their
three-bladed props spin on their own bones), an antenna with a glowing tip,
and a trio of discharge prongs underneath.

It floats: authored with its underside 1.25 yards up, so its VISUALS row's
`hover` is that height in game units and its Death drops the sphere onto the
floor (the crow's pattern).

Clips (24 fps): Idle, Walk, Run (tilting into the flight), Attack (it draws
back and lunges, prongs first), Hit, Death (it sputters, spins and drops).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from foundry_kit import (  # noqa: E402
    ARC, ARC_HOT, BLACK, BODY, BRASS, BRASS_D, BRASS_HI, COPPER, COPPER_D, GLASS, GLOW, HAZARD, IRON, IRON_D,
    IRON_HI, LENS, METAL, STEEL, MachineRig, Matrix, MPart, Vector, anim, basis, expand_bones, run, tracks,
)

C = Vector((0.0, 0.0, 1.72))
R = 0.42
PORCELAIN = (0.88, 0.86, 0.8)

B = expand_bones([
    ('Root', None, (0, 0, 0), (0, 0, 0.3)),
    ('Body', 'Root', tuple(C), tuple(C + Vector((0, 0, 0.3)))),
    ('Ring', 'Body', tuple(C), tuple(C + Vector((0, 0, 0.2)))),
    ('Rotor.L', 'Body', (0.62, 0.05, 1.86), (0.62, 0.05, 2.06)),
    ('Antenna', 'Body', tuple(C + Vector((0, 0.08, R - 0.02))), tuple(C + Vector((0, 0.16, R + 0.3)))),
])
REST = {n: (Vector(h), Vector(t)) for n, _, h, t in B}


def build_parts():
    parts = []

    def part(name, bone, **kw):
        pt = MPart(name, bone, **kw)
        parts.append(pt)
        return pt

    b = part('Body', 'Body')
    b.blob(tuple(C + Vector((0, 0, 0.02))), (2 * R, 2 * R, 2 * R * 0.96), BRASS, segments=28, rings=18, mat=METAL)
    b.ring(C + Vector((0, 0, 0.0)), (0, 0, 1), R * 1.0, 0.06, IRON, sides=32, tube_sides=8)
    b.rivet_circle(C + Vector((0, 0, 0.05)), (0, 0, 1), R * 1.02, 18, 0.016, BRASS_D)
    b.rivet_circle(C + Vector((0, 0, -0.05)), (0, 0, 1), R * 1.02, 18, 0.016, BRASS_D)
    for z in (0.22, -0.22):
        b.ring(C + Vector((0, 0, z)), (0, 0, 1), math.sqrt(R * R - z * z) * 1.01, 0.02, BRASS_D, sides=28)
    # meridian seams
    for k in range(6):
        a = math.tau * k / 6 + 0.3
        b.ring(C, (math.cos(a), math.sin(a), 0), R * 1.005, 0.012, BRASS_D, sides=24, arc=0.5, phase=0.0)
    # portholes with the storm core behind them
    for k in range(4):
        a = math.tau * k / 4 + math.pi / 4
        n = Vector((math.cos(a), math.sin(a), 0.35)).normalized()
        pc = C + n * R * 0.98
        b.disc(tuple(pc), tuple(n), 0.085, 0.03, ARC, sides=14, mat=GLOW)
        b.ring(pc + n * 0.015, n, 0.09, 0.02, IRON_HI, sides=14)
        b.obox(tuple(pc + n * 0.02), (0.012, 0.16, 0.012), Matrix((n.cross(Vector((0, 0, 1))).normalized(),
                                                                     Vector((0, 0, 1)).cross(n.cross(Vector((0, 0, 1))).normalized()),
                                                                     n)).transposed(), IRON_D, mat=METAL)
    # the big front lens: brass hood, glass, the core light deep inside
    ln = Vector((0, -1, -0.15)).normalized()
    lc = C + ln * R * 0.92
    b.cyl(lc - ln * 0.05, lc + ln * 0.08, 0.17, BRASS_D, sides=20)
    b.ring(lc + ln * 0.08, ln, 0.165, 0.025, BRASS_HI, sides=20)
    b.disc(tuple(lc + ln * 0.07), tuple(ln), 0.13, 0.01, ARC, sides=18, mat=GLOW)
    b.disc(tuple(lc + ln * 0.085), tuple(ln), 0.06, 0.01, ARC_HOT, sides=14, mat=GLOW)
    b.obox(tuple(lc + ln * 0.13 + Vector((0, 0, 0.12))), (0.3, 0.12, 0.03), basis((0, -0.3, 1), (0, -1, 0)), BRASS,
           mat=METAL, bevel=0.01)
    # the discharge prongs underneath
    for k in range(3):
        a = math.tau * k / 3
        top = C + Vector((math.cos(a) * 0.12, math.sin(a) * 0.12, -R * 0.9))
        tip = top + Vector((math.cos(a) * 0.08, math.sin(a) * 0.08, -0.26))
        b.cyl(top, tip, 0.025, STEEL, sides=8, r2=0.012)
        b.blob(tuple(tip), (0.05, 0.05, 0.05), ARC_HOT, segments=8, rings=5, mat=GLOW)
    b.cyl(C - Vector((0, 0, R * 0.8)), C - Vector((0, 0, R * 1.02)), 0.12, IRON, sides=14)
    b.hazard(C + Vector((-0.2, 0.36, 0.2)), C + Vector((0.2, 0.36, 0.2)), (0, 1, 0.4), 0.08, 5, depth=0.012)
    # the rotor pod arms
    for s in (-1, 1):
        a0 = C + Vector((s * R * 0.9, 0.05, 0.1))
        a1 = Vector((s * 0.62, 0.05, 1.83))
        b.cyl(a0, a1, 0.04, IRON, sides=10)
        b.cyl(a1 - Vector((0, 0, 0.1)), a1 + Vector((0, 0, 0.04)), 0.07, BRASS, sides=14)
        b.ring(a1 - Vector((0, 0, 0.1)), (0, 0, 1), 0.07, 0.015, BRASS_D, sides=14)
        b.obox(tuple(a1 + Vector((0, 0.1, -0.08))), (0.03, 0.18, 0.12), Matrix.Identity(3), BRASS_D, mat=METAL,
               bevel=0.01, taper=0.6)
    for s, tag in ((1, '.L'), (-1, '.R')):
        r0 = Vector((s * 0.62, 0.05, 1.86))
        rt = part('Rotor' + tag, 'Rotor' + tag)
        rt.cyl(r0 - Vector((0, 0, 0.02)), r0 + Vector((0, 0, 0.06)), 0.03, STEEL, sides=8)
        for k in range(3):
            a = math.tau * k / 3
            d = Vector((math.cos(a), math.sin(a), 0))
            rt.obox(tuple(r0 + d * 0.15 + Vector((0, 0, 0.04))), (0.26, 0.05, 0.012),
                    Matrix((d, Vector((0, 0, 1)).cross(d), Vector((0, 0, 1)))).transposed() @ Matrix.Rotation(0.3, 3, 'X'),
                    BRASS_HI, mat=METAL, bevel=0.005)
    # the spinning coil ring
    rg = part('Ring', 'Ring')
    rr = R + 0.13
    n = 180
    pts = [C + Vector((math.cos(math.tau * i / n) * (rr + 0.035 * math.cos(math.tau * 24 * i / n)),
                       math.sin(math.tau * i / n) * (rr + 0.035 * math.cos(math.tau * 24 * i / n)),
                       0.035 * math.sin(math.tau * 24 * i / n))) for i in range(n + 1)]
    rg.tube(pts, [0.016] * (n + 1), COPPER, sides=5, cap=False, mat=METAL)
    rg.ring(C, (0, 0, 1), rr, 0.02, COPPER_D, sides=36)
    for k in range(4):
        a = math.tau * k / 4
        d = Vector((math.cos(a), math.sin(a), 0))
        rg.cyl(C + d * R * 0.98, C + d * (rr - 0.02), 0.022, IRON, sides=8)
        rg.lathe(tuple(C + d * (rr + 0.02) - Vector((0, 0, 0.06))), [(0.03, 0), (0.05, 0.03), (0.03, 0.06), (0.05, 0.09),
                                                                     (0.03, 0.12), (0.0, 0.12)], 10, PORCELAIN, mat=GLASS)
    # the antenna
    an = part('Antenna', 'Antenna')
    a0, a1 = REST['Antenna']
    an.cyl(a0, a1, 0.018, STEEL, sides=8, r2=0.01)
    an.cyl(a0 - (a1 - a0).normalized() * 0.04, a0 + (a1 - a0).normalized() * 0.04, 0.05, BRASS_D, sides=10)
    for k in range(3):
        an.ring(a0.lerp(a1, 0.3 + 0.2 * k), (a1 - a0).normalized(), 0.03, 0.008, BRASS, sides=8)
    an.blob(tuple(a1), (0.07, 0.07, 0.07), ARC_HOT, segments=10, rings=8, mat=GLOW)
    return parts


def make_clips(arm):
    rig = MachineRig(B).attach(arm)
    P = rig.pose
    clips = []

    def add(name, frames, fn, loop=True):
        anim(arm, name, frames, fn, loop)
        clips.append(name)

    ant_rest = (REST['Antenna'][1] - REST['Antenna'][0]).normalized()

    def pose(root=(0, 0, 0), pitch=0.0, roll=0.0, yaw=0.0, ring=0.0, rotor=0.0, ant=(0.0, 0.0), scale=1.0):
        rm = Matrix.Rotation(math.radians(yaw), 3, 'Z') @ Matrix.Rotation(math.radians(pitch), 3, 'X') @ \
            Matrix.Rotation(math.radians(roll), 3, 'Y')
        turns = {'Body': [('x', pitch), ('z', yaw), ('y', roll)], 'Ring': [('z', ring)],
                 'Rotor.L': [('z', rotor)], 'Rotor.R': [('z', -rotor)]}
        aims = {'Antenna': tuple(rm @ (ant_rest + Vector((ant[0], ant[1], 0.0))))}
        return P(aims=aims, turns=turns, root=root, scales={'Body': scale})

    def hover(f, n, tilt, speed):
        ph = math.tau * f / n
        return pose(root=(0.02 * math.sin(ph * 0.5), 0, 0.06 * math.sin(ph)), pitch=tilt + 2.5 * math.sin(ph + 0.6),
                    roll=3 * math.sin(ph * 0.5), ring=15.0 * speed * f, rotor=60.0 * f,
                    ant=(0.06 * math.sin(ph + 1), 0.08 * math.sin(ph * 2 + 0.3) - tilt * 0.01))
    add('Idle', 48, lambda f: hover(f, 48, 0.0, 1.0))
    add('Walk', 24, lambda f: hover(f, 24, 12.0, 1.25))
    add('Run', 16, lambda f: hover(f, 16, 22.0, 1.875))

    def shot(spec, frames):
        tr = tracks(spec)

        def fn(f):
            kw = tr(f)
            kw['rotor'] = 60.0 * f
            kw['ring'] = kw.get('ring', 0.0) + 15.0 * f
            return pose(**kw)
        return fn

    add('Attack', 18, shot({
        'root': [(0, (0, 0, 0)), (6, (0, 0.28, 0.12)), (9, (0, -0.45, -0.1), 'in'), (11, (0, -0.48, -0.12), 'back'),
                 (18, (0, 0, 0))],
        'pitch': [(0, 0.0), (6, -18.0), (9, 28.0, 'in'), (12, 20.0), (18, 0.0)],
        'ring': [(0, 0.0), (6, 40.0), (10, 200.0, 'in'), (18, 240.0)],
        'ant': [(0, (0.0, 0.0)), (6, (0.0, -0.3)), (10, (0.0, 0.4), 'in'), (18, (0.0, 0.0))],
        'scale': [(0, 1.0), (8, 0.94), (10, 1.06, 'snap'), (18, 1.0)],
    }, 18), loop=False)
    add('Hit', 12, shot({
        'root': [(0, (0, 0, 0)), (2, (0.05, 0.22, 0.06), 'snap'), (12, (0, 0, 0))],
        'pitch': [(0, 0.0), (2, -22.0, 'snap'), (12, 0.0)],
        'roll': [(0, 0.0), (2, 14.0, 'snap'), (12, 0.0)],
        'ant': [(0, (0.0, 0.0)), (2, (0.3, -0.4), 'snap'), (12, (0.0, 0.0))],
    }, 12), loop=False)
    drop = REST['Body'][0].z - R - 0.02   # the sphere comes to rest on the floor

    def death(f):
        tr = tracks({
            'root': [(0, (0, 0, 0)), (6, (0.05, 0.05, 0.12)), (14, (0.1, 0.0, -0.2)), (22, (0.15, -0.1, -drop), 'in'),
                     (25, (0.16, -0.12, -drop + 0.1), 'out'), (28, (0.17, -0.13, -drop), 'in'), (36, (0.17, -0.13, -drop))],
            'pitch': [(0, 0.0), (6, -14.0), (22, 35.0, 'in'), (28, 48.0), (36, 50.0)],
            'roll': [(0, 0.0), (8, 20.0), (22, -40.0, 'in'), (36, -55.0)],
            'yaw': [(0, 0.0), (22, 260.0, 'out'), (36, 290.0)],
            'ant': [(0, (0.0, 0.0)), (10, (0.4, 0.3)), (36, (0.6, -0.5))],
        })(f)
        kw = dict(tr)
        sp = max(0.0, 1.0 - f / 30)
        kw['rotor'] = 60.0 * 30 * (1 - (1 - min(f, 30) / 30) ** 2) / 2 if f < 30 else 60.0 * 15
        kw['ring'] = 15.0 * 30 * (1 - (1 - min(f, 30) / 30) ** 2) / 2 * (1 + sp)
        return pose(**kw)
    add('Death', 36, death, loop=False)
    return clips


if __name__ == '__main__':
    run('ArcDrone', B, build_parts, make_clips, atlas=1024,
        sheet_args={'prefix': 'drone', 'focus': (0.0, 0.0, 1.2), 'dist': 4.2, 'scale': 1.4, 'ref_side': -1.5},
        anchors=[('Idle', 13, 'Body', False), ('Idle', 13, 'Antenna', True), ('Attack', 10, 'Body', False)])
