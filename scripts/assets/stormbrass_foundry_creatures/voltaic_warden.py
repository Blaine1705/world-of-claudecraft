"""The Voltaic Warden: the Stormbrass Foundry's third boss, the guardian of the
storm coil (src/sim/encounters/stormbrass_foundry/voltaic_warden.ts).

  blender -b --factory-startup --python voltaic_warden.py -- <out.glb|-> [--sheet dir] [--blend out.blend] [--fast] [--nobake]

A tall, long-limbed plated automaton. Its chest is a caged TESLA COIL: copper
windings round a white-hot lightning core between brass caps and glass
insulator rings, braced by brass struts. A narrow riveted helm with a burning
visor slit carries LIGHTNING-ROD ANTLERS: branching copper rods with glass
insulator bells and brass ball terminals. A capacitor drum rides its back.

Its REVERSIBLE PLATES (shoulders, chest flanks and thighs at the front; back,
forearms and calves at the back) each turn half a turn about their own long
axis on their own bone: the COPPER face (hammered, riveted, a green status
lamp) lies flat for Grounded; the CHARGED face (blue glass panes over raised
fins) stands proud for Charged. The renderer's dials turn them
(VisualDef.dials, foundry_creature_fx_core.voltaicPlateDial), the front and
back halves apart for heroic Split Plating; no clip keys them.

Scale: about 4.4 yards to the antler tips at rest; its template's 2.4 stands
it some ten yards tall in the game, near four players.

Clips (24 fps): Idle, Walk, Run, Backhand, HammerFists (melee), StaticLash
(the 1 s bar: the arm cocked back and whipped through, played out), FlipRattle
(the 3 s flip bar: arms flung wide, shuddering, rising on its toes as the
plates rattle), CallStorm (the Coil Strike windup: arms and antlers raised to
the sky), Discharge (the burst: the coil thrust forward, arms flung back),
LaunchDrones (arms swept out to loose its drones), Cast, Hit, Death (it
staggers to its knees and falls forward, the coil guttering).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from foundry_kit import (  # noqa: E402
    ARC, ARC_DEEP, ARC_HOT, BLACK, BODY, BRASS, BRASS_D, BRASS_HI, COPPER, COPPER_D, GLASS, GLASS_C, GLOW, IRON,
    IRON_D, IRON_HI, LIGHTNING, METAL, STEEL, VERDI, MachineRig, Matrix, MPart, Vector, anim, basis, expand_bones,
    lerp, run, tracks,
)

LAMP_GREEN = (0.45, 1.0, 0.55)
INSUL = (0.62, 0.82, 0.86)

# (bone, parent, centre, outward normal, long axis, (width, length), half)
PLATES = [
    ('ShoulderPlate.L', 'Arm.L', (0.86, 0.0, 3.02), (0.55, 0.0, 0.84), (0, -1, 0), (0.62, 0.78), 'front'),
    ('ChestPlate.L', 'Chest', (0.54, -0.3, 2.6), (0.6, -0.8, 0.0), (0, 0, 1), (0.34, 0.6), 'front'),
    ('ThighPlate.L', 'Thigh.L', (0.36, -0.26, 1.42), (0.15, -1.0, 0.0), (0.03, 0, -1), (0.4, 0.62), 'front'),
    ('BackPlate.L', 'Chest', (0.42, 0.42, 2.62), (0.45, 0.89, 0.0), (0, 0, 1), (0.42, 0.66), 'back'),
    ('ForePlate.L', 'Fore.L', (1.1, 0.02, 1.92), (0.94, 0.34, 0.0), (0.08, -0.25, -1), (0.3, 0.5), 'back'),
    ('CalfPlate.L', 'Shin.L', (0.36, 0.24, 0.66), (0.1, 1.0, 0.0), (0, 0.08, -1), (0.36, 0.56), 'back'),
]

_bones = [
    ('Root', None, (0, 0, 0), (0, 0, 0.4)),
    ('Hips', 'Root', (0, 0, 1.75), (0, 0, 2.0)),
    ('Spine', 'Hips', (0, 0, 2.0), (0, 0, 2.38)),
    ('Chest', 'Spine', (0, 0, 2.38), (0, 0, 3.0)),
    ('Neck', 'Chest', (0, -0.02, 3.02), (0, -0.04, 3.16)),
    ('Head', 'Neck', (0, -0.04, 3.16), (0, -0.06, 3.56)),
    ('Arm.L', 'Chest', (0.74, 0.02, 2.86), (0.96, 0.0, 2.2)),
    ('Fore.L', 'Arm.L', (0.96, 0.0, 2.2), (1.02, -0.14, 1.6)),
    ('Hand.L', 'Fore.L', (1.02, -0.14, 1.6), (1.04, -0.2, 1.28)),
    ('Thigh.L', 'Hips', (0.3, 0.0, 1.75), (0.34, 0.0, 1.0)),
    ('Shin.L', 'Thigh.L', (0.34, 0.0, 1.0), (0.34, 0.06, 0.26)),
    ('Foot.L', 'Shin.L', (0.34, 0.06, 0.26), (0.34, -0.42, 0.07)),
]
for name, parent, c, _n, ax, (_w, ln), _h in PLATES:
    c, ax = Vector(c), Vector(ax).normalized()
    _bones.append((name, parent, tuple(c - ax * ln / 2), tuple(c + ax * ln / 2)))
BONES = expand_bones(_bones)
REST = {n: (Vector(h), Vector(t)) for n, _, h, t in BONES}
CORE_C = Vector((0.0, -0.22, 2.6))


def M(v, s):
    return Vector((s * v.x, v.y, v.z))


def plate_faces(p, c, n, ax, w, ln):
    """A reversible plate centred on its turning axis: the copper face out along
    `n`, the charged face (blue glass panes over raised fins) on the back."""
    n = Vector(n).normalized()
    u = Vector(ax).normalized()
    u = (u - n * u.dot(n)).normalized()
    side = u.cross(n).normalized()
    fr = Matrix((side, u, n)).transposed()
    c = Vector(c)
    # copper face: hammered, a raised rim, rivets and the green status lamp
    p.obox(tuple(c + n * 0.035), (w, ln, 0.06), fr, COPPER, mat=METAL, bevel=0.022)
    p.obox(tuple(c + n * 0.07), (w * 0.72, ln * 0.78, 0.02), fr, lerp(COPPER, VERDI, 0.25), mat=METAL, bevel=0.008)
    p.rivet_line(c + n * 0.068 + side * (w / 2 - 0.035) - u * (ln / 2 - 0.04),
                 c + n * 0.068 + side * (w / 2 - 0.035) + u * (ln / 2 - 0.04), 4, 0.017, BRASS_HI, normal=tuple(n))
    p.rivet_line(c + n * 0.068 - side * (w / 2 - 0.035) - u * (ln / 2 - 0.04),
                 c + n * 0.068 - side * (w / 2 - 0.035) + u * (ln / 2 - 0.04), 4, 0.017, BRASS_HI, normal=tuple(n))
    p.blob(tuple(c + n * 0.085 + u * ln * 0.3), (0.06, 0.06, 0.03), LAMP_GREEN, segments=8, rings=4, mat=GLOW,
           rot=n.to_track_quat('Z', 'Y').to_euler())
    # charged face: dark iron, three glowing glass panes, fins standing proud
    p.obox(tuple(c - n * 0.035), (w, ln, 0.06), fr, IRON_D, mat=METAL, bevel=0.02)
    for k in range(3):
        pc = c - n * 0.075 + u * (k - 1) * ln * 0.3
        p.obox(tuple(pc), (w * 0.62, ln * 0.2, 0.03), fr, lerp(ARC, ARC_DEEP, 0.2 * k), mat=GLOW, bevel=0.006)
        p.obox(tuple(pc - n * 0.012), (w * 0.3, ln * 0.06, 0.012), fr, ARC_HOT, mat=GLOW)
    for s in (-1, 1):
        p.obox(tuple(c - n * 0.13 + side * s * (w / 2 - 0.02)), (0.025, ln * 0.92, 0.22), fr, BRASS_D, mat=METAL,
               bevel=0.006, taper=0.5)
    p.obox(tuple(c), (w * 1.02, ln * 1.02, 0.02), fr, BRASS_D, mat=METAL)   # the hinge rim between the faces
    p.cyl(c - u * (ln / 2 + 0.04), c + u * (ln / 2 + 0.04), 0.026, BRASS, sides=8)   # the pivot rod


def build_parts():
    parts = []

    def part(name, bone, **kw):
        pt = MPart(name, bone, **kw)
        parts.append(pt)
        return pt

    # ---- the hips and the waist -------------------------------------------------------
    hp = part('Hips', 'Hips')
    hp.lathe((0, 0.02, 1.6), [(0.3, 0), (0.48, 0.08), (0.5, 0.26), (0.38, 0.4), (0.28, 0.46), (0.0, 0.48)], 18, IRON,
             mat=METAL)
    hp.ring(Vector((0, 0.02, 1.86)), (0, 0, 1), 0.49, 0.03, BRASS_D, sides=24)
    hp.rivet_circle(Vector((0, 0.02, 1.8)), (0, 0, 1), 0.49, 14, 0.02, BRASS)
    for s in (-1, 1):   # the hip joints
        hp.cyl(Vector((s * 0.2, 0, 1.75)), Vector((s * 0.42, 0, 1.75)), 0.17, IRON_HI, sides=14)
        hp.disc((s * 0.43, 0, 1.75), (s, 0, 0), 0.12, 0.03, BRASS, sides=12)
    # a groin plate and a skirt of riveted lames
    for k in range(5):
        a = math.radians(-60 + 30 * k)
        d = Vector((math.sin(a), -math.cos(a), 0))
        hp.obox(tuple(Vector((0, 0.02, 1.52)) + d * 0.44), (0.24, 0.05, 0.34), basis(d, (0, 0, 1)),
                IRON if k % 2 else BRASS_D, mat=METAL, bevel=0.012)
    # ---- the spine: a narrow wasp waist of stacked rings and pistons ------------------
    sp = part('Spine', 'Spine')
    sp.cyl(Vector((0, 0, 1.98)), Vector((0, 0, 2.4)), 0.2, IRON_D, sides=14)
    for k in range(4):
        sp.ring(Vector((0, 0, 2.05 + 0.1 * k)), (0, 0, 1), 0.22, 0.03, BRASS_D, sides=18)
    for s in (-1, 1):
        sp.piston(Vector((s * 0.24, 0.08, 1.95)), Vector((s * 0.3, 0.06, 2.42)), 0.045)
    # ---- the chest: the caged tesla coil, the shoulders, the capacitor -----------------
    ch = part('Chest', 'Chest')
    # the torso frame round the coil
    ch.lathe((0, 0.3, 2.3), [(0.34, 0), (0.48, 0.12), (0.56, 0.5), (0.54, 0.62), (0.38, 0.74), (0.0, 0.76)], 22, IRON,
             mat=METAL)
    ch.ring(Vector((0, 0.3, 2.9)), (0, 0, 1), 0.5, 0.035, BRASS, sides=26)
    # the yoke over the coil that carries the shoulders, and the side ribs round it
    ch.obox((0, 0.02, 2.96), (1.32, 0.5, 0.18), basis((0, 0, 1), (0, -1, 0.0001)), IRON_HI, mat=METAL, bevel=0.04)
    ch.rivet_line((-0.6, -0.24, 3.0), (0.6, -0.24, 3.0), 9, 0.02, BRASS_D, normal=(0, -1, 0))
    ch.obox((0, -0.05, 2.22), (0.9, 0.5, 0.14), basis((0, 0, 1), (0, -1, 0.0001)), IRON, mat=METAL, bevel=0.04)
    for s_ in (-1, 1):
        ch.tube([Vector((s_ * 0.48, 0.2, 2.25)), Vector((s_ * 0.52, -0.12, 2.6)), Vector((s_ * 0.5, 0.0, 2.92))],
                [0.07, 0.08, 0.07], IRON_HI, sides=10, mat=METAL)
    # the coil housing cut into the front: brass caps, insulator rings, struts
    cc = CORE_C
    for z, r in ((-0.3, 0.36), (0.3, 0.36)):
        ch.cyl(cc + Vector((0, 0, z - 0.05)), cc + Vector((0, 0, z + 0.05)), r, BRASS, sides=24)
        for k in range(3):
            ch.ring(cc + Vector((0, 0, z + (0.07 + 0.035 * k) * (-1 if z > 0 else 1))), (0, 0, 1), r * (0.9 - 0.08 * k),
                    0.022, INSUL, sides=20, mat=GLASS)
    ch.coil(tuple(cc), (0, 0, 1), 0.27, 0.44, 6, 0.02, COPPER)
    ch.cyl(cc - Vector((0, 0, 0.3)), cc + Vector((0, 0, 0.3)), 0.1, ARC_HOT, sides=14, mat=GLOW)
    ch.cyl(cc - Vector((0, 0, 0.28)), cc + Vector((0, 0, 0.28)), 0.23, lerp(ARC, ARC_HOT, 0.25), sides=16, mat=GLOW)
    for k in range(8):
        a = math.tau * k / 8 + 0.2
        d = Vector((math.cos(a), math.sin(a), 0))
        ch.cyl(cc + d * 0.37 - Vector((0, 0, 0.3)), cc + d * 0.37 + Vector((0, 0, 0.3)), 0.024, BRASS_D, sides=6)
    for z in (-0.12, 0.12):   # faint glass hoops: the coil's glass jacket
        ch.ring(cc + Vector((0, 0, z)), (0, 0, 1), 0.36, 0.008, lerp(ARC, INSUL, 0.5), sides=28, mat=GLOW)
    # broad shoulders with brass caps
    for s in (-1, 1):
        sh = Vector((s * 0.7, 0.02, 2.86))
        ch.blob(tuple(sh), (0.5, 0.52, 0.46), IRON_HI, segments=16, rings=10, mat=METAL)
        ch.ring(sh + Vector((s * 0.16, 0, 0)), (s, 0, 0), 0.2, 0.03, BRASS, sides=16)
    # the collar and the capacitor drum on the back, with its insulators
    ch.ring(Vector((0, -0.02, 3.0)), (0, 0, 1), 0.28, 0.06, BRASS_D, sides=20)
    bc = Vector((0, 0.68, 2.62))
    ch.cyl(bc - Vector((0, 0, 0.42)), bc + Vector((0, 0, 0.42)), 0.28, COPPER_D, sides=20)
    for z in (-0.38, -0.12, 0.12, 0.38):
        ch.ring(bc + Vector((0, 0, z)), (0, 0, 1), 0.29, 0.025, BRASS, sides=20)
    for k in range(3):
        top = bc + Vector((-0.14 + 0.14 * k, 0.04, 0.45))
        ch.lathe(tuple(top), [(0.06, 0), (0.09, 0.05), (0.06, 0.1), (0.09, 0.15), (0.05, 0.2), (0.0, 0.21)], 12, INSUL,
                 mat=GLASS)
        ch.blob(tuple(top + Vector((0, 0, 0.26))), (0.09, 0.09, 0.09), BRASS_HI, segments=10, rings=6, mat=METAL)
    ch.pipe([Vector((-0.3, 0.45, 2.35)), Vector((-0.45, 0.25, 2.3)), Vector((-0.3, -0.2, 2.3))], 0.035, COPPER)
    ch.pipe([Vector((0.3, 0.45, 2.85)), Vector((0.45, 0.25, 2.9)), Vector((0.3, -0.2, 2.86))], 0.035, COPPER)
    # ---- the neck and the helm with its burning visor and the lightning-rod antlers ----
    nk = part('Neck', 'Neck')
    nk.cyl(Vector((0, -0.02, 2.98)), Vector((0, -0.04, 3.2)), 0.13, IRON_D, sides=12)
    for k in range(3):
        nk.ring(Vector((0, -0.03, 3.03 + 0.06 * k)), (0, -0.1, 1), 0.14, 0.02, BRASS_D, sides=14)
    hd = part('Head', 'Head')
    hc = Vector((0, -0.08, 3.36))
    hd.lathe(tuple(hc - Vector((0, 0, 0.2))), [(0.18, 0), (0.24, 0.08), (0.25, 0.26), (0.22, 0.4), (0.12, 0.5),
                                                 (0.0, 0.52)], 16, BRASS, mat=METAL)
    hd.obox(tuple(hc + Vector((0, -0.2, 0.02))), (0.38, 0.12, 0.3), basis((0, -1, 0)), IRON, mat=METAL, bevel=0.03,
            taper=0.8)    # the faceplate
    hd.obox(tuple(hc + Vector((0, -0.265, 0.05))), (0.3, 0.02, 0.05), basis((0, -1, 0)), ARC_HOT, mat=GLOW)
    hd.obox(tuple(hc + Vector((0, -0.262, 0.05))), (0.34, 0.015, 0.09), basis((0, -1, 0)), ARC, mat=GLOW)
    hd.obox(tuple(hc + Vector((0, -0.24, 0.24))), (0.08, 0.2, 0.06), basis((0, 0, 1)), BRASS_HI, mat=METAL, bevel=0.01)
    hd.rivet_line(hc + Vector((-0.17, -0.27, -0.06)), hc + Vector((0.17, -0.27, -0.06)), 5, 0.016, BRASS_D,
                  normal=(0, -1, 0))
    for s in (-1, 1):
        base = hc + Vector((s * 0.2, 0.0, 0.18))
        main = [base, base + Vector((s * 0.22, 0.04, 0.32)), base + Vector((s * 0.36, 0.1, 0.72)),
                base + Vector((s * 0.42, 0.14, 1.02))]
        hd.tube(main, [0.05, 0.04, 0.03, 0.022], COPPER, sides=8, mat=METAL)
        hd.blob(tuple(main[-1] + Vector((0, 0, 0.04))), (0.1, 0.1, 0.1), BRASS_HI, segments=10, rings=6, mat=METAL)
        hd.blob(tuple(main[-1] + Vector((0, 0, 0.04))), (0.05, 0.05, 0.05), ARC_HOT, segments=6, rings=4, mat=GLOW)
        for k, (t, out, up) in enumerate(((0.35, 0.32, 0.26), (0.62, 0.3, 0.3), (0.5, -0.12, 0.36))):
            a = main[1].lerp(main[2], t) if k < 2 else main[2].lerp(main[3], t)
            b = a + Vector((s * out, 0.08, up))
            hd.tube([a, a.lerp(b, 0.5) + Vector((0, 0, 0.04)), b], [0.028, 0.022, 0.016], COPPER, sides=6, mat=METAL)
            hd.blob(tuple(b + Vector((0, 0, 0.025))), (0.065, 0.065, 0.065), BRASS, segments=8, rings=5, mat=METAL)
        # a glass insulator bell at the root of each antler
        hd.lathe(tuple(base + Vector((s * 0.05, 0.01, 0.0))), [(0.07, 0), (0.1, 0.04), (0.07, 0.08), (0.1, 0.12),
                                                               (0.05, 0.16), (0.0, 0.17)], 12, INSUL, mat=GLASS)
    # ---- arms: long, jointed, riveted; fists of iron -------------------------------------
    for s, tag in ((1, '.L'), (-1, '.R')):
        a0, a1 = (M(v, s) for v in REST['Arm.L'])
        up = part('Arm' + tag, 'Arm' + tag)
        up.cyl(a0, a1, 0.15, IRON, sides=14, r2=0.12)
        up.piston(a0.lerp(a1, 0.15) + Vector((0, 0.16, 0)), a0.lerp(a1, 0.85) + Vector((0, 0.12, 0)), 0.04)
        for t in (0.3, 0.6):
            up.ring(a0.lerp(a1, t), (a1 - a0).normalized(), 0.155, 0.025, BRASS_D, sides=14)
        up.blob(tuple(a1), (0.3, 0.3, 0.3), IRON_HI, segments=12, rings=8, mat=METAL)
        f0, f1 = (M(v, s) for v in REST['Fore.L'])
        lo = part('Fore' + tag, 'Fore' + tag)
        lo.cyl(f0, f1, 0.13, IRON, sides=14, r2=0.15)
        lo.ring(f1, (f1 - f0).normalized(), 0.155, 0.03, BRASS, sides=14)
        lo.coil(tuple(f0.lerp(f1, 0.4)), tuple((f1 - f0).normalized()), 0.15, 0.24, 4, 0.016, COPPER)
        h0, h1 = (M(v, s) for v in REST['Hand.L'])
        hd_ = (h1 - h0).normalized()
        hn = part('Hand' + tag, 'Hand' + tag)
        hn.obox(tuple(h0 + hd_ * 0.14), (0.26, 0.2, 0.26), basis(hd_, (0, -1, 0)), IRON_HI, mat=METAL, bevel=0.035)
        for k in range(4):
            off = M(Vector(((k - 1.5) * 0.065, 0, 0)), s)
            kn = h0 + hd_ * 0.28 + off + Vector((0, -0.06, 0))
            hn.tube([kn, kn + hd_ * 0.07 + Vector((0, -0.04, 0)), kn + hd_ * 0.11 + Vector((0, 0.03, 0))],
                    [0.035, 0.032, 0.028], IRON, sides=6, mat=METAL)
        hn.blob(tuple(h0 + hd_ * 0.14 + Vector((0, -0.11, 0))), (0.08, 0.04, 0.08), ARC, segments=8, rings=5, mat=GLOW)
    # ---- legs: long thighs, digitigrade-free plain shins, broad iron feet ----------------
    for s, tag in ((1, '.L'), (-1, '.R')):
        t0, t1 = (M(v, s) for v in REST['Thigh.L'])
        th = part('Thigh' + tag, 'Thigh' + tag)
        th.cyl(t0, t1, 0.2, IRON, sides=14, r2=0.16)
        th.piston(t0.lerp(t1, 0.1) + Vector((0, 0.18, 0)), t0.lerp(t1, 0.9) + Vector((0, 0.15, 0)), 0.05)
        th.blob(tuple(t1), (0.32, 0.32, 0.32), IRON_HI, segments=12, rings=8, mat=METAL)
        th.disc(tuple(t1 + Vector((s * 0.15, 0, 0))), (s, 0, 0), 0.1, 0.03, BRASS, sides=12)
        k0, k1 = (M(v, s) for v in REST['Shin.L'])
        sh = part('Shin' + tag, 'Shin' + tag)
        sh.cyl(k0, k1, 0.15, IRON, sides=14, r2=0.19)
        for t in (0.35, 0.7):
            sh.ring(k0.lerp(k1, t), (k1 - k0).normalized(), 0.18, 0.025, BRASS_D, sides=14)
        sh.obox(tuple(k0.lerp(k1, 0.35) + Vector((0, -0.17, 0))), (0.24, 0.05, 0.42), basis((0, -1, 0)), BRASS,
                mat=METAL, bevel=0.015)   # a shin guard
        o0, o1 = (M(v, s) for v in REST['Foot.L'])
        ft = part('Foot' + tag, 'Foot' + tag)
        ft.obox(tuple(o0.lerp(o1, 0.45) + Vector((0, 0, -0.07))), (0.36, 0.66, 0.16), basis((0, 0, 1), (0, -1, 0)),
                IRON_HI, mat=METAL, bevel=0.04)
        for k in range(3):
            toe = o1 + Vector(((k - 1) * 0.11, -0.08, -0.05))
            ft.obox(tuple(toe), (0.1, 0.2, 0.1), basis((0, -1, 0)), IRON, mat=METAL, bevel=0.02, taper=0.7)
        ft.blob(tuple(o0 + Vector((0, 0.0, 0.0))), (0.24, 0.24, 0.24), BRASS_D, segments=10, rings=6, mat=METAL)
    # ---- the reversible plates ------------------------------------------------------------
    for name, _parent, c, n, ax, (w, ln), _half in PLATES:
        for s, tag in ((1, '.L'), (-1, '.R')):
            pt = part(name[:-2] + tag, name[:-2] + tag)
            plate_faces(pt, M(Vector(c), s), M(Vector(n), s), M(Vector(ax), s), w, ln)
    return parts


# ------------------------------------------------------------------------- clips
def make_clips(arm):
    rig = MachineRig(BONES).attach(arm)
    P = rig.pose
    clips = []

    def add(name, frames, fn, loop=True):
        anim(arm, name, frames, fn, loop)
        clips.append(name)

    head_rest = (REST['Head'][1] - REST['Head'][0]).normalized()

    def stance(root=(0, 0, 0), yaw=0.0, tilt=0.0, lean=0.0, side=0.0, twist=0.0, look=(0.0, 0.0),
               wrist_l=(1.08, -0.28, 1.36), wrist_r=(-1.08, -0.28, 1.36), hand_l=(0.1, -0.3, -1.0),
               hand_r=(-0.1, -0.3, -1.0), foot_l=(0.34, 0.02, 0.26), foot_r=(-0.34, 0.02, 0.26),
               elbow_l=(1.2, 0.8, -0.2), elbow_r=(-1.2, 0.8, -0.2)):
        rootv = Vector(root)
        rm = Matrix.Rotation(math.radians(yaw), 3, 'Z') @ Matrix.Rotation(math.radians(tilt), 3, 'X')

        def R(v):
            return rm @ Vector(v)

        def body(v):
            return tuple(rootv + R(v))

        aims = {
            'Spine': tuple(R((side * 0.3, -0.03 - lean * 0.5, 1.0))),
            'Chest': tuple(R((side * 0.5, -0.02 - lean, 1.0))),
            'Head': tuple(R(head_rest + Vector((look[0], 0.0, look[1])))),
            'Hand.L': tuple(R(hand_l)),
            'Hand.R': tuple(R(hand_r)),
            'Foot.L': (0.0, -1.0, -0.3),
            'Foot.R': (0.0, -1.0, -0.3),
        }
        turns = {'Root': [('x', tilt), ('z', yaw)], 'Spine': [('z', twist * 0.4)], 'Chest': [('z', twist * 0.6)]}
        ik = {
            'arm.L': ('Arm.L', 'Fore.L', body(wrist_l), tuple(R(elbow_l))),
            'arm.R': ('Arm.R', 'Fore.R', body(wrist_r), tuple(R(elbow_r))),
            'leg.L': ('Thigh.L', 'Shin.L', foot_l, (0.2, -1.0, 0.1)),
            'leg.R': ('Thigh.R', 'Shin.R', foot_r, (-0.2, -1.0, 0.1)),
        }
        return P(aims=aims, ik=ik, turns=turns, root=root)

    def idle(f):
        ph = math.tau * f / 72
        b = math.sin(ph)
        tw = math.sin(ph * 7) * math.sin(ph * 3)   # a crackle twitching through it
        return stance(root=(0, 0, -0.03 + 0.03 * b), look=(0.1 * math.sin(ph * 0.5), 0.03 * b + 0.04 * tw),
                      wrist_l=(1.1 + 0.03 * tw, -0.3 + 0.04 * b, 1.38 + 0.03 * b),
                      wrist_r=(-1.1, -0.28 - 0.04 * b, 1.38 + 0.03 * math.sin(ph + 1)),
                      hand_l=(0.15 + 0.2 * max(0.0, tw), -0.3, -1.0), side=0.03 * b)
    add('Idle', 72, idle)

    def stride(ph, amp, run_=False):
        sl = 0.55 * amp
        lift = 0.28 * amp
        fl = (0.34, 0.02 - sl * math.cos(ph), 0.26 + lift * max(0.0, math.sin(ph)))
        fr = (-0.34, 0.02 + sl * math.cos(ph), 0.26 + lift * max(0.0, -math.sin(ph)))
        bob = abs(math.cos(ph))
        sw = math.sin(ph)
        return stance(root=(0.04 * sw, -0.06 * amp, -0.06 - 0.08 * bob * amp), lean=0.1 + (0.16 if run_ else 0),
                      twist=-12 * sw * amp, side=0.04 * sw, foot_l=fl, foot_r=fr, look=(0.04 * sw, -0.04),
                      wrist_l=(1.06, -0.3 - 0.45 * math.cos(ph) * amp, 1.45), wrist_r=(-1.06, -0.3 + 0.45 * math.cos(ph) * amp, 1.45))
    add('Walk', 36, lambda f: stride(math.tau * f / 36, 1.0))
    add('Run', 22, lambda f: stride(math.tau * f / 22, 1.4, True))

    ready = dict(wrist_l=(1.1, -0.45, 1.6), wrist_r=(-1.1, -0.45, 1.6), hand_l=(0.0, -0.8, -0.6),
                 hand_r=(0.0, -0.8, -0.6))

    def oneshot(spec, base=None):
        tr = tracks(spec)

        def fn(f):
            kw = dict(ready)
            kw.update(base or {})
            kw.update(tr(f))
            return stance(**kw)
        return fn

    add('Backhand', 30, oneshot({
        'wrist_r': [(0, (-1.1, -0.45, 1.6)), (9, (0.35, -0.7, 2.6)), (12, (0.45, -0.6, 2.7)), (15, (-1.4, -1.2, 1.9), 'in'),
                    (17, (-1.6, -0.9, 1.8), 'back'), (30, (-1.1, -0.45, 1.6))],
        'hand_r': [(0, (0.0, -0.8, -0.6)), (9, (0.6, -0.3, 0.6)), (15, (-0.9, -0.4, 0.0), 'in'), (30, (0.0, -0.8, -0.6))],
        'twist': [(0, 0), (9, 26), (12, 28), (15, -24, 'in'), (17, -28, 'back'), (30, 0)],
        'lean': [(0, 0.0), (9, -0.06), (15, 0.16, 'in'), (30, 0.0)],
        'root': [(0, (0, 0, 0)), (15, (0, -0.1, -0.08), 'in'), (30, (0, 0, 0))],
        'look': [(0, (0.0, 0.0)), (9, (0.2, 0.05)), (15, (-0.2, -0.1)), (30, (0.0, 0.0))],
    }), loop=False)
    add('HammerFists', 34, oneshot({
        'wrist_l': [(0, (1.1, -0.45, 1.6)), (10, (0.3, -0.3, 3.7)), (14, (0.28, -0.25, 3.8)), (18, (0.25, -1.3, 1.5), 'in'),
                    (20, (0.25, -1.35, 1.4), 'back'), (34, (1.1, -0.45, 1.6))],
        'wrist_r': [(0, (-1.1, -0.45, 1.6)), (10, (-0.3, -0.3, 3.7)), (14, (-0.28, -0.25, 3.8)), (18, (-0.25, -1.3, 1.5), 'in'),
                    (20, (-0.25, -1.35, 1.4), 'back'), (34, (-1.1, -0.45, 1.6))],
        'hand_l': [(0, (0.0, -0.8, -0.6)), (10, (0.0, 0.3, 1.0)), (18, (0.0, -0.6, -0.8), 'in'), (34, (0.0, -0.8, -0.6))],
        'hand_r': [(0, (0.0, -0.8, -0.6)), (10, (0.0, 0.3, 1.0)), (18, (0.0, -0.6, -0.8), 'in'), (34, (0.0, -0.8, -0.6))],
        'lean': [(0, 0.0), (10, -0.22), (14, -0.25), (18, 0.42, 'in'), (20, 0.46, 'back'), (34, 0.0)],
        'root': [(0, (0, 0, 0)), (10, (0, 0.08, 0.08)), (18, (0, -0.2, -0.3), 'in'), (22, (0, -0.18, -0.26)),
                 (34, (0, 0, 0))],
        'look': [(0, (0.0, 0.0)), (10, (0.0, 0.25)), (18, (0.0, -0.25)), (34, (0.0, 0.0))],
    }), loop=False)
    # StaticLash (1 s, played out): the right arm cocked back, whipped through.
    add('StaticLash', 34, oneshot({
        'wrist_r': [(0, (-1.1, -0.45, 1.6)), (12, (-1.5, 0.7, 2.6), 'out'), (18, (-1.55, 0.75, 2.65)),
                    (21, (-0.2, -1.9, 2.2), 'in'), (23, (0.4, -1.6, 2.0), 'back'), (34, (-1.1, -0.45, 1.6))],
        'hand_r': [(0, (0.0, -0.8, -0.6)), (12, (-0.4, 0.8, 0.4)), (21, (0.3, -1.0, 0.0), 'in'), (34, (0.0, -0.8, -0.6))],
        'twist': [(0, 0), (12, -28), (18, -30), (21, 22, 'in'), (24, 26), (34, 0)],
        'lean': [(0, 0.0), (12, -0.1), (21, 0.22, 'in'), (34, 0.0)],
        'look': [(0, (0.0, 0.0)), (12, (-0.1, 0.05)), (21, (0.05, -0.08)), (34, (0.0, 0.0))],
        'foot_r': [(0, (-0.34, 0.02, 0.26)), (12, (-0.38, 0.25, 0.26)), (34, (-0.34, 0.02, 0.26))],
    }), loop=False)
    # FlipRattle (3 s): arms flung wide, shuddering, up on its toes as the plates turn.
    def flip(f):
        tr = tracks({
            'wrist_l': [(0, (1.1, -0.45, 1.6)), (14, (1.75, -0.3, 2.6)), (60, (1.8, -0.25, 2.7)), (72, (1.1, -0.45, 1.6))],
            'wrist_r': [(0, (-1.1, -0.45, 1.6)), (14, (-1.75, -0.3, 2.6)), (60, (-1.8, -0.25, 2.7)), (72, (-1.1, -0.45, 1.6))],
            'hand_l': [(0, (0.0, -0.8, -0.6)), (14, (1.0, -0.2, 0.3)), (72, (0.0, -0.8, -0.6))],
            'hand_r': [(0, (0.0, -0.8, -0.6)), (14, (-1.0, -0.2, 0.3)), (72, (0.0, -0.8, -0.6))],
            'lean': [(0, 0.0), (14, -0.2), (60, -0.24), (72, 0.0)],
            'look': [(0, (0.0, 0.0)), (14, (0.0, 0.35)), (60, (0.0, 0.4)), (72, (0.0, 0.0))],
            'root': [(0, (0, 0, 0)), (14, (0, 0.05, 0.12)), (60, (0, 0.05, 0.16)), (72, (0, 0, 0))],
        })(f)
        k = min(1.0, f / 10) * min(1.0, max(0.0, (72 - f) / 10))
        j = k * (math.sin(f * 2.7) * math.sin(f * 1.3))
        kw = dict(ready)
        kw.update(tr)
        kw['root'] = tuple(Vector(kw['root']) + Vector((0.02 * j, 0.015 * math.sin(f * 3.1) * k, 0.012 * math.sin(f * 4.3) * k)))
        kw['twist'] = 4 * j
        kw['side'] = 0.04 * j
        return stance(**kw)
    add('FlipRattle', 72, flip, loop=False)
    add('CallStorm', 44, oneshot({
        'wrist_l': [(0, (1.1, -0.45, 1.6)), (14, (0.75, -0.25, 3.95), 'out'), (34, (0.8, -0.2, 4.0)), (44, (1.1, -0.45, 1.6))],
        'wrist_r': [(0, (-1.1, -0.45, 1.6)), (14, (-0.75, -0.25, 3.95), 'out'), (34, (-0.8, -0.2, 4.0)), (44, (-1.1, -0.45, 1.6))],
        'hand_l': [(0, (0.0, -0.8, -0.6)), (14, (0.2, 0.0, 1.0)), (44, (0.0, -0.8, -0.6))],
        'hand_r': [(0, (0.0, -0.8, -0.6)), (14, (-0.2, 0.0, 1.0)), (44, (0.0, -0.8, -0.6))],
        'lean': [(0, 0.0), (14, -0.3), (34, -0.32), (44, 0.0)],
        'look': [(0, (0.0, 0.0)), (14, (0.0, 0.55)), (34, (0.0, 0.6)), (44, (0.0, 0.0))],
        'root': [(0, (0, 0, 0)), (14, (0, 0.06, 0.1)), (34, (0, 0.06, 0.1)), (44, (0, 0, 0))],
    }), loop=False)
    add('Discharge', 32, oneshot({
        'wrist_l': [(0, (1.1, -0.45, 1.6)), (6, (0.6, -0.7, 2.2)), (9, (1.6, 0.9, 2.3), 'snap'), (22, (1.55, 0.85, 2.2)),
                    (32, (1.1, -0.45, 1.6))],
        'wrist_r': [(0, (-1.1, -0.45, 1.6)), (6, (-0.6, -0.7, 2.2)), (9, (-1.6, 0.9, 2.3), 'snap'), (22, (-1.55, 0.85, 2.2)),
                    (32, (-1.1, -0.45, 1.6))],
        'hand_l': [(0, (0.0, -0.8, -0.6)), (9, (0.6, 0.6, 0.0), 'snap'), (32, (0.0, -0.8, -0.6))],
        'hand_r': [(0, (0.0, -0.8, -0.6)), (9, (-0.6, 0.6, 0.0), 'snap'), (32, (0.0, -0.8, -0.6))],
        'lean': [(0, 0.0), (6, 0.2), (9, -0.34, 'snap'), (22, -0.28), (32, 0.0)],
        'look': [(0, (0.0, 0.0)), (6, (0.0, -0.2)), (9, (0.0, 0.45), 'snap'), (32, (0.0, 0.0))],
        'root': [(0, (0, 0, 0)), (6, (0, -0.05, -0.1)), (9, (0, 0.15, 0.05), 'snap'), (32, (0, 0, 0))],
    }), loop=False)
    add('LaunchDrones', 32, oneshot({
        'wrist_l': [(0, (1.1, -0.45, 1.6)), (8, (1.0, -0.9, 2.2)), (12, (2.0, -0.8, 2.6), 'snap'), (24, (1.95, -0.8, 2.55)),
                    (32, (1.1, -0.45, 1.6))],
        'wrist_r': [(0, (-1.1, -0.45, 1.6)), (8, (-1.0, -0.9, 2.2)), (12, (-2.0, -0.8, 2.6), 'snap'), (24, (-1.95, -0.8, 2.55)),
                    (32, (-1.1, -0.45, 1.6))],
        'hand_l': [(0, (0.0, -0.8, -0.6)), (12, (1.0, -0.4, 0.2), 'snap'), (32, (0.0, -0.8, -0.6))],
        'hand_r': [(0, (0.0, -0.8, -0.6)), (12, (-1.0, -0.4, 0.2), 'snap'), (32, (0.0, -0.8, -0.6))],
        'lean': [(0, 0.0), (8, 0.12), (12, -0.1, 'snap'), (32, 0.0)],
    }), loop=False)
    add('Cast', 24, lambda f: stance(wrist_l=(1.2, -0.7, 2.1 + 0.05 * math.sin(math.tau * f / 24)),
                                     wrist_r=(-1.2, -0.7, 2.1 + 0.05 * math.cos(math.tau * f / 24)),
                                     hand_l=(0.4, -0.8, 0.2), hand_r=(-0.4, -0.8, 0.2), look=(0.0, 0.1)))
    add('Hit', 16, oneshot({
        'root': [(0, (0, 0, 0)), (3, (0, 0.18, 0.02), 'snap'), (16, (0, 0, 0))],
        'lean': [(0, 0.0), (3, -0.3, 'snap'), (16, 0.0)],
        'look': [(0, (0.0, 0.0)), (3, (0.15, 0.3), 'snap'), (16, (0.0, 0.0))],
        'wrist_l': [(0, (1.1, -0.45, 1.6)), (3, (1.3, 0.1, 1.9), 'snap'), (16, (1.1, -0.45, 1.6))],
        'wrist_r': [(0, (-1.1, -0.45, 1.6)), (3, (-1.3, 0.1, 1.9), 'snap'), (16, (-1.1, -0.45, 1.6))],
    }), loop=False)
    add('Death', 64, oneshot({
        'root': [(0, (0, 0, 0)), (8, (0, 0.12, 0.02)), (20, (0, -0.1, -0.6), 'in'), (24, (0, -0.12, -0.56), 'back'),
                 (44, (0, -0.4, -0.95), 'in'), (48, (0, -0.42, -0.92), 'back'), (64, (0, -0.42, -0.93))],
        'tilt': [(0, 0.0), (8, -6.0), (20, 6.0), (24, 4.0), (44, 62.0, 'in'), (48, 58.0, 'back'), (64, 59.0)],
        'lean': [(0, 0.0), (8, -0.3), (20, 0.25), (44, 0.2), (64, 0.2)],
        'look': [(0, (0.0, 0.0)), (8, (0.1, 0.45)), (20, (0.0, -0.2)), (44, (0.3, 0.1)), (64, (0.3, 0.1))],
        'foot_l': [(0, (0.34, 0.02, 0.26)), (20, (0.4, 0.45, 0.2)), (44, (0.42, 0.8, 0.15)), (64, (0.42, 0.8, 0.15))],
        'foot_r': [(0, (-0.34, 0.02, 0.26)), (14, (-0.4, 0.3, 0.3)), (20, (-0.42, 0.5, 0.2)), (44, (-0.44, 0.85, 0.15)),
                   (64, (-0.44, 0.85, 0.15))],
        'wrist_l': [(0, (1.1, -0.45, 1.6)), (8, (1.4, 0.0, 2.2)), (20, (0.9, -0.9, 1.4)), (44, (1.2, -1.4, 0.6)),
                    (64, (1.25, -1.45, 0.5))],
        'wrist_r': [(0, (-1.1, -0.45, 1.6)), (8, (-1.4, 0.0, 2.2)), (20, (-0.9, -0.9, 1.4)), (44, (-1.2, -1.4, 0.6)),
                    (64, (-1.25, -1.45, 0.5))],
    }), loop=False)
    return clips


if __name__ == '__main__':
    run('VoltaicWarden', BONES, build_parts, make_clips,
        sheet_args={'prefix': 'voltaic', 'focus': (0.4, 0.0, 2.1), 'dist': 7.5, 'scale': 2.3, 'ref_side': 2.6},
        anchors=[('Idle', 13, 'Chest', False), ('StaticLash', 21, 'Hand.R', True), ('CallStorm', 20, 'Head', True),
                 ('Discharge', 9, 'Chest', True)])
