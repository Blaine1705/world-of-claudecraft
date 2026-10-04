"""Every clip Choirmother Selthe ships, with its contact frames.

Times in seconds (24 fps). CONTACT = the frame damage or the effect lands.
She rides her pool, her tail coiled in it; the lionfish fan behind her opens
and closes slowly like breath; her hair floats.

The sim (encounters/drowned_temple/selthe.ts): melee swings (Attack, Attack2:
a raking claw, CONTACT 0.6); Sea-Song is a 1.5 s cast bar (SeaSong: arms
wide, head back, the mouth opening far too wide, the fan shivering; the song
lands on the bar's end); Tidal Slap is a 1.0 s bar on the tank (Slap: the arm
drawn back across her body, the backhand on the bar's end); the Chorus and
Solo marks are windup cues (Chorus: the Great Conch raised to her lips and
blown, the fan folding inward; Solo: one arm raised as she sings alone, the
fan flung fully open).
"""
import math

import numpy as np

import anatomy as A
import motion as M
from motion import Body, keyed, smooth, write_clip

TAU = math.tau
WALK_PERIOD, RUN_PERIOD = 2.4, 1.2
WALKREF, RUNREF = 2.5, 7.0
SONG_BAR, SLAP_BAR = 1.5, 1.0


def _n(v):
    v = np.asarray(v, float)
    return tuple(v / np.linalg.norm(v))


FAN_AX = tuple(A.FAN_N)


def fan(k=1.0, vib=0.0, phase=0.0, tilt=0.0):
    """The fan: `k` spreads the rays (under 1 folds them in), `vib` shivers
    them, `tilt` leans the whole fan back (+)."""
    out = {}
    for i, a in enumerate(A.FAN_ANG):
        out[f'Fan{i}'] = [(FAN_AX, -(k - 1.0) * a + vib * math.sin(phase + i * 1.3)), ('x', -tilt)]
    return out


def hair(lift=0.0, wave=0.0, phase=0.0, stream=0.0):
    out = {}
    for i in range(len(A.HAIR_ANG)):
        w = math.sin(phase - i * 1.1)
        out[f'Hair{i}_1'] = [('x', lift + 0.6 * w * wave - stream * 0.5), ('z', wave * math.sin(phase + i * 0.7))]
        out[f'Hair{i}_2'] = [('x', wave * 0.8 * math.sin(phase - i * 1.1 - 0.9) - stream * 0.3)]
    return out


def fluke(wave=0.0, phase=0.0):
    n = len(A.TAIL_CHAIN)
    return {f'Tail{n}': [('z', wave * math.sin(phase))], f'Tail{n - 1}': [('z', wave * 0.4 * math.sin(phase - 0.8))]}


def fins(spread=0.0, swing=0.0, wave=0.0, phase=0.0):
    return {'L_Fin1': [('y', -spread), ('x', -swing + wave * math.sin(phase))],
            'R_Fin1': [('y', spread), ('x', -swing + wave * math.sin(phase + 1.3))]}


def look(*parts):
    out = {}
    for d in parts:
        out.update(d)
    return out


ARMS = dict(hand_l=(0.5, -0.24, 2.98), hand_r=(-0.5, -0.24, 2.98), pole_l=(1.0, 0.6, -0.4), pole_r=(-1.0, 0.6, -0.4),
            hand_dir_l=_n((-0.2, -0.55, -0.8)), hand_dir_r=_n((0.2, -0.55, -0.8)), hand_roll_l=-20.0,
            hand_roll_r=-20.0, fist_l=0.2, fist_r=0.2, spread_l=0.3, spread_r=0.3)


def stance(rig):
    return Body(rig, pelvis=(0.0, 0.0, 0.0), lean=-2, neck=4, look=(0, -6), head_roll=2, clav_l=-2, clav_r=-2,
                scale=dict(A.HIDDEN), **ARMS)


def _conch(b, lift):
    """The Great Conch raised from her chest to her lips (lift 0 to 1)."""
    ex = dict(b.p['extra'])
    off = dict(b.p['offset'] or {})
    ex['Conch'] = [('x', 105 * lift), ('z', -20 * lift)]
    off['Conch'] = (0.0, -0.08 * lift, 0.95 * lift)
    return b.but(extra=ex, offset=off)


def idle(rig, period=4.0):
    st = stance(rig)

    def fn(t):
        u = TAU * t / period
        s1, s2 = math.sin(u), math.sin(2 * u)
        return st.but(pelvis=(0.02 * s1, 0.0, 0.03 * math.sin(u - 0.4)), side=-1.6 * s1, lean=-2 + 1.2 * s2,
                      look=(6 * s1, -6 + 2 * s2), head_roll=2 + 3 * s1, clav_l=-2 + 1.5 * s2, clav_r=-2 + 1.5 * s2,
                      extra=look(fan(1.0 + 0.05 * s1, 1.0, u), hair(6 + 4 * s2, 8, u), fluke(12, u),
                                 fins(4, 0, 6, u)))
    return fn


def glide(rig, period, run=False):
    st = stance(rig)
    base = st.but(lean=12 if run else 5, neck=2, look=(0, 4 if run else -2),
                  hand_l=(0.55, 0.15, 2.9), hand_r=(-0.55, 0.15, 2.9), hand_dir_l=_n((0.1, 0.6, -0.8)),
                  hand_dir_r=_n((-0.1, 0.6, -0.8)))

    def fn(t):
        ph = (t / period) % 1.0
        u = TAU * ph
        return base.but(pelvis=(0.02 * math.sin(u), 0.0, 0.04 * math.sin(2 * u)), side=2 * math.sin(u),
                        extra=look(fan(0.88 if run else 0.94, 1.5, u, tilt=10 if run else 4),
                                   hair(2, 6, u, 30 if run else 14), fluke(18 if run else 12, u),
                                   fins(6, -(22 if run else 10), 8, u)))
    return fn


def _claw(rig, side):
    st = stance(rig)
    s = 1 if side == 'L' else -1
    hk = 'hand_l' if s > 0 else 'hand_r'
    dk = 'hand_dir_l' if s > 0 else 'hand_dir_r'
    rk = 'hand_roll_l' if s > 0 else 'hand_roll_r'
    sp = 'spread_l' if s > 0 else 'spread_r'
    draw = st.but(twist=-22 * s, lean=-6, look=(-10 * s, 8), **{hk: (0.85 * s, 0.25, 4.0), dk: _n((0.3 * s, 0.2, 1.0)),
                                                              rk: -60.0, sp: 0.9},
                  extra=look(fan(1.08, 0, 0), hair(14), fins(10, 6)))
    rake = st.but(twist=26 * s, lean=18, look=(10 * s, -4), pelvis=(0.0, -0.18, -0.04),
                  **{hk: (-0.35 * s, -1.25, 3.0), dk: _n((-0.4 * s, -0.8, -0.4)), rk: -80.0, sp: 0.9},
                  extra=look(fan(0.96, 0, 0), hair(6, 0, 0, 20), fins(8, -14)))
    rest = st.but(extra=look(fan(), hair(6), fins(4)))
    keys = [(0.0, rest, 'inout'), (0.42, draw, 'in'), (0.6, rake, 'out'), (0.9, rake.but(lean=14), 'inout'),
            (1.4, rest, 'linear')]
    return keyed(keys), 1.4


def sea_song(rig):
    """Sea-Song (the 1.5 s bar): she draws breath, throws her arms wide and
    her head back, her mouth opening far too wide; the fan flares and shivers;
    the song bursts from her on the bar's end (1.5); recovered 2.1."""
    st = stance(rig)
    T = SONG_BAR
    breath = st.but(lean=4, neck=8, look=(0, -10), hand_l=(0.3, -0.3, 3.3), hand_r=(-0.3, -0.3, 3.3),
                    hand_dir_l=_n((-0.6, -0.4, 0.6)), hand_dir_r=_n((0.6, -0.4, 0.6)), jaw=4)
    sing = st.but(lean=-14, neck=-8, look=(0, 30), pelvis=(0.0, 0.05, 0.1), hand_l=(1.05, -0.2, 3.9),
                  hand_r=(-1.05, -0.2, 3.9), pole_l=(1.0, 0.3, -0.5), pole_r=(-1.0, 0.3, -0.5),
                  hand_dir_l=_n((0.7, -0.3, 0.4)), hand_dir_r=_n((-0.7, -0.3, 0.4)), hand_roll_l=-100,
                  hand_roll_r=-100, spread_l=0.9, spread_r=0.9, fist_l=0.0, fist_r=0.0, clav_l=10, clav_r=10, jaw=38)
    keys = [(0.0, st, 'inout'), (0.35, breath, 'inout'), (0.85, sing, 'out'), (T, sing.but(jaw=42), 'linear'),
            (1.75, sing.but(jaw=30, lean=-10), 'inout'), (2.1, st, 'linear')]
    seq = keyed(keys)

    def fn(t):
        b = seq(t)
        o = smooth((t - 0.5) / 0.4) * (1 - smooth((t - 1.6) / 0.5))
        return b.but(extra=look(fan(1.0 + 0.1 * o, 4.0 * o, TAU * t / 0.16), hair(6 + 24 * o, 8, TAU * t / 0.9),
                                fins(4 + 14 * o, 0, 8, TAU * t), fluke(16 * o, TAU * t / 0.5)))
    return fn, 2.1


def slap(rig):
    """Tidal Slap (the 1.0 s bar): her right arm drawn back across her body,
    her tail flexing in the pool; the backhand swept through the tank on the
    bar's end (CONTACT 1.0); recovered 1.6."""
    st = stance(rig)
    T = SLAP_BAR
    coil = st.but(twist=30, lean=4, look=(14, 2), pelvis=(0.0, 0.08, -0.02), hand_r=(0.5, -0.35, 3.75),
                  pole_r=(-1.0, -0.2, 0.6), hand_dir_r=_n((0.8, 0.1, 0.4)), hand_roll_r=-20, spread_r=0.6,
                  extra=look(fan(1.06, 0, 0, tilt=4), hair(10), fins(10, 8)))
    hit = st.but(twist=-34, lean=16, look=(-14, -2), pelvis=(0.0, -0.2, -0.04), hand_r=(-1.3, -1.0, 3.3),
                 pole_r=(-1.0, 0.4, 0.2), hand_dir_r=_n((-0.9, -0.4, 0.0)), hand_roll_r=-60, spread_r=0.8,
                 extra=look(fan(0.95, 0, 0, tilt=-6), hair(4, 0, 0, 24), fins(8, -14)))
    keys = [(0.0, st, 'inout'), (0.75, coil, 'in'), (0.88, coil.but(twist=34), 'in'), (T, hit, 'out'),
            (1.25, hit.but(twist=-30), 'inout'), (1.6, st, 'linear')]
    return keyed(keys), 1.6


def chorus(rig):
    """The Chorus mark: she lifts the Great Conch to her lips in both hands
    and blows (0.6 to 1.7), the fan folding inward around her; lowered by 2.2."""
    st = stance(rig)
    blow = st.but(lean=-6, neck=-4, look=(0, 10), hand_l=(0.16, -0.46, 4.08), hand_r=(-0.16, -0.46, 4.08),
                  pole_l=(1.0, -0.2, -0.4), pole_r=(-1.0, -0.2, -0.4), hand_dir_l=_n((-0.6, -0.4, 0.6)),
                  hand_dir_r=_n((0.6, -0.4, 0.6)), hand_roll_l=-40, hand_roll_r=-40, fist_l=0.6, fist_r=0.6, jaw=6)
    keys = [(0.0, st, 'inout'), (0.55, blow, 'out'), (1.7, blow.but(lean=-9, look=(0, 14)), 'inout'),
            (2.2, st, 'linear')]
    seq = keyed(keys)

    def fn(t):
        b = seq(t)
        lift = smooth(t / 0.55) * (1 - smooth((t - 1.75) / 0.45))
        f = smooth((t - 0.3) / 0.5) * (1 - smooth((t - 1.7) / 0.5))
        b = b.but(extra=look(fan(1.0 - 0.45 * f, 1.5 * f, TAU * t / 0.3, tilt=-8 * f), hair(6, 6, TAU * t / 1.2),
                             fins(4, 0, 6, TAU * t)))
        return _conch(b, lift)
    return fn, 2.2


def solo(rig):
    """The Solo mark: she sings alone, her left arm raised high, head tilted,
    the fan flung fully open; down by 2.2."""
    st = stance(rig)
    sing = st.but(lean=-8, side=6, look=(10, 22), head_roll=-10, hand_l=(0.55, -0.25, 4.9), pole_l=(1.0, 0.2, 0.2),
                  hand_dir_l=_n((0.1, -0.2, 1.0)), hand_roll_l=-80, spread_l=1.0, fist_l=0.0,
                  hand_r=(-0.6, -0.4, 3.2), hand_dir_r=_n((0.4, -0.7, 0.2)), hand_roll_r=-60, jaw=30)
    keys = [(0.0, st, 'inout'), (0.5, sing, 'out'), (1.7, sing.but(jaw=24, look=(12, 26)), 'inout'),
            (2.2, st, 'linear')]
    seq = keyed(keys)

    def fn(t):
        b = seq(t)
        f = smooth(t / 0.5) * (1 - smooth((t - 1.7) / 0.5))
        return b.but(extra=look(fan(1.0 + 0.16 * f, 1.0 * f, TAU * t / 0.4, tilt=6 * f), hair(6 + 18 * f, 8, TAU * t),
                                fins(4 + 12 * f, 0, 6, TAU * t)))
    return fn, 2.2


def cast(rig, period=2.4):
    st = stance(rig)
    up = st.but(lean=-6, look=(0, 16), hand_l=(0.4, -0.45, 3.6), hand_r=(-0.4, -0.45, 3.6),
                hand_dir_l=_n((-0.5, -0.6, 0.6)), hand_dir_r=_n((0.5, -0.6, 0.6)), jaw=8)

    def fn(t):
        u = TAU * t / period
        return up.but(look=(3 * math.sin(u), 16 + 2 * math.sin(2 * u)),
                      extra=look(fan(1.04, 1.5, u), hair(10, 7, u), fluke(10, u), fins(6, 0, 5, u)))
    return fn


def hit(rig):
    st = stance(rig)
    jolt = st.but(lean=-9, twist=10, pelvis=(0.0, 0.14, 0.02), look=(-8, 12), head_roll=-10, jaw=10,
                  extra=look(fan(0.9, 0, 0, tilt=6), hair(14, 0, 0, -12), fins(12, 10)))
    rest = st.but(extra=look(fan(), hair(6), fins(4)))
    keys = [(0.0, rest, 'out'), (0.12, jolt, 'out'), (0.3, jolt.but(lean=-4), 'inout'), (0.62, rest, 'linear')]
    return keyed(keys), 0.62


def death(rig):
    """A last cry (mouth wide), the fan folds shut like a closing hand (0.3 to
    1.4), and she sinks into her pool and is gone (1.0 to 3.2), the Great
    Conch left lying at the pool's edge, still glowing."""
    st = stance(rig)
    cry = st.but(lean=-16, neck=-10, look=(0, 30), pelvis=(0, 0.08, 0.05), jaw=40, hand_l=(0.9, -0.1, 3.8),
                 hand_r=(-0.9, -0.1, 3.8), spread_l=0.9, spread_r=0.9, fist_l=0.0, fist_r=0.0)
    sag = st.but(lean=26, neck=24, look=(4, -24), head_roll=12, pelvis=(0, -0.04, -0.9), jaw=8,
                 hand_l=(0.5, -0.3, 2.0), hand_r=(-0.5, -0.3, 2.0), hand_dir_l=_n((0.1, 0.0, -1.0)),
                 hand_dir_r=_n((-0.1, 0.0, -1.0)))
    gone = sag.but(lean=10, pelvis=(0, -0.05, -4.6), hand_l=(0.5, -0.3, 2.0 - 3.7), hand_r=(-0.5, -0.3, 2.0 - 3.7))
    keys = [(0.0, st, 'out'), (0.3, cry, 'inout'), (1.2, sag, 'in'), (3.0, gone, 'out'), (3.4, gone, 'hold')]
    seq = keyed(keys)

    def fn(t):
        b = seq(t)
        f = smooth((t - 0.3) / 1.1)
        sc = dict(b.p['scale'])
        out = t >= 1.0
        sc['Conch'] = 0.0 if out else 1.0
        sc['ConchFree'] = 1.0 if out else 0.0
        melt = 1.0 - 0.95 * smooth((t - 1.6) / 1.2)
        for ch in A.HAIR_CHAINS:
            sc[ch[0]] = melt
        pv = b.p['pelvis']
        u = smooth((t - 1.0) / 0.4)
        off = {'ConchFree': (-pv[0] + 0.35 * u, -pv[1] - 0.9 * u, -pv[2] - (A.CONCH_AT[2] - 0.14) * u),
               'Pool': (-pv[0], -pv[1], -pv[2])}
        ex = look(fan(1.0 - 0.85 * f, 0, 0, tilt=-10 * f), hair(6), fins(4))
        ex['ConchFree'] = [('y', 70 * u), ('x', 30 * u)]
        return b.but(scale=sc, offset=off, extra=ex)
    return fn, 3.4


CATALOG = [
    ('Idle', lambda r: (idle(r), 4.0), True),
    ('Walk', lambda r: (glide(r, WALK_PERIOD), WALK_PERIOD), True),
    ('Run', lambda r: (glide(r, RUN_PERIOD, run=True), RUN_PERIOD), True),
    ('Attack', lambda r: _claw(r, 'R'), False),
    ('Attack2', lambda r: _claw(r, 'L'), False),
    ('Cast', lambda r: (cast(r), 2.4), True),
    ('SeaSong', sea_song, False),
    ('Slap', slap, False),
    ('Chorus', chorus, False),
    ('Solo', solo, False),
    ('Hit', hit, False),
    ('Death', death, False),
]


def _floor(f):
    """The pool rides the Root (which carries the pelvis): hold it on the floor."""
    def g(t):
        b = f(t)
        pv = b.p['pelvis']
        off = dict(b.p['offset'] or {})
        off.setdefault('Pool', (-pv[0], -pv[1], -pv[2]))
        return b.but(offset=off)
    return g


def make_clips(arm, only=None):
    import rig as R
    rig = R.Rig(arm)
    names = []
    for name, fn, loop in CATALOG:
        if only and name not in only:
            continue
        f, dur = fn(rig)
        f = _floor(f)
        M.STATEFUL_IK = False
        write_clip(arm, rig, name, f, dur, loop=loop,
                   wind=(WALKREF if name == 'Walk' else RUNREF if name == 'Run' else 0.0))
        names.append(name)
        print('CLIP', name, dur, flush=True)
    return names
