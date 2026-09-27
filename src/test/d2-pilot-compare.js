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
console.log(`\n1 passed`);
