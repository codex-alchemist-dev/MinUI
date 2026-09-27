#!/usr/bin/env node
// A real .screen.tsx that uses generics, decorators, enums, namespaces,
// template literal types, `satisfies`, private class fields, optional
// chaining/nullish coalescing, and async/await must compile with real tsc
// AND produce correct runtime values - proving MinUI's JSX authoring layer
// imposes no restricted TypeScript subset.
"use strict";
const assert = require("assert");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
execFileSync(process.execPath, [require.resolve("typescript/bin/tsc")], { cwd: ROOT, stdio: "inherit" });

(async () => {
    const mod = require(path.join(ROOT, "dist", "src", "test", "fixtures", "obscure-syntax.screen.js"));
    const title = await mod.loadTitle();
    assert.strictEqual(title, "HELLO, WORLD", "decorator + generics + async/await result");
    assert.strictEqual(mod.rarityLabel, "Legendary", "enum + namespace lookup");
    assert.strictEqual(mod.count, 5, "optional chaining + nullish coalescing");
    assert.strictEqual(mod.default.tag, "screen");
    assert.strictEqual(mod.default.attrs.id, "home", "template literal type + satisfies, used as a real JSX prop");
    assert.deepStrictEqual(mod.default.children[0].children[0].children[0], { text: "Legendary x5" });
    console.log("ok - decorators/generics/enums/namespaces/template-literal-types/satisfies/private-fields/optional-chaining/async-await all compile AND execute correctly through the real pipeline");
    console.log(`\n1 passed`);
})();
