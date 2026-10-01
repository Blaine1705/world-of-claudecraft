"""The Foundry's human engineers (the Foundry Engineer and the Gearwright
Apprentice): one KayKit-proportioned body (a big head, a stocky torso, short
sturdy legs), a sculpted face per person and the shared posing stance.

Each engineer module (engineer.py, apprentice.py) passes a `Look` (its
proportions, palette and face) and adds its own gear and clips. Held tools are
modelled on Hand.R itself (the fist is closed round the grip), never on a bone
of their own, so a tool can never turn against the hand that holds it.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from foundry_kit import (  # noqa: E402
    BODY, BRASS, BRASS_D, GLASS, LEATHER, LEATHER_D, LENS, METAL, MachineRig, Matrix, MPart, Vector,
    expand_bones, lerp,
)

MOUTH = (0.22, 0.07, 0.06)
EYE_WHITE = (0.9, 0.88, 0.82)
SOOT = (0.12, 0.1, 0.09)


def _ss(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def _g(x):
    return math.exp(-x * x)


class Look:
    """Proportions and face of one engineer. Heights in yards, authored at
    about 2.4 tall (the VISUALS row scales them)."""

    def __init__(self, **kw):
        self.hip_z = 0.95
        self.chest_z = 1.45
        self.shoulder_x = 0.42
        self.shoulder_z = 1.68
        self.head_c = Vector((0.0, -0.08, 2.06))
        self.head_r = (0.31, 0.3, 0.32, 0.33)   # rx, ry, rz up, rz down
        self.torso_w = 1.0
        self.belly = 0.0
        self.skin = (0.86, 0.64, 0.5)
        self.skin_d = (0.64, 0.42, 0.32)
        self.cheek = (0.86, 0.52, 0.44)
        self.nose = 1.0
        self.brow = 1.0
        self.jowl = 0.1
        self.chin = 1.0
        self.soot = 0.0
        self.eye_phi = 0.3
        self.eye_t = 0.12
        self.eye_r = 0.07
        self.mouth_t = -0.38
        self.freckles = 0.0
        self.__dict__.update(kw)


def bones(look):
    L = look
    hz, cz, sx, sz = L.hip_z, L.chest_z, L.shoulder_x, L.shoulder_z
    hc = L.head_c
    return expand_bones([
        ('Root', None, (0, 0, 0), (0, 0, 0.3)),
        ('Hips', 'Root', (0, 0, hz), (0, 0, hz + 0.2)),
        ('Spine', 'Hips', (0, 0, hz + 0.2), (0, 0.02, cz)),
        ('Chest', 'Spine', (0, 0.02, cz), (0, 0.03, sz + 0.07)),
        ('Neck', 'Chest', (0, -0.02, sz + 0.07), (0, -0.04, hc.z - 0.2)),
        ('Head', 'Neck', (0, -0.04, hc.z - 0.2), (0, -0.06, hc.z + 0.2)),
        ('Jaw', 'Head', (0, hc.y - 0.02, hc.z - 0.14), (0, hc.y - 0.24, hc.z - 0.22)),
        ('Pack', 'Chest', (0, 0.36, cz - 0.05), (0, 0.38, cz + 0.35)),
        ('Arm.L', 'Chest', (sx, 0.02, sz), (sx + 0.2, 0.0, sz - 0.36)),
        ('Fore.L', 'Arm.L', (sx + 0.2, 0.0, sz - 0.36), (sx + 0.26, -0.12, sz - 0.7)),
        ('Hand.L', 'Fore.L', (sx + 0.26, -0.12, sz - 0.7), (sx + 0.28, -0.16, sz - 0.86)),
        ('Thigh.L', 'Hips', (0.2, 0.0, hz), (0.22, 0.0, hz * 0.55)),
        ('Shin.L', 'Thigh.L', (0.22, 0.0, hz * 0.55), (0.22, 0.03, 0.15)),
        ('Foot.L', 'Shin.L', (0.22, 0.03, 0.15), (0.22, -0.26, 0.05)),
    ])


def face_fn(look):
    L = look
    rx, ry, rzu, rzd = L.head_r

    def point(phi, theta):
        ct = math.cos(theta)
        u = Vector((math.sin(phi) * ct, -math.cos(phi) * ct, math.sin(theta)))
        rz = rzu if u.z > 0 else rzd
        p0 = Vector((u.x * rx, u.y * ry, u.z * rz))
        p0.x *= 1.0 + L.jowl * _ss(0.0, -0.9, theta)
        n = Vector((p0.x / rx ** 2, p0.y / ry ** 2, p0.z / rz ** 2)).normalized()
        front = max(0.0, -u.y)
        ap = abs(phi)
        dr = 0.0
        tone = {'dark': 0.0, 'cheek': 0.0, 'soot': 0.0}
        dr += 0.04 * L.brow * _g((theta - 0.3) / 0.08) * _g(phi / 0.6) * front
        for s in (-1, 1):
            q = ((phi - s * L.eye_phi) * ct / 0.13) ** 2 + ((theta - L.eye_t) / 0.11) ** 2
            if q < 1.0:
                dr -= 0.035 * (1.0 - q) ** 1.2
            apple = _g((theta + 0.08) / 0.12) * _g((ap - 0.48) / 0.18) * front
            dr += 0.025 * apple
            tone['cheek'] = max(tone['cheek'], 0.5 * apple)
            nostril = _g((phi - s * 0.06) / 0.03) * _g((theta + 0.15) / 0.025) * front
            dr -= 0.015 * nostril
            tone['dark'] = max(tone['dark'], nostril * 0.8)
        nose = _g(phi / 0.09) * _g((theta + 0.02) / 0.13) * front
        tip = _g(phi / 0.11) * _g((theta + 0.1) / 0.06) * front
        dr += L.nose * (0.07 * nose + 0.06 * tip)
        tone['cheek'] = max(tone['cheek'], 0.4 * tip * L.nose)
        edge = 1.0 - _ss(0.35, 0.5, ap)
        slit = _g((theta - L.mouth_t) / 0.02) * edge * front
        dr -= 0.025 * slit
        tone['dark'] = max(tone['dark'], slit)
        dr += 0.02 * _g((theta - L.mouth_t + 0.06) / 0.04) * edge * front
        dr += 0.04 * L.chin * _g((theta + 0.72) / 0.12) * _g(phi / 0.3) * front
        tone['soot'] = L.soot * (0.5 + 0.5 * math.sin(phi * 5.0 + theta * 7.0)) * _g((theta + 0.15) / 0.5) * front
        pos = L.head_c + p0 + n * dr
        return pos, n, tone

    return point


def sculpt_face(look, head, jaw, n_phi=48, n_theta=36, split=True):
    L = look
    point = face_fn(L)
    grid = {}
    j_m = round((L.mouth_t + math.pi / 2 - 0.03) / (math.pi - 0.06) * n_theta)
    base = [-math.pi / 2 + 0.03 + (math.pi - 0.06) * j / n_theta for j in range(n_theta + 1)]
    shift = L.mouth_t - base[j_m]
    for j in range(n_theta + 1):
        for i in range(n_phi):
            phi = -math.pi + math.tau * i / n_phi
            fall = max(0.0, 1.0 - abs(j - j_m) / 4.0) * (1.0 - _ss(1.0, 1.4, abs(phi)))
            theta = base[j] + shift * fall
            grid[(i, j)] = (phi, theta) + point(phi, theta)
    made = {}

    def vert(p, i, j):
        key = (id(p), i % n_phi, j)
        v = made.get(key)
        if v is None:
            phi, theta, pos, _, tone = grid[(i % n_phi, j)]
            v = p.bm.verts.new(pos)
            col = lerp(L.skin, L.cheek, tone['cheek'])
            col = lerp(col, L.skin_d, 0.3 * max(0.0, -math.sin(theta)))
            if L.freckles > 0:
                fr = max(0.0, math.sin(phi * 41.0) * math.sin(theta * 37.0)) ** 6
                col = lerp(col, L.skin_d, L.freckles * fr * _g((theta + 0.05) / 0.2))
            col = lerp(col, SOOT, 0.55 * tone['soot'])
            col = lerp(col, MOUTH, min(1.0, tone['dark'] * 1.3))
            made[key] = v
            made[('col', v)] = col
        return v

    for part_ in (head, jaw):
        part_._before = set(part_.bm.faces)
    for j in range(n_theta):
        for i in range(n_phi):
            phi = -math.pi + math.tau * (i + 0.5) / n_phi
            p = jaw if (split and j < j_m and abs(phi) < 1.15) else head
            p.bm.faces.new((vert(p, i, j), vert(p, i + 1, j), vert(p, i + 1, j + 1), vert(p, i, j + 1)))
    head.bm.faces.new([vert(head, i, n_theta) for i in range(n_phi)])
    head.bm.faces.new(list(reversed([vert(head, i, 0) for i in range(n_phi)])))
    for part_ in (head, jaw):
        faces = part_._new_faces(part_._before)
        part_._paint(faces, L.skin, BODY)
        for f in faces:
            for lp in f.loops:
                lp[part_.col] = (*made[('col', lp.vert)], 1.0)
    return point


def eyes(look, head, point, iris=(0.25, 0.4, 0.3), lid=(0.6, 0.4, 0.3), lash=False, lid_k=1.0, lid_up=0.075):
    """Eyeballs set in the sockets, an iris and pupil, a glint, heavy upper lids."""
    L = look
    for s in (-1, 1):
        c, n = point(s * L.eye_phi, L.eye_t)[:2]
        ec = c - n * 0.012
        ec = c - n * L.eye_r * 0.45
        rot = n.to_track_quat('Z', 'Y').to_euler()
        head.blob(tuple(ec), (L.eye_r * 2, L.eye_r * 2, L.eye_r * 1.8), EYE_WHITE, segments=14, rings=10, rot=rot)
        head.blob(tuple(ec + n * L.eye_r * 0.82), (L.eye_r * 1.15, L.eye_r * 1.15, L.eye_r * 0.32), iris,
                  segments=14, rings=6, rot=rot)
        head.blob(tuple(ec + n * L.eye_r * 0.9), (L.eye_r * 0.55, L.eye_r * 0.55, L.eye_r * 0.22), (0.03, 0.03, 0.03),
                  segments=10, rings=4, rot=rot)
        head.blob(tuple(ec + n * L.eye_r * 0.95 + Vector((s * 0.012, 0, 0.016))), (0.016, 0.016, 0.01),
                  (1.0, 1.0, 1.0), segments=6, rings=4)
        # the upper lid, a little heavy, and a lash line
        pts = [point(s * (L.eye_phi + d), L.eye_t + lid_up - 2.2 * d * d)[0] + n * 0.012 for d in
               (-0.13, -0.07, 0.0, 0.07, 0.13)]
        head.tube(pts, [x * lid_k for x in (0.012, 0.022, 0.026, 0.022, 0.012)], lid, sides=6)
        if lash:
            head.tube([q + Vector((0, -0.006, -0.008)) for q in pts], [0.006, 0.009, 0.01, 0.009, 0.004],
                      (0.08, 0.05, 0.04), sides=5)


def goggles(look, part, point, at_t, phi=0.3, r=0.085, lens=LENS, pushed=False):
    """Brass goggles: over the eyes, or pushed up onto the brow (`pushed`)."""
    L = look
    for s in (-1, 1):
        c, n = point(s * phi, at_t)[:2]
        if pushed:
            n = (n + Vector((0, 0, 0.9))).normalized()
        gc = c + n * 0.04
        part.cyl(gc - n * 0.04, gc + n * 0.035, r, BRASS, sides=16)
        part.ring(gc + n * 0.035, n, r * 0.95, 0.018, BRASS_D, sides=18)
        part.disc(tuple(gc + n * 0.04), tuple(n), r * 0.8, 0.008, lens, sides=16, mat=GLASS)
        part.obox(tuple(gc + n * 0.046 + Vector((s * 0.02, 0, 0.025))), (0.03, 0.012, 0.006),
                  Matrix.Identity(3), (0.8, 0.95, 0.95), mat=GLASS)
    b = point(0.0, at_t + 0.02)
    nb = (b[1] + Vector((0, 0, 0.9))).normalized() if pushed else b[1]
    part.obox(tuple(b[0] + nb * 0.05), (0.08, 0.03, 0.03), Matrix.Identity(3), BRASS_D, mat=METAL, bevel=0.008)
    strap = [point(math.radians(x), at_t + 0.02)[0] + point(math.radians(x), at_t + 0.02)[1] * 0.02
             for x in range(40, 321, 14)]
    part.tube(strap, [0.022] * len(strap), LEATHER_D, sides=6, squash=0.5)


def M(v, s):
    return Vector((s * v.x, v.y, v.z))


def body_parts(look, part, B, shirt, shirt_d, trouser, boot, glove, sleeve_roll=0.82):
    """Torso, arms (sleeves rolled, gauntleted fists), legs and boots."""
    L = look
    REST = {n: (Vector(h), Vector(t)) for n, _, h, t in B}
    hz, cz = L.hip_z, L.chest_z
    w = L.torso_w
    ch = part('Chest', 'Chest', hard=False)
    ch.loft([((0, 0.0, cz - 0.2), 0.36 * w, 0.27, 2.2, (0, 0, 1)), ((0, 0.02, cz + 0.05), 0.42 * w, 0.3, 2.3, (0, 0, 1)),
             ((0, 0.03, L.shoulder_z - 0.02), 0.42 * w, 0.27, 2.4, (0, 0, 1)),
             ((0, 0.0, L.shoulder_z + 0.08), 0.22, 0.2, 2.2, (0, 0, 1))], shirt, sides=18)
    for s in (-1, 1):
        ch.blob((s * (L.shoulder_x - 0.04), 0.02, L.shoulder_z - 0.02), (0.3, 0.32, 0.28), shirt, segments=12,
                rings=8)
    sp = part('Waist', 'Spine', hard=False)
    sp.loft([((0, 0.0, hz + 0.05), (0.34 + L.belly * 0.5) * w, 0.25 + L.belly, 2.2, (0, 0, 1)),
             ((0, -0.02 - L.belly * 0.5, hz + 0.25), (0.36 + L.belly) * w, 0.27 + L.belly * 1.3, 2.2, (0, 0, 1)),
             ((0, 0.0, cz), 0.37 * w, 0.27, 2.2, (0, 0, 1))], shirt, sides=18)
    hp = part('Hips', 'Hips', hard=False)
    hp.loft([((0, 0.0, hz - 0.18), 0.33 * w, 0.24, 2.3, (0, 0, 1)), ((0, 0.0, hz + 0.08), 0.35 * w, 0.25, 2.3, (0, 0, 1))],
            trouser, sides=18)
    nk = part('Neck', 'Neck', hard=False)
    n0, n1 = REST['Neck']
    nk.tube([n0 - Vector((0, 0, 0.05)), n0.lerp(n1, 0.5), n1 + Vector((0, 0, 0.04))], [0.13, 0.12, 0.12], L.skin_d,
            sides=12)
    nk.tube([Vector((math.sin(a) * 0.17, -0.02 + math.cos(a) * 0.15, n0.z - 0.01)) for a in
             (i * math.tau / 16 for i in range(17))], [0.035] * 17, shirt_d, sides=6)
    for s, tag in ((1, '.L'), (-1, '.R')):
        a0, a1 = (M(v, s) for v in REST['Arm.L'])
        ad = (a1 - a0).normalized()
        up = part('Arm' + tag, 'Arm' + tag, hard=False)
        up.loft([(tuple(a0.lerp(a1, t)), r, r * 0.95, 2.1, tuple(ad)) for t, r in
                 ((0.0, 0.14), (0.25, 0.15), (0.6, 0.13), (1.0, 0.11))], shirt, sides=14)
        e1 = ad.orthogonal().normalized()
        e2 = ad.cross(e1).normalized()
        rc = a0.lerp(a1, sleeve_roll)
        up.tube([rc + (e1 * math.cos(k * math.tau / 16) + e2 * math.sin(k * math.tau / 16)) * 0.125
                 for k in range(17)], [0.04] * 17, shirt_d, sides=6, cap=False)
        f0, f1 = (M(v, s) for v in REST['Fore.L'])
        fd = (f1 - f0).normalized()
        lo = part('Fore' + tag, 'Fore' + tag, hard=False)
        lo.tube([f0.lerp(f1, t) for t in (0.0, 0.3, 0.55, 0.62, 0.85, 1.0)], [0.1, 0.115, 0.105, 0.125, 0.13, 0.125],
                [L.skin, L.skin, L.skin, glove, glove, glove], sides=12)
        lo.ring(f0.lerp(f1, 0.62), fd, 0.13, 0.02, lerp(glove, (0, 0, 0), 0.3), sides=14, mat=BODY)
        h0, h1 = (M(v, s) for v in REST['Hand.L'])
        hd = (h1 - h0).normalized()
        hand = part('Hand' + tag, 'Hand' + tag, hard=False)
        fwd = Vector((0, -1, 0))
        hand.blob(tuple(h0 + hd * 0.07), (0.17, 0.15, 0.16), glove, segments=12, rings=8)
        for k in range(4):
            off = M(Vector(((k - 1.5) * 0.038, 0, 0)), s)
            kn = h0 + hd * 0.13 + fwd * 0.05 + off
            hand.tube([kn, kn + hd * 0.04 + fwd * 0.015, kn + hd * 0.055 - fwd * 0.03, kn + hd * 0.03 - fwd * 0.06],
                      [0.025, 0.024, 0.022, 0.019], glove, sides=7)
        th = h0 + hd * 0.03 + fwd * 0.05 + M(Vector((-0.08, 0, 0)), s)
        hand.tube([th, th + hd * 0.05 + fwd * 0.03 + M(Vector((0.03, 0, 0)), s),
                   th + hd * 0.08 + fwd * 0.03 + M(Vector((0.07, 0, 0)), s)], [0.028, 0.025, 0.02], glove, sides=7)
    for s, tag in ((1, '.L'), (-1, '.R')):
        t0, t1 = (M(v, s) for v in REST['Thigh.L'])
        th = part('Thigh' + tag, 'Thigh' + tag, hard=False)
        th.tube([t0.lerp(t1, t) for t in (0, 0.4, 0.8, 1.0)], [0.17, 0.165, 0.14, 0.13], trouser, sides=12)
        k0, k1 = (M(v, s) for v in REST['Shin.L'])
        sh = part('Shin' + tag, 'Shin' + tag, hard=False)
        sh.tube([k0.lerp(k1, t) for t in (0, 0.25, 0.6, 1.0)], [0.13, 0.14, 0.15, 0.15], [trouser, boot, boot, boot],
                sides=12)
        sh.tube([k0.lerp(k1, 0.22), k0.lerp(k1, 0.16)], [0.17, 0.17], boot, sides=12)
        o0, o1 = (M(v, s) for v in REST['Foot.L'])
        ft = part('Foot' + tag, 'Foot' + tag, hard=False)
        ft.loft([(tuple(o0 + Vector((0, 0.05, -0.02))), 0.13, 0.08, 2.6, (0, -1, 0)),
                 (tuple(o0.lerp(o1, 0.6)), 0.14, 0.07, 2.6, (0, -1, 0)),
                 (tuple(o1 + Vector((0, 0.0, 0.02))), 0.12, 0.055, 2.4, (0, -1, 0))], boot, sides=12)
        ft.obox(tuple(o0.lerp(o1, 0.5) + Vector((0, -0.01, -0.06))), (0.24, 0.38, 0.03), Matrix.Identity(3),
                (0.06, 0.05, 0.05), bevel=0.008)
    return REST


def stance_fn(B, look):
    """The shared pose: the body frame (root + yaw + tilt), hand and foot IK, aims."""
    L = look
    rig_holder = {}
    REST = {n: (Vector(h), Vector(t)) for n, _, h, t in B}
    head_rest = (REST['Head'][1] - REST['Head'][0]).normalized()
    sx, sz = L.shoulder_x, L.shoulder_z
    rest_wl = (sx + 0.26, -0.15, sz - 0.72)
    rest_wr = (-(sx + 0.26), -0.15, sz - 0.72)

    def make(arm):
        rig_holder['P'] = MachineRig(B).attach(arm).pose

    def stance(root=(0, 0, 0), yaw=0.0, tilt=0.0, lean=0.0, side=0.0, twist=0.0, look=(0.0, 0.0), jaw=2.0,
               wrist_l=None, wrist_r=None, hand_l=(0.05, -0.3, -1.0), hand_r=(-0.05, -0.3, -1.0),
               foot_l=(0.22, 0.0, 0.15), foot_r=(-0.22, 0.0, 0.15), pack=0.0, extra_aims=None, extra_turns=None,
               slides=None, scales=None, roll_r=0.0, grip_r=None, grip_l=None):
        """`grip_r` / `grip_l`: (tool direction, finger hint) in the body frame: the
        hand's whole turn is set so its held tool points along the direction."""
        rootv = Vector(root)
        rm = Matrix.Rotation(math.radians(yaw), 3, 'Z') @ Matrix.Rotation(math.radians(tilt), 3, 'X')

        def R(v):
            return rm @ Vector(v)

        def body(v):
            return tuple(rootv + R(v))

        aims = {
            'Spine': tuple(R((side * 0.3, -0.04 - lean * 0.5, 1.0))),
            'Chest': tuple(R((side * 0.5, 0.03 - lean, 1.0))),
            'Head': tuple(R(head_rest + Vector((look[0], 0.0, look[1])))),
            'Hand.L': tuple(R(hand_l)),
            'Hand.R': tuple(R(hand_r)),
            'Foot.L': (0.0, -1.0, -0.3),
            'Foot.R': (0.0, -1.0, -0.3),
        }
        for k, v in (extra_aims or {}).items():
            aims[k] = tuple(R(v))
        turns = {'Root': [('x', tilt), ('z', yaw)], 'Spine': [('z', twist * 0.4)], 'Chest': [('z', twist * 0.6)],
                 'Jaw': [('x', jaw)], 'Pack': [('x', pack)]}
        for k, v in (extra_turns or {}).items():
            turns.setdefault(k, []).extend(v)
        ik = {
            'arm.L': ('Arm.L', 'Fore.L', body(wrist_l or rest_wl), tuple(R((1.2, 0.8, -0.3)))),
            'arm.R': ('Arm.R', 'Fore.R', body(wrist_r or rest_wr), tuple(R((-1.2, 0.8, -0.3)))),
            'leg.L': ('Thigh.L', 'Shin.L', foot_l, (0.3, -1.0, 0.2)),
            'leg.R': ('Thigh.R', 'Shin.R', foot_r, (-0.3, -1.0, 0.2)),
        }
        rolls = {'Hand.R': roll_r} if roll_r else None
        absolute = {}
        for tag, grip in (('.R', grip_r), ('.L', grip_l)):
            if grip is not None:
                absolute['Hand' + tag] = tool_quat(REST, tag, R(grip[0]), R(grip[1]))
                aims.pop('Hand' + tag, None)
        return rig_holder['P'](aims=aims, ik=ik, turns=turns, root=root, scales=scales or {}, slides=slides or {},
                               rolls=rolls, absolute=absolute)

    return make, stance, rest_wl, rest_wr


def grip_axis(REST, tag):
    """The rest direction a tool held in that fist points (out of the closed
    fist, forward, square to the hand bone)."""
    h0, h1 = REST['Hand' + tag]
    hd = (h1 - h0).normalized()
    g = Vector((0, -1, 0.35))
    g = (g - hd * g.dot(hd)).normalized()
    return hd, g


def tool_quat(REST, tag, want_tool, want_fingers):
    """The world turn that carries the fist's rest (hand dir, grip dir) onto a
    wanted tool direction (exact) and finger direction (as near as square)."""
    hd, g = grip_axis(REST, tag)
    w = Vector(want_tool).normalized()
    h = Vector(want_fingers)
    h = (h - w * h.dot(w))
    h = h.normalized() if h.length > 1e-4 else w.orthogonal().normalized()
    f0 = Matrix((g, hd, g.cross(hd))).transposed()
    f1 = Matrix((w, h, w.cross(h))).transposed()
    return (f1 @ f0.transposed()).to_quaternion()


def walk_cycle(stance, ph, amp, run_=False, lean=0.06, extra=None):
    sl = 0.2 * amp
    lift = 0.13 * amp
    fl = (0.22, -sl * math.cos(ph), 0.15 + lift * max(0.0, math.sin(ph)))
    fr = (-0.22, sl * math.cos(ph), 0.15 + lift * max(0.0, -math.sin(ph)))
    bob = abs(math.cos(ph))
    sw = math.sin(ph)
    kw = dict(root=(0.03 * sw * amp, -0.03 * amp, -0.02 - 0.04 * bob * amp), lean=lean + (0.12 if run_ else 0.0),
              twist=-12 * sw * amp, side=0.04 * sw, foot_l=fl, foot_r=fr, look=(0.04 * sw, -0.03), jaw=3,
              pack=3 * bob * amp)
    if extra:
        kw.update(extra(ph, amp))
    return stance(**kw)


def oneshot_fn(stance, spec, base):
    """A one-shot: `spec` tracks over `base` stance kwargs. A `grip_r` / `grip_l`
    track of (tool dir, finger hint) keys is split into two vector tracks."""
    from foundry_kit import tracks
    spec = dict(spec)
    pairs = []
    for key in ('grip_r', 'grip_l'):
        if key in spec:
            keys = spec.pop(key)
            spec[key + '_w'] = [(k[0], k[1][0]) + tuple(k[2:]) for k in keys]
            spec[key + '_h'] = [(k[0], k[1][1]) + tuple(k[2:]) for k in keys]
            pairs.append(key)
    tr = tracks(spec)

    def fn(f):
        kw = dict(base)
        kw.update(tr(f))
        for key in pairs:
            kw[key] = (kw.pop(key + '_w'), kw.pop(key + '_h'))
        return stance(**kw)
    return fn


def hair_shell(part, point, region, thick, color, color_hi, n_phi=28, n_theta=12, grooves=11.0, seed=0.0):
    """A sculpted hair mass over the face (a beard, a fringe): the head surface
    over `region` (phi0, phi1, theta_lo(phi), theta_hi(phi)) pushed out by
    `thick(phi, theta)`, closed behind, combed with grooves and streaks."""
    phi0, phi1, lo, hi = region
    rows = []
    backs = []
    before = set(part.bm.faces)
    cols = {}
    for j in range(n_theta + 1):
        row, brow = [], []
        for i in range(n_phi + 1):
            ph = phi0 + (phi1 - phi0) * i / n_phi
            t0, t1 = lo(ph), hi(ph)
            th = t0 + (t1 - t0) * j / n_theta
            p, n = point(ph, th)[:2]
            edge = math.sin(math.pi * i / n_phi) ** 0.35 * math.sin(math.pi * max(0.02, min(0.98, j / n_theta))) ** 0.3
            groove = 0.5 + 0.5 * math.sin(ph * grooves + seed + 0.6 * math.sin(th * 9.0))
            d = thick(ph, th) * edge * (0.82 + 0.18 * groove)
            v = part.bm.verts.new(p + n * (0.004 + d))
            b = part.bm.verts.new(p - n * 0.01)
            cols[v] = lerp(color, color_hi, 0.65 * groove ** 2)
            cols[b] = color
            row.append(v)
            brow.append(b)
        rows.append(row)
        backs.append(brow)
    for j in range(n_theta):
        for i in range(n_phi):
            part.bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
            part.bm.faces.new((backs[j][i], backs[j + 1][i], backs[j + 1][i + 1], backs[j][i + 1]))
    for j in range(n_theta):
        for i in (0, n_phi):
            part.bm.faces.new((rows[j][i], backs[j][i], backs[j + 1][i], rows[j + 1][i]))
    for i in range(n_phi):
        for j in (0, n_theta):
            part.bm.faces.new((rows[j][i], backs[j][i], backs[j][i + 1], rows[j][i + 1]))
    faces = part._new_faces(before)
    part._paint(faces, color, BODY)
    for f in faces:
        for lp in f.loops:
            lp[part.col] = (*cols[lp.vert], 1.0)
