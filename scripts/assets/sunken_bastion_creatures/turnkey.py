"""The Gaol Turnkey: the Bastion's drowned jailer.

A bloated, sea-soaked hulk the tide left in its own gaol: a swollen belly
straining a filthy shirt under a riveted leather apron, a stud-riveted
jerkin, a rusted iron collar with the broken chain it drowned in, one eye
swollen shut and the other lit with sea light, a heavy underbite. It carries
the gaol's keys, a great ring of rusted iron keys swinging on a chain from
its right fist, a storm lantern in its left, and pairs of open shackles
dangling from its belt. Weed and barnacles everywhere. Its own rig (broad
shoulders, a hunched neck), nothing like a player body.

Clips: Idle (the keys jingling, the lantern swaying), Walk (a heavy waddle,
keys and lantern swinging with it), Run, Attack (KeySwing: the key ring
whirled overhead and brought down), Attack2 (ChainLash: the chain lashed
flat across the front, keys at full reach), LanternRaise (Open the Cells:
the lantern held high, the keys rattled, the bellow that frees the
prisoners), Cast, Hit, Death.
"""
import math

from sea_kit import (
    BARNACLE, GLOW, IRON, KELP, KELP_D, LANTERN, MOUTH, RUST, RUST_D, TOOTH, SeaBody, author_clip,
    expand_bones, loop, merge, over,
)

SKIN = (0.7, 0.79, 0.7)        # drowned fish-belly pale
SKIN_D = (0.5, 0.6, 0.52)
BRUISE = (0.46, 0.42, 0.55)
SOCKET = (0.07, 0.1, 0.1)
SEA_LIGHT = (0.45, 1.0, 0.85)
SHIRT = (0.66, 0.63, 0.52)
APRON = (0.34, 0.22, 0.14)
JERKIN = (0.28, 0.2, 0.15)
TROUSER = (0.26, 0.24, 0.22)
BOOT = (0.2, 0.14, 0.1)
BRASS = (0.72, 0.6, 0.32)
KEY_IRON = (0.6, 0.36, 0.2)
KEY_BRASS = (0.82, 0.64, 0.32)

BONES = expand_bones([
    ('Root', None, (0, 0, 0), (0, 0, 0.4)),
    ('Hips', 'Root', (0, 0, 1.0), (0, 0, 1.3)),
    ('Spine', 'Hips', (0, 0, 1.3), (0, 0, 1.75)),
    ('Chest', 'Spine', (0, 0, 1.75), (0, 0.05, 2.2)),
    ('Head', 'Chest', (0, -0.12, 2.2), (0, -0.16, 2.9)),
    ('Jaw', 'Head', (0, -0.36, 2.36), (0, -0.64, 2.28)),
    ('Arm.L', 'Chest', (0.78, 0, 2.08), (0.92, -0.02, 1.58)),
    ('Fore.L', 'Arm.L', (0.92, -0.02, 1.58), (0.98, -0.08, 1.12)),
    ('Hand.L', 'Fore.L', (0.98, -0.08, 1.12), (0.98, -0.12, 0.86)),
    ('Thigh.L', 'Hips', (0.32, 0, 1.0), (0.34, 0, 0.56)),
    ('Shin.L', 'Thigh.L', (0.34, 0, 0.56), (0.34, 0.03, 0.16)),
    ('Foot.L', 'Shin.L', (0.34, 0.03, 0.16), (0.34, -0.34, 0.05)),
    ('Shackle.L', 'Hips', (0.62, -0.28, 1.12), (0.64, -0.28, 0.76)),
    # The key ring swings on its chain from the right fist, the lantern from
    # the left.
    ('KeyChain', 'Hand.R', (-0.98, -0.12, 0.88), (-0.98, -0.12, 0.8)),
    ('Keys', 'KeyChain', (-0.98, -0.12, 0.8), (-0.98, -0.12, 0.52)),
    ('Lantern', 'Hand.L', (0.98, -0.12, 0.88), (0.98, -0.12, 0.6)),
])


def sides(fn):
    for s, tag in ((1, '.L'), (-1, '.R')):
        fn(s, tag)


def ring_pts(center, radius, plane='xz', n=18, start=0.0, span=math.tau):
    cx, cy, cz = center
    out = []
    for i in range(n + 1):
        a = start + span * i / n
        u, v = math.cos(a) * radius, math.sin(a) * radius
        out.append((cx + u, cy, cz + v) if plane == 'xz' else (cx, cy + u, cz + v) if plane == 'yz'
                   else (cx + u, cy + v, cz))
    return out


def chain(p, a, b, links, size, color=IRON):
    """A run of alternating iron links from a to b."""
    ax, ay, az = a
    bx, by, bz = b
    for k in range(links):
        t = (k + 0.5) / links
        c = (ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t)
        plane = 'xz' if k % 2 == 0 else 'yz'
        p.tube(ring_pts(c, size, plane, n=8), [size * 0.32] * 9, color, sides=4, cap=False)


def key(p, top, angle, length, color):
    """One big iron key hanging from `top`, tipped out by `angle` (radians in
    the ring's plane): the bow loop on the ring, the shaft, the toothed bit."""
    tx, ty, tz = top
    dx, dz = math.sin(angle), -math.cos(angle)
    p.tube(ring_pts((tx + dx * 0.05, ty, tz + dz * 0.05), 0.055, 'xz', n=10), [0.018] * 11, color, sides=4,
           cap=False)
    s0 = (tx + dx * 0.1, ty, tz + dz * 0.1)
    s1 = (tx + dx * length, ty, tz + dz * length)
    p.tube([s0, s1], [0.026, 0.024], color, sides=6)
    # The bit: two teeth off the end of the shaft.
    for k, w in ((0, 0.09), (1, 0.06)):
        t = length - 0.03 - k * 0.07
        c = (tx + dx * t - dz * w * 0.5, ty, tz + dz * t + dx * w * 0.5)
        p.blob(c, (0.03 + 0.02 * abs(dz), 0.018, 0.03 + 0.02 * abs(dx)), color)


def body():
    p = SeaBody('GaolTurnkey', lichen=0.0, weather=0.3)

    # ---- legs: stumpy, bowed under the weight, iron-shod boots --------------------
    def leg(s, t):
        p.on('Thigh' + t)
        p.tube([(s * 0.3, 0, 1.08), (s * 0.34, 0, 0.56)], [0.3, 0.24], TROUSER, sides=12)
        p.on('Shin' + t)
        p.tube([(s * 0.34, 0, 0.6), (s * 0.34, 0.02, 0.3)], [0.23, 0.21], TROUSER, sides=12)
        p.tube([(s * 0.34, 0.02, 0.44), (s * 0.34, 0.03, 0.12)], [0.24, 0.22], BOOT, sides=12)
        p.tube([(s * 0.34, 0.02, 0.46), (s * 0.34, 0.02, 0.4)], [0.26, 0.26], BOOT, sides=12)
        p.on('Foot' + t)
        p.blob((s * 0.34, -0.12, 0.11), (0.22, 0.36, 0.14), BOOT, flat_bottom=True)
        p.blob((s * 0.34, -0.4, 0.1), (0.16, 0.1, 0.1), IRON)

    sides(leg)
    # ---- hips, the great belly, the apron ------------------------------------------
    p.on('Hips')
    p.blob((0, 0, 1.1), (0.62, 0.46, 0.3), TROUSER)
    p.tube([(math.cos(a) * 0.66, math.sin(a) * 0.52 - 0.04, 1.24) for a in [i / 24 * math.tau for i in range(25)]],
           [0.07] * 25, APRON, sides=6, cap=False)
    p.blob((0, -0.56, 1.24), (0.14, 0.06, 0.11), BRASS)
    p.blob((0, -0.6, 1.24), (0.07, 0.03, 0.05), RUST_D)
    # The riveted leather apron hanging over the belly and thighs.
    p.blob((0, -0.62, 1.1), (0.46, 0.1, 0.5), APRON)
    for k in range(6):
        a = -0.9 + k * 0.36
        p.blob((math.sin(a) * 0.34, -0.7 + abs(math.sin(a)) * 0.08, 1.46 - abs(a) * 0.05), (0.03, 0.02, 0.03),
               BRASS)
    for k in range(4):
        x = -0.3 + k * 0.2
        p.kelp((x, -0.66, 0.9), 0.3 + 0.08 * (k % 2), (0.02, -0.03), 0.06, KELP_D)
    p.on('Spine')
    # The belly: huge, round, the shirt straining and torn over pale skin.
    p.blob((0, -0.16, 1.52), (0.74, 0.66, 0.52), SHIRT)
    p.blob((0.12, -0.74, 1.54), (0.3, 0.1, 0.24), SKIN, roll=0.2)
    p.blob((0.1, -0.83, 1.5), (0.05, 0.02, 0.05), SKIN_D)
    p.blob((-0.2, -0.72, 1.7), (0.16, 0.06, 0.1), BRUISE)
    for k in range(9):
        a = -0.6 + k * 0.15
        p.barnacle((math.sin(a) * 0.62, -0.5 - math.cos(a) * 0.22, 1.3 + (k % 3) * 0.05), (math.sin(a), -1, -0.2),
                   0.06, p.vary(BARNACLE, 0.08))
    # ---- chest: the studded jerkin, the collar and its broken chain ------------------
    p.on('Chest')
    p.blob((0, 0.02, 1.98), (0.8, 0.54, 0.4), JERKIN)
    p.blob((0, -0.36, 1.9), (0.4, 0.16, 0.28), SHIRT)
    for k in range(10):
        a = k / 10 * math.pi + 0.15
        p.blob((math.cos(a) * 0.66, -0.34 - math.sin(a) * 0.12, 2.12 - math.sin(a) * 0.1), (0.035, 0.03, 0.035),
               IRON)
    # Stiff leather pauldrons, riveted.
    for sx in (-1, 1):
        p.blob((sx * 0.72, 0.02, 2.18), (0.32, 0.36, 0.18), APRON, bulge=0.3)
        for k in range(4):
            p.blob((sx * (0.6 + k * 0.08), -0.3, 2.2 - k * 0.03), (0.03, 0.03, 0.03), BRASS)
    # The rusted iron collar and the broken chain hanging from it.
    p.tube(ring_pts((0, -0.1, 2.22), 0.4, 'xy', n=24), [0.08] * 25, RUST_D, sides=6, cap=False)
    p.blob((0, -0.5, 2.2), (0.1, 0.06, 0.1), IRON)
    chain(p, (0.02, -0.56, 2.14), (0.1, -0.64, 1.7), 5, 0.06, IRON)
    # Weed and barnacles on the shoulders, weed down the back.
    for sx in (-1, 1):
        p.kelp((sx * 0.6, 0.1, 2.3), 0.7, (sx * 0.12, 0.2), 0.09, KELP)
        p.kelp((sx * 0.3, 0.45, 2.2), 0.9, (0, 0.2), 0.08, KELP_D)
    for k in range(8):
        a = k / 8 * math.pi
        p.barnacle((0.72 + 0.14 * math.cos(a), -0.1 + 0.22 * math.sin(a), 2.32), (0.3, 0, 1), 0.08,
                   p.vary(BARNACLE, 0.08))

    # ---- arms: huge, sleeves rolled, iron cuffs ---------------------------------------
    def arm(s, t):
        p.on('Arm' + t)
        p.blob((s * 0.78, 0, 2.06), (0.3, 0.3, 0.26), JERKIN)
        p.tube([(s * 0.8, 0, 2.06), (s * 0.92, -0.02, 1.58)], [0.26, 0.22], SHIRT, sides=12)
        p.tube([(s * 0.9, -0.02, 1.66), (s * 0.92, -0.02, 1.56)], [0.25, 0.25], SHIRT, sides=12)
        p.on('Fore' + t)
        p.tube([(s * 0.92, -0.02, 1.58), (s * 0.98, -0.08, 1.14)], [0.22, 0.18], SKIN, sides=12)
        p.blob((s * 0.95, -0.2, 1.38), (0.1, 0.06, 0.14), SKIN_D)
        p.tube([(s * 0.98, -0.07, 1.26), (s * 0.98, -0.08, 1.12)], [0.21, 0.21], RUST, sides=12)
        p.tube([(s * 0.98, -0.07, 1.25), (s * 0.98, -0.07, 1.23)], [0.225, 0.225], RUST_D, sides=12)
        p.on('Hand' + t)
        p.blob((s * 0.98, -0.12, 0.98), (0.2, 0.18, 0.18), SKIN)
        for k in range(4):
            p.tube([(s * (0.88 + k * 0.065), -0.26, 0.96), (s * (0.88 + k * 0.065), -0.28, 0.86)], [0.05, 0.04],
                   SKIN_D, sides=6)

    sides(arm)
    # ---- the head: bald, swollen, hung forward, one eye shut ---------------------------
    p.on('Head')
    p.blob((0, -0.2, 2.6), (0.5, 0.46, 0.46), SKIN, bulge=0.06)
    p.blob((0, -0.24, 2.42), (0.44, 0.4, 0.24), SKIN_D)
    # The swollen-shut left eye, the lit right one, the heavy brow.
    p.blob((0.18, -0.6, 2.66), (0.15, 0.1, 0.1), BRUISE)
    p.blob((0.18, -0.66, 2.66), (0.1, 0.04, 0.02), SOCKET)
    p.blob((-0.18, -0.58, 2.66), (0.13, 0.08, 0.11), SOCKET)
    p.blob((-0.18, -0.64, 2.66), (0.05, 0.035, 0.05), SEA_LIGHT, mat=GLOW)
    p.blob((0, -0.58, 2.8), (0.42, 0.12, 0.08), SKIN_D)
    p.blob((0, -0.68, 2.54), (0.1, 0.12, 0.1), SKIN_D)
    for sx in (-1, 1):
        p.blob((sx * 0.5, -0.2, 2.56), (0.07, 0.1, 0.12), SKIN_D)
    # A greasy leather skullcap with a rusted iron band, weed under it.
    p.blob((0, -0.16, 2.9), (0.44, 0.42, 0.2), APRON, bulge=0.2)
    p.tube(ring_pts((0, -0.16, 2.84), 0.44, 'xy', n=24), [0.04] * 25, RUST_D, sides=5, cap=False)
    for k in range(9):
        a = math.pi * 0.05 + k / 8 * math.pi * 0.9
        p.kelp((math.cos(a) * 0.44, -0.12 + math.sin(a) * 0.36, 2.78), 0.4 + 0.1 * (k % 3),
               (math.cos(a) * 0.1, 0.1), 0.06, KELP if k % 2 else KELP_D)
    for k in range(5):
        a = k / 5 * math.tau
        p.barnacle((0.26 + 0.06 * math.cos(a), -0.3 + 0.06 * math.sin(a), 3.02), (0.4, -0.3, 1), 0.06,
                   p.vary(BARNACLE, 0.08))
    p.blob((0, -0.54, 2.44), (0.26, 0.1, 0.07), MOUTH)
    for k in range(5):
        x = -0.16 + k * 0.08
        p.cone((x, -0.58, 2.49), (x, -0.59, 2.43), 0.028, TOOTH, sides=4)
    p.on('Jaw')
    # The jutting underbite: lower tusks up over the lip.
    p.blob((0, -0.44, 2.3), (0.36, 0.28, 0.13), SKIN)
    for x in (-0.2, 0.2):
        p.cone((x, -0.64, 2.34), (x * 1.05, -0.66, 2.52), 0.045, TOOTH, sides=5)
    for k in range(4):
        x = -0.1 + k * 0.066
        p.cone((x, -0.64, 2.36), (x, -0.65, 2.42), 0.024, TOOTH, sides=4)

    # ---- the shackles dangling at the belt --------------------------------------------
    def shackle(s, t):
        p.on('Shackle' + t)
        chain(p, (s * 0.62, -0.3, 1.14), (s * 0.64, -0.3, 0.86), 3, 0.05)
        for k, dx in enumerate((-0.07, 0.07)):
            c = (s * 0.64 + dx, -0.3, 0.72 - k * 0.04)
            p.tube(ring_pts(c, 0.1, 'xz', n=14, start=0.4, span=math.tau - 0.8), [0.03] * 15, IRON, sides=5,
                   cap=False)
            p.blob((c[0], c[1], c[2] + 0.1), (0.04, 0.04, 0.03), RUST_D)
        p.kelp((s * 0.66, -0.26, 0.86), 0.28, (0.02, 0), 0.05, KELP_D)

    sides(shackle)
    # ---- the great ring of keys on its chain (right fist) ------------------------------
    p.on('KeyChain')
    chain(p, (-0.98, -0.12, 0.88), (-0.98, -0.12, 0.8), 1, 0.05)
    p.on('Keys')
    # A great hoop of rusted iron (wide enough to read from the game camera),
    # the keys fanned round its lower half, each as long as the floor allows
    # in the rest pose (the bind pose must stay above the ground plane).
    ring_c = (-0.98, -0.12, 0.52)
    ring_r = 0.28
    p.tube(ring_pts(ring_c, ring_r, 'xz', n=32), [0.05] * 33, RUST, sides=6, cap=False)
    p.tube(ring_pts(ring_c, ring_r, 'xz', n=32), [0.035] * 33, RUST_D, sides=6, cap=False)
    p.blob((-0.98, -0.12, 0.8), (0.06, 0.06, 0.06), IRON)
    for k in range(13):
        a = -1.5 + k * 0.25
        tz = ring_c[2] - math.cos(a) * ring_r
        top = (ring_c[0] + math.sin(a) * ring_r, ring_c[1] + (0.025 if k % 2 else -0.025), tz)
        length = min(0.34, (tz - 0.03) / max(0.4, math.cos(a * 0.55)), 0.24 + 0.05 * (k % 3))
        key(p, top, a * 0.55, length, KEY_BRASS if k % 4 == 1 else p.vary(KEY_IRON, 0.1))
    for k in range(4):
        a = 0.6 + k * 0.5
        p.barnacle((ring_c[0] + math.cos(a) * ring_r, ring_c[1] - 0.05, ring_c[2] + math.sin(a) * ring_r),
                   (0, -1, 0.3), 0.045)
    p.kelp((ring_c[0] + 0.15, ring_c[1], ring_c[2] + 0.16), 0.36, (0.05, 0), 0.05, KELP)
    # ---- the storm lantern (left fist) ------------------------------------------------
    p.on('Lantern')
    lx, ly = 0.98, -0.12
    p.tube(ring_pts((lx, ly, 0.84), 0.07, 'xz', n=12, start=0.0, span=math.pi), [0.018] * 13, IRON, sides=4,
           cap=False)
    p.tube([(lx, ly, 0.8), (lx, ly, 0.74)], [0.09, 0.15], IRON, sides=8)
    # Amber glass lit from within (vertex colour, not an exported emissive:
    # a GLB emissive part draws flat white in game), a white-hot wick behind
    # the open front pane.
    p.blob((lx, ly, 0.58), (0.13, 0.13, 0.16), LANTERN, rings=8, segments=12)
    p.blob((lx, ly - 0.12, 0.58), (0.035, 0.04, 0.06), (1.0, 0.96, 0.8), mat=GLOW)
    for k in range(6):
        a = k / 6 * math.tau
        p.tube([(lx + math.cos(a) * 0.14, ly + math.sin(a) * 0.14, 0.74),
                (lx + math.cos(a) * 0.14, ly + math.sin(a) * 0.14, 0.42)], [0.018, 0.018], RUST_D, sides=4)
    p.tube([(lx, ly, 0.44), (lx, ly, 0.38)], [0.17, 0.15], IRON, sides=8)
    p.barnacle((lx + 0.12, ly - 0.08, 0.4), (1, -1, 0), 0.04)
    return p


# ---- clips -----------------------------------------------------------------------------

STAND = {
    # Hunched under the weight of the belly, head thrust up and forward, the
    # keys held out in the right fist, the lantern in the left.
    'Spine': [('x', 10)], 'Chest': [('x', 8)], 'Head': [('x', -14)], 'Jaw': [('x', 10)],
    'Arm.R': [('x', -24), ('y', 10)], 'Fore.R': [('x', -38)], 'Hand.R': [('x', 20)],
    'Arm.L!': [('x', -18), ('y', -10)], 'Fore.L!': [('x', -40)], 'Hand.L!': [('x', 30)],
    # (legs posed per side: '.L!' never mirrors onto the right)
    'Thigh.L!': [('y', -4)], 'Thigh.R': [('y', 4)],
    # the key ring and the lantern hang plumb from the tipped fists
    'KeyChain': [('x', 42)], 'Lantern': [('x', 28)],
}


def pose(**kw):
    """STAND with the named bones REPLACED (keyword names use _ for . and a
    trailing _ for the one-sided '!')."""
    out = {}
    for name, turns in kw.items():
        bone = name.replace('_L_', '.L!').replace('_R', '.R').replace('_L', '.L')
        out[bone] = turns
    return over(STAND, out)


def clips(arm):
    stand = STAND
    jingle = merge(stand, {'KeyChain': [('y', 12), ('x', 6)], 'Keys': [('y', 16)], 'Lantern': [('x', -8)],
                           'Spine': [('y', 2)], 'Head': [('z', 6)], 'Jaw': [('x', 6)], 'Hips': [('loc', (0, 0, -0.03))]})
    jingle_b = merge(stand, {'KeyChain': [('y', -10), ('x', -4)], 'Keys': [('y', -14)], 'Lantern': [('x', 7)],
                             'Spine': [('y', -2)], 'Head': [('z', -5), ('x', 4)], 'Jaw': [('x', 14)]})
    author_clip(arm, 'Idle', loop(84, [stand, jingle, stand, jingle_b]))

    def waddle(ph, amp=1.0, run=False):
        a = math.sin(ph)
        c = math.cos(ph)
        return merge(stand, {
            'Hips': [('loc', (0, 0, -0.07 * abs(c) * amp)), ('y', 7 * a * amp), ('z', -8 * a)],
            'Spine': [('x', 6 if run else 2), ('y', -5 * a * amp)], 'Chest': [('z', 6 * a)],
            'Head': [('y', 4 * a)], 'Jaw': [('x', 6 * abs(a))],
            'Thigh.L!': [('x', -26 * a * amp), ('y', -6)], 'Thigh.R': [('x', 26 * a * amp), ('y', 6)],
            'Shin.L!': [('x', 30 * max(0.0, a) * amp)], 'Shin.R': [('x', 30 * max(0.0, -a) * amp)],
            'Foot.L!': [('x', -8 * a)], 'Foot.R': [('x', 8 * a)],
            # the keys and lantern swing a beat behind the step
            'KeyChain': [('x', -18 * c * amp)], 'Keys': [('x', -14 * c * amp)], 'Lantern': [('x', 14 * c * amp)],
            'Arm.R': [('x', -8 * a * amp)], 'Arm.L!': [('x', 8 * a * amp)],
        })

    author_clip(arm, 'Walk', loop(32, [waddle(i / 4 * math.tau) for i in range(4)]))
    author_clip(arm, 'Run', loop(20, [waddle(i / 4 * math.tau, 1.35, True) for i in range(4)]))

    # KeySwing: the ring whirled up and back over the shoulder, then brought
    # down on the target like a flail, the chain snapping straight.
    wind = pose(Arm_R=[('x', -165), ('y', -15)], Fore_R=[('x', -30)], Hand_R=[('x', 10)],
                Spine=[('x', -8), ('z', 12)], Chest=[('x', -8), ('z', 14)], Head=[('x', -24)], Jaw=[('x', 24)])
    wind = over(wind, {'KeyChain': [('x', 70)], 'Keys': [('x', 50)]})
    top = over(pose(Arm_R=[('x', -175), ('y', -10)], Fore_R=[('x', -10)], Spine=[('x', -10)],
                     Chest=[('x', -10)], Head=[('x', -24)], Jaw=[('x', 24)]),
                {'KeyChain': [('x', 140)], 'Keys': [('x', 30)]})
    slam = over(pose(Arm_R=[('x', -70), ('y', 10)], Fore_R=[('x', -10)], Spine=[('x', 22), ('z', -8)],
                      Chest=[('x', 14), ('z', -10)], Head=[('x', 4)], Jaw=[('x', 30)],
                      Hips=[('loc', (0, -0.12, -0.12))]),
                 {'KeyChain': [('x', -30)], 'Keys': [('x', -20)]})
    follow = merge(slam, {'KeyChain': [('x', 20)], 'Keys': [('x', 30)], 'Arm.R': [('x', 10)]})
    author_clip(arm, 'KeySwing', [(1, stand), (7, wind), (11, top), (14, slam), (18, follow), (30, stand)], loop=False)

    # ChainLash: the fist swung wide to the right and lashed flat across the
    # front, the chain streaming out straight with the keys at full reach.
    back = over(pose(Arm_R=[('x', -75), ('z', -70)], Fore_R=[('x', -10)], Hand_R=[('x', 0)],
                      Chest=[('z', -32)], Spine=[('z', -12)], Head=[('z', 20)]),
                 {'KeyChain': [('z', -60), ('x', 20)], 'Keys': [('z', -30)]})
    lash = over(pose(Arm_R=[('x', -88), ('z', 30)], Fore_R=[('x', 0)], Hand_R=[('x', 0)],
                      Chest=[('z', 30)], Spine=[('z', 12), ('x', 8)], Head=[('z', -14)], Jaw=[('x', 28)],
                      Hips=[('loc', (0, -0.1, -0.06))]),
                 {'KeyChain': [('x', -4)], 'Keys': [('x', -2)]})
    past = over(pose(Arm_R=[('x', -70), ('z', 60)], Fore_R=[('x', -10)], Chest=[('z', 40)],
                      Spine=[('z', 14)], Head=[('z', -18)], Jaw=[('x', 18)]),
                 {'KeyChain': [('z', 50), ('x', 30)], 'Keys': [('z', 30)]})
    author_clip(arm, 'ChainLash', [(1, stand), (8, back), (12, lash), (16, past), (28, stand)], loop=False)

    # LanternRaise (Open the Cells): the lantern hoisted high overhead, the
    # keys rattled up at the cell doors, the head thrown back in a bellow.
    raise_ = pose(Arm_L_=[('x', -140), ('y', 6)], Fore_L_=[('x', 34)], Hand_L_=[('x', 10)],
                  Arm_R=[('x', -120), ('y', -30)], Fore_R=[('x', -40)], Spine=[('x', -12)],
                  Chest=[('x', -14)], Head=[('x', -34)], Jaw=[('x', 42)],
                  Hips=[('loc', (0, 0.05, 0.06))], KeyChain=[('x', 150)], Lantern=[('x', 122)])
    rattle_a = merge(raise_, {'KeyChain': [('y', 28)], 'Keys': [('y', 22)], 'Lantern': [('x', 10)]})
    rattle_b = merge(raise_, {'KeyChain': [('y', -26)], 'Keys': [('y', -24)], 'Lantern': [('x', -10)],
                              'Jaw': [('x', 6)]})
    author_clip(arm, 'LanternRaise', [(1, stand), (9, raise_), (13, rattle_a), (17, rattle_b), (21, rattle_a),
                                      (25, rattle_b), (29, rattle_a), (34, raise_), (44, stand)], loop=False)
    author_clip(arm, 'Cast', loop(24, [rattle_a, rattle_b]))

    hit = merge(stand, {'Spine': [('x', -12)], 'Chest': [('x', -8)], 'Head': [('x', -22), ('y', 14)],
                        'Jaw': [('x', 26)], 'KeyChain': [('x', 30)], 'Lantern': [('x', 24)]})
    author_clip(arm, 'Hit', [(1, stand), (4, hit), (15, stand)], loop=False)
    # Death: the keys dropped, to its knees, then it topples forward onto the
    # belly and the lantern rolls out of the fist.
    knees = merge(stand, {'Root': [('loc', (0, 0, -0.42))], 'Thigh.L!': [('x', -80)], 'Thigh.R': [('x', -80)],
                          'Shin.L!': [('x', 92)], 'Shin.R': [('x', 92)], 'Spine': [('x', 14)], 'Head': [('x', 20)],
                          'Jaw': [('x', 34)], 'KeyChain': [('x', 40)], 'Lantern': [('x', 40)]})
    flat = merge(stand, {'Root': [('x', 82), ('loc', (0, 1.3, 0.66))], 'Thigh.L!': [('x', -12)],
                         'Thigh.R': [('x', 8)], 'Arm.R': [('x', -140)], 'Arm.L!': [('x', -130)],
                         'Head': [('y', 24)], 'Jaw': [('x', 34)], 'KeyChain': [('x', 70)], 'Lantern': [('x', 80)]})
    author_clip(arm, 'Death', [(1, stand), (10, knees), (20, knees), (32, flat), (44, flat)], loop=False)
    return ['Idle', 'Walk', 'Run', 'KeySwing', 'ChainLash', 'LanternRaise', 'Cast', 'Hit', 'Death']


CREATURE = (BONES, body, clips, 1.8, 9.0)
