#!/usr/bin/env node
// Real test for src/jsxCompile.js (extracted from OR-Track D2's proven
// pattern) - proves compileWithRealTsc() genuinely runs the real TypeScript
// compiler (not a JS-only passthrough - the fixture uses a real `enum`,
// which only exists in TypeScript) and requireCompiled() genuinely loads
// the compiled output as an ordinary Node module.
// Run: node src/test/jsxCompile.test.js
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { compileWithRealTsc, requireCompiled } = require("../jsxCompile.js");

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

const FIXTURE_DIR = path.join(__dirname, "fixtures", "jsxCompile-fixture");
const TSCONFIG = path.join(FIXTURE_DIR, "tsconfig.json");
const COMPILED = path.join(FIXTURE_DIR, "dist", "src.js");

test("compileWithRealTsc: really invokes tsc - a real `enum` (not valid plain JS) compiles cleanly", () => {
    if (fs.existsSync(path.join(FIXTURE_DIR, "dist"))) fs.rmSync(path.join(FIXTURE_DIR, "dist"), { recursive: true, force: true });
    compileWithRealTsc(TSCONFIG);
    assert.ok(fs.existsSync(COMPILED), "tsc must have produced real compiled output");
});

test("requireCompiled: loads the real compiled output as an ordinary Node module, with the real computed value", () => {
    const mod = requireCompiled(COMPILED);
    assert.strictEqual(mod.RESULT, 42, "the real enum-derived value must survive real compilation");
});

test("requireCompiled: busts the require cache - a re-compiled file is picked up fresh, not a stale cached version", () => {
    const before = requireCompiled(COMPILED);
    assert.strictEqual(before.RESULT, 42);
    // Overwrite the compiled output directly (simulating a real recompile)
    // and confirm requireCompiled() sees the NEW value, not Node's cached one.
    fs.writeFileSync(COMPILED, `"use strict";\nObject.defineProperty(exports, "__esModule", { value: true });\nexports.RESULT = 99;\n`);
    const after = requireCompiled(COMPILED);
    assert.strictEqual(after.RESULT, 99, "requireCompiled() must not return a stale cached module");
});

test("compileWithRealTsc: a genuine TypeScript syntax error throws with tsc's own real error output, not swallowed", () => {
    const brokenDir = path.join(__dirname, "fixtures", "jsxCompile-broken-fixture");
    fs.mkdirSync(brokenDir, { recursive: true });
    fs.writeFileSync(path.join(brokenDir, "tsconfig.json"), JSON.stringify({ compilerOptions: { outDir: "dist" }, include: ["src.ts"] }));
    fs.writeFileSync(path.join(brokenDir, "src.ts"), "const x: number = 'this is a real type error';\n");
    try {
        assert.throws(() => compileWithRealTsc(path.join(brokenDir, "tsconfig.json")), /jsxCompile: real tsc failed/);
    } finally {
        fs.rmSync(brokenDir, { recursive: true, force: true });
    }
});

console.log(`\n${passed} passed`);
