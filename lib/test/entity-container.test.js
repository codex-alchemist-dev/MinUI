#!/usr/bin/env node
// Plain-Node test runner (no dependencies) for entity-container.js's
// validateContainerContract() (OR-Track D5 - chest-contract structural
// validation, credited to mcbejsonuimasterAI's own research pattern).
// Run: node lib/test/entity-container.test.js
"use strict";

const assert = require("assert");
const { ContainerBuilder, validateContainerContract } = require("../entity-container.js");

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

function freshBuilder() {
    return new ContainerBuilder("cw", { equipCollection: "horse_equip_items", reservedEquipSlots: 2 });
}

test("validateContainerContract: a clean builder with no duplicate labels reports no issues", () => {
    const b = freshBuilder();
    b.Inventory("bag", 9, 3);
    b.Equipment("gear", 1, 1);
    b.Button("close", { offset: [0, 0] });
    assert.deepStrictEqual(validateContainerContract(b), []);
});

test("validateContainerContract: catches a label reused across two Inventory() calls", () => {
    const b = freshBuilder();
    b.Inventory("bag", 9, 3);
    b.Inventory("bag", 3, 1); // same label, second call silently overwrites this.sections["bag"]
    const issues = validateContainerContract(b);
    assert.strictEqual(issues.length, 1);
    assert.match(issues[0].issue, /label "bag" was allocated 2 times/);
    assert.strictEqual(issues[0].runtimeVerified, false);
});

test("validateContainerContract: catches a label reused across DIFFERENT primitives (Inventory then Button)", () => {
    const b = freshBuilder();
    b.Inventory("slot1", 1, 1);
    b.Button("slot1", { offset: [0, 0] }); // same label as the inventory section above
    const issues = validateContainerContract(b);
    assert.ok(issues.some(i => /label "slot1" was allocated 2 times/.test(i.issue)));
});

test("validateContainerContract: catches the declared entity inventory size being too small", () => {
    const b = freshBuilder();
    b.Inventory("bag", 9, 3); // allocates container_items indices up through 26 (plus the 2 reserved equip slots ahead of it)
    const issues = validateContainerContract(b, { declaredInventorySize: 5 });
    assert.ok(issues.some(i => /declared entity inventory size is only 5/.test(i.issue)));
});

test("validateContainerContract: a declared size that's big enough reports no size issue", () => {
    const b = freshBuilder();
    const { endIndex } = b.Inventory("bag", 9, 3);
    const issues = validateContainerContract(b, { declaredInventorySize: endIndex + 1 });
    assert.deepStrictEqual(issues, []);
});

test("validateContainerContract: attachTo child labels are tracked too, not just top-level sections", () => {
    const b = freshBuilder();
    b.Inventory("parent", 1, 1);
    b.Inventory("child", 1, 1, { attachTo: "parent" });
    b.Button("child", { offset: [0, 0], attachTo: "parent" }); // reuses "child" as a label inside the same parent
    const issues = validateContainerContract(b);
    assert.ok(issues.some(i => /label "child" was allocated 2 times/.test(i.issue)));
});

test("a genuine collection_index collision (e.g. a future allocator bug) is caught by lintjsonui.js (OR-Track D5) over the real compiled JSON, not validateContainerContract", () => {
    const { lintJsonUi } = require("../lintjsonui.js");
    const b = freshBuilder();
    b.Button("a", { offset: [0, 0] });
    b.Button("b", { offset: [0, 0] });
    const aCell = b.controls[b.controls.length - 2].grid_a.controls[0];
    const bCell = b.controls[b.controls.length - 1].grid_b.controls[0];
    bCell[Object.keys(bCell)[0]].collection_index = aCell[Object.keys(aCell)[0]].collection_index; // simulate a future allocator bug directly, in the real compiled JSON
    const doc = { namespace: "cw", root: { type: "panel", controls: b.controls } };
    const map = new Map([["ui/test.json", Buffer.from(JSON.stringify(doc))]]);
    const errors = lintJsonUi(map, "test");
    assert.ok(errors.some(e => /collection_index collision on container_items#/.test(e)));
});

console.log(`\n${passed} passed`);
