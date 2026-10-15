#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Aura Sans - parametric geometric sans-serif font builder.

Builds a complete Latin typeface from geometric primitives (circles, arc
bands, capsules, stroked beziers) via a signed-distance-field pipeline and
writes TTF + WOFF2 using fontTools.

Usage:  py -3 build_aura_font.py [out_dir]
"""

import math
import os
import sys

from fontTools.fontBuilder import FontBuilder
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.pens.ttGlyphPen import TTGlyphPen


# ---------------------------------------------------------------------------
# Signed distance field shapes
# ---------------------------------------------------------------------------

class Circle:
    __slots__ = ("cx", "cy", "r")

    def __init__(self, cx, cy, r):
        self.cx, self.cy, self.r = cx, cy, r

    def dist(self, x, y):
        return math.hypot(x - self.cx, y - self.cy) - self.r

    def bbox(self):
        return (self.cx - self.r, self.cy - self.r, self.cx + self.r, self.cy + self.r)


class Capsule:
    """Stroke of a straight segment with round caps."""

    __slots__ = ("ax", "ay", "bx", "by", "dx", "dy", "l", "w2", "x0", "y0", "x1", "y1")

    def __init__(self, ax, ay, bx, by, w):
        self.ax, self.ay, self.bx, self.by = ax, ay, bx, by
        self.dx, self.dy = bx - ax, by - ay
        self.l = math.hypot(self.dx, self.dy)
        self.w2 = w / 2.0
        self.x0 = min(ax, bx) - self.w2
        self.y0 = min(ay, by) - self.w2
        self.x1 = max(ax, bx) + self.w2
        self.y1 = max(ay, by) + self.w2

    def dist(self, x, y):
        if self.l == 0:
            return math.hypot(x - self.ax, y - self.ay) - self.w2
        t = ((x - self.ax) * self.dx + (y - self.ay) * self.dy) / (self.l * self.l)
        if t < 0:
            t = 0
        elif t > 1:
            t = 1
        px = self.ax + t * self.dx
        py = self.ay + t * self.dy
        return math.hypot(x - px, y - py) - self.w2

    def bbox(self):
        return (self.x0, self.y0, self.x1, self.y1)


class Ring:
    """Circular arc band (flat radial end faces). Angles in degrees, a1 > a0."""

    __slots__ = ("cx", "cy", "r", "w2", "a0", "a1", "span", "x0", "y0", "x1", "y1")

    def __init__(self, cx, cy, r, w, a0, a1):
        self.cx, self.cy, self.r = cx, cy, r
        self.w2 = w / 2.0
        self.a0 = math.radians(a0)
        self.a1 = math.radians(a1)
        self.span = self.a1 - self.a0
        self.x0 = cx - r - self.w2
        self.y0 = cy - r - self.w2
        self.x1 = cx + r + self.w2
        self.y1 = cy + r + self.w2

    def dist(self, x, y):
        dx = x - self.cx
        dy = y - self.cy
        d = math.hypot(dx, dy)
        band = abs(d - self.r) - self.w2
        if d < 1e-9:
            return band
        a = math.atan2(dy, dx)
        ap = (a - self.a0) % (2 * math.pi)
        if ap <= self.span:
            return band
        da = min(ap - self.span, 2 * math.pi - ap)
        ang = d * math.sin(da)
        return max(band, ang)

    def bbox(self):
        return (self.x0, self.y0, self.x1, self.y1)


def _ellipse_sdf(x, y, rx, ry):
    """Signed distance from (x, y) to the ellipse surface (y-up, centered)."""
    px, py = abs(x), abs(y)
    if px < 1e-12 and py < 1e-12:
        return -min(rx, ry)
    if abs(rx - ry) < 1e-9:
        return math.hypot(x, y) - rx
    t = math.pi / 4.0
    for _ in range(6):
        ct = math.cos(t)
        st = math.sin(t)
        g = rx * px * st - ry * py * ct - (rx * rx - ry * ry) * st * ct
        gp = rx * px * ct + ry * py * st - (rx * rx - ry * ry) * (ct * ct - st * st)
        if gp == 0:
            break
        t -= g / gp
    ex = rx * math.cos(t)
    ey = ry * math.sin(t)
    d = math.hypot(px - ex, py - ey)
    if (px / rx) ** 2 + (py / ry) ** 2 < 1.0:
        return -d
    return d


class EllipseRing:
    """Arc band around an ellipse (flat radial end faces)."""

    __slots__ = ("cx", "cy", "rx", "ry", "w2", "a0", "a1", "span", "x0", "y0", "x1", "y1")

    def __init__(self, cx, cy, rx, ry, w, a0, a1):
        self.cx, self.cy, self.rx, self.ry = cx, cy, rx, ry
        self.w2 = w / 2.0
        self.a0 = math.radians(a0)
        self.a1 = math.radians(a1)
        self.span = self.a1 - self.a0
        self.x0 = cx - rx - self.w2
        self.y0 = cy - ry - self.w2
        self.x1 = cx + rx + self.w2
        self.y1 = cy + ry + self.w2

    def dist(self, x, y):
        de = _ellipse_sdf(x - self.cx, y - self.cy, self.rx, self.ry)
        band = abs(de) - self.w2
        dx = x - self.cx
        dy = y - self.cy
        d = math.hypot(dx, dy)
        if d < 1e-9:
            return band
        a = math.atan2(dy, dx)
        ap = (a - self.a0) % (2 * math.pi)
        if ap <= self.span:
            return band
        da = min(ap - self.span, 2 * math.pi - ap)
        ang = d * math.sin(da)
        return max(band, ang)

    def bbox(self):
        return (self.x0, self.y0, self.x1, self.y1)


class RRect:
    """Filled axis-aligned rounded rectangle."""

    __slots__ = ("x0", "y0", "x1", "y1", "r", "cx", "cy", "hx", "hy")

    def __init__(self, x0, y0, x1, y1, r):
        self.x0, self.y0, self.x1, self.y1 = x0, y0, x1, y1
        self.r = r
        self.cx = (x0 + x1) / 2.0
        self.cy = (y0 + y1) / 2.0
        self.hx = (x1 - x0) / 2.0
        self.hy = (y1 - y0) / 2.0

    def dist(self, x, y):
        qx = abs(x - self.cx) - (self.hx - self.r)
        qy = abs(y - self.cy) - (self.hy - self.r)
        ax = qx if qx > 0 else 0.0
        ay = qy if qy > 0 else 0.0
        return math.hypot(ax, ay) + min(max(qx, qy), 0.0) - self.r

    def bbox(self):
        return (self.x0, self.y0, self.x1, self.y1)


class RRectRing:
    """Stroke of a rounded rectangle (constant-width band)."""

    __slots__ = ("inner", "w2")

    def __init__(self, x0, y0, x1, y1, r, w):
        self.inner = RRect(x0, y0, x1, y1, r)
        self.w2 = w / 2.0

    def dist(self, x, y):
        return abs(self.inner.dist(x, y)) - self.w2

    def bbox(self):
        x0, y0, x1, y1 = self.inner.bbox()
        return (x0 - self.w2, y0 - self.w2, x1 + self.w2, y1 + self.w2)


def _flatten_bez3(p0, p1, p2, p3, out):
    """Adaptive flattening of a cubic bezier into out (list of points)."""
    a = p1[0] - p0[0]
    b = p1[1] - p0[1]
    c = p2[0] - p0[0]
    d = p2[1] - p0[1]
    e = p3[0] - p0[0]
    f = p3[1] - p0[1]
    flat = (a * f - b * e) * (a * f - b * e)
    flat += (c * f - d * e) * (c * f - d * e)
    if flat < 0.05:
        out.append(p3)
        return
    ab = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
    bc = ((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2)
    cd = ((p2[0] + p3[0]) / 2, (p2[1] + p3[1]) / 2)
    abc = ((ab[0] + bc[0]) / 2, (ab[1] + bc[1]) / 2)
    bcd = ((bc[0] + cd[0]) / 2, (bc[1] + cd[1]) / 2)
    abcd = ((abc[0] + bcd[0]) / 2, (abc[1] + bcd[1]) / 2)
    _flatten_bez3(p0, ab, abc, abcd, out)
    _flatten_bez3(abcd, bcd, cd, p3, out)


class BezierStroke:
    """Stroke of an open cubic bezier chain.

    pts is a list of (x, y) tuples: [p0, c1, c2, p1, c3, c4, p2, ...]
    """

    __slots__ = ("w2", "poly", "x0", "y0", "x1", "y1")

    def __init__(self, pts, w):
        self.w2 = w / 2.0
        flat = []
        i = 0
        while i < len(pts) - 1:
            p0 = pts[i]
            if i + 3 <= len(pts) - 1:
                p1, p2, p3 = pts[i + 1], pts[i + 2], pts[i + 3]
                _flatten_bez3(p0, p1, p2, p3, flat)
                i += 3
            else:
                flat.append(pts[i + 1])
                i += 1
        self.poly = flat
        xs = [p[0] for p in flat]
        ys = [p[1] for p in flat]
        self.x0 = min(xs) - self.w2
        self.y0 = min(ys) - self.w2
        self.x1 = max(xs) + self.w2
        self.y1 = max(ys) + self.w2

    def dist(self, x, y):
        best = 1e18
        poly = self.poly
        ax, ay = poly[0]
        for bx, by in poly[1:]:
            dx = bx - ax
            dy = by - ay
            l2 = dx * dx + dy * dy
            t = 0.0
            if l2 > 0:
                t = ((x - ax) * dx + (y - ay) * dy) / l2
                if t < 0:
                    t = 0.0
                elif t > 1:
                    t = 1.0
            px = ax + t * dx
            py = ay + t * dy
            dd = (x - px) * (x - px) + (y - py) * (y - py)
            if dd < best:
                best = dd
            ax, ay = bx, by
        return math.sqrt(best) - self.w2

    def bbox(self):
        return (self.x0, self.y0, self.x1, self.y1)


class T:
    """Translate a shape by (tx, ty)."""

    __slots__ = ("shape", "tx", "ty", "x0", "y0", "x1", "y1")

    def __init__(self, shape, tx, ty):
        self.shape = shape
        self.tx, self.ty = tx, ty
        x0, y0, x1, y1 = shape.bbox()
        self.x0, self.y0, self.x1, self.y1 = x0 + tx, y0 + ty, x1 + tx, y1 + ty

    def dist(self, x, y):
        return self.shape.dist(x - self.tx, y - self.ty)

    def bbox(self):
        return (self.x0, self.y0, self.x1, self.y1)


# ---------------------------------------------------------------------------
# Glyph = signed union of included shapes minus union of excluded shapes
# ---------------------------------------------------------------------------

class Glyph:
    __slots__ = ("inc", "exc", "x0", "y0", "x1", "y1")

    def __init__(self, inc, exc=None):
        self.inc = list(inc)
        self.exc = list(exc) if exc else []
        if self.inc:
            xs0 = [s.bbox()[0] for s in self.inc]
            ys0 = [s.bbox()[1] for s in self.inc]
            xs1 = [s.bbox()[2] for s in self.inc]
            ys1 = [s.bbox()[3] for s in self.inc]
            self.x0 = min(xs0)
            self.y0 = min(ys0)
            self.x1 = max(xs1)
            self.y1 = max(ys1)
        else:
            self.x0 = self.y0 = self.x1 = self.y1 = 0.0

    def sdf(self, x, y):
        if not self.inc:
            return 1e9
        d = min((s.dist(x, y) for s in self.inc))
        if self.exc:
            ex = min((s.dist(x, y) for s in self.exc))
            if -ex > d:
                d = -ex
        return d


# ---------------------------------------------------------------------------
# Rasterisation: SDF -> contour polygons
# ---------------------------------------------------------------------------

def rasterize(glyph, cell=2.0, margin=3.0):
    x0 = glyph.x0 - margin
    y0 = glyph.y0 - margin
    x1 = glyph.x1 + margin
    y1 = glyph.y1 + margin
    nx = int(math.ceil((x1 - x0) / cell)) + 1
    ny = int(math.ceil((y1 - y0) / cell)) + 1
    grid = []
    for j in range(ny):
        y = y0 + (j + 0.5) * cell
        row = []
        incs = [s for s in glyph.inc if s.bbox()[1] - 1e-9 <= y <= s.bbox()[3] + 1e-9]
        excs = [s for s in glyph.exc if s.bbox()[1] - 1e-9 <= y <= s.bbox()[3] + 1e-9]
        for i in range(nx):
            x = x0 + (i + 0.5) * cell
            d = min((s.dist(x, y) for s in incs)) if incs else 1e9
            if excs:
                ex = min((s.dist(x, y) for s in excs))
                if -ex > d:
                    d = -ex
            row.append(d)
        grid.append(row)
    return grid, x0, y0, cell


def _edge_point(grid, j, i, edge, x0, y0, cell):
    if edge == 0:
        a = grid[j][i]
        b = grid[j][i + 1]
        t = a / (a - b) if (a - b) else 0.5
        return (x0 + (i + t) * cell, y0 + j * cell)
    if edge == 1:
        a = grid[j][i + 1]
        b = grid[j + 1][i + 1]
        t = a / (a - b) if (a - b) else 0.5
        return (x0 + (i + 1) * cell, y0 + (j + t) * cell)
    if edge == 2:
        a = grid[j + 1][i]
        b = grid[j + 1][i + 1]
        t = a / (a - b) if (a - b) else 0.5
        return (x0 + (i + t) * cell, y0 + (j + 1) * cell)
    a = grid[j][i]
    b = grid[j + 1][i]
    t = a / (a - b) if (a - b) else 0.5
    return (x0 + i * cell, y0 + (j + t) * cell)


def marching_squares(grid, x0, y0, cell):
    h = len(grid)
    w = len(grid[0])
    segs = []
    for j in range(h - 1):
        for i in range(w - 1):
            v00 = grid[j][i]
            v10 = grid[j][i + 1]
            v11 = grid[j + 1][i + 1]
            v01 = grid[j + 1][i]
            case = 0
            if v00 < 0:
                case |= 1
            if v10 < 0:
                case |= 2
            if v11 < 0:
                case |= 4
            if v01 < 0:
                case |= 8
            if case == 0 or case == 15:
                continue
            e = _edge_point
            if case in (1, 14):
                segs.append((e(grid, j, i, 3, x0, y0, cell), e(grid, j, i, 0, x0, y0, cell)))
            elif case in (2, 13):
                segs.append((e(grid, j, i, 0, x0, y0, cell), e(grid, j, i, 1, x0, y0, cell)))
            elif case in (3, 12):
                segs.append((e(grid, j, i, 3, x0, y0, cell), e(grid, j, i, 1, x0, y0, cell)))
            elif case in (4, 11):
                segs.append((e(grid, j, i, 2, x0, y0, cell), e(grid, j, i, 1, x0, y0, cell)))
            elif case in (6, 9):
                segs.append((e(grid, j, i, 0, x0, y0, cell), e(grid, j, i, 2, x0, y0, cell)))
            elif case in (7, 8):
                segs.append((e(grid, j, i, 3, x0, y0, cell), e(grid, j, i, 2, x0, y0, cell)))
            elif case == 5:
                if (v00 + v10 + v11 + v01) / 4 < 0:
                    segs.append((e(grid, j, i, 0, x0, y0, cell), e(grid, j, i, 3, x0, y0, cell)))
                    segs.append((e(grid, j, i, 1, x0, y0, cell), e(grid, j, i, 2, x0, y0, cell)))
                else:
                    segs.append((e(grid, j, i, 0, x0, y0, cell), e(grid, j, i, 1, x0, y0, cell)))
                    segs.append((e(grid, j, i, 3, x0, y0, cell), e(grid, j, i, 2, x0, y0, cell)))
            elif case == 10:
                if (v00 + v10 + v11 + v01) / 4 < 0:
                    segs.append((e(grid, j, i, 0, x0, y0, cell), e(grid, j, i, 1, x0, y0, cell)))
                    segs.append((e(grid, j, i, 3, x0, y0, cell), e(grid, j, i, 2, x0, y0, cell)))
                else:
                    segs.append((e(grid, j, i, 0, x0, y0, cell), e(grid, j, i, 3, x0, y0, cell)))
                    segs.append((e(grid, j, i, 1, x0, y0, cell), e(grid, j, i, 2, x0, y0, cell)))
    return segs


def assemble(segs):
    adj = {}
    for idx, s in enumerate(segs):
        for p in (s[0], s[1]):
            k = (round(p[0], 5), round(p[1], 5))
            adj.setdefault(k, []).append(idx)
    contours = []
    used = [False] * len(segs)
    for start in range(len(segs)):
        if used[start]:
            continue
        used[start] = True
        loop = [segs[start][0], segs[start][1]]
        cur = segs[start][1]
        cur_key = (round(cur[0], 5), round(cur[1], 5))
        guard = 0
        while guard < 200000:
            guard += 1
            nxt = None
            for idx in adj.get(cur_key, []):
                if not used[idx]:
                    nxt = idx
                    break
            if nxt is None:
                break
            s = segs[nxt]
            used[nxt] = True
            if (round(s[0][0], 5), round(s[0][1], 5)) == cur_key:
                loop.append(s[1])
                cur = s[1]
            else:
                loop.append(s[0])
                cur = s[0]
            cur_key = (round(cur[0], 5), round(cur[1], 5))
            if cur_key == (round(loop[0][0], 5), round(loop[0][1], 5)):
                loop = loop[:-1]
                break
        if len(loop) >= 3:
            contours.append(loop)
    return contours


def _dp_recurse(pts, i0, i1, tol, keep):
    x0, y0 = pts[i0]
    x1, y1 = pts[i1]
    dx = x1 - x0
    dy = y1 - y0
    l2 = dx * dx + dy * dy
    dmax = 0.0
    idx = -1
    for i in range(i0 + 1, i1):
        px, py = pts[i]
        t = 0.0
        if l2 > 0:
            t = ((px - x0) * dx + (py - y0) * dy) / l2
            if t < 0:
                t = 0.0
            elif t > 1:
                t = 1.0
        qx = x0 + t * dx
        qy = y0 + t * dy
        d = math.hypot(px - qx, py - qy)
        if d > dmax:
            dmax = d
            idx = i
    if dmax > tol and idx != -1:
        _dp_recurse(pts, i0, idx, tol, keep)
        keep.append(idx)
        _dp_recurse(pts, idx, i1, tol, keep)


def simplify(contour, tol=1.0):
    pts = contour
    if len(pts) <= 4:
        return pts
    keep = [0]
    _dp_recurse(pts, 0, len(pts) - 1, tol, keep)
    keep.append(len(pts) - 1)
    keep.sort()
    return [pts[i] for i in keep]


def _area(pts):
    a = 0.0
    n = len(pts)
    for i in range(n):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % n]
        a += x0 * y1 - x1 * y0
    return a / 2.0


def glyph_contours(glyph):
    grid, x0, y0, cell = rasterize(glyph)
    segs = marching_squares(grid, x0, y0, cell)
    contours = assemble(segs)
    out = []
    for c in contours:
        s = simplify(c, 1.0)
        if len(s) < 3:
            continue
        if abs(_area(s)) < 30.0:
            continue
        out.append(s)
    if out:
        biggest = max(out, key=lambda c: abs(_area(c)))
        if _area(biggest) > 0:
            out = [list(reversed(c)) for c in out]
    return out


# ---------------------------------------------------------------------------
# Shape helpers
# ---------------------------------------------------------------------------

def vbar(x, y0, y1, w):
    return Capsule(x, y0, x, y1, w)


def hbar(y, x0, x1, w):
    return Capsule(x0, y, x1, y, w)


def diag(x0, y0, x1, y1, w):
    return Capsule(x0, y0, x1, y1, w)


def ring(cx, cy, r, w, a0, a1):
    return Ring(cx, cy, r, w, a0, a1)


def ering(cx, cy, rx, ry, w, a0, a1):
    return EllipseRing(cx, cy, rx, ry, w, a0, a1)


def circle(cx, cy, r):
    return Circle(cx, cy, r)


def stroke(pts, w):
    return BezierStroke(pts, w)


def G(*shapes):
    return Glyph(shapes)


def GX(inc, exc):
    return Glyph(inc, exc)


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

CAP = 700.0
XH = 520.0
ASC = 800.0
DES = -200.0
WC = 112.0   # capital stem
WL = 104.0   # lowercase stem
WD = 108.0   # digit stem
RC = 106.0   # capital round stroke
RL = 99.0    # lowercase round stroke
RD = 103.0   # digit round stroke
OV = 25.0    # round overshoot

# ---------------------------------------------------------------------------
# Glyph library
# ---------------------------------------------------------------------------

GLYPHS = {}


def add(char, shapes, advance, exc=None):
    glyph = Glyph(shapes, exc) if exc else Glyph(shapes)
    GLYPHS[char] = (glyph, advance)


# ---- capitals ------------------------------------------------------------

add("A", [diag(110, 56, 350, 690, WC), diag(590, 56, 350, 690, WC), hbar(265, 200, 500, 100)], 700)
add("B", [vbar(118, 30, 670, WC), ering(118, 500, 330, 172, RC, -90, 90), ering(118, 200, 330, 171, RC, -90, 90)], 540)
add("C", [ering(347, 350, 330, 322, RC, 40, 320)], 660)
add("D", [vbar(118, 30, 670, WC), ering(118, 350, 390, 322, RC, -90, 90)], 570)
add("E", [vbar(85, 30, 670, WC), hbar(650, 100, 460, 106), hbar(350, 100, 380, 106), hbar(50, 100, 460, 106)], 520)
add("F", [vbar(85, 30, 670, WC), hbar(650, 100, 460, 106), hbar(350, 100, 380, 106)], 520)
add("G", [ering(347, 350, 330, 322, RC, 40, 320), hbar(150, 360, 120, 100)], 660)
add("H", [vbar(85, 30, 670, WC), vbar(485, 30, 670, WC), hbar(350, 100, 470, 106)], 545)
add("I", [vbar(300, 30, 670, 120)], 600)
add("J", [ering(330, 350, 330, 322, RC, 140, 385), hbar(130, -150, 20, 100)], 680)
add("K", [vbar(85, 30, 670, WC), diag(150, 350, 500, 665, 108), diag(150, 350, 500, 35, 108)], 560)
add("L", [vbar(85, 30, 670, WC), hbar(50, 100, 460, 112)], 520)
add("M", [diag(85, 56, 170, 700, WC), diag(575, 56, 490, 700, WC), diag(170, 700, 330, 340, WC), diag(490, 700, 330, 340, WC)], 635)
add("N", [vbar(85, 56, 700, WC), vbar(515, 56, 700, WC), diag(130, 690, 470, 70, 108)], 575)
add("O", [ring(383, 350, 322, RC, 0, 360)], 760)
add("P", [vbar(118, 30, 670, WC), ering(118, 500, 330, 172, RC, -90, 90)], 505)
add("Q", [ring(383, 350, 322, RC, 0, 360), diag(560, 90, 720, -160, 100)], 775)
add("R", [vbar(118, 30, 670, WC), ering(118, 500, 330, 172, RC, -90, 90), diag(350, 280, 520, 40, 100)], 575)
add("S", [stroke([(150, 500), (180, 685), (500, 685), (500, 300), (520, 120), (420, -20), (230, -40)], RC)], 540)
add("T", [hbar(650, 80, 420, WC), vbar(250, 30, 670, WC)], 480)
add("U", [ering(435, 350, 330, 322, RC, 180, 360), vbar(108, 350, 672, 106), vbar(762, 350, 672, 106)], 820)
add("V", [diag(105, 670, 355, 56, WC), diag(605, 670, 355, 56, WC)], 665)
add("W", [diag(85, 56, 225, 700, WC), diag(575, 56, 425, 700, WC), diag(225, 700, 330, 56, WC), diag(425, 700, 330, 56, WC)], 635)
add("X", [diag(85, 56, 585, 700, WC), diag(585, 56, 85, 700, WC)], 645)
add("Y", [diag(105, 670, 355, 56, WC), diag(605, 670, 355, 56, WC), vbar(355, 30, 330, 112)], 665)
add("Z", [hbar(650, 85, 585, 112), hbar(50, 85, 585, 112), diag(639, 650, 131, 50, 104)], 645)

# ---- lowercase -----------------------------------------------------------

add("a", [ring(210, 260, 233, RL, 100, 260), ring(355, 495, 150, RL, 180, 360), vbar(505, 0, 468, WL)], 560)
add("b", [vbar(120, 28, 748, WL), ring(285, 260, 233, RL, 0, 360)], 570)
add("c", [ring(305, 260, 233, RL, 40, 320)], 560)
add("d", [vbar(505, 28, 748, WL), ring(285, 260, 233, RL, 0, 360)], 570)
add("e", [ring(305, 260, 233, RL, 20, 340), hbar(265, 150, 430, 96)], 540)
add("f", [vbar(220, 28, 748, WL), ring(220, 500, 200, RL, -90, 90), hbar(330, 80, 330, 96)], 430)
add("g", [ring(285, 260, 233, RL, 0, 360), vbar(505, 28, 748, WL), ering(285, 155, 190, 165, RL, 0, 360)], 570)
add("h", [vbar(120, 0, 748, WL), vbar(485, 0, 468, WL), ring(355, 495, 150, RL, 180, 360)], 545)
add("i", [vbar(300, 0, 468, WL), circle(300, 545, 50)], 600)
add("j", [vbar(330, 0, 468, WL), circle(330, 545, 50), vbar(330, -148, 0, WL)], 600)
add("k", [vbar(120, 0, 748, WL), diag(180, 260, 420, 468, 96), diag(180, 260, 420, 52, 96)], 500)
add("l", [vbar(300, 0, 748, WL)], 600)
add("m", [vbar(85, 0, 468, WL), vbar(355, 0, 468, WL), vbar(625, 0, 468, WL), ring(185, 495, 130, RL, 180, 360), ring(455, 495, 130, RL, 180, 360)], 710)
add("n", [vbar(85, 0, 468, WL), vbar(355, 0, 468, WL), ring(185, 495, 130, RL, 180, 360)], 440)
add("o", [ring(285, 260, 233, RL, 0, 360)], 570)
add("p", [vbar(120, -228, 468, WL), ring(285, 260, 233, RL, 0, 360)], 570)
add("q", [vbar(505, -228, 468, WL), ring(285, 260, 233, RL, 0, 360)], 570)
add("r", [vbar(85, 0, 468, WL), ring(185, 495, 130, RL, 180, 360)], 380)
add("s", [stroke([(150, 420), (180, 545), (430, 545), (440, 270), (450, 120), (400, 15), (240, 30)], RL)], 480)
add("t", [vbar(230, 0, 600, WL), hbar(560, 70, 400, 96)], 430)
add("u", [ering(285, 260, 233, 233, RL, 180, 360), vbar(52, 300, 468, WL), vbar(518, 300, 468, WL)], 620)
add("v", [diag(110, 468, 340, 56, WL), diag(570, 468, 340, 56, WL)], 630)
add("w", [diag(85, 468, 190, 56, WL), diag(595, 468, 490, 56, WL), diag(190, 56, 340, 468, WL), diag(490, 56, 340, 468, WL)], 640)
add("x", [diag(110, 0, 570, 468, WL), diag(570, 0, 110, 468, WL)], 640)
add("y", [diag(110, 468, 340, -148, WL), diag(570, 468, 340, -148, WL), vbar(340, -148, 0, WL)], 630)
add("z", [hbar(468, 90, 560, 104), hbar(52, 90, 560, 104), diag(553, 468, 97, 52, 96)], 610)

# ---- digits --------------------------------------------------------------

add("0", [ring(330, 350, 322, RD, 0, 360)], 750)
add("1", [vbar(285, 30, 700, WD), diag(150, 660, 430, 600, 96)], 570)
add("2", [ring(330, 505, 152, RD, 20, 290), diag(250, 420, 470, 70, 100), hbar(60, 140, 480, 104)], 545)
add("3", [ring(300, 513, 155, RD, 245, 475), ring(300, 187, 155, RD, 245, 475)], 545)
add("4", [diag(460, 690, 270, 260, 104), vbar(280, 0, 695, 104), hbar(250, 140, 480, 100)], 540)
add("5", [hbar(690, 160, 450, 104), vbar(160, 690, 340, 104), ring(160, 260, 233, RD, -90, 90)], 510)
add("6", [ring(285, 250, 233, RD, 0, 360), diag(100, 200, 150, 672, 100)], 575)
add("7", [hbar(680, 110, 480, 104), diag(473, 680, 190, 90, 100)], 550)
add("8", [ring(285, 477, 195, RD, 0, 360), ring(285, 223, 195, RD, 0, 360)], 550)
add("9", [ring(285, 439, 233, RD, 0, 360), diag(470, 480, 440, 27, 100)], 575)

# ---- punctuation & symbols ------------------------------------------------

add(" ", [], 300)
add(".", [circle(300, 56, 56)], 600)
add(",", [circle(300, 56, 56), diag(265, 30, 345, -12, 60)], 600)
add(":", [circle(300, 420, 56), circle(300, 140, 56)], 600)
add(";", [circle(300, 420, 56), circle(300, 140, 56), diag(265, 114, 345, 72, 60)], 600)
add("!", [vbar(300, 100, 640, 108), circle(300, 54, 54)], 600)
add("?", [ring(285, 507, 165, RD, 25, 295), stroke([(285, 370), (330, 290), (330, 230), (285, 190)], 96), circle(285, 60, 54)], 600)
add("¡", [vbar(300, 60, 600, 108), circle(300, 646, 54)], 600)
add("¿", [ring(285, 180, 165, RD, 65, 335), stroke([(285, 310), (240, 390), (240, 450), (285, 490)], 96), circle(285, 640, 54)], 600)
add("'", [diag(290, 300, 330, 620, 76), diag(290, 300, 250, 620, 76)], 300)
add('"', [diag(210, 300, 250, 620, 76), diag(210, 300, 170, 620, 76), diag(390, 300, 430, 620, 76), diag(390, 300, 350, 620, 76)], 600)
add("'", [diag(300, 260, 345, 560, 80), diag(300, 260, 255, 560, 80)], 300)
add("\u2018", [diag(300, 200, 340, 540, 76), diag(300, 200, 260, 540, 76)], 300)
add("\u2019", [diag(300, 200, 340, 540, 76), diag(300, 200, 260, 540, 76)], 300)
add('"', [diag(220, 260, 265, 560, 80), diag(220, 260, 175, 560, 80), diag(380, 260, 425, 560, 80), diag(380, 260, 335, 560, 80)], 600)
add("\u201c", [diag(220, 200, 265, 540, 76), diag(220, 200, 175, 540, 76), diag(380, 200, 425, 540, 76), diag(380, 200, 335, 540, 76)], 600)
add("\u201d", [diag(220, 200, 265, 540, 76), diag(220, 200, 175, 540, 76), diag(380, 200, 425, 540, 76), diag(380, 200, 335, 540, 76)], 600)
add("(", [ring(300, 350, 250, 100, 90, 270)], 700)
add(")", [ring(300, 350, 250, 100, -90, 90)], 700)
add("[", [vbar(180, 50, 650, 100), vbar(520, 50, 650, 100), hbar(50, 200, 460, 100), hbar(650, 200, 460, 100)], 700)
add("]", [vbar(180, 50, 650, 100), vbar(520, 50, 650, 100), hbar(50, 300, 460, 100), hbar(650, 300, 460, 100)], 700)
add("{", [ring(300, 350, 250, 96, 90, 270), hbar(350, 230, 450, 88)], 700)
add("}", [ring(300, 350, 250, 96, -90, 90), hbar(350, 150, 370, 88)], 700)
add("/", [diag(100, 760, 650, 40, 100)], 750)
add("\\", [diag(650, 760, 100, 40, 100)], 750)
add("|", [vbar(300, -200, 800, 100)], 600)
add("-", [hbar(340, 120, 480, 88)], 600)
add("_", [hbar(40, 60, 540, 80)], 600)
add("–", [hbar(340, 100, 500, 88)], 600)
add("—", [hbar(340, 60, 540, 88)], 600)
add("…", [circle(200, 60, 50), circle(350, 60, 50), circle(500, 60, 50)], 700)
add("+", [hbar(350, 150, 450, 104), vbar(300, 100, 600, 104)], 600)
add("=", [hbar(310, 150, 450, 96), hbar(310, 450, 450, 96)], 600)
add("±", [hbar(310, 150, 450, 104), vbar(300, 100, 600, 104), hbar(310, 480, 450, 96)], 600)
add("×", [diag(180, 160, 420, 540, 88), diag(180, 540, 420, 160, 88)], 600)
add("÷", [hbar(310, 160, 450, 92), circle(300, 350, 54), hbar(310, 500, 450, 92)], 600)
add("<", [diag(170, 350, 450, 650, 96), diag(170, 350, 450, 50, 96)], 620)
add(">", [diag(450, 350, 170, 650, 96), diag(450, 350, 170, 50, 96)], 620)
add("^", [diag(300, 80, 420, 600, 88), diag(300, 80, 180, 600, 88)], 600)
add("~", [stroke([(180, 300), (240, 380), (360, 380), (420, 300)], 76)], 600)
add("·", [circle(300, 340, 54)], 600)
add("*", [vbar(300, 60, 620, 88), diag(170, 150, 430, 530, 88), diag(430, 150, 170, 530, 88)], 600)
add("@", [ring(300, 400, 310, 90, 0, 360), ring(300, 380, 205, 88, 110, 250), vbar(520, 280, 380, 85), diag(560, 560, 680, 640, 80)], 760)
add("#", [diag(240, 80, 520, 620, 80), diag(320, 80, 600, 620, 80), hbar(250, 180, 520, 100), hbar(250, 480, 520, 100)], 700)
add("$", [stroke([(150, 500), (180, 685), (500, 685), (500, 300), (520, 120), (420, -20), (230, -40)], RC), vbar(300, 30, 670, 88)], 540)
add("%", [circle(230, 560, 110), circle(470, 140, 110), diag(140, 700, 560, 0, 88)], 700)
add("&", [ring(285, 500, 175, RD, 0, 360), stroke([(280, 420), (330, 380), (330, 300), (200, 150), (150, 60)], 100)], 660)
add("¢", [ring(305, 260, 233, RL, 40, 320), vbar(300, 30, 650, 88)], 560)
add("€", [ering(347, 350, 330, 322, RC, 40, 320), hbar(300, 170, 470, 92), hbar(300, 350, 500, 92)], 640)
add("£", [vbar(150, 30, 700, 104), ering(150, 480, 200, 200, 100, -90, 90), hbar(330, 120, 480, 96), hbar(430, 120, 420, 96)], 580)
add("¥", [diag(105, 670, 355, 56, WC), diag(605, 670, 355, 56, WC), vbar(355, 30, 330, 112), hbar(160, 300, 450, 92), hbar(300, 300, 450, 92)], 665)
add("°", [ring(300, 500, 80, 70, 0, 360)], 600)
add("§", [stroke([(180, 680), (200, 545), (430, 545), (440, 380), (150, 320), (160, 155), (390, 155), (400, 20)], 88)], 540)
add("¶", [vbar(420, -20, 700, 108), ering(420, 560, 150, 140, 103, -90, 90), hbar(90, 30, 420, 104)], 560)
add("ª", [ring(200, 200, 180, 88, 100, 260), ring(320, 400, 115, 88, 180, 360), vbar(440, 40, 380, 92), hbar(30, 60, 540, 40)], 600)
add("º", [ring(300, 240, 180, 88, 0, 360), hbar(30, 60, 540, 40)], 600)
add("¹", [vbar(250, 200, 620, 90), diag(140, 580, 380, 530, 84)], 550)
add("²", [ring(290, 470, 120, 88, 20, 290), diag(230, 400, 400, 120, 88), hbar(90, 140, 420, 92)], 550)
add("³", [ring(270, 480, 120, 88, 245, 475), ring(270, 220, 120, 88, 245, 475)], 550)
add("¼", [vbar(150, 200, 620, 90), diag(60, 580, 300, 530, 84), diag(280, 620, 420, 180, 80), ring(520, 240, 150, 88, 0, 360)], 900)
add("½", [vbar(150, 200, 620, 90), diag(60, 580, 300, 530, 84), diag(280, 620, 420, 180, 80), ring(540, 470, 120, 88, 20, 290), diag(480, 400, 650, 120, 88), hbar(340, 140, 670, 92)], 900)
add("¾", [ring(200, 480, 120, 88, 245, 475), ring(200, 220, 120, 88, 245, 475), diag(280, 620, 420, 180, 80), ring(520, 240, 150, 88, 0, 360)], 900)
add("«", [diag(160, 620, 320, 350, 88), diag(160, 80, 320, 350, 88), diag(340, 620, 500, 350, 88), diag(340, 80, 500, 350, 88)], 660)
add("»", [diag(500, 620, 340, 350, 88), diag(500, 80, 340, 350, 88), diag(320, 620, 160, 350, 88), diag(320, 80, 160, 350, 88)], 660)
add("‹", [diag(160, 620, 320, 350, 88), diag(160, 80, 320, 350, 88)], 400)
add("›", [diag(320, 620, 160, 350, 88), diag(320, 80, 160, 350, 88)], 400)
add("™", [hbar(650, 150, 350, 80), vbar(250, 150, 650, 80), vbar(400, 150, 650, 70), vbar(500, 150, 650, 70), diag(440, 150, 490, 350, 60), diag(560, 150, 510, 350, 60)], 600)
add("©", [ring(300, 380, 260, 70, 0, 360), ring(300, 380, 150, 70, 40, 320)], 760)
add("®", [ring(300, 380, 260, 70, 0, 360), vbar(250, 180, 600, 70), ering(250, 440, 120, 100, 66, -90, 90), diag(330, 340, 420, 190, 64)], 760)
add("‰", [circle(230, 560, 110), circle(470, 140, 110), diag(140, 700, 560, 0, 88), ring(680, 240, 130, 88, 0, 360)], 1000)
add("¬", [hbar(350, 150, 450, 96), vbar(450, 200, 500, 96)], 600)
add("¯", [hbar(40, 60, 540, 80)], 600)
add("¦", [vbar(300, 100, 400, 100), vbar(300, 500, 600, 100)], 600)

# ---- special letters -------------------------------------------------------

add("Æ", [diag(85, 56, 330, 690, WC), vbar(560, 30, 670, WC), hbar(650, 150, 505, 100), hbar(350, 150, 425, 100), hbar(50, 150, 505, 100), hbar(265, 190, 460, 96)], 620)
add("Ø", [ring(383, 350, 322, RC, 0, 360), diag(120, 690, 655, -150, 96)], 760)
add("Ð", [vbar(118, 30, 670, WC), ering(118, 350, 390, 322, RC, -90, 90), hbar(350, 490, 640, 96)], 700)
add("Þ", [vbar(118, 30, 670, WC), ering(118, 500, 330, 172, RC, -90, 90)], 505)
add("ß", [ring(120, 306, 190, RL, -90, 90), stroke([(300, 300), (330, 240), (420, 140), (330, -30), (230, -170)], 96)], 470)
add("æ", [ring(150, 260, 160, RL, 90, 270), ring(300, 495, 150, RL, 180, 360), vbar(450, 0, 468, WL), hbar(265, 140, 400, 96)], 560)
add("ø", [ring(285, 260, 233, RL, 0, 360), diag(90, 540, 480, -20, 92)], 570)
add("ð", [ring(285, 260, 233, RL, 0, 360), vbar(170, -30, 520, 104), hbar(265, 110, 460, 92)], 570)
add("þ", [vbar(120, 28, 748, WL), ering(120, 400, 280, 96, RL, -90, 90)], 470)
add("µ", [ering(285, 260, 233, 233, RL, 180, 360), vbar(52, 300, 468, WL), vbar(518, 300, 468, WL), vbar(52, -148, 260, WL), vbar(518, -148, 260, WL)], 620)

# ---- accents (spacing forms) ----------------------------------------------

add("´", [diag(14, 0, 60, 74, 72), diag(-14, 0, -60, 74, 72)], 300)
add("`", [diag(-14, 0, -60, 74, 72), diag(14, 0, 60, 74, 72)], 300)
add("circ", [diag(0, 78, -52, 0, 72), diag(0, 78, 52, 0, 72)], 300)
add("ˇ", [diag(0, 0, -52, 78, 72), diag(0, 0, 52, 78, 72)], 300)
add("tilde", [stroke([(-42, 46), (-6, 74), (6, 16), (42, 46)], 62)], 300)
add("¨", [circle(-26, 38, 28), circle(26, 38, 28)], 300)
add("˚", [ring(0, 60, 28, 24, 0, 360)], 300)
add("macron", [hbar(38, -58, 58, 60)], 300)
add("˘", [stroke([(-46, 2), (-22, 66), (22, 66), (46, 2)], 60)], 300)
add("¸", [diag(-16, 8, 24, -18, 52)], 300)
add("˛", [stroke([(0, 0), (10, -28), (-8, -44)], 48)], 300)

# ---- composed accented glyphs ---------------------------------------------

ACCENT_ANCHORS = {}


def compose(char, base, accent, y_anchor, x_off=0.0):
    base_glyph, adv = GLYPHS[base]
    acc_shapes = GLYPHS[accent][0].inc
    if base_glyph.exc:
        raise ValueError("base with blockers not supported in compose")
    shapes = list(base_glyph.inc)
    cx = adv / 2.0 + x_off
    for s in acc_shapes:
        shapes.append(T(s, cx, y_anchor))
    GLYPHS[char] = (Glyph(shapes), adv)


CAP_Y = 738.0
LOW_Y = 585.0
CED_Y = 0.0

for _c, _b, _a in [
    ("À", "A", "`"), ("Á", "A", "´"), ("Â", "A", "circ"), ("Ã", "A", "tilde"),
    ("Ä", "A", "¨"), ("Å", "A", "˚"),
    ("È", "E", "`"), ("É", "E", "´"), ("Ê", "E", "circ"), ("Ë", "E", "¨"),
    ("Ì", "I", "`"), ("Í", "I", "´"), ("Î", "I", "circ"), ("Ï", "I", "¨"),
    ("Ñ", "N", "tilde"),
    ("Ò", "O", "`"), ("Ó", "O", "´"), ("Ô", "O", "circ"), ("Õ", "O", "tilde"),
    ("Ö", "O", "¨"),
    ("Ù", "U", "`"), ("Ú", "U", "´"), ("Û", "U", "circ"), ("Ü", "U", "¨"),
    ("Ý", "Y", "´"), ("Ÿ", "Y", "¨"),
]:
    compose(_c, _b, _a, CAP_Y)

compose("Ç", "C", "¸", CED_Y)
compose("Š", "S", "ˇ", CAP_Y)
compose("Ž", "Z", "ˇ", CAP_Y)
compose("Ş", "S", "¸", CED_Y)

for _c, _b, _a in [
    ("à", "a", "`"), ("á", "a", "´"), ("â", "a", "circ"), ("ã", "a", "tilde"),
    ("ä", "a", "¨"), ("å", "a", "˚"),
    ("è", "e", "`"), ("é", "e", "´"), ("ê", "e", "circ"), ("ë", "e", "¨"),
    ("ì", "i", "`"), ("í", "i", "´"), ("î", "i", "circ"), ("ï", "i", "¨"),
    ("ñ", "n", "tilde"),
    ("ò", "o", "`"), ("ó", "o", "´"), ("ô", "o", "circ"), ("õ", "o", "tilde"),
    ("ö", "o", "¨"),
    ("ù", "u", "`"), ("ú", "u", "´"), ("û", "u", "circ"), ("ü", "u", "¨"),
    ("ý", "y", "´"), ("ÿ", "y", "¨"),
]:
    compose(_c, _b, _a, LOW_Y)

compose("ç", "c", "¸", CED_Y)
compose("š", "s", "ˇ", LOW_Y)
compose("ž", "z", "ˇ", LOW_Y)
compose("ş", "s", "¸", CED_Y)

# .notdef
add(".notdef", [hbar(400, 150, 750, 200), vbar(450, 40, 760, 200), circle(250, 140, 100), circle(650, 140, 100), circle(250, 660, 100), circle(650, 660, 100), diag(250, 660, 650, 140, 120)], 900)

# ---------------------------------------------------------------------------
# Kerning
# ---------------------------------------------------------------------------

KERN = {
    ("A", "V"): -60, ("A", "W"): -55, ("A", "Y"): -55, ("A", "T"): -40,
    ("V", "A"): -60, ("W", "A"): -55, ("Y", "A"): -55, ("T", "A"): -40,
    ("V", "o"): -30, ("W", "o"): -30, ("Y", "o"): -30, ("T", "o"): -30,
    ("T", "a"): -30, ("T", "e"): -30, ("T", "u"): -30, ("T", "y"): -35,
    ("T", ","): -40, ("T", "."): -40, ("T", ":"): -25, ("T", "-"): -25,
    ("Y", "o"): -30, ("Y", "a"): -30, ("Y", "e"): -30, ("Y", ","): -40,
    ("Y", "."): -40,
    ("F", "A"): -40, ("F", "T"): -35, ("F", "."): -50, ("F", ","): -50,
    ("P", "A"): -40, ("P", "a"): -20, ("P", "."): -50, ("P", ","): -50,
    ("R", "A"): -30, ("R", "T"): -25,
    ("L", "T"): -45, ("L", "V"): -45, ("L", "Y"): -45, ("L", "A"): -35,
    ("L", "W"): -35, ("L", "."): -25, ("L", ","): -25,
    ("A", "v"): -30, ("A", "w"): -30, ("A", "y"): -30,
    ("v", "a"): -25, ("w", "a"): -25, ("y", "a"): -25,
    ("v", "o"): -20, ("w", "o"): -20, ("y", "o"): -20,
    ("a", "v"): -15, ("o", "y"): -15, ("c", "o"): -10,
    ("S", "A"): -25, ("S", "T"): -20,
    ("T", "h"): -20, ("T", "i"): -20, ("T", "n"): -20, ("T", "r"): -20,
    ("W", "e"): -25, ("W", "a"): -25, ("V", "e"): -25, ("V", "a"): -25,
    ("A", "c"): -20, ("A", "e"): -20, ("A", "o"): -20,
    ("o", "T"): -25, ("e", "T"): -25, ("u", "T"): -25,
    ("O", "A"): -20, ("Q", "A"): -20, ("C", "A"): -20, ("G", "A"): -20,
    ("X", "A"): -25, ("X", "o"): -20, ("K", "A"): -20, ("K", "o"): -15,
    ("Z", "A"): -25, ("z", "a"): -15, ("x", "a"): -15,
    ("r", "a"): -20, ("r", "o"): -20, ("r", "e"): -20, ("r", "c"): -20,
    ("f", "f"): -15, ("f", "i"): -15, ("f", "l"): -15, ("f", "t"): -10,
}


# ---------------------------------------------------------------------------
# Font assembly
# ---------------------------------------------------------------------------

def build_font(out_dir):
    glyph_order = [".notdef", "space"]
    cmap = {0x20: "space"}
    glyphs = {}
    metrics = {}

    notdef_g, notdef_adv = GLYPHS[".notdef"]
    glyphs[".notdef"] = contours_to_pen(glyph_contours(notdef_g))
    metrics[".notdef"] = (int(round(notdef_adv)), 0)

    for char in sorted(GLYPHS.keys()):
        if char == ".notdef" or len(char) != 1:
            continue
        if char == " ":
            glyphs["space"] = empty_glyph()
            metrics["space"] = (300, 0)
            continue
        glyph, adv = GLYPHS[char]
        name = "uni%04X" % ord(char)
        glyph_order.append(name)
        cmap[ord(char)] = name
        glyphs[name] = contours_to_pen(glyph_contours(glyph))
        metrics[name] = (int(round(adv)), 0)

    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=int(ASC), descent=int(DES), lineGap=200)
    fb.setupNameTable({
        "familyName": "Aura Sans",
        "styleName": "Regular",
        "uniqueFontIdentifier": "Aura Sans Regular; 1.0",
        "fullName": "Aura Sans Regular",
        "psName": "AuraSans-Regular",
        "version": "Version 1.000",
        "copyright": "Copyright (c) 2026 BonaMind. All rights reserved.",
    })
    fb.setupOS2(sTypoAscender=int(ASC), sTypoDescender=int(DES), sTypoLineGap=200,
                usWinAscent=1000, usWinDescent=200, usWeightClass=400,
                usWidthClass=5, fsSelection=0x40, sxHeight=int(XH),
                sCapHeight=int(CAP), achVendID="AURA")
    fb.setupPost()
    font = fb.font

    features = "feature kern {\n"
    for (left, right), value in KERN.items():
        features += "  pos %s %s %d;\n" % (cmap.get(ord(left), "?"), cmap.get(ord(right), "?"), value)
    features += "} kern;\n"
    addOpenTypeFeaturesFromString(font, features)

    ttf_path = os.path.join(out_dir, "AuraSans-Regular.ttf")
    woff2_path = os.path.join(out_dir, "AuraSans-Regular.woff2")

    font.flavor = None
    font.save(ttf_path)
    font.flavor = "woff2"
    font.save(woff2_path)

    return ttf_path, woff2_path


def contours_to_pen(contours):
    pen = TTGlyphPen(None)
    for contour in contours:
        x, y = contour[0]
        pen.moveTo((round(x), round(y)))
        for px, py in contour[1:]:
            pen.lineTo((round(px), round(py)))
        pen.closePath()
    return pen.glyph()


def empty_glyph():
    return TTGlyphPen(None).glyph()


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "fonts")
    os.makedirs(out_dir, exist_ok=True)

    print("Building Aura Sans...")
    n = 0
    for char in GLYPHS:
        if char != ".notdef":
            n += 1
    print("Glyph definitions: %d" % n)

    ttf, woff2 = build_font(out_dir)
    print("Wrote: %s" % ttf)
    print("Wrote: %s" % woff2)


if __name__ == "__main__":
    main()
