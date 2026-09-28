#!/usr/bin/env node
// OR-Track D2's real proof, kept as a real automated test rather than a
// one-off manual check: compiles the same screen through BOTH authoring
// paths (real .ui.html text via lib/compile.js's compileUi(), and the real
// .screen.tsx via tsc + src/compiler/screenCompiler.js) and asserts the
// two produce byte-identical JSON UI and an identical runtime field table.
// This is the actual "at least one real screen exists in the new format,
// proven equivalent" checkpoint the plan requires before D2 counts as done.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { compileUi } = require("../../lib/compile.js");
const { compileScreens } = require("../compiler/screenCompiler.js");

const ROOT = path.join(__dirname, "..", "..");

// Real tsc, real compiler - no shortcuts. Invoked via its own bin script
// through `node`, not `npx`, so this works identically on every platform
// (npx's .cmd shim on Windows needs a shell, which execFileSync avoids on
// purpose elsewhere in this project's own test suites).
execFileSync(process.execPath, [require.resolve("typescript/bin/tsc")], { cwd: ROOT, stdio: "inherit" });

const htmlText = fs.readFileSync(path.join(__dirname, "fixtures", "home.trimmed.ui.html"), "utf8");
const fromHtml = compileUi([{ rel: "home.trimmed.ui.html", text: htmlText }]);

const fromTsx = compileScreens({
    compiledScreenFiles: [path.join(ROOT, "dist", "src", "test", "fixtures", "home.screen.js")],
    cssFiles: [],
});

assert.deepStrictEqual(fromTsx.rp["ui/openchara/screens.json"].screen_home, fromHtml.rp["ui/openchara/screens.json"].screen_home,
    "the .screen.tsx-authored screen must compile to BYTE-IDENTICAL JSON UI as the equivalent .ui.html-authored one");
assert.deepStrictEqual(fromTsx.stats, fromHtml.stats, "runtime field counts must match exactly");
console.log("ok - OR-Track D2: a real .screen.tsx compiles through the proven backend to IDENTICAL JSON UI as the equivalent .ui.html");

// <switch>/<case>/<default>/<animate> (added after D2's initial ship) must
// also be reachable from JSX, not just .ui.html - compiled with the same
// tsc invocation above (no need to run it twice).
const fromSwitchJsx = compileScreens({
    compiledScreenFiles: [path.join(ROOT, "dist", "src", "test", "fixtures", "switch-animate.screen.js")],
    cssFiles: [],
});
assert.strictEqual(fromSwitchJsx.stats.rarity_demo, 3, "3 switch branches -> 3 runtime fields");
const animKeys = Object.keys(fromSwitchJsx.rp["ui/openchara/screens.json"]).filter(k => k.startsWith("anim_"));
assert.strictEqual(animKeys.length, 1, "the <Animate> inside <Case value=\"legendary\"> registers one real animation definition");
console.log("ok - <switch>/<case>/<default>/<animate> are reachable from JSX, not just .ui.html");

const fromKeyframesJsx = compileScreens({
    compiledScreenFiles: [path.join(ROOT, "dist", "src", "test", "fixtures", "keyframes-jsx-check.screen.js")],
    cssFiles: [],
});
const kfAnimKeys = Object.keys(fromKeyframesJsx.rp["ui/openchara/screens.json"]).filter(k => k.startsWith("anim_"));
assert.strictEqual(kfAnimKeys.length, 6, "<Keyframes curve=\"catmull-rom\" steps={6}> bakes into 6 chained segments, reachable from JSX");
console.log("ok - <Keyframes>/<Key> (real keyframing + Catmull-Rom) are reachable from JSX, not just .ui.html");

console.log(`\n3 passed`);
