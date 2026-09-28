#!/usr/bin/env node
// Real tests for lib/markup.js's CSS custom properties (resolveVars/
// substituteVars) - markup.js had no dedicated test file before this
// despite being the actual .ui.html/.ui.css parser.
"use strict";
const assert = require("assert");
const { parseCss, resolveVars, substituteVars } = require("./markup.js");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

test("resolveVars: a simple var() is substituted with the declared value", () => {
    const rules = parseCss("screen { --accent: #ff0000; } button { background-color: var(--accent); }", "t");
    resolveVars(rules);
    assert.strictEqual(rules[1].decls["background-color"], "#ff0000");
});

test("resolveVars: -- declarations are stripped from the final decls (not real style properties)", () => {
    const rules = parseCss("screen { --accent: #ff0000; color: white; }", "t");
    resolveVars(rules);
    assert.strictEqual("--accent" in rules[0].decls, false);
    assert.strictEqual(rules[0].decls.color, "white");
});

test("resolveVars: one level of var-in-var chaining resolves fully", () => {
    const rules = parseCss("screen { --accent: #ff0000; --accent-hover: var(--accent); } button { color: var(--accent-hover); }", "t");
    resolveVars(rules);
    assert.strictEqual(rules[1].decls.color, "#ff0000");
});

test("resolveVars: an undefined variable with no fallback resolves to empty string", () => {
    const rules = parseCss("button { color: var(--nope); }", "t");
    resolveVars(rules);
    assert.strictEqual(rules[0].decls.color, "");
});

test("resolveVars: var(--x, fallback) uses the fallback when --x is undefined", () => {
    const rules = parseCss("button { width: var(--missing, 42); }", "t");
    resolveVars(rules);
    assert.strictEqual(rules[0].decls.width, "42");
});

test("resolveVars: a defined variable wins over its own fallback", () => {
    const rules = parseCss("screen { --accent: #00ff00; } button { color: var(--accent, #ffffff); }", "t");
    resolveVars(rules);
    assert.strictEqual(rules[1].decls.color, "#00ff00");
});

test("resolveVars: variables are global across every rule/selector combined, not scoped to where they're declared", () => {
    const rules = parseCss(".theme { --accent: #123456; } .totally-unrelated-selector { color: var(--accent); }", "t");
    resolveVars(rules);
    assert.strictEqual(rules[1].decls.color, "#123456");
});

test("resolveVars: returns the resolved vars map for callers that also need to substitute inline style=\"\" attributes", () => {
    const rules = parseCss("screen { --accent: #abcdef; }", "t");
    const vars = resolveVars(rules);
    assert.deepStrictEqual(vars, { "--accent": "#abcdef" });
});

test("substituteVars: usable directly (e.g. for an inline style=\"\" attribute) given an already-resolved vars map", () => {
    assert.strictEqual(substituteVars("var(--x)", { "--x": "10" }), "10");
    assert.strictEqual(substituteVars("var(--missing, 5)", {}), "5");
    assert.strictEqual(substituteVars("no vars here", { "--x": "10" }), "no vars here");
});

console.log(`\n${passed} passed`);
