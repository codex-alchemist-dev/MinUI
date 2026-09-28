#!/usr/bin/env node
// Real tests for lib/compile.js's <animate> element - a general escape
// hatch onto Bedrock's full native "anims" schema, additive to the
// existing fade-in/slide-from/pulse CSS sugar. compile.js itself had no
// dedicated test file before this - the D2 pilot-compare test exercises it
// indirectly through a real screen, this file tests it directly.
"use strict";
const assert = require("assert");
const { compileUi } = require("./compile.js");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

function compile(html) {
    return compileUi([{ rel: "t.ui.html", text: html }]).rp["ui/openchara/screens.json"];
}

// this.name()'s counter isn't stable across different test bodies, so find
// a control by type rather than guessing its generated key name.
function findByType(node, type) {
    if (!node || typeof node !== "object") return undefined;
    if (node.type === type) return node;
    for (const child of node.controls ?? []) {
        for (const v of Object.values(child)) {
            const found = findByType(v, type);
            if (found) return found;
        }
    }
    return undefined;
}

test("a basic <animate> attaches a real anims[] reference and registers a matching top-level definition", () => {
    const doc = compile(`<screen id="g"><panel><image src="a"><animate type="color" duration="0.3" easing="out_quad" from="[1,1,1]" to="[0.5,0,0]" play_event="button.example"/></image></panel></screen>`);
    const image = findByType(doc.screen_g, "image");
    assert.strictEqual(image.anims.length, 1);
    const ref = image.anims[0];
    assert.match(ref, /^@oc_screens\.anim_g_\d+$/);
    const defKey = ref.split(".")[1];
    assert.deepStrictEqual(doc[defKey], {
        anim_type: "color", duration: 0.3, easing: "out_quad", from: [1, 1, 1], to: [0.5, 0, 0], play_event: "button.example",
    });
});

test("multiple <animate> children on one element all attach, in order", () => {
    const doc = compile(`<screen id="g"><panel><image src="a"><animate type="alpha" duration="0.1" from="0" to="1"/><animate type="offset" duration="0.1" from="[0,0]" to="[4,0]"/></image></panel></screen>`);
    const image = findByType(doc.screen_g, "image");
    assert.strictEqual(image.anims.length, 2);
    assert.strictEqual(doc[image.anims[0].split(".")[1]].anim_type, "alpha");
    assert.strictEqual(doc[image.anims[1].split(".")[1]].anim_type, "offset");
});

test("an element with no <animate> children gets no anims field at all", () => {
    const doc = compile(`<screen id="g"><panel><image src="a"/></panel></screen>`);
    assert.strictEqual("anims" in findByType(doc.screen_g, "image"), false);
});

test("each= repeated instances each get their OWN animation, not a shared/lost one", () => {
    const doc = compile(`<screen id="g"><column><image src="a" each="c in list" max="3"><animate type="alpha" duration="0.2" from="0" to="1"/></image></column></screen>`);
    const anims = Object.keys(doc).filter(k => k.startsWith("anim_"));
    assert.strictEqual(anims.length, 3, "one real animation definition per repeated instance");
});

test("next= without an @ prefix is auto-namespaced, matching how other cross-references in this file work", () => {
    const doc = compile(`<screen id="g"><panel><image src="a"><animate type="alpha" duration="0.1" from="0" to="1" next="some_other_anim"/></image></panel></screen>`);
    const image = findByType(doc.screen_g, "image");
    assert.strictEqual(doc[image.anims[0].split(".")[1]].next, "@oc_screens.some_other_anim");
});

test("boolean flags (reversible/resettable) are coerced from the attribute string, not left as string \"true\"", () => {
    const doc = compile(`<screen id="g"><panel><image src="a"><animate type="alpha" duration="0.1" from="0" to="1" reversible="true" resettable="false"/></image></panel></screen>`);
    const image = findByType(doc.screen_g, "image");
    const def = doc[image.anims[0].split(".")[1]];
    assert.strictEqual(def.reversible, true);
    assert.strictEqual(def.resettable, false);
});

test("flip_book fields (fps/frame_count/frame_step/initial_uv) round-trip correctly", () => {
    const doc = compile(`<screen id="g"><panel><image src="a"><animate type="flip_book" fps="12" frame_count="8" frame_step="1" initial_uv="[0,0]"/></image></panel></screen>`);
    const image = findByType(doc.screen_g, "image");
    const def = doc[image.anims[0].split(".")[1]];
    assert.strictEqual(def.fps, 12);
    assert.strictEqual(def.frame_count, 8);
    assert.strictEqual(def.frame_step, 1);
    assert.deepStrictEqual(def.initial_uv, [0, 0]);
});

test("missing type= is a clear compile error, not a silent no-op", () => {
    assert.throws(() => compile(`<screen id="g"><panel><image src="a"><animate duration="0.1"/></image></panel></screen>`), /needs type=/);
});

test("invalid JSON in from=/to= is a clear compile error naming the bad attribute", () => {
    assert.throws(() => compile(`<screen id="g"><panel><image src="a"><animate type="alpha" from="not json"/></image></panel></screen>`), /from="not json".*must be valid JSON/);
});

test("<animate> on a <button> works alongside its normal on:press handling", () => {
    const doc = compile(`<screen id="g"><button on:press="close"><text>Go</text><animate type="size" duration="0.15" from="[100,24]" to="[110,24]"/></button></screen>`);
    const btn = doc.screen_g.controls[0];
    const btnControl = btn[Object.keys(btn)[0]];
    assert.ok(btnControl.anims, "the button control itself carries anims");
});

console.log(`\n${passed} passed`);
