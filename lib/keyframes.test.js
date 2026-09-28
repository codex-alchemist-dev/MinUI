#!/usr/bin/env node
// Real tests for the "high-featured animator" pass: <keyframes> (real
// multi-waypoint keyframing + Catmull-Rom spline motion) and
// easing="cubic-bezier(...)" custom-curve baking on <animate>/<key>, all
// built on lib/easing.js's verified math and lib/compile.js's real,
// unchanged native two-point anim_type + `next` chaining primitive.
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
function animKeys(doc) { return Object.keys(doc).filter(k => k.startsWith("anim_")); }
function findByType(node, type) {
    if (!node || typeof node !== "object") return undefined;
    if (node.type === type) return node;
    for (const child of node.controls ?? []) for (const v of Object.values(child)) { const f = findByType(v, type); if (f) return f; }
    return undefined;
}
function walkChain(doc, startRef) {
    const seen = [];
    let key = startRef.split(".")[1];
    for (let i = 0; i < 50; i++) {
        if (seen.includes(key)) return { seen, loopedTo: key };
        seen.push(key);
        const next = doc[key].next;
        if (!next) return { seen, loopedTo: null };
        key = next.split(".")[1];
    }
    throw new Error("chain did not terminate in 50 steps");
}

// ---- easing="cubic-bezier(...)" on <animate> ------------------------------

test("<animate easing=\"cubic-bezier(...)\"> bakes into 12 chained linear segments by default", () => {
    const doc = compile(`<screen id="g"><image src="a"><animate type="offset" duration="0.4" easing="cubic-bezier(0.68,-0.55,0.27,1.55)" from="[0,0]" to="[20,0]"/></image></screen>`);
    assert.strictEqual(animKeys(doc).length, 12);
});

test("<animate easing=\"cubic-bezier(...)\"> respects a custom steps= count", () => {
    const doc = compile(`<screen id="g"><image src="a"><animate type="offset" duration="0.4" steps="5" easing="cubic-bezier(0.68,-0.55,0.27,1.55)" from="[0,0]" to="[20,0]"/></image></screen>`);
    assert.strictEqual(animKeys(doc).length, 5);
});

test("<animate easing=\"cubic-bezier(...)\"> baked chain starts exactly at from= and ends exactly at to=", () => {
    const doc = compile(`<screen id="g"><image src="a"><animate type="offset" duration="0.4" easing="cubic-bezier(0.25,0.1,0.25,1)" from="[0,0]" to="[100,0]"/></image></screen>`);
    const image = findByType(doc.screen_g, "image");
    const { seen } = walkChain(doc, image.anims[0]);
    assert.deepStrictEqual(doc[seen[0]].from, [0, 0]);
    assert.deepStrictEqual(doc[seen[seen.length - 1]].to, [100, 0]);
    // Every segment's own easing is "linear" - the CURVE SHAPE lives in where
    // each segment's from/to sit, not in a per-segment easing keyword.
    for (const k of seen) assert.strictEqual(doc[k].easing, "linear");
});

test("<animate easing=\"cubic-bezier(...)\"> without both from= and to= is a clear compile error", () => {
    assert.throws(() => compile(`<screen id="g"><image src="a"><animate type="offset" duration="0.4" easing="cubic-bezier(0.25,0.1,0.25,1)" from="[0,0]"/></image></screen>`), /needs both from= and to=/);
});

test("a non-native, non-cubic-bezier easing string is a clear compile error naming valid values", () => {
    assert.throws(() => compile(`<screen id="g"><image src="a"><animate type="alpha" duration="0.1" from="0" to="1" easing="ease-in-out"/></image></screen>`), /isn't a real Bedrock easing value/);
});

test("a real native easing value (including bounce/elastic/back) is accepted as-is, unbaked", () => {
    for (const easing of ["out_bounce", "in_out_elastic", "out_back", "spring"]) {
        const doc = compile(`<screen id="g"><image src="a"><animate type="alpha" duration="0.1" from="0" to="1" easing="${easing}"/></image></screen>`);
        assert.strictEqual(animKeys(doc).length, 1, `easing="${easing}" should not be baked into multiple segments`);
        assert.strictEqual(Object.values(doc).find(v => v && v.anim_type).easing, easing);
    }
});

// ---- <keyframes> (pairwise, native easing per segment) --------------------

test("<keyframes>: N keys produce N-1 chained segments, each with the correct duration slice and easing", () => {
    const doc = compile(`<screen id="g"><image src="a"><keyframes property="offset" duration="0.6"><key at="0" value="[0,0]"/><key at="0.5" value="[10,-20]" easing="out_bounce"/><key at="1" value="[0,0]" easing="in_quad"/></keyframes></image></screen>`);
    const image = findByType(doc.screen_g, "image");
    const { seen } = walkChain(doc, image.anims[0]);
    assert.strictEqual(seen.length, 2);
    assert.deepStrictEqual(doc[seen[0]], { anim_type: "offset", easing: "out_bounce", duration: 0.3, from: [0, 0], to: [10, -20], next: `@oc_screens.${seen[1]}` });
    assert.deepStrictEqual(doc[seen[1]], { anim_type: "offset", easing: "in_quad", duration: 0.3, from: [10, -20], to: [0, 0] });
});

test("<keyframes>: the first key needs no easing (nothing animates into it) and is not validated", () => {
    assert.doesNotThrow(() => compile(`<screen id="g"><image src="a"><keyframes property="alpha" duration="0.4"><key at="0" value="0" easing="not-a-real-easing-but-unused"/><key at="1" value="1"/></keyframes></image></screen>`));
});

test("<keyframes loop=\"true\">: the final segment's next points back to the first segment, forming a real cycle", () => {
    const doc = compile(`<screen id="g"><image src="a"><keyframes property="offset" duration="0.6" loop="true"><key at="0" value="[0,0]"/><key at="0.5" value="[10,0]"/><key at="1" value="[0,0]"/></keyframes></image></screen>`);
    const image = findByType(doc.screen_g, "image");
    const { loopedTo } = walkChain(doc, image.anims[0]);
    assert.strictEqual(loopedTo, image.anims[0].split(".")[1]);
});

test("<keyframes>: a <key> using cubic-bezier easing bakes its own segment into a sub-chain that still links correctly into the rest", () => {
    const doc = compile(`<screen id="g"><image src="a"><keyframes property="offset" duration="0.6"><key at="0" value="[0,0]"/><key at="1" value="[20,0]" easing="cubic-bezier(0.68,-0.55,0.27,1.55)"/></keyframes></image></screen>`);
    const image = findByType(doc.screen_g, "image");
    const { seen, loopedTo } = walkChain(doc, image.anims[0]);
    assert.strictEqual(seen.length, 12, "the bezier key bakes into 12 linear sub-segments");
    assert.strictEqual(loopedTo, null, "no loop requested - the chain must terminate");
    assert.deepStrictEqual(doc[seen[0]].from, [0, 0]);
    assert.deepStrictEqual(doc[seen[seen.length - 1]].to, [20, 0]);
});

test("<keyframes loop=\"true\">: loops correctly even when the final segment is itself a baked bezier sub-chain", () => {
    const doc = compile(`<screen id="g"><image src="a"><keyframes property="offset" duration="0.6" loop="true"><key at="0" value="[0,0]"/><key at="1" value="[20,0]" easing="cubic-bezier(0.68,-0.55,0.27,1.55)"/></keyframes></image></screen>`);
    const image = findByType(doc.screen_g, "image");
    const { seen, loopedTo } = walkChain(doc, image.anims[0]);
    assert.strictEqual(seen.length, 12);
    assert.strictEqual(loopedTo, image.anims[0].split(".")[1]);
});

// ---- <keyframes curve="catmull-rom"> --------------------------------------

test("<keyframes curve=\"catmull-rom\">: samples into `steps` chained linear segments, starting/ending exactly at the first/last key", () => {
    const doc = compile(`<screen id="g"><image src="a"><keyframes property="offset" duration="0.8" curve="catmull-rom" steps="4"><key at="0" value="[0,0]"/><key at="0.5" value="[10,-20]"/><key at="1" value="[20,0]"/></keyframes></image></screen>`);
    const image = findByType(doc.screen_g, "image");
    const { seen, loopedTo } = walkChain(doc, image.anims[0]);
    assert.strictEqual(seen.length, 4);
    assert.strictEqual(loopedTo, null);
    assert.deepStrictEqual(doc[seen[0]].from, [0, 0]);
    assert.deepStrictEqual(doc[seen[seen.length - 1]].to, [20, 0]);
    for (const k of seen) assert.strictEqual(doc[k].easing, "linear");
});

test("<keyframes curve=\"catmull-rom\">: the middle sample (at exactly a key's own position) matches that key's value", () => {
    // steps=2 means samples at t=0, 0.5, 1 - t=0.5 should land exactly on the middle key (Catmull-Rom passes through every control point).
    const doc = compile(`<screen id="g"><image src="a"><keyframes property="offset" duration="0.8" curve="catmull-rom" steps="2"><key at="0" value="[0,0]"/><key at="0.5" value="[10,-20]"/><key at="1" value="[20,0]"/></keyframes></image></screen>`);
    const image = findByType(doc.screen_g, "image");
    const { seen } = walkChain(doc, image.anims[0]);
    assert.strictEqual(seen.length, 2);
    assert.deepStrictEqual(doc[seen[0]].to, [10, -20], "the shared boundary between the two segments must be exactly the middle key");
    assert.deepStrictEqual(doc[seen[1]].from, [10, -20]);
});

test("<keyframes curve=\"catmull-rom\" loop=\"true\">: forms a real cycle", () => {
    const doc = compile(`<screen id="g"><image src="a"><keyframes property="offset" duration="0.8" curve="catmull-rom" steps="3" loop="true"><key at="0" value="[0,0]"/><key at="1" value="[20,0]"/></keyframes></image></screen>`);
    const image = findByType(doc.screen_g, "image");
    const { loopedTo } = walkChain(doc, image.anims[0]);
    assert.strictEqual(loopedTo, image.anims[0].split(".")[1]);
});

test("<keyframes curve=\"catmull-rom\">: works for scalar (alpha-style) values too, not just vectors", () => {
    const doc = compile(`<screen id="g"><image src="a"><keyframes property="alpha" duration="0.4" curve="catmull-rom" steps="4"><key at="0" value="0"/><key at="0.5" value="1"/><key at="1" value="0.3"/></keyframes></image></screen>`);
    const image = findByType(doc.screen_g, "image");
    const { seen } = walkChain(doc, image.anims[0]);
    assert.strictEqual(typeof doc[seen[0]].from, "number");
    assert.strictEqual(doc[seen[0]].from, 0);
    assert.ok(Math.abs(doc[seen[seen.length - 1]].to - 0.3) < 1e-9, `expected ~0.3, got ${doc[seen[seen.length - 1]].to}`);
});

// ---- <keyframes> validation errors -----------------------------------------

test("<keyframes> with no property= is a clear compile error", () => {
    assert.throws(() => compile(`<screen id="g"><image src="a"><keyframes duration="0.4"><key at="0" value="0"/><key at="1" value="1"/></keyframes></image></screen>`), /needs property=/);
});

test("<keyframes> with no duration= (or a non-positive one) is a clear compile error", () => {
    assert.throws(() => compile(`<screen id="g"><image src="a"><keyframes property="alpha"><key at="0" value="0"/><key at="1" value="1"/></keyframes></image></screen>`), /needs duration=/);
});

test("<keyframes> with fewer than 2 keys is a clear compile error", () => {
    assert.throws(() => compile(`<screen id="g"><image src="a"><keyframes property="alpha" duration="0.4"><key at="0" value="0"/></keyframes></image></screen>`), /needs at least 2 <key>/);
});

test("<keyframes> whose first key isn't at=\"0\" is a clear compile error", () => {
    assert.throws(() => compile(`<screen id="g"><image src="a"><keyframes property="alpha" duration="0.4"><key at="0.2" value="0"/><key at="1" value="1"/></keyframes></image></screen>`), /first <key> must be at="0"/);
});

test("<keyframes> whose last key isn't at=\"1\" is a clear compile error", () => {
    assert.throws(() => compile(`<screen id="g"><image src="a"><keyframes property="alpha" duration="0.4"><key at="0" value="0"/><key at="0.8" value="1"/></keyframes></image></screen>`), /last <key> must be at="1"/);
});

test("<keyframes> keys are sorted by at= regardless of authoring order", () => {
    const doc = compile(`<screen id="g"><image src="a"><keyframes property="alpha" duration="0.4"><key at="1" value="1"/><key at="0" value="0"/></keyframes></image></screen>`);
    const image = findByType(doc.screen_g, "image");
    const { seen } = walkChain(doc, image.anims[0]);
    assert.strictEqual(doc[seen[0]].from, 0);
    assert.strictEqual(doc[seen[0]].to, 1);
});

console.log(`\n${passed} passed`);
