"""The mountains round the Stormbrass Foundry: an ERODED HEIGHTFIELD, not cones.

Builds the valley the Foundry's shelf stands in and the ranges round it as one
heightfield (instance-local yards, 1524 by 1800 yd, the shelf at its middle):
ridged, domain-warped massifs under a directional envelope (a through-valley
open to the south-west, a col to the north-east, so the horizon is never a row
of equal peaks), three hero peaks with their own silhouettes (the Stormhorn, a
tilted horn north beyond the Gantry; the Split Tooth, a notched twin spire east
beyond the Coil Crown; the Anvil, a flat-topped mesa with cliff bands in the
west), strata terracing into cliff bands, then stream-power and thermal
erosion on a 4 yd grid (gullies, sharpened ridgelines, talus fans), upsampled
to 1 yd with slope-scaled detail.

Outputs (raw, for scripts/assets/stormbrass_foundry_mountains/build.mjs, which
makes the mesh, the PNGs and the shipped GLB):
  heights.f32   the 6 yd mesh grid's heights, rows along z
  albedo.rgb    1524 x 1800 sRGB bytes: the cliffs' own beds as strata on the
                steep ground, scree and talus on the gentle, snow on the
                heights and down the couloirs, gullies darkened, a baked soft
                shadow from the low western sun
  normal.rgb    1524 x 1800 OBJECT-SPACE normals (y up) of the 1 yd field
  meta.json     sizes, extents, the height range

Numpy only (Blender is used as a numpy host: system Python here has none):
  "<blender>" -b --factory-startup --python build_stormbrass_foundry_mountains.py -- --out <dir>
Deterministic: every random draw is a hash of the lattice.
"""

import json
import os
import sys

import numpy as np

# ---- the frame (must match build.mjs and the shelf's bounds) ------------------------
HALF_X, HALF_Z = 762.0, 900.0
COARSE = 4.0          # the erosion grid (yards)
FINE = 1.0            # the texture grid
MESH = 6.0            # the mesh grid
SHELF = (-114.0, 114.0, -240.0, 236.0)   # minX, maxX, minZ, maxZ
VOID = -80.0
FLOOR_MAX = VOID - 10.0                  # the valley floor's ceiling near the shelf
FLOOR_MIN = VOID - 24.0                  # the cliffs' feet (they run to VOID - 25)
SUN = np.array([-0.74, 0.5, 0.3])

# The cliffs' own beds (foundry_interior.ts BEDS), linear.
BEDS = np.array([
    [0.62, 0.53, 0.42],
    [0.44, 0.45, 0.49],
    [0.32, 0.30, 0.30],
    [0.58, 0.38, 0.27],
    [0.52, 0.48, 0.43],
    [0.38, 0.40, 0.44],
])


# ---- lattice noise ------------------------------------------------------------------
def _hash(ix, iz, seed):
    h = (ix.astype(np.int64) * 374761393 + iz.astype(np.int64) * 668265263 + seed * 1442695041) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    h = h ^ (h >> 16)
    return (h & 0xFFFFFF).astype(np.float64) / float(0x1000000)


def noised(x, z, seed):
    """Value noise in 0..1 with its analytic gradient."""
    ix = np.floor(x)
    iz = np.floor(z)
    fx = x - ix
    fz = z - iz
    ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
    uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10)
    dux = 30 * fx * fx * (fx * (fx - 2) + 1)
    duz = 30 * fz * fz * (fz * (fz - 2) + 1)
    a = _hash(ix, iz, seed)
    b = _hash(ix + 1, iz, seed)
    c = _hash(ix, iz + 1, seed)
    d = _hash(ix + 1, iz + 1, seed)
    k1 = b - a
    k2 = c - a
    k3 = a - b - c + d
    v = a + k1 * ux + k2 * uz + k3 * ux * uz
    return v, dux * (k1 + k3 * uz), duz * (k2 + k3 * ux)


def noise(x, z, seed):
    return noised(x, z, seed)[0]


def fbm(x, z, seed, octaves=5, gain=0.5, lac=2.03):
    s = np.zeros_like(x)
    a = 0.5
    for o in range(octaves):
        s += noise(x, z, seed + o * 17) * a
        x, z = (x * 0.8 - z * 0.6) * lac, (x * 0.6 + z * 0.8) * lac
        a *= gain
    return s


def ridged(x, z, seed, octaves=6, lac=2.07, gain=0.52, sharp=1.0):
    """Ridged multifractal, 0..about 1: sharp crests, each octave weighted by
    the one before it so detail gathers on the ridges."""
    s = np.zeros_like(x)
    a = 0.55
    w = np.ones_like(x)
    for o in range(octaves):
        n = 1.0 - np.abs(noise(x, z, seed + o * 31) * 2 - 1)
        n = n ** (1.6 * sharp)
        s += n * a * w
        w = np.clip(n * 1.6, 0, 1)
        x, z = (x * 0.8 - z * 0.6) * lac, (x * 0.6 + z * 0.8) * lac
        a *= gain
    return s


def eroded_fbm(x, z, seed, octaves=7):
    """Gradient-damped fBm: the slopes it has already made mute the octaves
    after them, so valleys stay smooth and crests stay rough."""
    s = np.zeros_like(x)
    dx = np.zeros_like(x)
    dz = np.zeros_like(x)
    a = 0.5
    for o in range(octaves):
        n, gx, gz = noised(x, z, seed + o * 13)
        dx += gx
        dz += gz
        s += a * n / (1.0 + dx * dx + dz * dz)
        x, z = (x * 0.8 - z * 0.6) * 2.0, (x * 0.6 + z * 0.8) * 2.0
        a *= 0.5
    return s


def smooth(a, b, v):
    t = np.clip((v - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def grid(cell):
    nx = int(round(HALF_X * 2 / cell))
    nz = int(round(HALF_Z * 2 / cell))
    x = -HALF_X + (np.arange(nx) + 0.5) * cell
    z = -HALF_Z + (np.arange(nz) + 0.5) * cell
    return np.meshgrid(x, z)


def outside_shelf(X, Z):
    dx = np.maximum(0, np.maximum(SHELF[0] - X, X - SHELF[1]))
    dz = np.maximum(0, np.maximum(SHELF[2] - Z, Z - SHELF[3]))
    return np.hypot(dx, dz)


def wedge(X, Z, bx, bz, width):
    """1 along the bearing (bx, bz) from the shelf's middle, falling to 0 `width` radians off it."""
    ang = np.arctan2(X, Z)
    d = np.abs(np.angle(np.exp(1j * (ang - np.arctan2(bx, bz)))))
    return smooth(width, width * 0.35, d)


# ---- hero peaks --------------------------------------------------------------------------
def horn(X, Z, cx, cz, height, radius, rot, p=1.0, lean=(0.0, 0.0), concave=1.7):
    c, s = np.cos(rot), np.sin(rot)
    u = (X - cx) * c + (Z - cz) * s
    v = -(X - cx) * s + (Z - cz) * c
    # A lean: the faces on one side run longer than the other.
    u = u / (1 + lean[0] * np.sign(u))
    v = v / (1 + lean[1] * np.sign(v))
    r = (np.abs(u) ** p + np.abs(v) ** p) ** (1.0 / p)
    return height * np.clip(1 - r / radius, 0, 1) ** concave


def hero_peaks(X, Z):
    warp = (fbm(X / 160, Z / 160, 401, 4) - 0.5) * 90
    warp2 = (fbm(X / 48, Z / 48, 402, 4) - 0.5) * 46
    Xw = X + warp + warp2
    Zw = Z - warp * 0.7 + (fbm(X / 52, Z / 52, 403, 4) - 0.5) * 46
    out = np.zeros_like(X)
    # The Stormhorn: a tilted four-sided horn, north beyond the Gantry.
    out = np.maximum(out, horn(Xw, Zw, -70, 690, 470, 430, 0.5, p=0.78, lean=(0.7, -0.25), concave=1.5))
    out = np.maximum(out, horn(Xw, Zw, 120, 760, 290, 320, 1.1, p=0.85, lean=(-0.4, 0.3), concave=1.4))
    # The Split Tooth: two spires and the notch between them, east beyond the coil.
    t = np.maximum(horn(Xw, Zw, 590, 20, 410, 270, 0.2, p=0.75, lean=(0.6, 0.0), concave=1.5),
                   horn(Xw, Zw, 650, 150, 340, 250, -0.3, p=0.75, lean=(0.5, -0.4), concave=1.5))
    t = np.maximum(t, horn(Xw, Zw, 620, 80, 200, 330, 0.0, p=1.6, concave=1.3))
    out = np.maximum(out, t)
    # The Anvil: a flat-topped mesa with a cliff band, in the west.
    c, s = np.cos(0.35), np.sin(0.35)
    u = (Xw + 590) * c + (Zw + 150) * s
    v = -(Xw + 590) * s + (Zw + 150) * c
    r = np.hypot(u / 1.5, v)
    mesa = 235 * smooth(175, 125, r) + 90 * smooth(330, 170, r)
    mesa += 28 * smooth(60, 20, np.hypot(u / 1.5 - 30, v + 10))   # a stump on the table
    out = np.maximum(out, mesa)
    # Gendarmes and cirques: the heroes are craggy, never smooth cones.
    crag = ridged(X / 150, Z / 150, 411, 5)
    return out * (0.62 + 0.62 * crag)


# ---- the base terrain --------------------------------------------------------------------
def base_terrain(X, Z):
    d = outside_shelf(X, Z)
    wx = (fbm(X / 300, Z / 300, 11, 4) - 0.5) * 240
    wz = (fbm(X / 300, Z / 300, 12, 4) - 0.5) * 240
    xw = X + wx
    zw = Z + wz
    r = ridged(xw / 460, zw / 460, 21, 6)
    e = eroded_fbm(xw / 520, zw / 520, 41, 7)
    massif = 0.72 * r + 0.75 * e
    # The envelope: an open valley floor and talus aprons round the shelf, the
    # walls from 140 yd out, the full mass by 760 (sky over every vista).
    env = smooth(140, 760, d) ** 1.25
    # A through-valley open to the south-west and a high col to the north-east.
    env *= 1 - 0.74 * wedge(X, Z, -0.55, -1.0, 0.5) * smooth(900, 120, d + 200)
    env *= 1 - 0.42 * wedge(X, Z, 1.0, 0.7, 0.32)
    # Ranges, not a ring: broad swells and saddles round the horizon.
    env *= 0.55 + 0.9 * fbm(X / 620 + 3.1, Z / 620 - 1.7, 61, 3)
    far = smooth(380, 800, np.hypot(X, Z * 0.85))
    apron = smooth(70, 320, d) * 46
    h = FLOOR_MIN + 8 + apron + massif * env * (330 + 130 * far)
    heroes = hero_peaks(X, Z)
    h = np.maximum(h, heroes - 40 + apron)
    # Cliff bands: the beds step the slopes (hard beds stand, soft beds slump).
    step = 38.0
    warped = h + (fbm(X / 130, Z / 130, 71, 3) - 0.5) * 40
    q = np.floor(warped / step)
    f = warped / step - q
    riser = smooth(0.34, 0.66, f)
    terr = (q + riser) * step - (warped - h)
    band = smooth(0.25, 0.65, fbm(X / 210 + 9, Z / 210, 81, 3))
    h = h + (terr - h) * 0.6 * band * smooth(-40, 60, h)
    return h, d


def pin_floor(h, d, X, Z):
    """The valley floor under and round the shelf: between the cliffs' feet and
    the floor's ceiling, whatever the mountains do."""
    # (The piers of the skyline stand on it: it lies just under their feet.)
    floor = FLOOR_MAX - 4.5 + 3.0 * fbm(X / 34, Z / 34, 91, 4) + 1.5 * ridged(X / 60, Z / 60, 92, 3)
    floor = np.clip(floor, FLOOR_MIN, FLOOR_MAX - 1)
    k = smooth(84, 52, d)
    return h * (1 - k) + floor * k


# ---- erosion -----------------------------------------------------------------------------
def erode(h, pinned, iterations=46):
    nz, nx = h.shape
    offs = [(-1, 0, 1.0), (1, 0, 1.0), (0, -1, 1.0), (0, 1, 1.0),
            (-1, -1, 1.4142), (-1, 1, 1.4142), (1, -1, 1.4142), (1, 1, 1.4142)]
    flat = np.arange(nz * nx).reshape(nz, nx)
    for it in range(iterations):
        pad = np.pad(h, 1, mode='edge')
        best = np.zeros_like(h)
        rec = flat.copy()
        for (dz, dx, dist) in offs:
            nb = pad[1 + dz:1 + dz + nz, 1 + dx:1 + dx + nx]
            slope = (h - nb) / (COARSE * dist)
            better = slope > best
            best = np.where(better, slope, best)
            iz = np.clip(np.arange(nz)[:, None] + dz, 0, nz - 1)
            ix = np.clip(np.arange(nx)[None, :] + dx, 0, nx - 1)
            rec = np.where(better, flat[iz, ix], rec)
        # Flow accumulation, highest cell first.
        order = np.argsort(-h, axis=None)
        acc = np.ones(nz * nx)
        recf = rec.ravel()
        for i in order.tolist():
            r = recf[i]
            if r != i:
                acc[r] += acc[i]
        acc = acc.reshape(nz, nx)
        drop = h - h.ravel()[recf].reshape(nz, nx)
        cut = np.minimum(0.016 * acc ** 0.5 * best * COARSE, drop * 0.55)
        cut = np.minimum(cut, 5.0)
        h = h - np.where(pinned, 0, cut)
        # Thermal: what stands steeper than the talus angle slumps downhill.
        talus = 0.92 * COARSE
        for _ in range(2):
            pad = np.pad(h, 1, mode='edge')
            move = np.zeros_like(h)
            for (dz, dx, dist) in offs[:4]:
                nb = pad[1 + dz:1 + dz + nz, 1 + dx:1 + dx + nx]
                diff = h - nb
                out = np.maximum(0, diff - talus) * 0.11
                back = np.maximum(0, -diff - talus) * 0.11
                move += back - out
            h = h + np.where(pinned, 0, move)
        if it % 8 == 0:
            print('ERODE', it, float(h.min()), float(h.max()))
    return h, acc


def upsample(a, f):
    nz, nx = a.shape
    zs = (np.arange(nz * f) + 0.5) / f - 0.5
    z0 = np.clip(np.floor(zs).astype(int), 0, nz - 1)
    z1 = np.clip(z0 + 1, 0, nz - 1)
    wz = np.clip(zs - z0, 0, 1)[:, None]
    a = a[z0] * (1 - wz) + a[z1] * wz
    xs = (np.arange(nx * f) + 0.5) / f - 0.5
    x0 = np.clip(np.floor(xs).astype(int), 0, nx - 1)
    x1 = np.clip(x0 + 1, 0, nx - 1)
    wx = np.clip(xs - x0, 0, 1)[None, :]
    return a[:, x0] * (1 - wx) + a[:, x1] * wx


def blur(a, passes=1):
    for _ in range(passes):
        p = np.pad(a, 1, mode='edge')
        a = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:] + p[1:-1, 1:-1] * 2) / 6.0
    return a


def sun_shadow(h, cell):
    """0 lit .. 1 shadowed: march toward the sun over the field."""
    hx, hz = SUN[0], SUN[2]
    hor = np.hypot(hx, hz)
    ux, uz = hx / hor, hz / hor
    rise = SUN[1] / hor
    nz, nx = h.shape
    shadow = np.zeros_like(h)
    iz = np.arange(nz)[:, None]
    ix = np.arange(nx)[None, :]
    for k in range(1, 150):
        sx = np.clip(np.rint(ix + ux * k).astype(int), 0, nx - 1)
        sz = np.clip(np.rint(iz + uz * k).astype(int), 0, nz - 1)
        over = h[sz, sx] - (h + k * cell * rise)
        shadow = np.maximum(shadow, np.clip(over / 10.0, 0, 1))
    return shadow


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = argv[argv.index('--out') + 1] if '--out' in argv else os.path.join(os.path.dirname(__file__), 'out')
    os.makedirs(out, exist_ok=True)

    Xc, Zc = grid(COARSE)
    h, d = base_terrain(Xc, Zc)
    h = pin_floor(h, d, Xc, Zc)
    pinned = d < 60
    h, acc = erode(h, pinned)
    h = pin_floor(h, d, Xc, Zc)
    shadow_c = sun_shadow(h, COARSE)

    f = int(COARSE / FINE)
    H = blur(upsample(h, f), 3)
    Xf, Zf = grid(FINE)
    df = outside_shelf(Xf, Zf)
    gz, gx = np.gradient(H, FINE)
    slope = np.hypot(gx, gz)
    # Detail: craggy where it is steep, cobbled scree where it is not.
    crag = ridged(Xf / 34, Zf / 34, 131, 5) - 0.5
    fine = fbm(Xf / 7, Zf / 7, 141, 4) - 0.5
    amp = smooth(70, 150, df)
    H = H + (crag * (1.5 + 7.0 * np.clip(slope, 0, 1.3)) + fine * (0.6 + 1.0 * np.clip(slope, 0, 1))) * (0.25 + 0.75 * amp)
    # Bedding ledges on the steep faces: thin steps along the strata.
    ledge = np.sin((H + (fbm(Xf / 90, Zf / 90, 151, 3) - 0.5) * 30) * (2 * np.pi / 11.0))
    H = H + ledge * 1.1 * np.clip(slope - 0.5, 0, 1) * amp
    # Hold the floor near the shelf.
    near = smooth(80, 54, df)
    H = np.where(near > 0, np.minimum(H, FLOOR_MAX - 1 + (1 - near) * 400), H)
    H = np.where(df < 54, np.clip(H, FLOOR_MIN, FLOOR_MAX - 1), H)

    gz, gx = np.gradient(H, FINE)
    slope = np.hypot(gx, gz)
    nrm = np.stack([-gx, np.ones_like(gx), -gz], axis=-1)
    nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)

    # ---- albedo
    flow = upsample(np.log1p(acc), f)
    gully = smooth(3.2, 6.0, flow)
    lap = blur(H, 6) - H           # > 0 in hollows, < 0 on crests
    hollow = np.clip(lap / 2.5, -1, 1)
    bedh = H + Xf * 0.035 - Zf * 0.02 + (fbm(Xf / 110, Zf / 110, 171, 3) - 0.5) * 26
    bed = np.floor(bedh / 24.0).astype(np.int64)
    tone = BEDS[np.mod(bed, len(BEDS))] * (0.85 + 0.3 * _hash(bed, bed * 0 + 7, 72))[..., None]
    # One mountain, bedded: the beds tint a common grey-brown rock, with a
    # dark parting at each bed's foot and a slow mottle.
    parting = 1 - 0.3 * smooth(0.14, 0.0, bedh / 24.0 - bed)[..., None]
    mottle = (0.84 + 0.32 * fbm(Xf / 55, Zf / 55, 181, 4))[..., None]
    rock = (np.array([0.5, 0.46, 0.42]) * 0.5 + tone * 0.5) * parting * mottle * 0.78
    scree = np.array([0.27, 0.25, 0.225]) * (0.8 + 0.5 * fbm(Xf / 9, Zf / 9, 191, 3))[..., None]
    steep = smooth(0.55, 0.95, slope)[..., None]
    col = scree * (1 - steep) + rock * steep
    col = col * (1 - 0.45 * gully[..., None])
    # Snow: on the heights where it can lie, lower in the hollows and couloirs,
    # never on the steepest rock.
    line = 250 + (fbm(Xf / 150, Zf / 150, 211, 3) - 0.5) * 90 - hollow * 120 - gully * 70 + nrm[..., 0] * 30
    snow = smooth(0, 30, H - line) * smooth(1.0, 0.55, slope)
    snowc = np.array([0.8, 0.84, 0.9]) * (0.85 + 0.2 * fbm(Xf / 23, Zf / 23, 221, 3))[..., None]
    col = col * (1 - snow[..., None]) + snowc * snow[..., None]
    # Cavity shading and the baked sun shadow.
    ao = np.clip(1 - 0.34 * np.clip(hollow, 0, 1) + 0.12 * np.clip(-hollow, 0, 1), 0.55, 1.15)
    shade = blur(upsample(shadow_c, f), 4)
    # The sun never moves here: part of its light is baked in (relief that
    # survives the haze), the rest is the scene's own.
    sunl = np.clip((nrm * (SUN / np.linalg.norm(SUN))).sum(-1), 0, 1) * (1 - shade)
    warm = np.array([1.12, 1.0, 0.86])
    col = col * ao[..., None] * (0.62 + 0.75 * sunl[..., None] * warm)
    albedo = (np.clip(col, 0, 1) ** (1 / 2.2) * 255 + 0.5).astype(np.uint8)
    normal = (np.clip(nrm * 0.5 + 0.5, 0, 1) * 255 + 0.5).astype(np.uint8)

    # ---- the mesh grid (heights at the 6 yd lines)
    mx = int(round(HALF_X * 2 / MESH)) + 1
    mz = int(round(HALF_Z * 2 / MESH)) + 1
    ix = np.clip((np.arange(mx) * MESH / FINE).astype(int), 0, H.shape[1] - 1)
    iz = np.clip((np.arange(mz) * MESH / FINE).astype(int), 0, H.shape[0] - 1)
    Hs = blur(H, 2)
    mesh = Hs[np.ix_(iz, ix)].astype(np.float32)

    mesh.tofile(os.path.join(out, 'heights.f32'))
    albedo.tofile(os.path.join(out, 'albedo.rgb'))
    normal.tofile(os.path.join(out, 'normal.rgb'))
    meta = {
        'halfX': HALF_X, 'halfZ': HALF_Z, 'meshCell': MESH,
        'meshX': mx, 'meshZ': mz,
        'texX': int(H.shape[1]), 'texZ': int(H.shape[0]),
        'minY': float(H.min()), 'maxY': float(H.max()),
    }
    with open(os.path.join(out, 'meta.json'), 'w') as fh:
        json.dump(meta, fh, indent=1)
    print('MOUNTAINS', json.dumps(meta))


if __name__ == '__main__':
    main()
