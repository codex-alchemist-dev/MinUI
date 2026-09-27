#!/usr/bin/env node
// OR-Track D2's container-screen proof: a real .screen.tsx using JSX
// <ContainerScreen>/<Slot>/<Equip>/<LockedButton> must produce a genuinely
// correct, real ContainerBuilder (the same backend Inventory()/Equipment()/
// Button() calls always produced) - not a parallel/fake implementation.
"use strict";
const assert = require("assert");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
execFileSync(process.execPath, [require.resolve("typescript/bin/tsc")], { cwd: ROOT, stdio: "inherit" });

const { ContainerScreen, Slot } = require(path.join(ROOT, "dist", "src", "components", "container.js"));
const builder = require(path.join(ROOT, "dist", "src", "test", "fixtures", "satchel.screen.js")).default;

assert.strictEqual(builder.constructor.name, "ContainerBuilder");
assert.deepStrictEqual(builder.allocatedLabels, ["bag", "equip", "confirm"]);
assert.strictEqual(builder.maxContainerIndex, 26);
console.log("ok - JSX <ContainerScreen>/<Slot>/<Equip>/<LockedButton> produces a real, correctly-allocated ContainerBuilder");

assert.throws(
    () => ContainerScreen({ namespace: "cw", declaredInventorySize: 2, children: [Slot({ label: "bag", cols: 6, rows: 4 })] }),
    /declared entity inventory size is only 2/,
    "declaredInventorySize validation (OR-Track D5) must still fire when reached through JSX"
);
console.log("ok - declaredInventorySize validation (OR-Track D5) fires correctly through the JSX path too");
console.log(`\n2 passed`);
