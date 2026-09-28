#!/usr/bin/env node
// Real tests for lib/modifications.js (OR-Track D6) - every operation
// exercised against a real JSON-UI-shaped control array (single-key entries,
// some with @template references, matching real compiled output shape).
"use strict";
const assert = require("assert");
const { applyModifications, keyOf } = require("./modifications.js");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

function fresh() {
    return {
        screen_home: {
            type: "panel",
            controls: [
                { a: { type: "label", text: "A" } },
                { "b@cw.some_template": { type: "panel" } },
                { c: { type: "label", text: "C" } },
            ],
        },
    };
}
function keys(doc) { return doc.screen_home.controls.map(keyOf); }

test("keyOf: strips @template suffix", () => {
    assert.strictEqual(keyOf({ "foo@ns.bar": {} }), "foo");
    assert.strictEqual(keyOf({ plain: {} }), "plain");
});

test("insert_back appends", () => {
    const doc = applyModifications(fresh(), [{ target: "screen_home.controls", op: "insert_back", value: [{ d: {} }] }]);
    assert.deepStrictEqual(keys(doc), ["a", "b", "c", "d"]);
});

test("insert_front prepends", () => {
    const doc = applyModifications(fresh(), [{ target: "screen_home.controls", op: "insert_front", value: [{ z: {} }] }]);
    assert.deepStrictEqual(keys(doc), ["z", "a", "b", "c"]);
});

test("insert_after / insert_before, matching by name even through an @template suffix", () => {
    const doc = applyModifications(fresh(), [{ target: "screen_home.controls", op: "insert_after", anchor: "b", value: [{ x: {} }] }]);
    assert.deepStrictEqual(keys(doc), ["a", "b", "x", "c"]);
    const doc2 = applyModifications(fresh(), [{ target: "screen_home.controls", op: "insert_before", anchor: "b", value: [{ x: {} }] }]);
    assert.deepStrictEqual(keys(doc2), ["a", "x", "b", "c"]);
});

test("move_back / move_front", () => {
    const doc = applyModifications(fresh(), [{ target: "screen_home.controls", op: "move_back", anchor: "a" }]);
    assert.deepStrictEqual(keys(doc), ["b", "c", "a"]);
    const doc2 = applyModifications(fresh(), [{ target: "screen_home.controls", op: "move_front", anchor: "c" }]);
    assert.deepStrictEqual(keys(doc2), ["c", "a", "b"]);
});

test("move_after / move_before", () => {
    const doc = applyModifications(fresh(), [{ target: "screen_home.controls", op: "move_after", anchor: "a", after: "c" }]);
    assert.deepStrictEqual(keys(doc), ["b", "c", "a"]);
    const doc2 = applyModifications(fresh(), [{ target: "screen_home.controls", op: "move_before", anchor: "c", before: "a" }]);
    assert.deepStrictEqual(keys(doc2), ["c", "a", "b"]);
});

test("swap", () => {
    const doc = applyModifications(fresh(), [{ target: "screen_home.controls", op: "swap", anchor: "a", with: "c" }]);
    assert.deepStrictEqual(keys(doc), ["c", "b", "a"]);
});

test("replace preserves position", () => {
    const doc = applyModifications(fresh(), [{ target: "screen_home.controls", op: "replace", anchor: "b", value: { b: { type: "image" } } }]);
    assert.deepStrictEqual(keys(doc), ["a", "b", "c"]);
    assert.strictEqual(doc.screen_home.controls[1].b.type, "image");
});

test("remove", () => {
    const doc = applyModifications(fresh(), [{ target: "screen_home.controls", op: "remove", anchor: "b" }]);
    assert.deepStrictEqual(keys(doc), ["a", "c"]);
});

test("modifications apply in order, each seeing the previous result", () => {
    const doc = applyModifications(fresh(), [
        { target: "screen_home.controls", op: "insert_back", value: [{ d: {} }] },
        { target: "screen_home.controls", op: "move_front", anchor: "d" },
        { target: "screen_home.controls", op: "remove", anchor: "a" },
    ]);
    assert.deepStrictEqual(keys(doc), ["d", "b", "c"]);
});

test("an unknown anchor throws a clear error", () => {
    assert.throws(() => applyModifications(fresh(), [{ target: "screen_home.controls", op: "remove", anchor: "nope" }]), /no control named "nope"/);
});

test("an unknown op throws a clear error", () => {
    assert.throws(() => applyModifications(fresh(), [{ target: "screen_home.controls", op: "teleport", anchor: "a" }]), /unknown op "teleport"/);
});

test("a target that isn't an array throws a clear error", () => {
    assert.throws(() => applyModifications(fresh(), [{ target: "screen_home.type", op: "insert_back", value: [{}] }]), /must resolve to an array/);
});

console.log(`\n${passed} passed`);
