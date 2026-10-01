"""The Rangewarden: the Stormbrass Foundry's second boss, the proving range's
target-master (src/sim/encounters/stormbrass_foundry/rangewarden.ts).

  blender -b --factory-startup --python rangewarden.py -- <out.glb|-> [--sheet dir] [--blend out.blend] [--fast] [--nobake]

A squat tracked gun-frame. Two heavy caterpillar units with road wheels, a
drive sprocket and an idler (every wheel on its own bone, turning as it rolls)
carry a riveted chassis with hazard-striped mudguards and headlamps. On it a
squat armoured TORSO on a slewing ring, and on that the RANGEFINDER HEAD: a
drum with ONE BIG GLASS EYE (iris rings round a pale lightning-blue core) under
a riveted hood, and a long stereo rangefinder bar across it with lens caps at
both ends. Two STUBBY CANNON ARMS on shoulder mounts, thick barrels with
cooling rings and muzzle brakes (each barrel recoils along its own sleeve).
On its back a FLAG RACK of three poles flying signal flags (cloth that streams
and snaps) and the DRONE RACK where its Drill Drones ride, the rack tipping
back to launch them. Brass, dark iron, copper, verdigris, hazard paint,
range numbers stencilled on its flanks.

Scale: about 3.6 yards to the flag tips at rest; its template's 2.2 stands it
near 8 yards tall in the game, three players.

Clips (24 fps): Idle, Walk, Run, CannonBash, PointBlank (melee), ProofShot
(the 1.5 s bar: one cannon raised and braced, the eye locking on, the big
recoil at the bar's end, played out), TargetLock (the head sweeping and
snapping onto its marks, a flag run up), SignalSalvo (the flags whipped in
semaphore to the berm), LaunchDrones (the rack tipping back), Cast, Hit,
Death (it lurches, sinks onto one track, the head drooping).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from foundry_kit import (  # noqa: E402
    ARC, ARC_HOT, BLACK, BODY, BRASS, BRASS_D, BRASS_HI, COPPER, COPPER_D, GLASS, GLOW, HAZARD, IRON, IRON_D,
    IRON_HI, LENS, MEMBRANE, METAL, RUBBER, SIGNAL_RED, STEEL, VERDI, WARN, MachineRig, Matrix, Membrane, MPart,
    Vector, anim, basis, expand_bones, lerp, run, tracks,
)

FLAG_COLS = [(0.78, 0.14, 0.1), (0.9, 0.76, 0.16), (0.16, 0.32, 0.62)]
STENCIL = (0.88, 0.86, 0.78)
WHEEL_Y = (-0.82, -0.28, 0.26, 0.8)
TRACK_X = 0.98
WHEEL_R = 0.25

_bones = [
    ('Root', None, (0, 0, 0), (0, 0, 0.4)),
    ('Hull', 'Root', (0, 0, 0.9), (0, 0, 1.3)),
    ('Torso', 'Hull', (0, 0.05, 1.32), (0, 0.05, 2.2)),
    ('Head', 'Torso', (0, -0.08, 2.32), (0, -0.08, 2.92)),
    ('Shoulder.L', 'Torso', (0.92, 0.02, 1.95), (1.22, 0.02, 1.95)),
    ('Cannon.L', 'Shoulder.L', (1.25, 0.02, 1.95), (1.25, -1.0, 1.95)),
    ('Barrel.L', 'Cannon.L', (1.25, -0.45, 1.95), (1.25, -1.25, 1.95)),
    ('Rack', 'Torso', (0, 0.72, 1.72), (0, 0.95, 2.4)),
]
for k, (x, y) in enumerate(((-0.42, 0.86), (0.0, 0.98), (0.42, 0.86))):
    _bones.append((f'Flag{k}', 'Torso', (x, y, 2.18), (x, y, 3.35)))
    _bones.append((f'FlagTip{k}', f'Flag{k}', (x, y + 0.02, 3.33), (x, y + 0.95, 3.33)))
for k, y in enumerate(WHEEL_Y):
    _bones.append((f'Wheel{k}.L', 'Root', (TRACK_X, y, 0.33), (TRACK_X + 0.25, y, 0.33)))
_bones.append(('Sprocket.L', 'Root', (TRACK_X, -1.12, 0.52), (TRACK_X + 0.25, -1.12, 0.52)))
_bones.append(('Idler.L', 'Root', (TRACK_X, 1.12, 0.5), (TRACK_X + 0.25, 1.12, 0.5)))
BONES = expand_bones(_bones)
REST = {n: (Vector(h), Vector(t)) for n, _, h, t in BONES}
EYE_C = Vector((0.0, -0.66, 2.6))
FLAG_W, FLAG_H = 0.95, 0.62


def M(v, s):
    return Vector((s * v.x, v.y, v.z))


def stencil_number(p, origin, right, up, digits, h=0.16, color=STENCIL):
    """Stencilled range numbers: each digit drawn as up to seven bars."""
    segs = {'0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc',
            '7': 'abc', '8': 'abcdefg', '9': 'abcfgd'}
    o = Vector(origin)
    r = Vector(right).normalized()
    u = Vector(up).normalized()
    n = r.cross(u)
    w = h * 0.55
    t = h * 0.13
    fr_h = Matrix((r, u, n)).transposed()
    fr_v = Matrix((u, -r, n)).transposed()
    for i, ch in enumerate(digits):
        base = o + r * i * (w + h * 0.3)
        pos = {'a': (base + r * w / 2 + u * h, fr_h, w), 'g': (base + r * w / 2 + u * h / 2, fr_h, w),
               'd': (base + r * w / 2, fr_h, w), 'f': (base + u * h * 0.75, fr_v, h / 2),
               'b': (base + r * w + u * h * 0.75, fr_v, h / 2), 'e': (base + u * h * 0.25, fr_v, h / 2),
               'c': (base + r * w + u * h * 0.25, fr_v, h / 2)}
        for sgm in segs.get(ch, ''):
            c, fr, ln = pos[sgm]
            p.obox(tuple(c + n * 0.006), (ln, t, 0.012), fr, color, mat=BODY)


def build_parts():
    parts = []

    def part(name, bone, **kw):
        pt = MPart(name, bone, **kw)
        parts.append(pt)
        return pt

    # ---- the tracks (static loops), the wheels on their own bones ---------------------
    for s, tag in ((1, '.L'), (-1, '.R')):
        tr = part('Track' + tag, 'Root')
        tr.treads((s * TRACK_X, 0, 0.42), 2.72, 0.84, 0.5, links=40)
        # the side skirt plate over the wheels, riveted, with the range number
        sk = Vector((s * (TRACK_X + 0.29), 0, 0.5))
        tr.plate(tuple(sk), (2.3, 0.42, 0.05), basis((s, 0, 0), (0, 0, 1)), IRON, rivet=0.025, rivet_n=(9, 2))
        stencil_number(tr, sk + Vector((s * 0.03, -0.35 * s, -0.05)), (0, -s, 0), (0, 0, 1), '07' if s > 0 else '12',
                       h=0.22)
        tr.hazard(sk + Vector((s * 0.03, -1.12, 0.2)), sk + Vector((s * 0.03, -0.62, 0.2)), (s, 0, 0), 0.1, 4)
        # the mudguard over the track, brass with a lip
        mg = Vector((s * TRACK_X, 0, 0.92))
        tr.obox(tuple(mg), (0.62, 2.62, 0.06), basis((0, 0, 1), (0, -1, 0)), BRASS, mat=METAL, bevel=0.02)
        tr.obox(tuple(mg + Vector((s * 0.31, 0, -0.06))), (0.04, 2.6, 0.14), basis((0, 0, 1), (0, -1, 0)), BRASS_D,
                mat=METAL, bevel=0.01)
        tr.rivet_line(mg + Vector((s * 0.25, -1.2, 0.035)), mg + Vector((s * 0.25, 1.2, 0.035)), 10, 0.02, BRASS_D,
                      normal=(0, 0, 1))
        for k, y in enumerate(WHEEL_Y):
            w = part(f'Wheel{k}{tag}', f'Wheel{k}{tag}')
            c = Vector((s * TRACK_X, y, 0.33))
            w.disc(tuple(c), (1, 0, 0), WHEEL_R, 0.36, IRON_D, sides=18)
            w.disc(tuple(c + Vector((s * 0.19, 0, 0))), (1, 0, 0), WHEEL_R * 0.7, 0.04, BRASS_D, sides=16)
            w.rivet_circle(c + Vector((s * 0.21, 0, 0)), (s, 0, 0), WHEEL_R * 0.48, 6, 0.022, BRASS_HI)
            w.disc(tuple(c + Vector((s * 0.22, 0, 0))), (1, 0, 0), 0.06, 0.04, IRON, sides=8)
            for sp in range(3):   # spokes so the turn reads
                a = math.tau * sp / 3
                d = Vector((0, math.cos(a), math.sin(a)))
                w.obox(tuple(c + Vector((s * 0.205, 0, 0)) + d * WHEEL_R * 0.4), (0.03, 0.05, WHEEL_R * 0.55),
                       basis(d, (1, 0, 0)), IRON, mat=METAL)
        for nm, y, z, r in (('Sprocket', -1.12, 0.52, 0.3), ('Idler', 1.12, 0.5, 0.28)):
            g = part(nm + tag, nm + tag)
            c = Vector((s * TRACK_X, y, z))
            g.gear(tuple(c), (1, 0, 0), r, 11, 0.32, IRON_HI if nm == 'Sprocket' else IRON)
            g.disc(tuple(c + Vector((s * 0.17, 0, 0))), (1, 0, 0), r * 0.4, 0.05, BRASS, sides=12)
    # ---- the chassis ------------------------------------------------------------------
    hu = part('Hull', 'Hull')
    hu.obox((0, 0, 0.92), (1.42, 2.5, 0.62), basis((0, 0, 1), (0, -1, 0)), IRON, mat=METAL, bevel=0.06)
    hu.obox((0, -1.14, 1.16), (1.38, 0.5, 0.08), basis((0, -0.55, 0.83), (0, 0, 1)), IRON_HI, mat=METAL, bevel=0.025)
    hu.rivet_line((-0.6, -1.36, 1.05), (0.6, -1.36, 1.05), 8, 0.022, BRASS_D, normal=(0, -0.55, 0.83))
    hu.hazard(Vector((-0.68, -1.255, 0.78)), Vector((0.68, -1.255, 0.78)), (0, -1, 0), 0.24, 9)
    for s in (-1, 1):   # headlamps in brass cages
        hl = Vector((s * 0.48, -1.32, 1.1))
        hu.cyl(hl + Vector((0, 0.14, 0)), hl, 0.12, BRASS, sides=14)
        hu.disc(tuple(hl - Vector((0, 0.01, 0))), (0, -1, 0), 0.1, 0.02, (0.95, 0.9, 0.7), sides=14, mat=GLOW)
        hu.ring(hl - Vector((0, 0.03, 0)), (0, -1, 0), 0.115, 0.018, BRASS_D, sides=14)
    hu.rivet_line((-0.68, -1.2, 1.22), (0.68, -1.2, 1.22), 9, 0.025, BRASS_D, normal=(0, 0, 1))
    hu.rivet_line((-0.68, 1.22, 1.22), (0.68, 1.22, 1.22), 9, 0.025, BRASS_D, normal=(0, 0, 1))
    hu.pipe([Vector((0.55, 1.2, 1.0)), Vector((0.55, 1.35, 1.3)), Vector((0.55, 1.3, 1.6))], 0.07, IRON_D)  # exhaust
    hu.ring(Vector((0, 0.05, 1.27)), (0, 0, 1), 0.8, 0.06, BRASS, sides=32)   # the slewing ring
    # ---- the torso: a squat armoured drum, brass and iron ------------------------------
    to = part('Torso', 'Torso')
    to.lathe((0, 0.05, 1.28), [(0.86, 0), (0.92, 0.12), (0.9, 0.62), (0.8, 0.9), (0.55, 1.02), (0.0, 1.04)], 24,
             IRON, mat=METAL)
    for z in (1.4, 1.84):
        to.ring(Vector((0, 0.05, z)), (0, 0, 1), 0.915, 0.035, BRASS_D, sides=32)
        to.rivet_circle(Vector((0, 0.05, z + 0.06)), (0, 0, 1), 0.915, 20, 0.022, BRASS_HI)
    # the front glacis plate, brass, hazard-edged, with its range-officer's number
    gp = Vector((0, -0.84, 1.66))
    to.plate(tuple(gp), (1.1, 0.62, 0.08), basis((0, -1, 0.15), (0, 0, 1)), BRASS, rivet=0.026, rivet_n=(6, 3))
    stencil_number(to, gp + Vector((-0.22, -0.05, -0.1)), (1, 0, 0), (0, 0.15, 1), '20', h=0.2, color=(0.1, 0.1, 0.1))
    to.hazard(gp + Vector((-0.55, -0.06, -0.36)), gp + Vector((0.55, -0.06, -0.36)), (0, -1, 0.15), 0.08, 8)
    for s in (-1, 1):   # flank vents and a verdigrised copper coolant line
        to.obox((s * 0.8, -0.1, 1.62), (0.06, 0.5, 0.36), basis((s, 0, 0), (0, 0, 1)), IRON_D, mat=METAL, bevel=0.015)
        for k in range(4):
            to.obox((s * 0.84, -0.1, 1.5 + 0.08 * k), (0.03, 0.46, 0.03), basis((s, 0, 0), (0, 0, 1)), BRASS_D,
                    mat=METAL)
        to.pipe([Vector((s * 0.6, 0.62, 1.4)), Vector((s * 0.85, 0.4, 1.7)), Vector((s * 0.75, -0.2, 2.05))], 0.045,
                lerp(COPPER, VERDI, 0.35))
    to.gauge((0.38, -0.82, 2.06), (0, -1, 0.25), 0.1, ticks=7)
    # the shoulder mounts
    for s in (-1, 1):
        sm = Vector((s * 0.9, 0.02, 1.95))
        to.cyl(sm - Vector((s * 0.12, 0, 0)), sm + Vector((s * 0.08, 0, 0)), 0.3, IRON_HI, sides=18)
        to.gear(tuple(sm + Vector((s * 0.02, 0, 0))), (s, 0, 0), 0.36, 16, 0.07, BRASS)
    # ---- the rangefinder head and its one great eye --------------------------------------
    hd = part('Head', 'Head')
    hc = Vector((0, -0.12, 2.6))
    hd.cyl(hc + Vector((0, 0.42, 0)), hc - Vector((0, 0.44, 0)), 0.36, IRON, sides=24)
    hd.ring(hc - Vector((0, 0.44, 0)), (0, -1, 0), 0.36, 0.05, BRASS, sides=28)
    hd.disc(tuple(hc + Vector((0, 0.43, 0))), (0, 1, 0), 0.34, 0.04, BRASS_D, sides=24)
    for y in (-0.25, 0.0, 0.25):
        hd.ring(hc + Vector((0, y, 0)), (0, 1, 0), 0.365, 0.022, BRASS_D, sides=28)
    # the eye: a deep brass socket, iris rings, the glass, the lightning core
    ec = EYE_C
    hd.cyl(ec + Vector((0, 0.08, 0)), ec - Vector((0, 0.1, 0)), 0.3, BRASS, sides=28)
    hd.ring(ec - Vector((0, 0.1, 0)), (0, -1, 0), 0.3, 0.045, BRASS_HI, sides=32)
    hd.disc(tuple(ec - Vector((0, 0.11, 0))), (0, -1, 0), 0.27, 0.02, LENS, sides=28, mat=GLASS)
    for k, r in enumerate((0.23, 0.17)):
        hd.ring(ec - Vector((0, 0.125 + 0.005 * k, 0)), (0, -1, 0), r, 0.014, lerp(ARC, LENS, 0.3), sides=24, mat=GLOW)
    hd.disc(tuple(ec - Vector((0, 0.13, 0))), (0, -1, 0), 0.1, 0.02, ARC, sides=20, mat=GLOW)
    hd.disc(tuple(ec - Vector((0, 0.137, 0))), (0, -1, 0), 0.045, 0.02, ARC_HOT, sides=14, mat=GLOW)
    hd.blob(tuple(ec - Vector((0.1, 0.13, -0.12))), (0.07, 0.02, 0.04), (0.9, 0.96, 1.0), segments=6, rings=4, mat=GLASS)
    for a in (0, math.pi / 2, math.pi, 3 * math.pi / 2):   # the reticle's cross hairs
        d = Vector((math.cos(a), 0, math.sin(a)))
        hd.obox(tuple(ec - Vector((0, 0.14, 0)) + d * 0.2), (0.012, 0.012, 0.1), basis(d, (0, -1, 0)), ARC_HOT,
                mat=GLOW)
    hd.obox(tuple(ec + Vector((0, -0.04, 0.3))), (0.7, 0.36, 0.06), basis((0, 0, 1), (0, -1, 0)), IRON_D, mat=METAL,
            bevel=0.02, taper=0.9)   # the hood
    hd.rivet_line(ec + Vector((-0.3, -0.18, 0.33)), ec + Vector((0.3, -0.18, 0.33)), 6, 0.02, BRASS_D, normal=(0, 0, 1))
    # the stereo rangefinder bar
    bar_c = hc + Vector((0, -0.05, 0.12))
    hd.cyl(bar_c - Vector((1.08, 0, 0)), bar_c + Vector((1.08, 0, 0)), 0.1, IRON_HI, sides=14)
    for s in (-1, 1):
        lc = bar_c + Vector((s * 1.1, 0, 0))
        hd.cyl(lc - Vector((s * 0.06, 0, 0)), lc + Vector((s * 0.1, 0, 0)), 0.16, BRASS, sides=16)
        hd.disc(tuple(lc + Vector((s * 0.04, -0.16, 0))), (0, -1, 0), 0.08, 0.04, LENS, sides=14, mat=GLASS)
        hd.ring(lc + Vector((s * 0.04, -0.18, 0)), (0, -1, 0), 0.085, 0.015, BRASS_HI, sides=14)
        for k in range(3):
            hd.ring(bar_c + Vector((s * (0.45 + 0.18 * k), 0, 0)), (1, 0, 0), 0.108, 0.016, BRASS_D, sides=14)
    hd.cyl(hc + Vector((0.18, 0.2, 0.34)), hc + Vector((0.24, 0.3, 1.05)), 0.018, BRASS_D, sides=6)   # antenna
    hd.blob(tuple(hc + Vector((0.24, 0.3, 1.07))), (0.07, 0.07, 0.07), WARN, segments=8, rings=6, mat=GLOW)
    # ---- the cannon arms: stubby, thick, recoiling barrels ------------------------------
    for s, tag in ((1, '.L'), (-1, '.R')):
        sh = part('Shoulder' + tag, 'Shoulder' + tag)
        s0, _ = (M(v, s) for v in REST['Shoulder.L'])
        sh.obox(tuple(s0 + Vector((s * 0.2, 0, 0))), (0.32, 0.5, 0.5), basis((s, 0, 0), (0, 0, 1)), BRASS, mat=METAL,
                bevel=0.05)
        sh.plate(tuple(s0 + Vector((s * 0.22, 0, 0.3))), (0.6, 0.62, 0.07), basis((s * 0.3, 0, 1), (0, -1, 0)),
                 BRASS_D, rivet=0.022, rivet_n=(4, 4))
        ca = part('Cannon' + tag, 'Cannon' + tag)
        c0, c1 = (M(v, s) for v in REST['Cannon.L'])
        ca.obox(tuple(c0 + Vector((0, -0.12, 0))), (0.46, 0.6, 0.46), basis((0, -1, 0), (0, 0, 1)), IRON, mat=METAL,
                bevel=0.06)    # the breech block
        ca.plate(tuple(c0 + Vector((s * 0.25, -0.12, 0))), (0.5, 0.36, 0.04), basis((s, 0, 0), (0, 0, 1)), BRASS,
                 rivet=0.02, rivet_n=(3, 2))
        ca.cyl(c0 + Vector((0, -0.4, 0)), c0 + Vector((0, -0.95, 0)), 0.24, IRON_HI, sides=20)   # the sleeve
        for k in range(4):
            ca.ring(c0 + Vector((0, -0.48 - 0.13 * k, 0)), (0, -1, 0), 0.25, 0.03, BRASS_D, sides=22)
        ca.hazard(c0 + Vector((-0.2, -0.36, 0.245)), c0 + Vector((0.2, -0.36, 0.245)), (0, 0, 1), 0.08, 4)
        ca.pipe([c0 + Vector((s * 0.22, 0.1, -0.1)), c0 + Vector((s * 0.3, -0.5, -0.15)), c0 + Vector((s * 0.2, -0.9, -0.1))],
                0.035, COPPER)
        br = part('Barrel' + tag, 'Barrel' + tag)
        b0 = c0 + Vector((0, -0.85, 0))
        br.cyl(b0, b0 + Vector((0, -0.6, 0)), 0.16, STEEL, sides=18)
        # the muzzle brake: a slotted collar
        mb = b0 + Vector((0, -0.7, 0))
        br.cyl(mb + Vector((0, 0.1, 0)), mb - Vector((0, 0.16, 0)), 0.22, IRON_D, sides=18)
        for a in (0, math.pi):
            d = Vector((math.cos(a), 0, math.sin(a)))
            br.obox(tuple(mb + d * 0.19 - Vector((0, 0.03, 0))), (0.06, 0.16, 0.04), basis((0, -1, 0), d), BLACK,
                    mat=BODY)
        br.disc(tuple(mb - Vector((0, 0.165, 0))), (0, -1, 0), 0.1, 0.02, BLACK, sides=14, mat=BODY)
    # ---- the drone rack on its back, three drones riding it ------------------------------
    rk = part('Rack', 'Rack')
    r0 = Vector(REST['Rack'][0])
    for s in (-1, 1):
        rk.obox(tuple(r0 + Vector((s * 0.5, 0.15, 0.45))), (0.08, 0.1, 1.1), basis((0, 0.25, 1), (0, -1, 0)), IRON,
                mat=METAL, bevel=0.015)
    for k in range(3):
        z = 0.15 + 0.38 * k
        rk.obox(tuple(r0 + Vector((0, 0.08 + 0.08 * k, z))), (1.1, 0.06, 0.06), basis((0, 0, 1), (0, -1, 0)), BRASS_D,
                mat=METAL)
        dc = r0 + Vector((-0.32 + 0.32 * k, 0.32 + 0.08 * k, z + 0.16))
        rk.blob(tuple(dc), (0.32, 0.32, 0.32), BRASS, segments=16, rings=10, mat=METAL)
        rk.ring(dc, (0, 0, 1), 0.18, 0.025, COPPER, sides=16)
        rk.blob(tuple(dc + Vector((0, 0.13, 0))), (0.14, 0.08, 0.14), ARC, segments=10, rings=6, mat=GLOW)
    # ---- the flag rack: three poles and their signal flags (cloth on spars) -------------
    for k in range(3):
        fl = part(f'Flag{k}', f'Flag{k}')
        f0, f1 = REST[f'Flag{k}']
        fl.cyl(f0 - Vector((0, 0, 0.12)), f1 + Vector((0, 0, 0.08)), 0.03, BRASS_D, sides=8)
        fl.blob(tuple(f1 + Vector((0, 0, 0.1))), (0.08, 0.08, 0.08), BRASS_HI, segments=8, rings=6, mat=METAL)
        fl.cyl(f0 - Vector((0, 0, 0.14)), f0 + Vector((0, 0, 0.0)), 0.06, IRON, sides=10)
    return parts


def build_membranes():
    mems = []
    for k in range(3):
        f0, f1 = REST[f'Flag{k}']
        top = f1 - Vector((0, 0, 0.04))
        m = Membrane(f'FlagCloth{k}', FLAG_COLS[k], seed=40 + k)
        near = [(tuple(top - Vector((0, 0, FLAG_H * t))), f'Flag{k}') for t in (0.0, 0.5, 1.0)]
        far = [(tuple(top + Vector((0, FLAG_W, -FLAG_H * t))), f'FlagTip{k}') for t in (0.0, 0.5, 1.0)]
        m.panel(near, far, rows=6, cols=10, scallop=0.0, tear=0.15, shade=1.0)
        # a white band through the yellow and the blue flags, a checker on the red
        for i, (co, _) in enumerate(m.verts):
            u = (co.y - top.y) / FLAG_W
            v = (top.z - co.z) / FLAG_H
            if k == 0 and (int(u * 3) + int(v * 2)) % 2 == 1:
                m.cols_rgb[i] = (0.9, 0.88, 0.8)
            elif k > 0 and 0.38 < v < 0.62:
                m.cols_rgb[i] = (0.9, 0.88, 0.8)
        mems.append(m)
    return mems


# ------------------------------------------------------------------------- clips
def make_clips(arm):
    rig = MachineRig(BONES).attach(arm)
    P = rig.pose
    clips = []

    def add(name, frames, fn, loop=True):
        anim(arm, name, frames, fn, loop)
        clips.append(name)

    def stance(root=(0, 0, 0), roll=0.0, pitch=0.0, hull=(0.0, 0.0, 0.0), torso=0.0, head=(0.0, 0.0),
               cannon_l=(0.0, 0.0), cannon_r=(0.0, 0.0), recoil_l=0.0, recoil_r=0.0, rack=0.0,
               flags=(0.0, 0.0, 0.0), flutter=0.0, stream=0.0, wheel=0.0, wheel_r=None):
        """`hull` (pitch, roll, bob): the suspension; `torso` slews (deg);
        `head` (yaw, pitch); cannons (pitch, swing) at the shoulder; `recoil`
        slides the barrel back; `rack` tips the drone rack; `flags` raise each
        pole; `flutter`/`stream` move the cloth; `wheel` turns the wheels (deg
        of track travel at the road wheels' radius)."""
        wr = wheel if wheel_r is None else wheel_r
        turns = {
            'Root': [('x', pitch), ('y', roll)],
            'Hull': [('x', hull[0]), ('y', hull[1])],
            'Torso': [('z', torso)],
            'Head': [('z', head[0]), ('x', head[1])],
            'Shoulder.L': [('x', cannon_l[0]), ('z', cannon_l[1])],
            'Shoulder.R': [('x', cannon_r[0]), ('z', -cannon_r[1])],
            'Rack': [('x', -rack)],
        }
        for k in range(3):
            turns[f'Flag{k}'] = [('y', (k - 1) * 8 - flags[k] * 0.0), ('x', -flags[k])]
            ph = flutter + k * 1.7
            turns[f'FlagTip{k}'] = [('z', 14 * math.sin(ph) + stream * 0.0), ('x', -6 * math.sin(ph * 1.6) - stream)]
        for k in range(4):
            turns[f'Wheel{k}.L'] = [('x', wheel)]
            turns[f'Wheel{k}.R'] = [('x', wr)]
        for nm, r in (('Sprocket', 0.3), ('Idler', 0.28)):
            turns[nm + '.L'] = [('x', wheel * WHEEL_R / r)]
            turns[nm + '.R'] = [('x', wr * WHEEL_R / r)]
        rootv = Vector(root) + Vector((0, 0, hull[2]))
        return P(turns=turns, root=tuple(rootv), slides={'Barrel.L': recoil_l, 'Barrel.R': recoil_r})

    # Idle: the head scanning the range, the engine's rumble, the flags lifting.
    def idle(f):
        ph = math.tau * f / 96
        return stance(hull=(0.4 * math.sin(ph * 6), 0.3 * math.sin(ph * 5), 0.01 * math.sin(ph * 8)),
                      head=(28 * math.sin(ph), 4 * math.sin(ph * 2) - 2), torso=4 * math.sin(ph),
                      cannon_l=(4 * math.sin(ph + 1), 2), cannon_r=(4 * math.sin(ph + 2.4), 2), flutter=ph * 3,
                      stream=6)
    add('Idle', 96, idle)

    def roll_on(f, period, speed, run_=False):
        ph = math.tau * f / period
        travel = speed * f / period * 360.0
        k = 1.4 if run_ else 1.0
        return stance(hull=(-2.0 * k + 1.2 * math.sin(ph * 2), 0.8 * math.sin(ph) * k, 0.03 * abs(math.sin(ph * 2)) * k),
                      head=(6 * math.sin(ph), -4 * k), torso=3 * math.sin(ph), wheel=travel,
                      cannon_l=(6 * k + 3 * math.sin(ph * 2), 4), cannon_r=(6 * k + 3 * math.sin(ph * 2 + 1), 4),
                      flutter=ph * (3 if not run_ else 5), stream=20 * k)
    add('Walk', 32, lambda f: roll_on(f, 32, 1.0))
    add('Run', 20, lambda f: roll_on(f, 20, 1.0, True))

    def oneshot(spec, base=None):
        tr = tracks(spec)

        def fn(f):
            kw = dict(flutter=f * 0.3, stream=8)
            kw.update(base or {})
            kw.update(tr(f))
            return stance(**kw)
        return fn

    # CannonBash: the right cannon swung like a club across its front.
    add('CannonBash', 30, oneshot({
        'torso': [(0, 0), (9, 32), (12, 34), (15, -26, 'in'), (17, -30, 'back'), (30, 0)],
        'cannon_r': [(0, (0.0, 0.0)), (9, (-28.0, -30.0)), (12, (-30.0, -32.0)), (15, (12.0, 40.0), 'in'),
                     (17, (14.0, 44.0), 'back'), (30, (0.0, 0.0))],
        'hull': [(0, (0.0, 0.0, 0.0)), (9, (-2.0, -3.0, 0.0)), (15, (3.0, 4.0, -0.03), 'in'), (30, (0.0, 0.0, 0.0))],
        'head': [(0, (0.0, 0.0)), (9, (-10.0, 4.0)), (15, (12.0, -6.0)), (30, (0.0, 0.0))],
    }), loop=False)
    # PointBlank: both cannons dropped level and fired into its foe.
    add('PointBlank', 30, oneshot({
        'cannon_l': [(0, (0.0, 0.0)), (8, (14.0, -8.0)), (24, (14.0, -8.0)), (30, (0.0, 0.0))],
        'cannon_r': [(0, (0.0, 0.0)), (8, (14.0, -8.0)), (24, (14.0, -8.0)), (30, (0.0, 0.0))],
        'recoil_l': [(0, 0.0), (11, 0.0), (12, 0.38, 'snap'), (20, 0.0, 'out'), (30, 0.0)],
        'recoil_r': [(0, 0.0), (13, 0.0), (14, 0.38, 'snap'), (22, 0.0, 'out'), (30, 0.0)],
        'hull': [(0, (0.0, 0.0, 0.0)), (11, (1.0, 0.0, 0.0)), (12, (-4.0, 1.5, 0.02), 'snap'), (14, (-5.0, -1.5, 0.03), 'snap'),
                 (24, (0.0, 0.0, 0.0)), (30, (0.0, 0.0, 0.0))],
        'head': [(0, (0.0, 0.0)), (8, (0.0, -8.0)), (24, (0.0, -8.0)), (30, (0.0, 0.0))],
    }), loop=False)
    # ProofShot (1.5 s, played out): the right cannon raised, the eye locked, braced; fire.
    add('ProofShot', 52, oneshot({
        'cannon_r': [(0, (0.0, 0.0)), (10, (-6.0, -14.0), 'out'), (35, (-8.0, -16.0)), (36, (-22.0, -18.0), 'snap'),
                     (44, (-6.0, -14.0), 'out'), (52, (0.0, 0.0))],
        'recoil_r': [(0, 0.0), (35, 0.0), (36, 0.55, 'snap'), (48, 0.0, 'out'), (52, 0.0)],
        'cannon_l': [(0, (0.0, 0.0)), (12, (10.0, 20.0)), (40, (10.0, 20.0)), (52, (0.0, 0.0))],
        'torso': [(0, 0), (10, -12), (35, -13), (36, -5, 'snap'), (52, 0)],
        'head': [(0, (0.0, 0.0)), (6, (-14.0, 0.0)), (10, (-12.0, -6.0), 'snap'), (35, (-12.0, -6.0)), (36, (-10.0, 6.0), 'snap'),
                 (52, (0.0, 0.0))],
        'hull': [(0, (0.0, 0.0, 0.0)), (12, (2.5, 0.0, -0.04)), (35, (2.8, 0.0, -0.05)), (36, (-7.0, 2.0, 0.04), 'snap'),
                 (42, (1.5, -0.6, -0.02), 'out'), (52, (0.0, 0.0, 0.0))],
        'root': [(0, (0, 0, 0)), (35, (0, 0, 0)), (37, (0, 0.22, 0), 'snap'), (52, (0, 0.18, 0))],
        'wheel': [(0, 0.0), (35, 0.0), (37, -50.0, 'snap'), (52, -45.0)],
    }), loop=False)
    # TargetLock: the head sweeping the range, snapping onto its marks; a flag run up.
    add('TargetLock', 40, oneshot({
        'head': [(0, (0.0, 0.0)), (8, (-40.0, 6.0)), (16, (38.0, 4.0)), (20, (14.0, 0.0), 'snap'), (24, (-22.0, 2.0), 'snap'),
                 (36, (-20.0, 2.0)), (40, (0.0, 0.0))],
        'torso': [(0, 0), (8, -10), (16, 10), (24, -6), (40, 0)],
        'flags': [(0, (0.0, 0.0, 0.0)), (12, (0.0, 0.0, 0.0)), (20, (0.0, 32.0, 0.0), 'back'), (34, (0.0, 30.0, 0.0)),
                  (40, (0.0, 0.0, 0.0))],
    }), loop=False)
    # SignalSalvo: the flags whipped in semaphore to the berm, the cannons raised.
    add('SignalSalvo', 36, oneshot({
        'flags': [(0, (0.0, 0.0, 0.0)), (6, (40.0, -30.0, 40.0), 'back'), (12, (-30.0, 40.0, -30.0), 'back'),
                  (18, (40.0, -30.0, 40.0), 'back'), (28, (10.0, 10.0, 10.0)), (36, (0.0, 0.0, 0.0))],
        'cannon_l': [(0, (0.0, 0.0)), (8, (-45.0, 10.0)), (28, (-45.0, 10.0)), (36, (0.0, 0.0))],
        'cannon_r': [(0, (0.0, 0.0)), (8, (-45.0, 10.0)), (28, (-45.0, 10.0)), (36, (0.0, 0.0))],
        'head': [(0, (0.0, 0.0)), (8, (60.0, 10.0)), (28, (58.0, 10.0)), (36, (0.0, 0.0))],
        'torso': [(0, 0), (8, 14), (28, 14), (36, 0)],
    }), loop=False)
    # LaunchDrones: the rack tips back and the drones lift off it.
    add('LaunchDrones', 40, oneshot({
        'rack': [(0, 0.0), (10, 48.0, 'out'), (14, 44.0), (30, 46.0), (40, 0.0)],
        'hull': [(0, (0.0, 0.0, 0.0)), (10, (-3.0, 0.0, -0.03)), (14, (2.0, 0.0, 0.02), 'back'), (40, (0.0, 0.0, 0.0))],
        'head': [(0, (0.0, 0.0)), (10, (0.0, 22.0)), (30, (0.0, 20.0)), (40, (0.0, 0.0))],
        'cannon_l': [(0, (0.0, 0.0)), (10, (10.0, 14.0)), (40, (0.0, 0.0))],
        'cannon_r': [(0, (0.0, 0.0)), (10, (10.0, 14.0)), (40, (0.0, 0.0))],
    }), loop=False)
    # Cast: the head ticking over the range, the cannons trained.
    add('Cast', 24, lambda f: stance(head=(10 * math.sin(math.tau * f / 24), -4), cannon_l=(-10, 0), cannon_r=(-10, 0),
                                     flutter=f * 0.3, stream=8))
    add('Hit', 16, oneshot({
        'hull': [(0, (0.0, 0.0, 0.0)), (3, (-6.0, 3.0, 0.03), 'snap'), (16, (0.0, 0.0, 0.0))],
        'head': [(0, (0.0, 0.0)), (3, (12.0, 14.0), 'snap'), (16, (0.0, 0.0))],
        'torso': [(0, 0), (3, 8, 'snap'), (16, 0)],
    }), loop=False)
    # Death: a lurch, a shudder, it slumps onto its left track, head and cannons drooping.
    add('Death', 64, oneshot({
        'hull': [(0, (0.0, 0.0, 0.0)), (6, (-8.0, 4.0, 0.05), 'snap'), (14, (4.0, -4.0, -0.02)), (22, (6.0, 2.0, -0.1)),
                 (34, (8.0, 3.0, -0.18), 'in'), (38, (6.0, 2.0, -0.15), 'back'), (64, (6.0, 2.0, -0.16))],
        'roll': [(0, 0.0), (22, 0.0), (34, 9.0, 'in'), (38, 7.5, 'back'), (64, 8.0)],
        'head': [(0, (0.0, 0.0)), (6, (20.0, 10.0), 'snap'), (22, (-10.0, 0.0)), (40, (-25.0, 40.0), 'in'),
                 (44, (-23.0, 34.0), 'back'), (64, (-24.0, 36.0))],
        'torso': [(0, 0), (6, 10, 'snap'), (22, -6), (40, -18), (64, -18)],
        'cannon_l': [(0, (0.0, 0.0)), (24, (10.0, 5.0)), (40, (45.0, 10.0), 'in'), (44, (40.0, 10.0), 'back'), (64, (42.0, 10.0))],
        'cannon_r': [(0, (0.0, 0.0)), (28, (10.0, 5.0)), (44, (50.0, 15.0), 'in'), (48, (44.0, 14.0), 'back'), (64, (46.0, 14.0))],
        'flags': [(0, (0.0, 0.0, 0.0)), (30, (10.0, -10.0, 10.0)), (50, (35.0, -25.0, 55.0), 'in'), (64, (34.0, -24.0, 52.0))],
        'rack': [(0, 0.0), (40, 0.0), (52, 18.0, 'in'), (64, 16.0)],
    }), loop=False)
    return clips


if __name__ == '__main__':
    run('Rangewarden', BONES, build_parts, make_clips, membranes_fn=build_membranes,
        sheet_args={'prefix': 'rangewarden', 'focus': (0.4, 0.0, 1.6), 'dist': 7.0, 'scale': 2.2, 'ref_side': 2.6},
        anchors=[('Idle', 13, 'Head', False), ('ProofShot', 36, 'Barrel.R', True), ('PointBlank', 12, 'Barrel.L', True),
                 ('LaunchDrones', 14, 'Rack', True), ('Idle', 13, 'Flag1', True)])
