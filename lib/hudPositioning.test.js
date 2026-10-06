#!/usr/bin/env node
// Tests for <float>/<box> and the packed numeric HUD channel. Run: node lib/hudPositioning.test.js
"use strict";
const assert = require("assert");
const { compileUi } = require("./compile.js");
const { lintJsonUi } = require("./lintjsonui.js");
const { NUM_WIDTH, packedSlotExpr } = require("./compile/hudPositioning.js");

let passed = 0;
const pending = [];
function test(name, fn) {
    const done = () => { passed++; console.log(`ok - ${name}`); };
    const fail = e => { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; };
    try { const r = fn(); if (r && typeof r.then === "function") pending.push(r.then(done, fail)); else done(); } catch (e) { fail(e); }
}
const hud = body => compileUi([{ rel: "t.ui.html", text: `<hud id="rts" data="p" fast>${body}</hud>` }]);
const SAMPLE = '<float x="{cx}" y="{cy}"><image src="textures/ui/cursor" style="width:8;height:8"/></float><box w="{bw}" h="{bh}" style="background-color:#33ccff;background-opacity:0.3"/>';

test("slot expressions slice the packed text with fixed-width %.Ns cuts", () => {
    const P = "P";
    assert.strictEqual(packedSlotExpr(P, 0), "(('%.4s' * P) - 0)");
    assert.strictEqual(packedSlotExpr(P, 2), "(('%.4s' * (P - ('%.8s' * P))) - 0)");
});

test("a fast HUD records its packed numeric fields in slot order", () => {
    const r = hud(SAMPLE);
    const h = JSON.parse(r.runtime.match(/export const HUDS = (.*);/)[1]).rts;
    assert.strictEqual(h.fast, true);
    assert.strictEqual(h.packed, 4);
    assert.deepStrictEqual(h.fields.filter(f => f.k === "num").map(f => [f.slot, f.e[1][0]]), [[0, "cx"], [1, "cy"], [2, "bw"], [3, "bh"]]);
});

test("<float> compiles to two bound spacers (height from y, width from x) in a vertical/horizontal stack", () => {
    const r = hud('<float x="{cx}" y="{cy}"><image src="textures/ui/cursor" style="width:8;height:8"/></float>');
    const text = JSON.stringify(r.rp["ui/openchara/hud.json"]);
    assert.ok(text.includes('"pad_y"') && text.includes('"pad_x"'));
    assert.ok(text.includes("#size_binding_y") && text.includes("#size_binding_x"));
    assert.ok(text.includes("'ocH|rts.p|'"), "reads the packed key");
    assert.ok(text.includes("'%.4s'") && text.includes("'%.4s' * ((#preserved_text - 'ocH|rts.p|') - ('%.4s' *"), "slot 1 cuts past slot 0");
});

test("<box> binds width AND height", () => {
    const r = hud('<box w="{bw}" h="{bh}" style="background-color:#ffffff"/>');
    const hudJson = r.rp["ui/openchara/hud.json"];
    const box = JSON.stringify(hudJson);
    assert.ok((box.match(/#size_binding_x/g) || []).length >= 1 && (box.match(/#size_binding_y/g) || []).length >= 1);
});

test("the compiled HUD passes MinUI's JSON UI lint", () => {
    const r = hud(SAMPLE);
    const map = new Map(Object.entries(r.rp).map(([k, v]) => [k, Buffer.from(JSON.stringify(v))]));
    assert.deepStrictEqual(lintJsonUi(map, "RP"), []);
});

test("<float>/<box> need a fast HUD and don't exist on screens", () => {
    assert.throws(() => compileUi([{ rel: "t.ui.html", text: '<hud id="x"><box w="{a}" h="{b}"/></hud>' }]), /fast HUD/);
    assert.throws(() => compileUi([{ rel: "t.ui.html", text: '<screen id="x"><float x="{a}" y="{b}"/></screen>' }]), /only exists on a HUD/);
    assert.throws(() => hud('<float x="5" y="{b}"/>'), /expression in \{braces\}/);
});

test("normal (non-fast) HUDs are unchanged", () => {
    const r = compileUi([{ rel: "t.ui.html", text: '<hud id="a" data="p"><text>{x}</text></hud>' }]);
    const h = JSON.parse(r.runtime.match(/export const HUDS = (.*);/)[1]).a;
    assert.strictEqual(h.fast, undefined);
});

test("runtime packing: fixed width, clamped, round-trips, and width matches the compiler", async () => {
    const { packNumbers, unpackNumbers, NUM_WIDTH: W, MAX_NUM } = await import("../runtime/hudPack.js");
    assert.strictEqual(W, NUM_WIDTH);
    assert.strictEqual(packNumbers([0, 7, 123, 99999, -4, 12.6]), "000000070123" + "9999" + "0000" + "0013");
    assert.deepStrictEqual(unpackNumbers(packNumbers([5, 428, 9999, 0]), 4), [5, 428, 9999, 0]);
    assert.strictEqual(MAX_NUM, 9999);
}) ;

console.log(`\n${passed} passed${process.exitCode ? ", with failures" : ""}`);
