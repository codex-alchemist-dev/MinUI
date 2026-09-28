// Real interpolation math for MinUI's animation system (OR-Track D "very
// high featured animator" pass): Bedrock's native JSON UI animations have a
// FIXED, closed easing enum (no custom curves) and are strictly two-point
// (from/to) - there is no native multi-keyframe or custom-curve mechanism
// at all. Everything here is honest compile-time BAKING: a custom curve
// (cubic-bezier, Catmull-Rom) is sampled into N discrete steps and emitted
// as a chain of small native two-point animations (linked via `next`,
// exactly like this file's own pre-existing pulse animation already
// chains two `anim_type: alpha` defs into a loop) - never a claim that
// Bedrock evaluates a real curve function per frame.
"use strict";

// The exact, complete native easing enum (confirmed against bedrock-wiki's
// json-ui-documentation.md, "Animations" table) - used to validate a
// mod author's easing="..." instead of silently shipping a typo as broken
// JSON. Includes bounce/elastic/back natively - "bouncy" easing needs no
// custom curve at all, just easing="out_bounce" or easing="out_elastic".
const NATIVE_EASINGS = new Set([
    "linear", "spring",
    "in_quad", "out_quad", "in_out_quad",
    "in_cubic", "out_cubic", "in_out_cubic",
    "in_quart", "out_quart", "in_out_quart",
    "in_quint", "out_quint", "in_out_quint",
    "in_sine", "out_sine", "in_out_sine",
    "in_expo", "out_expo", "in_out_expo",
    "in_circ", "out_circ", "in_out_circ",
    "in_bounce", "out_bounce", "in_out_bounce",
    "in_back", "out_back", "in_out_back",
    "in_elastic", "out_elastic", "in_out_elastic",
]);

// ---- cubic-bezier(x1, y1, x2, y2) - CSS-style custom easing curve ---------
// Standard algorithm (the same one browsers use for CSS's cubic-bezier()):
// the curve is a 2D parametric Bezier with P0=(0,0), P3=(1,1); given an
// input time fraction (the x-axis progress), solve for the Bezier
// parameter u where Bx(u) = x, then return By(u) as the eased output.
// Newton-Raphson with a bisection fallback (Bx isn't guaranteed monotonic
// for out-of-range control points, though the common 0..1 case always is).
function cubicBezierEasing(x1, y1, x2, y2) {
    const bx = u => 3 * (1 - u) ** 2 * u * x1 + 3 * (1 - u) * u ** 2 * x2 + u ** 3;
    const by = u => 3 * (1 - u) ** 2 * u * y1 + 3 * (1 - u) * u ** 2 * y2 + u ** 3;
    const dbx = u => 3 * (1 - u) ** 2 * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u ** 2 * (1 - x2);
    return function ease(x) {
        if (x <= 0) return 0;
        if (x >= 1) return 1;
        let u = x; // initial guess
        for (let i = 0; i < 8; i++) {
            const d = dbx(u);
            if (Math.abs(d) < 1e-6) break;
            const nextU = u - (bx(u) - x) / d;
            if (!Number.isFinite(nextU)) break;
            u = Math.min(1, Math.max(0, nextU));
        }
        // Bisection refine/fallback - guarantees convergence even where
        // Newton's method stalls (near-zero derivative, bad initial guess).
        let lo = 0, hi = 1;
        for (let i = 0; i < 20; i++) {
            const cur = bx(u);
            if (Math.abs(cur - x) < 1e-5) break;
            if (cur < x) lo = u; else hi = u;
            u = (lo + hi) / 2;
        }
        return by(u);
    };
}

// ---- Catmull-Rom spline - smooth motion through N control points ---------
// Uniform Catmull-Rom (the standard formula): for the segment between
// points[i] and points[i+1], using points[i-1] and points[i+2] as tangent
// controls (endpoints are clamped by duplicating the first/last point,
// the common convention). Passes exactly through every control point
// (unlike a Bezier spline, which only touches its own endpoints) - the
// specific property that makes it fit "draw a smooth path through these
// waypoints" (a camera path, a bouncy multi-point motion) better than
// chaining plain eased segments between points.
function catmullRomPoint(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    const dim = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
    return p0.map((_, i) => dim(p0[i], p1[i], p2[i], p3[i]));
}

// Evaluates the full spline (through every point in `points`) at a single
// global parameter t in [0,1].
function catmullRom(points, t) {
    if (points.length < 2) throw new Error("catmullRom: needs at least 2 points");
    if (points.length === 2) return points[0].map((v, i) => v + (points[1][i] - v) * t);
    const padded = [points[0], ...points, points[points.length - 1]];
    const segments = points.length - 1;
    const scaled = Math.min(t, 1) * segments;
    const seg = Math.min(Math.floor(scaled), segments - 1);
    const localT = scaled - seg;
    return catmullRomPoint(padded[seg], padded[seg + 1], padded[seg + 2], padded[seg + 3], localT);
}

// Samples a curve function (cubicBezierEasing's `ease`, or an interpolator
// like catmullRom bound to its points) at `steps` evenly-spaced points,
// returning `steps + 1` values including both endpoints (t=0 and t=1) -
// what a caller chains into `steps` real two-point native animations.
function sampleCurve(fn, steps) {
    const out = [];
    for (let i = 0; i <= steps; i++) out.push(fn(i / steps));
    return out;
}

module.exports = { NATIVE_EASINGS, cubicBezierEasing, catmullRom, sampleCurve };
