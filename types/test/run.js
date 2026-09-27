#!/usr/bin/env node
// Type-check test for MinUI's hand-written .d.ts files (OR-Track D2:
// TypeScript authoring-layer-only). Runs the REAL TypeScript compiler
// (from the "typescript" devDependency - test/authoring-time only, MinUI's
// own runtime stays dependency-free forever) against two fixtures:
//
//   - valid-sample.ts   - realistic usage of every typed export, across
//                         every runtime module - must type-check with
//                         ZERO errors.
//   - invalid-sample.ts - five deliberately wrong calls, one per real
//                         mistake a mod author could make - must produce
//                         exactly that many errors, proving the .d.ts
//                         files actually catch mistakes, not just `any`.
//
// Run: node types/test/run.js
"use strict";

const assert = require("assert");
const path = require("path");
const { execFileSync } = require("child_process");

let passed = 0;
function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`ok - ${name}`);
    } catch (e) {
        console.error(`FAIL - ${name}`);
        console.error(e);
        process.exitCode = 1;
    }
}

const TSC = require.resolve("typescript/bin/tsc");
const TSC_FLAGS = ["--strict", "--target", "ES2022", "--module", "ES2022", "--moduleResolution", "Bundler", "--noEmit", "--skipLibCheck"];

function runTsc(file) {
    try {
        execFileSync(process.execPath, [TSC, ...TSC_FLAGS, file], { cwd: __dirname, encoding: "utf8" });
        return { ok: true, output: "" };
    } catch (e) {
        return { ok: false, output: e.stdout ?? "" };
    }
}

test("valid-sample.ts: type-checks with zero errors against every real runtime module's .d.ts", () => {
    const result = runTsc("valid-sample.ts");
    if (!result.ok) console.error(result.output);
    assert.strictEqual(result.ok, true, "expected zero type errors");
});

test("invalid-sample.ts: reports exactly 5 errors, one per deliberate mistake", () => {
    const result = runTsc("invalid-sample.ts");
    assert.strictEqual(result.ok, false, "expected type errors, got none");
    const errorLines = result.output.split("\n").filter(l => /error TS\d+:/.test(l));
    assert.strictEqual(errorLines.length, 5, `expected 5 errors, got ${errorLines.length}:\n${result.output}`);
});

console.log(`\n${passed} passed`);
