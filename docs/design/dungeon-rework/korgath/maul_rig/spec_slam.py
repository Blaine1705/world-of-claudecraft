"""HammerSlam: Korgath's two-handed overhead smash (1.5 s, contact frame 18 = f17).

Beats (30 fps):
  f0   Idle (the maul hangs at his right side, the right fist in its modeled grip)
  f6   gather: the maul swung across his body, head low to his right; the left
       hand closes on the haft by the pommel (weight dips, a counter-turn left)
  f11  the hoist: both hands drive the maul up over his right shoulder, head
       behind him; chest coils right, he rises
  f12-13 the hang at the top: the right hand lets go and takes the haft again
       turned end for end (head on the thumb side) while the left holds it
  f14-17 the smash: hips and chest lead, knees bend, the right hand slides down
       the haft to the left one; the head meets the terrace at f17
  f17-21 impact hold, the body sinks after the blow
  f21-30 the haul back up, the maul across his front
  f30-33 the right hand turns back to its carrying grip
  f36-45 the maul lowered to his side, the left hand back to Idle
"""
import math
from mathutils import Vector
import kclip

V = Vector


def key_from_hands(L, D, N=None):
    """The maul with the left fist (haft y = 0) at L and the haft toward the head along D."""
    D = V(D).normalized()
    if N is None:
        N = D.cross(V((1, 0, 0)))
        if N.length < 1e-3:
            N = D.cross(V((0, 1, 0)))
    return (V(L), D, V(N).normalized())


def build(rig):
    H0 = rig.P0['hammer']
    P0 = H0 @ V((0, 0, 0))
    D0 = (H0.to_3x3() @ V((0, 1, 0))).normalized()
    N0 = (H0.to_3x3() @ V((1, 0, 0))).normalized()
    idle = (P0, D0, N0)
    # anticipation: the hanging maul swings a little back as he dips
    fist = P0 + D0 * (0.42 * rig.S)
    D3 = (D0 + V((0.0, 0.3, 0.0))).normalized()
    ante = (fist - D3 * (0.42 * rig.S) + V((0, 0, -0.12)), D3, N0)
    U = 5.5  # yd per hammer unit (rig.S)
    gather = key_from_hands((0.27, -0.82, 7.95), (-0.55, -0.25, -0.8))
    rise = key_from_hands((0.05, -0.5, 8.8), (-0.85, 0.25, 0.3))
    top = key_from_hands((-0.4, -0.4, 9.2), (-0.25, 0.83, 0.48))
    load = key_from_hands((-0.45, -0.3, 9.3), (-0.22, 0.87, 0.42))
    over = key_from_hands((-0.25, -1.3, 8.6), (-0.05, -0.45, 0.89))
    front = key_from_hands((-0.25, -2.0, 7.2), (0.0, -0.98, 0.17))
    impact = key_from_hands((-0.3, -2.11, 5.48), (0.0, -0.766, -0.643))
    bounce = key_from_hands((-0.3, -2.08, 5.6), (0.0, -0.78, -0.62))
    haul = key_from_hands((0.05, -1.6, 6.6), (-0.35, -0.65, -0.68))
    port = key_from_hands((0.25, -1.1, 7.6), (-0.55, -0.35, -0.76))
    spec = {
        'length': 45,
        'maul': {0: idle, 3: ante, 6: gather, 9: rise, 11: top, 13: load, 15: over, 16: front, 17: impact,
                 19: bounce, 21: impact, 28: haul, 33: port, 37: gather, 42: idle, 45: idle},
        'maul_ease': {6: 'io', 9: 'in', 11: 'out', 13: 'io', 15: 'in', 16: 'lin', 17: 'lin', 19: 'out', 21: 'io',
                      28: 'io', 33: 'io', 37: 'io', 42: 'io'},
        'body': {
            0: {},
            3: {'hips': (0, 0, -0.12, 0, 0, 3), 'spine': (3, 0, 3), 'chest': (3, 0, 4)},
            6: {'hips': (0, -0.1, -0.3, 2, 0, 6), 'spine': (5, 0, 6), 'chest': (6, 0, 8), 'neck': (-4, 0, -4)},
            11: {'hips': (-0.25, 0.35, 0.08, -3, 0, -10), 'spine': (-4, 0, -9), 'chest': (-8, 3, -12), 'neck': (6, 0, 8), 'head': (4, 0, 4)},
            14: {'hips': (-0.3, 0.4, 0.1, -4, 0, -12), 'spine': (-6, 0, -10), 'chest': (-10, 4, -14), 'neck': (8, 0, 10), 'head': (5, 0, 5)},
            15: {'hips': (-0.1, 0.05, -0.1, 3, 0, -2), 'spine': (3, 0, -2), 'chest': (1, 1, -3), 'neck': (-1, 0, 1)},
            16: {'hips': (0.08, -0.25, -0.45, 8, 0, 2), 'spine': (10, 0, 1), 'chest': (10, -1, 2), 'neck': (-10, 0, -1), 'head': (-6, 0, 0)},
            17: {'hips': (0.15, -0.45, -0.8, 12, 0, 4), 'spine': (16, 0, 3), 'chest': (18, -2, 4), 'neck': (-16, 0, -2), 'head': (-10, 0, 0)},
            21: {'hips': (0.15, -0.5, -0.92, 13, 0, 4), 'spine': (17, 0, 3), 'chest': (19, -2, 4), 'neck': (-17, 0, -2), 'head': (-10, 0, 0)},
            30: {'hips': (0, -0.15, -0.3, 4, 0, 5), 'spine': (6, 0, 5), 'chest': (7, 0, 6), 'neck': (-5, 0, -3)},
            38: {'hips': (0, -0.05, -0.12, 1, 0, 3), 'spine': (3, 0, 3), 'chest': (3, 0, 3)},
            45: {},
        },
        'body_ease': {3: 'io', 6: 'io', 11: 'out', 14: 'io', 15: 'io', 16: 'lin', 17: 'lin', 21: 'out', 30: 'io', 38: 'io', 45: 'io'},
        'right': [(0, 11, ('carry', 0.42, 0.0)), (12, 13, ('free', V((-0.15, -0.1, 0.15)))),
                  (14, 29, ('flip', {13: 0.40, 15: 0.26, 16: 0.21, 17: 0.18, 22: 0.18, 29: 0.26}, 'auto')), (30, 32, ('free', V((-0.35, -0.2, 0.2)))),
                  (33, 45, ('carry', 0.42, 0.0))],
        'left': [(0, 5, ('free', V((0.0, -0.4, 0.2)))), (6, 39, ('grip', 0.0, 'auto', 'head')),
                 (40, 45, ('free', V((0.2, -0.2, 0.0))))],
        'pole_r': {0: 'idle', 3: 'idle', 6: V((-1, 0.4, -0.6)), 11: V((-1, -0.3, -0.2)), 14: V((-1, -0.2, -0.3)),
                   17: V((-1, 0.2, -0.3)), 30: V((-1, 0.3, -0.5)), 42: 'idle', 45: 'idle'},
        'pole_l': {0: 'idle', 2: 'idle', 6: V((0.8, 0.2, -1)), 11: V((0.6, -0.6, -0.8)), 14: V((0.6, -0.5, -0.8)),
                   17: V((1, 0.2, -0.6)), 30: V((1, 0.2, -0.8)), 43: 'idle', 45: 'idle'},
        'sheet': [0, 6, 9, 11, 13, 15, 16, 17, 21, 28, 33, 39],
    }
    return {'HammerSlam': spec}
