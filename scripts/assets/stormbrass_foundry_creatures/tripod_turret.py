"""The Tripod Turret (`tripod_turret`, sim/content/stormbrass_foundry.ts): the
brass gun the Gearwright Apprentice plants. It never walks; it shoots bolts.

  blender -b --factory-startup --python tripod_turret.py -- <out.glb|-> [--sheet dir] [--blend f] [--fast] [--nobake]

Three splayed iron legs with brass knuckle joints and spiked feet hold a
geared brass hub; on it the gun head swivels: a riveted housing behind a
hazard-striped shield plate with a sight slit, a glowing blue sight on a
little arm, a stubby finned BARREL with a muzzle brake (it recoils on its own
bone), a magazine DRUM on its flank (it turns as it feeds) and a copper feed
pipe, an exhaust stub behind.

Scale: about 1.6 yards authored; drawn about 1.9 at its 1.1.

Clips (24 fps): Idle (the head sweeping its arc), Walk, Run (the same scan,
quicker: it never moves), Attack (a shot: the barrel slams back, the head
kicks, the drum turns), Hit, Death (a leg buckles and it crashes over).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from foundry_kit import (  # noqa: E402
    ARC, ARC_HOT, BLACK, BRASS, BRASS_D, BRASS_HI, COPPER, GLOW, HAZARD, IRON, IRON_D, IRON_HI, LENS, METAL, STEEL,
    MachineRig, Matrix, MPart, Vector, anim, basis, expand_bones, run, tracks,
)

HUB = Vector((0.0, 0.0, 0.9))
LEG_A = [math.radians(-90), math.radians(30), math.radians(150)]   # front, back-left, back-right


def _leg_pts(a):
    d = Vector((math.cos(a), math.sin(a), 0.0))
    return HUB + d * 0.16 - Vector((0, 0, 0.05)), HUB + d * 0.52 + Vector((0, 0, -0.18)), d * 0.86 + Vector((0, 0, 0.05))


_bones = [('Root', None, (0, 0, 0), (0, 0, 0.3)), ('Base', 'Root', tuple(HUB), tuple(HUB + Vector((0, 0, 0.15))))]
for i, a in enumerate(LEG_A):
    h, k, f = _leg_pts(a)
    _bones.append((f'Leg{i}', 'Base', tuple(h), tuple(k)))
    _bones.append((f'Shin{i}', f'Leg{i}', tuple(k), tuple(f)))
_bones += [
    ('Head', 'Base', tuple(HUB + Vector((0, 0, 0.15))), tuple(HUB + Vector((0, 0, 0.45)))),
    ('Barrel', 'Head', (0.0, -0.2, 1.3), (0.0, -0.75, 1.3)),
    ('Drum', 'Head', (0.24, 0.02, 1.27), (0.36, 0.02, 1.27)),
]
B = expand_bones(_bones)
REST = {n: (Vector(h), Vector(t)) for n, _, h, t in B}


def build_parts():
    parts = []

    def part(name, bone, **kw):
        pt = MPart(name, bone, **kw)
        parts.append(pt)
        return pt

    base = part('Base', 'Base')
    base.cyl(HUB - Vector((0, 0, 0.12)), HUB + Vector((0, 0, 0.12)), 0.2, BRASS_D, sides=20)
    base.gear(tuple(HUB + Vector((0, 0, 0.13))), (0, 0, 1), 0.24, 18, 0.05, BRASS)
    base.disc(tuple(HUB - Vector((0, 0, 0.13))), (0, 0, -1), 0.14, 0.04, IRON, sides=16)
    base.rivet_circle(HUB + Vector((0, 0, -0.05)), (0, 0, 1), 0.2, 12, 0.014, BRASS_HI)
    for i, a in enumerate(LEG_A):
        h, k, f = _leg_pts(a)
        lg = part(f'Leg{i}', f'Leg{i}')
        lg.blob(tuple(h), (0.14, 0.14, 0.14), BRASS_HI, segments=12, rings=8, mat=METAL)
        lg.cyl(h, k, 0.045, IRON, sides=10)
        lg.piston(h.lerp(k, 0.15) + Vector((0, 0, 0.06)), h.lerp(k, 0.85) + Vector((0, 0, 0.06)), 0.022)
        lg.blob(tuple(k), (0.13, 0.13, 0.13), BRASS, segments=12, rings=8, mat=METAL)
        sh = part(f'Shin{i}', f'Shin{i}')
        sh.cyl(k, f + Vector((0, 0, 0.06)), 0.04, IRON_HI, sides=10, r2=0.032)
        sh.ring(k.lerp(f, 0.5), (f - k).normalized(), 0.045, 0.012, BRASS_D, sides=10)
        sh.cyl(f + Vector((0, 0, 0.06)), f - Vector((0, 0, 0.02)), 0.08, IRON_D, sides=12, r2=0.1)
        sh.spike(tuple(f - Vector((0, 0, 0.02))), 0.03, -0.08, STEEL, sides=5, mat=METAL)
    hd = part('Head', 'Head')
    hc = Vector((0.0, 0.02, 1.27))
    hd.cyl(HUB + Vector((0, 0, 0.12)), HUB + Vector((0, 0, 0.24)), 0.13, IRON, sides=16)
    hd.obox(tuple(hc), (0.4, 0.42, 0.3), Matrix.Identity(3), BRASS, mat=METAL, bevel=0.05)
    hd.blob(tuple(hc + Vector((0, 0.18, 0.0))), (0.4, 0.3, 0.3), BRASS_D, segments=16, rings=10, mat=METAL)
    hd.plate(tuple(hc + Vector((0, 0, 0.16))), (0.36, 0.38, 0.03), Matrix.Identity(3), BRASS_HI, rivet=0.012, rivet_n=(4, 4))
    # the shield plate with its sight slit, hazard-striped
    sp = hc + Vector((0, -0.25, 0.0))
    hd.obox(tuple(sp), (0.56, 0.05, 0.4), Matrix.Identity(3), IRON_HI, mat=METAL, bevel=0.02)
    hd.hazard(sp + Vector((-0.26, -0.03, -0.14)), sp + Vector((0.26, -0.03, -0.14)), (0, -1, 0), 0.09, 8, depth=0.012)
    hd.obox(tuple(sp + Vector((-0.12, -0.03, 0.1))), (0.16, 0.02, 0.04), Matrix.Identity(3), BLACK)
    hd.rivet_line(sp + Vector((-0.24, -0.03, 0.17)), sp + Vector((0.24, -0.03, 0.17)), 6, 0.012, BRASS_D, normal=(0, -1, 0))
    # the sight on its arm
    sa = hc + Vector((-0.22, -0.05, 0.2))
    hd.cyl(hc + Vector((-0.18, 0.0, 0.14)), sa, 0.018, IRON, sides=8)
    hd.cyl(sa + Vector((0, 0.06, 0)), sa - Vector((0, 0.08, 0)), 0.045, BRASS_D, sides=12)
    hd.disc(tuple(sa - Vector((0, 0.085, 0))), (0, -1, 0), 0.035, 0.01, ARC_HOT, sides=10, mat=GLOW)
    # the feed pipe and exhaust
    hd.pipe([hc + Vector((0.2, 0.05, 0.1)), hc + Vector((0.12, -0.12, 0.18)), hc + Vector((0.04, -0.2, 0.06))], 0.022,
            COPPER)
    hd.cyl(hc + Vector((-0.1, 0.25, 0.08)), hc + Vector((-0.12, 0.32, 0.3)), 0.035, IRON_D, sides=10)
    br = part('Barrel', 'Barrel')
    b0, b1 = REST['Barrel']
    bd = (b1 - b0).normalized()
    br.cyl(b0, b1, 0.06, IRON_HI, sides=14)
    for k in range(5):
        br.disc(tuple(b0.lerp(b1, 0.15 + 0.11 * k)), tuple(bd), 0.09, 0.025, IRON, sides=14)
    br.cyl(b1 - bd * 0.08, b1 + bd * 0.05, 0.085, BRASS_D, sides=14)
    for s in (-1, 1):
        br.obox(tuple(b1 - bd * 0.01 + Vector((s * 0.085, 0, 0))), (0.03, 0.08, 0.06), Matrix.Identity(3), IRON_D,
                mat=METAL)
    br.disc(tuple(b1 + bd * 0.055), tuple(bd), 0.035, 0.01, BLACK, sides=10)
    dr = part('Drum', 'Drum')
    d0, d1 = REST['Drum']
    dr.cyl(d0, d1, 0.15, BRASS, sides=18)
    dr.ring(d0.lerp(d1, 0.5), (1, 0, 0), 0.152, 0.015, IRON, sides=18)
    for k in range(8):
        a = math.tau * k / 8
        dr.blob(tuple(d1 + Vector((0.005, math.cos(a) * 0.1, math.sin(a) * 0.1))), (0.03, 0.05, 0.05), STEEL,
                segments=6, rings=4, mat=METAL)
    dr.disc(tuple(d1 + Vector((0.01, 0, 0))), (1, 0, 0), 0.04, 0.02, BRASS_HI, sides=10)
    return parts


def make_clips(arm):
    rig = MachineRig(B).attach(arm)
    P = rig.pose
    clips = []

    def add(name, frames, fn, loop=True):
        anim(arm, name, frames, fn, loop)
        clips.append(name)

    def pose(yaw=0.0, pitch=0.0, recoil=0.0, drum=0.0, root=(0, 0, 0), tilt=0.0, roll=0.0, buckle=0.0, base=0.0):
        turns = {'Root': [('x', tilt), ('y', roll)], 'Head': [('x', pitch), ('z', yaw)], 'Drum': [('x', drum)],
                 'Base': [('z', base)], 'Leg0': [('x', -buckle)], 'Shin0': [('x', buckle * 1.4)]}
        return P(turns=turns, root=root, slides={'Barrel': -recoil})

    def scan(f, n, amp):
        ph = math.tau * f / n
        return pose(yaw=amp * math.sin(ph), pitch=4 * math.sin(ph * 2 + 0.5), drum=0.0)
    add('Idle', 72, lambda f: scan(f, 72, 28.0))
    add('Walk', 48, lambda f: scan(f, 48, 34.0))
    add('Run', 32, lambda f: scan(f, 32, 40.0))

    def shot(spec):
        tr = tracks(spec)
        return lambda f: pose(**tr(f))
    add('Attack', 16, shot({
        'recoil': [(0, 0.0), (3, 0.0), (4, 0.18, 'snap'), (12, 0.0, 'out'), (16, 0.0)],
        'pitch': [(0, 0.0), (3, -3.0), (4, 10.0, 'snap'), (10, 0.0, 'out'), (16, 0.0)],
        'drum': [(0, 0.0), (5, 0.0), (9, 45.0, 'out'), (16, 45.0)],
        'root': [(0, (0, 0, 0)), (4, (0, 0.04, -0.02), 'snap'), (12, (0, 0, 0), 'out')],
    }), loop=False)
    add('Hit', 12, shot({
        'yaw': [(0, 0.0), (2, 14.0, 'snap'), (12, 0.0)],
        'pitch': [(0, 0.0), (2, 12.0, 'snap'), (12, 0.0)],
        'root': [(0, (0, 0, 0)), (2, (0.03, 0.05, 0.0), 'snap'), (12, (0, 0, 0))],
    }), loop=False)
    add('Death', 40, shot({
        'buckle': [(0, 0.0), (6, 10.0), (14, 55.0, 'in'), (40, 60.0)],
        'tilt': [(0, 0.0), (6, 3.0), (16, 32.0, 'in'), (19, 28.0, 'back'), (40, 30.0)],
        'roll': [(0, 0.0), (16, 10.0), (40, 12.0)],
        'root': [(0, (0, 0, 0)), (16, (0, 0.05, -0.18), 'in'), (19, (0, 0.04, -0.14), 'back'), (40, (0, 0.05, -0.16))],
        'pitch': [(0, 0.0), (8, -12.0), (18, 30.0, 'in'), (40, 34.0)],
        'yaw': [(0, 0.0), (10, 25.0), (40, 30.0)],
        'recoil': [(0, 0.0), (18, 0.12, 'snap'), (40, 0.12)],
    }), loop=False)
    return clips


if __name__ == '__main__':
    run('TripodTurret', B, build_parts, make_clips, atlas=1024,
        sheet_args={'prefix': 'turret', 'focus': (0.0, 0.0, 0.8), 'dist': 3.6, 'scale': 1.19, 'ref_side': -1.4},
        anchors=[('Idle', 1, 'Barrel', True), ('Idle', 1, 'Head', True)])
