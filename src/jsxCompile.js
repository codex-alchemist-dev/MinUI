// The real tsc-invocation + compiled-module-loading bridge, extracted from
// OR-Track D2's proven pattern (src/compiler/screenCompiler.js) so a SECOND
// consumer - OpenRock's own entity DSL (OR-Track M) and manifest DSL
// (OR-Track O) - can reuse the exact same real compile step instead of
// reimplementing it a second time. One source of truth: MinUI owns this
// because MinUI is the repo that already proved the pattern works (real
// tsc, real compiled-module loading, zero restricted TypeScript subset -
// see src/test/d2-obscure-syntax.js), not because entities/manifests are
// somehow a MinUI concern.
//
// Two real, separate steps, matching D2's own proven shape exactly:
//   1. compileWithRealTsc() - invokes the REAL TypeScript compiler as a
//      genuine child process (bypasses npx's Windows .cmd shim, which
//      needs a shell execFileSync avoids), against a real tsconfig.json.
//      Whatever syntax `tsc` itself accepts, compiles - no custom parser,
//      no restricted subset.
//   2. requireCompiled() - loads the resulting compiled .js as an ordinary
//      Node module (require(), cache-busted) - never a VM/sandbox.
"use strict";

const { execFileSync } = require("child_process");
const path = require("path");

/**
 * Invokes the real TypeScript compiler against `tsconfigPath` (a real
 * project config, with its own "jsx"/"jsxFactory"/"outDir" etc.) as a
 * genuine child process. Throws with tsc's own real compiler output on a
 * genuine compile failure - never swallowed.
 * @param {string} tsconfigPath - absolute path to a real tsconfig.json.
 * @param {object} [opts]
 * @param {string} [opts.cwd] - defaults to tsconfigPath's own directory.
 */
function compileWithRealTsc(tsconfigPath, { cwd } = {}) {
    const workDir = cwd ?? path.dirname(tsconfigPath);
    try {
        execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "-p", tsconfigPath], { cwd: workDir, stdio: "pipe" });
    } catch (e) {
        const output = [e.stdout?.toString(), e.stderr?.toString()].filter(Boolean).join("\n");
        throw new Error(`jsxCompile: real tsc failed compiling "${tsconfigPath}":\n${output || e.message}`);
    }
}

/**
 * Loads a real tsc-compiled .js file as an ordinary Node module - a plain
 * require(), never a VM/sandbox - clearing the require cache first so
 * repeated calls (e.g. a dev-mode watch loop recompiling on save) always
 * see the freshest compiled output, never a stale cached version.
 * @param {string} absPath - absolute path to a real compiled .js file.
 */
function requireCompiled(absPath) {
    delete require.cache[require.resolve(absPath)];
    return require(absPath);
}

module.exports = { compileWithRealTsc, requireCompiled };
