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
const pending = [];
function test(name, fn) { pending.push([name, fn]); }

function compile(html) {
    return compileUi([{ rel: "t.ui.html", text: html }]).rp["ui/openchara/screens.json"];
}

function compileWithCss(css, html) {
    return compileUi([{ rel: "theme.ui.css", text: css }, { rel: "t.ui.html", text: html }]).rp["ui/openchara/screens.json"];
}

// The runtime field ASTs (what actually gets evaluated in-game) live in the
// generated `runtime` string, not the JSON UI output - parse it out for
// assertions that need to check the real if=/each= logic, not just JSON shape.
function compileRuntime(html) {
    const out = compileUi([{ rel: "t.ui.html", text: html }]);
    const m = out.runtime.match(/export const SCREENS = ({.*?});/s);
    return { SCREENS: JSON.parse(m[1]) };
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

test("<switch>/<case>/<default>: each case gets an == comparison, default gets the negation of every case", () => {
    const runtime = compileRuntime(`<screen id="g"><switch on="c.rarity"><case value="legendary"><text>L</text></case><case value="rare"><text>R</text></case><default><text>C</text></default></switch></screen>`);
    const fields = runtime.SCREENS.g.fields;
    assert.strictEqual(fields.length, 3);
    assert.deepStrictEqual(fields[0].e, ["bin", "==", ["path", ["c", "rarity"]], ["str", "legendary"]]);
    assert.deepStrictEqual(fields[1].e, ["bin", "==", ["path", ["c", "rarity"]], ["str", "rare"]]);
    assert.deepStrictEqual(fields[2].e, ["bin", "&&",
        ["not", ["bin", "==", ["path", ["c", "rarity"]], ["str", "legendary"]]],
        ["not", ["bin", "==", ["path", ["c", "rarity"]], ["str", "rare"]]]]);
});

test("<switch>: a numeric case value compares as a number, not a quoted string", () => {
    const runtime = compileRuntime(`<screen id="g"><switch on="c.level"><case value="10"><text>Ten</text></case></switch></screen>`);
    assert.deepStrictEqual(runtime.SCREENS.g.fields[0].e, ["bin", "==", ["path", ["c", "level"]], ["num", 10]]);
});

test("<switch>: exactly one branch is true for any input, verified against the real evaluator", async () => {
    const { evaluate } = await import("../runtime/expr.js");
    const runtime = compileRuntime(`<screen id="g"><switch on="c.rarity"><case value="legendary"><text>L</text></case><case value="rare"><text>R</text></case><default><text>C</text></default></switch></screen>`);
    const fields = runtime.SCREENS.g.fields;
    for (const rarity of ["legendary", "rare", "anything-else"]) {
        const results = fields.map(f => evaluate(f.e, { c: { rarity } }));
        assert.strictEqual(results.filter(Boolean).length, 1, `exactly one branch true for rarity="${rarity}", got ${JSON.stringify(results)}`);
    }
});

test("<switch> with no <default> and no matching case renders nothing (no error)", () => {
    const runtime = compileRuntime(`<screen id="g"><switch on="c.rarity"><case value="legendary"><text>L</text></case></switch></screen>`);
    assert.strictEqual(runtime.SCREENS.g.fields.length, 1);
});

test("<switch> with only a <default> and no <case> is valid, and needs no gating at all (always shown)", () => {
    const runtime = compileRuntime(`<screen id="g"><switch on="c.rarity"><default><text>Always</text></default></switch></screen>`);
    assert.strictEqual(runtime.SCREENS.g.fields.length, 0, "an unconditional default needs no vis field - it's just always visible");
});

test("<switch> with no on= is a clear compile error", () => {
    assert.throws(() => compile(`<screen id="g"><switch><case value="x"><text>x</text></case></switch></screen>`), /needs on=/);
});

test("<case> with no value= is a clear compile error", () => {
    assert.throws(() => compile(`<screen id="g"><switch on="c.x"><case><text>x</text></case></switch></screen>`), /needs value=/);
});

test("<switch> with more than one <default> is a clear compile error", () => {
    assert.throws(() => compile(`<screen id="g"><switch on="c.x"><default><text>a</text></default><default><text>b</text></default></switch></screen>`), /at most one <default>/);
});

test("<switch> with an unknown child tag is a clear compile error", () => {
    assert.throws(() => compile(`<screen id="g"><switch on="c.x"><text>oops</text></switch></screen>`), /may only contain <case>\/<default>/);
});

test("<switch> with neither <case> nor <default> is a clear compile error", () => {
    assert.throws(() => compile(`<screen id="g"><switch on="c.x"></switch></screen>`), /needs at least one <case> or a <default>/);
});

test("CSS custom properties: var() in a CSS-rule declaration resolves through style matching", () => {
    const doc = compileWithCss(
        `screen { --accent: #ff0000; } .warn { color: var(--accent); }`,
        `<screen id="g"><text class="warn">hi</text></screen>`,
    );
    const text = findByType(doc.screen_g, "label");
    assert.deepStrictEqual(text.color, [1, 0, 0]);
});

test("CSS custom properties: var() in an inline style=\"\" attribute also resolves (a real gap caught during implementation - inline styles bypass the rules array entirely)", () => {
    const doc = compileWithCss(
        `screen { --accent: #00ff00; }`,
        `<screen id="g"><text style="color: var(--accent)">hi</text></screen>`,
    );
    const text = findByType(doc.screen_g, "label");
    assert.deepStrictEqual(text.color, [0, 1, 0]);
});

test("CSS custom properties: a theme declared in one .ui.css file is visible when used in a completely different .ui.html file", () => {
    const out = compileUi([
        { rel: "theme.ui.css", text: "screen { --accent: #0000ff; }" },
        { rel: "a.ui.html", text: `<screen id="a"><text style="color: var(--accent)">a</text></screen>` },
    ]);
    const text = findByType(out.rp["ui/openchara/screens.json"].screen_a, "label");
    assert.deepStrictEqual(text.color, [0, 0, 1]);
});

(async () => {
    for (const [name, fn] of pending) {
        try { await fn(); passed++; console.log(`ok - ${name}`); }
        catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
    }
    console.log(`\n${passed} passed`);
})();
