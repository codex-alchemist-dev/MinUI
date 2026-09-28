#!/usr/bin/env node
// Real tests for lintjsonui.js (OR-Track D5) - both the pre-existing checks
// (regression coverage, since the walk() context threading was reworked to
// support instantiation-site/collision tracking) and the checks widened in
// per happy-wibbling-pie.md's corrective route.
"use strict";
const assert = require("assert");
const { lintJsonUi } = require("./lintjsonui.js");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

function mapOf(json) {
    return new Map([["ui/screen.json", Buffer.from(JSON.stringify(json))]]);
}

test("clean file: no errors", () => {
    const doc = { namespace: "cw", screen_home: { type: "panel", controls: [{ a: { type: "label", text: "hi" } }] } };
    assert.deepStrictEqual(lintJsonUi(mapOf(doc), "test"), []);
});

test(">= is flagged", () => {
    const doc = { namespace: "cw", s: { type: "panel", bindings: [{ source_property_name: "(#x >= 5)" }] } };
    const errors = lintJsonUi(mapOf(doc), "test");
    assert.ok(errors.some(e => e.includes(">=")));
});

test("empty string literal is flagged", () => {
    const doc = { namespace: "cw", s: { type: "panel", bindings: [{ source_property_name: "('' + #x)" }] } };
    const errors = lintJsonUi(mapOf(doc), "test");
    assert.ok(errors.some(e => e.includes("crash") && e.includes("''")));
});

test("division on #inventory_stack_count is flagged as a confirmed crash", () => {
    const doc = { namespace: "cw", s: { type: "panel", bindings: [{ source_property_name: "(#inventory_stack_count / 19)" }] } };
    const errors = lintJsonUi(mapOf(doc), "test");
    assert.ok(errors.some(e => e.includes("crash") && e.includes("#inventory_stack_count")));
});

test("division on an unrelated (non-string) property is NOT flagged", () => {
    const doc = { namespace: "cw", s: { type: "panel", bindings: [{ source_property_name: "(#item_durability_total_amount / 100)" }] } };
    assert.deepStrictEqual(lintJsonUi(mapOf(doc), "test"), []);
});

test("collection_index with no ancestor collection_name is flagged", () => {
    const doc = { namespace: "cw", s: { type: "panel", controls: [{ a: { collection_index: 0 } }] } };
    const errors = lintJsonUi(mapOf(doc), "test");
    assert.ok(errors.some(e => e.includes("no ancestor collection_name")));
});

test("collection_index at a real instantiation site (inside controls, under collection_name) is clean", () => {
    const doc = { namespace: "cw", s: { type: "stack_panel", collection_name: "container_items", controls: [{ a: { collection_index: 0 } }, { b: { collection_index: 1 } }] } };
    assert.deepStrictEqual(lintJsonUi(mapOf(doc), "test"), []);
});

test("collection_index on a root-level definition (not inside controls) is flagged", () => {
    const doc = { namespace: "cw", collection_name: "container_items", my_def: { collection_index: 0 } };
    const errors = lintJsonUi(mapOf(doc), "test");
    assert.ok(errors.some(e => e.includes("root-level definition")));
});

test("duplicate collection_index under the same collection_name is flagged as a collision", () => {
    const doc = {
        namespace: "cw",
        s: { type: "stack_panel", collection_name: "container_items", controls: [{ a: { collection_index: 3 } }, { b: { collection_index: 3 } }] },
    };
    const errors = lintJsonUi(mapOf(doc), "test");
    assert.ok(errors.some(e => e.includes("collision") && e.includes("container_items#3")));
});

test("the same collection_index under DIFFERENT collection_name scopes is not a collision", () => {
    const doc = {
        namespace: "cw",
        a: { type: "stack_panel", collection_name: "container_items", controls: [{ x: { collection_index: 0 } }] },
        b: { type: "stack_panel", collection_name: "horse_equip_items", controls: [{ y: { collection_index: 0 } }] },
    };
    assert.deepStrictEqual(lintJsonUi(mapOf(doc), "test"), []);
});

test("a button with no collection_details binding is flagged", () => {
    const doc = { namespace: "cw", s: { type: "button", bindings: [{ binding_type: "view" }] } };
    const errors = lintJsonUi(mapOf(doc), "test");
    assert.ok(errors.some(e => e.includes("collection_details")));
});

test("a button WITH collection_details is clean", () => {
    const doc = { namespace: "cw", s: { type: "button", bindings: [{ binding_type: "collection_details", binding_collection_name: "form_buttons" }] } };
    assert.deepStrictEqual(lintJsonUi(mapOf(doc), "test"), []);
});

test("$variable inside a modifications subtree is flagged", () => {
    const doc = { namespace: "cw", s: { modifications: [{ array_name: "controls", operation: "insert_back", value: [{ x: { bindings: [{ source_property_name: "($myVar + 1)" }] } }] }] } };
    const errors = lintJsonUi(mapOf(doc), "test");
    assert.ok(errors.some(e => e.includes("$variable")));
});

test("$variable OUTSIDE a modifications subtree is not flagged", () => {
    const doc = { namespace: "cw", s: { bindings: [{ source_property_name: "($myVar + 1)" }] } };
    assert.deepStrictEqual(lintJsonUi(mapOf(doc), "test"), []);
});

console.log(`\n${passed} passed`);
