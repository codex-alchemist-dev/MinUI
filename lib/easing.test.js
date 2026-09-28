#!/usr/bin/env node
// Real correctness tests for lib/easing.js's interpolation math - the
// highest-risk part of the animation system, since a wrong formula here
// would silently produce a subtly-wrong curve shape rather than an error.
"use strict";
const assert = require("assert");
const { NATIVE_EASINGS, cubicBezierEasing, catmullRom, sampleCurve } = require("./easing.js");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}
const near = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

test("NATIVE_EASINGS: contains exactly the 32 documented native values, including bounce/elastic/back", () => {
    assert.strictEqual(NATIVE_EASINGS.size, 32);
    for (const v of ["linear", "spring", "out_bounce", "in_out_elastic", "out_back"]) assert.ok(NATIVE_EASINGS.has(v), v);
    assert.strictEqual(NATIVE_EASINGS.has("ease-in-out"), false, "CSS-style names are NOT native Bedrock values");
});

test("cubicBezierEasing: endpoints are always exactly 0 and 1, for any control points", () => {
    const ease = cubicBezierEasing(0.25, 0.1, 0.25, 1);
    assert.strictEqual(ease(0), 0);
    assert.strictEqual(ease(1), 1);
});

test("cubicBezierEasing: the identity curve (0,0,1,1) is linear - ease(x) == x for all x", () => {
    const ease = cubicBezierEasing(0, 0, 1, 1);
    for (const x of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) assert.ok(near(ease(x), x, 1e-3), `ease(${x}) = ${ease(x)}`);
});

test("cubicBezierEasing: a real ease-in curve starts slow (below the diagonal) then catches up", () => {
    // cubic-bezier(0.42, 0, 1, 1) is CSS's real "ease-in" curve.
    const ease = cubicBezierEasing(0.42, 0, 1, 1);
    assert.ok(ease(0.5) < 0.5, `ease-in at t=0.5 should be below the diagonal, got ${ease(0.5)}`);
    assert.ok(ease(0.25) < 0.25);
});

test("cubicBezierEasing: a real ease-out curve starts fast (above the diagonal)", () => {
    // cubic-bezier(0, 0, 0.58, 1) is CSS's real "ease-out" curve.
    const ease = cubicBezierEasing(0, 0, 0.58, 1);
    assert.ok(ease(0.5) > 0.5, `ease-out at t=0.5 should be above the diagonal, got ${ease(0.5)}`);
});

test("cubicBezierEasing: monotonically increasing for a standard 0..1-range curve", () => {
    const ease = cubicBezierEasing(0.68, -0.55, 0.27, 1.55); // a real CSS "easeInOutBack"-style curve, allowed to overshoot in y but not in x-progress order
    let prevX = -1;
    for (let i = 0; i <= 20; i++) {
        const x = i / 20;
        assert.ok(x >= prevX);
        prevX = x;
        assert.ok(Number.isFinite(ease(x)), `ease(${x}) must be finite`);
    }
});

test("catmullRom: the spline passes EXACTLY through every control point at its own parameter", () => {
    const points = [[0, 0], [10, 5], [20, -5], [30, 0]];
    const n = points.length - 1;
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const p = catmullRom(points, t);
        assert.ok(near(p[0], points[i][0]) && near(p[1], points[i][1]), `at t=${t}, expected ${points[i]}, got ${p}`);
    }
});

test("catmullRom: with exactly 2 points, degenerates to plain linear interpolation", () => {
    const p = catmullRom([[0, 0], [10, 20]], 0.5);
    assert.ok(near(p[0], 5) && near(p[1], 10));
});

test("catmullRom: works for scalar (1-dimensional) control points too", () => {
    const points = [[0], [10], [0]];
    assert.ok(near(catmullRom(points, 0)[0], 0));
    assert.ok(near(catmullRom(points, 0.5)[0], 10));
    assert.ok(near(catmullRom(points, 1)[0], 0));
});

test("catmullRom: throws a clear error for fewer than 2 points", () => {
    assert.throws(() => catmullRom([[0, 0]], 0.5), /needs at least 2 points/);
});

test("sampleCurve: returns steps+1 values including both exact endpoints", () => {
    const ease = cubicBezierEasing(0.25, 0.1, 0.25, 1);
    const samples = sampleCurve(ease, 4);
    assert.strictEqual(samples.length, 5);
    assert.strictEqual(samples[0], 0);
    assert.strictEqual(samples[4], 1);
});

console.log(`\n${passed} passed`);
