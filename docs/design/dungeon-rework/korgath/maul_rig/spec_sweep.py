"""HammerSweep: Korgath's two-handed flat sweep, his right to his left (1.5 s,
contact frame 18 = f17: the head crosses his front).

Beats (30 fps):
  f0   Idle
  f6   gather: the maul across his body, the left hand on the haft by the pommel
  f11  the load: the maul hauled back over his right shoulder, flat, the head
       far out behind him; hips and chest coil right, weight on the right foot
  f12-13 the right hand turns end for end on the haft at the top of the load
  f14-17 the sweep: the hips fire first, then the chest, then the arms; the
       head comes round his right side low and crosses his front at f17
  f17-22 follow-through to his left, the body wound left, the head rising
  f22-26 the maul's weight stops him; he settles
  f26-30 the maul brought back across his front
  f30-33 the right hand back to its carrying grip
  f36-45 the maul lowered to his side, the left hand back to Idle
"""
from mathutils import Vector
from spec_slam import key_from_hands

V = Vector


def build(rig):
    H0 = rig.P0['hammer']
    idle = (H0 @ V((0, 0, 0)), (H0.to_3x3() @ V((0, 1, 0))).normalized(), (H0.to_3x3() @ V((1, 0, 0))).normalized())
    P0, D0, N0 = idle
    fist = P0 + D0 * (0.42 * rig.S)
    D3 = (D0 + V((0.0, 0.3, 0.0))).normalized()
    ante = (fist - D3 * (0.42 * rig.S) + V((0, 0, -0.12)), D3, N0)
    def sk(L, D):
        return key_from_hands(L, D, V((0, 0, 1)).cross(V(D).normalized()))
    gather = key_from_hands((0.27, -0.82, 7.95), (-0.55, -0.25, -0.8))
    lift = sk((0.05, -0.55, 8.6), (-0.8, 0.25, -0.5))
    load = sk((-0.55, -0.5, 8.6), (-0.4, 0.62, 0.68))
    load2 = sk((-0.65, -0.35, 8.65), (-0.38, 0.68, 0.63))
    side = sk((-0.6, -1.1, 7.6), (-0.9, 0.3, -0.3))
    front_r = sk((-0.35, -1.75, 6.3), (-0.55, -0.72, -0.42))
    contact = sk((0.2, -2.0, 5.85), (0.12, -0.9, -0.42))
    through = sk((0.75, -1.6, 6.5), (0.85, -0.45, -0.18))
    stop = sk((0.55, -1.45, 6.9), (0.82, 0.1, 0.05))
    settle = sk((0.5, -1.5, 6.6), (0.78, -0.05, -0.55))
    back = key_from_hands((0.35, -1.5, 7.0), (-0.2, -0.75, -0.63))
    port = key_from_hands((0.25, -1.1, 7.6), (-0.55, -0.35, -0.76))
    spec = {
        'length': 45,
        'maul': {0: idle, 3: ante, 6: gather, 9: lift, 11: load, 13: load2, 15: side, 16: front_r, 17: contact,
                 20: through, 23: stop, 26: settle, 30: back, 33: port, 37: gather, 42: idle, 45: idle},
        'maul_ease': {6: 'io', 9: 'in', 11: 'out', 13: 'io', 15: 'in', 16: 'lin', 17: 'lin', 20: 'out',
                      23: 'out', 26: 'io', 30: 'io', 33: 'io', 37: 'io', 42: 'io'},
        'body': {
            0: {},
            3: {'hips': (0, 0, -0.12, 0, 0, 4), 'spine': (3, 0, 3), 'chest': (3, 0, 4)},
            6: {'hips': (0, -0.1, -0.3, 2, 0, 6), 'spine': (5, 0, 6), 'chest': (6, 0, 8), 'neck': (-4, 0, -4)},
            11: {'hips': (-0.35, 0.25, -0.05, 0, 2, -20), 'spine': (-2, 2, -14), 'chest': (-4, 4, -20), 'neck': (4, 0, 18), 'head': (2, 0, 10)},
            14: {'hips': (-0.4, 0.3, -0.1, 0, 3, -23), 'spine': (-2, 3, -16), 'chest': (-5, 5, -23), 'neck': (4, 0, 20), 'head': (2, 0, 11)},
            15: {'hips': (-0.15, 0.0, -0.3, 3, 1, -4), 'spine': (2, 2, -10), 'chest': (2, 3, -14), 'neck': (0, 0, 14), 'head': (0, 0, 8)},
            16: {'hips': (0.05, -0.15, -0.45, 6, 0, 6), 'spine': (5, 0, -2), 'chest': (6, 0, -6), 'neck': (-4, 0, 6), 'head': (-2, 0, 4)},
            17: {'hips': (0.2, -0.25, -0.55, 8, -1, 14), 'spine': (7, -1, 6), 'chest': (8, -2, 4), 'neck': (-6, 0, -2), 'head': (-3, 0, 0)},
            20: {'hips': (0.35, -0.2, -0.45, 6, -2, 22), 'spine': (5, -2, 12), 'chest': (5, -3, 14), 'neck': (-4, 0, -10), 'head': (-2, 0, -4)},
            23: {'hips': (0.38, -0.15, -0.4, 5, -2, 24), 'spine': (4, -2, 14), 'chest': (4, -3, 17), 'neck': (-3, 0, -12), 'head': (-2, 0, -5)},
            26: {'hips': (0.32, -0.15, -0.42, 5, -2, 21), 'spine': (4, -2, 12), 'chest': (4, -3, 14), 'neck': (-3, 0, -10), 'head': (-2, 0, -4)},
            32: {'hips': (0, -0.12, -0.25, 3, 0, 5), 'spine': (5, 0, 5), 'chest': (6, 0, 6), 'neck': (-4, 0, -3)},
            38: {'hips': (0, -0.05, -0.12, 1, 0, 3), 'spine': (3, 0, 3), 'chest': (3, 0, 3)},
            45: {},
        },
        'body_ease': {3: 'io', 6: 'io', 11: 'out', 14: 'io', 15: 'in', 16: 'lin', 17: 'lin', 20: 'out', 23: 'out',
                      26: 'io', 32: 'io', 38: 'io', 45: 'io'},
        'right': [(0, 11, ('carry', 0.42, 0.0)), (12, 13, ('free', V((-0.3, -0.2, 0.3)))),
                  (14, 29, ('flip', {13: 0.38, 15: 0.3, 17: 0.24, 23: 0.22, 29: 0.26}, 'auto')),
                  (30, 32, ('free', V((-0.35, -0.2, 0.2)))), (33, 45, ('carry', 0.42, 0.0))],
        'left': [(0, 5, ('free', V((0.0, -0.4, 0.2)))), (6, 39, ('grip', 0.0, 'auto', 'head')),
                 (40, 45, ('free', V((0.2, -0.2, 0.0))))],
        'pole_r': {0: 'idle', 3: 'idle', 6: V((-1, 0.4, -0.6)), 11: V((-1, 0.2, -0.6)), 14: V((-1, 0.3, -0.5)),
                   17: V((-0.6, 0.4, -0.7)), 23: V((-0.3, 0.3, -1)), 30: V((-1, 0.3, -0.5)), 42: 'idle', 45: 'idle'},
        'pole_l': {0: 'idle', 2: 'idle', 6: V((0.8, 0.2, -1)), 11: V((0.4, -0.6, -0.8)), 14: V((0.4, -0.6, -0.8)),
                   17: V((1, 0.2, -0.6)), 23: V((1, 0.5, -0.4)), 30: V((1, 0.2, -0.8)), 43: 'idle', 45: 'idle'},
        'sheet': [0, 6, 9, 11, 13, 15, 16, 17, 20, 23, 30, 39],
    }
    return {'HammerSweep': spec}
