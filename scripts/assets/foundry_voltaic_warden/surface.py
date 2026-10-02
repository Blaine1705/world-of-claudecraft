"""The Voltaic Warden surfaces: procedural bake shaders per kind (brass, iron,
copper, gear, steel, porcelain, rubber and the two-faced reversible plate), the
shared UV atlas, and the high-to-low Cycles bake into albedo, tangent normal,
roughness/metallic, occlusion and emissive maps (adapted from the Balgath and
Great Saurian kits).
"""
import math
import os

import bpy
import numpy as np

KINDS = ('skin', 'scute', 'moss', 'fern', 'bone', 'nail', 'tooth', 'eye', 'mouth', 'bamboo', 'cloth', 'banner',
         'leather', 'rope', 'hide', 'troll')


def srgb(c):
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


class NT:
    """Terse node-tree builder."""

    def __init__(self, mat):
        mat.use_nodes = True
        self.nt = mat.node_tree
        for n in list(self.nt.nodes):
            self.nt.nodes.remove(n)
        self.x = -1600
        self.out = self.node('ShaderNodeOutputMaterial')
        self.bsdf = self.node('ShaderNodeBsdfPrincipled')
        self.link(self.bsdf.outputs['BSDF'], self.out.inputs['Surface'])
        tc = self.node('ShaderNodeTexCoord')
        self.P = tc.outputs['Object']
        geo = self.node('ShaderNodeNewGeometry')
        self.N = geo.outputs['Normal']
        self.point = geo.outputs['Pointiness']
        sep = self.node('ShaderNodeSeparateXYZ')
        self.link(self.P, sep.inputs[0])
        self.px, self.py, self.pz = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
        sepn = self.node('ShaderNodeSeparateXYZ')
        self.link(self.N, sepn.inputs[0])
        self.nx, self.ny, self.nz = sepn.outputs['X'], sepn.outputs['Y'], sepn.outputs['Z']

    def node(self, kind, **inputs):
        n = self.nt.nodes.new(kind)
        n.location = (self.x, 0)
        self.x += 40
        for k, v in inputs.items():
            n.inputs[k].default_value = v
        return n

    def link(self, a, b):
        self.nt.links.new(a, b)

    def val(self, sock_or_val):
        return sock_or_val

    def _in(self, node, idx, v):
        if hasattr(v, 'is_output'):
            self.link(v, node.inputs[idx])
        else:
            sock = node.inputs[idx]
            if sock.type == 'RGBA' and isinstance(v, (int, float)):
                v = (v, v, v, 1.0)
            sock.default_value = v

    def math(self, op, a, b=0.0, clamp=False):
        n = self.node('ShaderNodeMath')
        n.operation = op
        n.use_clamp = clamp
        self._in(n, 0, a)
        self._in(n, 1, b)
        return n.outputs[0]

    def vmath(self, op, a, b=(0, 0, 0)):
        n = self.node('ShaderNodeVectorMath')
        n.operation = op
        self._in(n, 0, a)
        self._in(n, 1, b)
        return n.outputs[0]

    def noise(self, vec=None, scale=1.0, detail=4.0, rough=0.55, dist=0.0, w=None):
        n = self.node('ShaderNodeTexNoise')
        if w is not None:
            n.noise_dimensions = '4D'
            n.inputs['W'].default_value = w
        self.link(vec if vec is not None else self.P, n.inputs['Vector'])
        n.inputs['Scale'].default_value = scale
        n.inputs['Detail'].default_value = detail
        n.inputs['Roughness'].default_value = rough
        n.inputs['Distortion'].default_value = dist
        return n.outputs['Fac']

    def voronoi(self, vec=None, scale=1.0, feature='F1', out='Distance', rnd=1.0):
        n = self.node('ShaderNodeTexVoronoi')
        n.feature = feature
        self.link(vec if vec is not None else self.P, n.inputs['Vector'])
        n.inputs['Scale'].default_value = scale
        n.inputs['Randomness'].default_value = rnd
        return n.outputs[out]

    def scale_vec(self, sx, sy, sz, vec=None):
        n = self.node('ShaderNodeMapping')
        self.link(vec if vec is not None else self.P, n.inputs['Vector'])
        n.inputs['Scale'].default_value = (sx, sy, sz)
        return n.outputs['Vector']

    def ramp(self, fac, stops):
        """stops: [(pos, value_or_rgb)]; returns a Color socket."""
        n = self.node('ShaderNodeValToRGB')
        self._in(n, 0, fac)
        el = n.color_ramp.elements
        while len(el) < len(stops):
            el.new(0.5)
        for e, (pos, c) in zip(el, stops):
            e.position = pos
            e.color = c if (isinstance(c, tuple) and len(c) == 4) else (c, c, c, 1.0) if not isinstance(c, tuple) else (*c, 1.0)
        return n.outputs['Color']

    def mix(self, fac, a, b, blend='MIX'):
        n = self.node('ShaderNodeMix')
        n.data_type = 'RGBA'
        n.blend_type = blend
        self._in(n, 0, fac)
        sa = [s for s in n.inputs if s.name == 'A' and s.type == 'RGBA'][0]
        sb = [s for s in n.inputs if s.name == 'B' and s.type == 'RGBA'][0]
        for s, v in ((sa, a), (sb, b)):
            if hasattr(v, 'is_output'):
                self.link(v, s)
            else:
                s.default_value = v
        return [s for s in n.outputs if s.name == 'Result' and s.type == 'RGBA'][0]

    def fmix(self, fac, a, b):
        n = self.node('ShaderNodeMix')
        n.data_type = 'FLOAT'
        self._in(n, 0, fac)
        sa = [s for s in n.inputs if s.name == 'A' and s.type == 'VALUE'][0]
        sb = [s for s in n.inputs if s.name == 'B' and s.type == 'VALUE'][0]
        for s, v in ((sa, a), (sb, b)):
            if hasattr(v, 'is_output'):
                self.link(v, s)
            else:
                s.default_value = v
        return [s for s in n.outputs if s.name == 'Result' and s.type == 'VALUE'][0]

    def smooth(self, x, lo, hi):
        n = self.node('ShaderNodeMapRange')
        n.interpolation_type = 'SMOOTHSTEP'
        self._in(n, 0, x)
        self._in(n, 1, lo)
        self._in(n, 2, hi)
        return n.outputs[0]

    def bump(self, height, strength=0.3, distance=0.02, normal=None):
        n = self.node('ShaderNodeBump')
        self._in(n, 'Height', height)
        n.inputs['Strength'].default_value = strength
        n.inputs['Distance'].default_value = distance
        if normal is not None:
            self.link(normal, n.inputs['Normal'])
        return n.outputs['Normal']

    def finish(self, color, rough, metal, normal=None, mat=None, emit=None):
        self._in(self.bsdf, 'Base Color', color)
        self._in(self.bsdf, 'Roughness', rough)
        self._in(self.bsdf, 'Metallic', metal)
        if normal is not None:
            self.link(normal, self.bsdf.inputs['Normal'])
        # remember the metallic signal for the EMIT bake
        em = self.node('ShaderNodeEmission')
        em.name = 'METAL_EMIT'
        self._in(em, 'Color', metal)
        em.inputs['Strength'].default_value = 1.0
        # the base colour too: Cycles' diffuse-colour pass is black on full metals
        ce = self.node('ShaderNodeEmission')
        ce.name = 'COLOR_EMIT'
        self._in(ce, 'Color', color)
        ce.inputs['Strength'].default_value = 1.0
        # and the glow signal for the emissive bake
        ge = self.node('ShaderNodeEmission')
        ge.name = 'GLOW_EMIT'
        self._in(ge, 'Color', emit if emit is not None else (0.0, 0.0, 0.0, 1.0))
        ge.inputs['Strength'].default_value = 1.0




# ------------------------------------------------------------------ shared masks
def cavity(t, color, dark=0.55, light=1.12, lo=0.47, hi=0.53):
    concave = t.smooth(t.point, lo, lo - 0.08)
    convex = t.smooth(t.point, hi, hi + 0.08)
    color = t.mix(concave, color, t.mix(1.0, color, srgb((dark * 0.6, dark * 0.55, dark * 0.5)), 'MULTIPLY'))
    color = t.mix(t.math('MULTIPLY', convex, 0.6), color, t.mix(1.0, color, srgb((light, light, light * 0.97)), 'MULTIPLY'))
    return color


def length3(t, c):
    cx = t.node('ShaderNodeCombineXYZ')
    t.link(t.px, cx.inputs[0])
    t.link(t.py, cx.inputs[1])
    t.link(t.pz, cx.inputs[2])
    d = t.vmath('DISTANCE', cx.outputs[0], tuple(c))
    return [s for s in d.node.outputs if s.name == 'Value'][0]


def edge_mask(t, lo=0.53, hi=0.6):
    return t.smooth(t.point, lo, hi)


def concave_mask(t, lo=0.47, hi=0.4):
    return t.smooth(t.point, lo, hi)


SCORCH = [((0.0, -1.35, 6.42), 1.25, 0.9), ((0.0, 1.95, 9.5), 1.0, 0.8), ((3.2, -0.35, 3.0), 0.9, 0.7),
          ((-3.2, -0.35, 3.0), 0.9, 0.7), ((3.25, 0.0, 3.9), 0.75, 0.5), ((-3.25, 0.0, 3.9), 0.75, 0.5),
          ((2.42, 0.08, 9.15), 0.5, 0.6), ((-2.42, 0.08, 9.15), 0.5, 0.6), ((0.0, 2.45, 7.1), 0.9, 0.5)]


def scorch(t, color, rough, metal):
    """Soot and heat tint round the coil bay, the crown, the fists and the arm coils."""
    m = None
    for c, r, amt in SCORCH:
        d = length3(t, c)
        mm = t.math('MULTIPLY', t.smooth(d, r, r * 0.35), amt)
        m = mm if m is None else t.math('MAXIMUM', m, mm)
    n = t.noise(scale=3.2, detail=5, rough=0.6)
    m = t.math('MULTIPLY', m, t.smooth(n, 0.32, 0.6))
    m = t.math('MULTIPLY', m, t.math('SUBTRACT', 1.0, t.math('MULTIPLY', edge_mask(t), 0.5)))
    tint = t.math('MULTIPLY', t.smooth(m, 0.12, 0.3), t.smooth(m, 0.55, 0.3))
    color = t.mix(t.math('MULTIPLY', tint, 0.5), color, srgb((0.32, 0.22, 0.42)))
    color = t.mix(t.smooth(m, 0.25, 0.75), color, srgb((0.05, 0.045, 0.04)))
    rough = t.fmix(t.smooth(m, 0.25, 0.75), rough, 0.85)
    metal = t.fmix(t.smooth(m, 0.25, 0.75), metal, 0.2)
    return color, rough, metal


def grime(t, color, rough, amount=0.55):
    """Dirt settled in recesses and on undersides, streaked down by rain."""
    under = t.smooth(t.nz, -0.1, -0.8)
    streak = t.smooth(t.noise(t.scale_vec(7.0, 7.0, 0.6), scale=1.0, detail=3), 0.55, 0.72)
    m = t.math('MAXIMUM', t.math('MULTIPLY', concave_mask(t), 0.9), t.math('MULTIPLY', under, 0.5))
    m = t.math('MAXIMUM', m, t.math('MULTIPLY', streak, 0.35))
    m = t.math('MULTIPLY', m, amount)
    color = t.mix(m, color, t.mix(1.0, color, srgb((0.32, 0.28, 0.22)), 'MULTIPLY'))
    rough = t.fmix(m, rough, 0.85)
    return color, rough


def verdigris(t, color, rough, metal, amount=0.6, scale=2.6):
    up = t.smooth(t.nz, -0.2, 0.7)
    patch = t.smooth(t.noise(scale=scale, detail=6, rough=0.65, w=3.3), 0.5, 0.64)
    cav = concave_mask(t, 0.49, 0.42)
    m = t.math('MAXIMUM', t.math('MULTIPLY', patch, up), t.math('MULTIPLY', cav, 0.85))
    m = t.math('MULTIPLY', m, t.smooth(t.noise(scale=9, detail=3, w=1.7), 0.3, 0.5))
    m = t.math('MULTIPLY', m, amount)
    vc = t.mix(t.noise(scale=14, detail=3), srgb((0.22, 0.5, 0.42)), srgb((0.42, 0.7, 0.6)))
    color = t.mix(m, color, vc)
    rough = t.fmix(m, rough, 0.85)
    metal = t.fmix(m, metal, 0.0)
    return color, rough, metal


def wear(t, color, rough, metal, bright, amount=0.75):
    e = t.math('MULTIPLY', edge_mask(t, 0.535, 0.6), t.smooth(t.noise(scale=11, detail=4, w=0.7), 0.35, 0.55))
    e = t.math('MULTIPLY', e, amount)
    color = t.mix(e, color, srgb(bright))
    rough = t.fmix(e, rough, 0.22)
    metal = t.fmix(e, metal, 1.0)
    return color, rough, metal


def hammered(t, h, scale=16.0, amt=0.35):
    dents = t.voronoi(scale=scale, feature='F1')
    return t.math('ADD', h, t.math('MULTIPLY', t.smooth(dents, 0.0, 0.5), amt))


def between(t, x, lo, hi, soft=0.05):
    return t.math('MULTIPLY', t.smooth(x, lo - soft, lo + soft), t.smooth(x, hi + soft, hi - soft))


def attr(t, name):
    a = t.node('ShaderNodeAttribute')
    a.attribute_name = name
    sep = t.node('ShaderNodeSeparateColor')
    t.link(a.outputs['Color'], sep.inputs[0])
    return sep.outputs[0], sep.outputs[1], sep.outputs[2]


BLACK = (0.0, 0.0, 0.0, 1.0)


def shade(mat, kind):
    t = NT(mat)
    k = kind
    if k == 'brass':
        n = t.noise(scale=1.3, detail=4)
        base = t.ramp(n, [(0.3, srgb((0.5, 0.36, 0.15))), (0.7, srgb((0.7, 0.53, 0.24)))])
        tar = t.smooth(t.noise(scale=0.7, detail=3, w=2.1), 0.5, 0.72)
        base = t.mix(t.math('MULTIPLY', tar, 0.55), base, srgb((0.38, 0.26, 0.12)))
        rough = t.math('ADD', 0.34, t.math('MULTIPLY', t.noise(scale=5, detail=3), 0.18))
        metal = 1.0
        color = cavity(t, base, dark=0.35, light=1.12)
        color, rough = grime(t, color, rough, 0.6)
        color, rough, metal = verdigris(t, color, rough, metal, amount=0.55)
        color, rough, metal = wear(t, color, rough, metal, (0.86, 0.72, 0.42))
        color, rough, metal = scorch(t, color, rough, metal)
        h = hammered(t, t.math('MULTIPLY', t.noise(scale=40, detail=3), 0.15), 14.0, 0.3)
        t.finish(color, rough, metal, t.bump(h, 0.22, 0.01))
    elif k == 'iron':
        n = t.noise(scale=1.8, detail=4)
        base = t.ramp(n, [(0.3, srgb((0.09, 0.1, 0.11))), (0.7, srgb((0.17, 0.18, 0.2)))])
        rough = t.math('ADD', 0.5, t.math('MULTIPLY', t.noise(scale=6, detail=3), 0.2))
        metal = 0.85
        color = cavity(t, base, dark=0.45, light=1.25)
        rust = t.math('MULTIPLY', concave_mask(t, 0.48, 0.42), t.smooth(t.noise(scale=4, detail=5, w=4.4), 0.42, 0.6))
        streak = t.math('MULTIPLY', t.smooth(t.noise(t.scale_vec(8.0, 8.0, 0.7), scale=1.0, detail=3, w=1.1), 0.6, 0.75),
                        0.6)
        rust = t.math('MAXIMUM', rust, t.math('MULTIPLY', streak, t.smooth(t.noise(scale=1.5, w=2.0), 0.5, 0.65)))
        color = t.mix(rust, color, t.mix(t.noise(scale=20), srgb((0.24, 0.1, 0.04)), srgb((0.4, 0.2, 0.08))))
        rough = t.fmix(rust, rough, 0.9)
        metal = t.fmix(rust, metal, 0.1)
        # hazard paint on the coil housing's lower band
        stripes = t.smooth(t.math('SINE', t.math('MULTIPLY', t.math('ADD', t.px, t.pz), 9.0)), -0.05, 0.05)
        band = t.math('MULTIPLY', between(t, t.pz, 5.72, 5.98, 0.01), t.smooth(t.py, 1.15, 1.25))
        band = t.math('MULTIPLY', band, t.smooth(t.math('ABSOLUTE', t.px), 1.18, 1.1))
        chip = t.smooth(t.noise(scale=9, detail=4, w=5.0), 0.28, 0.4)
        paint = t.math('MULTIPLY', band, chip)
        pc = t.mix(stripes, srgb((0.05, 0.05, 0.05)), srgb((0.9, 0.76, 0.16)))
        color = t.mix(paint, color, pc)
        rough = t.fmix(paint, rough, 0.6)
        metal = t.fmix(paint, metal, 0.0)
        color, rough = grime(t, color, rough, 0.4)
        color, rough, metal = wear(t, color, rough, metal, (0.5, 0.52, 0.55), 0.85)
        color, rough, metal = scorch(t, color, rough, metal)
        # the two chest gauges: amber dials with a black needle
        emit = None
        for s in (1, -1):
            d = length3(t, (0.95 * s, -1.33, 7.21))
            dial = t.math('MULTIPLY', t.smooth(d, 0.13, 0.11), t.smooth(t.ny, -0.3, -0.6))
            needle = t.smooth(t.math('ABSOLUTE', t.math('SUBTRACT', t.px, 0.95 * s - 0.03 * s)), 0.012, 0.004)
            dc = t.mix(needle, srgb((0.95, 0.62, 0.2)), srgb((0.05, 0.03, 0.02)))
            color = t.mix(dial, color, dc)
            rough = t.fmix(dial, rough, 0.15)
            metal = t.fmix(dial, metal, 0.0)
            e = t.mix(dial, BLACK, t.mix(1.0, dc, (0.7, 0.45, 0.15, 1.0), 'MULTIPLY'))
            emit = e if emit is None else t.mix(1.0, emit, e, 'ADD')
        h = t.math('MULTIPLY', t.noise(scale=45, detail=3), 0.25)
        t.finish(color, rough, metal, t.bump(h, 0.18, 0.01), emit=emit)
    elif k == 'copper':
        n = t.noise(scale=2.0, detail=4)
        base = t.ramp(n, [(0.3, srgb((0.48, 0.2, 0.1))), (0.7, srgb((0.7, 0.33, 0.18)))])
        ox = t.smooth(t.noise(scale=1.1, detail=3, w=7.0), 0.48, 0.7)
        base = t.mix(t.math('MULTIPLY', ox, 0.6), base, srgb((0.26, 0.11, 0.06)))
        rough = t.math('ADD', 0.3, t.math('MULTIPLY', t.noise(scale=6, detail=2), 0.2))
        metal = 1.0
        color = cavity(t, base, dark=0.4, light=1.15)
        color, rough, metal = verdigris(t, color, rough, metal, amount=0.9, scale=3.4)
        color, rough, metal = wear(t, color, rough, metal, (0.9, 0.55, 0.36))
        color, rough, metal = scorch(t, color, rough, metal)
        h = t.math('MULTIPLY', t.noise(scale=55, detail=3), 0.2)
        t.finish(color, rough, metal, t.bump(h, 0.2, 0.008))
    elif k == 'gear':
        n = t.noise(scale=3.0, detail=3)
        base = t.ramp(n, [(0.3, srgb((0.2, 0.2, 0.21))), (0.7, srgb((0.32, 0.31, 0.3)))])
        rough = t.math('ADD', 0.3, t.math('MULTIPLY', t.noise(scale=8, detail=2), 0.15))
        metal = 1.0
        color = cavity(t, base, dark=0.3, light=1.3)
        oil = t.math('MULTIPLY', concave_mask(t), t.smooth(t.noise(scale=6, detail=3, w=8.0), 0.4, 0.6))
        color = t.mix(oil, color, srgb((0.04, 0.035, 0.03)))
        rough = t.fmix(oil, rough, 0.18)
        color, rough, metal = wear(t, color, rough, metal, (0.85, 0.66, 0.36), 1.0)
        color, rough, metal = scorch(t, color, rough, metal)
        t.finish(color, rough, metal, t.bump(t.math('MULTIPLY', t.noise(scale=80, detail=2), 0.2), 0.15, 0.005))
    elif k == 'steel':
        scr = t.noise(t.scale_vec(60.0, 60.0, 2.0), scale=1.0, detail=3)
        base = t.ramp(scr, [(0.3, srgb((0.62, 0.63, 0.65))), (0.7, srgb((0.82, 0.83, 0.85)))])
        rough = t.math('ADD', 0.1, t.math('MULTIPLY', scr, 0.1))
        oil = t.math('MULTIPLY', t.smooth(t.noise(scale=4, detail=3, w=2.2), 0.55, 0.7), 0.7)
        base = t.mix(oil, base, srgb((0.25, 0.22, 0.18)))
        t.finish(base, rough, 1.0, t.bump(scr, 0.05, 0.004))
    elif k == 'porcelain':
        n = t.noise(scale=3.0, detail=3)
        base = t.ramp(n, [(0.3, srgb((0.78, 0.74, 0.64))), (0.7, srgb((0.9, 0.87, 0.78)))])
        craze = t.smooth(t.voronoi(scale=18, feature='DISTANCE_TO_EDGE'), 0.02, 0.0)
        base = t.mix(t.math('MULTIPLY', craze, 0.25), base, srgb((0.45, 0.4, 0.32)))
        color = cavity(t, base, dark=0.5, light=1.05)
        rough = 0.14
        metal = 0.0
        color, rough = grime(t, color, rough, 0.5)
        track = t.math('MULTIPLY', t.smooth(t.noise(t.scale_vec(14.0, 14.0, 1.0), scale=1.0, detail=4, w=9.0), 0.62,
                                            0.72), 0.8)
        color = t.mix(track, color, srgb((0.12, 0.1, 0.1)))
        color, rough, metal = scorch(t, color, rough, metal)
        t.finish(color, rough, metal, t.bump(t.math('MULTIPLY', craze, -1.0), 0.05, 0.003))
    elif k == 'rubber':
        s = t.math('ADD', t.math('ADD', t.px, t.py), t.pz)
        weave = t.math('MULTIPLY', t.math('SINE', t.math('MULTIPLY', s, 90.0)), 0.5)
        base = t.ramp(t.noise(scale=4, detail=3), [(0.3, srgb((0.04, 0.04, 0.045))), (0.7, srgb((0.1, 0.09, 0.08)))])
        color, rough = grime(t, base, 0.72, 0.7)
        t.finish(color, rough, 0.0, t.bump(weave, 0.25, 0.006))
    elif k == 'plate':
        un, vn, side = attr(t, 'PL')
        bolt, ground, rim = attr(t, 'PM')
        a_inner = t.node('ShaderNodeAttribute')
        a_inner.attribute_name = 'PM'
        inner = a_inner.outputs['Alpha']
        cop = t.smooth(side, 0.45, 0.55)
        # copper face: hammered warm copper and a polished earth-ground emblem
        cn = t.noise(scale=3.0, detail=4)
        cc = t.ramp(cn, [(0.3, srgb((0.78, 0.36, 0.15))), (0.7, srgb((0.95, 0.5, 0.24)))])
        cc = t.mix(ground, cc, srgb((1.0, 0.84, 0.5)))
        cc = cavity(t, cc, dark=0.35, light=1.2)
        cr = t.fmix(ground, t.math('ADD', 0.28, t.math('MULTIPLY', t.voronoi(scale=26), 0.15)), 0.18)
        cm = 1.0
        cc, cr, cm = verdigris(t, cc, cr, cm, amount=0.2, scale=4.0)
        cc, cr, cm = wear(t, cc, cr, cm, (1.0, 0.68, 0.45))
        # charged face: cobalt enamel, a glowing glass field with veins, a white-hot bolt
        veins = t.smooth(t.voronoi(scale=9, feature='DISTANCE_TO_EDGE'), 0.035, 0.0)
        bc = t.mix(inner, srgb((0.025, 0.07, 0.2)), srgb((0.08, 0.36, 0.85)))
        bc = t.mix(t.math('MULTIPLY', veins, inner), bc, srgb((0.45, 0.8, 1.0)))
        bc = t.mix(bolt, bc, srgb((0.86, 0.97, 1.0)))
        studs = t.math('MULTIPLY', edge_mask(t, 0.55, 0.62), t.math('SUBTRACT', 1.0, rim))
        bc = t.mix(t.math('MULTIPLY', studs, t.math('SUBTRACT', 1.0, inner)), bc, srgb((0.85, 0.83, 0.76)))
        br = t.fmix(inner, 0.32, 0.08)
        bm = t.fmix(inner, 0.35, 0.0)
        be = t.mix(inner, BLACK, srgb((0.05, 0.3, 0.85)))
        be = t.mix(t.math('MULTIPLY', veins, inner), be, srgb((0.35, 0.72, 1.0)))
        be = t.mix(bolt, be, srgb((0.9, 0.98, 1.0)))
        # the frame round both faces: dark iron
        fc = cavity(t, srgb((0.2, 0.19, 0.18)), dark=0.4, light=1.6)
        color = t.mix(cop, bc, cc)
        rough = t.fmix(cop, br, cr)
        metal = t.fmix(cop, bm, cm)
        emit = t.mix(cop, be, BLACK)
        color = t.mix(rim, color, fc)
        rough = t.fmix(rim, rough, 0.45)
        metal = t.fmix(rim, metal, 0.85)
        emit = t.mix(rim, emit, BLACK)
        h = t.math('ADD', t.math('MULTIPLY', cop, t.math('MULTIPLY', t.voronoi(scale=26), 0.5)),
                   t.math('MULTIPLY', veins, -0.3))
        t.finish(color, rough, metal, t.bump(h, 0.2, 0.006), emit=emit)
    else:
        raise ValueError(kind)
    return mat


KINDS = ('brass', 'iron', 'copper', 'gear', 'steel', 'porcelain', 'rubber', 'plate')


def bake_materials():
    return {k: shade(bpy.data.materials.new('Bake_' + k), k) for k in KINDS}


# ------------------------------------------------------------------ uv
# ------------------------------------------------------------------ uv
def unwrap(objs, scale_fn=None, margin=0.0035):
    """One shared UV atlas over many low objects: smart project, equalize texel
    density, then let `scale_fn(obj, face_center) -> float` boost islands (the
    face, the eye and the hands get more texels), and pack."""
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
        if not o.data.uv_layers:
            o.data.uv_layers.new(name='UVMap')
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(52), island_margin=margin, area_weight=0.0,
                             scale_to_bounds=False)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()
    bpy.ops.object.mode_set(mode='OBJECT')
    if scale_fn is not None:
        import bmesh
        for o in objs:
            bm = bmesh.new()
            bm.from_mesh(o.data)
            uv = bm.loops.layers.uv.active
            # islands: flood over shared UV coordinates
            seen = set()
            for f in bm.faces:
                if f.index in seen:
                    continue
                stack, island = [f], []
                seen.add(f.index)
                while stack:
                    g = stack.pop()
                    island.append(g)
                    for e in g.edges:
                        for h in e.link_faces:
                            if h.index in seen:
                                continue
                            # same island if the UVs agree across the edge
                            ok = True
                            for v in e.verts:
                                a = [lp[uv].uv for lp in g.loops if lp.vert == v][0]
                                b = [lp[uv].uv for lp in h.loops if lp.vert == v][0]
                                if (a - b).length > 1e-5:
                                    ok = False
                            if ok:
                                seen.add(h.index)
                                stack.append(h)
                c = sum((g.calc_center_median() for g in island), start=island[0].calc_center_median() * 0) / len(island)
                k = scale_fn(o, c)
                if abs(k - 1.0) > 1e-3:
                    uvs = [lp[uv] for g in island for lp in g.loops]
                    cen = sum((l.uv for l in uvs), start=uvs[0].uv * 0) / len(uvs)
                    for l in uvs:
                        l.uv = cen + (l.uv - cen) * k
            bm.to_mesh(o.data)
            bm.free()
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    try:
        bpy.ops.uv.pack_islands(udim_source='CLOSEST_UDIM', rotate=True, margin_method='FRACTION', margin=margin,
                                shape_method='CONCAVE', scale=True)
    except TypeError:
        bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')


# ------------------------------------------------------------------ bake
def bake_all(highs, low, size=4096, samples=64, cage=0.05, ray=0.35, out_dir=None):
    """Bake every pass selected-to-active from `highs` onto the joined `low`.
    Returns numpy arrays (albedo, normal, rough, metal, ao), each (size, size, 4)."""
    from stage import use_gpu
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    print('BAKE_DEVICE', use_gpu(scene))
    scene.cycles.samples = samples
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.cage_extrusion = cage
    scene.render.bake.max_ray_distance = ray
    scene.render.bake.margin = 8
    scene.render.bake.use_clear = True
    # Only the highs may occlude or be hit: hide every other object from the
    # render, and make the low itself invisible to rays (else the occlusion pass
    # sees the low skin hovering over the high one and goes black in patches).
    hidden = []
    for o in scene.objects:
        if o is low or o in highs or o.hide_render:
            continue
        o.hide_render = True
        hidden.append(o)
    for attr in ('visible_camera', 'visible_diffuse', 'visible_glossy', 'visible_transmission',
                 'visible_volume_scatter', 'visible_shadow'):
        setattr(low, attr, False)
    target = bpy.data.materials.new('BakeTarget')
    target.use_nodes = True
    low.data.materials.clear()
    low.data.materials.append(target)
    node = target.node_tree.nodes.new('ShaderNodeTexImage')
    target.node_tree.nodes.active = node
    results = {}

    def run(name, btype, colorspace='sRGB', **kw):
        img = bpy.data.images.new(f'Voltaic_{name}', size, size, alpha=False, float_buffer=(name == 'normal'))
        img.colorspace_settings.name = colorspace
        node.image = img
        for o in bpy.context.selected_objects:
            o.select_set(False)
        for h in highs:
            h.select_set(True)
        low.select_set(True)
        bpy.context.view_layer.objects.active = low
        bpy.ops.object.bake(type=btype, **kw)
        a = np.array(img.pixels[:], dtype=np.float32).reshape(size, size, 4)
        results[name] = a
        if out_dir:
            img.filepath_raw = os.path.join(out_dir, f'voltaic_{name}_raw.png')
            img.file_format = 'PNG'
            img.save()
        print('BAKED', name, a[..., :3].mean(axis=(0, 1)), flush=True)
        return img

    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.use_pass_color = True
    scene.cycles.samples = max(4, samples // 6)

    def emit_pass(node_name, name, colorspace):
        saved = []
        for h in highs:
            for slot in h.material_slots:
                m = slot.material
                if m is None or node_name not in m.node_tree.nodes:
                    continue
                nt = m.node_tree
                out = [n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'][0]
                prev = out.inputs['Surface'].links[0].from_socket
                if any(nt is s_[0] for s_ in saved):
                    continue
                nt.links.new(nt.nodes[node_name].outputs[0], out.inputs['Surface'])
                saved.append((nt, prev, out))
        run(name, 'EMIT', colorspace)
        for nt, prev, out in saved:
            nt.links.new(prev, out.inputs['Surface'])

    emit_pass('COLOR_EMIT', 'albedo', 'sRGB')
    run('rough', 'ROUGHNESS', 'Non-Color')
    emit_pass('METAL_EMIT', 'metal', 'Non-Color')
    emit_pass('GLOW_EMIT', 'emit', 'sRGB')
    scene.cycles.samples = max(4, samples // 6)
    run('normal', 'NORMAL', 'Non-Color', normal_space='TANGENT')
    scene.cycles.samples = samples
    scene.world = scene.world or bpy.data.worlds.new('bakeworld')
    scene.world.light_settings.distance = 0.9
    run('ao', 'AO', 'Non-Color')
    for o in hidden:
        o.hide_render = False
    return results
