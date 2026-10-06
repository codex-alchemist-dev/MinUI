// HUD positioning primitives (mixed onto HudCompiler): elements whose position/size changes at runtime.
//
//   <float x="{expr}" y="{expr}">...children...</float>
//       Places its children at (x, y) GUI pixels from the top-left of the HUD. JSON UI has no bound offset, so the
//       container is built from two SPACERS whose sizes are bound (the known size_binding technique): a vertical
//       stack [ spacer(height = y), horizontal stack [ spacer(width = x), content ] ].
//   <box w="{expr}" h="{expr}" style="background-color: ...">
//       A solid rectangle whose width AND height are bound (the existing <bar> binds width only) - the drag-select
//       rectangle. A hollow outline is four of these.
//
// Every number rides ONE packed title per HUD (`<hud fast>`): all `num` fields of the HUD are concatenated as
// fixed-width zero-padded integers, so a cursor + rectangle + counters move together in a single title per tick
// instead of one title per value. The client slices the packed string with `%.Ns` format cuts:
//   value i = ( '%.4s' * ( P - ('%.{4i}s' * P) ) ) - 0      where P = the packed text without its key.
// Runtime side: runtime/hudPack.js (keep NUM_WIDTH in sync - a test checks it). Spike S3 (in-game) confirms these
// expressions behave on a real client.
"use strict";

const { parseTemplate } = require("../markup.js");

const NUM_WIDTH = 4;     // digits per packed number (0..9999)
const PACKED_ID = "p";   // packed key: ocH|<hud>.p|<digits>

/** Client-side expression for packed slot `i` given the expression `P` of the packed text. */
function packedSlotExpr(P, i) {
    const rest = i === 0 ? P : `(${P} - ('%.${NUM_WIDTH * i}s' * ${P}))`;
    return `(('%.${NUM_WIDTH}s' * ${rest}) - 0)`;
}

function parseNumAttr(c, node, attr, value) {
    if (value === undefined) c.err(node, `<${node.tag}> needs ${attr}="{expr}"`);
    const ast = parseTemplate(String(value), c.file, node.line).find(p => p[0] === "e")?.[1];
    if (!ast) c.err(node, `<${node.tag} ${attr}="..."> must be an expression in {braces}`);
    return ast;
}

function requireFast(c, node) {
    if (!c.fast) c.err(node, `<${node.tag}> needs a fast HUD: write <hud id="..." fast> (its numbers travel in one packed title)`);
}

// ---- mixin methods ------------------------------------------------------------------------------

/** Registers a packed numeric field; returns its slot. */
function numSlot(node, attr, value, loops) {
    requireFast(this, node);
    const e = parseNumAttr(this, node, attr, value);
    const slot = this.fields.filter(f => f.k === "num").length;
    this.field({ k: "num", e, slot, loops });
    return slot;
}

function packedKey() { return `${this.hudHeader}${this.key}.${PACKED_ID}|`; }

/** The data control that keeps the packed title. */
function packedData() {
    const key = this.packedKey();
    return {
        d: {
            type: "panel", size: [0, 0],
            property_bag: { "#preserved_text": "" },
            bindings: [
                { binding_name: "#hud_title_text_string" },
                { binding_name: "#hud_title_text_string", binding_name_override: "#preserved_text", binding_condition: "visibility_changed" },
                {
                    binding_type: "view",
                    source_property_name: `(not (#hud_title_text_string = #preserved_text) and not ((#hud_title_text_string - '${key}') = #hud_title_text_string))`,
                    target_property_name: "#visible",
                },
            ],
        },
    };
}

function packedRead(slot, target) {
    const P = `(#preserved_text - '${this.packedKey()}')`;
    return { binding_type: "view", source_control_name: "d", source_property_name: packedSlotExpr(P, slot), target_property_name: target };
}

/** A spacer whose width (axis "x") or height (axis "y") is bound to packed slot `slot`. */
function boundSpacer(slot, axis) {
    const thin = "((#preserved_text = #preserved_text) * 1)";
    return {
        type: "panel", size: [1, 1],
        controls: [this.packedData()],
        bindings: [
            axis === "x" ? this.packedRead(slot, "#size_binding_x") : { ...this.packedRead(slot, "#size_binding_x"), source_property_name: thin },
            axis === "y" ? this.packedRead(slot, "#size_binding_y") : { ...this.packedRead(slot, "#size_binding_y"), source_property_name: thin },
        ],
    };
}

function floatElement(node, st, loops) {
    const sx = this.numSlot(node, "x", node.attrs.x, loops);
    const sy = this.numSlot(node, "y", node.attrs.y, loops);
    const place = this.placement({ ...st, width: st.width ?? "100%", height: st.height ?? "100%" }, node);
    const content = this.children(node, loops).map(([n, c]) => ({ [n]: c }));
    return {
        type: "stack_panel", orientation: "vertical", ...place, anchor_from: "top_left", anchor_to: "top_left",
        controls: [
            { pad_y: this.boundSpacer(sy, "y") },
            { line: { type: "stack_panel", orientation: "horizontal", size: ["100%c", "100%c"], controls: [{ pad_x: this.boundSpacer(sx, "x") }, ...content] } },
        ],
    };
}

function boxElement(node, st, loops) {
    const sw = this.numSlot(node, "w", node.attrs.w, loops);
    const sh = this.numSlot(node, "h", node.attrs.h, loops);
    const img = this.background(st, node) ?? { type: "image", texture: "textures/ui/White" };
    if (!img.color && !st.background) img.color = [1, 1, 1];
    return {
        ...img, size: [1, 1], anchor_from: "top_left", anchor_to: "top_left",
        ...(st.layer ? { layer: parseInt(st.layer, 10) } : {}),
        controls: [this.packedData()],
        bindings: [this.packedRead(sw, "#size_binding_x"), this.packedRead(sh, "#size_binding_y")],
    };
}

module.exports = { NUM_WIDTH, PACKED_ID, packedSlotExpr, hudMethods: { numSlot, packedKey, packedData, packedRead, boundSpacer, floatElement, boxElement } };
