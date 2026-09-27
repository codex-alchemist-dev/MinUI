// MinUI's OR-Track D2 compiler entry point: takes a mod's already-`tsc`-
// compiled `.screen.js` files (real TypeScript output - whatever syntax a
// mod author wrote, since this loads the real compiled JS as an ordinary
// Node module, never a restricted parser/sandbox) and feeds the tree each
// one exports through lib/compile.js's proven, unchanged compileDocs() -
// the exact same emission logic real .ui.html text already goes through.
//
// This is a Regolith-style filter: given a directory of compiled
// `*.screen.js` files (each with a `.js.map` next to it from `tsc`) plus a
// mod's real `.ui.css`/`theme.ui.css` files (styling is unchanged, still
// real CSS text - only the markup authoring surface is new), it produces
// the identical { rp, runtime, stats } shape compileUi() already produces
// from real .ui.html/.ui.css files, so nothing downstream needs to know or
// care which authoring format a given mod used.
"use strict";
const fs = require("fs");
const path = require("path");
const { compileDocs } = require("../../lib/compile.js");
const { parseCss } = require("../../lib/markup.js");

// A compiled `.screen.js` file's default export is the node tree built by
// src/components/*.ts + src/jsx-runtime.ts - either a single <screen>/<hud>
// node, or an array of them (a file can export more than one screen).
function loadCompiledScreen(absPath) {
    delete require.cache[require.resolve(absPath)];
    const mod = require(absPath);
    const exported = mod.default ?? mod;
    const nodes = Array.isArray(exported) ? exported : [exported];
    for (const n of nodes) {
        if (!n || typeof n !== "object" || typeof n.tag !== "string") {
            throw new Error(`MinUI screenCompiler: ${absPath} must default-export a <Screen>/<Hud> node (or an array of them), got ${JSON.stringify(n)}`);
        }
    }
    return nodes;
}

/**
 * @param {{compiledScreenFiles: string[], cssFiles: {rel: string, text: string}[]}} input
 *   compiledScreenFiles - absolute paths to tsc-compiled *.screen.js files.
 *   cssFiles - the mod's real .ui.css source (unchanged format, plain text).
 */
function compileScreens({ compiledScreenFiles, cssFiles }) {
    const rules = [];
    for (const f of cssFiles) rules.push(...parseCss(f.text, `ui/${f.rel}`));

    const docs = compiledScreenFiles.map(absPath => ({
        file: path.relative(process.cwd(), absPath),
        doc: { children: loadCompiledScreen(absPath) },
    }));
    return compileDocs(docs, rules);
}

module.exports = { compileScreens, loadCompiledScreen };
