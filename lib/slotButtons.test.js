#!/usr/bin/env node
// Run: node lib/slotButtons.test.js - the vanilla-screen patch emitter and the <slotbuttons> element.
"use strict";

const assert = require("assert");
const vp = require("./vanillaPatch.js");
const { compileUi } = require("./compile.js");
const { lintJsonUi } = require("./lintjsonui.js");
const { NAME_SENTINEL } = require("../runtime/slotButtonsCore.cjs");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

test("patchFile emits the native modifications shape (the same shape as rp/ui/hud_screen.json)", () => {
    const doc = vp.patchFile("hud", { root_panel: [vp.insertBack("controls", [{ x: {} }])], hud_title_text: [vp.insertBack("bindings", [{ binding_name: "#a" }])] });
    assert.deepStrictEqual(doc, {
        namespace: "hud",
        root_panel: { modifications: [{ array_name: "controls", operation: "insert_back", value: [{ x: {} }] }] },
        hud_title_text: { modifications: [{ array_name: "bindings", operation: "insert_back", value: [{ binding_name: "#a" }] }] },
    });
    const real = require("../rp/ui/hud_screen.json");
    assert.deepStrictEqual(Object.keys(real).sort(), ["hud_title_text", "namespace", "root_panel"], "hud_screen.json is this same shape");
});

test("every documented operation validates its required fields", () => {
    assert.deepStrictEqual(vp.insertAfter("controls", "a", [{ b: {} }]), { array_name: "controls", operation: "insert_after", control_name: "a", value: [{ b: {} }] });
    assert.strictEqual(vp.remove("controls", "a").operation, "remove");
    assert.throws(() => vp.modification("insert_back", "controls", {}), /insert_back needs value/);
    assert.throws(() => vp.modification("insert_after", "controls", { value: [] }), /needs control_name or where/);
    assert.throws(() => vp.modification("swap", "controls", { control_name: "a" }), /needs target/);
    assert.throws(() => vp.modification("explode", "controls", {}), /unknown operation/);
    assert.throws(() => vp.modification("insert_back", "nope", { value: [] }), /array_name must be/);
    assert.throws(() => vp.modification("insert_back", "controls", { value: {} }), /value must be an array/);
    assert.throws(() => vp.patchFile("", {}), /namespace is required/);
    assert.throws(() => vp.patchFile("common", { a: [] }), /needs at least one modification/);
    assert.deepStrictEqual(vp.OPERATIONS.length, 11);
});

test("mergePatches concatenates modifications per element, in order, and refuses mixed namespaces", () => {
    const a = vp.patchFile("common", { inventory_panel: [vp.insertBack("controls", [{ one: {} }])] });
    const b = vp.patchFile("common", { inventory_panel: [vp.insertBack("controls", [{ two: {} }])], other: [vp.remove("controls", "x")] });
    const m = vp.mergePatches([a, b]);
    assert.deepStrictEqual(m.inventory_panel.modifications.map(x => Object.keys(x.value[0])[0]), ["one", "two"]);
    assert.ok(m.other);
    assert.throws(() => vp.mergePatches([a, vp.patchFile("hud", { r: [vp.remove("controls", "x")] })]), /cannot merge namespaces/);
});

const compile = html => compileUi([{ rel: "t.ui.html", text: html }]);

test("<slotbuttons> compiles to a patch of common.inventory_panel: one frame overlay per slot, visible only for sentinel-named items", () => {
    const out = compile('<slotbuttons screen="inventory" tint="#ffd24a"/>');
    const doc = out.rp["ui/ui_common.json"];
    assert.strictEqual(doc.namespace, "common");
    const [mod] = doc.inventory_panel.modifications;
    assert.deepStrictEqual([mod.array_name, mod.operation], ["controls", "insert_back"]);
    const host = mod.value[0].oc_slot_buttons;
    assert.deepStrictEqual([host.size, host.anchor_from, host.offset], [[162, 54], "bottom_middle", [0, -26]], "sits exactly over vanilla's inventory grid");
    assert.strictEqual(host.controls.length, 27);
    const cell = n => Object.values(host.controls[n])[0];
    assert.deepStrictEqual([cell(0).collection_index, cell(0).offset, cell(0).collection_name], [9, [0, 0], "inventory_items"]);
    assert.deepStrictEqual([cell(10).collection_index, cell(10).offset], [19, [18, 18]], "row-major, 9 columns, 18px cells");
    assert.deepStrictEqual([cell(26).collection_index, cell(26).offset], [35, [144, 36]]);
    assert.deepStrictEqual(cell(0).color, [1, 0.824, 0.29]);
    assert.strictEqual(cell(0).texture, "textures/ui/highlight_slot");
    const visible = cell(0).bindings.find(b => b.target_property_name === "#visible");
    assert.ok(visible.source_property_name.includes(NAME_SENTINEL), "visibility keys off the invisible name sentinel");
    assert.ok(cell(0).bindings.some(b => b.binding_name === "#item_name" && b.binding_collection_name === "inventory_items"));
    assert.ok(!JSON.stringify(doc).includes("$"), "no $variable inside the injected subtree (they do not resolve there)");
});

test("<slotbuttons> options (first, count, cols, frame, layer) and errors point at the file and line", () => {
    const doc = compile('<slotbuttons first="0" count="9" cols="3" cell="20" frame="textures/ui/x" layer="3"/>').rp["ui/ui_common.json"];
    const host = doc.inventory_panel.modifications[0].value[0].oc_slot_buttons;
    assert.deepStrictEqual([host.controls.length, Object.values(host.controls[4])[0].offset, Object.values(host.controls[4])[0].collection_index], [9, [20, 20], 4]);
    assert.throws(() => compile('<slotbuttons screen="horse"/>'), /t\.ui\.html.*<slotbuttons> screen "horse" is not supported/);
    assert.throws(() => compile('<slotbuttons tint="red"/>'), /tint must be #rrggbb/);
    assert.throws(() => compile('<slotbuttons count="99"/>'), /cannot exceed the 36/);
    assert.throws(() => compile('<slotbuttons frame="http://x"/>'), /must be a texture path/);
    assert.strictEqual(compile('<screen id="a"><text>x</text></screen>').rp["ui/ui_common.json"], undefined, "no patch file unless asked for");
});

test("the emitted patch passes MinUI's own JSON UI lint (no collisions, no $variables, collection_index has its collection)", () => {
    const out = compile('<slotbuttons/>');
    const map = new Map([["ui/ui_common.json", Buffer.from(JSON.stringify(out.rp["ui/ui_common.json"]))]]);
    assert.deepStrictEqual(lintJsonUi(map, "RP"), []);
});

console.log(`\n${passed} passed`);
