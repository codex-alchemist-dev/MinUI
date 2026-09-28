#!/usr/bin/env node
// Real tests for runtime/expr.js - the pure expression-evaluation engine
// behind MinUI's `{path | filter}` templates, extracted out of runtime.js
// specifically to make it testable without mocking @minecraft/server.
// expr.js is a real ES module (what Minecraft's script engine actually
// loads); this test file uses a dynamic import() to reach it from Node.
"use strict";
const assert = require("assert");
const { parseExpr } = require("../lib/markup.js");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

(async () => {
    const { evaluate, registerFilter, withLoops } = await import("./expr.js");
    const ev = (src, env = {}) => evaluate(parseExpr(src, "test", 1), env);

    test("arithmetic + comparisons", () => {
        assert.strictEqual(ev("1 + 2 * 3"), 7);
        assert.strictEqual(ev("(1 + 2) * 3"), 9);
        assert.strictEqual(ev("10 / 4"), 2.5);
        assert.strictEqual(ev("10 % 3"), 1);
        assert.strictEqual(ev("5 > 3 && 2 < 1"), false);
        assert.strictEqual(ev("5 > 3 || 2 < 1"), true);
    });

    test("path lookups, including computed segments", () => {
        assert.strictEqual(ev("c.level", { c: { level: 7 } }), 7);
        assert.strictEqual(ev("list[0]", { list: ["a", "b"] }), "a");
        assert.strictEqual(ev("missing.deep.path"), undefined);
    });

    test("string concatenation via +", () => {
        assert.strictEqual(ev("'lv ' + n", { n: 5 }), "lv 5");
    });

    test("built-in filters", () => {
        assert.strictEqual(ev("n | int", { n: 4.9 }), 4);
        assert.strictEqual(ev("n | round", { n: 4.5 }), 5);
        assert.strictEqual(ev("n | pct", { n: 0.42 }), "42%");
        assert.strictEqual(ev("s | upper", { s: "hi" }), "HI");
        assert.strictEqual(ev("v | default:'none'", { v: undefined }), "none");
        assert.strictEqual(ev("n | clamp:0:10", { n: 99 }), 10);
        assert.deepStrictEqual(ev("list | page:0:2", { list: [1, 2, 3, 4, 5] }), [1, 2]);
        assert.strictEqual(ev("list | pages:2", { list: [1, 2, 3, 4, 5] }), 3);
        assert.strictEqual(ev("s | trunc:5", { s: "hello world" }), "hel..");
    });

    test("registerFilter: a custom filter works exactly like a built-in one", () => {
        registerFilter("rarity", n => "*".repeat(Number(n) || 0));
        assert.strictEqual(ev("n | rarity", { n: 3 }), "***");
    });

    test("registerFilter: refuses to shadow a built-in name", () => {
        assert.throws(() => registerFilter("int", () => 0), /already has this name/);
    });

    test("withLoops: scopes a loop variable and optional index name over the base env", () => {
        const base = { roster: [{ name: "Yuki" }, { name: "Aiko" }] };
        const scoped = withLoops(base, [["c", ["path", ["roster"]], 1, "i"]]);
        assert.strictEqual(scoped.c.name, "Aiko");
        assert.strictEqual(scoped.i, 1);
        // The base env's own fields are still reachable through the scope chain.
        assert.deepStrictEqual(scoped.roster, base.roster);
    });

    console.log(`\n${passed} passed`);
})();
