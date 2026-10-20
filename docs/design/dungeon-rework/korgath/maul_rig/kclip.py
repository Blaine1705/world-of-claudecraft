"""Evaluate a Korgath maul clip spec on the control rig, bake it, report, render.

A spec (dict):
  length: frames (last frame = length)
  body: {frame: {'hips': (dx,dy,dz, rx,ry,rz), 'spine': (rx,ry,rz), 'chest':..., 'neck':...,
                 'head':..., 'clavicle.r':..., 'clavicle.l':...}}   world-axis degrees
  body_ease: {frame: ease}
  maul: {frame: (P_ref(world Vector), D(Vector toward the head), N(face Vector))}  P_ref = haft y=YREF
  maul_ease: {frame: ease}
  right: list of (frame0, frame1, state)  state = ('carry'|'flip', s, phi) or ('free', bump(Vector))
  left:  list of (frame0, frame1, state)  state = ('grip', s, phi, thumb) or ('free', bump)
  pole_r / pole_l: {frame: Vector}   elbow direction hints (world)
  feet: planted at Idle unless {frame: {'foot.l': (dx,dy,dz)}}
"""
import bpy, math, sys, os, json
import numpy as np
from mathutils import Vector, Matrix, Quaternion
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kanim
from kanim import Track, EASE, euler_deg, maul_frame

YREF = 0.0
BODY_KEYS = ('hips', 'spine', 'chest', 'neck', 'head', 'clavicle.r', 'clavicle.l')


def sval(x, f):
    if isinstance(x, dict):
        return Track(x, kind='scalar').at(f) if len(x) > 1 else list(x.values())[0]
    return x if isinstance(x, (int, float)) else 0.0


def state_at(segs, f):
    for a, b, st in segs:
        if a <= f <= b:
            return a, b, st
    return None


def evaluate(rig, spec, verbose=True, only=None):
    L = spec['length']
    bt = {k: Track({f: Vector(v.get(k, (0, 0, 0, 0, 0, 0) if k == 'hips' else (0, 0, 0))) for f, v in spec['body'].items()},
                   spec.get('body_ease')) for k in BODY_KEYS}
    mt_p = Track({f: v[0] for f, v in spec['maul'].items()}, spec.get('maul_ease'))
    mt_q = Track({f: kanim.frame_from(v[1], v[2]).to_quaternion() for f, v in spec['maul'].items()}, spec.get('maul_ease'), kind='quat')
    # quaternion continuity
    prev = None
    for i, q in enumerate(mt_q.v):
        if prev is not None and prev.dot(q) < 0: mt_q.v[i] = -q
        prev = mt_q.v[i]
    def poles(d, sd):
        return {f: (rig.idle_pole[sd].copy() if (isinstance(v, str) and v == 'idle') else v) for f, v in d.items()}
    pr = Track(poles(spec['pole_r'], 'r')); pl = Track(poles(spec['pole_l'], 'l'))
    frames = {}
    report = []
    # pass 1: grips' hand targets at hold boundaries, so free hands can travel between them
    def maul_at(f):
        P = mt_p.at(f); q = mt_q.at(f)
        return maul_frame(rig, P, q.to_matrix() @ Vector((0, 1, 0)), q.to_matrix() @ Vector((1, 0, 0)), YREF)
    def body_pose(f):
        P = {n: m.copy() for n, m in rig.P0.items()}
        h = bt['hips'].at(f)
        rig.translate(P, 'hips', Vector(h[:3]))
        rig.rotate(P, 'hips', euler_deg(h[3:]))
        for k in BODY_KEYS[1:]:
            e = bt[k].at(f)
            if any(abs(x) > 1e-6 for x in e):
                rig.rotate(P, k, euler_deg(e))
        # the apron hangs: it keeps most of its fall when the pelvis pitches,
        # and trails the hips' motion a little (secondary motion)
        hp = bt['hips'].at(f); hv = bt['hips'].at(f) - bt['hips'].at(max(0, f - 2))
        for cl, sgn in (('cloth.front.1', 1.0), ('cloth.back.1', -1.0)):
            if cl in P:
                pitch = -0.65 * hp[3] - 18.0 * hv[1] - 1.5 * hv[3]
                rig.rotate(P, cl, euler_deg((pitch, 0, -0.4 * hp[5])))
        for cl in ('cloth.front.2', 'cloth.back.2'):
            if cl in P:
                rig.rotate(P, cl, euler_deg((-12.0 * hv[1] - 1.0 * hv[3], 0, 0)))
        return P
    def val(x, f):
        if isinstance(x, dict):
            return Track(x, kind='scalar').at(f) if len(x) > 1 else list(x.values())[0]
        return x if isinstance(x, (int, float)) else 0.0
    def right_target(f, st):
        H = maul_at(f)
        return H @ rig.G_right(st[0], val(st[1], f), val(st[2], f)).inverted()
    def left_target(f, st):
        H = maul_at(f)
        return rig.hand_l_from_hammer(H, val(st[1], f), val(st[2], f), st[3] if len(st) > 3 else 'head')
    for f in (only if only is not None else range(L + 1)):
        P = body_pose(f)
        # legs: feet stay planted where Idle has them (or offset)
        for s in ('l', 'r'):
            foot = rig.P0['foot.' + s].copy()
            off = spec.get('feet', {}).get(f, {}).get('foot.' + s)
            if off: foot = Matrix.Translation(Vector(off)) @ foot
            knee_dir = rig.idle_knee[s]
            rig.ik2(P, 'upperleg.' + s, 'lowerleg.' + s, 'foot.' + s, foot.translation, knee_dir, end_rot=foot, twist_share=0.0)
        H = maul_at(f)
        # right hand
        a, b, st = state_at(spec['right'], f)
        if st[0] in ('carry', 'flip'):
            Tr = right_target(f, st)
        else:
            # free: travel from the last hold's hand to the next hold's hand
            sa = state_at(spec['right'], a - 1); sb = state_at(spec['right'], b + 1)
            ha, hb = bool(sa and sa[2][0] != 'free'), bool(sb and sb[2][0] != 'free')
            A = right_target(a - 1, sa[2]) if ha else P['hand.r'].copy()
            B = right_target(b + 1, sb[2]) if hb else P['hand.r'].copy()
            fa, fb = (a - 1 if ha else a), (b + 1 if hb else b)
            t = EASE['io']((f - fa) / max(1, fb - fa))
            pos = A.translation.lerp(B.translation, t) + st[1] * math.sin(math.pi * t)
            q = A.to_quaternion().slerp(B.to_quaternion(), t)
            Tr = Matrix.Translation(pos) @ (q.to_matrix() @ Matrix.Diagonal(A.to_scale()).to_3x3()).to_4x4()
        if verbose == 'reach':
            sh_r, sh_l = P['upperarm.r'].translation, P['upperarm.l'].translation
            print('  f%02d shoulderR %s handR %s d=%.2f' % (f, tuple(round(x, 2) for x in sh_r), tuple(round(x, 2) for x in Tr.translation), (Tr.translation - sh_r).length))
        er = rig.ik2(P, 'upperarm.r', 'lowerarm.r', 'hand.r', Tr.translation, pr.at(f), end_rot=Tr)
        # left hand
        a, b, st = state_at(spec['left'], f)
        if st[0] == 'grip':
            Tl = left_target(f, st)
        else:
            sa = state_at(spec['left'], a - 1); sb = state_at(spec['left'], b + 1)
            A = left_target(a - 1, sa[2]) if sa and sa[2][0] == 'grip' else P['hand.l'].copy()
            B = left_target(b + 1, sb[2]) if sb and sb[2][0] == 'grip' else P['hand.l'].copy()
            if not (sa and sa[2][0] == 'grip') and not (sb and sb[2][0] == 'grip'):
                Tl = P['hand.l'].copy()
            else:
                # from/to the body-carried Idle hand
                ha, hb = bool(sa and sa[2][0] == 'grip'), bool(sb and sb[2][0] == 'grip')
                if not ha: A = P['hand.l'].copy()
                if not hb: B = P['hand.l'].copy()
                fa, fb = (a - 1 if ha else a), (b + 1 if hb else b)
                t = EASE['io']((f - fa) / max(1, fb - fa))
                pos = A.translation.lerp(B.translation, t) + st[1] * math.sin(math.pi * t)
                q = A.to_quaternion().slerp(B.to_quaternion(), t)
                Tl = Matrix.Translation(pos) @ (q.to_matrix() @ Matrix.Diagonal(A.to_scale()).to_3x3()).to_4x4()
        if verbose == 'reach':
            sh_l = P['upperarm.l'].translation
            print('  f%02d shoulderL %s handL %s d=%.2f' % (f, tuple(round(x, 2) for x in sh_l), tuple(round(x, 2) for x in Tl.translation), (Tl.translation - sh_l).length))
        el = rig.ik2(P, 'upperarm.l', 'lowerarm.l', 'hand.l', Tl.translation, pl.at(f), end_rot=Tl)
        # the maul rides the right hand's bone
        P['hammer'] = H
        frames[f] = P
        # fingers (basis-level, applied after)
        rs = state_at(spec['right'], f)[2]
        ls = state_at(spec['left'], f)
        lgrip = 0.0
        if ls[2][0] == 'grip':
            lgrip = 1.0
            # close over the first 2 frames of a hold, open over the last 2 of the release
        report.append((f, round(er, 3), round(el, 3), rs[0], ls[2][0], round(wrist_cost(rig, P, 'r')), round(wrist_cost(rig, P, 'l'))))
        frames[f] = (P, rs[0] in ('carry', 'flip'), lgrip)
    if verbose:
        bad = [r for r in report if r[1] > 0.02 or r[2] > 0.02]
        print('REACH misses (frame, right, left):', [(r[0], r[1], r[2]) for r in bad] or 'none')
        print('WRIST deg r:', [r[5] for r in report])
        print('WRIST deg l:', [r[6] for r in report])
    return frames, report


def wrist_cost(rig, P, side):
    """How far the wrist is from Idle's relaxed hand-on-forearm (degrees)."""
    lo, ha = 'lowerarm.' + side, 'hand.' + side
    rel = P[lo].to_3x3().normalized().inverted() @ P[ha].to_3x3().normalized()
    rel0 = rig.rest[lo].to_3x3().normalized().inverted() @ rig.rest[ha].to_3x3().normalized()
    return math.degrees((rel0.inverted() @ rel).to_quaternion().angle)


def choose_phis(rig, spec, step=15, verbose=True):
    """Pick each hold's roll round the haft (phi=None in the spec) for the
    straightest wrists over the hold."""
    for side in ('right', 'left'):
        segs = spec[side]
        for i, (a, b, st) in enumerate(segs):
            if st[0] in ('free',):
                continue
            if st[2] == 'auto':
                keys = sorted(set([a, b] + [k for k in spec['maul'] if a < k < b]))
                cand = [float(p) for p in range(-180, 180, step)]
                lim = 30.0 if side == 'right' else 75.0
                cost = {}
                for k in keys:
                    for p in cand:
                        trial = list(st); trial[2] = p
                        segs[i] = (a, b, tuple(trial))
                        fr_eval, rep = evaluate(rig, spec, verbose=False, only=[k])
                        miss = rep[0][1] if side == 'right' else rep[0][2]
                        cost[(k, p)] = wrist_cost(rig, fr_eval[k][0], side[0]) + 300 * miss
                # Viterbi over the keys on the circle of rolls, unwrapped
                def d(p, q):
                    return abs((q - p + 180) % 360 - 180)
                best = {p: (cost[(keys[0], p)], [p]) for p in cand}
                for k in keys[1:]:
                    nb = {}
                    for q in cand:
                        opts = [(c + 0.15 * d(p, q), path) for p, (c, path) in best.items() if d(p, q) <= lim]
                        if not opts:
                            continue
                        c, path = min(opts, key=lambda x: x[0])
                        nb[q] = (c + cost[(k, q)], path + [q])
                    best = nb
                c, path = min(best.values(), key=lambda x: x[0])
                un = [path[0]]
                for q in path[1:]:
                    un.append(un[-1] + ((q - un[-1] + 180) % 360 - 180))
                phis = dict(zip(keys, un))
                trial = list(st); trial[2] = phis
                segs[i] = (a, b, tuple(trial))
                if verbose:
                    print('PHI', side, a, b, st[0], 'auto', {k: round(v) for k, v in phis.items()}, 'cost', round(c))
                continue
            if st[2] is not None:
                continue
            best = None
            for phi in range(-180, 180, step):
                trial = list(st); trial[2] = float(phi)
                segs[i] = (a, b, tuple(trial))
                fr = list(range(a, b + 1, max(1, (b - a) // 4))) + [b]
                fr_eval, _ = evaluate(rig, spec, verbose=False, only=fr)
                cost = max(wrist_cost(rig, fr_eval[f][0], side[0]) for f in fr)
                if best is None or cost < best[0]:
                    best = (cost, phi)
            trial = list(st); trial[2] = float(best[1])
            segs[i] = (a, b, tuple(trial))
            if verbose:
                print('PHI', side, a, b, st[0], 'phi', best[1], 'worst wrist %.0f deg' % best[0])


def bake(rig, frames, name, finger_ramp=2):
    arm = rig.arm
    act = bpy.data.actions.get(name)
    if act:
        act.name = name + '_old'
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.use(act)
    lg = rig.lg
    keys = sorted(frames)
    # smooth finger amounts so they close and open over a couple of frames
    rg = np.array([1.0 if frames[f][1] else 0.0 for f in keys])
    lgv = np.array([frames[f][2] for f in keys])
    def ramp(v):
        out = v.copy()
        for i in range(len(v)):
            lo, hi = max(0, i - finger_ramp), min(len(v), i + finger_ramp + 1)
            out[i] = v[lo:hi].mean()
        return out
    rg, lgv = ramp(rg), ramp(lgv)
    prevq = {}
    for i, f in enumerate(keys):
        P = frames[f][0]
        B = rig.to_basis(P)
        # right fingers: the modeled fist (rest) when holding, opened when free
        B['fingers.r'] = Matrix.Rotation(math.radians(-25.0 * (1 - rg[i])), 4, rig.fr_axis)
        # left fingers: Idle's relaxed fingers.l when free, the solved fist when gripping
        t = lgv[i]
        q_idle = rig.fl_idle.to_quaternion()
        B['fingers.l'] = Quaternion().slerp(q_idle, 1 - t).to_matrix().to_4x4()
        for fn, cs in lg['curls'].items():
            for k in range(3):
                B[f'{fn}.{k + 1}.l'] = Matrix.Rotation(cs[k] * t, 4, 'X')
        th = lg['thumb']  # (f1, ab, f2, f3)
        B['thumb.1.l'] = (Quaternion((0, 0, 1), th[1] * t) @ Quaternion((1, 0, 0), th[0] * t)).to_matrix().to_4x4()
        B['thumb.2.l'] = Matrix.Rotation(th[2] * t, 4, 'X')
        B['thumb.3.l'] = Matrix.Rotation(th[3] * t, 4, 'X')
        for n in rig.bones:
            pb = arm.pose.bones[n]
            pb.rotation_mode = 'QUATERNION'
            loc, q, sc = B[n].decompose()
            if n in prevq and prevq[n].dot(q) < 0: q = -q
            prevq[n] = q
            pb.location = loc
            pb.rotation_quaternion = q
            pb.scale = (1, 1, 1)
            pb.keyframe_insert('location', frame=f)
            pb.keyframe_insert('rotation_quaternion', frame=f)
            pb.keyframe_insert('scale', frame=f)
    for fc in act.fcurves if hasattr(act, 'fcurves') else []:
        for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'
    return act
