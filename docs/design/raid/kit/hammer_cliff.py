"""The Hammer vein's quarried rock as a giant cut it (phase 2C): the worked
faces of the quarry's terraces, the pit's rim and the Gallery's lips, and
the great cliffs crowning the quarry's back wall.

Each is a signed-distance field (the colossi's sculpt primitives,
hammer_sculpt.py) meshed once through OpenVDB, so the rock reads as ONE
cliff cut in benches, never a stack of separate boxes:
  - the face falls in two to four benches, each lower lift standing a little
    proud of the one above, the bench lines running out of true;
  - each bench is cut into blocks of every size (a great monolith beside a
    cluster of small lifts), the joints between them cut deep;
  - long cracks run down through the benches; a block or two has been pulled
    out of the face (a dark notch), another juts out under the lip as an
    overhang;
  - the giant's tool marks: broad drill channels down the splits, chisel
    bands across the larger blocks, a pick's chatter over everything;
  - (where it stands on an unwalked step) broken blocks and spoil fallen at
    its foot.
The finished stone is the RAW kind (shkit.SPiece weathers it: worn crests,
black joints, dust only where it settles); the blocks take a few tones of
the cool granite so neighbouring blocks never read as one paint.

Game yards, +Z up, the face toward -Y, origin on the lip. Deterministic:
every noise is seeded, nothing reads the clock.
"""
import math

import numpy as np

import gravewyrm_sculpt as gs
from gravewyrm_sculpt import Polyline, RoundBox, Sculpt, block
from gwkit import add_sculpt, crystal, mix
from jaguar_head_sculpt import Noise
from shkit import GLOW, QUARRY, QUARRY_DARK, QUARRY_DEEP, QUARRY_PALE, QUARRY_RED, RAW, TAU, VEIN

# The tones a face's blocks take (sRGB) and their kinds.
CLIFF_COLOURS = {
    'q0': QUARRY,
    'q1': mix(QUARRY, QUARRY_DARK, 0.45),
    'q2': QUARRY_DARK,
    'q3': mix(QUARRY, QUARRY_PALE, 0.6),
    'q4': mix(QUARRY, QUARRY_RED, 0.3),
    'q5': (0.47, 0.42, 0.4),             # a warm grey bed (warm and cool greys mix)
    'deep': mix(QUARRY_DARK, QUARRY_DEEP, 0.6),
    'vein': VEIN,
}
CLIFF_KINDS = {k: RAW for k in CLIFF_COLOURS}
CLIFF_KINDS['vein'] = (RAW, GLOW)
TONES = ('q0', 'q0', 'q1', 'q5', 'q5', 'q2', 'q3', 'q4')


class CliffSculpt(Sculpt):
    """A Sculpt with paint zones: after the nearest-part classification, a
    face whose centre lies in a zone takes the zone's label (a fresh cut face
    painted pale over the mountain's weathered mass)."""

    def __init__(self, lo, hi, voxel):
        super().__init__(lo, hi, voxel)
        self.zones = []

    def zone(self, label, lo, hi):
        self.zones.append((label, np.asarray(lo, dtype=np.float64), np.asarray(hi, dtype=np.float64)))

    def classify(self, centres, default='hide'):
        kind = super().classify(centres, default)
        for label, lo, hi in self.zones:
            inside = np.all((centres >= lo) & (centres <= hi), axis=1)
            kind[inside & (kind != 'vein')] = label
        return kind


def _bound(f, axis, lo=None, hi=None):
    """Intersect the field with lo <= coordinate <= hi on one axis."""
    a = f.axes[axis]
    shape = [1, 1, 1]
    shape[axis] = -1
    A = a.reshape(shape)
    if lo is not None:
        f.d = np.maximum(f.d, (lo - A).astype(np.float32) + np.zeros_like(f.d))
    if hi is not None:
        f.d = np.maximum(f.d, (A - hi).astype(np.float32) + np.zeros_like(f.d))


def cut_benches(f, rng, x0, x1, z_top, z_bot, depth, bench=0.55, proud=0.25, notch=0.35, overhang=0.3,
                crack=0.6, chisel=0.45, front_max=None, wmin=1.6, wmax=5.5, vein=None):
    """Sculpt a face of benches into field f (see the module doc). Returns
    the prims (for the noise's reach)."""
    span = z_top - z_bot
    # The body behind every block: the dark of the deep joints and notches.
    f.put('deep', RoundBox(((x0 + x1) / 2, depth * 0.7, (z_top + z_bot) / 2),
                           ((x1 - x0) / 2 + 0.8, depth * 0.35, span / 2 + 0.2), 0.05), 0.0)
    # The benches: two to four lifts down the face.
    zs = [z_top]
    while zs[-1] - z_bot > 2.2:
        zs.append(zs[-1] - min(rng.uniform(1.5, 3.2), zs[-1] - z_bot))
    if zs[-1] > z_bot:
        zs.append(z_bot)
    prims = []
    for i in range(len(zs) - 1):
        zt, zb = zs[i], zs[i + 1]
        base_y = -bench * i + rng.uniform(-proud, proud) * 0.4
        # One bed per bench (the face reads as ONE rock cut in benches, the
        # block lines faint), a block now and then of another tone.
        bed = TONES[int(rng.integers(len(TONES)))]
        x = x0 - rng.uniform(0.6, 1.4)
        while x < x1 + 0.6:
            w = rng.uniform(wmin, wmax)
            a, b = x, min(x + w, x1 + 1.2)
            x = b
            # A block pulled out of the face (never off the lip row).
            if i > 0 and rng.random() < notch * 0.35:
                continue
            yo = base_y + rng.uniform(-proud, proud * 0.5)
            hang = i == 0 and rng.random() < overhang
            if hang:
                yo -= rng.uniform(0.5, 1.1)
            if front_max is not None:
                yo = max(yo, -front_max)
            # The block may split into two lifts of its own.
            rows = [(zt, zb)]
            if zt - zb > 2.4 and rng.random() < 0.15:
                m = zb + (zt - zb) * rng.uniform(0.35, 0.65)
                rows = [(zt, m), (m, zb)]
            for (rt, rb) in rows:
                c = ((a + b) / 2, yo + depth / 2, (rt + rb) / 2)
                size = (b - a + 0.02, depth, rt - rb + 0.02)
                R = gs.rot(rz=rng.uniform(-0.02, 0.02), ry=rng.uniform(-0.015, 0.015))
                prim = block(rng, c, size, cuts=3, chamfer=(0.93, 0.995), R=R)
                tone = bed if rng.random() < 0.92 else TONES[int(rng.integers(len(TONES)))]
                f.put(tone, prim, 0.0)
                prims.append(prim)
                # The split beside it: some cut deep, most faint (a parting
                # the rock barely shows), never a grid of joints.
                r = rng.random()
                if r < 0.35:
                    f.groove(Polyline([(b, yo - 0.05, rb), (b, yo - 0.05, rt)], 0.02), 0.22, 0.07)
                elif r < 0.6:
                    f.groove(Polyline([(b, yo - 0.05, rb + (rt - rb) * rng.uniform(0.2, 0.6)), (b, yo - 0.05, rt)],
                                      0.02), 0.08, 0.05)
                # Chisel bands across a big block (the giant's claw).
                if b - a > 2.4 and rt - rb > 1.4 and rng.random() < chisel:
                    n = int(rng.integers(3, 6))
                    slant = rng.choice([0.0, 0.35, -0.35])
                    w0 = (b - a) * rng.uniform(0.4, 0.8)
                    bx = rng.uniform(a + 0.3, b - 0.3 - w0)
                    z0 = rng.uniform(rb + 0.3, max(rb + 0.35, rt - 0.3 - n * 0.34))
                    for k in range(n):
                        zz = z0 + k * 0.34
                        f.groove(Polyline([(bx, yo - 0.02, zz), (bx + w0, yo - 0.02, zz + slant * w0 * 0.3)], 0.02),
                                 0.11, 0.07)
                # A drill channel down the split.
                if rng.random() < 0.3:
                    xx = a + 0.2 if rng.random() < 0.5 else b - 0.2
                    f.groove(Polyline([(xx, yo - 0.03, rb + 0.15), (xx, yo - 0.03, rt - 0.1)], 0.02), 0.12, 0.07)
            if hang:
                # The overhang's shadowed underside, undercut.
                f.sub(RoundBox(((a + b) / 2, yo + 0.4, zb - 0.25), ((b - a) / 2 * 0.9, 0.7, 0.3), 0.1), 0.05)
        # The bench line itself, cut along the whole face.
        f.groove(Polyline([(x0 - 1, base_y - 0.1, zb), (x1 + 1, base_y - 0.1, zb)], 0.02), 0.18, 0.08)
    # Long cracks down through the benches.
    n_cracks = (1 if rng.random() < crack else 0) + (1 if rng.random() < crack * 0.4 else 0)
    for _ in range(n_cracks):
        cx = rng.uniform(x0 + 1.2, x1 - 1.2)
        pts = []
        z = z_top + 0.2
        while z > z_bot - 0.2:
            pts.append((cx + rng.uniform(-0.35, 0.35), -bench * len(zs), z))
            z -= rng.uniform(0.8, 1.6)
        pts.append((cx, -bench * len(zs), z_bot - 0.3))
        f.groove(Polyline(pts, 0.08), 1.6, 0.26)
    # Natural fractures: the lip broken off here and there along an oblique
    # plane (the rock is never all square cuts).
    X = f.axes[0][:, None, None]
    Y = f.axes[1][None, :, None]
    Z = f.axes[2][None, None, :]
    for _ in range(int(rng.integers(0, 2))):
        cx = rng.uniform(x0 + 0.5, x1 - 0.5)
        cz = z_top - rng.uniform(1.6, 2.6)
        n = np.array((rng.uniform(-0.8, 0.8), -1.0, rng.uniform(0.6, 1.4)))
        n /= np.linalg.norm(n)
        off = rng.uniform(0.15, 0.35)
        half = rng.uniform(1.8, 3.2)
        front = (-(n[0] * (X - cx) + n[1] * Y + n[2] * (Z - cz)) - off).astype(np.float32)
        side = (np.abs(X - cx) - half).astype(np.float32)
        below = (cz - Z).astype(np.float32)
        chunk = np.maximum(np.maximum(front, side), below)
        f.d = np.maximum(f.d, -chunk)
    if vein:
        f.put('vein', Polyline(vein, 0.09), 0.02)
    # Clamp: flat on the lip, the module's ends, the foot, the front.
    f.cut_above(z_top)
    f.cut_below(z_bot)
    _bound(f, 0, x0 - 0.4, x1 + 0.4)
    if front_max is not None:
        _bound(f, 1, -front_max, None)
    return prims


def chatter(f, seed, prims, amp=0.05):
    """The pick's chatter and the stone's own unevenness over the cut faces."""
    n1, n2 = Noise(seed), Noise(seed + 5)

    def fn(X, Y, Z):
        return amp * n1.fbm(X * 0.9, Y * 0.9, Z * 0.9, 3) + amp * 0.5 * n2.ridged(X * 2.6 + Z, Y * 2.6, Z * 2.6, 2)
    f.displace(fn, band=0.4)


def foot_spoil(p, rng, x0, x1, z_bot, y_foot):
    """Broken blocks and spoil fallen at a face's foot (an unwalked step);
    rng is the piece's own (Python) generator."""
    for k in range(rng.randint(4, 7)):
        s = rng.uniform(0.45, 1.5)
        x = rng.uniform(x0 + 0.5, x1 - 0.5)
        crystal(p, (x, y_foot - rng.uniform(0.3, 1.8), z_bot + s * 0.3), (s * 1.4, s, s * 0.75),
                p.vary(QUARRY if k % 3 else QUARRY_PALE, 0.06), n=14, boxy=0.4, jitter=0.15,
                yaw=rng.uniform(0, TAU), pitch=rng.uniform(-0.4, 0.4), floor=z_bot)
    # A talus of fine spoil along the foot, in heaps.
    x = x0 + rng.uniform(0.3, 1.2)
    while x < x1 - 1.0:
        w = rng.uniform(1.8, 3.2)
        crystal(p, (x + w / 2, y_foot - 0.5 + rng.uniform(-0.4, 0.4), z_bot + 0.1), (w, rng.uniform(1.4, 2.2), 0.7),
                QUARRY_DARK, n=14, boxy=0.7, jitter=0.12, floor=z_bot, yaw=rng.uniform(-0.3, 0.3))
        x += w * rng.uniform(1.0, 1.8)


def sculpt_face(bpy, p, name, seed, x0, x1, z_top, z_bot, depth, target, foot=True, voxel=0.075, **kw):
    """A sculpted face module into piece p (see cut_benches for kw)."""
    rng = np.random.default_rng(seed)
    front = kw.get('front_max')
    ylo = -(front + 0.2) if front is not None else -4.5
    f = Sculpt((x0 - 1.0, ylo, z_bot - 0.4), (x1 + 1.0, depth + 0.4, z_top + 0.3), voxel)
    prims = cut_benches(f, rng, x0, x1, z_top, z_bot, depth, **kw)
    chatter(f, seed, prims)
    f.cut_above(z_top)
    if front is not None:
        _bound(f, 1, -front, None)
    verts, faces = gs.mesh_sculpt(f, bpy, name, target)
    add_sculpt(p, f, verts, faces, CLIFF_COLOURS, CLIFF_KINDS, smooth=False)
    if foot:
        foot_spoil(p, p.rng, x0, x1, z_bot, -kw.get('bench', 0.55) * 3)
    return p


def great_cliff(bpy, p, variant, target=14000):
    """A crown of the quarry's back wall (stands on the top step, the face
    toward the pit, -Y; origin at its foot): the mountain's own craggy rock,
    its natural fractures and leaning slabs breaking the skyline, the lower
    half cut away by the Smith in great flat benches (the giant's quarry cut
    into the living mountain), the cut faces split into a few huge blocks on
    deep joints, broad drill channels down them, a great block half split out
    of the face on its drill line, the vein's light in a seam."""
    seed = {'A': 401, 'B': 409, 'C': 419}[variant]
    rng = np.random.default_rng(seed)
    W, D, Hh = {'A': (30.0, 13.0, 26.0), 'B': (24.0, 12.0, 21.0), 'C': (34.0, 14.0, 28.0)}[variant]
    f = CliffSculpt((-W / 2 - 4, -10, -2), (W / 2 + 4, D + 3, Hh + 8), 0.22)
    # The mountain: craggy masses along one ridge that rises and falls in a
    # couple of slow swells (never a row of towers), each leaning back into
    # the mountain so the skyline slopes away from the pit.
    k = int(rng.integers(5, 8))
    phase = rng.uniform(0, TAU)
    for i in range(k):
        t = (i + 0.5) / k
        x = -W / 2 + t * W + rng.uniform(-1.5, 1.5)
        h = Hh * (0.78 + 0.18 * math.sin(t * 3.4 + phase) + rng.uniform(-0.05, 0.05))
        w = W / k * rng.uniform(1.5, 2.1)
        f.put('q2' if i % 2 else 'q1',
              block(rng, (x, D * 0.55 + rng.uniform(-1.0, 1.0), h / 2), (w, D * rng.uniform(1.0, 1.3), h), cuts=12,
                    chamfer=(0.65, 0.88), R=gs.rot(rx=rng.uniform(0.08, 0.2), ry=rng.uniform(-0.12, 0.12),
                                                  rz=rng.uniform(-0.15, 0.15)), top_tilt=0.55), 1.4)
    # The Smith's cut: great flat benches taken out of the front, stepping
    # back as they rise; each cut face pale (fresh), split into a few huge
    # blocks on deep joints, drill channels down the splits.
    z = 0.0
    y = 0.6
    benches = int(rng.integers(2, 4))
    for b in range(benches):
        h = Hh * rng.uniform(0.18, 0.28)
        x0b = -W / 2 + rng.uniform(1, 5)
        x1b = W / 2 - rng.uniform(1, 5)
        # Take away everything in front of the cut, above the bench's floor.
        f.sub(RoundBox(((x0b + x1b) / 2, y - 6, z + h + Hh), ((x1b - x0b) / 2, 6, Hh), 0.05), 0.0)
        # The fresh cut faces and the bench's floor, painted pale.
        f.zone('q3' if b % 2 == 0 else 'q0', (x0b - 0.3, y - 0.6, z - 0.4), (x1b + 0.3, y + 0.6, z + h + 0.2))
        f.zone('q0', (x0b - 0.3, y - 12.5, z - 0.6), (x1b + 0.3, y + 0.4, z + 0.6))
        xx = x0b + rng.uniform(2, 4)
        while xx < x1b - 1.5:
            f.groove(Polyline([(xx, y - 0.1, z), (xx + rng.uniform(-0.3, 0.3), y - 0.1, z + h)], 0.05), 0.6, 0.16)
            if rng.random() < 0.5:
                for kk in range(int(rng.integers(3, 6))):
                    dx = xx + 0.6 + kk * 0.5
                    f.groove(Polyline([(dx, y - 0.05, z + 0.3), (dx, y - 0.05, z + h - 0.3)], 0.03), 0.16, 0.07)
            xx += rng.uniform(4.0, 8.0)
        zz = z + h * rng.uniform(0.4, 0.6)
        f.groove(Polyline([(x0b, y - 0.1, zz), (x1b, y - 0.1, zz + rng.uniform(-0.4, 0.4))], 0.05), 0.5, 0.15)
        z += h
        y += rng.uniform(2.0, 3.5)
    # The great block half split out of the lowest cut, on its drill line.
    gx = rng.uniform(-W / 4, W / 4)
    f.put('q3', block(rng, (gx, -1.6, 2.4), (6.5, 4.0, 4.8), cuts=4, chamfer=(0.9, 0.99), R=gs.rot(rz=0.12, rx=-0.05)),
          0.0)
    for kk in range(9):
        xx = gx - 2.8 + kk * 0.7
        f.groove(Polyline([(xx, -3.7, 4.9), (xx, -3.7, 0.2)], 0.03), 0.18, 0.08)
    # A cleft down the natural rock above the cuts.
    cx = rng.uniform(-W / 3, W / 3)
    pts = []
    zz = Hh + 6
    while zz > z:
        pts.append((cx + rng.uniform(-0.8, 0.8), y - 2 + rng.uniform(-0.5, 0.5), zz))
        zz -= rng.uniform(2, 4)
    f.groove(Polyline(pts, 0.25), 2.4, 0.5)
    # The vein's light in a seam across the lowest cut.
    seam = []
    for kk in range(7):
        t = kk / 6
        seam.append((-W / 2 + 3 + t * (W - 6), 0.45, 1.4 + Hh * 0.08 * (1 + math.sin(t * 5.0 + seed))))
    f.groove(Polyline(seam, 0.1), 0.5, 0.22)
    f.put('vein', Polyline([(x, yy - 0.05, zz2) for (x, yy, zz2) in seam], 0.14), 0.02)
    n1, n2 = Noise(seed), Noise(seed + 7)
    f.displace(lambda X, Y, Z: 0.16 * n1.fbm(X * 0.3, Y * 0.3, Z * 0.3, 3)
               + 0.07 * n2.ridged(X * 1.1 + Z * 0.5, Y * 1.1, Z * 1.1, 2), band=0.8)
    f.cut_below(0.0)
    verts, faces = gs.mesh_sculpt(f, bpy, 'GreatCliff' + variant, target)
    add_sculpt(p, f, verts, faces, CLIFF_COLOURS, CLIFF_KINDS, smooth=False)
    foot_spoil(p, p.rng, -W / 2 + 2, W / 2 - 2, 0.0, -4.5)
    return p
